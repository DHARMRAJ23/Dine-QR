/**
 * @fileoverview Authentication context for the admin kitchen console.
 *
 * OVERVIEW
 * ────────
 * This module provides demo-grade session management for the admin panel.
 * It is intentionally NOT a production security implementation — the
 * credentials are hardcoded and the "JWT" is a static mock string.
 *
 * ⚠️  SECURITY DISCLAIMER
 * This is a demo/prototype authentication flow. For a real production app:
 *  - Use a server-side authentication provider (Firebase Auth, Auth0, etc.)
 *  - Never store credentials in client-side code.
 *  - Use real, server-generated JWTs with proper signature verification.
 *  - Store tokens in HttpOnly cookies, not localStorage.
 *
 * HOW IT WORKS
 * ────────────
 * 1. `login()` validates credentials against hardcoded demo values.
 * 2. On success, it writes a `{ token, expiresAt }` session object to
 *    `localStorage['demo_admin_session']` (expires in 2 hours).
 * 3. A `setInterval` inside the provider checks every 10 seconds whether
 *    the session has expired and auto-signs out if so.
 * 4. `ProtectedRoute` in App.tsx reads `isAuthenticated` from this context
 *    to guard all `/admin/*` routes.
 * 5. `logout()` removes the session from state and localStorage.
 *
 * DEMO CREDENTIALS
 * ────────────────
 * Username: admin
 * Password: admin123
 *
 * STORAGE KEY
 * ───────────
 * `demo_admin_session` in localStorage (written by writeStorage helper)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { readStorage, writeStorage } from '../utils/storage';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of the session object persisted to localStorage.
 *
 * @property token     - Mock auth token (not a real JWT; just a string identifier)
 * @property expiresAt - Unix timestamp (ms) after which the session is invalid
 */
export interface AdminSession {
  token: string;
  expiresAt: number;
}

/**
 * Public API exposed via the `useAuth()` hook.
 */
interface AuthContextType {
  /** `true` if a valid, non-expired session exists. */
  isAuthenticated: boolean;

  /**
   * Attempts to authenticate with the given credentials.
   * @returns `true` on success, `false` on invalid credentials.
   */
  login: (username: string, password: string) => Promise<boolean>;

  /** Clears the session from memory and localStorage. */
  logout: () => void;

  /** The raw session object, or `null` if not authenticated. */
  session: AdminSession | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Session duration in milliseconds — 2 hours.
 * After this time the session is invalidated automatically.
 */
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

/** localStorage key where the session object is stored. */
const SESSION_KEY = 'demo_admin_session';

// ─────────────────────────────────────────────────────────────────────────────
// Provider Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provides authentication state and actions to all child components.
 *
 * Place this above `AppContent` in the component tree (inside `CartProvider`).
 * The `ProtectedRoute` component in App.tsx consumes this context.
 *
 * @example
 * <CartProvider>
 *   <AuthProvider>
 *     <AppContent />
 *   </AuthProvider>
 * </CartProvider>
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * Load any existing session from localStorage on initial mount.
   * Uses `readStorage` to handle corrupted/missing data gracefully.
   */
  const [session, setSession] = useState<AdminSession | null>(() => {
    return readStorage<AdminSession | null>(
      localStorage,
      SESSION_KEY,
      null,
      // Inline type guard: validate the stored object shape
      (v): v is AdminSession => {
        if (typeof v !== 'object' || v === null) return false;
        const o = v as Record<string, unknown>;
        return typeof o.token === 'string' && typeof o.expiresAt === 'number';
      }
    );
  });

  /**
   * Derived boolean: session exists AND has not expired.
   * Used directly in ProtectedRoute.
   */
  const isAuthenticated = !!session && session.expiresAt > Date.now();

  /**
   * Validates demo credentials and creates a new 2-hour session.
   *
   * @param username - Must be "admin" (case-sensitive, trimmed)
   * @param password - Must be "admin123" (case-sensitive)
   * @returns `true` if credentials matched, `false` otherwise
   */
  const login = async (username: string, password: string): Promise<boolean> => {
    // Simulate a realistic network/server delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (username.trim() === 'admin' && password === 'admin123') {
      const newSession: AdminSession = {
        token: 'mock-jwt-auth-session-key-99160',
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      setSession(newSession);
      writeStorage(localStorage, SESSION_KEY, newSession);
      return true;
    }

    return false;
  };

  /**
   * Clears the active session from memory and localStorage.
   * Called by the sidebar Logout button and the expiry checker below.
   */
  const logout = () => {
    setSession(null);
    localStorage.removeItem(SESSION_KEY);
  };

  /**
   * Runs every 10 seconds to check whether the session has expired.
   * Automatically signs the user out and redirects them to /admin/login.
   * The `session` dependency ensures the interval restarts whenever a new
   * session is created or cleared.
   */
  useEffect(() => {
    const checkExpiration = () => {
      if (session && Date.now() >= session.expiresAt) {
        console.info('[auth] Session expired — signing out automatically.');
        logout();
      }
    };

    // Run immediately in case the app was opened with a pre-expired session
    checkExpiration();

    const interval = setInterval(checkExpiration, 10_000); // 10 seconds
    return () => clearInterval(interval);
  }, [session]); // Re-run if session state changes

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, session }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provides access to the authentication state and actions.
 *
 * Must be used inside an `<AuthProvider>` subtree. Throws if called outside.
 *
 * @example
 * const { isAuthenticated, login, logout } = useAuth();
 *
 * @throws {Error} If used outside of an `AuthProvider`
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('[useAuth] Hook must be used inside an <AuthProvider>.');
  }
  return context;
};
