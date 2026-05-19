import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';

dotenv.config();

const templates = [
  {
    id: 't1',
    name: 'Classic Text',
    thumbnail: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200',
    category: 'text'
  },
  {
    id: 't2',
    name: 'Logo Center',
    thumbnail: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200',
    category: 'logo'
  },
  {
    id: 't3',
    name: 'Graphic Design',
    thumbnail: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200',
    category: 'graphic'
  },
  {
    id: 't4',
    name: 'Photo Print',
    thumbnail: 'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=200',
    category: 'photo'
  }
];

const sampleProducts = [
  {
    name: 'Classic T-Shirt',
    description: 'Premium 100% cotton t-shirt, perfect for custom printing and daily wear.',
    category: 'T-Shirts',
    price: 350.00,
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800',
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
    colors: ['White', 'Black', 'Navy', 'Red', 'Gray'],
    materials: ['100% Cotton', 'Cotton Blend'],
    templates
  },
  {
    name: 'Premium Sports Jersey',
    description: 'Moisture-wicking breathable fabric designed for athletes and teams.',
    category: 'Sports Jerseys',
    price: 550.00,
    image: '/products/sports-jersey.webp',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    colors: ['White', 'Black', 'Navy', 'Red', 'Royal Blue'],
    materials: ['Polyester Mesh', 'Moisture-Wicking Fabric'],
    templates
  },
  {
    name: 'Ceramic Mug',
    description: '11oz high-quality ceramic mug with a glossy finish for vibrant prints.',
    category: 'Mugs',
    price: 150.00,
    image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=800',
    sizes: ['11oz', '15oz'],
    colors: ['White', 'Black', 'Blue'],
    materials: ['Ceramic'],
    templates
  },
  {
    name: 'Insulated Tumbler',
    description: 'Double-wall vacuum insulated tumbler to keep drinks hot or cold for hours.',
    category: 'Drinkware',
    price: 450.00,
    image: '/products/tumbler.webp',
    sizes: ['20oz', '30oz'],
    colors: ['Stainless Steel', 'Black', 'White', 'Navy'],
    materials: ['Stainless Steel', 'BPA-Free Plastic'],
    templates
  },
  {
    name: 'Canvas Tote Bag',
    description: 'Eco-friendly durable canvas tote bag for shopping or everyday use.',
    category: 'Bags',
    price: 120.00,
    image: '/products/tote-bag.webp',
    sizes: ['Standard'],
    colors: ['Natural', 'Black', 'Navy'],
    materials: ['100% Cotton Canvas'],
    templates
  },
  {
    name: 'Mouse Pad',
    description: 'Smooth cloth surface with non-slip rubber base, ideal for office or gaming.',
    category: 'Accessories',
    price: 250.00,
    image: '/products/mouse-pad.webp',
    sizes: ['Standard', 'Extended'],
    colors: ['Black', 'Blue', 'Red', 'Gray'],
    materials: ['Cloth Surface', 'Rubber Base'],
    templates
  },
  {
    name: 'Hand Fan',
    description: 'Compact and portable hand fan, great for events and promotions.',
    category: 'Accessories',
    price: 45.00,
    image: '/products/hand-fan.webp',
    sizes: ['Standard'],
    colors: ['White', 'Blue', 'Red', 'Green', 'Yellow'],
    materials: ['Plastic', 'PP Material'],
    templates
  },
  {
    name: 'Coin Pouch',
    description: 'Compact zippered pouch for coins, keys, and small essentials.',
    category: 'Accessories',
    price: 75.00,
    image: 'https://images.unsplash.com/photo-1627123424574-724758594e93?w=800',
    sizes: ['Small', 'Medium'],
    colors: ['Black', 'Brown', 'Navy', 'Red'],
    materials: ['Canvas', 'Nylon', 'Leather'],
    templates
  }
];

async function run() {
  const reset = process.argv.includes('--reset');

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set');
  }

  await mongoose.connect(process.env.MONGO_URI);

  if (reset) {
    await Inventory.deleteMany({});
    await Product.deleteMany({});
  }

  for (const p of sampleProducts) {
    const existing = await Product.findOne({ name: p.name });

    const product = existing
      ? await Product.findByIdAndUpdate(
          existing._id,
          {
            name: p.name,
            description: p.description,
            category: p.category,
            price: p.price,
            image: p.image,
            sizes: p.sizes,
            colors: p.colors,
            materials: p.materials,
            templates: p.templates
          },
          { new: true }
        )
      : await Product.create({
          name: p.name,
          description: p.description,
          category: p.category,
          price: p.price,
          image: p.image,
          sizes: p.sizes,
          colors: p.colors,
          materials: p.materials,
          templates: p.templates
        });

    const quantity = Math.floor(40 + Math.random() * 160);
    const minQuantity = 20;

    const invExisting = await Inventory.findOne({ sku: `SKU-${product.name.replace(/\s+/g, '-').toUpperCase()}` });
    if (invExisting) {
      invExisting.stock = reset ? quantity : invExisting.stock;
      invExisting.minStock = invExisting.minStock || minQuantity;
      await invExisting.save();
    } else {
      await Inventory.create({
        name: product.name,
        sku: `SKU-${product.name.replace(/\s+/g, '-').toUpperCase()}`,
        category: product.category,
        stock: quantity,
        minStock: minQuantity,
        price: product.price,
        image: product.image,
        description: product.description
      });
    }

    product.inventory = reset ? quantity : product.inventory;
    await product.save();
  }

  const productCount = await Product.countDocuments();
  const inventoryCount = await Inventory.countDocuments();

  console.log(`Seed complete. Products: ${productCount}, Inventory records: ${inventoryCount}`);

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
