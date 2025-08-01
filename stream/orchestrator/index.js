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

import { Agent, WindowBufferMemory, QdrantStore, RemoteModelEmbeddings } from 'alith';
import { randomUUID } from 'crypto';

// Custom QdrantStore that generates proper UUIDs for QDrant compatibility
class QdrantStore extends QdrantStore {
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
    } catch (error) {
      // Collection might not exist, which is fine
      console.log(`Collection ${this.collectionName} doesn't exist yet, creating new one`);
    }
    
    await this.client.createCollection(this.collectionName, {
      vectors: {
        size: 768, // Embedding size for Google text-embedding-004 (768 dimensions)
        distance: "Cosine",
      },
    });
  }
}

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  console.error('❌ Missing GOOGLE_GENERATIVE_AI_API_KEY');
  process.exit(1);
}

// Enhanced Lyria knowledge base for intelligent music orchestration
const LYRIA_KNOWLEDGE = `You are an experienced DJ who knows Lyria RealTime parameters, styles and indicators, and can translate users inputs into DJ Sets with high variety, smooth transitions, and rich musical textures.

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

Your goal: Transform raw sensor data into expressive, electronic/techno/rave/psychedelic DJ sets through coherent prompts that create engaging real-time music experiences.`;

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
    knowledgeStore = new QdrantStore(embeddings, "lyria_music_knowledge", {
      url: "http://localhost:6333",
      timeout: 30000 // 30 second timeout for stability
    });
    
    // Initialize collection in QDrant before saving data
    await knowledgeStore.reset();
    console.log('✅ QDrant collection created successfully');
    
    // Populate knowledge store with Lyria expertise
    await knowledgeStore.save(`Lyria RealTime Instruments: 303 Acid Bass, 808 Hip Hop Beat, Boomy Bass, Dirty Synths, Moog Oscillations, Spacey Synths, Synth Pads, TR-909 Drum Machine, Buchla Synths, Cello, Viola Ensemble, Balalaika Ensemble, Bouzouki, Flamenco Guitar, Shredding Guitar, Slide Guitar, Warm Acoustic Guitar, Precision Bass, Ragtime Piano, Rhodes Piano, Smooth Pianos, Clavichord, Harpsichord, Mellotron`);
    
    await knowledgeStore.save(`Lyria RealTime Genres: Acid Jazz, Breakbeat, Chillout, Chiptune, Deep House, Drum & Bass, Dubstep, EDM, Electro Swing, Glitch Hop, Hyperpop, Minimal Techno, Moombahton, Psytrance, Synthpop, Techno, Trance, Trip Hop, Vaporwave, Witch house, Alternative Country, Blues Rock, Classic Rock, Funk Metal, G-funk, Garage Rock, Grime, Post-Punk, 60s Psychedelic Rock, Shoegaze, Ska, Surf Rock`);
    
    await knowledgeStore.save(`Lyria RealTime Moods: Upbeat, Fat Beats, Tight Groove, Virtuoso, Danceable, Live Performance, Huge Drop, Chill, Ambient, Ethereal Ambience, Dreamy, Sustained Chords, Subdued Melody, Lo-fi, Psychedelic, Glitchy Effects, Weird Noises, Experimental, Swirling Phasers, Echo, Crunchy Distortion, Saturated Tones, Acoustic Instruments, Bright Tones, Rich Orchestration, Emotional, Funky, Unsettling, Ominous Drone`);
    
    await knowledgeStore.save(`Lyria RealTime Parameters: BPM range 60-200 beats per minute, Density 0.0-1.0 where 0=sparse 1=busy arrangement, Brightness 0.0-1.0 where 0=dark 1=bright frequencies, Guidance 1.0-4.0 how strictly model follows prompts, Temperature 0.8-2.0 creativity randomness level`);
    
    await knowledgeStore.save(`Sensor Interpretation Patterns: High magnitude >0.7 = energetic movement → high BPM 140-180, high density 0.7-0.9, bright tones 0.7-0.9, electronic genres. Medium magnitude 0.3-0.7 = balanced movement → medium BPM 100-140, moderate density 0.4-0.7, balanced brightness 0.5-0.7. Low magnitude <0.3 = calm movement → low BPM 60-100, sparse density 0.2-0.5, darker tones 0.2-0.5, ambient genres`);
    
    await knowledgeStore.save(`VibesFlow Streaming Requirements: Continuous music generation without interruption, smooth transitions between parameter changes, real-time adaptation to sensor data, predictive buffering to prevent clicks/jitters, consistent baseline electronic/techno/rave/psychedelic style, latency under 2-3 seconds for sensor-to-music response`);
    
    await knowledgeStore.save(`Prompt Engineering for Lyria: Use weighted prompts with primary style 0.8 weight, secondary elements 0.2 weight. Combine genre + mood + energy level + specific instrument suggestions. Example: [{text: 'energetic techno with acid bass', weight: 0.8}, {text: 'smooth transitions', weight: 0.2}]. Always include transition guidance for streaming contexts`);
    
    // Create Alith agent with full configuration - all modules need model/apiKey/baseUrl
    musicAgent = new Agent({
      model: "gemini-2.5-flash-lite", // Consistent Gemini model from js-genai
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY, // API key for agent module
      baseUrl: "generativelanguage.googleapis.com/v1beta/openai", // baseUrl without https:// and /
      preamble: LYRIA_KNOWLEDGE,
      memory: new WindowBufferMemory(15), // Memory module - remembers last 15 interactions
      store: knowledgeStore // RAG module - enables knowledge-augmented responses
    });
    
    console.log('✅ Alith agent initialized with memory and RAG');
    
  } catch (error) {
    console.error('❌ Alith agent initialization failed:', error);
    throw error;
  }
}

