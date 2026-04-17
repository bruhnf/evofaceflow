# backend/Dockerfile (Development)

# Use official lightweight Node.js image (Alpine is small and fast)
FROM node:20-alpine

# Install ffmpeg for video stitching
RUN apk add --no-cache ffmpeg

# Set working directory inside the container
WORKDIR /app

# Copy package files first (this helps with caching layers)
COPY package*.json ./

# Install ALL dependencies (including devDependencies for ts-node-dev)
RUN npm ci

# Copy the rest of the backend code
COPY . .

# Expose port 5000 (the port our Express server will listen on)
EXPOSE 5000

# Command to start the server in development mode
CMD ["npm", "run", "dev"]