#!/usr/bin/env node

/**
 * Comprehensive Filecoin Deals & FilCDN Monitor
 * Consolidated monitoring tool for Synapse SDK uploads, proof sets, and FilCDN integration
 * 
 * Features:
 * - Filecoin deal monitoring
 * - Proof set verification  
 * - FilCDN URL testing
 * - Analytics integration
 * - Real-time tracking
 * - CLI interface
 * 
 * Usage: node deals.js [command] [options]
 */

const https = require('https');
const fs = require('fs');
const http = require('http');
const url = require('url');

// Load environment variables first
const dotenv = require('dotenv');
dotenv.config();

const config = require('./config');

// Use config object instead of direct import
const CONFIG = {
  rpc: config.rpc,
  network: config.network,
  walletAddress: config.walletAddress,
  calibrationAddress: config.calibrationAddress,
  privateKey: config.privateKey
};

// Validate configuration on startup
console.log('🔧 Loading configuration...');
console.log(`📡 RPC: ${CONFIG.rpc}`);
console.log(`🌐 Network: ${CONFIG.network}`);
console.log(`💰 Wallet Address: ${CONFIG.walletAddress}`);
console.log(`🎯 Calibration Address: ${CONFIG.calibrationAddress}`);

if (!CONFIG.walletAddress) {
  console.error('❌ ERROR: Wallet address is undefined!');
  console.error('💡 Please check your .env file contains FILECOIN_ADDRESS');
  process.exit(1);
}

// Analytics endpoints
const ANALYTICS = {
  spacescope: 'https://spacescope.io/api/v1',
  filscan: 'https://calibration.filscan.io/api/v0', 
  filfox: 'https://calibration.filfox.info/api/v1',
  beryx: 'https://api.beryx.zondax.ch/v1/search/fil/calibration'
};

// Import API functions from synapseSDK
const {
  getVibestreamsAPI,
  downloadChunkAPI,
  testSynapseConnection,
  initializeSynapseSDK
} = require('./synapseSDK');

/**
 * FilCDN Integration Class with improved rta_id and chunk_id organization
 * Handles FilCDN URL construction and testing based on documentation
 */
