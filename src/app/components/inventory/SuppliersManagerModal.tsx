import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Button } from '../Button';
import {
  Truck,
  Plus,
  Edit2,
  Archive,
  Mail,
  Phone,
  Building2,
  TrendingUp,
  Receipt,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../api';
import { formatPeso } from '../../utils/format';

interface Supplier {
  _id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  notes?: string;
  isActive: boolean;
  totalRestocked?: number;
  totalSpent?: number;
  movements?: number;
  lastRestock?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

const empty: Partial<Supplier> = {
  name: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  notes: '',
};

export function SuppliersManagerModal({ isOpen, onClose, onChanged }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>(empty);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await getSuppliers({ includeInactive: showArchived });
      setSuppliers(list);
    } catch (err) {
      console.error('Failed to load suppliers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    refresh();
  }, [isOpen, showArchived]);

  const beginEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name,
      contactPerson: s.contactPerson || '',
      email: s.email || '',
      phone: s.phone || '',
      address: s.address || '',
      website: s.website || '',
      notes: s.notes || '',
    });
    setShowForm(true);
    setError(null);
  };

  const beginAdd = () => {
    setEditing(null);
    setForm(empty);
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name?.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await updateSupplier(editing._id, form);
      } else {
        await createSupplier(form);
      }
      setShowForm(false);
      setEditing(null);
      await refresh();
      onChanged?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save supplier');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async (s: Supplier) => {
    if (!confirm(`Archive supplier "${s.name}"? Past restocks will remain in history.`)) return;
    try {
      await deleteSupplier(s._id);
      await refresh();
      onChanged?.();
    } catch (err: any) {
      alert(err.message || 'Failed to archive supplier');
    }
  };

  const handleRestore = async (s: Supplier) => {
    try {
      await updateSupplier(s._id, { isActive: true });
      await refresh();
      onChanged?.();
    } catch (err: any) {
      alert(err.message || 'Failed to restore supplier');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Suppliers Directory">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600"
              />
              Show archived
            </label>
          </div>
          {!showForm && (
            <Button onClick={beginAdd} size="sm">
              <Plus className="w-3.5 h-3.5 mr-1" />
              New Supplier
            </Button>
          )}
        </div>

        {/* Edit / Add form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="p-4 rounded-2xl border-2 border-blue-200 bg-blue-50/40 space-y-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-4 h-4 text-blue-600" />
              <h3 className="font-bold text-slate-900">
                {editing ? `Edit ${editing.name}` : 'New supplier'}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Supplier name *"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                label="Contact person"
                value={form.contactPerson || ''}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Email"
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                label="Phone"
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <Input
              label="Address"
              value={form.address || ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
            <Input
              label="Website"
              value={form.website || ''}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://…"
            />
            <Textarea
              label="Notes"
              rows={2}
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            {error && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" type="submit" loading={submitting}>
                {editing ? 'Save changes' : 'Create supplier'}
              </Button>
            </div>
          </form>
        )}

        {/* List */}
        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3">
              <Truck className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">No suppliers yet</p>
            <p className="text-xs text-slate-500 mt-1">Add your first supplier to start tracking restocks.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {suppliers.map((s) => (
              <div
                key={s._id}
                className={`p-4 rounded-2xl border bg-white ${
                  s.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white flex-shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 truncate">{s.name}</p>
                        {!s.isActive && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                            Archived
                          </span>
                        )}
                      </div>
                      {s.contactPerson && (
                        <p className="text-xs text-slate-600">{s.contactPerson}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                        {s.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {s.phone}
                          </span>
                        )}
                        {s.email && (
                          <span className="inline-flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {s.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => beginEdit(s)}
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {s.isActive ? (
                      <button
                        onClick={() => handleArchive(s)}
                        className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50"
                        title="Archive"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRestore(s)}
                        className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"
                        title="Restore"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {(s.movements ?? 0) > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Units
                      </p>
                      <p className="text-sm font-bold text-slate-900">
                        {(s.totalRestocked || 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
                        <Receipt className="w-3 h-3" /> Spent
                      </p>
                      <p className="text-sm font-bold text-slate-900">{formatPeso(s.totalSpent || 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Last restock
                      </p>
                      <p className="text-sm font-bold text-slate-900">
                        {s.lastRestock ? new Date(s.lastRestock).toLocaleDateString() : '—'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
