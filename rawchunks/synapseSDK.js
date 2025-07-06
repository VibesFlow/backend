/**
 * SYNAPSE SDK - Filecoin Storage for VibesFlow
 * 
 * Implements optimized Synapse SDK integration with:
 * 1. Session-based caching for balance checks and approvals
 * 2. Storage service reuse across uploads
 * 3. Proper PDP receipt formatting
 * 4. RTA JSON compilation with all CIDs+PDPs
 * 5. Exact preflight implementation following tutorial
 */

// Load environment variables
require('dotenv').config();

// Configuration
const config = require('./config');
const { ethers } = require('ethers');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Synapse SDK is ESM-only, requires dynamic imports
let Synapse, RPC_URLS, TOKENS, CONTRACT_ADDRESSES;

async function initializeSynapseSDK() {
  if (!Synapse) {
    try {
      const synapseModule = await import('@filoz/synapse-sdk');
      Synapse = synapseModule.Synapse;
      RPC_URLS = synapseModule.RPC_URLS;
      TOKENS = synapseModule.TOKENS;
      CONTRACT_ADDRESSES = synapseModule.CONTRACT_ADDRESSES;
      console.log('✅ Synapse SDK modules loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load Synapse SDK:', error);
      throw error;
    }
  }
  return { Synapse, RPC_URLS, TOKENS, CONTRACT_ADDRESSES };
}

// Environment configuration
const FILECOIN_PRIVATE_KEY = process.env.FILECOIN_PRIVATE_KEY;
const FILECOIN_NETWORK = config.network;
const PINATA_JWT = process.env.PINATA_JWT;

// Session-based caching for optimizations
const sessionCache = {
  balanceChecked: false,
  balanceCheckTime: 0,
  approvalDone: false,
  approvalTime: 0,
  storage: null,
  synapse: null,
  signerAddress: null
};

// Upload queue and status tracking
const filecoinQueue = new Map();
const uploadStatus = new Map();
const rtaCompilations = new Map();

// Cache validity duration (10 minutes)
const CACHE_DURATION = 10 * 60 * 1000;

// Add status tracking system
const uploadTracker = new Map();

/**
 * Initialize Synapse instance with session caching
 */
async function createSynapseInstance() {
  // Return cached instance if available
  if (sessionCache.synapse && sessionCache.signerAddress) {
    console.log(`♻️ Reusing Synapse instance for ${sessionCache.signerAddress}`);
    return sessionCache.synapse;
  }
  
  console.log('🔧 Initializing new Synapse SDK instance...');
  
  const { Synapse, RPC_URLS } = await initializeSynapseSDK();
  
  if (!FILECOIN_PRIVATE_KEY) {
    throw new Error('FILECOIN_PRIVATE_KEY environment variable required');
  }
  
  // Use appropriate RPC URL based on network
  const rpcURL = FILECOIN_NETWORK === 'mainnet' 
    ? RPC_URLS.mainnet.websocket 
    : RPC_URLS.calibration.websocket;
  
  console.log(`🌐 Using ${FILECOIN_NETWORK} network: ${rpcURL}`);
  
  try {
    // Initialize SDK
    const synapse = await Synapse.create({
      privateKey: FILECOIN_PRIVATE_KEY,
      rpcURL: rpcURL
    });
    
    // Get signer address - fix the undefined issue
    const signer = synapse.getSigner();
    const signerAddress = await signer.getAddress();
    
    // Cache the instance
    sessionCache.synapse = synapse;
    sessionCache.signerAddress = signerAddress;
    
    console.log(`✅ Synapse instance created for address: ${signerAddress}`);
    return synapse;
    
  } catch (error) {
    console.error('❌ Failed to create Synapse instance:', error);
    throw error;
  }
}

/**
 * Optimized payment setup with session caching
 */
