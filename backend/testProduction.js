import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';

dotenv.config();

async function testProduction() {
  await mongoose.connect(process.env.MONGO_URI);
  
  console.log('Checking orders in database...');
  
  // Check all orders
  const allOrders = await Order.find({});
  console.log(`Total orders in database: ${allOrders.length}`);
  
  // Check approved orders
  const approvedOrders = await Order.find({ status: 'approved' });
  console.log(`Approved orders: ${approvedOrders.length}`);
  
  if (approvedOrders.length > 0) {
    console.log('Sample approved order:');
    console.log(JSON.stringify(approvedOrders[0], null, 2));
  }
  
  // Check if there are any orders at all
  if (allOrders.length === 0) {
    console.log('No orders found. Creating a test order...');
    const testOrder = await Order.create({
      customer: new mongoose.Types.ObjectId(),
      items: [{
        sku: 'TEST-001',
        name: 'Test Product',
        quantity: 1,
        unitPrice: 100,
        customization: {
          size: 'M',
          color: 'Red'
        }
      }],
      totalQty: 1,
      totalPrice: 100,
      status: 'approved',
      shippingAddress: 'Test Address',
      contactPhone: '1234567890'
    });
    console.log('Test order created:', testOrder._id);
  }
  
  await mongoose.disconnect();
}

testProduction().catch(console.error);
