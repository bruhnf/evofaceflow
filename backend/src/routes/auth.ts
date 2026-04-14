import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User';
import { addUserLocation } from '../models/UserLocation';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import geoip from 'geoip-lite';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Helper to get client IP from request
const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

// Input validation middleware
const signupValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('username').isLength({ min: 3, max: 30 }).trim().escape().withMessage('Username must be 3-30 characters'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

// Signup
router.post('/signup', signupValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2);

    const newUser = new User({
      userId,
      username,
      email,
      password: hashedPassword,
      verified: false,
      subscriptionLevel: 'beginner',   // default
    });

    await newUser.save();

    // TODO: Send real verification email later (AWS SES)

    res.status(201).json({ 
      message: 'User created successfully. Please verify your email (console for now).', 
      userId 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Login
router.post('/login', loginValidation, async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user.userId, email: user.email },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    // Track user location on login
    const clientIp = getClientIp(req);
    const geo = geoip.lookup(clientIp);
    addUserLocation(user.userId, clientIp, geo).catch(err => {
      console.error('Failed to log user location:', err);
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        userId: user.userId,
        username: user.username,
        subscriptionLevel: user.subscriptionLevel,
        verified: user.verified,
        bio: user.bio || '',
        avatarUrl: user.avatarUrl || '',
        followingCount: user.followingCount,
        followersCount: user.followersCount,
        likesCount: user.likesCount,
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const user = await User.findOne({ userId });
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      userId: user.userId,
      username: user.username,
      subscriptionLevel: user.subscriptionLevel,
      verified: user.verified,
      bio: user.bio || '',
      avatarUrl: user.avatarUrl || '',
      followingCount: user.followingCount,
      followersCount: user.followersCount,
      likesCount: user.likesCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { userId } = (req as any).user;
    const { username, bio, avatarUrl } = req.body;

    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if username is being changed and if it's already taken
    if (username && username !== user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ message: 'Username already taken' });
      }
      user.username = username;
    }

    if (bio !== undefined) user.bio = bio;
    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        userId: user.userId,
        username: user.username,
        subscriptionLevel: user.subscriptionLevel,
        verified: user.verified,
        bio: user.bio || '',
        avatarUrl: user.avatarUrl || '',
        followingCount: user.followingCount,
        followersCount: user.followersCount,
        likesCount: user.likesCount,
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;