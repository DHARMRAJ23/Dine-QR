/**
 * @fileoverview Admin QR Code Generator — prints table placards for the restaurant.
 *
 * WHAT IT GENERATES
 * ─────────────────
 * A unique QR code for each table in the restaurant. Each QR code encodes a
 * SECURE TOKEN URL like: `<origin>/#/menu/tbl_8F3KQ9ZP`
 *
 * The token is an opaque random string stored in the `restaurant_tables` table.
 * It maps server-side to the real table number — customers cannot guess other
 * tables by modifying the URL.
 *
 * FLOW
 * ────
 * 1. Admin opens QR Generator page → we fetch existing tables from Supabase.
 * 2. Admin sets the desired table count and clicks "Generate".
 * 3. We call the server-side RPC `generate_tables` to insert missing tables with cryptographically secure tokens.
 * 4. QR cards are rendered using the secure token URL.
 * 5. Admin prints; table tokens are permanent until manually rotated via the "Rotate Code" button.
 *
 * FEATURES
 * ────────
 * - Individual preview with a "Print This" button per table
 * - "Print All" button that renders a 2-column A4 grid optimised for printing
 * - Displays the friendly table number prominently; the token is hidden
 * - "Rotate Code" action to refresh the secure table token and invalidate old QR placards
 *
 * DEPENDENCIES
 * ────────────
 * - `qrcode.react` (QRCodeSVG component) — renders QR codes as inline SVG
 * - `supabase` — for fetching/upserting restaurant_tables
 *
 * PRINT STYLING
 * ─────────────
 * Handled in `index.css` under the `@media print` block.
 * The `.print-area` class forces a 2-column grid layout on paper.
 */
import React, { useState, useEffect } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Grid, RefreshCw, Smartphone, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface TableRecord {
  id: string;
  table_number: number;
  qr_token: string;
  restaurant_id: string;
}

