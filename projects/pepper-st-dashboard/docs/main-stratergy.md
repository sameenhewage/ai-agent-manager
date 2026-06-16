# Multi-Business, Branch, Channel, Conversation Strategy

## 1. Purpose

This document defines the future-proof business structure for the dashboard.

The system must support:

```txt
one tenant → many businesses
one business → many locations / branches
one business or branch → many customer channels
one channel → many conversations
one conversation → one mapped AI / Agno session
```

The design must work for simple customers like PEPPER ST today, and later for larger businesses like bakery chains, supermarkets, franchises, or multi-brand companies.

The system must not assume:

```txt
tenant = business
business = branch
branch = WhatsApp number
WhatsApp number = customer identity
one business = one channel
one channel = one branch
```

---

## 2. Final Business Hierarchy

```txt
Tenant
  → Business / Brand
      → Location / Branch optional
          → Channel
              → Conversation
                  → AI / Agno Session
```

### Meaning

```txt
Tenant       = SaaS account / billing / owner boundary
Business     = brand, shop, business line, or operational business
Location     = branch, store, outlet, district branch, or pickup location
Channel      = customer entry point: WhatsApp, Instagram, Facebook, Website, etc.
Conversation = one customer chat
Agno Session = AI source-of-truth session/history
```

---

## 3. Tenant vs Business

A tenant is the SaaS account owner.

A business is the actual brand or business line inside that tenant.

### Simple customer example

For PEPPER ST initial version:

```txt
Tenant: PEPPER ST
Business: PEPPER ST Fashion
```

Here tenant and business look almost the same. During onboarding, the system can automatically create a default business under the tenant.

```txt
Create tenant
→ Create default business
→ Add channels
→ Bind AI agent
```

The UI does not need to expose multi-business complexity for a single-business customer.

### Future customer example

For a larger customer:

```txt
Tenant: Sameen Group

Businesses:
  - Sameen Bakery
  - Sameen Cafe
  - Sameen Catering
  - Sameen Cakes
```

This is why tenant and business must be separate in the database.

Rule:

```txt
A tenant can have one or many businesses.
A business always belongs to one tenant.
```

---

## 4. Business vs Location / Branch

A business can have many locations or branches.

Example:

```txt
Tenant: Sameen Group

Business: Sameen Bakery
  Locations:
    - Colombo Main
    - Kandy
    - Galle
    - Jaffna
    - Kurunegala
```

A branch is not a separate business unless the customer explicitly wants to treat it that way.

For chain businesses, the correct model is:

```txt
Business = Sameen Bakery
Location = Colombo / Kandy / Galle branches
```

Rule:

```txt
Business is the brand or operation.
Location is the branch/store/outlet under that business.
```

---

## 5. Channel Model

A channel is the actual place where the customer contacts the business.

Examples:

```txt
WhatsApp number
Instagram business account
Facebook page
Website chat widget
Messenger page
Future: TikTok, email, marketplace chat, etc.
```

A business or branch can have many channels.

Example:

```txt
Business: PEPPER ST Fashion

Channels:
  - WhatsApp
  - Instagram
  - Facebook
  - Website Chat
```

A branch can also have its own channels.

Example:

```txt
Business: Sameen Bakery

Location: Colombo Main
  - WhatsApp Colombo Number

Location: Kandy
  - WhatsApp Kandy Number

Shared business channels:
  - Instagram Main Account
  - Facebook Page
  - Website Chat
```

Rule:

```txt
One business can have many channels.
One branch can have many channels.
One shared channel can serve the whole business.
```

---

## 6. Channel Type vs External Channel ID

These two must be separate.

```txt
type = platform name
external_channel_id = provider-side identifier
```

Examples:

```txt
type = whatsapp
external_channel_id = Meta WhatsApp phone_number_id

type = instagram
external_channel_id = Instagram business account id

type = facebook
external_channel_id = Facebook page id

type = website
external_channel_id = Website widget/site id
```

Wrong design:

```txt
external_channel_id = "whatsapp"
external_channel_id = "instagram"
external_channel_id = "facebook"
```

Correct design:

```txt
type = "whatsapp"
external_channel_id = "meta_phone_number_id_123"

type = "instagram"
external_channel_id = "ig_business_account_id_456"

type = "facebook"
external_channel_id = "fb_page_id_789"
```

---

## 7. Location / Branch Assignment

`location_id` is optional in channels and conversations.

This does not mean location is always unknown.

