/**
 * SYNAPSE SDK - Complete Filecoin Storage Implementation for VibesFlow
 * 
 * This implementation provides:
 * 1. Proper Synapse SDK integration for PDP storage on Filecoin
 * 2. Payment setup with USDFC deposits and Pandora approvals
 * 3. Progressive chunk upload by RTA ID with proof set management
 * 4. FilCDN-compatible metadata compilation
 * 5. Pinata as fallback only
 * 6. DynamoDB persistence for vibestreams data
 * 
 * Flow:
 * 1. Initialize Synapse instance with funded wallet
 * 2. Setup payments (deposit USDFC, approve Pandora service)
 * 3. Create or select storage service with proof sets
 * 4. Upload chunks to Filecoin via Synapse SDK
 * 5. Store metadata in DynamoDB for persistence
 * 6. Compile metadata for FilCDN retrieval
 * 7. Use Pinata only as fallback if Synapse fails
 */

require('dotenv').config();
const { ethers } = require('ethers');
const FormData = require('form-data');
const fetch = require('node-fetch');
const persistenceService = require('./persistence');

// Synapse SDK dynamic imports
let Synapse, RPC_URLS, CONTRACT_ADDRESSES, PandoraService, TOKENS;

async function initializeSynapseSDK() {
  if (!Synapse) {
    try {
      const synapseModule = await import('@filoz/synapse-sdk');
      Synapse = synapseModule.Synapse;
      RPC_URLS = synapseModule.RPC_URLS;
      CONTRACT_ADDRESSES = synapseModule.CONTRACT_ADDRESSES;
      TOKENS = synapseModule.TOKENS;
      
      const pandoraModule = await import('@filoz/synapse-sdk/pandora');
      PandoraService = pandoraModule.PandoraService;
      
      console.log('✅ Synapse SDK modules loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load Synapse SDK:', error);
      throw new Error('Synapse SDK initialization failed');
    }
  }
  return { Synapse, RPC_URLS, CONTRACT_ADDRESSES, PandoraService, TOKENS };
}

// Environment configuration with validation
const FILECOIN_PRIVATE_KEY = process.env.FILECOIN_PRIVATE_KEY;
const FILECOIN_ADDRESS = process.env.FILECOIN_ADDRESS;
const FILECOIN_RPC_URL = process.env.FILECOIN_RPC_URL || 'https://api.calibration.node.glif.io/rpc/v1';
const FILECOIN_NETWORK = 'calibration';
const PINATA_JWT = process.env.PINATA_JWT;

// Validate required environment variables
if (!FILECOIN_PRIVATE_KEY) {
  throw new Error('FILECOIN_PRIVATE_KEY environment variable is required');
}
if (!FILECOIN_ADDRESS) {
  throw new Error('FILECOIN_ADDRESS environment variable is required');
}

// RTA storage: Use DynamoDB for persistence instead of in-memory storage
// This Map is used for session-level caching of storage services only
const sessionStorageServices = new Map(); // rtaId -> StorageService

// Global Synapse instance (singleton pattern)
let globalSynapseInstance = null;
let paymentsInitialized = false;

/**
 * Initialize Synapse instance with wallet and setup payments
 */
async function createSynapseInstance() {
  if (globalSynapseInstance && paymentsInitialized) {
    return globalSynapseInstance;
  }
  
  const { Synapse, TOKENS } = await initializeSynapseSDK();
  
  try {
    console.log('🚀 Initializing Synapse SDK for Calibration network...');
    
    // Create Synapse instance
    globalSynapseInstance = await Synapse.create({
      privateKey: FILECOIN_PRIVATE_KEY,
      rpcURL: FILECOIN_RPC_URL,
    withCDN: true // Enable CDN for VibesFlow
  });
  
    console.log(`✅ Synapse instance created for wallet: ${FILECOIN_ADDRESS}`);
    
    // Setup payments if not already done
    if (!paymentsInitialized) {
      await setupPayments(globalSynapseInstance);
      paymentsInitialized = true;
    }
    
    return globalSynapseInstance;
    
  } catch (error) {
    console.error('❌ Failed to create Synapse instance:', error);
    throw error;
  }
}

