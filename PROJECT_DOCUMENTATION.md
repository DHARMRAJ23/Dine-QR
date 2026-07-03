# Project Report: Dine-QR Web Application

## 1. Executive Summary
**Dine-QR** is a fully responsive, modern web application designed to digitize the dine-in experience for restaurants. It replaces traditional paper menus with a contactless QR code ordering system. Customers can scan a table-specific QR code, browse a digital menu, place orders directly from their smartphones or laptops, and track their food in real-time. Additionally, the platform provides a comprehensive Admin Suite for restaurant staff to manage the menu, track live orders on a Kanban board, and generate QR codes for tables.

## 2. Project Objectives
- **Contactless Dining:** Provide a safe, hygienic, and modern ordering process.
- **Responsive Web Design:** Ensure the application scales seamlessly across all devices, from small mobile phones to large desktop monitors, providing a true full-width web app experience.
- **Operational Efficiency:** Streamline kitchen operations with a real-time digital order management system.
- **Serverless Demonstration:** Showcase complex real-time state management entirely on the client-side using advanced browser APIs.

## 3. Technology Stack
- **Frontend Framework:** React 18
- **Language:** TypeScript
- **Styling:** Tailwind CSS (utilizing fluid layouts and responsive prefixes `md:`, `lg:`, `xl:`)
- **Routing:** `react-router-dom` (using `HashRouter` for easy static deployment on Vercel/Netlify/GitHub Pages)
- **Icons:** `lucide-react`
- **Build Tool:** Vite

## 4. Comprehensive Web-Side Features

### 4.1 Customer Features
- **Responsive Grid Menu (`MainMenu.tsx`)**: The menu adapts to screen size, displaying a single column on mobile and expanding up to a 4-column grid on large monitors. It includes sticky category filters (Hot Drinks, Quick Bites, Mains, Desserts) for quick navigation.
- **Interactive Cart & Checkout (`CartPage.tsx`)**: 
  - **Desktop Split-View**: On larger screens, the cart items list and checkout form are displayed side-by-side.
  - **Custom Instructions**: Customers can add special kitchen notes to their order.
  - **Validation**: Ensures tables and names are provided before placing an order.
- **Real-Time Order Tracking (`LiveTracker.tsx`)**: 
  - A visual progress bar tracks the order status through 4 stages: *Placed → Accepted → Preparing → Served*.
  - Displays a detailed digital receipt with subtotal, tax, service charges, and grand total.

### 4.2 Admin Suite Features
- **Kitchen Display System / Kanban Board (`OrderBoard.tsx`)**:
  - Live, auto-updating columns showing active orders grouped by their current status.
  - One-click progression buttons to move orders from "Placed" all the way to "Served".
- **Menu Management (`MenuManager.tsx`)**:
  - **CRUD Operations**: Admins can add new dishes, edit existing ones, and permanently delete items.
  - **Stock Toggles**: Instantly mark an item as "Out of Stock" to prevent further orders.
  - **Image Upload**: Supports uploading custom images for menu items.
- **QR Code Generator (`QRCodeGenerator.tsx`)**:
  - Generate a configurable number of unique table QR codes.
  - Built-in print-preview layout optimized for A4 paper. Printing automatically formats the codes into a clean grid for physical table placards.

## 5. System Architecture & State Management

### 5.1 Global State (`CartContext.tsx`)
The application uses React Context to provide a single source of truth across all routes.
- **Persistent Storage (`localStorage`)**: The Menu catalogue and Order History are saved to `localStorage`. This allows data to persist even if the browser is closed, acting as a mock database.
- **Session Storage (`sessionStorage`)**: The active cart, guest name, and table number are saved to `sessionStorage`. This ensures that when a tab is closed, the session resets for the next customer sitting at that table.

### 5.2 Real-Time Event Bus (`eventBus.ts`)
To simulate a backend WebSocket connection (like Socket.io), the application uses a `SimulatedSocketBus`.
- When an action occurs (e.g., customer places an order), an event is dispatched locally and also written to a shared `localStorage` key.
- Other open tabs (e.g., the Admin Dashboard) listen for the `storage` event and instantly reflect the new data without requiring a manual page refresh.

## 6. Directory Structure & Routing

### Routes
| Path | Component | Description |
|------|-----------|-------------|
| `/` | `LandingPage` | Entry point offering Customer or Admin navigation |
| `/menu/:tableId?` | `MainMenu` | Customer menu view. Automatically detects table number from URL |
| `/cart` | `CartPage` | Customer checkout interface |
| `/tracker` | `LiveTracker` | Customer live order status view |
| `/admin` | `AdminLogin` | Password-protected admin gate |
| `/admin/orders` | `OrderBoard` | Kitchen Kanban board |
| `/admin/menu` | `MenuManager` | Dashboard to edit menu catalog |
| `/admin/qr` | `QRCodeGenerator` | QR code generation and printing utility |

## 7. Development & Installation

### Prerequisites
- Node.js installed on your machine.

### Setup Instructions
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Start the local development server:**
   ```bash
   npm run dev
   ```
3. **Access the Application:** Open the URL provided by Vite (usually `http://localhost:5173`) in your browser.

> [!WARNING]
> **Storage Quota Note:** Because the app uses browser `localStorage` as its database, uploading too many high-resolution images via the Menu Manager may exceed the 5MB browser quota. If this occurs, you can use the **Reset Complete Demo** button in the Admin Settings to clear the storage.

## 8. Conclusion
The Dine-QR project successfully demonstrates how modern web technologies like React, TypeScript, and Tailwind CSS can be combined to create a premium, fully responsive, and highly interactive application. By utilizing client-side storage mechanisms and cross-tab communication, it achieves complex real-time functionalities typically reserved for heavy full-stack architectures.
