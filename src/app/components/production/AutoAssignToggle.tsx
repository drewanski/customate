import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { getSystemConfig, updateSystemConfig } from '../../api';

/**
 * Compact toggle for the autoAssignEnabled system setting.
 *
 * When ON, the orders status route picks the production_staff user with
 * the lowest active-task count whenever an admin approves a new order
 * without manually assigning it. Lets the manager run a hands-off
 * round-robin instead of touching every order.
 *
 * Defaults to OFF — the manager has to opt in. A spinner shows during
 * the PUT so the user knows the save is in flight.
 */
export function AutoAssignToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await getSystemConfig();
      setEnabled(!!cfg.autoAssignEnabled);
    } catch (err: any) {
      setError(err?.message || 'Could not load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    setError(null);
    setEnabled(next); // optimistic
    try {
      await updateSystemConfig({ autoAssignEnabled: next });
    } catch (err: any) {
      setEnabled(!next); // revert
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading || saving}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold border transition ${
        enabled
          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
      } disabled:opacity-50`}
      title="When ON, approved orders are auto-assigned to the staff member with the lowest current load."
    >
      {saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Sparkles className={`w-3.5 h-3.5 ${enabled ? 'text-emerald-600' : 'text-slate-400'}`} />
      )}
      <span>Auto-assign on approval</span>
      <span
        className={`relative inline-flex items-center w-8 h-4 rounded-full transition-colors ${
          enabled ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${
            enabled ? 'left-4' : 'left-0.5'
          }`}
        />
      </span>
      {error && <span className="text-rose-600 text-[10px] ml-1">{error}</span>}
    </button>
  );
}
