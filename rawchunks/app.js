/**
 * EXPRESS.JS APP - EC2 Production Deployment for VibesFlow Synapse SDK Integration
 * PRODUCTION-READY: No timeouts, real URLs, external connections
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { 
  queueChunkForFilecoin,
  getFilecoinUploadStatus,
  getVibestreams,
  testSynapseConnection
} = require('./synapseSDK');

const persistenceService = require('./persistence');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Allow external connections

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests from specified origins or no origin (for mobile apps, Postman, etc.)
    const allowedOrigins = [
      'http://localhost:8081',
      'http://localhost:3000', 
      'http://localhost:19006',
      'https://vibesflow.ai',
      'https://www.vibesflow.ai',
      'https://app.vibesflow.ai',
      process.env.EXPO_PUBLIC_RAWCHUNKS_URL,
      process.env.CORS_ORIGINS
    ].filter(Boolean);

    // Allow requests with no origin (mobile apps, curl requests, etc.)
    if (!origin) return callback(null, true);
    
    // Allow any origin in development
    if (process.env.NODE_ENV === 'development') return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.some(allowedOrigin => 
      allowedOrigin === '*' || 
      origin.includes(allowedOrigin) || 
      allowedOrigin.includes(origin)
    )) {
      return callback(null, true);
    }
    
    // Default allow for now (can be tightened in production)
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Chunk-Id', 
    'X-Rta-Id', 
    'X-Creator', 
    'X-Chunk-Timestamp', 
    'X-Participant-Count', 
    'X-Is-Final',
    'X-Start-Time',  // Add the missing header
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: [
    'Content-Length',
    'Content-Type',
    'Location',
    'X-Chunk-Status',
    'X-Upload-Progress'
  ],
  credentials: false,  // Set to false for public API
  maxAge: 86400,  // Cache preflight response for 24 hours
  optionsSuccessStatus: 200  // Support legacy browsers
}));

app.use(express.json({ limit: '50mb' })); // Allow larger payloads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Add request timeout middleware (10 minutes for production)
app.use((req, res, next) => {
  res.setTimeout(600000, () => {
    console.log('⏰ Request timeout after 10 minutes');
    res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

/**
 * Async upload queue for Synapse uploads
 * Returns immediately with upload_id, processes in background
 */
const asyncUploadQueue = new Map(); // uploadId -> { status, result, error }

/**
 * Main upload endpoint - async pattern for long Synapse uploads
 */