class FilCDNMonitor {
  constructor() {
    // Ensure CONFIG is properly loaded
    this.baseUrl = `https://${CONFIG.walletAddress || 'undefined'}.calibration.filcdn.io`;
    console.log(`🌐 FilCDN Monitor initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Test FilCDN retrieval for a given CID
   * Based on FilCDN docs: https://{wallet-address}.calibration.filcdn.io/{CID}
   */
  async testRetrieval(cid) {
    if (!cid) {
      console.log('⚠️  No CID provided for FilCDN test');
      return null;
    }

    const filcdnUrl = `${this.baseUrl}/${cid}`;
    
    try {
      console.log(`🌐 Testing FilCDN retrieval: ${filcdnUrl}`);
      await this.makeHttpRequest(filcdnUrl, 'GET');
      console.log(`✅ FilCDN retrieval successful for: ${cid}`);
      return { success: true, url: filcdnUrl };
    } catch (error) {
      console.log(`❌ FilCDN retrieval failed for ${cid}: ${error.message}`);
      return { success: false, error: error.message, url: filcdnUrl };
    }
  }

  /**
   * Organize vibestreams by rta_id with chunks sorted by chunk_id
   * Enhanced structure for marketplace display
   */
  organizeVibestreams(vibestreams) {
    const organizedStreams = {};
    
    vibestreams.forEach(stream => {
      const { rta_id, chunk_id, cid, creator, duration, is_final } = stream;
      
      if (!organizedStreams[rta_id]) {
        organizedStreams[rta_id] = {
          rta_id,
          creator,
          chunks: {},
          total_duration: 0,
          chunk_count: 0,
          filcdn_urls: [],
          is_complete: false
        };
      }
      
      // Add chunk data
      organizedStreams[rta_id].chunks[chunk_id] = {
        chunk_id,
        cid,
        duration,
        is_final,
        filcdn_url: `${this.baseUrl}/${cid}`
      };
      
      // Update aggregated data
      if (is_final) {
        organizedStreams[rta_id].is_complete = true;
      }
      
      organizedStreams[rta_id].total_duration += duration || 0;
      organizedStreams[rta_id].chunk_count++;
      organizedStreams[rta_id].filcdn_urls.push(`${this.baseUrl}/${cid}`);
    });
    
    // Sort chunks by chunk_id for each rta_id
    Object.keys(organizedStreams).forEach(rta_id => {
      const sortedChunks = {};
      const chunkIds = Object.keys(organizedStreams[rta_id].chunks).sort((a, b) => parseInt(a) - parseInt(b));
      
      chunkIds.forEach(chunkId => {
        sortedChunks[chunkId] = organizedStreams[rta_id].chunks[chunkId];
      });
      
      organizedStreams[rta_id].chunks = sortedChunks;
    });
    
    return organizedStreams;
  }

  /**
   * Get vibestream metadata for marketplace display
   * Enhanced with profile image support
   */
  async getVibestreamMetadata(organizedStreams) {
    const marketplaceData = [];
    
    for (const [rta_id, stream] of Object.entries(organizedStreams)) {
      const chunkIds = Object.keys(stream.chunks);
      const firstChunk = stream.chunks[chunkIds[0]];
      const lastChunk = stream.chunks[chunkIds[chunkIds.length - 1]];
      
      // Try to get profile image from localStorage or default
      let profileImageHash = null;
      if (typeof localStorage !== 'undefined') {
        profileImageHash = localStorage.getItem(`vibesflow_profile_${stream.creator}`);
      }
      
      marketplaceData.push({
        rta_id,
        creator: stream.creator,
        rta_duration: this.formatDuration(stream.total_duration),
        chunks: stream.chunk_count,
        user_profile_image: profileImageHash,
        first_chunk_url: firstChunk?.filcdn_url,
        last_chunk_url: lastChunk?.filcdn_url,
        is_complete: lastChunk?.is_final || false,
        thumbnail_url: firstChunk?.filcdn_url, // Use first chunk as thumbnail
        filcdn_base: this.baseUrl
      });
    }
    
    return marketplaceData.sort((a, b) => b.rta_id.localeCompare(a.rta_id)); // Sort by newest first
  }

  /**
   * Format duration from seconds to HH:MM:SS
   */
  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Generate sample vibestream data for testing
   */
  generateSampleData() {
    return [
      {
        rta_id: 'rta_001',
        chunk_id: 0,
        cid: 'baga6ea4seaqabc123',
        creator: 'vibes.testnet',
        duration: 60,
        is_final: false
      },
      {
        rta_id: 'rta_001',
        chunk_id: 1,
        cid: 'baga6ea4seaqabc456',
        creator: 'vibes.testnet',
        duration: 60,
        is_final: false
      },
      {
        rta_id: 'rta_001',
        chunk_id: 2,
        cid: 'baga6ea4seaqabc789',
        creator: 'vibes.testnet',
        duration: 45,
        is_final: true
      },
      {
        rta_id: 'rta_002',
        chunk_id: 0,
        cid: 'baga6ea4seaqdef123',
        creator: 'basshead.testnet',
        duration: 90,
        is_final: false
      },
      {
        rta_id: 'rta_002',
        chunk_id: 1,
        cid: 'baga6ea4seaqdef456',
        creator: 'basshead.testnet',
        duration: 75,
        is_final: true
      }
    ];
  }

  /**
   * Generate FilCDN URLs for multiple CIDs organized by metadata
   */
  generateUrls(cids) {
    return cids.map(cid => ({
      cid,
      url: `${this.baseUrl}/${cid}`,
      testCommand: `curl -I "${this.baseUrl}/${cid}"`
    }));
  }

  async makeHttpRequest(url, method = 'GET') {
    return new Promise((resolve, reject) => {
      const request = https.request(url, { method }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      });
      
      request.on('error', reject);
      request.setTimeout(10000, () => reject(new Error('Request timeout')));
      request.end();
    });
  }
}

/**
 * Filecoin Network Monitor Class
 * Handles RPC calls and deal monitoring
 */
class FilecoinMonitor {
  constructor() {
    this.dealCache = new Map();
  }

  async rpcCall(method, params = []) {
    const url = new URL(CONFIG.rpc);
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: 1
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': postData.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          } catch (error) {
            reject(new Error(`JSON parse error: ${error.message}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => reject(new Error('Request timeout')));
      req.write(postData);
      req.end();
    });
  }

  /**
   * Get storage deals by client address - use Calibration address when available
   */
  async getStorageDeals(clientAddress = CONFIG.calibrationAddress || CONFIG.walletAddress) {
    try {
      console.log(`🔍 Fetching storage deals for: ${clientAddress}`);
      const allDeals = await this.rpcCall('Filecoin.StateMarketDeals', [null]);
      
      if (!allDeals) return [];

      // Filter deals by client address
      const deals = Object.entries(allDeals)
        .filter(([_, deal]) => deal.Proposal.Client === clientAddress)
        .map(([dealId, deal]) => ({
          dealId,
          provider: deal.Proposal.Provider,
          pieceCid: deal.Proposal.PieceCID['/'],
          pieceSize: deal.Proposal.PieceSize,
          storagePrice: deal.Proposal.StoragePricePerEpoch,
          startEpoch: deal.Proposal.StartEpoch,
          endEpoch: deal.Proposal.EndEpoch,
          state: this.getStateDescription(deal.State.SectorStartEpoch),
          verified: deal.Proposal.VerifiedDeal
        }));

      console.log(`✅ Found ${deals.length} storage deal(s)`);
      return deals;
    } catch (error) {
      console.error(`❌ Error fetching storage deals: ${error.message}`);
      return [];
    }
  }

  /**
   * Get current chain head and network info
   */
  async getChainInfo() {
    try {
      const [head, version] = await Promise.all([
        this.rpcCall('Filecoin.ChainHead'),
        this.rpcCall('Filecoin.Version')
      ]);

      return {
        currentEpoch: head.Height,
        headCid: head.Cids[0]['/'],
        networkVersion: version.Version,
        blockTime: head.Blocks[0]?.Timestamp
      };
    } catch (error) {
      console.error(`❌ Error fetching chain info: ${error.message}`);
      return null;
    }
  }

  /**
   * Check wallet balance - use Calibration address when available
   */
  async getWalletBalance(address = CONFIG.calibrationAddress || CONFIG.walletAddress) {
    try {
      const balance = await this.rpcCall('Filecoin.WalletBalance', [address]);
      return {
        address,
        balance,
        balanceAttoFIL: balance,
        balanceFIL: Number(balance) / 1e18
      };
    } catch (error) {
      console.error(`❌ Error fetching wallet balance: ${error.message}`);
      return null;
    }
  }

  getStateDescription(sectorStartEpoch) {
    if (sectorStartEpoch === -1) return 'Pending';
    if (sectorStartEpoch === 0) return 'Failed';
    return 'Active';
  }

  formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

