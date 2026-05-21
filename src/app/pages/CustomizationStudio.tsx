import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Textarea } from '../components/Textarea';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { apiRequest } from '../api';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { RotateCw, ZoomIn, Upload, Save, ChevronLeft, ChevronRight, Type, Image as ImageIcon, Settings2, Trash2, Maximize2, Move, LogIn, Box, Wand2, Sparkles, Eraser, Crop as CropIcon } from 'lucide-react';
import { ImageRefineModal } from '../components/customizer/ImageRefineModal';
import { ShapesPanel } from '../components/customizer/ShapesPanel';
import { TemplatesPanel } from '../components/customizer/TemplatesPanel';
import { useRecentColors } from '../hooks/useRecentColors';
import { autoStickerize } from '../utils/autoStickerize';
import { AIDesignAssistant } from '../components/AIDesignAssistant';
import { AIDesignCritique } from '../components/AIDesignCritique';
import { ProductCustomizer3D, EnvironmentPreset, CameraPreset } from '../components/ProductCustomizer3D';
import { ProStudioToolbar } from '../components/studio/ProStudioToolbar';
import { LayersPanel } from '../components/studio/LayersPanel';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { WebGLCheck } from '../components/WebGLCheck';
import { NotFound } from './NotFound';
import { ToastContainer, ToastType } from '../components/Toast';
import { FileUpload } from '../components/FileUpload';
import { formatPeso } from '../utils/format';
import { DesignElement } from '../types/design';
import { AIMockupModal } from '../components/AIMockupModal';
import {
  analyzeDesign,
  probeImageDimensions,
  hasBlockingIssues,
  type Issue,
} from '../utils/printQuality';
import { DesignQualityPanel } from '../components/DesignQualityPanel';

const FALLBACK_PRODUCTS = [
  { id: 'TS001', sku: 'TS001', name: 'Custom Cotton T-Shirt', category: 'Apparel', price: 350, image: '/products/sports-jersey.webp' },
  { id: 'JR001', sku: 'JR001', name: 'Sports Performance Jersey', category: 'Apparel', price: 550, image: '/products/sports-jersey.webp' },
  { id: 'MG001', sku: 'MG001', name: 'Ceramic Coffee Mug', category: 'Drinkware', price: 150, image: '/products/tumbler.webp' },
  { id: 'TB001', sku: 'TB001', name: 'Stainless Steel Tumbler', category: 'Drinkware', price: 450, image: '/products/tumbler.webp' },
  { id: 'MP001', sku: 'MP001', name: 'Gaming Mousepad', category: 'Accessories', price: 250, image: '/products/mouse-pad.webp' },
  { id: 'FF001', sku: 'FF001', name: 'Foldable Hand Fan', category: 'Accessories', price: 45, image: '/products/hand-fan.webp' },
  { id: 'OT001', sku: 'OT001', name: 'Canvas Tote Bag', category: 'Bags', price: 120, image: '/products/tote-bag.webp' },
  { id: 'CP001', sku: 'CP001', name: 'Small Coin Purse', category: 'Bags', price: 75, image: '/products/tote-bag.webp' },
];

function getFallbackProduct(productId?: string) {
  if (!productId) return FALLBACK_PRODUCTS[0];
  const normalized = productId.toLowerCase();
  return FALLBACK_PRODUCTS.find((item) => (
    item.id.toLowerCase() === normalized ||
    item.sku.toLowerCase() === normalized ||
    item.name.toLowerCase().replace(/\s+/g, '-') === normalized
  )) || FALLBACK_PRODUCTS[0];
}

