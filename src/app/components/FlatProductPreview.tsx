import React from 'react';

type Surface = 'front' | 'back' | 'left' | 'right' | 'wrap' | 'top';

interface FlatProductPreviewProps {
  productName: string;
  productType?: string;
  category?: string;
  view: 'front' | 'back';
  productColor: string;
  text?: string;
  textColor?: string;
  font?: string;
  textSize?: number;
  textRotation?: number;
  textPosition?: { x: number; y: number };
  textStroke?: number;
  textStrokeColor?: string;
  textShadow?: number;
  textShadowColor?: string;
  textLetterSpacing?: number;
  textSurface?: Surface;
  image?: string;
  imagePosition?: { x: number; y: number };
  imageScale?: number;
  imageRotation?: number;
  imageOpacity?: number;
  imageFlipX?: boolean;
  imageFlipY?: boolean;
  imageSurface?: Surface;
}

type ShapeKind = 'shirt' | 'mug' | 'tote' | 'mousepad' | 'fan' | 'tumbler' | 'generic';

function productShape(name: string, type = '', category = ''): ShapeKind {
  const key = `${name} ${type} ${category}`.toLowerCase();
  if (/shirt|jersey|apparel|hoodie|sweatshirt|polo/.test(key)) return 'shirt';
  if (/mug|cup/.test(key)) return 'mug';
  if (/tote|bag|purse/.test(key)) return 'tote';
  if (/mouse ?pad|keyboard ?pad|desk ?mat/.test(key)) return 'mousepad';
  if (/fan/.test(key)) return 'fan';
  if (/tumbler|bottle|thermos/.test(key)) return 'tumbler';
  return 'generic';
}

const SHIRT = 'M225 82 L172 102 L82 158 L132 253 L187 221 L187 520 Q300 548 413 520 L413 221 L468 253 L518 158 L428 102 L375 82 Q360 132 300 132 Q240 132 225 82 Z';
const SHIRT_BACK = 'M225 82 L172 102 L82 158 L132 253 L187 221 L187 520 Q300 548 413 520 L413 221 L468 253 L518 158 L428 102 L375 82 Q360 103 300 103 Q240 103 225 82 Z';
const TOTE = 'M180 190 L420 190 L455 520 Q300 545 145 520 Z';

