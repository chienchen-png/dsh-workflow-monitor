/**
 * dsh-workflow-monitor — Host half.
 *
 * Serves the aggregated session history to the browser half. The console itself
 * renders in `client.js`; this side only answers what the browser cannot read:
 * per-bucket activity, plus token usage and estimated cost.
 */
import os from 'node:os';
import { aggregate } from './host/history.mjs';
import { usageAggregate, loadPrices } from './host/usage.mjs';

const ROUTE = 'workflow-monitor/usage-v2';
const CACHE_MS = 30 * 1000;
const PRICES = new URL('./prices.json', import.meta.url);

let cache = { at: 0, body: null };

function payload() {
  const now = Date.now();
  if (cache.body && now - cache.at < CACHE_MS) return cache.body;
  const rows = aggregate({ now });
  let usage = null;
  try { usage = usageAggregate({ now, prices: loadPrices(PRICES) }); } catch { usage = null; }
  cache = {
    at: now,
    body: JSON.stringify({
      at: now,
      bucketMs: 90 * 60 * 1000,
      columns: 28,
      rows: rows.map((r) => ({ id: r.id, buckets: r.buckets, last: r.last, total: r.total })),
      usage,
      mem: (() => { const total = os.totalmem(), free = os.freemem(); return { total, free, used: total - free }; })(),
    }),
  };
  return cache.body;
}

function answer(res) {
  const body = payload();
  try { console.log('[workflow-monitor] history served', body.length, 'bytes'); } catch { /* no console */ }
  if (!res || typeof res.setHeader !== 'function') return false;
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
  return true;
}

/**
 * Register the route on a live web server, preferring the descriptor shape the
 * host implementation accepts: { kind: 'exact', path, handler }.
 */
function mount(server, ctx, log) {
  if (!server) return false;
  const handler = (req, res) => answer(res);

  if (typeof server.register === 'function') {
    try {
      const dispose = server.register({ kind: 'exact', path: '/' + ROUTE, handler });
      if (typeof dispose === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => () => { try { dispose(); } catch { /* already gone */ } });
      }
      log('host: HTTP route registered ->', '/' + ROUTE);
      return true;
    } catch (e) {
      log('host: register() rejected:', String((e && e.message) || e));
    }
  }
  return false;
}

export function apply(ctx) {
  const log = (...a) => { try { console.log('[workflow-monitor]', ...a); } catch { /* no console */ } };

  // Fast path: the server is already up.
  let direct = null;
  try { direct = ctx.get('webServer') || ctx.get('webserver') || null; } catch { direct = null; }
  if (direct && mount(direct, ctx, log)) return;

  // Slow path: activation can win the race against the web server on a cold
  // boot. `ctx.inject` waits for the service instead of giving up.
  try {
    ctx.inject(['webServer'], (scoped) => {
      try {
        const server = scoped.webServer || (scoped.get && scoped.get('webServer')) || null;
        if (mount(server, ctx, log)) return;
        log('host: webServer injected but no usable register()');
      } catch (e) {
        log('host: inject mount failed:', String((e && e.message) || e));
      }
    });
    if (!direct) log('host: waiting for webServer service');
  } catch (e) {
    log('host: ctx.inject unavailable:', String((e && e.message) || e));
  }
}
