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
  const noiseGateRef = useRef(null);
  const streamRef = useRef(null);

  const getVoiceRange = (avgFreq) => {
    if (avgFreq < 130) return "Bass";
    if (avgFreq < 180) return "Baritone";
    if (avgFreq < 280) return "Tenor";
    if (avgFreq < 350) return "Alto";
    if (avgFreq < 450) return "Mezzo-Soprano";
    return "Soprano";
  };

  // Optimized YIN Pitch Detection (Fast & Accurate)
  const detectPitchYIN = (buffer, sampleRate) => {
    const SIZE = buffer.length;
    const threshold = 0.15;
    const yinBuffer = new Float32Array(SIZE / 2);

    // Step 1: Difference Function
    for (let tau = 1; tau < SIZE / 2; tau++) {
      for (let i = 0; i < SIZE / 2; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuffer[tau] += delta * delta;
      }
    }

    // Step 2: Cumulative Mean Normalized Difference
    let runningSum = 0;
    yinBuffer[0] = 1;
    for (let tau = 1; tau < SIZE / 2; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] *= tau / (runningSum || 1);
    }

    // Step 3: Absolute Threshold
    let tau = -1;
    for (let i = 2; i < SIZE / 2; i++) {
      if (yinBuffer[i] < threshold) {
        while (i + 1 < SIZE / 2 && yinBuffer[i + 1] < yinBuffer[i]) {
          i++;
        }
        tau = i;
        break;
      }
    }

    if (tau === -1 || yinBuffer[tau] > 0.5) return -1;

    // Step 4: Parabolic Interpolation for sub-sample accuracy
    let betterTau = tau;
    if (tau > 0 && tau < SIZE / 2 - 1) {
      const s0 = yinBuffer[tau - 1];
      const s1 = yinBuffer[tau];
      const s2 = yinBuffer[tau + 1];
      betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0) || 1);
    }

    return sampleRate / betterTau;
  };

  const applyHighPassFilter = (buffer, cutoffFreq = 80) => {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const rc = 1.0 / (2 * Math.PI * cutoffFreq);
    const dt = 1.0 / sampleRate;
    const alpha = rc / (rc + dt);
    const filtered = new Float32Array(channelData.length);
    filtered[0] = channelData[0];
    for (let i = 1; i < channelData.length; i++) {
      filtered[i] = alpha * (filtered[i - 1] + channelData[i] - channelData[i - 1]);
    }
    const filteredBuffer = audioContextRef.current.createBuffer(1, filtered.length, sampleRate);
    filteredBuffer.copyToChannel(filtered, 0);
    return filteredBuffer;
  };

  const analyzeAudioBlob = async (blob) => {
    setAnalyzing(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Accuracy Boost: Filter out low frequency room rumble
      audioBuffer = applyHighPassFilter(audioBuffer, 85);
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      
      const frequencies = [];
      const chunkSize = 2048; 
      const hopSize = 1024; // 50% overlap for better resolution

      for (let i = 0; i < channelData.length - chunkSize; i += hopSize) {
        const slice = channelData.slice(i, i + chunkSize);
        
        // Calculate RMS (Volume)
        const rms = Math.sqrt(slice.reduce((sum, val) => sum + val * val, 0) / slice.length);
        
        // Calculate Zero Crossing Rate (Helps distinguish pitch from noise)
        let crossings = 0;
        for (let j = 1; j < slice.length; j++) {
          if ((slice[j] > 0 && slice[j-1] <= 0) || (slice[j] < 0 && slice[j-1] >= 0)) crossings++;
        }
        const zcr = crossings / slice.length;

        // VAD (Voice Activity Detection): Only analyze if loud enough and not "noisy" (hiss)
        if (rms > 0.02 && zcr < 0.15) {
          const freq = detectPitchYIN(slice, sampleRate);
          if (freq > 65 && freq < 1000) {
            frequencies.push(freq);
          }
        }
      }

      if (frequencies.length > 0) {
        frequencies.sort((a, b) => a - b);
        // Use Median for average to ignore outliers/glitches
        const avgFreq = frequencies[Math.floor(frequencies.length / 2)];
        const minFreq = frequencies[0];
        const maxFreq = frequencies[frequencies.length - 1];
        const range = getVoiceRange(avgFreq);

        // Comprehensive Song Database (Expanded)
        // Comprehensive Song Database (Expanded)
        const songDatabase = {
          "Bass": [
            "Ring of Fire – Johnny Cash",
            "Ain't No Sunshine – Bill Withers",
            "Stand By Me – Ben E. King",
            "Hurt – Johnny Cash",
            "Can't Help Falling in Love – Elvis Presley",
            "Lean On Me – Bill Withers",
            "Georgia On My Mind – Ray Charles",
            "What a Wonderful World – Louis Armstrong",
            "Take Me to Church – Hozier",
            "Unchained Melody – The Righteous Brothers"
          ],
          "Baritone": [
            "Someone Like You – Adele",
            "Thinking Out Loud – Ed Sheeran",
            "Riptide – Vance Joy",
            "Let Her Go – Passenger",
            "I'm Yours – Jason Mraz",
            "Fly Me to the Moon – Frank Sinatra",
            "All of Me – John Legend",
            "Budapest – George Ezra",
            "The Man – Taylor Swift",
            "Your Song – Elton John",
            "Stay – Rihanna ft. Mikky Ekko",
            "Photograph – Ed Sheeran"
          ],
          "Tenor": [
            "Perfect – Ed Sheeran",
            "Raabta – Arijit Singh",
            "Shape of You – Ed Sheeran",
            "Tum Hi Ho – Arijit Singh",
            "Treat You Better – Shawn Mendes",
            "Just the Way You Are – Bruno Mars",
            "Counting Stars – OneRepublic",
            "Senorita – Shawn Mendes",
            "Blinding Lights – The Weeknd",
            "Uptown Funk – Bruno Mars",
            "Channa Mereya – Arijit Singh",
            "Love Yourself – Justin Bieber"
          ],
          "Alto": [
            "Halo – Beyoncé",
            "Someone You Loved – Lewis Capaldi",
            "Stay With Me – Sam Smith",
            "Rolling in the Deep – Adele",
            "Make You Feel My Love – Adele",
            "Valerie – Amy Winehouse",
            "Fast Car – Tracy Chapman",
            "Jolene – Dolly Parton",
            "Ex's & Oh's – Elle King",
            "You Say – Lauren Daigle"
          ],
          "Mezzo-Soprano": [
            "Rolling in the Deep – Adele",
            "Skyscraper – Demi Lovato",
            "Girl on Fire – Alicia Keys",
            "Shallow – Lady Gaga",
            "Titanium – David Guetta ft. Sia",
            "Set Fire to the Rain – Adele",
            "Roar – Katy Perry",
            "Firework – Katy Perry",
            "Stone Cold – Demi Lovato",
            "Empire State of Mind – Alicia Keys",
            "Love Song – Sara Bareilles"
          ],
          "Soprano": [
            "I Will Always Love You – Whitney Houston",
            "Chandelier – Sia",
            "Vision of Love – Mariah Carey",
            "And I Am Telling You – Jennifer Hudson",
            "Run – Leona Lewis",
            "Listen – Beyoncé",
            "Greatest Love of All – Whitney Houston",
            "My Heart Will Go On – Celine Dion",
            "The Power of Love – Celine Dion",
            "Emotions – Mariah Carey",
            "I Have Nothing – Whitney Houston"
          ]
        };

        // Comprehensive Artist Database (Expanded)
        const artistDatabase = {
          "Bass": [
            "Johnny Cash", "Barry White", "Leonard Cohen", "Ray Charles", 
            "Bill Withers", "Louis Armstrong", "Isaac Hayes", "Hozier",
            "Elvis Presley", "Bing Crosby"
          ],
          "Baritone": [
            "Ed Sheeran", "Frank Sinatra", "John Legend", "Jason Mraz",
            "George Ezra", "Passenger", "Michael Bublé", "Sam Smith",
            "Elton John", "James Arthur", "Vance Joy", "Dean Lewis"
          ],
          "Tenor": [
            "Arijit Singh", "Shawn Mendes", "Bruno Mars", "Justin Bieber",
            "The Weeknd", "Charlie Puth", "Harry Styles", "Ryan Tedder",
            "Adam Levine", "Zayn Malik", "Sam Smith", "Troye Sivan"
          ],
          "Alto": [
            "Adele", "Amy Winehouse", "Tracy Chapman", "Norah Jones",
            "Lana Del Rey", "Billie Eilish", "Toni Braxton", "Lauren Daigle",
            "Dolly Parton", "Elle King", "Lorde", "Meghan Trainor"
          ],
          "Mezzo-Soprano": [
            "Lady Gaga", "Ariana Grande", "Demi Lovato", "Katy Perry",
            "Alicia Keys", "Pink", "Kelly Clarkson", "Sara Bareilles",
            "Christina Aguilera", "Miley Cyrus", "Jessie J", "Selena Gomez"
          ],
          "Soprano": [
            "Whitney Houston", "Mariah Carey", "Celine Dion", "Beyoncé",
            "Christina Aguilera", "Jennifer Hudson", "Leona Lewis", "Sia",
            "Idina Menzel", "Barbra Streisand", "Patti LaBelle", "Ariana Grande"
          ]
        };

        // Smart Selection: Pick diverse subset from database
        const selectRandomItems = (array, count) => {
          const shuffled = [...array].sort(() => Math.random() - 0.5);
          return shuffled.slice(0, count);
        };
        
        setAnalysis({
          range,
          avgFrequency: Math.round(avgFreq),
          minFreq: Math.round(minFreq),
          maxFreq: Math.round(maxFreq),
          songs: songDatabase[range] || ["Perfect – Ed Sheeran"],
          artists: artistDatabase[range] || ["Arijit Singh"],
        });
      }
      audioContext.close();
    } catch (error) {
      console.error("Analysis error:", error);
    }
    setAnalyzing(false);
  };

  const monitorFrequency = () => {
    if (!analyserRef.current) return;
    const timeDataArray = new Float32Array(analyserRef.current.fftSize);
    const update = () => {
      analyserRef.current.getFloatTimeDomainData(timeDataArray);
      const pitch = detectPitchYIN(timeDataArray, audioContextRef.current.sampleRate);
      if (pitch > 60 && pitch < 1000) {
        setLiveFrequency(Math.round(pitch));
      }
      // Simple volume check for the UI bar
      let sum = 0;
      for(let i=0; i<timeDataArray.length; i++) sum += timeDataArray[i] * timeDataArray[i];
      setLiveVolume(Math.sqrt(sum / timeDataArray.length) * 500); 

      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      source.connect(analyserRef.current);
      monitorFrequency();

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        setAudioURL(URL.createObjectURL(blob));
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        await analyzeAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (e) { alert("Mic access required"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const downloadReport = async () => {
    if (!reportRef.current) return;
    const loadHtml2Canvas = () => {
      return new Promise((resolve) => {
        if (window.html2canvas) return resolve(window.html2canvas);
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => resolve(window.html2canvas);
        document.head.appendChild(script);
      });
    };
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(reportRef.current, { scale: 2 });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `voice-report.png`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <section className="h-screen flex flex-col justify-center items-center text-center px-6">
        <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight animate-pulse">
          SHOWER HEAD MIC
        </h1>
        <p className="mt-6 max-w-xl text-gray-300 text-lg">
          Discover your voice range, song matches, and artist similarities — instantly.
        </p>
        <p className="mt-2 text-sm text-gray-500">✨ Now with advanced noise cancellation</p>
      </section>

      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center">How to use</h2>
          <ol className="mt-10 space-y-6 text-lg">
            <li><b>1.</b> Click <b>Start Recording</b> and allow microphone access.</li>
            <li><b>2.</b> Sing or hum comfortably for 5–10 seconds.</li>
            <li><b>3.</b> Click <b>Stop Recording</b>.</li>
            <li><b>4.</b> View your voice range, song suggestions, and artist matches.</li>
          </ol>
          <div className="mt-8 p-6 bg-blue-50 rounded-xl border border-blue-200">
            <h3 className="font-bold text-lg">🎯 Tips for Best Results:</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>• Record in a quiet environment</li>
              <li>• Sing at your natural, comfortable pitch</li>
              <li>• Hold sustained notes for 2-3 seconds</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-black">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl font-bold">Record your voice</h2>
          {recording && (
            <div className="mt-8 p-6 bg-gray-900 rounded-2xl inline-block">
              <div className="flex items-center gap-4">
                <Activity className="animate-pulse text-red-500" size={32} />
                <div className="text-left">
                  <p className="text-sm text-gray-400">Live Analysis</p>
                  <p className="text-2xl font-bold">{liveFrequency} Hz</p>
                  <p className="text-sm text-gray-400">Current Range: {getVoiceRange(liveFrequency)}</p>
                </div>
              </div>
              <div className="mt-4 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-100" style={{ width: `${Math.min(liveVolume, 100)}%` }} />
              </div>
            </div>
          )}
          <button onClick={recording ? stopRecording : startRecording} className={`mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-semibold transition ${recording ? "bg-red-500 text-white hover:bg-red-600" : "bg-white text-black hover:scale-105"}`}>
            <Mic /> {recording ? "Stop Recording" : "Start Recording"}
          </button>
          {audioURL && <div className="mt-6"><audio controls src={audioURL} className="mx-auto" /></div>}
          {analyzing && <div className="mt-4 space-y-2"><p className="text-gray-400 animate-pulse">Analyzing your voice...</p></div>}
        </div>
      </section>

      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold">Your Voice Report</h2>
          {!analysis && <p className="mt-6 text-gray-500">Record to generate your report</p>}
          {analysis && (
            <>
              <div ref={reportRef} className="mt-12 p-8 bg-white rounded-3xl shadow-2xl">
                <div className="mb-8">
                  <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">SHOWER HEAD MIC</h1>
                  <p className="text-gray-500 mt-2">Voice Analysis Report</p>
                </div>
                <div className="grid md:grid-cols-3 gap-8">
                  <div className="p-6 rounded-2xl shadow-xl bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200">
                    <Sparkles className="mx-auto text-purple-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Voice Range</h3>
                    <p className="mt-2 text-3xl font-bold text-purple-600">{analysis.range}</p>
                    <p className="mt-2 text-sm text-gray-600">{analysis.minFreq}Hz - {analysis.maxFreq}Hz</p>
                  </div>
                  <div className="p-6 rounded-2xl shadow-xl bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
                    <Music className="mx-auto text-green-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Song Matches</h3>
                    <ul className="mt-2 text-sm space-y-1">{analysis.songs.map((s, i) => <li key={i} className="text-gray-700">{s}</li>)}</ul>
                  </div>
                  <div className="p-6 rounded-2xl shadow-xl bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200">
                    <Waves className="mx-auto text-orange-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Artist Similarity</h3>
                    <p className="mt-2 text-sm text-gray-700">{analysis.artists.join(", ")}</p>
                  </div>
                </div>
              </div>
              <div className="mt-10 flex gap-4 justify-center flex-wrap">
                <button onClick={downloadReport} className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition shadow-lg">
                  <Download size={20} /> Download Report
                </button>
                <button className="inline-flex items-center gap-2 border-2 border-black px-6 py-3 rounded-xl hover:bg-black hover:text-white transition">
                  <Share2 /> Share Report Card
                </button>
              </div>
            </>
          )}
        </div>
      </section>
      <footer className="py-10 text-center text-gray-500 bg-black">© 2025 NoteHeads</footer>
    </div>
  );
}
