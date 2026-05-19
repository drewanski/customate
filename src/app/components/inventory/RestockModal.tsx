import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Button } from '../Button';
import {
  PackagePlus,
  Truck,
  Receipt,
  AlertCircle,
  ChevronDown,
  Plus,
  Calendar,
} from 'lucide-react';
import { getSuppliers, createSupplier, restockItem } from '../../api';
import { formatPeso } from '../../utils/format';

interface SupplierLite {
  _id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
}

interface RestockModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any | null;
  onSuccess: () => void;
}

/**
 * Restock modal — receives stock from a supplier and writes an audit-logged
 * movement. Supports both selecting a saved supplier from the directory and
 * entering a one-off ad-hoc supplier for the rare case of a new vendor.
 */
export function RestockModal({ isOpen, onClose, item, onSuccess }: RestockModalProps) {
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [supplierMode, setSupplierMode] = useState<'saved' | 'adhoc' | 'none'>('saved');
  const [supplierId, setSupplierId] = useState('');
  const [adhocName, setAdhocName] = useState('');
  const [adhocContact, setAdhocContact] = useState('');
  const [adhocPhone, setAdhocPhone] = useState('');

  const [quantity, setQuantity] = useState<number | ''>('');
  const [unitCost, setUnitCost] = useState<number | ''>('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');

  // Quick-add supplier sub-modal
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierContact, setNewSupplierContact] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the modal opens for a new item
  useEffect(() => {
    if (!isOpen) return;
    setQuantity('');
    setUnitCost('');
    setInvoiceNumber('');
    setBatchNumber('');
    setExpiryDate('');
    setNotes('');
    setSupplierMode('saved');
    setSupplierId('');
    setAdhocName('');
    setAdhocContact('');
    setAdhocPhone('');
    setError(null);
    setShowAddSupplier(false);

    (async () => {
      try {
        const list = await getSuppliers();
        setSuppliers(list);
        // Auto-select the most recently used supplier if available
        if (list.length > 0) {
          setSupplierId(list[0]._id);
        } else {
          setSupplierMode('adhoc');
        }
      } catch {
        setSupplierMode('adhoc');
      }
    })();
  }, [isOpen, item?._id]);

  const totalCost = useMemo(() => {
    const q = Number(quantity) || 0;
    const c = Number(unitCost) || 0;
    return q * c;
  }, [quantity, unitCost]);

  const currentStock = item?.stock ?? 0;
  const projected = currentStock + (Number(quantity) || 0);

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) return;
    setCreatingSupplier(true);
    try {
      const created = await createSupplier({
        name: newSupplierName.trim(),
        contactPerson: newSupplierContact,
        phone: newSupplierPhone,
      });
      const list = await getSuppliers();
      setSuppliers(list);
      setSupplierId(created._id);
      setSupplierMode('saved');
      setShowAddSupplier(false);
      setNewSupplierName('');
      setNewSupplierContact('');
      setNewSupplierPhone('');
    } catch (err: any) {
      alert(err.message || 'Failed to create supplier');
    } finally {
      setCreatingSupplier(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Quantity must be a positive number');
      return;
    }
    if (supplierMode === 'adhoc' && !adhocName.trim()) {
      setError('Supplier name is required (or pick "No supplier")');
      return;
    }

    setSubmitting(true);
    try {
      await restockItem({
        inventoryId: item._id,
        quantity: qty,
        supplierId: supplierMode === 'saved' ? supplierId : undefined,
        supplierAdHoc:
          supplierMode === 'adhoc'
            ? { name: adhocName, contactPerson: adhocContact, phone: adhocPhone }
            : undefined,
        unitCost: Number(unitCost) || 0,
        invoiceNumber: invoiceNumber.trim(),
        batchNumber: batchNumber.trim(),
        expiryDate: expiryDate || undefined,
        notes: notes.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record restock');
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Receive Stock"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            <PackagePlus className="w-4 h-4 mr-1.5" />
            Record Restock
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5 max-h-[70vh] overflow-y-auto px-1">
        {/* Item summary card */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
          {item.image ? (
            <img src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-white border border-emerald-200 flex items-center justify-center">
              <PackagePlus className="w-5 h-5 text-emerald-600" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900 truncate">{item.name}</p>
            <p className="text-xs font-mono text-slate-500">{item.sku}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Current</p>
            <p className="text-xl font-black text-slate-900">{currentStock}</p>
          </div>
        </div>

        {/* Supplier section */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
            <Truck className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            Supplier
          </label>
          <div className="flex gap-1 mb-2 p-1 rounded-full bg-slate-100 w-fit">
            {(['saved', 'adhoc', 'none'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSupplierMode(mode)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                  supplierMode === mode
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {mode === 'saved' && 'From directory'}
                {mode === 'adhoc' && 'One-off'}
                {mode === 'none' && 'No supplier'}
              </button>
            ))}
          </div>

          {supplierMode === 'saved' && (
            <div className="space-y-2">
              <div className="relative">
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-11 border border-slate-200 rounded-xl pl-3 pr-9 text-sm font-medium focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 appearance-none bg-white"
                >
                  {suppliers.length === 0 && <option value="">No suppliers — add one below</option>}
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                      {s.contactPerson ? ` — ${s.contactPerson}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={() => setShowAddSupplier((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-3 h-3" />
                {showAddSupplier ? 'Cancel adding supplier' : 'Add new supplier'}
              </button>
              {showAddSupplier && (
                <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2">
                  <Input
                    placeholder="Supplier name *"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Contact person"
                      value={newSupplierContact}
                      onChange={(e) => setNewSupplierContact(e.target.value)}
                    />
                    <Input
                      placeholder="Phone"
                      value={newSupplierPhone}
                      onChange={(e) => setNewSupplierPhone(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddSupplier}
                    loading={creatingSupplier}
                    disabled={!newSupplierName.trim()}
                  >
                    Save supplier
                  </Button>
                </div>
              )}
            </div>
          )}

          {supplierMode === 'adhoc' && (
            <div className="space-y-2">
              <Input
                placeholder="Supplier name *"
                value={adhocName}
                onChange={(e) => setAdhocName(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Contact person"
                  value={adhocContact}
                  onChange={(e) => setAdhocContact(e.target.value)}
                />
                <Input
                  placeholder="Phone"
                  value={adhocPhone}
                  onChange={(e) => setAdhocPhone(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                This supplier won't be saved for future restocks.
              </p>
            </div>
          )}

          {supplierMode === 'none' && (
            <p className="text-xs text-slate-500 italic">
              No supplier will be linked. Use this for internal transfers or unknown sources.
            </p>
          )}
        </div>

        {/* Quantity & cost row */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
            <Receipt className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            Quantity & Cost
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              label="Quantity received"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
              required
              placeholder="0"
            />
            <Input
              type="number"
              label="Unit cost (₱)"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Optional"
            />
          </div>
          {(Number(quantity) > 0 || Number(unitCost) > 0) && (
            <div className="mt-3 p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/60 font-bold">
                  Total cost
                </p>
                <p className="text-lg font-black">{formatPeso(totalCost)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-white/60 font-bold">
                  Stock after
                </p>
                <p className="text-lg font-black">
                  {currentStock} → <span className="text-emerald-300">{projected}</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Reference fields */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Invoice / PO #"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="INV-001"
          />
          <Input
            label="Batch / Lot #"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            <Calendar className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            Expiry date (optional)
          </label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full h-11 border border-slate-200 rounded-xl px-3 text-sm focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
          />
        </div>

        <Textarea
          label="Notes (optional)"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any context about this shipment…"
        />

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