app.post('/upload', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Extract metadata from headers
    const chunkId = req.headers['x-chunk-id'];
    const rtaId = req.headers['x-rta-id'];
    const creator = req.headers['x-creator'];
    const chunkTimestamp = req.headers['x-chunk-timestamp'];
    const participantCount = req.headers['x-participant-count'] || '1';
    const isFinal = req.headers['x-is-final'] || 'false';
    
    if (!chunkId || !rtaId || !creator) {
      return res.status(400).json({ 
        error: 'Missing required headers: X-Chunk-Id, X-Rta-Id, X-Creator',
        synapseStatus: {
          success: false,
          message: 'Missing required headers',
          error: 'Missing required headers: X-Chunk-Id, X-Rta-Id, X-Creator'
        }
      });
    }
    
    // Extract audio data
    let audioData;
    try {
      if (!req.body.audioData) {
        throw new Error('No audioData in request body');
      }
      audioData = Buffer.from(req.body.audioData, 'base64');
    } catch (e) {
      return res.status(400).json({ 
        error: 'Invalid request body or missing audioData',
        details: e.message,
        synapseStatus: {
          success: false,
          message: 'Invalid audio data',
          error: e.message
        }
      });
    }
    
    if (!audioData || audioData.length === 0) {
      return res.status(400).json({ 
        error: 'No audio data received',
        synapseStatus: {
          success: false,
          message: 'No audio data received',
          error: 'Audio buffer is empty'
        }
      });
    }
    
    console.log(`🔍 Getting Synapse status for ${chunkId}...`);
    let detailedSynapseStatus;
    
    try {
      // Get Synapse connection and status
      const { createSynapseInstance } = require('./synapseSDK');
      const synapse = await createSynapseInstance();
      
      // Get wallet and service status for frontend logging
      const { TOKENS, CONTRACT_ADDRESSES } = await (async () => {
        const synapseModule = await import('@filoz/synapse-sdk');
        return {
          TOKENS: synapseModule.TOKENS,
          CONTRACT_ADDRESSES: synapseModule.CONTRACT_ADDRESSES
        };
      })();
      
      const ethers = require('ethers');
      
      // Get current balances
      const filBalance = await synapse.payments.walletBalance();
      const usdfcBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
      const contractBalance = await synapse.payments.balance(TOKENS.USDFC);
      
      const walletStatus = {
        FIL: ethers.formatEther(filBalance),
        USDFC_Wallet: ethers.formatEther(usdfcBalance),
        USDFC_Contract: ethers.formatEther(contractBalance),
        sufficientFunds: contractBalance > ethers.parseEther('10')
      };
      
      // Check Pandora service approval
      const network = synapse.getNetwork();
      const pandoraAddress = CONTRACT_ADDRESSES.PANDORA_SERVICE[network];
      const serviceApproval = await synapse.payments.serviceApproval(pandoraAddress, TOKENS.USDFC);
      
      const pandoraStatus = {
        address: pandoraAddress,
        isApproved: serviceApproval.isApproved,
        rateAllowance: ethers.formatEther(serviceApproval.rateAllowance),
        lockupAllowance: ethers.formatEther(serviceApproval.lockupAllowance)
      };
      
      // Get proof set info
      const { getStorageServiceForRTA } = require('./synapseSDK');
      const storageService = await getStorageServiceForRTA(rtaId, synapse, creator);
      
      detailedSynapseStatus = {
        success: true,
        message: `Chunk ${chunkId} queued for Filecoin storage via Synapse SDK`,
        uploadId: `${rtaId}_${chunkId}_${Date.now()}`,
        queuePosition: 1,
        estimatedProcessTime: '5-15 minutes',
        walletStatus: walletStatus,
        pandoraStatus: pandoraStatus,
        proofSetId: storageService.proofSetId,
        proofSetStatus: 'active',
        storageProvider: storageService.storageProvider,
        statusEndpoint: `/filecoin/status/${rtaId}`,
        async: true
      };
      
      console.log(`✅ Synapse status retrieved for ${chunkId}:`, {
        proofSet: storageService.proofSetId,
        provider: storageService.storageProvider,
        pandoraApproved: pandoraStatus.isApproved,
        sufficientFunds: walletStatus.sufficientFunds
      });
      
    } catch (statusError) {
      console.warn(`⚠️ Failed to get detailed Synapse status for ${chunkId}:`, statusError.message);
      detailedSynapseStatus = {
        success: true,
        message: `Chunk ${chunkId} queued for Filecoin storage`,
        uploadId: `${rtaId}_${chunkId}_${Date.now()}`,
        queuePosition: 1,
        estimatedProcessTime: '5-15 minutes',
        statusEndpoint: `/filecoin/status/${rtaId}`,
        async: true,
        statusError: statusError.message
      };
    }
    
    // Create upload ID for async tracking
    const uploadId = detailedSynapseStatus.uploadId;
    
    // Mark as processing
    asyncUploadQueue.set(uploadId, {
      status: 'processing',
      startTime: Date.now(),
      chunkId: chunkId,
      rtaId: rtaId,
      size: audioData.length
    });
    
    // Return frontend-expected format with detailed Synapse status
    res.json({
      success: true,
      upload_id: uploadId,
      chunkId: chunkId,
      rtaId: rtaId,
      size: audioData.length,
      participants: parseInt(participantCount),
      isFinal: isFinal === 'true',
      message: `Chunk ${chunkId} queued for async Synapse upload`,
      upload_status: 'processing_async',
      status_url: `/upload/status/${uploadId}`,
      
      synapseStatus: detailedSynapseStatus
    });
    
    // Process upload asynchronously
    console.log(`🚀 Starting async Synapse upload for ${chunkId} (${(audioData.length / 1024).toFixed(1)}KB)`);
    
    // Prepare chunk metadata
    const chunkMetadata = {
      chunk_id: chunkId,
      sequence: parseInt(chunkId.split('_chunk_')[1]?.split('_')[0]) || 0,
      timestamp: parseInt(chunkTimestamp) || Date.now(),
      size: audioData.length,
      duration: 60, // Fixed 60-second chunks (final may be shorter)
      participantCount: parseInt(participantCount),
      creator: creator,
      isFinal: isFinal === 'true',
      uploadedAt: Date.now(),
      rtaId: rtaId
    };
    
    // Process in background without blocking response
    setImmediate(async () => {
      try {
        console.log(`⏱️ Background processing started for ${chunkId} at ${new Date().toISOString()}`);
        
        const result = await queueChunkForFilecoin(rtaId, chunkId, audioData, chunkMetadata);
        
        const processingTime = Date.now() - startTime;
        console.log(`✅ Background upload completed for ${chunkId} in ${(processingTime / 1000).toFixed(1)}s`);
        
        // Update queue status
        asyncUploadQueue.set(uploadId, {
          status: 'completed',
          result: result,
          processingTime: processingTime,
          completedAt: Date.now(),
          synapseResult: {
            success: result.success,
            cid: result.cid,
            provider: result.provider,
            confirmed: result.confirmed || false
          }
        });
        
      } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`❌ Background upload failed for ${chunkId} after ${(processingTime / 1000).toFixed(1)}s:`, error.message);
        
        // Update queue status with error
        asyncUploadQueue.set(uploadId, {
          status: 'failed',
          error: error.message,
          processingTime: processingTime,
          failedAt: Date.now(),
          synapseResult: {
            success: false,
            error: error.message
          }
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Upload endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      synapseStatus: {
        success: false,
        message: 'Internal server error',
        error: error.message
      }
    });
  }
});

