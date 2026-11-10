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
import { usageAggregate, loadPrices } from './host/usage.mjs';

const ROUTE = 'workflow-monitor/history';
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
      bucketMs: 30 * 60 * 1000,
      columns: 28,
      rows: rows.map((r) => ({ id: r.id, buckets: r.buckets, last: r.last, total: r.total })),
      usage,
    }),
  };
  return cache.body;
}

function answer(res) {
  const body = payload();
  try { console.log('[workflow-monitor] history served', body.length, 'bytes'); } catch { /* no console */ }
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
  log('host: webServer methods =', names.join(','));

  // Named HTTP route first: `register(name, handler)`. Only if that is absent do
  // we probe alternatives — and never the upgrade/fallback channels, which accept
  // the same arguments but mean something entirely different.
  const handler = (req, res) => answer(res);
  if (typeof server.register === 'function') {
    // Host route descriptor: { kind: 'exact' | 'prefix', path, handler | resource }.
    // Duplicate (kind, path) throws by design, so exact+path is the contract.
    try {
      server.register({ kind: 'exact', path: '/' + ROUTE, handler });
      log('host: HTTP route registered ->', '/' + ROUTE);
      return;
    } catch (e) {
      log('host: register() rejected:', String((e && e.message) || e));
      try {
        server.register({ kind: 'prefix', path: '/' + ROUTE, handler });
        log('host: prefix route registered ->', '/' + ROUTE);
        return;
      } catch (e2) {
        log('host: register(prefix) rejected:', String((e2 && e2.message) || e2));
      }
    }
  }

  const candidates = names.filter((n) => /^(route|handle|serve|add)/i.test(n) && !/upgrade|fallback/i.test(n));
  for (const name of candidates) {
    const fn = server[name];
    if (typeof fn !== 'function') continue;
    for (const shape of [
      () => fn.call(server, ROUTE, handler),
      () => fn.call(server, { name: ROUTE, handler }),
      () => fn.call(server, ROUTE, { get: handler }),
    ]) {
      try {
        const r = shape();
        if (r !== undefined) { log('host: route registered via', name); return; }
      } catch (e) { /* try the next shape */ }
    }
  }

  log('host: no usable route API among', candidates.join(','));
}
