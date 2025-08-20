# VibesFlow Streaming Backend

Complete SSL-enabled streaming infrastructure for creator-to-participant audio streaming using SRS (Simple Realtime Server).

## Deployment Status

### Production Services Running
- **Streaming Server**: `https://srs.vibesflow.ai` (SSL-enabled)
- **SRS RTMP**: `rtmp://srs.vibesflow.ai:1935` (Creator audio input)
- **SRS HTTP-FLV**: `https://srs.vibesflow.ai/live/` (Participant audio output - low latency)
- **SRS HLS**: `https://srs.vibesflow.ai/live/` (Participant audio output - compatibility)
- **SRS API**: `https://srs.vibesflow.ai/api/v1/` (Monitoring and stats)

## Architecture

### Creator Flow
1. **Lyria Session** → Audio chunks generated
2. **Coordinator.js** → Captures audio via `handleLyriaMessage()`
3. **Streaming Server** → Receives audio via HTTPS POST
4. **FFmpeg Process** → Converts audio to RTMP stream
5. **SRS** → Distributes to participants via HTTP-FLV/HLS

### Participant Flow
1. **LiveTracker** → Queries orchestrator for active sessions
2. **Participant Service** → Joins stream via HTTPS API
3. **SRS URLs** → Returns HTTP-FLV/HLS streaming URLs
4. **Direct Playback** → No Lyria session created

## Services

### 1. Lyria Streaming Server (`lyria.js`)
- **Port**: 3001
- **Purpose**: Capture creator audio and stream to SRS
- **Endpoints**:
  - `POST /stream/:vibeId/audio` - Creator audio input
  - `POST /stream/:vibeId/join` - Participant join
  - `POST /stream/:vibeId/leave` - Participant leave
  - `GET /streams/active` - Active streams list
  - `GET /health` - Health check

### 2. SRS Manager (`srs.js`)
- **Purpose**: Manage SRS Docker container
- **Ports**: 1935 (RTMP), 8080 (HTTP), 1985 (API)
- **Features**: Auto-restart, health monitoring

### 3. Nginx SSL Proxy
- **Purpose**: SSL termination and request routing
- **Features**: 
  - Automatic HTTP→HTTPS redirect
  - CORS headers for web playback
  - Optimized streaming settings
  - Security headers

## Configuration

### Environment Variables
```bash
EXPO_PUBLIC_STREAMING_URL=https://srs.vibesflow.ai
```

### PM2 Process Management
```bash
# View status
pm2 list

# View logs
pm2 logs vibesflow-streaming
pm2 logs vibesflow-srs

# Restart services
pm2 restart vibesflow-streaming
pm2 restart vibesflow-srs
```

## Monitoring

### Health Checks
```bash
# Streaming server health
curl https://srs.vibesflow.ai/health

# SRS API status
curl https://srs.vibesflow.ai/api/v1/versions

# Active streams
curl https://srs.vibesflow.ai/streams/active

# SRS system stats
curl https://srs.vibesflow.ai/api/v1/summaries
```

## Troubleshooting

### Common Issues

#### SSL Certificate Issues
```bash
# Check nginx configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Check certificate status
sudo certbot certificates
```

#### Streaming Issues
```bash
# Check SRS container
docker ps | grep srs

# View SRS logs
docker logs vibesflow-srs

# Restart SRS
pm2 restart vibesflow-srs
```

#### Network Issues
```bash
# Test ports
netstat -tlnp | grep -E ':(1935|3001|8080|1985)'

# Check firewall
sudo ufw status
```

### Log Locations
- **PM2 Logs**: `/home/ubuntu/vibesflow-streaming/logs/`
- **Nginx Logs**: `/var/log/nginx/`
- **Certbot Logs**: `/var/log/letsencrypt/`
- **SRS Logs**: `docker logs vibesflow-srs`

## Performance

### Optimizations
- **HTTP-FLV**: Ultra-low latency streaming (<100ms)
- **HLS**: Fallback for compatibility (2-6s latency)
- **FFmpeg**: Optimized audio processing pipeline
- **Nginx**: Streaming-optimized proxy settings
- **PM2**: Process monitoring and auto-restart

### Scaling
- **SRS**: Supports thousands of concurrent participants
- **Nginx**: Can handle high concurrent connections
- **Docker**: Easy horizontal scaling if needed

## Metrics

Current capacity:
- **Concurrent Streams**: 100+ (limited by server resources)
- **Participants per Stream**: 1000 (SRS hard-limit per docker)
- **Latency**: <100ms (HTTP-FLV), 2-6s (HLS)
- **Audio Quality**: 48kHz, 16-bit, stereo, 128kbps AAC

## Security

### SSL/TLS
- **TLS 1.2/1.3**: Modern encryption protocols
- **HSTS**: HTTP Strict Transport Security enabled
- **OCSP Stapling**: Certificate validation optimization

### Headers
- **X-Frame-Options**: Clickjacking protection
- **X-Content-Type-Options**: MIME sniffing protection
- **X-XSS-Protection**: XSS attack mitigation

### Access Control
- **CORS**: Properly configured for web access
- **Rate Limiting**: Built into streaming server
- **Input Validation**: All API endpoints protected
