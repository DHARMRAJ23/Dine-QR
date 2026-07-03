# 🍽️ Dine-In QR Menu System

A responsive, production-ready restaurant ordering application built with **React 19 + TypeScript + Tailwind CSS v4**, backed by **Supabase** for secure user authentication, database persistence, and instant real-time order updates.

Customers scan a table-specific QR code to browse the menu, add items to their cart, place orders securely, and track status changes in real-time. Staff log in to a secure Admin Panel to manage the active order board via a Kanban layout, edit the menu catalogue, and print table QR codes.

---

## 🚀 Quick Start

### 1. Configure Environment

Create a `.env.local` file in the project root containing your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key # Required for seeding script only
```

### 2. Setup Database Schema

Execute the SQL schema migration in your Supabase SQL Editor:

- Run [supabase/schema.sql](file:///d:/DINE-QR/supabase/schema.sql) to create tables, enable Row-Level Security (RLS) policies, and define database functions.

### 3. Run Seeding & Start Development

```bash
# Install dependencies
npm install

# Seed default menu items
node --env-file=.env.local supabase/seed-db.js

# Start local development server (with HMR)
npm run dev

# Run all unit and integration tests
npm test

# Format codebase using Prettier
npm run format

# Run linter checks
npm run lint

# Production build (outputs to dist/)
npm run build
```

The application runs at `http://localhost:5173` by default.

---

## 🔐 Authentication & Access Control

Admin roles are secured via **Supabase Auth**:

1. Create a user account in your Supabase Project Dashboard under **Authentication -> Users**.
2. Grant that user admin access by running an SQL query inserting their UUID into the `admin_users` database table:
   ```sql
   INSERT INTO public.admin_users (id) VALUES ('<USER_UUID>');
   ```
3. Navigate to `/#/admin/login` and sign in with the user credentials.

---

## 🏗️ Architecture

### Technology Stack

| Layer        | Technology          | Version | Description                        |
| ------------ | ------------------- | ------- | ---------------------------------- |
| Frontend     | React               | 19      | Component rendering                |
| Language     | TypeScript          | ~6.0    | Type safety and interfaces         |
| Backend & DB | Supabase            | Latest  | Auth, PostgreSQL, and Realtime     |
| Build Tool   | Vite                | 8       | Bundling & HMR                     |
| Styling      | Tailwind CSS        | v4      | CSS utilities                      |
| Routing      | React Router (Hash) | 7       | Routing without server redirection |
| Testing      | Vitest + RTL        | 4 / 16  | Unit/integration testing           |
| Formatting   | Prettier            | 3.x     | Code formatting                    |
| Linting      | OxLint              | 1.x     | Fast static analysis               |

### Why HashRouter?

The app is optimized for **static hosting** (GitHub Pages, Vercel, Netlify, or any CDN) without requiring server-side routing fallback configurations. `HashRouter` uses the URL fragment (`#`) to maintain paths, allowing direct links like `/#/admin/dashboard` to resolve correctly without a custom server.

### State Management

All application state lives in a single **React Context** (`CartContext`) that coordinates fetches and updates to/from **Supabase**.

```
CartProvider (wraps entire app)
├── menuItems   → fetched and managed via Supabase Database
├── orders      → fetched and managed via Supabase Database (Realtime subscription)
└── cart        → persisted in sessionStorage['dine_in_cart']
    guestName   → persisted in sessionStorage['dine_in_guest_name']
    tableId     → persisted in sessionStorage['dine_in_table_id']
```

`sessionStorage` is intentional for cart and guest session data — it resets when the tab closes, so a new customer starting at that table starts fresh.

### Real-Time Sync

Cross-tab live updates are handled natively by **Supabase Realtime**:

1. When a customer places an order via the secure `place_order` RPC, the record is inserted into the `orders` table.
2. The Admin Dashboard is subscribed to the `orders` publication channel in Supabase.
3. Upon order updates, the dashboard receives real-time updates instantly, playing a warm double-note POS notification chime synthesized via the Web Audio API.

---

