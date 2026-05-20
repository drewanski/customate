import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, ThreeEvent, useThree, useFrame } from '@react-three/fiber';
import {
  Environment,
  Html,
  OrbitControls,
  PivotControls,
  useGLTF,
  ContactShadows,
  AccumulativeShadows,
  RandomizedLight,
} from '@react-three/drei';
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { DesignElement } from '../types/design';

/**
 * Environment presets — each one swaps the HDR background AND the lighting
 * mood. They're carefully tuned to flatter different product types:
 *   - studio:      neutral white box (default — accurate colors)
 *   - golden:      warm amber, low-sun cinematic look
 *   - sunset:      pink/purple dusk, dramatic
 *   - workshop:    industrial grey, soft fluorescent feel
 *   - showroom:    bright product-shoot look, cool tones
 *   - night:       dark with rim lighting, neon-friendly
 */
export type EnvironmentPreset = 'studio' | 'golden' | 'sunset' | 'workshop' | 'showroom' | 'night';

export const ENVIRONMENT_META: Record<EnvironmentPreset, {
  label: string;
  hdr: 'studio' | 'sunset' | 'warehouse' | 'city' | 'dawn' | 'night' | 'apartment' | 'park' | 'lobby' | 'forest';
  ambient: number;
  keyIntensity: number;
  keyColor: string;
  fillIntensity: number;
  rim?: { color: string; intensity: number };
  toneMappingExposure: number;
  emoji: string;
}> = {
  studio:   { label: 'Studio',     hdr: 'studio',     ambient: 0.35, keyIntensity: 1.1, keyColor: '#ffffff', fillIntensity: 0.4,                                        toneMappingExposure: 1.0,  emoji: '⚪' },
  golden:   { label: 'Golden Hour',hdr: 'sunset',     ambient: 0.25, keyIntensity: 1.4, keyColor: '#ffd6a0', fillIntensity: 0.3, rim: { color: '#ff9a6c', intensity: 0.8 }, toneMappingExposure: 1.15, emoji: '🌅' },
  sunset:   { label: 'Sunset',     hdr: 'dawn',       ambient: 0.30, keyIntensity: 1.2, keyColor: '#ff8ab0', fillIntensity: 0.4, rim: { color: '#a78bfa', intensity: 1.0 }, toneMappingExposure: 1.10, emoji: '🌆' },
  workshop: { label: 'Workshop',   hdr: 'warehouse',  ambient: 0.40, keyIntensity: 1.0, keyColor: '#f1f5f9', fillIntensity: 0.6,                                        toneMappingExposure: 0.95, emoji: '🔧' },
  showroom: { label: 'Showroom',   hdr: 'lobby',      ambient: 0.55, keyIntensity: 1.2, keyColor: '#ffffff', fillIntensity: 0.7,                                        toneMappingExposure: 1.05, emoji: '✨' },
  night:    { label: 'Night',      hdr: 'night',      ambient: 0.10, keyIntensity: 0.6, keyColor: '#a5b4fc', fillIntensity: 0.2, rim: { color: '#22d3ee', intensity: 1.4 }, toneMappingExposure: 1.25, emoji: '🌙' },
};

/**
 * Camera preset views — angles you'd commonly want to inspect a product from.
 * The CameraController inside the Canvas smoothly interpolates between presets.
 * Values are [x, y, z] in world space; positive z = "front" of the product.
 */
export type CameraPreset = 'front' | 'three-quarter-left' | 'three-quarter-right' | 'side' | 'back' | 'top' | 'detail';

export const CAMERA_META: Record<CameraPreset, { label: string; offset: [number, number, number]; emoji: string }> = {
  front:                 { label: 'Front',         offset: [0,    0,    1.0], emoji: '⬆' },
  'three-quarter-left':  { label: '3/4 Left',      offset: [-0.7, 0.15, 0.7], emoji: '↖' },
  'three-quarter-right': { label: '3/4 Right',     offset: [0.7,  0.15, 0.7], emoji: '↗' },
  side:                  { label: 'Side',          offset: [1.0,  0,    0],   emoji: '➡' },
  back:                  { label: 'Back',          offset: [0,    0,    -1.0], emoji: '⬇' },
  top:                   { label: 'Top',           offset: [0,    1.0,  0.1], emoji: '⬆' },
  detail:                { label: 'Close-up',      offset: [0,    0.05, 0.55], emoji: '🔍' },
};

/**
 * ProductCustomizer3D
 * Single canonical 3D customizer. Decals are placed via raycast — the user clicks
 * the model surface and the decal is projected onto that exact spot using the hit
 * point + face normal. This is the standard three.js DecalGeometry approach and
 * handles arbitrary curved surfaces (mug, jersey contour, tote bag) correctly.
 *
 * Interactions:
 *   - Orbit / zoom: drag empty space, scroll wheel (OrbitControls, damped, polar-bounded)
 *   - Place: click on the model surface (when a decal is selected and unplaced, or via the
 *     "drag-to-position" mode while a decal is selected) — re-anchors that decal to the hit
 *   - Select: click an existing decal → PivotControls gizmo appears for translate/rotate/scale
 */

type ProductType =
  | 'shirt'
  | 'jersey'
  | 'mug'
  | 'tumbler'
  | 'tote'
  | 'mousepad'
  | 'fan'
  | 'default';

interface ProductModelConfig {
  path: string;
  scale: number;
  position: [number, number, number];
  rotation: [number, number, number];
  camera: [number, number, number];
  defaultDecalSize: number;
  // Max decal width as a fraction of the mesh's smaller surface dimension.
  // Keeps text within the flat visible front area on apparel/flat products.
  // Leave unset for cylindrical products (mug, tumbler) so wrapping is allowed.
  maxDecalFraction?: number;
  // When true, this product can be displayed on a body mannequin (try-on mode).
  // Shirts/jerseys = true. Mugs/mousepads = false.
  wearable?: boolean;
  // Vertical offset to apply to the garment when try-on is active. Each garment
  // model has its origin in a slightly different place, so this is tuned per
  // product so the garment collar reaches the body's neck.
  tryOnOffsetY?: number;
}

type BodySize = 'small' | 'medium' | 'large';
type BodyGender = 'male' | 'female';

// ─── product appearance presets ────────────────────────────────────────────
// Material finishes — applied to all product sub-meshes uniformly. Each preset
// tweaks roughness/metalness on the underlying MeshStandardMaterial.
type MaterialFinish = 'matte' | 'satin' | 'glossy' | 'textured';
const MATERIAL_FINISHES: Record<MaterialFinish, {
  label: string;
  roughness: number;
  metalness: number;
  // Optional procedural normal/roughness map for the "textured" finish
  bumpiness?: number;
}> = {
  matte:    { label: 'Matte',    roughness: 0.95, metalness: 0.0 },
  satin:    { label: 'Satin',    roughness: 0.55, metalness: 0.0 },
  glossy:   { label: 'Glossy',   roughness: 0.20, metalness: 0.1 },
  textured: { label: 'Textured', roughness: 0.85, metalness: 0.0, bumpiness: 0.6 },
};

