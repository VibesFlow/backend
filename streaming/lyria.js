/**
 * Lyria Audio Capture and SRS Streaming Server
 * 
 * Captures audio from creator's Lyria session and restreams to participants
 * via SRS (Simple Realtime Server) for zero-latency group vibestreams.
 * 
 * Architecture:
 * - Creator's Lyria session sends audio chunks to this server
 * - Server processes audio and streams to SRS via RTMP
 * - Participants receive audio from SRS via HTTP-FLV/HLS (no Lyria session)
 * - Maintains WebSocket connection with orchestrator for session tracking
 */

const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

class LyriaStreamingServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.wsServer = null;
    
    // Active streaming sessions (creator -> participants)
    this.activeStreams = new Map(); // vibeId -> StreamSession
    
    // SRS configuration
    this.srsConfig = {
      host: process.env.STREAMING_PUBLIC_IPV4 || 'localhost',
      publicDomain: process.env.STREAMING_URL || `https://${process.env.STREAMING_PUBLIC_IPV4 || 'localhost'}`,
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985
    };
    
    // Audio processing configuration
    this.audioConfig = {
      sampleRate: 48000,
      channels: 2,
      bitDepth: 16,
      bufferSize: 4096
    };
    
    this.setupMiddleware();
  }

  setupMiddleware() {
    // CORS is handled by nginx proxy - no need for Express CORS middleware
    // this.app.use(cors({
    //   origin: [
    //     'http://localhost:8081', 
    //     'http://localhost:19006', // Expo dev server
    //     'https://vibesflow.ai', 
    //     'https://app.vibesflow.ai',
    //     'https://srs.vibesflow.ai' // SRS domain
    //   ], 
    //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    //   allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    //   credentials: true,
    //   optionsSuccessStatus: 200 // Some legacy browsers choke on 204
    // }));
    
    // Handle preflight requests explicitly - handled by nginx
    // this.app.options('*', (req, res) => {
    //   res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    //   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    //   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
    //   res.header('Access-Control-Allow-Credentials', 'true');
    //   res.sendStatus(200);
    // });
    
    this.app.use(express.json({ limit: '50mb' }));
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        activeStreams: this.activeStreams.size,
        srsRunning: true, // SRS is managed separately
        srsConfig: this.srsConfig,
        timestamp: new Date().toISOString()
      });
    });
    
    // Get active streams
    this.app.get('/streams/active', (req, res) => {
      const streams = Array.from(this.activeStreams.entries()).map(([vibeId, session]) => ({
        vibeId,
        creator: session.creator,
        participantCount: session.participants.size,
        startedAt: session.startedAt,
        isStreaming: session.isStreaming,
        network: session.network
      }));
      
      res.json({
        activeStreams: streams,
        totalStreams: streams.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Session management endpoints
    this.app.post('/stream/:vibeId/start', this.handleSessionStart.bind(this));
    this.app.post('/stream/:vibeId/end', this.handleSessionEnd.bind(this));
    
    // Creator audio chunk endpoint
    this.app.post('/stream/:vibeId/audio', this.handleCreatorAudio.bind(this));
    
    // Participant join endpoint  
    this.app.post('/stream/:vibeId/join', this.handleParticipantJoin.bind(this));
    
    // Participant leave endpoint
    this.app.post('/stream/:vibeId/leave', this.handleParticipantLeave.bind(this));
    
    // Blockchain-based participant routing
    this.app.get('/vibestream/:rtaId', this.handleVibestreamRoute.bind(this));
    
    // SRS HTTP hooks
    this.app.post('/hooks/on_publish', this.handleSrsPublish.bind(this));
    this.app.post('/hooks/on_unpublish', this.handleSrsUnpublish.bind(this));
    this.app.post('/hooks/on_play', this.handleSrsPlay.bind(this));
    this.app.post('/hooks/on_stop', this.handleSrsStop.bind(this));
  }

  // Handle session start from client
  async handleSessionStart(req, res) {
    const { vibeId } = req.params;
    const { creator, network } = req.body;
    
    if (!creator) {
      return res.status(400).json({ error: 'Creator address required' });
    }
    
    console.log(`🎬 Starting stream session for vibe ${vibeId} by ${creator}`);
    
    // Check if session already exists
    if (this.activeStreams.has(vibeId)) {
      console.log(`⚠️ Session ${vibeId} already exists, returning existing URLs`);
      const existingSession = this.activeStreams.get(vibeId);
      return res.json({
        success: true,
        vibeId,
        streamingUrl: `${this.srsConfig.publicDomain}/live/${vibeId}.flv`,
        hlsUrl: `${this.srsConfig.publicDomain}/live/${vibeId}.m3u8`,
        rtmpUrl: `rtmp://${this.srsConfig.host}:${this.srsConfig.rtmpPort}/live/${vibeId}`,
        isStreaming: existingSession.isStreaming,
        timestamp: Date.now()
      });
    }
    
    // Create stream session
    const streamSession = {
      vibeId,
      creator,
      participants: new Set(),
      startedAt: Date.now(),
      isStreaming: false,
      network: network || 'unknown',
      ffmpegProcess: null,
      audioBuffer: [],
      lastAudioTime: 0
    };
    
    this.activeStreams.set(vibeId, streamSession);
    
    console.log(`✅ Stream session created for ${vibeId}. Active sessions: ${this.activeStreams.size}`);
    
    res.json({
      success: true,
      vibeId,
      streamingUrl: `${this.srsConfig.publicDomain}/live/${vibeId}.flv`,
      hlsUrl: `${this.srsConfig.publicDomain}/live/${vibeId}.m3u8`,
      rtmpUrl: `rtmp://${this.srsConfig.host}:${this.srsConfig.rtmpPort}/live/${vibeId}`,
      timestamp: Date.now()
    });
  }

  // Handle session end from client
  async handleSessionEnd(req, res) {
    const { vibeId } = req.params;
    
    console.log(`🏁 Ending stream session for vibe ${vibeId}`);
    
    const session = this.activeStreams.get(vibeId);
    if (!session) {
      return res.status(404).json({ error: 'Stream session not found' });
    }
    
    // Stop FFmpeg process
    if (session.ffmpegProcess) {
      session.ffmpegProcess.kill('SIGTERM');
    }
    
    // Remove session
    this.activeStreams.delete(vibeId);
    
    res.json({
      success: true,
      vibeId,
      timestamp: Date.now()
    });
  }

  // Handle creator audio chunks
  async handleCreatorAudio(req, res) {
    const { vibeId } = req.params;
    const { audioData, creator } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: 'No audio data provided' });
    }
    
    const session = this.activeStreams.get(vibeId);
    if (!session) {
      return res.status(404).json({ error: 'Stream session not found' });
    }
    
    if (session.creator !== creator) {
      return res.status(403).json({ error: 'Only creator can send audio' });
    }
    
    try {
      // Process audio data and stream to SRS
      await this.processAudioChunk(vibeId, audioData);
      
      session.lastAudioTime = Date.now();
      session.isStreaming = true;
      
      res.json({
        success: true,
        vibeId,
        participantCount: session.participants.size,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error(`Failed to process audio for vibe ${vibeId}:`, error);
      res.status(500).json({ error: 'Failed to process audio' });
    }
  }

  // Process audio chunk and stream to SRS via RTMP
  async processAudioChunk(vibeId, audioData) {
    const session = this.activeStreams.get(vibeId);
    if (!session) return;
    
    try {
      // Convert base64 audio data to raw PCM
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Validate audio buffer size (Lyria: 48kHz, stereo, 16-bit)
      const expectedSampleRate = 48000;
      const channels = 2;
      const bytesPerSample = 2;
      const expectedBytesPerSecond = expectedSampleRate * channels * bytesPerSample;
      
      console.log(`🎵 Processing audio chunk: ${audioBuffer.length} bytes (${(audioBuffer.length / expectedBytesPerSecond).toFixed(3)}s)`);
      
      // Start FFmpeg process if not already running
      if (!session.ffmpegProcess) {
        session.ffmpegProcess = this.startFFmpegStream(vibeId);
        
        // Wait a moment for FFmpeg to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Write audio data to FFmpeg stdin
      if (session.ffmpegProcess && session.ffmpegProcess.stdin && !session.ffmpegProcess.stdin.destroyed) {
        const written = session.ffmpegProcess.stdin.write(audioBuffer);
        if (!written) {
          console.warn(`FFmpeg stdin buffer full for vibe ${vibeId}`);
        }
      } else {
        console.warn(`FFmpeg stdin not available for vibe ${vibeId}, restarting...`);
        session.ffmpegProcess = this.startFFmpegStream(vibeId);
      }
      
    } catch (error) {
      console.error(`Failed to process audio chunk for vibe ${vibeId}:`, error);
    }
  }

  // Start FFmpeg process to stream to SRS
  startFFmpegStream(vibeId) {
    // Use localhost for internal RTMP connection (more reliable than public IP)
    const rtmpUrl = `rtmp://localhost:${this.srsConfig.rtmpPort}/live/${vibeId}`;
    
    console.log(`🎬 Starting FFmpeg stream for vibe ${vibeId} to ${rtmpUrl}`);
    
    const ffmpegArgs = [
      '-f', 's16le',                    // Input format: 16-bit signed little endian
      '-ar', this.audioConfig.sampleRate.toString(),  // Sample rate: 48000
      '-ac', this.audioConfig.channels.toString(),    // Channels: 2 (stereo)
      '-i', 'pipe:0',                   // Input from stdin
      '-c:a', 'aac',                    // Audio codec: AAC
      '-b:a', '128k',                   // Audio bitrate: 128kbps
      '-profile:a', 'aac_low',          // AAC profile for better compatibility
      '-f', 'flv',                      // Output format: FLV for RTMP
      '-flvflags', 'no_duration_filesize',
      '-rtmp_live', 'live',             // Enable live streaming mode
      '-rtmp_buffer', '100',            // Small buffer for low latency
      '-reconnect', '1',                // Enable reconnection
      '-reconnect_streamed', '1',       // Reconnect even if some data was streamed
      '-reconnect_delay_max', '2',      // Max reconnect delay: 2 seconds
      rtmpUrl
    ];
    
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    ffmpegProcess.stdout.on('data', (data) => {
      console.log(`FFmpeg stdout [${vibeId}]:`, data.toString().trim());
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`FFmpeg stderr [${vibeId}]:`, output);
      
      // Check for successful connection
      if (output.includes('Stream mapping:') || output.includes('fps=')) {
        console.log(`✅ FFmpeg streaming successfully for vibe ${vibeId}`);
        const session = this.activeStreams.get(vibeId);
        if (session) {
          session.isStreaming = true;
        }
      }
      
      if (output.includes('error') || output.includes('Error') || output.includes('Connection refused')) {
        console.error(`❌ FFmpeg error [${vibeId}]:`, output);
      }
    });
    
    ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process closed for vibe ${vibeId} with code ${code}`);
      const session = this.activeStreams.get(vibeId);
      if (session) {
        session.ffmpegProcess = null;
        session.isStreaming = false;
        
        // If closed unexpectedly and session still exists, try to restart
        if (code !== 0 && code !== null) {
          console.log(`⚠️ FFmpeg unexpected exit for vibe ${vibeId}, will restart on next audio chunk`);
        }
      }
    });
    
    ffmpegProcess.on('error', (error) => {
      console.error(`❌ FFmpeg process error for vibe ${vibeId}:`, error);
      const session = this.activeStreams.get(vibeId);
      if (session) {
        session.ffmpegProcess = null;
        session.isStreaming = false;
      }
    });
    
    return ffmpegProcess;
  }

  // Handle participant join
  async handleParticipantJoin(req, res) {
    const { vibeId } = req.params;
    const { participantId, walletAddress } = req.body;
    
    const session = this.activeStreams.get(vibeId);
    if (!session) {
      return res.status(404).json({ error: 'Stream session not found' });
    }
    
    session.participants.add(participantId || walletAddress);
    
    console.log(`👤 Participant ${participantId || walletAddress} joined vibe ${vibeId}`);
    
    // Use HTTPS domain for public URLs, internal IP for RTMP
    const publicBaseUrl = this.srsConfig.publicDomain.replace('https://', '').replace('http://', '');
    
    res.json({
      success: true,
      vibeId,
      participantCount: session.participants.size,
      streamingUrl: `https://${publicBaseUrl}/live/${vibeId}.flv`,
      hlsUrl: `https://${publicBaseUrl}/live/${vibeId}.m3u8`,
      isStreaming: session.isStreaming,
      timestamp: Date.now()
    });
  }

  // Handle participant leave
  async handleParticipantLeave(req, res) {
    const { vibeId } = req.params;
    const { participantId, walletAddress } = req.body;
    
    const session = this.activeStreams.get(vibeId);
    if (!session) {
      return res.status(404).json({ error: 'Stream session not found' });
    }
    
    session.participants.delete(participantId || walletAddress);
    
    console.log(`👤 Participant ${participantId || walletAddress} left vibe ${vibeId}`);
    
    res.json({
      success: true,
      vibeId,
      participantCount: session.participants.size,
      timestamp: Date.now()
    });
  }

  // Handle blockchain-based vibestream routing
  async handleVibestreamRoute(req, res) {
    const { rtaId } = req.params;
    
    console.log(`🔗 Blockchain routing request for RTA ID: ${rtaId}`);
    
    // Check if there's an active session for this RTA ID
    const session = this.activeStreams.get(rtaId);
    
    if (!session) {
      // No active session - return 404 with blockchain info for frontend
      return res.status(404).json({
        error: 'Vibestream not currently active',
        rtaId: rtaId,
        message: 'This vibestream is not currently streaming. The creator may have ended the session.',
        blockchain: this.detectBlockchainFromRtaId(rtaId),
        timestamp: Date.now()
      });
    }
    
    // Active session found - return streaming info
    res.json({
      success: true,
      rtaId: rtaId,
      creator: session.creator,
      network: session.network,
      blockchain: this.detectBlockchainFromRtaId(rtaId),
      isStreaming: session.isStreaming,
      participantCount: session.participants.size,
      startedAt: session.startedAt,
      streamingUrl: `${this.srsConfig.publicDomain}/live/${rtaId}.flv`,
      hlsUrl: `${this.srsConfig.publicDomain}/live/${rtaId}.m3u8`,
      joinUrl: `${this.srsConfig.publicDomain}/stream/${rtaId}/join`,
      timestamp: Date.now()
    });
  }

  // Detect blockchain network from RTA ID format
  detectBlockchainFromRtaId(rtaId) {
    if (rtaId.startsWith('polygon_vibe_')) {
      return {
        network: 'polygon',
        chainId: 80002,
        name: 'Polygon Amoy Testnet'
      };
    } else if (rtaId.startsWith('rta_')) {
      return {
        network: 'near',
        networkId: 'testnet',
        name: 'NEAR Testnet'
      };
  }

  // SRS HTTP Hooks handlers
  async handleSrsPublish(req, res) {
    const { app, stream, param } = req.body;
    console.log(`📡 SRS: Stream started - ${app}/${stream}`);
    
    // Update session streaming status
    const session = this.activeStreams.get(stream);
    if (session) {
      session.isStreaming = true;
      console.log(`✅ Session ${stream} marked as streaming`);
    }
    
    res.json({ code: 0 }); // SRS expects code: 0 for success
  }

  async handleSrsUnpublish(req, res) {
    const { app, stream, param } = req.body;
    console.log(`📡 SRS: Stream ended - ${app}/${stream}`);
    
    // Update session streaming status
    const session = this.activeStreams.get(stream);
    if (session) {
      session.isStreaming = false;
      console.log(`⏹️ Session ${stream} marked as not streaming`);
    }
    
    res.json({ code: 0 });
  }

  async handleSrsPlay(req, res) {
    const { app, stream, param } = req.body;
    console.log(`👤 SRS: Participant started playing - ${app}/${stream}`);
    
    res.json({ code: 0 });
  }

  async handleSrsStop(req, res) {
    const { app, stream, param } = req.body;
    console.log(`👤 SRS: Participant stopped playing - ${app}/${stream}`);
    
    res.json({ code: 0 });
  }

  // Start the server
  async start(port = 3001) {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`🎵 Lyria Streaming Server started on port ${port}`);
          console.log(`🔗 SRS RTMP: rtmp://${this.srsConfig.host}:${this.srsConfig.rtmpPort}/live/`);
          console.log(`🔗 SRS HTTP-FLV: http://${this.srsConfig.host}:${this.srsConfig.httpPort}/live/`);
          console.log(`🔗 Health check: http://localhost:${port}/health`);
          resolve();
        }
      });
    });
  }

  // Stop the server
  async stop() {
    // Stop all active streams
    for (const [vibeId, session] of this.activeStreams.entries()) {
      if (session.ffmpegProcess) {
        session.ffmpegProcess.kill('SIGTERM');
      }
    }
    this.activeStreams.clear();
    
    // Close orchestrator connection
    if (this.orchestratorConnection) {
      this.orchestratorConnection.close();
    }
    
    // Stop HTTP server
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('🛑 Lyria Streaming Server stopped');
          resolve();
        });
      });
    }
  }
}

// Start server if run directly
if (require.main === module) {
  const server = new LyriaStreamingServer();
  
  server.start().then(() => {
    console.log('✅ Lyria Streaming Server is ready');
  }).catch((error) => {
    console.error('❌ Failed to start Lyria Streaming Server:', error);
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });
}

module.exports = LyriaStreamingServer;
