# 🍽️ Dine-In QR Menu System

A fully **serverless, static, client-side** restaurant ordering system built with React 19 + TypeScript + Tailwind CSS v4. Customers scan a table QR code to browse the menu and place orders. The admin dashboard receives and manages orders in real-time — all without a backend server.

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server (hot reload)
npm run dev

# Run all unit tests
npm test

# Production build (outputs to dist/)
npm run build
```

The app runs at `http://localhost:5173` by default.

---

## 🔑 Demo Credentials

| Role  | URL                                | Username | Password |
|-------|------------------------------------|----------|----------|
| Admin | `http://localhost:5173/#/admin/login` | `admin`  | `admin123` |

> ⚠️ These are **hardcoded demo credentials**. See [Security Notes](#-security-notes) before deploying.

---

## 📱 How to Use

### Customer Flow
1. Scan the QR code for your table (or go to `/#/menu/5` for table 5)
2. Browse the menu by category
3. Add items to your cart
4. Go to cart (`/#/cart`), enter your name, optionally add kitchen notes
5. Tap **Place Order**
6. Track your order live at `/#/status/<orderId>`

### Admin Flow
1. Log in at `/#/admin/login`
2. **Order Board** (`/#/admin/dashboard`) — see incoming orders in real-time, advance them through the Kanban stages
3. **Menu Manager** (`/#/admin/menu`) — add/edit/delete items, toggle availability
4. **QR Codes** (`/#/admin/qr-codes`) — generate and print table QR codes

---

## 🏗️ Architecture

### Technology Stack

| Layer            | Technology          | Version |
|------------------|---------------------|---------|
| Framework        | React               | 19      |
| Language         | TypeScript          | ~6.0    |
| Build Tool       | Vite                | 8       |
| Styling          | Tailwind CSS        | v4      |
| Routing          | React Router (Hash) | 7       |
| Icons            | Lucide React        | 1.x     |
| QR Codes         | qrcode.react        | 4       |
| Testing          | Vitest + RTL        | 4 / 16  |
| Linting          | OxLint              | 1.x     |

### Why HashRouter?

The app is designed for **static hosting** (GitHub Pages, any CDN) without server-side routing configuration. `HashRouter` uses the URL fragment (`#`) so navigating to `/#/admin/dashboard` works correctly without a server returning `index.html` for all paths.

### State Management

All application state lives in a single **React Context** (`CartContext`). No Redux, no Zustand.

```
CartProvider (wraps entire app)
├── menuItems   → persisted in localStorage['dine_in_menu']
├── orders      → persisted in localStorage['dine_in_orders']
└── cart        → persisted in sessionStorage['dine_in_cart']
    guestName   → persisted in sessionStorage['dine_in_guest_name']
    tableId     → persisted in sessionStorage['dine_in_table_id']
```

`sessionStorage` is intentional for cart data — it resets when the tab closes, so a new customer at the same device starts fresh.

### Cross-Tab Real-Time Sync

The app simulates a WebSocket connection using the browser's native `storage` event:

```
Customer Tab                     Admin Tab
─────────────                    ──────────
socketBus.emit('new_order')  ──► localStorage write
       │                                │
       ▼                          storage event fires
Local listeners update          Local listeners update
immediately (same tab)          in admin tab
```

The `SimulatedSocketBus` class in `src/utils/eventBus.ts` handles both same-tab (local dispatch) and cross-tab (localStorage bridge) communication.

---

## 📁 Project Structure

```
src/
├── main.tsx                    # App entry point (React 18 createRoot)
├── App.tsx                     # Root component: providers + routing + global UI
├── index.css                   # Global styles + Tailwind imports + print media
├── App.css                     # App-scoped utility overrides
│
├── types/
│   └── index.ts                # All shared TypeScript interfaces (FoodItem, Order, etc.)
│
├── config/
│   └── billing.ts              # Tax rate (5% GST) + service charge (₹20) constants
│
├── data/
│   └── mockData.ts             # Default menu items (INITIAL_FOOD_ITEMS) + CATEGORIES list
│
├── context/
│   ├── CartContext.tsx         # 🌐 Global state: menu, cart, orders + all actions
│   └── AuthContext.tsx         # 🔐 Admin session management (demo auth)
│
├── utils/
│   ├── eventBus.ts             # 📡 Simulated WebSocket (localStorage cross-tab bridge)
│   ├── storage.ts              # 🛡️ Safe localStorage/sessionStorage helpers + type guards
│   ├── audio.ts                # 🔔 Web Audio API POS chime for new orders
│   └── storage.test.ts         # Unit tests for storage utility
│
└── components/
    ├── common/
    │   └── ErrorBoundary.tsx   # React error boundary (prevents white screen crashes)
    │
    ├── customer/
    │   ├── MainMenu.tsx        # Customer: browse menu by category + add to cart
    │   ├── CartPage.tsx        # Customer: review cart + enter name + place order
    │   └── LiveTracker.tsx     # Customer: real-time order status + receipt
    │
    └── admin/
        ├── AdminLogin.tsx      # Admin: login form (demo credentials)
        ├── AdminSidebar.tsx    # Admin: persistent nav + reset actions + logout
        ├── OrderBoard.tsx      # Admin: 3-column Kanban board (placed/preparing/served)
        ├── MenuManager.tsx     # Admin: add/edit/delete/toggle menu items
        └── QRCodeGenerator.tsx # Admin: generate + print QR codes for all tables
```

---

## 📦 localStorage / sessionStorage Key Reference

| Key                            | Storage       | What's stored                                 |
|--------------------------------|---------------|-----------------------------------------------|
| `dine_in_menu`                 | localStorage  | `FoodItem[]` — the current restaurant menu    |
| `dine_in_orders`               | localStorage  | `Order[]` — all placed orders                 |
| `dine_in_cart`                 | sessionStorage| `CartItem[]` — current customer's cart        |
| `dine_in_table_id`             | sessionStorage| `string` — table number from QR scan          |
| `dine_in_guest_name`           | sessionStorage| `string` — customer's entered name            |
| `dine_in_special_instructions` | sessionStorage| `string` — customer's kitchen notes           |
| `demo_admin_session`           | localStorage  | `AdminSession` — admin auth token + expiry    |
| `dine_in_socket_event`         | localStorage  | Ephemeral cross-tab event payload (overwritten each emit) |

---

## 💰 Billing Calculation

All monetary values are in **Indian Rupees (₹)** as integers.

```
Subtotal      = Σ (item.price × item.quantity)
Tax           = round(subtotal × 0.05)   // 5% GST
Service Charge = ₹20 (flat per order)
Grand Total   = subtotal + tax + serviceCharge
```

To change rates, edit `src/config/billing.ts` — the change automatically propagates to CartContext, CartPage, and LiveTracker.

---

## 🔄 Order State Machine

Orders can only move **forward** through statuses, never backward:

```
placed  →  accepted  →  preparing  →  served
```

Any other transition is silently rejected by `isValidOrderTransition()` in `CartContext.tsx`.

---

## 🧪 Testing

```bash
npm test           # Run all tests once (CI-friendly)
npm test -- --watch  # Watch mode for development
```

Test files:
- `src/utils/storage.test.ts` — Unit tests for storage helpers and type guards
- `src/context/CartContext.test.tsx` — Integration tests for cart and order flow

---

## 🛡️ Security Notes

> **This is a demo/prototype application.** The following security limitations exist by design and MUST be addressed before production deployment:

| Issue | Current State | Production Fix |
|-------|---------------|----------------|
| Admin credentials | Hardcoded in `AuthContext.tsx` | Use a real auth provider (Firebase Auth, Auth0, Supabase) |
| Session storage | JWT mock in localStorage | Use HttpOnly cookies + server-issued real JWTs |
| No server | All data is client-side | Add a backend (Node.js, Firebase, Supabase) |
| No access control | Any user can access `/admin/*` without a real session | Server-side route protection |
| No XSS protection | Input sanitisation is basic (max length, no HTML tags) | Content Security Policy headers |
| No rate limiting | Order placement is unlimited | Server-side rate limiting |

---

## 🖨️ Printing QR Codes

1. Go to `/#/admin/qr-codes`
2. Enter the range of table numbers (e.g. 1 to 20)
3. Click **"Print All"** to open the print dialog
4. The print CSS in `index.css` formats cards in a 2-column A4 grid automatically

---

## 🔧 Development Notes

### Adding a New Page

1. Create the component in the appropriate folder (`customer/` or `admin/`)
2. Add a `@fileoverview` JSDoc comment at the top
3. Add the route in `App.tsx` inside `<Routes>`
4. If admin-only, wrap with `<ProtectedRoute>`
5. Add a nav link in `AdminSidebar.tsx` (if admin page)

### Adding a New Menu Category

1. Add an entry to `CATEGORIES` in `src/data/mockData.ts`
2. The `MainMenu.tsx` tab navigation and `MenuManager.tsx` category dropdown update automatically

### Changing the Tax or Service Charge

Edit `src/config/billing.ts` — all billing UI and calculations read from this file.

### Resetting All Data (Dev)

Use the Admin Sidebar → **"Full Reset"** button, or clear localStorage manually:
```js
// In browser console:
localStorage.clear(); sessionStorage.clear(); location.reload();
```

---

## 📋 npm Scripts Reference

| Script          | What it does                                          |
|-----------------|-------------------------------------------------------|
| `npm run dev`   | Start Vite dev server with HMR at localhost:5173      |
| `npm test`      | Run all Vitest unit tests once (no watch)             |
| `npm run build` | TypeScript check + Vite production bundle → `dist/`   |
| `npm run lint`  | Run OxLint static analysis on the source              |
| `npm run preview` | Serve the production `dist/` bundle locally         |
