import React from 'react';
import { Sparkles } from 'lucide-react';
import { shapeToDataUrl } from '../../utils/shapeGenerator';

interface Props {
  /** Called with a partial customization object to merge into state. */
  onApply: (changes: Partial<TemplateOutput>) => void;
}

/**
 * Shape of the values a template emits. Mirrors the relevant subset of the
 * studio's `customization` state — anything omitted is left untouched, so a
 * template can swap just text + colour without disturbing the user's
 * existing image or product colour.
 */
export interface TemplateOutput {
  text: string;
  font: string;
  color: string;
  productColor: string;
  textStroke: number;
  textStrokeColor: string;
  textShadow: number;
  textShadowColor: string;
  textLetterSpacing: number;
  image: string;
  imageScale: number;
}

interface Template {
  id: string;
  name: string;
  category: 'sports' | 'minimal' | 'bold' | 'fun' | 'vintage';
  description: string;
  swatchA: string;          // gradient swatch for preview tile
  swatchB: string;
  textPreview: string;      // small text shown on the swatch
  build: () => Partial<TemplateOutput>;
}

const TEMPLATES: Template[] = [
  // ─── Sports / jersey ────────────────────────────────────────────────
  {
    id: 'jersey-stadium',
    name: 'Stadium Jersey',
    category: 'sports',
    description: 'Bold outlined number plate, athletic feel',
    swatchA: '#1e3a8a',
    swatchB: '#fbbf24',
    textPreview: '23',
    build: () => ({
      text: '23',
      font: 'Impact',
      color: '#fbbf24',
      textStroke: 4,
      textStrokeColor: '#1e3a8a',
      textShadow: 3,
      textShadowColor: '#0f172a',
      textLetterSpacing: 0,
      productColor: '#1e3a8a',
    }),
  },
  {
    id: 'team-classic',
    name: 'Team Classic',
    category: 'sports',
    description: 'Red & white with chunky outline',
    swatchA: '#dc2626',
    swatchB: '#ffffff',
    textPreview: 'MVP',
    build: () => ({
      text: 'MVP',
      font: 'Impact',
      color: '#ffffff',
      textStroke: 3,
      textStrokeColor: '#7f1d1d',
      textShadow: 2,
      textShadowColor: '#000000',
      textLetterSpacing: 2,
      productColor: '#dc2626',
    }),
  },

  // ─── Minimal ─────────────────────────────────────────────────────────
  {
    id: 'minimal-black',
    name: 'Minimal Black',
    category: 'minimal',
    description: 'Clean wordmark, modern feel',
    swatchA: '#ffffff',
    swatchB: '#000000',
    textPreview: 'Aa',
    build: () => ({
      text: 'Less is More',
      font: 'Helvetica',
      color: '#0f172a',
      textStroke: 0,
      textStrokeColor: '#ffffff',
      textShadow: 0,
      textShadowColor: '#000000',
      textLetterSpacing: 4,
      productColor: '#ffffff',
    }),
  },
  {
    id: 'mono-circle',
    name: 'Mono Circle',
    category: 'minimal',
    description: 'Centered initial inside a circle',
    swatchA: '#0f172a',
    swatchB: '#ffffff',
    textPreview: 'C',
    build: () => ({
      text: 'C',
      font: 'Georgia',
      color: '#ffffff',
      textStroke: 0,
      textStrokeColor: '#ffffff',
      textShadow: 0,
      textShadowColor: '#000000',
      textLetterSpacing: 0,
      productColor: '#0f172a',
      image: shapeToDataUrl('circle', '#ffffff'),
      imageScale: 1.3,
    }),
  },

  // ─── Bold / streetwear ───────────────────────────────────────────────
  {
    id: 'street-loud',
    name: 'Street Loud',
    category: 'bold',
    description: 'Heavy stroke, neon pop, wide spacing',
    swatchA: '#000000',
    swatchB: '#22d3ee',
    textPreview: 'LIVE',
    build: () => ({
      text: 'LIVE LOUD',
      font: 'Impact',
      color: '#22d3ee',
      textStroke: 5,
      textStrokeColor: '#000000',
      textShadow: 4,
      textShadowColor: '#22d3ee',
      textLetterSpacing: 6,
      productColor: '#000000',
    }),
  },
  {
    id: 'sunset-fade',
    name: 'Sunset Pop',
    category: 'bold',
    description: 'Warm orange on cream',
    swatchA: '#fed7aa',
    swatchB: '#ea580c',
    textPreview: 'SUN',
    build: () => ({
      text: 'SUNSET',
      font: 'Georgia',
      color: '#ea580c',
      textStroke: 2,
      textStrokeColor: '#7c2d12',
      textShadow: 5,
      textShadowColor: '#fed7aa',
      textLetterSpacing: 2,
      productColor: '#fed7aa',
    }),
  },

  // ─── Fun / playful ───────────────────────────────────────────────────
  {
    id: 'fun-star',
    name: 'Star Power',
    category: 'fun',
    description: 'Yellow star + bold tag',
    swatchA: '#facc15',
    swatchB: '#1e293b',
    textPreview: '★',
    build: () => ({
      text: 'STAR',
      font: 'Impact',
      color: '#1e293b',
      textStroke: 0,
      textStrokeColor: '#ffffff',
      textShadow: 2,
      textShadowColor: '#fde047',
      textLetterSpacing: 3,
      productColor: '#facc15',
      image: shapeToDataUrl('star', '#1e293b'),
      imageScale: 1.4,
    }),
  },
  {
    id: 'love-heart',
    name: 'Love Pop',
    category: 'fun',
    description: 'Heart graphic with playful script',
    swatchA: '#fbcfe8',
    swatchB: '#be123c',
    textPreview: '♥',
    build: () => ({
      text: 'Love',
      font: 'Georgia',
      color: '#be123c',
      textStroke: 1,
      textStrokeColor: '#ffffff',
      textShadow: 3,
      textShadowColor: '#fbcfe8',
      textLetterSpacing: 0,
      productColor: '#fbcfe8',
      image: shapeToDataUrl('heart', '#be123c'),
      imageScale: 1.3,
    }),
  },

  // ─── Vintage ─────────────────────────────────────────────────────────
  {
    id: 'vintage-cream',
    name: 'Vintage Cream',
    category: 'vintage',
    description: 'Cream + olive serif look',
    swatchA: '#fef3c7',
    swatchB: '#65a30d',
    textPreview: 'EST',
    build: () => ({
      text: 'EST. 2026',
      font: 'Georgia',
      color: '#3f6212',
      textStroke: 0,
      textStrokeColor: '#ffffff',
      textShadow: 2,
      textShadowColor: '#a16207',
      textLetterSpacing: 2,
      productColor: '#fef3c7',
    }),
  },
  {
    id: 'retro-navy',
    name: 'Retro Navy',
    category: 'vintage',
    description: 'Navy & gold collegiate vibe',
    swatchA: '#1e3a5f',
    swatchB: '#d4a017',
    textPreview: 'CLUB',
    build: () => ({
      text: 'CLUB',
      font: 'Impact',
      color: '#d4a017',
      textStroke: 4,
      textStrokeColor: '#ffffff',
      textShadow: 3,
      textShadowColor: '#0f172a',
      textLetterSpacing: 4,
      productColor: '#1e3a5f',
    }),
  },
];