It means the system supports both branch-specific and shared channels.

### Case A: Branch-specific channel

Example:

```txt
Kandy WhatsApp number
→ channel.location_id = Kandy
→ conversation.location_id = Kandy
```

Branch is known immediately.

### Case B: Shared channel

Example:

```txt
Main Instagram account
Shared WhatsApp number
Website chat
```

These may serve the whole business, not one branch.

```txt
channel.location_id = null
conversation.location_id = null initially
```

Then branch can be assigned later.

### Branch resolution methods

```txt
1. Branch-specific WhatsApp number
2. Branch-specific QR code / link
3. Customer selects branch
4. AI asks customer
5. Customer message mentions branch
6. Delivery address / nearest branch
7. Customer history
8. Manual staff correction
```

Example:

```txt
Customer: Hi, I need a cake.

AI: Sure. Which branch do you prefer — Colombo, Kandy, or Galle?

Customer: Kandy.

System:
conversation.location_id = Kandy
location_source = customer_selection
location_confidence = high
```

---

## 8. Premium Branch Routing

Branch-aware routing can be a premium feature.

### Basic plan behavior

```txt
All conversations appear in the central business inbox.
Branch can be captured when available.
No advanced branch routing required.
```

### Premium plan behavior

```txt
Conversation can be routed to the correct branch.
Branch-specific inboxes are available.
Branch-specific analytics are available.
Branch-specific staff permissions can be applied.
Branch-specific AI context can be used.
Branch-specific offers, stock, pickup, or delivery handling can be enabled.
```

Example premium flow:

```txt
Customer messages shared WhatsApp
→ AI asks branch
→ Customer selects Kandy
→ conversation.location_id = Kandy
→ realtime event updates Kandy branch inbox
→ Kandy branch analytics update
```

This makes branch routing a clear product capability instead of forcing complexity into every customer from day one.

---

## 9. Core Dashboard Tables

Minimum future-proof schema:

```txt
dashboard.app_tenants
dashboard.app_businesses
dashboard.app_locations
dashboard.app_channels
dashboard.app_conversations
dashboard.app_ai_agent_bindings
dashboard.app_realtime_outbox
```

Optional later tables:

```txt
dashboard.app_users
dashboard.app_user_business_access
dashboard.app_user_location_access
dashboard.app_user_channel_access
```

The optional user/access tables are only needed when staff permissions are implemented.

---

## 10. Table Responsibilities

### 10.1 app_tenants

Represents the SaaS customer account.

Example:

```txt
id: tenant_001
name: PEPPER ST Group
slug: pepper-st
timezone: Asia/Colombo
status: active
```

---

### 10.2 app_businesses

Represents a brand or business line under a tenant.

Example:

```txt
id: biz_001
tenant_id: tenant_001
name: PEPPER ST Fashion
category: apparel
timezone: Asia/Colombo
status: active
```

Rules:

```txt
A tenant can have many businesses.
A business belongs to one tenant.
For a single-business tenant, create a default business automatically.
```

---

### 10.3 app_locations

Represents a branch/store/outlet/location.

Example:

```txt
id: loc_001
tenant_id: tenant_001
business_id: biz_001
name: Colombo Store
district: Colombo
city: Colombo
status: active
```

Rules:

```txt
A business can have many locations.
A business can also have zero locations.
Locations are optional for online-only businesses.
```

---

### 10.4 app_channels

Represents a real external customer entry point.

Example branch-specific WhatsApp:

```txt
id: ch_001
tenant_id: tenant_001
business_id: biz_001
location_id: loc_001
type: whatsapp
external_channel_id: meta_phone_number_id_colombo
display_name: Colombo WhatsApp
status: active
```

Example shared Instagram:

```txt
id: ch_010
tenant_id: tenant_001
business_id: biz_001
location_id: null
type: instagram
external_channel_id: instagram_business_account_id_main
display_name: PEPPER ST Instagram
status: active
```

Rules:

```txt
channel_id must always be known for a conversation.
business_id must always be known for a channel.
location_id can be null if the channel is shared.
```

---

### 10.5 app_conversations

Represents one customer conversation in the dashboard.

Example:

```txt
id: conv_001
tenant_id: tenant_001
business_id: biz_001
location_id: loc_001 or null
channel_id: ch_001
agno_session_id: agno session id by value
external_contact_id: customer external id, server-side only
status: active
location_source: channel_mapping / customer_selection / ai_extraction / manual / unknown
location_confidence: 0.00 - 1.00
first_at
last_at
```

