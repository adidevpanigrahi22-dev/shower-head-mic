import { useState, useRef, useEffect } from "react";

const GEMINI_KEY = "AIzaSyBdmfz4trCUoX0CVDjF8LtHEnWLbHkbYYw";

const GENRES = ["Pop","Rock","R&B","Hip-Hop","Jazz","Classical","Electronic","Country","Indie","Soul","Latin","Folk"];
const LANGUAGES = ["English","Hindi","Spanish","French","Korean","Arabic","Portuguese","Italian","Japanese","Swahili"];

const PHASES = [
  { id:"low",  dur:4, label:"LOWEST NOTE",  sub:"Hold the lowest note you can comfortably sing",   col:"#60a5fa" },
  { id:"rest", dur:2, label:"REST",          sub:"Take a breath...",                                 col:"#374151" },
  { id:"high", dur:4, label:"HIGHEST NOTE", sub:"Reach your highest comfortable note — no strain",  col:"#f87171" },
  { id:"rest2",dur:1, label:"REST",          sub:"Almost there...",                                  col:"#374151" },
  { id:"free", dur:4, label:"SING FREELY",  sub:"Any melody at your natural, relaxed pitch",        col:"#c8ff47" },
];

function detectPitchYIN(buf, sr) {
  const N=buf.length, half=Math.floor(N/2);
  const y=new Float32Array(half); let rs=0;
  y[0]=1;
  for(let t=1;t<half;t++){
    for(let i=0;i<half;i++){const d=buf[i]-buf[i+t];y[t]+=d*d;}
    rs+=y[t]; y[t]=y[t]*t/(rs||1);
  }
  let tau=-1;
  for(let i=2;i<half;i++){
    if(y[i]<0.15){while(i+1<half&&y[i+1]<y[i])i++;tau=i;break;}
  }
  if(tau<0||y[tau]>0.5)return -1;
  if(tau>0&&tau<half-1){const s0=y[tau-1],s1=y[tau],s2=y[tau+1];tau+=(s2-s0)/(2*(2*s1-s2-s0)||1);}
  return sr/tau;
}

function freqToNote(f){
  if(!f||f<20)return"--";
  const midi=Math.round(12*Math.log2(f/440)+69);
  if(midi<0||midi>127)return"--";
  const n=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  return n[midi%12]+(Math.floor(midi/12)-1);
}

function voiceType(f){
  if(f<130)return{type:"Bass",         emoji:"🎸",desc:"Deep, resonant and commanding",              col:"#3b82f6"};
  if(f<180)return{type:"Baritone",     emoji:"🎻",desc:"Rich, warm — the most common male voice",    col:"#8b5cf6"};
  if(f<260)return{type:"Tenor",        emoji:"🎺",desc:"Bright and powerful high male voice",         col:"#06b6d4"};
  if(f<340)return{type:"Contralto",    emoji:"🪗",desc:"Deep, warm and richly textured",              col:"#10b981"};
  if(f<450)return{type:"Mezzo-Soprano",emoji:"🎶",desc:"Versatile middle female voice, warm & full", col:"#f59e0b"};
  return       {type:"Soprano",        emoji:"✨",desc:"The highest voice — bright and soaring",      col:"#ec4899"};
}

function calcOctaves(lo,hi){
  if(!lo||!hi||hi<=lo)return"0.0";
  return Math.log2(hi/lo).toFixed(1);
}

function spotifyUrl(q){return`https://open.spotify.com/search/${encodeURIComponent(q)}`;}

const SpotifyIcon=({size=18})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#1db954">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

