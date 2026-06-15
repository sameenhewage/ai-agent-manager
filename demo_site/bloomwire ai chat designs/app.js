/* ============================================================
   Bloomwire — AI Chat Operations Dashboard · core engine
   Owns app state, rendering, navigation, the top header
   controls, modals, toasts and a simulated realtime feed.
   View HTML lives in window.VIEWS / events in window.BIND.
   ============================================================ */
window.App = (function () {
  const DB = window.DB, UI = window.UI;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = UI.esc;

  const state = {
    view: "dashboard", range: "7d",
    monitorConv: "cv_nethmi", monitorFilter: "all",
    orderView: "kanban", reportTab: "conversation"
  };
  const cur = "u_maya"; // the signed-in user (Maya, Owner)

  const CRUMB = {
    dashboard: ["Dashboard", "Performance overview"],
    monitor: ["AI Chat Monitor", "Live shared inbox from your AI bot"],
    orders: ["Order Conversations", "Purchase-intent chats — not Shopify orders"],
    issues: ["Customer Issues", "Problems & complaints from AI chats"],
    exchanges: ["Exchange Requests", "Size, fit & colour swaps — staff approval"],
    followups: ["Future Follow-ups", "Promises captured for later"],
    items: ["Custom Items", "What the AI bot can reference"],
    tasks: ["Staff Tasks", "Actions created from AI conversations"],
    botstatus: ["AI Bot Status", "Bot health & event stream"],
    reports: ["Analytics Reports", "Exportable analytics by date range"],
    settings: ["Settings", "Console, team & AI bot connection"]
  };

  /* ---------------- modal + toast ---------------- */
  function modal(html, size) {
    $("#modalRoot").innerHTML = `<div class="scrim" id="scrim"><div class="modal ${size || "lg"}">${html}</div></div>`;
    $("#scrim").addEventListener("click", e => { if (e.target.id === "scrim") closeModal(); });
    $$("[data-close]").forEach(b => b.addEventListener("click", closeModal));
  }
  function closeModal() { $("#modalRoot").innerHTML = ""; }
  function toast(t, x, kind) {
    const ico = { ok: "check", warn: "alert", acc: "sparkles" }[kind] || "bot";
    const d = document.createElement("div");
    d.className = "toast " + (kind || "");
    d.innerHTML = `<div class="ti">${UI.icon(ico)}</div><div><div class="tt">${esc(t)}</div><div class="tx">${esc(x)}</div></div>`;
    $("#toasts").appendChild(d);
    setTimeout(() => { d.style.opacity = "0"; d.style.transform = "translateX(20px)"; setTimeout(() => d.remove(), 300); }, 4200);
  }

  /* ---------------- render ---------------- */
  function navCounts() {
    const c = {
      orders: DB.orders.filter(o => !["converted", "dropped"].includes(o.status)).length,
      issues: DB.issues.filter(i => !["resolved", "closed"].includes(i.status)).length,
      exchanges: DB.exchanges.filter(e => e.status === "needs_review").length,
      followups: DB.followups.filter(f => ["overdue", "due_today"].includes(f.status)).length,
      tasks: DB.tasks.filter(t => t.status !== "done").length
    };
    Object.entries(c).forEach(([k, v]) => { const el = $(`[data-ct="${k}"]`); if (el) el.textContent = v; });
  }
  function render() {
    const view = window.VIEWS[state.view] || window.VIEWS.dashboard;
    $("#view").innerHTML = view();
    $("#crumb").childNodes[0].nodeValue = CRUMB[state.view][0];
    $("#crumbSub").textContent = CRUMB[state.view][1];
    $$("#nav a").forEach(a => a.classList.toggle("on", a.dataset.v === state.view));
    $("#rangeLabel").textContent = state.range === "custom" ? DB.customRangeLabel : DB.ranges[state.range];
    navCounts();
    (window.BIND[state.view] || function () { })();
  }
  function go(v) { state.view = v; closePops(); $("#side").classList.remove("open"); render(); window.scrollTo({ top: 0 }); }
  function setRange(r) { state.range = r; $("#rangeLabel").textContent = r === "custom" ? DB.customRangeLabel : DB.ranges[r]; closePops(); render(); }
  function newTask(p) { window.OPEN.newTask(p); }

  /* ---------------- popovers ---------------- */
  function closePops() {
    ["#rangeMenu", "#quickMenu", "#notifPanel", "#searchRes"].forEach(s => { const el = $(s); if (el) el.classList.remove("open"); });
    $("#popScrim").classList.remove("on");
  }
  function togglePop(sel) {
    const el = $(sel), willOpen = !el.classList.contains("open");
    closePops();
    if (willOpen) { el.classList.add("open"); $("#popScrim").classList.add("on"); }
  }

  /* ---------------- header builders ---------------- */
  function buildRangeMenu() {
    $("#rangeMenu").innerHTML = Object.entries(DB.ranges).map(([k, v]) =>
      `<button data-rng="${k}" class="${state.range === k ? "on" : ""}">${esc(v)}${k === "custom" ? `<span class="k">${esc(DB.customRangeLabel)}</span>` : ""}</button>`).join("");
    $$("#rangeMenu [data-rng]").forEach(b => b.addEventListener("click", () => setRange(b.dataset.rng)));
  }
  function buildQuickMenu() {
    const items = [
      ["task", "list", "New staff task"], ["issue", "alert", "Log customer issue"],
      ["followup", "calendar", "New follow-up"], ["item", "tag", "Add custom item"]
    ];
    $("#quickMenu").innerHTML = `<div class="qh">Quick actions</div>` + items.map(([k, ic, l]) => `<button data-quick="${k}">${UI.icon(ic)}${l}</button>`).join("");
    $$("#quickMenu [data-quick]").forEach(b => b.addEventListener("click", () => {
      closePops(); const k = b.dataset.quick;
      if (k === "task") window.OPEN.newTask();
      else if (k === "issue") window.OPEN.newIssue();
      else if (k === "followup") window.OPEN.newFollowup();
      else if (k === "item") window.OPEN.newItem();
    }));
  }
  function buildNotifs() {
    const icoCls = { bad: "bad", warn: "warn", aii: "aii", info: "info", good: "good", teal: "teal" };
    const icoName = { exchange: "swap", issue: "alert", custom: "tag", task: "list", resolved: "check", followup: "calendar" };
    $("#notifPanel").innerHTML = `<div class="nh">Notifications<a data-readall>Mark all read</a></div><div class="nl">` +
      DB.notifications.map((n, i) => `<div class="ni" data-notif="${i}"><div class="ico ${icoCls[n.ic] || "info"}">${UI.icon(icoName[n.type] || "bell")}</div><div><div class="nt">${esc(n.t)}</div><div class="nw">${esc(n.w)}</div></div></div>`).join("") + `</div>`;
    $$("#notifPanel [data-notif]").forEach(el => el.addEventListener("click", () => { const n = DB.notifications[+el.dataset.notif]; closePops(); $("#bellDot").style.display = "none"; if (n) go(n.go); }));
    const ra = $("#notifPanel [data-readall]"); if (ra) ra.addEventListener("click", () => { closePops(); $("#bellDot").style.display = "none"; toast("All caught up", "Notifications marked read", "ok"); });
  }

  /* ---------------- global search ---------------- */
  function searchIndex() {
    const idx = [];
    DB.conversations.forEach(c => idx.push({ label: c.customer, sub: `Chat · ${c.intent}`, q: `${c.customer} ${c.intent} ${c.phone}`, run: () => { go("monitor"); state.monitorConv = c.id; render(); } }));
    DB.issues.forEach(i => idx.push({ label: `${i.id} — ${i.customer}`, sub: `Issue · ${i.type}`, q: `${i.id} ${i.customer} ${i.type}`, run: () => { go("issues"); window.OPEN.issue(i.id); } }));
    DB.exchanges.forEach(e => idx.push({ label: `${e.id} — ${e.customer}`, sub: `Exchange · ${e.item}`, q: `${e.id} ${e.customer} ${e.item}`, run: () => { go("exchanges"); window.OPEN.exchange(e.id); } }));
    DB.orders.forEach(o => idx.push({ label: `${o.id} — ${o.customer}`, sub: `Order chat · ${o.product}`, q: `${o.id} ${o.customer} ${o.product} ${o.intent}`, run: () => { go("orders"); window.OPEN.order(o.id); } }));
    DB.followups.forEach(f => idx.push({ label: `${f.id} — ${f.customer}`, sub: `Follow-up · ${f.reason}`, q: `${f.id} ${f.customer} ${f.reason}`, run: () => { go("followups"); window.OPEN.followup(f.id); } }));
    DB.tasks.forEach(t => idx.push({ label: `${t.id} — ${t.title}`, sub: `Task · ${t.customer}`, q: `${t.id} ${t.title} ${t.customer}`, run: () => { go("tasks"); window.OPEN.task(t.id); } }));
    return idx;
  }
  function runSearch(qRaw) {
    const q = qRaw.trim().toLowerCase(), box = $("#searchRes");
    if (!q) { box.classList.remove("open"); $("#popScrim").classList.remove("on"); return; }
    const hits = searchIndex().filter(x => x.q.toLowerCase().includes(q)).slice(0, 8);
    box.innerHTML = hits.length ? `<div class="sg">Results</div>` + hits.map((h, i) => `<div class="sr" data-sr="${i}"><div class="av">${esc(UI.initials(h.label))}</div><div><div class="t">${esc(h.label)}</div><div class="s">${esc(h.sub)}</div></div></div>`).join("") : `<div class="sg">No matches</div>`;
    box.classList.add("open"); $("#popScrim").classList.add("on");
    $$("#searchRes [data-sr]").forEach((el, i) => el.addEventListener("click", () => { $("#searchInput").value = ""; closePops(); hits[i].run(); }));
  }

  /* ---------------- realtime simulation ---------------- */
  let inIdx = 0;
  function tickRealtime() {
    const src = DB.incoming[inIdx % DB.incoming.length]; inIdx++;
    const map = {
      order: { status: "ai_assisting", staffNeeded: false, aiHandled: true, bizLabel: "Order Related", filters: ["order", "unread"] },
      issue: { status: "needs_staff", staffNeeded: true, aiHandled: false, bizLabel: "Customer Issue", filters: ["needs_staff", "issue", "high", "unread"] },
      exchange: { status: "needs_review", staffNeeded: true, aiHandled: false, bizLabel: "Exchange Request", filters: ["needs_staff", "exchange", "unread"] },
      followup: { status: "followup_scheduled", staffNeeded: false, aiHandled: true, bizLabel: "Future Follow-up", filters: ["followup"] },
      custom: { status: "needs_staff", staffNeeded: true, aiHandled: false, bizLabel: "Custom Item Inquiry", filters: ["needs_staff", "custom", "high", "unread"] }
    }[src.type];
    const id = "cv_rt" + Date.now();
    const conv = Object.assign({
      id, customer: src.customer, initials: src.initials, phone: "+94 7" + Math.floor(Math.random() * 9) + " " + Math.floor(1000000 + Math.random() * 8999999),
      channel: src.channel, intent: src.intent, priority: src.type === "issue" || src.type === "custom" ? "high" : "low", time: "now", unread: 1,
      confidence: src.type === "order" || src.type === "followup" ? 0.9 : 0.78, bizCategory: src.intent,
      summaryCustomer: "New inbound conversation via the AI bot.", aiSummary: `AI detected intent: ${src.intent}. ${map.staffNeeded ? "Routed to staff." : "AI is assisting."}`,
      linked: null, owner: null, nextAction: map.staffNeeded ? "Needs staff action" : "AI assisting",
      notes: [], m: [{ from: "cust", t: src.text, at: "now" }, { from: "bot", t: map.staffNeeded ? "Thanks! I've shared this with our team — someone will help shortly. 🙌" : "Thanks for reaching out! Let me help with that ✨", at: "now" }]
    }, map);
    DB.conversations.unshift(conv);
    DB.botEvents.unshift({ t: nowClock(), type: map.staffNeeded ? "staff_handoff_required" : "intent_detected", desc: `${src.customer} · ${src.intent}` });
    DB.botEvents.unshift({ t: nowClock(), type: "message_received", desc: `${src.customer} · inbound ${src.channel.toUpperCase()} message` });
    DB.botStatus.lastEventSec = 0;
    $("#bellDot").style.display = "block";
    toast("New AI conversation", `${src.customer}: ${src.text}`, "acc");
    if (["monitor", "dashboard", "botstatus"].includes(state.view)) render();
  }
  function nowClock() { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, "0")).join(":"); }
  function tickClock() {
    DB.botStatus.lastEventSec += 1;
    const el = $("#lastEv"); if (el) el.textContent = DB.botStatus.lastEventSec + "s";
  }

  /* ---------------- init ---------------- */
  function init() {
    buildRangeMenu(); buildQuickMenu(); buildNotifs();
    $("#nav").addEventListener("click", e => { const a = e.target.closest("a[data-v]"); if (!a) return; go(a.dataset.v); });
    $("#menuBtn").addEventListener("click", () => $("#side").classList.toggle("open"));
    $("#themeBtn").addEventListener("click", () => { const h = document.documentElement; h.dataset.theme = h.dataset.theme === "dark" ? "light" : "dark"; });
    $("#rangeBtn").addEventListener("click", e => { e.stopPropagation(); togglePop("#rangeMenu"); });
    $("#quickBtn").addEventListener("click", e => { e.stopPropagation(); togglePop("#quickMenu"); });
    $("#bell").addEventListener("click", e => { e.stopPropagation(); togglePop("#notifPanel"); });
    $("#popScrim").addEventListener("click", closePops);
    const si = $("#searchInput");
    if (si) {
      si.addEventListener("input", () => runSearch(si.value));
      si.addEventListener("focus", () => { if (si.value) runSearch(si.value); });
    }
    document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); closePops(); } });
    render();
    setInterval(tickRealtime, 15000);
    setInterval(tickClock, 1000);
  }

  /* public API used by view modules */
  const api = { state, cur, DB, go, setRange, render, modal, closeModal, toast, newTask };
  window.App = api; // expose BEFORE init() so the first render can read window.App
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  return api;
})();
