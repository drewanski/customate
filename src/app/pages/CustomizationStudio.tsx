import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Textarea } from '../components/Textarea';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { apiRequest } from '../api';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { RotateCw, ZoomIn, Upload, Save, ChevronLeft, ChevronRight, Type, Image as ImageIcon, Settings2, Trash2, Maximize2, Move, LogIn, Box } from 'lucide-react';
import { Product3DViewer } from '../components/Product3DViewer';
import { ToastContainer, ToastType } from '../components/Toast';
import { FileUpload } from '../components/FileUpload';
import { formatPeso } from '../utils/format';

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
  const [activeSidebarTab, setActiveSidebarTab] = useState<'text' | 'image' | 'options'>('text');
  const [isPreview3D, setIsPreview3D] = useState(false);
  const [precisionMode, setPrecisionMode] = useState(false);
  
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
  });

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    apiRequest(`/inventory/${productId}`)
      .then((data) => {
        setProduct(data);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Loading Studio...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return <div className="max-w-7xl mx-auto px-4 py-8">Product not found</div>;
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

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Top Navigation Bar */}
      <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="rounded-full w-8 h-8 p-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-tight">{product.name}</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Customization Studio</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden md:flex flex-col items-end mr-2">
            <p className="text-[10px] text-slate-400 font-bold uppercase">Estimated Total</p>
            <p className="text-sm font-black text-blue-600 leading-none">{formatPeso(Number(totalPrice))}</p>
          </div>
          {user ? (
            <Button 
              className="rounded-full px-6 font-bold shadow-lg shadow-blue-200"
              onClick={() => {
                addItem(product, customization, quantity);
                addToast('Design added to cart!', 'success');
                setJustAdded(true);
                setTimeout(() => setJustAdded(false), 2000);
              }}
            >
              {justAdded ? 'Saved!' : 'Add to Cart'}
            </Button>
          ) : (
            <Link to="/login">
              <Button className="rounded-full px-6 font-bold shadow-lg shadow-blue-200 bg-orange-500 hover:bg-orange-600">
                <LogIn className="w-4 h-4 mr-2" />
                Login to Order
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar - Mobile Bottom / Desktop Left */}
        <div className="w-20 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 z-20">
          <button 
            onClick={() => setActiveSidebarTab('text')}
            className={`flex flex-col items-center gap-1.5 transition-colors ${activeSidebarTab === 'text' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <div className={`p-3 rounded-2xl transition-all ${activeSidebarTab === 'text' ? 'bg-blue-50' : 'bg-transparent'}`}>
              <Type className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Text</span>
          </button>
          
          <button 
            onClick={() => setActiveSidebarTab('image')}
            className={`flex flex-col items-center gap-1.5 transition-colors ${activeSidebarTab === 'image' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <div className={`p-3 rounded-2xl transition-all ${activeSidebarTab === 'image' ? 'bg-blue-50' : 'bg-transparent'}`}>
              <ImageIcon className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Image</span>
          </button>

          <button 
            onClick={() => setActiveSidebarTab('options')}
            className={`flex flex-col items-center gap-1.5 transition-colors ${activeSidebarTab === 'options' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <div className={`p-3 rounded-2xl transition-all ${activeSidebarTab === 'options' ? 'bg-blue-50' : 'bg-transparent'}`}>
              <Settings2 className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Options</span>
          </button>
        </div>

        {/* Sidebar Controls */}
        <div className="w-80 bg-white border-r border-slate-200 overflow-y-auto p-6 z-10">
          {activeSidebarTab === 'text' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Your Message</label>
                <Textarea
                  placeholder="Type something amazing..."
                  value={customization.text}
                  onChange={(e) => setCustomization({ ...customization, text: e.target.value })}
                  className="min-h-[100px] text-sm border-slate-200 focus:ring-blue-500 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Font Style</label>
                  <Select
                    options={fontOptions}
                    value={customization.font}
                    onChange={(e) => setCustomization({ ...customization, font: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Size</label>
                  <input
                    type="number"
                    value={customization.textSize}
                    onChange={(e) => setCustomization({ ...customization, textSize: Number(e.target.value) })}
                    className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Color</label>
                  <div className="flex items-center gap-2 h-10 border border-slate-200 rounded-lg px-2">
                    <input
                      type="color"
                      value={customization.color}
                      onChange={(e) => setCustomization({ ...customization, color: e.target.value })}
                      className="w-6 h-6 rounded-md border-none cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-slate-500 uppercase">{customization.color}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 block">Rotation</label>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={customization.textRotation}
                    onChange={(e) => setCustomization({ ...customization, textRotation: Number(e.target.value) })}
                    className="w-full h-10 accent-blue-600"
                  />
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 block">Positioning</label>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-bold">HORIZONTAL</span>
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
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-bold">VERTICAL</span>
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
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>

                {/* Z-Position (Depth) Control */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-bold">DEPTH (Z)</span>
                    <span className="text-[10px] text-blue-600 font-bold">{customization.textPosition.z}%</span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    value={customization.textPosition.z}
                    onChange={(e) => setCustomization({ 
                      ...customization, 
                      textPosition: { ...customization.textPosition, z: Number(e.target.value) } 
                    })}
                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-purple-600"
                  />
                </div>

                {/* Scale Control */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-bold">SCALE</span>
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
                    className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-green-600"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSidebarTab === 'image' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
              <FileUpload
                currentImage={customization.image}
                onUpload={(url: string, thumbnailUrl: string) => {
                  setCustomization({ ...customization, image: url });
                  addToast('Design uploaded successfully!', 'success');
                }}
                onClear={() => {
                  setCustomization({ ...customization, image: '' });
                }}
              />

              {customization.image && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Artwork Controls</h3>
                    <button 
                      onClick={() => setCustomization({ ...customization, image: '' })}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4">
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-slate-500 font-bold">HORIZONTAL</span>
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
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-slate-500 font-bold">VERTICAL</span>
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
                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                      />
                    </div>
                  </div>

                  {/* Z-Position (Depth) Control */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-bold">DEPTH (Z)</span>
                      <span className="text-[10px] text-blue-600 font-bold">{customization.imagePosition.z}%</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={customization.imagePosition.z}
                      onChange={(e) => setCustomization({ 
                        ...customization, 
                        imagePosition: { ...customization.imagePosition, z: Number(e.target.value) } 
                      })}
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-purple-600"
                    />
                  </div>

                  {/* Scale Control */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] text-slate-500 font-bold">SCALE</span>
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
                      className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-green-600"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSidebarTab === 'options' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Product Color</label>
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
                    className="w-8 h-8 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-500 uppercase">{customization.productColor || '#ffffff'}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Product Size</label>
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
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Print Placement</label>
                <Select
                  options={placementOptions}
                  value={customization.placement}
                  onChange={(e) => setCustomization({ ...customization, placement: e.target.value })}
                  className="rounded-xl border-slate-200"
                />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">Order Quantity</label>
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

        {/* Main Canvas Area */}
        <div className="flex-1 bg-[#F1F5F9] relative flex items-center justify-center p-8 overflow-hidden">
          {/* Canvas Tools Overlay */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-white shadow-xl z-20">
            <button 
              onClick={() => setIsPreview3D(!isPreview3D)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-xs font-bold ${isPreview3D ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              <Box className="w-3.5 h-3.5" />
              {isPreview3D ? '2D PREVIEW' : '3D PREVIEW'}
            </button>
            <div className="w-px h-4 bg-slate-300 mx-1" />
            <button 
              onClick={() => setView(view === 'front' ? 'back' : 'front')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors text-xs font-bold text-slate-600"
            >
              <RotateCw className="w-3.5 h-3.5" />
              SWAP TO {view === 'front' ? 'BACK' : 'FRONT'}
            </button>
            <div className="w-px h-4 bg-slate-300 mx-1" />
            <div className="flex items-center gap-3 px-2">
              <span className="text-[10px] font-black text-slate-400">ZOOM</span>
              <input
                type="range"
                min="50"
                max="150"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-24 h-1 accent-blue-600"
              />
              <span className="text-[10px] font-black text-blue-600 w-8">{zoom}%</span>
            </div>
          </div>

          {/* Floating Canvas Meta */}
          <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2 z-20">
            <div className="bg-white/80 backdrop-blur-md px-4 py-2 rounded-2xl border border-white shadow-lg text-right">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">Current Base</p>
              <p className="text-xs font-bold text-slate-700">{product.name}</p>
            </div>
            <button 
              onClick={() => {
                if (!user) {
                  addToast('Please login to reset canvas', 'error');
                  return;
                }
                setCustomization({
                  ...customization,
                  textPosition: { x: 50, y: 50, z: 0 },
                  imagePosition: { x: 50, y: 50, z: 0 },
                  textRotation: 0,
                  textSize: 24,
                  textScale: 1,
                  imageScale: 1,
                });
                setZoom(100);
              }}
              className="bg-white hover:bg-slate-50 px-4 py-2 rounded-2xl border border-slate-200 shadow-md text-[10px] font-black text-slate-500 uppercase flex items-center gap-2"
            >
              <Maximize2 className="w-3 h-3" />
              Reset Canvas
            </button>
          </div>

          {/* Product Canvas - 3D Preview Panel */}
          <div 
            className="w-full h-full max-w-4xl max-h-[80vh] transition-all duration-500 ease-out flex items-center justify-center relative"
            style={{ transform: !isPreview3D ? `scale(${zoom / 100})` : 'none' }}
          >
            {isPreview3D ? (
              <div className="w-full h-[500px] md:h-[600px] relative">
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                  <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-700">3D Preview</p>
                  </div>
                  <button
                    onClick={() => setPrecisionMode(!precisionMode)}
                    className={`px-3 py-1.5 rounded-lg shadow-sm text-xs font-bold uppercase transition-all ${
                      precisionMode 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-white/90 backdrop-blur-md text-slate-700 border border-slate-200'
                    }`}
                    title="Toggle precision mode for accurate design placement"
                  >
                    {precisionMode ? '🔍 Precision On' : '🎯 Precision Mode'}
                  </button>
                </div>
                <Product3DViewer 
                  customization={{
                    ...customization,
                    textPosition: {
                      x: (customization.textPosition.x - 50) / 10,
                      y: (customization.textPosition.y - 50) / 10,
                      z: 0
                    },
                    imagePosition: {
                      x: (customization.imagePosition.x - 50) / 10,
                      y: (customization.imagePosition.y - 50) / 10,
                      z: 0
                    },
                    imageScale: 1,
                    imageRotation: 0
                  }}
                  productType={
                    product.category === 'Mugs' || product.category === 'Drinkware' ? 'mug' : 
                    product.category === 'T-Shirts' || product.category === 'Hoodies' || product.category === 'Sports Jerseys' ? 'shirt' : 
                    product.category === 'Bags' ? 'tote' : 
                    'default'
                  }
                  enablePrecisionMode={precisionMode}
                />
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
        </div>
      </div>
    </div>
  );
}