/**
 * Setup payments: deposit USDFC and approve Pandora service
 */
async function setupPayments(synapse) {
  try {
    console.log('💳 Setting up payments and service approvals...');
    
    const { TOKENS, CONTRACT_ADDRESSES } = await initializeSynapseSDK();
    
    // Check current balances
    const filBalance = await synapse.payments.walletBalance(); // FIL balance
    const usdfcBalance = await synapse.payments.walletBalance(TOKENS.USDFC); // USDFC balance
    const contractBalance = await synapse.payments.balance(TOKENS.USDFC); // Contract balance
    
    console.log('📊 Current Balances:', {
      FIL: ethers.formatEther(filBalance),
      USDFC_Wallet: ethers.formatEther(usdfcBalance),
      USDFC_Contract: ethers.formatEther(contractBalance)
    });
    
    // Get Pandora contract address for the network
    const network = synapse.getNetwork();
    const pandoraAddress = CONTRACT_ADDRESSES.PANDORA_SERVICE[network];
    
    console.log(`🏛️ Using Pandora contract: ${pandoraAddress}`);
    
    // Check service approval status
    const serviceApproval = await synapse.payments.serviceApproval(pandoraAddress, TOKENS.USDFC);
    console.log('🔍 Service Approval Status:', {
      isApproved: serviceApproval.isApproved,
      rateAllowance: ethers.formatEther(serviceApproval.rateAllowance),
      lockupAllowance: ethers.formatEther(serviceApproval.lockupAllowance)
    });
    
    // Minimum required amounts (from fs-upload-dapp patterns)
    const minDeposit = ethers.parseEther('50'); // 50 USDFC minimum
    const rateAllowance = ethers.parseEther('10'); // 10 USDFC per epoch
    const lockupAllowance = ethers.parseEther('1000'); // 1000 USDFC lockup
    
    // Deposit USDFC if contract balance is low
    if (contractBalance < minDeposit) {
      const depositAmount = minDeposit - contractBalance;
      console.log(`💰 Depositing ${ethers.formatEther(depositAmount)} USDFC...`);
      
      const depositTx = await synapse.payments.deposit(depositAmount, TOKENS.USDFC);
      console.log(`📝 Deposit transaction: ${depositTx.hash}`);
      await depositTx.wait();
      console.log('✅ Deposit confirmed');
    }
    
    // Approve Pandora service if not already approved with sufficient allowances
    if (!serviceApproval.isApproved || 
        serviceApproval.rateAllowance < rateAllowance || 
        serviceApproval.lockupAllowance < lockupAllowance) {
      
      console.log('🔑 Approving Pandora service...');
      
      const approveTx = await synapse.payments.approveService(
        pandoraAddress,
        rateAllowance,
        lockupAllowance,
        TOKENS.USDFC
      );
      
      console.log(`📝 Service approval transaction: ${approveTx.hash}`);
      await approveTx.wait();
      console.log('✅ Pandora service approved');
    }
    
    console.log('✅ Payment setup completed successfully');
    
  } catch (error) {
    console.error('❌ Payment setup failed:', error);
    throw error;
  }
}

/**
 * Create or get storage service for RTA
 */
