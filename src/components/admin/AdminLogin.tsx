/**
 * @fileoverview Admin login page component.
 *
 * Renders a styled login form and delegates credential validation to
 * `AuthContext.login()`. On success, the user is redirected to
 * `/admin/dashboard`. If a valid session already exists, the page
 * immediately redirects without showing the form.
 *
 * CREDENTIALS
 * ────────────────────────
 * Use the Supabase Auth credentials you created.
 */
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User, Sparkles, AlertCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

/**
 * Admin login screen.
 * - Shows a glass-morphism card with username/password fields.
 * - Displays a yellow security notice reminding staff this is demo-only.
 * - Auto-redirects to dashboard if already authenticated.
 */
export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownTime, setCooldownTime] = useState(0);

  const { isAuthenticated, login } = useAuth();

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/admin/dashboard");
    }
  }, [isAuthenticated, navigate]);

  // Handle countdown for brute-force cooldown
  useEffect(() => {
    if (cooldownTime <= 0) return;
    const timer = setInterval(() => {
      setCooldownTime((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (cooldownTime > 0) {
      setError(`Too many failed attempts. Please wait ${cooldownTime} seconds.`);
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      await login(email, password);
      setFailedAttempts(0); // Reset attempts on success
      navigate("/admin/dashboard");
    } catch (err: any) {
      const nextFailedAttempts = failedAttempts + 1;
      setFailedAttempts(nextFailedAttempts);

      if (nextFailedAttempts >= 3) {
        const cooldown = 5 * (nextFailedAttempts - 2);
        setCooldownTime(cooldown);
        setError(`Authentication failed. Too many failed attempts. Cooldown of ${cooldown} seconds active.`);
      } else {
        setError(err.message || "Authentication failed. Please try again.");
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-orange-600/5 rounded-full blur-3xl pointer-events-none"></div>

        {/* Brand Header */}
        <div className="text-center mb-8 relative">
          <div className="w-12 h-12 bg-orange-600/10 border border-orange-500/30 rounded-2xl flex items-center justify-center mx-auto text-orange-500 mb-4 shadow-lg">
            <Sparkles size={22} className="fill-orange-500/20" />
          </div>
          <h2 className="font-display font-bold text-2xl text-white tracking-wide">
            Zest & Fire
          </h2>
          <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-widest">
            Kitchen Console Login
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-5 bg-red-950/40 border border-red-800/40 rounded-xl p-3 flex gap-2.5 items-start text-xs text-red-400 animate-shake">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                disabled={loading || cooldownTime > 0}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 pl-10 text-xs focus:outline-none focus:border-orange-500 text-white transition-colors disabled:opacity-50"
                autoComplete="email"
              />
              <User
                size={14}
                className="absolute left-3.5 top-3.5 text-slate-500"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading || cooldownTime > 0}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 pl-10 text-xs focus:outline-none focus:border-orange-500 text-white transition-colors disabled:opacity-50"
              />
              <Lock
                size={14}
                className="absolute left-3.5 top-3.5 text-slate-500"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || cooldownTime > 0}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3.5 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all duration-300 transform active:scale-[0.98] shadow-lg shadow-orange-600/10 hover:shadow-orange-700/20 disabled:opacity-50 mt-2 border border-orange-500/20 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>Authenticating...</span>
              </span>
            ) : cooldownTime > 0 ? (
              <span>Locked ({cooldownTime}s)</span>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
export default AdminLogin;
