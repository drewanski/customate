import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Button } from '../Button';
import { AlertCircle, RotateCcw, CheckCircle2 } from 'lucide-react';
import { refundOrder } from '../../api';
import { formatPeso } from '../../utils/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onSuccess: () => void;
}

const PRESET_REASONS = [
  'Customer requested',
  'Damaged in shipping',
  'Incorrect item delivered',
  'Quality issue',
  'Production delay',
  'Payment dispute',
  'Other',
];

/**
 * Refund modal — admin records a refund (full or partial). Does NOT call the
 * payment gateway; the admin reconciles with PayMongo separately. This
 * endpoint persists the intent so reports + customer-facing status reflect
 * it, and writes an audit-log entry.
 */
export function RefundModal({ isOpen, onClose, order, onSuccess }: Props) {
  const [amount, setAmount] = useState<number | ''>('');
  const [reason, setReason] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paid = Number(order?.paidAmount) || Number(order?.totalPrice) || 0;
  const alreadyRefunded = Number(order?.refundedAmount) || 0;
  const refundable = Math.max(0, paid - alreadyRefunded);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmitting(false);
    setAmount(refundable);
    setReason(PRESET_REASONS[0]);
    setCustomReason('');
    setNote('');
  }, [isOpen, order?._id, refundable]);

  const finalReason = reason === 'Other' ? customReason.trim() : reason;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a positive refund amount');
      return;
    }
    if (amt > refundable + 0.01) {
      setError(`Maximum refundable: ${formatPeso(refundable)}`);
      return;
    }
    if (!finalReason) {
      setError('A reason is required');
      return;
    }
    setSubmitting(true);
    try {
      await refundOrder(order._id || order.id, {
        amount: amt,
        reason: finalReason,
        note: note.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Refund failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) return null;

  const isFull = Number(amount) >= refundable - 0.01;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Refund"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting} variant="danger">
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Record refund
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
        {/* Order summary */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                Order #{String(order._id || order.id).slice(-6)}
              </p>
              <p className="font-bold text-slate-900 truncate">{order.customerName || order.customer?.name || 'Customer'}</p>
              <p className="text-xs text-slate-600 truncate">{order.customerEmail || order.customer?.email}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total</p>
              <p className="text-sm font-black text-slate-900">{formatPeso(order.totalPrice || 0)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Paid</p>
              <p className="text-sm font-black text-emerald-700">{formatPeso(paid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Already refunded</p>
              <p className="text-sm font-black text-rose-700">{formatPeso(alreadyRefunded)}</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Refund amount (max {formatPeso(refundable)})
          </label>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            min={0}
            max={refundable}
            step="0.01"
            required
          />
          <div className="mt-1 flex gap-1.5">
            <button
              type="button"
              onClick={() => setAmount(refundable)}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              Full ({formatPeso(refundable)})
            </button>
            <button
              type="button"
              onClick={() => setAmount(Math.round(refundable / 2 * 100) / 100)}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
            >
              50%
            </button>
          </div>
          {isFull && (
            <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Full refund — order status will become "refunded" and stock will be restored.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Reason <span className="text-rose-500">*</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {PRESET_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                  reason === r ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
          label="Internal note (optional)"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Any reconciliation details, ticket number, etc."
        />

        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            This records the refund in CustoMate. You must <strong>separately initiate the refund in PayMongo</strong> (or your payment provider) to actually return funds to the customer.
          </span>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}
