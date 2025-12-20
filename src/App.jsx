import { useState, useRef, useEffect } from "react";
import {
  Mic,
  Music,
  Sparkles,
  Waves,
  Share2,
  Activity,
  Download,
} from "lucide-react";

// 🔒 Prevent SSR / build crashes
const isBrowser = typeof window !== "undefined";

export default function App() {
  const [recording, setRecording] = useState(false);
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

  const MIN_VOCAL_FREQ = 60;
  const MAX_VOCAL_FREQ = 1000;

  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  const getNoteFromFreq = (freq) => {
    if (!freq || freq <= 0) return "-";
    const number = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
    const rounded = Math.round(number);
    return `${NOTES[rounded % 12]}${Math.floor(rounded / 12) - 1}`;
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
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] ** 2;
    rms = Math.sqrt(rms / buffer.length);
    if (rms < 0.01) return -1;

    let bestOffset = -1;
    let bestCorrelation = 0;
    for (let offset = 20; offset < 1000; offset++) {
      let correlation = 0;
      for (let i = 0; i < buffer.length - offset; i++) {
        correlation += buffer[i] * buffer[i + offset];
      }
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    }
    return bestOffset > 0 ? sampleRate / bestOffset : -1;
  };

  const monitorFrequency = () => {
    if (!isBrowser || !analyserRef.current) return;
    const data = new Float32Array(analyserRef.current.fftSize);

    const update = () => {
      analyserRef.current.getFloatTimeDomainData(data);
      const pitch = detectPitch(data, audioContextRef.current.sampleRate);

      if (pitch > MIN_VOCAL_FREQ && pitch < MAX_VOCAL_FREQ) {
        setLiveFrequency(Math.round(pitch));
        setLiveNote(getNoteFromFreq(pitch));
      }

      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] ** 2;
      setLiveVolume(Math.sqrt(sum / data.length) * 100);

      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  const analyzeAudioBlob = async (blob) => {
    if (!isBrowser) return;
    setAnalyzing(true);

    try {
      const arrayBuffer = await blob.arrayBuffer();
      const ctx = new AudioContext();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const channel = audioBuffer.getChannelData(0);

      const freqs = [];
      for (let i = 0; i < channel.length - 2048; i += 1024) {
        const pitch = detectPitch(
          channel.slice(i, i + 2048),
          audioBuffer.sampleRate
        );
        if (pitch > MIN_VOCAL_FREQ && pitch < MAX_VOCAL_FREQ) freqs.push(pitch);
      }

      if (freqs.length) {
        freqs.sort((a, b) => a - b);
        const avg =
          freqs.reduce((a, b) => a + b, 0) / freqs.length;
        const range = getVoiceRange(avg);

        setAnalysis({
          range,
          avgFrequency: Math.round(avg),
          minNote: getNoteFromFreq(freqs[0]),
          maxNote: getNoteFromFreq(freqs[freqs.length - 1]),
          songs: {
            Bass: ["Ring of Fire – Johnny Cash"],
            Baritone: ["Thinking Out Loud – Ed Sheeran"],
            Tenor: ["Perfect – Ed Sheeran"],
            Alto: ["Halo – Beyoncé"],
            "Mezzo-Soprano": ["Rolling in the Deep – Adele"],
            Soprano: ["Chandelier – Sia"],
          }[range],
          artists: {
            Bass: ["Johnny Cash"],
            Baritone: ["John Legend"],
            Tenor: ["Arijit Singh"],
            Alto: ["Adele"],
            "Mezzo-Soprano": ["Lady Gaga"],
            Soprano: ["Whitney Houston"],
          }[range],
        });
      }
    } catch (e) {
      console.error(e);
    }
    setAnalyzing(false);
  };

  const startRecording = async () => {
    if (!isBrowser) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    audioContextRef.current = new AudioContext();
    const source =
      audioContextRef.current.createMediaStreamSource(stream);

    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048;

    source.connect(analyserRef.current);
    monitorFrequency();

    mediaRecorderRef.current = new MediaRecorder(stream);
    audioChunksRef.current = [];

    mediaRecorderRef.current.ondataavailable = (e) =>
      audioChunksRef.current.push(e.data);

    mediaRecorderRef.current.onstop = () =>
      analyzeAudioBlob(new Blob(audioChunksRef.current));

    mediaRecorderRef.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(animationFrameRef.current);
    setRecording(false);
  };

  const downloadReport = async () => {
    if (!isBrowser || !reportRef.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(reportRef.current);
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "shower-mic-report.png";
    link.click();
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white text-center p-10">
      <h1 className="text-6xl font-extrabold">SHOWER HEAD MIC</h1>

      <button
        onClick={recording ? stopRecording : startRecording}
        className="mt-10 px-8 py-4 bg-white text-black rounded-xl"
      >
        <Mic /> {recording ? "Stop" : "Start"} Recording
      </button>

      {analysis && (
        <div ref={reportRef} className="mt-10 bg-white text-black p-8 rounded-xl">
          <h2 className="text-3xl font-bold">{analysis.range}</h2>
          <p>
            {analysis.minNote} – {analysis.maxNote}
          </p>
          <p>Songs: {analysis.songs.join(", ")}</p>
          <p>Artists: {analysis.artists.join(", ")}</p>
        </div>
      )}

      {analysis && (
        <button
          onClick={downloadReport}
          className="mt-6 px-6 py-3 bg-white text-black rounded-lg"
        >
          <Download /> Save Report
        </button>
      )}
    </div>
  );
}