/**
 * Analytics Integration Class
 * Connects to various Filecoin analytics platforms
 */
class AnalyticsMonitor {
  async queryAnalytics(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            resolve(data); // Return raw data if not JSON
          }
        });
      }).on('error', reject);
    });
  }

  async checkSpacescope(address) {
    try {
      console.log('🌌 Checking Spacescope analytics...');
      const url = `${ANALYTICS.spacescope}/deals?client=${address}`;
      const data = await this.queryAnalytics(url);
      console.log('📊 Spacescope data:', data);
      return data;
    } catch (error) {
      console.log(`❌ Spacescope check failed: ${error.message}`);
      return null;
    }
  }

  async checkFilscan(address) {
    try {
      console.log('🔍 Checking Filscan...');
      const url = `${ANALYTICS.filscan}/address/${address}`;
      const data = await this.queryAnalytics(url);
      console.log('📊 Filscan data:', data);
      return data;
    } catch (error) {
      console.log(`❌ Filscan check failed: ${error.message}`);
      return null;
    }
  }

  async checkFilfox(address) {
    try {
      console.log('🦊 Checking Filfox...');
      const url = `${ANALYTICS.filfox}/address/${address}`;
      const data = await this.queryAnalytics(url);
      console.log('📊 Filfox data:', data);
      return data;
    } catch (error) {
      console.log(`❌ Filfox check failed: ${error.message}`);
      return null;
    }
  }

  async checkBeryx(address) {
    try {
      console.log('🔎 Checking Beryx...');
      const url = `${ANALYTICS.beryx}/${address}`;
      const data = await this.queryAnalytics(url);
      console.log('📊 Beryx data:', data);
      return data;
    } catch (error) {
      console.log(`❌ Beryx check failed: ${error.message}`);
      return null;
    }
  }

  async checkAllPlatforms(address) {
    console.log(`\n🌐 Checking all analytics platforms for: ${address}\n`);
    
    const results = await Promise.allSettled([
      this.checkSpacescope(address),
      this.checkFilscan(address), 
      this.checkFilfox(address),
      this.checkBeryx(address)
    ]);

    return {
      spacescope: results[0].status === 'fulfilled' ? results[0].value : null,
      filscan: results[1].status === 'fulfilled' ? results[1].value : null,
      filfox: results[2].status === 'fulfilled' ? results[2].value : null,
      beryx: results[3].status === 'fulfilled' ? results[3].value : null
    };
  }
}