export const QRCodeGenerator: React.FC = () => {
  const [tableCount, setTableCount] = useState<number>(8);
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>("");

  // ── Fetch existing tables on mount ─────────────────────────────────────────
  const fetchTables = async () => {
    setIsLoading(true);
    const { data, error: fetchErr } = await supabase
      .from("restaurant_tables")
      .select("id, table_number, qr_token, restaurant_id")
      .order("table_number", { ascending: true });

    if (fetchErr) {
      setError("Could not fetch tables: " + fetchErr.message);
    } else if (data) {
      setTables(data as TableRecord[]);
      if (data.length > 0) setTableCount(data.length);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTables();
  }, []);

  // ── Rotate table token ─────────────────────────────────────────────────────
  const handleRotateToken = async (tableId: string) => {
    setError("");
    try {
      const { error: rpcErr } = await supabase.rpc("rotate_table_token", {
        p_table_id: tableId,
      });

      if (rpcErr) {
        setError("Could not rotate token: " + rpcErr.message);
      } else {
        await fetchTables();
      }
    } catch (err: any) {
      setError("Could not rotate token: " + err.message);
    }
  };

  // ── Generate / upsert tables ───────────────────────────────────────────────
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isNaN(tableCount) || tableCount < 1 || tableCount > 100) {
      setError("Table count must be between 1 and 100.");
      return;
    }

    setIsGenerating(true);
    try {
      const { error: rpcErr } = await supabase.rpc("generate_tables", {
        p_count: tableCount,
      });

      if (rpcErr) {
        setError("Could not create tables: " + rpcErr.message);
        return;
      }

      // Refresh
      await fetchTables();
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (typeof window.print === "function") {
      window.print();
    } else {
      alert("Printing is not supported or blocked in this browser.");
    }
  };

  /** Build the secure QR URL using the opaque token */
  const getMenuUrl = (token: string) => {
    const origin = window.location.origin;
    return `${origin}/#/menu/${token}`;
  };

  // Only show up to the requested count
  const visibleTables = tables.filter((t) => t.table_number <= tableCount);

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans text-slate-100">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header Bar */}
        <header className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center flex-shrink-0 no-print">
          <div>
            <h1 className="font-display font-bold text-xl text-white">
              QR Code Generator
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-light">
              Secure token-based QR codes — each table has a unique private link
            </p>
          </div>

          {visibleTables.length > 0 && (
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-orange-600/10 hover:shadow-orange-700/20 active:scale-95 transition-all uppercase tracking-wide border border-orange-500/20 animate-fade-in"
            >
              <Printer size={14} />
              <span>Print Cards</span>
            </button>
          )}
        </header>

        {/* Setup and Output */}
        <div className="flex-1 p-6 overflow-y-auto min-h-0 bg-slate-950 flex flex-col gap-6">
          {/* Input Setup Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-3xl w-full no-print">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Grid size={14} className="text-slate-500" />
              <span>Configure Table Count</span>
            </h2>

            {error && (
              <div className="mb-4 text-xs font-semibold text-red-400 bg-red-950/20 border border-red-900/30 p-3 rounded-xl flex items-center gap-1.5">
                <span>{error}</span>
              </div>
            )}

            <form
              onSubmit={handleGenerate}
              noValidate
              className="flex items-end gap-4"
            >
              <div className="flex-1 space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Total Tables (1 - 100)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={tableCount}
                  onChange={(e) => setTableCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs focus:outline-none focus:border-orange-500 text-white font-semibold"
                />
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="flex items-center justify-center gap-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-bold py-3 px-5 rounded-xl transition-all text-slate-200 active:scale-95 whitespace-nowrap disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                <span>
                  {isGenerating ? "Generating..." : "Generate QR Grid"}
                </span>
              </button>
            </form>
          </div>

          {/* Printable QR Code Grid Output */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2 no-print flex items-center justify-between">
              <span>Print Preview Grid ({visibleTables.length} Cards)</span>
              <span className="text-[9px] text-slate-600 lowercase italic normal-case">
                Each QR code encodes a unique private token — table numbers
                cannot be guessed
              </span>
            </h2>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-orange-500" size={32} />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 printable-qr-grid">
                {visibleTables.map((table) => {
                  const targetUrl = getMenuUrl(table.qr_token);

                  return (
                    <div
                      key={table.id}
                      className="bg-white text-slate-900 border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden qr-card-print min-h-[300px]"
                    >
                      {/* Header Details */}
                      <div className="mb-4">
                        <span className="text-[9px] font-extrabold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-orange-200/50">
                          Zest &amp; Fire
                        </span>
                        <h3 className="font-display font-black text-2xl text-slate-900 mt-2.5 tracking-tight">
                          Table {table.table_number}
                        </h3>
                      </div>

                      {/* Rotate Token Button (Admin only, hidden during printing) */}
                      <button
                        onClick={() => handleRotateToken(table.id)}
                        title="Rotate Table QR Token"
                        className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors no-print cursor-pointer"
                      >
                        <RefreshCw size={14} />
                      </button>

                      {/* QR Code Container */}
                      <div className="p-3 bg-white border-2 border-slate-100 rounded-xl shadow-inner mb-4">
                        <QRCodeSVG
                          value={targetUrl}
                          size={120}
                          level="M"
                          includeMargin={false}
                        />
                      </div>

                      {/* Footer instructions */}
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-slate-800 flex items-center justify-center gap-1">
                          <Smartphone size={12} className="text-orange-600" />
                          <span>Scan &amp; Order Food</span>
                        </p>
                        <p className="text-[9px] text-slate-400 font-light max-w-xs leading-relaxed">
                          Scan the QR code to browse the digital menu and place
                          your order directly.
                        </p>
                      </div>

                      {/* Background decoration */}
                      <div className="absolute top-0 right-0 w-8 h-8 bg-orange-600/5 rounded-full blur-xl pointer-events-none no-print"></div>
                      <div className="absolute bottom-0 left-0 w-8 h-8 bg-orange-600/5 rounded-full blur-xl pointer-events-none no-print"></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
export default QRCodeGenerator;
