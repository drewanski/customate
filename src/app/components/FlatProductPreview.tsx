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
        aria-label={`Flat ${view} view of customized ${productName}`}
        className="h-full w-full max-h-[min(72vh,640px)] max-w-[min(78vw,640px)] select-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
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

        {/* Flat vector product body: no catalog photo, perspective, lighting, or 3D mesh. */}
        {kind === 'shirt' && <>
          <path d={shirtPath} fill={productColor} stroke="#64748b" strokeWidth="3" strokeLinejoin="round" />
          <path d={view === 'front' ? 'M225 82 Q240 132 300 132 Q360 132 375 82' : 'M225 82 Q240 103 300 103 Q360 103 375 82'} fill="none" stroke="#64748b" strokeWidth="5" />
          <path d="M187 221 L205 230 M413 221 L395 230 M205 230 L205 510 M395 230 L395 510" fill="none" stroke="#64748b" strokeOpacity=".4" strokeWidth="2" />
        </>}
        {kind === 'mug' && <>
          <path d="M430 235 C520 210 540 290 500 345 C480 375 455 370 430 360" fill="none" stroke={productColor} strokeWidth="42" />
          <path d="M156 178 H436 V465 Q436 498 403 498 H189 Q156 498 156 465 Z" fill={productColor} stroke="#64748b" strokeWidth="3" />
          <path d="M174 198 H418" stroke="#64748b" strokeOpacity=".35" strokeWidth="2" />
        </>}
        {kind === 'tote' && <>
          <path d="M220 205 V145 Q220 65 300 65 Q380 65 380 145 V205" fill="none" stroke={productColor} strokeWidth="28" />
          <path d={TOTE} fill={productColor} stroke="#64748b" strokeWidth="3" strokeLinejoin="round" />
          <path d="M165 220 L190 500 M435 220 L410 500" stroke="#64748b" strokeOpacity=".35" strokeWidth="2" />
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
