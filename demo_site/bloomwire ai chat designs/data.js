/* ============================================================
   Bloomwire — AI Chat Operations Dashboard · sample data layer
   Everything here stands in for data that arrives from the AI bot
   / backend (webhooks + event stream). This console does NOT
   integrate with Shopify directly and does NOT build the bot.
   It consumes processed chats, summaries, intents, statuses and
   business activity events, then turns them into operations.
   Data is assembled in chunks (Object.assign) for readability.
   ============================================================ */
window.DB = {
  business: { name: "Bloomwire", store: "bloomwire.com", plan: "Growth", currency: "LKR" },

  ranges: {
    "1d": "Today", "3d": "Last 3 days", "7d": "Last 7 days", "14d": "Last 14 days",
    "30d": "Last 30 days", "month": "This month", "lastmonth": "Last month", "custom": "Custom range"
  },
  customRangeLabel: "Jun 1 – Jun 14",

  team: [
    { id: "u_maya",    name: "Maya Senanayake", initials: "MS", role: "Owner",              online: true },
    { id: "u_ishara",  name: "Ishara Dias",     initials: "ID", role: "Operations Manager", online: true },
    { id: "u_ruwan",   name: "Ruwan Tennakoon", initials: "RT", role: "Support Lead",       online: true },
    { id: "u_kavindi", name: "Kavindi Perera",  initials: "KP", role: "Support Agent",      online: false },
    { id: "u_dinesh",  name: "Dinesh Alwis",    initials: "DA", role: "Sales / Custom",     online: true }
  ],

  notifications: [
    { ic: "bad",  type: "exchange", t: "Exchange request needs review — Nethmi Perera (M to L)", w: "4m ago", go: "exchanges" },
    { ic: "warn", type: "issue",    t: "Delivery issue flagged by AI — Tharindu W.", w: "12m ago", go: "issues" },
    { ic: "aii",  type: "custom",   t: "Custom item inquiry — 1,000 school T-shirts", w: "23m ago", go: "monitor" },
    { ic: "info", type: "task",     t: "9 actions are overdue across the team", w: "1h ago", go: "tasks" },
    { ic: "good", type: "resolved", t: "AI resolved 83 conversations today", w: "2h ago", go: "botstatus" },
    { ic: "teal", type: "followup", t: "Follow-up due today — David Silva (Large restock)", w: "3h ago", go: "followups" }
  ],

  /* ---- breakdowns shared by dashboard + reports ---- */
  intentBreakdown: [ ["Order & product", 34, "ac"], ["Delivery question", 18, "in"], ["Size & fit", 14, "tl"], ["Exchange / return", 9, "wn"], ["Complaint / issue", 8, "bd"], ["Custom item", 6, "ai"], ["Other", 11, ""] ],
  topIntents: [ ["Where is my order? / delivery", 26], ["Product availability", 22], ["Size & fit help", 17], ["Exchange / return", 12], ["Discounts & offers", 9], ["Custom / bulk", 8], ["Other", 6] ],
  issuesByType: [ ["Delivery issue", 8], ["Wrong item", 5], ["Damaged product", 4], ["Order status problem", 3], ["Payment confusion", 2], ["General complaint", 2], ["Product quality concern", 2], ["Store pickup issue", 1] ],
  handoffReasons: [ ["Bulk / custom order", 31], ["Exchange / return", 22], ["Complaint escalation", 18], ["Low AI confidence", 15], ["Customer asked for human", 9], ["Payment / refund", 5] ],

  /* ---- analytics keyed by date range (default 7d shows headline figures) ---- */
  analytics: {
    "1d": {
      kpi: { totalChats: 104, aiResolved: 83, needsStaff: 16, orderConv: 31, issues: 5, exchanges: 2, followups: 8, customInq: 2, pendingTasks: 46, overdue: 9, escalations: 16, resolvedToday: 83 },
      delta: { totalChats: "+5%", aiResolved: "+6%", needsStaff: "−1", orderConv: "+8%", issues: "+1", exchanges: "0", followups: "+2", customInq: "+1", pendingTasks: "−3", overdue: "−1", escalations: "−1", resolvedToday: "+11%" },
      labels: ["8a","10a","12p","2p","4p","6p","8p","10p"], chats: [9,14,16,15,17,13,12,8], resolved: [7,11,13,12,14,10,10,6], staff: [1,2,2,3,3,2,2,1], exch: [0,0,1,0,1,0,0,0]
    },
    "3d": {
      kpi: { totalChats: 198, aiResolved: 150, needsStaff: 31, orderConv: 67, issues: 12, exchanges: 5, followups: 17, customInq: 3, pendingTasks: 46, overdue: 9, escalations: 31, resolvedToday: 83 },
      delta: { totalChats: "+8%", aiResolved: "+7%", needsStaff: "−3%", orderConv: "+10%", issues: "−2", exchanges: "+1", followups: "+4", customInq: "+1", pendingTasks: "−4", overdue: "−2", escalations: "−3%", resolvedToday: "+11%" },
      labels: ["2d ago","Yesterday","Today"], chats: [64,68,66], resolved: [48,52,50], staff: [10,11,10], exch: [2,2,1]
    },
    "7d": {
      kpi: { totalChats: 426, aiResolved: 312, needsStaff: 68, orderConv: 144, issues: 27, exchanges: 11, followups: 39, customInq: 8, pendingTasks: 46, overdue: 9, escalations: 68, resolvedToday: 83 },
      delta: { totalChats: "+12%", aiResolved: "+9%", needsStaff: "−6%", orderConv: "+14%", issues: "−4%", exchanges: "+2", followups: "+7", customInq: "+1", pendingTasks: "−5", overdue: "−2", escalations: "−6%", resolvedToday: "+11%" },
      labels: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], chats: [54,61,58,67,72,63,51], resolved: [40,45,43,49,53,46,36], staff: [9,10,9,11,12,9,8], exch: [1,2,1,2,2,2,1]
    },
    "14d": {
      kpi: { totalChats: 812, aiResolved: 598, needsStaff: 131, orderConv: 274, issues: 52, exchanges: 21, followups: 74, customInq: 15, pendingTasks: 46, overdue: 9, escalations: 131, resolvedToday: 83 },
      delta: { totalChats: "+10%", aiResolved: "+8%", needsStaff: "−5%", orderConv: "+12%", issues: "−3%", exchanges: "+4", followups: "+12", customInq: "+2", pendingTasks: "−5", overdue: "−2", escalations: "−5%", resolvedToday: "+11%" },
      labels: ["Jun 1","Jun 3","Jun 5","Jun 7","Jun 9","Jun 11","Jun 13"], chats: [108,116,122,120,114,118,114], resolved: [80,86,90,88,84,86,84], staff: [17,19,20,19,18,19,19], exch: [3,3,3,3,3,3,3]
    },
    "30d": {
      kpi: { totalChats: 1684, aiResolved: 1241, needsStaff: 268, orderConv: 561, issues: 108, exchanges: 43, followups: 152, customInq: 31, pendingTasks: 46, overdue: 9, escalations: 268, resolvedToday: 83 },
      delta: { totalChats: "+18%", aiResolved: "+11%", needsStaff: "−8%", orderConv: "+16%", issues: "−6%", exchanges: "+9", followups: "+24", customInq: "+5", pendingTasks: "−5", overdue: "−2", escalations: "−8%", resolvedToday: "+11%" },
      labels: ["W1","W2","W3","W4","W5"], chats: [330,352,346,338,318], resolved: [243,259,255,249,235], staff: [53,56,55,53,51], exch: [9,9,8,9,8]
    },
    "month": {
      kpi: { totalChats: 1210, aiResolved: 892, needsStaff: 192, orderConv: 402, issues: 77, exchanges: 30, followups: 109, customInq: 22, pendingTasks: 46, overdue: 9, escalations: 192, resolvedToday: 83 },
      delta: { totalChats: "+14%", aiResolved: "+10%", needsStaff: "−7%", orderConv: "+13%", issues: "−5%", exchanges: "+6", followups: "+18", customInq: "+3", pendingTasks: "−5", overdue: "−2", escalations: "−7%", resolvedToday: "+11%" },
      labels: ["W1","W2","W3","W4"], chats: [305,318,312,275], resolved: [225,234,230,203], staff: [49,51,49,43], exch: [8,8,7,7]
    },
    "lastmonth": {
      kpi: { totalChats: 1902, aiResolved: 1388, needsStaff: 312, orderConv: 642, issues: 121, exchanges: 47, followups: 168, customInq: 35, pendingTasks: 46, overdue: 9, escalations: 312, resolvedToday: 83 },
      delta: { totalChats: "+9%", aiResolved: "+7%", needsStaff: "−4%", orderConv: "+9%", issues: "−2%", exchanges: "+5", followups: "+15", customInq: "+4", pendingTasks: "−5", overdue: "−2", escalations: "−4%", resolvedToday: "+11%" },
      labels: ["W1","W2","W3","W4"], chats: [470,486,492,454], resolved: [343,355,359,331], staff: [78,80,79,75], exch: [12,12,12,11]
    },
    "custom": {
      kpi: { totalChats: 812, aiResolved: 598, needsStaff: 131, orderConv: 274, issues: 52, exchanges: 21, followups: 74, customInq: 15, pendingTasks: 46, overdue: 9, escalations: 131, resolvedToday: 83 },
      delta: { totalChats: "+10%", aiResolved: "+8%", needsStaff: "−5%", orderConv: "+12%", issues: "−3%", exchanges: "+4", followups: "+12", customInq: "+2", pendingTasks: "−5", overdue: "−2", escalations: "−5%", resolvedToday: "+11%" },
      labels: ["Jun 1","Jun 3","Jun 5","Jun 7","Jun 9","Jun 11","Jun 13"], chats: [108,116,122,120,114,118,114], resolved: [80,86,90,88,84,86,84], staff: [17,19,20,19,18,19,19], exch: [3,3,3,3,3,3,3]
    }
  },

  statusLabel: { ai_assisting: "AI Assisting", ai_resolved: "AI Resolved", needs_staff: "Needs Staff", needs_review: "Needs Staff Review", followup_scheduled: "Follow-up Scheduled" }
};
/* ============================================================
   CONVERSATIONS  (AI Chat Monitor / shared inbox)
   status: ai_assisting | ai_resolved | needs_staff | needs_review | followup_scheduled
   m.from: cust | bot | staff ; m.sys = system event line
   ============================================================ */
