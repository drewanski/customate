import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { User as UserIcon, Calendar, DollarSign, Receipt, CheckCircle2, XCircle } from 'lucide-react';
import { getCouponRedemptions } from '../../api';
import { formatPeso } from '../../utils/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  coupon: any | null;
}

/**
 * CouponUsageDrawer — list of every redemption for one coupon. Released
 * (refunded) redemptions are shown but visually faded so the admin can
 * distinguish active uses from refunded ones.
 */
export function CouponUsageDrawer({ isOpen, onClose, coupon }: Props) {
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !coupon?._id) return;
    setLoading(true);
    getCouponRedemptions(coupon._id)
      .then(setRedemptions)
      .catch(() => setRedemptions([]))
      .finally(() => setLoading(false));
  }, [isOpen, coupon?._id]);

  if (!coupon) return null;

  const activeCount = redemptions.filter((r) => !r.released).length;
  const totalDiscount = redemptions
    .filter((r) => !r.released)
    .reduce((sum, r) => sum + (r.discountAmount || 0), 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Usage — ${coupon.code}`}>
      <div className="space-y-4 max-h-[72vh] overflow-y-auto px-1">
        {/* Header card */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total uses</p>
              <p className="text-xl font-black text-slate-900">{redemptions.length}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Active</p>
              <p className="text-xl font-black text-emerald-700">{activeCount}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Discount given</p>
              <p className="text-xl font-black text-slate-900">{formatPeso(totalDiscount)}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center">
            <div className="w-8 h-8 mx-auto border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 mt-2">Loading redemptions…</p>
          </div>
        ) : redemptions.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 italic">No redemptions yet.</p>
        ) : (
          <ul className="space-y-2">
            {redemptions.map((r) => (
              <li
                key={r._id}
                className={`p-3 rounded-xl border ${
                  r.released ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {r.customer?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{r.customer?.name || '(deleted)'}</p>
                      <p className="text-[11px] text-slate-500 truncate">{r.customer?.email}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${r.released ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      -{formatPeso(r.discountAmount || 0)}
                    </p>
                    <p className="text-[10px] text-slate-500">{new Date(r.redeemedAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    Order #{String(r.order).slice(-6)} · cart ₱{(r.cartSubtotal || 0).toLocaleString()}
                  </span>
                  {r.released ? (
                    <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
                      <XCircle className="w-3 h-3" /> Released
                      {r.releaseReason ? ` · ${r.releaseReason}` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
