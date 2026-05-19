import React, { useState } from 'react';
import {
  Camera,
  Sun,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Undo2,
  Redo2,
  Save,
  Layers,
  ChevronDown,
  FolderOpen,
  Trash2,
  X,
  Download,
  CheckCircle2,
} from 'lucide-react';
import {
  ENVIRONMENT_META,
  CAMERA_META,
  EnvironmentPreset,
  CameraPreset,
} from '../ProductCustomizer3D';

interface SavedSnapshot {
  savedAt: string;
  productName?: string;
  customization: any;
  designElements: any[];
  environment?: EnvironmentPreset;
}

interface Props {
  environment: EnvironmentPreset;
  setEnvironment: (e: EnvironmentPreset) => void;
  cameraPreset: CameraPreset | null;
  setCameraPreset: (c: CameraPreset | null) => void;
  autoRotate: boolean;
  setAutoRotate: (v: boolean) => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  /** Load a previously saved snapshot back into the studio. */
  onLoad?: (snapshot: SavedSnapshot) => void;
  /** Saved designs available for this product. */
  savedSnapshots?: SavedSnapshot[];
  /** Delete a saved snapshot (by savedAt). */
  onDeleteSaved?: (savedAt: string) => void;
  layersOpen: boolean;
  setLayersOpen: (v: boolean) => void;
  layerCount: number;
  /** Triggered when admin clicks Download — captures the 3D canvas as PNG */
  onDownload?: () => void;
  /** Shows a small "saved X ago" indicator next to Save */
  lastSavedAt?: Date | null;
}

/**
 * Pro Studio toolbar — sits as a floating pill cluster on top of the 3D canvas.
 *
 * Groups:
 *   1. Lighting (environment preset dropdown)
 *   2. Camera (preset chips for Front / 3/4 / Side / Back / Top / Detail)
 *   3. Auto-rotate showcase toggle
 *   4. Undo / Redo
 *   5. Save / Layers
 *   6. Fullscreen
 *
 * All controls feed back into the parent CustomizationStudio state so the
 * 3D scene re-renders with the new look. No business logic here — pure UI.
 */
