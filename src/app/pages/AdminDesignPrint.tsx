import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Printer, ChevronLeft, Image as ImageIcon, Sparkles } from 'lucide-react';
import { apiRequest } from '../api';
import { formatPeso } from '../utils/format';

/**
 * AdminDesignPrint — production-floor design sheet.
 *
 * One row per customized line item. Each row has the snapshot image at large
 * size + all design specs (size, color, placement, font, text, etc) for the
 * print operator to reproduce.
 *
 * Designed for paper printing: `@media print` strips chrome and ensures each
 * design fits on one page without breaks inside an item.
 */
export function AdminDesignPrint() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    apiRequest(`/orders/${orderId}`)
      .then((o) => setOrder(o))
      .catch((err) => console.error('Load order error', err))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading design sheet…</p>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Order not found.</p>
      </div>
    );
  }

  const customItems = (order.items || []).filter(
    (it: any) => it.customization?.isCustomized || it.customization?.previewImage,
  );

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm print:hidden">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            to={`/admin/orders/${orderId}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to order
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800"
          >
            <Printer className="w-4 h-4" />
            Print design sheet
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 print:p-0 print:max-w-none">
        {/* Header — printed only once */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 print:border-0 print:p-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Production Design Sheet
              </p>
              <h1 className="text-2xl font-black text-slate-900 mt-1">
                Order #{String(order.id).slice(-6).toUpperCase()}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {order.customerName} · {order.customerEmail}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Placed
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {new Date(order.createdAt).toLocaleString()}
              </p>
              {order.requestedDeliveryDate && (
                <>
                  <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mt-2">
                    Due
                  </p>
                  <p className="text-sm font-bold text-rose-700">
                    {new Date(order.requestedDeliveryDate).toLocaleDateString()}
                  </p>
                </>
              )}
            </div>
          </div>
          {order.urgencyTier && order.urgencyTier !== 'standard' && (
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-black uppercase tracking-wider">
              {order.urgencyTier} priority
            </div>
          )}
        </div>

        {customItems.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
            <ImageIcon className="w-10 h-10 text-amber-400 mx-auto mb-2" />
            <p className="font-bold text-amber-900">
              No customized items in this order
            </p>
            <p className="text-sm text-amber-700 mt-1">
              All items are standard / non-customized. No design sheet needed.
            </p>
          </div>
        ) : (
          customItems.map((it: any, idx: number) => {
            const c = it.customization || {};
            const dc = c.designConfig || {};
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 print:break-after-page print:border-0 print:p-2 print:mb-0"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Preview image */}
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 flex items-center justify-center">
                    {c.previewImage ? (
                      <img
                        src={c.previewImage}
                        alt="Design preview"
                        className="max-w-full max-h-[480px] object-contain"
                      />
                    ) : (
                      <div className="text-center text-slate-400 py-12">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2" />
                        <p className="text-sm">No preview captured</p>
                      </div>
                    )}
                  </div>

                  {/* Specs */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      <span className="text-[10px] uppercase tracking-wider font-bold text-blue-600">
                        Custom item
                      </span>
                    </div>
                    <h2 className="text-xl font-black text-slate-900">{it.name}</h2>
                    <p className="text-xs font-mono text-slate-500 uppercase tracking-tight mt-0.5">
                      {it.sku} · Qty {it.quantity}
                    </p>

                    <div className="mt-4 divide-y divide-slate-100">
                      {[
                        ['Size', c.size],
                        ['Product color', dc.baseColor || c.color],
                        ['Print placement', c.placement],
                        ['Text', c.text],
                        ['Font', c.font],
                        ['Text color', c.color],
                      ]
                        .filter(([, v]) => v && String(v).trim())
                        .map(([k, v]) => (
                          <div key={k} className="py-2 flex items-start gap-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 w-28 flex-shrink-0 mt-0.5">
                              {k}
                            </p>
                            <p className="text-sm font-bold text-slate-900 break-words flex-1">
                              {String(v)}
                            </p>
                          </div>
                        ))}
                    </div>

                    {/* Decals / design elements summary */}
                    {Array.isArray(dc.designElements) && dc.designElements.length > 0 && (
                      <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                          Design elements ({dc.designElements.length})
                        </p>
                        <ul className="text-[11px] text-slate-700 space-y-0.5">
                          {dc.designElements.slice(0, 6).map((el: any, i: number) => (
                            <li key={i} className="flex justify-between">
                              <span className="font-semibold capitalize">
                                {el.kind || el.type || 'element'}
                              </span>
                              <span className="text-slate-500 truncate ml-2 max-w-[60%]">
                                {el.content || el.text || el.surface || ''}
                              </span>
                            </li>
                          ))}
                          {dc.designElements.length > 6 && (
                            <li className="text-[10px] text-slate-400 italic">
                              +{dc.designElements.length - 6} more…
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    <p className="text-[10px] text-slate-400 mt-3">
                      Unit price: {formatPeso(it.unitPrice)} · Line total:{' '}
                      {formatPeso(it.unitPrice * it.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Print footer */}
        <div className="text-center text-[10px] text-slate-400 mt-2 print:mt-0">
          CustoMate · Production design sheet · printed {new Date().toLocaleString()}
        </div>
      </div>

      {/* Print-specific tweaks */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
