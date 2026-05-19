/**
 * Print-quality analyzer.
 *
 * Customers upload images and pick colors in a digital studio, but the
 * production team has to actually print these designs. Without guardrails,
 * we get:
 *   - 400×400 logos uploaded and printed at 10 inches → blurry mess
 *   - White text on a white shirt → invisible
 *   - 8pt text on a tote bag → unreadable
 *   - Decals placed outside the safe print area → clipped on the press
 *
 * This module runs every relevant check the moment the customization state
 * changes and returns a structured `Issue[]` the UI can render. Each issue
 * has a `severity` that drives both visual treatment AND whether checkout
 * is blocked.
 */

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface Issue {
  code: string;
  severity: IssueSeverity;
  message: string;
  /** Optional concrete suggestion the customer can act on. */
  hint?: string;
}

export interface PrintSpec {
  /** Real-world print width in inches (chest area, mug wrap, etc). */
  printWidthInches: number;
  /** Minimum DPI for an acceptable print. 150 = "looks fine"; 300 = sharp. */
  minDpi: number;
  /** Bare-minimum DPI under which we BLOCK the order. */
  hardMinDpi: number;
  /** Minimum text size (px) in the studio that prints legibly. */
  minTextSizePx: number;
  /** Friendly label for messages ("chest area", "mug wrap"). */
  printAreaLabel: string;
}

/**
 * Per-product print constraints. Values reflect typical small-shop output
 * with DTG / sublimation printing in PH. Update as production capabilities
 * change — this is the ONLY place these constants live.
 */
export const PRINT_SPECS: Record<string, PrintSpec> = {
  shirt: { printWidthInches: 10, minDpi: 150, hardMinDpi: 100, minTextSizePx: 14, printAreaLabel: 'chest area' },
  jersey: { printWidthInches: 10, minDpi: 150, hardMinDpi: 100, minTextSizePx: 14, printAreaLabel: 'front panel' },
  mug: { printWidthInches: 8, minDpi: 200, hardMinDpi: 120, minTextSizePx: 16, printAreaLabel: 'mug wrap' },
  tumbler: { printWidthInches: 8, minDpi: 200, hardMinDpi: 120, minTextSizePx: 16, printAreaLabel: 'tumbler wrap' },
  tote: { printWidthInches: 12, minDpi: 150, hardMinDpi: 100, minTextSizePx: 16, printAreaLabel: 'bag face' },
  mousepad: { printWidthInches: 12, minDpi: 200, hardMinDpi: 150, minTextSizePx: 14, printAreaLabel: 'pad surface' },
  fan: { printWidthInches: 8, minDpi: 150, hardMinDpi: 100, minTextSizePx: 14, printAreaLabel: 'fan blade' },
  default: { printWidthInches: 10, minDpi: 150, hardMinDpi: 100, minTextSizePx: 14, printAreaLabel: 'print area' },
};

export function getPrintSpec(productType: string): PrintSpec {
  return PRINT_SPECS[productType] || PRINT_SPECS.default;
}

// ─── Color helpers ──────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

/**
 * WCAG relative luminance. Used to compute contrast ratio between two
 * arbitrary colors so we can warn about invisible decals.
 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio (1.0 = identical, 21.0 = max). 3.0+ is the bare minimum for graphics. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [bright, dark] = la > lb ? [la, lb] : [lb, la];
  return (bright + 0.05) / (dark + 0.05);
}

// ─── Image dimension probe ─────────────────────────────────────────────────

/**
 * Load an image (data URL or remote URL) and return its natural dimensions.
 * Resolves to null on failure — the analyzer treats unknown dims as "skip".
 */
