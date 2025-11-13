# PM2 Deployment Guide

## Quick Start

### 1. On Your Local Machine
```bash
# Commit and push to your git repository
git add .
git commit -m "Initial API setup"
git push origin main
```

### 2. On Your Production Server

#### Initial Setup
```bash
# Clone the repository
git clone YOUR_REPO_URL lenovo-warranty-api
cd lenovo-warranty-api

# Install dependencies
npm install --production

# Install PM2 globally (if not installed)
npm install -g pm2

# Copy production environment file
cp .env.production .env

# Edit .env with your actual domain
nano .env
```

#### Start with PM2
```bash
# Option 1: Use the deployment script
chmod +x deploy.sh
./deploy.sh
# Then select option 1 to start

# Option 2: Direct PM2 commands
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions to enable auto-start on boot
```

## PM2 Commands Reference

### Basic Operations
```bash
# Start the API
pm2 start ecosystem.config.js

# Stop the API
pm2 stop lenovo-warranty-api

# Restart the API
pm2 restart lenovo-warranty-api

# Reload with zero downtime
pm2 reload lenovo-warranty-api

# Delete from PM2 list
pm2 delete lenovo-warranty-api
```

### Monitoring & Logs
```bash
# View status
pm2 status

# View detailed info
pm2 info lenovo-warranty-api

# View real-time logs
pm2 logs lenovo-warranty-api

# View last 100 lines of logs
pm2 logs lenovo-warranty-api --lines 100

# Monitor CPU/Memory
pm2 monit

# Web dashboard (optional)
pm2 install pm2-web
pm2 web
```

### Scaling
```bash
# Scale to 2 instances
pm2 scale lenovo-warranty-api 2

# Scale to max CPU cores
pm2 scale lenovo-warranty-api max
```

### Auto-Start on Server Boot
```bash
# Generate startup script
pm2 startup

# Save current PM2 list
pm2 save

# After server reboot, PM2 will auto-start your apps
```

## Nginx Configuration (Recommended)

Add this to your Nginx site configuration to proxy requests:

```nginx
# In your server block for streamwest.lol

location /api/warranty {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

Then reload Nginx:
```bash
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## Update Deployment

When you need to update the API:

```bash
# Pull latest changes
git pull

# Install any new dependencies
npm install --production

# Graceful reload
pm2 reload lenovo-warranty-api

# Or use the deployment script
./deploy.sh
# Select option 7 for zero-downtime reload
```

## Troubleshooting

### Check if API is running
```bash
pm2 status
curl http://localhost:3001/api/health
```

### View error logs
```bash
pm2 logs lenovo-warranty-api --err
tail -f logs/err.log
```

### Reset and restart
```bash
pm2 delete all
pm2 start ecosystem.config.js
pm2 save
```

### Memory issues
```bash
# Check memory usage
pm2 status

# Restart if memory limit exceeded
pm2 restart lenovo-warranty-api
```

## Security Considerations

1. **Firewall**: Only expose port 3001 to localhost
   ```bash
   # If using ufw
   sudo ufw deny 3001/tcp
   ```

2. **Environment Variables**: Never commit `.env` to git
   - Use `.env.production` as a template
   - Set actual values on the server

3. **Updates**: Regularly update dependencies
   ```bash
   npm audit
   npm update
   ```

## Monitoring & Alerts

### PM2 Plus (Optional - Free tier available)
```bash
# Link to PM2 monitoring service
pm2 link YOUR_SECRET_KEY YOUR_PUBLIC_KEY
```

### Custom Health Check
```bash
# Add to crontab for monitoring
*/5 * * * * curl -f http://localhost:3001/api/health || pm2 restart lenovo-warranty-api
```

## Integration with Your Website

After deployment, your API will be available at:
- **Direct**: `http://your-server:3001/api/warranty-lookup`
- **Via Nginx**: `https://streamwest.lol/api/warranty/warranty-lookup`

Example JavaScript code for your website:
```javascript
async function checkWarranty(serialNumber) {
  const response = await fetch('https://streamwest.lol/api/warranty/warranty-lookup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ serialNumber })
  });

  const data = await response.json();
  return data;
}
```