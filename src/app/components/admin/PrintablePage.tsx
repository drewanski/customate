import React from 'react';

/**
 * Drop-in print stylesheet + Export PDF button.
 *
 * Why this exists:
 *   Compliance feedback asked for "Export PDF to every tables" — but native
 *   browser print() gives messy output (gradients, sidebars, dark theme).
 *   This component injects a single @media print block that strips chrome
 *   to a clean A4 layout. Pair it with the .no-print className on any
 *   element you want hidden in the printed copy (nav buttons, filter chips,
 *   action menus, gradient hero artwork).
 *
 * Usage:
 *   <PrintablePage title="Inventory Report">
 *     <button onClick={() => window.print()} className="no-print">PDF</button>
 *     <table>...</table>
 *   </PrintablePage>
 *
 * Each rendered page also adds a document-title hint so the printed file
 * name defaults to something sensible.
 */
export function PrintablePage({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);

  return (
    <div className="printable-page">
      {(title || subtitle) && (
        <div className="hidden print:block print-header mb-4">
          {title && <h1 className="text-2xl font-black text-slate-900">{title}</h1>}
          {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
          <p className="text-xs text-slate-500 mt-1">
            Generated {new Date().toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
            {' · CustoMate'}
          </p>
        </div>
      )}
      {children}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; color: #0f172a !important; }
          /* Strip everything outside the printable region */
          body > div > *:not(.printable-page) { display: none !important; }
          .no-print, [data-no-print] { display: none !important; }
          /* Force light backgrounds + flatten gradients */
          .bg-gradient-to-br, .bg-gradient-to-r, .bg-gradient-to-b,
          .bg-gradient-to-l, .bg-gradient-to-t, .bg-gradient-to-bl,
          .bg-gradient-to-tr, .bg-gradient-to-tl, .bg-gradient-to-br {
            background: white !important;
            color: #0f172a !important;
          }
          /* Buttons / interactive chrome become inert text */
          button, a { color: #0f172a !important; }
          /* Tables get visible borders so the printed grid reads */
          table { border-collapse: collapse !important; width: 100% !important; }
          table, th, td { border: 1px solid #cbd5e1 !important; }
          th, td { padding: 6px 8px !important; font-size: 11pt !important; }
          th { background: #f1f5f9 !important; font-weight: 800 !important; }
          /* Avoid orphaned cards across page breaks */
          .print-keep-together { page-break-inside: avoid; }
          /* Page break helpers for long lists */
          .print-page-break { page-break-after: always; }
        }
      `}</style>
    </div>
  );
}

/**
 * Standardised Export PDF button. Drops into any admin header next to
 * Export CSV. Calls window.print() — the global print stylesheet from
 * PrintablePage handles the rest.
 */
export function ExportPdfButton({ filename }: { filename?: string }) {
  const handle = () => {
    // Print stylesheet is enough; filename is set via document.title.
    window.print();
  };
  return (
    <button
      onClick={handle}
      data-no-print
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
      title={filename ? `Export ${filename} as PDF` : 'Export as PDF'}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
      Export PDF
    </button>
  );
}