Object.assign(window.DB, {
  conversations: [
    {
      id: "cv_nethmi", customer: "Nethmi Perera", initials: "NP", phone: "+94 77 412 8890",
      channel: "wa", intent: "Exchange Request", status: "needs_review", aiHandled: false, staffNeeded: true,
      priority: "high", time: "4m", unread: 2, bizLabel: "Exchange Request",
      filters: ["needs_staff", "exchange", "high", "unread"],
      summaryCustomer: "Repeat customer · 3 orders · last delivered today. Tends to size up.",
      aiSummary: "Customer received order today. Ordered Medium black tee but it feels too small. Wants to exchange to Large. Staff approval required — AI cannot approve exchanges.",
      confidence: 0.91, bizCategory: "Exchange Request",
      linked: { type: "exchange", id: "EX-2041", label: "Exchange EX-2041" },
      owner: null, nextAction: "Confirm Large stock + exchange eligibility, then contact customer",
      notes: ["Item appears unused per customer", "Within 7-day exchange window"],
      m: [
        { from: "cust",  t: "Hi, I received my T-shirt today. I ordered Medium but it feels too small.", at: "11:02" },
        { from: "bot",   t: "Sorry to hear that! I can help collect the details and send this to the support team.", at: "11:02" },
        { from: "cust",  t: "I want to exchange it to Large if possible.", at: "11:03" },
        { from: "bot",   t: "Got it. I'll create an exchange request for staff review. Please keep the item unused and share a photo if needed.", at: "11:03" },
        { from: "staff", t: "Exchange Request EX-2041 created from AI chat · routed to Support for review.", at: "11:03", sys: true },
        { from: "staff", t: "Hi Nethmi, we're checking the exchange eligibility and Large size availability. We'll confirm shortly.", at: "11:08", by: "Ruwan Tennakoon" }
      ]
    },
    {
      id: "cv_nimal", customer: "Nimal Perera", initials: "NM", phone: "+94 71 220 7788",
      channel: "wa", intent: "Order Conversation", status: "ai_assisting", aiHandled: true, staffNeeded: false,
      priority: "med", time: "9m", unread: 0, bizLabel: "Order Related", filters: ["order"],
      summaryCustomer: "New customer · first chat · browsing oversized fits.",
      aiSummary: "Customer asking if black oversized tees are available. AI confirmed availability and shared the product. Guiding on sizing for a slim build.",
      confidence: 0.88, bizCategory: "Order Conversation",
      linked: { type: "order", id: "OC-3012", label: "Order chat OC-3012" },
      owner: null, nextAction: "AI handling — monitor for purchase or size confirmation", notes: ["Interested in slim/oversized fit guidance"],
      m: [
        { from: "cust", t: "Do you have black oversized tees?", at: "10:54" },
        { from: "bot",  t: "Yes! Our Oversized Tee in Black is available right now. Here are the details 👕", at: "10:54" },
        { from: "bot",  t: "Oversized Tee — Black · sizes S–XXL · from our catalog.", at: "10:54", card: { title: "Oversized Tee — Black", sub: "S–XXL · in catalog" } },
        { from: "cust", t: "Nice, what size fits a slim build?", at: "10:55" },
        { from: "bot",  t: "For an oversized look on a slim build, M works great. Want me to share the full size guide?", at: "10:55" }
      ]
    },
    {
      id: "cv_kamal", customer: "Kamal Fernando", initials: "KF", phone: "+94 76 551 0098",
      channel: "wa", intent: "Delivery Question", status: "ai_resolved", aiHandled: true, staffNeeded: false,
      priority: "low", time: "26m", unread: 0, bizLabel: "Order Related", filters: ["resolved", "order"],
      summaryCustomer: "Repeat customer · 2 orders · prefers WhatsApp.",
      aiSummary: "Customer asked about delivery time. AI answered with standard delivery windows. Customer satisfied — resolved by AI, no staff action needed.",
      confidence: 0.96, bizCategory: "Delivery Question", linked: null, owner: null, nextAction: "None — resolved by AI", notes: [],
      m: [
        { from: "cust", t: "How many days for delivery?", at: "10:38" },
        { from: "bot",  t: "Standard delivery is 2–4 working days island-wide. Colombo is usually next-day 🚚", at: "10:38" },
        { from: "cust", t: "Great, thanks!", at: "10:39" },
        { from: "bot",  t: "Anytime! 💛", at: "10:39" }
      ]
    },
    {
      id: "cv_sapumal", customer: "Sapumal Jayasinghe", initials: "SJ", phone: "+94 11 269 5436",
      channel: "web", intent: "Custom Item Inquiry", status: "needs_staff", aiHandled: false, staffNeeded: true,
      priority: "high", time: "23m", unread: 1, bizLabel: "Custom Item Inquiry",
      filters: ["needs_staff", "custom", "high", "unread"],
      summaryCustomer: "School representative · potential bulk buyer · first contact.",
      aiSummary: "School needs 1,000 T-shirts for an event in ~3 weeks, mixed sizes, with printed logo. AI logged the requirement and handed off to the custom orders team. Quote + human contact required.",
      confidence: 0.82, bizCategory: "Custom Item Inquiry",
      linked: { type: "task", id: "TSK-559", label: "Task TSK-559" },
      owner: "u_dinesh", nextAction: "Sales to contact ASAP with bulk quote", notes: ["Bulk / quote required", "Deadline ~3 weeks", "Logo print needed"],
      m: [
        { from: "cust", t: "Hi, we need 1000 T-shirts for a school event.", at: "10:41" },
        { from: "bot",  t: "That's a wonderful bulk requirement! Custom orders like this are handled by our team — I'll log the details for them.", at: "10:41" },
        { from: "cust", t: "We need them in 3 weeks, mixed sizes, with the school logo printed.", at: "10:42" },
        { from: "bot",  t: "Noted ✅ I've flagged this for staff review and shared it with our custom orders team. Someone will contact you shortly.", at: "10:42" },
        { from: "staff", t: "Staff handoff required · Custom item inquiry routed to Sales (Dinesh A.).", at: "10:42", sys: true }
      ]
    },
    {
      id: "cv_david", customer: "David Silva", initials: "DS", phone: "+94 70 442 1180",
      channel: "wa", intent: "Future Follow-up", status: "followup_scheduled", aiHandled: true, staffNeeded: false,
      priority: "low", time: "1h", unread: 0, bizLabel: "Future Follow-up", filters: ["followup"],
      summaryCustomer: "Returning customer · waiting on a restock.",
      aiSummary: "Customer wants to be notified when the Large oversized tee is back in stock. AI scheduled a future follow-up for the team.",
      confidence: 0.93, bizCategory: "Future Follow-up",
      linked: { type: "followup", id: "FU-77", label: "Follow-up FU-77" },
      owner: "u_kavindi", nextAction: "Notify customer when Large is restocked", notes: ["Restock expected ~Jun 15"],
      m: [
        { from: "cust", t: "Tell me when Large is available again.", at: "09:58" },
        { from: "bot",  t: "Sure! I'll set a follow-up so our team notifies you the moment the Large is back in stock 🔔", at: "09:58" },
        { from: "staff", t: "Future follow-up FU-77 scheduled · owner Kavindi P.", at: "09:58", sys: true }
      ]
    },
    {
      id: "cv_ayesha", customer: "Ayesha Rahman", initials: "AR", phone: "+94 77 880 5512",
      channel: "ig", intent: "Order Conversation", status: "ai_assisting", aiHandled: true, staffNeeded: false,
      priority: "low", time: "1h", unread: 0, bizLabel: "Order Related", filters: ["order"],
      summaryCustomer: "From Instagram · browsing activewear.",
      aiSummary: "Customer looking for joggers. AI is actively assisting with available styles and sizes.",
      confidence: 0.85, bizCategory: "Order Conversation",
      linked: { type: "order", id: "OC-3013", label: "Order chat OC-3013" },
      owner: null, nextAction: "AI assisting — share jogger options", notes: [],
      m: [
        { from: "cust", t: "Looking for joggers, do you have grey ones?", at: "09:40" },
        { from: "bot",  t: "We do! Our Everyday Jogger comes in Grey, Black and Navy. Want me to show the grey?", at: "09:40" },
        { from: "cust", t: "Yes please", at: "09:41" },
        { from: "bot",  t: "Here's the Everyday Jogger — Grey 🩶", at: "09:41", card: { title: "Everyday Jogger — Grey", sub: "S–XL · in catalog" } }
      ]
    },
    {
      id: "cv_ruwans", customer: "Ruwan Silva", initials: "RS", phone: "+94 76 900 1212",
      channel: "wa", intent: "Order Conversation", status: "ai_resolved", aiHandled: true, staffNeeded: false,
      priority: "low", time: "2h", unread: 0, bizLabel: "Order Related", filters: ["resolved", "order"],
      summaryCustomer: "Repeat customer · quick questions.",
      aiSummary: "Customer asked about cap colour options. AI shared the range; customer purchased via the catalog link. Resolved by AI.",
      confidence: 0.94, bizCategory: "Order Conversation",
      linked: { type: "order", id: "OC-3014", label: "Order chat OC-3014" },
      owner: null, nextAction: "None — resolved by AI", notes: [],
      m: [
        { from: "cust", t: "What colors do the caps come in?", at: "08:50" },
        { from: "bot",  t: "Our Classic Cap comes in Black, White, Navy and Khaki 🧢", at: "08:50" },
        { from: "cust", t: "Perfect, I'll grab a black one", at: "08:51" },
        { from: "bot",  t: "Lovely choice! Here's the link to checkout securely 🛒", at: "08:51" }
      ]
    },
    {
      id: "cv_dilki", customer: "Dilki Fernando", initials: "DF", phone: "+94 71 998 2210",
      channel: "wa", intent: "Order Conversation", status: "needs_staff", aiHandled: false, staffNeeded: true,
      priority: "high", time: "2h", unread: 1, bizLabel: "Order Related", filters: ["needs_staff", "order", "high", "unread"],
      summaryCustomer: "New customer · unsure about sizing · high purchase intent.",
      aiSummary: "Customer asked for size help and gave conflicting measurements. AI confidence dropped — handed off to staff for personal sizing help.",
      confidence: 0.58, bizCategory: "Order Conversation",
      linked: { type: "order", id: "OC-3015", label: "Order chat OC-3015" },
      owner: "u_kavindi", nextAction: "Staff to give personal size guidance", notes: ["Low AI confidence handoff"],
      m: [
        { from: "cust", t: "I need help with sizing, I'm confused between M and L", at: "08:30" },
        { from: "bot",  t: "Happy to help! Could you share your usual chest size or height/weight?", at: "08:30" },
        { from: "cust", t: "5'9 but sometimes M sometimes L depending on brand", at: "08:31" },
        { from: "bot",  t: "I want to get this right for you — connecting you with a teammate for personal sizing help 🙌", at: "08:31" },
        { from: "staff", t: "Low confidence · staff handoff required.", at: "08:31", sys: true }
      ]
    },
    {
      id: "cv_tharindu", customer: "Tharindu Weerasinghe", initials: "TW", phone: "+94 77 123 4567",
      channel: "wa", intent: "Delivery Issue", status: "needs_staff", aiHandled: false, staffNeeded: true,
      priority: "high", time: "12m", unread: 1, bizLabel: "Customer Issue", filters: ["needs_staff", "issue", "high", "unread"],
      summaryCustomer: "Order #BW-10423 · paid · expected 2 days ago.",
      aiSummary: "Order is 2 days past expected delivery. Customer frustrated. AI created a support case and escalated to staff — delivery issue needs human follow-up with courier.",
      confidence: 0.79, bizCategory: "Delivery Issue",
      linked: { type: "issue", id: "ISS-1187", label: "Issue ISS-1187" },
      owner: "u_ruwan", nextAction: "Check courier status + update customer", notes: ["Courier delay suspected"],
      m: [
        { from: "cust", t: "My order was supposed to arrive 2 days ago and it's still not here.", at: "10:50" },
        { from: "bot",  t: "I'm really sorry about the delay. Let me log this and bring in our team to check the courier status for you.", at: "10:50" },
        { from: "staff", t: "Support case ISS-1187 created · delivery issue · routed to Support Lead.", at: "10:50", sys: true }
      ]
    },
    {
      id: "cv_aisha", customer: "Aisha Mohamed", initials: "AM", phone: "+94 76 551 7781",
      channel: "ig", intent: "Wrong Item", status: "needs_review", aiHandled: false, staffNeeded: true,
      priority: "med", time: "3h", unread: 0, bizLabel: "Customer Issue", filters: ["needs_staff", "issue"],
      summaryCustomer: "Order #BW-10388 · received wrong colour.",
      aiSummary: "Customer received Navy instead of Black. AI identified a wrong-item issue and created a support case for staff review and replacement.",
      confidence: 0.86, bizCategory: "Wrong Item",
      linked: { type: "issue", id: "ISS-1184", label: "Issue ISS-1184" },
      owner: "u_kavindi", nextAction: "Arrange correct item + return pickup", notes: [],
      m: [
        { from: "cust", t: "I ordered a black hoodie but received a navy one.", at: "08:05" },
        { from: "bot",  t: "Apologies for the mix-up! I'll log this as a wrong-item case so the team can arrange the correct one.", at: "08:05" },
        { from: "staff", t: "Support case ISS-1184 created · wrong item.", at: "08:05", sys: true }
      ]
    },
    {
      id: "cv_hashan", customer: "Hashan Perera", initials: "HP", phone: "+94 70 555 9090",
      channel: "wa", intent: "Exchange Request", status: "needs_review", aiHandled: false, staffNeeded: true,
      priority: "med", time: "5h", unread: 0, bizLabel: "Exchange Request", filters: ["needs_staff", "exchange"],
      summaryCustomer: "Wants to swap colour after delivery.",
      aiSummary: "Customer wants to exchange a White polo for Black (same size). AI created an exchange request pending staff review.",
      confidence: 0.89, bizCategory: "Exchange Request",
      linked: { type: "exchange", id: "EX-2039", label: "Exchange EX-2039" },
      owner: "u_ruwan", nextAction: "Confirm Black stock + colour-swap policy", notes: [],
      m: [
        { from: "cust", t: "Can I exchange my white polo for black? Same size L.", at: "06:30" },
        { from: "bot",  t: "Sure — I'll raise an exchange request for the team to review the colour swap 🙏", at: "06:30" },
        { from: "staff", t: "Exchange EX-2039 created · colour swap.", at: "06:30", sys: true }
      ]
    },
    {
      id: "cv_dinusha", customer: "Dinusha Silva", initials: "DN", phone: "+94 71 470 9001",
      channel: "web", intent: "Order Status", status: "ai_resolved", aiHandled: true, staffNeeded: false,
      priority: "low", time: "6h", unread: 0, bizLabel: "Order Related", filters: ["resolved", "order"],
      summaryCustomer: "Order #BW-10401 · shipped.",
      aiSummary: "Customer asked for order status. AI shared tracking and delivery ETA. Resolved by AI.",
      confidence: 0.97, bizCategory: "Order Status", linked: null, owner: null, nextAction: "None — resolved by AI", notes: [],
      m: [
        { from: "cust", t: "Where is my order #BW-10401?", at: "Yesterday" },
        { from: "bot",  t: "Your order shipped and is out for delivery today 🚚 Tracking: SLPOST-91204.", at: "Yesterday" },
        { from: "cust", t: "Thank you!", at: "Yesterday" }
      ]
    }
  ]
});
/* ============================================================
   ORDER CONVERSATIONS  (purchase-intent chats — NOT Shopify orders)
   ============================================================ */
