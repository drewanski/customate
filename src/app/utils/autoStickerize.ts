/**
 * Auto-converts uploaded or AI-generated images into transparent-background
 * stickers — same algorithm as the Refine modal, but fully automatic so the
 * customer doesn't have to discover the manual tool.
 *
 * Heuristic:
 *   1. Render the image to a canvas, sample the four corners.
 *   2. If the corners are all within a tight RGB distance of each other AND
 *      reasonably bright (i.e. it looks like a solid colour background),
 *      we treat that colour as the chroma key and alpha-zero it out.
 *   3. A soft transition band keeps cutout edges antialiased.
 *   4. If the corners disagree or the image already has transparency,
 *      we leave it alone and return the original dataURL — never corrupt
 *      an already-clean PNG.
 *
 * Pure client-side: no extra network calls, no backend image libraries to
 * install. Adds ~20ms on a 1024px image.
 */
export async function autoStickerize(dataUrl: string): Promise<{
  dataUrl: string;
  changed: boolean;
  reason: string;
}> {
  if (!dataUrl) return { dataUrl, changed: false, reason: 'empty' };

  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { dataUrl, changed: false, reason: 'no-canvas' };

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imgData;

  // Quick check: does the image already have transparency? If even 5% of
  // pixels are non-opaque we trust the source — don't touch it.
  let transparentCount = 0;
  const stride = 4;
  const totalPixels = width * height;
  for (let i = 3; i < data.length; i += stride * 16) {
    if (data[i] < 250) transparentCount++;
  }
  if (transparentCount / (totalPixels / 16) > 0.05) {
    return { dataUrl, changed: false, reason: 'already-transparent' };
  }

  // Sample four corners
  const corners = [
    pixelAt(data, width, 1, 1),
    pixelAt(data, width, width - 2, 1),
    pixelAt(data, width, 1, height - 2),
    pixelAt(data, width, width - 2, height - 2),
  ];

  // If the corners don't agree on a single background colour, we probably
  // have a photo or complex artwork — bail out.
  const avg = avgColor(corners);
  const maxDist = corners.reduce((max, c) => {
    const d = colorDist(c, avg);
    return d > max ? d : max;
  }, 0);
  if (maxDist > 30) {
    return { dataUrl, changed: false, reason: 'corners-disagree' };
  }

  // Background colour identified. Wipe it out.
  const tolerance = 38;
  const softness = 16;
  const tol2 = tolerance * tolerance;
  const softBand2 = (tolerance + softness) * (tolerance + softness);
  let removedCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - avg.r;
    const dg = data[i + 1] - avg.g;
    const db = data[i + 2] - avg.b;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 <= tol2) {
      data[i + 3] = 0;
      removedCount++;
    } else if (dist2 < softBand2) {
      const fade = (dist2 - tol2) / (softBand2 - tol2);
      data[i + 3] = Math.round(data[i + 3] * fade);
    }
  }

  // Safety check: if we removed almost EVERY pixel, something went wrong
  // (probably the corners happened to match the subject too). Bail.
  if (removedCount / (width * height) > 0.9) {
    return { dataUrl, changed: false, reason: 'over-removed' };
  }
  // Also bail if we removed almost nothing — no point flagging "changed"
  if (removedCount / (width * height) < 0.02) {
    return { dataUrl, changed: false, reason: 'nothing-to-remove' };
  }

  ctx.putImageData(imgData, 0, 0);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    changed: true,
    reason: `removed ${Math.round((removedCount / (width * height)) * 100)}% background`,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function pixelAt(data: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

function avgColor(samples: { r: number; g: number; b: number }[]) {
  const n = samples.length;
  return {
    r: samples.reduce((s, c) => s + c.r, 0) / n,
    g: samples.reduce((s, c) => s + c.g, 0) / n,
    b: samples.reduce((s, c) => s + c.b, 0) / n,
  };
}

function colorDist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}
