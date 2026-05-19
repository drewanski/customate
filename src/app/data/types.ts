export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image: string;
  sizes: string[];
  colors: string[];
  materials: string[];
  templates: Template[];
}

export interface Template {
  id: string;
  name: string;
  thumbnail: string;
  category: string;
}

export interface CustomizationConfig {
  text: string;
  font: string;
  color: string;
  size: string;
  placement: string;
  image?: string;
  // ─── Design snapshot (set at "Add to Cart" time) ─────────────────────────
  // isCustomized is set when the user actually touched the 3D studio. Plain
  // adds from the product list (no studio visit) leave it false so production
  // can spot bare orders that don't need a custom print pass.
  isCustomized?: boolean;
  // PNG data URL of the rendered 3D canvas — what the customer saw.
  previewImage?: string;
  // Structured snapshot used to faithfully reproduce / re-print the design.
  designConfig?: {
    baseColor?: string;
    finish?: string;
    pattern?: string;
    patternAccent?: string;
    meshColors?: Record<string, string>;
    designElements?: any[];
    snapshotAt?: string;
  };
}

export interface CartItem {
  id: string;
  product: Product;
  customization: CustomizationConfig;
  quantity: number;
  totalPrice: number;
}

export type OrderStatus = 'pending' | 'approved' | 'in_production' | 'ready' | 'completed' | 'rejected';

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  items: CartItem[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
  shippingAddress?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  contactNumber: string;
  role: 'customer' | 'admin';
  avatar?: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  size: string;
  color: string;
  quantity: number;
  minQuantity: number;
  lastUpdated: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface ProductionTask {
  id: string;
  orderId: string;
  title: string;
  description: string;
  assignee?: string;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
}
