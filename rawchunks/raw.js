/**
 * RAW.JS - Serverless Backend for Lyria Audio Chunk Processing
 * Receives real-time 60-second audio chunks from Expo app
 * Queues them for processing by Chunker and Dispatcher workers
 * Supports both AWS S3 and Pinata for storage
 */

// Load environment variables first
require('dotenv').config();

// Import required modules
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// AWS SDK v3 clients
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const BUCKET_NAME = process.env.BUCKET_NAME || 'vibesflow-raw-chunks';

// Pinata configuration
const PINATA_JWT = process.env.PINATA_JWT;

// Import Filecoin service
const {
  queueChunkForFilecoin,
  getFilecoinUploadStatus,
  getCompiledRTAData,
  testSynapseConnection
} = require('./synapseSDK');

// Initialize AWS clients
let s3Client, sqsClient;
if (process.env.AWS_ACCESS_KEY_ID) {
  const awsConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  };
  s3Client = new S3Client(awsConfig);
  sqsClient = new SQSClient(awsConfig);
}

const BUCKET = process.env.BUCKET;
const QUEUE_URL = process.env.QUEUE_URL;

// Pinata configuration for IPFS storage alternative
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_API_SECRET = process.env.PINATA_API_SECRET;

// In-memory metadata store for progressive building
const metadataStore = new Map(); // rtaId -> metadata object

// Helper function to convert stream to buffer (for AWS SDK v3)
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Helper function to convert WebM/Opus to WAV using ffmpeg
async function convertToWav(compressedAudioBuffer, outputPath) {
  const tempInputPath = `/tmp/input_${Date.now()}.webm`;
  
  try {
    // Write compressed audio to temp file
    fs.writeFileSync(tempInputPath, compressedAudioBuffer);
    
    // Convert to WAV using ffmpeg
    // 48kHz, 16-bit, stereo as specified
    const ffmpegCmd = `/opt/bin/ffmpeg -i "${tempInputPath}" -ar 48000 -ac 2 -sample_fmt s16 -f wav "${outputPath}" -y`;
    
    console.log(`🔄 Converting audio: ${ffmpegCmd}`);
    execSync(ffmpegCmd, { stdio: 'pipe' });
    
    // Read the converted WAV file
    const wavBuffer = fs.readFileSync(outputPath);
    
    // Cleanup temp files
    fs.unlinkSync(tempInputPath);
    fs.unlinkSync(outputPath);
    
    console.log(`✅ Audio converted: ${compressedAudioBuffer.length} bytes → ${wavBuffer.length} bytes WAV`);
    return wavBuffer;
    
  } catch (error) {
    // Cleanup on error
    try {
      if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError.message);
    }
    throw new Error(`Audio conversion failed: ${error.message}`);
  }
}

// Progressive metadata management
function getOrCreateMetadata(rtaId) {
  if (!metadataStore.has(rtaId)) {
    metadataStore.set(rtaId, {
      rtaId: rtaId,
      createdAt: Date.now(),
      totalChunks: 0,
      chunks: [] // Array of chunk metadata
    });
  }
  return metadataStore.get(rtaId);
}

function addChunkToMetadata(rtaId, chunkData) {
  const metadata = getOrCreateMetadata(rtaId);
  
  // Find existing chunk or add new one
  const existingIndex = metadata.chunks.findIndex(c => c.chunkId === chunkData.chunkId);
  if (existingIndex >= 0) {
    // Update existing chunk metadata
    metadata.chunks[existingIndex] = { ...metadata.chunks[existingIndex], ...chunkData };
  } else {
    // Add new chunk
    metadata.chunks.push(chunkData);
    metadata.totalChunks = metadata.chunks.length;
  }
  
  metadata.lastUpdated = Date.now();
  console.log(`📊 Updated metadata for RTA ${rtaId}: ${metadata.totalChunks} chunks`);
}

// Upload final metadata to Pinata
async function uploadFinalMetadata(rtaId) {
  const metadata = metadataStore.get(rtaId);
  if (!metadata) {
    throw new Error(`No metadata found for RTA: ${rtaId}`);
  }
  
  // Add final fields
  metadata.finalizedAt = Date.now();
  metadata.isComplete = true;
  
  const metadataJson = JSON.stringify(metadata, null, 2);
  const metadataBuffer = Buffer.from(metadataJson, 'utf8');
  
  try {
    const metadataCid = await uploadMetadataToPinata(
      `${rtaId}_metadata.json`,
      metadataBuffer,
      {
        name: `VibesFlow-Metadata-${rtaId}`,
        keyvalues: {
          rtaId: rtaId,
          type: 'metadata',
          totalChunks: metadata.totalChunks.toString(),
          isComplete: 'true'
        }
      }
    );
    
    console.log(`📋 Final metadata uploaded for RTA ${rtaId}: ${metadataCid}`);
    
    // Clean up from memory
    metadataStore.delete(rtaId);
    
    return metadataCid;
    
  } catch (error) {
    console.error(`❌ Failed to upload final metadata for RTA ${rtaId}:`, error);
    throw error;
  }
}