Object.assign(window.DB, {
  orderStages: ["new", "ai_assisting", "suggested", "waiting", "converted", "needs_staff", "dropped"],
  orderStageLabel: { new: "New Inquiry", ai_assisting: "AI Assisting", suggested: "Product Suggested", waiting: "Waiting Customer", converted: "Converted", needs_staff: "Needs Staff Help", dropped: "Dropped" },
  orderStageDot: { new: "var(--info)", ai_assisting: "var(--ai)", suggested: "var(--teal)", waiting: "var(--warn)", converted: "var(--good)", needs_staff: "var(--bad)", dropped: "var(--faint)" },
  orders: [
    { id: "OC-3012", customer: "Nimal Perera", initials: "NM", intent: "Oversized T-shirt inquiry", product: "Oversized Tee — Black", aiSummary: "Confirmed availability, shared product, guiding on slim-build sizing.", status: "waiting", lastActivity: "9m", staffNeeded: false, priority: "med", convId: "cv_nimal", nextAction: "Wait for size confirmation / purchase", notes: "Customer considering M for oversized look." },
    { id: "OC-3013", customer: "Ayesha Rahman", initials: "AR", intent: "Looking for joggers", product: "Everyday Jogger — Grey", aiSummary: "AI actively assisting, shared grey joggers.", status: "ai_assisting", lastActivity: "1h", staffNeeded: false, priority: "low", convId: "cv_ayesha", nextAction: "AI sharing options", notes: "" },
    { id: "OC-3014", customer: "Ruwan Silva", initials: "RS", intent: "Asked about cap colors", product: "Classic Cap — Black", aiSummary: "Shared colours; customer purchased via link. Resolved/closed by AI.", status: "converted", lastActivity: "2h", staffNeeded: false, priority: "low", convId: "cv_ruwans", nextAction: "None — converted", notes: "Closed by AI." },
    { id: "OC-3015", customer: "Dilki Fernando", initials: "DF", intent: "Asked for size help", product: "Linen Shirt", aiSummary: "Conflicting measurements; low confidence → staff handoff.", status: "needs_staff", lastActivity: "2h", staffNeeded: true, priority: "high", convId: "cv_dilki", nextAction: "Staff personal sizing help", notes: "Low AI confidence." },
    { id: "OC-3016", customer: "Dinusha Silva", initials: "DN", intent: "Are hoodies restocked?", product: "Pullover Hoodie", aiSummary: "Asked about restock; AI checking catalog availability.", status: "new", lastActivity: "20m", staffNeeded: false, priority: "low", convId: null, nextAction: "AI checking stock", notes: "" },
    { id: "OC-3017", customer: "Menaka Silva", initials: "MK", intent: "Looking for a summer dress", product: "Linen Wrap Dress", aiSummary: "Shared two dress options matching the request.", status: "suggested", lastActivity: "40m", staffNeeded: false, priority: "med", convId: null, nextAction: "Awaiting customer pick", notes: "" },
    { id: "OC-3018", customer: "Tariq Jameel", initials: "TJ", intent: "Asked for discount on jeans", product: "Slim Jeans — Indigo", aiSummary: "Wanted a bigger discount than available; did not proceed.", status: "dropped", lastActivity: "5h", staffNeeded: false, priority: "low", convId: null, nextAction: "None — dropped", notes: "Price sensitivity." },
    { id: "OC-3019", customer: "Fathima Risla", initials: "FR", intent: "Matching set inquiry", product: "Co-ord Knit Set", aiSummary: "AI suggested the co-ord set + accessories bundle.", status: "suggested", lastActivity: "3h", staffNeeded: false, priority: "med", convId: null, nextAction: "Awaiting customer reply", notes: "" },
    { id: "OC-3020", customer: "Pasan Kumara", initials: "PK", intent: "Bulk staff polos (40)", product: "Embroidered Polo", aiSummary: "Quantity above standard; flagged to custom/sales team.", status: "needs_staff", lastActivity: "4h", staffNeeded: true, priority: "med", convId: null, nextAction: "Sales to quote 40 units", notes: "Crosses into custom." },
    { id: "OC-3021", customer: "Imara Nawaz", initials: "IN", intent: "Asked about new arrivals", product: "New Season Drop", aiSummary: "Shared the new arrivals collection; high engagement.", status: "ai_assisting", lastActivity: "30m", staffNeeded: false, priority: "low", convId: null, nextAction: "AI assisting", notes: "" }
  ]
});

