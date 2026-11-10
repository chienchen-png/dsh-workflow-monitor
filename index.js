/**
 * HALOFLUX Monitor for DSH — Host half.
 *
 * The console renders entirely in the Web client (`client.js`), which
 * registers a `main` panel plus its `sidebar.panellist` row and reads live
 * session telemetry through `ctx.sessions`. This Host half exists so the
 * bundle has an activatable row and an inventory entry; it deliberately has
 * no Host behaviour.
 */

export function apply() {}
