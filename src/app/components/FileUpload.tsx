import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, Check, Wand2, Sparkles } from 'lucide-react';
import { Button } from './Button';
import { uploadDesign, validateImageFile } from '../api/upload';
import { aiRemoveBackground } from '../api';

interface FileUploadProps {
  onUpload: (imageUrl: string, thumbnailUrl: string) => void;
  currentImage?: string | null;
  onClear?: () => void;
  accept?: string;
  maxSize?: number;
  className?: string;
}

export function FileUpload({
  onUpload,
  currentImage,
  onClear,
  accept = 'image/*',
  className = ''
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentImage ?? null);
  // AI background removal state. Only available when an image is loaded
  // and the user is signed in (guests don't get free AI calls).
  const [removingBg, setRemovingBg] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const isAuthenticated = typeof window !== 'undefined' && !!localStorage.getItem('token');

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // Create local preview first
      const localPreview = URL.createObjectURL(file);
      setPreview(localPreview);

      // Guests don't have an auth token — skip the Cloudinary upload and
      // use a client-side data URL so the customization preview still works.
      // The image won't persist across sessions, which is fine because they
      // can't order without signing in anyway.
      const isGuest = !localStorage.getItem('token');
      if (isGuest) {
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
        onUpload(dataUrl, dataUrl);
        setPreview(dataUrl);
      } else {
        // Authenticated user — upload to Cloudinary for persistence
        const result = await uploadDesign(file);
        onUpload(result.image.url, result.image.thumbnailUrl);
        setPreview(result.image.thumbnailUrl);
      }

      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload image');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    setPreview(null);
    setError(null);
    setBgRemoved(false);
    onClear?.();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  /**
   * AI background removal. Calls /api/ai-design/remove-bg with the current
   * preview (data URL or remote URL — backend accepts either). The cleaned
   * image replaces the current one and is also reported via onUpload so the
   * 3D customizer picks it up.
   *
   * Falls back gracefully if the model isn't available (backend returns
   * the original image with fallback: true).
   */
  const handleRemoveBg = async () => {
    if (!preview || removingBg) return;
    setError(null);
    setRemovingBg(true);
    try {
      // If the preview is a remote URL (Cloudinary), fetch and convert to
      // data URL first so we always send raw bytes to the model.
      let imagePayload = preview;
      if (preview.startsWith('http')) {
        const res = await fetch(preview);
        const blob = await res.blob();
        imagePayload = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(blob);
        });
      }

      const result = await aiRemoveBackground(imagePayload);
      if (result?.dataUrl) {
        setPreview(result.dataUrl);
        onUpload(result.dataUrl, result.dataUrl);
        setBgRemoved(!result.fallback);
      }
    } catch (err: any) {
      setError(err.message || 'Could not remove background');
    } finally {
      setRemovingBg(false);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />

      {preview ? (
        <div className="relative group">
          <img
            src={preview}
            alt="Uploaded design"
            className="w-full h-48 object-contain bg-gray-50 rounded-lg border border-gray-200"
          />
          <button
            onClick={handleClear}
            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
            title="Remove image"
          >
            <X className="w-4 h-4" />
          </button>
          {!uploading && (
            <div className="absolute bottom-2 right-2 bg-green-500 text-white p-1 rounded-full">
              <Check className="w-4 h-4" />
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={handleClick}
          disabled={uploading}
          className="w-full h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-3 hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <span className="text-sm text-gray-600">Uploading...</span>
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">Click to upload design</p>
                <p className="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP, SVG (max 5MB)</p>
              </div>
            </>
          )}
        </button>
      )}

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <X className="w-4 h-4" />
          {error}
        </p>
      )}

      {preview && !uploading && (
        <div className="space-y-2">
          {/* AI background removal — only for signed-in users */}
          {isAuthenticated && (
            <button
              type="button"
              onClick={handleRemoveBg}
              disabled={removingBg}
              className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition shadow-md disabled:opacity-60 ${
                bgRemoved
                  ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                  : 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-500 text-white shadow-purple-500/30 hover:opacity-95'
              }`}
            >
              {removingBg ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cleaning background…
                </>
              ) : bgRemoved ? (
                <>
                  <Check className="w-4 h-4" />
                  Background removed
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Remove background with AI
                  <Sparkles className="w-3 h-3" />
                </>
              )}
            </button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            className="w-full"
          >
            <Upload className="w-4 h-4 mr-2" />
            Replace Image
          </Button>
        </div>
      )}
    </div>
  );
}
