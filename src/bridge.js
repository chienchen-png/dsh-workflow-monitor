/**
 * Telemetry adapter — turns the host's session/workspace stores into the one
 * snapshot object the console frame consumes.
 *
 * Design rules:
 *  - read-only: this module never writes to a session or a store;
 *  - defensive: every row field is probed by name, because the projections are
 *    host-internal and may rename a field between releases;
 *  - cheap: the frame repaints from a plain snapshot, so nothing here runs per
 *    animation frame — the caller throttles pushes.
 */
const HalofluxBridge = (() => {
  const FEED_MAX = 14;
  const EMPTY_LIST = { byId: {}, ids: [], phase: 'idle' };
  const EMPTY_WS = { items: [], archivedSessionIds: [], pinnedSessionIds: [] };
  const EMPTY_STATUS = new Map();

  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ts) => {
    const d = new Date(ts || Date.now());
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const clip = (s, n) => {
    const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  };

  /** A stable no-op hook, so swapping to the real host hook never re-orders hooks. */
  const inert = (fallback) => (selector) => (typeof selector === 'function' ? selector(fallback) : fallback);

  function rowTitle(row, id) {
    return clip(row && (row.displayTitle || row.title || row.name || id), 34) || 'untitled';
  }

  function rowWorkspace(row) {
    const w = row && (row.workspaceId || (row.workspace && row.workspace.workspaceId));
    return typeof w === 'string' && w ? w : '';
  }

  /** Group live session rows by workspace, keeping the host's own ordering. */
  function groupByWorkspace(list, workspaces) {
    const rows = Object.values((list && list.byId) || {});
    const order = (list && Array.isArray(list.ids) && list.ids) || rows.map((r) => r.id);
    const rank = new Map(order.map((id, i) => [id, i]));
    rows.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));

    const items0 = (workspaces && Array.isArray(workspaces.items) && workspaces.items) || [];
    // Membership may live on either side: a session row can carry workspaceId, or
    // a workspace can carry its member list. Read both before giving up.
    const owner = Object.create(null);
    for (const w of items0) {
      const wid = w.workspaceId || w.id || '';
      const members = w.sessionIds || w.memberIds || w.sessions || w.members || w.children;
      if (Array.isArray(members)) {
        for (const m of members) {
          const id = typeof m === 'string' ? m : (m && (m.id || m.sessionId));
          if (id) owner[id] = wid;
        }
      }
    }
    const byWs = new Map();
    for (const row of rows) {
      if (!row || row.blank === true) continue;
      const key = rowWorkspace(row) || owner[row.id] || '';
      if (!byWs.has(key)) byWs.set(key, []);
      byWs.get(key).push(row);
    }

    const items = items0;
    const known = items.map((w) => ({
      id: w.workspaceId || w.id || '',
      name: clip(w.name || w.title || w.label || w.displayName ||
        String(w.path || w.directory || w.cwd || w.root || '').split(/[\\/]/).filter(Boolean).pop() || '工作区', 22),
      sessions: byWs.get(w.workspaceId || w.id || '') || [],
    }));
    const seen = new Set(known.map((k) => k.id));
    for (const [id, sessions] of byWs) {
      if (seen.has(id)) continue;
      known.push({ id, name: id ? clip(id, 22) : '未归组', sessions });
    }
    return known.filter((w) => w.sessions.length > 0 || items.length > 0).slice(0, 6);
  }

  /** Derive the snapshot. Pure: same inputs → same output. */
  function build(input) {
    const list = input.list || EMPTY_LIST;
    const workspaces = input.workspaces || EMPTY_WS;
    const statuses = input.statuses || EMPTY_STATUS;
    let feed = input.feed || [];
    let code = input.code || [];
    const now = input.now || Date.now();

    const groups = groupByWorkspace(list, workspaces);
    const rows = groups.reduce((n, g) => n + g.sessions.length, 0);
    if (!feed.length) {
      feed = [{ t: clock(now), v: 'read', text: rows ? '已连接 · 等待事件' : '未连接会话' }];
    }
    if (!code.length) {
      code = [{ ln: '', fn: rows ? 'session.attach' : 'session.none', op: rows ? '(waiting)' : '()' }];
    }

    const isRunning = (row) => {
      const live = statuses && statuses.get ? statuses.get(row.id) : undefined;
      if (live && typeof live.running === 'boolean') return live.running;
      return row.running === true;
    };

    let running = 0;
    for (const g of groups) for (const s of g.sessions) if (isRunning(s)) running += 1;

    const tokens = input.tokens || 0;
    const ctxFrac = typeof input.ctxFrac === 'number' ? input.ctxFrac : 0;
    const mode = rows === 0 ? 'void' : running > 0 ? 'run' : 'idle';

    // Micro-panel heads stay Latin and short: the ring renders them at ~4px,
    // where CJK turns to mush and anything longer than ~10 glyphs overflows.
    const tools = [];
    for (const c of code) {
      const name = c && c.fn;
      if (name && tools.indexOf(name) < 0) tools.push(name);
    }
    const heads = [
      'STEP ' + (input.step || 0),
      'TURN ' + (input.turn || 0),
      'SESS ' + rows,
      'WS ' + groups.length,
      'RUN ' + running,
      'CTX ' + Math.round(ctxFrac * 100) + '%',
      'TOK/S ' + Math.round(tokens),
    ].concat(tools.slice(0, 6).map((x) => String(x).toUpperCase().slice(0, 11)));
    const keys = ['step', 'turn', 'tok', 'ctx', 'run', 'sess', 'ws', 'tool', 'err', 'ms'];

    // Phase reads the most recent event's kind and age: it is what the operator
    // actually wants ("is it talking, working, or stuck?"), not a fake formula.
    const last = input.last || { kind: '', at: 0, tool: '' };
    const age = last.at ? now - last.at : 1e9;
    let phase = { k: '空闲', v: rows ? '无活跃回合' : '未连接会话' };
    if (running > 0) {
      if (last.kind === 'token' && age < 3000) phase = { k: '生成中', v: Math.round(tokens) + ' tok/s' };
      else if (last.kind === 'tool' && age < 20000) phase = { k: '调用工具', v: clip(last.tool || '运行中', 22) };
      else if (last.kind) phase = { k: '思考中', v: '等待 token · ' + Math.round(age / 1000) + 's' };
      else phase = { k: '运行中', v: '暂无事件' };
    }

    return {
      brand: '智能体实时运行态势',
      sub: 'DeepSeek Harness · 本机',
      clock: clock(now),
      mode,
      now,
      kpis: [
        { k: '工作区', v: String(groups.length), pct: Math.min(1, groups.length / 6), state: groups.length ? 'on' : 'off' },
        { k: '会话', v: String(rows), pct: Math.min(1, rows / 12), state: rows ? 'on' : 'off' },
        { k: '运行中', v: String(running), pct: Math.min(1, running / 6), tone: running > 0 ? 'pink' : '', state: running > 0 ? 'on' : 'off' },
        { k: 'TOKEN/S', v: String(Math.round(tokens)), pct: Math.min(1, tokens / 400), state: tokens > 0 ? 'live' : 'off' },
        { k: '上下文', v: Math.round(ctxFrac * 100) + '%', pct: ctxFrac, state: ctxFrac > 0 ? 'on' : 'off' },
      ],
      status: {
        big: running + ' / ' + rows + ' 会话 · ' + (rows - running) + ' 空闲',
        small: '更新 ' + clock(now) + ' · ' + groups.map((g) => g.name.split(/[\\/]/).pop()).join(' · '),
      },
      feed: feed.slice(-FEED_MAX),
      code: code.slice(-10),
      heads,
      keys,
      phase,
      zones: groups.map((g, i) => ({ code: 'W' + (i + 1), name: g.name })),
      // Flat session index for the activity matrix: running now, plus "busy"
      // (the followed session had an event in the last few seconds).
      sessionsIndex: groups.reduce((acc, g) => {
        for (const s2 of g.sessions) {
          acc.push({
            id: s2.id,
            label: rowTitle(s2, s2.id).slice(0, 3),
            running: isRunning(s2),
            busy: s2.id === input.activeSessionId && last.at > 0 && now - last.at < 4000,
          });
        }
        return acc;
      }, []).slice(0, 11),
      // Static framing only. `camera` is deliberately absent: the scene's mode
      // machine owns it (fixed while running, touring while idle), and a host
      // push would otherwise pin it every snapshot.
      params: input.params || { scale: 0.74, centerY: 0.015 },
      workspaces: groups.map((g) => ({
        id: g.id,
        name: g.name,
        sessions: g.sessions.length,
        running: g.sessions.filter(isRunning).length,
        sessionsDetail: g.sessions.map((s) => ({ id: s.id, title: rowTitle(s, s.id), running: isRunning(s) })),
      })),
      active: input.activeSessionId || '',
    };
  }

  /**
   * Host hook wrapper. The standard slot props carry the store hooks; when a
   * store is absent (older host, or a slot that does not project it) the
   * selectors are answered from an empty shape instead of throwing.
   */
  function useTelemetry(props) {
    const useSessions = props && typeof props.useSessions === 'function' ? props.useSessions : inert(EMPTY_LIST);
    const useWorkspaces = props && typeof props.useWorkspaces === 'function' ? props.useWorkspaces : inert(EMPTY_WS);
    const useSessionStatus = props && typeof props.useSessionStatus === 'function' ? props.useSessionStatus : inert(EMPTY_STATUS);

    const list = useSessions((s) => s) || EMPTY_LIST;
    const workspaces = useWorkspaces((s) => s) || EMPTY_WS;
    const statuses = useSessionStatus((m) => m) || EMPTY_STATUS;

    const activeId = React.useMemo(() => {
      const rows = Object.values(list.byId || {});
      const retained = rows.find((r) => r && r.retainedBy && (r.retainedBy.mainView || 0) > 0);
      return (retained && retained.id) || '';
    }, [list]);

    const [feed, setFeed] = React.useState([]);
    const [code, setCode] = React.useState([]);
    const [tokens, setTokens] = React.useState(0);
    const [ctxFrac, setCtxFrac] = React.useState(0);
    const seenRef = React.useRef({ key: '', count: 0 });
    const linesRef = React.useRef([]);
    const codeRef = React.useRef([]);
    const stepRef = React.useRef(0);
    const turnRef = React.useRef(0);
    const lastRef = React.useRef({ kind: '', at: 0, tool: '' });

    // Follow the active session's event stream: new entries become feed lines.
    React.useEffect(() => {
      if (!activeId) return undefined;
      const svc = (props && props.__ctx && props.__ctx.get && props.__ctx.get('sessions')) || null;
      let source = null;
      try {
        const binding = svc && typeof svc.binding === 'function' ? svc.binding(activeId) : undefined;
        source = binding && binding.eventSource;
      } catch (e) { source = null; }
      if (!source || typeof source.getSnapshot !== 'function') return undefined;

      const flush = () => {
        let snap = null;
        try { snap = source.getSnapshot(); } catch (e) { snap = null; }
        if (!snap || !Array.isArray(snap.entries)) return;
        const key = activeId + ':' + (snap.revision != null ? snap.revision : snap.entries.length);
        if (seenRef.current.key === key) return;
        seenRef.current = { key, count: snap.entries.length };

        const lines = linesRef.current;
        let tok = 0;
        for (const entry of snap.entries.slice(-60)) {
          const ev = entry && (entry.event || entry);
          const type = ev && ev.type;
          const data = (ev && ev.data) || {};
          const at = ev && (ev.time || ev.at) ? Date.parse(ev.time || ev.at) : Date.now();
          if (type === 'tool/call') {
            const name = data.name || data.toolName || data.tool ||
              (data.call && (data.call.name || data.call.tool)) || 'tool';
            const rawArgs = data.arguments != null ? data.arguments : (data.args != null ? data.args : (data.call && data.call.arguments));
            const args = typeof rawArgs === 'string' ? rawArgs : (rawArgs ? JSON.stringify(rawArgs) : '');
            lines.push({ t: clock(at), v: 'build', text: clip(name + ' ' + args, 46) });
            codeRef.current.push({ ln: '', fn: String(name), op: '(' + clip(args, 28) + ')' });
            lastRef.current = { kind: 'tool', at: Date.now(), tool: String(name) };
          } else if (type === 'tool/result') {
            lines.push({ t: clock(at), v: 'check', text: clip((data.error ? '失败 · ' : '完成 · ') + ((data.name) || 'tool'), 46) });
          } else if (type === 'turn/step') {
            if (typeof data.step === 'number') stepRef.current = data.step;
            else stepRef.current += 1;
            if (typeof data.turn === 'number') turnRef.current = data.turn;
            lines.push({ t: clock(at), v: 'read', text: '步骤 ' + (data.step != null ? data.step : '') + ' · 回合 ' + (data.turn != null ? data.turn : '') });
          } else if (type === 'assistant/live-chunk') {
            const chunk = data.chunk;
            if (chunk && chunk.type === 'text-delta' && typeof chunk.text === 'string') {
              tok += chunk.text.length;
              lastRef.current = { kind: 'token', at: Date.now(), tool: lastRef.current.tool };
            }
          } else if (type === 'assistant/message') {
            const usage = data.usage;
            if (usage && num(usage.inputTokens) != null) {
              const inTok = num(usage.inputTokens) || 0;
              const outTok = num(usage.outputTokens) || 0;
              setCtxFrac(Math.min(1, inTok / 128000));
              setTokens(Math.round(outTok / Math.max(1, 1)));
            }
          }
        }
        if (tok > 0) setTokens((n) => n + tok);
        linesRef.current = lines.slice(-FEED_MAX);
        setFeed(linesRef.current.slice());
        codeRef.current = codeRef.current.slice(-10);
        setCode(codeRef.current.slice());
      };

      flush();
      const timer = window.setInterval(flush, 600);
      return () => window.clearInterval(timer);
    // `props` is rebuilt on every parent render; depending on it would tear down
    // and recreate the poll on each tick. The only real dependency is the session.
    }, [activeId]);

    return React.useMemo(() => build({
      list, workspaces, statuses, feed, code, tokens, ctxFrac, last: lastRef.current,
      step: stepRef.current, turn: turnRef.current,
      activeSessionId: activeId, now: Date.now(),
    }), [list, workspaces, statuses, feed, code, tokens, ctxFrac, activeId]);
  }

  return { useTelemetry, build, groupByWorkspace, clock };
})();
