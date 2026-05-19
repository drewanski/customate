import fetch from 'node-fetch';

// Simulate the exact frontend apiRequest function
const API_URL = 'http://localhost:4000/api';

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'API error');
  }
  
  return res.json();
}

async function testFrontendIntegration() {
  console.log('🔍 Testing Frontend Integration...');
  
  try {
    // Test 1: Fetch production queue (like frontend does)
    console.log('\n1. Testing production queue fetch...');
    const queueData = await apiRequest('/production-public/queue');
    console.log('✅ Queue fetch successful -', queueData.length, 'orders');
    
    if (queueData.length === 0) {
      console.log('⚠️  No orders in queue - creating test order...');
      // Create a test order if none exist
      const testOrderResponse = await fetch('http://localhost:4000/api/production-public/create-test-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (testOrderResponse.ok) {
        console.log('✅ Test order created');
        // Fetch queue again
        const newQueueData = await apiRequest('/production-public/queue');
        console.log('✅ New queue data -', newQueueData.length, 'orders');
        queueData.push(...newQueueData);
      }
    }
    
    // Test 2: Try scheduling (like frontend does)
    if (queueData.length > 0) {
      const testOrder = queueData[0];
      console.log('\n2. Testing order scheduling...');
      console.log('Scheduling order:', testOrder._id);
      
      const scheduleData = {
        productionDate: new Date().toISOString().split('T')[0],
        productionNotes: 'Frontend integration test',
        productionPriority: 'high',
        assignedTo: null
      };
      
      console.log('Sending data:', scheduleData);
      
      const result = await apiRequest(`/production-public/${testOrder._id}/schedule`, {
        method: 'PUT',
        body: JSON.stringify(scheduleData)
      });
      
      console.log('✅ Scheduling successful!');
      console.log('Result:', {
        id: result._id,
        productionDate: result.productionDate,
        status: result.status,
        notes: result.productionNotes
      });
      
      // Test 3: Verify queue is updated
      console.log('\n3. Testing queue update...');
      const updatedQueue = await apiRequest('/production-public/queue');
      console.log('✅ Updated queue -', updatedQueue.length, 'orders');
      
      // Test 4: Verify schedule is updated
      console.log('\n4. Testing schedule update...');
      const scheduleData = await apiRequest('/production-public/schedule');
      console.log('✅ Schedule -', scheduleData.length, 'scheduled orders');
      
      if (scheduleData.length > 0) {
        console.log('Scheduled orders:');
        scheduleData.forEach((order, index) => {
          console.log(`  ${index + 1}. Order #${order._id.toString().slice(-6)} - ${order.customer?.name} - ${new Date(order.productionDate).toLocaleDateString()}`);
        });
      }
      
    } else {
      console.log('⚠️  No orders available for scheduling test');
    }
    
    console.log('\n🎉 Frontend integration test completed successfully!');
    
  } catch (error) {
    console.error('❌ Frontend integration test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testFrontendIntegration();
