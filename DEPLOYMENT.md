# EvoFaceFlow - AWS Lightsail Deployment Guide

## 📋 Code Review Summary

### 🚨 Critical Security Issues Found

| Issue | Location | Severity | Fix Required |
|-------|----------|----------|--------------|
| Hardcoded JWT secret fallback | `auth.ts`, `middleware/auth.ts` | **CRITICAL** | Remove fallback, require env var |
| Admin routes unprotected | `routes/admin.ts` | **CRITICAL** | Add admin authentication |
| CORS allows all origins | `index.ts` | **HIGH** | Whitelist specific origins |
| No rate limiting | Global | **HIGH** | Add express-rate-limit |
| No security headers | Global | **HIGH** | Add helmet middleware |
| No input validation | Auth routes | **MEDIUM** | Add express-validator |
| MongoDB credentials in docker-compose | `docker-compose.yml` | **HIGH** | Move to env file |
| Ngrok URL hardcoded | `frontend/config/api.ts` | **MEDIUM** | Use env-based config |
| No request body size limit | `index.ts` | **MEDIUM** | Limit JSON payload size |

### ✅ Security Measures Already In Place
- Passwords hashed with bcrypt (10 rounds)
- JWT authentication on protected routes
- File type validation on uploads
- File size limits on uploads (10MB)
- User isolation (users can only access their own videos)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     AWS Lightsail Instance                       │
│  ┌───────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │    Nginx      │  │   Backend    │  │     Redis + Mongo     │ │
│  │  (Reverse     │──│   (Node.js   │──│   (Docker Containers) │ │
│  │   Proxy +     │  │    + BullMQ) │  │                       │ │
│  │   SSL/TLS)    │  │              │  │                       │ │
│  └───────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
    ┌──────────────┐    ┌───────────────┐
    │  Expo/React  │    │   AWS S3      │
    │  Native App  │    │ (Image/Video  │
    │  (Frontend)  │    │   Storage)    │
    └──────────────┘    └───────────────┘
```

---

## 📦 Pre-Deployment Checklist

### 1. Required AWS Resources
- [ ] AWS Lightsail instance (minimum 2GB RAM recommended)
- [ ] S3 bucket for media storage
- [ ] IAM user with S3 access (for backend)
- [ ] Domain name (optional but recommended)
- [ ] SSL certificate (via Let's Encrypt)

### 2. Required Secrets/Environment Variables
```bash
# Backend .env (NEVER commit this file)
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb://evoface_user:<STRONG_PASSWORD>@mongo:27017/evofaceflow?authSource=admin
JWT_SECRET=<GENERATE_256_BIT_SECRET>
AWS_ACCESS_KEY_ID=<YOUR_AWS_KEY>
AWS_SECRET_ACCESS_KEY=<YOUR_AWS_SECRET>
AWS_REGION=us-east-1
S3_BUCKET=evofaceflow-uploads
REDIS_URL=redis://redis:6379
ALLOWED_ORIGINS=https://evofaceflow.com,https://api.evofaceflow.com,exp://192.168.x.x:8081
```

Generate a secure JWT secret:
```bash
openssl rand -hex 32
```

---

## 🚀 Deployment Steps

### Step 1: Create AWS Lightsail Instance

1. Go to AWS Lightsail Console
2. Create instance:
   - **OS**: Ubuntu 22.04 LTS
   - **Plan**: $10/month (2GB RAM, 1 vCPU) minimum
   - **Region**: Choose closest to your users
3. Create a static IP and attach it
4. Configure firewall rules:
   - SSH (22) - Your IP only
   - HTTP (80) - Anywhere
   - HTTPS (443) - Anywhere

### Step 2: Install Docker on Lightsail

SSH into your instance:
```bash
ssh -i ~/your-key.pem ubuntu@<STATIC_IP>
```

Install Docker and Docker Compose:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for group changes
exit
```

### Step 3: Set Up Project Directory

```bash
# Create app directory
sudo mkdir -p /opt/evofaceflow
sudo chown ubuntu:ubuntu /opt/evofaceflow
cd /opt/evofaceflow

# Clone repository (first time)
git clone https://github.com/YOUR_USERNAME/evofaceflow.git .

# Or pull latest changes
git pull origin main
```

### Step 4: Create Production Environment File

```bash
# Create .env file for production
nano /opt/evofaceflow/backend/.env
```

Add your production environment variables (see Pre-Deployment Checklist above).

### Step 5: Create Production Docker Compose