async function setupPayments(synapse) {
  const now = Date.now();
  
  // Skip if already done and cache is valid
  if (config.optimizations.skipRedundantApprovals && 
      sessionCache.approvalDone && 
      (now - sessionCache.approvalTime) < CACHE_DURATION) {
    console.log('♻️ Skipping payment setup - already done in this session');
    return true;
  }
  
  console.log('💰 Setting up payments for Filecoin storage...');
  
  const { TOKENS, CONTRACT_ADDRESSES } = await initializeSynapseSDK();
  
  try {
    // Get network and contract addresses
    const network = synapse.getNetwork();
    const pandoraAddress = CONTRACT_ADDRESSES.PANDORA_SERVICE[network];
    
    console.log(`🏪 Pandora contract address: ${pandoraAddress}`);
    
    // Check balance - with caching option
    let currentBalance;
    if (config.optimizations.cacheBalanceChecks && 
        sessionCache.balanceChecked && 
        (now - sessionCache.balanceCheckTime) < CACHE_DURATION) {
      console.log('♻️ Using cached balance check');
      currentBalance = sessionCache.cachedBalance;
    } else {
      currentBalance = await synapse.payments.balance(TOKENS.USDFC);
      sessionCache.cachedBalance = currentBalance;
      sessionCache.balanceChecked = true;
      sessionCache.balanceCheckTime = now;
    }
    
    const usdfc = synapse.payments.decimals(TOKENS.USDFC);
    const formattedBalance = ethers.formatUnits(currentBalance, usdfc);
    
    console.log(`💰 Current USDFC balance: ${formattedBalance} USDFC`);
    
    // Deposit logic - only if needed
    const minimumBalance = ethers.parseUnits('10', usdfc);
    if (currentBalance < minimumBalance) {
      const depositNeeded = minimumBalance - currentBalance;
      console.log(`💳 Depositing ${ethers.formatUnits(depositNeeded, usdfc)} USDFC...`);
      
      const depositTx = await synapse.payments.deposit(depositNeeded, TOKENS.USDFC);
      await depositTx.wait();
      console.log(`✅ Deposit confirmed`);
    }
    
    // Approve Pandora service - following tutorial pattern exactly
    console.log(`🔐 Approving Pandora service...`);
    
    const rateAllowance = ethers.parseUnits('10', usdfc);
    const lockupAllowance = ethers.parseUnits('1000', usdfc);
    
    const approveTx = await synapse.payments.approveService(
      pandoraAddress,
      rateAllowance,
      lockupAllowance
    );
    
    await approveTx.wait();
    
    // Cache approval
    sessionCache.approvalDone = true;
    sessionCache.approvalTime = now;
    
    console.log(`✅ Payment setup completed successfully`);
    return true;
    
  } catch (error) {
    console.error('❌ Payment setup failed:', error);
    throw error;
  }
}

/**
 * Optimized storage service creation with reuse
 */
async function createStorageService(synapse) {
  // Return cached storage service if available and reuse is enabled
  if (config.optimizations.reuseStorageService && sessionCache.storage) {
    console.log('♻️ Reusing existing storage service');
    return sessionCache.storage;
  }
  
  console.log('🏗️ Creating new storage service...');
  
  try {
    const storage = await synapse.createStorage({
      withCDN: config.withCDN, // Always true for VibesFlow
      callbacks: {
        onProviderSelected: (provider) => {
          console.log(`🏪 Storage provider selected: ${provider.owner}`);
        },
        onProofSetResolved: (proofSet) => {
          console.log(`🔗 Proof set resolved: ${proofSet.pdpVerifierProofSetId}`);
        },
        onProofSetCreationStarted: (txResponse, statusUrl) => {
          console.log(`🏗️ Creating new proof set...`);
        },
        onProofSetCreationProgress: (status) => {
          if (status.transactionSuccess) {
            console.log(`⛓️ Proof set transaction confirmed`);
          }
          if (status.serverConfirmed) {
            console.log(`🎉 Proof set ready (${Math.round(status.elapsedMs / 1000)}s)`);
          }
        }
      }
    });
    
    // Cache the storage service
    sessionCache.storage = storage;
    
    console.log(`✅ Storage service created successfully`);
    console.log(`   Proof set ID: ${storage.proofSetId}`);
    console.log(`   Storage provider: ${storage.storageProvider.owner}`);
    console.log(`   CDN enabled: ${config.withCDN}`);
    
    return storage;
    
  } catch (error) {
    console.error('❌ Storage service creation failed:', error);
    throw error;
  }
}

/**
 * Preflight check following tutorial exactly
 */
