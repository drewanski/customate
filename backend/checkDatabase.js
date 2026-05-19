import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';

dotenv.config();

async function checkDatabaseState() {
  await mongoose.connect(process.env.MONGO_URI);
  
  console.log('🔍 Checking actual database state...');
  
  // Check all orders
  const allOrders = await Order.find({});
  console.log('Total orders in database:', allOrders.length);
  
  // Check approved orders
  const approvedOrders = await Order.find({ status: 'approved' });
  console.log('Approved orders:', approvedOrders.length);
  
  // Check orders with production dates
  const scheduledOrders = await Order.find({ 
    productionDate: { $exists: true, $ne: null }
  });
  console.log('Orders with production dates:', scheduledOrders.length);
  
  // Check in_production orders
  const inProductionOrders = await Order.find({ status: 'in_production' });
  console.log('In-production orders:', inProductionOrders.length);
  
  if (scheduledOrders.length > 0) {
    console.log('\n📅 Scheduled Orders Details:');
    scheduledOrders.forEach((order, i) => {
      console.log(`  ${i+1}. Order #${order._id.toString().slice(-6)}`);
      console.log(`     Status: ${order.status}`);
      console.log(`     Production Date: ${order.productionDate ? new Date(order.productionDate).toLocaleDateString() : 'None'}`);
      console.log(`     Production Notes: ${order.productionNotes || 'None'}`);
      console.log(`     Priority: ${order.productionPriority || 'None'}`);
      console.log(`     Customer: ${order.customer}`);
    });
  }
  
  if (approvedOrders.length > 0) {
    console.log('\n📋 Approved Orders (Queue):');
    approvedOrders.forEach((order, i) => {
      console.log(`  ${i+1}. Order #${order._id.toString().slice(-6)}`);
      console.log(`     Status: ${order.status}`);
      console.log(`     Total: ₱${order.totalPrice}`);
      console.log(`     Items: ${order.items.length}`);
    });
  }
  
  await mongoose.disconnect();
}

checkDatabaseState().catch(console.error);