/* ============================================================
   CUSTOMER ISSUES
   ============================================================ */
Object.assign(window.DB, {
  issueTypes: ["Delivery issue", "Wrong item", "Damaged product", "Order status problem", "Payment confusion", "General complaint", "Product quality concern", "Store pickup issue"],
  issueStatuses: ["new", "ai_identified", "needs_review", "assigned", "in_progress", "waiting", "resolved", "closed"],
  issueStatusLabel: { new: "New", ai_identified: "AI Identified", needs_review: "Needs Staff Review", assigned: "Assigned", in_progress: "In Progress", waiting: "Waiting Customer", resolved: "Resolved", closed: "Closed" },
  issues: [
    { id: "ISS-1187", customer: "Tharindu Weerasinghe", initials: "TW", type: "Delivery issue", aiSummary: "Order is 2 days past expected delivery; suspected courier delay. Customer frustrated.", priority: "high", status: "in_progress", owner: "u_ruwan", created: "12m ago", lastActivity: "5m ago", sla: "warn", slaText: "2h left", convId: "cv_tharindu", resolution: "", notes: "Awaiting courier update." },
    { id: "ISS-1184", customer: "Aisha Mohamed", initials: "AM", type: "Wrong item", aiSummary: "Received Navy hoodie instead of Black. Wants the correct colour sent.", priority: "med", status: "assigned", owner: "u_kavindi", created: "3h ago", lastActivity: "1h ago", sla: "ok", slaText: "Within SLA", convId: "cv_aisha", resolution: "", notes: "Arrange replacement + return pickup." },
    { id: "ISS-1181", customer: "Roshan Mendis", initials: "RM", type: "Damaged product", aiSummary: "Jacket zip broken on arrival; photo shared by customer.", priority: "high", status: "needs_review", owner: null, created: "5h ago", lastActivity: "2h ago", sla: "breach", slaText: "Overdue", convId: null, resolution: "", notes: "Photo received; needs QC decision." },
    { id: "ISS-1179", customer: "Sanduni Ratnayake", initials: "SR", type: "Order status problem", aiSummary: "Tracking number not updating for 3 days.", priority: "med", status: "ai_identified", owner: null, created: "6h ago", lastActivity: "6h ago", sla: "ok", slaText: "Within SLA", convId: null, resolution: "", notes: "" },
    { id: "ISS-1176", customer: "Hasini Gamage", initials: "HG", type: "Payment confusion", aiSummary: "Charged twice per customer; AI flagged for finance review.", priority: "high", status: "needs_review", owner: "u_ishara", created: "8h ago", lastActivity: "3h ago", sla: "warn", slaText: "1h left", convId: null, resolution: "", notes: "Verify gateway logs (from AI bot/backend)." },
    { id: "ISS-1170", customer: "Nuwan Bandara", initials: "NB", type: "Product quality concern", aiSummary: "Colour faded after first wash; quality concern raised.", priority: "low", status: "waiting", owner: "u_kavindi", created: "1d ago", lastActivity: "5h ago", sla: "ok", slaText: "Within SLA", convId: null, resolution: "", notes: "Awaiting customer photos." },
    { id: "ISS-1165", customer: "Ishara Wickrama", initials: "IW", type: "Store pickup issue", aiSummary: "Pickup order not ready at promised time.", priority: "med", status: "resolved", owner: "u_ruwan", created: "1d ago", lastActivity: "8h ago", sla: "ok", slaText: "Resolved", convId: null, resolution: "Item located + handed over; goodwill voucher issued.", notes: "" },
    { id: "ISS-1160", customer: "Dilan Fonseka", initials: "DF", type: "General complaint", aiSummary: "Unhappy with packaging quality on last 2 orders.", priority: "low", status: "closed", owner: "u_kavindi", created: "2d ago", lastActivity: "1d ago", sla: "ok", slaText: "Closed", convId: null, resolution: "Acknowledged; switched to rigid mailer for fragile items.", notes: "" },
    { id: "ISS-1158", customer: "Kavisha Perera", initials: "KP", type: "Delivery issue", aiSummary: "Address entered incorrectly; parcel returned to hub.", priority: "med", status: "assigned", owner: "u_ruwan", created: "2d ago", lastActivity: "1d ago", sla: "ok", slaText: "Within SLA", convId: null, resolution: "", notes: "Re-dispatch with corrected address." }
  ]
});
/* ============================================================
   EXCHANGE REQUESTS  (size/fit/colour swaps after delivery — staff approval only)
   ============================================================ */
