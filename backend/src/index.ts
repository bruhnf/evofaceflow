// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import path from 'path';
import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import videoRoutes from './routes/video';
import adminRoutes from './routes/admin';
import friendsRoutes from './routes/friends';
import feedRoutes from './routes/feed';
import { initializeSettings } from './models/AppSettings';

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Trust proxy headers (needed behind nginx for correct client IP in rate limiting)
app.set('trust proxy', 1);

// Serve admin dashboard BEFORE helmet (needs inline scripts)
app.get('/admin', (req, res) => {
  // Disable CSP for admin page to allow inline scripts and event handlers
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'");
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.startsWith('exp://')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per window (increased for video polling)
  message: { message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 auth attempts per window
  message: { message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// Body parser with size limit
app.use(express.json({ limit: '1mb' }));
app.use('/api/upload', uploadRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/feed', feedRoutes);


mongoose.connect(process.env.MONGO_URI!)
  .then(async () => {
    console.log('✅ MongoDB connected');
    await initializeSettings();
    console.log('✅ App settings initialized');
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'EvoFaceFlow backend is running!' });
});

// app.listen(PORT, () => {
//   console.log(`🚀 Backend server running on http://localhost:${PORT}`);
// });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend server running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Use http://192.168.68.62:${PORT} from mobile devices`);
});