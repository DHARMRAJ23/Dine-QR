# Dine-QR — Complete Build Guide: Fast, Secure, Production-Ready

This merges the phased roadmap with the security/architecture details, plus adds **performance** as an explicit third pillar. Use this as your single reference while building.

---

## 0. Stack Decision (pick one before starting)

| | **Option A: Node/Express + Postgres + Socket.IO** | **Option B: Supabase (Postgres + Auth + Realtime + Storage)** |
|---|---|---|
| Best for | Learning how auth/APIs/WebSockets work under the hood; full control | Shipping fast with less to secure yourself |
| You build | API server, auth, WebSocket server, authorization logic | Mostly frontend + database policies |
| Security ownership | 100% on you — must check auth on every route manually | Row-Level Security (RLS) enforces it at the DB layer |
| Hosting | Render/Railway (API) + separate DB host | One dashboard, one bill |

**Recommendation:** If you want to *learn* full-stack dev deeply → Option A. If you want the fastest path to something genuinely secure and live → Option B. The rest of this guide gives DB schema and API contracts that work for either — just swap "Edge Function" for "Express route" if you go Option A.

---

## 1. Security (non-negotiable, build this in from day one)

### 1.1 Never trust the client
The single most important rule for this app:

- **Never accept prices from the client.** Cart shows a preview total; the server recomputes subtotal/tax/service charge from the *current* menu price in the database at checkout. This closes the #1 exploit for apps like this — editing the cart total in devtools before submitting.
- **Never accept order status changes from customers.** Only authenticated staff sessions can `PATCH` an order's status. Enforce this server-side (or via RLS), not just by hiding the button in the UI.
- **Use unguessable QR tokens**, not sequential table numbers, so `/menu/table-2` → `/menu/table-3` guessing isn't possible. Use a random UUID per table.

### 1.2 Authentication
- Real password hashing (bcrypt/argon2) — never store or compare plaintext passwords, and never do the check in client-side JS.
- Signed sessions/JWTs for staff, checked on every protected API call.
- Customers stay anonymous but get a short-lived session token tied to their table/order, so they can safely reconnect if the tab closes.

### 1.3 Authorization
- Every write endpoint checks: *who is this request from, and are they allowed to do this?* — on the server, every time, not just at login.
- If using Supabase: enable Row-Level Security on every table (see schema below).
- If using Express: write middleware that runs on every protected route, not ad hoc checks per-route.

### 1.4 Input validation & abuse prevention
- Validate all incoming data server-side (types, ranges, required fields) — use a library like `zod` on both ends so you're not hand-rolling checks.
- Rate-limit order placement per table/session to stop spam-ordering.
- Sanitize any free-text fields (special instructions, guest name) before storing/rendering to prevent stored XSS.
- HTTPS everywhere (free via Vercel/Netlify/Render — no excuse to skip this).

---

## 2. Performance (making it actually fast)

Speed matters here specifically because customers are on mobile networks in a restaurant, often with weak signal.

### 2.1 Frontend
- **Code-split by route** — `React.lazy()` + `Suspense` for `/admin/*` routes so customers never download admin bundle code.
- **Image optimization** — serve menu images via a CDN with automatic resizing/WebP (Cloudflare Images, Supabase Storage transforms, or Cloudinary). Never ship full-resolution uploads to a phone.
- **Skeleton loaders**, not blank screens, while menu/order data fetches — perceived speed matters as much as real speed.
- **Debounce/throttle** any live-search or filter inputs on the menu page.
- Keep Tailwind's purge/JIT config tight so unused CSS isn't shipped.

### 2.2 Data fetching
- Use **React Query** (or SWR) for caching — the menu barely changes minute-to-minute, so cache it client-side and only refetch on a realtime "menu updated" event, not on every page load.
- Paginate or virtualize the admin order history if it grows large.

### 2.3 Backend
- Index your database on the columns you filter by constantly: `orders.restaurant_id`, `orders.status`, `menu_items.restaurant_id`.
- Keep Edge Functions/API routes small and single-purpose — cold-start time matters on serverless.
- Use a CDN in front of the frontend (Vercel/Netlify do this by default).