async function getStorageServiceForRTA(rtaId, synapse, creator = null) {
  try {
    // Check session cache first
    if (sessionStorageServices.has(rtaId)) {
      console.log(`♻️ Reusing cached storage service for RTA: ${rtaId}`);
      return sessionStorageServices.get(rtaId);
    }
    
    // Check if we have existing RTA metadata in DynamoDB
    const existingRTA = await persistenceService.getRTAMetadata(rtaId);
    
    console.log(`🔧 Creating new storage service for RTA: ${rtaId}...`);
    
    // Create storage service with CDN enabled
    const storageService = await synapse.createStorage({
      withCDN: true,
      callbacks: {
        onProviderSelected: (provider) => {
          console.log(`✅ Provider selected for ${rtaId}:`, {
            address: provider.owner,
            pdpUrl: provider.pdpUrl
          });
        },
        onProofSetResolved: (info) => {
          const status = info.isExisting ? 'existing' : 'new';
          console.log(`📋 Proof set ${status} for ${rtaId}: ID ${info.proofSetId}`);
        },
        onProofSetCreationStarted: (transaction, statusUrl) => {
          console.log(`🚀 Proof set creation started for ${rtaId}: ${transaction.hash}`);
        },
        onProofSetCreationProgress: (status) => {
          const elapsed = Math.round(status.elapsedMs / 1000);
          console.log(`⏳ Proof set creation progress [${elapsed}s]: mined=${status.transactionMined}, live=${status.proofSetLive}`);
        }
      }
    });
    
    console.log(`✅ Storage service created for RTA: ${rtaId}`, {
      proofSetId: storageService.proofSetId,
      provider: storageService.storageProvider
    });
    
    // Cache the service for this session
    sessionStorageServices.set(rtaId, storageService);
    
    // Initialize or update RTA metadata in DynamoDB if this is a new RTA
    if (!existingRTA) {
      const initialMetadata = {
        rta_id: rtaId,
        upload_timestamp: Date.now(),
        creator: creator || 'unknown',
        is_complete: false,
        proof_set_id: storageService.proofSetId,
        storage_provider: storageService.storageProvider,
        chunks: [],
        chunks_detail: [],
        total_duration: 0,
        total_size_mb: 0
      };
      
      await persistenceService.saveRTAMetadata(initialMetadata);
    }
    
    return storageService;
    
  } catch (error) {
    console.error(`❌ Failed to create storage service for RTA ${rtaId}:`, error);
    throw error;
  }
}

/**
 * Upload chunk to Filecoin via Synapse SDK
 */
