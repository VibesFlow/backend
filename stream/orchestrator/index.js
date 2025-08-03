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
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Custom QdrantStore that generates proper UUIDs for QDrant compatibility
class ExtendedQdrantStore extends QdrantStore {
  async save(value) {
    const vectors = await this.embedTexts([value]);
    await this.client.upsert(this.collectionName, {
      points: [
        {
          id: randomUUID(), // Use proper UUID instead of random string
          vector: vectors[0],
          payload: { text: value },
        },
      ],
    });
  }

  async saveDocs(values) {
    const vectors = await this.embedTexts(values);
    const points = values.map((value, index) => ({
      id: randomUUID(), // Use proper UUID instead of random string
      vector: vectors[index],
      payload: { text: value },
    }));
    await this.client.upsert(this.collectionName, {
      points,
    });
  }

  async embedTexts(text) {
    return this.embeddings.embedTexts(text);
  }

  async reset() {
    try {
      await this.client.deleteCollection(this.collectionName);
      console.log(`🗑️ Deleted existing collection ${this.collectionName}`);
    } catch (error) {
      // Collection might not exist, which is fine
      console.log(`Collection ${this.collectionName} doesn't exist yet, creating new one`);
    }
    
    try {
    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: 768, // Embedding size for Google text-embedding-004 (768 dimensions)
        distance: "Cosine",
      },
    });
      console.log(`✅ Created collection ${this.collectionName} with 768 dimensions`);
    } catch (error) {
      if (error.status === 409) {
        console.log(`Collection ${this.collectionName} already exists, continuing...`);
      } else {
        throw error;
      }
    }
  }
}

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';

// ENHANCED RAVE DJ KNOWLEDGE for Alith agent - comprehensive expertise
const EXPERT_RAVE_DJ_PREAMBLE = `You are an ELITE RAVE DJ and music orchestrator with deep expertise in electronic/techno/rave/psychedelic music generation. You specialize in creating IMMERSIVE RAVE EXPERIENCES with progressive layers, session continuity, and intelligent composition.

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

INTELLIGENT SENSOR INTERPRETATION:
Analyze sensor data patterns to create musical narratives:

1. MAGNITUDE ANALYSIS:
   - Very High (>2.0): Electronic genres, Fat Beats, Upbeat, Huge Drop, BPM 140-180, density 0.7-0.9
   - High (1.0-2.0): Energetic styles, increase BPM to 120-140, density 0.6-0.8
   - Medium (0.5-1.0): Balanced approach, BPM 100-120, density 0.4-0.6
   - Low (0.2-0.5): Chill styles, BPM 80-100, density 0.2-0.4
   - Very Low (<0.2): Ambient/ethereal, BPM 60-80, density 0.1-0.3

2. MOVEMENT PATTERNS:
   - Sudden spikes: Glitchy Effects, dramatic transitions, additional music layers
   - Rhythmic patterns: Match drum patterns, use percussion instruments
   - Smooth changes: Gradual parameter evolution, Sustained Chords
   - Repetitive motion: Tight Groove, consistent rhythmic elements

3. DIRECTIONAL ANALYSIS:
   - X-axis (left-right): Affects stereo characteristics and brightness
   - Y-axis (up-down): Influences pitch range and harmonic complexity
   - Z-axis (forward-back): Controls depth, reverb, and spatial elements

4. TEMPORAL CONTEXT:
   - Build musical continuity over time
   - Remember previous interpretations for smooth transitions
   - Anticipate user movement patterns
   - Create narrative arc in the music

RESPONSE FORMAT (STRICT JSON):
{
  "weightedPrompts": [
    {"text": "specific_instrument_or_style", "weight": 0.1-1.0},
    {"text": "mood_or_texture", "weight": 0.1-1.0}
  ],
  "lyriaConfig": {
    "bpm": 60-200,
    "density": 0.0-1.0,
    "brightness": 0.0-1.0,
    "guidance": 1.0-4.0,
    "temperature": 0.8-2.0
  },
  "reasoning": "Detailed explanation of musical interpretation and parameter choices"
}

Your mission: Transform rich sensor data into IMMERSIVE RAVE EXPERIENCES with progressive layers, session continuity, and intelligent composition that adapts to user energy while maintaining the core RAVE ETHOS.

You have access to:
- Complete Lyria RealTime API knowledge 
- Rich poetry corpus for expressive prompts
- Advanced sensor interpretation expertise (device motion, touch pressure, audio analysis, stylus data)
- Session history for musical continuity
- Progressive layering techniques

RAVE MUSIC PRINCIPLES:
- BASELINE: Always start with rave/techno/psychedelic foundation (130-180 BPM)
- PROGRESSIVE LAYERS: Build complexity over time (drums → bass → synths → effects → atmospheric)
- SESSION CONTINUITY: Reference previous music choices for coherent narrative
- ENERGY ADAPTATION: Match user input intensity while maintaining rave core
- SONIC RICHNESS: Use multiple instruments, effects, and textural elements

SENSOR INTERPRETATION MASTERY:
- Mouse/Pointer: acceleration, jerk, pressure, tilt → rhythm patterns, filter sweeps
- Touch: force, radius, rotation → percussion layers, texture changes
- Device Motion: orientation, rotation → spatial effects, stereo panning  
- Audio Input: frequency analysis → reactive elements, harmonic responses
- Multi-sensor fusion: Create complex musical responses from combined inputs

ALWAYS maintain the RAVE baseline while intelligently adapting to user inputs.`;

