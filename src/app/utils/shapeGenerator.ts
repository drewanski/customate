/**
 * Generates transparent-background PNG dataURLs for built-in shapes.
 *
 * Each shape is rendered onto a 1024 × 1024 canvas with the requested fill
 * colour, then exported as `image/png`. The output is fed into the customizer
 * as if the user had uploaded an image, which means every existing tool
 * (position, scale, rotation, flip, opacity, refiner) Just Works on shapes.
 *
 * Why canvas instead of <svg> or static PNG files:
 *   - We need transparent backgrounds — Canvas + toDataURL gives us a clean
 *     PNG with proper alpha, indistinguishable from a real uploaded sticker
 *     to the rest of the pipeline.
 *   - Colour is dynamic — picking a different shape colour shouldn't ship
 *     more network bytes; we just re-draw the canvas locally in <5 ms.
 *   - No new build dependencies.
 */

export type ShapeKind =
  | 'circle'
  | 'square'
  | 'rounded'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'star'
  | 'heart'
  | 'pentagon'
  | 'arrow'
  | 'cross'
  | 'lightning';

const SIZE = 1024;
const PAD = 64; // inner padding so shapes don't kiss the canvas edge

/**
 * Render one of the built-in shapes to a PNG dataURL.
 * @param kind  Which shape to draw
 * @param color Fill colour (hex / css string)
 */
export function shapeToDataUrl(kind: ShapeKind, color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = (SIZE - PAD * 2) / 2; // half-extent

  switch (kind) {
    case 'circle': {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'square': {
      ctx.fillRect(PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2);
      break;
    }
    case 'rounded': {
      roundedRect(ctx, PAD, PAD, SIZE - PAD * 2, SIZE - PAD * 2, 120);
      ctx.fill();
      break;
    }
    case 'triangle': {
      polygon(ctx, cx, cy, r, 3, -Math.PI / 2);
      ctx.fill();
      break;
    }
    case 'diamond': {
      polygon(ctx, cx, cy, r, 4, 0);
      ctx.fill();
      break;
    }
    case 'hexagon': {
      polygon(ctx, cx, cy, r, 6, 0);
      ctx.fill();
      break;
    }
    case 'pentagon': {
      polygon(ctx, cx, cy, r, 5, -Math.PI / 2);
      ctx.fill();
      break;
    }
    case 'star': {
      star(ctx, cx, cy, r, r * 0.45, 5);
      ctx.fill();
      break;
    }
    case 'heart': {
      heart(ctx, cx, cy, r);
      ctx.fill();
      break;
    }
    case 'arrow': {
      arrow(ctx, cx, cy, r);
      ctx.fill();
      break;
    }
    case 'cross': {
      const armW = r * 0.6;
      const armT = r * 0.28;
      ctx.fillRect(cx - armT, cy - armW, armT * 2, armW * 2);
      ctx.fillRect(cx - armW, cy - armT, armW * 2, armT * 2);
      break;
    }
    case 'lightning': {
      lightning(ctx, cx, cy, r);
      ctx.fill();
      break;
    }
  }
  return canvas.toDataURL('image/png');
}

// ─── Primitive helpers ───────────────────────────────────────────────────

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, rr: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function polygon(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number, sides: number, startAngle: number,
) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i * 2 * Math.PI) / sides;
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function star(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, outer: number, inner: number, points: number,
) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function heart(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
) {
  // Classic two-lobe heart built from a square rotated 45° + two circles
  const s = r * 0.95;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.85);
  ctx.bezierCurveTo(cx + s * 1.4, cy + s * 0.1, cx + s * 0.6, cy - s * 0.95, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.6, cy - s * 0.95, cx - s * 1.4, cy + s * 0.1, cx, cy + s * 0.85);
  ctx.closePath();
}

function arrow(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
) {
  // Right-pointing arrow inside the bounding box
  const w = r * 1.4;
  const h = r * 0.55;
  const headW = r * 0.55;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - h);
  ctx.lineTo(cx + w - headW, cy - h);
  ctx.lineTo(cx + w - headW, cy - h * 1.7);
  ctx.lineTo(cx + w, cy);
  ctx.lineTo(cx + w - headW, cy + h * 1.7);
  ctx.lineTo(cx + w - headW, cy + h);
  ctx.lineTo(cx - w, cy + h);
  ctx.closePath();
}

function lightning(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
) {
  // Zig-zag bolt
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.15, cy - r);
  ctx.lineTo(cx - r * 0.55, cy + r * 0.1);
  ctx.lineTo(cx - r * 0.05, cy + r * 0.15);
  ctx.lineTo(cx - r * 0.25, cy + r);
  ctx.lineTo(cx + r * 0.55, cy - r * 0.15);
  ctx.lineTo(cx + r * 0.05, cy - r * 0.2);
  ctx.closePath();
}