// 12-color palette + custom picker. These are the quick-click swatches users
// can apply to the whole product or to individual clicked sub-meshes.
const COLOR_PALETTE: { hex: string; name: string }[] = [
  { hex: '#ffffff', name: 'White' },
  { hex: '#000000', name: 'Black' },
  { hex: '#9ca3af', name: 'Gray' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#facc15', name: 'Yellow' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#6366f1', name: 'Indigo' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#ec4899', name: 'Pink' },
];

// Tiny canvas-rendered preview of each pattern for the picker thumbnails.
function PatternThumbnail({ kind, base, accent, selected }: {
  kind: PatternKind;
  base: string;
  accent: string;
  selected: boolean;
}) {
  // Render the pattern at small size as inline SVG (faster than a canvas per render)
  const sz = 48;
  let content: React.ReactNode = null;
  if (kind === 'none') {
    content = <rect x={0} y={0} width={sz} height={sz} fill={base} />;
  } else if (kind === 'stripes-h') {
    content = (
      <>
        <rect x={0} y={0} width={sz} height={sz} fill={base} />
        {[0, 12, 24, 36].map((y) => (
          <rect key={y} x={0} y={y} width={sz} height={6} fill={accent} />
        ))}
      </>
    );
  } else if (kind === 'stripes-v') {
    content = (
      <>
        <rect x={0} y={0} width={sz} height={sz} fill={base} />
        {[0, 12, 24, 36].map((x) => (
          <rect key={x} x={x} y={0} width={6} height={sz} fill={accent} />
        ))}
      </>
    );
  } else if (kind === 'checker') {
    content = (
      <>
        <rect x={0} y={0} width={sz} height={sz} fill={base} />
        {[0, 1, 2, 3].flatMap((r) =>
          [0, 1, 2, 3].map((c) =>
            (r + c) % 2 === 0 ? (
              <rect key={`${r}-${c}`} x={c * 12} y={r * 12} width={12} height={12} fill={accent} />
            ) : null
          )
        )}
      </>
    );
  } else if (kind === 'gradient') {
    content = (
      <>
        <defs>
          <linearGradient id={`grad-${kind}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} />
            <stop offset="100%" stopColor={base} />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={sz} height={sz} fill={`url(#grad-${kind})`} />
      </>
    );
  }
  return (
    <svg
      width={sz}
      height={sz}
      viewBox={`0 0 ${sz} ${sz}`}
      className={`rounded-md ${selected ? 'ring-2 ring-blue-600 ring-offset-1' : 'ring-1 ring-slate-200'}`}
    >
      {content}
    </svg>
  );
}

// Procedural pattern overlays. Each generates a canvas texture at runtime that
// can be applied as a material map. Patterns combine with the base color.
type PatternKind = 'none' | 'stripes-h' | 'stripes-v' | 'checker' | 'gradient';
const PATTERN_LABELS: Record<PatternKind, string> = {
  'none': 'Solid',
  'stripes-h': 'Stripes ⇄',
  'stripes-v': 'Stripes ⇅',
  'checker': 'Checker',
  'gradient': 'Gradient',
};

// Human model paths (Universal Base Characters pack — Superhero Male/Female).
// The folder name has spaces and brackets; URL-encoded for browser fetch.
// Companion .bin and .png files must live in the same folder as the .gltf.
const HUMAN_FOLDER =
  '/models/Universal%20Base%20Characters%5BStandard%5D/Universal%20Base%20Characters%5BStandard%5D/Base%20Characters/Godot%20-%20UE';
const BODY_MODELS: Record<BodyGender, string> = {
  male: `${HUMAN_FOLDER}/Superhero_Male_FullBody.gltf`,
  female: `${HUMAN_FOLDER}/Superhero_Female_FullBody.gltf`,
};

// Non-uniform scales applied to the human GLB. We deliberately scale the body
// SMALLER than the garment in width so the T-pose arms tuck inside the
// sleeves rather than poking out — gives a more convincing "wearing it" look.
const BODY_SIZES: Record<BodySize, {
  widthScale: number;
  heightScale: number;
  // Procedural fallback proportions (used only if no GLB is provided)
  torsoWidth: number;
  torsoHeight: number;
  shoulderWidth: number;
  armLength: number;
  legLength: number;
  bodyScale: number;
  label: string;
}> = {
  small:  { widthScale: 0.62, heightScale: 0.95, torsoWidth: 0.32, torsoHeight: 0.80, shoulderWidth: 0.78, armLength: 0.70, legLength: 0.95, bodyScale: 0.90, label: 'S' },
  medium: { widthScale: 0.72, heightScale: 1.00, torsoWidth: 0.38, torsoHeight: 0.85, shoulderWidth: 0.92, armLength: 0.75, legLength: 1.00, bodyScale: 1.00, label: 'M' },
  large:  { widthScale: 0.85, heightScale: 1.05, torsoWidth: 0.46, torsoHeight: 0.90, shoulderWidth: 1.06, armLength: 0.80, legLength: 1.05, bodyScale: 1.10, label: 'L' },
};

const PRODUCT_MODELS: Record<ProductType, ProductModelConfig> = {
  shirt: {
    path: '/oversized-t-shirt/oversized_t-shirt.glb',
    scale: 1.2,
    position: [0, -1, 0],
    rotation: [0, 0, 0],
    camera: [0, 0.2, 3.2],
    defaultDecalSize: 0.6,
    maxDecalFraction: 0.38,
    wearable: true,
    tryOnOffsetY: 0.65,
  },
  jersey: {
    path: '/models/sports_jersey.glb',
    scale: 1.05,
    position: [0, -1.0, 0],
    rotation: [0, 0, 0],
    camera: [0, 0.2, 4.5],
    defaultDecalSize: 0.6,
    maxDecalFraction: 0.35,
    wearable: true,
    tryOnOffsetY: 0.85,
  },
  mug: {
    path: '/models/plain_mug.glb',
    scale: 1.4,
    position: [0, -0.65, 0],
    rotation: [0, 0, 0],
    camera: [0, 0.15, 2.6],
    defaultDecalSize: 0.45,
    // no maxDecalFraction — cylindrical wrap looks correct
  },
  tumbler: {
    path: '/models/plain_mug.glb', // fallback to mug; replace when tumbler glb exists
    scale: 1.2,
    position: [0, -0.45, 0],
    rotation: [0, 0, 0],
    camera: [0, 0.1, 2.8],
    defaultDecalSize: 0.4,
    // no maxDecalFraction — cylindrical wrap looks correct
  },
  tote: {
    path: '/models/tote_bag.glb',
    scale: 0.25,
    position: [0, -0.95, 0],
    rotation: [0, 0, 0],
    camera: [0, 0.2, 6.5],
    defaultDecalSize: 0.55,
    maxDecalFraction: 0.55,
  },
  mousepad: {
    path: '/models/mouse_pad_keyboard_pad.glb',
    scale: 0.09,
    position: [0, -0.15, 0],
    rotation: [0, 0, 0],
    camera: [0, 1.6, 2.8],
    defaultDecalSize: 0.7,
    maxDecalFraction: 0.75,
  },
  fan: {
    // GLB native size: 0.1 × 0.65 × 1.05 with the long axis on Z. Rotated 90°
    // around Y so the long axis becomes X (horizontal on screen), giving a
    // proper front-facing view of the fan. Scale 2.4 makes it ~2.5 units wide.
    path: '/models/hw2_handfan.glb',
    scale: 2.4,
    position: [0, -0.55, 0],
    rotation: [0, Math.PI / 2, 0],
    camera: [0, 0.3, 4.5],
    defaultDecalSize: 0.55,
    maxDecalFraction: 0.55,
  },
  default: {
    path: '/models/plain_mug.glb',
    scale: 1.3,
    position: [0, -0.5, 0],
    rotation: [0, 0, 0],
    camera: [0, 0.2, 3.2],
    defaultDecalSize: 0.5,
  },
};

const EMPTY_ELEMENTS: DesignElement[] = [];

function resolveProductType(input?: string): ProductType {
  if (!input) return 'default';
  const k = input.toLowerCase();
  // Specific product matches first (SKU prefixes + product names)
  if (k.includes('shirt') || k.startsWith('ts')) return 'shirt';
  if (k.includes('jersey') || k.startsWith('jr')) return 'jersey';
  if (k.includes('tumbler') || k.startsWith('tb')) return 'tumbler';
  if (k.includes('mug') || k.startsWith('mg')) return 'mug';
  if (k.includes('mouse') || k.includes('mousepad') || k.startsWith('mp')) return 'mousepad';
  if (k.includes('tote') || k.includes('bag') || k.includes('pouch') || k.includes('purse') || k.startsWith('ot') || k.startsWith('cp')) return 'tote';
  if (k.includes('fan') || k.startsWith('ff')) return 'fan';
  // Category fallbacks (used when product.category is passed instead of SKU)
  if (k.includes('apparel') || k.includes('clothing')) return 'shirt';
  if (k.includes('drinkware') || k.includes('cup')) return 'mug';
  if (k.includes('bags')) return 'tote';
  if (k.includes('accessor')) return 'mousepad';
  return 'default';
}

// ─── text → canvas → texture ────────────────────────────────────────────────
function textToTexture(opts: {
  text: string;
  font: string;
  color: string;
}): THREE.CanvasTexture {
  const { text, font, color } = opts;
  // High-resolution canvas — the decal is projected onto a curved surface and
  // viewed at varying angles, so we need a lot of source pixels to stay sharp.
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let fontSize = canvas.height * 0.78;
  ctx.font = `bold ${fontSize}px ${font}`;
  while (ctx.measureText(text).width > canvas.width * 0.92 && fontSize > 24) {
    fontSize -= 8;
    ctx.font = `bold ${fontSize}px ${font}`;
  }
  ctx.fillText(text || ' ', canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function useDecalTexture(el: DesignElement): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: THREE.Texture | null = null;

    if (el.type === 'text') {
      const t = textToTexture({
        text: el.content,
        font: el.font || 'Arial',
        color: el.color || '#000000',
      });
      created = t;
      setTexture(t);
    } else if (el.type === 'image' && el.content) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        el.content,
        (t) => {
          if (cancelled) {
            t.dispose();
            return;
          }
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          // Linear filtering with no mipmaps keeps logo edges crisp at small
          // sizes — mipmaps introduce a faint colored fringe when the texture
          // is downsampled below ~50%, which combined with transparent PNGs
          // produces the "dark border" effect.
          t.minFilter = THREE.LinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.generateMipmaps = false;
          t.needsUpdate = true;
          created = t;
          setTexture(t);
        },
        undefined,
        () => setTexture(null),
      );
    } else {
      setTexture(null);
    }

    return () => {
      cancelled = true;
      if (created) created.dispose();
    };
  }, [el.type, el.content, el.font, el.color]);

  return texture;
}

