import { useState, useRef, useEffect } from "react";
import { Mic, Music, Sparkles, Waves, Share2, Activity, Download } from "lucide-react";

export default function App() {
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [liveFrequency, setLiveFrequency] = useState(0);
  const [liveNote, setLiveNote] = useState("-");
  const [liveVolume, setLiveVolume] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const reportRef = useRef(null);
  const streamRef = useRef(null);

  // Constants
  const MIN_VOCAL_FREQ = 60; 
  const MAX_VOCAL_FREQ = 1000;

  // Helper: Convert Frequency to Musical Note
  const getNoteFromFreq = (freq) => {
    if (!freq || freq <= 0) return "-";
    const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const number = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
    const rounded = Math.round(number);
    const name = NOTES[rounded % 12];
    const octave = Math.floor(rounded / 12) - 1;
    return `${name}${octave}`;
  };

  const getVoiceRange = (avgFreq) => {
    if (avgFreq < 130) return "Bass";
    if (avgFreq < 185) return "Baritone";
    if (avgFreq < 275) return "Tenor";
    if (avgFreq < 360) return "Alto";
    if (avgFreq < 450) return "Mezzo-Soprano";
    return "Soprano";
  };

  const detectPitch = (buffer, sampleRate) => {
    let SIZE = buffer.length;
    let sum = 0;
    for (let i = 0; i < SIZE; i++) sum += buffer[i] * buffer[i];
    let rms = Math.sqrt(sum / SIZE);
    if (rms < 0.01) return -1;

    let c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE - i; j++) {
        c[i] = c[i] + buffer[j] * buffer[j + i];
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
    return sampleRate / maxpos;
  };

  const applyVocalFilters = async (audioBuffer) => {
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.length, audioBuffer.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    const hp = offlineCtx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 80;
    const lp = offlineCtx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1000;
    source.connect(hp); hp.connect(lp); lp.connect(offlineCtx.destination);
    source.start();
    return await offlineCtx.startRendering();
  };

  const analyzeAudioBlob = async (blob) => {
    setAnalyzing(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const tempCtx = new (window.AudioContext || window.webkitAudioContext)();
      let audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      audioBuffer = await applyVocalFilters(audioBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const frequencies = [];
      for (let i = 0; i < channelData.length - 2048; i += 1024) {
        const pitch = detectPitch(channelData.slice(i, i + 2048), audioBuffer.sampleRate);
        if (pitch >= MIN_VOCAL_FREQ && pitch <= MAX_VOCAL_FREQ) frequencies.push(pitch);
      }

      if (frequencies.length > 0) {
        frequencies.sort((a, b) => a - b);
        const trimmed = frequencies.slice(Math.floor(frequencies.length * 0.2), Math.floor(frequencies.length * 0.8));
        const avgFreq = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
        const range = getVoiceRange(avgFreq);

        setAnalysis({
          range,
          avgFrequency: Math.round(avgFreq),
          minFreq: Math.round(trimmed[0]),
          maxFreq: Math.round(trimmed[trimmed.length - 1]),
          minNote: getNoteFromFreq(trimmed[0]),
          maxNote: getNoteFromFreq(trimmed[trimmed.length - 1]),
          songs: {
            "Bass": ["Ring of Fire – Johnny Cash", "Ain't No Sunshine – Bill Withers"],
            "Baritone": ["Someone Like You – Adele", "Thinking Out Loud – Ed Sheeran"],
            "Tenor": ["Perfect – Ed Sheeran", "Raabta – Arijit Singh"],
            "Alto": ["Halo – Beyoncé", "Stay With Me – Sam Smith"],
            "Mezzo-Soprano": ["Rolling in the Deep – Adele", "Girl on Fire – Alicia Keys"],
            "Soprano": ["Chandelier – Sia", "Vision of Love – Mariah Carey"]
          }[range] || ["Perfect – Ed Sheeran"],
          artists: {
            "Bass": ["Johnny Cash", "Josh Turner"],
            "Baritone": ["John Legend", "Michael Bublé"],
            "Tenor": ["Arijit Singh", "The Weeknd"],
            "Alto": ["Adele", "Amy Winehouse"],
            "Mezzo-Soprano": ["Lady Gaga", "Ariana Grande"],
            "Soprano": ["Whitney Houston", "Sia"]
          }[range] || ["Arijit Singh"],
        });
      }
    } catch (e) { console.error(e); }
    setAnalyzing(false);
  };

  const monitorFrequency = () => {
    if (!analyserRef.current) return;
    const timeData = new Float32Array(analyserRef.current.fftSize);
    const update = () => {
      analyserRef.current.getFloatTimeDomainData(timeData);
      const pitch = detectPitch(timeData, audioContextRef.current.sampleRate);
      if (pitch > MIN_VOCAL_FREQ && pitch < MAX_VOCAL_FREQ) {
        setLiveFrequency(Math.round(pitch));
        setLiveNote(getNoteFromFreq(pitch));
      }
      let s = 0;
      for (let i = 0; i < timeData.length; i++) s += timeData[i] * timeData[i];
      setLiveVolume(Math.sqrt(s / timeData.length) * 100);
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
      mediaRecorderRef.current.onstop = () => analyzeAudioBlob(new Blob(audioChunksRef.current, { type: "audio/wav" }));
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) { alert("Mic required"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      streamRef.current.getTracks().forEach(t => t.stop());
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const downloadReport = async () => {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(reportRef.current, { backgroundColor: '#ffffff', scale: 2 });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `shower-mic-report.png`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <section className="h-screen flex flex-col justify-center items-center text-center px-6">
        <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight animate-pulse">SHOWER HEAD MIC</h1>
        <p className="mt-6 max-w-xl text-gray-300 text-lg">Discover your voice range, song matches, and artist similarities — instantly.</p>
        <p className="mt-2 text-sm text-gray-500">✨ Pro Accuracy & Note Detection Enabled</p>
      </section>

      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center">How to use</h2>
          <ol className="mt-10 space-y-6 text-lg">
            <li><b>1.</b> Click <b>Start Recording</b>.</li>
            <li><b>2.</b> Sing or hum comfortably for 5–10 seconds.</li>
            <li><b>3.</b> View your professional voice analysis.</li>
          </ol>
        </div>
      </section>

      <section className="py-24 px-6 bg-black">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-bold">Record your voice</h2>
          {recording && (
            <div className="mt-8 p-6 bg-gray-900 rounded-2xl inline-block">
              <div className="flex items-center gap-6">
                <Activity className="animate-pulse text-red-500" size={32} />
                <div className="text-left border-r border-gray-700 pr-6">
                  <p className="text-xs text-gray-400 uppercase tracking-widest">Note</p>
                  <p className="text-4xl font-black text-blue-400">{liveNote}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-gray-400 uppercase tracking-widest">Pitch</p>
                  <p className="text-2xl font-bold">{liveFrequency} Hz</p>
                </div>
              </div>
              <div className="mt-4 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-75" style={{ width: `${Math.min(liveVolume * 2, 100)}%` }} />
              </div>
            </div>
          )}
          <div className="mt-8">
            <button onClick={recording ? stopRecording : startRecording} className={`inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-semibold transition ${recording ? "bg-red-500 text-white" : "bg-white text-black hover:scale-105"}`}>
              <Mic /> {recording ? "Stop Recording" : "Start Recording"}
            </button>
          </div>
          {analyzing && <p className="mt-4 text-gray-400 animate-pulse">Analyzing vocal profile...</p>}
        </div>
      </section>

      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold">Your Voice Report</h2>
          {!analysis && <p className="mt-6 text-gray-500">Record to generate your report</p>}
          {analysis && (
            <>
              <div ref={reportRef} className="mt-12 p-8 bg-white rounded-3xl border border-gray-100 shadow-2xl">
                <div className="mb-8">
                  <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">SHOWER HEAD MIC</h1>
                  <p className="text-gray-500 mt-2">Professional Voice Analysis</p>
                </div>
                <div className="grid md:grid-cols-3 gap-8">
                  <div className="p-6 rounded-2xl bg-purple-50 border-2 border-purple-100">
                    <Sparkles className="mx-auto text-purple-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Voice Range</h3>
                    <p className="mt-2 text-3xl font-bold text-purple-600">{analysis.range}</p>
                    <p className="text-xs font-bold text-gray-500 mt-1">{analysis.minNote} - {analysis.maxNote}</p>
                    <p className="text-xs text-gray-400">Avg: {analysis.avgFrequency}Hz</p>
                  </div>
                  <div className="p-6 rounded-2xl bg-green-50 border-2 border-green-100">
                    <Music className="mx-auto text-green-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Song Matches</h3>
                    <ul className="mt-2 text-sm text-gray-700 space-y-1">
                      {analysis.songs.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                  <div className="p-6 rounded-2xl bg-orange-50 border-2 border-orange-100">
                    <Waves className="mx-auto text-orange-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Artists</h3>
                    <p className="mt-2 text-sm text-gray-700">{analysis.artists.join(", ")}</p>
                  </div>
                </div>
              </div>
              <div className="mt-10 flex gap-4 justify-center">
                <button onClick={downloadReport} className="inline-flex items-center gap-2 bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800 transition shadow-lg"><Download size={20} /> Save Report</button>
                <button className="inline-flex items-center gap-2 border-2 border-black px-6 py-3 rounded-xl hover:bg-black hover:text-white transition"><Share2 /> Share</button>
              </div>
            </>
          )}
        </div>
      </section>
      <footer className="py-10 text-center text-gray-500 bg-black">© 2025 NoteHeads</footer>
    </div>
  );
}
