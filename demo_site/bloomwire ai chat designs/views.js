/* ============================================================
   Bloomwire — view module 1
   Dashboard · AI Chat Monitor · Order Conversations ·
   Customer Issues · Exchange Requests
   Contributes to window.VIEWS (html) + window.BIND (events)
   + window.OPEN (detail modals) + window.VH (shared helpers).
   Stateful actions use window.App.
   ============================================================ */
(function () {
  const UI = window.UI, DB = window.DB;
  const { esc, icon, fmt, priPill, aiBadge, slaPill, channelTag } = UI;
  window.VIEWS = window.VIEWS || {};
  window.BIND = window.BIND || {};
  window.OPEN = window.OPEN || {};

  /* ---------- shared helpers (window.VH) ---------- */
  const VH = window.VH = {
    tn: id => (DB.team.find(t => t.id === id) || {}).name || "Unassigned",
    ti: id => (DB.team.find(t => t.id === id) || {}).initials || "—",
    tr: id => (DB.team.find(t => t.id === id) || {}).role || "",
    ownerChip(id) {
      if (!id) return `<span class="badge">Unassigned</span>`;
      return `<span class="badge ac" title="${esc(VH.tr(id))}"><span style="width:16px;height:16px;border-radius:50%;background:var(--accent);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:700">${esc(VH.ti(id))}</span>${esc(VH.tn(id))}</span>`;
    },
    convStatusBadge(s) {
      return ({
        ai_assisting: '<span class="badge ai">AI Assisting</span>',
        ai_resolved: '<span class="badge gd">AI Resolved</span>',
        needs_staff: '<span class="badge wn">Needs Staff</span>',
        needs_review: '<span class="badge bd">Needs Review</span>',
        followup_scheduled: '<span class="badge tl">Follow-up</span>'
      })[s] || "";
    },
    openLoad(uid) {
      let n = 0;
      n += DB.tasks.filter(t => t.owner === uid && t.status !== "done").length;
      n += DB.issues.filter(i => i.owner === uid && !["resolved", "closed"].includes(i.status)).length;
      n += DB.exchanges.filter(e => e.owner === uid && !["resolved", "closed", "not_eligible"].includes(e.status)).length;
      n += DB.followups.filter(f => f.owner === uid && !["completed", "cancelled"].includes(f.status)).length;
      n += DB.conversations.filter(c => c.owner === uid && c.staffNeeded).length;
      return n;
    },
    miniThread(convId) {
      const c = DB.conversations.find(x => x.id === convId);
      if (!c) return `<div class="minithread"><div class="muted tiny">No linked chat transcript. This record was created from an AI bot/backend event.</div></div>`;
      return `<div class="minithread">${c.m.map(VH.msgHTML).join("")}</div>`;
    },
    msgHTML(m) {
      if (m.sys) return `<div class="msg sys">${esc(m.t)}</div>`;
      const who = m.from === "bot" ? "AI Bot" : m.from === "staff" ? (m.by || "Staff") : "";
      const card = m.card ? `<div style="margin-top:6px;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);font-size:11.5px"><b>${esc(m.card.title)}</b><div style="opacity:.85">${esc(m.card.sub)}</div></div>` : "";
      return `<div class="msg ${m.from}">${who ? `<span class="who">${esc(who)}</span>` : ""}${esc(m.t)}${card}<span class="mt">${esc(m.at)}</span></div>`;
    },
    rangeSeg() {
      const r = window.App.state.range;
      return `<div class="seg" data-rangeseg>${Object.entries(DB.ranges).map(([k, v]) => `<button data-range="${k}" class="${r === k ? "on" : ""}">${k === "custom" ? "Custom" : v.replace("Last ", "")}</button>`).join("")}</div>`;
    }
  };

  const goAttr = (go, kind, id) => `data-go="${go}"${kind ? ` data-okind="${kind}" data-oid="${id}"` : ""}`;

  /* ============================================================
     SCREEN 1 — PERFORMANCE DASHBOARD
     ============================================================ */
  const KPI_DEFS = [
    { key: "totalChats", label: "Total AI Chats", icon: "chat", style: "aik", go: "monitor", downGood: false },
    { key: "aiResolved", label: "AI Resolved Chats", icon: "checkCircle", style: "good", go: "monitor", downGood: false },
    { key: "needsStaff", label: "Needs Staff Action", icon: "handoff", style: "warn", go: "monitor", downGood: true },
    { key: "orderConv", label: "Order Conversations", icon: "box", style: "", go: "orders", downGood: false },
    { key: "issues", label: "Customer Issues", icon: "alert", style: "alert", go: "issues", downGood: true },
    { key: "exchanges", label: "Exchange Requests", icon: "swap", style: "", go: "exchanges", downGood: false },
    { key: "followups", label: "Future Follow-ups", icon: "calendar", style: "", go: "followups", downGood: false },
    { key: "customInq", label: "Custom Item Inquiries", icon: "tag", style: "", go: "items", downGood: false },
    { key: "pendingTasks", label: "Pending Staff Tasks", icon: "list", style: "", go: "tasks", downGood: true },
    { key: "overdue", label: "Overdue Actions", icon: "clock", style: "alert", go: "tasks", downGood: true },
    { key: "escalations", label: "AI Escalations", icon: "flame", style: "warn", go: "botstatus", downGood: true },
    { key: "resolvedToday", label: "Resolved Today", icon: "check", style: "good", go: "botstatus", downGood: false }
  ];
  function kpiCard(k) {
    const a = DB.analytics[window.App.state.range], v = a.kpi[k.key], d = a.delta[k.key];
    const ds = String(d).trim(), down = ds.startsWith("−"), flat = ds.replace(/[+\-−%\s]/g, "") === "0";
    const good = k.downGood ? down : !down, cls = flat ? "flat" : (good ? "" : "dn"), arrow = flat ? "•" : (down ? "▼" : "▲");
    return `<div class="card kpi ${k.style}" ${goAttr(k.go)} style="cursor:pointer">
      <div class="ic">${icon(k.icon)}</div>
      <div class="lab">${esc(k.label)}</div>
      <div class="val">${fmt(v)}</div>
      <div class="dl ${cls}">${arrow} ${esc(d)} <span style="color:var(--faint);font-weight:600">vs prev</span></div>
    </div>`;
  }
  function dashQueue() {
    const order = { high: 0, med: 1, low: 2 }, q = [];
    DB.exchanges.filter(e => ["needs_review", "new", "ai_identified"].includes(e.status)).forEach(e => q.push({ t: `Exchange ${e.id} — ${e.customer}`, s: `${e.item} · ${e.purchasedSize} → ${e.requestedSize}`, pri: e.priority, go: "exchanges", kind: "exchange", id: e.id }));
    DB.issues.filter(i => i.priority === "high" || i.sla === "breach").forEach(i => q.push({ t: `Issue ${i.id} — ${i.customer}`, s: `${i.type} · ${DB.issueStatusLabel[i.status]}`, pri: i.priority, go: "issues", kind: "issue", id: i.id }));
    DB.conversations.filter(c => c.staffNeeded && c.priority === "high").forEach(c => q.push({ t: `Chat — ${c.customer}`, s: `${c.intent} · ${DB.statusLabel[c.status]}`, pri: c.priority, go: "monitor", kind: "conv", id: c.id }));
    return q.sort((a, b) => order[a.pri] - order[b.pri]).slice(0, 6);
  }
  function escFeed() {
    const ic = { staff_handoff_required: ["bad", "handoff"], exchange_request_created: ["acc", "swap"], support_case_created: ["warn", "alert"], intent_detected: ["aii", "sparkles"] };
    return DB.botEvents.filter(e => ["staff_handoff_required", "exchange_request_created", "support_case_created"].includes(e.type)).slice(0, 5)
      .map(e => { const [c, i] = ic[e.type] || ["aii", "bot"]; return `<div class="it" style="cursor:default"><div class="ico ${c}">${icon(i)}</div><div><div class="ft">${esc(e.type)}</div><div class="fw">${esc(e.desc)}</div></div><div class="amt"><small>${esc(e.t)}</small></div></div>`; }).join("");
  }

  VIEWS.dashboard = function () {
    const App = window.App, a = DB.analytics[App.state.range];
    const kpis = KPI_DEFS.map(kpiCard).join("");
    const queue = dashQueue();
    const queueHTML = queue.map(x => `<div class="q-row" ${goAttr(x.go, x.kind, x.id)}><div><div class="qt">${esc(x.t)}</div><div class="qs">${esc(x.s)}</div></div><div class="qm">${priPill(x.pri)}${icon("arrowRight", "")}</div></div>`).join("") || `<div class="muted tiny">All caught up.</div>`;
    const overdue = DB.followups.filter(f => f.status === "overdue").length;
    const today = DB.followups.filter(f => f.status === "due_today").length;
    const upcoming = DB.followups.filter(f => f.status === "scheduled").length;
    const workload = DB.team.map(t => [t.name.split(" ")[0], VH.openLoad(t.id)]).sort((x, y) => y[1] - x[1]);
    const issuesByType = DB.issuesByType.map(r => [r[0], r[1]]);

    return `
    <div class="phead">
      <div><h1>Good morning, Maya 👋</h1><p>Here's what came through your AI bot and what needs action — <b>${esc(DB.ranges[App.state.range])}${App.state.range === "custom" ? " · " + DB.customRangeLabel : ""}</b>. The AI talks to customers; this dashboard turns those chats into trackable operations.</p></div>
      <div class="pacts">${VH.rangeSeg()}</div>
    </div>

    <div class="grid kpis">${kpis}</div>

    <div class="grid gd2" style="margin-top:16px">
      <div class="card"><div class="ch"><span class="ct">${icon("chat", "")}AI chats over time</span><span class="badge ai">${esc(DB.ranges[App.state.range])}</span></div><div class="cb">${UI.areaChart(a.chats, a.labels)}</div></div>
      <div class="card"><div class="ch"><span class="ct">AI resolved vs staff action needed</span></div><div class="cb">${UI.areaChart(a.resolved, a.labels, { second: a.staff })}
        <div style="display:flex;gap:18px;margin-top:10px;font-size:12px"><span><span class="dot ac"></span> Resolved by AI</span><span><span class="dot ai"></span> Needed staff action</span></div></div></div>
    </div>

    <div class="grid gd3" style="margin-top:16px">
      <div class="card"><div class="ch"><span class="ct">Conversation intent breakdown</span></div><div class="cb">${UI.donut(DB.intentBreakdown.map(r => [r[0], r[1], r[2]]))}</div></div>
      <div class="card"><div class="ch"><span class="ct">Customer issues by type</span><span class="badge bd">${a.kpi.issues}</span></div><div class="cb">${UI.barsCount(issuesByType, undefined)}</div></div>
      <div class="card"><div class="ch"><span class="ct">Top customer intents</span></div><div class="cb">${UI.bars(DB.topIntents)}</div></div>
    </div>

    <div class="grid gd2" style="margin-top:16px">
      <div class="card"><div class="ch"><span class="ct">${icon("flame", "")}High priority action queue</span><span class="badge bd">${queue.length}</span></div><div class="cb">${queueHTML}</div></div>
      <div class="card"><div class="ch"><span class="ct">Recent AI escalations</span><span class="badge ai">live</span></div><div class="cb"><div class="feed">${escFeed()}</div></div></div>
    </div>

    <div class="grid gd3" style="margin-top:16px">
      <div class="card" ${goAttr("exchanges")} style="cursor:pointer"><div class="ch"><span class="ct">${icon("swap", "")}Exchange requests trend</span><span class="badge wn">${a.kpi.exchanges}</span></div><div class="cb">${UI.areaChart(a.exch, a.labels, { h: 150 })}</div></div>
      <div class="card" ${goAttr("followups")} style="cursor:pointer"><div class="ch"><span class="ct">${icon("calendar", "")}Future follow-ups due</span></div><div class="cb"><div class="lst">
        <div class="it"><span><span class="dot bd"></span> Overdue</span><span class="v" style="color:var(--bad)">${overdue}</span></div>
        <div class="it"><span><span class="dot wn"></span> Due today</span><span class="v" style="color:var(--warn)">${today}</span></div>
        <div class="it"><span><span class="dot in"></span> Upcoming (scheduled)</span><span class="v">${upcoming}</span></div>
      </div></div></div>
      <div class="card" ${goAttr("tasks")} style="cursor:pointer"><div class="ch"><span class="ct">${icon("users", "")}Staff workload</span><span class="badge">open items</span></div><div class="cb">${UI.barsCount(workload)}</div></div>
    </div>`;
  };

  BIND.dashboard = function () {
    const App = window.App;
    const seg = document.querySelector("[data-rangeseg]");
    if (seg) seg.addEventListener("click", e => { const b = e.target.closest("[data-range]"); if (!b) return; App.setRange(b.dataset.range); });
    document.querySelectorAll("#view [data-go]").forEach(el => el.addEventListener("click", () => {
      const go = el.dataset.go, kind = el.dataset.okind, id = el.dataset.oid;
      App.go(go);
      if (kind === "exchange") window.OPEN.exchange(id);
      else if (kind === "issue") window.OPEN.issue(id);
      else if (kind === "conv") { App.state.monitorConv = id; App.render(); }
    }));
  };

  /* ============================================================
     SCREEN 2 — AI CHAT MONITOR / SHARED INBOX
     ============================================================ */
  const MFILTERS = [
    ["all", "All"], ["resolved", "AI Resolved"], ["needs_staff", "Needs Staff"], ["order", "Order Related"],
    ["issue", "Customer Issue"], ["exchange", "Exchange Request"], ["followup", "Future Follow-up"],
    ["custom", "Custom Item Inquiry"], ["unread", "Unread"], ["high", "High Priority"]
  ];
  const matchFilter = (c, k) => k === "all" ? true : k === "unread" ? c.unread > 0 : (c.filters || []).includes(k);
  /* per-conversation "days ago" so the chat list can be filtered by date (most chats = today) */
  const CONV_DAGO = { cv_aisha: 1, cv_hashan: 1, cv_dinusha: 2 };
  const convDago = c => CONV_DAGO[c.id] != null ? CONV_DAGO[c.id] : (/yesterday/i.test(c.time || "") ? 1 : 0);
  const convTimeLabel = c => { const d = convDago(c); return d === 0 ? c.time : d === 1 ? "Yesterday" : d + "d ago"; };
  const MDATES = [["all", "All dates"], ["today", "Today"], ["yesterday", "Yesterday"], ["week", "Last 7 days"]];
  function monitorList() {
    const App = window.App;
    let list = DB.conversations.filter(c => matchFilter(c, App.state.monitorFilter || "all"));
    const q = (App.state.monitorSearch || "").trim().toLowerCase();
    if (q) list = list.filter(c => (c.customer + " " + c.phone).toLowerCase().includes(q));
    const dk = App.state.monitorDate || "all";
    if (dk !== "all") list = list.filter(c => { const d = convDago(c); return dk === "today" ? d === 0 : dk === "yesterday" ? d === 1 : d <= 6; });
    return list;
  }
  function bindConvClicks() {
    const App = window.App;
    document.querySelectorAll("[data-conv]").forEach(el => el.addEventListener("click", () => { const c = DB.conversations.find(x => x.id === el.dataset.conv); if (c) c.unread = 0; App.state.monitorConv = el.dataset.conv; App.render(); }));
  }
  function renderConvs() {
    const wrap = document.querySelector(".convs"); if (!wrap) return;
    const list = monitorList();
    wrap.innerHTML = list.map(convItem).join("") || `<div class="empty" style="height:200px">No chats found</div>`;
    bindConvClicks();
  }

  function convItem(c) {
    const sel = window.App.state.monitorConv === c.id;
    const last = (c.m[c.m.length - 1] || {}).t || "";
    return `<div class="conv ${sel ? "on" : ""}" data-conv="${c.id}">
      <div class="av">${esc(c.initials)}</div>
      <div class="cm">
        <div class="cr"><span class="cn">${esc(c.customer)}</span>${channelTag(c.channel)}<span class="tm">${esc(convTimeLabel(c))}</span></div>
        <div class="ph">${esc(c.phone)}</div>
        <div class="cx">${esc(last)}</div>
        <div class="crow"><span class="badge">${esc(c.intent)}</span>${VH.convStatusBadge(c.status)}${c.aiHandled ? aiBadge("AI handled") : '<span class="badge wn">Staff needed</span>'}${c.priority === "high" ? priPill("high") : ""}</div>
      </div>
      ${c.unread ? `<span class="un">${c.unread}</span>` : ""}
    </div>`;
  }

  function threadHTML(c) {
    if (!c) return `<div class="empty">${icon("inbox")}<div>Select a conversation</div></div>`;
    const acts = [];
    if (c.staffNeeded) acts.push(`<button class="btn sm" data-qa="assign">Assign to me</button>`);
    acts.push(`<button class="btn sec sm" data-qa="resolve">Mark resolved</button>`);
    const draft = {
      "Exchange Request": "Hi! We've reviewed your request and the Large is available. We'll arrange the exchange — please keep the item unused. 🙏",
      "Custom Item Inquiry": "Hi! Thanks for the bulk requirement. Our team will share a quote shortly — could you confirm the exact quantity and deadline?",
      "Delivery Issue": "So sorry about the delay! We're checking with the courier now and will update you within the hour.",
      "Order Conversation": "Happy to help with sizing! Based on your build, I'd suggest M for an oversized look. Want me to reserve one?"
    }[c.intent] || "Thanks for reaching out! A teammate is looking into this and will reply shortly. 💛";
    return `
      <div class="thead">
        <div class="av">${esc(c.initials)}</div>
        <div style="min-width:0"><div class="nm">${esc(c.customer)} ${VH.convStatusBadge(c.status)}</div>
          <div class="sub">${channelTag(c.channel)} ${esc(c.phone)} · ${esc(c.intent)} · ${esc(c.bizLabel)}</div></div>
        <div class="ta">${acts.join("")}</div>
      </div>
      <div class="tbody" id="tbody">${c.m.map(VH.msgHTML).join("")}</div>
      <div class="tcompose">
        <div class="aidraft" data-draft="${esc(draft)}">${icon("sparkles")}<span><b>AI suggested reply</b> — ${esc(draft)}</span></div>
        <div class="crow"><input id="compose" placeholder="Reply as staff…"><button class="btn" data-qa="reply">${icon("send")}Send approved reply</button></div>
      </div>`;
  }

  function ctxPanel(c) {
    if (!c) return "";
    const linked = c.linked ? `<span class="badge in" data-linked="${c.linked.type}:${c.linked.id}" style="cursor:pointer">${icon("link")}${esc(c.linked.label)}</span>` : `<span class="badge">None</span>`;
    const QA = [
      ["assign", "user", "Assign to me"], ["task", "list", "Create staff task"], ["resolve", "check", "Mark as resolved"],
      ["escalate", "handoff", "Escalate to manager"], ["link_issue", "alert", "Link to issue"], ["link_followup", "calendar", "Link to follow-up"],
      ["note", "note", "Add internal note"]
    ];
    return `
      <div class="ctxh"><div class="av">${esc(c.initials)}</div><div style="min-width:0"><div class="nm">${esc(c.customer)}</div><div class="sub">${esc(c.phone)}</div></div></div>
      <div class="ctxb">
        <div class="ctxsec">
          <div class="sh">Details</div>
          <div class="kv"><span class="k">Detected intent</span><span class="v">${esc(c.intent)}</span></div>
          <div class="kv"><span class="k">Business category</span><span class="v">${esc(c.bizCategory)}</span></div>
          <div class="kv"><span class="k">Status</span><span class="v">${DB.statusLabel[c.status]}</span></div>
          <div class="kv"><span class="k">Priority</span><span class="v">${priPill(c.priority)}</span></div>
          <div class="kv"><span class="k">Linked record</span><span class="v">${linked}</span></div>
          <div class="kv"><span class="k">Staff owner</span><span class="v">${c.owner ? esc(VH.tn(c.owner)) : "Unassigned"}</span></div>
          <div class="kv"><span class="k">Next action</span><span class="v" style="max-width:150px;font-weight:600;color:var(--muted)">${esc(c.nextAction)}</span></div>
        </div>
        <div class="ctxsec">
          <div class="sh">Customer summary</div>
          <div class="notebox" style="color:var(--text)">${esc(c.summaryCustomer)}</div>
        </div>
        <div class="ctxsec">
          <div class="sh">Internal notes</div>
          <div class="notebox"><textarea id="ctxNote" placeholder="Add a note for the team…"></textarea></div>
          ${(c.notes || []).map(n => `<div class="tiny muted" style="margin-top:6px">• ${esc(n)}</div>`).join("")}
        </div>
        <div class="ctxsec">
          <div class="sh">Quick actions</div>
          <div class="qa-grid">${QA.map(([k, ic, l]) => `<button class="qa" data-qa="${k}">${icon(ic)}${esc(l)}</button>`).join("")}
            <button class="qa full" data-qa="reply2">${icon("send")}Send approved reply</button></div>
        </div>
      </div>`;
  }

  VIEWS.monitor = function () {
    const App = window.App;
    const list = monitorList();
    if (!list.find(c => c.id === App.state.monitorConv)) App.state.monitorConv = (list[0] || {}).id;
    const c = DB.conversations.find(x => x.id === App.state.monitorConv);
    const filters = MFILTERS.map(([k, l]) => { const n = DB.conversations.filter(x => matchFilter(x, k)).length; return `<button data-mfil="${k}" class="${(App.state.monitorFilter || "all") === k ? "on" : ""}">${l}<span class="n">${n}</span></button>`; }).join("");
    const dateSel = `<select id="mDate" class="msdate">${MDATES.map(([k, l]) => `<option value="${k}" ${(App.state.monitorDate || "all") === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    const needStaff = DB.conversations.filter(x => x.staffNeeded).length;
    return `
    <div class="phead">
      <div><h1>AI Chat Monitor</h1><p>Every customer conversation handled by your AI bot — live. AI assists and resolves; your team takes over where a human is needed. <b>${DB.conversations.length} active · ${needStaff} need staff.</b></p></div>
    </div>
    <div class="monitor">
      <div class="mcol list">
        <div class="msearch">
          <div class="msfield">${icon("search")}<input id="mSearch" placeholder="Search name or number…" value="${esc(App.state.monitorSearch || "")}" autocomplete="off"></div>
          ${dateSel}
        </div>
        <div class="ifl">${filters}</div>
        <div class="convs">${list.map(convItem).join("") || `<div class="empty" style="height:200px">No chats found</div>`}</div>
      </div>
      <div class="mcol thread">${threadHTML(c)}</div>
      <div class="mcol ctx">${ctxPanel(c)}</div>
    </div>`;
  };

  function monitorAction(act) {
    const App = window.App, c = DB.conversations.find(x => x.id === App.state.monitorConv); if (!c) return;
    if (act === "assign") { c.owner = App.cur; c.staffNeeded = true; App.toast("Assigned to you", c.customer, "acc"); App.render(); }
    else if (act === "resolve") { c.status = "ai_resolved"; c.staffNeeded = false; c.unread = 0; App.toast("Marked resolved", c.customer, "ok"); App.render(); }
    else if (act === "escalate") { App.toast("Escalated to manager", `${c.customer} · sent to ${VH.tn("u_ishara")}`, "warn"); }
    else if (act === "task") { window.App.newTask({ customer: c.customer, convId: c.id }); }
    else if (act === "link_issue") App.toast("Linked to issue", "Conversation linked to a customer issue", "acc");
    else if (act === "link_followup") App.toast("Linked to follow-up", "Conversation linked to a future follow-up", "acc");
    else if (act === "note") { const n = document.getElementById("ctxNote"); if (n && n.value.trim()) { c.notes = c.notes || []; c.notes.unshift(n.value.trim()); App.toast("Note added", c.customer, "acc"); App.render(); } else if (n) n.focus(); }
    else if (act === "reply" || act === "reply2") {
      const inp = document.getElementById("compose");
      const val = inp && inp.value.trim() ? inp.value.trim() : null;
      if (val) { c.m.push({ from: "staff", t: val, at: "now", by: VH.tn(App.cur) }); if (!c.owner) c.owner = App.cur; App.render(); }
      else if (inp) inp.focus();
    }
  }

  BIND.monitor = function () {
    const App = window.App;
    document.querySelectorAll("[data-mfil]").forEach(b => b.addEventListener("click", () => { App.state.monitorFilter = b.dataset.mfil; App.state.monitorConv = null; App.render(); }));
    bindConvClicks();
    const mSearch = document.getElementById("mSearch");
    if (mSearch) mSearch.addEventListener("input", () => { App.state.monitorSearch = mSearch.value; renderConvs(); });
    const mDate = document.getElementById("mDate");
    if (mDate) mDate.addEventListener("change", () => { App.state.monitorDate = mDate.value; renderConvs(); });
    document.querySelectorAll("[data-qa]").forEach(b => b.addEventListener("click", () => monitorAction(b.dataset.qa)));
    const draft = document.querySelector("[data-draft]");
    if (draft) draft.addEventListener("click", () => { const inp = document.getElementById("compose"); if (inp) { inp.value = draft.dataset.draft; inp.focus(); } });
    const inp = document.getElementById("compose"); if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") monitorAction("reply"); });
    const linked = document.querySelector("[data-linked]");
    if (linked) linked.addEventListener("click", () => { const [t, id] = linked.dataset.linked.split(":"); if (t === "exchange") { App.go("exchanges"); window.OPEN.exchange(id); } else if (t === "issue") { App.go("issues"); window.OPEN.issue(id); } else if (t === "order") { App.go("orders"); window.OPEN.order(id); } else if (t === "followup") App.go("followups"); else if (t === "task") App.go("tasks"); });
    const tb = document.getElementById("tbody"); if (tb) tb.scrollTop = tb.scrollHeight;
  };

  /* shared filter dropdown */
  function fdrop(label, key, opts, val) {
    return `<div class="fdrop"><label>${esc(label)}</label><select data-fkey="${key}">${opts.map(o => `<option value="${o[0]}" ${val === o[0] ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select></div>`;
  }
  function bindFilters() {
    document.querySelectorAll("[data-fkey]").forEach(s => s.addEventListener("change", () => { window.App.state[s.dataset.fkey] = s.value; window.App.render(); }));
  }
  const yn = b => b ? '<span class="badge wn">Yes</span>' : '<span class="badge gd">No</span>';
  const convLinkBtn = convId => convId ? `<button class="btn ghost xs" data-cvlink="${convId}">${icon("chat")}Chat</button>` : `<span class="tiny muted">—</span>`;

  /* ============================================================
     SCREEN 3 — ORDER CONVERSATIONS
     ============================================================ */
  VIEWS.orders = function () {
    const App = window.App, st = App.state;
    const view = st.orderView || "kanban";
    let rows = DB.orders.slice();
    if (st.orderStatus && st.orderStatus !== "all") rows = rows.filter(o => o.status === st.orderStatus);
    if (st.orderPri && st.orderPri !== "all") rows = rows.filter(o => o.priority === st.orderPri);
    const statusOpts = [["all", "All statuses"]].concat(DB.orderStages.map(s => [s, DB.orderStageLabel[s]]));
    const priOpts = [["all", "All priorities"], ["high", "High"], ["med", "Medium"], ["low", "Low"]];

    const board = `<div class="boardwrap"><div class="board">${DB.orderStages.map(s => {
      const cards = rows.filter(o => o.status === s);
      return `<div class="col"><div class="colh"><span class="cdot" style="background:${DB.orderStageDot[s]}"></span>${DB.orderStageLabel[s]}<span class="ct">${cards.length}</span></div>
        <div class="colb">${cards.map(o => `<div class="kcard" data-order="${o.id}">
          <div class="kc"><span class="co">${esc(o.customer)}</span><span class="id">${o.id}</span></div>
          <div class="pr">${esc(o.intent)}</div>
          <div class="km"><span class="badge ac">${esc(o.product)}</span></div>
          <div class="km">${o.staffNeeded ? '<span class="badge bd">Staff help</span>' : aiBadge("AI")}${priPill(o.priority)}<span style="margin-left:auto" class="tiny muted">${esc(o.lastActivity)}</span></div>
        </div>`).join("") || `<div class="tiny muted" style="text-align:center;padding:10px 0">—</div>`}</div></div>`;
    }).join("")}</div></div>`;

    const table = `<div class="card"><div class="tablewrap"><table class="tbl">
      <thead><tr><th>Customer</th><th>Intent</th><th>Product / Item</th><th>AI Summary</th><th>Status</th><th>Last Activity</th><th>Staff Needed</th><th>Priority</th><th>Chat</th></tr></thead>
      <tbody>${rows.map(o => `<tr data-order="${o.id}">
        <td><div class="cuser"><span class="av">${esc(o.initials)}</span><span class="nm">${esc(o.customer)}</span></div></td>
        <td>${esc(o.intent)}</td><td><b>${esc(o.product)}</b></td>
        <td class="aisum-cell">${esc(o.aiSummary)}</td>
        <td><span class="badge"><span class="dot" style="background:${DB.orderStageDot[o.status]}"></span>${DB.orderStageLabel[o.status]}</span></td>
        <td class="tiny muted">${esc(o.lastActivity)}</td><td>${yn(o.staffNeeded)}</td><td>${priPill(o.priority)}</td>
        <td>${convLinkBtn(o.convId)}</td></tr>`).join("")}</tbody></table></div></div>`;

    return `
    <div class="phead">
      <div><h1>Order Conversations</h1><p>Product & purchase-intent chats from your AI bot. <b>These are not Shopify orders</b> — they're conversations the bot is guiding toward a sale. Shopify still owns checkout, payments & real orders.</p></div>
      <div class="pacts"><div class="viewtoggle"><button data-oview="kanban" class="${view === "kanban" ? "on" : ""}">${icon("kanban")}Kanban</button><button data-oview="table" class="${view === "table" ? "on" : ""}">${icon("list")}Table</button></div></div>
    </div>
    <div class="tablebar" style="border:1px solid var(--line);border-radius:var(--r) var(--r) 0 0;background:var(--panel);margin-bottom:-1px">${fdrop("Status", "orderStatus", statusOpts, st.orderStatus || "all")}${fdrop("Priority", "orderPri", priOpts, st.orderPri || "all")}<span class="tiny muted" style="margin-left:auto">${rows.length} conversations</span></div>
    <div style="background:var(--panel);border:1px solid var(--line);border-top:0;border-radius:0 0 var(--r) var(--r);padding:14px">${view === "kanban" ? board : table}</div>`;
  };
  BIND.orders = function () {
    const App = window.App;
    document.querySelectorAll("[data-oview]").forEach(b => b.addEventListener("click", () => { App.state.orderView = b.dataset.oview; App.render(); }));
    document.querySelectorAll("[data-order]").forEach(el => el.addEventListener("click", e => { if (e.target.closest("[data-cvlink]")) return; window.OPEN.order(el.dataset.order); }));
    document.querySelectorAll("[data-cvlink]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); App.go("monitor"); App.state.monitorConv = b.dataset.cvlink; App.render(); }));
    bindFilters();
  };
  window.OPEN.order = function (id) {
    const App = window.App, o = DB.orders.find(x => x.id === id); if (!o) return;
    const stages = DB.orderStages.map(s => `<button data-ostage="${s}" class="${o.status === s ? "on" : ""}">${DB.orderStageLabel[s]}</button>`).join("");
    App.modal(`
      <div class="mh"><h3>${icon("box")} ${esc(o.customer)} <span class="badge">${o.id}</span></h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc"><div class="detail2">
        <div>
          <div class="ctxsec"><div class="sh">${icon("sparkles")} AI chat summary</div><div class="aisum"><div class="ah">${icon("bot")} Summary</div>${esc(o.aiSummary)}</div></div>
          <div class="ctxsec"><div class="sh">Next best action</div><div class="notebox" style="color:var(--text)">${esc(o.nextAction)}</div></div>
          <div class="ctxsec"><div class="sh">Staff notes</div><div class="notebox"><textarea placeholder="Add a note…">${esc(o.notes)}</textarea></div></div>
          <div class="ctxsec"><div class="sh">Timeline</div><div class="tl">
            <div class="ev ai"><div class="et">Conversation started via AI bot</div><div class="ew">${esc(o.lastActivity)} ago</div></div>
            <div class="ev ai"><div class="et">Intent detected: ${esc(o.intent)}</div><div class="ew">AI</div></div>
            <div class="ev"><div class="et">Status: ${DB.orderStageLabel[o.status]}</div><div class="ew">now</div></div>
          </div></div>
        </div>
        <div>
          <div class="infobox"><div class="ih">Customer</div><div style="font-weight:700">${esc(o.customer)}</div><div class="tiny muted">Product / item: ${esc(o.product)}</div>${o.convId ? `<button class="btn sec sm" style="margin-top:10px" data-cvlink="${o.convId}">${icon("chat")}Open full conversation</button>` : ""}</div>
          <div class="infobox"><div class="ih">Status</div><div class="stgrow" id="ostg">${stages}</div></div>
          <div class="infobox"><div class="ih">Flags</div><div style="display:flex;gap:7px;flex-wrap:wrap">${o.staffNeeded ? '<span class="badge bd">Needs staff help</span>' : aiBadge("AI handling")}${priPill(o.priority)}</div></div>
        </div>
      </div></div>
      <div class="mf"><button class="btn sec" data-close>Close</button><button class="btn" data-close>Save</button></div>`);
    document.getElementById("ostg").addEventListener("click", e => { const b = e.target.closest("[data-ostage]"); if (!b) return; o.status = b.dataset.ostage; App.toast("Order conversation updated", `${o.customer} → ${DB.orderStageLabel[o.status]}`, "acc"); App.closeModal(); App.render(); });
    document.querySelectorAll(".modal [data-cvlink]").forEach(b => b.addEventListener("click", () => { App.closeModal(); App.go("monitor"); App.state.monitorConv = b.dataset.cvlink; App.render(); }));
  };

  /* ============================================================
     SCREEN 4 — CUSTOMER ISSUES
     ============================================================ */
  VIEWS.issues = function () {
    const App = window.App, st = App.state;
    let rows = DB.issues.slice();
    if (st.issueStatus && st.issueStatus !== "all") rows = rows.filter(i => i.status === st.issueStatus);
    if (st.issueType && st.issueType !== "all") rows = rows.filter(i => i.type === st.issueType);
    if (st.issuePri && st.issuePri !== "all") rows = rows.filter(i => i.priority === st.issuePri);
    const statusOpts = [["all", "All statuses"]].concat(DB.issueStatuses.map(s => [s, DB.issueStatusLabel[s]]));
    const typeOpts = [["all", "All types"]].concat(DB.issueTypes.map(t => [t, t]));
    const priOpts = [["all", "All priorities"], ["high", "High"], ["med", "Medium"], ["low", "Low"]];
    const open = DB.issues.filter(i => !["resolved", "closed"].includes(i.status)).length;
    return `
    <div class="phead">
      <div><h1>Customer Issues</h1><p>Problems & complaints the AI bot detected in conversations and routed to your team. <b>${open} open · ${DB.issues.filter(i => i.sla === "breach").length} SLA breach.</b> Order context shown here is received from the AI bot/backend.</p></div>
    </div>
    <div class="card"><div class="tablebar">${fdrop("Status", "issueStatus", statusOpts, st.issueStatus || "all")}${fdrop("Type", "issueType", typeOpts, st.issueType || "all")}${fdrop("Priority", "issuePri", priOpts, st.issuePri || "all")}<span class="tiny muted" style="margin-left:auto">${rows.length} issues</span></div>
    <div class="tablewrap"><table class="tbl">
      <thead><tr><th>Issue ID</th><th>Customer</th><th>Issue type</th><th>AI summary</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Created</th><th>Last activity</th><th>SLA</th></tr></thead>
      <tbody>${rows.map(i => `<tr data-issue="${i.id}">
        <td class="mono">${i.id}</td>
        <td><div class="cuser"><span class="av">${esc(i.initials)}</span><span class="nm">${esc(i.customer)}</span></div></td>
        <td>${esc(i.type)}</td><td class="aisum-cell">${esc(i.aiSummary)}</td>
        <td>${priPill(i.priority)}</td><td><span class="badge">${DB.issueStatusLabel[i.status]}</span></td>
        <td>${i.owner ? esc(VH.ti(i.owner)) : '<span class="tiny muted">—</span>'}</td>
        <td class="tiny muted">${esc(i.created)}</td><td class="tiny muted">${esc(i.lastActivity)}</td>
        <td>${slaPill(i.sla, i.slaText)}</td></tr>`).join("")}</tbody></table></div></div>`;
  };
  BIND.issues = function () {
    document.querySelectorAll("[data-issue]").forEach(el => el.addEventListener("click", () => window.OPEN.issue(el.dataset.issue)));
    bindFilters();
  };
  window.OPEN.issue = function (id) {
    const App = window.App, i = DB.issues.find(x => x.id === id); if (!i) return;
    const stages = DB.issueStatuses.map(s => `<button data-istage="${s}" class="${i.status === s ? "on" : ""}">${DB.issueStatusLabel[s]}</button>`).join("");
    const owners = `<option value="">Unassigned</option>` + DB.team.map(t => `<option value="${t.id}" ${i.owner === t.id ? "selected" : ""}>${esc(t.name)} · ${esc(t.role)}</option>`).join("");
    App.modal(`
      <div class="mh"><h3>${icon("alert")} ${esc(i.type)} <span class="badge bd">${i.id}</span></h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc"><div class="detail2">
        <div>
          <div class="ctxsec"><div class="sh">${icon("sparkles")} AI issue summary</div><div class="aisum"><div class="ah">${icon("bot")} Detected by AI</div>${esc(i.aiSummary)}</div></div>
          <div class="ctxsec"><div class="sh">Linked AI chat history</div>${VH.miniThread(i.convId)}</div>
          <div class="ctxsec"><div class="sh">Resolution notes</div><div class="notebox"><textarea placeholder="Describe the resolution…">${esc(i.resolution)}</textarea></div></div>
        </div>
        <div>
          <div class="infobox"><div class="ih">Customer</div><div style="font-weight:700">${esc(i.customer)}</div><div class="tiny muted">Created ${esc(i.created)} · last activity ${esc(i.lastActivity)}</div></div>
          <div class="infobox"><div class="ih">Priority & SLA</div><div style="display:flex;gap:7px;align-items:center">${priPill(i.priority)}${slaPill(i.sla, i.slaText)}</div></div>
          <div class="infobox"><div class="ih">Assigned staff</div><select id="issOwner" style="width:100%;border:1px solid var(--line);background:var(--bg);border-radius:9px;padding:9px 10px;color:var(--text)">${owners}</select></div>
          <div class="infobox"><div class="ih">Status timeline</div><div class="stgrow" id="istg">${stages}</div></div>
          <div class="infobox"><div class="ih">Quick actions</div><div class="qa-grid">
            <button class="qa" data-iact="assign">${icon("user")}Assign to me</button>
            <button class="qa" data-iact="resolve">${icon("check")}Mark resolved</button>
            <button class="qa" data-iact="escalate">${icon("handoff")}Escalate</button>
            <button class="qa" data-iact="contact">${icon("phone")}Contact customer</button>
          </div></div>
        </div>
      </div></div>
      <div class="mf"><button class="btn sec" data-close>Close</button><button class="btn" data-close>Save changes</button></div>`);
    document.getElementById("istg").addEventListener("click", e => { const b = e.target.closest("[data-istage]"); if (!b) return; i.status = b.dataset.istage; App.toast("Issue updated", `${i.id} → ${DB.issueStatusLabel[i.status]}`, "acc"); App.closeModal(); App.render(); });
    document.getElementById("issOwner").addEventListener("change", e => { i.owner = e.target.value || null; App.toast("Assignee updated", i.id, "acc"); });
    document.querySelectorAll("[data-iact]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.iact;
      if (a === "assign") { i.owner = App.cur; App.toast("Assigned to you", i.id, "acc"); App.closeModal(); App.render(); }
      else if (a === "resolve") { i.status = "resolved"; App.toast("Issue resolved", i.id, "ok"); App.closeModal(); App.render(); }
      else if (a === "escalate") App.toast("Escalated", `${i.id} → ${VH.tn("u_ishara")}`, "warn");
      else if (a === "contact") App.toast("Contacting customer", i.customer, "acc");
    }));
  };

  /* ============================================================
     SCREEN 5 — EXCHANGE REQUESTS
     ============================================================ */
  VIEWS.exchanges = function () {
    const App = window.App, st = App.state;
    let rows = DB.exchanges.slice();
    if (st.exStatus && st.exStatus !== "all") rows = rows.filter(e => e.status === st.exStatus);
    if (st.exPri && st.exPri !== "all") rows = rows.filter(e => e.priority === st.exPri);
    if (st.exOwner && st.exOwner !== "all") rows = rows.filter(e => (e.owner || "none") === st.exOwner);
    const statusOpts = [["all", "All statuses"]].concat(DB.exchangeStatuses.map(s => [s, DB.exchangeStatusLabel[s]]));
    const priOpts = [["all", "All priorities"], ["high", "High"], ["med", "Medium"], ["low", "Low"]];
    const ownerOpts = [["all", "All staff"], ["none", "Unassigned"]].concat(DB.team.map(t => [t.id, t.name]));
    const need = DB.exchanges.filter(e => e.status === "needs_review").length;
    return `
    <div class="phead">
      <div><h1>Exchange Requests</h1><p>Size, fit & colour swaps customers raise with the AI bot after delivery. <b>${need} awaiting staff review.</b></p></div>
    </div>
    <div class="hint" style="margin-bottom:16px">${icon("shield")}<div><b>AI cannot approve exchanges.</b> The bot only identifies, summarizes and routes the request — a staff member must approve or resolve it.</div></div>
    <div class="card"><div class="tablebar">${fdrop("Status", "exStatus", statusOpts, st.exStatus || "all")}${fdrop("Priority", "exPri", priOpts, st.exPri || "all")}${fdrop("Assigned", "exOwner", ownerOpts, st.exOwner || "all")}<span class="tiny muted" style="margin-left:auto">${rows.length} requests</span></div>
    <div class="tablewrap"><table class="tbl">
      <thead><tr><th>ID</th><th>Customer</th><th>Item</th><th>Size change</th><th>Reason</th><th>AI summary</th><th>Status</th><th>Priority</th><th>Assigned</th></tr></thead>
      <tbody>${rows.map(e => `<tr data-exchange="${e.id}">
        <td class="mono">${e.id}</td>
        <td><div class="cuser"><span class="av">${esc(e.initials)}</span><span class="nm">${esc(e.customer)}</span></div></td>
        <td><b>${esc(e.item)}</b></td>
        <td><span class="badge">${esc(e.purchasedSize)}</span> ${icon("arrowRight", "")} <span class="badge ac">${esc(e.requestedSize)}</span></td>
        <td class="tiny muted" style="max-width:160px">${esc(e.reason)}</td>
        <td class="aisum-cell">${esc(e.aiSummary)}</td>
        <td><span class="badge ${e.status === "approved" || e.status === "resolved" ? "gd" : e.status === "not_eligible" ? "bd" : e.status === "needs_review" ? "wn" : ""}">${DB.exchangeStatusLabel[e.status]}</span></td>
        <td>${priPill(e.priority)}</td><td>${e.owner ? esc(VH.ti(e.owner)) : '<span class="tiny muted">—</span>'}</td></tr>`).join("")}</tbody></table></div></div>`;
  };
  BIND.exchanges = function () {
    document.querySelectorAll("[data-exchange]").forEach(el => el.addEventListener("click", () => window.OPEN.exchange(el.dataset.exchange)));
    bindFilters();
  };
  window.OPEN.exchange = function (id) {
    const App = window.App, e = DB.exchanges.find(x => x.id === id); if (!e) return;
    const stages = DB.exchangeStatuses.map(s => `<button data-exstage="${s}" class="${e.status === s ? "on" : ""}">${DB.exchangeStatusLabel[s]}</button>`).join("");
    const appBadge = e.approval === "approved" ? '<span class="badge gd">Approved</span>' : e.approval === "rejected" ? '<span class="badge bd">Not eligible</span>' : '<span class="badge wn">Pending staff approval</span>';
    App.modal(`
      <div class="mh"><h3>${icon("swap")} Exchange ${e.id} <span class="badge ${e.priority === "high" ? "bd" : ""}">${esc(e.customer)}</span></h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc"><div class="detail2">
        <div>
          <div class="ctxsec"><div class="sh">${icon("sparkles")} AI summary</div><div class="aisum"><div class="ah">${icon("bot")} Routed by AI · cannot approve</div>${esc(e.aiSummary)}</div></div>
          <div class="ctxsec"><div class="sh">Full chat history</div>${VH.miniThread(e.convId)}</div>
          <div class="ctxsec"><div class="sh">Resolution timeline</div><div class="tl">
            <div class="ev ai"><div class="et">Exchange identified by AI</div><div class="ew">${esc(e.created)}</div></div>
            <div class="ev ai"><div class="et">Request created & routed to staff</div><div class="ew">${esc(e.created)}</div></div>
            <div class="ev ${["approved", "resolved"].includes(e.status) ? "done" : ""}"><div class="et">Status: ${DB.exchangeStatusLabel[e.status]}</div><div class="ew">${esc(e.lastActivity)}</div></div>
          </div></div>
        </div>
        <div>
          <div class="infobox"><div class="ih">Customer</div><div style="font-weight:700">${esc(e.customer)}</div><div class="tiny muted">Created ${esc(e.created)}</div></div>
          <div class="infobox"><div class="ih">Product / item summary (from AI)</div>
            <div class="kv"><span class="k">Item</span><span class="v">${esc(e.item)}</span></div>
            <div class="kv"><span class="k">Purchased size</span><span class="v">${esc(e.purchasedSize)}</span></div>
            <div class="kv"><span class="k">Requested size</span><span class="v" style="color:var(--accent)">${esc(e.requestedSize)}</span></div>
            <div class="kv"><span class="k">Reason</span><span class="v" style="max-width:150px;font-weight:600;color:var(--muted)">${esc(e.reason)}</span></div>
            <div class="kv"><span class="k">Approval status</span><span class="v">${appBadge}</span></div>
            <div class="kv"><span class="k">Assigned</span><span class="v">${e.owner ? esc(VH.tn(e.owner)) : "Unassigned"}</span></div>
          </div>
          <div class="infobox"><div class="ih">Status</div><div class="stgrow" id="exstg">${stages}</div></div>
          <div class="infobox"><div class="ih">Staff notes</div><div class="notebox"><textarea placeholder="Add a note…"></textarea></div></div>
          <div class="infobox"><div class="ih">Quick actions</div><div class="qa-grid">
            <button class="qa" data-exact="assign">${icon("user")}Assign to me</button>
            <button class="qa" data-exact="contact">${icon("phone")}Contact customer</button>
            <button class="qa" data-exact="photo">${icon("note")}Request photo</button>
            <button class="qa" data-exact="followup">${icon("calendar")}Create follow-up</button>
            <button class="qa" data-exact="approve">${icon("check")}Approve manually</button>
            <button class="qa" data-exact="reject">${icon("x")}Mark not eligible</button>
            <button class="qa full" data-exact="resolve">${icon("checkCircle")}Mark resolved</button>
          </div></div>
        </div>
      </div></div>
      <div class="mf"><button class="btn sec" data-close>Close</button></div>`);
    document.getElementById("exstg").addEventListener("click", ev => { const b = ev.target.closest("[data-exstage]"); if (!b) return; e.status = b.dataset.exstage; App.toast("Exchange updated", `${e.id} → ${DB.exchangeStatusLabel[e.status]}`, "acc"); App.closeModal(); App.render(); });
    document.querySelectorAll("[data-exact]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.exact;
      if (a === "assign") { e.owner = App.cur; App.toast("Assigned to you", e.id, "acc"); App.closeModal(); App.render(); }
      else if (a === "approve") { e.status = "approved"; e.approval = "approved"; App.toast("Exchange approved", `${e.id} · staff approved`, "ok"); App.closeModal(); App.render(); }
      else if (a === "reject") { e.status = "not_eligible"; e.approval = "rejected"; App.toast("Marked not eligible", e.id, "warn"); App.closeModal(); App.render(); }
      else if (a === "resolve") { e.status = "resolved"; App.toast("Exchange resolved", e.id, "ok"); App.closeModal(); App.render(); }
      else if (a === "contact") App.toast("Contacting customer", e.customer, "acc");
      else if (a === "photo") App.toast("Photo requested", `Asked ${e.customer} for a photo`, "acc");
      else if (a === "followup") App.toast("Follow-up created", `Linked to ${e.id}`, "acc");
    }));
  };

  /* === VIEWS_APPEND === */
})();
