/**
 * HALOFLUX Monitor — client half.
 *
 * Registers the console as a global page: one `main` panel keyed by PANEL_ID,
 * plus the matching `sidebar.panellist` row that opens it. The page itself is
 * an isolated frame (the scene owns its own <html>/<body> styling and canvas
 * loop), and the only traffic across the boundary is a telemetry snapshot in
 * and a click notification out.
 */
const HalofluxMonitor = (() => {
  const NS = 'workflow-monitor';
  const PANEL_ID = 'workflow-monitor';
  const SCENE_TITLE = 'DeepSeek Harness telemetry';

  const isZh = () => {
    try {
      const lang = (window.navigator && window.navigator.language) || '';
      if (/^zh/i.test(lang)) return true;
      const t = (window.document && document.documentElement.getAttribute('data-locale')) || '';
      return /^zh/i.test(t);
    } catch (e) {
      return false;
    }
  };

  const DICT = { zh: { label: '监控大屏' }, en: { label: 'Telemetry' } };
  const t = (key) => (isZh() ? DICT.zh : DICT.en)[key];

  function glyph(size) {
    const s = size || 16;
    return React.createElement('svg', {
      width: s, height: s, viewBox: '0 0 16 16', fill: 'none',
      'aria-hidden': 'true', focusable: 'false', style: { display: 'block' },
    },
    React.createElement('circle', { cx: 8, cy: 8, r: 6.1, stroke: 'currentColor', strokeWidth: 1.15, opacity: 0.55 }),
    React.createElement('path', { d: 'M8 1.9a6.1 6.1 0 0 1 4.9 9.75', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
    React.createElement('circle', { cx: 8, cy: 8, r: 1.55, fill: 'currentColor' }));
  }

  function pushToFrame(frame, snapshot) {
    if (!frame || !snapshot) return false;
    let win = null;
    try { win = frame.contentWindow; } catch (e) { win = null; }
    if (!win) return false;
    try {
      if (win.__HF && typeof win.__HF.ingest === 'function') {
        win.__HF.ingest(snapshot);
        return true;
      }
    } catch (e) { /* cross-origin or not ready */ }
    try {
      win.postMessage({ hf: 'ingest', snapshot }, '*');
      return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  function Console(props) {
    const hostRef = React.useRef(null);
    const frameRef = React.useRef(null);
    const snapshot = HalofluxBridge.useTelemetry(props || {});
    const snapRef = React.useRef(snapshot);
    snapRef.current = snapshot;

    React.useEffect(() => {
      const host = hostRef.current;
      const frame = frameRef.current;
      if (!host || !frame) return undefined;

      // A panel host can hand us an auto-height box; pin the frame to whatever
      // the parent actually offers, in both directions, so a window resize or a
      // collapsing sidebar never leaves the console half-height or overflowing.
      let fitQueued = false;
      const fitNow = () => {
        fitQueued = false;
        const parent = host.parentElement;
        const target = parent && parent.getBoundingClientRect().height > 40
          ? parent.getBoundingClientRect().height
          : window.innerHeight;
        if (Math.abs(host.clientHeight - target) > 4) host.style.height = Math.round(target) + 'px';
      };
      const fit = () => {
        if (fitQueued) return;
        fitQueued = true;
        window.requestAnimationFrame(fitNow);
      };
      fit();

      const paint = () => pushToFrame(frame, snapRef.current);
      const onLoad = () => paint();
      const onMessage = (event) => {
        const data = event && event.data;
        if (!data || data.hf !== 'ready') return;
        paint();
      };
      frame.addEventListener('load', onLoad);
      window.addEventListener('message', onMessage);

      // One heartbeat keeps the frame's clock honest between store updates.
      const timer = window.setInterval(paint, 1000);
      const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
      if (ro) ro.observe(document.body);

      return () => {
        window.clearInterval(timer);
        frame.removeEventListener('load', onLoad);
        window.removeEventListener('message', onMessage);
        if (ro) ro.disconnect();
      };
    }, []);

    React.useEffect(() => {
      pushToFrame(frameRef.current, snapshot);
    }, [snapshot]);

    return React.createElement('div', {
      ref: hostRef,
      className: 'workflow-monitor-host',
      style: { position: 'relative', width: '100%', height: '100%', minHeight: 0, overflow: 'hidden', background: '#08090b' },
    }, React.createElement('iframe', {
      ref: frameRef,
      title: SCENE_TITLE,
      srcDoc: SCENE_HTML,
      allow: 'autoplay',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, display: 'block', background: '#08090b' },
    }));
  }

  return {
    inject: ['slots'],
    apply(ctx) {
      const label = t('label');

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        label: () => label,
      }, (props) => React.createElement(Console, { ...(props || {}), __ctx: ctx })));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 30,
        label: () => label,
      }, (owner) => glyph(owner && owner.size)));
    },
  };
})();
