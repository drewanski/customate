import React, { useEffect, useState } from 'react';
import { Cpu, Cloud, CheckCircle2, AlertCircle, RotateCcw, Trash2, X, ChevronDown } from 'lucide-react';
import { aiHealth, aiPurgeCache } from '../../api';

/**
 * Small status pill that lives at the top of admin pages and shows which AI
 * provider is responding. Click for the full breakdown + cache management.
 *
 * Goal: make it obvious which provider answered (Ollama = free local LLM,
 * Gemini = cloud), so the admin sees exactly when they're spending and when
 * they're not.
 */
export function AIHealthPill() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await aiHealth();
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Refresh every 30s while panel is open
    const id = setInterval(() => { if (open) load(); }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ollamaUp = data?.providers?.ollama?.reachable === true && data?.providers?.ollama?.configured;
  const geminiUp = data?.providers?.gemini?.reachable === true && data?.providers?.gemini?.configured;
  const ollamaConfigured = data?.providers?.ollama?.configured;
  const geminiConfigured = data?.providers?.gemini?.configured;

  // Active provider — whichever is preferred AND reachable
  const activeProvider =
    ollamaUp ? 'ollama'
    : geminiUp ? 'gemini'
    : ollamaConfigured ? 'ollama-down'
    : geminiConfigured ? 'gemini-down'
    : 'none';

  const pillLabel =
    activeProvider === 'ollama' ? 'Local AI'
    : activeProvider === 'gemini' ? 'Cloud AI'
    : 'AI offline';
  const pillIcon = activeProvider === 'ollama' ? Cpu : Cloud;
  const pillTint =
    activeProvider === 'ollama' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : activeProvider === 'gemini' ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-rose-100 text-rose-700 border-rose-200';

  const handlePurge = async () => {
    if (!confirm('Clear all cached AI responses? Next requests will hit the providers fresh.')) return;
    setPurging(true);
    setPurgeMsg(null);
    try {
      const res = await aiPurgeCache();
      setPurgeMsg(`Cleared ${res.deleted} cached responses`);
      load();
    } catch (err: any) {
      setPurgeMsg(err.message || 'Purge failed');
    } finally {
      setPurging(false);
    }
  };

  const Icon = pillIcon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition ${pillTint} hover:opacity-90`}
        title="AI status"
      >
        <Icon className="w-3.5 h-3.5" />
        <span>{loading && !data ? '…' : pillLabel}</span>
        {data?.cache?.hitRate > 0 && (
          <span className="text-[10px] opacity-70">· {data.cache.hitRate}% cached</span>
        )}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-slate-200 shadow-2xl z-40 overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-900">AI Providers</p>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-3">
              {/* Ollama */}
              <ProviderRow
                icon={Cpu}
                name="Ollama (local)"
                subtitle={data?.providers?.ollama?.model || 'not set'}
                configured={ollamaConfigured}
                reachable={ollamaUp}
                error={data?.providers?.ollama?.lastError}
                callCount={data?.usage?.ollamaCalls || 0}
                tint="from-emerald-500 to-teal-500"
              />

              {/* Gemini */}
              <ProviderRow
                icon={Cloud}
                name="Gemini (cloud)"
                subtitle={data?.providers?.gemini?.model || 'not set'}
                configured={geminiConfigured}
                reachable={geminiUp}
                error={data?.providers?.gemini?.lastError}
                callCount={data?.usage?.geminiCalls || 0}
                tint="from-blue-500 to-indigo-500"
              />

              {/* Cache */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cache</p>
                  <span className="text-[10px] text-slate-400">{data?.cache?.count || 0} rows</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-700">
                  <span className="font-bold text-emerald-600">{data?.cache?.hits || 0}</span> hits ·{' '}
                  <span className="font-bold text-slate-700">{data?.cache?.misses || 0}</span> misses ·{' '}
                  <span className="font-bold text-blue-600">{data?.cache?.hitRate || 0}%</span> hit rate
                </div>
                {data?.usage?.fallbacks > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    {data.usage.fallbacks} static fallbacks served
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-1.5 pt-2 border-t border-slate-100">
                <button
                  onClick={load}
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                >
                  <RotateCcw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={handlePurge}
                  disabled={purging}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  {purging ? 'Purging…' : 'Purge cache'}
                </button>
              </div>
              {purgeMsg && <p className="text-[11px] text-slate-600">{purgeMsg}</p>}

              <p className="text-[10px] text-slate-400 leading-snug">
                Local AI (Ollama) is free per call. Cloud AI (Gemini) uses your free tier or paid quota.
                Cache hits cost nothing.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProviderRow({ icon: Icon, name, subtitle, configured, reachable, error, callCount, tint }: any) {
  const status = !configured ? 'off' : reachable === true ? 'up' : reachable === false ? 'down' : 'unknown';
  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${tint} flex items-center justify-center text-white flex-shrink-0 ${!configured ? 'opacity-40' : ''}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-xs font-bold text-slate-900">{name}</p>
          {status === 'up' && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-2.5 h-2.5" /> Live
            </span>
          )}
          {status === 'down' && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
              <AlertCircle className="w-2.5 h-2.5" /> Down
            </span>
          )}
          {status === 'off' && (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
              Not configured
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 font-mono truncate">{subtitle}</p>
        {callCount > 0 && (
          <p className="text-[10px] text-slate-600 mt-0.5">{callCount} calls this session</p>
        )}
        {status === 'down' && error && (
          <p className="text-[10px] text-rose-600 mt-0.5 line-clamp-2">{error}</p>
        )}
      </div>
    </div>
  );
}