export async function probeImageDimensions(
  src: string,
): Promise<{ width: number; height: number } | null> {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ─── Main analyzer ─────────────────────────────────────────────────────────

export interface AnalysisInput {
  productType: string;
  /** Decal/logo image source if any (data URL or Cloudinary URL). */
  imageSrc?: string;
  /** Dimensions of the uploaded image (use `probeImageDimensions` to populate). */
  imageDims?: { width: number; height: number } | null;
  /** Customer-entered text on the design. */
  text?: string;
  /** Text size (px), as used in the studio's font-size slider. */
  textSize?: number;
  /** Text color hex. */
  textColor?: string;
  /** Product / base color the decal sits on. */
  productColor?: string;
  /** Scale of the image decal (1.0 = default, 0.5 = half-size). */
  imageScale?: number;
  /** Scale of the text element (1.0 = default). */
  textScale?: number;
}

/**
 * Run every print-quality check and return an ordered Issue[]. Higher
 * severities (errors first) come first so the UI naturally surfaces the
 * most actionable items at the top.
 */
export function analyzeDesign(input: AnalysisInput): Issue[] {
  const issues: Issue[] = [];
  const spec = getPrintSpec(input.productType);

  // ─── Image DPI check ─────────────────────────────────────────────────────
  if (input.imageSrc && input.imageDims) {
    const scale = input.imageScale || 1;
    // Effective print width on the product = print area × decal scale fraction.
    // A scale of 1 means the decal fills the print area; 0.5 means half-width.
    const effectiveInches = Math.max(1, spec.printWidthInches * scale);
    const dpi = input.imageDims.width / effectiveInches;

    if (dpi < spec.hardMinDpi) {
      issues.push({
        code: 'IMAGE_DPI_TOO_LOW',
        severity: 'error',
        message: `Image too low resolution for printing (${Math.round(dpi)} DPI at this size).`,
        hint: `Use an image at least ${Math.ceil(spec.minDpi * effectiveInches)}px wide, or scale this one down.`,
      });
    } else if (dpi < spec.minDpi) {
      issues.push({
        code: 'IMAGE_DPI_LOW',
        severity: 'warning',
        message: `Image may print blurry (${Math.round(dpi)} DPI; we recommend ${spec.minDpi}+).`,
        hint: `Use a sharper image, or reduce the decal scale to make it print sharper.`,
      });
    }
  }

  // ─── Color contrast (text on product) ────────────────────────────────────
  if (input.text && input.textColor && input.productColor) {
    const ratio = contrastRatio(input.textColor, input.productColor);
    if (ratio < 1.5) {
      issues.push({
        code: 'TEXT_INVISIBLE',
        severity: 'error',
        message: 'Text color is nearly identical to the product color — it will be invisible when printed.',
        hint: 'Change the text color, or pick a different product color.',
      });
    } else if (ratio < 3.0) {
      issues.push({
        code: 'TEXT_LOW_CONTRAST',
        severity: 'warning',
        message: 'Text contrast is low — it may be hard to read on the printed product.',
        hint: 'Pick a darker or lighter color for better legibility.',
      });
    }
  }

  // ─── Minimum text size ───────────────────────────────────────────────────
  if (input.text && input.textSize !== undefined) {
    const effective = (input.textSize || 0) * (input.textScale || 1);
    if (effective > 0 && effective < spec.minTextSizePx) {
      issues.push({
        code: 'TEXT_TOO_SMALL',
        severity: 'warning',
        message: `Text size (${Math.round(effective)}px) may not print legibly.`,
        hint: `Use at least ${spec.minTextSizePx}px for clean output on this product.`,
      });
    }
  }

  // ─── Aspect-ratio sanity for image decal ─────────────────────────────────
  if (input.imageDims) {
    const { width, height } = input.imageDims;
    if (width > 0 && height > 0) {
      const aspect = Math.max(width, height) / Math.min(width, height);
      if (aspect > 8) {
        issues.push({
          code: 'IMAGE_EXTREME_ASPECT',
          severity: 'info',
          message: 'Image is very long/narrow — may look stretched on the product.',
          hint: 'Consider cropping to a more balanced shape before uploading.',
        });
      }
    }
  }

  // Sort: errors → warnings → infos
  const rank: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** True if any issue would block checkout. */
export function hasBlockingIssues(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
