import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

async function testAPI() {
  await mongoose.connect(process.env.MONGO_URI);
  
  const products = await Product.find({}).select('name image category');
  console.log('Products in database:');
  products.forEach(p => console.log(`${p.name}: ${p.image}`));
  
  // Also check if images exist
  const fs = await import('fs');
  const path = await import('path');
  
  console.log('\nChecking image files:');
  products.forEach(p => {
    if (p.image.startsWith('/products/')) {
      const imagePath = path.join(process.cwd(), '..', 'public', p.image);
      const exists = fs.existsSync(imagePath);
      console.log(`${p.image}: ${exists ? 'EXISTS' : 'MISSING'}`);
    }
  });
  
  await mongoose.disconnect();
}

testAPI().catch(console.error);
