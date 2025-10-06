const button = document.getElementById('start');
const canvas = document.getElementById('oscilloscope');
const ctx = canvas.getContext('2d');
const NOTE_NAMES = ["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"];
const A4 = 440; // reference frequency


let audioCtx;
let analyser;
let dataArray;
let bufferLength;
let source;

let essentia;
button.disabled = true;
EssentiaWASM().then(EssentiaModule => {
  essentia = new EssentiaModule.Essentia();
  console.log("Essentia.js ready!");
  button.disabled = false;
});


function freqToMidi(f) {
  return 69 + 12 * Math.log2(f / A4); // convert Hz → MIDI note number
}

function midiToPitchClass(midi) {
  return ((Math.round(midi) % 12) + 12) % 12; // 0..11
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

button.onclick = async () => {
  // 1️⃣ Create an audio context
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  // 2️⃣ Ask for microphone
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  source = audioCtx.createMediaStreamSource(stream);

  // 3️⃣ Create an AnalyserNode to inspect the audio
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048; // smaller size = faster updates
  bufferLength = analyser.fftSize;
  dataArray = new Uint8Array(bufferLength);

  // 4️⃣ Connect: mic → analyser → speakers (optional)
  source.connect(analyser);
  // analyser.connect(audioCtx.destination); // uncomment to hear through speakers

  // 5️⃣ Start drawing
  draw();
};

function draw() {
  requestAnimationFrame(draw);

  if (!essentia) return; // wait until Essentia.js is ready

  // 1️⃣ Get a short PCM frame (time-domain)
  const frame = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(frame);

  // 2️⃣ Convert to an Essentia vector
  const vec = essentia.arrayToVector(frame);

  // 3️⃣ Compute spectrum & spectral peaks
  const windowed = essentia.Windowing(vec);
  const spectrum = essentia.Spectrum(windowed);
  const peaks = essentia.SpectralPeaks(spectrum);

  // 4️⃣ Compute HPCP (12-bin chroma)
  const hpcp = essentia.HPCP(
    peaks.frequencies,
    peaks.magnitudes,
    12,   // number of bins
    440,  // reference frequency (A4)
    8,    // number of harmonics
    false // non-linear weighting
  );

  // 5️⃣ Convert Essentia's vector back to JS array
  const pcp = essentia.vectorToArray(hpcp);

  // 6️⃣ Draw the bars (same visualization)
  ctx.fillStyle = "#0b0e12";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const barWidth = canvas.width / 12;
  for (let i = 0; i < 12; i++) {
    const h = pcp[i] * canvas.height * 3;
    ctx.fillStyle = `hsl(${i*30},100%,60%)`;
    ctx.fillRect(i * barWidth + 2, canvas.height - h, barWidth - 4, h);
    ctx.fillText(
      NOTE_NAMES[i],
      i * barWidth + barWidth / 2 - 8,
      canvas.height - 4
    );
  }
}


