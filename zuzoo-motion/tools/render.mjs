// Offline preview renderer: node tools/render.mjs [--stills t1,t2,...] [--fps 30]
// Seeks window.__timelines.main frame by frame and pipes screenshots into ffmpeg.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const proj = resolve(here, "..");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const fps = +opt("--fps", 30);
const stills = opt("--stills", null);
const out = resolve(proj, opt("--out", "out/zuzoo.mp4"));
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.route("**/gsap.min.js", (r) => r.fulfill({ contentType: "text/javascript", body: readFileSync(resolve(here, "gsap-shim.js"), "utf8") }));
await page.goto(pathToFileURL(resolve(proj, "index.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.__timelines && window.__timelines.main);
const dur = await page.evaluate(() => +document.querySelector("#root").dataset.duration);
const seek = (t) => page.evaluate((t) => window.__timelines.main.seek(t), t);

if (stills) {
  for (const t of stills.split(",").map(Number)) {
    await seek(t);
    await page.screenshot({ path: resolve(proj, "out", `still_${t.toFixed(2)}.png`) });
  }
} else {
  const ff = spawn("ffmpeg", ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  const n = Math.round(dur * fps);
  for (let f = 0; f < n; f++) {
    await seek(f / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("wrote", out, n, "frames");
}
await browser.close();