Object.assign(window.DB, {
  exchangeStatuses: ["new", "ai_identified", "needs_review", "contacted", "waiting", "approved", "not_eligible", "resolved", "closed"],
  exchangeStatusLabel: { new: "New", ai_identified: "AI Identified", needs_review: "Needs Staff Review", contacted: "Customer Contacted", waiting: "Waiting Customer", approved: "Approved", not_eligible: "Not Eligible", resolved: "Resolved", closed: "Closed" },
  exchanges: [
    { id: "EX-2041", customer: "Nethmi Perera", initials: "NP", item: "Black T-shirt", purchasedSize: "Medium", requestedSize: "Large", reason: "Medium feels too small after delivery", aiSummary: "Customer wants to exchange Medium to Large. Staff approval required.", status: "needs_review", priority: "high", owner: null, created: "4m ago", lastActivity: "2m ago", convId: "cv_nethmi", approval: "pending", eligible: true },
    { id: "EX-2039", customer: "Hashan Perera", initials: "HP", item: "Polo Shirt", purchasedSize: "L (White)", requestedSize: "L (Black)", reason: "Wants a different colour", aiSummary: "Colour swap White to Black, same size. Pending review of stock + policy.", status: "needs_review", priority: "med", owner: "u_ruwan", created: "5h ago", lastActivity: "4h ago", convId: "cv_hashan", approval: "pending", eligible: true },
    { id: "EX-2036", customer: "Sachini Alwis", initials: "SA", item: "Linen Wrap Dress", purchasedSize: "S", requestedSize: "M", reason: "Too tight at the shoulders", aiSummary: "Size up S to M. AI identified; awaiting customer to confirm pickup slot.", status: "contacted", priority: "med", owner: "u_kavindi", created: "1d ago", lastActivity: "6h ago", convId: null, approval: "pending", eligible: true },
    { id: "EX-2031", customer: "Lahiru Jayawardena", initials: "LJ", item: "Pullover Hoodie", purchasedSize: "XL", requestedSize: "L", reason: "Slightly oversized", aiSummary: "Size down XL to L. Eligibility confirmed; Large in stock.", status: "approved", priority: "low", owner: "u_ruwan", created: "2d ago", lastActivity: "1d ago", convId: null, approval: "approved", eligible: true },
    { id: "EX-2028", customer: "Tania Cooray", initials: "TC", item: "Slim Jeans", purchasedSize: "30", requestedSize: "32", reason: "Worn / washed before request", aiSummary: "Customer requests size up but item shows wear. Outside exchange policy.", status: "not_eligible", priority: "low", owner: "u_kavindi", created: "3d ago", lastActivity: "2d ago", convId: null, approval: "rejected", eligible: false },
    { id: "EX-2024", customer: "Menaka Silva", initials: "MK", item: "Oversized Tee", purchasedSize: "M", requestedSize: "L", reason: "Wanted a looser fit", aiSummary: "Size up M to L. Completed — replacement delivered.", status: "resolved", priority: "low", owner: "u_ruwan", created: "5d ago", lastActivity: "3d ago", convId: null, approval: "approved", eligible: true }
  ]
});