// Simple server class
class VibesFlowOrchestrator {
  constructor() {
    this.app = express();
    this.server = null;
    this.wsServer = null;
    this.connectedClients = new Set();
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
        server: this.server,
        path: '/alith'
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
          console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/alith`);
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
    
    console.log('🔬 Received sensor data:', {
      type: message.type,
      sensor: {
        x: message.sensorData?.x,
        y: message.sensorData?.y,
        z: message.sensorData?.z,
        source: message.sensorData?.source
      }
    });
    
    const { sensorData } = message;
    
    // Create prompt for the agent
    const prompt = `
    Interpret this sensor data and generate optimal Lyria music prompts:
    
    Sensor Data:
    - X: ${sensorData.x}
    - Y: ${sensorData.y} 
    - Z: ${sensorData.z}
    - Magnitude: ${Math.sqrt(sensorData.x**2 + sensorData.y**2 + sensorData.z**2)}
    - Source: ${sensorData.source}
    - Timestamp: ${sensorData.timestamp}
    
    Generate music parameters that respond naturally to this movement.
    Focus on smooth transitions and musical coherence.
    `;
    
    try {
      console.log('🧠 Processing sensor data with Alith agent (with memory & RAG)...');
      
      // Get intelligent interpretation from Alith agent with RAG
      const agentResponse = await musicAgent.prompt(prompt);
      console.log('🎵 Alith agent response received');
      
      // Parse agent response - Alith agent should return structured JSON
      let interpretation;
      try {
        // Alith agents can return structured responses directly
        if (typeof agentResponse === 'string') {
          // Try to extract JSON from string response
          const jsonMatch = agentResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            interpretation = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } else {
          interpretation = agentResponse;
        }
      } catch (parseError) {
        console.error('❌ Failed to parse agent response:', parseError);
        throw new Error(`Response parsing failed: ${parseError.message}`);
      }
      
      // Validate interpretation structure
      if (!interpretation.weightedPrompts || !interpretation.lyriaConfig) {
        throw new Error('Invalid interpretation structure from agent');
      }
      
      // Ensure proper data types and ranges
      interpretation.lyriaConfig.bpm = Math.max(60, Math.min(200, Math.round(interpretation.lyriaConfig.bpm)));
      interpretation.lyriaConfig.density = Math.max(0, Math.min(1, interpretation.lyriaConfig.density));
      interpretation.lyriaConfig.brightness = Math.max(0, Math.min(1, interpretation.lyriaConfig.brightness));
      interpretation.lyriaConfig.guidance = Math.max(1, Math.min(4, interpretation.lyriaConfig.guidance));
      interpretation.lyriaConfig.temperature = Math.max(0.8, Math.min(2, interpretation.lyriaConfig.temperature));
      
      // Send interpretation back to client
      const response = {
        type: 'interpretation',
        data: interpretation,
        originalSensor: sensorData,
        timestamp: Date.now(),
        source: 'alith_agent_with_rag',
        hasMemory: true,
        hasKnowledge: true
      };
      
      ws.send(JSON.stringify(response));
      
      console.log('✅ Alith interpretation sent successfully:', {
        prompts: interpretation.weightedPrompts?.length,
        bpm: interpretation.lyriaConfig?.bpm,
        reasoning: interpretation.reasoning?.substring(0, 100) + '...'
      });
      
    } catch (error) {
      console.error('❌ Alith agent processing failed:', error);
      throw error; // Let the outer handler deal with this
    }
  }

  createFallbackInterpretation(sensorData) {
    return this.createIntelligentFallback(sensorData, 'json_parse_error');
  }

  createIntelligentFallback(sensorData, reason) {
    const magnitude = Math.sqrt(sensorData.x**2 + sensorData.y**2 + sensorData.z**2);
    const normalizedMagnitude = Math.min(magnitude / 3.0, 1.0); // Normalize to 0-1
    
    // Intelligent interpretation based on sensor patterns
    let prompts, config, reasoning;
    
    if (normalizedMagnitude > 0.8) {
      // Very high energy
      prompts = [
        { text: "upbeat electronic", weight: 0.6 },
        { text: "fat beats", weight: 0.3 },
        { text: "huge drop", weight: 0.1 }
      ];
      config = {
        bpm: Math.round(140 + normalizedMagnitude * 40), // 140-180
        density: 0.7 + normalizedMagnitude * 0.2, // 0.7-0.9
        brightness: 0.8 + normalizedMagnitude * 0.2, // 0.8-1.0
        guidance: 2.5,
        temperature: 1.8
      };
      reasoning = `High energy detected (${normalizedMagnitude.toFixed(2)}) - intense electronic music`;
    } else if (normalizedMagnitude > 0.5) {
      // Medium-high energy
      prompts = [
        { text: "minimal techno", weight: 0.5 },
        { text: "tight groove", weight: 0.3 },
        { text: "danceable", weight: 0.2 }
      ];
      config = {
        bpm: Math.round(110 + normalizedMagnitude * 30), // 110-140
        density: 0.5 + normalizedMagnitude * 0.3, // 0.5-0.8
        brightness: 0.6 + normalizedMagnitude * 0.3, // 0.6-0.9
        guidance: 2.0,
        temperature: 1.4
      };
      reasoning = `Medium energy detected (${normalizedMagnitude.toFixed(2)}) - balanced electronic groove`;
    } else if (normalizedMagnitude > 0.2) {
      // Low-medium energy
      prompts = [
        { text: "chill", weight: 0.6 },
        { text: "ambient", weight: 0.4 }
      ];
      config = {
        bpm: Math.round(90 + normalizedMagnitude * 20), // 90-110
        density: 0.3 + normalizedMagnitude * 0.3, // 0.3-0.6
        brightness: 0.4 + normalizedMagnitude * 0.3, // 0.4-0.7
        guidance: 1.5,
        temperature: 1.2
      };
      reasoning = `Low-medium energy detected (${normalizedMagnitude.toFixed(2)}) - relaxed ambient style`;
    } else {
      // Very low energy
      prompts = [
        { text: "ethereal ambience", weight: 0.7 },
        { text: "sustained chords", weight: 0.3 }
      ];
      config = {
        bpm: Math.round(70 + normalizedMagnitude * 20), // 70-90
        density: 0.1 + normalizedMagnitude * 0.3, // 0.1-0.4
        brightness: 0.3 + normalizedMagnitude * 0.2, // 0.3-0.5
        guidance: 1.0,
        temperature: 1.0
      };
      reasoning = `Very low energy detected (${normalizedMagnitude.toFixed(2)}) - deep ambient soundscape`;
    }
    
    // Add directional characteristics
    if (Math.abs(sensorData.x) > 0.5) {
      prompts.push({ text: "stereo effects", weight: 0.1 });
    }
    if (Math.abs(sensorData.y) > 0.5) {
      prompts.push({ text: "bright tones", weight: 0.1 });
    }
    if (Math.abs(sensorData.z) > 0.5) {
      prompts.push({ text: "echo", weight: 0.1 });
    }
    
    return {
      weightedPrompts: prompts,
      lyriaConfig: config,
      reasoning: `${reasoning} (fallback reason: ${reason})`,
      fallback: true,
      sensorMagnitude: normalizedMagnitude
    };
  }
}

// Start the orchestrator with Alith
async function start() {
  try {
    // Initialize Alith agent first
    await initializeAgent();
    
    // Start orchestrator server
const orchestrator = new VibesFlowOrchestrator();
    await orchestrator.start();
    
    console.log('🎵 VibesFlow Orchestrator ready with Alith AI');
    
  } catch (error) {
    console.error('💥 Startup failed:', error);
    process.exit(1);
  }
}

start();