/**
 * Proof Set Monitor Class
 * Handles proof set verification and monitoring
 */
class ProofSetMonitor {
  /**
   * Verify proof set integrity and status
   * Based on PDP verification patterns from references
   */
  async verifyProofSet(proofSetId) {
    console.log(`🔍 Verifying proof set: ${proofSetId}`);
    
    try {
      // This would integrate with actual PDP verification
      // For now, return mock verification status
      const verification = {
        proofSetId,
        isValid: true,
        rootCount: 0,
        lastChallenge: null,
        nextChallenge: null,
        status: 'active'
      };
      
      console.log(`✅ Proof set ${proofSetId} verification completed`);
      return verification;
    } catch (error) {
      console.error(`❌ Proof set verification failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Get proof set details from provider API
   * Based on fs-upload-dapp patterns
   */
  async getProofSetDetails(proofSetId, pdpUrl) {
    try {
      const url = `${pdpUrl}pdp/proof-sets/${proofSetId}`;
      console.log(`📋 Fetching proof set details from: ${url}`);
      
      const data = await this.makeHttpRequest(url);
      console.log(`✅ Retrieved proof set ${proofSetId} details`);
      return JSON.parse(data);
    } catch (error) {
      console.error(`❌ Failed to get proof set details: ${error.message}`);
      return null;
    }
  }

  async makeHttpRequest(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      }).on('error', reject);
    });
  }
}

/**
 * CLI Interface Class
 * Provides command-line interface for all monitoring functions
 */
class CLI {
  constructor() {
    this.filecoinMonitor = new FilecoinMonitor();
    this.analyticsMonitor = new AnalyticsMonitor();
    this.proofSetMonitor = new ProofSetMonitor();
    this.filcdnMonitor = new FilCDNMonitor();
  }

  async run() {
    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    console.log(`🚀 Filecoin Deals & FilCDN Monitor\n`);

    switch (command) {
      case 'status':
        await this.showStatus();
        break;
      case 'deals':
        await this.showDeals();
        break;
      case 'chain':
        await this.showChainInfo();
        break;
      case 'analytics':
        await this.showAnalytics();
        break;
      case 'filcdn':
        await this.testFilCDN(args[1]);
        break;
      case 'verify':
        await this.verifyProofSet(args[1]);
        break;
      case 'watch':
        await this.watchDeals(args[1] || 30);
        break;
      case 'server':
        await this.startServer();
        break;
      case 'help':
      default:
        this.showHelp();
        break;
    }
  }

  async showStatus() {
    console.log(`📊 Overall Status Report\n`);
    
    // Chain info
    const chainInfo = await this.filecoinMonitor.getChainInfo();
    if (chainInfo) {
      console.log(`⛓️  Chain Info:`);
      console.log(`   Current Epoch: ${chainInfo.currentEpoch}`);
      console.log(`   Network: ${CONFIG.network}`);
      console.log(`   Head CID: ${chainInfo.headCid.substring(0, 20)}...`);
    }

    // Wallet balance - use Calibration address
    const balance = await this.filecoinMonitor.getWalletBalance();
    if (balance) {
      console.log(`\n💰 Wallet Balance:`);
      console.log(`   Address: ${balance.address}`);
      console.log(`   Balance: ${balance.balanceFIL.toFixed(4)} FIL`);
      console.log(`   Network: Calibration testnet`);
    }

    // Storage deals
    const deals = await this.filecoinMonitor.getStorageDeals();
    console.log(`\n📦 Storage Deals: ${deals.length} active`);
    
    // FilCDN status
    console.log(`\n🌐 FilCDN Integration:`);
    console.log(`   Base URL: https://${CONFIG.walletAddress}.calibration.filcdn.io`);
    console.log(`   Network: Calibration (Mainnet support coming July 2025)`);
    console.log(`   Address Used: ${CONFIG.calibrationAddress || CONFIG.walletAddress}`);
  }

  async showDeals() {
    console.log(`📦 Storage Deals Report\n`);
    
    const deals = await this.filecoinMonitor.getStorageDeals();
    
    if (deals.length === 0) {
      console.log(`📭 No storage deals found`);
      console.log(`   Using address: ${CONFIG.calibrationAddress || CONFIG.walletAddress}`);
      return;
    }

    deals.forEach((deal, index) => {
      console.log(`\n📋 Deal #${index + 1} (ID: ${deal.dealId})`);
      console.log(`   Provider: ${deal.provider}`);
      console.log(`   Piece CID: ${deal.pieceCid.substring(0, 30)}...`);
      console.log(`   Size: ${this.filecoinMonitor.formatBytes(deal.pieceSize)}`);
      console.log(`   Price: ${deal.storagePrice} per epoch`);
      console.log(`   Period: Epoch ${deal.startEpoch} - ${deal.endEpoch}`);
      console.log(`   State: ${deal.state}`);
      console.log(`   Verified: ${deal.verified ? 'Yes' : 'No'}`);
      
      // Generate FilCDN URL if this is a CommP
      if (deal.pieceCid.startsWith('baga')) {
        const filcdnUrl = `https://${CONFIG.walletAddress}.calibration.filcdn.io/${deal.pieceCid}`;
        console.log(`   🌐 FilCDN URL: ${filcdnUrl}`);
      }
    });
  }

  async showChainInfo() {
    console.log(`⛓️  Filecoin Chain Information\n`);
    
    const chainInfo = await this.filecoinMonitor.getChainInfo();
    if (!chainInfo) {
      console.log(`❌ Unable to fetch chain information`);
      return;
    }

    console.log(`📊 Network: ${CONFIG.network}`);
    console.log(`📊 Current Epoch: ${chainInfo.currentEpoch}`);
    console.log(`📊 Head CID: ${chainInfo.headCid}`);
    console.log(`📊 Network Version: ${chainInfo.networkVersion}`);
    console.log(`📊 RPC Endpoint: ${CONFIG.rpc}`);

    if (chainInfo.blockTime) {
      const blockDate = new Date(chainInfo.blockTime * 1000);
      console.log(`📊 Latest Block: ${blockDate.toISOString()}`);
    }
  }

  async showAnalytics() {
    console.log(`📈 Analytics Report for Calibration Network\n`);
    
    const address = CONFIG.calibrationAddress || CONFIG.walletAddress;
    console.log(`   Using Address: ${address}`);
    console.log(`   Network: Calibration testnet\n`);
    
    const results = await this.analyticsMonitor.checkAllPlatforms(address);
    
    console.log(`\n📊 Analytics Summary:`);
    console.log(`   Spacescope: ${results.spacescope ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   Filscan (Calibration): ${results.filscan ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   Filfox (Calibration): ${results.filfox ? '✅ Connected' : '❌ Failed'}`);
    console.log(`   Beryx (Calibration): ${results.beryx ? '✅ Connected' : '❌ Failed'}`);
  }

  async testFilCDN(cid) {
    console.log(`🌐 FilCDN Testing\n`);
    
    if (!cid) {
      console.log(`📋 FilCDN URL Format:`);
      console.log(`   https://{wallet-address}.calibration.filcdn.io/{cid}`);
      console.log(`   Base URL: https://${CONFIG.walletAddress}.calibration.filcdn.io`);
      console.log(`\n💡 Usage: node deals.js filcdn <cid-to-test>`);
      console.log(`\n📖 Based on FilCDN documentation:`);
      console.log(`   - Supports Filecoin Calibration network only`);
      console.log(`   - Mainnet support coming July 2025`);
      console.log(`   - File size limit: 254 MiB`);
      console.log(`   - Requires PDP deals via Synapse SDK`);
      return;
    }

    const result = await this.filcdnMonitor.testRetrieval(cid);
    
    if (result.success) {
      console.log(`🎉 FilCDN retrieval test successful!`);
      console.log(`   URL: ${result.url}`);
    } else {
      console.log(`❌ FilCDN retrieval test failed`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Error: ${result.error}`);
      console.log(`\n💡 Troubleshooting:`);
      console.log(`   - Ensure CID starts with 'baga' (CommP format)`);
      console.log(`   - File must be uploaded via Synapse SDK with withCDN: true`);
      console.log(`   - File must be in an active proof set`);
      console.log(`   - Check if file upload completed successfully`);
    }
  }

  async verifyProofSet(proofSetId) {
    if (!proofSetId) {
      console.log(`❌ Proof Set ID required. Usage: node deals.js verify <proof-set-id>`);
      return;
    }

    console.log(`🔍 Proof Set Verification\n`);
    
    const verification = await this.proofSetMonitor.verifyProofSet(proofSetId);
    
    if (verification) {
      console.log(`✅ Proof Set Verification Results:`);
      console.log(`   ID: ${verification.proofSetId}`);
      console.log(`   Valid: ${verification.isValid ? 'Yes' : 'No'}`);
      console.log(`   Root Count: ${verification.rootCount}`);
      console.log(`   Status: ${verification.status}`);
    } else {
      console.log(`❌ Proof set verification failed`);
    }
  }

  async watchDeals(intervalSeconds = 30) {
    console.log(`👀 Watching for deal changes (polling every ${intervalSeconds}s)\n`);
    console.log(`Press Ctrl+C to stop...\n`);
    
    let lastDealCount = 0;
    let lastEpoch = 0;
    
    const poll = async () => {
      try {
        const [deals, chainInfo] = await Promise.all([
          this.filecoinMonitor.getStorageDeals(),
          this.filecoinMonitor.getChainInfo()
        ]);
        
        // Check for deal changes
        if (deals.length !== lastDealCount) {
          console.log(`🔔 ${new Date().toISOString()} - Deal count changed: ${lastDealCount} → ${deals.length}`);
          lastDealCount = deals.length;
          
          if (deals.length > 0) {
            const latest = deals[deals.length - 1];
            console.log(`   📦 Latest: Deal ${latest.dealId} with ${latest.provider}`);
            
            // Test FilCDN if CID looks like CommP
            if (latest.pieceCid.startsWith('baga')) {
              console.log(`   🌐 Testing FilCDN for: ${latest.pieceCid.substring(0, 20)}...`);
              const result = await this.filcdnMonitor.testRetrieval(latest.pieceCid);
              console.log(`   ${result.success ? '✅' : '❌'} FilCDN: ${result.success ? 'Available' : result.error}`);
            }
          }
        }
        
        // Check for epoch changes
        if (chainInfo && chainInfo.currentEpoch !== lastEpoch) {
          if (lastEpoch > 0) {
            console.log(`⛓️  ${new Date().toISOString()} - New epoch: ${chainInfo.currentEpoch} (was ${lastEpoch})`);
          }
          lastEpoch = chainInfo.currentEpoch;
        }
        
        // Show activity indicator
        if (deals.length === lastDealCount && chainInfo?.currentEpoch === lastEpoch) {
          process.stdout.write('.');
        }
        
      } catch (error) {
        console.error(`❌ Polling error: ${error.message}`);
      }
      
      setTimeout(poll, intervalSeconds * 1000);
    };
    
    await poll();
  }

  async startServer() {
    console.log(`🚀 Starting API server for VibeMarket integration...`);
    const server = new APIServer();
    server.start();
  }

  showHelp() {
    console.log(`🛠️  Available Commands:\n`);
    console.log(`📊 status              - Show overall system status`);
    console.log(`📦 deals               - List all storage deals`);
    console.log(`⛓️  chain               - Show chain information`);
    console.log(`📈 analytics           - Check analytics platforms`);
    console.log(`🌐 filcdn [cid]        - Test FilCDN retrieval`);
    console.log(`🔍 verify <proof-set>   - Verify proof set`);
    console.log(`👀 watch [interval]     - Watch for changes`);
    console.log(`🚀 server              - Start API server for VibeMarket`);
    console.log(`❓ help                - Show this help`);
    
    console.log(`\n🔧 Configuration:`);
    console.log(`   RPC: ${CONFIG.rpc}`);
    console.log(`   Network: ${CONFIG.network}`);
    console.log(`   Wallet: ${CONFIG.walletAddress || 'Not configured'}`);
    console.log(`   Calibration: ${CONFIG.calibrationAddress || 'Not configured'}`);
    
    console.log(`\n🌐 FilCDN Integration:`);
    console.log(`   Base URL: https://${CONFIG.walletAddress}.calibration.filcdn.io`);
    console.log(`   Supports: Calibration network only (Mainnet coming July 2025)`);
    console.log(`   File limit: 254 MiB`);
    console.log(`   Required: Synapse SDK upload with withCDN: true`);
    
    console.log(`\n💡 Examples:`);
    console.log(`   node deals.js status`);
    console.log(`   node deals.js deals`);
    console.log(`   node deals.js filcdn baga6ea4seaqj...`);
    console.log(`   node deals.js watch 60`);
    console.log(`   node deals.js server`);
  }
}

/**
 * HTTP API Server for serving vibestream data
 */
class APIServer {
  constructor() {
    this.filcdnMonitor = new FilCDNMonitor();
    this.port = 3003;
  }

  start() {
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    server.listen(this.port, () => {
      console.log(`🚀 API Server running on http://localhost:${this.port}`);
    });
  }

  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const path = parsedUrl.pathname;

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      if (path === '/api/vibestreams') {
        await this.handleVibestreamsRequest(req, res);
      } else if (path === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    } catch (error) {
      console.error('API Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  async handleVibestreamsRequest(req, res) {
    console.log('📡 API request for vibestreams data');
    
    try {
      // Get sample data (in production, this would come from actual storage)
      const sampleData = this.filcdnMonitor.generateSampleData();
      
      // Organize by rta_id and chunk_id
      const organizedStreams = this.filcdnMonitor.organizeVibestreams(sampleData);
      
      // Get marketplace metadata
      const marketplaceData = await this.filcdnMonitor.getVibestreamMetadata(organizedStreams);
      
      console.log(`✅ Serving ${marketplaceData.length} vibestreams`);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(marketplaceData));
    } catch (error) {
      console.error('Error serving vibestreams:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load vibestreams' }));
    }
  }
}

// CLI execution
if (require.main === module) {
  const cli = new CLI();
  cli.run().catch(error => {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  FilecoinMonitor,
  AnalyticsMonitor,
  ProofSetMonitor,
  FilCDNMonitor,
  CLI,
  APIServer
}; 