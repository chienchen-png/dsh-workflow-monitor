// history.mjs — per-session activity buckets from the local session logs.
//
// The logs are *concatenated* zstd frames (one frame per append). Node's
// one-shot and streaming zstd both stop at the first frame, so frames are
// split on the zstd magic and decompressed one by one.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";

export const BUCKET_MS = 30 * 60 * 1000;
export const COLUMNS = 28;               // 28 x 30min = 14 hours
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function logFiles(dir, out, depth) {
  if (depth > 4) return out;
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) logFiles(p, out, depth + 1);
    else if (it.name.startsWith("session") && it.name.includes(".jsonl")) out.push(p);
  }
  return out;
}

function decompressFrames(buf) {
  const cut = [];
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) cut.push(i);
  }
  cut.push(buf.length);
  const parts = [];
  let from = 0;
  for (const to of cut) {
    if (to <= from) continue;
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(from, to))); from = to; } catch { /* extend span */ }
  }
  return Buffer.concat(parts).toString("utf8");
}

const STAMP = /"(?:time|timestamp|at|createdAt|ts)"\s*:\s*(\d{10,13})/;

export function aggregate(opts = {}) {
  const home = opts.home || process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const now = opts.now || Date.now();
  const cols = opts.columns || COLUMNS;
  const start = now - cols * BUCKET_MS;
  const rows = [];
  for (const file of logFiles(path.join(home, "sessions"), [], 0)) {
    let text = "";
    try { text = decompressFrames(fs.readFileSync(file)); } catch { continue; }
    const id = path.basename(path.dirname(file));
    const buckets = new Array(cols).fill(0);
    let last = 0, total = 0;
    for (const line of text.split("\n")) {
      if (!line) continue;
      const m = STAMP.exec(line);
      if (!m) continue;
      const t = Number(m[1]);
      if (t < start || t > now) continue;
      total++;
      if (t > last) last = t;
      const idx = Math.min(cols - 1, Math.floor((t - start) / BUCKET_MS));
      buckets[idx]++;
    }
    if (total) rows.push({ id, buckets, last, total });
  }
  rows.sort((a, b) => b.last - a.last);
  return rows.slice(0, opts.rows || 11);
}

if (process.argv[1] && process.argv[1].endsWith("history.mjs")) {
  const t0 = Date.now();
  const rows = aggregate();
  console.log("rows:", rows.length, "elapsed:", Date.now() - t0, "ms  (28 cols x 30min)");
  for (const r of rows) {
    const cells = r.buckets.map((n) => (n === 0 ? "." : n < 5 ? "+" : n < 40 ? "#" : "@")).join("");
    console.log(r.id.slice(9, 21).padEnd(13), cells, String(r.total).padStart(5), new Date(r.last).toLocaleString("zh-CN"));
  }
}
