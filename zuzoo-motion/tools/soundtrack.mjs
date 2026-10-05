// Procedural 128 BPM soundtrack + SFX synced to the beat grid in index.html.
// node tools/soundtrack.mjs [out.wav]  → 44.1 kHz stereo 16-bit WAV, 18.75 s (40 beats)
import { writeFileSync } from "node:fs";

const SR = 44100, B = 60 / 128, BEATS = 40, LEN = Math.ceil(BEATS * B * SR);
const L = new Float32Array(LEN), R = new Float32Array(LEN);
const fx = { L: new Float32Array(LEN), R: new Float32Array(LEN) }; // send to delay
const at = (beat) => Math.round(beat * B * SR);
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 2 - 1;

function add(start, buf, gain = 1, pan = 0, send = 0) {
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < buf.length; i++) {
    const k = start + i; if (k < 0 || k >= LEN) continue;
    L[k] += buf[i] * gl; R[k] += buf[i] * gr;
    if (send) { fx.L[k] += buf[i] * gl * send; fx.R[k] += buf[i] * gr * send; }
  }
}
const gen = (sec, f) => { const n = Math.round(sec * SR), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = f(i / SR, i); return o; };
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
// one-pole filters
const lp = (buf, fc) => { const a = 1 - Math.exp(-2 * Math.PI * fc / SR); let y = 0; return buf.map((x) => (y += a * (x - y))); };
const hp = (buf, fc) => { const l = lp(buf, fc); return buf.map((x, i) => x - l[i]); };

// ---------- instruments
const kick = () => gen(0.32, (t) => { const ph = 2 * Math.PI * (45 * t + (110 / 28) * (1 - Math.exp(-28 * t))); return Math.sin(ph) * env(t, 0.002, 0.11) * 1.0 + Math.sin(ph * 2) * env(t, 0.001, 0.015) * 0.3; });
const clap = () => hp(gen(0.22, (t) => rnd() * (env(t, 0.001, 0.05) + 0.5 * env(Math.max(0, t - 0.012), 0.001, 0.02) * (t > 0.012))), 900);
const hat = (open) => hp(gen(open ? 0.18 : 0.05, (t) => rnd() * env(t, 0.001, open ? 0.06 : 0.014)), 7000);
const bass = (m, dur) => lp(gen(dur, (t) => { const f = mf(m), p = (f * t) % 1; return ((p < 0.5 ? 4 * p - 1 : 3 - 4 * p) * 0.8 + Math.sin(2 * Math.PI * f * t) * 0.6) * Math.min(1, t / 0.005) * Math.exp(-t / (dur * 0.9)) * Math.min(1, (dur - t) / 0.02); }), 900);
const pluck = (m, dur = 0.5) => lp(gen(dur, (t) => { const f = mf(m); let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(2 * Math.PI * f * h * t * (1 + 0.0015 * (h - 1))) / h; return s * env(t, 0.003, 0.16); }), 3200);
const bell = (m, dur = 0.7) => gen(dur, (t) => { const f = mf(m); return (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 4.01 * t) * Math.exp(-t / 0.05) + 0.2 * Math.sin(2 * Math.PI * f * 2 * t)) * env(t, 0.002, 0.22); });
const pad = (notes, dur) => lp(gen(dur, (t) => { let s = 0; notes.forEach((m, j) => { const f = mf(m); for (const dt of [-0.004, 0.004]) { const p = (f * (1 + dt) * t + j * 0.13) % 1; s += (2 * p - 1) * 0.5; } }); return s * Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.4); }), 1400);

// ---------- SFX
const whoosh = ((dur = 0.42) => {
  const n = Math.round(dur * SR), o = new Float32Array(n); let y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) { const p = i / n, fc = 300 + 5200 * p * p, q = 0.35; const f = 2 * Math.sin(Math.PI * fc / SR); const x = rnd(); y2 += f * y1; const hpv = x - y2 - q * y1; y1 += f * hpv; o[i] = y1 * Math.sin(Math.PI * p) ** 1.5 * 0.9; }
  return o; })();
const blip = (f0, f1, dur = 0.09) => gen(dur, (t) => Math.sin(2 * Math.PI * (f0 * t + (f1 - f0) * t * t / (2 * dur))) * env(t, 0.002, dur / 3));
const shutter = () => { const c = () => hp(gen(0.04, (t) => rnd() * env(t, 0.0005, 0.006)), 2500); const o = new Float32Array(Math.round(0.12 * SR)); const a = c(), b = c(); a.forEach((v, i) => (o[i] += v)); b.forEach((v, i) => (o[i + Math.round(0.065 * SR)] += v * 0.8)); return o; };
const coin = () => { const o = new Float32Array(Math.round(0.5 * SR)); const a = gen(0.08, (t) => Math.sin(2 * Math.PI * mf(88) * t) * env(t, 0.001, 0.03)); const b = gen(0.42, (t) => Math.sin(2 * Math.PI * mf(93) * t) * env(t, 0.001, 0.12) + 0.3 * Math.sin(2 * Math.PI * mf(93) * 2.76 * t) * env(t, 0.001, 0.03)); a.forEach((v, i) => (o[i] += v)); b.forEach((v, i) => (o[i + Math.round(0.07 * SR)] += v)); return o; };
const riser = (dur) => gen(dur, (t) => { const p = t / dur; return (rnd() * 0.5 * p * p) + Math.sin(2 * Math.PI * (200 * t + 900 * t * p)) * 0.25 * p * p; });
const crash = () => hp(gen(1.8, (t) => rnd() * env(t, 0.002, 0.45)), 4500);

