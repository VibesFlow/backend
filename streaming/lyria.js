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
    // Enhanced CORS configuration for participant access
    this.app.use(cors({
      origin: true, // Allow all origins
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true
    }));
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
  }

  // Handle session start from client
  async handleSessionStart(req, res) {
    const { vibeId } = req.params;
    const { creator, network } = req.body;
    
    if (!creator) {
      return res.status(400).json({ error: 'Creator address required' });
    }
    
    console.log(`🎬 Starting stream session for vibe ${vibeId} by ${creator}`);
    
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
    
    res.json({
      success: true,
      vibeId,
      streamingUrl: `https://${this.srsConfig.host}/live/${vibeId}.flv`,
      hlsUrl: `https://${this.srsConfig.host}/live/${vibeId}.m3u8`,
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
    const rtmpUrl = `rtmp://${this.srsConfig.host}:${this.srsConfig.rtmpPort}/live/${vibeId}`;
    
    console.log(`🎬 Starting FFmpeg stream for vibe ${vibeId} to ${rtmpUrl}`);
    
    const ffmpegArgs = [
      '-f', 's16le',                    // Input format: 16-bit signed little endian
      '-ar', this.audioConfig.sampleRate.toString(),  // Sample rate
      '-ac', this.audioConfig.channels.toString(),    // Channels
      '-i', 'pipe:0',                   // Input from stdin
      '-c:a', 'aac',                    // Audio codec
      '-b:a', '128k',                   // Audio bitrate
      '-f', 'flv',                      // Output format
      '-flvflags', 'no_duration_filesize',
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