export function ProStudioToolbar(props: Props) {
  const [envOpen, setEnvOpen] = useState(false);
  const [camOpen, setCamOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const closeAll = () => { setEnvOpen(false); setCamOpen(false); setLoadOpen(false); };

  const envMeta = ENVIRONMENT_META[props.environment];

  return (
    // Positioned on the LEFT side of the canvas. The existing Customize
    // appearance panel lives top-right and was being blocked by our
    // dropdowns — moving us to the left clears that conflict and we
    // sit alongside the Precision Mode button instead.
    <div className="absolute top-20 left-4 md:left-6 z-30 flex flex-col gap-2">
      {/* Lighting */}
      <div className="relative">
        <button
          onClick={() => { const next = !envOpen; closeAll(); setEnvOpen(next); }}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg hover:bg-white transition w-full"
          title="Lighting preset"
        >
          <Sun className="w-3.5 h-3.5 text-amber-500" />
          <span className="hidden md:inline">{envMeta.label}</span>
          <span className="md:hidden">{envMeta.emoji}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {envOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setEnvOpen(false)} />
            <div className="absolute left-0 mt-1 w-44 rounded-2xl bg-white border border-slate-200 shadow-2xl z-40 overflow-hidden">
              {Object.entries(ENVIRONMENT_META).map(([id, meta]) => (
                <button
                  key={id}
                  onClick={() => { props.setEnvironment(id as EnvironmentPreset); setEnvOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition ${
                    id === props.environment ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-sm">{meta.emoji}</span>
                  <span>{meta.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Camera */}
      <div className="relative">
        <button
          onClick={() => { const next = !camOpen; closeAll(); setCamOpen(next); }}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold backdrop-blur-md border shadow-lg transition w-full ${
            props.cameraPreset
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white/90 border-slate-200 hover:bg-white'
          }`}
          title="Camera preset"
        >
          <Camera className="w-3.5 h-3.5" />
          <span className="hidden md:inline">
            {props.cameraPreset ? CAMERA_META[props.cameraPreset].label : 'Camera'}
          </span>
          <span className="md:hidden">
            {props.cameraPreset ? CAMERA_META[props.cameraPreset].emoji : '📷'}
          </span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {camOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setCamOpen(false)} />
            <div className="absolute left-0 mt-1 w-48 rounded-2xl bg-white border border-slate-200 shadow-2xl z-40 overflow-hidden">
              <button
                onClick={() => { props.setCameraPreset(null); setCamOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition ${
                  !props.cameraPreset ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>↻</span>
                <span>Free orbit (default)</span>
              </button>
              <div className="border-t border-slate-100" />
              {Object.entries(CAMERA_META).map(([id, meta]) => (
                <button
                  key={id}
                  onClick={() => { props.setCameraPreset(id as CameraPreset); setCamOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition ${
                    id === props.cameraPreset ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-sm">{meta.emoji}</span>
                  <span>{meta.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Showcase / auto-rotate */}
      <button
        onClick={() => props.setAutoRotate(!props.autoRotate)}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold backdrop-blur-md border shadow-lg transition w-full ${
          props.autoRotate
            ? 'bg-purple-600 text-white border-purple-600'
            : 'bg-white/90 border-slate-200 hover:bg-white'
        }`}
        title={props.autoRotate ? 'Stop showcase' : 'Showcase 360°'}
      >
        {props.autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        <span className="hidden md:inline">{props.autoRotate ? 'Stop' : 'Showcase'}</span>
      </button>

      {/* History */}
      <div className="flex gap-1">
        <button
          onClick={props.onUndo}
          disabled={!props.canUndo}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-bold bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={props.onRedo}
          disabled={!props.canRedo}
          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-bold bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Layers + Save */}
      <button
        onClick={() => props.setLayersOpen(!props.layersOpen)}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold backdrop-blur-md border shadow-lg transition w-full ${
          props.layersOpen
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white/90 border-slate-200 hover:bg-white'
        }`}
        title="Layers panel"
      >
        <Layers className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Layers</span>
        {props.layerCount > 0 && (
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
            props.layersOpen ? 'bg-white/20' : 'bg-slate-100'
          }`}>
            {props.layerCount}
          </span>
        )}
      </button>
      <button
        onClick={props.onSave}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white border border-emerald-500 shadow-lg hover:bg-emerald-600 transition w-full"
        title="Save design (Ctrl+S)"
      >
        <Save className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Save</span>
      </button>

      {/* Load saved designs */}
      <div className="relative">
        <button
          onClick={() => { const next = !loadOpen; closeAll(); setLoadOpen(next); }}
          disabled={!props.savedSnapshots || props.savedSnapshots.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition w-full"
          title="Load saved design"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Load</span>
          {props.savedSnapshots && props.savedSnapshots.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100">
              {props.savedSnapshots.length}
            </span>
          )}
        </button>
        {loadOpen && props.savedSnapshots && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setLoadOpen(false)} />
            <div className="absolute left-0 mt-1 w-72 max-h-96 overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl z-40">
              <div className="p-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-xs font-bold text-slate-900">Saved designs</p>
                <button onClick={() => setLoadOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-1">
                {props.savedSnapshots.length === 0 ? (
                  <p className="px-3 py-6 text-xs text-slate-500 italic text-center">No saved designs yet.</p>
                ) : (
                  props.savedSnapshots.map((snap) => (
                    <div key={snap.savedAt} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50">
                      <button
                        onClick={() => { props.onLoad?.(snap); setLoadOpen(false); }}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {snap.productName || 'Untitled design'}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {new Date(snap.savedAt).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {snap.designElements?.length || 0} layers
                          {snap.environment ? ` · ${snap.environment}` : ''}
                        </p>
                      </button>
                      <button
                        onClick={() => props.onDeleteSaved?.(snap.savedAt)}
                        className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 flex-shrink-0"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Download as PNG */}
      {props.onDownload && (
        <button
          onClick={props.onDownload}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg hover:bg-white transition w-full"
          title="Download as PNG"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Download</span>
        </button>
      )}

      {/* Fullscreen */}
      <button
        onClick={props.toggleFullscreen}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/90 backdrop-blur-md border border-slate-200 shadow-lg hover:bg-white transition w-full"
        title={props.isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (F)'}
      >
        {props.isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </button>

      {/* Last-saved indicator — only shown when there's been a save */}
      {props.lastSavedAt && (
        <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          <SavedAgo at={props.lastSavedAt} />
        </div>
      )}
    </div>
  );
}

/**
 * "saved Xm ago" chip — auto-refreshes every minute so the time stays current
 * without the parent having to track it.
 */
function SavedAgo({ at }: { at: Date }) {
  const [now, setNow] = useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, now - new Date(at).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return <span>just now</span>;
  if (m < 60) return <span>{m}m ago</span>;
  const h = Math.floor(m / 60);
  if (h < 24) return <span>{h}h ago</span>;
  return <span>{new Date(at).toLocaleDateString()}</span>;
}
