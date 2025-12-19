import { useState, useRef } from "react";
import { Mic, Music, Sparkles, Waves, Download } from "lucide-react";
import { motion } from "framer-motion";

// Lightweight UI components (no shadcn needed)
const Card = ({ children, className }) => (
  <div className={`rounded-2xl shadow-xl ${className}`}>{children}</div>
);

const CardContent = ({ children, className }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

const Button = ({ children, className, ...props }) => (
  <button
    className={`rounded-2xl px-6 py-4 font-semibold transition hover:scale-105 ${className}`}
    {...props}
  >
    {children}
  </button>
);

export default function ShowerHeadMic() {
  const [recording, setRecording] = useState(false);
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
      audioChunksRef.current = [];
      runVoiceAnalysis();
    };

    mediaRecorderRef.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const runVoiceAnalysis = () => {
    setTimeout(() => {
      setAnalysis({
        range: "Tenor",
        lowest: "A2",
        highest: "E4",
        stability: "78%",
        songs: ["Perfect – Ed Sheeran", "Raabta – Arijit Singh"],
        artists: ["Arijit Singh", "Shawn Mendes", "Atif Aslam"],
      });
    }, 1500);
  };

  const downloadReport = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* HERO */}
      <section className="h-screen flex flex-col items-center justify-center text-center px-6">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-6xl md:text-7xl font-extrabold"
        >
          SHOWER HEAD MIC
        </motion.h1>
        <p className="mt-6 max-w-xl text-gray-300 text-lg">
          Turn your bathroom concerts into vocal intelligence.
          <br />Record. Analyse. Discover your sound.
        </p>
      </section>

      {/* RECORD */}
      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold">Record your voice</h2>
          <Button
            onClick={recording ? stopRecording : startRecording}
            className="mt-8 bg-black text-white"
          >
            <Mic className="inline mr-2" />
            {recording ? "Stop Recording" : "Start Recording"}
          </Button>
        </div>
      </section>

      {/* ANALYSIS */}
      <section className="py-24 px-6 bg-black">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-bold">Voice Report Card</h2>

          {!analysis && (
            <p className="mt-6 text-gray-400">Record to unlock your vocal profile</p>
          )}

          {analysis && (
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <Card className="bg-white text-black">
                <CardContent>
                  <Sparkles />
                  <h3 className="mt-3 font-semibold">Vocal Range</h3>
                  <p>{analysis.range}</p>
                  <p className="text-sm text-gray-600">
                    {analysis.lowest} – {analysis.highest}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-white text-black">
                <CardContent>
                  <Waves />
                  <h3 className="mt-3 font-semibold">Stability</h3>
                  <p>{analysis.stability}</p>
                </CardContent>
              </Card>

              <Card className="bg-white text-black">
                <CardContent>
                  <Music />
                  <h3 className="mt-3 font-semibold">Song Matches</h3>
                  <ul className="text-sm">
                    {analysis.songs.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}

          {analysis && (
            <Button
              onClick={downloadReport}
              className="mt-10 bg-white text-black"
            >
              <Download className="inline mr-2" /> Download Report Card
            </Button>
          )}
        </div>
      </section>

      <footer className="py-10 text-center text-gray-500">
        © 2025 Shower Head Mic
      </footer>
    </div>
  );
}
