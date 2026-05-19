import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Button } from '../Button';
import { Percent, DollarSign, Truck, Gift, AlertCircle, Sparkles } from 'lucide-react';
import { createCoupon, updateCoupon } from '../../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  coupon: any | null; // null = create, non-null = edit
  onSaved: () => void;
}

const COUPON_TYPES = [
  { id: 'percentage',   label: 'Percentage off',  icon: Percent,    desc: 'X% off the cart subtotal' },
  { id: 'fixed_amount', label: 'Fixed amount',    icon: DollarSign, desc: 'Flat ₱ off the cart subtotal' },
  { id: 'free_shipping',label: 'Free shipping',   icon: Truck,      desc: 'Waive the shipping fee' },
  { id: 'bogo',         label: 'Buy N get 1 free',icon: Gift,       desc: 'Cheapest item in each group is free' },
];

/**
 * CouponFormModal — admin form for create/edit. Validates basic shape on the
 * client (server still validates authoritatively).
 *
 * Notes:
 *   - The `code` field is editable only on create. Editing a coupon's code
 *     would break orders that already reference it.
 *   - Dates use `<input type="datetime-local">` for native picker; values are
 *     converted to/from UTC ISO strings at the boundary.
 */
export function CouponFormModal({ isOpen, onClose, coupon, onSaved }: Props) {
  const isEditing = !!coupon;

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('percentage');
  const [value, setValue] = useState<number | ''>('');
  const [maxDiscount, setMaxDiscount] = useState<number | ''>('');
  const [minOrderValue, setMinOrderValue] = useState<number | ''>('');
  const [usageLimit, setUsageLimit] = useState<number | ''>('');
  const [usageLimitPerCustomer, setUsageLimitPerCustomer] = useState<number | ''>(1);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [excludeBulkOrders, setExcludeBulkOrders] = useState(false);
  const [firstTimeCustomerOnly, setFirstTimeCustomerOnly] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [applicableCategories, setApplicableCategories] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever a different coupon is opened
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSubmitting(false);
    if (coupon) {
      setCode(coupon.code || '');
      setName(coupon.name || '');
      setDescription(coupon.description || '');
      setType(coupon.type || 'percentage');
      setValue(coupon.value ?? '');
      setMaxDiscount(coupon.maxDiscount || '');
      setMinOrderValue(coupon.minOrderValue || '');
      setUsageLimit(coupon.usageLimit || '');
      setUsageLimitPerCustomer(coupon.usageLimitPerCustomer ?? 1);
      setValidFrom(coupon.validFrom ? toLocal(coupon.validFrom) : '');
      setValidUntil(coupon.validUntil ? toLocal(coupon.validUntil) : '');
      setExcludeBulkOrders(!!coupon.excludeBulkOrders);
      setFirstTimeCustomerOnly(!!coupon.firstTimeCustomerOnly);
      setIsActive(coupon.isActive !== false);
      setApplicableCategories(Array.isArray(coupon.applicableCategories) ? coupon.applicableCategories : []);
    } else {
      // Defaults for new coupon: 30-day window starting now
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      setCode('');
      setName('');
      setDescription('');
      setType('percentage');
      setValue('');
      setMaxDiscount('');
      setMinOrderValue('');
      setUsageLimit('');
      setUsageLimitPerCustomer(1);
      setValidFrom(toLocal(now));
      setValidUntil(toLocal(in30));
      setExcludeBulkOrders(false);
      setFirstTimeCustomerOnly(false);
      setIsActive(true);
      setApplicableCategories([]);
    }
  }, [isOpen, coupon]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation (server re-validates)
    if (!isEditing && !code.trim()) return setError('Code is required');
    if (!name.trim()) return setError('Name is required');
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) return setError('Value must be greater than 0');
    if (type === 'percentage' && (v < 1 || v > 100)) return setError('Percentage must be between 1 and 100');
    if (!validUntil) return setError('Valid-until date is required');
    if (validFrom && new Date(validFrom) >= new Date(validUntil)) {
      return setError('Valid-until must be after valid-from');
    }

    setSubmitting(true);
    try {
      const payload = {
        ...(isEditing ? {} : { code: code.trim().toUpperCase() }),
        name: name.trim(),
        description: description.trim(),
        type,
        value: v,
        maxDiscount: Number(maxDiscount) || 0,
        minOrderValue: Number(minOrderValue) || 0,
        usageLimit: Number(usageLimit) || 0,
        usageLimitPerCustomer: Number(usageLimitPerCustomer) || 0,
        validFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
        validUntil: new Date(validUntil).toISOString(),
        excludeBulkOrders,
        firstTimeCustomerOnly,
        isActive,
        applicableCategories,
      };
      if (isEditing) {
        await updateCoupon(coupon._id, payload);
      } else {
        await createCoupon(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? `Edit ${coupon?.code}` : 'Create coupon'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting}>
            <Sparkles className="w-4 h-4 mr-1.5" /> {isEditing ? 'Save changes' : 'Create coupon'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[72vh] overflow-y-auto px-1">
        {/* Code + Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Code <span className="text-rose-500">*</span>
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isEditing}
              placeholder="WELCOME10"
              maxLength={40}
            />
            {isEditing && (
              <p className="text-[10px] text-slate-500 mt-1">Code can't be changed after creation</p>
            )}
          </div>
          <Input
            label="Display name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Welcome 10% off"
            maxLength={80}
          />
        </div>

        <Textarea
          label="Description (optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Internal description for admins"
          maxLength={280}
        />

        {/* Type picker */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Discount type</label>
          <div className="grid grid-cols-2 gap-2">
            {COUPON_TYPES.map((t) => {
              const Icon = t.icon as any;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`p-3 rounded-xl border text-left transition ${
                    type === t.id
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/15'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-slate-700" />
                    <p className="text-sm font-bold text-slate-900">{t.label}</p>
                  </div>
                  <p className="text-[11px] text-slate-500">{t.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Value + max discount */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            label={
              type === 'percentage' ? 'Percentage (1-100)' :
              type === 'fixed_amount' ? 'Amount (₱)' :
              type === 'bogo' ? 'Buy N (1 = BOGO)' :
              'Value'
            }
            value={value}
            onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))}
            min={1}
            max={type === 'percentage' ? 100 : undefined}
            required
          />
          {type === 'percentage' && (
            <Input
              type="number"
              label="Max discount cap (₱, 0 = none)"
              value={maxDiscount}
              onChange={(e) => setMaxDiscount(e.target.value === '' ? '' : Number(e.target.value))}
              min={0}
            />
          )}
        </div>

        {/* Constraints */}
        <div className="grid grid-cols-3 gap-3">
          <Input
            type="number"
            label="Min order (₱)"
            value={minOrderValue}
            onChange={(e) => setMinOrderValue(e.target.value === '' ? '' : Number(e.target.value))}
            min={0}
          />
          <Input
            type="number"
            label="Total uses (0=∞)"
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value === '' ? '' : Number(e.target.value))}
            min={0}
          />
          <Input
            type="number"
            label="Per customer (0=∞)"
            value={usageLimitPerCustomer}
            onChange={(e) => setUsageLimitPerCustomer(e.target.value === '' ? '' : Number(e.target.value))}
            min={0}
          />
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Valid from</label>
            <input
              type="datetime-local"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Valid until <span className="text-rose-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              required
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Flags */}
        <div className="space-y-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={excludeBulkOrders}
              onChange={(e) => setExcludeBulkOrders(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-slate-300"
            />
            <div>
              <p className="text-xs font-bold text-slate-900">Exclude bulk orders</p>
              <p className="text-[11px] text-slate-500">Don't apply to orders of 20+ units (they already get bulk pricing)</p>
            </div>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={firstTimeCustomerOnly}
              onChange={(e) => setFirstTimeCustomerOnly(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-slate-300"
            />
            <div>
              <p className="text-xs font-bold text-slate-900">First-time customers only</p>
              <p className="text-[11px] text-slate-500">Only customers with zero prior orders can use this code</p>
            </div>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-slate-300"
            />
            <div>
              <p className="text-xs font-bold text-slate-900">Active</p>
              <p className="text-[11px] text-slate-500">Customers can redeem this code right now</p>
            </div>
          </label>
        </div>

        {/* Category restrictions */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Restrict to categories (optional)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {['Apparel', 'Accessories', 'Drinkware', 'Stationery', 'Bags', 'Small Goods'].map((cat) => {
              const selected = applicableCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setApplicableCategories((prev) =>
                    prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                  )}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    selected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
          {applicableCategories.length === 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5">No restriction — applies to all products</p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5" /><span>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  );
}

// Helper: convert ISO/Date to local datetime-local input value
function toLocal(d: any) {
  const date = d instanceof Date ? d : new Date(d);
  const off = date.getTimezoneOffset();
  const local = new Date(date.getTime() - off * 60 * 1000);
  return local.toISOString().slice(0, 16);
}
