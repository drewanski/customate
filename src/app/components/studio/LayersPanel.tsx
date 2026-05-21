import React from 'react';
import {
  Type as TypeIcon,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  ChevronUp,
  ChevronDown,
  X,
  Layers,
  Plus,
  Lock,
  Unlock,
} from 'lucide-react';
import { DesignElement } from '../../types/design';

interface Props {
  elements: DesignElement[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onChange: (elements: DesignElement[]) => void;
  onClose: () => void;
}

/**
 * Layers panel — Photoshop-style stack of all design elements on the product.
 *
 * For each element:
 *   - Click anywhere to select it (highlights the decal in the 3D scene)
 *   - Eye toggles visibility (we set `hidden: true` on the element; the
 *     renderer is unchanged but reads this flag)
 *   - Copy duplicates the element with a small offset so it's clickable
 *   - Up/Down reorders (later items render on top, like CSS z-index)
 *   - Trash removes the element entirely
 *
 * Lives in the studio UI, not inside the 3D canvas, so it's interactive
 * with normal DOM events.
 */
export function LayersPanel({ elements, activeId, onSelect, onChange, onClose }: Props) {
  const move = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= elements.length) return;
    const next = [...elements];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    onChange(next);
  };

  const duplicate = (el: DesignElement) => {
    // 3D positions are in world-space (typically ±0.5 units). A small offset
    // makes the copy visible & clickable but keeps it adjacent to the original.
    // Z-offset slightly pushes it forward so it renders on top of the original.
    const copy: DesignElement = {
      ...el,
      id: `${el.type}_${Date.now()}`,
      position: el.position
        ? {
            x: (el.position.x || 0) + 0.05,
            y: (el.position.y || 0) - 0.05,
            z: (el.position.z || 0) + 0.001,
          }
        : el.position,
    } as DesignElement;
    onChange([...elements, copy]);
    onSelect(copy.id);
  };

  const remove = (id: string) => {
    onChange(elements.filter((e) => e.id !== id));
  };

  const toggleVisible = (id: string) => {
    onChange(
      elements.map((e) =>
        e.id === id ? ({ ...e, hidden: !(e as any).hidden } as DesignElement) : e
      )
    );
  };

  const toggleLock = (id: string) => {
    onChange(
      elements.map((e) =>
        e.id === id ? ({ ...e, locked: !(e as any).locked } as DesignElement) : e
      )
    );
  };

  const addText = () => {
    const layer: DesignElement = {
      id: `text_${Date.now()}`,
      type: 'text',
      content: 'New text',
      position: { x: 0, y: 0, z: 0 },
      scale: 1,
      rotation: 0,
      color: '#000000',
      font: 'Arial',
      opacity: 1,
    };
    onChange([...elements, layer]);
    onSelect(layer.id);
  };

  // Upload picker for adding additional image layers. Each upload becomes
  // its own DesignElement, so users can stack a logo + accent graphic + a
  // photo without overwriting the sidebar's primary image_1 slot.
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const addImage = () => fileInputRef.current?.click();
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) return;
      const layer: DesignElement = {
        id: `image_${Date.now()}`,
        type: 'image',
        content: dataUrl,
        position: { x: 0, y: 0, z: 0 },
        scale: 1,
        rotation: 0,
        color: '#000000',
        opacity: 1,
      };
      onChange([...elements, layer]);
      onSelect(layer.id);
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be picked twice in a row
    e.target.value = '';
  };

  return (
    <div className="fixed md:absolute top-20 left-4 md:left-32 z-30 w-72 max-h-[60vh] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl">
      <div className="flex items-center justify-between p-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-slate-700" />
          <p className="text-sm font-bold text-slate-900">Layers</p>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {elements.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={addText}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
            title="Add text layer"
          >
            <Plus className="w-3 h-3" />
            Text
          </button>
          <button
            onClick={addImage}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 transition"
            title="Add image layer"
          >
            <Plus className="w-3 h-3" />
            Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
          />
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {elements.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-slate-500 italic">
              No layers yet. Add text or upload an image to get started.
            </p>
          </div>
        ) : (
          // Render newest-on-top to match z-order in the 3D scene
          [...elements].reverse().map((el) => {
            const originalIdx = elements.findIndex((e) => e.id === el.id);
            const isActive = el.id === activeId;
            const isHidden = (el as any).hidden === true;
            const Icon = el.type === 'text' ? TypeIcon : ImageIcon;
            const labelText =
              el.type === 'text'
                ? (el.content || '').slice(0, 24) || 'Empty text'
                : 'Image decal';
            return (
              <div
                key={el.id}
                onClick={() => onSelect(el.id)}
                className={`p-2 rounded-xl border cursor-pointer transition group ${
                  isActive
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                } ${isHidden ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {/* Thumbnail */}
                  <div className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center ${
                    el.type === 'text'
                      ? 'bg-gradient-to-br from-slate-700 to-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500 overflow-hidden'
                  }`}>
                    {el.type === 'image' && el.content ? (
                      <img src={el.content} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-bold truncate ${isHidden ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                      {labelText}
                    </p>
                    <p className="text-[10px] text-slate-500 capitalize">{el.type} layer</p>
                  </div>
                </div>

                {/* Hover-revealed action bar */}
                <div
                  className={`flex gap-0.5 mt-2 ${isActive ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => toggleVisible(el.id)}
                    className="flex-1 inline-flex items-center justify-center p-1 rounded-md text-slate-600 hover:bg-slate-100"
                    title={isHidden ? 'Show' : 'Hide'}
                  >
                    {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => toggleLock(el.id)}
                    className="flex-1 inline-flex items-center justify-center p-1 rounded-md text-slate-600 hover:bg-slate-100"
                    title={(el as any).locked ? 'Unlock' : 'Lock'}
                  >
                    {(el as any).locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => duplicate(el)}
                    className="flex-1 inline-flex items-center justify-center p-1 rounded-md text-slate-600 hover:bg-slate-100"
                    title="Duplicate"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => move(originalIdx, 1)}
                    disabled={originalIdx === elements.length - 1}
                    className="flex-1 inline-flex items-center justify-center p-1 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    title="Move up (z-order)"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => move(originalIdx, -1)}
                    disabled={originalIdx === 0}
                    className="flex-1 inline-flex items-center justify-center p-1 rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    title="Move down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => remove(el.id)}
                    className="flex-1 inline-flex items-center justify-center p-1 rounded-md text-rose-600 hover:bg-rose-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-2 border-t border-slate-100 text-[10px] text-slate-500 text-center">
        Tip: drag a decal in the 3D scene to move it. Use ↑/↓ to change layer order.
      </div>
    </div>
  );
}