async function performPreflightCheck(storage, fileSize) {
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
  console.log(`🔍 Performing preflight check for ${fileSizeMB}MB file...`);
  
  try {
    const preflight = await storage.preflightUpload(fileSize);
    
    // Format costs properly - following tutorial pattern
    const costs = preflight.estimatedCost;
    let costDisplay = 'calculating...';
    
    if (costs && costs.perEpoch) {
      const decimals = 18; // USDFC decimals
      costDisplay = `${ethers.formatUnits(costs.perEpoch, decimals)} USDFC per epoch`;
    }
    
    console.log(`💰 Estimated costs: ${costDisplay}`);
    console.log(`✅ Allowance sufficient: ${preflight.allowanceCheck.sufficient}`);
    console.log(`📊 Selected provider: ${preflight.selectedProvider.owner}`);
    console.log(`🔗 Selected proof set: ${preflight.selectedProofSetId}`);
    
    if (!preflight.allowanceCheck.sufficient) {
      console.warn(`⚠️ Allowance issue: ${preflight.allowanceCheck.message}`);
      throw new Error('Insufficient allowance for upload');
    }
    
    return preflight;
    
  } catch (error) {
    console.error('❌ Preflight check failed:', error);
    throw error;
  }
}

/**
 * Upload chunk with proper error handling and retries
 */
