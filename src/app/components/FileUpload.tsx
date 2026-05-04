import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, Check } from 'lucide-react';
import { Button } from './Button';
import { uploadDesign, validateImageFile } from '../api/upload';

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

      // Upload to Cloudinary
      const result = await uploadDesign(file);
      
      onUpload(result.image.url, result.image.thumbnailUrl);
      setPreview(result.image.thumbnailUrl);
      
      // Clear input
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
    onClear?.();
    if (inputRef.current) {
      inputRef.current.value = '';
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          className="w-full"
        >
          <Upload className="w-4 h-4 mr-2" />
          Replace Image
        </Button>
      )}
    </div>
  );
}
