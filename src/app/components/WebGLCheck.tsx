import React, { useEffect, useState } from 'react';
import { AlertTriangle, Monitor, Smartphone } from 'lucide-react';

/**
 * Detect WebGL2 support. Returns:
 *   true  → supported
 *   false → not supported
 *   null  → check hasn't finished yet (initial render before useEffect)
 */
export function detectWebGL(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    // Three.js needs WebGL2 for some advanced features but WebGL1 works for basic.
    // We accept either to be permissive.
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      (canvas as any).getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * Renders `children` only when WebGL is available. Otherwise shows a friendly
 * fallback explaining the issue, with clear next steps for the user.
 */
export function WebGLCheck({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  // Detect on mount (avoids SSR mismatches if you ever add SSR later)
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(detectWebGL());
  }, []);

  if (supported === null) return null; // brief flash on first render
  if (supported) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  return (
    <div className="w-full h-full flex items-center justify-center p-6">
      <div className="max-w-md text-center bg-white rounded-2xl border border-slate-200 shadow-lg p-8">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          3D preview not available
        </h2>
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          Your browser doesn't support WebGL, which is needed to show the 3D
          customizer. Don't worry — you can still customize and order!
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-left text-xs text-slate-600 space-y-2">
          <div className="font-bold text-slate-700 uppercase tracking-wide text-[10px]">
            Try one of these:
          </div>
          <div className="flex items-start gap-2">
            <Monitor className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
            <span>
              Use a recent version of <strong>Chrome, Edge, Firefox, or Safari</strong>
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Smartphone className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
            <span>
              On mobile, make sure hardware acceleration is enabled in your browser
            </span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-4">
          You can switch to the 2D preview using the toolbar above to keep designing.
        </p>
      </div>
    </div>
  );
}
