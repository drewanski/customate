import React, { useEffect, useState } from 'react';
import {
  Wand2,
  Loader2,
  TrendingDown,
  Truck,
  Receipt,
  Clock,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { aiRestockSuggestions } from '../../api';
import { formatPeso } from '../../utils/format';

interface Props {
  /** Fired when admin clicks "Restock now" on a suggestion */
  onRestock: (item: any) => void;
  /** Bumped externally after a restock so the panel can refresh */
  refreshKey?: number;
}

const URGENCY_TINTS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  urgent: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  low: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' },
};

/**
 * AI Restock Suggestions — analyses 30 days of stock movement data to
 * compute daily burn rates, predict days-until-out, and propose reorder
 * quantities (with safety stock for supplier lead time).
 *
 * The math is rule-based on the backend so the panel always shows useful
 * data; Gemini is only asked to phrase a headline.
 */
export function AIRestockPanel({ onRestock, refreshKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiRestockSuggestions();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Could not compute suggestions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const suggestions: any[] = data?.suggestions || [];
  const shouldShow = !loading && !error && suggestions.length > 0;
  if (!loading && !error && suggestions.length === 0) {
    return null; // No restocks needed → don't clutter the page
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
      {/* Header bar */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50/60 transition"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 via-fuchsia-500 to-orange-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
            <Wand2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">AI Restock Suggestions</p>
              {data?.fallback && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  Rule-based
                </span>
              )}
            </div>
            {loading ? (
              <p className="text-sm font-bold text-slate-700 mt-0.5 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing 30 days of stock movement…
              </p>
            ) : error ? (
              <p className="text-sm font-bold text-rose-700 mt-0.5">{error}</p>
            ) : (
              <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{data?.headline || '—'}</p>
            )}
            {shouldShow && (
              <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
                <span>{suggestions.length} items</span>
                {data?.urgentCount > 0 && (
                  <span className="flex items-center gap-1 text-rose-600 font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    {data.urgentCount} urgent
                  </span>
                )}
                <span>Est. cost: {formatPeso(data?.totalReorderCost || 0)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); load(); }}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      {/* Suggestions list */}
      {expanded && shouldShow && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {suggestions.slice(0, 8).map((s) => {
            const tint = URGENCY_TINTS[s.urgency] || URGENCY_TINTS.low;
            return (
              <div key={s.inventoryId} className="p-3 flex items-center gap-3 hover:bg-slate-50/60 transition">
                {s.image ? (
                  <img src={s.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-bold text-sm text-slate-900 truncate">{s.name}</p>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${tint.bg} ${tint.text} border ${tint.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${tint.dot}`} />
                      {s.urgency}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                    <span className="font-mono">{s.sku}</span>
                    <span className="flex items-center gap-0.5">
                      <TrendingDown className="w-3 h-3 text-rose-500" />
                      {s.availableStock} left
                    </span>
                    {s.daysToEmpty !== null && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        ~{s.daysToEmpty}d to stockout
                      </span>
                    )}
                    <span>{s.dailyBurnRate}/day pace</span>
                    {s.lastSupplier && (
                      <span className="text-slate-400 truncate max-w-[140px]">
                        via {s.lastSupplier}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-slate-900">Reorder {s.suggestedQty}</p>
                  <p className="text-[10px] text-slate-500">~{formatPeso(s.estimatedCost)}</p>
                </div>
                <button
                  onClick={() => onRestock(s)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-95 transition shadow-sm flex-shrink-0"
                >
                  <Sparkles className="w-3 h-3" />
                  Restock
                </button>
              </div>
            );
          })}
          {suggestions.length > 8 && (
            <p className="px-3 py-2 text-[11px] text-slate-500 italic text-center">
              + {suggestions.length - 8} more — restock urgent items first
            </p>
          )}
        </div>
      )}
    </div>
  );
}
