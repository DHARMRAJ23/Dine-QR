/**
 * @fileoverview React Error Boundary — catches and displays runtime errors.
 *
 * WHY THIS EXISTS
 * ───────────────
 * React 18 by default shows a white blank screen on any unhandled component
 * error. This boundary intercepts those crashes and shows a user-friendly
 * error card with recovery options instead.
 *
 * HOW IT WORKS
 * ────────────
 * React's class component lifecycle method `componentDidCatch` is called
 * when any descendant component throws an error during rendering.
 * Note: Error boundaries must be class components — hooks cannot implement
 * `componentDidCatch` as of React 18.
 *
 * RECOVERY OPTIONS FOR THE USER
 * ──────────────────────────────
 * 1. "Try Again"   — Clears the boundary error state and re-renders children.
 * 2. "Clear Data"  — Wipes ALL localStorage/sessionStorage keys and reloads
 *                    the page. Useful when corrupted storage caused the crash.
 *
 * USAGE
 * ─────
 * Wrap any subtree you want to protect:
 * @example
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 *
 * In main.tsx the boundary wraps the entire <App />, so ANY uncaught
 * render error in the application is safely caught here.
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      "Uncaught error in application render tree:",
      error,
      errorInfo,
    );
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetData = () => {
    if (
      window.confirm(
        "This will clear all browser storage (orders, menu, cart) to resolve potential data corruption. Do you want to continue?",
      )
    ) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/";
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100 font-sans">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-center space-y-6">
            {/* Decorative glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="w-16 h-16 bg-red-950/40 border border-red-900/30 rounded-2xl flex items-center justify-center mx-auto text-red-500 shadow-lg">
              <AlertTriangle size={32} />
            </div>

            <div className="space-y-2">
              <h1 className="font-display font-bold text-2xl text-white tracking-wide">
                Something went wrong
              </h1>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                The application encountered an unexpected rendering error. This
                could be due to invalid or corrupted storage records.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl text-left overflow-x-auto max-h-36 scrollbar-none">
                <pre className="text-[10px] font-mono text-red-400 leading-tight">
                  {this.state.error.name}: {this.state.error.message}
                  {this.state.error.stack && `\n${this.state.error.stack}`}
                </pre>
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-lg transition-all active:scale-[0.98] border border-orange-500/20"
              >
                <RefreshCw size={14} />
                <span>Reload Page</span>
              </button>
              <button
                onClick={this.handleResetData}
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-850 hover:bg-red-950/40 border border-slate-800 hover:border-red-900/50 text-slate-300 hover:text-red-400 text-xs font-semibold py-3 px-4 rounded-xl transition-all active:scale-[0.98]"
              >
                <Trash2 size={14} />
                <span>Reset Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