Create `docker-compose.prod.yml`:
```yaml
version: '3.8'

services:
  mongo:
    image: mongo:7.0
    container_name: evoface-mongo
    restart: always
    volumes:
      - mongo-data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    networks:
      - evoface-network

  redis:
    image: redis:7-alpine
    container_name: evoface-redis
    restart: always
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - evoface-network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    container_name: evoface-backend
    restart: always
    ports:
      - "5000:5000"
    env_file:
      - ./backend/.env
    environment:
      - NODE_ENV=production
    depends_on:
      - mongo
      - redis
    networks:
      - evoface-network

  nginx:
    image: nginx:alpine
    container_name: evoface-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./certbot/www:/var/www/certbot:ro
      - ./certbot/conf:/etc/letsencrypt:ro
    depends_on:
      - backend
    networks:
      - evoface-network

volumes:
  mongo-data:
  redis-data:

networks:
  evoface-network:
    driver: bridge
```

### Step 6: Set Up Nginx Reverse Proxy

Create `nginx/nginx.conf`:
```nginx
events {
    worker_connections 1024;
}

http {
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

    upstream backend {
        server backend:5000;
    }

    server {
        listen 80;
        server_name api.evofaceflow.com;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    server {
        listen 443 ssl http2;
        server_name api.evofaceflow.com;

        ssl_certificate /etc/letsencrypt/live/api.evofaceflow.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/api.evofaceflow.com/privkey.pem;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # API routes with rate limiting
        location /api/auth/login {
            limit_req zone=auth burst=3 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api/auth/signup {
            limit_req zone=auth burst=2 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # For file uploads
            client_max_body_size 100M;
        }

        location /health {
            proxy_pass http://backend;
        }
    }
}
```

### Step 7: Set Up SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot -y

# Create directories
mkdir -p nginx/ssl certbot/www certbot/conf

# Get certificate (stop nginx first if running)
sudo certbot certonly --standalone -d api.evofaceflow.com --email your@email.com --agree-tos

# Copy certificates
sudo cp -L /etc/letsencrypt/live/api.evofaceflow.com/* certbot/conf/
```

### Step 8: Create Production Dockerfile

Create `backend/Dockerfile.prod`:
```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

COPY --from=builder /app/package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

USER nodejs

EXPOSE 5000

CMD ["node", "dist/index.js"]
```

### Step 9: Deploy

```bash
cd /opt/evofaceflow

# Build and start containers
docker-compose -f docker-compose.prod.yml up -d --build

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Check health
curl https://api.evofaceflow.com/health
```

---

## 🔄 CI/CD with GitHub Actions

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Lightsail

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Lightsail
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.LIGHTSAIL_HOST }}
          username: ubuntu
          key: ${{ secrets.LIGHTSAIL_SSH_KEY }}
          script: |
            cd /opt/evofaceflow
            git pull origin main
            docker-compose -f docker-compose.prod.yml up -d --build
            docker system prune -f
```

### Required GitHub Secrets
1. Go to your repo → Settings → Secrets → Actions
2. Add:
   - `LIGHTSAIL_HOST`: Your Lightsail static IP
   - `LIGHTSAIL_SSH_KEY`: Contents of your private SSH key

---

## 🔐 Security Hardening Checklist

### Backend Code Changes Required

1. **Remove JWT Secret Fallback** - Must use environment variable
2. **Add Helmet Middleware** - Security headers
3. **Add Rate Limiting** - Prevent brute force
4. **Add Input Validation** - Prevent injection attacks
5. **Secure Admin Routes** - Add admin authentication
6. **Configure CORS Whitelist** - Only allow specific origins

### Server Hardening

```bash
# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Disable password auth (use SSH keys only)
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Install fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
```

---

## 📱 Frontend Configuration for Production

Update `frontend/src/config/api.ts`:
```typescript
const API_URLS = {
  development: 'http://192.168.68.62:5000',
  production: 'https://api.evofaceflow.com',
};

export const API_BASE_URL = __DEV__ 
  ? API_URLS.development 
  : API_URLS.production;
```

---

## 🔄 Update Workflow

After deploying, your development workflow becomes:

1. **Develop locally** - Work on your laptop
2. **Test locally** - Run `docker-compose up` for local testing
3. **Commit & Push** - `git push origin main`
4. **Auto Deploy** - GitHub Actions deploys to Lightsail
5. **Verify** - Check https://api.evofaceflow.com/health

### Manual Deploy (if needed)
```bash
ssh ubuntu@<LIGHTSAIL_IP> "cd /opt/evofaceflow && git pull && docker-compose -f docker-compose.prod.yml up -d --build"
```

---

## 📊 Monitoring

### View Logs
```bash
# All logs
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f backend
```

### Check Container Status
```bash
docker-compose -f docker-compose.prod.yml ps
```

### MongoDB Backup
```bash
docker exec evoface-mongo mongodump --out /data/backup
docker cp evoface-mongo:/data/backup ./backup-$(date +%Y%m%d)
```

---

## 💰 Cost Estimate

| Service | Monthly Cost |
|---------|--------------|
| Lightsail (2GB) | $10 |
| S3 Storage (10GB) | ~$0.25 |
| S3 Data Transfer | ~$1-5 |
| Domain (optional) | ~$1 |
| **Total** | **~$12-17/month** |