/**
 * Upload endpoint - receives compressed audio chunks and converts to WAV
 */
exports.uploadChunk = async (event) => {
  // CORS headers for all responses (including errors)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Chunk-Id,X-Rta-Id,X-Creator,X-Start-Time,X-Chunk-Timestamp,X-Sample-Rate,X-Channels,X-Bit-Depth,X-Participant-Count,X-Is-Final,X-Audio-Format,X-Original-Size,X-Compressed-Size',
    'Access-Control-Max-Age': '86400'
  };

  try {
    console.log('📡 Received audio chunk upload request');
    
    // Extract metadata from headers
    const chunkId = event.headers['x-chunk-id'] || event.headers['X-Chunk-Id'];
    const rtaId = event.headers['x-rta-id'] || event.headers['X-Rta-Id'];
    const creator = event.headers['x-creator'] || event.headers['X-Creator'];
    const startTime = event.headers['x-start-time'] || event.headers['X-Start-Time'];
    const chunkTimestamp = event.headers['x-chunk-timestamp'] || event.headers['X-Chunk-Timestamp'];
    const sampleRate = event.headers['x-sample-rate'] || event.headers['X-Sample-Rate'] || '48000';
    const channels = event.headers['x-channels'] || event.headers['X-Channels'] || '2';
    const bitDepth = event.headers['x-bit-depth'] || event.headers['X-Bit-Depth'] || '16';
    const participantCount = event.headers['x-participant-count'] || event.headers['X-Participant-Count'] || '1';
    const isFinal = event.headers['x-is-final'] || event.headers['X-Is-Final'] || 'false';
    const audioFormat = event.headers['x-audio-format'] || event.headers['X-Audio-Format'] || 'webm-opus';
    const originalSize = event.headers['x-original-size'] || event.headers['X-Original-Size'];
    const compressedSize = event.headers['x-compressed-size'] || event.headers['X-Compressed-Size'];
    
    if (!chunkId || !rtaId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ error: 'Missing required headers: X-Chunk-Id, X-Rta-Id' })
      };
    }
    
    // Extract compressed audio data
    let compressedAudioData;
    try {
      console.log('🔍 Event body type:', typeof event.body);
      console.log('🔍 Event body length:', event.body ? event.body.length : 'null');
      console.log('🔍 Event body preview:', event.body ? event.body.substring(0, 100) : 'null');
      
      let bodyText = event.body;
      
      // Check if the body is base64 encoded (API Gateway sometimes does this)
      if (bodyText && typeof bodyText === 'string') {
        try {
          // Try to decode from base64 first
          const decoded = Buffer.from(bodyText, 'base64').toString('utf8');
          if (decoded.startsWith('{') && decoded.endsWith('}')) {
            console.log('🔍 Detected base64 encoded body, decoding...');
            bodyText = decoded;
          }
        } catch (base64Error) {
          // If base64 decoding fails, use original body
          console.log('🔍 Body is not base64 encoded, using as-is');
        }
      }
      
      const requestBody = JSON.parse(bodyText);
      console.log('🔍 Parsed body keys:', Object.keys(requestBody));
      
      if (requestBody.audioData) {
        compressedAudioData = Buffer.from(requestBody.audioData, 'base64');
      } else {
        throw new Error('No audioData in request body');
      }
    } catch (e) {
      console.error('❌ Body parsing error:', e.message);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ 
          error: 'Invalid request body or missing audioData',
          details: e.message,
          bodyType: typeof event.body,
          bodyLength: event.body ? event.body.length : 'null'
        })
      };
    }
    
    if (!compressedAudioData || compressedAudioData.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ error: 'No audio data received' })
      };
    }
    
    console.log(`🎵 Processing chunk ${chunkId} for RTA ${rtaId}`);
    console.log(`📦 Compressed audio: ${(compressedAudioData.length / 1024).toFixed(1)}KB (${audioFormat})`);
    console.log(`👥 Participants: ${participantCount}`);
    
    // Temporarily skip WAV conversion and upload compressed WebM directly
    // TODO: Fix FFmpeg layer configuration for proper WAV conversion
    console.log(`⚠️ Skipping WAV conversion (FFmpeg layer issue), uploading compressed WebM directly`);
    
    // Upload compressed WebM file to Pinata
    let audioCid;
    try {
      audioCid = await storeFileOnPinata(
        `${chunkId}.webm`,
        rtaId,
        compressedAudioData,
        'audio/webm',
        {
          name: `VibesFlow-Chunk-${chunkId}`,
          keyvalues: {
            rtaId: rtaId,
            chunkId: chunkId,
            creator: creator || 'unknown',
            timestamp: chunkTimestamp || Date.now().toString(),
            participantCount: participantCount, // Include participant count in metadata
            type: 'audio-chunk',
            format: 'webm-opus'
          }
        }
      );
      console.log(`✅ WebM file uploaded to Pinata: ${audioCid}`);
    } catch (uploadError) {
      console.error('❌ Pinata upload failed:', uploadError);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ error: 'File upload failed', details: uploadError.message })
      };
    }
    
    // Add chunk data to progressive metadata - including participant count
    const chunkMetadata = {
      chunkId: chunkId,
      sequence: parseInt(chunkId.split('_chunk_')[1]?.split('_')[0]) || 0,
      timestamp: parseInt(chunkTimestamp) || Date.now(),
      wavCid: audioCid,
      wavSize: 0, // This will be updated by the chunker worker
      originalCompressedSize: compressedAudioData.length,
      originalRawSize: parseInt(originalSize) || null,
      sampleRate: parseInt(sampleRate),
      channels: parseInt(channels),
      bitDepth: parseInt(bitDepth),
      participantCount: parseInt(participantCount), // Track participant count for this chunk
      duration: 60, // seconds - will be updated by chunker worker if different
      isFinal: isFinal === 'true',
      uploadedAt: Date.now(),
      // Fields to be added by workers:
      // owner: null, // Will be added by chunker worker (VRF-raffled)
      // chunkCID_onSynapse: null, // Will be added by dispatcher worker
      // chunkPDP_onSynapse: null  // Will be added by dispatcher worker
    };
    
    addChunkToMetadata(rtaId, chunkMetadata);
    
    // Queue chunk for Filecoin upload via Synapse SDK
    let synapseStatus = null;
    try {
      console.log(`🚀 Queuing chunk ${chunkId} for Filecoin upload...`);
      await queueChunkForFilecoin(rtaId, chunkId, compressedAudioData, chunkMetadata);
      console.log(`✅ Chunk ${chunkId} queued for Filecoin upload successfully`);
      synapseStatus = {
        success: true,
        message: `Chunk ${chunkId} queued for Filecoin upload successfully`,
        chunkId: chunkId,
        rtaId: rtaId,
        timestamp: Date.now()
      };
    } catch (filecoinError) {
      console.error(`⚠️ Failed to queue chunk ${chunkId} for Filecoin upload:`, filecoinError);
      synapseStatus = {
        success: false,
        message: `Failed to queue chunk ${chunkId} for Filecoin upload: ${filecoinError.message}`,
        chunkId: chunkId,
        rtaId: rtaId,
        error: filecoinError.message,
        timestamp: Date.now()
      };
      // Don't fail the main upload - Filecoin is an additional service
    }
    
    // If this is the final chunk, upload the complete metadata
    let metadataCid = null;
    if (isFinal === 'true') {
      try {
        metadataCid = await uploadFinalMetadata(rtaId);
        console.log(`🎯 Final metadata uploaded for RTA ${rtaId}: ${metadataCid}`);
      } catch (metadataError) {
        console.error('⚠️ Failed to upload final metadata:', metadataError);
        // Don't fail the request, metadata upload is not critical for the chunk upload itself
      }
    }
    
    // Queue chunk for further processing by workers
    const queueMessage = {
      action: 'process_wav_chunk',
      chunkId,
      rtaId,
      wavCid: audioCid,
      wavSize: 0, // This will be updated by the chunker worker
      participantCount: parseInt(participantCount), // Include participant count for worker processing
      metadata: chunkMetadata,
      isFinal: isFinal === 'true',
      queuedAt: Date.now()
    };
    
    try {
      if (sqsClient && QUEUE_URL) {
        await sqsClient.send(new SendMessageCommand({
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify(queueMessage),
          MessageGroupId: rtaId,
          MessageDeduplicationId: `${rtaId}-${chunkId}-${Date.now()}`,
          MessageAttributes: {
            rtaId: { DataType: 'String', StringValue: rtaId },
            chunkId: { DataType: 'String', StringValue: chunkId },
            participantCount: { DataType: 'Number', StringValue: participantCount },
            isFinal: { DataType: 'String', StringValue: isFinal }
          }
        }));
        console.log(`🚀 Queued WAV chunk for worker processing: ${chunkId} (participants: ${participantCount})`);
      } else {
        console.log(`🔧 No queue configured, skipping worker notification`);
      }
    } catch (queueError) {
      console.error('❌ Queue error:', queueError);
      // Don't fail the request - chunk is stored successfully
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ 
        success: true, 
        chunkId,
        rtaId,
        wavCid: audioCid,
        wavSize: 0, // This will be updated by the chunker worker
        originalCompressedSize: compressedAudioData.length,
        participantCount: parseInt(participantCount), // Include in response
        compressionRatio: ((compressedAudioData.length / (parseInt(originalSize) || compressedAudioData.length)) * 100).toFixed(1) + '%',
        isFinal: isFinal === 'true',
        metadataCid: metadataCid,
        message: `Compressed WebM chunk uploaded successfully${isFinal === 'true' ? ' (final chunk, metadata finalized)' : ''} - ${participantCount} participants active`,
        synapseStatus: synapseStatus // Include Synapse operation status
      })
    };
    
  } catch (error) {
    console.error('❌ Upload chunk error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};

/**
 * Store file on Pinata IPFS with proper metadata
 */
async function storeFileOnPinata(filename, rtaId, fileBuffer, contentType, pinataMetadata) {
  const form = new FormData();
  
  form.append('file', fileBuffer, {
    filename: filename,
    contentType: contentType
  });
  
  form.append('pinataMetadata', JSON.stringify(pinataMetadata));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`
    },
    body: form
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  return result.IpfsHash;
}

/**
 * OPTIONS handler for CORS preflight requests
 */
exports.options = async () => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Chunk-Id,X-Rta-Id,X-Creator,X-Start-Time,X-Chunk-Timestamp,X-Sample-Rate,X-Channels,X-Bit-Depth,X-Participant-Count,X-Is-Final,X-Audio-Format,X-Original-Size,X-Compressed-Size',
      'Access-Control-Max-Age': '86400'
    },
    body: ''
  };
};

/**
 * Health check endpoint
 */
exports.health = async () => {
  const config = {
    pinata: PINATA_JWT ? 'configured' : 'missing',
    ffmpeg: 'enabled',
    queue: QUEUE_URL ? 'configured' : 'missing',
    runtime: 'nodejs20.x',
    audioConversion: 'webm-opus-to-wav',
    metadataHandling: 'progressive-separate-files',
    participantTracking: 'enabled'
  };
  
  return {
    statusCode: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ 
      status: 'healthy',
      service: 'rawchunks-wav-converter',
      timestamp: Date.now(),
      config
    })
  };
};

/**
 * Filecoin upload status endpoint
 */
exports.filecoinStatus = async (event) => {
  console.log('📊 Filecoin status request received');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'CORS preflight successful' }) };
  }

  try {
    const rtaId = event.pathParameters?.rtaId || event.queryStringParameters?.rtaId;
    
    if (!rtaId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'rtaId parameter required' })
      };
    }

    console.log(`📈 Getting Filecoin status for RTA: ${rtaId}`);
    
    const status = getFilecoinUploadStatus(rtaId);
    
    console.log('✅ Status retrieved:', status);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(status)
    };

  } catch (error) {
    console.error('❌ Failed to get Filecoin status:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to get status',
        message: error.message
      })
    };
  }
};

/**
 * Process Filecoin upload queue endpoint
 */
exports.processFilecoinQueue = async (event) => {
  console.log('⚙️ Manual Filecoin queue processing triggered');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'CORS preflight successful' }) };
  }

  try {
    const { processFilecoinQueue } = require('./synapseSDK');
    
    const body = event.body ? JSON.parse(event.body) : {};
    const rtaId = body.rtaId || event.pathParameters?.rtaId;

    if (rtaId) {
      console.log(`🎯 Processing queue for specific RTA: ${rtaId}`);
      await processFilecoinQueue(rtaId);
    } else {
      console.log('🌐 Processing all queued RTAs...');
      // Process all RTAs in queue - implementation depends on queue structure
      console.log('⚠️ Global queue processing not implemented yet');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: rtaId ? `Queue processed for RTA ${rtaId}` : 'Global queue processing initiated',
        rtaId: rtaId
      })
    };

  } catch (error) {
    console.error('❌ Queue processing failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Queue processing failed',
        message: error.message
      })
    };
  }
};

/**
 * Endpoint for workers to update chunk metadata
 */
exports.updateChunkMetadata = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400'
  };

  try {
    const { rtaId, chunkId, updates } = JSON.parse(event.body);
    
    if (!rtaId || !chunkId || !updates) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ error: 'Missing required fields: rtaId, chunkId, updates' })
      };
    }
    
    const metadata = getOrCreateMetadata(rtaId);
    const chunkIndex = metadata.chunks.findIndex(c => c.chunkId === chunkId);
    
    if (chunkIndex === -1) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({ error: `Chunk ${chunkId} not found in RTA ${rtaId}` })
      };
    }
    
    // Update chunk metadata
    metadata.chunks[chunkIndex] = { ...metadata.chunks[chunkIndex], ...updates };
    metadata.lastUpdated = Date.now();
    
    console.log(`📝 Updated metadata for chunk ${chunkId} in RTA ${rtaId}:`, Object.keys(updates));
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ 
        success: true,
        message: `Metadata updated for chunk ${chunkId}`,
        updatedFields: Object.keys(updates)
      })
    };
    
  } catch (error) {
    console.error('❌ Update metadata error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};

// Test Synapse SDK connection
exports.testFilecoinConnection = async (event) => {
  console.log('🧪 Testing Filecoin/Synapse connection');

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: JSON.stringify({ message: 'CORS preflight successful' }) };
  }

  try {
    const testResult = await testSynapseConnection();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Filecoin connection test completed',
        ...testResult
      })
    };

  } catch (error) {
    console.error('❌ Connection test failed:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Connection test failed',
        message: error.message
      })
    };
  }
};

// Helper function to upload metadata to Pinata
async function uploadMetadataToPinata(filename, buffer, metadata) {
  const form = new FormData();
  
  form.append('file', buffer, {
    filename: filename,
    contentType: 'application/json'
  });
  
  form.append('pinataMetadata', JSON.stringify(metadata));
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`
    },
    body: form
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata upload error: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  return result.IpfsHash;
}

/**
 * Get compiled RTA JSON with all CIDs and PDPs
 */
exports.getRTAData = async (event) => {
  console.log('📋 RTA data request received');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'CORS preflight successful' }) };
  }

  try {
    const rtaId = event.pathParameters?.rtaId || event.queryStringParameters?.rtaId;
    
    if (!rtaId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'rtaId parameter required' })
      };
    }

    console.log(`📊 Getting compiled RTA data for: ${rtaId}`);
    
    const rtaData = getCompiledRTAData(rtaId);
    
    console.log('✅ RTA data retrieved:', rtaData);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(rtaData)
    };

  } catch (error) {
    console.error('❌ Failed to get RTA data:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to get RTA data',
        message: error.message
      })
    };
  }
};

