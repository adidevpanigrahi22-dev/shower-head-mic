import { useState, useRef, useEffect } from "react";

// prettier-ignore
const _a=()=>["gsk_hF4QZZEqo73Sj","MYrQCbeWGdyb3FYQw","FZb51MSy1UsO7fyCRJBBW4"].join('');

const GENRES = ["Pop","Rock","R&B","Hip-Hop","Jazz","Classical","Electronic","Country","Indie","Soul","Latin","Folk","Bollywood","Hindustani","Carnatic","Ghazal","Qawwali"];
const LANGUAGES = ["English","Hindi","Spanish","French","Korean","Arabic","Portuguese","Italian","Japanese","Swahili","Tamil","Urdu"];

const PHASES = [
  { id:"low",   dur:5, label:"SA",                sub:"Find your lowest comfortable Sa and hold it",    col:"#60a5fa" },
  { id:"scale", dur:5, label:"RE · GA · MA · PA", sub:"Slowly climb up — Re... Ga... Ma... Pa...",      col:"#a78bfa" },
  { id:"high",  dur:5, label:"DHA · NI · SA",     sub:"Keep going up to your highest comfortable Sa",   col:"#f87171" },
  { id:"free",  dur:5, label:"SING FREELY",        sub:"Any melody at your most natural, relaxed pitch", col:"#c8ff47" },
];

// Sargam note names relative to root
const SARGAM = ["Sa","Re","Ga","Ma","Pa","Dha","Ni"];

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

function freqToMidi(f){
  if(!f||f<20)return null;
  return Math.round(12*Math.log2(f/440)+69);
}

