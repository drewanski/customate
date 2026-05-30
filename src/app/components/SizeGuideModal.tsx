import React from 'react';
import { X, Ruler } from 'lucide-react';

interface SizeOption {
  code: string;
  label?: string;
  chest?: string;
  length?: string;
  weight?: string;
  height?: string;
  priceModifier?: number;
}

interface SizeGuideModalProps {
  open: boolean;
  onClose: () => void;
  sizes: SizeOption[];
  productName?: string;
}

/**
 * Body-measurement guide modal (panel revision #1).
 *
 * Shows a sortable size chart with chest/length/weight/height per size so
 * the customer can confidently pick the right fit instead of guessing.
 * Falls back to a default reference table when the product has no sizes
 * configured yet.
 */
const FALLBACK_SIZES: SizeOption[] = [
  { code: 'S',   label: 'Small',         chest: '36-38 in', length: '27 in', weight: '50-60 kg',  height: "5'0\"-5'4\"" },
  { code: 'M',   label: 'Medium',        chest: '38-40 in', length: '28 in', weight: '60-70 kg',  height: "5'4\"-5'8\"" },
  { code: 'L',   label: 'Large',         chest: '40-42 in', length: '29 in', weight: '70-80 kg',  height: "5'8\"-5'10\"" },
  { code: 'XL',  label: 'Extra Large',   chest: '42-44 in', length: '30 in', weight: '80-90 kg',  height: "5'10\"-6'0\"" },
  { code: 'XXL', label: 'Double XL',     chest: '44-46 in', length: '31 in', weight: '90-100 kg', height: "6'0\"+" },
];

export function SizeGuideModal({ open, onClose, sizes, productName }: SizeGuideModalProps) {
  if (!open) return null;
  const rows = sizes && sizes.length > 0 ? sizes : FALLBACK_SIZES;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Ruler className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Body measurement guide</h3>
              <p className="text-xs text-slate-500">{productName || 'Pick the right fit'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-500 flex items-center justify-center"
            aria-label="Close size guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-slate-600 mb-4">
            Use the chart below to find the size that matches your chest measurement, height, and weight.
            Measurements are approximate — if you're between sizes, we recommend going one size up for a relaxed fit.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left font-bold">Size</th>
                  <th className="px-4 py-3 text-left font-bold">Chest</th>
                  <th className="px-4 py-3 text-left font-bold">Length</th>
                  <th className="px-4 py-3 text-left font-bold">Weight</th>
                  <th className="px-4 py-3 text-left font-bold">Height</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr
                    key={s.code}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}
                  >
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {s.code}
                      {s.label && <span className="block text-[11px] font-normal text-slate-500">{s.label}</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{s.chest || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{s.length || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{s.weight || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{s.height || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Tip: measure your chest at the widest point with arms relaxed at the side. For an oversized fit, go two sizes up.
          </p>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default SizeGuideModal;
