import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from './models/Inventory.js';
import Product from './models/Product.js';

dotenv.config();

async function updateInventory() {
  await mongoose.connect(process.env.MONGO_URI);
  
  console.log('Updating inventory with product images...');
  
  // Get all products
  const products = await Product.find({});
  
  // Update corresponding inventory items
  for (const product of products) {
    const inventory = await Inventory.findOne({ name: product.name });
    if (inventory) {
      inventory.image = product.image;
      await inventory.save();
      console.log(`Updated inventory for ${product.name}: ${product.image}`);
    }
  }
  
  console.log('Inventory update complete!');
  await mongoose.disconnect();
}

updateInventory().catch(console.error);
