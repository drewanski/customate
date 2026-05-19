import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import {
  PackagePlus,
  ShoppingBag,
  Wrench,
  Undo2,
  AlertTriangle,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Receipt,
  Clock,
  User as UserIcon,
  Truck,
} from 'lucide-react';
import { getStockMovements, getMovementSummary } from '../../api';
import { formatPeso } from '../../utils/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item: any | null;
}

interface Movement {
  _id: string;
  type: string;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  supplierSnapshot?: { name?: string; contactPerson?: string; phone?: string };
  supplier?: { name?: string };
  unitCost?: number;
  totalCost?: number;
  invoiceNumber?: string;
  batchNumber?: string;
  reason?: string;
  notes?: string;
  performedByName?: string;
  createdAt: string;
}

const TYPE_META: Record<string, { label: string; tint: string; bg: string; icon: any; sign: '+' | '-' | '±' }> = {
  restock: {
    label: 'Restock',
    tint: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200',
    icon: PackagePlus,
    sign: '+',
  },
  sale: {
    label: 'Sale',
    tint: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    icon: ShoppingBag,
    sign: '-',
  },
  adjustment: {
    label: 'Adjustment',
    tint: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: Wrench,
    sign: '±',
  },
  return: {
    label: 'Return',
    tint: 'text-indigo-700',
    bg: 'bg-indigo-50 border-indigo-200',
    icon: Undo2,
    sign: '+',
  },
  damage: {
    label: 'Damage / Loss',
    tint: 'text-rose-700',
    bg: 'bg-rose-50 border-rose-200',
    icon: AlertTriangle,
    sign: '-',
  },
  reservation: {
    label: 'Reservation',
    tint: 'text-purple-700',
    bg: 'bg-purple-50 border-purple-200',
    icon: Clock,
    sign: '±',
  },
  release: {
    label: 'Release',
    tint: 'text-slate-700',
    bg: 'bg-slate-100 border-slate-200',
    icon: Undo2,
    sign: '±',
  },
  initial: {
    label: 'Initial Stock',
    tint: 'text-teal-700',
    bg: 'bg-teal-50 border-teal-200',
    icon: Sparkles,
    sign: '+',
  },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function StockHistoryModal({ isOpen, onClose, item }: Props) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!isOpen || !item) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [list, summaryData] = await Promise.all([
          getStockMovements({ inventoryId: item._id, limit: 100 }),
          getMovementSummary(item._id),
        ]);
        if (!cancelled) {
          setMovements(list.items || []);
          setSummary(summaryData);
        }
      } catch (err) {
        console.error('Failed to load stock history', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, item?._id]);

  const filtered =
    filter === 'all' ? movements : movements.filter((m) => m.type === filter);

  const filterOptions: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'restock', label: 'Restocks' },
    { id: 'sale', label: 'Sales' },
    { id: 'adjustment', label: 'Adjustments' },
    { id: 'damage', label: 'Damage' },
    { id: 'return', label: 'Returns' },
  ];

  if (!item) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stock History">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
        {/* Item header */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200">
          {item.image ? (
            <img src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-slate-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate">{item.name}</p>
            <p className="text-xs font-mono text-slate-500">{item.sku}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">In Stock</p>
            <p className="text-xl font-black text-slate-900">{item.stock}</p>
          </div>
        </div>

        {/* Summary tiles */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <SummaryTile
              icon={TrendingUp}
              label="Restocked"
              value={summary.totalRestocked}
              tint="from-emerald-500 to-teal-500"
            />
            <SummaryTile
              icon={ShoppingBag}
              label="Sold"
              value={summary.totalSold}
              tint="from-blue-500 to-indigo-500"
            />
            <SummaryTile
              icon={AlertTriangle}
              label="Damaged"
              value={summary.totalDamaged}
              tint="from-rose-500 to-orange-500"
            />
            <SummaryTile
              icon={Receipt}
              label="Total Spent"
              value={formatPeso(summary.totalSpent)}
              tint="from-purple-500 to-pink-500"
              isMoney
            />
          </div>
        )}

        {/* Filter chips */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setFilter(opt.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                filter === opt.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3">
              <Clock className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-700">No movements yet</p>
            <p className="text-xs text-slate-500 mt-1">
              {filter === 'all' ? 'Restock this item to start the audit trail.' : 'Try a different filter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => {
              const meta = TYPE_META[m.type] || TYPE_META.adjustment;
              const Icon = meta.icon;
              const displaySign = m.quantity > 0 ? '+' : m.quantity < 0 ? '−' : '±';
              return (
                <div
                  key={m._id}
                  className={`rounded-xl border ${meta.bg} p-3 flex items-start gap-3`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 ${meta.tint}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold text-sm ${meta.tint}`}>{meta.label}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-slate-500">{timeAgo(m.createdAt)}</span>
                      {m.invoiceNumber && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                          {m.invoiceNumber}
                        </span>
                      )}
                      {m.batchNumber && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                          Batch {m.batchNumber}
                        </span>
                      )}
                    </div>

                    {(m.supplierSnapshot?.name || m.supplier?.name) && (
                      <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                        <Truck className="w-3 h-3" />
                        <span className="font-medium">
                          {m.supplier?.name || m.supplierSnapshot?.name}
                        </span>
                        {m.supplierSnapshot?.contactPerson && (
                          <span className="text-slate-400">— {m.supplierSnapshot.contactPerson}</span>
                        )}
                      </p>
                    )}

                    {(m.reason || m.notes) && (
                      <p className="text-xs text-slate-700 mt-1 italic">
                        {m.reason && <span className="font-semibold not-italic">{m.reason}: </span>}
                        {m.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500">
                      <UserIcon className="w-3 h-3" />
                      <span>{m.performedByName || 'System'}</span>
                      {m.totalCost ? (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-slate-700">
                            {formatPeso(m.totalCost)}
                          </span>
                          {m.unitCost ? <span>@ {formatPeso(m.unitCost)}/unit</span> : null}
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className={`text-lg font-black ${meta.tint}`}>
                      {displaySign}
                      {Math.abs(m.quantity)}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {m.balanceBefore} → <span className="font-bold">{m.balanceAfter}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tint,
  isMoney,
}: {
  icon: any;
  label: string;
  value: number | string;
  tint: string;
  isMoney?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${tint} flex items-center justify-center mb-1.5`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</p>
      <p className="text-lg font-black text-slate-900">
        {isMoney ? value : Number(value).toLocaleString()}
      </p>
    </div>
  );
}
