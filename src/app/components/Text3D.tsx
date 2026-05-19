import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { DesignElement } from '../types/design';

interface Text3DProps {
  element: DesignElement;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  animated?: boolean;
}

export function Text3D({ 
  element, 
  position = [0, 0, 0], 
  rotation = [0, 0, 0], 
  scale = 1,
  animated = true
}: Text3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Animation for floating effect
  useFrame((state) => {
    if (animated && meshRef.current) {
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.02;
      meshRef.current.rotation.z = rotation[2] + Math.sin(state.clock.elapsedTime * 1.5) * 0.01;
    }
  });

  // Enhanced text material with depth and lighting
  const textMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(element.color || '#ffffff'),
      metalness: 0.1,
      roughness: 0.2,
      clearcoat: 0.3,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide,
    });
  }, [element.color]);

  // Shadow material for depth effect
  const shadowMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x000000),
      transparent: true,
      opacity: 0.3,
      roughness: 0.8,
      metalness: 0.0,
    });
  }, []);

  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Shadow/Depth layer */}
      <mesh ref={meshRef} position={[0.02, -0.02, -0.05]}>
        <Text
          fontSize={0.5}
          maxWidth={4}
          lineHeight={1}
          letterSpacing={0.02}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          material={shadowMaterial}
        >
          {element.content}
        </Text>
      </mesh>

      {/* Main 3D Text */}
      <Text
        fontSize={0.5}
        maxWidth={4}
        lineHeight={1}
        letterSpacing={0.02}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        material={textMaterial}
      >
        {element.content}
      </Text>

      {/* Rim lighting effect */}
      <mesh position={[0, 0, 0.01]}>
        <Text
          fontSize={0.5}
          maxWidth={4}
          lineHeight={1}
          letterSpacing={0.02}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          material={new THREE.MeshBasicMaterial({
            color: new THREE.Color(element.color || '#ffffff'),
            transparent: true,
            opacity: 0.1,
            side: THREE.FrontSide,
          })}
        >
          {element.content}
        </Text>
      </mesh>
    </group>
  );
}

// Alternative 3D Text using extruded geometry for more control
export function ExtrudedText3D({ 
  element, 
  position = [0, 0, 0], 
  rotation = [0, 0, 0], 
  scale = 1,
  animated = true,
  depth = 0.1
}: Text3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (animated && meshRef.current) {
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.02;
      meshRef.current.rotation.z = rotation[2] + Math.sin(state.clock.elapsedTime * 1.5) * 0.01;
    }
  });

  const geometry = useMemo(() => {
    const shapes = THREE.FontUtils.loadFont('/fonts/helvetiker_regular.typeface.json');
    if (!shapes) return new THREE.BoxGeometry();

    const textShapes = shapes.generateShapes(element.content, 0.5);
    const geometry = new THREE.ExtrudeGeometry(textShapes, {
      depth: depth,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelSegments: 8,
    });
    
    geometry.center();
    return geometry;
  }, [element.content, depth]);

  const material = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(element.color || '#ffffff'),
      metalness: 0.2,
      roughness: 0.1,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
    });
  }, [element.color]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
}

// Particle text effect for more dynamic 3D appearance
export function ParticleText3D({ 
  element, 
  position = [0, 0, 0], 
  rotation = [0, 0, 0], 
  scale = 1
}: Text3DProps) {
  const pointsRef = useRef<THREE.Points>(null);
  
  const particles = useMemo(() => {
    const temp = [];
    const fontSize = 0.5;
    const text = element.content;
    
    // Create particle positions based on text
    for (let i = 0; i < text.length * 20; i++) {
      const charIndex = Math.floor(i / 20);
      const char = text[charIndex];
      
      if (char) {
        // Position particles in character shape
        const x = (charIndex - text.length / 2) * fontSize + (Math.random() - 0.5) * fontSize * 0.5;
        const y = (Math.random() - 0.5) * fontSize;
        const z = (Math.random() - 0.5) * depth * 2;
        
        temp.push(new THREE.Vector3(x, y, z));
      }
    }
    
    return new Float32Array(temp.flatMap(v => [v.x, v.y, v.z]));
  }, [element.content]);

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.5;
      pointsRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.05;
    }
  });

  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      color: new THREE.Color(element.color || '#ffffff'),
      size: 0.02,
      transparent: true,
      opacity: element.opacity || 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, [element.color, element.opacity]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(particles, 3));
    return geo;
  }, [particles]);

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
}

// Enhanced 2D Canvas texture with 3D-like effects
export function EnhancedTextTexture({ element }: { element: DesignElement }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048; // Higher resolution for better quality
    canvas.height = 2048;
    const ctx = canvas.getContext('2d')!;
    
    // Clear with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Enhanced text rendering with 3D-like effects
    const fontSize = Math.max(96, Math.min(800, element.scale * 40));
    ctx.font = `bold ${fontSize}px ${element.font || 'Arial Black'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Multiple shadow layers for depth
    const shadowLayers = [
      { offset: 8, blur: 4, opacity: 0.15 },
      { offset: 4, blur: 2, opacity: 0.25 },
      { offset: 2, blur: 1, opacity: 0.35 },
    ];
    
    // Draw shadow layers
    shadowLayers.forEach(layer => {
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${layer.opacity})`;
      ctx.shadowBlur = layer.blur;
      ctx.shadowOffsetX = layer.offset;
      ctx.shadowOffsetY = layer.offset;
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = element.opacity * layer.opacity;
      
      drawWrappedText(ctx, element.content, canvas.width / 2, canvas.height / 2, canvas.width * 0.8, fontSize);
      ctx.restore();
    });
    
    // Main text with gradient
    const gradient = ctx.createLinearGradient(0, canvas.height * 0.3, 0, canvas.height * 0.7);
    const baseColor = new THREE.Color(element.color || '#ffffff');
    gradient.addColorStop(0, `rgba(255, 255, 255, ${element.opacity})`);
    gradient.addColorStop(0.5, `rgba(${baseColor.r * 255}, ${baseColor.g * 255}, ${baseColor.b * 255}, ${element.opacity})`);
    gradient.addColorStop(1, `rgba(${baseColor.r * 255 * 0.8}, ${baseColor.g * 255 * 0.8}, ${baseColor.b * 255 * 0.8}, ${element.opacity})`);
    
    ctx.fillStyle = gradient;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.globalAlpha = element.opacity;
    
    drawWrappedText(ctx, element.content, canvas.width / 2, canvas.height / 2, canvas.width * 0.8, fontSize);
    
    // Highlight layer for depth
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${element.opacity * 0.3})`;
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = element.opacity * 0.3;
    drawWrappedText(ctx, element.content, canvas.width / 2 - 2, canvas.height / 2 - 2, canvas.width * 0.8, fontSize);
    ctx.restore();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    texture.flipY = false;
    texture.generateMipmaps = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    
    return texture;
  }, [element.content, element.color, element.font, element.opacity, element.scale]);

  return texture;
}

// Helper function for wrapped text
function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, fontSize: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  lines.push(currentLine);
  
  const lineHeight = fontSize * 1.2;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  
  lines.forEach((line, index) => {
    ctx.fillText(line, x, startY + index * lineHeight);
  });
}
