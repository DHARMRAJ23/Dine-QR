/**
 * @fileoverview Admin QR Code Generator — prints table placards for the restaurant.
 *
 * WHAT IT GENERATES
 * ─────────────────
 * A unique QR code for each table in the restaurant. Each QR code encodes the URL:
 *   `<origin>/#/menu/<tableNumber>`
 *
 * When a customer scans the QR code with their phone camera, it opens the app
 * directly on the menu page with the correct table pre-selected.
 *
 * FEATURES
 * ────────
 * - Custom range: generate codes for any range of table numbers (e.g. tables 1–20)
 * - Individual preview with a "Print This" button per table
 * - "Print All" button that renders a 2-column A4 grid optimised for printing
 * - The printed output shows the table number prominently below the QR code
 *
 * DEPENDENCIES
 * ────────────
 * - `qrcode.react` (QRCodeSVG component) — renders QR codes as inline SVG
 *
 * PRINT STYLING
 * ─────────────
 * Handled in `index.css` under the `@media print` block.
 * The `.print-area` class forces a 2-column grid layout on paper.
 */
import React, { useState } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Grid, RefreshCw, Smartphone } from 'lucide-react';

export const QRCodeGenerator: React.FC = () => {
  const [tableCount, setTableCount] = useState<number>(8); // Default 8 tables
  const [generatedTables, setGeneratedTables] = useState<number[]>(() => {
    return Array.from({ length: 8 }, (_, i) => i + 1);
  });
  const [error, setError] = useState<string>('');

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (isNaN(tableCount) || tableCount < 1 || tableCount > 100) {
      setError('Table count must be a number between 1 and 100.');
      return;
    }
    
    const tables = Array.from({ length: tableCount }, (_, i) => i + 1);
    setGeneratedTables(tables);
  };

  const handlePrint = () => {
    if (typeof window.print === 'function') {
      window.print();
    } else {
      alert('Printing is not supported or blocked in this browser.');
    }
  };

  // Get active application URL to encode in the QR
  const getMenuUrl = (tableNum: number) => {
    const origin = window.location.origin;
    // We use HashRouter format as standard to ensure it works on static deployments (Vercel/Netlify/Localhost)
    return `${origin}/#/menu/${tableNum}`;
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden font-sans text-slate-100">
      
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Header Bar */}
        <header className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center flex-shrink-0 no-print">
          <div>
            <h1 className="font-display font-bold text-xl text-white">QR Code Generator</h1>
            <p className="text-xs text-slate-500 mt-0.5 font-light">Generate and print high-quality table QR codes for customer self-ordering</p>
          </div>

          {generatedTables.length > 0 && (
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 max-w-md w-full no-print">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
              <Grid size={14} className="text-slate-500" />
              <span>Configure Table Count</span>
            </h2>

            {error && (
              <div className="mb-4 text-xs font-semibold text-red-400 bg-red-950/20 border border-red-900/30 p-3 rounded-xl flex items-center gap-1.5">
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleGenerate} noValidate className="flex items-end gap-4">
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
                className="flex items-center justify-center gap-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-bold py-3 px-5 rounded-xl transition-all text-slate-200 active:scale-95 whitespace-nowrap"
              >
                <RefreshCw size={14} />
                <span>Generate QR Grid</span>
              </button>
            </form>
          </div>

          {/* Printable QR Code Grid Output */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-900 pb-2 no-print flex items-center justify-between">
              <span>Print Preview Grid ({generatedTables.length} Cards)</span>
              <span className="text-[9px] text-slate-600 lowercase italic normal-case">Cards auto-format for paper when printed</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 printable-qr-grid">
              {generatedTables.map((tableNum) => {
                const targetUrl = getMenuUrl(tableNum);

                return (
                  <div 
                    key={tableNum}
                    className="bg-white text-slate-900 border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center text-center shadow-md relative overflow-hidden qr-card-print min-h-[300px]"
                  >
                    {/* Header Details */}
                    <div className="mb-4">
                      <span className="text-[9px] font-extrabold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full uppercase tracking-widest border border-orange-200/50">
                        Zest & Fire
                      </span>
                      <h3 className="font-display font-black text-2xl text-slate-900 mt-2.5 tracking-tight">
                        Table {tableNum}
                      </h3>
                    </div>

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
                        <span>Scan & Order Food</span>
                      </p>
                      <p className="text-[9px] text-slate-400 font-light max-w-[160px] leading-relaxed">
                        Scan the QR code to browse the digital menu and place your order directly.
                      </p>
                    </div>

                    {/* Background decoration lines (non-printable) */}
                    <div className="absolute top-0 right-0 w-8 h-8 bg-orange-600/5 rounded-full blur-xl pointer-events-none no-print"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 bg-orange-600/5 rounded-full blur-xl pointer-events-none no-print"></div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </main>
    </div>
  );
};
export default QRCodeGenerator;