// Alith agent with memory, RAG, and store modules. Using Gemini 2.5 Flash Lite
let musicAgent;
let knowledgeStore;

async function initializeAgent() {
  try {
    console.log('🧠 Initializing Alith agent...');
    
    // Initialize embeddings for RAG knowledge store - full Alith configuration
    const embeddings = new RemoteModelEmbeddings(
      "text-embedding-004", // Google's embeddings model from js-genai
      process.env.GOOGLE_GENERATIVE_AI_API_KEY, // API key for embeddings module
      "generativelanguage.googleapis.com/v1beta/openai" // baseUrl without https:// and /
    );
    
    // Create Qdrant knowledge store with UUID compatibility
    knowledgeStore = new ExtendedQdrantStore(embeddings, "lyria_music_knowledge", {
      url: "http://localhost:6333",
      timeout: 30000 // 30 second timeout for stability
    });
    
    // Initialize collection in QDrant before saving data
    await knowledgeStore.reset();
    console.log('✅ QDrant collection created successfully');
    
    // LOAD EXTERNAL KNOWLEDGE SOURCES - complete unfiltered knowledge
    console.log('📖 Loading complete external knowledge sources for intelligent agent decisions...');
    
        try {
      // Load complete Lyria documentation
      const lyriaKnowledge = readFileSync(join(__dirname, 'knowledge', 'lyria_complete.md'), 'utf8');
      await knowledgeStore.save(`COMPLETE_LYRIA_DOCUMENTATION:\n${lyriaKnowledge}`);
      
      // Load complete sensor interpretation guide  
      const sensorKnowledge = readFileSync(join(__dirname, 'knowledge', 'sensor_interpretation.md'), 'utf8');
      await knowledgeStore.save(`COMPLETE_SENSOR_INTERPRETATION:\n${sensorKnowledge}`);
      
      // Load COMPLETE 2025 sensor parameters research data (unfiltered)
      const parametersData = readFileSync(join(__dirname, 'knowledge', 'parameters.txt'), 'utf8');
      await knowledgeStore.save(`COMPLETE_SENSOR_PARAMETERS_RESEARCH:\n${parametersData}`);
      
      // Load poetry expression guide
      const poetryGuide = readFileSync(join(__dirname, 'knowledge', 'poetry_guide.md'), 'utf8');
      await knowledgeStore.save(`POETRY_EXPRESSION_GUIDE:\n${poetryGuide}`);
      
      // Load COMPLETE poetry corpus (unfiltered raw data) from references
      const poetryCorpus = readFileSync(join(__dirname, 'knowledge', 'poems.txt'), 'utf8');
      await knowledgeStore.save(`COMPLETE_POETRY_CORPUS_RAW_DATA:\n${poetryCorpus}`);
      
      // Load complete Lyria.md from local knowledge directory (unfiltered)
      const lyriaReference = readFileSync(join(__dirname, 'knowledge', 'Lyria.md'), 'utf8');
      await knowledgeStore.save(`COMPLETE_LYRIA_REFERENCE_DOCUMENTATION:\n${lyriaReference}`);
      
      console.log('✅ All external knowledge sources loaded successfully (unfiltered raw data)');
    } catch (error) {
      console.warn('⚠️ Some external knowledge files could not be loaded:', error.message);
    }
    
    // Minimal baseline - let agent use its intelligence to build upon this
    await knowledgeStore.save(`RAVE_BASELINE_FOUNDATION: Core requirement is maintaining rave/techno/psychedelic foundation (130-180 BPM) with progressive layering. Use your intelligence to access complete knowledge sources above and make sophisticated musical decisions based on session history and rich sensor data.`);
    
    // Create Alith agent with Gemini configuration using OpenAI-compatible endpoint
    musicAgent = new Agent({
      model: "gemini-2.5-flash-lite",
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY, // Google API key
      baseUrl: "generativelanguage.googleapis.com/v1beta/openai", // Google's OpenAI-compatible endpoint
      preamble: EXPERT_RAVE_DJ_PREAMBLE,
      memory: new WindowBufferMemory(15), // Memory module - remembers last 15 interactions
      store: knowledgeStore // RAG module - enables knowledge-augmented responses
    });
    
    console.log('✅ Alith agent initialized with memory and RAG');
    
  } catch (error) {
    console.error('❌ Alith agent initialization failed:', error);
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
    this.geminiCallCooldown = 10000; // 10 seconds between calls per client
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
        this.connectedClients.add(ws);
        
        console.log(`🔌 Client connected: ${clientId}`);
        
        ws.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString());
            await this.handleSensorData(ws, message);
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
          const wsEndpoint = process.env.NODE_ENV === 'production' ? 'wss://stream.vibesflow.ai' : `ws://localhost:${port}`;
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
    
    // Enhanced sensor data analysis with 2025 APIs
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
    
    // Create intelligent prompt with session continuity
    const sessionContext = this.buildSessionContext(sessionData, enrichedSensorData);
    
    const prompt = `
    ELITE RAVE DJ - FULL KNOWLEDGE SYNTHESIS REQUEST:
    
    CURRENT SESSION STATE:
    ${sessionContext}
    
    RICH SENSOR ANALYSIS:
    ${enrichedSensorData.detailedAnalysis}
    
    USE YOUR COMPLETE KNOWLEDGE BASE:
    
    1. **ACCESS POETRY CORPUS**: Query your complete poetry collection for vivid imagery that matches the current energy. Use lines like "Fire to the wire, Fire to the boughs, Fire fire fire" for explosive energy, or "pirouettes, pirouettes, pirouettes: this is the worlds' carousel" for spinning/circular motions.
    
    2. **APPLY SENSOR EXPERTISE**: Use your comprehensive 2025 sensor knowledge to create sophisticated musical mappings:
       - Pressure/Force data → percussion velocity, filter resonance
       - Tilt/Motion data → spatial effects, stereo panning  
       - Multi-sensor fusion → complex polyrhythms, layered textures
    
    3. **LEVERAGE LYRIA MASTERY**: Apply best practices for coherent sessions:
       - Batch complementary elements in single weighted prompts for continuity
       - Build tridimensional layers (X→stereo, Y→harmony, Z→depth)  
       - Maintain rave foundation while adding intelligent variations
    
    4. **SESSION NARRATIVE**: Reference previous musical choices and create progressive evolution rather than sudden changes.
    
    SPECIFIC REQUIREMENTS:
    - Create RICH, POETIC weighted prompts using imagery from your poetry knowledge
    - Use technical sensor interpretation expertise for precise musical control
    - Build upon session history for narrative continuity
    - Apply Lyria best practices for multi-layered, coherent rave experience
    - Generate reasoning that shows your knowledge synthesis process
    
    **EXAMPLE RICH PROMPT STYLE**: Instead of "techno bass", create "driving 303 acid bass cutting through smoke machine haze like electronic lightning, building euphoric tension in the warehouse cathedral"
    
    **RESPONSE FORMAT**: You MUST respond with VALID JSON in this exact format:
    {
      "weightedPrompts": [
        {"text": "rich poetic description using your poetry knowledge", "weight": 0.6},
        {"text": "technical sensor-inspired element", "weight": 0.3},
        {"text": "atmospheric poetry-derived imagery", "weight": 0.1}
      ],
      "lyriaConfig": {
        "bpm": <130-180 for rave baseline>,
        "density": <0.0-1.0>,
        "brightness": <0.0-1.0>,
        "guidance": <1.0-4.0>,
        "temperature": <0.8-2.0>
      },
      "reasoning": "Detailed explanation showing synthesis of poetry, sensor data, and Lyria expertise",
      "sessionContinuity": "<building/climax/breakdown/rebuilding>",
      "poetryReference": "specific poetry line or imagery used",
      "sensorMapping": "how sensor data influenced the musical choices"
    }
    
    Use your COMPLETE knowledge base to create rich, expressive content. NO FALLBACKS.
    `;
    
    try {
      console.log('🧠 Processing enhanced sensor data with Alith DJ agent...');
      console.log('📋 Agent prompt preview:', prompt.substring(0, 200) + '...');
      
      // Get intelligent interpretation from enhanced Alith agent
      const agentResponse = await musicAgent.prompt(prompt);
      console.log('🎵 Enhanced Alith DJ response received:', agentResponse?.substring(0, 150) + '...');
      console.log('🔍 Full agent response length:', agentResponse?.length || 0);
      
      // Parse and validate agent response
      let interpretation = this.parseAgentResponse(agentResponse);
      console.log('✅ Agent response parsed successfully:', {
        hasPrompts: !!interpretation.weightedPrompts,
        promptCount: interpretation.weightedPrompts?.length || 0,
        hasBPM: !!interpretation.lyriaConfig?.bpm,
        hasReasoning: !!interpretation.reasoning
      });
      
      // Ensure rave baseline compliance
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
      
      console.log('✅ FULL INTELLIGENCE rave interpretation sent:', {
        prompts: interpretation.weightedPrompts?.length,
        bpm: interpretation.lyriaConfig?.bpm,
        progression: sessionData.progressionState,
        genre: interpretation.primaryGenre || 'rave',
        reasoning: interpretation.reasoning?.substring(0, 50) + '...'
      });
      
    } catch (error) {
      console.error('❌ Enhanced rave agent processing failed - DETAILED ERROR:', {
        message: error.message,
        stack: error.stack?.substring(0, 300),
        agentInitialized: !!musicAgent,
        knowledgeStoreInitialized: !!knowledgeStore
      });
      // Fallback to intelligent rave interpretation
      const fallbackInterpretation = this.createIntelligentRaveFallback(enrichedSensorData, sessionData);
      ws.send(JSON.stringify({
        type: 'interpretation',
        data: fallbackInterpretation,
        originalSensor: sensorData,
        sensoryPrompt: prompt, // Include the prompt even in fallback
        timestamp: Date.now(),
        source: 'enhanced_rave_fallback',
        fallback: true,
        error: error.message
      }));
    }
  }

  createFallbackInterpretation(sensorData) {
    return this.createIntelligentFallback(sensorData, 'json_parse_error');
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
      magnitude: Math.round(enrichedSensorData.magnitude * 10) / 10,
      progression: sessionData.progressionState
    });
    
    // Check if interpretation changed significantly for this client
    const lastSignature = this.lastInterpretationSignature.get(clientId);
    if (lastSignature === signature) {
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

  // BUILD RICH SESSION CONTEXT for intelligent agent prompting
  buildSessionContext(sessionData, enrichedSensorData) {
    const sessionDuration = Math.round((Date.now() - sessionData.sessionStart) / 60000);
    const recentHistory = sessionData.musicHistory.slice(-5); // Last 5 for richer context
    const batchNumber = sessionData.musicHistory.length + 1;
    
    // Build rich historical narrative
    const historyNarrative = recentHistory.length > 0 
      ? recentHistory.map((entry, i) => {
          const batchIndex = sessionData.musicHistory.length - recentHistory.length + i + 1;
          return `  Batch ${batchIndex}: ${entry.primaryGenre || 'unknown'} at ${entry.bpm}BPM - ${entry.reasoning || 'no details'}`;
        }).join('\n')
      : '  First session batch - establish foundation';
    
    // Energy evolution analysis
    const energyTrend = sessionData.energyProfile.length >= 2 
      ? (sessionData.energyProfile[sessionData.energyProfile.length - 1] > sessionData.energyProfile[0] ? 'increasing' : 'decreasing')
      : 'establishing baseline';
    
    return `
    COMPLETE SESSION INTELLIGENCE:
    
    FOUNDATIONAL STATE:
    - Duration: ${sessionDuration} minutes
    - Current Batch: #${batchNumber} (${batchNumber <= 3 ? 'FOUNDATION PHASE - Establish Identity' : batchNumber <= 7 ? 'LAYERING PHASE - Build Complexity' : 'EVOLUTION PHASE - Progressive Development'})
    - Progression State: ${sessionData.progressionState}
    - Current BPM: ${sessionData.currentBPM}
    - Established Genre Identity: ${sessionData.currentGenre}
    - Energy Evolution: ${energyTrend}
    
    DETAILED MUSICAL HISTORY (for narrative continuity):
    ${historyNarrative}
    
    ENERGY PROFILE EVOLUTION:
    Recent Pattern: ${sessionData.energyProfile.slice(-5).map(e => e.toFixed(2)).join(' → ')}
    
    PHASE-SPECIFIC INTELLIGENCE REQUIREMENTS:
    ${batchNumber <= 3 
      ? '🏗️ FOUNDATION PHASE: Establish consistent session identity. NO sudden style changes. Focus on ONE primary genre/instrument. Build memorable core.'
      : batchNumber <= 7 
      ? '🎨 LAYERING PHASE: Add complementary elements that SUPPORT the foundation. Reference and build on previous batches. Maintain coherence.'
      : '🚀 EVOLUTION PHASE: Intelligent variations while maintaining established session character. Use full poetry and sensor knowledge for rich expression.'
    }
    
    CURRENT SENSOR INTELLIGENCE:
    ${enrichedSensorData.detailedAnalysis}
    `;
  }

  // PARSE AGENT RESPONSE with robust error handling
  parseAgentResponse(agentResponse) {
    try {
      if (typeof agentResponse === 'string') {
        console.log('🔧 Attempting to parse string response...');
        
        // Try multiple JSON extraction strategies
        // Strategy 1: Look for complete JSON object
        const jsonMatch = agentResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          console.log('✅ Found JSON pattern, attempting parse...');
          const parsed = JSON.parse(jsonMatch[0]);
          console.log('✅ JSON parse successful:', Object.keys(parsed));
          return parsed;
        }
        
        // Strategy 2: Look for JSON code blocks
        const codeBlockMatch = agentResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (codeBlockMatch) {
          console.log('✅ Found JSON in code block, attempting parse...');
          const parsed = JSON.parse(codeBlockMatch[1]);
          console.log('✅ Code block JSON parse successful:', Object.keys(parsed));
          return parsed;
        }
        
        // Strategy 3: Look for JSON after keywords
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

  // ENFORCE RAVE BASELINE while allowing intelligent variations
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
    
    // Add rave foundation if missing
    const hasRaveElement = interpretation.weightedPrompts.some(prompt => 
      ['techno', 'acid', 'rave', 'electronic', 'hardcore', 'psytrance'].some(genre => 
        prompt.text.toLowerCase().includes(genre)
      )
    );
    
    if (!hasRaveElement) {
      interpretation.weightedPrompts.unshift({
        text: sessionData.currentGenre || 'driving techno',
        weight: 0.4
      });
      // Rebalance weights
      const totalWeight = interpretation.weightedPrompts.reduce((sum, p) => sum + p.weight, 0);
      interpretation.weightedPrompts.forEach(p => p.weight = p.weight / totalWeight);
    }
    
    return interpretation;
  }

  // UPDATE SESSION HISTORY with musical progression
  updateSessionHistory(sessionData, interpretation, enrichedSensorData) {
    const historyEntry = {
      timestamp: Date.now(),
      bpm: interpretation.lyriaConfig.bpm,
      density: interpretation.lyriaConfig.density,
      brightness: interpretation.lyriaConfig.brightness,
      primaryGenre: interpretation.weightedPrompts[0]?.text || 'electronic',
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
    sessionData.currentGenre = interpretation.weightedPrompts[0]?.text || sessionData.currentGenre;
    
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

  // UPDATE SENSOR PROFILE for learning user preferences
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

  // INTELLIGENT RAVE FALLBACK when agent fails
  createIntelligentRaveFallback(enrichedSensorData, sessionData) {
    const magnitude = enrichedSensorData.magnitude;
    
    // Rave-focused fallback based on energy
    let prompts, config, reasoning;
    
    if (magnitude > 0.8) {
      prompts = [
        { text: "explosive hardcore techno", weight: 0.6 },
        { text: "driving 303 acid bass", weight: 0.2 },
        { text: "euphoric energy building", weight: 0.2 }
      ];
      config = {
        bpm: Math.round(160 + magnitude * 20), // 160-180
        density: 0.8 + magnitude * 0.15,
        brightness: 0.8 + magnitude * 0.2,
        guidance: 2.8,
        temperature: 1.9
      };
      reasoning = `Explosive energy (${magnitude.toFixed(2)}) - hardcore rave response`;
    } else if (magnitude > 0.5) {
      prompts = [
        { text: "driving acid techno", weight: 0.6 },
        { text: "pounding kick drums", weight: 0.2 },
        { text: "Prophet 5 lead stabs", weight: 0.2 }
      ];
      config = {
        bpm: Math.round(140 + magnitude * 25), // 140-165
        density: 0.6 + magnitude * 0.25,
        brightness: 0.6 + magnitude * 0.3,
        guidance: 2.2,
        temperature: 1.5
      };
      reasoning = `High energy (${magnitude.toFixed(2)}) - driving techno response`;
    } else if (magnitude > 0.3) {
      prompts = [
        { text: "minimal techno groove", weight: 0.6 },
        { text: "deep bass foundation", weight: 0.3 },
        { text: "subtle filter sweeps", weight: 0.1 }
      ];
      config = {
        bpm: Math.round(130 + magnitude * 15), // 130-145
        density: 0.4 + magnitude * 0.3,
        brightness: 0.5 + magnitude * 0.3,
        guidance: 2.0,
        temperature: 1.3
      };
      reasoning = `Moderate energy (${magnitude.toFixed(2)}) - minimal techno groove`;
    } else {
      prompts = [
        { text: "deep techno ambience", weight: 0.6 },
        { text: "ethereal pads building", weight: 0.3 },
        { text: "distant kick drums", weight: 0.1 }
      ];
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
      weightedPrompts: prompts,
      lyriaConfig: config,
      reasoning: `${reasoning} (intelligent rave fallback)`,
      fallback: true,
      raveBaseline: true,
      sessionContinuity: sessionData.progressionState
    };
  }

  // LEGACY FALLBACK METHOD (kept for compatibility)  
  createIntelligentFallback(sensorData, reason) {
    const enrichedSensorData = {
      magnitude: Math.sqrt(sensorData.x**2 + sensorData.y**2 + sensorData.z**2) / 3.0,
      energyLevel: 'moderate',
      complexity: 'simple'
    };
    const sessionData = { progressionState: 'building' };
    return this.createIntelligentRaveFallback(enrichedSensorData, sessionData);
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