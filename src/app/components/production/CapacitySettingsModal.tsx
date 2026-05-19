import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Input } from '../Input';
import { Button } from '../Button';
import { Settings, Plus, Trash2, AlertCircle, CalendarDays } from 'lucide-react';
import { getProductionCapacity, updateProductionCapacity } from '../../api';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Override {
  date: string;
  capacity: number;
  reason: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function CapacitySettingsModal({ isOpen, onClose, onSaved }: Props) {
  const [defaultCap, setDefaultCap] = useState(100);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    (async () => {
      setLoading(true);
      try {
        const cap = await getProductionCapacity();
        setDefaultCap(cap.defaultDailyCapacity);
        setWorkingDays(cap.workingDays || [1, 2, 3, 4, 5, 6]);
        setOverrides(cap.overrides || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load capacity');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const toggleDay = (d: number) => {
    setWorkingDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
    );
  };

  const addOverride = () => {
    setOverrides((prev) => [...prev, { date: '', capacity: defaultCap, reason: '' }]);
  };

  const updateOverride = (idx: number, patch: Partial<Override>) => {
    setOverrides((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  };

  const removeOverride = (idx: number) => {
    setOverrides((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const cleanOverrides = overrides
        .filter((o) => o.date && Number.isFinite(Number(o.capacity)))
        .map((o) => ({ date: o.date, capacity: Number(o.capacity), reason: o.reason || '' }));
      await updateProductionCapacity({
        defaultDailyCapacity: Number(defaultCap),
        workingDays,
        overrides: cleanOverrides,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Production Capacity"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSave} loading={submitting}>
            <Settings className="w-4 h-4 mr-1.5" /> Save settings
          </Button>
        </>
      }
    >
      <div className="space-y-5 max-h-[72vh] overflow-y-auto px-1">
        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 text-xs text-slate-700">
              <p className="font-semibold mb-1">How this works</p>
              <p>
                Capacity is measured in <strong>total units per day</strong>. The schedule
                view shows a workload bar per day and warns if scheduled orders exceed
                capacity. Use overrides for holidays, extra shifts, or partial-day breaks.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Default daily capacity (units)
              </label>
              <Input
                type="number"
                min={0}
                value={defaultCap}
                onChange={(e) => setDefaultCap(Number(e.target.value) || 0)}
              />
              <p className="text-[11px] text-slate-500 mt-1">Applied to every working day unless overridden below.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Working days
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAYS.map((label, idx) => {
                  const on = workingDays.includes(idx);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`w-12 h-12 rounded-xl text-xs font-bold transition ${
                        on
                          ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-md'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <CalendarDays className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
                  Date-specific overrides
                </label>
                <Button size="sm" variant="outline" type="button" onClick={addOverride}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add
                </Button>
              </div>
              {overrides.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No overrides. Default capacity applies every working day.</p>
              ) : (
                <div className="space-y-2">
                  {overrides.map((o, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_100px_1fr_auto] gap-2 items-center p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <input
                        type="date"
                        value={o.date}
                        onChange={(e) => updateOverride(idx, { date: e.target.value })}
                        className="h-10 px-2 border border-slate-200 rounded-lg text-sm"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={o.capacity}
                        onChange={(e) => updateOverride(idx, { capacity: Number(e.target.value) || 0 })}
                      />
                      <Input
                        placeholder="Reason (holiday, etc.)"
                        value={o.reason}
                        onChange={(e) => updateOverride(idx, { reason: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => removeOverride(idx)}
                        className="w-9 h-9 rounded-lg text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