Rules:

```txt
tenant_id must be known.
business_id must be known.
channel_id must be known.
location_id can be null until branch is resolved.
agno_session_id maps by value to ai.agno_sessions.session_id.
external_contact_id must not be exposed raw to browser.
```

---

### 10.6 app_ai_agent_bindings

Maps dashboard scope to external AI/Agno agent identifiers.

Do not hardcode Agno agent_id format into app logic.

Example:

```txt
id: bind_001
tenant_id: tenant_001
business_id: biz_001
location_id: null
channel_id: ch_001
provider: agno
external_agent_id: agno_pepper_whatsapp_agent
status: active
```

Mapping:

```txt
ai.agno_sessions.agent_id
→ app_ai_agent_bindings.external_agent_id
→ tenant / business / location / channel
```

This supports:

```txt
one AI agent per business
one AI agent per channel
one AI agent per branch
one shared AI agent for many channels
future provider changes without schema redesign
```

---

### 10.7 app_realtime_outbox

Stores safe realtime events for WebSocket/SSE delivery.

Purpose:

```txt
Avoid every browser refetching data.
Allow dashboard and analytics to update from safe deltas.
Support recovery if realtime connection fails.
```

Example fields:

```txt
id
tenant_id
business_id
location_id nullable
channel_id nullable
conversation_id nullable
event_type
payload_safe_json
created_at
processed_at
```

Rules:

```txt
Do not store browser-facing raw phone numbers.
Do not store raw Agno runs.
Do not expose agno_session_id to browser.
Do not expose external_contact_id to browser.
Payload must contain safe IDs and safe UI-ready DTOs only.
```

---

## 11. Agno Boundary Rule

Agno tables remain read-only.

Do not migrate, alter, drop, truncate, or write to:

```txt
ai.agno_sessions
ai.customers
ai.agno_metrics
other ai.* tables
```

Dashboard mapping is by value only:

```txt
dashboard.app_conversations.agno_session_id
=
ai.agno_sessions.session_id
```

No foreign key should be created from `dashboard.*` tables to `ai.*` tables.

---

## 12. Incoming Message Resolution

When a new message comes from WhatsApp, Instagram, Facebook, or Website, the system resolves scope in this order:

```txt
1. Resolve channel from external_channel_id + type
2. Resolve tenant/business from app_channels
3. Resolve location if channel is branch-specific
4. Create/update conversation
5. Map/link Agno session
6. Emit safe realtime event
```

### WhatsApp branch-specific example

```txt
incoming external_channel_id = meta_phone_number_id_kandy
→ app_channels match
→ business = Sameen Bakery
→ location = Kandy
→ conversation.location_id = Kandy
```

### Instagram shared example

```txt
incoming external_channel_id = instagram_business_account_main
→ app_channels match
→ business = Sameen Bakery
→ location = null
→ conversation starts with location unknown
```

---

## 13. Customer Identity Across Channels

A customer can contact the same business from different platforms.

Example:

```txt
Nimal messages on WhatsApp.
Nimal later messages on Instagram.
```

Default behavior:

```txt
Treat as separate conversations.
Do not auto-merge.
```

Future identity resolver can merge only with strong evidence:

```txt
verified phone match
logged-in customer account
same order/customer profile
manual staff merge
customer confirmation
high-confidence AI match
```

---

## 14. Realtime Strategy

Realtime must feel smooth, not like page polling.

Initial page load can call APIs once.

After that, realtime events should update UI state directly using safe deltas or patches.

### Correct flow

```txt
Platform event / app event / DB event
→ server creates/updates dashboard metadata
→ server writes safe realtime outbox event
→ WebSocket or SSE sends event to browser
→ browser patches local state
```

### Browser must not do this per message

```txt
refetch /api/dashboard
refetch /api/analytics
refetch /api/chat-monitor
clear UI
show global loader
flicker cards/charts
reset selected chat
```

### Realtime event example

```json
{
  "type": "message.created",
  "tenantId": "safe-tenant-id",
  "businessId": "safe-business-id",
  "locationId": "safe-location-id-or-null",
  "channelId": "safe-channel-id",
  "conversationId": "safe-conversation-id",
  "message": {
    "id": "safe-message-id",
    "role": "customer",
    "content": "Hi, do you have black t-shirts?",
    "createdAt": "2026-06-17T10:23:00.000Z"
  },
  "conversationPatch": {
    "lastMessagePreview": "Hi, do you have black t-shirts?",
    "lastMessageAt": "2026-06-17T10:23:00.000Z"
  },
  "metricsDelta": {
    "messages": 1,
    "conversations": 0
  }
}
```

