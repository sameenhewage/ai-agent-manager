/* ============================================================
   Bloomwire — view module 2
   Future Follow-ups · Custom Items · Staff Tasks ·
   AI Bot Status · Analytics Reports · Settings
   Adds to window.VIEWS / window.BIND / window.OPEN.
   ============================================================ */
(function () {
  const UI = window.UI, DB = window.DB, VH = window.VH;
  const { esc, icon, fmt, priPill, aiBadge } = UI;
  window.VIEWS = window.VIEWS || {};
  window.BIND = window.BIND || {};
  window.OPEN = window.OPEN || {};

  function fdrop(label, key, opts, val) {
    return `<div class="fdrop"><label>${esc(label)}</label><select data-fkey="${key}">${opts.map(o => `<option value="${o[0]}" ${val === o[0] ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select></div>`;
  }
  function bindFilters() { document.querySelectorAll("[data-fkey]").forEach(s => s.addEventListener("change", () => { window.App.state[s.dataset.fkey] = s.value; window.App.render(); })); }

  /* ============================================================
     SCREEN 6 — FUTURE FOLLOW-UPS
     ============================================================ */
  function fuCard(f) {
    const cls = f.status === "overdue" ? "over" : f.status === "due_today" ? "today" : "";
    return `<div class="fucard ${cls}" data-fu="${f.id}">
      <div class="fd"><div class="d">${f.day}</div><div class="mo">${esc(f.mo)}</div></div>
      <div style="flex:1;min-width:0">
        <div class="fn2">${esc(f.customer)} <span class="mono tiny muted">${f.id}</span></div>
        <div class="fr">${esc(f.reason)}</div>
        <div class="fm"><span class="badge ac">${esc(f.product)}</span>${priPill(f.priority)}${VH.ownerChip(f.owner)}</div>
        <div class="fm"><button class="btn sec xs" data-fudone="${f.id}">${icon("check")}Mark completed</button><span class="tiny muted">last chat ${esc(f.lastChat)}</span></div>
      </div></div>`;
  }
  VIEWS.followups = function () {
    const groups = {
      over: DB.followups.filter(f => f.status === "overdue"),
      today: DB.followups.filter(f => f.status === "due_today"),
      up: DB.followups.filter(f => f.status === "scheduled")
    };
    const done = DB.followups.filter(f => ["contacted", "completed", "cancelled"].includes(f.status));
    const col = (title, cls, arr) => `<div><div class="colhead ${cls}">${title}<span class="ct">${arr.length}</span></div>${arr.map(fuCard).join("") || `<div class="muted tiny">Nothing here.</div>`}</div>`;
    return `
    <div class="phead"><div><h1>Future Follow-ups</h1><p>Promises the AI captured for later — restock pings, "I'll order next week", bulk confirmations. Don't let them slip. <b>${groups.over.length} overdue · ${groups.today.length} due today.</b></p></div>
      <div class="pacts"><button class="btn" data-newfu>${icon("plus")}New follow-up</button></div></div>
    <div class="fcols">
      ${col("Overdue", "over", groups.over)}
      ${col("Due today", "today", groups.today)}
      ${col("Upcoming", "", groups.up)}
    </div>
    <div class="card" style="margin-top:16px"><div class="ch"><span class="ct">Recently contacted & completed</span></div><div class="cb"><div class="lst">
      ${done.map(f => `<div class="it" data-fu="${f.id}" style="cursor:pointer"><span><b>${esc(f.customer)}</b> · ${esc(f.reason)} <span class="badge ${f.status === "completed" ? "gd" : f.status === "cancelled" ? "bd" : "in"}">${DB.followupStatusLabel[f.status]}</span></span><span class="v tiny muted">${esc(f.date)}</span></div>`).join("") || `<div class="muted tiny">None yet.</div>`}
    </div></div></div>`;
  };
  BIND.followups = function () {
    const App = window.App;
    document.querySelectorAll("[data-fudone]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); const f = DB.followups.find(x => x.id === b.dataset.fudone); if (f) { f.status = "completed"; App.toast("Follow-up completed", `${f.customer} · ${f.id}`, "ok"); App.render(); } }));
    document.querySelectorAll("[data-fu]").forEach(el => el.addEventListener("click", () => window.OPEN.followup(el.dataset.fu)));
    const nf = document.querySelector("[data-newfu]"); if (nf) nf.addEventListener("click", () => window.OPEN.newFollowup());
  };
  window.OPEN.followup = function (id) {
    const App = window.App, f = DB.followups.find(x => x.id === id); if (!f) return;
    App.modal(`
      <div class="mh"><h3>${icon("calendar")} Follow-up ${f.id}</h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc"><div class="detail2">
        <div>
          <div class="ctxsec"><div class="sh">${icon("sparkles")} AI summary</div><div class="aisum"><div class="ah">${icon("bot")} Captured by AI</div>${esc(f.aiSummary)}</div></div>
          <div class="ctxsec"><div class="sh">Linked AI chat</div>${VH.miniThread(f.convId)}</div>
        </div>
        <div>
          <div class="infobox"><div class="ih">Details</div>
            <div class="kv"><span class="k">Customer</span><span class="v">${esc(f.customer)}</span></div>
            <div class="kv"><span class="k">Reason</span><span class="v" style="max-width:160px;text-align:right">${esc(f.reason)}</span></div>
            <div class="kv"><span class="k">Product / item</span><span class="v">${esc(f.product)}</span></div>
            <div class="kv"><span class="k">Follow-up date</span><span class="v">${esc(f.date)}</span></div>
            <div class="kv"><span class="k">Status</span><span class="v">${DB.followupStatusLabel[f.status]}</span></div>
            <div class="kv"><span class="k">Assigned</span><span class="v">${f.owner ? esc(VH.tn(f.owner)) : "Unassigned"}</span></div>
            <div class="kv"><span class="k">Priority</span><span class="v">${priPill(f.priority)}</span></div>
          </div>
          <div class="infobox"><div class="ih">Quick actions</div><div class="qa-grid">
            <button class="qa" data-fuact="contact">${icon("phone")}Contact now</button>
            <button class="qa" data-fuact="reschedule">${icon("calendar")}Reschedule</button>
            <button class="qa" data-fuact="done">${icon("check")}Mark completed</button>
            <button class="qa" data-fuact="cancel">${icon("x")}Cancel</button>
          </div></div>
        </div>
      </div></div>
      <div class="mf"><button class="btn sec" data-close>Close</button></div>`);
    document.querySelectorAll("[data-fuact]").forEach(b => b.addEventListener("click", () => {
      const a = b.dataset.fuact;
      if (a === "done") { f.status = "completed"; App.toast("Follow-up completed", f.customer, "ok"); App.closeModal(); App.render(); }
      else if (a === "cancel") { f.status = "cancelled"; App.toast("Follow-up cancelled", f.customer, "warn"); App.closeModal(); App.render(); }
      else if (a === "contact") { f.status = "contacted"; App.toast("Contacting customer", f.customer, "acc"); App.closeModal(); App.render(); }
      else if (a === "reschedule") App.toast("Reschedule", "Pick a new date (demo)", "acc");
    }));
  };
  window.OPEN.newFollowup = function () {
    const App = window.App;
    App.modal(`<div class="mh"><h3>${icon("calendar")} New follow-up</h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc">
        <div class="frow"><div class="field"><label>Customer</label><input id="nf_cust" placeholder="Customer name"></div><div class="field"><label>Follow-up date</label><input id="nf_date" placeholder="e.g. Jun 22"></div></div>
        <div class="field"><label>Reason</label><input id="nf_reason" placeholder="e.g. Notify when Large restocks"></div>
        <div class="frow"><div class="field"><label>Product / item</label><input id="nf_prod" placeholder="e.g. Oversized Tee — Large"></div><div class="field"><label>Assign to</label><select id="nf_owner">${DB.team.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div></div>
      </div>
      <div class="mf"><button class="btn sec" data-close>Cancel</button><button class="btn" id="nf_save">Create follow-up</button></div>`);
    document.getElementById("nf_save").addEventListener("click", () => {
      const f = { id: "FU-" + (80 + Math.floor(Math.random() * 19)), customer: document.getElementById("nf_cust").value || "New customer", initials: UI.initials(document.getElementById("nf_cust").value || "NC"), reason: document.getElementById("nf_reason").value || "Follow up", product: document.getElementById("nf_prod").value || "—", date: document.getElementById("nf_date").value || "Jun 22", day: 22, mo: "Jun", status: "scheduled", owner: document.getElementById("nf_owner").value, aiSummary: "Manually created follow-up.", lastChat: "now", priority: "med", convId: null };
      DB.followups.unshift(f); App.closeModal(); App.go("followups"); App.toast("Follow-up created", f.customer, "ok");
    });
  };

  /* ============================================================
     SCREEN 7 — CUSTOM ITEMS  (kept deliberately simple)
     ============================================================ */
  VIEWS.items = function () {
    const rows = DB.customItems.map(it => `<tr data-item="${it.id}">
      <td><b>${esc(it.name)}</b></td><td>${esc(it.category)}</td>
      <td class="aisum-cell">${esc(it.description)}</td>
      <td>${it.sizes.map(s => `<span class="badge" style="margin:1px">${esc(s)}</span>`).join(" ")}</td>
      <td>${it.colors.map(c => `<span class="badge" style="margin:1px">${esc(c)}</span>`).join(" ")}</td>
      <td class="mono">${it.minQty}</td>
      <td>${it.quote ? '<span class="badge wn">Yes</span>' : '<span class="badge gd">No</span>'}</td>
      <td><span class="badge ${it.status === "active" ? "gd" : ""}">${it.status === "active" ? "● Active" : "○ Inactive"}</span></td>
      <td class="tiny muted">${esc(it.updated)}</td>
      <td><button class="btn ghost xs" data-edititem="${it.id}">${icon("edit")}Edit</button></td></tr>`).join("");
    return `
    <div class="phead"><div><h1>Custom Items</h1><p>A simple list of custom item types your AI bot can reference when customers ask about made-to-order products. This is not a custom-order CRM — large requests still route to <b>Staff Tasks</b> for a quote.</p></div>
      <div class="pacts"><button class="btn" data-newitem>${icon("plus")}Add item</button></div></div>
    <div class="hint info" style="margin-bottom:16px">${icon("bot")}<div>These items help the AI bot understand what you offer. The bot's prompts & logic live in your bot platform — here you only define what it can reference.</div></div>
    <div class="card"><div class="tablewrap"><table class="tbl">
      <thead><tr><th>Item name</th><th>Category</th><th>Description</th><th>Available sizes</th><th>Available colors</th><th>Min qty</th><th>Quote required</th><th>Status</th><th>Last updated</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
  };
  BIND.items = function () {
    const App = window.App;
    const nb = document.querySelector("[data-newitem]"); if (nb) nb.addEventListener("click", () => window.OPEN.newItem());
    document.querySelectorAll("[data-edititem]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); window.OPEN.newItem(DB.customItems.find(x => x.id === b.dataset.edititem)); }));
    document.querySelectorAll("[data-item]").forEach(el => el.addEventListener("click", () => window.OPEN.newItem(DB.customItems.find(x => x.id === el.dataset.item))));
  };
  window.OPEN.newItem = function (item) {
    const App = window.App, ed = !!item; item = item || {};
    const cats = ["Custom Apparel", "Accessories", "Uniforms", "Other"];
    App.modal(`<div class="mh"><h3>${icon("tag")} ${ed ? "Edit" : "Add"} custom item</h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc">
        <div class="frow"><div class="field"><label>Item name</label><input id="ci_name" value="${esc(item.name || "")}" placeholder="e.g. T-Shirts"></div>
          <div class="field"><label>Category</label><select id="ci_cat">${cats.map(c => `<option ${item.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>
        <div class="field"><label>Description</label><textarea id="ci_desc" rows="2" placeholder="What is this custom item?">${esc(item.description || "")}</textarea></div>
        <div class="frow"><div class="field"><label>Available sizes (comma separated)</label><input id="ci_sizes" value="${esc((item.sizes || []).join(", "))}" placeholder="S, M, L, XL"></div>
          <div class="field"><label>Available colors (comma separated)</label><input id="ci_colors" value="${esc((item.colors || []).join(", "))}" placeholder="Black, White, Navy"></div></div>
        <div class="frow"><div class="field"><label>Minimum quantity</label><input id="ci_moq" type="number" value="${item.minQty || 50}"></div>
          <div class="field"><label>Notes for AI bot</label><input id="ci_notes" value="${esc(item.botNotes || "")}" placeholder="How should the bot talk about this?"></div></div>
        <div class="swrow"><div><div class="sw-t">Quote required</div><div class="sw-d">Bot should route to staff for a quote</div></div><div class="sw-r"><button class="switch ${item.quote === false ? "" : "on"}" id="ci_quote"></button></div></div>
        <div class="swrow"><div><div class="sw-t">Active</div><div class="sw-d">Bot can offer this item</div></div><div class="sw-r"><button class="switch ${item.status === "inactive" ? "" : "on"}" id="ci_active"></button></div></div>
      </div>
      <div class="mf">${ed ? `<div class="left"><button class="btn ghost" id="ci_del">Delete</button></div>` : ""}<button class="btn sec" data-close>Cancel</button><button class="btn" id="ci_save">${ed ? "Save changes" : "Add item"}</button></div>`);
    document.querySelectorAll(".modal .switch").forEach(s => s.addEventListener("click", () => s.classList.toggle("on")));
    document.getElementById("ci_save").addEventListener("click", () => {
      const splitc = v => v.split(",").map(x => x.trim()).filter(Boolean);
      const data = { name: document.getElementById("ci_name").value || "New item", category: document.getElementById("ci_cat").value, description: document.getElementById("ci_desc").value, sizes: splitc(document.getElementById("ci_sizes").value) || [], colors: splitc(document.getElementById("ci_colors").value) || [], minQty: +document.getElementById("ci_moq").value || 0, quote: document.getElementById("ci_quote").classList.contains("on"), status: document.getElementById("ci_active").classList.contains("on") ? "active" : "inactive", botNotes: document.getElementById("ci_notes").value, updated: "just now" };
      if (ed) { Object.assign(item, data); App.toast("Item updated", data.name, "ok"); }
      else { data.id = "ci" + (DB.customItems.length + 1 + Math.floor(Math.random() * 50)); DB.customItems.unshift(data); App.toast("Item added", `${data.name} — the bot can now reference it`, "ok"); }
      App.closeModal(); App.render();
    });
    if (ed) document.getElementById("ci_del").addEventListener("click", () => { const i = DB.customItems.indexOf(item); if (i > -1) DB.customItems.splice(i, 1); App.closeModal(); App.render(); App.toast("Item deleted", item.name, "warn"); });
  };

  /* ============================================================
     SCREEN 8 — STAFF TASKS
     ============================================================ */
  function taskCard(t) {
    return `<div class="kcard" data-task="${t.id}">
      <div class="kc"><span class="co">${esc(t.title)}</span><span class="id">${t.id}</span></div>
      <div class="pr">${esc(t.customer)} · <span class="badge">${esc(t.type)}</span></div>
      <div class="km"><span class="badge in">${icon("link")}${esc(t.linked.label)}</span>${priPill(t.priority)}</div>
      <div class="km"><span class="tiny muted">${icon("clock", "")} ${esc(t.due)}</span><span class="own" title="${esc(VH.tn(t.owner))}">${esc(t.owner ? VH.ti(t.owner) : "—")}</span></div>
    </div>`;
  }
  VIEWS.tasks = function () {
    const a = DB.analytics[window.App.state.range].kpi;
    const dueToday = DB.tasks.filter(t => /Today/.test(t.due) && t.status !== "done").length;
    const doneToday = DB.tasks.filter(t => t.status === "done").length;
    const stat = (lab, val, cls) => `<div class="card kpi ${cls}"><div class="ic">${icon(cls === "alert" ? "clock" : cls === "good" ? "check" : "list")}</div><div class="lab">${lab}</div><div class="val">${val}</div></div>`;
    const workload = DB.team.map(t => {
      const open = VH.openLoad(t.id), over = DB.tasks.filter(k => k.owner === t.id && k.status === "overdue").length;
      return `<div class="card wcard"><div class="wn"><span class="av">${esc(t.initials)}</span><div><div class="wnm">${esc(t.name.split(" ")[0])} ${esc((t.name.split(" ")[1] || "")[0] || "")}.</div><div class="wr">${esc(t.role)}</div></div></div>
        <div class="wstat"><span>Open<b>${open}</b></span><span>Overdue<b style="color:${over ? "var(--bad)" : "inherit"}">${over}</b></span></div></div>`;
    }).join("");
    const board = `<div class="boardwrap"><div class="board">${DB.taskStatuses.map(s => {
      const cards = DB.tasks.filter(t => t.status === s);
      const dotc = { overdue: "var(--bad)", done: "var(--good)", waiting: "var(--warn)", in_progress: "var(--ai)", assigned: "var(--info)", new: "var(--faint)" }[s];
      return `<div class="col"><div class="colh"><span class="cdot" style="background:${dotc}"></span>${DB.taskStatusLabel[s]}<span class="ct">${cards.length}</span></div><div class="colb">${cards.map(taskCard).join("") || `<div class="tiny muted" style="text-align:center;padding:10px 0">—</div>`}</div></div>`;
    }).join("")}</div></div>`;
    return `
    <div class="phead"><div><h1>Staff Tasks</h1><p>Every task here was created from an AI conversation event — so nothing a customer asked for gets lost. <b>${a.pendingTasks} pending · ${a.overdue} overdue.</b></p></div>
      <div class="pacts"><button class="btn" data-newtask>${icon("plus")}New task</button></div></div>
    <div class="grid gd4" style="margin-bottom:18px">
      ${stat("Pending tasks", a.pendingTasks, "")}
      ${stat("Overdue", a.overdue, "alert")}
      ${stat("Due today", dueToday, "warn")}
      ${stat("Completed today", doneToday, "good")}
    </div>
    <div class="card" style="margin-bottom:18px"><div class="ch"><span class="ct">${icon("users", "")}Staff workload</span></div><div class="cb"><div class="workload">${workload}</div></div></div>
    <div class="card"><div class="ch"><span class="ct">${icon("kanban", "")}Task board</span></div><div class="cb">${board}</div></div>`;
  };
  BIND.tasks = function () {
    const App = window.App;
    document.querySelectorAll("[data-task]").forEach(el => el.addEventListener("click", () => window.OPEN.task(el.dataset.task)));
    const nt = document.querySelector("[data-newtask]"); if (nt) nt.addEventListener("click", () => window.OPEN.newTask());
  };
  window.OPEN.task = function (id) {
    const App = window.App, t = DB.tasks.find(x => x.id === id); if (!t) return;
    const stages = DB.taskStatuses.map(s => `<button data-tstage="${s}" class="${t.status === s ? "on" : ""}">${DB.taskStatusLabel[s]}</button>`).join("");
    const owners = `<option value="">Unassigned</option>` + DB.team.map(u => `<option value="${u.id}" ${t.owner === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("");
    App.modal(`<div class="mh"><h3>${icon("list")} ${esc(t.title)} <span class="badge">${t.id}</span></h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc">
        <div class="infobox"><div class="ih">Details</div>
          <div class="kv"><span class="k">Customer</span><span class="v">${esc(t.customer)}</span></div>
          <div class="kv"><span class="k">Task type</span><span class="v">${esc(t.type)}</span></div>
          <div class="kv"><span class="k">Linked case</span><span class="v"><span class="badge in" data-tlink="${t.linked.type}:${t.linked.id}" style="cursor:pointer">${icon("link")}${esc(t.linked.label)}</span></span></div>
          <div class="kv"><span class="k">Priority</span><span class="v">${priPill(t.priority)}</span></div>
          <div class="kv"><span class="k">Due</span><span class="v">${esc(t.due)}</span></div>
          <div class="kv"><span class="k">Created from AI event</span><span class="v mono tiny">${esc(t.fromEvent)}</span></div>
        </div>
        <div class="field"><label>Assigned to</label><select id="tk_owner">${owners}</select></div>
        <div class="field"><label>Status</label><div class="stgrow" id="tkstg">${stages}</div></div>
        <div class="field"><label>Notes</label><textarea placeholder="Add a note…"></textarea></div>
      </div>
      <div class="mf"><div class="left"><button class="btn sec" data-tkdone>${icon("check")}Mark done</button></div><button class="btn sec" data-close>Close</button><button class="btn" data-close>Save</button></div>`);
    document.getElementById("tkstg").addEventListener("click", e => { const b = e.target.closest("[data-tstage]"); if (!b) return; t.status = b.dataset.tstage; App.toast("Task updated", `${t.id} → ${DB.taskStatusLabel[t.status]}`, "acc"); App.closeModal(); App.render(); });
    document.getElementById("tk_owner").addEventListener("change", e => { t.owner = e.target.value || null; App.toast("Task reassigned", t.id, "acc"); });
    document.querySelector("[data-tkdone]").addEventListener("click", () => { t.status = "done"; App.toast("Task completed", t.id, "ok"); App.closeModal(); App.render(); });
    document.querySelector("[data-tlink]").addEventListener("click", () => { const [ty, lid] = document.querySelector("[data-tlink]").dataset.tlink.split(":"); App.closeModal(); if (ty === "issue") { App.go("issues"); window.OPEN.issue(lid); } else if (ty === "exchange") { App.go("exchanges"); window.OPEN.exchange(lid); } else if (ty === "order") { App.go("orders"); window.OPEN.order(lid); } else if (ty === "followup") { App.go("followups"); window.OPEN.followup(lid); } else if (ty === "monitor") { App.go("monitor"); App.state.monitorConv = lid; App.render(); } });
  };
  window.OPEN.newTask = function (prefill) {
    const App = window.App; prefill = prefill || {};
    App.modal(`<div class="mh"><h3>${icon("list")} New staff task</h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc">
        <div class="field"><label>Task title</label><input id="tk_title" placeholder="e.g. Call customer about exchange"></div>
        <div class="frow"><div class="field"><label>Customer</label><input id="tk_cust" value="${esc(prefill.customer || "")}"></div>
          <div class="field"><label>Task type</label><select id="tk_type">${DB.taskTypes.map(t => `<option>${t}</option>`).join("")}</select></div></div>
        <div class="frow"><div class="field"><label>Priority</label><select id="tk_pri"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></div>
          <div class="field"><label>Assign to</label><select id="tk_own">${DB.team.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></div></div>
        <div class="field"><label>Due</label><input id="tk_due" placeholder="e.g. Today 4:00pm"></div>
      </div>
      <div class="mf"><button class="btn sec" data-close>Cancel</button><button class="btn" id="tk_save">Create task</button></div>`);
    document.getElementById("tk_save").addEventListener("click", () => {
      const t = { id: "TSK-" + (560 + Math.floor(Math.random() * 39)), title: document.getElementById("tk_title").value || "New task", customer: document.getElementById("tk_cust").value || "—", linked: { type: prefill.convId ? "monitor" : "monitor", id: prefill.convId || "", label: "Chat" }, type: document.getElementById("tk_type").value, priority: document.getElementById("tk_pri").value, due: document.getElementById("tk_due").value || "Today", owner: document.getElementById("tk_own").value, status: "new", fromEvent: "manual" };
      DB.tasks.unshift(t); App.closeModal(); App.go("tasks"); App.toast("Task created", t.title, "ok");
    });
  };

  /* ============================================================
     SCREEN 9 — AI BOT STATUS / LOGS
     ============================================================ */
  VIEWS.botstatus = function () {
    const s = DB.botStatus;
    const sc = (ic, cls, lab, val, ok) => `<div class="card statc"><div class="si ico ${cls}">${icon(ic)}</div><div class="sl">${lab}</div><div class="sv">${val}${ok ? '<span class="dot gd"></span>' : ""}</div></div>`;
    const evlog = DB.botEvents.map(e => `<div class="ev"><span class="et">${esc(e.t)}</span><span class="ek ${DB.eventClass[e.type]}">${esc(e.type)}</span><span class="ed">${esc(e.desc)}</span></div>`).join("");
    return `
    <div class="phead"><div><h1>AI Bot Status</h1><p>Live health of the AI bot and the event stream feeding this console. The bot runs externally — here you observe it. <b>Uptime ${s.uptime}.</b></p></div>
      <div class="pacts"><span class="badge gd"><span class="dot gd"></span>All systems operational</span></div></div>
    <div class="statcards">
      ${sc("bot", "good", "Bot", "Online", true)}
      ${sc("chat", "good", "WhatsApp API", "Connected", true)}
      ${sc("handoff", "good", "Event stream", "Active", true)}
      ${sc("clock", "info", "Last event received", `<span id="lastEv">${s.lastEventSec}s</span> ago`, false)}
      ${sc("sparkles", "aii", "AI confidence avg", `${s.confidence}%`, false)}
    </div>
    <div class="grid gd3">
      <div class="card"><div class="ch"><span class="ct">AI performance</span></div><div class="cb"><div class="lst">
        <div class="it"><span>AI handled conversations</span><span class="v">${s.handled}</span></div>
        <div class="it"><span>AI resolved rate</span><span class="v" style="color:var(--good)">${s.resolvedRate}%</span></div>
        <div class="it"><span>AI escalations</span><span class="v" style="color:var(--warn)">${s.escalations}</span></div>
        <div class="it"><span>Low-confidence conversations</span><span class="v">${s.lowConfidence}</span></div>
        <div class="it"><span>Failed / unclear conversations</span><span class="v" style="color:var(--bad)">${s.failed}</span></div>
        <div class="it"><span>Average AI response time</span><span class="v">${s.avgResponse}</span></div>
      </div></div></div>
      <div class="card"><div class="ch"><span class="ct">Top intents</span></div><div class="cb">${UI.bars(DB.topIntents)}</div></div>
      <div class="card"><div class="ch"><span class="ct">Handoff reasons</span></div><div class="cb">${UI.bars(DB.handoffReasons.map(r => [r[0], r[1], "wn"]))}</div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="ch"><span class="ct">${icon("list", "")}Recent system events</span><span class="badge ai"><span class="dot ai"></span>streaming</span></div><div class="cb"><div class="evlog">${evlog}</div></div></div>`;
  };
  BIND.botstatus = function () { };

  /* ============================================================
     SCREEN 10 — ANALYTICS REPORTS
     ============================================================ */
  function rcards(arr) { return `<div class="grid gd4">${arr.map(([l, v, cls, ic]) => `<div class="card kpi ${cls || ""}"><div class="ic">${icon(ic || "chart")}</div><div class="lab">${esc(l)}</div><div class="val">${v}</div></div>`).join("")}</div>`; }
  function rtable(head, rows) { return `<div class="card"><div class="ch"><span class="ct">Data</span><button class="btn ghost sm" data-export>${icon("download")}Export</button></div><div class="tablewrap"><table class="tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`; }
  function reportContent(tab) {
    const a = DB.analytics[window.App.state.range], k = a.kpi;
    const cnt = (arr, f) => arr.filter(f).length, pct = (n, d) => d ? Math.round(n / d * 100) + "%" : "0%";
    const chartCard = (title, inner) => `<div class="card"><div class="ch"><span class="ct">${esc(title)}</span><span class="badge ai">${esc(DB.ranges[window.App.state.range])}</span></div><div class="cb">${inner}</div></div>`;
    if (tab === "conversation") return rcards([["Total AI chats", fmt(k.totalChats), "aik", "chat"], ["AI resolved", fmt(k.aiResolved), "good", "checkCircle"], ["Needs staff", fmt(k.needsStaff), "warn", "handoff"], ["Resolve rate", pct(k.aiResolved, k.totalChats), "", "target"]])
      + `<div class="grid gd2" style="margin-top:16px">${chartCard("AI chats over time", UI.areaChart(a.chats, a.labels))}${rtable(["Intent", "Share", "Est. chats"], DB.intentBreakdown.map(r => [esc(r[0]), r[1] + "%", Math.round(r[1] / 100 * k.totalChats)]))}</div>`;
    if (tab === "ai") return rcards([["AI-handled", pct(k.aiResolved, k.totalChats), "aik", "bot"], ["Avg response", DB.botStatus.avgResponse, "", "clock"], ["Confidence avg", DB.botStatus.confidence + "%", "good", "sparkles"], ["Escalations", fmt(k.escalations), "warn", "handoff"]])
      + `<div class="grid gd2" style="margin-top:16px">${chartCard("AI resolved vs staff action", UI.areaChart(a.resolved, a.labels, { second: a.staff }))}${rtable(["Handoff reason", "Share"], DB.handoffReasons.map(r => [esc(r[0]), r[1] + "%"]))}</div>`;
    if (tab === "issue") return rcards([["Total issues", fmt(k.issues), "alert", "alert"], ["Open", cnt(DB.issues, i => !["resolved", "closed"].includes(i.status)), "warn", "alert"], ["SLA breach", cnt(DB.issues, i => i.sla === "breach"), "alert", "clock"], ["Avg resolution", "6h", "", "check"]])
      + `<div class="grid gd2" style="margin-top:16px">${chartCard("Issues by type", UI.barsCount(DB.issuesByType))}${rtable(["ID", "Customer", "Type", "Status", "SLA"], DB.issues.slice(0, 6).map(i => [i.id, esc(i.customer), esc(i.type), DB.issueStatusLabel[i.status], UI.slaPill(i.sla, i.slaText)]))}</div>`;
    if (tab === "exchange") return rcards([["Total requests", fmt(k.exchanges), "", "swap"], ["Needs review", cnt(DB.exchanges, e => e.status === "needs_review"), "warn", "alert"], ["Approved", cnt(DB.exchanges, e => e.approval === "approved"), "good", "check"], ["Not eligible", cnt(DB.exchanges, e => e.approval === "rejected"), "alert", "x"]])
      + `<div class="grid gd2" style="margin-top:16px">${chartCard("Exchange requests trend", UI.areaChart(a.exch, a.labels))}${rtable(["ID", "Customer", "Item", "Change", "Status"], DB.exchanges.map(e => [e.id, esc(e.customer), esc(e.item), `${esc(e.purchasedSize)} → ${esc(e.requestedSize)}`, DB.exchangeStatusLabel[e.status]]))}</div>`;
    if (tab === "followup") { const byS = DB.followupStatuses.map(s => [DB.followupStatusLabel[s], cnt(DB.followups, f => f.status === s)]); return rcards([["Scheduled", cnt(DB.followups, f => f.status === "scheduled"), "", "calendar"], ["Due today", cnt(DB.followups, f => f.status === "due_today"), "warn", "clock"], ["Overdue", cnt(DB.followups, f => f.status === "overdue"), "alert", "alert"], ["Completed", cnt(DB.followups, f => f.status === "completed"), "good", "check"]])
      + `<div class="grid gd2" style="margin-top:16px">${chartCard("Follow-ups by status", UI.barsCount(byS))}${rtable(["ID", "Customer", "Reason", "Date", "Status"], DB.followups.map(f => [f.id, esc(f.customer), esc(f.reason), esc(f.date), DB.followupStatusLabel[f.status]]))}</div>`; }
    if (tab === "order") { const byS = DB.orderStages.map(s => [DB.orderStageLabel[s], cnt(DB.orders, o => o.status === s)]); return rcards([["Order chats", fmt(k.orderConv), "", "box"], ["Converted", cnt(DB.orders, o => o.status === "converted"), "good", "check"], ["Dropped", cnt(DB.orders, o => o.status === "dropped"), "alert", "x"], ["Needs staff", cnt(DB.orders, o => o.staffNeeded), "warn", "handoff"]])
      + `<div class="grid gd2" style="margin-top:16px">${chartCard("Order conversations by stage", UI.barsCount(byS))}${rtable(["ID", "Customer", "Product", "Status"], DB.orders.slice(0, 7).map(o => [o.id, esc(o.customer), esc(o.product), DB.orderStageLabel[o.status]]))}</div>`; }
    if (tab === "task") { const byS = DB.taskStatuses.map(s => [DB.taskStatusLabel[s], cnt(DB.tasks, t => t.status === s)]); return rcards([["Pending", fmt(k.pendingTasks), "", "list"], ["Overdue", fmt(k.overdue), "alert", "clock"], ["Done today", cnt(DB.tasks, t => t.status === "done"), "good", "check"], ["From AI events", "100%", "aik", "bot"]])
      + `<div class="grid gd2" style="margin-top:16px">${chartCard("Tasks by status", UI.barsCount(byS))}${rtable(["ID", "Title", "Type", "Owner", "Status"], DB.tasks.slice(0, 7).map(t => [t.id, esc(t.title), esc(t.type), t.owner ? esc(VH.ti(t.owner)) : "—", DB.taskStatusLabel[t.status]]))}</div>`; }
    /* custom */
    return rcards([["Custom inquiries", fmt(k.customInq), "", "tag"], ["Items active", cnt(DB.customItems, i => i.status === "active"), "good", "check"], ["Items total", DB.customItems.length, "", "list"], ["Quote required", cnt(DB.customItems, i => i.quote), "warn", "alert"]])
      + `<div class="grid gd2" style="margin-top:16px">${rtable(["Item", "Category", "Min qty", "Quote", "Status"], DB.customItems.map(i => [esc(i.name), esc(i.category), i.minQty, i.quote ? "Yes" : "No", i.status]))}${rtable(["Recent inquiry", "Quantity", "Routed to"], [["School T-shirts (Sapumal)", "1,000", "Sales"], ["Staff polos (Pasan)", "40", "Sales"], ["Sports tees (Green School)", "300", "Sales"]])}</div>`;
  }
  VIEWS.reports = function () {
    const tab = window.App.state.reportTab || "conversation";
    const tabs = DB.reportTabs.map(([k, l]) => `<button data-rtab="${k}" class="${tab === k ? "on" : ""}">${esc(l)}</button>`).join("");
    return `
    <div class="phead"><div><h1>Analytics Reports</h1><p>Exportable reports across every part of the operation, filtered by date range. <b>${esc(DB.ranges[window.App.state.range])}${window.App.state.range === "custom" ? " · " + DB.customRangeLabel : ""}.</b></p></div>
      <div class="pacts">${VH.rangeSeg()}<button class="btn" data-export>${icon("download")}Export report</button></div></div>
    <div class="rtabs">${tabs}</div>
    ${reportContent(tab)}`;
  };
  BIND.reports = function () {
    const App = window.App;
    document.querySelectorAll("[data-rtab]").forEach(b => b.addEventListener("click", () => { App.state.reportTab = b.dataset.rtab; App.render(); }));
    const seg = document.querySelector("[data-rangeseg]"); if (seg) seg.addEventListener("click", e => { const b = e.target.closest("[data-range]"); if (!b) return; App.setRange(b.dataset.range); });
    document.querySelectorAll("[data-export]").forEach(b => b.addEventListener("click", () => { const l = (DB.reportTabs.find(t => t[0] === (App.state.reportTab || "conversation")) || [])[1] || "Report"; App.toast("Export started", `${l} · ${DB.ranges[App.state.range]} (CSV)`, "ok"); }));
  };

  /* ============================================================
     SCREEN 11 — SETTINGS
     ============================================================ */
  VIEWS.settings = function () {
    const sw = (on, id, t, d) => `<div class="swrow"><div><div class="sw-t">${esc(t)}</div><div class="sw-d">${esc(d)}</div></div><div class="sw-r"><button class="switch ${on ? "on" : ""}" data-sw="${id}"></button></div></div>`;
    const members = DB.team.map(t => `<div class="intg"><div class="ico2" style="background:var(--accent-weak);color:var(--accent)">${esc(t.initials)}</div><div><div class="nm">${esc(t.name)}</div><div class="ds">${esc(t.role)}</div></div><div class="st ${t.online ? "" : "warn"}"><span class="dot ${t.online ? "gd" : "wn"}"></span>${t.online ? "active" : "away"}</div></div>`).join("");
    const roles = [["Owner", "Full access · billing · settings"], ["Operations Manager", "All operations · approvals · reports"], ["Support Lead", "Issues · exchanges · tasks · assign"], ["Support Agent", "Assigned chats, issues & tasks"], ["Sales / Custom", "Custom items · bulk follow-ups"]];
    const sla = [["Delivery issue", "First response 2h · resolve 24h"], ["Wrong / damaged item", "First response 4h · resolve 48h"], ["Exchange request", "Staff review 6h"], ["General complaint", "First response 8h"], ["Custom item inquiry", "Sales contact 4h"]];
    const events = ["conversation_created", "intent_detected", "exchange_request_created", "support_case_created", "future_followup_scheduled", "staff_handoff_required", "conversation_resolved"];
    return `
    <div class="phead"><div><h1>Settings</h1><p>Configure the console, your team and how it connects to the AI bot/backend.</p></div></div>
    <div class="hint warn" style="margin-bottom:16px">${icon("shield")}<div><b>No direct Shopify integration here.</b> This console does not manage checkout, payments, offers, discounts or Shopify orders. Any commerce / order context shown is <b>received from the AI bot/backend</b>, not pulled from Shopify.</div></div>
    <div class="grid settings-grid">
      <div class="card"><div class="ch"><span class="ct">Business profile</span></div><div class="cb">
        <div class="field"><label>Business name</label><input value="Bloomwire"></div>
        <div class="frow"><div class="field"><label>Industry</label><input value="Fashion & apparel retail"></div><div class="field"><label>Timezone</label><input value="Asia/Colombo (GMT+5:30)"></div></div>
        <div class="field"><label>Store domain (display only · managed in Shopify)</label><input value="bloomwire.com" disabled style="opacity:.7"></div>
        <div class="hint info">${icon("store")}<div>Products, checkout & orders live in Shopify. This field is shown for reference only — it is not an integration.</div></div>
      </div></div>

      <div class="card"><div class="ch"><span class="ct">AI bot API connection</span><span class="badge gd"><span class="dot gd"></span>connected</span></div><div class="cb">
        <div class="intg"><div class="ico2" style="background:var(--ai-weak);color:var(--ai)">${icon("bot")}</div><div><div class="nm">Bloomwire AI Bot</div><div class="ds">Receives processed chats, summaries, intents & events</div></div><div class="st"><span class="dot gd"></span>live</div></div>
        <div class="field" style="margin-top:12px"><label>API base URL</label><input value="https://api.bloomwire-bot.app/v1" disabled style="opacity:.8"></div>
        <div class="field"><label>API key</label><input value="bw_live_••••••••••••••••3f9a" disabled style="opacity:.8"></div>
        <button class="btn sec sm" data-test>${icon("bot")}Test connection</button>
      </div></div>

      <div class="card"><div class="ch"><span class="ct">Staff users</span><button class="btn sm" data-adduser>${icon("plus")}Add user</button></div><div class="cb">${members}</div></div>

      <div class="card"><div class="ch"><span class="ct">Roles & permissions</span></div><div class="cb"><div class="lst">${roles.map(r => `<div class="it"><span><b>${esc(r[0])}</b></span><span class="tiny muted" style="text-align:right;max-width:230px">${esc(r[1])}</span></div>`).join("")}</div></div></div>

      <div class="card"><div class="ch"><span class="ct">Webhook & event settings</span></div><div class="cb">
        <div class="field"><label>Inbound webhook URL</label><input value="https://app.bloomwire.com/hooks/bot" disabled style="opacity:.8"></div>
        <div class="field"><label>Subscribed events</label><div class="chips-edit">${events.map(e => `<span class="chip-x">${esc(e)} <span class="rx">${icon("x")}</span></span>`).join("")}</div></div>
        <div class="field"><label>Signing secret</label><input value="whsec_••••••••••••" disabled style="opacity:.8"></div>
      </div></div>

      <div class="card"><div class="ch"><span class="ct">Notification settings</span></div><div class="cb">
        ${sw(true, "n_exchange", "New exchange request", "Notify when AI raises an exchange")}
        ${sw(true, "n_issue", "New customer issue", "Notify on new support cases")}
        ${sw(true, "n_overdue", "Overdue actions", "Alert when tasks pass their due time")}
        ${sw(false, "n_daily", "Daily summary email", "End-of-day performance recap")}
      </div></div>

      <div class="card"><div class="ch"><span class="ct">Status labels</span></div><div class="cb">
        <div class="tiny muted" style="margin-bottom:6px">Exchange request statuses</div><div class="chips-edit" style="margin-bottom:12px">${DB.exchangeStatuses.map(s => `<span class="chip-x">${esc(DB.exchangeStatusLabel[s])}</span>`).join("")}</div>
        <div class="tiny muted" style="margin-bottom:6px">Customer issue statuses</div><div class="chips-edit">${DB.issueStatuses.map(s => `<span class="chip-x">${esc(DB.issueStatusLabel[s])}</span>`).join("")}</div>
      </div></div>

      <div class="card"><div class="ch"><span class="ct">Priority rules</span></div><div class="cb"><div class="lst">
        <div class="it"><span>Exchange + "too small/large" after delivery</span><span>${priPill("high")}</span></div>
        <div class="it"><span>Delivery issue past ETA</span><span>${priPill("high")}</span></div>
        <div class="it"><span>Low AI confidence (&lt; 0.65)</span><span>${priPill("high")}</span></div>
        <div class="it"><span>Bulk / custom inquiry</span><span>${priPill("med")}</span></div>
        <div class="it"><span>General product question</span><span>${priPill("low")}</span></div>
      </div></div></div>

      <div class="card"><div class="ch"><span class="ct">SLA rules</span></div><div class="cb"><div class="lst">${sla.map(r => `<div class="it"><span>${esc(r[0])}</span><span class="tiny muted" style="text-align:right">${esc(r[1])}</span></div>`).join("")}</div></div></div>
    </div>`;
  };
  BIND.settings = function () {
    const App = window.App;
    document.querySelectorAll("[data-sw]").forEach(b => b.addEventListener("click", () => { b.classList.toggle("on"); App.toast("Setting updated", b.classList.contains("on") ? "Enabled" : "Disabled", "acc"); }));
    const tb = document.querySelector("[data-test]"); if (tb) tb.addEventListener("click", () => App.toast("Connection OK", "AI bot responded in 142ms", "ok"));
    const au = document.querySelector("[data-adduser]"); if (au) au.addEventListener("click", () => App.toast("Invite sent", "Add a teammate (demo)", "acc"));
    document.querySelectorAll(".chip-x .rx").forEach(x => x.addEventListener("click", () => x.closest(".chip-x").remove()));
  };

  /* ---- new issue form (used by header quick action) ---- */
  window.OPEN.newIssue = function (prefill) {
    const App = window.App; prefill = prefill || {};
    App.modal(`<div class="mh"><h3>${icon("alert")} Log customer issue</h3><div class="x" data-close>${icon("x")}</div></div>
      <div class="mc">
        <div class="frow"><div class="field"><label>Customer</label><input id="ni_cust" value="${esc(prefill.customer || "")}"></div>
          <div class="field"><label>Issue type</label><select id="ni_type">${DB.issueTypes.map(t => `<option>${t}</option>`).join("")}</select></div></div>
        <div class="field"><label>Summary</label><textarea id="ni_sum" rows="2" placeholder="What's the problem?"></textarea></div>
        <div class="frow"><div class="field"><label>Priority</label><select id="ni_pri"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select></div>
          <div class="field"><label>Assign to</label><select id="ni_own"><option value="">Unassigned</option>${DB.team.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join("")}</select></div></div>
      </div>
      <div class="mf"><button class="btn sec" data-close>Cancel</button><button class="btn" id="ni_save">Create issue</button></div>`);
    document.getElementById("ni_save").addEventListener("click", () => {
      const i = { id: "ISS-" + (1188 + Math.floor(Math.random() * 40)), customer: document.getElementById("ni_cust").value || "New customer", initials: UI.initials(document.getElementById("ni_cust").value || "NC"), type: document.getElementById("ni_type").value, aiSummary: document.getElementById("ni_sum").value || "Logged by staff.", priority: document.getElementById("ni_pri").value, status: "new", owner: document.getElementById("ni_own").value || null, created: "just now", lastActivity: "just now", sla: "ok", slaText: "Within SLA", convId: null, resolution: "", notes: "" };
      DB.issues.unshift(i); App.closeModal(); App.go("issues"); App.toast("Issue logged", i.id, "ok");
    });
  };

})();
