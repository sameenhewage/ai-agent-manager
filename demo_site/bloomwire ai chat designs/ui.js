/* ============================================================
   Bloomwire — shared UI helpers (window.UI)
   Pure presentation: escaping, icons, charts, badges, avatars.
   Stateful actions live in app.js (window.App).
   ============================================================ */
window.UI = (function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = n => (typeof n === "number" ? n.toLocaleString() : n);
  let _uid = 0; const uid = () => "u" + (++_uid);

  /* ---- inline icon set (stroke) ---- */
  const I = {
    chat: '<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M9 2h6M9 14h.01M15 14h.01"/>',
    sparkles: '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/>',
    box: '<path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    truck: '<path d="M1 4h13v11H1zM14 8h4l3 3v4h-7"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    swap: '<path d="M3 7h13l-3-3M21 17H8l3 3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.8M21 20a5.5 5.5 0 0 0-4-5.3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9 2 2 0 1 1-2.8 2.8 1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0 1.7 1.7 0 0 0-2.8-1.2 2 2 0 1 1-2.8-2.8A1.7 1.7 0 0 0 3 13.5 2 2 0 0 1 3 9.5 1.7 1.7 0 0 0 4.6 6.7 2 2 0 1 1 7.4 3.9 1.7 1.7 0 0 0 10 2.5 2 2 0 0 1 14 2.5a1.7 1.7 0 0 0 2.6 1.4 2 2 0 1 1 2.8 2.8A1.7 1.7 0 0 0 21.5 10 2 2 0 0 1 21.5 14h-.1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    flame: '<path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s3 1 4-6z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.5a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/>',
    send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    store: '<path d="M3 9l1-5h16l1 5M5 9v11h14V9"/>',
    note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>',
    link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    kanban: '<rect x="3" y="3" width="6" height="14" rx="1"/><rect x="11" y="3" width="6" height="10" rx="1"/><rect x="19" y="3" width="2" height="7" rx="1"/>',
    handoff: '<path d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5 5h14l3 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7" cy="7" r="1.4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>'
  };
  const icon = (name, cls) => `<svg class="${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name] || I.chat}</svg>`;

  const initials = name => String(name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const colorOf = cls => ({ ac: "var(--accent)", ai: "var(--ai)", in: "var(--info)", tl: "var(--teal)", wn: "var(--warn)", bd: "var(--bad)", gd: "var(--good)" }[cls] || "var(--faint)");

  /* ---- charts ---- */
  function areaChart(vals, labels, opts) {
    opts = opts || {};
    const W = 680, H = opts.h || 190, pl = 8, pr = 8, pt = 14, pb = 22;
    const series = opts.second ? [vals, opts.second] : [vals];
    const all = series.flat();
    const max = Math.max(...all) * 1.18 || 1;
    const iw = W - pl - pr, ih = H - pt - pb, id = uid();
    const X = i => pl + (iw * i / (vals.length - 1 || 1));
    const Y = v => pt + ih - (v / max) * ih;
    const poly = arr => arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    const grid = [0, .25, .5, .75, 1].map(f => { const yy = pt + ih - f * ih; return `<line class="gl" x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}"/>`; }).join("");
    const area = `${pl},${pt + ih} ${poly(vals)} ${pl + iw},${pt + ih}`;
    const dots = vals.map((v, i) => `<circle class="dot" cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3"/>`).join("");
    const secondLine = opts.second ? `<polyline class="area2" points="${poly(opts.second)}"/>` : "";
    const xl = labels.map((l, i) => `<text class="axis" x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(l)}</text>`).join("");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" style="height:${H + 6}px" preserveAspectRatio="none">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".26"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<polygon points="${area}" fill="url(#${id})"/><polyline class="line" points="${poly(vals)}"/>${secondLine}${dots}${xl}</svg>`;
  }
  const spark = (vals, color) => {
    const W = 120, H = 34; const max = Math.max(...vals) * 1.15 || 1;
    const pts = vals.map((v, i) => `${(W * i / (vals.length - 1)).toFixed(1)},${(H - (v / max) * (H - 4) - 2).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:34px" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color || "var(--accent)"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  const bars = (list) => `<div class="bars">${list.map(r => { const [l, p, cls] = r; return `<div class="br"><div class="l">${esc(l)}</div><div class="tk"><div class="f ${cls || ""}" style="width:${p}%"></div></div><div class="p">${p}${typeof p === "number" ? "%" : ""}</div></div>`; }).join("")}</div>`;
  const barsCount = (list, max) => { const m = max || Math.max(...list.map(r => r[1]), 1); return `<div class="bars">${list.map(r => { const [l, v, cls] = r; return `<div class="br"><div class="l">${esc(l)}</div><div class="tk"><div class="f ${cls || ""}" style="width:${Math.round(v / m * 100)}%"></div></div><div class="p">${v}</div></div>`; }).join("")}</div>`; };
  function donut(segs) {
    const total = segs.reduce((t, s) => t + s[1], 0) || 1;
    const r = 52, C = 2 * Math.PI * r; let off = 0;
    const arcs = segs.map(s => { const frac = s[1] / total; const len = frac * C; const c = `<circle cx="64" cy="64" r="${r}" fill="none" stroke="${colorOf(s[2])}" stroke-width="20" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 64 64)"/>`; off += len; return c; }).join("");
    const leg = segs.map(s => `<div class="lr"><span class="dot" style="background:${colorOf(s[2])}"></span>${esc(s[0])}<b>${s[1]}%</b></div>`).join("");
    return `<div class="donut"><svg viewBox="0 0 128 128">${arcs}<text x="64" y="60" text-anchor="middle" style="font-size:15px;font-weight:800;fill:var(--text)">${total}%</text><text x="64" y="78" text-anchor="middle" style="font-size:9px;fill:var(--muted);font-family:var(--mono)">intents</text></svg><div class="leg">${leg}</div></div>`;
  }
  const funnel = (list) => { const max = list[0][1] || 1; return `<div class="funnel">${list.map(([l, v]) => `<div class="fn" style="width:${Math.max(38, v / max * 100)}%"><span>${esc(l)}</span><span class="v">${fmt(v)}</span></div>`).join("")}</div>`; };

  /* ---- badges ---- */
  const PRI = { high: "High", med: "Medium", low: "Low" };
  const priPill = p => `<span class="pri ${p}">${PRI[p] || p}</span>`;
  const aiBadge = (txt) => `<span class="aibadge">${icon("sparkles")}${esc(txt || "AI")}</span>`;
  const slaPill = (s, txt) => `<span class="sla ${s}">${esc(txt)}</span>`;
  const dot = cls => `<span class="dot ${cls}"></span>`;
  const channelTag = ch => ({ wa: '<span class="tg wa">WA</span>', web: '<span class="tg web">WEB</span>', ig: '<span class="tg ig">IG</span>' }[ch] || "");

  return { esc, fmt, uid, icon, I, initials, colorOf, areaChart, spark, bars, barsCount, donut, funnel, priPill, aiBadge, slaPill, dot, channelTag };
})();
