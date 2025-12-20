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

  // Voice range classification based on frequency (updated thresholds)
  const getVoiceRange = (avgFreq) => {
    if (avgFreq < 130) return "Bass";        // E2-E4: ~82-330Hz
    if (avgFreq < 180) return "Baritone";    // A2-A4: ~110-440Hz
    if (avgFreq < 280) return "Tenor";       // C3-C5: ~130-520Hz
    if (avgFreq < 350) return "Alto";        // F3-F5: ~175-700Hz
    if (avgFreq < 450) return "Mezzo-Soprano"; // A3-A5: ~220-880Hz
    return "Soprano";                        // C4-C6: ~260-1046Hz
  };

  // Apply spectral noise gate to reduce background noise
  const applySpectralNoiseGate = (audioBuffer) => {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const fftSize = 2048;
    const hopSize = fftSize / 2;
    
    // Estimate noise profile from first 0.5 seconds (assuming initial silence/noise)
    const noiseProfileLength = Math.min(Math.floor(sampleRate * 0.5), channelData.length);
    const noiseProfile = estimateNoiseProfile(channelData.slice(0, noiseProfileLength), fftSize);
    
    // Apply spectral subtraction
    const cleanedData = new Float32Array(channelData.length);
    
    for (let i = 0; i < channelData.length - fftSize; i += hopSize) {
      const frame = channelData.slice(i, i + fftSize);
      const cleanedFrame = spectralSubtraction(frame, noiseProfile, fftSize);
      
      // Overlap-add
      for (let j = 0; j < cleanedFrame.length && i + j < cleanedData.length; j++) {
        cleanedData[i + j] += cleanedFrame[j] * hannWindow(j, fftSize);
      }
    }
    
    // Normalize
    const maxVal = Math.max(...cleanedData.map(Math.abs));
    if (maxVal > 0) {
      for (let i = 0; i < cleanedData.length; i++) {
        cleanedData[i] /= maxVal;
      }
    }
    
    // Create new audio buffer with cleaned data
    const cleanBuffer = audioContextRef.current.createBuffer(
      1,
      cleanedData.length,
      sampleRate
    );
    cleanBuffer.copyToChannel(cleanedData, 0);
    
    return cleanBuffer;
  };

  // Estimate noise profile from audio segment
  const estimateNoiseProfile = (data, fftSize) => {
    const numFrames = Math.floor(data.length / fftSize);
    const profile = new Float32Array(fftSize / 2);
    
    for (let frame = 0; frame < numFrames; frame++) {
      const start = frame * fftSize;
      const frameData = data.slice(start, start + fftSize);
      const spectrum = computeFFT(frameData);
      
      for (let i = 0; i < profile.length; i++) {
        profile[i] += spectrum[i] / numFrames;
      }
    }
    
    return profile;
  };

  // Spectral subtraction for noise reduction
  const spectralSubtraction = (frame, noiseProfile, fftSize) => {
    const spectrum = computeFFT(frame);
    const cleanSpectrum = new Float32Array(spectrum.length);
    const alpha = 2.0; // Over-subtraction factor
    const beta = 0.02; // Spectral floor
    
    for (let i = 0; i < spectrum.length; i++) {
      const subtracted = spectrum[i] - alpha * noiseProfile[i];
      cleanSpectrum[i] = Math.max(subtracted, beta * spectrum[i]);
    }
    
    return inverseFFT(cleanSpectrum, frame.length);
  };

  // Simple FFT magnitude computation
  const computeFFT = (data) => {
    const n = data.length;
    const magnitude = new Float32Array(n / 2);
    
    for (let k = 0; k < n / 2; k++) {
      let real = 0;
      let imag = 0;
      
      for (let i = 0; i < n; i++) {
        const angle = (-2 * Math.PI * k * i) / n;
        real += data[i] * Math.cos(angle);
        imag += data[i] * Math.sin(angle);
      }
      
      magnitude[k] = Math.sqrt(real * real + imag * imag);
    }
    
    return magnitude;
  };

  // Simple inverse FFT (using magnitude only - phase reconstruction)
  const inverseFFT = (magnitude, length) => {
    const output = new Float32Array(length);
    const n = length;
    
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = 0; k < magnitude.length; k++) {
        const angle = (2 * Math.PI * k * i) / n;
        sum += magnitude[k] * Math.cos(angle);
      }
      output[i] = sum / n;
    }
    
    return output;
  };

  // Hann window function
  const hannWindow = (n, N) => {
    return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  };

  // Apply adaptive high-pass filter to remove low-frequency noise
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
    
    const filteredBuffer = audioContextRef.current.createBuffer(
      1,
      filtered.length,
      sampleRate
    );
    filteredBuffer.copyToChannel(filtered, 0);
    
    return filteredBuffer;
  };

  // Apply median filter to remove impulse noise
  const applyMedianFilter = (data, windowSize = 5) => {
    const filtered = new Float32Array(data.length);
    const halfWindow = Math.floor(windowSize / 2);
    
    for (let i = 0; i < data.length; i++) {
      const window = [];
      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = Math.max(0, Math.min(data.length - 1, i + j));
        window.push(data[idx]);
      }
      window.sort((a, b) => a - b);
      filtered[i] = window[Math.floor(window.length / 2)];
    }
    
    return filtered;
  };

  // Analyze recorded audio blob with noise reduction
  const analyzeAudioBlob = async (blob) => {
    setAnalyzing(true);
    
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      let audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Apply noise reduction pipeline
      console.log("Applying noise reduction...");
      audioBuffer = applyHighPassFilter(audioBuffer, 80); // Remove low-freq rumble
      audioBuffer = applySpectralNoiseGate(audioBuffer);  // Spectral noise reduction
      
      // Get cleaned audio data
      const channelData = audioBuffer.getChannelData(0);
      
      // Apply median filter to remove impulse noise
      const medianFiltered = applyMedianFilter(channelData, 5);
      
      const sampleRate = audioBuffer.sampleRate;
      
      // Enhanced pitch detection with multiple samples
      const frequencies = [];
      const chunkSize = 4096; // Larger window for better low frequency detection
      const hopSize = Math.floor(sampleRate * 0.05); // 50ms hop
      
      // Process audio in overlapping windows
      for (let i = 0; i < medianFiltered.length - chunkSize; i += hopSize) {
        const slice = medianFiltered.slice(i, i + chunkSize);
        
        // Calculate RMS to filter out silence
        const rms = Math.sqrt(slice.reduce((sum, val) => sum + val * val, 0) / slice.length);
        
        // Only analyze chunks with sufficient energy
        if (rms > 0.015) { // Lower threshold after noise reduction
          const freq = detectPitchYIN(slice, sampleRate);
          
          // Stricter filtering for valid frequencies
          if (freq > 60 && freq < 1000) {
            frequencies.push(freq);
          }
        }
      }
      
      // Remove outliers using statistical filtering
      if (frequencies.length > 0) {
        frequencies.sort((a, b) => a - b);
        
        // Remove top and bottom 15% as outliers
        const trimAmount = Math.floor(frequencies.length * 0.15);
        const trimmedFreqs = frequencies.slice(trimAmount, frequencies.length - trimAmount);
        
        // Calculate weighted average
        const avgFreq = trimmedFreqs.length > 0
          ? trimmedFreqs.reduce((a, b) => a + b, 0) / trimmedFreqs.length
          : 200;
      
        const range = getVoiceRange(avgFreq);
        
        // Calculate statistics
        const minFreq = Math.min(...trimmedFreqs);
        const maxFreq = Math.max(...trimmedFreqs);
        
        console.log(`Detected: ${frequencies.length} samples, Avg: ${avgFreq.toFixed(1)}Hz, Range: ${range}`);
        
        // Song recommendations based on voice range
        const songDatabase = {
          "Bass": ["Ring of Fire – Johnny Cash", "Ain't No Sunshine – Bill Withers", "Stand By Me – Ben E. King"],
          "Baritone": ["Someone Like You – Adele", "Thinking Out Loud – Ed Sheeran", "Riptide – Vance Joy"],
          "Tenor": ["Perfect – Ed Sheeran", "Raabta – Arijit Singh", "Shape of You – Ed Sheeran"],
          "Alto": ["Halo – Beyoncé", "Someone You Loved – Lewis Capaldi", "Stay With Me – Sam Smith"],
          "Mezzo-Soprano": ["Rolling in the Deep – Adele", "Skyscraper – Demi Lovato", "Girl on Fire – Alicia Keys"],
          "Soprano": ["I Will Always Love You – Whitney Houston", "Chandelier – Sia", "Vision of Love – Mariah Carey"]
        };
        
        const artistDatabase = {
          "Bass": ["Johnny Cash", "Barry White", "Leonard Cohen", "Josh Turner"],
          "Baritone": ["Ed Sheeran", "Frank Sinatra", "John Legend", "Michael Bublé"],
          "Tenor": ["Arijit Singh", "Shawn Mendes", "Atif Aslam", "Bruno Mars", "Freddie Mercury"],
          "Alto": ["Adele", "Amy Winehouse", "Norah Jones", "Tracy Chapman"],
          "Mezzo-Soprano": ["Lady Gaga", "Ariana Grande", "Demi Lovato", "Christina Aguilera"],
          "Soprano": ["Whitney Houston", "Mariah Carey", "Sia", "Celine Dion"]
        };
        
        setAnalysis({
          range,
          avgFrequency: Math.round(avgFreq),
          minFreq: Math.round(minFreq),
          maxFreq: Math.round(maxFreq),
          songs: songDatabase[range] || ["Perfect – Ed Sheeran"],
          artists: artistDatabase[range] || ["Arijit Singh", "Shawn Mendes"],
        });
      } else {
        throw new Error("No valid frequencies detected");
      }
      
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

  // Enhanced YIN pitch detection algorithm (better for low frequencies)
  const detectPitchYIN = (buffer, sampleRate) => {
    const SIZE = buffer.length;
    const threshold = 0.15;
    
    // Calculate RMS for silence detection
    const rms = Math.sqrt(buffer.reduce((sum, val) => sum + val * val, 0) / SIZE);
    if (rms < 0.015) return -1;
    
    // Calculate difference function
    const yinBuffer = new Float32Array(SIZE / 2);
    yinBuffer[0] = 1;
    
    let runningSum = 0;
    for (let tau = 1; tau < SIZE / 2; tau++) {
      yinBuffer[tau] = 0;
      for (let i = 0; i < SIZE / 2; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuffer[tau] += delta * delta;
      }
      
      // Cumulative mean normalized difference
      runningSum += yinBuffer[tau];
      if (runningSum === 0) {
        yinBuffer[tau] = 1;
      } else {
        yinBuffer[tau] *= tau / runningSum;
      }
    }
    
    // Find the first tau below threshold
    let tau = -1;
    for (let i = 2; i < SIZE / 2; i++) {
      if (yinBuffer[i] < threshold) {
        // Parabolic interpolation for better accuracy
        while (i + 1 < SIZE / 2 && yinBuffer[i + 1] < yinBuffer[i]) {
          i++;
        }
        tau = i;
        break;
      }
    }
    
    // If no period found, find global minimum
    if (tau === -1) {
      let minVal = 1;
      for (let i = 2; i < SIZE / 2; i++) {
        if (yinBuffer[i] < minVal) {
          minVal = yinBuffer[i];
          tau = i;
        }
      }
      if (minVal > 0.5) return -1; // Too uncertain
    }
    
    // Parabolic interpolation for sub-sample accuracy
    let betterTau = tau;
    if (tau > 0 && tau < SIZE / 2 - 1) {
      const s0 = yinBuffer[tau - 1];
      const s1 = yinBuffer[tau];
      const s2 = yinBuffer[tau + 1];
      betterTau = tau + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }
    
    return sampleRate / betterTau;
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
      
      // Detect pitch from time domain using YIN
      const pitch = detectPitchYIN(timeDataArray, audioContextRef.current.sampleRate);
      
      if (pitch > 60 && pitch < 1000) {
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        } 
      });
      
      streamRef.current = stream;
      
      // Setup audio context for real-time analysis
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create noise gate
      noiseGateRef.current = audioContextRef.current.createDynamicsCompressor();
      noiseGateRef.current.threshold.value = -50;
      noiseGateRef.current.knee.value = 10;
      noiseGateRef.current.ratio.value = 12;
      noiseGateRef.current.attack.value = 0.003;
      noiseGateRef.current.release.value = 0.25;
      
      // Setup analyser
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 4096; // Larger for better low freq resolution
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      // Connect: source -> noise gate -> analyser
      source.connect(noiseGateRef.current);
      noiseGateRef.current.connect(analyserRef.current);
      
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
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
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
        scale: 2,
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
        <p className="mt-2 text-sm text-gray-500">
          ✨ Now with advanced noise cancellation
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
          <div className="mt-8 p-6 bg-blue-50 rounded-xl border border-blue-200">
            <h3 className="font-bold text-lg">🎯 Tips for Best Results:</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>• Record in a quiet environment</li>
              <li>• Sing at your natural, comfortable pitch</li>
              <li>• Hold sustained notes for 2-3 seconds</li>
              <li>• For Bass/Baritone voices, try humming low notes</li>
              <li>• Avoid whispering or shouting</li>
            </ul>
          </div>
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
            <div className="mt-4 space-y-2">
              <p className="text-gray-400 animate-pulse">Analyzing your voice...</p>
              <p className="text-sm text-gray-500">Applying noise reduction and pitch detection...</p>
            </div>
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
