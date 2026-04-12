// API Configuration
// In development: Use your local network IP or ngrok
// In production: Use your actual domain

const API_URLS = {
  // Local development (when using docker-compose locally)
  local: 'http://192.168.68.62:5000',
  
  // Ngrok tunnel (for testing on physical device)
  ngrok: 'https://alden-unconcludable-camilo.ngrok-free.dev',
  
  // Production URL
  production: 'https://api.evofaceflow.com',
};

// Change this to switch between environments:
// - 'local' for local development
// - 'ngrok' for testing on physical iOS/Android devices
// - 'production' for deployed backend
const CURRENT_ENV: keyof typeof API_URLS = 'ngrok';

export const API_BASE_URL = API_URLS[CURRENT_ENV];