// Build a procedural pattern texture (stripes/checker/gradient). The pattern
// uses `accentColor` over `baseColor` so it tints with whatever the user picks.
function buildPatternTexture(
  pattern: PatternKind,
  baseColor: string,
  accentColor: string,
): THREE.Texture | null {
  if (pattern === 'none') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = accentColor;

  if (pattern === 'stripes-h') {
    const stripeH = 32;
    for (let y = 0; y < c.height; y += stripeH * 2) {
      ctx.fillRect(0, y, c.width, stripeH);
    }
  } else if (pattern === 'stripes-v') {
    const stripeW = 32;
    for (let x = 0; x < c.width; x += stripeW * 2) {
      ctx.fillRect(x, 0, stripeW, c.height);
    }
  } else if (pattern === 'checker') {
    const cell = 64;
    for (let y = 0; y < c.height; y += cell) {
      for (let x = 0; x < c.width; x += cell) {
        if (((x / cell) + (y / cell)) % 2 === 0) {
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }
  } else if (pattern === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, accentColor);
    grad.addColorStop(1, baseColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// ─── product mesh (loads GLB, applies base color, captures mesh refs) ──────
interface ProductMeshProps {
  url: string;
  baseColor?: string;
  // Per-sub-mesh color overrides (mesh name → hex). Used by click-to-paint.
  meshColors?: Record<string, string>;
  finish: MaterialFinish;
  pattern: PatternKind;
  patternAccent: string;
  // Which mesh is currently "selected" for paint mode (gets a subtle highlight)
  paintTargetName?: string | null;
  onMeshesReady: (meshes: THREE.Mesh[]) => void;
  onSurfaceClick: (e: ThreeEvent<MouseEvent>) => void;
  onSurfacePointerMissed?: () => void;
}

function ProductMesh({
  url,
  baseColor,
  meshColors,
  finish,
  pattern,
  patternAccent,
  paintTargetName,
  onMeshesReady,
  onSurfaceClick,
}: ProductMeshProps) {
  const { scene } = useGLTF(url);
  // Clone so per-instance material edits don't poison the cached GLTF
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const meshesRef = useRef<THREE.Mesh[]>([]);

  // Initial mount: clone the GLB's materials so we own them and capture meshes.
  useEffect(() => {
    const collected: THREE.Mesh[] = [];
    cloned.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        const mesh = c as THREE.Mesh;
        const mat = (mesh.material as THREE.Material | THREE.Material[]);
        const cloneMat = (m: THREE.Material) => m.clone();
        mesh.material = Array.isArray(mat) ? mat.map(cloneMat) : cloneMat(mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Track whether THIS mesh has its own (modeler-provided) UV map. If
        // yes → use the texture-based pattern path (clean, matches the GLB's
        // intended unwrap). If no → use the shader fallback that doesn't
        // need UVs. Tracked on userData so the apply effect can branch.
        const geom = mesh.geometry as THREE.BufferGeometry;
        const hadRealUVs = !!(geom && geom.attributes.uv);
        (mesh.userData as any).__hasRealUVs = hadRealUVs;

        if (geom && geom.attributes.position && !hadRealUVs) {
          // Generate planar UVs so we always have *something* to sample for
          // decals (which we never want to skip).
          if (!geom.boundingBox) geom.computeBoundingBox();
          const bb = geom.boundingBox!;
          const pos = geom.attributes.position;
          const uv = new Float32Array(pos.count * 2);
          for (let i = 0; i < pos.count; i++) {
            uv[i * 2] = (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x || 1);
            uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y || 1);
          }
          geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }

        collected.push(mesh);
      }
    });
    meshesRef.current = collected;
    onMeshesReady(collected);
  }, [cloned, onMeshesReady]);

  // Apply colors + finish + pattern every time those inputs change.
  //
  // TWO paths:
  //   1. Mesh ships with proper UVs (most product GLBs) → use a CanvasTexture
  //      so the pattern follows the modeler's intended unwrap. Clean bands,
  //      no smudging, gradient works correctly.
  //   2. Mesh has no UVs (e.g. sports_jersey.glb) → use a fragment-shader
  //      fallback that computes the pattern from normalized object-space
  //      coordinates. Less perfect but UV-free.
  useEffect(() => {
    const finishPreset = MATERIAL_FINISHES[finish] || MATERIAL_FINISHES.matte;

    // Shared CanvasTexture for the UV path — built once per pattern change.
    const patternTex =
      pattern !== 'none'
        ? buildPatternTexture(
            pattern,
            baseColor || '#ffffff',
            patternAccent || '#000000',
          )
        : null;

    // Shader-mode integer for the no-UV fallback path.
    const patternMode =
      pattern === 'stripes-h' ? 1 :
      pattern === 'stripes-v' ? 2 :
      pattern === 'checker' ? 3 :
      pattern === 'gradient' ? 4 : 0;

    const accentVec = new THREE.Color(patternAccent || '#000000');

    for (const mesh of meshesRef.current) {
      const useTexturePath = !!(mesh.userData as any).__hasRealUVs;
      const apply = (m: THREE.Material) => {
        if (!('color' in m)) return;
        const std = m as THREE.MeshStandardMaterial;
        // Per-mesh color override (from click-to-paint) wins, else baseColor.
        const color = meshColors?.[mesh.name]
          || (baseColor && baseColor.toLowerCase() !== '#ffffff' ? baseColor : '#ffffff');
        std.color = new THREE.Color(color);
        std.roughness = finishPreset.roughness;
        std.metalness = finishPreset.metalness;

        // ─── PATH A: real UVs → texture-based pattern ──────────────────
        // Clean, fast, follows the GLB's intended unwrap exactly.
        if (useTexturePath) {
          std.map = patternTex; // null clears any prior pattern
          std.needsUpdate = true;
          if (paintTargetName && mesh.name === paintTargetName) {
            std.emissive = new THREE.Color('#444477');
            std.emissiveIntensity = 0.3;
          } else {
            std.emissive = new THREE.Color('#000000');
            std.emissiveIntensity = 0;
          }
          return;
        }

        // ─── PATH B: no real UVs → fragment-shader fallback ────────────
        std.map = null;

        // Highlight selected mesh for paint mode
        if (paintTargetName && mesh.name === paintTargetName) {
          std.emissive = new THREE.Color('#444477');
          std.emissiveIntensity = 0.3;
        } else {
          std.emissive = new THREE.Color('#000000');
          std.emissiveIntensity = 0;
        }

        // Recompute the mesh's own bounds for the shader so the pattern
        // normalizes XYZ to 0..1 across the whole mesh.
        const meshGeom = mesh.geometry as THREE.BufferGeometry;
        if (meshGeom && !meshGeom.boundingBox) meshGeom.computeBoundingBox();
        const bbox = meshGeom?.boundingBox;
        const boundsMin = bbox
          ? new THREE.Vector3(bbox.min.x, bbox.min.y, bbox.min.z)
          : new THREE.Vector3(-1, -1, -1);
        const boundsSize = bbox
          ? new THREE.Vector3(
              Math.max(bbox.max.x - bbox.min.x, 1e-6),
              Math.max(bbox.max.y - bbox.min.y, 1e-6),
              Math.max(bbox.max.z - bbox.min.z, 1e-6),
            )
          : new THREE.Vector3(2, 2, 2);

        // Install (or update) the pattern shader hook. Uniforms are referenced
        // by both our closure and the compiled shader, so updating `.value`
        // propagates without a recompile.
        const userData = std.userData as { __patternUniforms?: any };
        if (!userData.__patternUniforms) {
          const uniforms = {
            uPatternMode: { value: patternMode },
            uPatternAccent: { value: accentVec.clone() },
            uPatternScale: { value: 6.0 }, // bands across the bounding box
            uBoundsMin: { value: boundsMin.clone() },
            uBoundsSize: { value: boundsSize.clone() },
          };
          userData.__patternUniforms = uniforms;

          std.onBeforeCompile = (shader) => {
            shader.uniforms.uPatternMode = uniforms.uPatternMode;
            shader.uniforms.uPatternAccent = uniforms.uPatternAccent;
            shader.uniforms.uPatternScale = uniforms.uPatternScale;
            shader.uniforms.uBoundsMin = uniforms.uBoundsMin;
            shader.uniforms.uBoundsSize = uniforms.uBoundsSize;

            shader.vertexShader = shader.vertexShader
              .replace(
                '#include <common>',
                `#include <common>\nvarying vec3 vObjPos;`
              )
              .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>\nvObjPos = position;`
              );

            shader.fragmentShader = shader.fragmentShader
              .replace(
                '#include <common>',
                `#include <common>
                 varying vec3 vObjPos;
                 uniform int uPatternMode;
                 uniform vec3 uPatternAccent;
                 uniform float uPatternScale;
                 uniform vec3 uBoundsMin;
                 uniform vec3 uBoundsSize;`
              )
              .replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                 if (uPatternMode != 0) {
                   // Normalize object-space position to 0..1 across the mesh's
                   // own bounding box. Now uPatternScale = 6 always means
                   // "6 bands across the mesh" regardless of GLB scale.
                   vec3 n = (vObjPos - uBoundsMin) / uBoundsSize;
                   float t = 0.0;
                   if (uPatternMode == 1) {
                     // horizontal stripes
                     t = step(0.5, fract(n.y * uPatternScale));
                   } else if (uPatternMode == 2) {
                     // vertical stripes
                     t = step(0.5, fract(n.x * uPatternScale));
                   } else if (uPatternMode == 3) {
                     // checker — bands on both axes, XOR'd
                     float bx = step(0.5, fract(n.x * uPatternScale));
                     float by = step(0.5, fract(n.y * uPatternScale));
                     t = mod(bx + by, 2.0);
                   } else if (uPatternMode == 4) {
                     // top-down gradient (1 at top, 0 at bottom)
                     t = clamp(n.y, 0.0, 1.0);
                   }
                   diffuseColor.rgb = mix(diffuseColor.rgb, uPatternAccent, t);
                 }`
              );
          };
        } else {
          // Refresh ALL uniforms on every change — keeps state consistent
          // even when the user switches products and the mesh's bounds change.
          userData.__patternUniforms.uPatternMode.value = patternMode;
          userData.__patternUniforms.uPatternAccent.value.copy(accentVec);
          userData.__patternUniforms.uBoundsMin.value.copy(boundsMin);
          userData.__patternUniforms.uBoundsSize.value.copy(boundsSize);
        }

        std.needsUpdate = true;
      };
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach(apply); else apply(mat);
    }
  }, [baseColor, meshColors, finish, pattern, patternAccent, paintTargetName]);

  return (
    <primitive
      object={cloned}
      onPointerDown={onSurfaceClick}
    />
  );
}

