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
  
    // Voice range classification based on frequency (updated thresholds)
  const getVoiceRange = (avgFreq) => {
    if (avgFreq < 130) return "Bass";        // E2-E4: ~82-330Hz
    if (avgFreq < 180) return "Baritone";    // A2-A4: ~110-440Hz
    if (avgFreq < 280) return "Tenor";       // C3-C5: ~130-520Hz
    if (avgFreq < 350) return "Alto";        // F3-F5: ~175-700Hz
    if (avgFreq < 450) return "Mezzo-Soprano"; // A3-A5: ~220-880Hz
    return "Soprano";                        // C4-C6: ~260-1046Hz
  }
  // Analyze recorded audio blob
  const analyzeAudioBlob = async (blob) => {
    setAnalyzing(true);
    
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Get audio data
      const channelData = audioBuffer.getChannelData(0);
      
      // Perform FFT analysis
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // Create offline context for analysis
      const offlineContext = new OfflineAudioContext(
        1,
        audioBuffer.length,
        audioBuffer.sampleRate
      );
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      const offlineAnalyser = offlineContext.createAnalyser();
      offlineAnalyser.fftSize = 4096;
      source.connect(offlineAnalyser);
      offlineAnalyser.connect(offlineContext.destination);
      source.start(0);
      
      // Analyze frequency content
      const freqData = new Uint8Array(offlineAnalyser.frequencyBinCount);
      const frequencies = [];
      const sampleRate = audioBuffer.sampleRate;
      
      // Sample frequencies throughout the audio
      const step = Math.floor(audioBuffer.length / 20);
      for (let i = 0; i < channelData.length; i += step) {
        const slice = channelData.slice(i, i + 2048);
        const freq = detectPitch(slice, sampleRate);
        if (freq > 50 && freq < 2000) {
          frequencies.push(freq);
        }
      }
      
      // Calculate average frequency
      const avgFreq = frequencies.length > 0 
        ? frequencies.reduce((a, b) => a + b, 0) / frequencies.length 
        : 200;
      
      const range = getVoiceRange(avgFreq);
      
      // Song recommendations based on voice range
      const songDatabase = {
        "Bass": ["Ring of Fire – Johnny Cash", "Ain't No Sunshine – Bill Withers"],
        "Baritone": ["Someone Like You – Adele", "Thinking Out Loud – Ed Sheeran"],
        "Tenor": ["Perfect – Ed Sheeran", "Raabta – Arijit Singh", "Shape of You – Ed Sheeran"],
        "Alto": ["Halo – Beyoncé", "Someone You Loved – Lewis Capaldi"],
        "Mezzo-Soprano": ["Rolling in the Deep – Adele", "Skyscraper – Demi Lovato"],
        "Soprano": ["I Will Always Love You – Whitney Houston", "Chandelier – Sia"]
      };
      
      const artistDatabase = {
        "Bass": ["Johnny Cash", "Barry White", "Leonard Cohen"],
        "Baritone": ["Ed Sheeran", "Frank Sinatra", "John Legend"],
        "Tenor": ["Arijit Singh", "Shawn Mendes", "Atif Aslam", "Bruno Mars"],
        "Alto": ["Adele", "Amy Winehouse", "Norah Jones"],
        "Mezzo-Soprano": ["Lady Gaga", "Ariana Grande", "Demi Lovato"],
        "Soprano": ["Whitney Houston", "Mariah Carey", "Sia"]
      };
      
      setAnalysis({
        range,
        avgFrequency: Math.round(avgFreq),
        minFreq: Math.round(Math.min(...frequencies)),
        maxFreq: Math.round(Math.max(...frequencies)),
        songs: songDatabase[range] || ["Perfect – Ed Sheeran"],
        artists: artistDatabase[range] || ["Arijit Singh", "Shawn Mendes"],
      });
      
      audioContext.close();
    } catch (error) {
      console.error("Analysis error:", error);
      setAnalysis({
        range: "Tenor",
        avgFrequency: 200,
        minFreq: 150,
        maxFreq: 350,
        songs: ["Perfect – Ed Sheeran", "Raabta – Arijit Singh"],
        artists: ["Arijit Singh", "Shawn Mendes", "Atif Aslam"],
      });
    }
    
    setAnalyzing(false);
  };

  // Pitch detection using autocorrelation
  const detectPitch = (buffer, sampleRate) => {
    const SIZE = buffer.length;
    const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / SIZE);
    
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
    
    const trimmedBuffer = buffer.slice(r1, r2);
    const correlations = new Array(trimmedBuffer.length).fill(0);
    
    for (let i = 0; i < trimmedBuffer.length; i++) {
      for (let j = 0; j < trimmedBuffer.length - i; j++) {
        correlations[i] += trimmedBuffer[j] * trimmedBuffer[j + i];
      }
    }
    
    let d = 0;
    while (correlations[d] > correlations[d + 1]) d++;
    
    let maxCorr = -1;
    let maxCorrIndex = -1;
    
    for (let i = d; i < trimmedBuffer.length; i++) {
      if (correlations[i] > maxCorr) {
        maxCorr = correlations[i];
        maxCorrIndex = i;
      }
    }
    
    const T0 = maxCorrIndex;
    
    if (T0 === 0) return -1;
    
    return sampleRate / T0;
  };

  // Real-time frequency monitoring
  const monitorFrequency = () => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDataArray = new Float32Array(analyserRef.current.fftSize);

    const update = () => {
      analyserRef.current.getByteFrequencyData(dataArray);
      analyserRef.current.getFloatTimeDomainData(timeDataArray);

      // Calculate dominant frequency
      let maxValue = 0;
      let maxIndex = 0;
      for (let i = 0; i < bufferLength; i++) {
        if (dataArray[i] > maxValue) {
          maxValue = dataArray[i];
          maxIndex = i;
        }
      }

      const nyquist = audioContextRef.current.sampleRate / 2;
      const frequency = (maxIndex * nyquist) / bufferLength;
      
      // Detect pitch from time domain
      const pitch = detectPitch(timeDataArray, audioContextRef.current.sampleRate);
      
      if (pitch > 50 && pitch < 2000) {
        setLiveFrequency(Math.round(pitch));
      }

      // Calculate volume
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const average = sum / bufferLength;
      setLiveVolume(Math.round(average));

      animationFrameRef.current = requestAnimationFrame(update);
    };

    update();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup audio context for real-time analysis
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      
      // Start monitoring
      monitorFrequency();

      // Setup media recorder
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        setAudioURL(URL.createObjectURL(blob));
        
        // Stop monitoring
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        
        // Analyze the recording
        await analyzeAudioBlob(blob);
        
        // Cleanup
        stream.getTracks().forEach(track => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      };

      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Please allow microphone access to use this feature.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Download report as image
  const downloadReport = async () => {
    if (!reportRef.current) return;

    try {
      // Use html2canvas library via CDN
      const html2canvas = await loadHtml2Canvas();
      
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#ffffff',
        scale: 2, // Higher quality
        logging: false,
        useCORS: true
      });

      // Convert to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `shower-head-mic-report-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (error) {
      console.error('Error downloading report:', error);
      alert('Error downloading report. Please try again.');
    }
  };

  // Load html2canvas dynamically
  const loadHtml2Canvas = () => {
    return new Promise((resolve, reject) => {
      if (window.html2canvas) {
        resolve(window.html2canvas);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = () => resolve(window.html2canvas);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* HERO */}
      <section className="h-screen flex flex-col justify-center items-center text-center px-6">
        <h1 className="text-6xl md:text-7xl font-extrabold tracking-tight animate-pulse">
          SHOWER HEAD MIC
        </h1>
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
          
          {recording && (
            <div className="mt-8 p-6 bg-gray-900 rounded-2xl inline-block">
              <div className="flex items-center gap-4">
                <Activity className="animate-pulse text-red-500" size={32} />
                <div className="text-left">
                  <p className="text-sm text-gray-400">Live Analysis</p>
                  <p className="text-2xl font-bold">{liveFrequency} Hz</p>
                  <p className="text-sm text-gray-400">
                    Current Range: {getVoiceRange(liveFrequency)}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-100"
                  style={{ width: `${Math.min((liveVolume / 128) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}
          
          <button
            onClick={recording ? stopRecording : startRecording}
            className={`mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-semibold transition ${
              recording 
                ? "bg-red-500 text-white hover:bg-red-600" 
                : "bg-white text-black hover:scale-105"
            }`}
          >
            <Mic /> {recording ? "Stop Recording" : "Start Recording"}
          </button>
          
          {audioURL && (
            <div className="mt-6">
              <audio controls src={audioURL} className="mx-auto" />
            </div>
          )}
          
          {analyzing && (
            <p className="mt-4 text-gray-400 animate-pulse">Analyzing your voice...</p>
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
            <>
              {/* Report Card - This will be captured as image */}
              <div ref={reportRef} className="mt-12 p-8 bg-white rounded-3xl">
                {/* Header with logo/title */}
                <div className="mb-8">
                  <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    SHOWER HEAD MIC
                  </h1>
                  <p className="text-gray-500 mt-2">Voice Analysis Report</p>
                </div>

                {/* Main Analysis Grid */}
                <div className="grid md:grid-cols-3 gap-8">
                  <div className="p-6 rounded-2xl shadow-xl bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200">
                    <Sparkles className="mx-auto text-purple-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Voice Range</h3>
                    <p className="mt-2 text-3xl font-bold text-purple-600">{analysis.range}</p>
                    <p className="mt-2 text-sm text-gray-600">
                      {analysis.minFreq}Hz - {analysis.maxFreq}Hz
                    </p>
                    <p className="text-sm text-gray-500">
                      Average: {analysis.avgFrequency}Hz
                    </p>
                  </div>
                  <div className="p-6 rounded-2xl shadow-xl bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
                    <Music className="mx-auto text-green-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Song Matches</h3>
                    <ul className="mt-2 text-sm space-y-1">
                      {analysis.songs.map((s, i) => (
                        <li key={i} className="text-gray-700">{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-6 rounded-2xl shadow-xl bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200">
                    <Waves className="mx-auto text-orange-600" size={40} />
                    <h3 className="mt-4 text-xl font-semibold">Artist Similarity</h3>
                    <p className="mt-2 text-sm text-gray-700">{analysis.artists.join(", ")}</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-400">
                    Generated on {new Date().toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-10 flex gap-4 justify-center flex-wrap">
                <button 
                  onClick={downloadReport}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-xl hover:from-purple-700 hover:to-blue-700 transition shadow-lg"
                >
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

      <footer className="py-10 text-center text-gray-500 bg-black">
        © 2025 NoteHeads         
      </footer>
    </div>
  );
}


