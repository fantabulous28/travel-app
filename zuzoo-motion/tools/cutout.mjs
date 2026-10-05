// Flood-fills near-white background from the image edges to transparency (keeps the cream body).
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const [src, dst] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage();
const out = await p.evaluate(async (data) => {
  const img = new Image(); img.src = data; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data, W = c.width, H = c.height;
  const white = (i) => a[i] > 238 && a[i + 1] > 238 && a[i + 2] > 238;
  const seen = new Uint8Array(W * H), st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const k = st.pop(); if (seen[k]) continue; seen[k] = 1; if (!white(k * 4)) continue; a[k * 4 + 3] = 0;
    const x = k % W, y = (k / W) | 0; if (x > 0) st.push(k - 1); if (x < W - 1) st.push(k + 1); if (y > 0) st.push(k - W); if (y < H - 1) st.push(k + W); }
  // soften the fringe: semi-transparent for light pixels touching the cleared area
  for (let k = 0; k < W * H; k++) if (a[k * 4 + 3] && seen[k]) { const l = (a[k*4] + a[k*4+1] + a[k*4+2]) / 3; if (l > 215) a[k * 4 + 3] = Math.round(255 * (255 - l) / 40); }
  g.putImageData(d, 0, 0); return c.toDataURL("image/png");
}, "data:image/png;base64," + readFileSync(src).toString("base64"));
writeFileSync(dst, Buffer.from(out.split(",")[1], "base64")); await b.close();