// ─── decal projected onto target mesh using DecalGeometry ──────────────────
interface ProjectedDecalProps {
  element: DesignElement;
  targetMesh: THREE.Mesh | null;
  allMeshes: THREE.Mesh[];
  selected: boolean;
  onSelect: () => void;
  onTransform: (next: Partial<DesignElement>) => void;
  maxDecalFraction?: number;
}

function ProjectedDecal({
  element,
  targetMesh,
  allMeshes,
  selected,
  onSelect,
  onTransform,
  maxDecalFraction,
}: ProjectedDecalProps) {
  const { scene } = useThree();
  const texture = useDecalTexture(element);

  // Fallback pose when the user hasn't clicked yet: anchor at the front face
  // of the target mesh's bounding box (in WORLD space). Used until the user
  // clicks the surface, which captures a real raycast pose.
  const pose = useMemo(() => {
    if (!targetMesh) return null;
    targetMesh.updateMatrixWorld(true);

    if (element.normal) {
      return {
        position: new THREE.Vector3(
          element.position.x,
          element.position.y,
          element.position.z ?? 0,
        ),
        normal: new THREE.Vector3(
          element.normal.x,
          element.normal.y,
          element.normal.z,
        ).normalize(),
      };
    }
    const bb = new THREE.Box3().setFromObject(targetMesh);
    const center = bb.getCenter(new THREE.Vector3());
    center.z = bb.max.z + 0.001;
    return { position: center, normal: new THREE.Vector3(0, 0, 1) };
  }, [
    targetMesh,
    element.normal?.x,
    element.normal?.y,
    element.normal?.z,
    element.position.x,
    element.position.y,
    element.position.z,
  ]);

  const sizeVec = useMemo(() => {
    const bb = targetMesh ? new THREE.Box3().setFromObject(targetMesh) : null;
    const meshSize = bb ? bb.getSize(new THREE.Vector3()) : null;
    const base =
      (meshSize ? Math.min(meshSize.x, meshSize.y) * 0.5 : 0.4) *
      (element.scale || 1);
    const aspect = element.aspectRatio || (element.type === 'text' ? 4 : 1);

    let w = base * aspect;
    let h = base;

    if (meshSize && maxDecalFraction !== undefined) {
      const maxW = Math.min(meshSize.x, meshSize.y) * maxDecalFraction;
      if (w > maxW) {
        const s = maxW / w;
        w = maxW;
        h *= s;
      }
    }

    // Generous depth — must span the full mesh thickness so the projection box
    // captures triangles on both the front face and the curved sides without
    // leaving gaps. DecalGeometry backface-culls the actual far side anyway.
    const depth = meshSize
      ? Math.max(meshSize.z * 2, meshSize.x * 0.6, meshSize.y * 0.6, 0.3)
      : Math.max(w * 1.5, 0.3);
    return new THREE.Vector3(w, h, depth);
  }, [element.scale, element.aspectRatio, element.type, targetMesh, maxDecalFraction]);

  // Build orientation Euler from the surface normal (canonical lookAt pattern)
  const orientationEuler = useMemo(() => {
    if (!pose) return new THREE.Euler();
    const helper = new THREE.Object3D();
    helper.position.copy(pose.position);
    helper.lookAt(pose.position.clone().add(pose.normal));
    helper.rotateZ(THREE.MathUtils.degToRad(element.rotation || 0));
    return helper.rotation.clone();
  }, [pose, element.rotation]);

  // DecalGeometry outputs vertices in WORLD space (it applies mesh.matrixWorld
  // internally). The decal meshes must therefore live at the scene root so no
  // additional parent transform is applied on top.
  //
  // We project onto EVERY mesh in the product (jersey/shirt GLBs are often
  // multiple sub-meshes — collar, body, sleeves). A single-mesh projection
  // leaves gaps where letters fall on different sub-meshes.
  const decalMeshesRef = useRef<THREE.Mesh[]>([]);
  useEffect(() => {
    if (!texture || !pose) return;
    const projectTargets = allMeshes.length > 0 ? allMeshes : (targetMesh ? [targetMesh] : []);
    if (projectTargets.length === 0) return;

    const decals: THREE.Mesh[] = [];
    const geometries: DecalGeometry[] = [];
    const materials: THREE.Material[] = [];

    for (const m of projectTargets) {
      m.updateMatrixWorld(true);
      let geometry: DecalGeometry;
      try {
        geometry = new DecalGeometry(m, pose.position, orientationEuler, sizeVec);
      } catch (e) {
        continue;
      }
      // Skip empty geometries (no triangles hit the projection box on this mesh)
      const posAttr = geometry.getAttribute('position');
      if (!posAttr || posAttr.count === 0) {
        geometry.dispose();
        continue;
      }
      // MeshBasicMaterial is unlit — it shows the texture exactly as it is
      // in the source PNG, with zero interaction with scene lighting, tone
      // mapping, or shadows. For a printed decal that's what you want:
      // the customer picked specific colors in their design, and they should
      // appear on the 3D preview at full saturation regardless of the
      // ambient light direction or the scene's tone-mapping curve.
      //
      // Why not MeshStandardMaterial:
      //   - StandardMaterial multiplies the texture by ambient/diffuse light,
      //     which dims and tints the design depending on where the user
      //     rotated the camera (logo looks brick-red in shadow, bright red
      //     in light — confusing for a "what will be printed" preview).
      //   - The renderer's ACES Filmic tone mapping further desaturates
      //     highlights, making whites look gray and reds look brick.
      //
      // alphaTest: pixels with alpha < 0.05 are discarded. Without this the
      // PNG's transparent rectangle still claims depth-buffer space,
      // producing the square halo around uploaded logos. We keep the
      // threshold low (5%) so feathered edges from the in-studio image
      // refiner survive as a clean alpha gradient rather than getting
      // chopped to a hard outline.
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.05,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -10,
        opacity: element.opacity ?? 1,
        // Bypass tone mapping so the customer's chosen colors stay accurate.
        toneMapped: false,
      });
      const decal = new THREE.Mesh(geometry, material);
      decal.renderOrder = selected ? 4 : 3;
      decal.userData.isDecal = true;
      scene.add(decal);
      decals.push(decal);
      geometries.push(geometry);
      materials.push(material);
    }
    decalMeshesRef.current = decals;

    return () => {
      for (const d of decals) scene.remove(d);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      decalMeshesRef.current = [];
    };
  }, [scene, targetMesh, allMeshes, texture, pose, orientationEuler, sizeVec, element.opacity, selected]);

  if (!selected || !pose) return null;

  return (
    <PivotControls
      anchor={[0, 0, 0]}
      offset={[pose.position.x, pose.position.y, pose.position.z]}
      scale={0.6}
      fixed
      lineWidth={2}
      activeAxes={[true, true, true]}
      depthTest={false}
      onDrag={(matrix) => {
        const t = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();
        matrix.decompose(t, q, s);
        const newPos = pose.position.clone().add(t);
        const newScale = (element.scale || 1) * Math.max(0.1, s.x);
        onTransform({
          position: { x: newPos.x, y: newPos.y, z: newPos.z },
          scale: newScale,
        });
      }}
    />
  );
}

