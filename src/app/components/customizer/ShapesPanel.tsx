import React, { useState } from 'react';
import { shapeToDataUrl, ShapeKind } from '../../utils/shapeGenerator';

interface Props {
  /** Called when the user clicks a shape — passes back the PNG dataURL. */
  onApply: (dataUrl: string) => void;
  /** Currently-selected color from the parent so the shapes match design. */
  initialColor?: string;
}

const SHAPES: { kind: ShapeKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'circle',    label: 'Circle',    icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><circle cx="12" cy="12" r="9" /></svg> },
  { kind: 'square',    label: 'Square',    icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><rect x="3" y="3" width="18" height="18" /></svg> },
  { kind: 'rounded',   label: 'Rounded',   icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="4" /></svg> },
  { kind: 'triangle',  label: 'Triangle',  icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><polygon points="12,3 22,21 2,21" /></svg> },
  { kind: 'diamond',   label: 'Diamond',   icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><polygon points="12,2 22,12 12,22 2,12" /></svg> },
  { kind: 'hexagon',   label: 'Hexagon',   icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><polygon points="6,3 18,3 22,12 18,21 6,21 2,12" /></svg> },
  { kind: 'pentagon',  label: 'Pentagon',  icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><polygon points="12,2 22,9 18,22 6,22 2,9" /></svg> },
  { kind: 'star',      label: 'Star',      icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><polygon points="12,2 14.6,9 22,9.5 16.3,14.2 18.2,21.4 12,17.3 5.8,21.4 7.7,14.2 2,9.5 9.4,9" /></svg> },
  { kind: 'heart',     label: 'Heart',     icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M12 21s-7-4.5-9.3-9.1C1 8.6 3.2 5 6.6 5c1.9 0 3.5 1 4.4 2.5C12 6 13.6 5 15.4 5c3.4 0 5.6 3.6 4 6.9C19 16.5 12 21 12 21z" /></svg> },
  { kind: 'arrow',     label: 'Arrow',     icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><polygon points="2,9 14,9 14,5 22,12 14,19 14,15 2,15" /></svg> },
  { kind: 'cross',     label: 'Plus',      icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><polygon points="9,3 15,3 15,9 21,9 21,15 15,15 15,21 9,21 9,15 3,15 3,9 9,9" /></svg> },
  { kind: 'lightning', label: 'Bolt',      icon: <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><polygon points="14,2 4,14 11,14 9,22 20,10 13,10" /></svg> },
];

/**
 * Quick-add shape library. Every shape is dynamically rendered to a PNG at
 * click-time using the current colour — no static assets, no extra network
 * roundtrips. Output flows into the customizer like a regular image upload
 * so all existing tools (position/scale/rotation/flip/refiner) work on shapes.
 */
export function ShapesPanel({ onApply, initialColor = '#1e293b' }: Props) {
  const [color, setColor] = useState(initialColor);

  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
          Quick Shapes
        </h3>
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-7 h-7 rounded-md border border-slate-200 cursor-pointer"
            title="Shape color"
          />
          <span className="text-[10px] font-mono text-slate-500 uppercase">{color}</span>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {SHAPES.map((s) => (
          <button
            key={s.kind}
            onClick={() => onApply(shapeToDataUrl(s.kind, color))}
            className="aspect-square flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 hover:scale-105 active:scale-95 transition-all"
            title={s.label}
            aria-label={`Add ${s.label}`}
          >
            {s.icon}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-500 leading-snug">
        Click a shape to add it to your design. Resize, rotate, recolor in the Refine tool.
      </p>
    </div>
  );
}
