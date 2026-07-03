/**
 * @fileoverview Root application component — routing, providers, and global UI.
 *
 * COMPONENT TREE
 * ──────────────
 *  <App>
 *   └─ <CartProvider>       ─ Global state (menu, cart, orders)
 *      └─ <AuthProvider>     ─ Admin session management
 *         └─ <AppContent>    ─ Router + offline banner + toast
 *            └─ <HashRouter>
 *               ├─ /menu/:tableToken  ─ Customer: browse menu (MainMenu)
 *               ├─ /cart           ─ Customer: review & checkout (CartPage)
 *               ├─ /status/:orderId─ Customer: live order tracker (LiveTracker)
 *               ├─ /admin/login    ─ Admin: authentication (AdminLogin)
 *               ├─ /admin/dashboard─ Admin: order board (OrderBoard) [protected]
 *               ├─ /admin/menu     ─ Admin: menu editor (MenuManager) [protected]
 *               └─ /admin/qr-codes ─ Admin: QR code gen (QRCodeGenerator) [protected]
 *
 * WHY HASH ROUTER
 * ───────────────
 * The app is designed for static hosting (no server-side routing).
 * HashRouter uses the URL fragment (#) so all routes work without a server
 * configured to return index.html for every path.
 *
 * GLOBAL FEATURES IN THIS FILE
 * ─────────────────────────────
 * - Offline detection banner (red ribbon at top when navigator.onLine = false)
 * - Toast notification overlay (green/red/white slide-up alerts)
 * - Admin route guard (ProtectedRoute checks AuthContext.isAuthenticated)
 */
import React, { useState, useEffect } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { CartProvider, useCart } from "./context/CartContext";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Lazy loaded components for code splitting
const MainMenu = React.lazy(() => import("./components/customer/MainMenu"));
const CartPage = React.lazy(() => import("./components/customer/CartPage"));
const LiveTracker = React.lazy(
  () => import("./components/customer/LiveTracker"),
);
const AdminLogin = React.lazy(() => import("./components/admin/AdminLogin"));
const OrderBoard = React.lazy(() => import("./components/admin/OrderBoard"));
const MenuManager = React.lazy(() => import("./components/admin/MenuManager"));
const QRCodeGenerator = React.lazy(
  () => import("./components/admin/QRCodeGenerator"),
);

const LoadingScreen = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center">
    <div className="animate-spin h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full"></div>
  </div>
);

/**
 * Route guard that wraps admin-only pages.
 * Reads `isAuthenticated` from AuthContext; if the session is missing or
 * expired, redirects the user to the admin login page.
 *
 * @example
 * <Route path="/admin/dashboard" element={
 *   <ProtectedRoute><OrderBoard /></ProtectedRoute>
 * } />
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="animate-spin h-8 w-8 border-4 border-orange-500 border-t-transparent rounded-full mb-4"></div>
        <p className="text-slate-400 font-sans text-sm tracking-wide">
          Loading secure session...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Session expired or never created — redirect to login
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
};

/**
 * Inner application content rendered after all providers are mounted.
 * Separated into its own component because it must call `useCart()` and
 * `useAuth()`, which require being inside their respective providers.
 */
const AppContent: React.FC = () => {
  const { toast } = useCart();
  /** true when the browser reports an active network connection. */
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <Router>
      {!isOnline && (
        <div
          className={`sticky top-0 z-50 bg-red-600 text-white text-[11px] text-center p-2.5 flex flex-col items-center justify-center gap-1 shadow-md border-b border-red-700 font-sans w-full`}
        >
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
            <span>Connection lost</span>
          </div>
          <p className="text-[9px] text-red-100/90 leading-tight">
            Orders placed offline will be saved locally on this device only. Do
            not clear browser history or use private browsing mode, as this will
            result in order data loss.
          </p>
        </div>
      )}
      <div className="flex flex-col min-h-screen">
        <React.Suspense fallback={<LoadingScreen />}>
          <Routes>
            {/* Customer Ordering Routes */}
            <Route path="/menu/:tableToken" element={<MainMenu />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/status/:orderId" element={<LiveTracker />} />

            {/* Admin Dashboard Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />

            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute>
                  <OrderBoard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/menu"
              element={
                <ProtectedRoute>
                  <MenuManager />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/qr-codes"
              element={
                <ProtectedRoute>
                  <QRCodeGenerator />
                </ProtectedRoute>
              }
            />

            {/* Fallback — no default table; prompt customer to scan QR code */}
            <Route path="/" element={<Navigate to="/menu/invalid" replace />} />
            <Route path="*" element={<Navigate to="/menu/invalid" replace />} />
          </Routes>
        </React.Suspense>
      </div>

      {/* Global Sliding Toast Alert Overlay */}
      {toast && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 text-xs font-bold px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 border animate-slide-up max-w-[90vw] whitespace-nowrap ${
            toast.type === "error"
              ? "bg-red-950/90 border-red-800 text-red-400"
              : toast.type === "success"
                ? "bg-green-950/90 border-green-800 text-green-400"
                : "bg-slate-900 border-slate-800 text-white"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              toast.type === "error"
                ? "bg-red-500 animate-ping"
                : toast.type === "success"
                  ? "bg-green-500 animate-ping"
                  : "bg-orange-500 animate-ping"
            }`}
          ></span>
          <span>{toast.message}</span>
        </div>
      )}
    </Router>
  );
};

/**
 * Root component of the application.
 * Mounts all context providers and renders AppContent as their child.
 *
 * Provider order matters:
 *  1. CartProvider  — must be outermost so AuthProvider can access it if needed
 *  2. AuthProvider  — wraps AppContent so ProtectedRoute has access to useAuth()
 */
function App() {
  return (
    <CartProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </CartProvider>
  );
}

export default App;
