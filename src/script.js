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

  // Get the spectrum
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freqData);

  // Prepare a 12-element array (C..B)
  const pcp = new Float32Array(12);

  const binHz = audioCtx.sampleRate / analyser.fftSize;

  // Only consider bins in guitar range (~70–1500 Hz)
  const lo = Math.floor(70 / binHz);
  const hi = Math.min(freqData.length, Math.ceil(1500 / binHz));

  for (let k = lo; k < hi; k++) {
    const f = k * binHz;
    const amp = freqData[k] / 255; // normalize 0-1
    const pc = midiToPitchClass(freqToMidi(f));
    pcp[pc] += amp;
  }

  // Normalize
  const sum = pcp.reduce((a,b)=>a+b,0)+1e-9;
  for (let i=0;i<12;i++) pcp[i]/=sum;

  // Draw bars
  ctx.fillStyle = "#0b0e12";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const barWidth = canvas.width / 12;
  for (let i = 0; i < 12; i++) {
    const h = pcp[i] * canvas.height * 2.5;
    ctx.fillStyle = "hsl(" + (i*30) + ",100%,60%)";
    ctx.fillRect(i*barWidth + 2, canvas.height - h, barWidth - 4, h);
    ctx.fillText(NOTE_NAMES[i], i*barWidth + barWidth/2 - 8, canvas.height - 400);
  }
}