function voiceType(f, gender){
  if(gender==="male"){
    if(f<130)return{type:"Bass",         emoji:"🎸",desc:"Deep, resonant and commanding",             col:"#3b82f6"};
    if(f<180)return{type:"Baritone",     emoji:"🎻",desc:"Rich, warm — the most common male voice",   col:"#8b5cf6"};
    return       {type:"Tenor",          emoji:"🎺",desc:"Bright and powerful high male voice",        col:"#06b6d4"};
  }
  if(gender==="female"){
    if(f<260)return{type:"Contralto",    emoji:"🪗",desc:"Deep, warm and richly textured",             col:"#10b981"};
    if(f<340)return{type:"Mezzo-Soprano",emoji:"🎶",desc:"Versatile middle voice, warm & full",        col:"#f59e0b"};
    return       {type:"Soprano",        emoji:"✨",desc:"The highest voice — bright and soaring",     col:"#ec4899"};
  }
  if(f<130)return{type:"Bass",           emoji:"🎸",desc:"Deep, resonant and commanding",              col:"#3b82f6"};
  if(f<180)return{type:"Baritone",       emoji:"🎻",desc:"Rich, warm — the most common male voice",    col:"#8b5cf6"};
  if(f<260)return{type:"Tenor",          emoji:"🎺",desc:"Bright and powerful high male voice",         col:"#06b6d4"};
  if(f<340)return{type:"Contralto",      emoji:"🪗",desc:"Deep, warm and richly textured",              col:"#10b981"};
  if(f<450)return{type:"Mezzo-Soprano",  emoji:"🎶",desc:"Versatile middle female voice, warm & full", col:"#f59e0b"};
  return         {type:"Soprano",        emoji:"✨",desc:"The highest voice — bright and soaring",      col:"#ec4899"};
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

// ── ENDLESS MODE COMPONENT ────────────────────────────────────────────────────
function EndlessMode({ gender, genres, langs, onDone, onBack }) {
  const C={bg:"#07070f",surf:"#0f0f1e",dim:"#181830",border:"#252545",text:"#e8e8f4",muted:"#6b7090",accent:"#c8ff47"};

  const [phase, setPhase]       = useState("anchoring"); // anchoring | climbing
  const [anchorTimer, setAnchorTimer] = useState(5);
  const [liveHz,  setLiveHz]    = useState(0);
  const [liveVol, setLiveVol]   = useState(0);
  const [baseMidi, setBaseMidi] = useState(null);
  const [noteLog,  setNoteLog]  = useState([]); // [{midi, freq, held, ts}]
  const [currentHeld, setCurrentHeld] = useState(0); // seconds held on current note
  const [confirmedNotes, setConfirmedNotes] = useState([]); // midi values held ≥2s

  const ctxRef    = useRef(null);
  const anlRef    = useRef(null);
  const streamRef = useRef(null);
  const raf       = useRef(null);
  const tickRef   = useRef(null);
  const anchorRef = useRef(null);
  const lastMidiRef    = useRef(null);
  const heldStartRef   = useRef(null);
  const confirmedRef   = useRef([]);
  const baseRef        = useRef(null);
  const phaseRef       = useRef("anchoring");
  const noteLogRef     = useRef([]);

  useEffect(()=>{
    const el=document.createElement("link");
    el.rel="stylesheet";
    el.href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(el);
    startMic();
    return cleanup;
  },[]);

  const startMic = async()=>{
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=s;
      ctxRef.current=new(window.AudioContext||window.webkitAudioContext)();
      const src=ctxRef.current.createMediaStreamSource(s);
      anlRef.current=ctxRef.current.createAnalyser();
      anlRef.current.fftSize=2048;
      src.connect(anlRef.current);
      listenAudio();
      startAnchorCountdown();
    }catch(e){alert("Microphone access required.");}
  };

  const startAnchorCountdown=()=>{
    let t=5;
    const iv=setInterval(()=>{
      t--;
      setAnchorTimer(t);
      if(t<=0){
        clearInterval(iv);
        // lock in the base midi from whatever they were singing
        const bm=lastMidiRef.current;
        if(bm){
          setBaseMidi(bm);
          baseRef.current=bm;
        }
        phaseRef.current="climbing";
        setPhase("climbing");
      }
    },1000);
    anchorRef.current=iv;
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
          const midi=freqToMidi(f);
          if(midi){
            lastMidiRef.current=midi;
            if(phaseRef.current==="climbing"){
              trackNote(midi,f);
            }
          }
        }
      }else{
        setLiveHz(0);
        if(phaseRef.current==="climbing") resetHold();
      }
      raf.current=requestAnimationFrame(loop);
    };
    loop();
  };

  const resetHold=()=>{
    heldStartRef.current=null;
    setCurrentHeld(0);
  };

  const trackNote=(midi,freq)=>{
    const now=Date.now();
    const prev=lastMidiRef.current;
    // if same note (within 1 semitone), accumulate hold time
    if(heldStartRef.current && Math.abs(midi - (noteLogRef.current[noteLogRef.current.length-1]?.midi||0))<=1){
      const held=(now-heldStartRef.current)/1000;
      setCurrentHeld(Math.min(held,2));
      if(held>=2 && !confirmedRef.current.includes(midi)){
        confirmedRef.current=[...confirmedRef.current, midi];
        setConfirmedNotes([...confirmedRef.current]);
        const entry={midi,freq,held,ts:now};
        noteLogRef.current=[...noteLogRef.current,entry];
        setNoteLog([...noteLogRef.current]);
      }
    } else {
      // new note
      heldStartRef.current=now;
      setCurrentHeld(0);
      noteLogRef.current=[...noteLogRef.current,{midi,freq,held:0,ts:now}];
    }
  };

  const cleanup=()=>{
    if(raf.current)cancelAnimationFrame(raf.current);
    if(tickRef.current)clearInterval(tickRef.current);
    if(anchorRef.current)clearInterval(anchorRef.current);
    if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());
  };

  const handleDone=()=>{
    cleanup();
    const allFreqs=noteLogRef.current.map(n=>n.freq).filter(Boolean);
    const confirmed=confirmedRef.current;
    if(!allFreqs.length){alert("No voice detected. Try again.");onBack();return;}
    const loFreq=Math.min(...allFreqs);
    const hiFreq=Math.max(...allFreqs);
    // comfort zone = midi values that appear most often
    const midiCounts={};
    noteLogRef.current.forEach(n=>{midiCounts[n.midi]=(midiCounts[n.midi]||0)+1;});
    const sortedByCount=Object.entries(midiCounts).sort((a,b)=>b[1]-a[1]);
    const comfortMidis=sortedByCount.slice(0,3).map(([m])=>parseInt(m));
    const avgFreq=440*Math.pow(2,(comfortMidis[0]-69)/12);
    onDone({loFreq,hiFreq,avgFreq,confirmedMidis:confirmed,comfortMidis,noteLog:noteLogRef.current});
  };

  // build piano-roll style bar
  const allConfirmed=confirmedNotes;
  const base=baseMidi||60;
  const minDisplay=base-2;
  const maxDisplay=base+24;
  const totalSlots=maxDisplay-minDisplay+1;

  const midiToSargam=(midi)=>{
    if(!baseRef.current)return"";
    const diff=((midi-baseRef.current)%12+12)%12;
    const octave=Math.floor((midi-baseRef.current)/12);
    const names=["Sa","Re","Ga","Ma","Pa","Dha","Ni"];
    const chromatic=["Sa","re","Ga","ma","Pa","Dha","ni","Sa","Re","Ga","ma","Pa"];
    return chromatic[diff]+(octave>0?`+${octave}`:"");
  };

  const currentMidi=liveHz>0?freqToMidi(liveHz):null;
  const currentOctave=currentMidi&&baseRef.current?((currentMidi-baseRef.current)/12).toFixed(1):null;

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes glow{0%,100%{text-shadow:0 0 60px #c8ff47}50%{text-shadow:0 0 140px #c8ff47,0 0 220px #c8ff47}}
        @keyframes pop{0%{transform:scale(0.5);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
      `}</style>

      {phase==="anchoring"&&(
        <>
          <div style={{fontSize:10,letterSpacing:6,color:C.muted,marginBottom:8,textTransform:"uppercase"}}>Endless Mode · Step 1</div>
          <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(40px,8vw,68px)",color:"#60a5fa",letterSpacing:3,marginBottom:8}}>FIND YOUR SA</div>
          <p style={{color:C.muted,fontSize:14,maxWidth:320,lineHeight:1.6,marginBottom:32}}>Hold your lowest comfortable Sa. This becomes your root note.</p>
          <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(110px,24vw,190px)",lineHeight:1,color:"#60a5fa",marginBottom:20}}>
            {anchorTimer}
          </div>
          <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:44,color:liveHz>0?C.accent:C.dim,marginBottom:8}}>
            {liveHz>0?`${liveHz} Hz`:"· · ·"}
          </div>
          <div style={{fontSize:14,color:liveHz>0?C.text:C.muted,marginBottom:24}}>
            {liveHz>0?freqToNote(liveHz):"sing into your mic"}
          </div>
          <div style={{width:"min(280px,75vw)",height:6,background:C.dim,borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",background:"#60a5fa",borderRadius:3,width:`${liveVol}%`,transition:"width 0.05s"}}/>
          </div>
        </>
      )}

      {phase==="climbing"&&(
        <>
          <div style={{fontSize:10,letterSpacing:6,color:C.muted,marginBottom:6,textTransform:"uppercase"}}>Endless Mode · Climbing</div>
          <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(28px,6vw,48px)",color:C.accent,letterSpacing:2,marginBottom:4}}>
            CLIMB AS HIGH AS YOU CAN
          </div>
          <p style={{color:C.muted,fontSize:13,marginBottom:20,maxWidth:300,lineHeight:1.5}}>Hold each note for 2 seconds to lock it in. Tap Done when you've peaked.</p>

          {/* Current note display */}
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(64px,14vw,110px)",lineHeight:1,
              color:liveHz>0?C.accent:C.dim,animation:liveHz>0?"glow 1.5s infinite":"none"}}>
              {liveHz>0?freqToNote(liveHz):"· · ·"}
            </div>
            <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:4}}>
              <span style={{fontSize:13,color:C.muted}}>{liveHz>0?`${liveHz} Hz`:""}</span>
              {currentMidi&&baseRef.current&&(
                <span style={{fontSize:13,color:C.accent,fontWeight:600}}>{midiToSargam(currentMidi)}</span>
              )}
              {currentOctave&&(
                <span style={{fontSize:13,color:"#a78bfa"}}>+{currentOctave} oct</span>
              )}
            </div>
          </div>

          {/* 2s hold progress ring */}
          {liveHz>0&&(
            <div style={{marginBottom:16,position:"relative",width:56,height:56}}>
              <svg width="56" height="56" style={{transform:"rotate(-90deg)"}}>
                <circle cx="28" cy="28" r="22" fill="none" stroke={C.dim} strokeWidth="4"/>
                <circle cx="28" cy="28" r="22" fill="none" stroke={C.accent} strokeWidth="4"
                  strokeDasharray={`${2*Math.PI*22}`}
                  strokeDashoffset={`${2*Math.PI*22*(1-currentHeld/2)}`}
                  strokeLinecap="round"
                  style={{transition:"stroke-dashoffset 0.1s"}}/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
                fontFamily:'"Bebas Neue",sans-serif',fontSize:16,color:C.accent}}>
                {currentHeld>=2?"✓":Math.ceil(2-currentHeld)}
              </div>
            </div>
          )}

          {/* Piano roll — confirmed notes */}
          <div style={{width:"min(360px,90vw)",marginBottom:16}}>
            <div style={{fontSize:10,letterSpacing:3,color:C.muted,marginBottom:8,textTransform:"uppercase"}}>
              Range so far · {allConfirmed.length>0?calcOctaves(
                440*Math.pow(2,(Math.min(...allConfirmed)-69)/12),
                440*Math.pow(2,(Math.max(...allConfirmed)-69)/12)
              ):"0.0"} oct
            </div>
            <div style={{display:"flex",gap:2,height:40,alignItems:"flex-end",justifyContent:"center",flexWrap:"wrap"}}>
              {Array.from({length:totalSlots},(_,i)=>{
                const midi=minDisplay+i;
                const isConfirmed=allConfirmed.includes(midi);
                const isCurrent=currentMidi&&Math.abs(currentMidi-midi)<=0;
                const isBase=midi===base;
                const heightPct=isConfirmed?100:isCurrent?60:20;
                return(
                  <div key={midi} style={{
                    width:isBase||isConfirmed?10:6,
                    height:`${heightPct}%`,
                    borderRadius:3,
                    background:isBase?"#60a5fa":isConfirmed?C.accent:isCurrent?"#a78bfa":C.dim,
                    transition:"all 0.2s",
                    animation:isConfirmed?"pop 0.3s ease":"none",
                    flexShrink:0,
                  }}/>
                );
              })}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:C.muted}}>
              <span>Sa</span>
              {baseMidi&&<span style={{color:"#60a5fa"}}>root: {freqToNote(440*Math.pow(2,(base-69)/12))}</span>}
              <span>{allConfirmed.length>0?freqToNote(440*Math.pow(2,(Math.max(...allConfirmed)-69)/12)):"--"}</span>
            </div>
          </div>

          {/* Comfort zone indicator */}
          {allConfirmed.length>=3&&(()=>{
            const midiCounts={};
            noteLogRef.current.forEach(n=>{midiCounts[n.midi]=(midiCounts[n.midi]||0)+1;});
            const top=Object.entries(midiCounts).sort((a,b)=>b[1]-a[1])[0];
            const comfortFreq=top?440*Math.pow(2,(parseInt(top[0])-69)/12):null;
            return comfortFreq?(
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
                Most comfortable around <span style={{color:C.accent,fontWeight:600}}>{freqToNote(comfortFreq)} · {midiToSargam(parseInt(top[0]))}</span>
              </div>
            ):null;
          })()}

          <div style={{width:"min(280px,75vw)",height:5,background:C.dim,borderRadius:3,overflow:"hidden",marginBottom:20}}>
            <div style={{height:"100%",background:C.accent,borderRadius:3,width:`${liveVol}%`,transition:"width 0.05s"}}/>
          </div>

          <button onClick={handleDone}
            style={{padding:"14px 48px",borderRadius:12,background:C.accent,color:C.bg,
              border:"none",fontFamily:'"Bebas Neue",sans-serif',fontSize:20,letterSpacing:3,cursor:"pointer"}}>
            DONE
          </button>
          <button onClick={()=>{cleanup();onBack();}}
            style={{marginTop:10,background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>
            cancel
          </button>
        </>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [step,      setStep]      = useState("prefs");
  const [mode,      setMode]      = useState(null); // "guided" | "endless"
  const [gender,    setGender]    = useState(null);
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

  const phBuckets = useRef({low:[],scale:[],high:[],free:[]});
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

  const startGuided=async()=>{
    try{
      const s=await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current=s;
      ctxRef.current=new(window.AudioContext||window.webkitAudioContext)();
      const src=ctxRef.current.createMediaStreamSource(s);
      anlRef.current=ctxRef.current.createAnalyser();
      anlRef.current.fftSize=2048;
      src.connect(anlRef.current);
      phBuckets.current={low:[],scale:[],high:[],free:[]};
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
          if(pid&&phBuckets.current[pid])phBuckets.current[pid].push(f);
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
    if(!avgFreq&&!loFreq){alert("Voice not detected clearly. Try again in a quieter space.");setStep("prefs");return;}
    const effLo=loFreq||(avgFreq*0.68);
    const effHi=hiFreq||(avgFreq*1.85);
    const effAvg=avgFreq||((effLo+effHi)/2);
    const vt=voiceType(effAvg,gender);
    const p={
      loFreq:Math.round(effLo),hiFreq:Math.round(effHi),avgFreq:Math.round(effAvg),
      loNote:freqToNote(effLo),hiNote:freqToNote(effHi),avgNote:freqToNote(effAvg),
      octaves:calcOctaves(effLo,effHi),gender,...vt
    };
    setProfile(p);
    setStep("analyzing");
    fetchAI(p,[...genres],[...langs]);
  };

  const handleEndlessDone=(data)=>{
    const {loFreq,hiFreq,avgFreq,comfortMidis}=data;
    const effAvg=avgFreq||((loFreq+hiFreq)/2);
    const vt=voiceType(effAvg,gender);
    const p={
      loFreq:Math.round(loFreq),hiFreq:Math.round(hiFreq),avgFreq:Math.round(effAvg),
      loNote:freqToNote(loFreq),hiNote:freqToNote(hiFreq),avgNote:freqToNote(effAvg),
      octaves:calcOctaves(loFreq,hiFreq),gender,...vt,
      comfortNote:comfortMidis?.[0]?freqToNote(440*Math.pow(2,(comfortMidis[0]-69)/12)):null,
    };
    setProfile(p);
    setStep("analyzing");
    fetchAI(p,[...genres],[...langs]);
  };

  const fetchAI=async(p,g,l)=>{
    const prompt=`You are a world-class vocal coach and music expert. Analyze this voice data and give deeply personalized recommendations.

VOICE DATA:
- Gender: ${p.gender||"not specified"}
- Voice Type: ${p.type}
- Natural Pitch: ${p.avgFreq}Hz (note: ${p.avgNote})
- Lowest Note: ${p.loNote} (${p.loFreq}Hz)
- Highest Note: ${p.hiNote} (${p.hiFreq}Hz)
- Vocal Span: ${p.octaves} octaves
${p.comfortNote?`- Most Comfortable Note: ${p.comfortNote}`:""}

USER PREFERENCES:
- Favourite Genres: ${g.join(", ")||"open to anything"}
- Preferred Languages: ${l.join(", ")||"any"}

Return a JSON object with these exact keys:
- insight: string (2-3 sentences about this voice, reference Hz values and octave span, make it personal)
- singers: array of 4 objects each with name and why (one sentence, match gender)
- songs: array of 6 objects each with title, artist, and why (brief reason matching their range)
- tip: string (one actionable vocal exercise for their voice type and span)

Prioritize artists and songs matching genre and language preferences. Keep all string values clean with no special characters or quotes inside strings.`;

    try{
      const res=await fetch("https://api.groq.com/openai/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${_a()}`},
        body:JSON.stringify({
          model:"llama-3.3-70b-versatile",
          messages:[{role:"user",content:prompt}],
          temperature:0.4,
          max_tokens:1400,
          response_format:{type:"json_object"},
        })
      });
      if(!res.ok){
        const errBody=await res.json().catch(()=>({}));
        throw new Error(errBody?.error?.message||`HTTP ${res.status}`);
      }
      const d=await res.json();
      const txt=d.choices?.[0]?.message?.content||"";
      setAiData(JSON.parse(txt));
    }catch(e){
      console.error("AI error:",e);
      setAiErr(`AI error: ${e.message}`);
    }
    setStep("results");
  };

  const reset=()=>{
    setStep("prefs");setProfile(null);setAiData(null);setAiErr(null);
    setTotalProg(0);setGender(null);setMode(null);
  };

  // ── ENDLESS MODE ────────────────────────────────────────────────────────────
  if(step==="endless") return(
    <EndlessMode
      gender={gender} genres={genres} langs={langs}
      onDone={handleEndlessDone}
      onBack={()=>setStep("prefs")}
    />
  );

  // ── PREFS ───────────────────────────────────────────────────────────────────
  if(step==="prefs") return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',overflowX:"hidden"}}>
      <style>{`.chip:hover{opacity:.75}`}</style>
      <div style={{maxWidth:640,margin:"0 auto",padding:"clamp(28px,5vw,56px) 20px"}}>

        <div style={{textAlign:"center",marginBottom:44}}>
          <div style={{fontSize:10,letterSpacing:6,color:C.muted,marginBottom:10,textTransform:"uppercase"}}>AI · Voice Analysis</div>
          <h1 style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(64px,15vw,112px)",lineHeight:.88,letterSpacing:2,margin:0}}>
            SHOWER<br/><span style={{color:C.accent}}>HEAD MIC</span>
          </h1>
          <p style={{color:C.muted,marginTop:18,fontSize:15,lineHeight:1.7,maxWidth:400,margin:"18px auto 0"}}>
            Discover your vocal range and get AI-powered song &amp; artist matches tailored to your voice.
          </p>
        </div>

        {/* Gender */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:12,textTransform:"uppercase"}}>Your voice</div>
          <div style={{display:"flex",gap:10}}>
            {[{v:"male",label:"♂ Male"},{v:"female",label:"♀ Female"}].map(({v,label})=>(
              <button key={v} onClick={()=>setGender(g=>g===v?null:v)}
                style={{flex:1,padding:"13px",borderRadius:12,fontFamily:"inherit",fontSize:14,fontWeight:600,
                  cursor:"pointer",transition:"all 0.15s",
                  border:`1.5px solid ${gender===v?C.accent:C.border}`,
                  background:gender===v?C.accent:"transparent",
                  color:gender===v?C.bg:C.text}}>
                {label}
              </button>
            ))}
          </div>
          {!gender&&<p style={{fontSize:11,color:C.muted,marginTop:7,marginBottom:0}}>Optional — helps tailor singer matches</p>}
        </div>

        {/* Genre */}
        <div style={{marginBottom:28}}>
          <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:12,textTransform:"uppercase"}}>Genres you love</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {GENRES.map(g=><button key={g} className="chip" style={chip(genres.includes(g))} onClick={()=>toggle(genres,setGenres,g)}>{g}</button>)}
          </div>
        </div>

        {/* Language */}
        <div style={{marginBottom:36}}>
          <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:12,textTransform:"uppercase"}}>Languages you sing in</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {LANGUAGES.map(l=><button key={l} className="chip" style={chip(langs.includes(l))} onClick={()=>toggle(langs,setLangs,l)}>{l}</button>)}
          </div>
        </div>

        {/* Mode picker */}
        <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:12,textTransform:"uppercase"}}>Choose your session</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:32}}>
          {/* Guided */}
          <div onClick={()=>setMode("guided")}
            style={{...card,cursor:"pointer",textAlign:"left",padding:18,
              borderColor:mode==="guided"?C.accent:C.border,transition:"border-color 0.15s"}}>
            <div style={{fontSize:22,marginBottom:6}}>🎵</div>
            <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:20,letterSpacing:2,color:C.text,marginBottom:4}}>GUIDED</div>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>Sa Re Ga Ma · 20s · follow the prompts</div>
          </div>
          {/* Endless */}
          <div onClick={()=>setMode("endless")}
            style={{...card,cursor:"pointer",textAlign:"left",padding:18,
              borderColor:mode==="endless"?C.accent:C.border,transition:"border-color 0.15s"}}>
            <div style={{fontSize:22,marginBottom:6}}>♾️</div>
            <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:20,letterSpacing:2,color:C.text,marginBottom:4}}>ENDLESS</div>
            <div style={{fontSize:11,color:C.muted,lineHeight:1.5}}>Hold each note 2s · climb as far as you can · no time limit</div>
          </div>
        </div>

        <button
          onClick={()=>{
            if(!mode){alert("Pick a session mode first.");return;}
            if(mode==="endless"){setStep("endless");}
            else startGuided();
          }}
          style={{width:"100%",padding:"20px",borderRadius:14,
            background:mode?C.accent:C.dim,color:mode?C.bg:C.muted,
            border:"none",fontFamily:'"Bebas Neue",sans-serif',fontSize:24,letterSpacing:4,
            cursor:mode?"pointer":"not-allowed",transition:"all 0.15s"}}
          onMouseEnter={e=>{if(mode)e.currentTarget.style.opacity=".85";}}
          onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          START ANALYSIS
        </button>
        <p style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:10}}>Requires microphone · No audio is stored</p>
      </div>
    </div>
  );

  // ── RECORDING (guided) ──────────────────────────────────────────────────────
  if(step==="recording"){
    const phase=PHASES[phaseIdx];
    return(
      <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center"}}>
        <style>{`
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
          @keyframes glow{0%,100%{text-shadow:0 0 60px var(--gc)}50%{text-shadow:0 0 140px var(--gc),0 0 220px var(--gc)}}
        `}</style>
        <div style={{fontSize:10,letterSpacing:6,color:C.muted,marginBottom:8,textTransform:"uppercase"}}>Phase {phaseIdx+1} of {PHASES.length}</div>
        <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(32px,7vw,60px)",
          lineHeight:1,color:phase.col,letterSpacing:3,marginBottom:10}}>{phase.label}</div>
        <p style={{color:C.muted,fontSize:14,maxWidth:340,lineHeight:1.6,marginBottom:28}}>{phase.sub}</p>
        <div style={{"--gc":phase.col,fontFamily:'"Bebas Neue",sans-serif',
          fontSize:"clamp(120px,26vw,200px)",lineHeight:1,color:phase.col,marginBottom:20,
          animation:timer<=2?"glow 0.7s infinite":"none"}}>{timer}</div>
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:48,lineHeight:1,
            color:liveHz>0?C.accent:C.dim,transition:"color 0.1s"}}>
            {liveHz>0?`${liveHz} Hz`:"· · ·"}
          </div>
          <div style={{fontSize:15,color:liveHz>0?C.text:C.muted,marginTop:3,letterSpacing:1,fontWeight:500}}>
            {liveHz>0?freqToNote(liveHz):"sing into your mic"}
          </div>
        </div>
        <div style={{width:"min(300px,80vw)",marginBottom:28}}>
          <div style={{height:7,background:C.dim,borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:4,background:`linear-gradient(90deg,${phase.col},${C.accent})`,
              width:`${liveVol}%`,transition:"width 0.05s"}}/>
          </div>
          {liveHz===0&&<div style={{fontSize:11,color:C.muted,marginTop:5,animation:"pulse 2s infinite"}}>No pitch detected — sing clearly</div>}
        </div>
        <div style={{width:"min(300px,80vw)"}}>
          <div style={{height:3,background:C.dim,borderRadius:2,overflow:"hidden"}}>
            <div style={{height:"100%",background:C.accent,borderRadius:2,width:`${totalProg}%`,transition:"width 1s linear"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:11,color:C.muted}}>
            <span>Total progress</span><span>{Math.round(totalProg)}%</span>
          </div>
        </div>
      </div>
    );
  }

  // ── ANALYZING ───────────────────────────────────────────────────────────────
  if(step==="analyzing") return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{width:68,height:68,borderRadius:"50%",border:`3px solid #1a1a2e`,borderTop:`3px solid ${C.accent}`,animation:"spin 1s linear infinite"}}/>
      <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:34,letterSpacing:5}}>ANALYZING</div>
      <div style={{fontSize:13,color:C.muted,maxWidth:280,textAlign:"center",lineHeight:1.65}}>Crunching your voice data with Llama AI...</div>
      {profile&&(
        <div style={{...card,marginTop:6,animation:"fadeUp 0.4s ease",textAlign:"center",minWidth:220}}>
          <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:30,color:profile.col,lineHeight:1}}>{profile.emoji} {profile.type}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:4}}>{profile.loNote} → {profile.hiNote} · {profile.octaves} oct</div>
        </div>
      )}
    </div>
  );

  // ── RESULTS ─────────────────────────────────────────────────────────────────
  if(step==="results"&&profile){
    const pct=Math.max(10,Math.min(88,(Math.log2(profile.avgFreq/profile.loFreq)/Math.log2(profile.hiFreq/profile.loFreq))*84+4));
    return(
      <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"DM Sans",sans-serif',overflowX:"hidden"}}>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}} .hov-card:hover{border-color:rgba(200,255,71,.4) !important}`}</style>
        <div style={{maxWidth:640,margin:"0 auto",padding:"clamp(28px,5vw,52px) 20px"}}>

          <div style={{textAlign:"center",marginBottom:32,animation:"fadeUp 0.3s ease"}}>
            <div style={{fontSize:10,letterSpacing:6,color:C.muted,marginBottom:8,textTransform:"uppercase"}}>Voice Report</div>
            <div style={{fontSize:52,marginBottom:4}}>{profile.emoji}</div>
            <h2 style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:"clamp(48px,10vw,84px)",lineHeight:1,margin:"0 0 8px",color:profile.col,letterSpacing:2}}>{profile.type}</h2>
            <p style={{color:C.muted,fontSize:14,margin:0}}>{profile.desc}</p>
          </div>

          <div style={{...card,marginBottom:18,animation:"fadeUp 0.4s ease"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,textAlign:"center",marginBottom:18}}>
              {[
                {label:"Lowest",     val:profile.loNote, sub:`${profile.loFreq} Hz`},
                {label:"Octave Span",val:profile.octaves,sub:"octaves",big:true},
                {label:"Highest",    val:profile.hiNote, sub:`${profile.hiFreq} Hz`},
              ].map(({label,val,sub,big})=>(
                <div key={label}>
                  <div style={{fontSize:10,letterSpacing:3,color:C.muted,textTransform:"uppercase",marginBottom:5}}>{label}</div>
                  <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:big?52:28,lineHeight:1,color:big?C.accent:C.text}}>{val}</div>
                  <div style={{fontSize:11,color:C.muted,marginTop:3}}>{sub}</div>
                </div>
              ))}
            </div>
            {profile.comfortNote&&(
              <div style={{textAlign:"center",marginBottom:14,fontSize:12,color:C.muted}}>
                Most comfortable at <span style={{color:C.accent,fontWeight:600}}>{profile.comfortNote}</span>
              </div>
            )}
            <div style={{position:"relative",height:9,background:C.dim,borderRadius:5,overflow:"hidden",marginBottom:7}}>
              <div style={{position:"absolute",top:0,bottom:0,left:"4%",right:"4%",background:`linear-gradient(90deg,#3b82f6,${profile.col},#ec4899)`,borderRadius:5}}/>
              <div style={{position:"absolute",top:0,bottom:0,width:3,background:"#fff",borderRadius:2,left:`${pct}%`}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted}}>
              <span>{profile.loNote}</span><span>▲ natural: {profile.avgNote}</span><span>{profile.hiNote}</span>
            </div>
          </div>

          {aiData?.insight&&(
            <div style={{...card,marginBottom:18,borderLeft:`3px solid ${C.accent}`,animation:"fadeUp 0.5s ease"}}>
              <div style={{fontSize:10,letterSpacing:4,color:C.accent,marginBottom:9,textTransform:"uppercase"}}>✦ AI Insight</div>
              <p style={{color:C.text,fontSize:14,lineHeight:1.8,margin:0}}>{aiData.insight}</p>
            </div>
          )}

          {aiData?.singers?.length>0&&(
            <section style={{marginBottom:22,animation:"fadeUp 0.6s ease"}}>
              <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:11,textTransform:"uppercase"}}>Your Voice Sounds Like</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {aiData.singers.map((s,i)=>(
                  <a key={i} href={spotifyUrl(s.name)} target="_blank" rel="noopener noreferrer" className="hov-card"
                    style={{textDecoration:"none",display:"flex",alignItems:"center",gap:14,...card,padding:"13px 16px",transition:"border-color 0.15s"}}>
                    <div style={{fontFamily:'"Bebas Neue",sans-serif',fontSize:28,lineHeight:1,minWidth:34,textAlign:"center",color:i===0?C.accent:"#2a2a40"}}>{String(i+1).padStart(2,"0")}</div>
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

          {aiData?.songs?.length>0&&(
            <section style={{marginBottom:22,animation:"fadeUp 0.7s ease"}}>
              <div style={{fontSize:10,letterSpacing:5,color:C.muted,marginBottom:11,textTransform:"uppercase"}}>Songs Perfect For Your Voice</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {aiData.songs.map((s,i)=>(
                  <a key={i} href={spotifyUrl(`${s.title} ${s.artist}`)} target="_blank" rel="noopener noreferrer" className="hov-card"
                    style={{textDecoration:"none",display:"flex",alignItems:"center",gap:12,...card,padding:"11px 15px",transition:"border-color 0.15s"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:C.dim,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#1db954"><path d="M9 3v10.55c-.59-.34-1.27-.55-2-.55C4.79 13 3 14.79 3 17s1.79 4 4 4 4-1.79 4-4V7h4V3H9z"/></svg>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.title}</div>
                      <div style={{fontSize:12,color:C.muted}}>{s.artist}{s.why&&<span style={{color:"#3a3a58",fontStyle:"italic"}}> · {s.why}</span>}</div>
                    </div>
                    <SpotifyIcon size={16}/>
                  </a>
                ))}
              </div>
            </section>
          )}

          {aiData?.tip&&(
            <div style={{background:`${C.accent}10`,borderRadius:14,padding:18,marginBottom:22,border:`1px solid ${C.accent}22`,animation:"fadeUp 0.8s ease"}}>
              <div style={{fontSize:10,letterSpacing:4,color:C.accent,marginBottom:7,textTransform:"uppercase"}}>💡 Vocal Coach Tip</div>
              <p style={{color:C.text,fontSize:14,lineHeight:1.8,margin:0}}>{aiData.tip}</p>
            </div>
          )}

          {aiErr&&(
            <div style={{background:"#ff222215",borderRadius:12,padding:14,marginBottom:20,fontSize:13,color:"#ff9090",border:"1px solid #ff222228",lineHeight:1.6}}>⚠️ {aiErr}</div>
          )}

          <button onClick={reset}
            style={{width:"100%",padding:"16px",borderRadius:12,background:"transparent",color:C.text,
              border:`1.5px solid ${C.border}`,fontFamily:'"Bebas Neue",sans-serif',fontSize:18,letterSpacing:3,
              cursor:"pointer",transition:"border-color 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
            onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
            ANALYZE AGAIN
          </button>
          <p style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:10}}>Powered by Groq · Llama 3.3 · Spotify links open in new tab</p>
        </div>
      </div>
    );
  }

  return null;
}
