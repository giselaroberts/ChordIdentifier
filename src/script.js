// === Initialization ===
const button = document.getElementById('start');
const canvas = document.getElementById('oscilloscope');
const ctx = canvas.getContext('2d');
const chordLabel = document.getElementById('chordLabel'); // use existing node

const NOTE_NAMES = ["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"];

let audioCtx, analyser, source;
let essentia = null; 
window.onload = () => {
  EssentiaWASM().then(wasModule => {
    essentia = new Essentia(wasModule,false)
  })
}  
// instance (NOT the class)
let isEssentiaReady = false;   // gate any audio work until ready

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// === Start microphone ===
button.onclick = async () => {

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  source = audioCtx.createMediaStreamSource(stream);

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 4096; // power of 2; larger → better freq resolution
  source.connect(analyser);

  draw();              // start the render loop
  processAudioFrame(); // start analysis loop
};

// === Draw visualization (HPCP bars) ===
function draw(pcp) {
  requestAnimationFrame(() => draw(pcp));

  ctx.fillStyle = "#0b0e12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!pcp) return;

  const barWidth = canvas.width / 12;
  ctx.fillStyle = "#fff";
  ctx.font = "12px system-ui";

  for (let i = 0; i < 12; i++) {
    const h = pcp[i] * canvas.height * 3; // scale up for visibility
    ctx.fillStyle = `hsl(${i * 30}, 100%, 60%)`;
    ctx.fillRect(i * barWidth + 2, canvas.height - h, barWidth - 4, h);

    ctx.fillStyle = "#ddd";
    ctx.fillText(NOTE_NAMES[i], i * barWidth + barWidth/2 - 10, canvas.height - 8);
  }
}

// === Core Essentia analysis loop (instance methods) ===
async function processAudioFrame() {

  // 1) Get a time-domain frame from Web Audio
  const N = analyser.fftSize;
  const timeData = new Float32Array(N);

  if (analyser.getFloatTimeDomainData) {
    analyser.getFloatTimeDomainData(timeData);
  } else {
    // Fallback for older browsers
    const bytes = new Uint8Array(N);
    analyser.getByteTimeDomainData(bytes);
    for (let i = 0; i < N; i++) timeData[i] = (bytes[i] - 128) / 128.0;
  }

  // 2) Convert to Essentia vector
  const frameVec = essentia.arrayToVector(timeData);

  // 3) Window → Spectrum → Peaks → Whitening → HPCP
  // Windowing returns an object with { frame }
  const windowOut = essentia.Windowing(frameVec, true, N, "blackmanharris62");
  // Spectrum returns { spectrum }
  const spectrumOut = essentia.Spectrum(windowOut.frame, N);

  // Peaks: (spectrum, minFreq, maxFreq, maxPeaks, magnitudeThreshold, orderBy, sampleRate)
  const peaksOut = essentia.SpectralPeaks(
    spectrumOut.spectrum,
    0,             // min freq
    4000,          // max freq (guitar-ish)
    100,           // max peaks
    60,            // mag threshold (dB)
    "frequency",   // orderBy
    audioCtx.sampleRate
  );

  // Whitening: (spectrum, peakFreqs, peakMags, maxFreq, sr)
  const whiteningOut = essentia.SpectralWhitening(
    spectrumOut.spectrum,
    peaksOut.frequencies,
    peaksOut.magnitudes,
    4000,
    audioCtx.sampleRate
  );

  // HPCP: (peakFreqs, magnitudes, ... many params ...)
  const hpcpOut = essentia.HPCP(
    peaksOut.frequencies,
    whiteningOut.magnitudes,
    true,          // normalized
    500,           // referenceFrequencyWeight (Hz)
    0,             // minFrequency
    4000,          // maxFrequency
    false,         // bandPreset
    60,            // minSpectralWindow
    true,          // nonLinear
    "unitMax",     // windowSize
    440,           // A4
    audioCtx.sampleRate,
    12             // numberBands (bins)
  );

  const hpcpArray = essentia.vectorToArray(hpcpOut.hpcp);

  // 4) Visualize HPCP
  draw(hpcpArray);

  // 5) Chord detection expects a VectorVectorFloat of HPCP frames
  const hpcpPool = new essentia.module.VectorVectorFloat();
  hpcpPool.push_back(hpcpOut.hpcp);

  // Signature: (hpcpFrames, frameSize?, sampleRate?)
  const chordDetect = essentia.ChordsDetection(
    hpcpPool,
    N,                  // use analyser.fftSize as frameSize proxy
    audioCtx.sampleRate // SR
  );

  // Results are std::vectors; access with .get(0)
  const chord = chordDetect.chords.size() > 0 ? chordDetect.chords.get(0) : null;
  const strength = chordDetect.strength.size() > 0 ? chordDetect.strength.get(0) : 0;

  // 6) Update UI (simple thresholding for stability)
  if (chord && strength > 0.6) {
    chordLabel.textContent = `🎵 ${chord}  (${strength.toFixed(2)})`;
  } else {
    chordLabel.textContent = `🎵 … (${strength.toFixed(2)})`;
  }

  // 7) Loop
  setTimeout(processAudioFrame, 200);
}
