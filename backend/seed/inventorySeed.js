import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';
import dotenv from 'dotenv';

dotenv.config();

const seedInventory = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    await Inventory.deleteMany({});
    console.log('Cleared existing inventory');

    const inventoryItems = [
      {
        name: 'Custom Cotton T-Shirt',
        sku: 'TS001',
        category: 'Apparel',
        stock: 150,
        price: 350.00,
        image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=800',
        description: 'Premium 100% cotton t-shirt, perfect for custom printing and daily wear.',
        isActive: true
      },
      {
        name: 'Sports Performance Jersey',
        sku: 'JR001',
        category: 'Apparel',
        stock: 80,
        price: 550.00,
        image: 'https://images.unsplash.com/photo-1580087444694-f901263bfcef?auto=format&fit=crop&q=80&w=800',
        description: 'Moisture-wicking breathable fabric designed for athletes and teams.',
        isActive: true
      },
      {
        name: 'Ceramic Coffee Mug',
        sku: 'MG001',
        category: 'Drinkware',
        stock: 200,
        price: 150.00,
        image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&q=80&w=800',
        description: '11oz high-quality ceramic mug with a glossy finish for vibrant prints.',
        isActive: true
      },
      {
        name: 'Stainless Steel Tumbler',
        sku: 'TB001',
        category: 'Drinkware',
        stock: 100,
        price: 450.00,
        image: 'https://images.unsplash.com/photo-1575827023494-05f5606d091a?auto=format&fit=crop&q=80&w=800',
        description: 'Double-wall vacuum insulated tumbler to keep drinks hot or cold for hours.',
        isActive: true
      },
      {
        name: 'Gaming Mousepad',
        sku: 'MP001',
        category: 'Accessories',
        stock: 120,
        price: 250.00,
        image: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&q=80&w=800',
        description: 'Smooth cloth surface with non-slip rubber base, ideal for office or gaming.',
        isActive: true
      },
      {
        name: 'Foldable Hand Fan',
        sku: 'FF001',
        category: 'Accessories',
        stock: 300,
        price: 45.00,
        image: 'https://images.unsplash.com/photo-1567361808960-dec9cb578162?auto=format&fit=crop&q=80&w=800',
        description: 'Compact and portable hand fan, great for events and promotions.',
        isActive: true
      },
      {
        name: 'Canvas Tote Bag',
        sku: 'OT001',
        category: 'Bags',
        stock: 180,
        price: 120.00,
        image: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=800',
        description: 'Eco-friendly durable canvas tote bag for shopping or everyday use.',
        isActive: true
      },
      {
        name: 'Small Coin Purse',
        sku: 'CP001',
        category: 'Bags',
        stock: 250,
        price: 75.00,
        image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&q=80&w=800',
        description: 'Compact zippered pouch for coins, keys, and small essentials.',
        isActive: true
      }
    ];

    await Inventory.insertMany(inventoryItems);
    console.log('Inventory seeded successfully');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
};

seedInventory();
