import React from 'react';
import { Image as ImageIcon, Download, Sparkles, Eye } from 'lucide-react';

/**
 * Compact "design preview + download" widget used in every place an order
 * is shown to admin (Schedule modal, Production queue, Calendar cells,
 * Production day cards, etc).
 *
 * Behaviour:
 *   - Renders the design snapshot if the order has one.
 *   - Click the thumbnail → opens full-size in a new tab.
 *   - "Download" button below → saves PNG with a sensible filename.
 *   - When no preview exists, renders a muted placeholder so the layout
 *     doesn't jump and the admin knows immediately this order is uncustomized.
 *
 * Three size presets:
 *   xs  — 32×32 inline thumbnail (table rows)
 *   sm  — 48×48 (calendar day cells)
 *   md  — 64×64 (queue rows, schedule modal)
 *   lg  — 96×96 (drawer header)
 */
interface Props {
  /** Order or task object with .items[].customization.previewImage */
  order: any;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** When true, render the download chip below the thumbnail. */
  showDownload?: boolean;
  /** When true, prefix the download filename with this label. */
  filenamePrefix?: string;
}

const SIZE_CLASSES: Record<string, { box: string; icon: string }> = {
  xs: { box: 'w-8 h-8 rounded-md', icon: 'w-3.5 h-3.5' },
  sm: { box: 'w-12 h-12 rounded-lg', icon: 'w-4 h-4' },
  md: { box: 'w-16 h-16 rounded-lg', icon: 'w-5 h-5' },
  lg: { box: 'w-24 h-24 rounded-xl', icon: 'w-7 h-7' },
};

export function OrderDesignPreview({
  order,
  size = 'md',
  showDownload = false,
  filenamePrefix = 'order',
}: Props) {
  const cls = SIZE_CLASSES[size];
  const items = order?.items || [];
  // Collect every item's previewImage so multi-item orders surface each one
  const previews = items
    .map((it: any, idx: number) => ({
      idx,
      url: it.customization?.previewImage as string | undefined,
      name: it.name as string | undefined,
      sku: it.sku as string | undefined,
    }))
    .filter((p: any) => p.url);

  const refShort = String(order?._id || order?.id || '').slice(-6).toUpperCase();

  if (previews.length === 0) {
    return (
      <div className={`${cls.box} flex items-center justify-center bg-slate-100 border border-slate-200 text-slate-400 shrink-0`}>
        <ImageIcon className={cls.icon} />
      </div>
    );
  }

  // For collections (multiple items), stack with badge showing the count.
  return (
    <div className="inline-flex items-start gap-2">
      <div className="relative shrink-0">
        <a
          href={previews[0].url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${cls.box} block overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 hover:border-blue-400 hover:shadow-md transition relative group`}
          title="Open design preview at full size"
        >
          <img src={previews[0].url} alt="Design" className="w-full h-full object-contain" />
          {/* hover overlay */}
          <span className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/20 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
            <Eye className="w-3 h-3 text-white" />
          </span>
          {/* Sparkles badge for customized items */}
          <span className="absolute top-0.5 left-0.5 inline-flex items-center px-0.5 py-0 rounded-sm bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
            <Sparkles className="w-2 h-2" />
          </span>
        </a>
        {previews.length > 1 && (
          <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded-full text-[8px] font-black bg-blue-600 text-white shadow-md">
            +{previews.length - 1}
          </span>
        )}
      </div>
      {showDownload && (
        <div className="flex flex-col gap-1">
          {previews.map((p: any, i: number) => (
            <a
              key={i}
              href={p.url}
              download={`${filenamePrefix}-${refShort}-${i + 1}.png`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition whitespace-nowrap"
              title={`Download ${p.name || 'design'}`}
            >
              <Download className="w-2.5 h-2.5" />
              {previews.length > 1 ? `Item ${i + 1}` : 'Download PNG'}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
