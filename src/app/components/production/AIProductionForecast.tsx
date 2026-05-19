import React, { useEffect, useState } from 'react';
import {
  Wand2,
  Loader2,
  TrendingUp,
  AlertTriangle,
  Factory,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { aiProductionForecast } from '../../api';

interface Props {
  refreshKey?: number;
}

const STATUS_TINT: Record<string, { bar: string; chip: string; label: string }> = {
  over: { bar: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700', label: 'Over' },
  tight: { bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700', label: 'Tight' },
  healthy: { bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', label: 'Healthy' },
  open: { bar: 'bg-blue-400', chip: 'bg-blue-100 text-blue-700', label: 'Open' },
  closed: { bar: 'bg-slate-200', chip: 'bg-slate-100 text-slate-500', label: 'Closed' },
};

/**
 * AI Production Forecast — reads scheduled orders + capacity + recent
 * throughput to give a 7-day outlook. Stage-by-stage backlog and
 * recommendations are rule-based; the headline is Gemini-phrased.
 */
export function AIProductionForecast({ refreshKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await aiProductionForecast();
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Could not generate forecast');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [refreshKey]);

  const days: any[] = data?.nextSevenDays || [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">AI Production Forecast</p>
              {data?.fallback && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  Rule-based
                </span>
              )}
            </div>
            {loading ? (
              <p className="text-sm font-bold text-slate-700 mt-0.5 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Forecasting next 7 days…
              </p>
            ) : error ? (
              <p className="text-sm font-bold text-rose-700 mt-0.5">{error}</p>
            ) : (
              <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">{data?.headline || '—'}</p>
            )}
            {!loading && !error && data && (
              <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                <span>{data.totalScheduledUnits || 0} units / {data.totalCapacity || 0} cap</span>
                {data.overCount > 0 && (
                  <span className="flex items-center gap-1 text-rose-600 font-semibold">
                    <AlertTriangle className="w-3 h-3" />
                    {data.overCount} day{data.overCount === 1 ? '' : 's'} over
                  </span>
                )}
                {data.bottleneckStage && (
                  <span className="flex items-center gap-1">
                    <Factory className="w-3 h-3" />
                    {data.bottleneckCount} stuck in {String(data.bottleneckStage).replace('_', ' ')}
                  </span>
                )}
                {typeof data.dailyThroughput === 'number' && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {data.dailyThroughput}/day pace
                  </span>
                )}
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

      {expanded && !loading && !error && data && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          {/* 7-day mini-calendar bars */}
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const tint = STATUS_TINT[d.status] || STATUS_TINT.open;
              return (
                <div key={d.date} className="text-center">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p className="text-xs font-black text-slate-900 mb-1">
                    {new Date(d.date).getUTCDate()}
                  </p>
                  <div className="h-12 rounded-lg bg-slate-100 relative overflow-hidden">
                    {d.capacity > 0 ? (
                      <div
                        className={`absolute bottom-0 left-0 right-0 ${tint.bar} transition-all`}
                        style={{ height: `${Math.min(100, d.utilization * 100)}%` }}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[9px] text-slate-400">Closed</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1">{d.scheduledUnits}/{d.capacity || '—'}</p>
                </div>
              );
            })}
          </div>

          {/* Stage backlog */}
          {data.stageBacklog && Object.keys(data.stageBacklog).length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <Factory className="w-3 h-3" /> Current stage backlog
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(data.stageBacklog).map(([stage, count]: any) => (
                  <span
                    key={stage}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      stage === data.bottleneckStage
                        ? 'bg-rose-100 text-rose-700 border-rose-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {stage === data.bottleneckStage && <AlertTriangle className="w-2.5 h-2.5" />}
                    {String(stage).replace('_', ' ')}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Recommendations
              </p>
              <ul className="space-y-1">
                {data.recommendations.map((r: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                    <span className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