// ─── mannequin body (try-on preview) ───────────────────────────────────────
// Procedural human-shape body built from primitives. Sits underneath the
// garment so users can see how the product fits across sizes. When a real
// human GLB is available, set ProductModelConfig.bodyModelPath and we'll load
// that instead — same outer behavior.
interface MannequinBodyProps {
  size: BodySize;
  gender: BodyGender;
  garmentCenter: THREE.Vector3;
  garmentSize: THREE.Vector3;
}

function MannequinBody({ size, gender, garmentCenter, garmentSize }: MannequinBodyProps) {
  const dims = BODY_SIZES[size];
  const skinColor = '#d9b8a1';
  const modelPath = BODY_MODELS[gender];

  // For the procedural fallback we need a width/height scale matched to garment
  // size. The GLB path computes its own scale internally based on its bbox.
  const proceduralHeight = 2.31;
  const proceduralBase = (garmentSize.y / proceduralHeight) * 1.8;

  return (
    <GLBMannequinWithFallback
      path={modelPath}
      garmentCenter={garmentCenter}
      garmentSize={garmentSize}
      widthMul={dims.widthScale}
      heightMul={dims.heightScale}
      fallback={
        <ProceduralBody
          dims={dims}
          skinColor={skinColor}
          widthScale={proceduralBase * dims.widthScale}
          heightScale={proceduralBase * dims.heightScale}
          worldPos={[garmentCenter.x, garmentCenter.y, garmentCenter.z]}
        />
      }
    />
  );
}

// Loads the GLB if it exists; renders the procedural fallback otherwise.
function GLBMannequinWithFallback({
  path, garmentCenter, garmentSize, widthMul, heightMul, fallback,
}: {
  path: string;
  garmentCenter: THREE.Vector3;
  garmentSize: THREE.Vector3;
  widthMul: number;
  heightMul: number;
  fallback: React.ReactNode;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(path, { method: 'HEAD' })
      .then((r) => { if (!cancelled) setAvailable(r.ok); })
      .catch(() => { if (!cancelled) setAvailable(false); });
    return () => { cancelled = true; };
  }, [path]);

  if (available === null) return null;
  if (!available) return <>{fallback}</>;
  return (
    <Suspense fallback={null}>
      <GLBMannequin
        path={path}
        garmentCenter={garmentCenter}
        garmentSize={garmentSize}
        widthMul={widthMul}
        heightMul={heightMul}
      />
    </Suspense>
  );
}

// Original procedural body — kept as the fallback when no GLB is provided.
function ProceduralBody({
  dims, skinColor, widthScale, heightScale, worldPos,
}: {
  dims: typeof BODY_SIZES[BodySize];
  skinColor: string;
  widthScale: number;
  heightScale: number;
  worldPos: [number, number, number];
}) {

  // Body parts are positioned around a CENTERED torso (y=0 is torso center).
  const torsoCenterY = 0;
  const torsoTopY = dims.torsoHeight * 0.5;
  const torsoBottomY = -dims.torsoHeight * 0.5;
  const neckY = torsoTopY + 0.05;
  const headY = torsoTopY + 0.32;
  const armY = torsoTopY - 0.05;
  const armX = dims.shoulderWidth * 0.5 + 0.02;
  const legTopY = torsoBottomY;
  const legCenterY = legTopY - dims.legLength * 0.5;
  const legX = dims.torsoWidth * 0.42;

  return (
    <group scale={[widthScale, heightScale, widthScale]} position={worldPos}>
      {/* head */}
      <mesh position={[0, headY, 0]} castShadow>
        <sphereGeometry args={[0.14, 24, 24]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* neck */}
      <mesh position={[0, neckY, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.07, 0.10, 16]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* torso — wider at shoulders, tapering to waist */}
      <mesh position={[0, torsoCenterY, 0]} castShadow>
        <cylinderGeometry args={[dims.torsoWidth * 0.55, dims.torsoWidth * 0.45, dims.torsoHeight, 24]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* shoulders */}
      <mesh position={[0, torsoTopY - 0.04, 0]} castShadow>
        <cylinderGeometry args={[dims.shoulderWidth * 0.5, dims.torsoWidth * 0.55, 0.10, 24]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* arms */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * armX, armY, 0]}>
          <mesh position={[0, -dims.armLength * 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.05, dims.armLength, 16]} />
            <meshStandardMaterial color={skinColor} roughness={0.7} />
          </mesh>
          {/* hand */}
          <mesh position={[0, -dims.armLength - 0.05, 0]} castShadow>
            <sphereGeometry args={[0.055, 12, 12]} />
            <meshStandardMaterial color={skinColor} roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* legs */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * legX, legCenterY, 0]} castShadow>
          <cylinderGeometry args={[0.09, 0.07, dims.legLength, 16]} />
          <meshStandardMaterial color="#2a3a4a" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

interface GLBMannequinProps {
  path: string;
  // Garment to fit into — body is auto-scaled relative to garment size
  garmentSize: THREE.Vector3;
  garmentCenter: THREE.Vector3;
  widthMul: number;   // 0.85 (S) → 1.22 (L), multiplied on top of the auto-scale
  heightMul: number;  // 0.97 → 1.04
}

function GLBMannequin({ path, garmentSize, garmentCenter, widthMul, heightMul }: GLBMannequinProps) {
  const { scene } = useGLTF(path);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  // Measure the GLB's natural bbox so we can scale it to fit the garment.
  const { naturalHeight, centerOffset } = useMemo(() => {
    const bb = new THREE.Box3().setFromObject(cloned);
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    return { naturalHeight: size.y || 1, centerOffset: center };
  }, [cloned]);

  // Scale so the garment occupies the upper-torso area of the body — body
  // height is ~2.8× garment height (matches real apparel proportions).
  const baseScale = (garmentSize.y * 2.8) / naturalHeight;
  const wScale = baseScale * widthMul;
  const hScale = baseScale * heightMul;

  // Align body bbox center with garment bbox center. Note: GLBs with internal
  // armature scene-graph transforms may render slightly higher/lower than
  // this formula suggests; in that case, tune `BODY_POSITION_TWEAK_Y` per
  // model (positive = body shifts up; negative = body shifts down).
  const BODY_POSITION_TWEAK_Y = 0;
  const posX = garmentCenter.x - centerOffset.x * wScale;
  const posY = garmentCenter.y - centerOffset.y * hScale + BODY_POSITION_TWEAK_Y;
  const posZ = garmentCenter.z - centerOffset.z * wScale;

  // Flip the body 180° around Y so it faces the camera (the GLB exports face
  // away from camera by default — without this we'd see the body's back).
  return (
    <group
      position={[posX, posY, posZ]}
      scale={[wScale, hScale, wScale]}
      rotation={[0, Math.PI, 0]}
    >
      <primitive object={cloned} />
    </group>
  );
}

