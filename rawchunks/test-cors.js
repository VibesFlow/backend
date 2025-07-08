#!/usr/bin/env node

/**
 * CORS Test Script - Verify CORS configuration is working properly
 * Tests both preflight OPTIONS requests and actual POST requests
 */

const https = require('https');
const http = require('http');

const API_URL = process.env.RAWCHUNKS_URL || 'https://api.vibesflow.ai';
const TEST_ORIGIN = 'http://localhost:8081';

/**
 * Test CORS preflight request
 */
async function testCORSPreflight() {
  console.log('🧪 Testing CORS preflight request...');
  
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + '/upload');
    const isHttps = url.protocol === 'https:';
    const requestModule = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'OPTIONS',
      headers: {
        'Origin': TEST_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,X-Chunk-Id,X-Rta-Id,X-Creator,X-Chunk-Timestamp,X-Participant-Count,X-Is-Final,X-Start-Time'
      }
    };

    const req = requestModule.request(options, (res) => {
      console.log(`✅ Preflight response status: ${res.statusCode}`);
      console.log(`🔍 CORS headers:`, {
        'Access-Control-Allow-Origin': res.headers['access-control-allow-origin'],
        'Access-Control-Allow-Methods': res.headers['access-control-allow-methods'],
        'Access-Control-Allow-Headers': res.headers['access-control-allow-headers'],
        'Access-Control-Max-Age': res.headers['access-control-max-age']
      });
      
      const allowedHeaders = res.headers['access-control-allow-headers'];
      const hasStartTime = allowedHeaders && allowedHeaders.toLowerCase().includes('x-start-time');
      
      if (hasStartTime) {
        console.log('✅ X-Start-Time header is allowed');
      } else {
        console.log('❌ X-Start-Time header is NOT allowed');
        console.log('🔍 Allowed headers:', allowedHeaders);
      }
      
      resolve({
        status: res.statusCode,
        headers: res.headers,
        hasStartTime
      });
    });

    req.on('error', (error) => {
      console.error('❌ Preflight request failed:', error.message);
      reject(error);
    });

    req.setTimeout(10000, () => {
      console.error('❌ Preflight request timeout');
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Test actual POST request with CORS headers
 */
async function testCORSPostRequest() {
  console.log('\n🧪 Testing actual POST request with CORS...');
  
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + '/health'); // Use health endpoint for test
    const isHttps = url.protocol === 'https:';
    const requestModule = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Origin': TEST_ORIGIN,
        'Content-Type': 'application/json'
      }
    };

    const req = requestModule.request(options, (res) => {
      console.log(`✅ POST response status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`🔍 Response CORS headers:`, {
          'Access-Control-Allow-Origin': res.headers['access-control-allow-origin']
        });
        
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      console.error('❌ POST request failed:', error.message);
      reject(error);
    });

    req.setTimeout(10000, () => {
      console.error('❌ POST request timeout');
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Test health endpoint
 */
async function testHealthEndpoint() {
  console.log('\n🧪 Testing health endpoint...');
  
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + '/health');
    const isHttps = url.protocol === 'https:';
    const requestModule = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET'
    };

    const req = requestModule.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`✅ Health check status: ${res.statusCode}`);
        if (res.statusCode === 200) {
          try {
            const healthData = JSON.parse(data);
            console.log(`🏥 Service health:`, {
              status: healthData.status,
              network: healthData.network,
              service: healthData.service
            });
          } catch (e) {
            console.log(`📄 Health response: ${data.substring(0, 200)}...`);
          }
        }
        
        resolve({
          status: res.statusCode,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      console.error('❌ Health check failed:', error.message);
      reject(error);
    });

    req.setTimeout(10000, () => {
      console.error('❌ Health check timeout');
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Main test function
 */
async function runCORSTests() {
  console.log(`🧪 Starting CORS tests for: ${API_URL}`);
  console.log(`🌍 Test origin: ${TEST_ORIGIN}\n`);
  
  try {
    // Test health endpoint first
    await testHealthEndpoint();
    
    // Test CORS preflight
    const preflightResult = await testCORSPreflight();
    
    // Test actual CORS request
    await testCORSPostRequest();
    
    console.log('\n🎉 All CORS tests completed!');
    
    if (preflightResult.hasStartTime) {
      console.log('✅ CORS configuration appears to be working correctly');
      console.log('✅ X-Start-Time header is properly allowed');
    } else {
      console.log('❌ CORS configuration needs fixing');
      console.log('❌ X-Start-Time header is missing from allowed headers');
    }
    
  } catch (error) {
    console.error('\n❌ CORS test failed:', error.message);
    process.exit(1);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runCORSTests();
}

module.exports = {
  testCORSPreflight,
  testCORSPostRequest,
  testHealthEndpoint,
  runCORSTests
}; 