const CATEGORIES: { id: Template['category']; label: string }[] = [
  { id: 'sports',  label: 'Sports' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'bold',    label: 'Bold' },
  { id: 'fun',     label: 'Fun' },
  { id: 'vintage', label: 'Vintage' },
];

/**
 * Curated template gallery. Each tile is a hand-tuned combo of font, colour,
 * effects, and optional shape graphic. Clicking applies the whole bundle in
 * one go — perfect for "I don't know where to start" customers and for fast
 * capstone-defense demos.
 */
export function TemplatesPanel({ onApply }: Props) {
  const [active, setActive] = React.useState<Template['category'] | 'all'>('all');
  const visible = active === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.category === active);

  return (
    <div className="bg-gradient-to-br from-slate-50 via-white to-blue-50/30 rounded-2xl p-4 border border-slate-100 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-fuchsia-600" />
        <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Design Templates</h3>
        <span className="text-[10px] text-slate-500 font-semibold">· One-click presets</span>
      </div>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {([{ id: 'all', label: 'All' }, ...CATEGORIES] as { id: string; label: string }[]).map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id as any)}
            className={`px-2 py-1 rounded-full text-[10px] font-bold transition ${
              active === c.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-700 hover:border-blue-300'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Template tiles */}
      <div className="grid grid-cols-2 gap-2">
        {visible.map((t) => (
          <button
            key={t.id}
            onClick={() => onApply(t.build())}
            className="text-left bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all"
            title={t.description}
          >
            <div
              className="h-16 flex items-center justify-center relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${t.swatchA} 0%, ${t.swatchA} 50%, ${t.swatchB} 50%, ${t.swatchB} 100%)`,
              }}
            >
              <span
                className="font-black text-xl drop-shadow-sm"
                style={{ color: t.swatchA === '#ffffff' || t.swatchA === '#fef3c7' || t.swatchA === '#fed7aa' || t.swatchA === '#fbcfe8' || t.swatchA === '#facc15' ? '#0f172a' : '#ffffff' }}
              >
                {t.textPreview}
              </span>
            </div>
            <div className="px-2.5 py-1.5">
              <p className="text-[11px] font-black text-slate-900 truncate">{t.name}</p>
              <p className="text-[9px] text-slate-500 truncate">{t.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
