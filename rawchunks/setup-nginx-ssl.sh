#!/bin/bash

# Setup Nginx with SSL for VibesFlow API
# This script installs nginx, configures SSL with Let's Encrypt, and sets up reverse proxy

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
DOMAIN="api.vibesflow.ai"
EMAIL="admin@vibesflow.ai"  # Change this to your email
APP_PORT="3003"

print_status "Setting up Nginx with SSL for $DOMAIN..."

# Update system packages
print_status "Updating system packages..."
sudo apt-get update

# Install nginx
print_status "Installing Nginx..."
sudo apt-get install -y nginx

# Install certbot for Let's Encrypt
print_status "Installing Certbot for SSL certificates..."
sudo apt-get install -y certbot python3-certbot-nginx

# Stop nginx temporarily
sudo systemctl stop nginx

# Create nginx configuration
print_status "Creating Nginx configuration..."
sudo tee /etc/nginx/sites-available/vibesflow << 'EOF'
server {
    listen 80;
    server_name api.vibesflow.ai;
    
    # Temporary configuration for Let's Encrypt verification
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect all other traffic to HTTPS (will be added after SSL setup)
    location / {
        proxy_pass http://localhost:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long uploads
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        
        # Large file upload support
        client_max_body_size 100M;
    }
}
EOF

# Enable the site
print_status "Enabling Nginx site..."
sudo ln -sf /etc/nginx/sites-available/vibesflow /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
print_status "Testing Nginx configuration..."
sudo nginx -t

# Start nginx
print_status "Starting Nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify that the Node.js app is running
print_status "Checking if Node.js application is running on port $APP_PORT..."
if ! curl -s http://localhost:$APP_PORT/health > /dev/null; then
    print_warning "Node.js application is not responding on port $APP_PORT"
    print_status "Please ensure your Node.js app is running with PM2"
    print_status "Run: pm2 start ecosystem.config.js"
fi

# Get SSL certificate with Let's Encrypt
print_status "Obtaining SSL certificate with Let's Encrypt..."
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL --redirect

# Update nginx configuration with enhanced security
print_status "Updating Nginx configuration with enhanced settings..."
sudo tee /etc/nginx/sites-available/vibesflow << 'EOF'
server {
    listen 80;
    server_name api.vibesflow.ai;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.vibesflow.ai;

    # SSL configuration managed by Certbot
    ssl_certificate /etc/letsencrypt/live/api.vibesflow.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.vibesflow.ai/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private must-revalidate auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Proxy settings
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $server_name;
    
    # Timeouts for long Synapse uploads
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;
    
    # Large file upload support for audio chunks
    client_max_body_size 100M;
    client_body_timeout 600;
    client_body_buffer_size 128k;
    
    # Main proxy to Node.js application
    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        proxy_request_buffering off;
        proxy_buffering off;
    }
    
    # Health check endpoint (fast response)
    location /health {
        proxy_pass http://localhost:3003/health;
        access_log off;
    }
    
    # Upload endpoint with maximum timeout settings
    location /upload {
        proxy_pass http://localhost:3003/upload;
        proxy_request_buffering off;
        proxy_buffering off;
        client_body_buffer_size 128k;
        
        # Extended timeouts for Synapse uploads
        proxy_connect_timeout 900;
        proxy_send_timeout 900;
        proxy_read_timeout 900;
    }
    
    # Status endpoints
    location ~ ^/(api|filecoin)/ {
        proxy_pass http://localhost:3003;
    }
}
EOF

# Test and reload nginx
print_status "Testing updated Nginx configuration..."
sudo nginx -t

print_status "Reloading Nginx..."
sudo systemctl reload nginx

# Setup automatic SSL renewal
print_status "Setting up automatic SSL certificate renewal..."
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Setup firewall rules
print_status "Configuring UFW firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3003/tcp  # Node.js app (internal)
sudo ufw --force enable

print_success "Nginx and SSL setup completed!"

# Test the setup
print_status "Testing the setup..."
sleep 5

if curl -s https://$DOMAIN/health > /dev/null; then
    print_success "✅ HTTPS is working! API is accessible at https://$DOMAIN"
else
    print_warning "⚠️  HTTPS test failed. Please check:"
    print_status "1. DNS: Does $DOMAIN point to this server?"
    print_status "2. Firewall: Are ports 80 and 443 open?"
    print_status "3. App: Is the Node.js app running on port $APP_PORT?"
fi

echo ""
print_success "🎉 Setup completed!"
echo "========================================="
echo "  VibesFlow API - Nginx + SSL Setup"
echo "========================================="
echo ""
echo "🌐 API URL: https://$DOMAIN"
echo "🔒 SSL Certificate: Let's Encrypt"
echo "🔄 Auto-renewal: Enabled"
echo ""
echo "📊 Test endpoints:"
echo "  • https://$DOMAIN/health"
echo "  • https://$DOMAIN/api/vibestreams"
echo "  • https://$DOMAIN/filecoin/test"
echo ""
echo "🔧 Management commands:"
echo "  • Check status: sudo systemctl status nginx"
echo "  • Reload config: sudo nginx -s reload"
echo "  • View logs: sudo tail -f /var/log/nginx/access.log"
echo "  • SSL status: sudo certbot certificates"
echo ""
print_success "Your VibesFlow API is now accessible via HTTPS! 🚀" 