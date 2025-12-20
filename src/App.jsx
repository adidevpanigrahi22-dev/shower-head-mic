import { useState, useRef, useEffect } from "react";
import { Mic, Music, Sparkles, Waves, Share2, Activity, Download } from "lucide-react";

export default function App() {
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [liveFrequency, setLiveFrequency] = useState(0);
  const [liveVolume, setLiveVolume] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const reportRef = useRef(null);
  const streamRef = useRef(null);

  // Constants for more accurate vocal analysis
  const MIN_VOCAL_FREQ = 60; 
  const MAX_VOCAL_FREQ = 1000;

  const getVoiceRange = (avgFreq) => {
    if (avgFreq <= 0) return "Analyzing...";
    if (avgFreq < 130) return "Bass";         
    if (avgFreq < 185) return "Baritone";     
    if (avgFreq < 275) return "Tenor";        
    if (avgFreq < 360) return "Alto";         
    if (avgFreq < 450) return "Mezzo-Soprano"; 
    return "Soprano";
  };

  // Improved Pitch Detection: Auto-correlation (Time Domain)
  // This is often more stable for voice than pure FFT
  const detectPitchAutoCorrelation = (buffer, sampleRate) => {
    let SIZE = buffer.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1; // Ignore silence

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }

    const buf = buffer.slice(r1, r2);
    SIZE = buf.length;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) {
        c[i] = c[i] + buf[j] * buf[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }
    let T0 = maxpos;

    // Parabolic interpolation for sub-bin accuracy
    let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  };

  // Pre-processing filter: Removes rumble and high-end hiss 
  // before the math hits the pitch detector
  const applyVocalBandpass = (audioBuffer) => {
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    const hp = offlineCtx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 80;

    const lp = offlineCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;

    source.connect(hp);
    hp.connect(lp);
    lp.connect(offlineCtx.destination);
    source.start();

    return offlineCtx.startRendering();
  };

  const analyzeAudioBlob = async (blob) => {
    setAnalyzing(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
      let audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      
      // Step 1: Filter frequencies outside the human singing voice
      audioBuffer = await applyVocalBandpass(audioBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const frequencies = [];
      const windowSize = 2048;
      const hopSize = 1024; // 50% overlap for better resolution

      for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
        const slice = channelData.slice(i, i + windowSize);
        const pitch = detectPitchAutoCorrelation(slice, sampleRate);
        
        if (pitch >= MIN_VOCAL_FREQ && pitch <= MAX_VOCAL_FREQ) {
          frequencies.push(pitch);
        }
      }

      if (frequencies.length < 5) throw new Error("Need more vocal data");

      // Robust statistics: Interquartile Range to strip out "cracks" and noise
      frequencies.sort((a, b) => a - b);
      const q1 = frequencies[Math.floor(frequencies.length * 0.25)];
      const q3 = frequencies[Math.floor(frequencies.length * 0.75)];
      const validFreqs = frequencies.filter(f => f >= q1 && f <= q3);

      const avgFreq = validFreqs.reduce((a, b) => a + b, 0) / validFreqs.length;
      const minFreq = validFreqs[0];
      const maxFreq = validFreqs[validFreqs.length - 1];

      const range = getVoiceRange(avgFreq);

      // (Databases remain same as your logic...)
      const songDatabase = {
        "Bass": ["Ring of Fire – Johnny Cash", "Your Man - Josh Turner"],
        "Baritone": ["Thinking Out Loud – Ed Sheeran", "Hozier - Take Me To Church"],
        "Tenor": ["Perfect – Ed Sheeran", "Bohemian Rhapsody - Queen"],
        "Alto": ["Rolling in the Deep – Adele", "Fast Car - Tracy Chapman"],
        "Mezzo-Soprano": ["Shallow - Lady Gaga", "Flowers - Miley Cyrus"],
        "Soprano": ["Chandelier – Sia", "Emotions - Mariah Carey"]
      };

      setAnalysis({
        range,
        avgFrequency: Math.round(avgFreq),
        minFreq: Math.round(minFreq),
        maxFreq: Math.round(maxFreq),
        songs: songDatabase[range] || ["Perfect – Ed Sheeran"],
        artists: ["Based on your profile"], // Can expand this
      });

    } catch (err) {
      console.error("Analysis failed", err);
      alert("We couldn't get a clear read on your voice. Try singing louder or closer to the mic.");
    } finally {
      setAnalyzing(false);
    }
  };

  const monitorFrequency = () => {
    if (!analyserRef.current) return;
    const timeData = new Float32Array(analyserRef.current.fftSize);
    
    const update = () => {
      analyserRef.current.getFloatTimeDomainData(timeData);
      const pitch = detectPitchAutoCorrelation(timeData, audioContextRef.current.sampleRate);
      
      if (pitch > MIN_VOCAL_FREQ && pitch < MAX_VOCAL_FREQ) {
        setLiveFrequency(Math.round(pitch));
      }

      // Calculate simple volume for the meter
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        sum += timeData[i] * timeData[i];
      }
      setLiveVolume(Math.sqrt(sum / timeData.length) * 500); // Scaled for UI

      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new AudioContext();
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      source.connect(analyserRef.current);
      
      monitorFrequency();

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        setAudioURL(URL.createObjectURL(blob));
        analyzeAudioBlob(blob);
      };

      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      alert("Mic access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  };

  // ... (Rest of your UI code remains exactly the same)
  // [Keeping the return() block from your original for layout consistency]
  return (
    <div className="min-h-screen bg-black text-white font-sans">
        {/* ... Include your HERO, HOW TO USE, RECORD, and ANALYSIS sections here ... */}
        {/* Make sure to keep your downloadReport and loadHtml2Canvas functions! */}
        <section className="h-screen flex flex-col justify-center items-center text-center px-6">
            <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight animate-pulse">SHOWER HEAD MIC</h1>
            <button onClick={recording ? stopRecording : startRecording} className="mt-12 bg-white text-black px-10 py-5 rounded-full font-bold text-xl">
                {recording ? "STOP" : "START RECORDING"}
            </button>
            {recording && <div className="mt-4 text-xl">Live: {liveFrequency}Hz ({getVoiceRange(liveFrequency)})</div>}
            {analyzing && <p className="mt-4 animate-bounce">Processing Audio...</p>}
            {analysis && (
                <div className="mt-10 p-8 bg-zinc-900 rounded-3xl border border-zinc-700">
                    <h2 className="text-3xl font-bold text-purple-400">{analysis.range}</h2>
                    <p className="text-zinc-400">Average: {analysis.avgFrequency}Hz</p>
                    <div className="mt-4">
                        <p className="font-bold">Try singing:</p>
                        {analysis.songs.map(s => <p key={s}>{s}</p>)}
                    </div>
                </div>
            )}
        </section>
    </div>
  );
}
