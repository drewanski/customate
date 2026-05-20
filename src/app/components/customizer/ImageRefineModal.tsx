import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import {
  Eraser,
  Crop as CropIcon,
  Sparkles,
  RotateCcw,
  Wand2,
  Check,
  Eye,
  ImageIcon,
  Sliders,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  imageDataUrl: string;
  onApply: (newDataUrl: string) => void;
}

interface CropBounds {
  top: number;    // 0..100
  right: number;  // 0..100
  bottom: number; // 0..100
  left: number;   // 0..100
}

/**
 * In-browser image refinement studio.
 *
 * Three operations the customer can chain before the artwork lands on the
 * product:
 *   1. Background removal — flood-fill chroma-key from the four corners
 *      using a tolerance slider, then alpha-zero matching pixels.
 *   2. Crop — adjustable bounds (top/right/bottom/left percentages) to
 *      tighten the artwork to its subject.
 *   3. Edge feather — gaussian-ish blur on the alpha channel only, so
 *      hard pixel edges from removal become a clean fade.
 *
 * Every adjustment re-renders into the preview canvas in real time. On
 * Apply we re-export to PNG (preserving transparency) and replace the
 * customization.image data-URL on the parent.
 */
export function ImageRefineModal({ isOpen, onClose, imageDataUrl, onApply }: Props) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

  // Tool settings
  const [bgRemoveEnabled, setBgRemoveEnabled] = useState(false);
  const [bgTolerance, setBgTolerance] = useState(32);   // 0..120 — color match radius
  const [bgSoftness, setBgSoftness] = useState(8);      // antialias edge band
  const [crop, setCrop] = useState<CropBounds>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [feather, setFeather] = useState(0);            // 0..6 pixels
  const [contrast, setContrast] = useState(100);        // 50..200%
  const [saturation, setSaturation] = useState(100);    // 0..200%
  const [showCheckerboard, setShowCheckerboard] = useState(true);

  // Load source image into a hidden canvas whenever the modal opens or src changes
  useEffect(() => {
    if (!isOpen || !imageDataUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImgEl(img);
    img.src = imageDataUrl;
  }, [isOpen, imageDataUrl]);

  // Re-render preview whenever any setting changes
  useEffect(() => {
    if (!imgEl || !previewRef.current || !sourceRef.current) return;
    const t = setTimeout(() => renderPreview(), 30); // tiny debounce for slider drag
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgEl, bgRemoveEnabled, bgTolerance, bgSoftness, crop, feather, contrast, saturation]);

  const renderPreview = () => {
    const img = imgEl;
    const preview = previewRef.current;
    const source = sourceRef.current;
    if (!img || !preview || !source) return;

    // 1) Draw the original to the source canvas at full resolution.
    source.width = img.naturalWidth;
    source.height = img.naturalHeight;
    const sctx = source.getContext('2d');
    if (!sctx) return;
    sctx.clearRect(0, 0, source.width, source.height);
    sctx.filter = `contrast(${contrast}%) saturate(${saturation}%)`;
    sctx.drawImage(img, 0, 0);
    sctx.filter = 'none';

    // 2) Get pixel buffer for in-place editing.
    const imgData = sctx.getImageData(0, 0, source.width, source.height);
    const { data, width, height } = imgData;

    // 3) Background removal — sample the four corners, build an average
    //    background color, then alpha-zero pixels within tolerance.
    if (bgRemoveEnabled) {
      const samples = [
        sampleCorner(data, width, height, 0, 0),
        sampleCorner(data, width, height, width - 1, 0),
        sampleCorner(data, width, height, 0, height - 1),
        sampleCorner(data, width, height, width - 1, height - 1),
      ];
      const bg = avgColor(samples);
      const tol2 = bgTolerance * bgTolerance;
      const softBand2 = (bgTolerance + bgSoftness) * (bgTolerance + bgSoftness);
      for (let i = 0; i < data.length; i += 4) {
        const dr = data[i] - bg.r;
        const dg = data[i + 1] - bg.g;
        const db = data[i + 2] - bg.b;
        const dist2 = dr * dr + dg * dg + db * db;
        if (dist2 <= tol2) {
          data[i + 3] = 0;
        } else if (dist2 < softBand2) {
          // Soft edge — partial transparency
          const fade = (dist2 - tol2) / (softBand2 - tol2);
          data[i + 3] = Math.round(data[i + 3] * fade);
        }
      }
    }

    sctx.putImageData(imgData, 0, 0);

    // 4) Apply crop by drawing the cropped region into the preview canvas
    //    at a sensible display size while preserving aspect ratio.
    const cx = (crop.left / 100) * width;
    const cy = (crop.top / 100) * height;
    const cw = Math.max(1, width - cx - (crop.right / 100) * width);
    const ch = Math.max(1, height - cy - (crop.bottom / 100) * height);

    const PREVIEW_MAX = 480;
    const aspect = cw / ch;
    let pw = PREVIEW_MAX;
    let ph = Math.round(PREVIEW_MAX / aspect);
    if (ph > PREVIEW_MAX) {
      ph = PREVIEW_MAX;
      pw = Math.round(PREVIEW_MAX * aspect);
    }
    preview.width = pw;
    preview.height = ph;

    const pctx = preview.getContext('2d');
    if (!pctx) return;
    pctx.clearRect(0, 0, pw, ph);
    pctx.imageSmoothingEnabled = true;
    pctx.imageSmoothingQuality = 'high';
    pctx.drawImage(source, cx, cy, cw, ch, 0, 0, pw, ph);

    // 5) Edge feather — blur alpha channel by re-sampling pixels and
    //    averaging the alpha of neighbours within `feather` radius.
    if (feather > 0) {
      featherEdges(pctx, pw, ph, Math.round(feather));
    }
  };

  const handleApply = () => {
    const source = sourceRef.current;
    if (!source) return;
    // Re-export at original resolution (not the preview size) so we don't
    // lose quality when the design lands on the product.
    const exportCanvas = document.createElement('canvas');
    const cx = (crop.left / 100) * source.width;
    const cy = (crop.top / 100) * source.height;
    const cw = Math.max(1, source.width - cx - (crop.right / 100) * source.width);
    const ch = Math.max(1, source.height - cy - (crop.bottom / 100) * source.height);
    exportCanvas.width = Math.round(cw);
    exportCanvas.height = Math.round(ch);
    const ectx = exportCanvas.getContext('2d');
    if (!ectx) return;
    ectx.drawImage(source, cx, cy, cw, ch, 0, 0, exportCanvas.width, exportCanvas.height);
    if (feather > 0) {
      featherEdges(ectx, exportCanvas.width, exportCanvas.height, Math.round(feather * (exportCanvas.width / 480)));
    }
    const dataUrl = exportCanvas.toDataURL('image/png');
    onApply(dataUrl);
    onClose();
  };

  const handleReset = () => {
    setBgRemoveEnabled(false);
    setBgTolerance(32);
    setBgSoftness(8);
    setCrop({ top: 0, right: 0, bottom: 0, left: 0 });
    setFeather(0);
    setContrast(100);
    setSaturation(100);
  };

  const handleAutoTrim = () => {
    setBgRemoveEnabled(true);
    setBgTolerance(40);
    setBgSoftness(12);
    setFeather(1.5);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Refine Image" size="xl">
      <div className="space-y-4 max-h-[80vh] overflow-y-auto">
        {/* Preview area */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <Eye className="w-3.5 h-3.5" /> Live preview
            </span>
            <button
              onClick={() => setShowCheckerboard((v) => !v)}
              className="text-[10px] font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
            >
              <ImageIcon className="w-3 h-3" />
              {showCheckerboard ? 'Hide' : 'Show'} transparency grid
            </button>
          </div>
          <div
            className="flex items-center justify-center p-6 min-h-[280px]"
            style={
              showCheckerboard
                ? {
                    backgroundImage:
                      'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                    backgroundColor: '#f8fafc',
                  }
                : { backgroundColor: '#0f172a' }
            }
          >
            <canvas ref={previewRef} className="max-w-full max-h-[440px] drop-shadow-xl" />
            <canvas ref={sourceRef} style={{ display: 'none' }} />
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleAutoTrim}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-br from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 shadow-md shadow-violet-200"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Auto Sticker
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>

        {/* Background removal panel */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={bgRemoveEnabled}
                onChange={(e) => setBgRemoveEnabled(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-600"
              />
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <Eraser className="w-4 h-4 text-violet-600" />
                Remove Background
              </span>
            </label>
            <span className="text-[10px] text-slate-500 font-semibold">
              Best for solid-colored backgrounds
            </span>
          </div>
          {bgRemoveEnabled && (
            <div className="space-y-3 pl-6">
              <Slider
                label="Tolerance"
                value={bgTolerance}
                min={5}
                max={120}
                onChange={setBgTolerance}
                hint="How wide the color-match range is — increase if the background isn't fully gone"
              />
              <Slider
                label="Edge softness"
                value={bgSoftness}
                min={0}
                max={40}
                onChange={setBgSoftness}
                hint="Antialiased transition band so cutouts don't look jagged"
              />
            </div>
          )}
        </section>

        {/* Crop panel */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <CropIcon className="w-4 h-4 text-blue-600" />
              Crop Borders
            </span>
            <button
              onClick={() => setCrop({ top: 0, right: 0, bottom: 0, left: 0 })}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-900"
            >
              Reset crop
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Slider label="Top" value={crop.top} min={0} max={45} onChange={(v) => setCrop((c) => ({ ...c, top: v }))} compact />
            <Slider label="Bottom" value={crop.bottom} min={0} max={45} onChange={(v) => setCrop((c) => ({ ...c, bottom: v }))} compact />
            <Slider label="Left" value={crop.left} min={0} max={45} onChange={(v) => setCrop((c) => ({ ...c, left: v }))} compact />
            <Slider label="Right" value={crop.right} min={0} max={45} onChange={(v) => setCrop((c) => ({ ...c, right: v }))} compact />
          </div>
        </section>

        {/* Effects panel */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Sliders className="w-4 h-4 text-emerald-600" />
            Polish
          </span>
          <div className="space-y-3">
            <Slider label="Feather edges" value={feather} min={0} max={6} step={0.5} onChange={setFeather} hint="Soft alpha falloff around the outside — great for stickers" />
            <Slider label="Contrast" value={contrast} min={60} max={180} onChange={setContrast} suffix="%" />
            <Slider label="Saturation" value={saturation} min={0} max={200} onChange={setSaturation} suffix="%" />
          </div>
        </section>

        {/* Footer */}
        <div className="sticky bottom-0 -mx-1 -mb-1 px-1 pb-1 pt-2 bg-white border-t border-slate-100">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleApply}>
              <span className="inline-flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Apply to product
              </span>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function sampleCorner(data: Uint8ClampedArray, w: number, _h: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

function avgColor(samples: { r: number; g: number; b: number }[]) {
  const n = samples.length;
  return {
    r: samples.reduce((s, c) => s + c.r, 0) / n,
    g: samples.reduce((s, c) => s + c.g, 0) / n,
    b: samples.reduce((s, c) => s + c.b, 0) / n,
  };
}

/**
 * Apply a simple alpha-channel box blur to soften edges. Iterates `radius`
 * times with a 3x3 average kernel — way cheaper than gaussian and
 * indistinguishable for small radii used here.
 */
function featherEdges(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  if (radius <= 0) return;
  const img = ctx.getImageData(0, 0, w, h);
  const out = new Uint8ClampedArray(img.data.length);
  out.set(img.data);
  for (let pass = 0; pass < radius; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4 + 3;
        // 3x3 neighborhood average of alpha only
        const a =
          out[i - w * 4 - 4] +
          out[i - w * 4] +
          out[i - w * 4 + 4] +
          out[i - 4] +
          out[i] +
          out[i + 4] +
          out[i + w * 4 - 4] +
          out[i + w * 4] +
          out[i + w * 4 + 4];
        img.data[i] = Math.round(a / 9);
      }
    }
    out.set(img.data);
  }
  ctx.putImageData(img, 0, 0);
}

// Small inline slider component
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
  suffix,
  compact,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
  suffix?: string;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</span>
        <span className="text-[10px] font-black text-blue-600">
          {Number.isInteger(value) ? value : value.toFixed(1)}{suffix || ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
      />
      {!compact && hint && <p className="text-[10px] text-slate-500 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