Browser applies this to local state without refetching the whole dashboard.

---

## 15. Realtime Transport Decision

Use one main realtime browser transport.

```txt
SSE is enough for read-only server → browser updates.
WebSocket is better if future staff replies, human takeover, typing, read receipts, or two-way control are planned.
```

Do not use SSE and WebSocket together for the same realtime stream unless there is a specific reason.

For future commerce/shared-inbox features, WebSocket may be the better long-term choice.

---

## 16. Dashboard / Analytics Rule

Dashboard and analytics must be scope-aware.

Filters should support:

```txt
tenant total
business total
location / branch total
channel total
date range
```

Realtime event scope must include:

```txt
tenant_id
business_id
location_id nullable
channel_id
conversation_id
```

When an event arrives, UI should update only the currently relevant view.

Example:

```txt
User is viewing Kandy branch dashboard.
Message arrives for Colombo branch.
Kandy dashboard should not rerender unnecessarily.
Tenant total can update if visible.
```

---

## 17. Chat Monitor UX Rule

Chat Monitor should feel like WhatsApp.

Rules:

```txt
Do not clear conversation list.
Do not reset selected chat.
Do not reload full transcript for every new message.
Append only missing new messages.
Deduplicate by stable message id.
If user is at bottom, keep bottom.
If user is reading old messages, do not auto-scroll.
Show “New messages” indicator.
Keep branch/channel badges stable.
```

Conversation list should show:

```txt
customer display name
channel badge
business/location if relevant
last message preview
last message time
status
```

---

## 18. Migration Strategy

Existing data must not be deleted.

Agno tables must not be touched.

Migration pattern:

```txt
expand
→ backfill
→ verify
→ enforce
```

### Step 1: Add new dashboard tables

```txt
app_businesses
app_locations
app_ai_agent_bindings
app_realtime_outbox
```

### Step 2: Add new nullable columns

```txt
app_channels.business_id
app_channels.location_id nullable
app_conversations.business_id
app_conversations.location_id nullable
```

### Step 3: Create default business

For existing PEPPER ST tenant:

```txt
Tenant: PEPPER ST
→ Business: PEPPER ST Fashion / Default Business
```

### Step 4: Backfill existing rows

Existing channels and conversations should map to the default business.

If branch is not known:

```txt
location_id = null
```

### Step 5: Verify counts

Before enforcing constraints:

```txt
all existing conversations preserved
all existing channels preserved
all conversations have tenant_id
all conversations have business_id
all conversations have channel_id
Agno sessions untouched
no customer/chat data deleted
```

### Step 6: Enforce dashboard-only constraints

After verification:

```txt
business_id NOT NULL where required
channel_id NOT NULL for conversations
dashboard-only foreign keys
indexes for tenant/business/location/channel
```

Do not create foreign keys to `ai.*`.

---

## 19. Final Visual

```txt
TENANT
PEPPER ST Group
│
└── BUSINESS
    PEPPER ST Fashion
    │
    ├── LOCATION
    │   Colombo Store
    │   │
    │   ├── CHANNEL
    │   │   WhatsApp Colombo
    │   │   └── Conversation
    │   │       └── Agno Session
    │   │
    │   └── CHANNEL
    │       Facebook Page
    │       └── Conversation
    │           └── Agno Session
    │
    ├── LOCATION
    │   Kandy Store
    │   │
    │   └── CHANNEL
    │       WhatsApp Kandy
    │       └── Conversation
    │           └── Agno Session
    │
    └── SHARED CHANNELS
        Instagram / Website / Shared WhatsApp
        │
        └── Conversation
            location_id = null first
            location assigned later if needed
            └── Agno Session
```

---

## 20. Final Decision

The dashboard must support:

```txt
one tenant → many businesses
one business → many branches / locations
one business or branch → many channels
one channel → many conversations
one conversation → one mapped Agno session
shared channels where branch is unknown at first
branch-specific channels where branch is known immediately
premium branch-aware routing
safe realtime updates without repeated browser refetches
Agno tables untouched
```

This model supports PEPPER ST today and larger future customers such as bakeries, franchises, supermarkets, multi-branch businesses, online-only brands, and multi-channel sales teams.
