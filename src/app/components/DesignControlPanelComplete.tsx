import React, { useState, useRef } from 'react';
import { 
  Type, 
  Image, 
  Upload, 
  Palette, 
  Move, 
  RotateCw, 
  ZoomIn, 
  Trash2, 
  Plus,
  Star,
  Heart,
  Zap,
  Crown,
  Sparkles,
  Sun,
  Moon,
  Cloud,
  Flower,
  Music,
  Gamepad2,
  Coffee,
  Pizza,
  Dog,
  Cat,
  Car,
  Plane,
  Home,
  Briefcase,
  Gift
} from 'lucide-react';
import { DesignElement } from '../types/design';

interface DesignControlPanelCompleteProps {
  elements: DesignElement[];
  onElementsChange: (elements: DesignElement[]) => void;
  onActiveElementChange: (id: string | null) => void;
  activeElement: string | null;
}

const FONTS = [
  'Arial',
  'Times New Roman',
  'Courier New',
  'Georgia',
  'Verdana',
  'Comic Sans MS',
  'Impact',
  'Trebuchet MS'
];

const COLORS = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  '#FFC0CB', '#A52A2A', '#808080', '#FFD700', '#4B0082'
];

const ICONS = [
  { name: 'Star', icon: Star },
  { name: 'Heart', icon: Heart },
  { name: 'Zap', icon: Zap },
  { name: 'Crown', icon: Crown },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Sun', icon: Sun },
  { name: 'Moon', icon: Moon },
  { name: 'Cloud', icon: Cloud },
  { name: 'Flower', icon: Flower },
  { name: 'Music', icon: Music },
  { name: 'Gamepad', icon: Gamepad2 },
  { name: 'Coffee', icon: Coffee },
  { name: 'Pizza', icon: Pizza },
  { name: 'Dog', icon: Dog },
  { name: 'Cat', icon: Cat },
  { name: 'Car', icon: Car },
  { name: 'Plane', icon: Plane },
  { name: 'Home', icon: Home },
  { name: 'Briefcase', icon: Briefcase },
  { name: 'Gift', icon: Gift }
];

