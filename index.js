/**
 * dsh-workflow-monitor — Host half.
 *
 * Serves the aggregated session history to the browser half. The console itself
 * renders in `client.js`; this side only answers one question the browser cannot:
 * "which sessions were active in each of the last 28 half-hour buckets?"
 *
 * Transport: a named route on the host web server. The route API is discovered
 * at activation (the host exposes it under `webServer`); every step is guarded so
 * an unknown shape leaves the plugin inert instead of breaking activation.
 */
import { aggregate } from './host/history.mjs';

const ROUTE = 'workflow-monitor/history';
const CACHE_MS = 30 * 1000;

let cache = { at: 0, body: null };

function payload() {
  const now = Date.now();
  if (cache.body && now - cache.at < CACHE_MS) return cache.body;
  const rows = aggregate({ now });
  cache = {
    at: now,
    body: JSON.stringify({
      at: now,
      bucketMs: 30 * 60 * 1000,
      columns: 28,
      rows: rows.map((r) => ({ id: r.id, buckets: r.buckets, last: r.last, total: r.total })),
    }),
  };
  return cache.body;
}

function answer(res) {
  const body = payload();
  if (res && typeof res.setHeader === 'function') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(body);
    return true;
  }
  return false;
}

export function apply(ctx) {
  const log = (...a) => { try { console.log('[workflow-monitor]', ...a); } catch { /* no console */ } };

  let server = null;
  try { server = ctx.get('webServer') || ctx.get('webserver') || null; } catch { server = null; }

  if (!server) {
    log('host: no webServer service; history route not registered');
    return;
  }

  const proto = Object.getPrototypeOf(server) || {};
  const names = Object.getOwnPropertyNames(proto).concat(Object.keys(server));
  const candidates = names.filter((n) => /^(route|handle|serve|register|add|on)/i.test(n));
  log('host: webServer methods =', names.join(','));

  for (const name of candidates) {
    const fn = server[name];
    if (typeof fn !== 'function') continue;
    for (const shape of [
      () => fn.call(server, ROUTE, (req, res) => answer(res)),
      () => fn.call(server, { name: ROUTE, handler: (req, res) => answer(res) }),
      () => fn.call(server, ROUTE, { get: (req, res) => answer(res) }),
    ]) {
      try {
        const r = shape();
        if (r !== undefined) { log('host: route registered via', name); return; }
      } catch (e) { /* try the next shape */ }
    }
  }

  log('host: no usable route API among', candidates.join(','));
}