### 2.4 Real-time
- Subscribe only to the specific restaurant's channel (`filter: restaurant_id=eq.X`), not a global firehose of every order in the system.
- Unsubscribe from realtime channels when a component unmounts (e.g., customer navigates away from the tracker) to avoid leaked connections.

---

## 3. Database Schema (Postgres — works for Supabase or plain Postgres+Prisma)

```sql
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table staff (
  id uuid primary key references auth.users(id), -- or your own users table if using Option A
  restaurant_id uuid references restaurants(id),
  role text check (role in ('admin','kitchen','waiter')) default 'admin'
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id),
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  category text not null,
  image_url text,
  in_stock boolean default true
);

create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id),
  table_number int not null,
  qr_token text unique not null
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id),
  table_id uuid references restaurant_tables(id),
  guest_name text,
  status text check (status in ('placed','accepted','preparing','served')) default 'placed',
  subtotal numeric(10,2) not null,
  tax numeric(10,2) not null,
  service_charge numeric(10,2) not null,
  total numeric(10,2) not null,
  notes text,
  created_at timestamptz default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  menu_item_id uuid references menu_items(id),
  quantity int not null check (quantity > 0),
  price_at_order numeric(10,2) not null
);

create index on orders (restaurant_id, status);
create index on menu_items (restaurant_id);
```

If using Supabase, enable RLS on every table, e.g.:

```sql
alter table menu_items enable row level security;

create policy "Public read menu" on menu_items for select using (true);

create policy "Staff manage menu" on menu_items for all using (
  auth.uid() in (select id from staff where restaurant_id = menu_items.restaurant_id)
);
```

---

## 4. API Contract

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/menu?restaurant=:qrToken` | Public | Resolve restaurant from QR token, return menu |
| `POST` | `/api/orders` | Anonymous session | Body: `{ items: [{menuItemId, qty}], tableId, guestName, notes }` — server computes all prices |
| `GET` | `/api/orders/:id` | Session-matched | Customer polls/subscribes to their own order |
| `PATCH` | `/api/orders/:id/status` | Staff only | Advances status; validate transitions (`placed→accepted→preparing→served`, no skipping backward) |
| `POST` | `/api/menu` | Staff only | Create menu item |
| `PUT` | `/api/menu/:id` | Staff only | Edit item |
| `DELETE` | `/api/menu/:id` | Staff only | Delete item |
| `POST` | `/api/tables` | Staff only | Generate table + QR token |

---

## 5. Build Order (do these in sequence)

1. **Set up the database** (Supabase project, or Postgres + Prisma) using the schema above.
2. **Build `GET /api/menu`** and point `MainMenu.tsx` at it instead of `localStorage`. Confirm this works end-to-end before moving on.
3. **Build `POST /api/orders`** with server-side price computation. Test that submitting a tampered client total gets ignored.
4. **Add real-time** — Supabase Realtime channel, or Socket.IO server + client — for `OrderBoard.tsx` and `LiveTracker.tsx`.
5. **Add staff auth** — replace the hardcoded admin password with real signed-in sessions; protect all admin routes.
6. **Add React Query/SWR** to `CartContext.tsx` and menu fetching for caching + loading states.
7. **Move images to CDN/object storage**, drop the base64-in-localStorage approach.
8. **Add rate limiting + input validation** on all write endpoints.
9. **Performance pass** — code-split admin routes, add skeleton loaders, check bundle size.
10. **Deploy**: frontend → Vercel/Netlify; backend/DB → your chosen host; custom domain + HTTPS.

---

## 6. Quick Checklist Before Calling It "Production-Ready"

- [ ] No prices ever accepted from client input
- [ ] Order status changes require staff auth, enforced server-side
- [ ] QR tokens are random, not sequential
- [ ] Passwords hashed, never compared in client JS
- [ ] HTTPS enforced everywhere
- [ ] Rate limiting on order placement
- [ ] Images served via CDN, not base64 blobs
- [ ] Realtime channels scoped per-restaurant, unsubscribed on unmount
- [ ] Loading states for every network fetch
- [ ] Database indexes on frequently-filtered columns