/* ============================================================
   FUTURE FOLLOW-UPS
   ============================================================ */
Object.assign(window.DB, {
  followupStatuses: ["scheduled", "due_today", "overdue", "contacted", "completed", "cancelled"],
  followupStatusLabel: { scheduled: "Scheduled", due_today: "Due Today", overdue: "Overdue", contacted: "Contacted", completed: "Completed", cancelled: "Cancelled" },
  followups: [
    { id: "FU-77", customer: "David Silva", initials: "DS", reason: "Notify when Large is back in stock", product: "Oversized Tee — Large", date: "Jun 13", day: 13, mo: "Jun", status: "due_today", owner: "u_kavindi", aiSummary: "Customer asked to be told when Large restocks. Restock expected today.", lastChat: "1h ago", priority: "med", convId: "cv_david" },
    { id: "FU-74", customer: "Anjali Mendis", initials: "AN", reason: "Will order next week", product: "Co-ord Knit Set", date: "Jun 11", day: 11, mo: "Jun", status: "overdue", owner: "u_dinesh", aiSummary: "Customer said she'll order next week; follow up to confirm.", lastChat: "2d ago", priority: "high", convId: null },
    { id: "FU-71", customer: "Royal College", initials: "RC", reason: "Confirm school T-shirt order next month", product: "Custom School Tees (x500)", date: "Jun 10", day: 10, mo: "Jun", status: "overdue", owner: "u_dinesh", aiSummary: "Bulk school order to be confirmed next month; nurture the lead.", lastChat: "3d ago", priority: "high", convId: null },
    { id: "FU-69", customer: "Shenali Fernando", initials: "SF", reason: "Contact when new oversized tees arrive", product: "Oversized Tee — New Colours", date: "Jun 13", day: 13, mo: "Jun", status: "due_today", owner: "u_kavindi", aiSummary: "Wants a ping when new oversized colours drop.", lastChat: "1d ago", priority: "low", convId: null },
    { id: "FU-66", customer: "Kasun Madawela", initials: "KM", reason: "Restock — Slim Jeans 32", product: "Slim Jeans — Indigo 32", date: "Jun 16", day: 16, mo: "Jun", status: "scheduled", owner: "u_ruwan", aiSummary: "Notify on indigo 32 restock.", lastChat: "2d ago", priority: "low", convId: null },
    { id: "FU-63", customer: "Praveen Dias", initials: "PD", reason: "Payday — will buy hoodie", product: "Pullover Hoodie", date: "Jun 18", day: 18, mo: "Jun", status: "scheduled", owner: "u_kavindi", aiSummary: "Customer asked to be reminded after payday.", lastChat: "4d ago", priority: "low", convId: null },
    { id: "FU-60", customer: "Naduni Herath", initials: "NH", reason: "Confirm gift set before birthday", product: "Gift Bundle", date: "Jun 20", day: 20, mo: "Jun", status: "scheduled", owner: "u_dinesh", aiSummary: "Follow up to finalise a birthday gift bundle.", lastChat: "1d ago", priority: "med", convId: null },
    { id: "FU-57", customer: "Imran Saleem", initials: "IS", reason: "Wanted to compare 2 jackets", product: "Bomber Jacket", date: "Jun 9", day: 9, mo: "Jun", status: "contacted", owner: "u_kavindi", aiSummary: "Reached out; customer reviewing options.", lastChat: "Today", priority: "low", convId: null },
    { id: "FU-52", customer: "Yasiru Perera", initials: "YP", reason: "Restock — Cap Khaki", product: "Classic Cap — Khaki", date: "Jun 7", day: 7, mo: "Jun", status: "completed", owner: "u_ruwan", aiSummary: "Notified on restock; customer purchased.", lastChat: "5d ago", priority: "low", convId: null }
  ]
});
/* ============================================================
   CUSTOM ITEMS  (simple admin list the AI bot can reference)
   ============================================================ */
