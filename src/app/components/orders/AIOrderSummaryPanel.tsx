import React, { useEffect, useState } from 'react';
import { Wand2, Loader2, Shield, AlertTriangle, ChevronRight, Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import { aiOrderSummary } from '../../api';

interface Props {
  orderId?: string;
  /** Bumped by the drawer when the order data changes to invalidate cached summary. */
  refreshKey?: number;
}

const RISK_TINTS: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  low: { bg: 'from-emerald-50 to-teal-50', text: 'text-emerald-700', border: 'border-emerald-200', ring: 'ring-emerald-500' },
  medium: { bg: 'from-amber-50 to-orange-50', text: 'text-amber-700', border: 'border-amber-200', ring: 'ring-amber-500' },
  high: { bg: 'from-rose-50 to-orange-50', text: 'text-rose-700', border: 'border-rose-200', ring: 'ring-rose-500' },
};

/**
 * AI Order Briefing — mounted at the top of OrderDetailDrawer.
 *
 * Fetches a generated summary + risk score + suggested action when the
 * drawer opens. Shows a static fallback if Gemini is unreachable (so the
 * panel always renders useful info). Admin can re-analyse on demand.
 */
export function AIOrderSummaryPanel({ orderId, refreshKey }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await aiOrderSummary(orderId);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Could not generate summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orderId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, refreshKey]);

  if (!orderId) return null;

  const tint = RISK_TINTS[data?.risk] || RISK_TINTS.low;

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${tint.border} bg-gradient-to-br ${tint.bg}`}>
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/50 blur-2xl pointer-events-none" />
      <div className="relative p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 via-fuchsia-500 to-orange-500 flex items-center justify-center text-white flex-shrink-0 shadow-md">
            <Wand2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                AI Briefing
              </p>
              <button
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                title="Re-analyse"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Analyzing…' : 'Refresh'}
              </button>
            </div>

            {loading && !data ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Reading order context…
              </div>
            ) : error ? (
              <p className="mt-2 text-xs text-rose-700">{error}</p>
            ) : data ? (
              <>
                <p className="mt-1 text-sm text-slate-900 font-medium leading-snug">{data.summary}</p>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white border ${tint.border} ${tint.text}`}>
                    <Shield className="w-2.5 h-2.5" />
                    {data.risk} risk
                  </span>
                  {data.fallback && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500">
                      <Sparkles className="w-2.5 h-2.5" />
                      Rule-based
                    </span>
                  )}
                </div>

                {data.riskReasons?.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {data.riskReasons.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <AlertTriangle className={`w-3 h-3 mt-0.5 flex-shrink-0 ${tint.text}`} />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {data.suggestedAction && (
                  <div className="mt-3 flex items-start gap-1.5 p-2 rounded-lg bg-white/70 border border-white/80">
                    <ArrowRight className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${tint.text}`} />
                    <p className="text-xs font-semibold text-slate-900">{data.suggestedAction}</p>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
