# VibesFlow RawChunks Backend

Serverless backend service for collecting real-time Lyria audio chunks from the Expo app and queuing them for processing by Chunker and Dispatcher workers.

## Architecture

```
Expo App (AudioChunkService) 
    ↓ POST /upload (60-second WAV chunks)
AWS Lambda (rawchunks)
    ↓ S3 Storage + SQS Queue
Chunker Worker (VRF raffle + metadata)
    ↓ /process/raw-chunk
Dispatcher Worker (Filecoin upload via Synapse)
```

## Deployment

### Prerequisites

1. AWS CLI configured with credentials:
   ```bash
   aws configure
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Deploy to AWS

```bash
# Deploy to dev environment
npm run deploy

# Or deploy directly with serverless
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

### After Deployment

1. Copy the API Gateway URL from the deployment output
2. Add it to your `.env` file:
   ```
   EXPO_PUBLIC_RAWCHUNKS_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev
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

## Environment Variables

- `BUCKET`: S3 bucket for storing raw chunks
- `QUEUE_URL`: SQS queue for processing
- `CHUNKER_WORKER_URL`: URL of the Chunker worker

## Monitoring

```bash
# View function logs
npm run logs

# View all resources
npx serverless info

# Remove deployment
npm run remove
```

## Local Development

For local testing, you can use the Serverless Offline plugin:

```bash
npm install --save-dev serverless-offline
npx serverless offline
```

## Troubleshooting

### Common Issues

1. **AWS credentials not configured**
   ```bash
   aws configure
   # or
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   ```

2. **Insufficient permissions**
   - Ensure your AWS user has permissions for Lambda, S3, SQS, and API Gateway

3. **Chunker worker not responding**
   - Check the `CHUNKER_WORKER_URL` environment variable
   - Verify the Chunker worker is deployed and accessible

### Logs and Debugging

- CloudWatch logs are automatically created for each function
- Use `npm run logs` to tail function logs
- Check SQS dead letter queues for failed messages 