// ---------- arrangement (chords: [startBeat, chord tones (midi), bass root])
const F = [65, 69, 72], G = [67, 71, 74], Em = [64, 67, 71], Am = [69, 72, 76], C = [72, 76, 79];
const prog = [[0, F, 41], [4, G, 43], [8, Em, 40], [12, Am, 45], [16, F, 41], [20, G, 43], [24, Em, 40], [28, Am, 45], [30, G, 43], [33, C, 36], [36, F, 41], [38, G, 43], [39, C, 36]];
const chordAt = (b) => { let c = prog[0]; for (const p of prog) if (p[0] <= b + 1e-6) c = p; return c; };
const inBreak = (b) => b >= 32 && b < 33;
const END = 39; // final hit

for (let b = 0; b < END; b += 0.5) {
  if (inBreak(b)) continue;
  const [, ch, root] = chordAt(b), on = b % 1 === 0;
  // drums
  if (on) add(at(b), kick(), b < 2 ? 0.45 : 0.58);
  if (on && b % 2 === 1 && b >= 4) add(at(b), clap(), 0.32, 0.05, 0.15);
  if (!on && b >= 2) add(at(b), hat(b % 4 === 3.5), 0.11, 0.3);
  if (on && b >= 8) add(at(b + 0.25), hat(false), 0.05, -0.3);
  // bass: offbeat 8ths
  if (!on && b >= 2) add(at(b), bass(root, B * 0.45), 0.42);
  // plucks: syncopated chord stabs
  const step = (b * 2) % 8; // 0..7 eighths in a bar
  if ([0, 3, 6].includes(step)) ch.forEach((m, j) => add(at(b) + j * 40, pluck(m), 0.1, -0.25 + j * 0.25, 0.2));
  // bell arpeggio (two octaves up pattern)
  const pat = [0, 1, 2, 1, 2, 0, 2, 1];
  if (b >= 6) add(at(b), bell(ch[pat[step]] + 12), b >= 33 ? 0.11 : 0.08, step % 2 ? 0.45 : -0.45, 0.35);
}
// pads under everything
prog.forEach((p, i) => { const s = p[0], e = i + 1 < prog.length ? prog[i + 1][0] : 40; if (s >= END) return; add(at(s), pad(p[1].map((m) => m - 12), (e - s) * B + 0.3), 0.045, 0, 0.2); });
// break → impact at end card
add(at(31), riser(B * 2), 0.32, 0, 0.2);
add(at(32), pad([55, 59, 62, 65], B * 1.05), 0.06);
add(at(33), crash(), 0.22, 0, 0.2);
// final hit
add(at(END), kick(), 0.6); add(at(END), crash(), 0.25, 0, 0.3);
C.concat([60, 84]).forEach((m, j) => add(at(END) + j * 30, bell(m, 2.0), 0.08, -0.4 + j * 0.2, 0.4));
add(at(END), pad([48, 55, 64, 67], B), 0.06);
add(at(END), bass(36, B * 1.6), 0.5);

// ---------- SFX (beats match index.html)
[0, 0.5, 1].forEach((b, i) => add(at(b), blip(500 + i * 160, 900 + i * 220), 0.22, -0.3 + i * 0.3));   // habit chips
add(at(3.5), blip(700, 1400, 0.14), 0.16);                                                                // underline
[6, 10, 17, 27].forEach((b) => add(at(b) - Math.round(0.36 * SR), whoosh, 0.35, 0, 0.15));               // scene changes
add(at(7.5), blip(400, 1200, 0.18), 0.2);                                                                 // up arrow
[13, 14, 15].forEach((b) => add(at(b), shutter(), 0.45, 0.15));                                           // camera shutters
for (let i = 0; i < 7; i++) add(at(13.1 + i * 0.45), blip(mf(72 + [0, 2, 4, 5, 7, 9, 11][i]), mf(84 + [0, 2, 4, 5, 7, 9, 11][i]), 0.07), 0.13, -0.5 + i * 0.16, 0.2); // day checks
for (let k = 20; k <= 25; k++) add(at(k), blip(mf(76 + (k - 20) * 2), mf(79 + (k - 20) * 2), 0.06), 0.12, 0.2, 0.2); // price ticks
[88, 93, 100].forEach((m, j) => add(at(25) + j * 1800, bell(m, 1.0), 0.11, 0, 0.4));                       // price peak ding
[30, 31.5].forEach((b) => add(at(b), coin(), 0.2, 0.5, 0.2));                                             // 투자 coin lands (friend)
[31.5, 33].forEach((b) => add(at(b), coin(), 0.2, -0.5, 0.2));                                            // 배당 coin lands (me)

// ---------- ping-pong delay (3/8 beat) on the send bus
const dly = Math.round(B * 0.75 * SR);
for (let i = dly; i < LEN; i++) { const fl = fx.L[i - dly] * 0.0 + fx.R[i - dly] * 0.45, fr = fx.L[i - dly] * 0.45; fx.L[i] += fl; fx.R[i] += fr; }
const fxL = lp(fx.L, 3500), fxR = lp(fx.R, 3500);
for (let i = 0; i < LEN; i++) { L[i] += fxL[i] * 0.5; R[i] += fxR[i] * 0.5; }

// ---------- master: gentle glue, fade tail, normalize
let peak = 0;
for (let i = 0; i < LEN; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.89 / peak, fadeN = Math.round(0.08 * SR);
const pcm = Buffer.alloc(44 + LEN * 4);
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + LEN * 4, 4); pcm.write("WAVEfmt ", 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write("data", 36); pcm.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  const f = i > LEN - fadeN ? (LEN - i) / fadeN : 1;
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g * f)) * 32767), 44 + i * 4);
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g * f)) * 32767), 46 + i * 4);
}
const out = process.argv[2] || "assets/soundtrack.wav";
writeFileSync(out, pcm);
console.log("wrote", out, (LEN / SR).toFixed(2) + "s");
