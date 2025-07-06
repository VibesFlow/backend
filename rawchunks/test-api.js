#!/usr/bin/env node

/**
 * Test script for real Synapse SDK API endpoints
 * Tests the actual integration without mocks
 */

const fetch = require('node-fetch');

console.log('🚀 Starting Synapse SDK API tests...');

// Use the deployed API endpoint
const API_BASE_URL = 'https://jimqeb9i82.execute-api.us-east-1.amazonaws.com/dev';
console.log(`🔗 Testing against: ${API_BASE_URL}`);

async function testVibestreamsAPI() {
  console.log('🧪 Testing vibestreams API...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/vibestreams`);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Vibestreams API: ${data.length} vibestreams loaded`);
      
      if (data.length > 0) {
        const stream = data[0];
        console.log(`   First stream: ${stream.rta_id} by ${stream.creator}`);
        console.log(`   Chunks: ${stream.chunks}, Complete: ${stream.is_complete}`);
        console.log(`   Proof Set: ${stream.synapse_proof_set_id}`);
      }
    } else {
      console.log(`❌ Vibestreams API failed: ${response.status}`);
      console.log(`   Error: ${data.message || data.error}`);
    }
  } catch (error) {
    console.log(`❌ Vibestreams API error: ${error.message}`);
  }
}

async function testHealthAPI() {
  console.log('🧪 Testing health API...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Health API: ${data.status}`);
      console.log(`   Service: ${data.service}`);
      console.log(`   Network: ${data.network}`);
      console.log(`   Synapse: ${data.synapse.success ? 'Connected' : 'Failed'}`);
    } else {
      console.log(`❌ Health API failed: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Health API error: ${error.message}`);
  }
}

async function testDownloadAPI(cid) {
  console.log(`🧪 Testing download API for CID: ${cid}...`);
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/download/${cid}`);
    
    if (response.ok) {
      const data = await response.arrayBuffer();
      console.log(`✅ Download API: ${data.byteLength} bytes downloaded`);
    } else {
      const errorData = await response.json();
      console.log(`❌ Download API failed: ${response.status}`);
      console.log(`   Error: ${errorData.message || errorData.error}`);
    }
  } catch (error) {
    console.log(`❌ Download API error: ${error.message}`);
  }
}

async function runAllTests() {
  console.log('');
  
  await testHealthAPI();
  console.log('');
  await testVibestreamsAPI();
  console.log('');
  await testDownloadAPI('baga6ea4seaqjnegjm');
  console.log('');
  console.log('🏁 Tests completed!');
}

if (require.main === module) {
  runAllTests().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = {
  testVibestreamsAPI,
  testHealthAPI,
  testDownloadAPI,
  runAllTests
}; 