Object.assign(window.DB, {
  customItems: [
    { id: "ci1", name: "T-Shirts", category: "Custom Apparel", description: "Custom printed T-shirts for schools, companies, events", sizes: ["S","M","L","XL","XXL"], colors: ["Black","White","Navy","Grey"], minQty: 50, quote: true, status: "active", updated: "2d ago", botNotes: "Offer for bulk/event enquiries. Always route quantity 50+ to Sales for a quote." },
    { id: "ci2", name: "Polo Shirts", category: "Custom Apparel", description: "Embroidered or printed polos for corporate & staff uniforms", sizes: ["S","M","L","XL","XXL"], colors: ["Black","White","Navy","Maroon"], minQty: 40, quote: true, status: "active", updated: "4d ago", botNotes: "Embroidery available; mention 2-week lead time." },
    { id: "ci3", name: "Trousers", category: "Custom Apparel", description: "Made-to-order chinos & uniform trousers", sizes: ["28","30","32","34","36","38"], colors: ["Black","Khaki","Navy"], minQty: 30, quote: true, status: "active", updated: "1w ago", botNotes: "Collect waist sizes split before quoting." },
    { id: "ci4", name: "Caps", category: "Accessories", description: "Custom embroidered caps for teams & events", sizes: ["One size"], colors: ["Black","White","Navy","Khaki"], minQty: 60, quote: true, status: "active", updated: "1w ago", botNotes: "Front embroidery only; share logo guidelines." },
    { id: "ci5", name: "Hoodies", category: "Custom Apparel", description: "Pullover & zip hoodies with print or embroidery", sizes: ["S","M","L","XL","XXL"], colors: ["Black","Grey","Navy"], minQty: 30, quote: true, status: "active", updated: "3d ago", botNotes: "Popular for school leavers; mention seasonal lead times." },
    { id: "ci6", name: "Uniform Sets", category: "Custom Apparel", description: "Full uniform sets (shirt + trouser) for institutions", sizes: ["XS","S","M","L","XL"], colors: ["As specified"], minQty: 100, quote: true, status: "inactive", updated: "2w ago", botNotes: "Currently paused — do not offer until supplier confirmed." }
  ]
});

/* ============================================================
   STAFF TASKS  (created from AI conversation events)
   ============================================================ */
