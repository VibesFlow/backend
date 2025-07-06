/**
 * SYNAPSE SDK - Filecoin Storage for VibesFlow
 * 
 * Clean implementation following fs-upload-dapp pattern:
 * 1. Progressive chunk upload by RTA ID
 * 2. Proper metadata compilation for FilCDN retrieval
 * 3. Real Synapse SDK integration (no mocks)
 */

require('dotenv').config();
const { ethers } = require('ethers');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Synapse SDK dynamic imports
let Synapse, RPC_URLS, CONTRACT_ADDRESSES, PandoraService;

async function initializeSynapseSDK() {
  if (!Synapse) {
    const synapseModule = await import('@filoz/synapse-sdk');
    const pandoraModule = await import('@filoz/synapse-sdk/pandora');
    Synapse = synapseModule.Synapse;
    RPC_URLS = synapseModule.RPC_URLS;
    CONTRACT_ADDRESSES = synapseModule.CONTRACT_ADDRESSES;
    PandoraService = pandoraModule.PandoraService;
  }
  return { Synapse, RPC_URLS, CONTRACT_ADDRESSES, PandoraService };
}

// Environment configuration
const FILECOIN_PRIVATE_KEY = process.env.FILECOIN_PRIVATE_KEY;
const FILECOIN_NETWORK = 'calibration';
const PINATA_JWT = process.env.PINATA_JWT;

// RTA storage: chunks grouped by RTA ID
const rtaStorage = new Map(); // rtaId -> { chunks: [], metadata: {} }

/**
 * Initialize Synapse instance with wallet
 */
async function createSynapseInstance() {
  const { Synapse, RPC_URLS } = await initializeSynapseSDK();
  
  if (!FILECOIN_PRIVATE_KEY) {
    throw new Error('FILECOIN_PRIVATE_KEY environment variable required');
  }
  
  // Create provider and signer
  const provider = new ethers.JsonRpcProvider('https://api.calibration.node.glif.io/rpc/v1');
  const signer = new ethers.Wallet(FILECOIN_PRIVATE_KEY, provider);
  
  // Create Synapse instance with only signer (not both signer and provider)
  const synapse = await Synapse.create({
    signer: signer,
    withCDN: true // Enable CDN for VibesFlow
  });
  
  return synapse;
}

/**
 * Perform preflight check and setup payments if needed
 */
async function ensurePaymentSetup(synapse, fileSize) {
  const { CONTRACT_ADDRESSES, PandoraService } = await initializeSynapseSDK();
  
  const signer = synapse.getSigner();
  const pandoraService = new PandoraService(
    signer.provider,
    CONTRACT_ADDRESSES.PANDORA_SERVICE[FILECOIN_NETWORK]
  );
  
  // Check allowance for file size
  const preflight = await pandoraService.checkAllowanceForStorage(
    fileSize,
    true, // withCDN
    synapse.payments
  );
  
  if (!preflight.sufficient) {
    // Deposit and approve if needed
    await synapse.payments.deposit(preflight.lockupAllowanceNeeded);
    await synapse.payments.approveService(
      CONTRACT_ADDRESSES.PANDORA_SERVICE[FILECOIN_NETWORK],
      preflight.rateAllowanceNeeded,
      preflight.lockupAllowanceNeeded
    );
  }
  
  return preflight;
}

/**
 * Upload chunk to Filecoin via Synapse SDK
 */
async function uploadChunkToFilecoin(chunkData, rtaId, chunkId, metadata) {
  try {
    console.log(`🚀 Uploading chunk ${chunkId} to Filecoin (${(chunkData.length / 1024).toFixed(1)}KB)`);
    
    // Initialize Synapse
    const synapse = await createSynapseInstance();
    
    // Setup payments if needed
    await ensurePaymentSetup(synapse, chunkData.length);
    
    // Create storage service
    const storageService = await synapse.createStorage({
      withCDN: true,
      callbacks: {
        onProviderSelected: (provider) => {
          console.log(`Selected provider: ${provider.owner}`);
        },
        onProofSetResolved: (proofSet) => {
          console.log(`Using proof set: ${proofSet.pdpVerifierProofSetId}`);
        }
      }
    });
    
    // Upload chunk
    const result = await storageService.upload(chunkData, {
      onUploadComplete: (commp) => {
        console.log(`Upload complete: ${commp.toString()}`);
      },
      onRootConfirmed: (rootIds) => {
        console.log(`Root confirmed: ${rootIds.join(', ')}`);
      }
    });
    
    // Store chunk data
    const chunkInfo = {
      chunk_id: chunkId,
      cid: result.commp.toString(),
      size: chunkData.length,
      uploadedAt: Date.now(),
      duration: metadata.duration || 60,
      participants: metadata.participantCount || 1,
      owner: metadata.creator + '.testnet'
    };
    
    // Add to RTA storage
    if (!rtaStorage.has(rtaId)) {
      rtaStorage.set(rtaId, {
        chunks: [],
        metadata: {
          rta_id: rtaId,
          creator: metadata.creator,
          upload_timestamp: Date.now(),
          is_complete: false
        }
      });
    }
    
    const rtaData = rtaStorage.get(rtaId);
    rtaData.chunks.push(chunkInfo);
    
    // If final chunk, compile metadata
    if (metadata.isFinal) {
      await compileRTAMetadata(rtaId);
    }
    
    console.log(`✅ Chunk ${chunkId} uploaded successfully: ${result.commp.toString()}`);
    
    return {
      success: true,
      cid: result.commp.toString(),
      chunkId: chunkId,
      rtaId: rtaId
    };
    
  } catch (error) {
    console.error(`❌ Failed to upload chunk ${chunkId}:`, error.message);
    throw error;
  }
}

/**
 * Compile final RTA metadata for FilCDN retrieval
 */
