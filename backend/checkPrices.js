import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

async function checkPrices() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const products = await Product.find({}).select('name price category');
  console.log('Current products in database:');
  console.log('================================');
  products.forEach(p => {
    console.log(`${p.name} (${p.category}): ${p.price}`);
  });
  
  await mongoose.disconnect();
}

checkPrices().catch(console.error);
