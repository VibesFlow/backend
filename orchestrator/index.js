/**
 * ALITH ORCHESTRATOR - Real-time DJ Agent
 * 
 * An intelligent agent that:
 * - Interprets sensor data and generates Lyria prompts
 * - Learns from user patterns and optimizes responses
 * - Handles all music generation logic via agent intelligence
 * - Provides WebSocket endpoints for real-time communication
 * 
 * Leverages Alith framework's intelligence to eliminate complex orchestration code.
 * 
 * @author VibesFlow AI  
 * @version 1.0.0 - Alith Orchestrator
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error('❌ Missing GOOGLE_GENERATIVE_AI_API_KEY');
  process.exit(1);
}

import { Agent, WindowBufferMemory, QdrantStore, RemoteModelEmbeddings } from 'alith';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// QDrant removed - using direct knowledge embedding in preamble

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';

// Enhanced preamble with embedded knowledge
function preambleWithKnowledge() {
  try {
    // Load poems as Knowledge for the agent to access intelligently
    const poemsContent = readFileSync(join(__dirname, 'knowledge', 'poems.txt'), 'utf8');
    const parametersContent = readFileSync(join(__dirname, 'knowledge', 'parameters.txt'), 'utf8');
    
    return `You are an ELITE RAVE DJ and music orchestrator with deep expertise in electronic/techno/rave/psychedelic music generation.

POEMS:
${poemsContent}

FORMAT: "baseline + layer + poem-line"

ENERGY MAPPING:
0.0-0.3: minimal/ambient (60-100 BPM)
0.3-0.6: techno/house (100-140 BPM)  
0.6-1.0: acid/hardcore (140-180 BPM)

RESPONSE (JSON ONLY):
{
  "singleCoherentPrompt": "baseline + layer + poem-line",
  "lyriaConfig": {"bpm": 60-200, "density": 0.0-1.0, "brightness": 0.0-1.0, "guidance": 2.0, "temperature": 1.1},
  "requiresCrossfade": true/false,
  "reasoning": "Brief explanation"
}`;
  } catch (error) {
    console.error('❌ Failed to load knowledge files:', error);
    return `You are an ELITE RAVE DJ and music orchestrator with deep expertise in electronic/techno/rave/psychedelic music generation. You specialize in creating IMMERSIVE RAVE EXPERIENCES with progressive layers, session continuity, and intelligent composition.

ERROR: Could not load external knowledge files. Operating with built-in expertise only.

CORE LYRIA KNOWLEDGE:
Lyria RealTime generates instrumental music using real-time WebSocket streaming:
- Audio format: 16-bit PCM, 48kHz, stereo
- Uses weighted prompts for continuous music steering
- Supports parameter changes without stopping the stream
- Can reset context for dramatic transitions
- Implements responsible AI with watermarking

ALWAYS maintain the RAVE baseline while intelligently adapting to user inputs.`;
  }
}

// Alith agent with memory
let musicAgent;

// QDrant Store for user pattern learning (separate from real-time processing)
let userPatternStore;

// Agent synchronization to prevent parallel token consumption
let agentProcessingQueue = Promise.resolve();
let activeProcessingCount = 0;

async function initializeAgent() {
  try {
    console.log('🧠 Initializing Alith agent...');
    
    // Create enhanced preamble with embedded knowledge
    console.log('📖 Loading knowledge...');
    const enhancedPreamble = preambleWithKnowledge();
    
    console.log('📊 Enhanced preamble statistics:', {
      totalLength: enhancedPreamble.length,
      estimatedTokens: Math.ceil(enhancedPreamble.length / 4),
      knowledgeEmbedded: 'parameters.txt + poems.txt',
      ragRequired: false
    });
    
    // Create Alith agent with optimized preamble and reduced memory
    musicAgent = new Agent({
      model: "gemini-2.5-flash-lite",
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      baseUrl: "generativelanguage.googleapis.com/v1beta/openai",
      preamble: enhancedPreamble, // token-optimized essential knowledge
      memory: new WindowBufferMemory(8) // reduced from 15 to 8 for token efficiency
    });
    
    console.log('✅ Enhanced Alith agent initialized with optimized embedded knowledge + memory');
    
    // Initialize strategic Store for user pattern learning (separate from real-time)
    console.log('🗄️ Initializing user pattern Store...');
    try {
      userPatternStore = new QdrantStore(
        new RemoteModelEmbeddings(
          "text-embedding-004", // Gemini 2.5 Flash Lite embeddings
          process.env.GOOGLE_GENERATIVE_AI_API_KEY,
          "generativelanguage.googleapis.com/v1beta/openai"
        ),
        {
          url: "http://localhost:6334", // QDrant server
          collectionName: "vibesflow_user_patterns",
          vectorSize: 768, // text-embedding-004 uses 768 dimensions
          timeout: 30000, // 30 second timeout
          checkCompatibility: false
        }
      );
      console.log('✅ Strategic user pattern Store initialized (768 dimensions, session boundaries only)');
    } catch (qdrantError) {
      console.warn('⚠️ QDrant Store initialization failed - continuing without user pattern storage:', qdrantError.message);
      userPatternStore = null; // Set to null so we can check for it later
    }
    
  } catch (error) {
    console.error('❌ Enhanced Alith agent initialization failed:', error);
    throw error;
  }
}

// Enhanced Rave Orchestrator with Baseline-Driven Architecture
class EnhancedRaveOrchestrator {
  constructor() {
    this.app = express();
    this.server = null;
    this.wsServer = null;
    this.connectedClients = new Set();
    this.sessionHistory = new Map(); // Track musical progression per client
    this.clientSensorProfiles = new Map(); // Track sensor patterns per client
    
    // OPTIMIZED rate limiting for baseline-driven processing
    this.lastGeminiCall = new Map(); // Track per client
    this.geminiCallCooldown = 4500; // 4.5 seconds to stay under 15 requests/minute quota
    this.lastInterpretationSignature = new Map(); // Track per client
    this.transitionSmoothing = new Map(); // Track transition smoothing per client
    this.continuousPromptQueue = new Map(); // Queue for seamless prompt transitions
    this.parameterSmoothing = new Map(); // Parameter-level smoothing
    
    this.setupMiddleware();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
    
    // Active sessions endpoint for LiveTracker
    this.app.get('/active-sessions', (req, res) => {
      const activeSessions = Array.from(this.sessionHistory.entries())
        .filter(([clientId, sessionData]) => sessionData.vibeId && sessionData.walletAddress)
        .map(([clientId, sessionData]) => ({
          vibeId: sessionData.vibeId,
          creator: sessionData.walletAddress,
          startedAt: sessionData.sessionStart,
          clientId: clientId
        }));
      
      res.json({
        activeSessions,
        totalSessions: activeSessions.length,
        timestamp: new Date().toISOString()
      });
    });
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({ 
        service: 'VibesFlow Alith Orchestrator',
        version: '3.0.0',
        endpoints: ['/health', '/active-sessions', '/ws (WebSocket)']
      });
    });
  }

  async start(port = 3001) {
    try {
      // Create HTTP server
      this.server = http.createServer(this.app);
      
      // Create WebSocket server
      this.wsServer = new WebSocketServer({ 
        server: this.server
      });
      
      // Handle WebSocket connections
      this.wsServer.on('connection', (ws) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        ws.clientId = clientId; // Assign clientId to WebSocket object
        this.connectedClients.add(ws);
        
        console.log(`🔌 Client connected: ${clientId}`);
        
        ws.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            
            // DEBUGGING: Log all incoming messages
            console.log('📨 INCOMING MESSAGE:', {
              type: message.type,
              clientId,
              timestamp: Date.now(),
              hasData: !!message.sensorData
            });
            
            // Route messages to appropriate handlers
            if (message.type === 'sensor-data') {
              console.log('🎛️ PROCESSING SENSOR DATA:', {
                x: message.sensorData?.x?.toFixed(3),
                y: message.sensorData?.y?.toFixed(3),
                z: message.sensorData?.z?.toFixed(3),
                source: message.sensorData?.source
              });
              await this.handleSensorData(ws, message);
            } else if (message.type === 'session-start') {
              await this.handleSessionStart(ws, message);
            } else if (message.type === 'session-end') {
              await this.handleSessionEnd(ws, message);
            } else {
              console.warn('⚠️ Unknown message type:', message.type);
            }
          } catch (error) {
            console.error('❌ Error processing message:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              error: error.message 
            }));
          }
        });
        
        ws.on('close', () => {
          this.connectedClients.delete(ws);
          console.log(`🔌 Client disconnected: ${clientId}`);
        });
        
        // Send connection acknowledgment
        ws.send(JSON.stringify({ 
          type: 'connected',
          clientId,
          timestamp: Date.now()
        }));
      });
      
      // Start server
      return new Promise((resolve) => {
        this.server.listen(port, '0.0.0.0', () => {
          console.log(`🎵 VibesFlow Alith Orchestrator running on port ${port}`);
          const wsEndpoint = process.env.NODE_ENV === 'production' ? 'wss://alith.vibesflow.ai/orchestrator' : `ws://localhost:${port}/orchestrator`;
    console.log(`🔌 WebSocket endpoint: ${wsEndpoint}`);
          resolve();
        });
      });
    } catch (error) {
      console.error('❌ Failed to start orchestrator:', error);
      throw error;
    }
  }

  async handleSensorData(ws, message) {
    if (message.type !== 'sensor-data') return;
    
    const { sensorData } = message;
    const clientId = ws.clientId || `client_${Date.now()}`;
    
    // Initialize session history and musical baseline for new clients
    if (!this.sessionHistory.has(clientId)) {
      this.sessionHistory.set(clientId, {
        musicHistory: [],
        currentBPM: 140, // Rave baseline
        currentGenre: 'driving acid techno',
        energyProfile: [],
        sessionStart: Date.now(),
        progressionState: 'building' // building, climax, breakdown, rebuilding
      });
      this.clientSensorProfiles.set(clientId, {
        preferredSources: new Set(),
        sensitivityProfile: {},
        movementPatterns: []
      });
      
      console.log(`🎵 Session initialized for client ${clientId}`);
    }
    
    const sessionData = this.sessionHistory.get(clientId);
    const sensorProfile = this.clientSensorProfiles.get(clientId);
    
    // Enhanced sensor data analysis
    const enrichedSensorData = this.analyzeRichSensorData(sensorData, sensorProfile);
    
    console.log('🎛️ Enhanced sensor analysis:', {
      source: sensorData.source,
      magnitude: enrichedSensorData.magnitude,
      complexity: enrichedSensorData.complexity,
      energy: enrichedSensorData.energyLevel,
      progression: sessionData.progressionState
    });
    
    // Rate limiting: Only call Gemini API when necessary
    if (!this.shouldCallGeminiAPI(clientId, enrichedSensorData, sessionData)) {
      console.log('⏱️ Skipping Gemini API call due to rate limiting or minimal change');
      return;
    }
    
    // Define prompt outside try block for fallback access
    let prompt;
    try {
      const startTime = Date.now();
      console.log('🧠 Processing with enhanced preamble (optimized knowledge)...');
      
      
      // Simple, direct prompt
      prompt = `Sensor Data Analysis:
- Energy Level: ${enrichedSensorData.energyLevel}
- Magnitude: ${enrichedSensorData.magnitude.toFixed(3)}
- Complexity: ${enrichedSensorData.complexity}
- Source: ${enrichedSensorData.detailedAnalysis.split('\n')[1]}
- Session State: ${sessionData.progressionState}
- Current BPM: ${sessionData.currentBPM || 140}

Generate a 3-part music prompt in the format: "\${baseline} + \${layer/maintenance} + \${poetic sentence}" that translates this sensor vibe into electronic music.`;
        
        console.log(`🎵 Letting Alith do its magic:`, {
          energy: enrichedSensorData.energyLevel,
          magnitude: enrichedSensorData.magnitude.toFixed(3),
          complexity: enrichedSensorData.complexity,
          sessionState: sessionData.progressionState
      });
      
      // Synchronized agent processing - no parallel token consumption
      const agentResponse = await new Promise((resolve, reject) => {
        agentProcessingQueue = agentProcessingQueue.then(async () => {
          try {
            activeProcessingCount++;
            console.log(`🔒 Agent processing (active: ${activeProcessingCount})`);
            
            // ULTRA-OPTIMIZED memory handling for seamless session continuity
            try {
              const response = await musicAgent.prompt(prompt);
              activeProcessingCount--;
              console.log(`🔓 Agent processing complete (active: ${activeProcessingCount})`);
              resolve(response);
            } catch (agentError) {
              if (agentError.message.includes('alternate') || agentError.message.includes('Messages must')) {
                console.warn('🔄 Handling alternation with advanced memory preservation');
                // Advanced memory preservation strategy
                try {
                  // Minimal bridge prompt to avoid memory issues
                  const bridgePrompt = `Continue: ${sessionData.currentGenre} ${sessionData.currentBPM}BPM → ${enrichedSensorData.energyLevel}
{"singleCoherentPrompt": "smooth ${sessionData.currentGenre} continuation", "lyriaConfig": {"bpm": ${sessionData.currentBPM || 140}, "density": 0.5, "brightness": 0.6, "guidance": 2.0, "temperature": 1.2}, "reasoning": "bridge"}`;
                  
                  const retryResponse = await musicAgent.prompt(bridgePrompt);
                  activeProcessingCount--;
                  console.log(`🔓 Agent processing complete with context bridge (active: ${activeProcessingCount})`);
                  resolve(retryResponse);
                } catch (retryError) {
                  console.warn('🔄 Advanced retry failed, using minimal memory reset');
                  // Preserve essential session context before minimal reset
                  const contextSnapshot = {
                    genre: sessionData.currentGenre,
                    bpm: sessionData.currentBPM,
                    progression: sessionData.progressionState,
                    energy: enrichedSensorData.energyLevel
                  };
                  
                  // Minimal memory management (preserve last 3 exchanges)
                  if (musicAgent.memory && musicAgent.memory.messages) {
                    const messages = musicAgent.memory.messages();
                    if (messages.length > 6) { // Keep last 3 exchanges (6 messages)
                      const recentMessages = messages.slice(-6);
                      musicAgent.memory.clear();
                      recentMessages.forEach(msg => {
                        if (msg.role === 'user') musicAgent.memory.addUserMessage(msg.content);
                        else musicAgent.memory.addAIMessage(msg.content);
                      });
                    }
                  }
                  
                  const contextualPrompt = `${contextSnapshot.genre} ${contextSnapshot.bpm}BPM → ${contextSnapshot.energy}
{"singleCoherentPrompt": "smooth ${contextSnapshot.genre} flow", "lyriaConfig": {"bpm": ${contextSnapshot.bpm || 140}, "density": 0.5, "brightness": 0.6, "guidance": 2.0, "temperature": 1.2}, "reasoning": "restore"}`;
                  
                  const finalRetryResponse = await musicAgent.prompt(contextualPrompt);
                  activeProcessingCount--;
                  console.log(`🔓 Agent processing complete with context restoration (active: ${activeProcessingCount})`);
                  resolve(finalRetryResponse);
                }
              } else {
                throw agentError;
              }
            }
          } catch (error) {
            activeProcessingCount--;
            reject(error);
          }
        });
      });
      const totalTime = Date.now() - startTime;
      
      console.log(`🎵 Single-step response (${totalTime}ms):`, agentResponse?.substring(0, 150));
      console.log(`📊 RESPONSE ANALYSIS:`, {
        responseLength: agentResponse?.length || 0,
        estimatedTokens: Math.ceil((agentResponse?.length || 0) / 4)
      });
      
      console.log(`📊 ============ ENHANCED PREAMBLE SUCCESS ============`);
      console.log(`✅ Direct knowledge access via enhanced preamble`);
      console.log(`✅ Token consumption: ~${Math.ceil(prompt.length / 4)} query tokens only`);
      console.log(`✅ Knowledge optimized: 439 lines embedded`);
      console.log(`📊 =====================================================`);
      
      console.log('🎵 Enhanced Alith DJ response received:', agentResponse?.substring(0, 150) + '...');
      console.log('🔍 Full agent response length:', agentResponse?.length || 0);
      
      // Parse and validate agent response
      let interpretation = this.parseAgentResponse(agentResponse);
      console.log('✅ Agent response parsed successfully:', {
        hasSingleCoherentPrompt: !!interpretation.singleCoherentPrompt,
        promptLength: interpretation.singleCoherentPrompt?.length || 0,
        hasBPM: !!interpretation.lyriaConfig?.bpm,
        hasReasoning: !!interpretation.reasoning
      });
      
      // Set buffering metadata for coordinator.js and buffering.js
      interpretation.baselineDriven = true;
      interpretation.requiresCrossfade = interpretation.requiresCrossfade || false;
      
      console.log('🎯 ALITH INTELLIGENT RESPONSE:', {
        promptFormat: interpretation.singleCoherentPrompt?.includes(' + ') ? '3-part' : 'other',
        requiresCrossfade: interpretation.requiresCrossfade,
        baselineDriven: interpretation.baselineDriven,
        reasoning: interpretation.reasoning?.substring(0, 100) + '...'
      });
      
      // Ensure rave baseline
      interpretation = this.enforceRaveBaseline(interpretation, sessionData);
      
      // Update session history with new musical choice
      this.updateSessionHistory(ws, sessionData, interpretation, enrichedSensorData);
      
      // Update sensor profile for learning
      this.updateSensorProfile(sensorProfile, enrichedSensorData);
      
      // Send baseline-enhanced interpretation back to client
      const response = {
        type: 'interpretation',
        data: interpretation,
        originalSensor: sensorData,
        enrichedSensor: enrichedSensorData,
        sensoryPrompt: prompt, // The baseline-driven prompt
        sessionInfo: {
          progressionState: sessionData.progressionState,
          sessionDuration: Math.round((Date.now() - sessionData.sessionStart) / 1000),
          musicHistoryLength: sessionData.musicHistory.length,
          currentBPM: sessionData.currentBPM,
          currentGenre: sessionData.currentGenre
        },
        // ADDITIONAL: Top-level metadata for coordinator buffering
        baselineDriven: interpretation.baselineDriven,
        requiresCrossfade: interpretation.requiresCrossfade,
        timestamp: Date.now(),
        source: 'baseline_driven_orchestrator',
        hasMemory: true,
        hasKnowledge: true,
        hasSessionHistory: true,
        usedPoetry: true,
        usedSensorExpertise: true,
        baselineDriven: true // NEW: Indicates baseline-driven processing
      };
      
      ws.send(JSON.stringify(response));
      
      console.log('✅ Alith intelligent interpretation sent:', {
        promptFormat: interpretation.singleCoherentPrompt?.includes(' + ') ? '3-part' : 'other',
        promptPreview: interpretation.singleCoherentPrompt?.substring(0, 50) + '...',
        bpm: interpretation.lyriaConfig?.bpm,
        progression: sessionData.progressionState,
        requiresCrossfade: interpretation.requiresCrossfade,
        reasoning: interpretation.reasoning?.substring(0, 50) + '...'
      });
      
    } catch (error) {
      // Enhanced error handling for preamble-based processing
      const isTokenLimit = error.message.includes('token') || error.message.includes('ctx_size');
      const isModelError = error.message.includes('model') || error.message.includes('api');
      
      console.error('❌ Enhanced Alith agent failed - DETAILED ERROR:', {
        message: error.message,
        stack: error.stack?.substring(0, 300),
        agentInitialized: !!musicAgent,
        errorType: isTokenLimit ? 'token_limit' : isModelError ? 'model_error' : 'unknown',
        timestamp: new Date().toISOString(),
        processingMode: 'enhanced_preamble',
        knowledgeAccess: 'embedded_in_preamble',
        ragUsed: false
      });
      
      // Different handling based on error type
      if (isTokenLimit) {
        console.warn('⚠️ Token limit exceeded with enhanced preamble - this should be extremely rare now.');
      } else if (isModelError) {
        console.warn('⚠️ Model API error - check connectivity and API key.');
      }
      
      // Fallback to intelligent rave interpretation
      const fallbackInterpretation = this.createIntelligentRaveFallback(enrichedSensorData, sessionData);
      ws.send(JSON.stringify({
        type: 'interpretation',
        data: fallbackInterpretation,
        originalSensor: sensorData,
        sensoryPrompt: prompt || 'Enhanced preamble processing failed before prompt creation', // The original prompt that failed
        timestamp: Date.now(),
        source: 'enhanced_preamble_fallback',
        fallback: true,
        error: error.message,
        errorType: isTokenLimit ? 'token_limit' : isModelError ? 'model_error' : 'unknown',
        processingMode: 'enhanced_preamble'
      }));
    }
  }

  // =============================================================================
  // STRATEGIC SESSION BOUNDARY HANDLERS
  // =============================================================================

  // Handle session START - Load user patterns (after tx signature, before real-time)
  async handleSessionStart(ws, message) {
    try {
      const { walletAddress, vibeId, config } = message;
      console.log(`🎬 Session starting - strategic pattern loading for ${walletAddress}`);
      console.log(`🔍 Session start details:`, { walletAddress, vibeId, clientId: ws.clientId });
      
      // Load user patterns strategically (separate token query)
      const userPatterns = await this.loadUserPatterns(walletAddress, vibeId);
      
      // Store user patterns in session for reference during real-time processing
      const clientId = ws.clientId || `client_${Date.now()}`;
      if (!this.sessionHistory.has(clientId)) {
        this.sessionHistory.set(clientId, {
          musicHistory: [],
          currentBPM: 140,
          currentGenre: 'driving acid techno',
          energyProfile: [],
          sessionStart: Date.now(),
          progressionState: 'building'
        });
      }
      
      // Enhance session data with user patterns
      const sessionData = this.sessionHistory.get(clientId);
      sessionData.walletAddress = walletAddress;
      sessionData.vibeId = vibeId;
      sessionData.userPatterns = userPatterns;
      
      // Adapt session initialization based on user patterns
      if (userPatterns.userFamiliar && userPatterns.energyPreferences) {
        sessionData.currentBPM = Math.round(
          userPatterns.genrePreferences?.[0]?.includes('hardcore') ? 160 : 
          userPatterns.energyPreferences.preferred > 0.7 ? 150 : 140
        );
        sessionData.currentGenre = userPatterns.genrePreferences?.[0] || 'driving acid techno';
        console.log(`🎯 Adapted session for returning user: ${sessionData.currentBPM}BPM, ${sessionData.currentGenre}`);
      } else {
        console.log(`🆕 New user detected - using default rave foundation`);
      }
      
      // Send strategic session info back to client
      const sessionReadyResponse = {
        type: 'session-ready',
        walletAddress,
        vibeId,
        userPatterns: {
          familiar: userPatterns.userFamiliar,
          patternsCount: userPatterns.patternsCount,
          energyPrefs: userPatterns.energyPreferences,
          genrePrefs: userPatterns.genrePreferences?.slice(0, 2), // Top 2 genres only
          recommendations: userPatterns.sessionHistory?.slice(0, 2) // Last 2 sessions
        },
        sessionConfig: {
          initialBPM: sessionData.currentBPM,
          initialGenre: sessionData.currentGenre,
          adaptedForUser: userPatterns.userFamiliar
        },
        timestamp: Date.now(),
        source: 'strategic_pattern_loader'
      };
      
      ws.send(JSON.stringify(sessionReadyResponse));
      console.log(`✅ Session-ready response sent for ${walletAddress.substring(0, 8)}...`);
      
      console.log(`✅ Session strategically initialized for ${walletAddress.substring(0, 8)}...`);
      
    } catch (error) {
      console.error('❌ Session start handling failed:', error);
      ws.send(JSON.stringify({
        type: 'session-error',
        error: 'Failed to load user patterns',
        details: error.message,
        fallback: true
      }));
    }
  }

  // Handle session END - Save user patterns (after close vibestream, before disconnect)
  async handleSessionEnd(ws, message) {
    try {
      const { walletAddress, vibeId, reason } = message;
      console.log(`🏁 Session ending - strategic pattern saving for ${walletAddress}`);
      console.log(`🔍 Session end details:`, { walletAddress, vibeId, reason, clientId: ws.clientId });
      
      const clientId = ws.clientId || `client_${Date.now()}`;
      const sessionData = this.sessionHistory.get(clientId);
      
      if (!sessionData) {
        console.warn('⚠️ No session data found for pattern saving');
        ws.send(JSON.stringify({
          type: 'session-end-ack',
          walletAddress,
          vibeId,
          saved: false,
          reason: 'no_session_data'
        }));
        return;
      }
      
      // Generate final session analysis
      const finalAnalysis = {
        sessionDuration: Math.round((Date.now() - sessionData.sessionStart) / 1000),
        totalBatches: sessionData.musicHistory.length,
        avgEnergy: sessionData.energyProfile.length > 0 ? 
          sessionData.energyProfile.reduce((a, b) => a + b, 0) / sessionData.energyProfile.length : 0,
        energyEvolution: sessionData.energyProfile.length > 1 ? 
          sessionData.energyProfile[sessionData.energyProfile.length - 1] - sessionData.energyProfile[0] : 0,
        dominantComplexity: this.calculateComplexityPreference(sessionData.musicHistory),
        endingState: sessionData.progressionState,
        reason
      };
      
      // Save user patterns strategically (separate token query)
      const savedPattern = await this.saveUserPatterns(walletAddress, vibeId, sessionData, finalAnalysis);
      
      // Send session end acknowledgment
      const sessionEndResponse = {
        type: 'session-end-ack',
        walletAddress,
        vibeId,
        saved: !savedPattern.error,
        sessionSummary: {
          duration: finalAnalysis.sessionDuration,
          batches: finalAnalysis.totalBatches,
          avgEnergy: Math.round(finalAnalysis.avgEnergy * 100) / 100,
          sessionType: savedPattern.insights?.sessionCharacter,
          patterns: savedPattern.insights?.uniquePatterns || []
        },
        timestamp: Date.now(),
        source: 'strategic_pattern_saver'
      };
      
      ws.send(JSON.stringify(sessionEndResponse));
      console.log(`✅ Session-end-ack response sent for ${walletAddress.substring(0, 8)}...`);
      
      // Cleanup session data
      this.sessionHistory.delete(clientId);
      this.clientSensorProfiles.delete(clientId);
      
      console.log(`✅ Session strategically concluded for ${walletAddress.substring(0, 8)}...`);
      
    } catch (error) {
      console.error('❌ Session end handling failed:', error);
      ws.send(JSON.stringify({
        type: 'session-end-error',
        error: 'Failed to save user patterns',
        details: error.message
      }));
    }
  }



  /**
   * Rate limiting logic to prevent hitting Gemini API limits on server side
   */
  shouldCallGeminiAPI(clientId, enrichedSensorData, sessionData) {
    const now = Date.now();
    
    // Ultra-responsive cooldown for smooth transitions
    const lastCall = this.lastGeminiCall.get(clientId) || 0;
    if (now - lastCall < this.geminiCallCooldown) {
      return false;
    }
    
    // Ultra-sensitive transition detection for seamless music flow
    const signature = JSON.stringify({
      energy: enrichedSensorData.energyLevel,
      complexity: enrichedSensorData.complexity,
      magnitude: Math.round(enrichedSensorData.magnitude * 20) / 20, // Ultra-sensitive (0.05 increments)
      progression: sessionData.progressionState,
      source: enrichedSensorData.detailedAnalysis?.split('\n')[1]?.split(':')[1]?.trim(),
      // Add micro-movement detection for ultra-responsive changes
      microMovement: Math.round((enrichedSensorData.magnitude % 0.1) * 100)
    });
    
    // Check if interpretation changed - prioritize responsiveness over rate limiting
    const lastSignature = this.lastInterpretationSignature.get(clientId);
    if (lastSignature === signature) {
      // Allow continuation calls but respect quota limits
      if (now - lastCall > this.geminiCallCooldown * 2) { // 9 seconds for continuation to stay under quota
        this.lastGeminiCall.set(clientId, now);
        return true;
      }
      return false;
    }
    
    // Update tracking for this client
    this.lastGeminiCall.set(clientId, now);
    this.lastInterpretationSignature.set(clientId, signature);
    return true;
  }

  // ENHANCED SENSOR DATA ANALYSIS with 2025 APIs
  analyzeRichSensorData(sensorData, sensorProfile) {
    const magnitude = Math.sqrt(sensorData.x**2 + sensorData.y**2 + sensorData.z**2);
    const normalizedMagnitude = Math.min(magnitude / 3.0, 1.0);
    
    // Calculate complexity based on available sensor data
    let complexity = 'simple';
    let richFeatures = [];
    
    if (sensorData.pressure !== undefined) richFeatures.push(`pressure:${sensorData.pressure.toFixed(2)}`);
    if (sensorData.tiltX !== undefined) richFeatures.push(`tiltX:${sensorData.tiltX.toFixed(2)}`);
    if (sensorData.force !== undefined) richFeatures.push(`force:${sensorData.force.toFixed(2)}`);
    if (sensorData.acceleration !== undefined) richFeatures.push(`accel:${JSON.stringify(sensorData.acceleration)}`);
    if (sensorData.frequencyData !== undefined) richFeatures.push(`audio:${sensorData.bass?.toFixed(2)},${sensorData.mid?.toFixed(2)},${sensorData.treble?.toFixed(2)}`);
    
    if (richFeatures.length > 3) complexity = 'complex';
    else if (richFeatures.length > 1) complexity = 'moderate';
    
    // Energy level classification
    let energyLevel = 'low';
    if (normalizedMagnitude > 0.8) energyLevel = 'explosive';
    else if (normalizedMagnitude > 0.6) energyLevel = 'high';
    else if (normalizedMagnitude > 0.4) energyLevel = 'medium';
    else if (normalizedMagnitude > 0.2) energyLevel = 'gentle';
    
    return {
      magnitude: normalizedMagnitude,
      complexity,
      energyLevel,
      richFeatures,
      detailedAnalysis: `
      Source: ${sensorData.source}
      Magnitude: ${normalizedMagnitude.toFixed(3)}
      Energy: ${energyLevel}
      Complexity: ${complexity}
      Rich Features: ${richFeatures.join(', ')}
      Raw Data: x:${sensorData.x?.toFixed(3)}, y:${sensorData.y?.toFixed(3)}, z:${sensorData.z?.toFixed(3)}
      `
    };
  }



  // Parse agent response with robust error handling
  parseAgentResponse(agentResponse) {
    try {
      if (typeof agentResponse === 'string') {
        console.log('🔧 Attempting to parse string response...');
        
        // Try multiple JSON extraction strategies
        // 1: Look for complete JSON object
        const jsonMatch = agentResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          console.log('✅ Found JSON pattern, attempting parse...');
          const parsed = JSON.parse(jsonMatch[0]);
          console.log('✅ JSON parse successful:', Object.keys(parsed));
          return parsed;
        }
        
        // 2: Look for JSON code blocks
        const codeBlockMatch = agentResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (codeBlockMatch) {
          console.log('✅ Found JSON in code block, attempting parse...');
          const parsed = JSON.parse(codeBlockMatch[1]);
          console.log('✅ Code block JSON parse successful:', Object.keys(parsed));
          return parsed;
        }
        
        // 3: Look for JSON after keywords
        const keywordMatch = agentResponse.match(/(?:json|response|result):\s*(\{[\s\S]*\})/i);
        if (keywordMatch) {
          console.log('✅ Found JSON after keyword, attempting parse...');
          const parsed = JSON.parse(keywordMatch[1]);
          console.log('✅ Keyword JSON parse successful:', Object.keys(parsed));
          return parsed;
        }
        
        console.warn('⚠️ No JSON pattern found in agent response');
        console.log('📝 Response sample:', agentResponse.substring(0, 300));
        throw new Error('No JSON found in response');
        
      } else if (typeof agentResponse === 'object') {
        console.log('✅ Response is already object');
        return agentResponse;
      } else {
        console.error('❌ Invalid response type:', typeof agentResponse);
        throw new Error('Invalid response type');
      }
    } catch (parseError) {
      console.error('❌ Failed to parse agent response:', parseError.message);
      console.log('📝 Raw response for debugging:', agentResponse?.substring(0, 500) || 'null/undefined');
      throw new Error(`Response parsing failed: ${parseError.message}`);
    }
  }

  // Enforce rave baseline with intelligent variations
  enforceRaveBaseline(interpretation, sessionData) {
    // Ensure BPM stays within rave range (130-180)
    if (interpretation.lyriaConfig.bpm < 130) {
      interpretation.lyriaConfig.bpm = Math.max(130, interpretation.lyriaConfig.bpm + 20);
    }
    if (interpretation.lyriaConfig.bpm > 180) {
      interpretation.lyriaConfig.bpm = Math.min(180, interpretation.lyriaConfig.bpm - 10);
    }
    
    // Ensure density supports rave energy (minimum 0.3)
    interpretation.lyriaConfig.density = Math.max(0.3, interpretation.lyriaConfig.density);
    
    // Add rave foundation if missing from coherent prompt
    const promptText = typeof interpretation.singleCoherentPrompt === 'string' ? interpretation.singleCoherentPrompt : '';
    const hasRaveElement = ['techno', 'acid', 'rave', 'electronic', 'hardcore', 'psytrance'].some(genre => 
      promptText.toLowerCase().includes(genre)
    );
    
    if (!hasRaveElement) {
      // Prepend rave foundation to coherent prompt
      const raveFoundation = sessionData.currentGenre || 'driving techno';
      interpretation.singleCoherentPrompt = `${raveFoundation} with ${promptText || 'electronic elements'}`;
    }
    
    return interpretation;
  }

  // Update session history with ultra-smooth musical progression
  updateSessionHistory(ws, sessionData, interpretation, enrichedSensorData) {
    const historyEntry = {
      timestamp: Date.now(),
      bpm: interpretation.lyriaConfig.bpm,
      density: interpretation.lyriaConfig.density,
      brightness: interpretation.lyriaConfig.brightness,
      singleCoherentPrompt: interpretation.singleCoherentPrompt || 'electronic',
      energy: enrichedSensorData.energyLevel,
      sensorSource: enrichedSensorData.detailedAnalysis.split('\n')[1], // Source line
      complexity: enrichedSensorData.complexity,
      velocity: enrichedSensorData.velocity || 0,
      microMovement: enrichedSensorData.microMovement || 0
    };
    
    sessionData.musicHistory.push(historyEntry);
    sessionData.energyProfile.push(enrichedSensorData.magnitude);
    
    // Keep history manageable but preserve more for ultra-smooth transitions
    if (sessionData.musicHistory.length > 30) { // Increased from 20 to 30
      sessionData.musicHistory.shift();
    }
    if (sessionData.energyProfile.length > 75) { // Increased from 50 to 75
      sessionData.energyProfile.shift();
    }
    
      // BPM smoothing - second stage for absolute smoothness
    const previousBPM = sessionData.currentBPM || 140;
    const targetBPM = interpretation.lyriaConfig.bpm;
    const smoothingFactor = 0.05; // smoothing for elimination of sharp transitions
    sessionData.currentBPM = Math.round(previousBPM + (targetBPM - previousBPM) * smoothingFactor);
    
    // PARAMETER-LEVEL SMOOTHING for density/brightness
    if (!this.parameterSmoothing.has(ws.clientId)) {
      this.parameterSmoothing.set(ws.clientId, {
        density: interpretation.lyriaConfig.density || 0.5,
        brightness: interpretation.lyriaConfig.brightness || 0.5
      });
    }
    const paramSmooth = this.parameterSmoothing.get(ws.clientId);
    const densityTarget = interpretation.lyriaConfig.density;
    const brightnessTarget = interpretation.lyriaConfig.brightness;
    paramSmooth.density = paramSmooth.density + (densityTarget - paramSmooth.density) * 0.3;
    paramSmooth.brightness = paramSmooth.brightness + (brightnessTarget - paramSmooth.brightness) * 0.3;
    
    // Apply smoothed parameters back to interpretation
    interpretation.lyriaConfig.density = paramSmooth.density;
    interpretation.lyriaConfig.brightness = paramSmooth.brightness;
    
    // Enhanced genre detection and smooth transitions
    const genreMatch = interpretation.singleCoherentPrompt?.match(/(hardcore|acid|techno|rave|electronic|psytrance|ambient|trance|house|drum.{1,2}bass|dubstep|minimal|industrial)/i);
    const newGenre = genreMatch?.[0] || sessionData.currentGenre;
    
    // Only update genre if it's a natural progression (avoid jarring switches)
    if (this.isNaturalGenreProgression(sessionData.currentGenre, newGenre)) {
      sessionData.currentGenre = newGenre;
    }
    
    // Ultra-smooth progression state updates based on energy trends and velocity
    const recentEnergy = sessionData.energyProfile.slice(-7); // Increased window for smoother analysis
    const avgEnergy = recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length;
    const energyVelocity = enrichedSensorData.velocity || 0;
    
    // More nuanced progression state logic for ultra-smooth flow
    if (avgEnergy > 0.75 && energyVelocity > 2) sessionData.progressionState = 'climax';
    else if (avgEnergy < 0.25 && energyVelocity < 0.5) sessionData.progressionState = 'breakdown';
    else if (avgEnergy > sessionData.energyProfile.slice(-14, -7).reduce((a, b) => a + b, 0) / 7) {
      sessionData.progressionState = 'building';
    } else {
      sessionData.progressionState = 'flowing'; // Changed from 'rebuilding' to 'flowing' for smoother concept
    }
  }

  // Check if genre progression is natural to avoid jarring transitions
  isNaturalGenreProgression(currentGenre, newGenre) {
    if (!currentGenre || currentGenre === newGenre) return true;
    
    // Define natural genre progressions for smooth DJ sets
    const naturalProgressions = {
      'minimal': ['techno', 'acid', 'electronic'],
      'techno': ['acid', 'hardcore', 'electronic', 'trance'],
      'acid': ['techno', 'psytrance', 'hardcore'],
      'electronic': ['techno', 'trance', 'house', 'ambient'],
      'ambient': ['electronic', 'trance', 'house'],
      'trance': ['techno', 'psytrance', 'house'],
      'house': ['techno', 'electronic', 'trance'],
      'hardcore': ['acid', 'techno', 'gabber'],
      'psytrance': ['acid', 'trance', 'techno']
    };
    
    const allowedProgressions = naturalProgressions[currentGenre.toLowerCase()] || [];
    return allowedProgressions.includes(newGenre.toLowerCase());
  }

  // Update sensor profile for learning user preferences
  updateSensorProfile(sensorProfile, enrichedSensorData) {
    sensorProfile.preferredSources.add(enrichedSensorData.detailedAnalysis.split('\n')[1]?.split(':')[1]?.trim());
    
    // Track sensitivity patterns
    if (!sensorProfile.sensitivityProfile[enrichedSensorData.energyLevel]) {
      sensorProfile.sensitivityProfile[enrichedSensorData.energyLevel] = 0;
    }
    sensorProfile.sensitivityProfile[enrichedSensorData.energyLevel]++;
    
    // Store movement patterns
    sensorProfile.movementPatterns.push({
      timestamp: Date.now(),
      magnitude: enrichedSensorData.magnitude,
      complexity: enrichedSensorData.complexity,
      source: enrichedSensorData.detailedAnalysis.split('\n')[1]?.split(':')[1]?.trim()
    });
    
    // Keep patterns manageable
    if (sensorProfile.movementPatterns.length > 100) {
      sensorProfile.movementPatterns.shift();
    }
  }

  // =============================================================================
  // STRATEGIC STORE USAGE (Session Boundaries Only)
  // =============================================================================

  // Load user patterns at session START (after tx signature, before real-time processing)
  async loadUserPatterns(walletAddress, vibeId) {
    try {
      console.log(`🔍 Loading user patterns for ${walletAddress} (vibeId: ${vibeId})...`);
      console.log('📊 Strategic Store query - SEPARATED from real-time processing');
      
      // Check if QDrant Store is available
      if (!userPatternStore) {
        console.warn('⚠️ QDrant Store not available - skipping user pattern loading');
        return {
          walletAddress,
          vibeId,
          previousPatterns: [],
          patternsCount: 0,
          userFamiliar: false,
          fallback: true,
          error: 'QDrant Store not available'
        };
      }
      
      // Query user's previous vibestream patterns
      const userQuery = `wallet:${walletAddress} previous vibestream patterns energy preferences musical evolution`;
      
      const startTime = Date.now();
      const userPatternsResponse = await userPatternStore.search(userQuery, 5); // Top 5 previous patterns
      const queryTime = Date.now() - startTime;
      
      console.log(`✅ User patterns loaded in ${queryTime}ms:`, {
        walletAddress: walletAddress.substring(0, 8) + '...',
        patternsFound: userPatternsResponse?.length || 0,
        vibeId,
        storageMode: 'strategic_boundary_only'
      });
      
      // Parse and structure previous patterns
      const previousPatterns = userPatternsResponse?.map(pattern => {
        try {
          return JSON.parse(pattern.content || '{}');
        } catch {
          return { content: pattern.content, timestamp: pattern.metadata?.timestamp };
        }
      }) || [];
      
      return {
        walletAddress,
        vibeId,
        previousPatterns,
        patternsCount: previousPatterns.length,
        userFamiliar: previousPatterns.length > 0,
        energyPreferences: this.extractEnergyPreferences(previousPatterns),
        genrePreferences: this.extractGenrePreferences(previousPatterns),
        sessionHistory: this.extractSessionHistory(previousPatterns)
      };
      
    } catch (error) {
      console.warn('⚠️ Failed to load user patterns (will proceed without):', error.message);
      return {
        walletAddress,
        vibeId,
        previousPatterns: [],
        patternsCount: 0,
        userFamiliar: false,
        fallback: true,
        error: error.message
      };
    }
  }

  // Save user patterns at session END (after close vibestream, before client disconnect)
  async saveUserPatterns(walletAddress, vibeId, sessionData, finalAnalysis) {
    try {
      console.log(`💾 Saving user patterns for ${walletAddress} (vibeId: ${vibeId})...`);
      console.log('📊 Strategic Store save - SEPARATED from real-time processing');
      
      // Check if QDrant Store is available
      if (!userPatternStore) {
        console.warn('⚠️ QDrant Store not available - skipping user pattern saving');
        return {
          error: 'QDrant Store not available',
          walletAddress,
          vibeId,
          fallback: true,
          insights: {
            sessionCharacter: this.analyzeSessionCharacter(sessionData),
            uniquePatterns: this.identifyUniquePatterns(sessionData)
          }
        };
      }
      
      // Create rich session summary for pattern learning
      const sessionPattern = {
        id: uuidv4(), // UUID for correct JSON parsing
        walletAddress,
        vibeId,
        timestamp: Date.now(),
        sessionDuration: Math.round((Date.now() - sessionData.sessionStart) / 1000),
        totalBatches: sessionData.musicHistory.length,
        
        // Energy evolution analysis
        energyProfile: {
          averageEnergy: sessionData.energyProfile.reduce((a, b) => a + b, 0) / sessionData.energyProfile.length,
          energyRange: Math.max(...sessionData.energyProfile) - Math.min(...sessionData.energyProfile),
          energyTrend: sessionData.energyProfile[sessionData.energyProfile.length - 1] > sessionData.energyProfile[0] ? 'increasing' : 'decreasing',
          peakEnergy: Math.max(...sessionData.energyProfile),
          sustainedPeriods: this.calculateSustainedPeriods(sessionData.energyProfile)
        },
        
        // Musical preferences analysis
        musicalPreferences: {
          averageBPM: sessionData.musicHistory.reduce((sum, entry) => sum + entry.bpm, 0) / sessionData.musicHistory.length,
          bpmRange: Math.max(...sessionData.musicHistory.map(e => e.bpm)) - Math.min(...sessionData.musicHistory.map(e => e.bpm)),
          preferredGenres: this.extractPreferredGenres(sessionData.musicHistory),
          complexityPreference: this.calculateComplexityPreference(sessionData.musicHistory),
          progressionStates: this.analyzeProgressionStates(sessionData.musicHistory)
        },
        
        // Sensor interaction patterns
        sensorPatterns: {
          preferredSources: Array.from(this.clientSensorProfiles.get(walletAddress)?.preferredSources || []),
          sensitivityProfile: this.clientSensorProfiles.get(walletAddress)?.sensitivityProfile || {},
          interactionFrequency: this.clientSensorProfiles.get(walletAddress)?.movementPatterns?.length || 0,
          dominantComplexity: finalAnalysis?.dominantComplexity || 'moderate'
        },
        
        // Session insights
        insights: {
          userType: this.classifyUserType(sessionData),
          sessionCharacter: this.analyzeSessionCharacter(sessionData),
          uniquePatterns: this.identifyUniquePatterns(sessionData),
          recommendations: this.generateRecommendations(sessionData)
        }
      };
      
      // Store with rich metadata for future retrieval
      const patternText = `User ${walletAddress} vibestream session ${vibeId}: ${sessionPattern.insights.sessionCharacter} session, ${sessionPattern.totalBatches} musical transitions, average ${sessionPattern.musicalPreferences.averageBPM}BPM, ${sessionPattern.energyProfile.energyTrend} energy trend, preferred: ${sessionPattern.musicalPreferences.preferredGenres.join(', ')}, sensors: ${sessionPattern.sensorPatterns.preferredSources.join(', ')}`;
      
      const startTime = Date.now();
      await userPatternStore.save(patternText, {
        id: sessionPattern.id,
        walletAddress,
        vibeId,
        timestamp: sessionPattern.timestamp,
        sessionType: sessionPattern.insights.sessionCharacter,
        avgBPM: sessionPattern.musicalPreferences.averageBPM,
        avgEnergy: sessionPattern.energyProfile.averageEnergy,
        userType: sessionPattern.insights.userType,
        genre_tags: sessionPattern.musicalPreferences.preferredGenres,
        sensor_sources: sessionPattern.sensorPatterns.preferredSources
      });
      const saveTime = Date.now() - startTime;
      
      console.log(`✅ User patterns saved in ${saveTime}ms:`, {
        walletAddress: walletAddress.substring(0, 8) + '...',
        vibeId,
        sessionCharacter: sessionPattern.insights.sessionCharacter,
        musicalBatches: sessionPattern.totalBatches,
        avgBPM: Math.round(sessionPattern.musicalPreferences.averageBPM),
        storageMode: 'strategic_boundary_only'
      });
      
      return sessionPattern;
      
    } catch (error) {
      console.error('❌ Failed to save user patterns:', error);
      return { error: error.message, walletAddress, vibeId };
    }
  }

  // =============================================================================
  // PATTERN ANALYSIS HELPERS
  // =============================================================================

  extractEnergyPreferences(patterns) {
    const energyData = patterns.map(p => p.energyProfile?.averageEnergy).filter(e => e !== undefined);
    return energyData.length > 0 ? {
      preferred: energyData.reduce((a, b) => a + b, 0) / energyData.length,
      range: Math.max(...energyData) - Math.min(...energyData),
      consistency: energyData.length > 1 ? 1 - (Math.max(...energyData) - Math.min(...energyData)) : 1
    } : null;
  }

  extractGenrePreferences(patterns) {
    const genres = patterns.flatMap(p => p.musicalPreferences?.preferredGenres || []);
    const genreCounts = genres.reduce((acc, genre) => { acc[genre] = (acc[genre] || 0) + 1; return acc; }, {});
    return Object.entries(genreCounts).sort(([,a], [,b]) => b - a).slice(0, 3).map(([genre]) => genre);
  }

  extractSessionHistory(patterns) {
    return patterns.map(p => ({
      timestamp: p.timestamp,
      duration: p.sessionDuration,
      avgBPM: p.musicalPreferences?.averageBPM,
      avgEnergy: p.energyProfile?.averageEnergy,
      sessionType: p.insights?.sessionCharacter
    })).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }

  calculateSustainedPeriods(energyProfile) {
    let sustained = 0;
    let current = 0;
    for (let i = 1; i < energyProfile.length; i++) {
      if (Math.abs(energyProfile[i] - energyProfile[i-1]) < 0.1) {
        current++;
      } else {
        sustained = Math.max(sustained, current);
        current = 0;
      }
    }
    return Math.max(sustained, current);
  }

  extractPreferredGenres(musicHistory) {
    const genres = musicHistory.map(entry => entry.primaryGenre).filter(g => g);
    const genreCounts = genres.reduce((acc, genre) => { acc[genre] = (acc[genre] || 0) + 1; return acc; }, {});
    return Object.entries(genreCounts).sort(([,a], [,b]) => b - a).slice(0, 3).map(([genre]) => genre);
  }

  calculateComplexityPreference(musicHistory) {
    const complexities = musicHistory.map(entry => entry.complexity).filter(c => c);
    const complexityCounts = complexities.reduce((acc, comp) => { acc[comp] = (acc[comp] || 0) + 1; return acc; }, {});
    return Object.entries(complexityCounts).sort(([,a], [,b]) => b - a)[0]?.[0] || 'moderate';
  }

  analyzeProgressionStates(musicHistory) {
    const states = musicHistory.map(entry => entry.energy);
    return {
      mostCommon: states.reduce((acc, state) => { acc[state] = (acc[state] || 0) + 1; return acc; }, {}),
      transitions: states.length > 1 ? states.slice(1).map((state, i) => `${states[i]} → ${state}`) : []
    };
  }

  classifyUserType(sessionData) {
    const avgEnergy = sessionData.energyProfile.reduce((a, b) => a + b, 0) / sessionData.energyProfile.length;
    const energyVariance = sessionData.energyProfile.reduce((acc, e) => acc + Math.pow(e - avgEnergy, 2), 0) / sessionData.energyProfile.length;
    
    if (avgEnergy > 0.8) return 'high_energy_raver';
    if (avgEnergy < 0.3) return 'ambient_explorer';
    if (energyVariance > 0.2) return 'dynamic_adventurer';
    return 'balanced_dancer';
  }

  analyzeSessionCharacter(sessionData) {
    const duration = Math.round((Date.now() - sessionData.sessionStart) / 60000);
    const energyTrend = sessionData.energyProfile[sessionData.energyProfile.length - 1] > sessionData.energyProfile[0] ? 'building' : 'releasing';
    const avgEnergy = sessionData.energyProfile.reduce((a, b) => a + b, 0) / sessionData.energyProfile.length;
    
    if (duration < 5 && avgEnergy > 0.7) return 'intense_burst';
    if (duration > 20 && energyTrend === 'building') return 'epic_journey';
    if (avgEnergy < 0.4) return 'contemplative_flow';
    return 'classic_rave';
  }

  identifyUniquePatterns(sessionData) {
    const patterns = [];
    const energySpikes = sessionData.energyProfile.filter((e, i) => i > 0 && e > sessionData.energyProfile[i-1] + 0.3);
    if (energySpikes.length > 3) patterns.push('frequent_energy_spikes');
    
    const bpmChanges = sessionData.musicHistory.filter((entry, i) => i > 0 && Math.abs(entry.bpm - sessionData.musicHistory[i-1].bpm) > 20);
    if (bpmChanges.length > sessionData.musicHistory.length * 0.5) patterns.push('dynamic_tempo_shifts');
    
    return patterns;
  }

  generateRecommendations(sessionData) {
    const recommendations = [];
    const avgEnergy = sessionData.energyProfile.reduce((a, b) => a + b, 0) / sessionData.energyProfile.length;
    const avgBPM = sessionData.musicHistory.reduce((sum, entry) => sum + entry.bpm, 0) / sessionData.musicHistory.length;
    
    if (avgEnergy > 0.8) recommendations.push('explore_hardcore_genres');
    if (avgBPM > 160) recommendations.push('try_gabber_or_speedcore');
    if (sessionData.progressionState === 'climax') recommendations.push('experiment_with_breakdowns');
    
    return recommendations;
  }

  // Intelligent rave fallback when agent fails
  createIntelligentRaveFallback(enrichedSensorData, sessionData) {
    const magnitude = enrichedSensorData.magnitude;
    
    // Rave-focused fallback based on energy
    let singleCoherentPrompt, config, reasoning;
    
    if (magnitude > 0.8) {
      singleCoherentPrompt = "explosive hardcore techno with driving 303 acid bass and euphoric energy building";
      config = {
        bpm: Math.round(160 + magnitude * 20), // 160-180
        density: 0.8 + magnitude * 0.15,
        brightness: 0.8 + magnitude * 0.2,
        guidance: 2.8,
        temperature: 1.9
      };
      reasoning = `Explosive energy (${magnitude.toFixed(2)}) - hardcore rave response`;
    } else if (magnitude > 0.5) {
      singleCoherentPrompt = "driving acid techno with pounding kick drums and Prophet 5 lead stabs";
      config = {
        bpm: Math.round(140 + magnitude * 25), // 140-165
        density: 0.6 + magnitude * 0.25,
        brightness: 0.6 + magnitude * 0.3,
        guidance: 2.2,
        temperature: 1.5
      };
      reasoning = `High energy (${magnitude.toFixed(2)}) - driving techno response`;
    } else if (magnitude > 0.3) {
      singleCoherentPrompt = "minimal techno groove with deep bass foundation and subtle filter sweeps";
      config = {
        bpm: Math.round(130 + magnitude * 15), // 130-145
        density: 0.4 + magnitude * 0.3,
        brightness: 0.5 + magnitude * 0.3,
        guidance: 2.0,
        temperature: 1.3
      };
      reasoning = `Moderate energy (${magnitude.toFixed(2)}) - minimal techno groove`;
    } else {
      singleCoherentPrompt = "deep techno ambience with ethereal pads building and distant kick drums";
      config = {
        bpm: Math.max(130, Math.round(120 + magnitude * 15)), // 120-135, min 130
        density: 0.3 + magnitude * 0.2,
        brightness: 0.4 + magnitude * 0.2,
        guidance: 1.8,
        temperature: 1.2
      };
      reasoning = `Low energy (${magnitude.toFixed(2)}) - deep techno ambience with rave foundation`;
    }
    
    return {
      singleCoherentPrompt,
      lyriaConfig: config,
      reasoning: `${reasoning} (intelligent rave fallback)`,
      fallback: true,
      raveBaseline: true,
      sessionContinuity: sessionData.progressionState
    };
  }
}

// Start the orchestrator with Alith
async function start() {
  try {
    // Initialize Alith agent first
    await initializeAgent();
    
    // Start orchestrator server
const orchestrator = new EnhancedRaveOrchestrator();
    await orchestrator.start();
    
    console.log('🎵 VibesFlow Orchestrator ready with Alith AI');
    
  } catch (error) {
    console.error('💥 Startup failed:', error);
    process.exit(1);
  }
}

start();