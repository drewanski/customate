export interface DesignElement {
  id: string;
  type: 'text' | 'image' | 'icon';
  content: string;
  position: { x: number; y: number; z?: number };
  surface?: 'front' | 'back' | 'left' | 'right' | 'wrap' | 'top';
  placement?: string;
  scale: number;
  rotation: number;
  color: string;
  font?: string;
  opacity: number;
  aspectRatio?: number;
  normal?: { x: number; y: number; z: number };
  meshName?: string;
  /** When true, the decal is excluded from rendering (toggled from the Layers panel). */
  hidden?: boolean;
  /** Prevent gizmo selection / pose changes when locked. */
  locked?: boolean;
}
