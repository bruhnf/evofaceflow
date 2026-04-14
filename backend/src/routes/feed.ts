import { Router, Request, Response } from 'express';
import { Image } from '../models/Image';
import { User } from '../models/User';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get random public images for feed
router.get('/random', authenticateToken, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    // Get random public images using aggregation
    const images = await Image.aggregate([
      { $match: { isPublic: true } },
      { $sample: { size: limit } },
    ]);

    // Get user info for each image
    const userIds = [...new Set(images.map(img => img.userId))];
    const users = await User.find({ userId: { $in: userIds } })
      .select('userId username avatarUrl');
    
    const userMap = new Map(users.map(u => [u.userId, {
      username: u.username,
      avatarUrl: u.avatarUrl,
    }]));

    // Attach user info to images
    const feedItems = images.map(img => ({
      imageId: img.imageId,
      imageUrl: img.imageUrl,
      thumbnailUrl: img.thumbnailUrl,
      userId: img.userId,
      username: userMap.get(img.userId)?.username || 'Unknown',
      avatarUrl: userMap.get(img.userId)?.avatarUrl,
      createdAt: img.createdAt,
    }));

    res.json(feedItems);
  } catch (error) {
    console.error('Feed random error:', error);
    res.status(500).json({ message: 'Failed to fetch feed' });
  }
});

// Get images from followed users
router.get('/following', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const skip = parseInt(req.query.skip as string) || 0;

    // Get list of users this user follows
    const { Follow } = await import('../models/Follow');
    const following = await Follow.find({ followerId: userId }).select('followingId');
    const followingIds = following.map(f => f.followingId);

    if (followingIds.length === 0) {
      return res.json([]);
    }

    // Get images from followed users
    const images = await Image.find({ 
      userId: { $in: followingIds },
      isPublic: true 
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get user info
    const users = await User.find({ userId: { $in: followingIds } })
      .select('userId username avatarUrl');
    
    const userMap = new Map(users.map(u => [u.userId, {
      username: u.username,
      avatarUrl: u.avatarUrl,
    }]));

    const feedItems = images.map(img => ({
      imageId: img.imageId,
      imageUrl: img.imageUrl,
      thumbnailUrl: img.thumbnailUrl,
      userId: img.userId,
      username: userMap.get(img.userId)?.username || 'Unknown',
      avatarUrl: userMap.get(img.userId)?.avatarUrl,
      createdAt: img.createdAt,
    }));

    res.json(feedItems);
  } catch (error) {
    console.error('Feed following error:', error);
    res.status(500).json({ message: 'Failed to fetch feed' });
  }
});

export default router;
