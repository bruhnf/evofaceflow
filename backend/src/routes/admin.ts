import { Router } from 'express';
import { User } from '../models/User';
import { Video } from '../models/Video';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

// Admin stats - protected with admin API key
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalVideos = await Video.countDocuments();
    const processingVideos = await Video.countDocuments({ status: 'processing' });
    const completedVideos = await Video.countDocuments({ status: 'completed' });

    const newUsersToday = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    res.json({
      totalUsers,
      totalVideos,
      processingVideos,
      completedVideos,
      newUsersToday,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
});

export default router;