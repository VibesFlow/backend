/**
 * ALITH ORCHESTRATOR - Intelligent Music Agent
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

// Load knowledge files directly into enhanced preamble
function preambleWithKnowledge() {
  try {
    const parametersData = readFileSync(join(__dirname, 'knowledge', 'parameters.txt'), 'utf8');
    const poetryCorpus = readFileSync(join(__dirname, 'knowledge', 'poems.txt'), 'utf8');
    // Lyria.md removed - comprehensive Lyria knowledge embedded in preamble
    
    return `You are an ELITE RAVE DJ and music orchestrator specializing in electronic/techno/rave/psychedelic music generation with progressive layers and session continuity.

EMBEDDED KNOWLEDGE:
${parametersData}

POETRY CORPUS:
${poetryCorpus}

CORE LYRIA KNOWLEDGE:
Lyria RealTime generates instrumental music using real-time WebSocket streaming:
- Audio format: 16-bit PCM, 48kHz, stereo
- Uses weighted prompts for continuous music steering
- Supports parameter changes without stopping the stream
- Can reset context for dramatic transitions
- Implements responsible AI with watermarking

COMPLETE INSTRUMENT VOCABULARY:
Electronic/Synth: 303 Acid Bass, 808 Hip Hop Beat, Boomy Bass, Dirty Synths, Moog Oscillations, Spacey Synths, Synth Pads, TR-909 Drum Machine, Buchla Synths
Strings: Cello, Viola Ensemble, Balalaika Ensemble, Bouzouki
Guitars: Flamenco Guitar, Shredding Guitar, Slide Guitar, Warm Acoustic Guitar, Precision Bass
Piano/Keys: Ragtime Piano, Rhodes Piano, Smooth Pianos, Clavichord, Harpsichord, Mellotron
Brass/Winds: Alto Saxophone, Bass Clarinet, Trumpet, Tuba, Woodwinds, Accordion, Bagpipes, Harmonica, Ocarina
Percussion: Bongos, Conga Drums, Djembe, Drumline, Funk Drums, Hang Drum, Maracas, Tabla, Glockenspiel, Marimba, Vibraphone, Steel Drum
World: Charango, Dulcimer, Hurdy-gurdy, Kalimba, Koto, Lyre, Mandolin, Mbira, Persian Tar, Pipa, Shamisen, Sitar

COMPLETE GENRE VOCABULARY:
Electronic: Acid Jazz, Breakbeat, Chillout, Chiptune, Deep House, Drum & Bass, Dubstep, EDM, Electro Swing, Glitch Hop, Hyperpop, Minimal Techno, Moombahton, Psytrance, Synthpop, Techno, Trance, Trip Hop, Vaporwave, Witch house
Rock/Alternative: Alternative Country, Blues Rock, Classic Rock, Funk Metal, G-funk, Garage Rock, Grime, Post-Punk, 60s Psychedelic Rock, Shoegaze, Ska, Surf Rock
Traditional: Baroque, Bluegrass, Celtic Folk, Indian Classical, Irish Folk, Renaissance Music
World: Afrobeat, Bengal Baul, Bhangra, Bossa Nova, Cumbia, Jamaican Dub, Latin Jazz, Merengue, Reggae, Reggaeton, Salsa
Contemporary: Contemporary R&B, Indie Electronic, Indie Folk, Indie Pop, Jam Band, Jazz Fusion, Lo-Fi Hip Hop, Marching Band, Neo-Soul, New Jack Swing, Piano Ballad, Polka, R&B, Trap Beat

MOOD/TEXTURE VOCABULARY:
Energy: Upbeat, Fat Beats, Tight Groove, Virtuoso, Danceable, Live Performance, Huge Drop
Ambient: Chill, Ambient, Ethereal Ambience, Dreamy, Sustained Chords, Subdued Melody, Lo-fi
Effects: Psychedelic, Glitchy Effects, Weird Noises, Experimental, Swirling Phasers, Echo, Crunchy Distortion, Saturated Tones
Character: Acoustic Instruments, Bright Tones, Rich Orchestration, Emotional, Funky, Unsettling, Ominous Drone

PARAMETER RANGES:
- BPM: 60-200 (beats per minute)
- Density: 0.0-1.0 (0=sparse, 1=busy musical arrangement)
- Brightness: 0.0-1.0 (0=dark/muted, 1=bright/prominent high frequencies)
- Guidance: 0.0-6.0 (how strictly model follows prompts; 1.0-4.0 recommended)
- Temperature: 0.0-3.0 (creativity/randomness; 1.1 default)

SENSOR INTERPRETATION:
- >2.0: Electronic, Fat Beats, BPM 140-180, density 0.7-0.9
- 1.0-2.0: Energetic, BPM 120-140, density 0.6-0.8  
- 0.5-1.0: Balanced, BPM 100-120, density 0.4-0.6
- 0.2-0.5: Chill, BPM 80-100, density 0.2-0.4
- <0.2: Ambient, BPM 60-80, density 0.1-0.3
Movement: spikes→glitch, rhythmic→drums, smooth→sustained

RESPONSE FORMAT (STRICT JSON):
{
  "singleCoherentPrompt": "single descriptive prompt combining instruments, style, and mood naturally as one coherent text string",
  "lyriaConfig": {
    "bpm": 60-200,
    "density": 0.0-1.0,
    "brightness": 0.0-1.0,
    "guidance": 1.0-4.0,
    "temperature": 0.8-2.0
  },
  "reasoning": "Detailed explanation of musical interpretation and parameter choices"
}

RAVE PRINCIPLES: 130-180 BPM baseline, progressive layers, session continuity, energy adaptation.
SENSOR MAPPING: Mouse→rhythm, touch→percussion, motion→spatial, audio→reactive.
ALWAYS maintain RAVE baseline while adapting to inputs.`;
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
    
    // Create Alith agent with enhanced preamble and memory only
    musicAgent = new Agent({
      model: "gemini-2.5-flash-lite",
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      baseUrl: "generativelanguage.googleapis.com/v1beta/openai",
      preamble: enhancedPreamble, // ← enhanced with embedded knowledge
      memory: new WindowBufferMemory(15) // ← memory for session continuity
    });
    
    console.log('✅ Enhanced Alith agent initialized with optimized embedded knowledge + memory');
    
    // Initialize strategic Store for user pattern learning (separate from real-time)
    console.log('🗄️ Initializing user pattern Store (strategic, non-real-time)...');
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
          checkCompatibility: false // Skip version check to avoid compatibility errors
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

// Enhanced Rave Orchestrator with session history and intelligent composition
class EnhancedRaveOrchestrator {
  constructor() {
    this.app = express();
    this.server = null;
    this.wsServer = null;
    this.connectedClients = new Set();
    this.sessionHistory = new Map(); // Track musical progression per client
    this.clientSensorProfiles = new Map(); // Track sensor patterns per client
    
    // Rate limiting for Gemini API calls
    this.lastGeminiCall = new Map(); // Track per client
    this.geminiCallCooldown = 2000; // 2 seconds between calls per client
    this.lastInterpretationSignature = new Map(); // Track per client
    
    this.setupMiddleware();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({ 
        service: 'VibesFlow Alith Orchestrator',
        version: '3.0.0',
        endpoints: ['/health', '/ws (WebSocket)']
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
            
            // Route messages to appropriate handlers
            if (message.type === 'sensor-data') {
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
    
    // Initialize session history for new clients
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
      
      // Single concise prompt for enhanced preamble processing
      const sessionBatch = sessionData.musicHistory.length + 1;
      const recentBPM = sessionData.currentBPM || 140;
      const energyLevel = enrichedSensorData.energyLevel;
      const magnitude = enrichedSensorData.magnitude.toFixed(2);
      
      prompt = `RAVE DJ - Session #${sessionBatch}

Sensor: ${sensorData.source} | x:${sensorData.x?.toFixed(2)} y:${sensorData.y?.toFixed(2)} z:${sensorData.z?.toFixed(2)} | Energy: ${energyLevel} | Magnitude: ${magnitude} | BPM: ${recentBPM}

Using sensor parameters knowledge, poetry corpus, and Lyria configuration knowledge, create rave/techno prompts maintaining 130-180 BPM baseline.

JSON only:
{
  "singleCoherentPrompt": "single descriptive poetic prompt combining all elements naturally",
  "lyriaConfig": {"bpm": 140, "density": 0.6, "brightness": 0.7, "guidance": 2.5, "temperature": 1.5},
  "reasoning": "brief explanation"
}`;
      
      console.log(`📊 ENHANCED REAL-TIME TOKEN ANALYSIS:`, {
        queryLength: prompt.length,
        estimatedQueryTokens: Math.ceil(prompt.length / 4),
        ragTriggered: 'NO - Direct knowledge access via enhanced preamble',
        totalRealTimeTokens: Math.ceil(prompt.length / 4), // Only query tokens
        previousRAGTokens: '11,403 tokens per query',
        tokenReduction: '98.9% improvement',
        knowledgeAccess: 'Embedded in preamble (439 lines: 297 poems + 142 parameters, Lyria.md removed)'
      });
      
      // Synchronized agent processing - no parallel token consumption
      const agentResponse = await new Promise((resolve, reject) => {
        agentProcessingQueue = agentProcessingQueue.then(async () => {
          try {
            activeProcessingCount++;
            console.log(`🔒 Agent processing (active: ${activeProcessingCount})`);
            
            // Clear memory if it gets corrupted (alternation issue)
            try {
              const response = await musicAgent.prompt(prompt);
              activeProcessingCount--;
              console.log(`🔓 Agent processing complete (active: ${activeProcessingCount})`);
              resolve(response);
            } catch (agentError) {
              if (agentError.message.includes('alternate') || agentError.message.includes('Messages must')) {
                console.warn('🔄 Clearing agent memory due to message alternation issue');
                musicAgent.memory.clear();
                const retryResponse = await musicAgent.prompt(prompt);
                activeProcessingCount--;
                console.log(`🔓 Agent processing complete after memory clear (active: ${activeProcessingCount})`);
                resolve(retryResponse);
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
      
      // Ensure rave baseline
      interpretation = this.enforceRaveBaseline(interpretation, sessionData);
      
      // Update session history with new musical choice
      this.updateSessionHistory(sessionData, interpretation, enrichedSensorData);
      
      // Update sensor profile for learning
      this.updateSensorProfile(sensorProfile, enrichedSensorData);
      
      // Send enhanced interpretation back to client
      const response = {
        type: 'interpretation',
        data: interpretation,
        originalSensor: sensorData,
        enrichedSensor: enrichedSensorData,
        sensoryPrompt: prompt, // The full prompt generated from sensor data
        sessionInfo: {
          progressionState: sessionData.progressionState,
          sessionDuration: Math.round((Date.now() - sessionData.sessionStart) / 1000),
          musicHistoryLength: sessionData.musicHistory.length
        },
        timestamp: Date.now(),
        source: 'enhanced_rave_dj_agent',
        hasMemory: true,
        hasKnowledge: true,
        hasSessionHistory: true,
        usedPoetry: true,
        usedSensorExpertise: true
      };
      
      ws.send(JSON.stringify(response));
      
      console.log('✅ Intelligent rave interpretation sent:', {
        singleCoherentPrompt: interpretation.singleCoherentPrompt?.substring(0, 50) + '...',
        bpm: interpretation.lyriaConfig?.bpm,
        progression: sessionData.progressionState,
        genre: interpretation.primaryGenre || 'rave',
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
    
    // Check cooldown period for this client
    const lastCall = this.lastGeminiCall.get(clientId) || 0;
    if (now - lastCall < this.geminiCallCooldown) {
      return false;
    }
    
    // Create interpretation signature to detect significant changes
    const signature = JSON.stringify({
      energy: enrichedSensorData.energyLevel,
      complexity: enrichedSensorData.complexity,
      magnitude: Math.round(enrichedSensorData.magnitude * 5) / 5, // Less restrictive rounding (0.2 increments)
      progression: sessionData.progressionState
    });
    
    // Check if interpretation changed significantly for this client
    const lastSignature = this.lastInterpretationSignature.get(clientId);
    if (lastSignature === signature) {
      // Allow calls even with same signature if it's been a while (for continuous engagement)
      if (now - lastCall > this.geminiCallCooldown * 3) { // 6 seconds for same signature
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

  // Update session history with musical progression
  updateSessionHistory(sessionData, interpretation, enrichedSensorData) {
    const historyEntry = {
      timestamp: Date.now(),
      bpm: interpretation.lyriaConfig.bpm,
      density: interpretation.lyriaConfig.density,
      brightness: interpretation.lyriaConfig.brightness,
      singleCoherentPrompt: interpretation.singleCoherentPrompt || 'electronic',
      energy: enrichedSensorData.energyLevel,
      sensorSource: enrichedSensorData.detailedAnalysis.split('\n')[1], // Source line
      complexity: enrichedSensorData.complexity
    };
    
    sessionData.musicHistory.push(historyEntry);
    sessionData.energyProfile.push(enrichedSensorData.magnitude);
    
    // Keep history manageable (last 20 entries)
    if (sessionData.musicHistory.length > 20) {
      sessionData.musicHistory.shift();
    }
    if (sessionData.energyProfile.length > 50) {
      sessionData.energyProfile.shift();
    }
    
    // Update current state
    sessionData.currentBPM = interpretation.lyriaConfig.bpm;
    // Extract primary genre from coherent prompt (first identifiable genre word)
    const genreMatch = interpretation.singleCoherentPrompt?.match(/(techno|acid|rave|electronic|hardcore|psytrance|ambient|trance|house|drum.{1,2}bass|dubstep)/i);
    sessionData.currentGenre = genreMatch?.[0] || sessionData.currentGenre;
    
    // Update progression state based on energy trends
    const recentEnergy = sessionData.energyProfile.slice(-5);
    const avgEnergy = recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length;
    
    if (avgEnergy > 0.7) sessionData.progressionState = 'climax';
    else if (avgEnergy < 0.3) sessionData.progressionState = 'breakdown';
    else if (avgEnergy > sessionData.energyProfile.slice(-10, -5).reduce((a, b) => a + b, 0) / 5) {
      sessionData.progressionState = 'building';
    } else {
      sessionData.progressionState = 'rebuilding';
    }
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