async function uploadChunkToFilecoin(chunkData, rtaId, chunkId) {
  console.log(`🚀 Starting Filecoin upload for chunk ${chunkId} (RTA: ${rtaId})`);
  
  const chunkKey = `${rtaId}_${chunkId}`;
  uploadStatus.set(chunkKey, { status: 'initializing', progress: 0 });
  
  let retryCount = 0;
  const maxRetries = config.upload.retryAttempts;
  
  while (retryCount <= maxRetries) {
    try {
      // Step 1: Initialize services
      uploadStatus.set(chunkKey, { status: 'initializing_services', progress: 20 });
      
      const synapse = await createSynapseInstance();
      await setupPayments(synapse);
      const storage = await createStorageService(synapse);
      
      // Step 2: Preflight check
      uploadStatus.set(chunkKey, { status: 'preflight_check', progress: 35 });
      await performPreflightCheck(storage, chunkData.length);
      
      // Step 3: Upload with progress tracking
      uploadStatus.set(chunkKey, { status: 'uploading', progress: 50 });
      console.log(`📤 Uploading chunk ${chunkId} (${(chunkData.length / 1024).toFixed(1)}KB)...`);
      
      const uploadResult = await storage.upload(chunkData, {
      onUploadComplete: (commp) => {
          console.log(`📊 Upload complete! CommP: ${commp.toString()}`);
          uploadStatus.set(chunkKey, { status: 'upload_complete', progress: 80, commp: commp.toString() });
        },
        onRootAdded: () => {
          console.log(`🌳 Root added to proof set`);
          uploadStatus.set(chunkKey, { status: 'root_added', progress: 90 });
        }
      });
      
      // Verify upload success
      if (!uploadResult || !uploadResult.commp) {
        throw new Error('Upload failed - no CommP received');
      }
      
      const filecoinCid = uploadResult.commp.toString(); // Fix: Convert CID to string
      const fileSize = uploadResult.size;
      
      console.log(`✅ Chunk ${chunkId} uploaded successfully`);
      console.log(`   CID: ${filecoinCid}`);
      console.log(`   Size: ${fileSize} bytes`);
      
      // Generate properly formatted PDP receipt
    const pdpReceipt = {
      chunkId: chunkId,
      rtaId: rtaId,
      filecoinCid: filecoinCid,
        proofSetId: storage.proofSetId,
        storageProvider: storage.storageProvider.owner,
        size: fileSize,
        uploadedAt: new Date().toISOString(),
        status: 'confirmed',
        withCDN: config.withCDN,
        network: FILECOIN_NETWORK
      };
      
      // Format PDP receipt as readable string - Fix the 'object' display issue
      const pdpReceiptString = JSON.stringify(pdpReceipt, null, 2);
      
      uploadStatus.set(chunkKey, { 
        status: 'completed', 
        progress: 100, 
        filecoinCid,
        pdpReceipt: pdpReceiptString 
      });
      
      console.log(`🎯 Upload completed successfully for chunk ${chunkId}`);
    
    return {
      success: true,
      filecoinCid: filecoinCid,
        pdpReceipt: pdpReceiptString, // Return as formatted string
        proofSetId: storage.proofSetId,
        storageProvider: storage.storageProvider.owner
    };
    
  } catch (error) {
      retryCount++;
      console.error(`❌ Upload attempt ${retryCount} failed for chunk ${chunkId}:`, error.message);
      
      if (retryCount <= maxRetries) {
        console.log(`🔄 Retrying upload in 5 seconds... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        uploadStatus.set(chunkKey, { 
          status: 'failed', 
          progress: 0, 
          error: error.message 
        });
        
    return {
      success: false,
      error: error.message,
      chunkId: chunkId,
      rtaId: rtaId
    };
      }
    }
  }
}

/**
 * Compile RTA JSON with all CIDs and PDPs
 */
async function compileRTAJson(rtaId, filecoinUploads) {
  console.log(`📋 Compiling ${rtaId}.json with all CIDs and PDPs...`);
  
  const rtaJsonData = {
    rtaId: rtaId,
    compiledAt: new Date().toISOString(),
    network: FILECOIN_NETWORK,
    withCDN: config.withCDN,
    totalChunks: Object.keys(filecoinUploads).length,
    chunks: {},
    metadata: {
      storageConfig: config,
      persistencePeriod: config.persistencePeriod,
      version: '1.0'
    }
  };
  
  // Add all chunk CIDs and PDPs
  for (const [chunkId, uploadData] of Object.entries(filecoinUploads)) {
    rtaJsonData.chunks[chunkId] = {
      filecoinCid: uploadData.filecoinCid,
      pdpReceipt: typeof uploadData.pdpReceipt === 'string' 
        ? JSON.parse(uploadData.pdpReceipt) 
        : uploadData.pdpReceipt,
      uploadedAt: uploadData.uploadedAt,
      size: uploadData.size || 0
    };
  }
  
  // Upload to Pinata with proper metadata
  const rtaBuffer = Buffer.from(JSON.stringify(rtaJsonData, null, 2), 'utf8');
  const rtaCid = await uploadMetadataToPinata(
    `${rtaId}.json`,
    rtaBuffer,
    {
      name: `VibesFlow-RTA-${rtaId}`,
      keyvalues: {
        rtaId: rtaId,
        type: 'rta-compilation',
        withCDN: config.withCDN.toString(),
        network: FILECOIN_NETWORK,
        totalChunks: Object.keys(filecoinUploads).length.toString(),
        version: '1.0'
      }
    }
  );
  
  console.log(`✅ RTA JSON compiled and uploaded: ${rtaCid}`);
  
  // Cache the compilation
  rtaCompilations.set(rtaId, {
    rtaCid: rtaCid,
    compiledAt: new Date().toISOString(),
    totalChunks: Object.keys(filecoinUploads).length,
    chunks: Object.keys(filecoinUploads)
  });
  
  return rtaCid;
}

/**
 * Queue chunk for optimized processing
 */
async function queueChunkForFilecoin(rtaId, chunkId, chunkData, metadata) {
  console.log(`📋 Queuing chunk ${chunkId} for Filecoin upload (${(chunkData.length / 1024).toFixed(1)}KB)`);
  
  if (!filecoinQueue.has(rtaId)) {
    filecoinQueue.set(rtaId, {
      chunks: [],
      metadata: {
        rtaId: rtaId,
        createdAt: Date.now(),
        totalChunks: 0,
        filecoinUploads: {},
        withCDN: config.withCDN
      }
    });
  }
  
  const rtaData = filecoinQueue.get(rtaId);
  rtaData.chunks.push({
    chunkId: chunkId,
    data: chunkData,
    metadata: metadata,
    queuedAt: Date.now(),
    status: 'queued'
  });
  
  rtaData.metadata.totalChunks = rtaData.chunks.length;
  console.log(`✅ Chunk ${chunkId} queued (total: ${rtaData.chunks.length})`);
  
  // Process with controlled concurrency
  setImmediate(async () => {
  await processFilecoinQueue(rtaId);
  });
}

/**
 * Process queue with controlled concurrency
 */
async function processFilecoinQueue(rtaId) {
  const rtaData = filecoinQueue.get(rtaId);
  if (!rtaData || rtaData.chunks.length === 0) return;
  
  console.log(`⚙️ Processing Filecoin queue for RTA ${rtaId}: ${rtaData.chunks.length} chunks`);
  
  const maxConcurrent = config.upload.maxConcurrentUploads;
  const chunks = rtaData.chunks.filter(chunk => chunk.status === 'queued');
  
  // Process chunks in batches
  for (let i = 0; i < chunks.length; i += maxConcurrent) {
    const batch = chunks.slice(i, i + maxConcurrent);
    
    const uploadPromises = batch.map(async (chunk) => {
      chunk.status = 'uploading';
      
      try {
        const result = await uploadChunkToFilecoin(chunk.data, rtaId, chunk.chunkId);
        
        if (result.success) {
          chunk.status = 'uploaded';
          chunk.filecoinCid = result.filecoinCid;
          chunk.pdpReceipt = result.pdpReceipt;
          
          // Store in metadata
          rtaData.metadata.filecoinUploads[chunk.chunkId] = {
            filecoinCid: result.filecoinCid,
            pdpReceipt: result.pdpReceipt,
            uploadedAt: Date.now(),
            proofSetId: result.proofSetId,
            storageProvider: result.storageProvider,
            size: chunk.data.length
          };
          
          console.log(`✅ Chunk ${chunk.chunkId} uploaded: ${result.filecoinCid}`);
        } else {
          chunk.status = 'failed';
          chunk.error = result.error;
          console.error(`❌ Failed to upload chunk ${chunk.chunkId}: ${result.error}`);
        }
        
      } catch (error) {
        chunk.status = 'failed';
        chunk.error = error.message;
        console.error(`❌ Error uploading chunk ${chunk.chunkId}:`, error);
      }
    });
    
    await Promise.all(uploadPromises);
  }
  
  // Compile RTA JSON when all chunks are processed
  const allProcessed = rtaData.chunks.every(chunk => 
    chunk.status === 'uploaded' || chunk.status === 'failed'
  );
  
  if (allProcessed) {
    const successfulUploads = rtaData.chunks.filter(c => c.status === 'uploaded').length;
    console.log(`🎯 All chunks processed for RTA ${rtaId}: ${successfulUploads}/${rtaData.chunks.length} successful`);
    
    if (successfulUploads > 0 && config.api.compileRTAJson) {
      await compileRTAJson(rtaId, rtaData.metadata.filecoinUploads);
    }
    
    filecoinQueue.delete(rtaId);
  }
}

/**
 * Upload metadata to Pinata
 */
async function uploadMetadataToPinata(filename, buffer, metadata) {
  if (!PINATA_JWT) {
    throw new Error('PINATA_JWT environment variable required');
  }
  
  const formData = new FormData();
  formData.append('file', buffer, { filename });
  formData.append('pinataMetadata', JSON.stringify(metadata));
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
  
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`,
      ...formData.getHeaders()
    },
    body: formData
  });
  
  if (!response.ok) {
    throw new Error(`Pinata upload failed: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.IpfsHash;
}

/**
 * Get upload status with formatted data
 */
function getFilecoinUploadStatus(rtaId) {
  const rtaData = filecoinQueue.get(rtaId);
  const compilation = rtaCompilations.get(rtaId);
  
  if (!rtaData && !compilation) {
    return { error: 'RTA not found' };
  }
  
  const response = {
    rtaId: rtaId,
    status: rtaData ? 'processing' : 'completed',
    totalChunks: rtaData ? rtaData.chunks.length : 0,
    uploadedChunks: rtaData ? rtaData.chunks.filter(c => c.status === 'uploaded').length : 0,
    failedChunks: rtaData ? rtaData.chunks.filter(c => c.status === 'failed').length : 0,
    chunks: {},
    compilation: compilation || null
  };
  
  // Add individual chunk status
  if (rtaData) {
    rtaData.chunks.forEach(chunk => {
      response.chunks[chunk.chunkId] = {
        status: chunk.status,
        filecoinCid: chunk.filecoinCid || null,
        pdpReceipt: chunk.pdpReceipt || null,
        error: chunk.error || null
      };
    });
  }
  
  return response;
}

/**
 * Get compiled RTA data
 */
function getCompiledRTAData(rtaId) {
  const compilation = rtaCompilations.get(rtaId);
  
  if (!compilation) {
    return { error: 'RTA compilation not found' };
  }
  
  return {
    rtaId: rtaId,
    rtaCid: compilation.rtaCid,
    compiledAt: compilation.compiledAt,
    totalChunks: compilation.totalChunks,
    chunks: compilation.chunks,
    downloadUrl: `https://gateway.pinata.cloud/ipfs/${compilation.rtaCid}`
  };
}

/**
 * Test connection with session info
 */
async function testSynapseConnection() {
  console.log('🔍 Testing Synapse SDK connection...');
  
  try {
    const synapse = await createSynapseInstance();
    
    console.log('✅ Connection test successful');
    console.log(`   Network: ${synapse.getNetwork()}`);
    console.log(`   Signer: ${sessionCache.signerAddress}`);
    console.log(`   Session cache: ${sessionCache.balanceChecked ? 'Active' : 'Empty'}`);
    
    return {
      success: true,
      network: synapse.getNetwork(),
      signerAddress: sessionCache.signerAddress,
      cacheActive: sessionCache.balanceChecked
    };
    
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function uploadToSynapse(chunkData, metadata) {
  const uploadId = `${metadata.rtaId}_${metadata.chunkIndex}_${Date.now()}`;
  
  try {
    console.group(`🔗 Synapse Upload: ${uploadId}`);
    console.log('📊 Metadata:', {
      rtaId: metadata.rtaId,
      chunkIndex: metadata.chunkIndex,
      size: chunkData.length,
      timestamp: new Date().toISOString()
    });

    uploadTracker.set(uploadId, {
      status: 'uploading',
      startTime: Date.now(),
      metadata,
      size: chunkData.length
    });

    // Initialize storage client
    const client = await storage.create({
      rpc: process.env.FILECOIN_NETWORK || 'https://calibration.filfox.info/rpc/v1',
      privateKey: process.env.FILECOIN_PRIVATE_KEY,
      network: 'calibration'
    });

    console.log('✅ Synapse client initialized');
    
    // Upload with detailed progress tracking
    const result = await client.upload(chunkData, {
      name: `${metadata.rtaId}_chunk_${metadata.chunkIndex}`,
      metadata: {
        creator: metadata.creator,
        rtaId: metadata.rtaId,
        chunkIndex: metadata.chunkIndex,
        uploadTime: Date.now()
      }
    });

    // Update tracker with success
    uploadTracker.set(uploadId, {
      ...uploadTracker.get(uploadId),
      status: 'completed',
      endTime: Date.now(),
      cid: result.cid,
      dealId: result.dealId,
      result
    });

    console.log('🎉 Upload completed:', {
      cid: result.cid,
      dealId: result.dealId,
      duration: Date.now() - uploadTracker.get(uploadId).startTime
    });
    console.groupEnd();

    return {
      success: true,
      uploadId,
      cid: result.cid,
      dealId: result.dealId,
      result
    };

  } catch (error) {
    uploadTracker.set(uploadId, {
      ...uploadTracker.get(uploadId),
      status: 'failed',
      endTime: Date.now(),
      error: error.message
    });

    console.error('❌ Synapse upload failed:', {
      uploadId,
      error: error.message,
      stack: error.stack
    });
    console.groupEnd();

    throw error;
  }
}

// Add status retrieval functions
function getUploadStatus(uploadId) {
  return uploadTracker.get(uploadId) || null;
}

function getAllUploads() {
  return Array.from(uploadTracker.entries()).map(([id, data]) => ({
    uploadId: id,
    ...data
  }));
}

function getUploadsByStatus(status) {
  return getAllUploads().filter(upload => upload.status === status);
}

module.exports = {
  initializeSynapseSDK,
  createSynapseInstance,
  setupPayments,
  createStorageService,
  performPreflightCheck,
  uploadChunkToFilecoin,
  queueChunkForFilecoin,
  processFilecoinQueue,
  getFilecoinUploadStatus,
  getCompiledRTAData,
  testSynapseConnection,
  uploadToSynapse,
  getUploadStatus,
  getAllUploads,
  getUploadsByStatus
}; 