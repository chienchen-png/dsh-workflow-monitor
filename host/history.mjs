// history.mjs — aggregate per-session activity into 30-minute buckets from the
// local session logs. Pure Node, no DSH imports: testable on its own.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";

const HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const BUCKET_MS = 30 * 60 * 1000;
const WINDOW = 28; // columns

function walk(dir, out, depth) {
  if (depth > 4) return out;
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) walk(p, out, depth + 1);
    else if (it.name.startsWith("session") && it.name.includes(".jsonl")) out.push(p);
  }
  return out;
}

function stampOf(line) {
  // the logs carry an ISO `time` (host events) or a numeric ts depending on format
  const m = /"(?:time|timestamp|at)"\s*:\s*"([^"]+)"/.exec(line);
  if (m) { const t = Date.parse(m[1]); if (!Number.isNaN(t)) return t; }
  const n = /"(?:time|ts|timestamp)"\s*:\s*(\d{10,13})/.exec(line);
  if (n) { const v = Number(n[1]); return v < 1e12 ? v * 1000 : v; }
  return 0;
}

export function aggregate() {
  const files = walk(path.join(HOME, "sessions"), [], 0);
  const now = Date.now();
  const start = now - WINDOW * BUCKET_MS;
  const bySession = new Map();
  for (const f of files) {
    let text = "";
    try {
      const buf = fs.readFileSync(f);
      text = (f.endsWith(".zstd") && zlib.zstdDecompressSync ? zlib.zstdDecompressSync(buf) : buf).toString("utf8");
    } catch { continue; }
    const id = path.basename(path.dirname(f));
    const row = bySession.get(id) || { id, buckets: new Array(WINDOW).fill(0), last: 0 };
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const t = stampOf(line);
      if (!t || t < start) continue;
      if (t > row.last) row.last = t;
      const idx = Math.min(WINDOW - 1, Math.floor((t - start) / BUCKET_MS));
      row.buckets[idx] += 1;
    }
    bySession.set(id, row);
  }
  return [...bySession.values()]
    .filter((r) => r.last > 0)
    .sort((a, b) => b.last - a.last)
    .slice(0, 11);
}

if (process.argv[1] && process.argv[1].endsWith("history.mjs")) {
  const rows = aggregate();
  console.log("files scanned:", walk(path.join(HOME, "sessions"), [], 0).length, "| rows:", rows.length);
  for (const r of rows) {
    const cells = r.buckets.map((n) => (n === 0 ? "." : n < 5 ? "+" : n < 40 ? "#" : "@")).join("");
    console.log(r.id.slice(0, 12).padEnd(13), cells, "last:", new Date(r.last).toLocaleString("zh-CN"));
  }
}