/**
 * Get async upload status
 */
app.get('/upload/status/:uploadId', (req, res) => {
  const { uploadId } = req.params;
  
  const uploadStatus = asyncUploadQueue.get(uploadId);
  
  if (!uploadStatus) {
    return res.status(404).json({ error: 'Upload ID not found' });
  }
  
  res.json(uploadStatus);
});

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    const synapseTest = await testSynapseConnection();
    const vibestreams = await persistenceService.getAllVibestreams();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'vibesflow-ec2-production',
      network: 'calibration',
      synapse: synapseTest,
      active_rtas: vibestreams.length,
      persistence: 'dynamodb',
      deployment: 'ec2-production',
      async_queue_size: asyncUploadQueue.size
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get vibestreams endpoint
 */
app.get('/api/vibestreams', async (req, res) => {
  try {
    const vibestreams = await getVibestreams();
    res.json(vibestreams);
  } catch (error) {
    console.error('❌ Failed to get vibestreams:', error);
    res.status(500).json({
      error: 'Failed to load vibestreams',
      message: error.message
    });
  }
});

/**
 * Test Filecoin connection
 */
app.get('/filecoin/test', async (req, res) => {
  try {
    const result = await testSynapseConnection();
    res.json({
      message: 'Filecoin connection test completed',
      result: result
    });
  } catch (error) {
    console.error('❌ Failed to test Filecoin connection:', error);
    res.status(500).json({
      error: 'Failed to test Filecoin connection',
      message: error.message
    });
  }
});

/**
 * Get upload status for RTA
 */
app.get('/filecoin/status/:rtaId', async (req, res) => {
  try {
    const { rtaId } = req.params;
    const status = await getFilecoinUploadStatus(rtaId);
    
    if (status.error) {
      return res.json({
        rtaId: rtaId,
        status: 'not_found',
        message: 'RTA not found',
        totalChunks: 0,
        uploadedChunks: 0,
        chunks: {}
      });
    }
    
    res.json(status);
  } catch (error) {
    console.error('❌ Failed to get Filecoin status:', error);
    res.status(500).json({
      error: 'Failed to get status',
      message: error.message
    });
  }
});

/**
 * Download chunk endpoint
 */
app.get('/api/download/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    const filcdnUrl = `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/${cid}`;
    
    console.log(`📥 Attempting to download chunk ${cid} from FilCDN...`);
    
    const fetch = require('node-fetch');
    const response = await fetch(filcdnUrl);
    
    if (!response.ok) {
      // Try Pinata fallback
      const pinataUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;
      const pinataResponse = await fetch(pinataUrl);
      
      if (!pinataResponse.ok) {
        throw new Error(`Both FilCDN and Pinata failed to retrieve ${cid}`);
      }
      
      const buffer = await pinataResponse.buffer();
      res.set('Content-Type', 'application/octet-stream');
      res.send(buffer);
      return;
    }
    
    const buffer = await response.buffer();
    res.set('Content-Type', 'application/octet-stream');
    res.send(buffer);
    
  } catch (error) {
    console.error('❌ Failed to download chunk:', error);
    res.status(500).json({
      error: 'Failed to download chunk',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`🚀 VibesFlow PRODUCTION Server running on ${HOST}:${PORT}`);
  console.log(`🌐 Health check: http://${HOST}:${PORT}/health`);
  console.log(`📡 Vibestreams: http://${HOST}:${PORT}/api/vibestreams`);
  console.log(`⏰ Switched to EC2 for no timeout issues.`);
});

module.exports = app; 