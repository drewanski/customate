import React, { useState } from 'react';
import { X, Ruler, User, Scale, Move3D, Sparkles } from 'lucide-react';

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
  selectedCode?: string;
}

const FALLBACK_SIZES: SizeOption[] = [
  { code: 'S',   label: 'Small',         chest: '36-38 in', length: '27 in', weight: '50-60 kg',  height: "5'0\"-5'4\"" },
  { code: 'M',   label: 'Medium',        chest: '38-40 in', length: '28 in', weight: '60-70 kg',  height: "5'4\"-5'8\"" },
  { code: 'L',   label: 'Large',         chest: '40-42 in', length: '29 in', weight: '70-80 kg',  height: "5'8\"-5'10\"" },
  { code: 'XL',  label: 'Extra Large',   chest: '42-44 in', length: '30 in', weight: '80-90 kg',  height: "5'10\"-6'0\"" },
  { code: 'XXL', label: 'Double XL',     chest: '44-46 in', length: '31 in', weight: '90-100 kg', height: "6'0\"+" },
];

export function SizeGuideModal({ open, onClose, sizes, productName, selectedCode }: SizeGuideModalProps) {
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  if (!open) return null;
  const rows = sizes && sizes.length > 0 ? sizes : FALLBACK_SIZES;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero header */}
        <div className="relative px-5 py-4 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
          <div className="absolute -top-12 -right-10 w-32 h-32 rounded-full bg-purple-400/40 blur-2xl pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Ruler className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                  <Sparkles className="w-2.5 h-2.5" /> Body measurement guide
                </div>
                <p className="text-sm font-bold truncate">{productName || 'Pick the right fit'}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors shrink-0"
              aria-label="Close size guide"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5">
          <p className="text-sm text-slate-600 mb-4">
            Find the size that matches your chest measurement, height, and weight.
            If you're between sizes, go one up for a relaxed fit or two up for an oversized look.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gradient-to-br from-slate-50 to-blue-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left font-bold uppercase text-xs tracking-wider">Size</th>
                  <th className="px-4 py-3 text-left font-bold uppercase text-xs tracking-wider">
                    <span className="inline-flex items-center gap-1.5"><Move3D className="w-3.5 h-3.5 text-blue-500" /> Chest</span>
                  </th>
                  <th className="px-4 py-3 text-left font-bold uppercase text-xs tracking-wider">
                    <span className="inline-flex items-center gap-1.5"><Ruler className="w-3.5 h-3.5 text-blue-500" /> Length</span>
                  </th>
                  <th className="px-4 py-3 text-left font-bold uppercase text-xs tracking-wider">
                    <span className="inline-flex items-center gap-1.5"><Scale className="w-3.5 h-3.5 text-blue-500" /> Weight</span>
                  </th>
                  <th className="px-4 py-3 text-left font-bold uppercase text-xs tracking-wider">
                    <span className="inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-blue-500" /> Height</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const isSelected = selectedCode && s.code === selectedCode;
                  const isHovered = hoverRow === s.code;
                  return (
                    <tr
                      key={s.code}
                      onMouseEnter={() => setHoverRow(s.code)}
                      onMouseLeave={() => setHoverRow(null)}
                      className={`transition-colors border-t border-slate-100 ${
                        isSelected
                          ? 'bg-blue-50/80'
                          : isHovered
                          ? 'bg-slate-50'
                          : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl text-sm font-black ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                            {s.code}
                          </span>
                          {s.label && <span className="text-xs font-bold text-slate-600">{s.label}</span>}
                          {isSelected && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-700 border border-emerald-200">
                              You picked this
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{s.chest || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{s.length || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{s.weight || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{s.height || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <span aria-hidden className="text-base leading-none">💡</span>
            <p>
              <span className="font-bold">Tip:</span> measure your chest at the widest point with arms relaxed at the side.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-md shadow-blue-200 hover:shadow-lg transition-all"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default SizeGuideModal;