async function uploadChunkToFilecoin(chunkData, rtaId, chunkId, metadata) {
  console.log(`🚀 Starting Synapse upload for chunk ${chunkId} (${(chunkData.length / 1024).toFixed(1)}KB)`);
  
  try {
    // Initialize Synapse instance
    const synapse = await createSynapseInstance();
    
    // Log detailed wallet and service status for frontend
    console.log('💰 Checking wallet balances and Pandora service status...');
    const { TOKENS } = await initializeSynapseSDK();
    
    // Get current balances for logging
    const filBalance = await synapse.payments.walletBalance(); // FIL balance
    const usdfcBalance = await synapse.payments.walletBalance(TOKENS.USDFC); // USDFC balance
    const contractBalance = await synapse.payments.balance(TOKENS.USDFC); // Contract balance
    
    const walletStatus = {
      FIL: ethers.formatEther(filBalance),
      USDFC_Wallet: ethers.formatEther(usdfcBalance),
      USDFC_Contract: ethers.formatEther(contractBalance),
      sufficientFunds: contractBalance > ethers.parseEther('10') // Basic check
    };
    
    console.log('📊 Current Balances:', walletStatus);
    
    // Check Pandora service approval
    const network = synapse.getNetwork();
    const { CONTRACT_ADDRESSES } = await initializeSynapseSDK();
    const pandoraAddress = CONTRACT_ADDRESSES.PANDORA_SERVICE[network];
    const serviceApproval = await synapse.payments.serviceApproval(pandoraAddress, TOKENS.USDFC);
    
    const pandoraStatus = {
      address: pandoraAddress,
      isApproved: serviceApproval.isApproved,
      rateAllowance: ethers.formatEther(serviceApproval.rateAllowance),
      lockupAllowance: ethers.formatEther(serviceApproval.lockupAllowance)
    };
    
    console.log('🏛️ Pandora Service Status:', pandoraStatus);
    
    // Get or create storage service for this RTA
    const storageService = await getStorageServiceForRTA(rtaId, synapse, metadata.creator);
    
    const proofSetDetails = {
      proofSetId: storageService.proofSetId,
      provider: storageService.storageProvider,
      status: 'active'
    };
    
    console.log(`📋 Proof Set Details:`, proofSetDetails);
    
    // Run preflight check
    console.log(`🔍 Running preflight check for chunk ${chunkId}...`);
    const preflight = await storageService.preflightUpload(chunkData.length);
    
    if (!preflight.allowanceCheck.sufficient) {
      throw new Error(`Insufficient allowance for upload: ${preflight.allowanceCheck.message}`);
    }
    
    console.log(`💰 Estimated cost: ${ethers.formatEther(preflight.estimatedCost.perMonth)} USDFC/month`);
    
    // Upload chunk to Filecoin with proper callback handling
    console.log(`📤 Uploading chunk ${chunkId} to Filecoin...`);
    
    let finalRootId = null;
    let uploadComplete = false;
    let rootAdded = false;
    let rootConfirmed = false;
    
    const uploadResult = await storageService.upload(chunkData, {
      onUploadComplete: (commp) => {
        console.log(`✅ Upload complete for ${chunkId}: ${commp.toString()}`);
        uploadComplete = true;
      },
      onRootAdded: (transaction) => {
        if (transaction) {
          console.log(`📝 Root added transaction for ${chunkId}: ${transaction.hash}`);
        } else {
          console.log(`📝 Root added for ${chunkId} (legacy server)`);
        }
        rootAdded = true;
      },
      onRootConfirmed: (rootIds) => {
        console.log(`🎯 Root confirmed for ${chunkId}: IDs ${rootIds.join(', ')}`);
        if (rootIds && rootIds.length > 0) {
          finalRootId = rootIds[0]; // Store the confirmed root ID
          rootConfirmed = true;
        }
      }
    });
    
    // Wait a moment for all callbacks to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Use the confirmed root ID if available, otherwise fall back to upload result
    const effectiveRootId = finalRootId || uploadResult.rootId;
    
    console.log(`🔄 Upload callbacks status: complete=${uploadComplete}, added=${rootAdded}, confirmed=${rootConfirmed}, rootId=${effectiveRootId}`);
    
    // Create chunk info for metadata with proper root ID
    const chunkInfo = {
      chunk_id: chunkId,
      cid: uploadResult.commp.toString(),
      size: uploadResult.size,
      root_id: effectiveRootId,
      uploadedAt: Date.now(),
      duration: metadata.duration || 60,
      participants: metadata.participantCount || 1,
      creator: metadata.creator,
      owner: metadata.creator + '.testnet',
      filcdn_url: `https://${FILECOIN_ADDRESS}.calibration.filcdn.io/${uploadResult.commp.toString()}`,
      synapse_confirmed: rootConfirmed, // Track if this was confirmed via Synapse
      upload_complete: uploadComplete,
      root_added: rootAdded
    };
    
    // Add chunk to RTA in DynamoDB
    await persistenceService.addChunkToRTA(rtaId, chunkInfo);
    
    // Special handling for final chunk - compile metadata only after ALL chunks are confirmed
    if (metadata.isFinal) {
      console.log(`🏁 Final chunk detected for RTA: ${rtaId}, compiling metadata...`);
      
      // Wait for other chunks to potentially complete their root confirmations
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get updated RTA data to check all chunks
      const updatedRTAData = await persistenceService.getRTAMetadata(rtaId);
      const allChunks = updatedRTAData.chunks_detail || [];
      
      console.log(`📊 RTA ${rtaId} final status: ${allChunks.length} chunks total`);
      
      // Check if all chunks have valid CIDs and are properly uploaded
      const validChunks = allChunks.filter(chunk => chunk.cid && chunk.cid.length > 0);
      const allCIDsValid = validChunks.length === allChunks.length && allChunks.length > 0;
      
      if (allCIDsValid) {
        try {
          console.log(`✅ All chunks valid, compiling final metadata for RTA: ${rtaId}`);
          const finalMetadata = await compileRTAMetadata(rtaId, storageService);
          await persistenceService.completeRTA(rtaId, finalMetadata);
          console.log(`🎉 RTA ${rtaId} completed successfully with ${allChunks.length} chunks`);
        } catch (metadataError) {
          console.error(`❌ Failed to compile metadata for RTA ${rtaId}:`, metadataError);
          // Don't fail the upload just because metadata compilation failed
        }
      } else {
        console.warn(`⚠️ Not all chunks valid for RTA ${rtaId}: ${validChunks.length}/${allChunks.length} have valid CIDs`);
      }
    } else {
      // FALLBACK: Schedule auto-completion check for non-final chunks after 6 minutes
      setTimeout(async () => {
        try {
          const rtaData = await persistenceService.getRTAMetadata(rtaId);
          if (rtaData && !rtaData.is_complete) {
            const chunks = rtaData.chunks_detail || [];
            const validChunks = chunks.filter(chunk => chunk.cid && chunk.cid.length > 0);
            
            // If RTA has chunks but isn't complete, auto-complete it
            if (validChunks.length > 0) {
              console.log(`🔄 Auto-completion fallback triggered for RTA: ${rtaId} (${validChunks.length} chunks)`);
              const { forceCompleteRTA } = require('./helper');
              await forceCompleteRTA(rtaId);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Auto-completion fallback failed for ${rtaId}:`, error.message);
        }
      }, 360000); // 6 minutes delay
    }
    
    console.log(`✅ Chunk ${chunkId} uploaded successfully to Filecoin`, {
      cid: uploadResult.commp.toString(),
      size: uploadResult.size,
      rootId: effectiveRootId,
      confirmed: rootConfirmed
    });
    
    return {
      success: true,
      cid: uploadResult.commp.toString(),
      size: uploadResult.size,
      rootId: effectiveRootId,
      chunkId: chunkId,
      rtaId: rtaId,
      provider: 'synapse-filecoin',
      confirmed: rootConfirmed,
      // Additional status for frontend logging
      uploadId: `${rtaId}_${chunkId}`,
      queuePosition: 1,
      estimatedProcessTime: '5-15 minutes',
      walletStatus: walletStatus,
      pandoraStatus: pandoraStatus,
      proofSetId: proofSetDetails.proofSetId,
      proofSetStatus: proofSetDetails.status,
      storageProvider: proofSetDetails.provider
    };
    
  } catch (error) {
    console.error(`❌ Synapse upload failed for chunk ${chunkId}:`, error.message);
    
    // Fallback to Pinata only if Synapse fails
    console.log(`🔄 Falling back to Pinata for chunk ${chunkId}...`);
    return await uploadToPinataFallback(chunkData, chunkId, metadata);
  }
}

/**
 * Fallback: Upload to Pinata (only used when Synapse fails)
 */
async function uploadToPinataFallback(chunkData, chunkId, metadata) {
  try {
    console.log(`📌 FALLBACK: Uploading chunk ${chunkId} to Pinata...`);
    
    if (!PINATA_JWT) {
      throw new Error('Pinata JWT not configured for fallback');
    }
    
    const formData = new FormData();
    formData.append('file', Buffer.from(chunkData), {
      filename: `${chunkId}.webm`,
      contentType: 'audio/webm'
    });
    
    const pinataMetadata = {
      name: `VibesFlow-Chunk-${chunkId}`,
      keyvalues: {
        rtaId: metadata.rtaId || 'unknown',
        chunkId: chunkId,
        type: 'audio-chunk',
        creator: metadata.creator || 'unknown',
        isFinal: metadata.isFinal ? 'true' : 'false'
      }
    };
    
    formData.append('pinataMetadata', JSON.stringify(pinataMetadata));
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
      throw new Error(`Pinata fallback failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log(`✅ FALLBACK: Chunk ${chunkId} uploaded to Pinata: ${result.IpfsHash}`);
    
    // Create chunk info for Pinata fallback
    const chunkInfo = {
      chunk_id: chunkId,
      cid: result.IpfsHash,
      size: chunkData.length,
      uploadedAt: Date.now(),
      duration: metadata.duration || 60,
      participants: metadata.participantCount || 1,
      creator: metadata.creator,
      owner: metadata.creator + '.testnet',
      pinata_fallback: true,
      filcdn_url: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`
    };
    
    // Add chunk to RTA in DynamoDB
    await persistenceService.addChunkToRTA(metadata.rtaId || chunkId.split('_')[0] + '_' + chunkId.split('_')[1], chunkInfo);
    
    return {
      success: true,
      cid: result.IpfsHash,
      size: chunkData.length,
      chunkId: chunkId,
      provider: 'pinata-fallback'
    };
    
  } catch (error) {
    console.error(`❌ Pinata fallback failed for chunk ${chunkId}:`, error);
    throw error;
  }
}

/**
 * Compile final RTA metadata for FilCDN retrieval
 */
async function compileRTAMetadata(rtaId, storageService = null) {
  try {
    console.log(`📋 Compiling metadata for RTA: ${rtaId}...`);
    
    // Get RTA data from DynamoDB
    const rtaData = await persistenceService.getRTAMetadata(rtaId);
    if (!rtaData) {
      console.error(`❌ No RTA data found for: ${rtaId}`);
      return null;
    }
  
  // Sort chunks by sequence
    const sortedChunks = (rtaData.chunks_detail || []).sort((a, b) => {
    const seqA = parseInt(a.chunk_id.split('_chunk_')[1]?.split('_')[0]) || 0;
    const seqB = parseInt(b.chunk_id.split('_chunk_')[1]?.split('_')[0]) || 0;
    return seqA - seqB;
  });
  
  // Calculate total duration
    const totalDuration = sortedChunks.reduce((sum, chunk) => sum + (chunk.duration || 60), 0);
  const formattedDuration = formatDuration(totalDuration);
  
    // Create FilCDN-compatible metadata structure
  const metadata = {
    rta_id: rtaId,
      creator: rtaData.creator,
    rta_duration: formattedDuration,
      chunks: sortedChunks.length,
    is_complete: true,
      
      // FilCDN integration
      filcdn_base: `https://${FILECOIN_ADDRESS}.calibration.filcdn.io/`,
      filcdn_wallet: FILECOIN_ADDRESS,
      network: 'calibration',
      
      // Synapse integration details
      proof_set_id: rtaData.proof_set_id,
      storage_provider: rtaData.storage_provider,
      
      // URLs for first and last chunks
      first_chunk_url: sortedChunks.length > 0 ? 
        `https://${FILECOIN_ADDRESS}.calibration.filcdn.io/${sortedChunks[0].cid}` : null,
      last_chunk_url: sortedChunks.length > 0 ? 
        `https://${FILECOIN_ADDRESS}.calibration.filcdn.io/${sortedChunks[sortedChunks.length - 1].cid}` : null,
      
      // Metadata
      upload_timestamp: rtaData.upload_timestamp,
      compilation_timestamp: Date.now(),
      total_size_mb: sortedChunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0) / (1024 * 1024),
      
      // Detailed chunk information for playback
      chunks_detail: sortedChunks.map(chunk => ({
      chunk_id: chunk.chunk_id,
      cid: chunk.cid,
      size: chunk.size,
        root_id: chunk.root_id,
        duration: chunk.duration || 60,
        participants: chunk.participants || 1,
        owner: chunk.owner,
        filcdn_url: chunk.filcdn_url,
        sequence: parseInt(chunk.chunk_id.split('_chunk_')[1]?.split('_')[0]) || 0
    }))
  };
  
    console.log(`📊 Metadata compiled:`, {
      chunks: metadata.chunks,
      duration: metadata.rta_duration,
      totalSizeMB: metadata.total_size_mb.toFixed(2),
      proofSetId: metadata.proof_set_id
    });
    
    // Upload metadata to Filecoin via Synapse (preferred) or Pinata (fallback)
    let metadataCid;
    try {
      // Try uploading metadata to Filecoin first
      if (storageService) {
        console.log(`📤 Uploading metadata to Filecoin for RTA: ${rtaId}...`);
        
  const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');
        const metadataResult = await storageService.upload(metadataBuffer);
        
        metadataCid = metadataResult.commp.toString();
        console.log(`✅ Metadata uploaded to Filecoin: ${metadataCid}`);
      } else {
        throw new Error('No Synapse service available for metadata upload');
      }
    } catch (error) {
      console.warn(`⚠️ Filecoin metadata upload failed, using Pinata fallback:`, error.message);
      
      // Fallback to Pinata for metadata
      const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');
      const result = await uploadToPinataFallback(metadataBuffer, `${rtaId}_metadata`, { 
        creator: rtaData.creator, 
        rtaId: rtaId, 
        isFinal: true 
      });
      metadataCid = result.cid;
    }
    
    // Add metadata CID to the compiled metadata
    metadata.metadata_cid = metadataCid;
    
    console.log(`✅ RTA metadata compiled and uploaded: ${metadataCid}`);
    return metadata;
    
  } catch (error) {
    console.error(`❌ Failed to compile RTA metadata for ${rtaId}:`, error);
    throw error;
  }
}

/**
 * Format duration in MM:SS format
 */
function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Queue chunk for Filecoin upload (main entry point)
 */
async function queueChunkForFilecoin(rtaId, chunkId, chunkData, metadata) {
  // Direct upload using Synapse SDK with Pinata fallback and DynamoDB persistence
  return await uploadChunkToFilecoin(chunkData, rtaId, chunkId, metadata);
}

/**
 * Get upload status from DynamoDB
 */
async function getFilecoinUploadStatus(rtaId) {
  try {
    const rtaData = await persistenceService.getRTAMetadata(rtaId);
  if (!rtaData) {
    return { error: 'RTA not found' };
  }
    
    const chunks = rtaData.chunks_detail || [];
    const uploadedChunks = chunks.filter(chunk => chunk.cid);
    const failedChunks = chunks.filter(chunk => !chunk.cid);
  
  return {
    rtaId: rtaId,
      status: rtaData.is_complete ? 'completed' : 'processing',
      totalChunks: chunks.length,
      uploadedChunks: uploadedChunks.length,
      failedChunks: failedChunks.length,
      proofSetId: rtaData.proof_set_id,
      storageProvider: rtaData.storage_provider,
      chunks: chunks.reduce((acc, chunk) => {
      acc[chunk.chunk_id] = {
          status: chunk.cid ? 'uploaded' : 'failed',
          filecoinCid: chunk.cid || null,
          rootId: chunk.root_id || null,
          filcdnUrl: chunk.filcdn_url || null,
          usedFallback: chunk.pinata_fallback || false
      };
      return acc;
    }, {})
  };
  } catch (error) {
    console.error(`❌ Failed to get upload status for ${rtaId}:`, error);
    return { error: error.message };
  }
}

/**
 * Get all vibestreams for FilCDN (from DynamoDB)
 */
async function getVibestreams() {
  try {
    return await persistenceService.getAllVibestreams();
  } catch (error) {
    console.error('❌ Failed to get vibestreams from DynamoDB:', error);
    return [];
  }
}

/**
 * Test Synapse connection and setup
 */
async function testSynapseConnection() {
  try {
    console.log('🧪 Testing Synapse SDK connection...');
    
    const synapse = await createSynapseInstance();
    const network = synapse.getNetwork();
    
    // Test balances
    const filBalance = await synapse.payments.walletBalance();
    const usdfcBalance = await synapse.payments.walletBalance(TOKENS.USDFC);
    const contractBalance = await synapse.payments.balance(TOKENS.USDFC);
    
    console.log('✅ Synapse SDK connection test successful');
    
    return {
      success: true,
      network: network,
      signerAddress: FILECOIN_ADDRESS,
      balances: {
        FIL: ethers.formatEther(filBalance),
        USDFC_Wallet: ethers.formatEther(usdfcBalance),
        USDFC_Contract: ethers.formatEther(contractBalance)
      }
    };
    
  } catch (error) {
    console.error('❌ Synapse SDK connection test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createSynapseInstance,
  setupPayments,
  uploadChunkToFilecoin,
  queueChunkForFilecoin,
  getFilecoinUploadStatus,
  getVibestreams,
  testSynapseConnection,
  compileRTAMetadata,
  getStorageServiceForRTA
}; 