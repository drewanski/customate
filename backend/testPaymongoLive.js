import axios from 'axios';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY;

console.log('Testing PayMongo API...');
console.log('Secret Key exists:', !!PAYMONGO_SECRET_KEY);
console.log('Public Key exists:', !!PAYMONGO_PUBLIC_KEY);
console.log('Secret Key prefix:', PAYMONGO_SECRET_KEY?.substring(0, 10) + '...');

const paymongoApi = axios.create({
  baseURL: 'https://api.paymongo.com/v1',
  headers: {
    'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
    'Content-Type': 'application/json'
  }
});

async function testPayMongo() {
  try {
    // Test 1: Create a GCash source
    console.log('\n--- Test 1: Create GCash Source ---');
    const gcashPayload = {
      data: {
        attributes: {
          type: 'gcash',
          amount: 10000, // ₱100.00
          currency: 'PHP',
          redirect: {
            success: 'http://localhost:5173/payment/success',
            failed: 'http://localhost:5173/payment/failed'
          },
          billing: {
            name: 'Test Customer',
            email: 'test@test.com',
            phone: '09123456789'
          }
        }
      }
    };
    
    console.log('Sending request to /sources...');
    const gcashResponse = await paymongoApi.post('/sources', gcashPayload);
    console.log('✅ GCash Source Created Successfully!');
    console.log('Source ID:', gcashResponse.data.data.id);
    console.log('Checkout URL:', gcashResponse.data.data.attributes.redirect.checkout_url);
    
    // Test 2: Create a Maya source
    console.log('\n--- Test 2: Create Maya Source ---');
    const mayaPayload = {
      data: {
        attributes: {
          type: 'paymaya',
          amount: 10000,
          currency: 'PHP',
          redirect: {
            success: 'http://localhost:5173/payment/success',
            failed: 'http://localhost:5173/payment/failed'
          },
          billing: {
            name: 'Test Customer',
            email: 'test@test.com',
            phone: '09123456789'
          }
        }
      }
    };
    
    const mayaResponse = await paymongoApi.post('/sources', mayaPayload);
    console.log('✅ Maya Source Created Successfully!');
    console.log('Source ID:', mayaResponse.data.data.id);
    console.log('Checkout URL:', mayaResponse.data.data.attributes.redirect.checkout_url);
    
    console.log('\n✅ All tests passed! PayMongo API is working.');
    
  } catch (error) {
    console.error('\n❌ PayMongo API Error:');
    console.error('Status:', error.response?.status);
    console.error('Error details:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);
  }
}

testPayMongo();
