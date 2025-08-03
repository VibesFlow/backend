/**
 * VibesFlow Filecoin Configuration
 * Following fs-upload-dapp config.ts pattern
 */

const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const config = {
  // Server Configuration
  port: process.env.PORT || 3003,
  nodeEnv: process.env.NODE_ENV || 'development',
  serviceName: process.env.SERVICE_NAME || 'rawchunks',
  
  // CORS and Security
  corsOrigins: process.env.CORS_ORIGINS || '*',
  apiKey: process.env.API_KEY || '',
  
  // AWS Configuration  
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.BUCKET || '',
    queueUrl: process.env.QUEUE_URL || ''
  },
  
  // Pinata Configuration (for IPFS storage)
  pinata: {
    apiKey: process.env.PINATA_API_KEY,
    apiSecret: process.env.PINATA_API_SECRET,
    jwt: process.env.PINATA_JWT,
    url: process.env.PINATA_URL || 'gray-clean-parrotfish-186.mypinata.cloud'
  },
  
  // Filecoin Configuration (MAIN WALLET CONFIGURATION)
  filecoin: {
    privateKey: process.env.FILECOIN_PRIVATE_KEY,
    address: process.env.FILECOIN_ADDRESS, // 0x format
    calibrationAddress: process.env.FILECOIN_CALIBRATION_ADDRESS, // t4 format
    rpcUrl: process.env.FILECOIN_RPC_URL || 'https://api.calibration.node.glif.io/rpc/v1'
  },
  
  // Synapse SDK Configuration
  synapse: {
    pandoraContract: process.env.PANDORA_CONTRACT_ADDRESS,
    paymentsContract: process.env.PAYMENTS_CONTRACT_ADDRESS,
    usdfcToken: process.env.USDFC_TOKEN_ADDRESS,
    pdpVerifier: process.env.PDP_VERIFIER_ADDRESS
  },
  
  // Audio Processing Configuration
  audio: {
    chunkDurationMs: parseInt(process.env.CHUNK_DURATION_MS) || 60000,
    defaultSampleRate: parseInt(process.env.DEFAULT_SAMPLE_RATE) || 48000,
    defaultChannels: parseInt(process.env.DEFAULT_CHANNELS) || 2,
    defaultBitDepth: parseInt(process.env.DEFAULT_BIT_DEPTH) || 16,
    maxChunkSize: parseInt(process.env.MAX_CHUNK_SIZE) || 10485760
  },
  
  // Service URLs
  services: {
    rawchunksUrl: process.env.RAWCHUNKS_URL,
    chunkerWorkerUrl: process.env.CHUNKER_WORKER_URL,
    dispatcherWorkerUrl: process.env.DISPATCHER_WORKER_URL
  },
  
  // NEAR Configuration
  near: {
    network: process.env.NEAR_NETWORK || 'testnet',
    rtaFactoryContract: process.env.RTA_FACTORY_CONTRACT
  },
  
  // Lyria AI Configuration
  lyria: {
    apiKey: process.env.EXPO_PUBLIC_LYRIA_API_KEY
  },

  // Legacy aliases for deals.js compatibility
  rpc: process.env.FILECOIN_RPC_URL || 'https://api.calibration.node.glif.io/rpc/v1',
  network: 'calibration',
  walletAddress: process.env.FILECOIN_ADDRESS, // 0x format for FilCDN
  calibrationAddress: process.env.FILECOIN_CALIBRATION_ADDRESS, // t4 format for analytics
  privateKey: process.env.FILECOIN_PRIVATE_KEY,
  
  // Storage capacity and persistence settings
  storageCapacity: 50, // GB of storage capacity needed
  persistencePeriod: 365, // days of storage persistence
  minDaysThreshold: 30, // minimum days threshold for alerts
  
  // CDN settings - ALWAYS TRUE for VibesFlow
  withCDN: true,
  
  // Payment optimization settings
  optimizations: {
    reuseStorageService: true, // Reuse storage service across uploads
    cacheBalanceChecks: true, // Cache balance checks for 10 minutes
    skipRedundantApprovals: true, // Skip approvals if already done in session
    batchPreflightChecks: false // Individual preflight per chunk for accuracy
  },
  
  // Upload settings
  upload: {
    maxConcurrentUploads: 3, // Process max 3 chunks simultaneously
    retryAttempts: 2, // Retry failed uploads
    progressReporting: true // Report upload progress
  },
  
  // API settings
  api: {
    exposeCIDEndpoints: true, // Expose CID+PDP endpoints for app
    compileRTAJson: true, // Compile ${rta_ID}.json with all CIDs
    metadataToIPFS: true // Upload metadata to IPFS
  }
};

// Validation function to ensure environment variables are loaded
function validateConfig() {
  const required = [
    'FILECOIN_PRIVATE_KEY',
    'FILECOIN_ADDRESS', 
    'FILECOIN_CALIBRATION_ADDRESS',
    'PINATA_JWT'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    console.error('💡 Please ensure your .env file contains all required variables');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  console.log('✅ Configuration loaded successfully');
  console.log(`🔧 Network: ${config.network}`);
  console.log(`💰 Wallet: ${config.walletAddress}`);
  console.log(`🌐 Calibration Address: ${config.calibrationAddress}`);
}

// Run validation
try {
  validateConfig();
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  process.exit(1);
}

module.exports = config; 