import * as THREE from 'three';

export interface CustomizationOptions {
  text?: string;
  font?: string;
  textSize?: number;
  textColor?: string;
  color?: string;
  image?: string;
}

// Enhanced text texture with fabric print simulation
export function createPrintedTextTexture(customization: CustomizationOptions): THREE.CanvasTexture | null {
  if (!customization.text) return null;
  
  const canvas = document.createElement('canvas');
  canvas.width = 2048; // Ultra high resolution for crisp printing
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;
  
  // Clear with transparent background
  ctx.fillStyle = 'transparent';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Set up text rendering with print-like properties
  const fontSize = Math.max(48, Math.min(400, (customization.textSize || 24) * 8));
  ctx.font = `bold ${fontSize}px ${customization.font || 'Arial'}`;
  
  // Add subtle fabric texture effect
  ctx.globalAlpha = 0.95; // Slight transparency for fabric blend
  
  // Create shadow that simulates ink absorption
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = 0.5;
  ctx.shadowOffsetY = 0.5;
  
  // Main text color
  ctx.fillStyle = customization.textColor || customization.color || '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Add text with multiple passes for depth
  for (let i = 0; i < 2; i++) {
    ctx.globalAlpha = 0.95 - (i * 0.1);
    ctx.fillText(customization.text, canvas.width / 2, canvas.height / 2);
  }
  
  // Add subtle texture overlay for fabric simulation
  ctx.globalAlpha = 0.1;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
  gradient.addColorStop(0.5, 'rgba(128,128,128,0.05)');
  gradient.addColorStop(1, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  
  return tex;
}

// Enhanced image texture with fabric blend
export function createPrintedImageTexture(customization: CustomizationOptions): THREE.Texture | null {
  if (!customization.image) return null;
  
  const loader = new THREE.TextureLoader();
  const tex = loader.load(customization.image);
  
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  
  // Add fabric blend effect after image loads
  tex.onLoad = () => {
    const canvas = document.createElement('canvas');
    canvas.width = tex.image.width;
    canvas.height = tex.image.height;
    const ctx = canvas.getContext('2d')!;
    
    // Draw the image
    ctx.drawImage(tex.image as HTMLImageElement, 0, 0);
    
    // Add fabric texture overlay
    ctx.globalAlpha = 0.05;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, 'rgba(255,255,255,0.1)');
    gradient.addColorStop(0.5, 'rgba(128,128,128,0.05)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Update texture with modified canvas
    const newTex = new THREE.CanvasTexture(canvas);
    newTex.minFilter = THREE.LinearFilter;
    newTex.magFilter = THREE.LinearFilter;
    newTex.flipY = false;
    newTex.generateMipmaps = false;
    newTex.colorSpace = THREE.SRGBColorSpace;
    
    // Copy properties back
    tex.image = newTex.image;
    tex.needsUpdate = true;
  };
  
  return tex;
}

// Create fabric material properties for realistic appearance
export function createFabricMaterial(baseColor: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(baseColor),
    roughness: 0.85, // Fabric-like roughness
    metalness: 0.0,   // No metallic properties
  });
}

// Create print material that blends with fabric
export function createPrintMaterial(texture: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01,
    roughness: 0.9,  // Match fabric roughness
    metalness: 0.0,   // No metallic properties
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -1,
  });
}
