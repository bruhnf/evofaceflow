import { Router, Request, Response } from 'express';
import { Video } from '../models/Video';
import { User } from '../models/User';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get random public videos for feed
router.get('/random', authenticateToken, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    // Get random completed public videos using aggregation
    const videos = await Video.aggregate([
      { $match: { isPublic: true, status: 'completed' } },
      { $sample: { size: limit } },
    ]);

    // Get user info for each video
    const userIds = [...new Set(videos.map(vid => vid.userId))];
    const users = await User.find({ userId: { $in: userIds } })
      .select('userId username avatarUrl');
    
    const userMap = new Map(users.map(u => [u.userId, {
      username: u.username,
      avatarUrl: u.avatarUrl,
    }]));

    const feedItems = videos.map(vid => ({
      videoId: vid.videoId,
      videoUrl: vid.finalVideoUrl,
      thumbnailUrl: vid.thumbnailUrl,
      durationSeconds: vid.durationSeconds,
      userId: vid.userId,
      username: userMap.get(vid.userId)?.username || 'Unknown',
      avatarUrl: userMap.get(vid.userId)?.avatarUrl,
      createdAt: vid.createdAt,
    }));

    res.json(feedItems);
  } catch (error) {
    console.error('Feed random error:', error);
    res.status(500).json({ message: 'Failed to fetch feed' });
  }
});

// Get videos from followed users
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

    // Get completed videos from followed users
    const videos = await Video.find({ 
      userId: { $in: followingIds },
      isPublic: true,
      status: 'completed',
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

    const feedItems = videos.map(vid => ({
      videoId: vid.videoId,
      videoUrl: vid.finalVideoUrl,
      thumbnailUrl: vid.thumbnailUrl,
      durationSeconds: vid.durationSeconds,
      userId: vid.userId,
      username: userMap.get(vid.userId)?.username || 'Unknown',
      avatarUrl: userMap.get(vid.userId)?.avatarUrl,
      createdAt: vid.createdAt,
    }));

    res.json(feedItems);
  } catch (error) {
    console.error('Feed following error:', error);
    res.status(500).json({ message: 'Failed to fetch feed' });
  }
});

export default router;