## 📁 Project Structure

```
supabase/
├── schema.sql              # Database schema migrations & RPC procedures
├── reset-db-data.sql       # Safe order truncation script
└── seed-db.js              # Database menu item & restaurant seeder

src/
├── main.tsx                # App entry point (React 18 createRoot)
├── App.tsx                 # Root component: router + offline banner + notifications
├── index.css               # Global styles + Tailwind imports + print media formatting
│
├── types/
│   └── index.ts            # Shared TypeScript interfaces (FoodItem, Order, etc.)
│
├── config/
│   └── billing.ts          # Tax rate (5% GST) + service charge constants
│
├── data/
│   └── mockData.ts         # Default menu items (INITIAL_FOOD_ITEMS) + CATEGORIES list
│
├── context/
│   ├── CartContext.tsx     # Global state: menu, cart, orders + Supabase mutations
│   └── AuthContext.tsx     # Admin session management via Supabase Auth
│
├── utils/
│   ├── storage.ts          # Safe localStorage/sessionStorage helpers + type guards
│   ├── audio.ts            # Web Audio API POS chime synthesis for new orders
│   └── storage.test.ts     # Unit tests for storage utility
│
└── components/
    ├── common/
    │   └── ErrorBoundary.tsx   # React error boundary recovery screen
    │
    ├── customer/
    │   ├── MainMenu.tsx    # Customer: browse menu + validate table token
    │   ├── CartPage.tsx    # Customer: review cart + checkout
    │   └── LiveTracker.tsx # Customer: real-time order status tracking with PIN entry
    │
    └── admin/
        ├── AdminLogin.tsx      # Admin: login form with cooldown protection
        ├── AdminSidebar.tsx    # Admin: persistent sidebar navigation
        ├── OrderBoard.tsx      # Admin: live Kanban board (placed/preparing/served)
        ├── MenuManager.tsx     # Admin: add/edit/delete/toggle menu catalogue
        └── QRCodeGenerator.tsx # Admin: generate + print QR codes for tables
```

---

## 📦 Browser Storage Key Reference

| Key                            | Storage        | Description                                               |
| ------------------------------ | -------------- | --------------------------------------------------------- |
| `dine_in_cart`                 | sessionStorage | `CartItem[]` — current customer's cart items              |
| `dine_in_table_id`             | sessionStorage | `string` — friendly table number (e.g., "3")              |
| `dine_in_table_token`          | sessionStorage | `string` — secure table token (e.g., "tbl_8F3KQ9ZP")      |
| `dine_in_guest_name`           | sessionStorage | `string` — customer's entered checkout name               |
| `dine_in_special_instructions` | sessionStorage | `string` — customer's kitchen notes                       |
| `order_pin_<orderId>`          | sessionStorage | `string` — secure 6-digit access PIN code for LiveTracker |

---

## 🛡️ Security Implementation

Unlike typical simple mock apps, this system implements rigorous security boundaries to prevent checkout exploits:

- **Server-Side Pricing**: Cart totals are computed server-side in the Supabase PostgreSQL database during execution of the `place_order` RPC. Edits to pricing in client devtools are completely ignored.
- **Table Token Security**: Tables are identified using long, cryptographically secure random QR tokens (e.g., `tbl_8F3KQ9ZP`), rather than sequential integers, to prevent token-guessing attacks.
- **Row-Level Security (RLS)**: Strict RLS policies are enabled on all tables. Admins can view order channels, but guests can only query specific orders using a secure, cryptographically generated 6-digit PIN.
- **Rate Limiting**: Cooldown limits (30 seconds per table) are enforced directly inside the checkout trigger to prevent denial-of-service order spamming.

---

## 🖨️ Printing QR Codes

1. Log in to the Admin Panel and go to `/#/admin/qr-codes`.
2. Enter the range of table numbers (e.g., 1 to 20).
3. Click **"Print All"** to open the system print dialog.
4. The print CSS media queries in `index.css` will automatically format the cards into a clean 2-column A4 grid ready for cutting and placing on restaurant tables.
