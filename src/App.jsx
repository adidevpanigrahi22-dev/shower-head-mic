import { useState, useRef, useEffect } from "react";
import { Mic, Music, Sparkles, Waves, Share2, Activity, Download } from "lucide-react";

export default function App() {
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [liveFrequency, setLiveFrequency] = useState(0);
  const [liveVolume, setLiveVolume] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);

  // 🔹 NEW: guided humming state
  const [phase, setPhase] = useState("idle"); // idle | comfort | down | up
  const [instruction, setInstruction] = useState(
    "Click Start and hum comfortably"
  );

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const reportRef = useRef(null);
  const phaseStartRef = useRef(null);

  // 🔹 NEW: range tracking
  const comfortPitchesRef = useRef([]);
  const lowPitchRef = useRef(Infinity);
  const highPitchRef = useRef(-Infinity);

  // ---------------- PITCH DETECTION (unchanged) ----------------
  const detectPitch = (buffer, sampleRate) => {
    const SIZE = buffer.length;
    const rms = Math.sqrt(buffer.reduce((s, v) => s + v * v, 0) / SIZE);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = SIZE - 1;
    const threshold = 0.2;

    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < threshold) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < threshold) {
        r2 = SIZE - i;
        break;
      }
    }

    const buf = buffer.slice(r1, r2);
    const corr = new Array(buf.length).fill(0);

    for (let i = 0; i < buf.length; i++) {
      for (let j = 0; j < buf.length - i; j++) {
        corr[i] += buf[j] * buf[j + i];
      }
    }

    let d = 0;
    while (corr[d] > corr[d + 1]) d++;

    let maxVal = -1, maxIdx = -1;
    for (let i = d; i < buf.length; i++) {
      if (corr[i] > maxVal) {
        maxVal = corr[i];
        maxIdx = i;
      }
    }

    return maxIdx > 0 ? sampleRate / maxIdx : -1;
  };

  // ---------------- REAL-TIME MONITOR ----------------
  const monitorFrequency = () => {
    if (!analyserRef.current) return;

    const timeData = new Float32Array(analyserRef.current.fftSize);

    const update = () => {
      analyserRef.current.getFloatTimeDomainData(timeData);
      const pitch = detectPitch(timeData, audioContextRef.current.sampleRate);

      if (pitch > 50 && pitch < 2000) {
        setLiveFrequency(Math.round(pitch));

        // 🧠 Guided logic
        if (phase === "comfort") {
          comfortPitchesRef.current.push(pitch);
        }
        if (phase === "down") {
          lowPitchRef.current = Math.min(lowPitchRef.current, pitch);
        }
        if (phase === "up") {
          highPitchRef.current = Math.max(highPitchRef.current, pitch);
        }
      }

      // volume (unchanged)
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      setLiveVolume(
        Math.round(dataArray.reduce((a, b) => a + b, 0) / dataArray.length)
      );

      handlePhaseTiming();
      animationFrameRef.current = requestAnimationFrame(update);
    };

    update();
  };

  // ---------------- PHASE TIMING ----------------
  const handlePhaseTiming = () => {
    if (!phaseStartRef.current) return;
    const elapsed = performance.now() - phaseStartRef.current;

    if (phase === "comfort" && elapsed > 2000) {
      setPhase("down");
      setInstruction("Slowly go lower");
      phaseStartRef.current = performance.now();
    }

    if (phase === "down" && elapsed > 3500) {
      setPhase("up");
      setInstruction("Now slowly go higher");
      phaseStartRef.current = performance.now();
    }
  };

  // ---------------- START / STOP ----------------
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 2048;

    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);

    comfortPitchesRef.current = [];
    lowPitchRef.current = Infinity;
    highPitchRef.current = -Infinity;

    setPhase("comfort");
    setInstruction("Start humming comfortably");
    phaseStartRef.current = performance.now();

    monitorFrequency();

    mediaRecorderRef.current = new MediaRecorder(stream);
    audioChunksRef.current = [];

    mediaRecorderRef.current.ondataavailable = e =>
      audioChunksRef.current.push(e.data);

    mediaRecorderRef.current.onstop = () => {
      const comfort =
        comfortPitchesRef.current.sort((a, b) => a - b)[
          Math.floor(comfortPitchesRef.current.length / 2)
        ];

      setAnalysis({
        range: "Custom",
        avgFrequency: Math.round(comfort),
        minFreq: Math.round(lowPitchRef.current),
        maxFreq: Math.round(highPitchRef.current),
        songs: ["(Coming soon – personalized ranking)"],
        artists: ["—"]
      });

      stream.getTracks().forEach(t => t.stop());
      audioContextRef.current.close();
      cancelAnimationFrame(animationFrameRef.current);
      setPhase("idle");
    };

    mediaRecorderRef.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  // ---------------- UI (mostly unchanged) ----------------
  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <section className="h-screen flex flex-col justify-center items-center text-center px-6">
        <h1 className="text-6xl font-extrabold animate-pulse">
          SHOWER HEAD MIC
        </h1>
        <p className="mt-6 text-gray-300">{instruction}</p>
      </section>

      <section className="py-24 px-6 bg-black text-center">
        {recording && (
          <div className="mb-6">
            <Activity className="animate-pulse text-red-500 mx-auto" size={32} />
            <p className="text-2xl font-bold">{liveFrequency} Hz</p>
          </div>
        )}

        <button
          onClick={recording ? stopRecording : startRecording}
          className={`px-8 py-4 rounded-2xl font-semibold ${
            recording ? "bg-red-500" : "bg-white text-black"
          }`}
        >
          <Mic /> {recording ? "Stop" : "Start"}
        </button>
      </section>

      <footer className="py-10 text-center text-gray-500 bg-black">
        © 2025 NoteHeads
      </footer>
    </div>
  );
}
