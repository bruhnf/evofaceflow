# backend/Dockerfile

# Use official lightweight Node.js image (Alpine is small and fast)
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first (this helps with caching layers)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the backend code
COPY . .

# Expose port 5000 (the port our Express server will listen on)
EXPOSE 5000

# Command to start the server in development mode
# (We will change this later for production)
CMD ["npm", "run", "dev"]