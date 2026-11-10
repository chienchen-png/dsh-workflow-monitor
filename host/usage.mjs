// usage.mjs — token usage and estimated cost from the local session logs.
//
// Cost follows the same shape the usage-billing plugin uses:
//   cost = (miss * cacheMiss + hit * cacheHit + out * output) / 1e6
// with prices expressed per million tokens. A price table is optional: with no
// entry for a model the aggregate still reports tokens and marks the cost as
// unavailable rather than inventing a number.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const DAY_MS = 24 * 60 * 60 * 1000;

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

function text(file) {
  const buf = fs.readFileSync(file);
  if (!file.endsWith(".zstd")) return buf.toString("utf8");
  const cut = [];
  for (let i = 0; i < buf.length - 3; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) cut.push(i);
  }
  cut.push(buf.length);
  const parts = [];
  let from = 0;
  for (const to of cut) {
    if (to <= from) continue;
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(from, to))); from = to; } catch { /* extend */ }
  }
  return Buffer.concat(parts).toString("utf8");
}

function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Load a price table: { "model-key": { input, cacheMiss, cacheHit, output } } per 1e6 tokens. */
export function loadPrices(file) {
  if (!file) return {};
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

function priceFor(prices, model) {
  if (!prices || !model) return undefined;
  const key = Object.keys(prices).find((k) => k.toLowerCase() === String(model).toLowerCase());
  return key ? prices[key] : undefined;
}

export function usageAggregate(opts = {}) {
  const home = opts.home || process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const now = opts.now || Date.now();
  const days = opts.days || 7;
  const prices = opts.prices || {};
  const since = now - (days - 1) * DAY_MS;
  const daysMap = new Map();
  const models = new Map();
  let todayIn = 0, todayOut = 0, todayHit = 0, todayReq = 0, todayCost = 0, costKnown = true;

  for (const file of logFiles(path.join(home, "sessions"), [], 0)) {
    let body = "";
    try { body = text(file); } catch { continue; }
    for (const line of body.split("\n")) {
      if (!line || line.indexOf('"assistant/message"') < 0) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      const u = ev && ev.data && ev.data.usage;
      if (!u) continue;
      const t = typeof ev.time === "number" ? ev.time : (Date.parse(ev.time) || ev.at || ev.ts || 0);
      if (!t || t < since || t > now) continue;
      const input = Number(u.inputTokens) || 0;
      const output = Number(u.outputTokens) || 0;
      const hit = Number(u.cacheReadTokens) || 0;
      const model = (ev.data && (ev.data.model || (ev.data.request && ev.data.request.model))) || "unknown";
      const key = dayKey(t);
      const d = daysMap.get(key) || { day: key, input: 0, output: 0, cacheRead: 0, requests: 0, cost: 0, priced: true };
      d.input += input; d.output += output; d.cacheRead += hit; d.requests += 1;
      const p = priceFor(prices, model);
      if (p) d.cost += (input * (p.cacheMiss ?? p.input ?? 0) + hit * (p.cacheHit ?? 0) + output * (p.output ?? 0)) / 1e6;
      else d.priced = false;
      daysMap.set(key, d);

      const m = models.get(model) || { model, input: 0, output: 0, cacheRead: 0, requests: 0 };
      m.input += input; m.output += output; m.cacheRead += hit; m.requests += 1;
      models.set(model, m);

      if (key === dayKey(now)) {
        todayIn += input; todayOut += output; todayHit += hit; todayReq += 1;
        if (p) todayCost += (input * (p.cacheMiss ?? p.input ?? 0) + hit * (p.cacheHit ?? 0) + output * (p.output ?? 0)) / 1e6;
        else costKnown = false;
      }
    }
  }

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(now - i * DAY_MS);
    series.push(daysMap.get(k) || { day: k, input: 0, output: 0, cacheRead: 0, requests: 0, cost: 0, priced: true });
  }

  return {
    today: {
      input: todayIn, output: todayOut, cacheRead: todayHit, requests: todayReq,
      cost: costKnown ? Number(todayCost.toFixed(4)) : null,
    },
    days: series,
    models: [...models.values()].sort((a, b) => b.output - a.output).slice(0, 6),
    priced: costKnown,
  };
}