export function CustomizationStudio() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { user } = useAuth();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'text' | 'image' | 'ai' | 'options'>('text');
  const [refineModalOpen, setRefineModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Cross-session palette of the colors this user has actually used.
  // Updated whenever they pick a text/stroke/shadow color so they don't
  // have to re-pick the brand colors on every design session.
  const { colors: recentColors, remember: rememberColor } = useRecentColors();
  // AI design critique modal — gives 3 tips on the current design
  const [critiqueOpen, setCritiqueOpen] = useState(false);
  // ─── AI Lifestyle Mockup ──────────────────────────────────────────────
  // Modal toggle + snapshot. Snapshot is captured at the moment the user
  // clicks "Lifestyle preview" so the mockup matches what's on the canvas
  // right then. We pass it down to AIMockupModal which handles the API call.
  const [mockupOpen, setMockupOpen] = useState(false);
  const [mockupSnapshot, setMockupSnapshot] = useState<string>('');

  // ─── Pro Studio: lighting, camera presets, showcase mode, layers ──────
  const [environment, setEnvironment] = useState<EnvironmentPreset>('studio');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const studioContainerRef = useRef<HTMLDivElement>(null);

  // ─── Design history (undo/redo) ────────────────────────────────────────
  // We keep a stack of design-element snapshots. Every "real" change pushes
  // a snapshot. Undo pops back, redo re-applies. Keep stack bounded to 50
  // entries so memory stays sane.
  const historyRef = useRef<{ past: any[][]; future: any[][] }>({ past: [], future: [] });
  const skipNextHistory = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0); // bump to re-render undo/redo enabled state

  // ─── Save / Load designs ───────────────────────────────────────────────
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  // True whenever there's an unsaved change. Drives the beforeunload warning.
  const [isDirty, setIsDirty] = useState(false);
  const [isPreview3D, setIsPreview3D] = useState(true);
  const [precisionMode, setPrecisionMode] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  // Mobile: whether the sidebar sheet is currently open (slides up from bottom).
  // On desktop the sidebar is always visible; this flag is ignored.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // State for 3D designer elements
  const [designElements, setDesignElements] = useState<DesignElement[]>([]);
  const [activeDesignElement, setActiveDesignElement] = useState<string | null>(null);
  // Ref mirror so undo/redo + the change handler can read the latest value
  // without re-creating callbacks on every render.
  const designElementsRef = useRef<DesignElement[]>(designElements);
  useEffect(() => {
    designElementsRef.current = designElements;
  }, [designElements]);

  // Convert existing customization to design elements will be added after customization state declaration

  // Handle design changes from 3D designer.
  // NOTE: element.position is now 3D world-space coords (driven by the in-canvas
  // raycast / gizmo), not the 0–100 slider percentages. We only mirror back the
  // content/style fields, not the 3D pose — pose lives on designElements.
  const handleDesignChange = useCallback((elements: DesignElement[]) => {
    // Push to history stack — but skip if this change came FROM an undo/redo
    // (otherwise undo would just create another history entry and we'd loop)
    if (!skipNextHistory.current) {
      historyRef.current.past.push(designElementsRef.current);
      if (historyRef.current.past.length > 50) {
        historyRef.current.past.shift();
      }
      historyRef.current.future = []; // clear redo stack on a fresh edit
      setHistoryVersion((v) => v + 1);
    }
    skipNextHistory.current = false;

    setDesignElements(elements);
    setIsDirty(true);

    const textElement = elements.find(el => el.type === 'text');
    const imageElement = elements.find(el => el.type === 'image');

    setCustomization(prev => ({
      ...prev,
      text: textElement?.content ?? prev.text,
      color: textElement?.color ?? prev.color,
      textRotation: textElement?.rotation ?? prev.textRotation,
      textScale: textElement?.scale ?? prev.textScale,
      image: imageElement?.content ?? prev.image,
      imageScale: imageElement?.scale ?? prev.imageScale,
      imageRotation: imageElement?.rotation ?? prev.imageRotation,
    }));
  }, []);

  // ─── Undo / Redo ────────────────────────────────────────────────────────
  // Declared HERE (before early returns) to keep hook order stable per React's
  // rules-of-hooks. `addToast` is captured by closure but stable enough since
  // it's only used inside the handlers.
  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    const prev = h.past.pop()!;
    h.future.push(designElementsRef.current);
    skipNextHistory.current = true;
    setDesignElements(prev);
    setHistoryVersion((v) => v + 1);
  }, []);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    const next = h.future.pop()!;
    h.past.push(designElementsRef.current);
    skipNextHistory.current = true;
    setDesignElements(next);
    setHistoryVersion((v) => v + 1);
  }, []);

  // ─── Fullscreen ─────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await (studioContainerRef.current || document.documentElement).requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('Fullscreen failed:', err);
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ─── Beforeunload warning when there are unsaved changes ───────────────
  // Modern browsers ignore custom messages but DO show a generic "are you
  // sure you want to leave?" prompt when preventDefault is called. Good
  // enough to prevent accidental loss of work after a long design session.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required for legacy Chrome
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (meta && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeDesignElement) {
          setDesignElements((prev) => prev.filter((el) => el.id !== activeDesignElement));
          setActiveDesignElement(null);
        }
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && activeDesignElement) {
        // Nudge the active layer's position. 1% normally, 5% with Shift.
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        setDesignElements((prev) =>
          prev.map((el) => {
            if (el.id !== activeDesignElement) return el;
            const cur = el.position || { x: 50, y: 50 };
            let nx = cur.x;
            let ny = cur.y;
            if (e.key === 'ArrowUp') ny = Math.max(0, cur.y - step);
            if (e.key === 'ArrowDown') ny = Math.min(100, cur.y + step);
            if (e.key === 'ArrowLeft') nx = Math.max(0, cur.x - step);
            if (e.key === 'ArrowRight') nx = Math.min(100, cur.x + step);
            return { ...el, position: { ...cur, x: nx, y: ny } };
          })
        );
      } else if ((e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') && activeDesignElement) {
        // Scale the active layer with +/-.
        e.preventDefault();
        const inc = (e.key === '+' || e.key === '=') ? 0.1 : -0.1;
        setDesignElements((prev) =>
          prev.map((el) => {
            if (el.id !== activeDesignElement) return el;
            const cur = el.scale ?? 1;
            return { ...el, scale: Math.max(0.3, Math.min(3, Number((cur + inc).toFixed(2)))) };
          })
        );
      } else if (e.key.toLowerCase() === 'r' && !meta && activeDesignElement) {
        // Rotate the active layer. R = +15deg, Shift+R = -15deg.
        e.preventDefault();
        const delta = e.shiftKey ? -15 : 15;
        setDesignElements((prev) =>
          prev.map((el) => {
            if (el.id !== activeDesignElement) return el;
            const cur = el.rotation ?? 0;
            return { ...el, rotation: ((cur + delta) % 360 + 360) % 360 };
          })
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo, toggleFullscreen, activeDesignElement]);

  const canvasRef = useRef<HTMLDivElement>(null);

  const addToast = (message: string, type: ToastType) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const [view, setView] = useState<'front' | 'back'>('front');
  const [zoom, setZoom] = useState(100);
  // ─── Print-quality state ────────────────────────────────────────────────
  // Issues list is recomputed any time the customization or image dims change.
  // imageDims is probed once per image change — async, cached in state so the
  // synchronous analyzer can use it.
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [qualityIssues, setQualityIssues] = useState<Issue[]>([]);

  const [customization, setCustomization] = useState({
    template: '',
    text: '',
    font: 'Arial',
    color: '#000000',
    productColor: '#ffffff',
    size: 'M',
    placement: 'Center Front',
    image: '',
    textPosition: { x: 50, y: 50, z: 0 },
    imagePosition: { x: 50, y: 50, z: 0 },
    textRotation: 0,
    textSize: 24,
    textScale: 1,
    imageScale: 1,
    imageRotation: 0,
    textSurface: undefined as any,
    imageSurface: undefined as any,
    // ─ Polish-pass additions ─────────────────────────────────────────────
    imageFlipX: false,           // mirror horizontally
    imageFlipY: false,           // mirror vertically
    imageOpacity: 1,             // 0..1 — opacity of the decal
    textStroke: 0,               // 0..6 — px stroke width
    textStrokeColor: '#ffffff',  // outline color (high-contrast against fill)
    textShadow: 0,               // 0..10 — shadow blur radius
    textShadowColor: '#000000',  // shadow color
    textLetterSpacing: 0,        // -5..20 px letter spacing
  });


  // ─── Print-quality plumbing ────────────────────────────────────────────
  // Probe the uploaded image's natural dimensions whenever it changes. We
  // need this for the DPI check; without it the analyzer has nothing to
  // compare against the print size.
  useEffect(() => {
    let cancelled = false;
    if (!customization.image) {
      setImageDims(null);
      return;
    }
    probeImageDimensions(customization.image).then((dims) => {
      if (!cancelled) setImageDims(dims);
    });
    return () => {
      cancelled = true;
    };
  }, [customization.image]);

  // ─── Snapshot ────────────────────────────────────────────────────────
  // Grab a high-res PNG of the 3D scene. Relies on the canvas being
  // mounted with preserveDrawingBuffer:true (see ProductCustomizer3D).
  const handleSnapshot = useCallback(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) {
      addToast('3D canvas not ready yet', 'error');
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `customate-design-${Date.now()}.png`;
      a.click();
      addToast('Snapshot saved!', 'success');
    } catch (err: any) {
      addToast('Snapshot failed — try again', 'error');
    }
  }, []);

  const handleShareSnapshot = useCallback(async () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    try {
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1.0));
      if (!blob) throw new Error('No blob');
      if (navigator.share && (navigator.canShare?.({ files: [new File([blob], 'design.png', { type: 'image/png' })] }))) {
        await navigator.share({
          title: 'My CustoMate Design',
          text: 'Check out my custom design on CustoMate!',
          files: [new File([blob], 'design.png', { type: 'image/png' })],
        });
        addToast('Shared!', 'success');
      } else {
        // Fallback: copy image to clipboard
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        addToast('Image copied to clipboard!', 'success');
      }
    } catch (err) {
      addToast('Share unavailable — try downloading instead', 'info');
    }
  }, []);

  // Re-run the full analysis whenever anything that affects print output
  // changes. Result list is sorted error → warning → info.
  useEffect(() => {
    const productType = (product?.type || product?.category || product?.sku || 'default')
      .toString()
      .toLowerCase();
    // Normalize category strings to PRINT_SPECS keys
    const typeKey =
      productType.includes('shirt') ? 'shirt' :
      productType.includes('jersey') ? 'jersey' :
      productType.includes('mug') ? 'mug' :
      productType.includes('tumbler') ? 'tumbler' :
      productType.includes('mouse') ? 'mousepad' :
      productType.includes('fan') ? 'fan' :
      productType.includes('tote') || productType.includes('bag') || productType.includes('purse') ? 'tote' :
      'default';

    const issues = analyzeDesign({
      productType: typeKey,
      imageSrc: customization.image || undefined,
      imageDims,
      text: customization.text || undefined,
      textSize: customization.textSize,
      textColor: customization.color,
      productColor: customization.productColor,
      imageScale: customization.imageScale,
      textScale: customization.textScale,
    });
    setQualityIssues(issues);
  }, [
    product,
    imageDims,
    customization.image,
    customization.text,
    customization.textSize,
    customization.color,
    customization.productColor,
    customization.imageScale,
    customization.textScale,
  ]);

  const checkoutBlocked = hasBlockingIssues(qualityIssues);

  // Rebuild design elements when slider-driven content/style fields change,
  // BUT preserve the 3D pose (position, normal, meshName) captured by the
  // in-canvas raycast/gizmo. If no pose yet, ProductCustomizer3D defaults
  // the element to the front face of the bounding box.
  useEffect(() => {
    setDesignElements(prev => {
      const findPrev = (id: string) => prev.find(e => e.id === id);
      // Layers other than the sidebar-managed defaults (text_1 / image_1)
      // were created via the LayersPanel "+ Add" buttons. They have their
      // own content + transform, so we keep them untouched and only
      // refresh the two sidebar-default slots from the customization state.
      const extras = prev.filter(e => e.id !== 'text_1' && e.id !== 'image_1');
      const next: DesignElement[] = [...extras];

      if (customization.text) {
        const existing = findPrev('text_1');
        next.push({
          id: 'text_1',
          type: 'text',
          content: customization.text,
          position: existing?.normal ? existing.position : { x: 0, y: 0, z: 0 },
          normal: existing?.normal,
          meshName: existing?.meshName,
          surface: existing?.surface ?? customization.textSurface,
          placement: customization.placement,
          scale: customization.textScale || 1,
          rotation: customization.textRotation || 0,
          color: customization.color || '#000000',
          font: customization.font || 'Arial',
          opacity: 1,
          aspectRatio: 4,
          // Text effects — pass straight through to the canvas renderer
          stroke: customization.textStroke || 0,
          strokeColor: customization.textStrokeColor || '#ffffff',
          shadow: customization.textShadow || 0,
          shadowColor: customization.textShadowColor || '#000000',
          letterSpacing: customization.textLetterSpacing || 0,
        });
      }

      if (customization.image) {
        const existing = findPrev('image_1');
        next.push({
          id: 'image_1',
          type: 'image',
          content: customization.image,
          position: existing?.normal ? existing.position : { x: 0, y: 0, z: 0 },
          normal: existing?.normal,
          meshName: existing?.meshName,
          surface: existing?.surface ?? customization.imageSurface,
          placement: customization.placement,
          scale: customization.imageScale || 1,
          rotation: customization.imageRotation || 0,
          color: '#000000',
          opacity: customization.imageOpacity ?? 1,
          aspectRatio: 1,
          flipX: !!customization.imageFlipX,
          flipY: !!customization.imageFlipY,
        });
      }

      return next;
    });
  }, [
    customization.text,
    customization.image,
    customization.textScale,
    customization.imageScale,
    customization.textRotation,
    customization.imageRotation,
    customization.color,
    customization.font,
    customization.placement,
    customization.textSurface,
    customization.imageSurface,
    customization.textStroke,
    customization.textStrokeColor,
    customization.textShadow,
    customization.textShadowColor,
    customization.textLetterSpacing,
    customization.imageOpacity,
    customization.imageFlipX,
    customization.imageFlipY,
  ]);

  // Auto-select the first element so the click-to-place hint appears
  useEffect(() => {
    if (!activeDesignElement && designElements.length > 0) {
      setActiveDesignElement(designElements[0].id);
    }
  }, [activeDesignElement, designElements]);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    apiRequest(`/inventory/${productId}`)
      .then((data) => {
        setProduct(data);
      })
      .catch(() => setProduct(import.meta.env.DEV ? getFallbackProduct(productId) : null))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
        {/* Header skeleton */}
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
            <div className="space-y-1.5">
              <div className="w-48 h-3 rounded-full bg-slate-200 animate-pulse" />
              <div className="w-32 h-2 rounded-full bg-slate-100 animate-pulse" />
            </div>
          </div>
          <div className="w-28 h-9 rounded-full bg-slate-200 animate-pulse" />
        </div>
        {/* Body skeleton */}
        <div className="flex-1 flex">
          <div className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-12 h-12 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
          <div className="w-80 bg-white border-r border-slate-200 p-6 space-y-4">
            <div className="w-24 h-2 rounded-full bg-slate-200 animate-pulse" />
            <div className="w-full h-24 rounded-xl bg-slate-100 animate-pulse" />
            <div className="w-full h-10 rounded-xl bg-slate-100 animate-pulse" />
            <div className="w-full h-10 rounded-xl bg-slate-100 animate-pulse" />
            <div className="w-full h-32 rounded-2xl bg-slate-100 animate-pulse" />
          </div>
          <div className="flex-1 flex items-center justify-center bg-[#F1F5F9]">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 font-semibold text-sm">Loading your studio…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <NotFound
        title="Product not found"
        message="We couldn't find the product you wanted to customize. It may have been removed or the link is broken."
      />
    );
  }
  
  const fontOptions = [
    { value: 'Arial', label: 'Arial' },
    { value: 'Helvetica', label: 'Helvetica' },
    { value: 'Times New Roman', label: 'Times New Roman' },
    { value: 'Courier', label: 'Courier' },
    { value: 'Script', label: 'Script' },
  ];
  
  const placementOptions = [
    { value: 'Center Front', label: 'Center Front' },
    { value: 'Center Back', label: 'Center Back' },
    { value: 'Left Chest', label: 'Left Chest' },
    { value: 'Full Front', label: 'Full Front' },
  ];
  
  const unitPrice = product.price * 1.25; // 25% markup for custom
  const totalPrice = (unitPrice * quantity).toFixed(2);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  // Save / Load — declared here since these read `product` which is loaded
  // by the time we reach the JSX return below. Uses localStorage; later we
  // can swap to backend POST /api/designs.
  const SAVE_KEY = `customate.designs.${product?.sku || product?.id || 'default'}`;

  // List of saved snapshots for the toolbar's "Load" dropdown. Re-read from
  // localStorage on every render so it stays in sync without a useEffect.
  const savedSnapshots = (() => {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
    } catch {
      return [];
    }
  })();

  const handleSave = () => {
    try {
      const snapshot = {
        savedAt: new Date().toISOString(),
        productSku: product?.sku || product?.id || '',
        productName: product?.name,
        customization,
        designElements: designElementsRef.current,
        environment,
      };
      const existing = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      const next = [snapshot, ...existing].slice(0, 10);
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      addToast('Design saved locally', 'success');
      // Force a re-render so the load dropdown picks up the new snapshot
      setHistoryVersion((v) => v + 1);
      setLastSavedAt(new Date());
      setIsDirty(false);
    } catch {
      addToast('Could not save design', 'error');
    }
  };

  /**
   * Download the current 3D canvas as a high-quality PNG.
   *
   * Uses the existing canvas (preserveDrawingBuffer is on so the pixel
   * buffer hasn't been cleared). For higher resolution we could
   * temporarily bump devicePixelRatio and re-render, but for V1 we use
   * the canvas at its current size — already retina-aware via dpr={[1,2]}.
   */
  const handleDownload = () => {
    try {
      const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
      if (canvases.length === 0) {
        addToast('Canvas not ready', 'error');
        return;
      }
      // Largest canvas = the 3D render target
      const target = canvases.reduce((biggest, c) => (c.width * c.height) > (biggest.width * biggest.height) ? c : biggest);
      const url = target.toDataURL('image/png', 1.0);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `customate-${product?.sku || 'design'}-${ts}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      addToast('Design downloaded', 'success');
    } catch (err) {
      console.error('Download failed:', err);
      addToast('Could not download design', 'error');
    }
  };

  const handleLoad = (snapshot: any) => {
    try {
      if (snapshot.customization) {
        setCustomization((prev) => ({ ...prev, ...snapshot.customization }));
      }
      if (Array.isArray(snapshot.designElements)) {
        skipNextHistory.current = true;
        setDesignElements(snapshot.designElements);
      }
      if (snapshot.environment) setEnvironment(snapshot.environment);
      addToast(`Loaded design from ${new Date(snapshot.savedAt).toLocaleString()}`, 'success');
      setIsDirty(false); // Just-loaded state is "clean" relative to that snapshot
    } catch (err) {
      console.error('Load failed:', err);
      addToast('Could not load design', 'error');
    }
  };

  const handleDeleteSaved = (savedAt: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
      const next = existing.filter((s: any) => s.savedAt !== savedAt);
      localStorage.setItem(SAVE_KEY, JSON.stringify(next));
      setHistoryVersion((v) => v + 1);
      addToast('Saved design removed', 'info');
    } catch {
      addToast('Could not delete', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Top Navigation Bar — back, title, breadcrumb, save indicator, price + CTA */}
      <div className="h-14 md:h-16 bg-white border-b border-slate-200 flex items-center justify-between px-3 md:px-6 sticky top-0 z-30">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-9 h-9 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            title="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {/* Product avatar + title — breadcrumb hidden on mobile to save space */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="hidden sm:flex w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 items-center justify-center text-white shadow-sm shrink-0">
              <Box className="w-4 h-4" />
            </div>
            <div className="leading-tight min-w-0">
              <h1 className="text-sm font-bold text-slate-900 truncate">{product.name}</h1>
              <div className="hidden md:flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className="font-semibold">{product.category || 'Product'}</span>
                <span className="text-slate-300">›</span>
                <span className="font-semibold text-blue-600">Customization Studio</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Price card */}
          <div className="hidden md:flex flex-col items-end pr-4 border-r border-slate-200">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Estimated Total</p>
            <p className="text-base font-black text-slate-900 leading-none">{formatPeso(Number(totalPrice))}</p>
          </div>
          {user ? (
            <Button
              disabled={checkoutBlocked}
              title={checkoutBlocked ? 'Fix the print-quality errors before adding to cart' : undefined}
              className={`rounded-full px-6 font-bold shadow-lg transition-all ${
                checkoutBlocked
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : justAdded
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 hover:scale-105'
              }`}
              onClick={() => {
                if (checkoutBlocked) {
                  addToast('Fix the print-quality errors first.', 'error');
                  return;
                }
                // Capture the rendered design before it leaves the canvas.
                // We snapshot to a PNG data URL so production can see exactly
                // what the customer saw — and we serialize the design state
                // so the order can be re-rendered or re-printed later.
                let previewImage: string | undefined;
                try {
                  const canvas = document.querySelector(
                    'canvas',
                  ) as HTMLCanvasElement | null;
                  if (canvas) {
                    // 0.85 quality keeps the PNG below ~150 KB at canvas size.
                    previewImage = canvas.toDataURL('image/png');
                  }
                } catch (err) {
                  console.warn('Failed to snapshot design canvas:', err);
                }

                const isCustomized =
                  designElements.length > 0 ||
                  !!customization.text ||
                  !!customization.image ||
                  (customization.productColor &&
                    customization.productColor.toLowerCase() !== '#ffffff');

                const enrichedCustomization = {
                  ...customization,
                  isCustomized,
                  previewImage,
                  designConfig: {
                    baseColor: customization.productColor,
                    designElements,
                    snapshotAt: new Date().toISOString(),
                  },
                };

                addItem(product, enrichedCustomization, quantity);
                addToast(
                  isCustomized
                    ? 'Custom design saved & added to cart!'
                    : 'Added to cart!',
                  'success',
                );
                setJustAdded(true);
                setTimeout(() => setJustAdded(false), 2000);
              }}
            >
              {checkoutBlocked
                ? '⚠ Fix issues to continue'
                : justAdded
                ? '✓ Saved!'
                : 'Add to Cart'}
            </Button>
          ) : (
            <Link to="/login">
              <Button className="rounded-full px-6 font-bold shadow-lg shadow-orange-200 bg-orange-500 hover:bg-orange-600 hover:scale-105">
                <LogIn className="w-4 h-4 mr-2" />
                Login to Order
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Guest banner — only shown when NOT signed in. Friendly nudge that
          customization is free to try but ordering requires an account. */}
      {!user && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 border-b border-amber-100 px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs font-medium text-amber-900 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-white text-[10px] font-black">✨</span>
            You're trying as a guest — design freely. <span className="hidden sm:inline">Sign in to save your design and place an order.</span>
          </p>
          <Link
            to="/login"
            className="text-[11px] font-bold text-amber-900 underline underline-offset-2 hover:text-amber-700 whitespace-nowrap"
          >
            Sign in / Create account →
          </Link>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Toolbar — icon tabs with active highlight + indicator bar.
            Hidden on mobile (<md); replaced by bottom tab bar at end of file. */}
        <div className="hidden md:flex w-20 bg-gradient-to-b from-white via-slate-50/70 to-white border-r border-slate-200 flex-col items-center py-5 gap-1 z-20">
          {([
            { key: 'text' as const, Icon: Type, label: 'Text', tint: 'from-blue-500 to-indigo-600' },
            { key: 'image' as const, Icon: ImageIcon, label: 'Image', tint: 'from-violet-500 to-fuchsia-600' },
            { key: 'ai' as const, Icon: Wand2, label: 'AI', tint: 'from-fuchsia-500 to-pink-600' },
            { key: 'options' as const, Icon: Settings2, label: 'Options', tint: 'from-slate-500 to-slate-700' },
          ]).map(({ key, Icon, label, tint }) => {
            const active = activeSidebarTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveSidebarTab(key)}
                className={`relative w-full flex flex-col items-center gap-1.5 py-3 group transition-colors ${
                  active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
                }`}
                title={label}
                aria-label={label}
                aria-pressed={active}
              >
                {/* Active indicator pill on the left edge */}
                <span
                  className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all ${
                    active
                      ? `h-9 bg-gradient-to-b ${tint} shadow-sm`
                      : 'h-0 bg-transparent group-hover:h-4 group-hover:bg-slate-300'
                  }`}
                />
                <div
                  className={`p-2.5 rounded-2xl transition-all ${
                    active
                      ? `bg-gradient-to-br ${tint} text-white shadow-lg shadow-blue-200/50 scale-110`
                      : 'bg-transparent group-hover:bg-white group-hover:shadow-sm'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  active ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-700'
                }`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sidebar Controls.
            Desktop: always visible at w-80 on the left.
            Mobile: becomes a slide-up sheet — hidden when `mobileSheetOpen` is false,
            slides up from bottom when true. */}
        {/* Mobile backdrop — tap to dismiss */}
        {mobileSheetOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40 animate-[fadeIn_180ms_ease-out]"
            onClick={() => setMobileSheetOpen(false)}
          />
        )}
        <div
          className={`
            bg-white border-r border-slate-200 overflow-y-auto p-6 z-50
            md:relative md:w-80 md:translate-y-0 md:max-h-none
            fixed bottom-0 left-0 right-0 max-h-[75vh] rounded-t-3xl shadow-2xl
            transition-transform duration-300 ease-out
            ${mobileSheetOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
          `}
        >
          {/* Mobile drag handle + close */}
          <div className="md:hidden flex items-center justify-between mb-4 -mt-2">
            <div className="w-12 h-1 rounded-full bg-slate-300 mx-auto" />
            <button
              onClick={() => setMobileSheetOpen(false)}
              className="absolute right-4 top-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          {activeSidebarTab === 'text' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
              {/* Design Templates — one-click presets that wire font + color
                  + stroke + shadow + product color in a single bundle.
                  Lives at the top of the Text tab as the "I don't know where
                  to start" entry point. */}
              <TemplatesPanel
                onApply={(t) => {
                  setCustomization((prev) => ({ ...prev, ...t }));
                  setActiveDesignElement('text_1');
                  if (t.color) rememberColor(t.color);
                  if (t.productColor) rememberColor(t.productColor);
                  addToast('Template applied!', 'success');
                }}
              />

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-3 block">Your Message</label>
                <Textarea
                  placeholder="Type something amazing..."
                  value={customization.text}
                  onChange={(e) => {
                    setCustomization({ ...customization, text: e.target.value });
                    setActiveDesignElement('text_1');
                  }}
                  className="min-h-[100px] text-sm border-slate-200 focus:ring-blue-500 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 block">Font Style</label>
                  <Select
                    options={fontOptions}
                    value={customization.font}
                    onChange={(e) => {
                      setCustomization({ ...customization, font: e.target.value });
                      setActiveDesignElement('text_1');
                    }}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 block">Size</label>
                  <input
                    type="number"
                    value={customization.textSize}
                    onChange={(e) => {
                      setCustomization({ ...customization, textSize: Number(e.target.value), textScale: Math.max(0.2, Number(e.target.value) / 24) });
                      setActiveDesignElement('text_1');
                    }}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 block">Color</label>
                  <div className="flex items-center gap-2 h-10 border border-slate-200 rounded-lg px-2">
                    <input
                      type="color"
                      value={customization.color}
                      onChange={(e) => {
                        setCustomization({ ...customization, color: e.target.value });
                        setActiveDesignElement('text_1');
                      }}
                      onBlur={(e) => rememberColor(e.target.value)}
                      className="w-6 h-6 rounded-md border-none cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-slate-500 uppercase">{customization.color}</span>
                  </div>
                  {/* Recently-used color swatches — persistent across sessions */}
                  {recentColors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Recent</p>
                      <div className="flex flex-wrap gap-1">
                        {recentColors.map((c) => (
                          <button
                            key={c}
                            onClick={() => {
                              setCustomization({ ...customization, color: c });
                              setActiveDesignElement('text_1');
                              rememberColor(c);
                            }}
                            className={`w-5 h-5 rounded-md border-2 transition-transform hover:scale-110 ${
                              customization.color.toLowerCase() === c.toLowerCase()
                                ? 'border-blue-600 ring-1 ring-blue-200'
                                : 'border-white shadow-sm'
                            }`}
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 block">Rotation</label>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={customization.textRotation}
                    onChange={(e) => {
                      setCustomization({ ...customization, textRotation: Number(e.target.value) });
                      setActiveDesignElement('text_1');
                    }}
                    className="w-full h-10 accent-blue-600"
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-4 block">Positioning</label>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">HORIZONTAL</span>
                      <span className="text-[10px] text-blue-600 font-bold">{customization.textPosition.x}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={customization.textPosition.x}
                      onChange={(e) => setCustomization({ 
                        ...customization, 
                        textPosition: { ...customization.textPosition, x: Number(e.target.value) } 
                      })}
                      onMouseDown={() => setActiveDesignElement('text_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">VERTICAL</span>
                      <span className="text-[10px] text-blue-600 font-bold">{customization.textPosition.y}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      value={customization.textPosition.y}
                      onChange={(e) => setCustomization({ 
                        ...customization, 
                        textPosition: { ...customization.textPosition, y: Number(e.target.value) } 
                      })}
                      onMouseDown={() => setActiveDesignElement('text_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>

                {/* Z-Position (Depth) Control */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-semibold tracking-wide">SURFACE OFFSET</span>
                    <span className="text-[10px] text-blue-600 font-bold">{customization.textPosition.z}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    value={customization.textPosition.z}
                    onChange={(e) => setCustomization({ 
                      ...customization, 
                      textPosition: { ...customization.textPosition, z: Number(e.target.value) } 
                    })}
                    onMouseDown={() => setActiveDesignElement('text_1')}
                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-purple-600"
                  />
                </div>

                {/* Scale Control */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-semibold tracking-wide">SCALE</span>
                    <span className="text-[10px] text-blue-600 font-bold">{customization.textScale}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={customization.textScale}
                    onChange={(e) => setCustomization({
                      ...customization,
                      textScale: Number(e.target.value)
                    })}
                    onMouseDown={() => setActiveDesignElement('text_1')}
                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-green-600"
                  />
                </div>
              </div>

              {/* ─── Text effects: stroke, shadow, letter-spacing ─────── */}
              {customization.text && (
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-fuchsia-600" />
                    <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Text Effects</h3>
                  </div>

                  {/* Stroke (outline) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">OUTLINE WIDTH</span>
                      <span className="text-[10px] text-fuchsia-600 font-bold">{customization.textStroke ?? 0}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="6"
                      step="0.5"
                      value={customization.textStroke ?? 0}
                      onChange={(e) => setCustomization({ ...customization, textStroke: Number(e.target.value) })}
                      onMouseDown={() => setActiveDesignElement('text_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-fuchsia-600"
                    />
                  </div>

                  {/* Stroke color */}
                  {(customization.textStroke ?? 0) > 0 && (
                    <div>
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide block mb-1">OUTLINE COLOR</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={customization.textStrokeColor || '#ffffff'}
                          onChange={(e) => setCustomization({ ...customization, textStrokeColor: e.target.value })}
                          onBlur={(e) => rememberColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                        />
                        <input
                          type="text"
                          value={customization.textStrokeColor || '#ffffff'}
                          onChange={(e) => setCustomization({ ...customization, textStrokeColor: e.target.value })}
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono font-bold uppercase"
                        />
                      </div>
                      {recentColors.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {recentColors.map((c) => (
                            <button
                              key={c}
                              onClick={() => setCustomization({ ...customization, textStrokeColor: c })}
                              className="w-4 h-4 rounded border border-white shadow-sm hover:scale-110 transition-transform"
                              style={{ backgroundColor: c }}
                              title={c}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Drop shadow */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">SHADOW BLUR</span>
                      <span className="text-[10px] text-fuchsia-600 font-bold">{customization.textShadow ?? 0}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={customization.textShadow ?? 0}
                      onChange={(e) => setCustomization({ ...customization, textShadow: Number(e.target.value) })}
                      onMouseDown={() => setActiveDesignElement('text_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-fuchsia-600"
                    />
                  </div>

                  {/* Letter spacing */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">LETTER SPACING</span>
                      <span className="text-[10px] text-fuchsia-600 font-bold">{customization.textLetterSpacing ?? 0}px</span>
                    </div>
                    <input
                      type="range"
                      min="-5"
                      max="20"
                      step="0.5"
                      value={customization.textLetterSpacing ?? 0}
                      onChange={(e) => setCustomization({ ...customization, textLetterSpacing: Number(e.target.value) })}
                      onMouseDown={() => setActiveDesignElement('text_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-fuchsia-600"
                    />
                  </div>

                  {/* Preset chips for quick application */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      onClick={() => setCustomization({ ...customization, textStroke: 2, textStrokeColor: '#ffffff', textShadow: 4, textShadowColor: '#000000' })}
                      className="px-2 py-1.5 rounded-md text-[10px] font-bold text-slate-700 bg-white border border-slate-200 hover:border-fuchsia-300 transition"
                    >
                      Stadium
                    </button>
                    <button
                      onClick={() => setCustomization({ ...customization, textStroke: 0, textStrokeColor: '#ffffff', textShadow: 8, textShadowColor: '#000000' })}
                      className="px-2 py-1.5 rounded-md text-[10px] font-bold text-slate-700 bg-white border border-slate-200 hover:border-fuchsia-300 transition"
                    >
                      Soft
                    </button>
                    <button
                      onClick={() => setCustomization({ ...customization, textStroke: 0, textStrokeColor: '#ffffff', textShadow: 0, textShadowColor: '#000000', textLetterSpacing: 0 })}
                      className="px-2 py-1.5 rounded-md text-[10px] font-bold text-slate-700 bg-white border border-slate-200 hover:border-fuchsia-300 transition"
                    >
                      Clean
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSidebarTab === 'image' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
              {/* Print-quality panel — always visible on the image tab so the
                  customer knows immediately if their upload is too small.
                  When the design is clean we show a green "Print-ready" tile. */}
              <DesignQualityPanel issues={qualityIssues} />

              {/* Sticker-mode hint banner — sets the expectation that
                  uploaded/AI images get their backgrounds removed
                  automatically. Sells the magic before they even act. */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 border border-fuchsia-200 p-3.5">
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-fuchsia-200/40 blur-2xl pointer-events-none" />
                <div className="relative flex items-start gap-2.5">
                  <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 flex items-center justify-center text-white shadow-md shadow-fuchsia-200">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black text-slate-900 leading-tight">Smart Sticker Mode</p>
                    <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                      Upload anything — we'll auto-remove white backgrounds so it lands clean. Use Refine for full control.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Shapes — built-in library that renders to PNG and
                  applies like an uploaded image. One-click variety. */}
              <ShapesPanel
                initialColor={customization.color}
                onApply={(dataUrl) => {
                  setCustomization({ ...customization, image: dataUrl });
                  setActiveDesignElement('image_1');
                  rememberColor(customization.color);
                  addToast('Shape added — drag to position', 'success');
                }}
              />

              <FileUpload
                currentImage={customization.image}
                onUpload={async (url: string, thumbnailUrl: string) => {
                  // Auto-detect solid-colour backgrounds and convert to
                  // transparent sticker before applying. No-op if the image
                  // already has transparency or looks like a photo.
                  setCustomization({ ...customization, image: url });
                  setActiveDesignElement('image_1');
                  addToast('Design uploaded — analyzing…', 'success');
                  try {
                    const result = await autoStickerize(url);
                    if (result.changed) {
                      setCustomization((prev) => ({ ...prev, image: result.dataUrl }));
                      addToast('✨ Background auto-removed — looks like a sticker!', 'success');
                    }
                  } catch (err) {
                    // Auto-stickerize is best-effort; original upload still works.
                    console.warn('autoStickerize failed', err);
                  }
                }}
                onClear={() => {
                  setCustomization({ ...customization, image: '' });
                  setActiveDesignElement(activeDesignElement === 'image_1' ? null : activeDesignElement);
                }}
              />

              {customization.image && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Artwork Controls</h3>
                    <button
                      onClick={() => setCustomization({ ...customization, image: '' })}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Refine image — opens the in-browser image editor: bg
                      removal, crop, feather, color polish. The single most
                      important upload-quality lever. */}
                  <button
                    onClick={() => setRefineModalOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black text-white bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-600 hover:from-violet-700 hover:via-fuchsia-700 hover:to-pink-700 shadow-lg shadow-fuchsia-200 hover:shadow-xl transition-all hover:-translate-y-0.5"
                  >
                    <Wand2 className="w-4 h-4" />
                    Refine Image
                    <span className="ml-1 text-[9px] font-black bg-white/25 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Sticker</span>
                  </button>
                  <div className="grid grid-cols-2 gap-2 -mt-3">
                    <button
                      onClick={() => setRefineModalOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-violet-300 transition"
                    >
                      <Eraser className="w-3 h-3 text-violet-600" />
                      Remove BG
                    </button>
                    <button
                      onClick={() => setRefineModalOpen(true)}
                      className="inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:border-blue-300 transition"
                    >
                      <CropIcon className="w-3 h-3 text-blue-600" />
                      Crop
                    </button>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-slate-500 font-semibold tracking-wide">HORIZONTAL</span>
                        <span className="text-[10px] text-blue-600 font-bold">{customization.imagePosition.x}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={customization.imagePosition.x}
                        onChange={(e) => setCustomization({ 
                          ...customization, 
                          imagePosition: { ...customization.imagePosition, x: Number(e.target.value) } 
                        })}
                        onMouseDown={() => setActiveDesignElement('image_1')}
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-slate-500 font-semibold tracking-wide">VERTICAL</span>
                        <span className="text-[10px] text-blue-600 font-bold">{customization.imagePosition.y}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={customization.imagePosition.y}
                        onChange={(e) => setCustomization({ 
                          ...customization, 
                          imagePosition: { ...customization.imagePosition, y: Number(e.target.value) } 
                        })}
                        onMouseDown={() => setActiveDesignElement('image_1')}
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  </div>

                  {/* Z-Position (Depth) Control */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">SURFACE OFFSET</span>
                      <span className="text-[10px] text-blue-600 font-bold">{customization.imagePosition.z}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={customization.imagePosition.z}
                      onChange={(e) => setCustomization({ 
                        ...customization, 
                        imagePosition: { ...customization.imagePosition, z: Number(e.target.value) } 
                      })}
                      onMouseDown={() => setActiveDesignElement('image_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-purple-600"
                    />
                  </div>

                  {/* Scale Control */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">SCALE</span>
                      <span className="text-[10px] text-blue-600 font-bold">{customization.imageScale}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={customization.imageScale}
                      onChange={(e) => setCustomization({ 
                        ...customization, 
                        imageScale: Number(e.target.value) 
                      })}
                      onMouseDown={() => setActiveDesignElement('image_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-green-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">ROTATION</span>
                      <span className="text-[10px] text-blue-600 font-bold">{customization.imageRotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={customization.imageRotation}
                      onChange={(e) => setCustomization({
                        ...customization,
                        imageRotation: Number(e.target.value)
                      })}
                      onMouseDown={() => setActiveDesignElement('image_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>

                  {/* Opacity */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-semibold tracking-wide">OPACITY</span>
                      <span className="text-[10px] text-blue-600 font-bold">{Math.round((customization.imageOpacity ?? 1) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={customization.imageOpacity ?? 1}
                      onChange={(e) => setCustomization({ ...customization, imageOpacity: Number(e.target.value) })}
                      onMouseDown={() => setActiveDesignElement('image_1')}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>

                  {/* Mirror / Flip controls */}
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold tracking-wide mb-1.5">MIRROR</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setCustomization({ ...customization, imageFlipX: !customization.imageFlipX })}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition ${
                          customization.imageFlipX
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                        }`}
                      >
                        <span style={{ display: 'inline-block', transform: 'scaleX(-1)' }}>↔</span>
                        Flip H
                      </button>
                      <button
                        onClick={() => setCustomization({ ...customization, imageFlipY: !customization.imageFlipY })}
                        className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition ${
                          customization.imageFlipY
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-blue-300'
                        }`}
                      >
                        <span style={{ display: 'inline-block', transform: 'rotate(90deg)' }}>↔</span>
                        Flip V
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSidebarTab === 'ai' && (
            <div className="animate-in fade-in slide-in-from-left-2 duration-300">
              <AIDesignAssistant
                productCategory={product?.category}
                onApply={async (dataUrl, meta) => {
                  // Apply the generated image as the decal. Switch to the
                  // Image tab so the user can position/scale it immediately.
                  setCustomization((prev) => ({ ...prev, image: dataUrl }));
                  setActiveDesignElement('image_1');
                  setActiveSidebarTab('image');
                  addToast(`AI design applied (${meta.style})`, 'success');
                  // Gemini almost always returns a solid white background.
                  // Run auto-stickerize so the decal lands transparent and
                  // sticker-shaped instead of as a square white tile.
                  try {
                    const result = await autoStickerize(dataUrl);
                    if (result.changed) {
                      setCustomization((prev) => ({ ...prev, image: result.dataUrl }));
                      addToast('✨ Background auto-removed', 'success');
                    }
                  } catch (err) {
                    console.warn('autoStickerize failed', err);
                  }
                }}
              />
            </div>
          )}

          {activeSidebarTab === 'options' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-3 block">Product Color</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { name: 'White', value: '#ffffff' },
                    { name: 'Black', value: '#1a1a1a' },
                    { name: 'Navy', value: '#1e3a5f' },
                    { name: 'Red', value: '#dc2626' },
                    { name: 'Blue', value: '#2563eb' },
                    { name: 'Green', value: '#16a34a' },
                    { name: 'Yellow', value: '#facc15' },
                    { name: 'Pink', value: '#ec4899' },
                  ].map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCustomization({ ...customization, productColor: c.value })}
                      className={`h-12 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                        customization.productColor === c.value 
                          ? 'border-blue-600 ring-2 ring-blue-200 shadow-lg' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      style={{ backgroundColor: c.value }}
                    >
                      <span className={`text-[9px] font-bold ${c.value === '#ffffff' ? 'text-slate-700' : 'text-white/90'}`}>
                        {c.name}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="color"
                    value={customization.productColor || '#ffffff'}
                    onChange={(e) => setCustomization({ ...customization, productColor: e.target.value })}
                    onBlur={(e) => rememberColor(e.target.value)}
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-500 uppercase">{customization.productColor || '#ffffff'}</span>
                </div>
                {recentColors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Your recent colors</p>
                    <div className="flex flex-wrap gap-1.5">
                      {recentColors.map((c) => (
                        <button
                          key={c}
                          onClick={() => setCustomization({ ...customization, productColor: c })}
                          className={`w-6 h-6 rounded-md border-2 transition-transform hover:scale-110 ${
                            (customization.productColor || '').toLowerCase() === c.toLowerCase()
                              ? 'border-blue-600 ring-1 ring-blue-200'
                              : 'border-white shadow-sm'
                          }`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-3 block">Product Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {['XS', 'S', 'M', 'L', 'XL', '2XL'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setCustomization({ ...customization, size: s })}
                      className={`h-10 rounded-xl text-xs font-bold transition-all border-2 ${
                        customization.size === s 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                          : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-3 block">Print Placement</label>
                <Select
                  options={placementOptions}
                  value={customization.placement}
                  onChange={(e) => setCustomization({ ...customization, placement: e.target.value })}
                  className="rounded-xl border-slate-200"
                />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-3 block">Order Quantity</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="flex-1 h-10 border border-slate-200 rounded-xl text-center font-bold text-slate-700"
                  />
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Canvas Area — full width on mobile, with bottom padding for the
            mobile tab bar; constrained next to sidebar on md+. */}
        <div
          ref={studioContainerRef}
          className="flex-1 relative flex items-center justify-center p-4 md:p-8 pb-20 md:pb-8 overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/40"
        >
          {/* ─── Studio backdrop layers ─────────────────────────────────────
              Three stacked decorative layers behind the 3D canvas to make
              the workspace feel like a real product-photography studio
              instead of a flat grey rectangle. All pointer-events: none
              so they never interfere with orbit / drag interactions.
          ─────────────────────────────────────────────────────────────── */}
          {/* Soft coloured blobs — slow ambient motion gives the area life
              without distracting from the product. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-24 -left-32 w-[420px] h-[420px] rounded-full bg-blue-300/25 blur-3xl animate-pulse-slow" />
            <div className="absolute top-1/3 -right-24 w-[360px] h-[360px] rounded-full bg-fuchsia-300/20 blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }} />
            <div className="absolute -bottom-24 left-1/3 w-[460px] h-[460px] rounded-full bg-indigo-300/25 blur-3xl animate-pulse-slow" style={{ animationDelay: '4s' }} />
          </div>
          {/* Subtle dot grid for depth — barely visible but adds texture. */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'radial-gradient(circle at center, rgba(15, 23, 42, 0.35) 1px, transparent 1.5px)',
              backgroundSize: '24px 24px',
              maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.95) 30%, rgba(0,0,0,0) 80%)',
              WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.95) 30%, rgba(0,0,0,0) 80%)',
            }}
          />
          {/* Centered spotlight halo — lifts the product visually. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.6) 30%, rgba(255,255,255,0) 60%)',
            }}
          />
          {/* Floor shadow strip — anchors the product to the ground plane. */}
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[12%] w-[60%] max-w-[600px] h-12 rounded-[100%] bg-slate-900/15 blur-2xl"
            aria-hidden="true"
          />

          {/* Pro Studio floating toolbar — environment, camera, showcase,
              history, save, layers, fullscreen. Lives on top of the 3D scene. */}
          {isPreview3D && (
            <ProStudioToolbar
              environment={environment}
              setEnvironment={setEnvironment}
              cameraPreset={cameraPreset}
              // Clicking the same preset twice toggles back to free orbit —
              // intuitive way to release the camera without an explicit
              // "Free orbit" entry being the only way out.
              setCameraPreset={(c) => setCameraPreset(c === cameraPreset ? null : c)}
              autoRotate={autoRotate}
              setAutoRotate={setAutoRotate}
              isFullscreen={isFullscreen}
              toggleFullscreen={toggleFullscreen}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onSave={handleSave}
              onLoad={handleLoad}
              savedSnapshots={savedSnapshots}
              onDeleteSaved={handleDeleteSaved}
              layersOpen={layersOpen}
              setLayersOpen={setLayersOpen}
              layerCount={designElements.length}
              onDownload={handleDownload}
              lastSavedAt={lastSavedAt}
            />
          )}

          {/* Layers panel — floats to the right when open */}
          {isPreview3D && layersOpen && (
            <LayersPanel
              elements={designElements}
              activeId={activeDesignElement}
              onSelect={setActiveDesignElement}
              onChange={(els) => {
                handleDesignChange(els);
              }}
              onClose={() => setLayersOpen(false)}
            />
          )}

          {/* Canvas Tools Overlay — view toggle + rotation + zoom in one polished pill */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center bg-white/90 backdrop-blur-md rounded-2xl border border-slate-200/70 shadow-xl z-20 overflow-hidden">
            {/* 2D / 3D toggle as a segmented control */}
            <div className="flex items-center p-1 m-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => setIsPreview3D(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isPreview3D
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                3D
              </button>
              <button
                onClick={() => setIsPreview3D(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  !isPreview3D
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                2D
              </button>
            </div>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            {/* Swap front/back */}
            <button
              onClick={() => setView(view === 'front' ? 'back' : 'front')}
              className="flex items-center gap-1.5 px-3 py-2.5 mx-1 rounded-xl hover:bg-slate-100 transition-colors text-xs font-bold text-slate-700"
              title={`Show ${view === 'front' ? 'back' : 'front'}`}
            >
              <RotateCw className="w-3.5 h-3.5" />
              {view === 'front' ? 'Back' : 'Front'}
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            {/* Zoom */}
            <div className="flex items-center gap-2 px-3 py-1 mr-1">
              <ZoomIn className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="range"
                min="50"
                max="150"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-24 h-1 accent-blue-600 cursor-pointer"
              />
              <span className="text-[11px] font-bold text-slate-700 w-9 text-right">{zoom}%</span>
            </div>

            <div className="w-px h-6 bg-slate-200 mx-1" />

            {/* AI Tips — vision-based critique of the current design.
                Only shown for signed-in users (the endpoint is auth-only). */}
            {user && (
              <button
                onClick={() => setCritiqueOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 mx-1 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-500 hover:opacity-95 shadow-sm shadow-purple-500/20 transition"
                title="Get AI tips on your design"
              >
                <Wand2 className="w-3.5 h-3.5" />
                AI Tips
              </button>
            )}

            {/* AI Lifestyle Preview — capture the canvas right now, then open
                the mockup modal. Snapshot is taken at click-time so we get
                the design as the customer just left it (not stale state). */}
            {user && (
              <button
                onClick={() => {
                  const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
                  if (canvas) {
                    try {
                      setMockupSnapshot(canvas.toDataURL('image/png'));
                    } catch (err) {
                      console.warn('Snapshot failed', err);
                    }
                  }
                  setMockupOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2.5 mx-1 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-fuchsia-500 to-pink-600 hover:opacity-95 shadow-sm shadow-pink-500/20 transition"
                title="See your design as a real product photo"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Lifestyle Preview
              </button>
            )}

            {/* Snapshot — download a clean PNG of the current 3D scene. */}
            <button
              onClick={handleSnapshot}
              className="flex items-center gap-1.5 px-3 py-2.5 mx-1 rounded-xl text-xs font-bold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 hover:border-blue-300 shadow-sm transition"
              title="Download a high-resolution PNG of your design"
            >
              <Save className="w-3.5 h-3.5 text-blue-600" />
              Snapshot
            </button>

            {/* Share — open native share or copy image to clipboard. */}
            <button
              onClick={handleShareSnapshot}
              className="flex items-center gap-1.5 px-3 py-2.5 mx-1 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 shadow-sm shadow-blue-500/20 transition"
              title="Share your design"
            >
              <Upload className="w-3.5 h-3.5" />
              Share
            </button>
          </div>

          {/* Reset + Shortcuts — bottom-right floating controls */}
          <div className="absolute bottom-6 right-6 z-20 flex items-center gap-2">
            <button
              onClick={() => setShortcutsOpen(true)}
              className="w-9 h-9 rounded-full bg-white hover:bg-slate-50 border border-slate-200 shadow-md text-slate-700 transition-all hover:scale-105 text-base font-black"
              title="Keyboard shortcuts (?)"
            >
              ?
            </button>
            <button
              onClick={() => {
                setCustomization({
                  ...customization,
                  textPosition: { x: 50, y: 50, z: 0 },
                  imagePosition: { x: 50, y: 50, z: 0 },
                  textRotation: 0,
                  textSize: 24,
                  textScale: 1,
                  imageScale: 1,
                  imageRotation: 0,
                  textSurface: undefined,
                  imageSurface: undefined,
                });
                setZoom(100);
              }}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 px-3 py-2 rounded-full border border-slate-200 shadow-md text-xs font-bold text-slate-700 transition-all hover:scale-105"
              title="Reset canvas to default"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>

          {/* Keyboard shortcuts popover */}
          {shortcutsOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShortcutsOpen(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-blue-50/30">
                  <h3 className="font-black text-slate-900 tracking-tight">Keyboard Shortcuts</h3>
                  <button
                    onClick={() => setShortcutsOpen(false)}
                    className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                  >
                    ×
                  </button>
                </div>
                <div className="p-5 space-y-3 text-sm">
                  {[
                    { keys: ['Ctrl', 'Z'], action: 'Undo last change' },
                    { keys: ['Ctrl', 'Y'], action: 'Redo' },
                    { keys: ['↑ ↓ ← →'], action: 'Nudge active element (1%)' },
                    { keys: ['Shift', '↑ ↓ ← →'], action: 'Nudge faster (5%)' },
                    { keys: ['+ / -'], action: 'Scale active element' },
                    { keys: ['R'], action: 'Rotate +15°' },
                    { keys: ['Shift', 'R'], action: 'Rotate -15°' },
                    { keys: ['F'], action: 'Toggle fullscreen' },
                    { keys: ['Delete'], action: 'Remove active layer' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        {s.keys.map((k, j) => (
                          <kbd
                            key={j}
                            className="px-2 py-0.5 text-[10px] font-bold font-mono text-slate-700 bg-slate-100 border border-slate-200 rounded-md shadow-sm"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                      <span className="text-xs text-slate-600 font-semibold text-right">{s.action}</span>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 leading-snug">
                  Shortcuts are ignored while typing in a text input or textarea.
                </div>
              </div>
            </div>
          )}

          {/* Product Canvas - 3D Preview Panel */}
          <div 
            className="w-full h-full max-w-4xl max-h-[80vh] transition-all duration-500 ease-out flex items-center justify-center relative"
            style={{ transform: !isPreview3D ? `scale(${zoom / 100})` : 'none' }}
          >
            {isPreview3D ? (
              <div className="w-full h-[500px] md:h-[600px] relative">
                {/* Precision mode toggle — single button, no redundant 3D label */}
                <div className="absolute top-4 left-4 z-10">
                  <button
                    onClick={() => setPrecisionMode(!precisionMode)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold shadow-md transition-all hover:scale-105 ${
                      precisionMode
                        ? 'bg-gradient-to-br from-purple-500 to-purple-700 text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title="Toggle precision mode for accurate design placement"
                  >
                    <Move className="w-3.5 h-3.5" />
                    {precisionMode ? 'Precision: On' : 'Precision Mode'}
                  </button>
                </div>
                <ErrorBoundary>
                  <WebGLCheck>
                    <ProductCustomizer3D
                      // Concatenate every identifier we have so the type
                      // resolver can match against the most specific signal
                      // (name often contains "Hand Fan", "Tumbler", etc. even
                      // when the category is just "Accessories" / "Drinkware").
                      productType={[product?.type, product?.name, product?.category, product?.sku]
                        .filter(Boolean)
                        .join(' ') || 'default'}
                      productName={product?.name}
                      productColor={customization.productColor}
                      view={view}
                      placement={customization.placement}
                      onDesignChange={handleDesignChange}
                      initialElements={designElements}
                      activeElement={activeDesignElement}
                      onActiveElementChange={setActiveDesignElement}
                      environment={environment}
                      cameraPreset={cameraPreset}
                      autoRotate={autoRotate}
                    />
                  </WebGLCheck>
                </ErrorBoundary>
              </div>
            ) : (
              <div className="relative group">
                {/* Product Base Image */}
                <img
                  src={product.image}
                  alt="Product Base"
                  className="max-w-full max-h-[70vh] object-contain drop-shadow-2xl select-none pointer-events-none"
                />
                
                {/* Placement Area Boundary (Visual Guide) */}
                <div className="absolute top-[20%] left-[20%] right-[20%] bottom-[25%] border-2 border-dashed border-blue-400/20 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />

                {/* Design Elements Container */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Custom Text */}
                  {customization.text && (
                    <div
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-auto group/text"
                      style={{
                        left: `${customization.textPosition.x}%`,
                        top: `${customization.textPosition.y}%`,
                        fontFamily: customization.font,
                        color: customization.color,
                        fontSize: `${customization.textSize}px`,
                        fontWeight: 'bold',
                        transform: `translate(-50%, -50%) rotate(${customization.textRotation}deg)`,
                        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        maxWidth: '80%',
                        wordBreak: 'break-word',
                        cursor: 'move'
                      }}
                    >
                      {customization.text}
                      <div className="absolute -inset-2 border-2 border-blue-500 rounded-sm opacity-0 group-hover/text:opacity-100 pointer-events-none" />
                    </div>
                  )}

                  {/* Custom Image */}
                  {customization.image && (
                    <div
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-auto group/img"
                      style={{
                        left: `${customization.imagePosition.x}%`,
                        top: `${customization.imagePosition.y}%`,
                        width: '100px',
                        height: 'auto',
                        cursor: 'move'
                      }}
                    >
                      <img 
                        src={customization.image} 
                        alt="Custom Overlay" 
                        className="w-full h-auto drop-shadow-md"
                      />
                      <div className="absolute -inset-2 border-2 border-blue-500 rounded-sm opacity-0 group-hover/img:opacity-100 pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        {/* DesignControlPanelComplete removed — duplicated the left sidebar
            (Text/Image inputs). If a multi-element manager or icon library
            is needed later, re-add it as a popover triggered from the canvas
            toolbar to avoid duplication. */}
        </div>
      </div>

      {/* Mobile bottom tab bar — replaces the left rail on small screens.
          Tapping a tab opens the sidebar sheet for that section. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-around h-16 px-2">
          {([
            { key: 'text' as const, Icon: Type, label: 'Text' },
            { key: 'image' as const, Icon: ImageIcon, label: 'Image' },
            { key: 'ai' as const, Icon: Wand2, label: 'AI' },
            { key: 'options' as const, Icon: Settings2, label: 'Options' },
          ]).map(({ key, Icon, label }) => {
            const active = activeSidebarTab === key && mobileSheetOpen;
            return (
              <button
                key={key}
                onClick={() => {
                  setActiveSidebarTab(key);
                  setMobileSheetOpen(true);
                }}
                className={`flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-xl transition-colors ${
                  active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Design Critique modal — captures the 3D canvas and asks Gemini Vision
          for 3 design tips. The snapshot is taken from the canvas ref so we
          send only the rendered preview, not any surrounding chrome. */}
      <AIDesignCritique
        isOpen={critiqueOpen}
        onClose={() => setCritiqueOpen(false)}
        productName={product?.name}
        designContext={[
          customization.text && `text "${customization.text}"`,
          customization.image && 'an uploaded image',
          customization.productColor && `product color ${customization.productColor}`,
        ].filter(Boolean).join(', ')}
        captureSnapshot={async () => {
          // Find the largest visible <canvas> on the page — that's the R3F
          // render target. We can't rely on a specific ref because canvasRef
          // doesn't wrap the customizer. preserveDrawingBuffer is enabled on
          // the R3F canvas so toDataURL returns the actual pixels (not blank).
          const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
          if (canvases.length === 0) return null;
          // Pick the largest by area — text-tools sometimes draw to a tiny
          // helper canvas that would produce a useless snapshot.
          const target = canvases.reduce((biggest, c) => {
            const a = c.width * c.height;
            const b = biggest.width * biggest.height;
            return a > b ? c : biggest;
          });
          try {
            // Brief delay so any pending Three render commits to the buffer
            await new Promise((r) => requestAnimationFrame(r));
            return target.toDataURL('image/png');
          } catch (err) {
            console.warn('Snapshot failed:', err);
            return null;
          }
        }}
      />

      {/* AI Lifestyle Mockup modal — takes the canvas snapshot captured when
          the user clicked the button and asks Gemini to re-render it as a
          photo-realistic scene with the product in context. */}
      <AIMockupModal
        open={mockupOpen}
        onClose={() => setMockupOpen(false)}
        designImage={mockupSnapshot}
        productType={product?.category?.toLowerCase() || product?.type || 'shirt'}
        productName={product?.name}
      />

      {/* fadeIn keyframe for the mobile backdrop animation +
          slow-pulse for the studio backdrop blobs. */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.08); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 9s ease-in-out infinite;
        }
      `}</style>

      <ImageRefineModal
        isOpen={refineModalOpen}
        onClose={() => setRefineModalOpen(false)}
        imageDataUrl={customization.image}
        onApply={(newUrl) => {
          setCustomization((prev) => ({ ...prev, image: newUrl }));
          addToast('Image refined and applied!', 'success');
        }}
      />
    </div>
  );
}
