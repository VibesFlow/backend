/**
 * SRS (Simple Realtime Server) Management for VibesFlow
 * 
 * Manages SRS Docker container and provides streaming infrastructure
 * for zero-latency creator-to-participant audio streaming.
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class SRSManager {
  constructor() {
    this.containerName = 'vibesflow-srs';
    this.isRunning = false;
    this.process = null;
    
    // SRS configuration
    this.config = {
      rtmpPort: 1935,
      httpPort: 8080,
      apiPort: 1985,
      udpPort: 8000
    };
  }

  // Check if SRS container is running
  async isContainerRunning() {
    return new Promise((resolve) => {
      exec(`docker ps --filter name=${this.containerName} --format "{{.Names}}"`, (error, stdout) => {
        if (error) {
          resolve(false);
        } else {
          resolve(stdout.trim() === this.containerName);
        }
      });
    });
  }

  // Start SRS container
  async start() {
    try {
      console.log('🚀 Starting SRS container...');
      
      // Check if already running
      const running = await this.isContainerRunning();
      if (running) {
        console.log('✅ SRS container already running');
        this.isRunning = true;
        return true;
      }

      // Remove existing container if it exists
      await this.cleanup();

      // Start SRS container with optimized configuration
      const dockerArgs = [
        'run',
        '--name', this.containerName,
        '--rm',
        '-d',
        '-p', `${this.config.rtmpPort}:1935`,
        '-p', `${this.config.httpPort}:8080`, 
        '-p', `${this.config.apiPort}:1985`,
        '-p', `${this.config.udpPort}:8000/udp`,
        'ossrs/srs:5'
      ];

      return new Promise((resolve, reject) => {
        const process = spawn('docker', dockerArgs);
        
        process.on('close', (code) => {
          if (code === 0) {
            console.log('✅ SRS container started successfully');
            this.isRunning = true;
            
            // Wait a moment for SRS to fully initialize
            setTimeout(() => {
              this.verifyStreaming().then(resolve).catch(reject);
            }, 3000);
          } else {
            reject(new Error(`Docker process exited with code ${code}`));
          }
        });
        
        process.on('error', (error) => {
          reject(new Error(`Failed to start Docker: ${error.message}`));
        });
      });

    } catch (error) {
      console.error('❌ Failed to start SRS:', error);
      throw error;
    }
  }

  // Stop SRS container
  async stop() {
    try {
      console.log('🛑 Stopping SRS container...');
      
      return new Promise((resolve) => {
        exec(`docker stop ${this.containerName}`, (error) => {
          if (error) {
            console.warn('Warning stopping container:', error.message);
          } else {
            console.log('✅ SRS container stopped');
          }
          this.isRunning = false;
          resolve();
        });
      });

    } catch (error) {
      console.warn('Error stopping SRS:', error);
      this.isRunning = false;
    }
  }

  // Cleanup existing container
  async cleanup() {
    return new Promise((resolve) => {
      exec(`docker rm -f ${this.containerName}`, (error) => {
        // Ignore errors - container might not exist
        resolve();
      });
    });
  }

  // Verify SRS is working
  async verifyStreaming() {
    try {
      console.log('🔍 Verifying SRS streaming capabilities...');
      
      // Check SRS API
      const response = await fetch(`http://localhost:${this.config.apiPort}/api/v1/versions`);
      if (!response.ok) {
        throw new Error('SRS API not responding');
      }
      
      const data = await response.json();
      console.log('✅ SRS version:', data.data?.version || 'unknown');
      
      // Check streaming endpoints
      console.log(`✅ RTMP endpoint: rtmp://localhost:${this.config.rtmpPort}/live/`);
      console.log(`✅ HTTP-FLV endpoint: http://localhost:${this.config.httpPort}/live/`);
      console.log(`✅ HLS endpoint: http://localhost:${this.config.httpPort}/live/`);
      console.log(`✅ API endpoint: http://localhost:${this.config.apiPort}/api/v1/`);
      
      return true;

    } catch (error) {
      console.error('❌ SRS verification failed:', error);
      throw error;
    }
  }

  // Get SRS status
  async getStatus() {
    try {
      const running = await this.isContainerRunning();
      
      if (!running) {
        return {
          running: false,
          error: 'Container not running'
        };
      }

      // Get SRS statistics
      const response = await fetch(`http://localhost:${this.config.apiPort}/api/v1/summaries`);
      const data = await response.json();
      
      return {
        running: true,
        version: data.data?.version,
        streams: data.data?.streams || 0,
        clients: data.data?.clients || 0,
        config: this.config
      };

    } catch (error) {
      return {
        running: false,
        error: error.message
      };
    }
  }

  // Get active streams
  async getActiveStreams() {
    try {
      const response = await fetch(`http://localhost:${this.config.apiPort}/api/v1/streams`);
      const data = await response.json();
      
      return data.streams || [];

    } catch (error) {
      console.warn('Failed to get active streams:', error);
      return [];
    }
  }

  // Create optimized SRS configuration for low-latency streaming
  generateSRSConfig() {
    return `
# SRS Configuration for Low-Latency Audio Streaming
listen              1935;
max_connections     1000;
srs_log_tank        console;
srs_log_level       warn;
daemon              off;

# HTTP server for FLV streaming
http_server {
    enabled         on;
    listen          8080;
    dir             ./objs/nginx/html;
    crossdomain     on;
}

# HTTP API for monitoring
http_api {
    enabled         on;
    listen          1985;
    crossdomain     on;
}

# Statistics for monitoring
stats {
    network         0;
    disk            sda sdb xvda xvdb;
}

# Default virtual host with low-latency settings
vhost __defaultVhost__ {
    # Enable TCP nodelay for minimum latency
    tcp_nodelay     on;
    
    # Enable minimum latency mode
    min_latency     on;
    
    # Play settings optimized for ultra-low latency
    play {
        # Disable GOP cache for minimum latency
        gop_cache       off;
        
        # Minimum queue length for ultra-low latency
        queue_length    3;
        
        # Minimum merged-write latency
        mw_latency      50;
        
        # Reduce time jitter buffer
        time_jitter     full;
    }
    
    # Publish settings optimized for real-time input
    publish {
        # Disable merged-read for minimum input latency
        mr              off;
        
        # Minimum parse buffer
        parse_sps       off;
        
        # Real-time publishing
        realtime        on;
    }
    
    # Ultra-low latency HLS (fallback for compatibility)
    hls {
        enabled         on;
        hls_fragment    0.5;    # 500ms fragments for low latency
        hls_window      3;      # Keep only 3 fragments (1.5s buffer)
        hls_path        ./objs/nginx/html;
        hls_m3u8_file   [app]/[stream].m3u8;
        hls_ts_file     [app]/[stream]-[seq].ts;
        hls_acodec      aac;
        hls_vcodec      h264;
        
        # Low latency HLS settings
        hls_dts_directly    on;
        hls_ts_floor        off;
    }
    
    # HTTP-FLV for ultra-low latency (primary method)
    http_remux {
        enabled         on;
        mount           [vhost]/[app]/[stream].flv;
        hstrs           on;     # Enable HTTP stream
        
        # Fast start for immediate playback
        fast_cache      3;
    }
    
    # WebRTC support for real-time streaming
    rtc {
        enabled         on;
        rtmp_to_rtc     on;
        rtc_to_rtmp     on;
        
        # Low latency WebRTC settings
        pli_for_rtmp    1.0;
        
        # Audio-only optimization
        opus {
            enabled     on;
        }
    }
    
    # Audio transcoding optimization
    transcode {
        enabled         on;
        ffmpeg          ./objs/ffmpeg/bin/ffmpeg;
        
        engine low_latency_audio {
            enabled         on;
            vcodec          copy;       # No video processing
            acodec          aac;        # AAC audio codec
            abitrate        128;        # 128kbps audio bitrate
            asample_rate    48000;      # 48kHz sample rate
            achannels       2;          # Stereo
            
            # AAC profile for low latency
            aparams {
                profile:a   aac_low;
                tune        zerolatency;
            }
            
            # Low latency output
            output          rtmp://127.0.0.1:[port]/[app]?vhost=[vhost]/[stream]_[engine];
        }
    }
    
    # Security settings
    security {
        # Allow all for development (restrict in production)
        seo {
            enabled     off;
        }
        
        # Play security
        play {
            check       off;    # Disable for development
        }
        
        # Publish security  
        publish {
            check       off;    # Disable for development
        }
    }
    
    # DVR disabled for live streaming
    dvr {
        enabled         off;
    }
    
    # Forward disabled (not needed for single server)
    forward {
        enabled         off;
    }
    
    # Bandwidth testing disabled
    bandcheck {
        enabled         off;
    }
}

# Heartbeat for monitoring
heartbeat {
    enabled         on;
    interval        5.0;
    url             http://127.0.0.1:1985/api/v1/heartbeat;
    device_id       srs-vibesflow;
}

# HTTP hooks for session management
http_hooks {
    enabled         on;
    
    # Notify on publish start/stop
    on_publish      http://127.0.0.1:3001/hooks/on_publish;
    on_unpublish    http://127.0.0.1:3001/hooks/on_unpublish;
    
    # Notify on play start/stop  
    on_play         http://127.0.0.1:3001/hooks/on_play;
    on_stop         http://127.0.0.1:3001/hooks/on_stop;
}
`;
  }
}

// Start SRS if run directly
if (require.main === module) {
  const srs = new SRSManager();
  
  async function main() {
    try {
      await srs.start();
      console.log('✅ SRS is ready for streaming');
      
      // Keep process alive with periodic health checks
      const healthCheckInterval = setInterval(async () => {
        try {
          const status = await srs.getStatus();
          if (!status.running) {
            console.log('⚠️ SRS container stopped, attempting restart...');
            await srs.start();
          }
        } catch (error) {
          console.warn('Health check failed:', error.message);
        }
      }, 30000); // Check every 30 seconds
      
      // Graceful shutdown handlers
      const shutdown = async (signal) => {
        console.log(`Received ${signal}, stopping SRS...`);
        clearInterval(healthCheckInterval);
        await srs.stop();
        process.exit(0);
      };
      
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
      
      // Keep the process alive
      console.log('🔄 SRS manager running with health checks every 30s');
      
    } catch (error) {
      console.error('❌ Failed to start SRS:', error);
      process.exit(1);
    }
  }
  
  main();
}

module.exports = SRSManager;
