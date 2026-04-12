import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { Video } from '../models/Video';

const router = Router();

// Get all videos for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;

    const videos = await Video.find({ userId })
      .sort({ createdAt: -1 })
      .select('videoId durationSeconds status thumbnailUrl finalVideoUrl');

    res.json(videos);
  } catch (error: any) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ message: 'Failed to fetch videos' });
  }
});

export default router;