// Procedural sound: every effect is synthesised with WebAudio, so the game
// ships no audio files and makes no network request. One shared context,
// resumed on the first user gesture.
let ctx = null;
let master = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

let sharedNoise = null;

function playNoise({ duration, filterFreq, filterType = 'lowpass', gain, decay }) {
  if (!ctx) return;
  if (!sharedNoise) sharedNoise = noiseBuffer(0.5);
  const src = ctx.createBufferSource();
  src.buffer = sharedNoise;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + decay);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(now, Math.random() * 0.2, duration);
  src.stop(now + duration);
}

function playTone({ freq, endFreq, duration, gain, type = 'sine' }) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  const now = ctx.currentTime;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + duration);
}

export const sfx = {
  shoot(pitch = 1) {
    playNoise({ duration: 0.12, filterFreq: 1800 * pitch, gain: 0.9, decay: 0.11 });
    playTone({ freq: 160 * pitch, endFreq: 60, duration: 0.09, gain: 0.5, type: 'square' });
  },
  enemyShoot(dist) {
    const g = Math.max(0.05, 0.5 - dist * 0.012);
    playNoise({ duration: 0.1, filterFreq: 900, gain: g, decay: 0.1 });
  },
  reload() {
    playTone({ freq: 700, duration: 0.05, gain: 0.25, type: 'square' });
    setTimeout(() => playTone({ freq: 500, duration: 0.06, gain: 0.25, type: 'square' }), 220);
  },
  dryFire() {
    playTone({ freq: 1200, duration: 0.04, gain: 0.2, type: 'square' });
  },
  hit(head) {
    playTone({ freq: head ? 1400 : 950, duration: 0.05, gain: 0.3, type: 'sine' });
  },
  hurt() {
    playTone({ freq: 220, endFreq: 90, duration: 0.15, gain: 0.4, type: 'sawtooth' });
  },
  explosion() {
    playNoise({ duration: 0.8, filterFreq: 300, gain: 1.2, decay: 0.75 });
    playTone({ freq: 90, endFreq: 28, duration: 0.7, gain: 0.8 });
  },
  beep() {
    playTone({ freq: 1100, duration: 0.09, gain: 0.35, type: 'square' });
  },
  plant() {
    playTone({ freq: 520, duration: 0.12, gain: 0.3, type: 'square' });
    setTimeout(() => playTone({ freq: 780, duration: 0.18, gain: 0.3, type: 'square' }), 140);
  },
  win() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.22, gain: 0.3 }), i * 130));
  },
  lose() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => playTone({ freq: f, duration: 0.25, gain: 0.3 }), i * 150));
  },
  buy() {
    playTone({ freq: 880, duration: 0.08, gain: 0.25, type: 'triangle' });
  },
  bounce() {
    playTone({ freq: 300, endFreq: 180, duration: 0.05, gain: 0.2, type: 'square' });
  },
  step() {
    playNoise({ duration: 0.05, filterFreq: 400, gain: 0.08, decay: 0.05 });
  },
};
