import { Product, Order, InventoryItem, ProductionTask, Template } from './types';

export const mockTemplates: Template[] = [
  { id: 't1', name: 'Classic Text', thumbnail: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200', category: 'text' },
  { id: 't2', name: 'Logo Center', thumbnail: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200', category: 'logo' },
  { id: 't3', name: 'Graphic Design', thumbnail: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200', category: 'graphic' },
  { id: 't4', name: 'Photo Print', thumbnail: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200', category: 'photo' },
];

export const mockProducts: Product[] = [
  {
    id: 'p1',
    name: 'Classic T-Shirt',
    description: 'Premium cotton t-shirt perfect for custom printing',
    category: 'T-Shirts',
    basePrice: 15.99,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
    colors: ['White', 'Black', 'Navy', 'Red', 'Gray'],
    materials: ['100% Cotton', 'Cotton Blend'],
    templates: mockTemplates
  },
  {
    id: 'p2',
    name: 'Ceramic Mug',
    description: 'High-quality ceramic mug for vibrant prints',
    category: 'Mugs',
    basePrice: 12.99,
    image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=400',
    sizes: ['11oz', '15oz'],
    colors: ['White', 'Black', 'Blue'],
    materials: ['Ceramic'],
    templates: mockTemplates
  },
  {
    id: 'p3',
    name: 'Hoodie',
    description: 'Cozy hoodie with kangaroo pocket',
    category: 'Hoodies',
    basePrice: 35.99,
    image: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    colors: ['Black', 'Gray', 'Navy', 'Maroon'],
    materials: ['Cotton/Polyester Blend'],
    templates: mockTemplates
  },
  {
    id: 'p4',
    name: 'Canvas Tote Bag',
    description: 'Eco-friendly canvas tote bag',
    category: 'Bags',
    basePrice: 18.99,
    image: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400',
    sizes: ['Standard'],
    colors: ['Natural', 'Black', 'Navy'],
    materials: ['100% Cotton Canvas'],
    templates: mockTemplates
  },
  {
    id: 'p5',
    name: 'Phone Case',
    description: 'Durable phone case for custom designs',
    category: 'Accessories',
    basePrice: 22.99,
    image: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400',
    sizes: ['iPhone 13', 'iPhone 14', 'Samsung S21', 'Samsung S22'],
    colors: ['Clear', 'Black', 'White'],
    materials: ['Polycarbonate'],
    templates: mockTemplates
  },
  {
    id: 'p6',
    name: 'Baseball Cap',
    description: 'Adjustable baseball cap with embroidery options',
    category: 'Caps',
    basePrice: 19.99,
    image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400',
    sizes: ['One Size'],
    colors: ['Black', 'Navy', 'White', 'Red'],
    materials: ['Cotton Twill'],
    templates: mockTemplates
  }
];

export const mockOrders: Order[] = [
  {
    id: 'ORD-001',
    customerId: 'c1',
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    items: [
      {
        id: 'ci1',
        product: mockProducts[0],
        customization: {
          text: 'Team Alpha',
          font: 'Arial Bold',
          color: '#000000',
          size: 'M',
          placement: 'Center Front'
        },
        quantity: 10,
        totalPrice: 159.90
      }
    ],
    totalAmount: 159.90,
    status: 'pending',
    createdAt: '2026-01-23T10:30:00Z',
    updatedAt: '2026-01-23T10:30:00Z',
    shippingAddress: '123 Main St, Cityville, ST 12345'
  },
  {
    id: 'ORD-002',
    customerId: 'c2',
    customerName: 'Jane Smith',
    customerEmail: 'jane@example.com',
    items: [
      {
        id: 'ci2',
        product: mockProducts[1],
        customization: {
          text: 'Best Mom Ever',
          font: 'Script',
          color: '#FF00FF',
          size: '11oz',
          placement: 'Wraparound'
        },
        quantity: 5,
        totalPrice: 64.95
      }
    ],
    totalAmount: 64.95,
    status: 'in_production',
    createdAt: '2026-01-22T14:15:00Z',
    updatedAt: '2026-01-23T09:00:00Z',
    shippingAddress: '456 Oak Ave, Townsburg, ST 67890'
  },
  {
    id: 'ORD-003',
    customerId: 'c3',
    customerName: 'Mike Johnson',
    customerEmail: 'mike@example.com',
    items: [
      {
        id: 'ci3',
        product: mockProducts[2],
        customization: {
          text: 'Winter Sports Club',
          font: 'Helvetica',
          color: '#FFFFFF',
          size: 'L',
          placement: 'Center Front',
          image: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=100'
        },
        quantity: 15,
        totalPrice: 539.85
      }
    ],
    totalAmount: 539.85,
    status: 'approved',
    createdAt: '2026-01-21T08:45:00Z',
    updatedAt: '2026-01-22T11:20:00Z',
    shippingAddress: '789 Pine Rd, Villageton, ST 11111'
  }
];

export const mockInventory: InventoryItem[] = [
  { id: 'inv1', productId: 'p1', productName: 'Classic T-Shirt', size: 'M', color: 'White', quantity: 150, minQuantity: 50, lastUpdated: '2026-01-20' },
  { id: 'inv2', productId: 'p1', productName: 'Classic T-Shirt', size: 'L', color: 'Black', quantity: 80, minQuantity: 50, lastUpdated: '2026-01-20' },
  { id: 'inv3', productId: 'p2', productName: 'Ceramic Mug', size: '11oz', color: 'White', quantity: 200, minQuantity: 100, lastUpdated: '2026-01-21' },
  { id: 'inv4', productId: 'p2', productName: 'Ceramic Mug', size: '15oz', color: 'White', quantity: 35, minQuantity: 100, lastUpdated: '2026-01-21' },
  { id: 'inv5', productId: 'p3', productName: 'Hoodie', size: 'L', color: 'Black', quantity: 45, minQuantity: 30, lastUpdated: '2026-01-22' },
  { id: 'inv6', productId: 'p4', productName: 'Canvas Tote Bag', size: 'Standard', color: 'Natural', quantity: 120, minQuantity: 50, lastUpdated: '2026-01-19' },
];

export const mockTasks: ProductionTask[] = [
  {
    id: 'task1',
    orderId: 'ORD-001',
    title: 'Print 10x T-Shirts - Team Alpha',
    description: 'Custom text: "Team Alpha", Size M, Black text on white',
    assignee: 'Production Team A',
    status: 'todo',
    priority: 'high',
    dueDate: '2026-01-25'
  },
  {
    id: 'task2',
    orderId: 'ORD-002',
    title: 'Print 5x Mugs - Best Mom Ever',
    description: 'Script font, pink text, 11oz mugs',
    assignee: 'Production Team B',
    status: 'in_progress',
    priority: 'medium',
    dueDate: '2026-01-24'
  },
  {
    id: 'task3',
    orderId: 'ORD-003',
    title: 'Print 15x Hoodies - Winter Sports Club',
    description: 'Logo + text, Size L, white on black',
    assignee: 'Production Team A',
    status: 'in_progress',
    priority: 'high',
    dueDate: '2026-01-26'
  },
  {
    id: 'task4',
    orderId: 'ORD-002',
    title: 'Quality Check - Mugs Batch',
    description: 'Inspect printed mugs for quality',
    status: 'todo',
    priority: 'medium'
  }
];
