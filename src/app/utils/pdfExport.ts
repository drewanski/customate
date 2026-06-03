/**
 * pdfExport.ts — branded PDF generator used by every admin tab that
 * surfaces an "Export PDF" button (Reports, Inventory, Orders, Users,
 * Coupons, Design+Print, Audit Log).
 *
 * Why a real PDF (not window.print()):
 *   The print-CSS approach gave panels a messy, browser-chrome-flavoured
 *   handout. This module uses jsPDF + jspdf-autotable to render a clean,
 *   paginated A4 document with:
 *     · Bryle Closet brand header (logo + business name + address)
 *     · Report title, subtitle, and "Generated on …" timestamp
 *     · Auto-paginated tables with zebra rows + summary KPI strip
 *     · Footer with page numbers + "Powered by CustoMate"
 *
 * Drop your client's logo at  public/bryle-closet-logo.png  (transparent
 * PNG, square, ~256×256 recommended). The export works without it too —
 * the brand badge falls back to a monogram circle.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const BUSINESS = {
  legalName: 'Bryle Closet',
  tagline: 'T-Shirt Printing Services & Souvenirs',
  address: 'Block 1 Lot 42 Sennai Ruhale St., Calzada, Tipas, Taguig City',
  // Public file path served from /public. The util tries each in order so
  // dropping a transparent PNG at /public/bryle-closet-logo.png overrides
  // the site favicon without code changes.
  logoCandidates: ['/bryle-closet-logo.png', '/logo.png', '/favicon.png'],
};

const BRAND_PRIMARY: [number, number, number] = [37, 99, 235];   // blue-600
const BRAND_DARK:    [number, number, number] = [15, 23, 42];    // slate-900
const BRAND_MUTED:   [number, number, number] = [100, 116, 139]; // slate-500
const BRAND_TINT:    [number, number, number] = [239, 246, 255]; // blue-50

// In-memory cache so we don't re-fetch + re-encode the logo for every PDF
// generated in the session.
let _logoCache: string | null | undefined; // undefined = unknown, null = tried & failed

async function loadLogoDataUrl(): Promise<string | null> {
  if (_logoCache !== undefined) return _logoCache;
  for (const url of BUSINESS.logoCandidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      _logoCache = dataUrl;
      return dataUrl;
    } catch { /* try next */ }
  }
  _logoCache = null;
  return null;
}

export interface PdfHeaderOptions {
  title: string;
  subtitle?: string;
  /** Small KPI tiles printed below the brand header. */
  kpis?: { label: string; value: string }[];
}

/**
 * Creates a new branded PDF, draws the Bryle Closet header, and returns
 * the doc ready for `autoTable(...)` / `doc.text(...)` calls. After your
 * content is laid out, call `finalizePdf(doc)` to add the footer + page
 * numbers, then `doc.save(filename)`.
 */
export async function createBrandedPdf(opts: PdfHeaderOptions): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // ─── Brand header band ────────────────────────────────────────────────
  doc.setFillColor(...BRAND_PRIMARY);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Logo — try to load it; otherwise draw a monogram circle so the layout
  // still feels intentional.
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', 10, 5, 18, 18);
    } catch {
      drawMonogram(doc, 19, 14, 9);
    }
  } else {
    drawMonogram(doc, 19, 14, 9);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(BUSINESS.legalName, 32, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(BUSINESS.tagline, 32, 17);
  doc.setFontSize(7.5);
  doc.text(BUSINESS.address, 32, 21.5);

  // Generated-on stamp (right-aligned)
  const stamp = `Generated ${new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}`;
  doc.setFontSize(7.5);
  doc.text(stamp, pageWidth - 10, 12, { align: 'right' });
  doc.setFontSize(7);
  doc.text('Confidential business report', pageWidth - 10, 17, { align: 'right' });

  // ─── Title block ──────────────────────────────────────────────────────
  doc.setTextColor(...BRAND_DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(opts.title, 10, 40);
  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_MUTED);
    doc.text(opts.subtitle, 10, 46);
  }

  // Subtle separator
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(10, 50, pageWidth - 10, 50);

  // ─── KPI strip (optional) ─────────────────────────────────────────────
  if (opts.kpis && opts.kpis.length) {
    const startY = 55;
    const tileH = 16;
    const gap = 3;
    const tileW = (pageWidth - 20 - gap * (opts.kpis.length - 1)) / opts.kpis.length;
    opts.kpis.forEach((k, i) => {
      const x = 10 + i * (tileW + gap);
      doc.setFillColor(...BRAND_TINT);
      doc.roundedRect(x, startY, tileW, tileH, 2, 2, 'F');
      doc.setTextColor(...BRAND_MUTED);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(k.label.toUpperCase(), x + 3, startY + 5);
      doc.setTextColor(...BRAND_DARK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(String(k.value), x + 3, startY + 12);
    });
    // Position cursor below the KPI strip for the caller.
    (doc as any).__nextY = startY + tileH + 6;
  } else {
    (doc as any).__nextY = 56;
  }

  return doc;
}

function drawMonogram(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r, 'F');
  doc.setTextColor(...BRAND_PRIMARY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('BC', cx, cy + 1.5, { align: 'center' });
}

/** Add a styled table at the current Y cursor. */
export function addBrandedTable(
  doc: jsPDF,
  head: string[],
  body: (string | number)[][],
  opts: { title?: string } = {}
) {
  let startY = (doc as any).__nextY || 60;
  if (opts.title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text(opts.title, 10, startY);
    startY += 4;
  }
  autoTable(doc, {
    head: [head],
    body: body.map((row) => row.map((c) => (c === null || c === undefined ? '' : String(c)))),
    startY,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: BRAND_DARK,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: BRAND_PRIMARY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
  });
  (doc as any).__nextY = (doc as any).lastAutoTable.finalY + 6;
}

/** Add a section heading block (used between multiple tables). */
export function addSectionHeading(doc: jsPDF, text: string) {
  const y = (doc as any).__nextY || 60;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND_DARK);
  doc.text(text, 10, y);
  (doc as any).__nextY = y + 5;
}

/** Add page numbers + footer to every page. Call right before save. */
export function finalizePdf(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    // Footer separator
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(10, pageHeight - 12, pageWidth - 10, pageHeight - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_MUTED);
    doc.text(`${BUSINESS.legalName} · ${BUSINESS.address}`, 10, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount} · Powered by CustoMate`, pageWidth - 10, pageHeight - 7, { align: 'right' });
  }
}

/** Save with a sensible default filename. */
export function savePdf(doc: jsPDF, basename: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`${basename}-${stamp}.pdf`);
}

/**
 * Convenience: one-shot generator for simple "header + KPI + table" reports.
 * Returns nothing — saves the file immediately.
 */
export async function generateSimpleReport(args: {
  title: string;
  subtitle?: string;
  kpis?: { label: string; value: string }[];
  tables: { title?: string; head: string[]; body: (string | number)[][] }[];
  filename: string;
}) {
  const doc = await createBrandedPdf({ title: args.title, subtitle: args.subtitle, kpis: args.kpis });
  for (const t of args.tables) {
    addBrandedTable(doc, t.head, t.body, { title: t.title });
  }
  finalizePdf(doc);
  savePdf(doc, args.filename);
}
