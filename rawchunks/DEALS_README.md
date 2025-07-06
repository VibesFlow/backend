# Deals.js - VibesFlow Filecoin Monitoring Tool

## What is deals.js?

`deals.js` is a **custom-built comprehensive monitoring and API tool** specifically created for VibesFlow to manage and monitor Filecoin/Synapse SDK integrations. It's **not** directly from any existing SDK but rather an **aggregation and enhancement** of functionality from multiple sources:

### Sources and References Used:
- **Synapse SDK** (`@filoz/synapse-sdk`) - Core Filecoin PDP operations, storage services, payments
- **fs-upload-dapp** - Web application patterns for proof set management  
- **FilCDN Documentation** - CDN integration and URL construction patterns
- **PDP (Proof of Data Possession)** - Contract interaction patterns and verification

### Primary Functions:

## 1. CLI Monitoring Tool
```bash
# Check overall system status
node deals.js status

# Monitor storage deals
node deals.js deals  

# Test FilCDN retrieval
node deals.js filcdn <cid>

# Watch for changes in real-time
node deals.js watch

# Check chain information
node deals.js chain

# Analytics from multiple platforms
node deals.js analytics
```

## 2. HTTP API Server for VibeMarket
```bash
# Start API server for React Native app
node deals.js server
```

Provides `/api/vibestreams` endpoint that:
- Organizes vibestreams by `rta_id`
- Sorts chunks by `chunk_id`
- Provides FilCDN URLs for each chunk
- Returns metadata for VibeMarket display

## 3. FilCDN Integration Monitor
- Tests FilCDN URL accessibility
- Validates CommP retrieval
- Monitors proof set status
- Tracks storage provider health

## Architecture

### Core Components:

1. **FilCDNMonitor Class**
   - Constructs FilCDN URLs using wallet address
   - Tests retrieval endpoints
   - Organizes vibestream data by RTA ID
   - Generates marketplace-ready metadata

2. **FilecoinMonitor Class** 
   - RPC calls to Filecoin network
   - Storage deal monitoring
   - Chain information retrieval
   - Wallet balance checking

3. **AnalyticsMonitor Class**
   - Integration with Spacescope, Filscan, Filfox, Beryx
   - Cross-platform deal analytics
   - Network health monitoring

4. **ProofSetMonitor Class**
   - PDP proof set verification
   - Provider API integration
   - Contract interaction status

5. **APIServer Class**
   - HTTP server for VibeMarket integration
   - CORS-enabled endpoints
   - Real-time vibestream data serving

### Data Flow:

```
Filecoin Network ← deals.js → Analytics Platforms
       ↓                           ↓
   Proof Sets              FilCDN Monitoring
       ↓                           ↓
VibeMarket App ←---- HTTP API ----→ React Native
```

## Configuration

Uses `config.js` which loads from `.env`:

### Required Environment Variables:
```bash
FILECOIN_PRIVATE_KEY=0x...        # Wallet private key
FILECOIN_ADDRESS=0x...            # Wallet address (0x format)
FILECOIN_CALIBRATION_ADDRESS=t4... # Calibration address (t4 format)
FILECOIN_RPC_URL=https://...      # RPC endpoint
PANDORA_CONTRACT_ADDRESS=0x...    # Synapse contract
```

## VibeMarket Integration

The `deals.js server` provides structured data for the React Native VibeMarket:

### API Response Format:
```json
[
  {
    "rta_id": "rta_001",
    "creator": "vibes.testnet", 
    "rta_duration": "00:04:23",
    "chunks": 3,
    "user_profile_image": "QmXxX...",
    "is_complete": true,
    "filcdn_base": "https://0xWALLET.calibration.filcdn.io",
    "first_chunk_url": "https://0xWALLET.calibration.filcdn.io/baga...",
    "last_chunk_url": "https://0xWALLET.calibration.filcdn.io/baga..."
  }
]
```

### Key Features:
- **Production-Ready**: No mock data fallbacks
- **Real-Time**: Live data from Filecoin proof sets
- **Organized**: Data structured by RTA ID and chunk sequence
- **FilCDN Integration**: Direct URLs for chunk retrieval
- **Error Handling**: Proper failure modes without fallbacks

## Usage in VibesFlow

1. **Development**: Monitor uploads and proof set status
2. **Production**: Serve vibestream data to React Native app
3. **Analytics**: Track storage costs and provider performance
4. **Debugging**: Test FilCDN retrieval and chain connectivity

## Dependencies

- **@filoz/synapse-sdk**: Filecoin PDP operations
- **ethers**: Blockchain interactions  
- **dotenv**: Environment configuration
- **Node.js built-ins**: HTTP server, filesystem, crypto

This tool is essential for VibesFlow's Filecoin integration, providing both development monitoring and production API services. 