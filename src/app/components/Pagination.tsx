import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  /** 1-based current page. */
  page: number;
  /** Total number of items across all pages. */
  total: number;
  /** Page size. */
  pageSize: number;
  /** Called with the new page (1-based). */
  onPageChange: (page: number) => void;
  /** Optional: called with the new page size. Renders the size picker if provided. */
  onPageSizeChange?: (size: number) => void;
  /** Available page sizes. Default [10, 25, 50]. */
  pageSizeOptions?: number[];
  /** Singular label for items (default "item"). */
  itemLabel?: string;
  /** Plural label for items (default "items"). */
  itemLabelPlural?: string;
  /** Compact variant — hide page-size picker + "Showing X-Y of Z" text. */
  compact?: boolean;
  /** Optional className override. */
  className?: string;
}

/**
 * Build the smart-truncated page list: [1, '…', 4, 5, 6, '…', 20].
 *
 * Always shows first + last; shows a window around the current page.
 */
function buildPageList(current: number, totalPages: number, siblingCount = 1): Array<number | '...'> {
  const totalNumbers = siblingCount * 2 + 5; // first + last + current + 2*siblings + 2 dots
  if (totalPages <= totalNumbers) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblingCount, 1);
  const rightSibling = Math.min(current + siblingCount, totalPages);

  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < totalPages - 1;

  const pages: Array<number | '...'> = [];
  pages.push(1);
  if (showLeftDots) pages.push('...');
  for (let i = leftSibling; i <= rightSibling; i++) {
    if (i !== 1 && i !== totalPages) pages.push(i);
  }
  if (showRightDots) pages.push('...');
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  itemLabel = 'item',
  itemLabelPlural = 'items',
  compact = false,
  className = '',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const fromItem = total === 0 ? 0 : startIdx + 1;
  const toItem = Math.min(total, startIdx + pageSize);

  const pageList = useMemo(() => buildPageList(safePage, totalPages), [safePage, totalPages]);

  if (total === 0) return null;

  return (
    <div className={`flex items-center justify-between flex-wrap gap-3 ${className}`}>
      {/* Showing X-Y of Z items */}
      {!compact && (
        <p className="text-sm text-slate-600">
          Showing <span className="font-bold text-slate-900">{fromItem}</span>
          {fromItem !== toItem && (
            <>-<span className="font-bold text-slate-900">{toItem}</span></>
          )}
          <span> of </span>
          <span className="font-bold text-slate-900">{total}</span>
          <span> {total === 1 ? itemLabel : itemLabelPlural}</span>
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {/* Page-size picker */}
        {!compact && onPageSizeChange && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Per page</label>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400"
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {/* Page nav */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-200 shadow-sm">
          <button
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            aria-label="First page"
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 1}
            aria-label="Previous page"
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {pageList.map((p, i) =>
            p === '...' ? (
              <span key={`gap-${i}`} className="w-8 h-8 inline-flex items-center justify-center text-slate-400 text-xs">…</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                aria-label={`Page ${p}`}
                aria-current={p === safePage ? 'page' : undefined}
                className={`min-w-[32px] h-8 px-2 rounded-lg inline-flex items-center justify-center text-sm font-bold transition-colors ${
                  p === safePage
                    ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage === totalPages}
            aria-label="Next page"
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={safePage === totalPages}
            aria-label="Last page"
            className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Helper hook — manages `page` + `pageSize` and a callback that auto-resets
 * page when a dep (e.g. tab, search, status filter) changes.
 */
export function usePagination(initialPageSize = 10, resetDeps: any[] = []) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  React.useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resetDeps);

  return { page, pageSize, setPage, setPageSize };
}

export default Pagination;