/**
 * Tiny helper that keeps gl.toneMappingExposure in sync with the chosen
 * environment preset. Needs to live INSIDE the Canvas tree to access useThree.
 */
function ToneMappingUpdater({ exposure }: { exposure: number }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

// ─── camera framer ──────────────────────────────────────────────────────────
function CameraSetup({ position }: { position: [number, number, number] }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    camera.lookAt(0, 0, 0);
  }, [camera, position[0], position[1], position[2]]);
  return null;
}

/**
 * Smooth camera controller — lerps the camera toward a target position
 * over multiple frames whenever the target changes. Used by the camera-
 * preset chips in the Studio toolbar (Front / 3/4 / Side / Back / Top / etc).
 *
 * Without this, snapping between angles is jarring. With it, transitions
 * feel like a product video.
 */
function SmoothCamera({
  target,
  baseDistance,
  enabled,
}: {
  target: [number, number, number] | null;
  baseDistance: number;
  enabled: boolean;
}) {
  const { camera, controls } = useThree() as any;
  const targetVec = useRef(new THREE.Vector3());
  const active = useRef(false);

  useEffect(() => {
    if (!target || !enabled) {
      active.current = false;
      return;
    }
    // Treat preset offsets as normalised direction vectors; scale by the
    // product's natural camera distance so close-up / top still frame OK.
    targetVec.current.set(
      target[0] * baseDistance,
      target[1] * baseDistance,
      target[2] * baseDistance
    );
    active.current = true;
  }, [target, baseDistance, enabled]);

  useFrame(() => {
    if (!active.current) return;
    camera.position.lerp(targetVec.current, 0.12);
    // OrbitControls overrides camera.lookAt on every update, so we must
    // update its TARGET and call .update() so it re-derives the look-at
    // direction from our new camera position.
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    } else {
      camera.lookAt(0, 0, 0);
    }
    if (camera.position.distanceTo(targetVec.current) < 0.02) {
      active.current = false; // stop lerping when close enough
    }
  });
  return null;
}

// ─── main component ─────────────────────────────────────────────────────────
export interface ProductCustomizer3DProps {
  productType?: string;
  productName?: string;
  productColor?: string;
  view?: 'front' | 'back';
  placement?: string;
  onDesignChange?: (elements: DesignElement[]) => void;
  initialElements?: DesignElement[];
  activeElement?: string | null;
  onActiveElementChange?: (id: string | null) => void;
  onProductColorChange?: (color: string) => void;

  // ─── Pro Studio enhancements ────────────────────────────────────────────
  /** Lighting + HDR environment preset. Defaults to 'studio'. */
  environment?: EnvironmentPreset;
  /** Camera angle preset. Switching this smoothly animates the camera. */
  cameraPreset?: CameraPreset | null;
  /** Auto-rotate the model — cinematic showcase mode. */
  autoRotate?: boolean;
  /** Auto-rotate speed (in revolutions per minute, OrbitControls scale). */
  autoRotateSpeed?: number;
  /** Use realistic high-quality shadows (heavier — admin opt-in). */
  premiumShadows?: boolean;
}

