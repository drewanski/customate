import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000/api';

async function testProductionEndpoints() {
  console.log('Testing Production API Endpoints...');
  
  try {
    // Test queue endpoint (without auth for now)
    console.log('\n1. Testing /production/queue endpoint...');
    const queueResponse = await fetch(`${API_URL}/production/queue`);
    console.log(`Status: ${queueResponse.status}`);
    
    if (queueResponse.ok) {
      const queueData = await queueResponse.json();
      console.log(`✅ Queue endpoint working - Found ${queueData.length} orders`);
      if (queueData.length > 0) {
        console.log('Sample order:', {
          id: queueData[0]._id,
          customer: queueData[0].customer?.name,
          status: queueData[0].status,
          items: queueData[0].items?.length
        });
      }
    } else {
      const errorData = await queueResponse.text();
      console.log(`❌ Queue endpoint failed: ${errorData}`);
    }
    
    // Test schedule endpoint
    console.log('\n2. Testing /production/schedule endpoint...');
    const scheduleResponse = await fetch(`${API_URL}/production/schedule`);
    console.log(`Status: ${scheduleResponse.status}`);
    
    if (scheduleResponse.ok) {
      const scheduleData = await scheduleResponse.json();
      console.log(`✅ Schedule endpoint working - Found ${scheduleData.length} scheduled orders`);
    } else {
      const errorData = await scheduleResponse.text();
      console.log(`❌ Schedule endpoint failed: ${errorData}`);
    }
    
    // Test team endpoint
    console.log('\n3. Testing /production/team endpoint...');
    const teamResponse = await fetch(`${API_URL}/production/team`);
    console.log(`Status: ${teamResponse.status}`);
    
    if (teamResponse.ok) {
      const teamData = await teamResponse.json();
      console.log(`✅ Team endpoint working - Found ${teamData.length} team members`);
    } else {
      const errorData = await teamResponse.text();
      console.log(`❌ Team endpoint failed: ${errorData}`);
    }
    
    // Test scheduling an order (if we have an approved order)
    console.log('\n4. Testing order scheduling...');
    const queueData = await (await fetch(`${API_URL}/production/queue`)).json();
    
    if (queueData.length > 0) {
      const testOrderId = queueData[0]._id;
      console.log(`Testing with order: ${testOrderId}`);
      
      const scheduleResponse = await fetch(`${API_URL}/production/${testOrderId}/schedule`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          productionDate: new Date().toISOString().split('T')[0],
          productionNotes: 'Test scheduling',
          productionPriority: 'high',
          assignedTo: null
        })
      });
      
      console.log(`Schedule Status: ${scheduleResponse.status}`);
      
      if (scheduleResponse.ok) {
        const scheduleResult = await scheduleResponse.json();
        console.log(`✅ Order scheduling successful!`);
        console.log('Updated order:', {
          id: scheduleResult._id,
          productionDate: scheduleResult.productionDate,
          status: scheduleResult.status
        });
      } else {
        const errorData = await scheduleResponse.text();
        console.log(`❌ Order scheduling failed: ${errorData}`);
      }
    } else {
      console.log('⚠️  No approved orders available for scheduling test');
    }
    
  } catch (error) {
    console.error('❌ API Test Error:', error.message);
  }
}

testProductionEndpoints();