Object.assign(window.DB, {
  taskTypes: ["Reply to customer", "Resolve customer issue", "Handle exchange request", "Follow up future order", "Review custom item inquiry", "Escalated AI conversation", "Manager approval needed"],
  taskStatuses: ["new", "assigned", "in_progress", "waiting", "done", "overdue"],
  taskStatusLabel: { new: "New", assigned: "Assigned", in_progress: "In Progress", waiting: "Waiting Customer", done: "Done", overdue: "Overdue" },
  tasks: [
    { id: "TSK-559", title: "Review 1,000 school T-shirt inquiry", customer: "Sapumal Jayasinghe", linked: { type: "monitor", id: "cv_sapumal", label: "Chat" }, type: "Review custom item inquiry", priority: "high", due: "Today 3:00pm", owner: "u_dinesh", status: "new", fromEvent: "staff_handoff_required" },
    { id: "TSK-558", title: "Handle exchange — Medium to Large tee", customer: "Nethmi Perera", linked: { type: "exchange", id: "EX-2041", label: "EX-2041" }, type: "Handle exchange request", priority: "high", due: "Today 1:00pm", owner: null, status: "new", fromEvent: "exchange_request_created" },
    { id: "TSK-557", title: "Chase courier on late delivery", customer: "Tharindu Weerasinghe", linked: { type: "issue", id: "ISS-1187", label: "ISS-1187" }, type: "Resolve customer issue", priority: "high", due: "Today 12:00pm", owner: "u_ruwan", status: "in_progress", fromEvent: "support_case_created" },
    { id: "TSK-556", title: "Give personal size guidance", customer: "Dilki Fernando", linked: { type: "monitor", id: "cv_dilki", label: "Chat" }, type: "Reply to customer", priority: "med", due: "Today 2:00pm", owner: "u_kavindi", status: "assigned", fromEvent: "staff_handoff_required" },
    { id: "TSK-555", title: "Confirm next-week order", customer: "Anjali Mendis", linked: { type: "followup", id: "FU-74", label: "FU-74" }, type: "Follow up future order", priority: "high", due: "Jun 11 (overdue)", owner: "u_dinesh", status: "overdue", fromEvent: "future_followup_scheduled" },
    { id: "TSK-554", title: "Nurture school bulk lead", customer: "Royal College", linked: { type: "followup", id: "FU-71", label: "FU-71" }, type: "Follow up future order", priority: "high", due: "Jun 10 (overdue)", owner: "u_dinesh", status: "overdue", fromEvent: "future_followup_scheduled" },
    { id: "TSK-553", title: "Review colour swap (White to Black)", customer: "Hashan Perera", linked: { type: "exchange", id: "EX-2039", label: "EX-2039" }, type: "Handle exchange request", priority: "med", due: "Today 4:00pm", owner: "u_ruwan", status: "assigned", fromEvent: "exchange_request_created" },
    { id: "TSK-552", title: "Arrange correct hoodie + pickup", customer: "Aisha Mohamed", linked: { type: "issue", id: "ISS-1184", label: "ISS-1184" }, type: "Resolve customer issue", priority: "med", due: "Today", owner: "u_kavindi", status: "in_progress", fromEvent: "support_case_created" },
    { id: "TSK-551", title: "Approve refund for double charge", customer: "Hasini Gamage", linked: { type: "issue", id: "ISS-1176", label: "ISS-1176" }, type: "Manager approval needed", priority: "high", due: "Today", owner: "u_ishara", status: "assigned", fromEvent: "support_case_created" },
    { id: "TSK-550", title: "Decide on damaged jacket case", customer: "Roshan Mendis", linked: { type: "issue", id: "ISS-1181", label: "ISS-1181" }, type: "Escalated AI conversation", priority: "high", due: "Overdue", owner: null, status: "overdue", fromEvent: "staff_handoff_required" },
    { id: "TSK-549", title: "Notify on Large restock", customer: "David Silva", linked: { type: "followup", id: "FU-77", label: "FU-77" }, type: "Follow up future order", priority: "med", due: "Today", owner: "u_kavindi", status: "assigned", fromEvent: "future_followup_scheduled" },
    { id: "TSK-548", title: "Update on tracking issue", customer: "Sanduni Ratnayake", linked: { type: "issue", id: "ISS-1179", label: "ISS-1179" }, type: "Reply to customer", priority: "med", due: "Today", owner: "u_kavindi", status: "waiting", fromEvent: "support_case_created" },
    { id: "TSK-547", title: "Re-dispatch corrected address", customer: "Kavisha Perera", linked: { type: "issue", id: "ISS-1158", label: "ISS-1158" }, type: "Resolve customer issue", priority: "med", due: "Today", owner: "u_ruwan", status: "assigned", fromEvent: "support_case_created" },
    { id: "TSK-546", title: "Confirm gift bundle", customer: "Naduni Herath", linked: { type: "followup", id: "FU-60", label: "FU-60" }, type: "Follow up future order", priority: "med", due: "Jun 20", owner: "u_dinesh", status: "new", fromEvent: "future_followup_scheduled" },
    { id: "TSK-540", title: "Quote 40 staff polos", customer: "Pasan Kumara", linked: { type: "order", id: "OC-3020", label: "OC-3020" }, type: "Review custom item inquiry", priority: "med", due: "Done", owner: "u_dinesh", status: "done", fromEvent: "staff_handoff_required" },
    { id: "TSK-538", title: "Confirm cap purchase", customer: "Ruwan Silva", linked: { type: "order", id: "OC-3014", label: "OC-3014" }, type: "Reply to customer", priority: "low", due: "Done", owner: "u_ruwan", status: "done", fromEvent: "conversation_resolved" }
  ]
});

/* ============================================================
   AI BOT STATUS + EVENT LOG
   ============================================================ */
Object.assign(window.DB, {
  botStatus: { online: true, waConnected: true, eventStream: true, lastEventSec: 12, confidence: 84, handled: 312, resolvedRate: 73, escalations: 68, lowConfidence: 21, failed: 9, avgResponse: "7s", uptime: "99.9%" },
  eventTypeLabel: { conversation_created: "conversation_created", message_received: "message_received", intent_detected: "intent_detected", exchange_request_created: "exchange_request_created", support_case_created: "support_case_created", future_followup_scheduled: "future_followup_scheduled", staff_handoff_required: "staff_handoff_required", conversation_resolved: "conversation_resolved" },
  eventClass: { conversation_created: "c-create", message_received: "c-msg", intent_detected: "c-intent", exchange_request_created: "c-exchange", support_case_created: "c-case", future_followup_scheduled: "c-followup", staff_handoff_required: "c-handoff", conversation_resolved: "c-resolved" },
  botEvents: [
    { t: "12:04:51", type: "conversation_resolved", desc: "Kamal Fernando · delivery question · resolved by AI" },
    { t: "12:04:39", type: "intent_detected", desc: "Nimal Perera · order conversation · confidence 0.88" },
    { t: "12:04:12", type: "message_received", desc: "Nethmi Perera · inbound WhatsApp message" },
    { t: "12:03:50", type: "exchange_request_created", desc: "EX-2041 · Nethmi Perera · Medium to Large" },
    { t: "12:03:48", type: "staff_handoff_required", desc: "Nethmi Perera · exchange needs staff approval" },
    { t: "12:01:22", type: "support_case_created", desc: "ISS-1187 · Tharindu W. · delivery issue" },
    { t: "11:58:09", type: "intent_detected", desc: "Sapumal J. · custom item inquiry · confidence 0.82" },
    { t: "11:57:55", type: "staff_handoff_required", desc: "Sapumal J. · bulk order → Sales" },
    { t: "11:55:30", type: "future_followup_scheduled", desc: "FU-77 · David Silva · restock notify" },
    { t: "11:52:14", type: "conversation_created", desc: "Dinusha Silva · new web chat" },
    { t: "11:49:03", type: "conversation_resolved", desc: "Ruwan Silva · cap colours · converted" },
    { t: "11:45:41", type: "message_received", desc: "Ayesha Rahman · inbound Instagram message" },
    { t: "11:42:18", type: "intent_detected", desc: "Dilki Fernando · order · LOW confidence 0.58" },
    { t: "11:42:10", type: "staff_handoff_required", desc: "Dilki Fernando · low confidence handoff" }
  ],
  reportTabs: [
    ["conversation", "Conversation Report"], ["ai", "AI Performance Report"], ["issue", "Customer Issue Report"],
    ["exchange", "Exchange Request Report"], ["followup", "Future Follow-up Report"], ["order", "Order Conversation Report"],
    ["task", "Staff Task Report"], ["custom", "Custom Item Inquiry Report"]
  ],
  incoming: [
    { customer: "Suresh Kumar",  initials: "SK", channel: "wa",  text: "Is the bomber jacket available in M?", intent: "Order Conversation", type: "order" },
    { customer: "Dilani Perera", initials: "DP", channel: "ig",  text: "My parcel hasn't arrived yet 😟", intent: "Delivery Issue", type: "issue" },
    { customer: "Roshan Lee",    initials: "RL", channel: "wa",  text: "Can I exchange my tee size S to M?", intent: "Exchange Request", type: "exchange" },
    { customer: "Amaya Silva",   initials: "AS", channel: "web", text: "Tell me when the floral dress restocks", intent: "Future Follow-up", type: "followup" },
    { customer: "Green School",  initials: "GS", channel: "wa",  text: "We need 300 sports T-shirts with print", intent: "Custom Item Inquiry", type: "custom" }
  ]
});
