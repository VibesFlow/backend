/**
 * VibesFlow Filecoin Configuration
 * Following fs-upload-dapp config.ts pattern
 */

const config = {
  // Filecoin connection settings
  rpc: process.env.FILECOIN_RPC_URL || 'https://api.calibration.node.glif.io/rpc/v1',
  network: process.env.FILECOIN_NETWORK || 'calibration',
  walletAddress: process.env.FILECOIN_ADDRESS,
  calibrationAddress: process.env.FILECOIN_CALIBRATION_ADDRESS,
  privateKey: process.env.FILECOIN_PRIVATE_KEY,
  
  // Synapse SDK contract addresses
  pandoraContract: process.env.PANDORA_CONTRACT_ADDRESS,
  paymentsContract: process.env.PAYMENTS_CONTRACT_ADDRESS,
  pdpVerifier: process.env.PDP_VERIFIER_ADDRESS,
  
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

module.exports = config; 