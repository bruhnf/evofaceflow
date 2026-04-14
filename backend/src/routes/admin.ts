import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { Video } from '../models/Video';
import { Image } from '../models/Image';
import { Follow } from '../models/Follow';
import { authenticateAdmin } from '../middleware/auth';
import bcrypt from 'bcryptjs';

const router = Router();

// Admin stats - protected with admin API key
router.get('/stats', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalVideos = await Video.countDocuments();
    const totalImages = await Image.countDocuments();
    const processingVideos = await Video.countDocuments({ status: 'processing' });
    const completedVideos = await Video.countDocuments({ status: 'completed' });

    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    const newImagesThisWeek = await Image.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    // Users with uploads
    const usersWithImages = await Image.distinct('userId');
    const usersWithVideos = await Video.distinct('userId');

    // Subscription breakdown
    const beginnerCount = await User.countDocuments({ subscriptionLevel: 'beginner' });
    const intermediateCount = await User.countDocuments({ subscriptionLevel: 'intermediate' });
    const advancedCount = await User.countDocuments({ subscriptionLevel: 'advanced' });

    res.json({
      totalUsers,
      totalVideos,
      totalImages,
      processingVideos,
      completedVideos,
      newUsersToday,
      newImagesThisWeek,
      usersWithImages: usersWithImages.length,
      usersWithVideos: usersWithVideos.length,
      subscriptionBreakdown: {
        beginner: beginnerCount,
        intermediate: intermediateCount,
        advanced: advancedCount,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

// List all users
router.get('/users', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(100);

    // Get image counts for each user
    const userIds = users.map(u => u.userId);
    const imageCounts = await Image.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } }
    ]);
    const imageCountMap = new Map(imageCounts.map(ic => [ic._id, ic.count]));

    const usersWithCounts = users.map(user => ({
      userId: user.userId,
      username: user.username,
      email: user.email,
      subscriptionLevel: user.subscriptionLevel,
      verified: user.verified,
      followersCount: user.followersCount,
      followingCount: user.followingCount,
      imageCount: imageCountMap.get(user.userId) || 0,
      createdAt: user.createdAt,
    }));

    res.json(usersWithCounts);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Create test user
router.post('/users/create', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { username, email, password, subscriptionLevel } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Username, email, and password are required' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2);

    const newUser = new User({
      userId,
      username,
      email,
      password: hashedPassword,
      verified: true, // Auto-verify test users
      subscriptionLevel: subscriptionLevel || 'beginner',
    });

    await newUser.save();

    res.json({
      message: 'Test user created successfully',
      user: {
        userId: newUser.userId,
        username: newUser.username,
        email: newUser.email,
        subscriptionLevel: newUser.subscriptionLevel,
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// Delete user
router.delete('/users/:userId', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete user's data
    await Image.deleteMany({ userId });
    await Video.deleteMany({ userId });
    await Follow.deleteMany({ $or: [{ followerId: userId }, { followingId: userId }] });
    await User.deleteOne({ userId });

    res.json({ message: 'User and all associated data deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

// Update user subscription
router.put('/users/:userId/subscription', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { subscriptionLevel } = req.body;

    if (!['beginner', 'intermediate', 'advanced'].includes(subscriptionLevel)) {
      return res.status(400).json({ message: 'Invalid subscription level' });
    }

    const user = await User.findOneAndUpdate(
      { userId },
      { subscriptionLevel },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Subscription updated',
      user: {
        userId: user.userId,
        username: user.username,
        subscriptionLevel: user.subscriptionLevel,
      }
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    res.status(500).json({ message: 'Failed to update subscription' });
  }
});

// Get recent images (for admin review)
router.get('/images', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const images = await Image.find()
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(images);
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({ message: 'Failed to fetch images' });
  }
});

// Delete image
router.delete('/images/:imageId', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const { imageId } = req.params;
    await Image.deleteOne({ imageId });
    res.json({ message: 'Image deleted' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ message: 'Failed to delete image' });
  }
});

export default router;