async function compileRTAMetadata(rtaId) {
  const rtaData = rtaStorage.get(rtaId);
  if (!rtaData) return;
  
  // Sort chunks by sequence
  rtaData.chunks.sort((a, b) => {
    const seqA = parseInt(a.chunk_id.split('_chunk_')[1]?.split('_')[0]) || 0;
    const seqB = parseInt(b.chunk_id.split('_chunk_')[1]?.split('_')[0]) || 0;
    return seqA - seqB;
  });
  
  // Calculate total duration
  const totalDuration = rtaData.chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
  const formattedDuration = formatDuration(totalDuration);
  
  // Create metadata structure for FilCDN
  const metadata = {
    rta_id: rtaId,
    creator: rtaData.metadata.creator,
    rta_duration: formattedDuration,
    chunks: rtaData.chunks.length,
    is_complete: true,
    filcdn_base: `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/`,
    first_chunk_url: rtaData.chunks.length > 0 ? `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/${rtaData.chunks[0].cid}` : null,
    last_chunk_url: rtaData.chunks.length > 0 ? `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/${rtaData.chunks[rtaData.chunks.length - 1].cid}` : null,
    upload_timestamp: rtaData.metadata.upload_timestamp,
    synapse_proof_set_id: 1, // Will be updated with real proof set ID
    total_size_mb: rtaData.chunks.reduce((sum, chunk) => sum + chunk.size, 0) / (1024 * 1024),
    chunks_detail: rtaData.chunks.map(chunk => ({
      chunk_id: chunk.chunk_id,
      cid: chunk.cid,
      size: chunk.size,
      url: `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/${chunk.cid}`,
      duration: chunk.duration,
      participants: chunk.participants,
      owner: chunk.owner
    }))
  };
  
  // Upload metadata to Pinata
  const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8');
  const metadataCid = await uploadToPinata(
    `${rtaId}.json`,
    metadataBuffer,
    {
      name: `VibesFlow-RTA-${rtaId}`,
      keyvalues: {
        rtaId: rtaId,
        type: 'rta-metadata',
        creator: rtaData.metadata.creator,
        chunks: rtaData.chunks.length.toString()
      }
    }
  );
  
  rtaData.metadata.compiledCid = metadataCid;
  rtaData.metadata.is_complete = true;
  
  console.log(`✅ RTA metadata compiled: ${metadataCid}`);
  return metadataCid;
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
 * Upload to Pinata
 */
async function uploadToPinata(filename, buffer, metadata) {
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
 * Queue chunk for Filecoin upload
 */
async function queueChunkForFilecoin(rtaId, chunkId, chunkData, metadata) {
  // Direct upload - no complex queuing needed
  return await uploadChunkToFilecoin(chunkData, rtaId, chunkId, metadata);
}

/**
 * Get upload status
 */
function getFilecoinUploadStatus(rtaId) {
  const rtaData = rtaStorage.get(rtaId);
  if (!rtaData) {
    return { error: 'RTA not found' };
  }
  
  return {
    rtaId: rtaId,
    status: rtaData.metadata.is_complete ? 'completed' : 'processing',
    totalChunks: rtaData.chunks.length,
    uploadedChunks: rtaData.chunks.length,
    failedChunks: 0,
    chunks: rtaData.chunks.reduce((acc, chunk) => {
      acc[chunk.chunk_id] = {
        status: 'uploaded',
        filecoinCid: chunk.cid,
        pdpReceipt: null // Will be populated when available
      };
      return acc;
    }, {})
  };
}

/**
 * Get all vibestreams for FilCDN
 */
async function getRealVibestreams() {
  const vibestreams = [];
  
  for (const [rtaId, rtaData] of rtaStorage.entries()) {
    if (rtaData.metadata.is_complete && rtaData.chunks.length > 0) {
      const totalDuration = rtaData.chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
      
      const vibestream = {
        rta_id: rtaId,
        creator: rtaData.metadata.creator,
        rta_duration: formatDuration(totalDuration),
        chunks: rtaData.chunks.length,
        is_complete: true,
        filcdn_base: `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/`,
        first_chunk_url: `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/${rtaData.chunks[0].cid}`,
        last_chunk_url: `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/${rtaData.chunks[rtaData.chunks.length - 1].cid}`,
        upload_timestamp: rtaData.metadata.upload_timestamp,
        synapse_proof_set_id: 1,
        total_size_mb: rtaData.chunks.reduce((sum, chunk) => sum + chunk.size, 0) / (1024 * 1024),
        chunks_detail: rtaData.chunks.map(chunk => ({
          chunk_id: chunk.chunk_id,
          cid: chunk.cid,
          size: chunk.size,
          url: `https://${process.env.FILECOIN_ADDRESS}.calibration.filcdn.io/${chunk.cid}`
        }))
      };
      
      vibestreams.push(vibestream);
    }
  }
  
  return vibestreams;
}

/**
 * API endpoint for vibestreams
 */
async function getVibestreamsAPI() {
  try {
    const vibestreams = await getRealVibestreams();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: JSON.stringify(vibestreams)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to load vibestreams',
        message: error.message
      })
    };
  }
}

/**
 * Test Synapse connection
 */
async function testSynapseConnection() {
  try {
    const synapse = await createSynapseInstance();
    const signer = synapse.getSigner();
    const address = await signer.getAddress();
    
    return {
      success: true,
      network: FILECOIN_NETWORK,
      signerAddress: address
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createSynapseInstance,
  ensurePaymentSetup,
  uploadChunkToFilecoin,
  queueChunkForFilecoin,
  getFilecoinUploadStatus,
  getRealVibestreams,
  getVibestreamsAPI,
  testSynapseConnection,
  compileRTAMetadata
}; 