import { Router, Request, Response } from 'express';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Image } from '../models/Image';
import { User } from '../models/User';
import { getSetting } from '../models/AppSettings';
import { s3Client } from '../config/s3';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Cache filler images list (refresh every 5 minutes)
let fillerImagesCache: string[] = [];
let fillerCacheTime = 0;
const FILLER_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getFillerImages(): Promise<string[]> {
  const now = Date.now();
  if (fillerImagesCache.length > 0 && now - fillerCacheTime < FILLER_CACHE_DURATION) {
    return fillerImagesCache;
  }

  try {
    const prefix = await getSetting('fillerS3Prefix', 'filler/');
    const bucket = process.env.S3_BUCKET!;
    const region = process.env.AWS_REGION || 'us-east-1';

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const response = await s3Client.send(command);
    const contents = response.Contents || [];

    // Filter to only image files
    fillerImagesCache = contents
      .filter(obj => obj.Key && /\.(jpg|jpeg|png|gif|webp)$/i.test(obj.Key))
      .map(obj => `https://${bucket}.s3.${region}.amazonaws.com/${obj.Key}`);

    fillerCacheTime = now;
    console.log(`Cached ${fillerImagesCache.length} filler images from S3`);
    return fillerImagesCache;
  } catch (error) {
    console.error('Failed to list filler images from S3:', error);
    return [];
  }
}

// Get random public images for feed (mixed with filler images)
router.get('/random', authenticateToken, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    // Get filler percentage setting
    const fillerPercent = await getSetting('fillerImagePercent', 30);
    const fillerCount = Math.round((limit * fillerPercent) / 100);
    const realCount = limit - fillerCount;

    // Get random public images using aggregation
    const images = await Image.aggregate([
      { $match: { isPublic: true } },
      { $sample: { size: realCount } },
    ]);

    // Get user info for each image
    const userIds = [...new Set(images.map(img => img.userId))];
    const users = await User.find({ userId: { $in: userIds } })
      .select('userId username avatarUrl');
    
    const userMap = new Map(users.map(u => [u.userId, {
      username: u.username,
      avatarUrl: u.avatarUrl,
    }]));

    // Real user images
    const realFeedItems = images.map(img => ({
      imageId: img.imageId,
      imageUrl: img.imageUrl,
      thumbnailUrl: img.thumbnailUrl,
      userId: img.userId,
      username: userMap.get(img.userId)?.username || 'Unknown',
      avatarUrl: userMap.get(img.userId)?.avatarUrl,
      createdAt: img.createdAt,
      isFiller: false,
    }));

    // Get filler images
    const allFillerImages = await getFillerImages();
    const fillerFeedItems: any[] = [];

    if (allFillerImages.length > 0 && fillerCount > 0) {
      // Pick random filler images
      const shuffled = [...allFillerImages].sort(() => Math.random() - 0.5);
      const selectedFillers = shuffled.slice(0, Math.min(fillerCount, shuffled.length));

      for (const imageUrl of selectedFillers) {
        fillerFeedItems.push({
          imageId: 'filler_' + Math.random().toString(36).substr(2, 9),
          imageUrl,
          thumbnailUrl: imageUrl,
          userId: 'anonymous',
          username: 'Anonymous User',
          avatarUrl: null,
          createdAt: new Date().toISOString(),
          isFiller: true,
        });
      }
    }

    // Mix real and filler images randomly
    const allItems = [...realFeedItems, ...fillerFeedItems];
    const mixedFeed = allItems.sort(() => Math.random() - 0.5);

    res.json(mixedFeed);
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
