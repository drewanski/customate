import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Calendar, Flag, Layers, AlertCircle } from 'lucide-react';
import { bulkScheduleOrders } from '../../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedOrders: any[];
  onSuccess: () => void;
}

export function BulkScheduleModal({ isOpen, onClose, selectedOrders, onSuccess }: Props) {
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low' | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setDate('');
    setPriority('');
    setSubmitting(false);
  }, [isOpen]);

  const totalUnits = selectedOrders.reduce((sum, o) => sum + Number(o.totalQty || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!date) {
      setError('Pick a target start date');
      return;
    }
    setSubmitting(true);
    try {
      const result = await bulkScheduleOrders({
        orderIds: selectedOrders.map((o) => o._id),
        productionDate: date,
        productionPriority: priority || undefined,
      });
      onSuccess();
      onClose();
      alert(`Scheduled ${result.scheduledCount} of ${selectedOrders.length} orders`);
    } catch (err: any) {
      setError(err.message || 'Bulk schedule failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Schedule"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting}>
            <Layers className="w-4 h-4 mr-1.5" />
            Schedule {selectedOrders.length} {selectedOrders.length === 1 ? 'order' : 'orders'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-1">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Selected</p>
              <p className="text-2xl font-black text-slate-900">{selectedOrders.length} orders</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total units</p>
              <p className="text-2xl font-black text-slate-900">{totalUnits}</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            <Calendar className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            Start date for all
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            <Flag className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            Set priority (optional)
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as any)}
            className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm bg-white"
          >
            <option value="">Keep current priority per order</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <ul className="max-h-32 overflow-y-auto text-xs text-slate-600 space-y-1 p-2 rounded-lg bg-slate-50 border border-slate-200">
          {selectedOrders.slice(0, 8).map((o) => (
            <li key={o._id} className="flex items-center justify-between">
              <span className="font-mono">#{String(o._id).slice(-6)}</span>
              <span className="truncate mx-2 flex-1">{o.customer?.name || '—'}</span>
              <span className="font-semibold">{o.totalQty} u</span>
            </li>
          ))}
          {selectedOrders.length > 8 && (
            <li className="text-center text-slate-400 pt-1">…and {selectedOrders.length - 8} more</li>
          )}
        </ul>
      </form>
    </Modal>
  );
}