export default function App() {
  const [step,      setStep]      = useState("prefs");
  const [genres,    setGenres]    = useState([]);
  const [langs,     setLangs]     = useState([]);
  const [phaseIdx,  setPhaseIdx]  = useState(0);
  const [timer,     setTimer]     = useState(0);
  const [liveHz,    setLiveHz]    = useState(0);
  const [liveVol,   setLiveVol]   = useState(0);
  const [profile,   setProfile]   = useState(null);
  const [aiData,    setAiData]    = useState(null);
  const [aiErr,     setAiErr]     = useState(null);
  const [totalProg, setTotalProg] = useState(0);

  const phBuckets = useRef({low:[],high:[],free:[]});
  const phIdx     = useRef(0);
  const raf       = useRef(null);
  const tickRef   = useRef(null);
  const ctxRef    = useRef(null);
  const anlRef    = useRef(null);
  const streamRef = useRef(null);
  const totalDur  = PHASES.reduce((s,p)=>s+p.dur,0);

  useEffect(()=>{
    const el=document.createElement("link");
    el.rel="stylesheet";
    el.href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap";
    document.head.appendChild(el);
    return()=>{try{document.head.removeChild(el);}catch(_){}};
  },[]);

  const toggle=(_arr,setFn,v)=>setFn(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);

  const C={bg:"#07070f",surf:"#0f0f1e",dim:"#181830",border:"#252545",text:"#e8e8f4",muted:"#6b7090",accent:"#c8ff47"};
  const card={background:C.surf,borderRadius:16,padding:24,border:`1px solid ${C.border}`};
  const chip=(active,col)=>({
    padding:"7px 15px",borderRadius:100,
    border:`1.5px solid ${active?col||C.accent:C.border}`,
    background:active?col||C.accent:"transparent",
    color:active?C.bg:C.text,
    fontSize:13,fontWeight:500,cursor:"pointer",transition:"all 0.15s",fontFamily:"inherit"
  });

  const startSession=async()=>{
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=s;
      ctxRef.current=new(window.AudioContext||window.webkitAudioContext)();
      const src=ctxRef.current.createMediaStreamSource(s);
      anlRef.current=ctxRef.current.createAnalyser();
      anlRef.current.fftSize=2048;
      src.connect(anlRef.current);
      phBuckets.current={low:[],high:[],free:[]};
      phIdx.current=0;
      setStep("recording");
      runPhase(0,0);
      listenAudio();
    }catch(e){alert("Microphone access is required. Please allow it and try again.");}
  };

  const runPhase=(idx,elapsed)=>{
    phIdx.current=idx;
    setPhaseIdx(idx);
    let t=PHASES[idx].dur;
    setTimer(t);
    const iv=setInterval(()=>{
      t--;
      setTimer(t);
      setTotalProg(Math.min(100,((elapsed+(PHASES[idx].dur-t))/totalDur)*100));
      if(t<=0){
        clearInterval(iv);
        const ne=elapsed+PHASES[idx].dur;
        if(idx<PHASES.length-1)runPhase(idx+1,ne);
        else finish();
      }
    },1000);
    tickRef.current=iv;
  };

  const listenAudio=()=>{
    const buf=new Float32Array(anlRef.current.fftSize);
    const loop=()=>{
      if(!anlRef.current)return;
      anlRef.current.getFloatTimeDomainData(buf);
      let sum=0;
      for(let i=0;i<buf.length;i++)sum+=buf[i]*buf[i];
      const rms=Math.sqrt(sum/buf.length);
      setLiveVol(Math.min(rms*700,100));
      let zc=0;
      for(let i=1;i<buf.length;i++)
        if((buf[i]>0&&buf[i-1]<=0)||(buf[i]<0&&buf[i-1]>=0))zc++;
      if(rms>0.018&&zc/buf.length<0.15){
        const f=detectPitchYIN(buf,ctxRef.current.sampleRate);
        if(f>50&&f<1200){
          setLiveHz(Math.round(f));
          const pid=PHASES[phIdx.current]?.id;
          if(["low","high","free"].includes(pid))phBuckets.current[pid].push(f);
        }
      }else setLiveHz(0);
      raf.current=requestAnimationFrame(loop);
    };
    loop();
  };

  const finish=()=>{
    if(raf.current)cancelAnimationFrame(raf.current);
    if(tickRef.current)clearInterval(tickRef.current);
    if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());

    const {low,high,free}=phBuckets.current;
    const med=arr=>{
      if(!arr.length)return null;
      const s=[...arr].sort((a,b)=>a-b);
      return s[Math.floor(s.length/2)];
    };
    const loSorted=[...low].sort((a,b)=>a-b);
    const loFreq=loSorted.length?med(loSorted.slice(0,Math.max(1,Math.floor(loSorted.length*0.3)))):null;
    const hiSorted=[...high].sort((a,b)=>b-a);
    const hiFreq=hiSorted.length?med(hiSorted.slice(0,Math.max(1,Math.floor(hiSorted.length*0.3)))):null;
    const avgFreq=med([...free]);

    if(!avgFreq&&!loFreq){
      alert("Voice not detected clearly. Try again in a quieter space, closer to the mic.");
      setStep("prefs"); return;
    }
    const effLo=loFreq||(avgFreq*0.68);
    const effHi=hiFreq||(avgFreq*1.85);
    const effAvg=avgFreq||((effLo+effHi)/2);
    const vt=voiceType(effAvg);
    const p={
      loFreq:Math.round(effLo),hiFreq:Math.round(effHi),avgFreq:Math.round(effAvg),
      loNote:freqToNote(effLo),hiNote:freqToNote(effHi),avgNote:freqToNote(effAvg),
      octaves:calcOctaves(effLo,effHi),...vt
    };
    setProfile(p);
    setStep("analyzing");
    fetchGemini(p,[...genres],[...langs]);
  };

  const fetchGemini=async(p,g,l)=>{
    const prompt=`You are a world-class vocal coach and music expert. Analyze this voice data and give deeply personalized recommendations.

VOICE DATA:
- Voice Type: ${p.type}
- Natural Pitch: ${p.avgFreq}Hz (note: ${p.avgNote})
- Lowest Note Detected: ${p.loNote} (${p.loFreq}Hz)
- Highest Note Detected: ${p.hiNote} (${p.hiFreq}Hz)
- Vocal Span: ${p.octaves} octaves

USER PREFERENCES:
- Favourite Genres: ${g.join(", ")||"open to anything"}
- Preferred Languages: ${l.join(", ")||"any"}

Respond with ONLY a raw valid JSON object — no markdown, no code fences, just the JSON:
{
  "insight": "2-3 sentences about what makes this voice special. Reference the specific Hz values, octave span, and voice type. Make it feel personal and exciting.",
  "singers": [
    {"name": "Famous Singer", "why": "One specific sentence about the vocal similarity — reference their range or tone"},
    {"name": "Famous Singer", "why": "..."},
    {"name": "Famous Singer", "why": "..."},
    {"name": "Famous Singer", "why": "..."}
  ],
  "songs": [
    {"title": "Song Title", "artist": "Artist Name", "why": "Brief reason this fits their exact range"},
    {"title": "Song Title", "artist": "Artist Name", "why": "..."},
    {"title": "Song Title", "artist": "Artist Name", "why": "..."},
    {"title": "Song Title", "artist": "Artist Name", "why": "..."},
    {"title": "Song Title", "artist": "Artist Name", "why": "..."},
    {"title": "Song Title", "artist": "Artist Name", "why": "..."}
  ],
  "tip": "One specific, actionable vocal exercise they can practice this week, tailored to their voice type and octave span"
}

Prioritize artists and songs matching their genre and language preferences. Include artists who sing primarily in their preferred language(s). All recommendations must feel genuinely tailored — not generic.`;

    try{
      const res=await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            contents:[{parts:[{text:prompt}]}],
            generationConfig:{temperature:0.85,maxOutputTokens:1400}
          })}
      );
      if(!res.ok){
        const errBody=await res.json().catch(()=>({}));
        throw new Error(errBody?.error?.message||`HTTP ${res.status}`);
      }
      const d=await res.json();
      const txt=d.candidates?.[0]?.content?.parts?.[0]?.text||"";
      const clean=txt.replace(/```json\n?|\n?```/g,"").replace(/```/g,"").trim();
      setAiData(JSON.parse(clean));
    }catch(e){
      console.error("Gemini error:",e);
      setAiErr(`Gemini error: ${e.message}`);
    }
    setStep("results");
  };

  const reset=()=>{
    setStep("prefs");setProfile(null);setAiData(null);setAiErr(null);setTotalProg(0);
  };

  // ── PREFS ─────────────────────────────────────────────────────────────────
  if(step==="prefs") return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',overflowX:"hidden"}}>
      <style>{`.chip:hover{opacity:.75}`}</style>
      <div style={{maxWidth:640,margin:"0 auto",padding:"clamp(28px,5vw,56px) 20px"}}>

        {/* Hero */}
        <div style={{textAlign:"center",marginBottom:44}}>
          <div style={{fontSize:10,letterSpacing:6,color:C.muted,marginBottom:10,textTransform:"uppercase"}}>AI · Voice Analysis</div>
          <h1 style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(64px,15vw,112px)",
            lineHeight:.88,letterSpacing:2,margin:0}}>
            SHOWER<br/><span style={{color:C.accent}}>HEAD MIC</span>
          </h1>
          <p style={{color:C.muted,marginTop:18,fontSize:15,lineHeight:1.7,maxWidth:400,margin:"18px auto 0"}}>
            Discover your vocal range, octave span, and get Gemini‑powered song &amp; artist matches tailored to your voice.
          </p>
        </div>

        {/* Genre */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:12,textTransform:"uppercase"}}>Genres you love</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {GENRES.map(g=>(
              <button key={g} className="chip" style={chip(genres.includes(g))}
                onClick={()=>toggle(genres,setGenres,g)}>{g}</button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div style={{marginBottom:36}}>
          <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:12,textTransform:"uppercase"}}>Languages you sing in</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {LANGUAGES.map(l=>(
              <button key={l} className="chip" style={chip(langs.includes(l))}
                onClick={()=>toggle(langs,setLangs,l)}>{l}</button>
            ))}
          </div>
        </div>

        {/* Session guide */}
        <div style={{...card,marginBottom:32}}>
          <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:16,textTransform:"uppercase"}}>
            What happens · {totalDur}s total
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {[
              {col:"#60a5fa",emoji:"🎵",label:"Lowest note · 4s",  desc:"Hold the deepest note you can comfortably reach"},
              {col:"#f87171",emoji:"🎶",label:"Highest note · 4s", desc:"Reach your highest comfortable note — no straining!"},
              {col:C.accent, emoji:"🎤",label:"Sing freely · 4s",  desc:"Any melody at your natural pitch for Gemini to understand your voice"},
            ].map(({col,emoji,label,desc},i)=>(
              <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                <div style={{width:34,height:34,borderRadius:9,background:col+"22",flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{emoji}</div>
                <div>
                  <div style={{fontWeight:600,fontSize:14,color:C.text,marginBottom:2}}>{label}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.55}}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={startSession}
          style={{width:"100%",padding:"20px",borderRadius:14,background:C.accent,color:C.bg,
            border:"none",fontFamily:'"Bebas Neue",sans-serif',fontSize:24,letterSpacing:4,
            cursor:"pointer",transition:"opacity 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.opacity=".85"}
          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          START ANALYSIS
        </button>
        <p style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:10}}>
          Requires microphone · No audio is stored
        </p>
      </div>
    </div>
  );

  // ── RECORDING ─────────────────────────────────────────────────────────────
  if(step==="recording"){
    const phase=PHASES[phaseIdx];
    const isActive=!phase.id.startsWith("rest");
    return(
      <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        padding:24,textAlign:"center"}}>
        <style>{`
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
          @keyframes glow{0%,100%{text-shadow:0 0 60px var(--gc)}50%{text-shadow:0 0 140px var(--gc),0 0 220px var(--gc)}}
        `}</style>

        <div style={{fontSize:10,letterSpacing:6,color:C.muted,marginBottom:8,textTransform:"uppercase"}}>
          Phase {phaseIdx+1} of {PHASES.length}
        </div>

        <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(40px,9vw,76px)",
          lineHeight:1,color:phase.col,letterSpacing:3,marginBottom:10}}>
          {phase.label}
        </div>
        <p style={{color:C.muted,fontSize:14,maxWidth:340,lineHeight:1.6,marginBottom:36}}>
          {phase.sub}
        </p>

        {/* Big countdown */}
        <div style={{"--gc":phase.col,fontFamily:'"Bebas Neue",sans-serif',
          fontSize:"clamp(120px,26vw,210px)",lineHeight:1,
          color:isActive?phase.col:C.dim,marginBottom:24,
          animation:isActive&&timer<=2?"glow 0.7s infinite":"none"}}>
          {timer}
        </div>

        {/* Live pitch */}
        {isActive&&(
          <div style={{marginBottom:24}}>
            <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:48,lineHeight:1,
              color:liveHz>0?C.accent:C.dim,transition:"color 0.1s"}}>
              {liveHz>0?`${liveHz} Hz`:"· · ·"}
            </div>
            <div style={{fontSize:15,color:liveHz>0?C.text:C.muted,marginTop:3,letterSpacing:1,fontWeight:500}}>
              {liveHz>0?freqToNote(liveHz):"sing into your mic"}
            </div>
          </div>
        )}

        {/* Volume bar */}
        {isActive&&(
          <div style={{width:"min(300px,80vw)",marginBottom:32}}>
            <div style={{height:7,background:C.dim,borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:4,
                background:`linear-gradient(90deg,${phase.col},${C.accent})`,
                width:`${liveVol}%`,transition:"width 0.05s"}}/>
            </div>
            {liveHz===0&&(
              <div style={{fontSize:11,color:C.muted,marginTop:5,animation:"pulse 2s infinite"}}>
                No pitch detected — sing clearly
              </div>
            )}
          </div>
        )}

        {/* Overall progress */}
        <div style={{width:"min(300px,80vw)"}}>
          <div style={{height:3,background:C.dim,borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",background:C.accent,borderRadius:2,
              width:`${totalProg}%`,transition:"width 1s linear"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:11,color:C.muted}}>
            <span>Total progress</span><span>{Math.round(totalProg)}%</span>
          </div>
        </div>
      </div>
    );
  }

  // ── ANALYZING ─────────────────────────────────────────────────────────────
  if(step==="analyzing") return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div style={{width:68,height:68,borderRadius:"50%",
        border:`3px solid #1a1a2e`,borderTop:`3px solid ${C.accent}`,
        animation:"spin 1s linear infinite"}}/>
      <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:34,letterSpacing:5}}>ANALYZING</div>
      <div style={{fontSize:13,color:C.muted,maxWidth:280,textAlign:"center",lineHeight:1.65}}>
        Sending your voice data to Gemini for personalized recommendations...
      </div>
      {profile&&(
        <div style={{...card,marginTop:6,animation:"fadeUp 0.4s ease",textAlign:"center",minWidth:220}}>
          <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:30,color:profile.col,lineHeight:1}}>
            {profile.emoji} {profile.type}
          </div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>
            {profile.loNote} → {profile.hiNote} · {profile.octaves} oct
          </div>
        </div>
      )}
    </div>
  );

  // ── RESULTS ───────────────────────────────────────────────────────────────
  if(step==="results"&&profile){
    const pct=Math.max(10,Math.min(88,
      (Math.log2(profile.avgFreq/profile.loFreq)/Math.log2(profile.hiFreq/profile.loFreq))*84+4
    ));
    return(
      <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',overflowX:"hidden"}}>
        <style>{`
          @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
          .hov-card:hover{border-color:rgba(200,255,71,.4) !important}
        `}</style>
        <div style={{maxWidth:640,margin:"0 auto",padding:"clamp(28px,5vw,52px) 20px"}}>

          {/* Header */}
          <div style={{textAlign:"center",marginBottom:32,animation:"fadeUp 0.3s ease"}}>
            <div style={{fontSize:10,letterSpacing:6,color:C.muted,marginBottom:8,textTransform:"uppercase"}}>
              Voice Report
            </div>
            <div style={{fontSize:52,marginBottom:4}}>{profile.emoji}</div>
            <h2 style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(48px,10vw,84px)",
              lineHeight:1,margin:"0 0 8px",color:profile.col,letterSpacing:2}}>
              {profile.type}
            </h2>
            <p style={{color:C.muted,fontSize:14,margin:0}}>{profile.desc}</p>
          </div>

          {/* Stats card */}
          <div style={{...card,marginBottom:18,animation:"fadeUp 0.4s ease"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,textAlign:"center",marginBottom:18}}>
              {[
                {label:"Lowest",    val:profile.loNote, sub:`${profile.loFreq} Hz`},
                {label:"Octave Span",val:profile.octaves,sub:"octaves",big:true},
                {label:"Highest",   val:profile.hiNote, sub:`${profile.hiFreq} Hz`},
              ].map(({label,val,sub,big})=>(
                <div key={label}>
                  <div style={{fontSize:10,letterSpacing:3,color:C.muted,textTransform:"uppercase",marginBottom:5}}>
                    {label}
                  </div>
                  <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:big?52:28,lineHeight:1,
                    color:big?C.accent:C.text}}>{val}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>{sub}</div>
                </div>
              ))}
            </div>
            {/* Range bar */}
            <div style={{position:"relative",height:9,background:C.dim,borderRadius:5,overflow:"hidden",marginBottom:7}}>
              <div style={{position:"absolute",top:0,bottom:0,left:"4%",right:"4%",
                background:`linear-gradient(90deg,#3b82f6,${profile.col},#ec4899)`,borderRadius:5}}/>
              <div style={{position:"absolute",top:0,bottom:0,width:3,background:"#fff",
                borderRadius:2,left:`${pct}%`}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted}}>
              <span>{profile.loNote}</span>
              <span>▲ natural: {profile.avgNote}</span>
              <span>{profile.hiNote}</span>
            </div>
          </div>

          {/* Gemini Insight */}
          {aiData?.insight&&(
            <div style={{...card,marginBottom:18,borderLeft:`3px solid ${C.accent}`,animation:"fadeUp 0.5s ease"}}>
              <div style={{fontSize:10,letterSpacing:4,color:C.accent,marginBottom:9,textTransform:"uppercase"}}>
                ✦ Gemini Insight
              </div>
              <p style={{color:C.text,fontSize:14,lineHeight:1.8,margin:0}}>{aiData.insight}</p>
            </div>
          )}

          {/* Singer Matches */}
          {aiData?.singers?.length>0&&(
            <section style={{marginBottom:22,animation:"fadeUp 0.6s ease"}}>
              <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:11,textTransform:"uppercase"}}>
                Your Voice Sounds Like
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {aiData.singers.map((s,i)=>(
                  <a key={i} href={spotifyUrl(s.name)} target="_blank" rel="noopener noreferrer"
                    className="hov-card"
                    style={{textDecoration:"none",display:"flex",alignItems:"center",gap:14,
                      ...card,padding:"13px 16px",transition:"border-color 0.15s"}}>
                    <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:28,lineHeight:1,
                      minWidth:34,textAlign:"center",
                      color:i===0?C.accent:"#2a2a40"}}>
                      {String(i+1).padStart(2,"0")}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:15,color:C.text,marginBottom:3}}>{s.name}</div>
                      <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{s.why}</div>
                    </div>
                    <SpotifyIcon size={18}/>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Song Recommendations */}
          {aiData?.songs?.length>0&&(
            <section style={{marginBottom:22,animation:"fadeUp 0.7s ease"}}>
              <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:11,textTransform:"uppercase"}}>
                Songs Perfect For Your Voice
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {aiData.songs.map((s,i)=>(
                  <a key={i} href={spotifyUrl(`${s.title} ${s.artist}`)} target="_blank" rel="noopener noreferrer"
                    className="hov-card"
                    style={{textDecoration:"none",display:"flex",alignItems:"center",gap:12,
                      ...card,padding:"11px 15px",transition:"border-color 0.15s"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:C.dim,flexShrink:0,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#1db954">
                        <path d="M9 3v10.55c-.59-.34-1.27-.55-2-.55C4.79 13 3 14.79 3 17s1.79 4 4 4 4-1.79 4-4V7h4V3H9z"/>
                      </svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:C.text,
                        whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title}</div>
                      <div style={{fontSize:12,color:C.muted}}>
                        {s.artist}
                        {s.why&&<span style={{color:"#3a3a58",fontStyle:"italic"}}> · {s.why}</span>}
                      </div>
                    </div>
                    <SpotifyIcon size={16}/>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Vocal Tip */}
          {aiData?.tip&&(
            <div style={{background:`${C.accent}10`,borderRadius:14,padding:18,marginBottom:22,
              border:`1px solid ${C.accent}22`,animation:"fadeUp 0.8s ease"}}>
              <div style={{fontSize:10,letterSpacing:4,color:C.accent,marginBottom:7,textTransform:"uppercase"}}>
                💡 Vocal Coach Tip
              </div>
              <p style={{color:C.text,fontSize:14,lineHeight:1.8,margin:0}}>{aiData.tip}</p>
            </div>
          )}

          {/* Error state */}
          {aiErr&&(
            <div style={{background:"#ff222215",borderRadius:12,padding:14,marginBottom:20,
              fontSize:13,color:"#ff9090",border:"1px solid #ff222228",lineHeight:1.6}}>
              ⚠️ {aiErr}
            </div>
          )}

          <button onClick={reset}
            style={{width:"100%",padding:"16px",borderRadius:12,background:"transparent",
              color:C.text,border:`1.5px solid ${C.border}`,fontFamily:'"Bebas Neue",sans-serif',
              fontSize:18,letterSpacing:3,cursor:"pointer",transition:"border-color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            ANALYZE AGAIN
          </button>
          <p style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:10}}>
            Powered by Gemini 2.0 Flash · Spotify links open in new tab
          </p>
        </div>
      </div>
    );
  }

  return null;
}
