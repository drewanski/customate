import React, { Suspense, Component, useRef, useEffect, useState, useMemo } from "react";
import type { FC } from "react";
import { Canvas, extend, useThree } from "@react-three/fiber";
import { OrbitControls, Stage, useGLTF, Text, Decal, useTexture, RoundedBox } from "@react-three/drei";
// @ts-ignore - OBJLoader from three.js addons
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import * as THREE from "three";

// Extend Three.js elements for JSX
extend({ OrbitControls, Stage, Text, Decal });

// Type declarations for Three.js JSX elements
declare global {
  namespace JSX {
    interface IntrinsicElements {
      primitive: any;
      group: any;
      mesh: any;
      ambientLight: any;
      directionalLight: any;
      spotLight: any;
      pointLight: any;
      meshBasicMaterial: any;
      meshStandardMaterial: any;
      cylinderGeometry: any;
      boxGeometry: any;
      torusGeometry: any;
      sphereGeometry: any;
      capsuleGeometry: any;
      meshPhysicalMaterial: any;
      circleGeometry: any;
      planeGeometry: any;
      gridHelper: any;
      axesHelper: any;
    }
  }
}

interface Product3DProps {
  modelUrl?: string;
  productType?: 'mug' | 'tumbler' | 'shirt' | 'tote' | 'mousepad' | 'fan' | 'default';
  customization?: {
    text?: string;
    font?: string;
    color?: string;
    productColor?: string;
    image?: string;
    textPosition?: { x: number; y: number; z?: number };
    imagePosition?: { x: number; y: number; z?: number };
    textSize?: number;
    textRotation?: number;
    textScale?: number;
    imageScale?: number;
    imageRotation?: number;
  };
  onPositionChange?: (type: 'text' | 'image', position: { x: number; y: number; z?: number }) => void;
  enablePrecisionMode?: boolean;
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-100 rounded-3xl p-6 text-center">
          <div>
            <p className="text-slate-500 font-medium">3D Preview is temporarily unavailable.</p>
            <p className="text-xs text-slate-400 mt-1">Please use the 2D view to continue your design.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Text Texture Generator for Decals - Creates text that sticks to object surfaces
function createTextTexture(text: string, font: string, color: string, bgColor: string = 'transparent'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  
  // Clear with transparent background
  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  // Draw text
  ctx.font = `bold 48px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Word wrap for long text
  const words = text.split(' ');
  let line = '';
  let y = canvas.height / 2;
  const lineHeight = 56;
  const maxWidth = 480;
  
  if (words.length > 3) {
    const lines: string[] = [];
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line);
    
    y = (canvas.height - (lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => {
      ctx.fillText(l.trim(), canvas.width / 2, y + i * lineHeight);
    });
  } else {
    ctx.fillText(text, canvas.width / 2, y);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// T-Shirt 3D Model Component - Using Professional GLB Model
function TShirtModel({ color = '#ffffff', customization }: { color?: string; customization?: Product3DProps['customization'] }) {
  const texture = customization?.image ? useTexture(customization.image) : null;
  const textScale = customization?.textSize ? (customization.textSize / 72) * 0.08 : 0.06;
  
  // Load the professional GLB model with embedded textures
  const { scene } = useGLTF('/oversized-t-shirt/oversized_t-shirt.glb');
  const modelRef = useRef<THREE.Group>(null);

  // Clone and setup model
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Preserve original material but allow color tinting
        if (child.material) {
          child.material = child.material.clone();
          child.material.color.set(color);
        }
      }
    });
    return clone;
  }, [scene, color]);

  return (
    <group ref={modelRef} scale={1.2} position={[0, -1, 0]} rotation={[0, Math.PI, 0]}>
      <primitive object={clonedScene} castShadow receiveShadow />
      
      {/* Custom Text Decal - Sticks to shirt surface with dynamic positioning */}
      {customization?.text && (
        (() => {
          const text = customization!.text;
          const font = customization!.font || 'Arial';
          const color = customization!.color || '#000000';
          const textTexture = createTextTexture(text, font, color, 'transparent');
          // Calculate position from percentage (0-100) to 3D coordinates (shirt surface)
          const posX = ((customization!.textPosition?.x || 50) - 50) / 50 * 0.4;
          const posY = ((customization!.textPosition?.y || 50) - 50) / 50 * 0.6 + 1.2;
          const posZ = (customization!.textPosition?.z || 0) / 100 * 0.1 + 0.38;
          const scale = (customization!.textScale || 1) * 0.5;
          const rotation = (customization!.textRotation || 0) * (Math.PI / 180);
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[0, 0, rotation]} 
              scale={[scale * 1.5, scale * 0.75, scale]}
            >
              <meshBasicMaterial 
                map={textTexture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}

      {/* Custom Image Decal with dynamic positioning */}
      {texture && customization?.image && (
        (() => {
          const posX = ((customization!.imagePosition?.x || 50) - 50) / 50 * 0.4;
          const posY = ((customization!.imagePosition?.y || 50) - 50) / 50 * 0.6 + 1.2;
          const posZ = (customization!.imagePosition?.z || 0) / 100 * 0.1 + 0.35;
          const scale = (customization!.imageScale || 1) * 0.45;
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[0, 0, 0]} 
              scale={[scale, scale, scale]}
            >
              <meshBasicMaterial 
                map={texture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}
    </group>
  );
}

// Mug 3D Model Component - Photo-Realistic Ceramic with Glaze
function MugModel({ color = '#f5f5f5', customization }: { color?: string; customization?: Product3DProps['customization'] }) {
  const texture = customization?.image ? useTexture(customization.image) : null;
  const textScale = customization?.textSize ? (customization.textSize / 72) * 0.07 : 0.055;

  return (
    <group scale={1.1}>
      {/* Main Mug Body - Outer shell with ceramic thickness */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.88, 0.82, 2.2, 64, 1]} />
        <meshPhysicalMaterial 
          color={color} 
          roughness={0.1} 
          metalness={0.02}
          clearcoat={0.3}
          clearcoatRoughness={0.1}
        />
      </mesh>
      
      {/* Inner wall - creates realistic thickness */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.78, 0.72, 2.0, 64, 1, true]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.3} side={THREE.BackSide} />
      </mesh>
      
      {/* Mug bottom interior */}
      <mesh position={[0, -1.0, 0]}>
        <cylinderGeometry args={[0.78, 0.78, 0.02, 64]} />
        <meshStandardMaterial color="#e8e8e8" roughness={0.3} />
      </mesh>
      
      {/* Top Rim - Rounded edge */}
      <mesh position={[0, 1.12, 0]} castShadow>
        <torusGeometry args={[0.83, 0.06, 12, 64]} />
        <meshPhysicalMaterial 
          color={color} 
          roughness={0.1} 
          metalness={0.02}
          clearcoat={0.4}
        />
      </mesh>
      
      {/* Bottom base with recessed foot */}
      <mesh position={[0, -1.12, 0]} castShadow>
        <cylinderGeometry args={[0.75, 0.75, 0.08, 64]} />
        <meshPhysicalMaterial color={color} roughness={0.12} metalness={0.02} />
      </mesh>
      
      {/* Bottom rim ring */}
      <mesh position={[0, -1.16, 0]} castShadow>
        <torusGeometry args={[0.75, 0.04, 8, 64]} />
        <meshStandardMaterial color={color} roughness={0.15} />
      </mesh>
      
      {/* Handle - Classic ear shape with proper attachment */}
      <group position={[0, 0, 0]}>
        {/* Main handle curve */}
        <mesh position={[0.95, 0.05, 0]} castShadow>
          <torusGeometry args={[0.5, 0.09, 14, 48, Math.PI * 1.4]} />
          <meshPhysicalMaterial 
            color={color} 
            roughness={0.12} 
            metalness={0.02}
            clearcoat={0.2}
          />
        </mesh>
        
        {/* Upper handle connection - Smooth blend */}
        <mesh position={[0.82, 0.55, 0]} rotation={[0, 0, -0.3]} castShadow>
          <capsuleGeometry args={[0.1, 0.25, 4, 8]} />
          <meshPhysicalMaterial color={color} roughness={0.12} />
        </mesh>
        
        {/* Lower handle connection */}
        <mesh position={[0.82, -0.45, 0]} rotation={[0, 0, 0.3]} castShadow>
          <capsuleGeometry args={[0.1, 0.25, 4, 8]} />
          <meshPhysicalMaterial color={color} roughness={0.12} />
        </mesh>
      </group>

      {/* Custom Text Decal - Sticks to mug surface with dynamic positioning */}
      {customization?.text && (
        (() => {
          const text = customization!.text;
          const font = customization!.font || 'Arial';
          const color = customization!.color || '#000000';
          const textTexture = createTextTexture(text, font, color, 'transparent');
          // Calculate position from percentage (0-100) to 3D coordinates
          const posX = ((customization!.textPosition?.x || 50) - 50) / 50 * 0.5;
          const posY = ((customization!.textPosition?.y || 50) - 50) / 50 * 0.8;
          const posZ = (customization!.textPosition?.z || 0) / 100 * 0.2 + 0.89;
          const scale = (customization!.textScale || 1) * 0.5;
          const rotation = (customization!.textRotation || 0) * (Math.PI / 180);
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[0, 0, rotation]} 
              scale={[scale * 1.5, scale * 0.75, scale]}
            >
              <meshBasicMaterial 
                map={textTexture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}

      {/* Custom Image Decal with proper ceramic surface and dynamic positioning */}
      {texture && customization?.image && (
        (() => {
          const posX = ((customization!.imagePosition?.x || 50) - 50) / 50 * 0.5;
          const posY = ((customization!.imagePosition?.y || 50) - 50) / 50 * 0.8;
          const posZ = (customization!.imagePosition?.z || 0) / 100 * 0.2 + 0.89;
          const scale = (customization!.imageScale || 1) * 0.45;
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[0, 0, 0]} 
              scale={[scale, scale, scale]}
            >
              <meshBasicMaterial 
                map={texture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}
    </group>
  );
}

// Tumbler 3D Model Component - Photo-Realistic Stainless Steel
function TumblerModel({ color = '#c0c0c0', customization }: { color?: string; customization?: Product3DProps['customization'] }) {
  const texture = customization?.image ? useTexture(customization.image) : null;
  const textScale = customization?.textSize ? (customization.textSize / 72) * 0.07 : 0.055;

  return (
    <group scale={1.15}>
      {/* Main Body - Double-walled stainless steel look */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.72, 0.62, 2.8, 64, 1]} />
        <meshPhysicalMaterial 
          color={color} 
          roughness={0.15} 
          metalness={0.6}
          clearcoat={0.2}
          clearcoatRoughness={0.1}
        />
      </mesh>
      
      {/* Subtle brushed texture lines */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.725, 0.625, 2.81, 64, 8, true]} />
        <meshStandardMaterial 
          color={color} 
          roughness={0.25} 
          metalness={0.5}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Top rim ring - metallic band */}
      <mesh position={[0, 1.42, 0]} castShadow>
        <torusGeometry args={[0.72, 0.04, 8, 64]} />
        <meshPhysicalMaterial color="#a0a0a0" roughness={0.1} metalness={0.8} />
      </mesh>
      
      {/* Bottom rubber non-slip base */}
      <mesh position={[0, -1.42, 0]} castShadow>
        <cylinderGeometry args={[0.63, 0.65, 0.06, 64]} />
        <meshStandardMaterial color="#222" roughness={0.9} />
      </mesh>
      
      {/* Bottom rim detail */}
      <mesh position={[0, -1.39, 0]} castShadow>
        <torusGeometry args={[0.64, 0.02, 6, 64]} />
        <meshStandardMaterial color={color} roughness={0.15} metalness={0.6} />
      </mesh>
      
      {/* Slider Lid - Dark plastic */}
      <group position={[0, 1.55, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.74, 0.74, 0.15, 64]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.1} />
        </mesh>
        
        {/* Lid top surface */}
        <mesh position={[0, 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.74, 0.7, 0.02, 64]} />
          <meshStandardMaterial color="#222" roughness={0.25} />
        </mesh>
        
        {/* Slider button */}
        <mesh position={[0.25, 0.12, 0]} castShadow>
          <boxGeometry args={[0.3, 0.04, 0.5]} />
          <meshStandardMaterial color="#333" roughness={0.2} />
        </mesh>
        
        {/* Slider groove */}
        <mesh position={[0.25, 0.14, 0]}>
          <boxGeometry args={[0.32, 0.01, 0.52]} />
          <meshStandardMaterial color="#111" roughness={0.4} />
        </mesh>
      </group>

      {/* Custom Text Decal - Sticks to tumbler surface with dynamic positioning */}
      {customization?.text && (
        (() => {
          const text = customization!.text;
          const font = customization!.font || 'Arial';
          const color = customization!.color || '#000000';
          const textTexture = createTextTexture(text, font, color, 'transparent');
          // Calculate position from percentage (0-100) to 3D coordinates (tumbler surface)
          const posX = ((customization!.textPosition?.x || 50) - 50) / 50 * 0.4;
          const posY = ((customization!.textPosition?.y || 50) - 50) / 50 * 0.6 + 0.15;
          const posZ = (customization!.textPosition?.z || 0) / 100 * 0.1 + 0.72;
          const scale = (customization!.textScale || 1) * 0.45;
          const rotation = (customization!.textRotation || 0) * (Math.PI / 180);
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[0, 0, rotation]} 
              scale={[scale * 1.5, scale * 0.75, scale]}
            >
              <meshBasicMaterial 
                map={textTexture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}

      {/* Custom Image Decal with dynamic positioning */}
      {texture && customization?.image && (
        (() => {
          const posX = ((customization!.imagePosition?.x || 50) - 50) / 50 * 0.4;
          const posY = ((customization!.imagePosition?.y || 50) - 50) / 50 * 0.6 + 0.15;
          const posZ = (customization!.imagePosition?.z || 0) / 100 * 0.1 + 0.7;
          const scale = (customization!.imageScale || 1) * 0.4;
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[0, 0, 0]} 
              scale={[scale, scale, scale]}
            >
              <meshBasicMaterial 
                map={texture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}
    </group>
  );
}

// Tote Bag 3D Model Component - Photo-Realistic Canvas
function ToteBagModel({ color = '#f5f5f5', customization }: { color?: string; customization?: Product3DProps['customization'] }) {
  const texture = customization?.image ? useTexture(customization.image) : null;
  const textScale = customization?.textSize ? (customization.textSize / 72) * 0.09 : 0.065;

  return (
    <group scale={1.2} rotation={[0.02, 0, 0]}>
      {/* Main Bag Body - Soft canvas with slight bulge */}
      <mesh position={[0, -0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 2.4, 0.55, 4, 4, 2]} />
        <meshStandardMaterial 
          color={color} 
          roughness={0.85} 
          metalness={0}
          flatShading={false}
        />
      </mesh>
      
      {/* Front panel - slightly curved */}
      <mesh position={[0, -0.15, 0.28]} castShadow receiveShadow>
        <boxGeometry args={[2.15, 2.35, 0.02, 8, 8, 1]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      
      {/* Back panel */}
      <mesh position={[0, -0.15, -0.28]} castShadow receiveShadow>
        <boxGeometry args={[2.15, 2.35, 0.02, 8, 8, 1]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      
      {/* Gusseted bottom - realistic bag base */}
      <mesh position={[0, -1.38, 0]} castShadow>
        <boxGeometry args={[2.25, 0.12, 0.6]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      
      {/* Bottom corners reinforcement */}
      <mesh position={[-1.05, -1.35, 0.25]} castShadow>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[1.05, -1.35, 0.25]} castShadow>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[-1.05, -1.35, -0.25]} castShadow>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[1.05, -1.35, -0.25]} castShadow>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      
      {/* Left Handle - Strap with stitching */}
      <group position={[-0.65, 1.25, 0]}>
        <mesh castShadow>
          <torusGeometry args={[0.45, 0.07, 10, 32, Math.PI]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Handle cross stitching */}
        <mesh position={[-0.4, 0.02, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.2, 0.06, 0.6]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
        <mesh position={[0.4, 0.02, 0]} rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.2, 0.06, 0.6]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      </group>
      
      {/* Right Handle */}
      <group position={[0.65, 1.25, 0]}>
        <mesh castShadow>
          <torusGeometry args={[0.45, 0.07, 10, 32, Math.PI]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Handle cross stitching */}
        <mesh position={[-0.4, 0.02, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.2, 0.06, 0.6]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
        <mesh position={[0.4, 0.02, 0]} rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.2, 0.06, 0.6]} />
          <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
      </group>
      
      {/* Side seam stitching - Left */}
      <mesh position={[-1.11, -0.15, 0]}>
        <boxGeometry args={[0.015, 2.3, 0.015]} />
        <meshStandardMaterial color="#d0d0d0" roughness={0.95} />
      </mesh>
      {/* Side seam stitching - Right */}
      <mesh position={[1.11, -0.15, 0]}>
        <boxGeometry args={[0.015, 2.3, 0.015]} />
        <meshStandardMaterial color="#d0d0d0" roughness={0.95} />
      </mesh>
      
      {/* Top hem stitching */}
      <mesh position={[0, 1.05, 0.28]}>
        <boxGeometry args={[2.1, 0.02, 0.02]} />
        <meshStandardMaterial color="#d0d0d0" roughness={0.95} />
      </mesh>

      {/* Custom Text - Front of bag */}
      {/* Custom Text Decal - Sticks to tote surface with dynamic positioning */}
      {customization?.text && (
        (() => {
          const text = customization!.text;
          const font = customization!.font || 'Arial';
          const color = customization!.color || '#000000';
          const textTexture = createTextTexture(text, font, color, 'transparent');
          // Calculate position from percentage (0-100) to 3D coordinates (tote surface)
          const posX = ((customization!.textPosition?.x || 50) - 50) / 50 * 0.35;
          const posY = ((customization!.textPosition?.y || 50) - 50) / 50 * 0.5 + 0.1;
          const posZ = (customization!.textPosition?.z || 0) / 100 * 0.1 + 0.28;
          const scale = (customization!.textScale || 1) * 0.55;
          const rotation = (customization!.textRotation || 0) * (Math.PI / 180);
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[0, 0, rotation]} 
              scale={[scale * 1.5, scale * 0.75, scale]}
            >
              <meshBasicMaterial 
                map={textTexture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}

      {/* Custom Image Decal with dynamic positioning */}
      {texture && customization?.image && (
        (() => {
          const posX = ((customization!.imagePosition?.x || 50) - 50) / 50 * 0.35;
          const posY = ((customization!.imagePosition?.y || 50) - 50) / 50 * 0.5 + 0.1;
          const posZ = (customization!.imagePosition?.z || 0) / 100 * 0.1 + 0.27;
          const scale = (customization!.imageScale || 1) * 0.5;
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[0, 0, 0]} 
              scale={[scale, scale, scale]}
            >
              <meshBasicMaterial 
                map={texture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}
    </group>
  );
}

// Mousepad 3D Model Component - Photo-Realistic Desk Mousepad
function MousepadModel({ color = '#1a1a1a', customization }: { color?: string; customization?: Product3DProps['customization'] }) {
  const texture = customization?.image ? useTexture(customization.image) : null;
  const textScale = customization?.textSize ? (customization.textSize / 72) * 0.12 : 0.08;

  return (
    <group rotation={[-Math.PI / 2.3, 0, 0]} scale={1.1}>
      {/* Main mousepad body - Fabric surface with rubber backing */}
      <RoundedBox args={[2.6, 2.0, 0.05]} radius={0.12} smoothness={6} position={[0, 0, 0]} castShadow receiveShadow>
        <meshStandardMaterial 
          color={color} 
          roughness={0.92} 
          metalness={0}
        />
      </RoundedBox>
      
      {/* Thick rubber base layer */}
      <mesh position={[0, 0, -0.028]} castShadow>
        <RoundedBox args={[2.58, 1.98, 0.025]} radius={0.115} smoothness={6}>
          <meshStandardMaterial color="#0a0a0a" roughness={0.95} />
        </RoundedBox>
      </mesh>
      
      {/* Top fabric surface layer - microfiber texture simulation */}
      <mesh position={[0, 0, 0.026]}>
        <RoundedBox args={[2.55, 1.95, 0.008]} radius={0.115} smoothness={6}>
          <meshStandardMaterial 
            color={color} 
            roughness={0.88} 
            metalness={0}
          />
        </RoundedBox>
      </mesh>
      
      {/* Edge stitching detail - subtle thread line around perimeter */}
      <mesh position={[0, 0, 0.032]}>
        <RoundedBox args={[2.52, 1.92, 0.002]} radius={0.11} smoothness={6}>
          <meshStandardMaterial color="#333" roughness={0.9} />
        </RoundedBox>
      </mesh>
      
      {/* Side edge - rubber/fabric boundary */}
      <mesh position={[0, 0, 0]}>
        <RoundedBox args={[2.59, 1.99, 0.04]} radius={0.118} smoothness={6}>
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </RoundedBox>
      </mesh>

      {/* Custom Text Decal - Sticks to mousepad surface with dynamic positioning */}
      {customization?.text && (
        (() => {
          const text = customization!.text;
          const font = customization!.font || 'Arial';
          const color = customization!.color || '#ffffff';
          const textTexture = createTextTexture(text, font, color, 'transparent');
          // Calculate position from percentage (0-100) to 3D coordinates (mousepad surface)
          const posX = ((customization!.textPosition?.x || 50) - 50) / 50 * 1.2;
          const posY = ((customization!.textPosition?.y || 50) - 50) / 50 * 0.8;
          const posZ = (customization!.textPosition?.z || 0) / 100 * 0.1 + 0.03;
          const scale = (customization!.textScale || 1) * 0.9;
          const rotation = (customization!.textRotation || 0) * (Math.PI / 180);
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[-Math.PI / 2, 0, rotation]} 
              scale={[scale * 1.5, scale * 0.75, scale]}
            >
              <meshBasicMaterial 
                map={textTexture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}

      {/* Custom Image Decal with dynamic positioning */}
      {texture && customization?.image && (
        (() => {
          const posX = ((customization!.imagePosition?.x || 50) - 50) / 50 * 1.2;
          const posY = ((customization!.imagePosition?.y || 50) - 50) / 50 * 0.8;
          const posZ = (customization!.imagePosition?.z || 0) / 100 * 0.1 + 0.028;
          const scale = (customization!.imageScale || 1) * 0.8;
          
          return (
            <Decal 
              position={[posX, posY, posZ]} 
              rotation={[-Math.PI / 2, 0, 0]} 
              scale={[scale, scale, scale]}
            >
              <meshBasicMaterial 
                map={texture} 
                transparent 
                polygonOffset 
                polygonOffsetUnits={-1}
                depthTest={true}
                depthWrite={false}
              />
            </Decal>
          );
        })()
      )}
    </group>
  );
}

// Main Product Model Router
function ProductModel({ productType = 'default', customization }: Product3DProps) {
  switch (productType) {
    case 'shirt':
      return <TShirtModel color={customization?.productColor || '#ffffff'} customization={customization} />;
    case 'mug':
      return <MugModel color="#f5f5f5" customization={customization} />;
    case 'tumbler':
      return <TumblerModel color="#e8e8e8" customization={customization} />;
    case 'tote':
      return <ToteBagModel color="#f0f0f0" customization={customization} />;
    case 'mousepad':
      return <MousepadModel color="#1a1a1a" customization={customization} />;
    default:
      return <MugModel color="#f5f5f5" customization={customization} />;
  }
}

export function Product3DViewer({ 
  modelUrl, 
  productType = 'default', 
  customization,
  onPositionChange,
  enablePrecisionMode = false
}: Product3DProps) {
  const [zoomLevel, setZoomLevel] = useState(5);
  const [showGrid, setShowGrid] = useState(enablePrecisionMode);
  const [activeControl, setActiveControl] = useState<'none' | 'text' | 'image'>('none');
  
  const controlsRef = useRef<any>(null);
  
  const handleZoomIn = () => {
    if (controlsRef.current) {
      const camera = controlsRef.current.object;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      camera.position.add(direction.multiplyScalar(-0.5));
      controlsRef.current.update();
    }
  };
  
  const handleZoomOut = () => {
    if (controlsRef.current) {
      const camera = controlsRef.current.object;
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      camera.position.add(direction.multiplyScalar(0.5));
      controlsRef.current.update();
    }
  };
  
  const resetView = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };
  
  return (
    <ErrorBoundary>
      <div className="w-full h-full min-h-[400px] bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl overflow-hidden relative border border-slate-200 shadow-inner">
        <Suspense fallback={
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 mt-4 font-medium uppercase tracking-widest">Loading 3D Model...</p>
          </div>
        }>
          <Canvas 
            shadows 
            camera={{ position: [0, 0, 5], fov: 50 }}
            gl={{ preserveDrawingBuffer: true, antialias: true }}
            onCreated={({ gl }) => {
              gl.setClearColor("#f1f5f9");
            }}
          >
            {/* Studio Lighting Setup */}
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 10, 7]} intensity={1.2} castShadow shadow-mapSize={2048} />
            <directionalLight position={[-5, 5, -5]} intensity={0.5} />
            <pointLight position={[0, 5, 0]} intensity={0.3} />
            
            {/* Product Model - Direct Render */}
            <ProductModel productType={productType} customization={customization} />
            
            {/* Ground Shadow Plane */}
            <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[10, 10]} />
              <meshStandardMaterial color="#f1f5f9" transparent opacity={0.5} />
            </mesh>
            
            {/* Grid Helper for Precision Mode */}
            {showGrid && (
              <>
                <gridHelper args={[10, 20, '#94a3b8', '#cbd5e1']} position={[0, -1.99, 0]} />
                <axesHelper args={[2]} />
              </>
            )}
            
            <OrbitControls 
              enablePan={true}
              enableZoom={true}
              enableRotate={true}
              minPolarAngle={Math.PI / 6}
              maxPolarAngle={Math.PI - Math.PI / 6}
              minDistance={1.5}
              maxDistance={15}
              zoomSpeed={1.2}
              rotateSpeed={0.8}
              panSpeed={0.8}
              makeDefault 
              autoRotate={!enablePrecisionMode}
              autoRotateSpeed={0.5}
              target={[0, 0, 0]}
            />
          </Canvas>
        </Suspense>
        
        {/* 3D Preview Label */}
        <div className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-md pointer-events-none">
          <p className="text-xs font-bold uppercase tracking-wider">3D Preview</p>
        </div>
        
        {/* Interactive Controls Label */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            360° Interactive • Drag to Rotate • Scroll to Zoom
          </p>
        </div>
        
        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            className="w-10 h-10 bg-white/90 backdrop-blur-md rounded-lg border border-slate-200 shadow-sm flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-all active:scale-95"
            title="Zoom In"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={handleZoomOut}
            className="w-10 h-10 bg-white/90 backdrop-blur-md rounded-lg border border-slate-200 shadow-sm flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-all active:scale-95"
            title="Zoom Out"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={resetView}
            className="w-10 h-10 bg-white/90 backdrop-blur-md rounded-lg border border-slate-200 shadow-sm flex items-center justify-center hover:bg-blue-50 hover:border-blue-300 transition-all active:scale-95"
            title="Reset View"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
        
        {/* Precision Mode Toggle */}
        {enablePrecisionMode && (
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`px-3 py-2 rounded-lg shadow-sm text-xs font-bold uppercase tracking-wider transition-all ${
                showGrid 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white/90 backdrop-blur-md text-slate-600 border border-slate-200'
              }`}
            >
              {showGrid ? 'Hide Grid' : 'Show Grid'}
            </button>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}