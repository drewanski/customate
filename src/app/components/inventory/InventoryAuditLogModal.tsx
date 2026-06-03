import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Modal';
import {
  PackagePlus,
  ShoppingBag,
  Wrench,
  Undo2,
  AlertTriangle,
  Sparkles,
  Receipt,
  Clock,
  User as UserIcon,
  ScrollText,
  Download,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { getStockMovements } from '../../api';
import { generateSimpleReport } from '../../utils/pdfExport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface Movement {
  _id: string;
  inventorySku?: string;
  inventoryName?: string;
  type: string;
  quantity: number;
  reservationDelta?: number;
  balanceBefore: number;
  balanceAfter: number;
  unitCost?: number;
  totalCost?: number;
  reason?: string;
  notes?: string;
  performedByName?: string;
  performedByRole?: string;
  relatedOrder?: string;
  createdAt: string;
}

const TYPE_META: Record<string, { label: string; tint: string; bg: string; icon: any; sign: '+' | '-' | '±' }> = {
  initial:    { label: 'Initial',    tint: 'text-slate-700',   bg: 'bg-slate-50 border-slate-200',     icon: Sparkles,       sign: '+' },
  restock:    { label: 'Restock',    tint: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: PackagePlus,    sign: '+' },
  sale:       { label: 'Sale',       tint: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       icon: ShoppingBag,    sign: '-' },
  adjustment: { label: 'Adjustment', tint: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: Wrench,         sign: '±' },
  return:     { label: 'Return',     tint: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',   icon: Undo2,          sign: '+' },
  damage:     { label: 'Damage',     tint: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',       icon: AlertTriangle,  sign: '-' },
  reserve:    { label: 'Reserve',    tint: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',   icon: Clock,          sign: '±' },
  release:    { label: 'Release',    tint: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',       icon: RotateCcw,      sign: '±' },
};

const TYPE_OPTIONS = ['all', 'restock', 'sale', 'adjustment', 'return', 'damage', 'reserve', 'release'];

/**
 * Global, cross-SKU audit log of every stock movement in the system. Used by
 * admins to see the full ledger — who did what, when, and why — in a single
 * view that can be filtered by movement type or date range and exported as CSV.
 */
export function InventoryAuditLogModal({ isOpen, onClose }: Props) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, filterType, filterFrom, filterTo]);

  const load = async () => {
    setLoading(true);
    try {
      const data: any = await getStockMovements({
        type: filterType !== 'all' ? filterType : undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
        limit: 500,
      });
      setMovements(Array.isArray(data) ? data : data?.movements || data?.items || []);
    } catch (err) {
      console.error('Audit log load failed', err);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const s = { total: movements.length, in: 0, out: 0, byType: {} as Record<string, number> };
    for (const m of movements) {
      if (m.quantity > 0) s.in += m.quantity;
      else if (m.quantity < 0) s.out += Math.abs(m.quantity);
      s.byType[m.type] = (s.byType[m.type] || 0) + 1;
    }
    return s;
  }, [movements]);

  const handleExportCsv = () => {
    const header = ['When', 'SKU', 'Item', 'Type', 'Qty', 'Before', 'After', 'Reason/Notes', 'By', 'Role', 'Order'];
    const rows = movements.map((m) => [
      new Date(m.createdAt).toISOString(),
      m.inventorySku || '',
      (m.inventoryName || '').replace(/"/g, '""'),
      m.type,
      String(m.quantity),
      String(m.balanceBefore),
      String(m.balanceAfter),
      `"${(m.reason || m.notes || '').replace(/"/g, '""')}"`,
      m.performedByName || '',
      m.performedByRole || '',
      m.relatedOrder ? String(m.relatedOrder).slice(-6) : '',
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setFilterType('all');
    setFilterFrom('');
    setFilterTo('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Inventory Audit Log"
      size="xl"
    >
      <div className="space-y-4 max-h-[80vh] overflow-y-auto">
        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-gradient-to-br from-slate-50 to-white border border-slate-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Movements</p>
            <p className="text-xl font-black text-slate-900">{stats.total}</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Stock IN</p>
            <p className="text-xl font-black text-emerald-700">+{stats.in}</p>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-rose-50 to-white border border-rose-200 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Stock OUT</p>
            <p className="text-xl font-black text-rose-700">-{stats.out}</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600">
            <Filter className="w-3 h-3" /> Filters
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white font-bold"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t === 'all' ? 'All movement types' : TYPE_META[t]?.label || t}</option>
              ))}
            </select>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              placeholder="From"
            />
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
              placeholder="To"
            />
            <div className="flex gap-1.5">
              <button
                onClick={resetFilters}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
              <button
                onClick={handleExportCsv}
                disabled={!movements.length}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="w-3 h-3" /> CSV
              </button>
              <button
                onClick={async () => {
                  const body = movements.map((m) => [
                    new Date(m.createdAt).toLocaleString(),
                    m.inventorySku || '—',
                    m.inventoryName || '—',
                    (TYPE_META[m.type]?.label || m.type).toUpperCase(),
                    `${TYPE_META[m.type]?.sign || ''}${m.quantity}`,
                    String(m.balanceAfter),
                    m.performedByName || '—',
                    m.reason || m.notes || '—',
                  ]);
                  await generateSimpleReport({
                    title: 'Inventory Audit Log',
                    subtitle: `Full ledger · ${movements.length} movements`,
                    tables: [{
                      head: ['When', 'SKU', 'Item', 'Type', 'Qty', 'Balance', 'By', 'Reason'],
                      body,
                    }],
                    filename: 'bryle-closet-audit-log',
                  });
                }}
                disabled={!movements.length}
                className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                title="Open the print dialog → save as PDF"
              >
                <Download className="w-3 h-3" /> PDF
              </button>
            </div>
          </div>
        </div>

        {/* Ledger list */}
        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Loading audit log…</div>
        ) : !movements.length ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No movements match your filters.
          </div>
        ) : (
          <ul className="space-y-2">
            {movements.map((m) => {
              const meta = TYPE_META[m.type] || { label: m.type, tint: 'text-slate-700', bg: 'bg-slate-50 border-slate-200', icon: Receipt, sign: '±' };
              const Icon = meta.icon;
              return (
                <li
                  key={m._id}
                  className={`flex gap-3 items-start p-3 rounded-xl border ${meta.bg}`}
                >
                  <div className={`w-9 h-9 rounded-lg bg-white border ${meta.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${meta.tint}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.tint} bg-white border ${meta.bg}`}>
                          {meta.label}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {m.inventoryName || m.inventorySku || 'Unknown item'}
                        </span>
                        {m.inventorySku && (
                          <span className="text-[10px] font-mono text-slate-500">{m.inventorySku}</span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black ${meta.tint}`}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </p>
                        <p className="text-[10px] text-slate-500 font-semibold">
                          {m.balanceBefore} → {m.balanceAfter}
                        </p>
                      </div>
                    </div>
                    {(m.reason || m.notes) && (
                      <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                        {m.reason || m.notes}
                      </p>
                    )}
                    <div className="flex items-center gap-2.5 mt-1.5 text-[10px] text-slate-500 flex-wrap">
                      <span className="inline-flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                      {m.performedByName && (
                        <span className="inline-flex items-center gap-0.5">
                          <UserIcon className="w-3 h-3" />
                          {m.performedByName}
                          {m.performedByRole && <span className="text-slate-400"> ({m.performedByRole})</span>}
                        </span>
                      )}
                      {m.relatedOrder && (
                        <span className="inline-flex items-center gap-0.5 font-mono">
                          Order #{String(m.relatedOrder).slice(-6)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