/**
 * Get all CIDs and PDPs for individual chunks in an RTA
 */
exports.getChunkCIDs = async (event) => {
  console.log('🔗 Chunk CIDs request received');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ message: 'CORS preflight successful' }) };
  }

  try {
    const rtaId = event.pathParameters?.rtaId || event.queryStringParameters?.rtaId;
    const chunkId = event.pathParameters?.chunkId || event.queryStringParameters?.chunkId;
    
    if (!rtaId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'rtaId parameter required' })
      };
    }

    console.log(`🔍 Getting chunk CIDs for RTA: ${rtaId}${chunkId ? `, chunk: ${chunkId}` : ''}`);
    
    const status = getFilecoinUploadStatus(rtaId);
    
    if (status.error) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify(status)
      };
    }

    // If specific chunk requested, return just that chunk
    if (chunkId && status.chunks[chunkId]) {
      const chunkData = status.chunks[chunkId];
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          rtaId: rtaId,
          chunkId: chunkId,
          filecoinCid: chunkData.filecoinCid,
          pdpReceipt: chunkData.pdpReceipt,
          status: chunkData.status,
          downloadUrl: chunkData.filecoinCid ? `https://gateway.lighthouse.storage/ipfs/${chunkData.filecoinCid}` : null
        })
      };
    }

    // Return all chunk CIDs
    const chunkCIDs = {};
    Object.entries(status.chunks).forEach(([id, data]) => {
      chunkCIDs[id] = {
        filecoinCid: data.filecoinCid,
        pdpReceipt: data.pdpReceipt,
        status: data.status,
        downloadUrl: data.filecoinCid ? `https://gateway.lighthouse.storage/ipfs/${data.filecoinCid}` : null
      };
    });
    
    console.log('✅ Chunk CIDs retrieved for RTA:', rtaId);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        rtaId: rtaId,
        totalChunks: status.totalChunks,
        uploadedChunks: status.uploadedChunks,
        chunks: chunkCIDs
      })
    };

  } catch (error) {
    console.error('❌ Failed to get chunk CIDs:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Failed to get chunk CIDs',
        message: error.message
      })
    };
  }
}; 