export function ProductCustomizer3D({
  productType,
  productColor: productColorProp,
  view = 'front',
  onDesignChange,
  initialElements,
  activeElement,
  onActiveElementChange,
  onProductColorChange,
  environment = 'studio',
  cameraPreset = null,
  autoRotate = false,
  autoRotateSpeed = 1.5,
  premiumShadows = false,
}: ProductCustomizer3DProps) {
  const envMeta = ENVIRONMENT_META[environment] || ENVIRONMENT_META.studio;
  // Smooth camera target — derived from preset + product's natural distance.
  const baseCameraDistance = useMemo(() => {
    const type = resolveProductType(productType);
    const c = PRODUCT_MODELS[type].camera;
    return Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
  }, [productType]);
  const cameraTarget = cameraPreset ? CAMERA_META[cameraPreset].offset : null;
  // Local override for product color, used when no callback is provided so
  // users can still recolor the product even without parent wiring.
  const [localColor, setLocalColor] = useState<string | undefined>(undefined);
  const productColor = localColor ?? productColorProp;
  const handleProductColorChange = useCallback((c: string) => {
    setLocalColor(c);
    onProductColorChange?.(c);
  }, [onProductColorChange]);
  const type = useMemo(() => resolveProductType(productType), [productType]);
  const config = PRODUCT_MODELS[type];

  const [meshes, setMeshes] = useState<THREE.Mesh[]>([]);
  const [tryOn, setTryOn] = useState(false);
  const [bodySize, setBodySize] = useState<BodySize>('medium');
  const [bodyGender, setBodyGender] = useState<BodyGender>('male');

  // Appearance state
  const [finish, setFinish] = useState<MaterialFinish>('matte');
  const [pattern, setPattern] = useState<PatternKind>('none');
  const [patternAccent, setPatternAccent] = useState<string>('#000000');
  // Per-sub-mesh color overrides (set via click-to-paint). Empty by default;
  // when empty, every sub-mesh uses the base productColor.
  const [meshColors, setMeshColors] = useState<Record<string, string>>({});
  // Which sub-mesh is currently selected for paint mode (null = not painting).
  // When non-null, clicks on the model recolor THIS mesh rather than placing decals.
  const [paintTargetName, setPaintTargetName] = useState<string | null>(null);
  const [paintColor, setPaintColor] = useState<string>('#ef4444');
  // Whether the appearance panel is expanded
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  // World-space bounding box of the loaded garment. We re-compute when meshes
  // change so the body can re-align after model swap.
  const [garmentBounds, setGarmentBounds] = useState<{ center: THREE.Vector3; size: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!config.wearable || meshes.length === 0) {
      setGarmentBounds(null);
      return;
    }
    const bb = new THREE.Box3();
    for (const m of meshes) {
      m.updateMatrixWorld(true);
      const worldBB = new THREE.Box3().setFromObject(m);
      bb.union(worldBB);
    }
    setGarmentBounds({
      center: bb.getCenter(new THREE.Vector3()),
      size: bb.getSize(new THREE.Vector3()),
    });
  }, [meshes, config.wearable]);
  // Fully controlled: parent owns the elements array. We don't keep a local
  // copy — that previously caused an infinite update loop because onDesignChange
  // would round-trip back to us as a new initialElements reference.
  const elements = initialElements ?? EMPTY_ELEMENTS;
  const elementsRef = useRef<DesignElement[]>(elements);
  elementsRef.current = elements;

  const updateElements = useCallback(
    (next: DesignElement[] | ((prev: DesignElement[]) => DesignElement[])) => {
      const resolved =
        typeof next === 'function'
          ? (next as (prev: DesignElement[]) => DesignElement[])(elementsRef.current)
          : next;
      onDesignChange?.(resolved);
    },
    [onDesignChange],
  );

  // Click on product surface: dispatches based on mode.
  //   Paint mode (paintTargetName !== null): apply paintColor to the clicked sub-mesh
  //   Decal mode (activeElement !== null): re-anchor the active decal to the click
  const handleSurfaceClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const hit = e.intersections[0];
      if (!hit) return;
      const clickedMeshName = (hit.object as THREE.Mesh).name;

      // Paint mode wins over decal mode when both are active.
      if (paintTargetName !== null) {
        e.stopPropagation();
        // First click: lock onto this mesh as the paint target & color it.
        // Subsequent clicks: paint each clicked mesh with the current paint color.
        setMeshColors((prev) => ({ ...prev, [clickedMeshName]: paintColor }));
        setPaintTargetName(clickedMeshName);
        return;
      }

      if (!activeElement || !hit.face) return;
      e.stopPropagation();

      // Convert face normal to world space
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(
        hit.object.matrixWorld,
      );
      const worldNormal = hit.face.normal
        .clone()
        .applyMatrix3(normalMatrix)
        .normalize();

      // Nudge slightly out of surface to prevent z-fighting at decal edges
      const anchor = hit.point.clone().addScaledVector(worldNormal, 0.001);

      updateElements((prev) =>
        prev.map((el) =>
          el.id === activeElement
            ? {
                ...el,
                position: { x: anchor.x, y: anchor.y, z: anchor.z },
                normal: {
                  x: worldNormal.x,
                  y: worldNormal.y,
                  z: worldNormal.z,
                },
                meshName: clickedMeshName,
              }
            : el,
        ),
      );
    },
    [activeElement, paintTargetName, paintColor, updateElements],
  );

  // For each element, resolve which mesh it should project onto.
  // Default: the largest mesh (= the main body) if none recorded.
  const mainMesh = useMemo(() => {
    if (!meshes.length) return null;
    let best = meshes[0];
    let bestArea = -Infinity;
    for (const m of meshes) {
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      const size = new THREE.Vector3();
      bb.getSize(size);
      const area = size.x * size.y + size.y * size.z + size.x * size.z;
      if (area > bestArea) {
        bestArea = area;
        best = m;
      }
    }
    return best;
  }, [meshes]);

  const meshFor = useCallback(
    (el: DesignElement): THREE.Mesh | null => {
      if (el.meshName) {
        return meshes.find((m) => m.name === el.meshName) || mainMesh;
      }
      return mainMesh;
    },
    [meshes, mainMesh],
  );


  // r3f's internal ResizeObserver occasionally misses the initial layout pass
  // and leaves the canvas stuck at the 300×150 HTML default. Forward our
  // wrapper's resize events to window.resize, which r3f does pick up.
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'));
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapperRef} className="w-full h-full relative" style={{ minHeight: 400 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: config.camera, fov: 35, near: 0.1, far: 100 }}
        onPointerMissed={() => onActiveElementChange?.(null)}
        // preserveDrawingBuffer is required for canvas.toDataURL() to return
        // actual pixels — without it, WebGL clears the backbuffer between
        // frames and snapshots come back transparent. Used by AI design
        // critique to send a screenshot to Gemini Vision.
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          // ACES Filmic tone mapping = the modern industry standard for
          // realistic, film-like color rendering. Without this, lights blow
          // out white and shadows look muddy. With it, the whole scene gets
          // a noticeably more "photo-quality" look.
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        // Exposure tuned per environment preset (golden hour brighter, etc)
        onCreated={({ gl }) => {
          gl.toneMappingExposure = envMeta.toneMappingExposure;
        }}
        style={{ width: '100%', height: '100%' }}
      >
        {/* When try-on is active, pull the camera back so head + feet fit.
            Only used when no cameraPreset is active — SmoothCamera takes over
            when the user picks an angle from the preset chips. */}
        {!cameraPreset && (
          <CameraSetup
            position={
              config.wearable && tryOn
                ? [config.camera[0], config.camera[1] + 0.4, config.camera[2] * 2.0]
                : config.camera
            }
          />
        )}

        {/* Smooth animated camera for preset angles */}
        <SmoothCamera
          target={cameraTarget}
          baseDistance={baseCameraDistance}
          enabled={!!cameraPreset}
        />

        {/* Live tone-mapping-exposure update on environment change */}
        <ToneMappingUpdater exposure={envMeta.toneMappingExposure} />

        {/* Lighting — tuned per environment preset for cinematic feel */}
        <ambientLight intensity={envMeta.ambient} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={envMeta.keyIntensity}
          color={envMeta.keyColor}
          castShadow
          shadow-mapSize-width={premiumShadows ? 2048 : 1024}
          shadow-mapSize-height={premiumShadows ? 2048 : 1024}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-3, 2, -4]} intensity={envMeta.fillIntensity} />
        {envMeta.rim && (
          <directionalLight
            position={[0, 3, -6]}
            intensity={envMeta.rim.intensity}
            color={envMeta.rim.color}
          />
        )}

        <Suspense
          fallback={
            <Html center>
              <div className="px-3 py-1.5 rounded-full bg-white/90 text-xs font-semibold text-slate-600 shadow">
                Loading model…
              </div>
            </Html>
          }
        >
          <Environment preset={envMeta.hdr as any} />

          <group
            position={[
              config.position[0],
              // When try-on is active, raise the garment to the body's chest.
              // Per-product offset (tryOnOffsetY) since each garment GLB has
              // its origin at a different height.
              config.position[1] + (config.wearable && tryOn ? (config.tryOnOffsetY ?? 1) : 0),
              config.position[2],
            ]}
            rotation={[
              config.rotation[0],
              config.rotation[1] + (view === 'back' ? Math.PI : 0),
              config.rotation[2],
            ]}
            scale={config.scale}
          >
            <ProductMesh
              url={config.path}
              baseColor={productColor}
              meshColors={meshColors}
              finish={finish}
              pattern={pattern}
              patternAccent={patternAccent}
              paintTargetName={paintTargetName}
              onMeshesReady={setMeshes}
              onSurfaceClick={handleSurfaceClick}
            />
          </group>

          {/* Mannequin body lives at the scene root and positions itself based
              on the garment's actual world-space bounding box, so we don't
              need product-specific offset constants. */}
          {config.wearable && tryOn && garmentBounds && (
            <MannequinBody
              size={bodySize}
              gender={bodyGender}
              garmentCenter={garmentBounds.center}
              garmentSize={garmentBounds.size}
            />
          )}


          {/*
           * Decals MUST render at the scene root (outside the product <group>):
           * DecalGeometry generates vertices in WORLD space using the target
           * mesh's matrixWorld. If we placed the decal inside the group, the
           * group's transform would be re-applied and the decal would float
           * off the surface (e.g. "under the shirt").
           */}
          {/* Filter out hidden layers — the Layers panel toggles this flag
              when the eye icon is clicked. Locked layers still render but
              ignore selection / drag events. */}
          {elements.filter((el) => !el.hidden).map((el) => (
            <ProjectedDecal
              key={el.id}
              element={el}
              targetMesh={meshFor(el)}
              allMeshes={meshes}
              selected={el.id === activeElement}
              onSelect={() => !el.locked && onActiveElementChange?.(el.id)}
              maxDecalFraction={config.maxDecalFraction}
              onTransform={(patch) =>
                updateElements((prev) =>
                  prev.map((x) =>
                    x.id === el.id ? { ...x, ...patch } : x,
                  ),
                )
              }
            />
          ))}

          {/* Realistic contact shadows — much better than the flat plane.
              Fades from product outline outward, depth-blurred. The premium
              path uses AccumulativeShadows for product-photography quality. */}
          {premiumShadows ? (
            <AccumulativeShadows
              position={[0, -1.299, 0]}
              frames={60}
              alphaTest={0.85}
              scale={10}
              opacity={0.5}
            >
              <RandomizedLight amount={8} radius={4} intensity={0.7} ambient={0.25} position={[5, 5, -10]} />
            </AccumulativeShadows>
          ) : (
            <ContactShadows
              position={[0, -1.299, 0]}
              opacity={0.45}
              scale={12}
              blur={2.5}
              far={3}
              resolution={512}
              color={environment === 'night' ? '#1e293b' : '#0f172a'}
            />
          )}
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          enablePan={false}
          minDistance={1.5}
          maxDistance={12}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI - Math.PI / 6}
          autoRotate={autoRotate}
          autoRotateSpeed={autoRotateSpeed}
        />
      </Canvas>

      {/* Placement hint */}
      {activeElement && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur text-[11px] font-semibold text-white shadow-lg pointer-events-none">
          Click anywhere on the product to place · drag the gizmo to fine-tune
        </div>
      )}

      {/* Customize/Appearance panel (all products) */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
        <button
          onClick={() => setAppearanceOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold shadow-md transition-all ${
            appearanceOpen
              ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white hover:from-blue-600 hover:to-blue-800 scale-105'
              : 'bg-white text-slate-700 hover:bg-slate-50 hover:scale-105'
          }`}
        >
          <span className="text-base leading-none">🎨</span>
          <span>Customize</span>
        </button>

        {appearanceOpen && (
          <div className="w-72 max-h-[calc(100vh-8rem)] overflow-y-auto bg-white shadow-2xl rounded-2xl text-xs">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-800">Customize Appearance</div>
                <button
                  onClick={() => setAppearanceOpen(false)}
                  className="text-slate-400 hover:text-slate-700 text-lg leading-none"
                  aria-label="Close panel"
                >
                  ×
                </button>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Choose colors, materials, and patterns
              </div>
            </div>

            <div className="px-4 py-3 space-y-4">
              {/* Material finish */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[13px]">✨</span>
                  <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                    Material Finish
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(MATERIAL_FINISHES) as MaterialFinish[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setFinish(k)}
                      className={`flex flex-col items-center gap-1 px-1 py-1.5 rounded-lg font-semibold text-[10px] transition-all ${
                        finish === k
                          ? 'bg-blue-600 text-white shadow-md scale-105'
                          : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {/* tiny visual swatch showing the finish character */}
                      <span
                        className={`w-5 h-5 rounded-full ${
                          k === 'matte' ? 'bg-slate-300' :
                          k === 'satin' ? 'bg-gradient-to-br from-slate-200 to-slate-400' :
                          k === 'glossy' ? 'bg-gradient-to-br from-white to-slate-400 shadow-inner' :
                          'bg-[repeating-conic-gradient(from_0deg,_#cbd5e1_0deg_10deg,_#94a3b8_10deg_20deg)]'
                        }`}
                      />
                      <span>{MATERIAL_FINISHES[k].label}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Color */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px]">🎨</span>
                    <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                      {paintTargetName ? 'Paint Part' : 'Product Color'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className="w-4 h-4 rounded border border-slate-300"
                      style={{ backgroundColor: paintTargetName ? paintColor : (productColor || '#ffffff') }}
                    />
                    <span className="font-mono text-[9px] text-slate-500 uppercase">
                      {paintTargetName ? paintColor : (productColor || '#ffffff')}
                    </span>
                  </div>
                </div>
                {paintTargetName && (
                  <div className="text-[10px] text-blue-600 mb-1.5 font-semibold">
                    → Painting: {paintTargetName || 'click a part on the model'}
                  </div>
                )}
                <div className="grid grid-cols-6 gap-1.5 mb-2">
                  {COLOR_PALETTE.map((c) => {
                    const currentColor = paintTargetName
                      ? paintColor
                      : (productColor || '#ffffff');
                    return (
                      <button
                        key={c.hex}
                        onClick={() => {
                          if (paintTargetName) {
                            setPaintColor(c.hex);
                            setMeshColors((prev) => ({ ...prev, [paintTargetName]: c.hex }));
                          } else {
                            handleProductColorChange(c.hex);
                          }
                        }}
                        className={`w-8 h-8 rounded-lg transition-transform ${
                          currentColor.toLowerCase() === c.hex.toLowerCase()
                            ? 'ring-2 ring-blue-600 ring-offset-2 scale-110'
                            : 'ring-1 ring-slate-200 hover:scale-110 hover:ring-slate-400'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    );
                  })}
                </div>
                <label className="flex items-center gap-2 text-[10px] text-slate-600 cursor-pointer">
                  <input
                    type="color"
                    value={paintTargetName ? paintColor : (productColor || '#ffffff')}
                    onChange={(e) => {
                      if (paintTargetName) {
                        setPaintColor(e.target.value);
                        setMeshColors((prev) => ({ ...prev, [paintTargetName]: e.target.value }));
                      } else {
                        handleProductColorChange(e.target.value);
                      }
                    }}
                    className="w-7 h-7 rounded cursor-pointer border border-slate-200"
                  />
                  <span>Custom color</span>
                </label>
              </section>

              {/* Click-to-paint mode */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[13px]">🖌️</span>
                  <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                    Paint Mode
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      if (paintTargetName !== null) {
                        setPaintTargetName(null);
                      } else {
                        setPaintTargetName('');
                      }
                    }}
                    className={`flex-1 px-2 py-2 rounded-lg font-semibold text-[11px] transition-all ${
                      paintTargetName !== null
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {paintTargetName !== null ? '● Painting on' : 'Paint individual parts'}
                  </button>
                  <button
                    onClick={() => {
                      setMeshColors({});
                      setPaintTargetName(null);
                    }}
                    className="px-2.5 py-2 rounded-lg font-semibold text-[11px] bg-slate-50 text-slate-700 hover:bg-slate-100"
                    title="Clear all per-part paint"
                  >
                    Clear
                  </button>
                </div>
                {paintTargetName !== null && (
                  <div className="mt-1.5 px-2 py-1.5 rounded-md bg-blue-50 text-[10px] text-blue-700 leading-snug">
                    {paintTargetName === ''
                      ? '1. Click any part of the 3D model →  2. pick a color above'
                      : `Selected: ${paintTargetName}. Pick a color above or click another part.`}
                  </div>
                )}
              </section>

              {/* Pattern overlay */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[13px]">🪡</span>
                  <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                    Pattern
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {(Object.keys(PATTERN_LABELS) as PatternKind[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setPattern(k)}
                      className="flex flex-col items-center gap-0.5"
                      title={PATTERN_LABELS[k]}
                    >
                      <PatternThumbnail
                        kind={k}
                        base={(productColor || '#ffffff')}
                        accent={patternAccent || '#000000'}
                        selected={pattern === k}
                      />
                      <span
                        className={`text-[9px] font-semibold ${
                          pattern === k ? 'text-blue-600' : 'text-slate-500'
                        }`}
                      >
                        {k === 'none' ? 'Solid' : k === 'stripes-h' ? 'Stripe' : k === 'stripes-v' ? 'Vert' : k.charAt(0).toUpperCase() + k.slice(1)}
                      </span>
                    </button>
                  ))}
                </div>
                {pattern !== 'none' && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                    <div className="text-[10px] text-slate-600 mb-1.5 font-semibold">Accent color</div>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {COLOR_PALETTE.slice(0, 6).map((c) => (
                        <button
                          key={c.hex}
                          onClick={() => setPatternAccent(c.hex)}
                          className={`w-6 h-6 rounded-md transition-transform ${
                            patternAccent.toLowerCase() === c.hex.toLowerCase()
                              ? 'ring-2 ring-blue-600 ring-offset-1 scale-110'
                              : 'ring-1 ring-slate-200 hover:scale-110'
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                      <input
                        type="color"
                        value={patternAccent}
                        onChange={(e) => setPatternAccent(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border border-slate-200"
                        title="Custom accent"
                      />
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>

      {/* Try-On controls (wearable products only) */}
      {config.wearable && (
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2">
          <button
            onClick={() => setTryOn((v) => !v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold shadow-md transition-all ${
              tryOn
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white hover:from-emerald-600 hover:to-emerald-800 scale-105'
                : 'bg-white text-slate-700 hover:bg-slate-50 hover:scale-105'
            }`}
          >
            <span className="text-base leading-none">👤</span>
            <span>{tryOn ? 'Try-On: On' : 'Try On Body'}</span>
          </button>
          {tryOn && (
            <div
              className="flex items-center gap-2 bg-white rounded-full shadow-md px-1.5 py-1"
              style={{ animation: 'fadeIn 0.18s ease-out' }}
            >
              {/* Gender toggle */}
              <div className="flex items-center gap-0.5">
                {(['male', 'female'] as BodyGender[]).map((g) => (
                  <button
                    key={g}
                    onClick={() => setBodyGender(g)}
                    className={`px-2.5 h-7 rounded-full text-[11px] font-bold transition-colors ${
                      bodyGender === g
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title={g === 'male' ? 'Male body' : 'Female body'}
                  >
                    {g === 'male' ? '♂ Man' : '♀ Woman'}
                  </button>
                ))}
              </div>
              {/* Divider */}
              <div className="w-px h-5 bg-slate-200" />
              {/* Size toggle */}
              <div className="flex items-center gap-0.5">
                {(Object.keys(BODY_SIZES) as BodySize[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setBodySize(s)}
                    className={`w-7 h-7 rounded-full text-[11px] font-bold transition-colors ${
                      bodySize === s
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                    title={`${BODY_SIZES[s].label} build`}
                  >
                    {BODY_SIZES[s].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Animation keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// Preload all GLBs once so first-render of the studio is fast
Object.values(PRODUCT_MODELS).forEach((m) => {
  if (m.path) useGLTF.preload(m.path);
});

export default ProductCustomizer3D;