export function DesignControlPanelComplete({ 
  elements, 
  onElementsChange, 
  onActiveElementChange,
  activeElement 
}: DesignControlPanelCompleteProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'image' | 'icons'>('text');
  const [textInput, setTextInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addTextElement = () => {
    if (!textInput.trim()) return;
    
    const newElement: DesignElement = {
      id: `text_${Date.now()}`,
      type: 'text',
      content: textInput,
      position: { x: 50, y: 50 },
      scale: 1,
      rotation: 0,
      color: '#000000',
      font: 'Arial',
      opacity: 1
    };
    
    onElementsChange([...elements, newElement]);
    setTextInput('');
    onActiveElementChange(newElement.id);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const newElement: DesignElement = {
        id: `image_${Date.now()}`,
        type: 'image',
        content: e.target?.result as string,
        position: { x: 50, y: 50 },
        scale: 1,
        rotation: 0,
        color: '#000000',
        opacity: 1
      };
      
      onElementsChange([...elements, newElement]);
      onActiveElementChange(newElement.id);
    };
    reader.readAsDataURL(file);
  };

  const addIconElement = (iconName: string) => {
    const newElement: DesignElement = {
      id: `icon_${Date.now()}`,
      type: 'icon',
      content: iconName,
      position: { x: 50, y: 50 },
      scale: 1,
      rotation: 0,
      color: '#000000',
      opacity: 1
    };
    
    onElementsChange([...elements, newElement]);
    onActiveElementChange(newElement.id);
  };

  const updateElement = (id: string, updates: Partial<DesignElement>) => {
    onElementsChange(elements.map(el => 
      el.id === id ? { ...el, ...updates } : el
    ));
  };

  const deleteElement = (id: string) => {
    onElementsChange(elements.filter(el => el.id !== id));
    if (activeElement === id) {
      onActiveElementChange(null);
    }
  };

  const activeElementData = elements.find(el => el.id === activeElement);

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'text' 
              ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Type className="w-4 h-4 inline mr-2" />
          Text
        </button>
        <button
          onClick={() => setActiveTab('image')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'image' 
              ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Image className="w-4 h-4 inline mr-2" />
          Images
        </button>
        <button
          onClick={() => setActiveTab('icons')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'icons' 
              ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Star className="w-4 h-4 inline mr-2" />
          Icons
        </button>
      </div>

      {/* Tab Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {/* Text Tab */}
        {activeTab === 'text' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Add Text
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Enter your text..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && addTextElement()}
                />
                <button
                  onClick={addTextElement}
                  disabled={!textInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Font
              </label>
              <select
                value={activeElementData?.font || 'Arial'}
                onChange={(e) => activeElementData && updateElement(activeElementData.id, { font: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!activeElementData}
              >
                {FONTS.map(font => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Image Tab */}
        {activeTab === 'image' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload Image
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 transition-colors flex items-center justify-center gap-2 text-gray-600 hover:text-blue-600"
              >
                <Upload className="w-5 h-5" />
                <span>Choose Image</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center">
              Supports JPG, PNG, GIF formats
            </p>
          </div>
        )}

        {/* Icons Tab */}
        {activeTab === 'icons' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Choose Icon
              </label>
              <div className="grid grid-cols-5 gap-2">
                {ICONS.map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    onClick={() => addIconElement(name)}
                    className="p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center"
                    title={name}
                  >
                    <Icon className="w-6 h-6 text-gray-600" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Active Element Controls */}
      {activeElementData && (
        <div className="border-t border-gray-200 p-4 space-y-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              {activeElementData.type === 'text' ? 'Text' : activeElementData.type === 'image' ? 'Image' : 'Icon'} Settings
            </h3>
            <button
              onClick={() => deleteElement(activeElementData.id)}
              className="text-red-500 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Color Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => updateElement(activeElementData.id, { color })}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    activeElementData.color === color 
                      ? 'border-blue-500 scale-110' 
                      : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Size Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Size: {Math.round(activeElementData.scale * 100)}%
            </label>
            <input
              type="range"
              min="10"
              max="200"
              value={activeElementData.scale * 100}
              onChange={(e) => updateElement(activeElementData.id, { scale: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </div>

          {/* Rotation Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rotation: {activeElementData.rotation}°
            </label>
            <input
              type="range"
              min="-180"
              max="180"
              value={activeElementData.rotation}
              onChange={(e) => updateElement(activeElementData.id, { rotation: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Opacity Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Opacity: {Math.round(activeElementData.opacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={activeElementData.opacity * 100}
              onChange={(e) => updateElement(activeElementData.id, { opacity: Number(e.target.value) / 100 })}
              className="w-full"
            />
          </div>

          {/* Position Display */}
          <div className="text-xs text-gray-500 bg-white p-2 rounded border">
            <div className="flex items-center gap-2">
              <Move className="w-3 h-3" />
              Position: X {Math.round(activeElementData.position.x)}%, Y {Math.round(activeElementData.position.y)}%
            </div>
            <p className="mt-1">Click on the design and drag on the shirt to reposition</p>
          </div>
        </div>
      )}

      {/* Elements List */}
      {elements.length > 0 && (
        <div className="border-t border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Design Elements</h3>
          <div className="space-y-2">
            {elements.map((element) => (
              <div
                key={element.id}
                onClick={() => onActiveElementChange(element.id)}
                className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                  activeElement === element.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {element.type === 'text' && <Type className="w-4 h-4" />}
                    {element.type === 'image' && <Image className="w-4 h-4" />}
                    {element.type === 'icon' && <Star className="w-4 h-4" />}
                    <span className="text-sm truncate">
                      {element.type === 'text' 
                        ? element.content 
                        : element.type === 'image' 
                          ? 'Image' 
                          : element.content
                      }
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteElement(element.id);
                    }}
                    className="text-red-500 hover:text-red-700 opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
