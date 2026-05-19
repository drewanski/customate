import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';
import User from './models/User.js';

dotenv.config();

async function testProductionAPI() {
  await mongoose.connect(process.env.MONGO_URI);
  
  console.log('Testing production queue endpoint logic...');
  
  try {
    // Simulate the queue endpoint logic
    const orders = await Order.find({ 
      status: 'approved' 
    })
    .populate('customer', 'name email')
    .populate('assignedTo', 'name email')
    .sort({ createdAt: 1 });
    
    console.log(`Found ${orders.length} approved orders for production queue`);
    
    if (orders.length > 0) {
      console.log('Sample order data:');
      const order = orders[0];
      console.log(`- ID: ${order._id}`);
      console.log(`- Customer: ${order.customer?.name || 'N/A'}`);
      console.log(`- Status: ${order.status}`);
      console.log(`- Created: ${order.createdAt}`);
      console.log(`- Items: ${order.items.length}`);
    }
    
    // Test schedule endpoint logic
    const scheduledOrders = await Order.find({ 
      status: { $in: ['approved', 'in_production'] },
      productionDate: { $exists: true }
    })
    .populate('customer', 'name email')
    .populate('assignedTo', 'name email')
    .sort({ productionDate: 1, createdAt: 1 });
    
    console.log(`Found ${scheduledOrders.length} scheduled orders`);
    
  } catch (error) {
    console.error('Error in production API logic:', error);
  }
  
  await mongoose.disconnect();
}

testProductionAPI().catch(console.error);
