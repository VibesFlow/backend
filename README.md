# VibesFlow RawChunks Backend

Serverless backend service for collecting real-time Lyria audio chunks from the Expo app and queuing them for processing by Chunker and Dispatcher workers.

## Architecture

```
Expo App (AudioChunkService) 
    ↓ POST /upload (raw audio data)
AWS Lambda (S3 Storage + SQS Queue)
    ↓ (compress & converts into .wav)
Chunker Worker (VRF raffle + metadata)
    ↓ 
Dispatcher Worker (Filecoin upload via Synapse)
```

## API Endpoints

### POST /upload
Receives 60-second audio chunks from Expo app.

**Headers:**
- `X-Chunk-Id`: Sequential chunk identifier
- `X-Rta-Id`: RTA stream identifier
- `X-Device-Id`: Device identifier
- `X-Creator`: Creator account ID
- `X-Start-Time`: Stream start timestamp
- `X-Chunk-Timestamp`: Chunk timestamp

**Body:** WAV audio data (binary)

**Response:**
```json
{
  "success": true,
  "chunkId": "rta123_0001",
  "rtaId": "rta123",
  "queuedAt": 1640995200000,
  "message": "Chunk queued for processing"
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "rawchunks",
  "timestamp": 1640995200000,
  "bucket": "rawchunks-raw-chunks-dev",
  "queue": "configured"
}
```

See [raw-mock.yml](https://github.com/VibesFlow/backend/rawchunks) to see the whole thing.