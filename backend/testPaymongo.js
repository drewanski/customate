import dotenv from 'dotenv';
import { createEWalletSource } from './config/paymongo.js';

dotenv.config();

async function testPayMongo() {
  console.log('Testing PayMongo API connection...');
  console.log('Public Key:', process.env.PAYMONGO_PUBLIC_KEY);
  console.log('Secret Key:', process.env.PAYMONGO_SECRET_KEY ? 'Set' : 'Not set');
  
  try {
    const source = await createEWalletSource({
      type: 'gcash',
      amount: 10000, // ₱100.00 in cents
      successUrl: 'http://localhost:5173/test/success',
      cancelUrl: 'http://localhost:5173/test/cancel',
      billing: {
        name: 'Test User',
        email: 'test@example.com',
        phone: '09123456789'
      }
    });
    
    console.log('✅ PayMongo source created successfully:');
    console.log('ID:', source.id);
    console.log('Type:', source.type);
    console.log('Status:', source.status);
    console.log('Checkout URL:', source.checkoutUrl);
    
  } catch (error) {
    console.error('❌ PayMongo API Error:');
    console.error('Message:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPayMongo().catch(console.error);
