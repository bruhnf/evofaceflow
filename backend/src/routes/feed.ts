import { Router, Request, Response } from 'express';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Video } from '../models/Video';
import { User } from '../models/User';
import { getSetting } from '../models/AppSettings';
import { s3Client } from '../config/s3';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Cache filler videos list (refresh every 5 minutes)
let fillerVideosCache: string[] = [];
let fillerCacheTime = 0;
const FILLER_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getFillerVideos(): Promise<string[]> {
  const now = Date.now();
  if (fillerVideosCache.length > 0 && now - fillerCacheTime < FILLER_CACHE_DURATION) {
    return fillerVideosCache;
  }

  try {
    const prefix = await getSetting('fillerS3Prefix', 'videos/filler/');
    const bucket = process.env.S3_BUCKET!;
    const region = process.env.AWS_REGION || 'us-east-1';

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);
    const contents = response.Contents || [];

    // Filter to only video files
    fillerVideosCache = contents
      .filter(obj => obj.Key && /\.(mp4|mov|webm)$/i.test(obj.Key))
      .map(obj => `https://${bucket}.s3.${region}.amazonaws.com/${obj.Key}`);

    fillerCacheTime = now;
    console.log(`Cached ${fillerVideosCache.length} filler videos from S3`);
    return fillerVideosCache;
  } catch (error) {
    console.error('Failed to list filler videos from S3:', error);
    return [];
  }
}

// Get random public videos for feed (mixed with filler videos)
router.get('/random', authenticateToken, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    // Get filler percentage setting
    const fillerPercent = await getSetting('fillerImagePercent', 30);
    const fillerCount = Math.round((limit * fillerPercent) / 100);
    const realCount = limit - fillerCount;

    // Get random completed public videos using aggregation
    const videos = await Video.aggregate([
      { $match: { isPublic: true, status: 'completed' } },
      { $sample: { size: realCount } },
    ]);

    // Get user info for each video
    const userIds = [...new Set(videos.map(vid => vid.userId))];
    const users = await User.find({ userId: { $in: userIds } })
      .select('userId username avatarUrl');
    
    const userMap = new Map(users.map(u => [u.userId, {
      username: u.username,
      avatarUrl: u.avatarUrl,
    }]));

    // Real user videos
    const realFeedItems = videos.map(vid => ({
      videoId: vid.videoId,
      videoUrl: vid.finalVideoUrl,
      thumbnailUrl: vid.thumbnailUrl,
      durationSeconds: vid.durationSeconds,
      userId: vid.userId,
      username: userMap.get(vid.userId)?.username || 'Unknown',
      avatarUrl: userMap.get(vid.userId)?.avatarUrl,
      createdAt: vid.createdAt,
      isFiller: false,
    }));

    // Get filler videos
    const allFillerVideos = await getFillerVideos();
    const fillerFeedItems: any[] = [];

    if (allFillerVideos.length > 0 && fillerCount > 0) {
      // Pick random filler videos
      const shuffled = [...allFillerVideos].sort(() => Math.random() - 0.5);
      const selectedFillers = shuffled.slice(0, Math.min(fillerCount, shuffled.length));

      for (const videoUrl of selectedFillers) {
        fillerFeedItems.push({
          videoId: 'filler_' + Math.random().toString(36).substr(2, 9),
          videoUrl,
          thumbnailUrl: videoUrl.replace('.mp4', '_thumb.jpg'), // Assume thumbnail naming
          durationSeconds: 15,
          userId: 'anonymous',
          username: 'Anonymous User',
          avatarUrl: null,
          createdAt: new Date().toISOString(),
          isFiller: true,
        });
      }
    }

    // Mix real and filler videos randomly
    const allItems = [...realFeedItems, ...fillerFeedItems];
    const mixedFeed = allItems.sort(() => Math.random() - 0.5);

    res.json(mixedFeed);
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
