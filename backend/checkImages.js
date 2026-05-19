import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

async function checkImages() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const products = await Product.find({}).select('name image category');
  console.log('Current products in database:');
  products.forEach(p => console.log(`- ${p.name}: ${p.image}`));
  
  await mongoose.disconnect();
}

checkImages().catch(console.error);
