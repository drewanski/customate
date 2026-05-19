import React, { useState, useEffect } from 'react';
import { Modal } from '../Modal';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Button } from '../Button';
import { Wrench, AlertTriangle, AlertCircle } from 'lucide-react';
import { adjustStock, recordDamage } from '../../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item: any | null;
  onSuccess: () => void;
}

const PRESET_REASONS: Record<'adjustment' | 'damage', string[]> = {
  adjustment: [
    'Physical recount',
    'System error correction',
    'Found stock',
    'Internal transfer',
    'Other',
  ],
  damage: ['Damaged in storage', 'Quality defect', 'Lost / shrinkage', 'Customer return — unsellable', 'Other'],
};

/**
 * Adjust modal — used for manual corrections (positive or negative) that
 * aren't a restock or a sale. Forces the admin to choose a reason so the
 * audit log is meaningful.
 */
export function AdjustStockModal({ isOpen, onClose, item, onSuccess }: Props) {
  const [mode, setMode] = useState<'adjustment' | 'damage'>('adjustment');
  const [direction, setDirection] = useState<'+' | '-'>('+');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode('adjustment');
    setDirection('+');
    setQuantity('');
    setReason(PRESET_REASONS.adjustment[0]);
    setCustomReason('');
    setNotes('');
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    // Reset reason when mode changes so we don't carry adjustment reasons into damage
    setReason(PRESET_REASONS[mode][0]);
    setCustomReason('');
    if (mode === 'damage') setDirection('-');
  }, [mode]);

  const finalReason = reason === 'Other' ? customReason.trim() : reason;
  const currentStock = item?.stock ?? 0;
  const delta = mode === 'damage' ? -Math.abs(Number(quantity) || 0) : direction === '+' ? Math.abs(Number(quantity) || 0) : -Math.abs(Number(quantity) || 0);
  const projected = currentStock + delta;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = Math.abs(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Quantity must be a positive number');
      return;
    }
    if (!finalReason) {
      setError('A reason is required');
      return;
    }
    if (projected < 0) {
      setError(`Cannot reduce below 0 — current stock is ${currentStock}`);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'damage') {
        await recordDamage({
          inventoryId: item._id,
          quantity: qty,
          reason: finalReason,
          notes: notes.trim(),
        });
      } else {
        await adjustStock({
          inventoryId: item._id,
          delta,
          reason: finalReason,
          notes: notes.trim(),
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to apply adjustment');
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;

  const isDamage = mode === 'damage';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isDamage ? 'Record Damage / Loss' : 'Adjust Stock'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {isDamage ? <AlertTriangle className="w-4 h-4 mr-1.5" /> : <Wrench className="w-4 h-4 mr-1.5" />}
            {isDamage ? 'Record Damage' : 'Apply Adjustment'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
        {/* Header card */}
        <div className={`flex items-center gap-3 p-3 rounded-2xl border ${
          isDamage ? 'bg-gradient-to-br from-rose-50 to-orange-50 border-rose-200'
                  : 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200'
        }`}>
          {item.image ? (
            <img src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
          ) : (
            <div className={`w-12 h-12 rounded-lg bg-white border flex items-center justify-center ${
              isDamage ? 'border-rose-200 text-rose-600' : 'border-amber-200 text-amber-600'
            }`}>
              {isDamage ? <AlertTriangle className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate">{item.name}</p>
            <p className="text-xs font-mono text-slate-500">{item.sku}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Current</p>
            <p className="text-xl font-black text-slate-900">{currentStock}</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 rounded-full bg-slate-100 w-fit">
          {(['adjustment', 'damage'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                mode === m
                  ? m === 'damage'
                    ? 'bg-white text-rose-700 shadow-sm'
                    : 'bg-white text-amber-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m === 'adjustment' ? 'Manual Adjustment' : 'Damage / Loss'}
            </button>
          ))}
        </div>

        {/* Direction (only for adjustment) */}
        {mode === 'adjustment' && (
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Direction</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection('+')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
                  direction === '+'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/25'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                + Add stock
              </button>
              <button
                type="button"
                onClick={() => setDirection('-')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${
                  direction === '-'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/25'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                − Remove stock
              </button>
            </div>
          </div>
        )}

        <Input
          type="number"
          label="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder="0"
          required
        />

        {/* Reason picker */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Reason <span className="text-rose-500">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {PRESET_REASONS[mode].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                  reason === r
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === 'Other' && (
            <Input
              placeholder="Type a custom reason"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
            />
          )}
        </div>

        <Textarea
          label="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any extra detail for the audit log…"
        />

        {/* Live preview */}
        {Number(quantity) > 0 && (
          <div className={`p-3 rounded-xl border flex items-center justify-between ${
            projected < 0
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-slate-900 text-white'
          }`}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold opacity-70">Stock will change</p>
              <p className="text-lg font-black">
                {currentStock} → <span className={projected < 0 ? 'text-rose-600' : 'text-emerald-300'}>{projected}</span>
              </p>
            </div>
            <div className={`text-2xl font-black ${projected < 0 ? '' : 'text-emerald-300'}`}>
              {delta > 0 ? '+' : ''}
              {delta}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
