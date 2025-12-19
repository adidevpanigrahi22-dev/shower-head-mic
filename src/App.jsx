// FULL FROM-SCRATCH VERSION — SHOWER HEAD MIC
// Advanced UI + Tailwind + Real Mic Recording (analysis mocked)

import { useState, useRef } from "react";
import { Mic, Music, Sparkles, Waves, Share2 } from "lucide-react";
import { motion } from "framer-motion";

export default function App() {
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorderRef.current = new MediaRecorder(stream);

    mediaRecorderRef.current.ondataavailable = (e) => {
      audioChunksRef.current.push(e.data);
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      setAudioURL(URL.createObjectURL(blob));
      audioChunksRef.current = [];
      runFakeAnalysis();
    };

    mediaRecorderRef.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const runFakeAnalysis = () => {
    setTimeout(() => {
      setAnalysis({
        range: "Tenor",
        songs: ["Perfect – Ed Sheeran", "Raabta – Arijit Singh"],
        artists: ["Arijit Singh", "Shawn Mendes", "Atif Aslam"],
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* HERO */}
      <section className="h-screen flex flex-col justify-center items-center text-center px-6">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-6xl md:text-7xl font-extrabold tracking-tight"
        >
          SHOWER HEAD MIC
        </motion.h1>
        <p className="mt-6 max-w-xl text-gray-300 text-lg">
          Discover your voice range, song matches, and artist similarities — instantly.
        </p>
      </section>

      {/* HOW TO USE */}
      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center">How to use</h2>
          <ol className="mt-10 space-y-6 text-lg">
            <li><b>1.</b> Click <b>Start Recording</b> and allow microphone access.</li>
            <li><b>2.</b> Sing or hum comfortably for 5–10 seconds.</li>
            <li><b>3.</b> Click <b>Stop Recording</b>.</li>
            <li><b>4.</b> View your voice range, song suggestions, and artist matches.</li>
          </ol>
        </div>
      </section>

      {/* RECORD */}
      <section className="py-24 px-6 bg-black">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-bold">Record your voice</h2>
          <button
            onClick={recording ? stopRecording : startRecording}
            className="mt-8 inline-flex items-center gap-2 bg-white text-black px-8 py-4 rounded-2xl text-lg font-semibold hover:scale-105 transition"
          >
            <Mic /> {recording ? "Stop Recording" : "Start Recording"}
          </button>
          {audioURL && (
            <audio controls src={audioURL} className="mx-auto mt-6" />
          )}
        </div>
      </section>

      {/* ANALYSIS */}
      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold">Your Voice Report</h2>

          {!analysis && (
            <p className="mt-6 text-gray-500">Record to generate your report</p>
          )}

          {analysis && (
            <div className="mt-12 grid md:grid-cols-3 gap-8">
              <div className="p-6 rounded-2xl shadow-xl">
                <Sparkles className="mx-auto" />
                <h3 className="mt-4 text-xl font-semibold">Voice Range</h3>
                <p className="mt-2">{analysis.range}</p>
              </div>
              <div className="p-6 rounded-2xl shadow-xl">
                <Music className="mx-auto" />
                <h3 className="mt-4 text-xl font-semibold">Song Matches</h3>
                <ul className="mt-2 text-sm">
                  {analysis.songs.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="p-6 rounded-2xl shadow-xl">
                <Waves className="mx-auto" />
                <h3 className="mt-4 text-xl font-semibold">Artist Similarity</h3>
                <p className="mt-2">{analysis.artists.join(", ")}</p>
              </div>
            </div>
          )}

          {analysis && (
            <button className="mt-10 inline-flex items-center gap-2 border border-black px-6 py-3 rounded-xl hover:bg-black hover:text-white transition">
              <Share2 /> Share Report Card
            </button>
          )}
        </div>
      </section>

      <footer className="py-10 text-center text-gray-500 bg-black">
        © 2025 Shower Head Mic
      </footer>
    </div>
  );
}