function shadeColor(color: string, amount: number): string {
  const normalized = color.trim().replace('#', '');
  const fullHex = normalized.length === 3 ? normalized.split('').map((v) => v + v).join('') : normalized;
  if (!/^[\da-f]{6}$/i.test(fullHex)) return color;
  const rgb = [0, 2, 4].map((offset) => parseInt(fullHex.slice(offset, offset + 2), 16));
  const shaded = rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel + (amount >= 0 ? 255 - channel : channel) * amount))));
  return `#${shaded.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** A deliberately flat, scalable product illustration with the current artwork printed on it. */
export function FlatProductPreview(props: FlatProductPreviewProps) {
  const {
    productName, productType, category, view, productColor,
    text, textColor = '#111827', font = 'Arial', textSize = 24,
    textRotation = 0, textPosition = { x: 50, y: 50 }, textStroke = 0,
    textStrokeColor = '#ffffff', textShadow = 0, textShadowColor = '#000000',
    textLetterSpacing = 0, textSurface, image, imagePosition = { x: 50, y: 50 },
    imageScale = 1, imageRotation = 0, imageOpacity = 1, imageFlipX = false,
    imageFlipY = false, imageSurface,
  } = props;
  const kind = productShape(productName, productType, category);
  const shirtPath = view === 'back' ? SHIRT_BACK : SHIRT;
  const showText = !!text && (!textSurface || textSurface === view || textSurface === 'wrap');
  const showImage = !!image && (!imageSurface || imageSurface === view || imageSurface === 'wrap');
  const printX = 300 + (Math.max(0, Math.min(100, imagePosition.x)) - 50) * 2.2;
  const printY = 330 + (Math.max(0, Math.min(100, imagePosition.y)) - 50) * 2.2;
  const labelX = 300 + (Math.max(0, Math.min(100, textPosition.x)) - 50) * 2.2;
  const labelY = 330 + (Math.max(0, Math.min(100, textPosition.y)) - 50) * 2.2;
  const flatTextSize = Math.max(12, Math.min(72, textSize * 1.55));
  const imageWidth = Math.max(36, Math.min(220, 120 * imageScale));

  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg
        viewBox="0 0 600 600"
        role="img"
        aria-label={`Detailed flat ${view} illustration of customized ${productName}`}
        className="h-full w-full max-h-[min(72vh,640px)] max-w-[min(78vw,640px)] select-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="flat-product-material" x1="0" y1="0" x2="1" y2=".45">
            <stop offset="0" stopColor={shadeColor(productColor, -0.26)} />
            <stop offset=".16" stopColor={shadeColor(productColor, -0.10)} />
            <stop offset=".42" stopColor={shadeColor(productColor, 0.12)} />
            <stop offset=".65" stopColor={productColor} />
            <stop offset=".84" stopColor={shadeColor(productColor, -0.06)} />
            <stop offset="1" stopColor={shadeColor(productColor, -0.28)} />
          </linearGradient>
          <linearGradient id="flat-fabric-highlight" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".24" stopColor="#fff" stopOpacity=".17" />
            <stop offset=".48" stopColor="#fff" stopOpacity=".035" />
            <stop offset=".72" stopColor="#fff" stopOpacity=".14" />
            <stop offset="1" stopColor="#0f172a" stopOpacity=".18" />
          </linearGradient>
          <linearGradient id="flat-fold" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0f172a" stopOpacity="0" />
            <stop offset=".5" stopColor="#0f172a" stopOpacity=".17" />
            <stop offset="1" stopColor="#fff" stopOpacity=".05" />
          </linearGradient>
          <linearGradient id="flat-collar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shadeColor(productColor, -0.35)} />
            <stop offset=".48" stopColor={shadeColor(productColor, -0.08)} />
            <stop offset="1" stopColor={shadeColor(productColor, 0.14)} />
          </linearGradient>
          <filter id="flat-fabric-grain" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" seed="4" result="grain" />
            <feColorMatrix in="grain" type="saturate" values="0" result="mono-grain" />
            <feComponentTransfer in="mono-grain" result="soft-grain">
              <feFuncA type="table" tableValues="0 .11" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="soft-grain" mode="soft-light" />
          </filter>
          <filter id="flat-product-shadow" x="-25%" y="-20%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <clipPath id="flat-product-print-area">
            {kind === 'shirt' && <path d={shirtPath} />}
            {kind === 'tote' && <path d={TOTE} />}
            {kind === 'mug' && <rect x="156" y="178" width="280" height="320" rx="20" />}
            {kind === 'tumbler' && <path d="M205 150 L395 150 L375 510 Q300 530 225 510 Z" />}
            {kind === 'mousepad' && <rect x="90" y="180" width="420" height="260" rx="26" />}
            {kind === 'fan' && <path d="M130 410 A170 170 0 0 1 470 410 L300 530 Z" />}
            {kind === 'generic' && <rect x="140" y="160" width="320" height="330" rx="30" />}
          </clipPath>
          <filter id="flat-art-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={Math.max(0, Math.min(8, textShadow / 2))} />
          </filter>
        </defs>

        {/* Flat, shaded vector artwork; no catalog photo or 3D mesh is used. */}
        {kind === 'shirt' && <>
          <path d={shirtPath} transform="translate(0 9)" fill="#0f172a" opacity=".2" filter="url(#flat-product-shadow)" />
          <path d={shirtPath} fill="url(#flat-product-material)" stroke={shadeColor(productColor, -0.42)} strokeWidth="2.5" strokeLinejoin="round" filter="url(#flat-fabric-grain)" />
          <path d={shirtPath} fill="url(#flat-fabric-highlight)" opacity=".82" />
          <path d="M172 111 Q197 136 187 221 L132 253 L91 174 Q128 138 172 111 Z M428 111 Q403 136 413 221 L468 253 L509 174 Q472 138 428 111 Z" fill="url(#flat-fold)" opacity=".7" />
          <path d="M225 82 Q240 132 300 132 Q360 132 375 82 Q360 145 300 145 Q240 145 225 82 Z" fill="url(#flat-collar)" stroke={shadeColor(productColor, -0.35)} strokeWidth="2" />
          <path d="M225 82 Q240 132 300 132 Q360 132 375 82" fill="none" stroke={shadeColor(productColor, -0.42)} strokeWidth="2" />
          <path d="M187 221 Q206 228 211 242 M413 221 Q394 228 389 242 M205 239 L205 508 M395 239 L395 508 M200 513 Q300 536 400 513" fill="none" stroke={shadeColor(productColor, -0.32)} strokeOpacity=".66" strokeWidth="1.5" />
          <path d="M211 256 C220 300 216 365 224 422 M389 256 C380 300 384 365 376 422 M263 160 C251 215 257 263 252 294 M337 160 C349 215 343 263 348 294" fill="none" stroke="url(#flat-fold)" strokeWidth="11" strokeLinecap="round" opacity=".6" />
          <path d="M207 252 C215 300 211 364 219 420 M393 252 C385 300 389 364 381 420" fill="none" stroke="#fff" strokeOpacity=".14" strokeWidth="3" strokeLinecap="round" />
          <path d="M195 233 L195 507 M405 233 L405 507" fill="none" stroke="#fff" strokeOpacity=".42" strokeWidth="1" strokeDasharray="3 5" />
        </>}
        {kind === 'mug' && <>
          <path d="M420 230 C520 205 548 292 503 356 C482 386 451 379 421 362" fill="none" stroke={shadeColor(productColor, -0.4)} strokeWidth="48" />
          <path d="M420 235 C494 221 514 292 481 337 C466 357 449 354 425 344" fill="none" stroke="url(#flat-product-material)" strokeWidth="32" />
          <path d="M156 178 H436 V465 Q436 498 403 498 H189 Q156 498 156 465 Z" fill="url(#flat-product-material)" stroke={shadeColor(productColor, -0.42)} strokeWidth="3" />
          <path d="M173 202 Q187 220 180 462" fill="none" stroke="#fff" strokeOpacity=".24" strokeWidth="9" />
          <path d="M416 200 Q403 300 415 464" fill="none" stroke="#0f172a" strokeOpacity=".12" strokeWidth="8" />
          <path d="M174 198 H418" stroke="#fff" strokeOpacity=".48" strokeWidth="2" />
        </>}
        {kind === 'tote' && <>
          <path d="M220 205 V145 Q220 65 300 65 Q380 65 380 145 V205" fill="none" stroke={shadeColor(productColor, -0.32)} strokeWidth="30" />
          <path d="M220 205 V145 Q220 72 300 72 Q380 72 380 145 V205" fill="none" stroke="url(#flat-product-material)" strokeWidth="22" />
          <path d={TOTE} fill="url(#flat-product-material)" stroke={shadeColor(productColor, -0.4)} strokeWidth="3" strokeLinejoin="round" filter="url(#flat-fabric-grain)" />
          <path d="M165 220 L190 500 M435 220 L410 500" stroke={shadeColor(productColor, -0.34)} strokeOpacity=".55" strokeWidth="2" strokeDasharray="4 5" />
          <path d="M196 230 Q210 365 195 490 M404 230 Q390 365 405 490" stroke="#fff" strokeOpacity=".18" strokeWidth="9" fill="none" />
        </>}
        {kind === 'mousepad' && <rect x="90" y="180" width="420" height="260" rx="26" fill={productColor} stroke="#64748b" strokeWidth="3" />}
        {kind === 'fan' && <>
          <path d="M130 410 A170 170 0 0 1 470 410 L300 530 Z" fill={productColor} stroke="#64748b" strokeWidth="3" />
          {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M300 530 L${130 + i * 56} ${410 - Math.round(Math.sin((i * Math.PI) / 6) * 170)}`} stroke="#64748b" strokeOpacity=".35" strokeWidth="2" />)}
          <circle cx="300" cy="530" r="14" fill="#64748b" />
        </>}
        {kind === 'tumbler' && <>
          <path d="M205 150 L395 150 L375 510 Q300 530 225 510 Z" fill={productColor} stroke="#64748b" strokeWidth="3" strokeLinejoin="round" />
          <path d="M195 140 H405 V165 H195 Z" fill={productColor} stroke="#64748b" strokeWidth="3" />
        </>}
        {kind === 'generic' && <rect x="140" y="160" width="320" height="330" rx="30" fill={productColor} stroke="#64748b" strokeWidth="3" />}

        <g clipPath="url(#flat-product-print-area)">
          {showImage && <image
            href={image}
            x={printX - imageWidth / 2}
            y={printY - imageWidth / 2}
            width={imageWidth}
            height={imageWidth}
            preserveAspectRatio="xMidYMid meet"
            opacity={imageOpacity}
            transform={`rotate(${imageRotation} ${printX} ${printY}) translate(${imageFlipX ? imageWidth : 0} ${imageFlipY ? imageWidth : 0}) scale(${imageFlipX ? -1 : 1} ${imageFlipY ? -1 : 1})`}
          />}
          {showText && <g transform={`rotate(${textRotation} ${labelX} ${labelY})`}>
            {textShadow > 0 && <text x={labelX + 2} y={labelY + 3} textAnchor="middle" dominantBaseline="middle" fontFamily={font} fontSize={flatTextSize} fontWeight="bold" letterSpacing={textLetterSpacing} fill={textShadowColor} opacity=".45" filter="url(#flat-art-shadow)">{text}</text>}
            <text x={labelX} y={labelY} textAnchor="middle" dominantBaseline="middle" fontFamily={font} fontSize={flatTextSize} fontWeight="bold" letterSpacing={textLetterSpacing} fill={textColor} stroke={textStroke ? textStrokeColor : 'none'} strokeWidth={textStroke * 1.5} paintOrder="stroke">{text}</text>
          </g>}
        </g>
      </svg>
    </div>
  );
}
