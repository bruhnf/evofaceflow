import { Router } from 'express';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3';
import { v4 as uuidv4 } from 'uuid';
import { Video } from '../models/Video';
import { authenticateToken } from '../middleware/auth';
import videoQueue from '../queue/videoQueue';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max (iPhone photos are typically 2-5MB)
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload images and start video generation
router.post('/images', authenticateToken, upload.array('images', 6), async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const files = req.files as Express.Multer.File[];
    const prompt = req.body.prompt;

    if (!files || files.length < 2) {
      return res.status(400).json({ message: 'At least 2 images required' });
    }

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({ message: 'A prompt is required to generate your video' });
    }

    const videoId = 'vid_' + uuidv4();
    const uploadedImageUrls: string[] = [];
    const bucket = process.env.S3_BUCKET!;
    const region = process.env.AWS_REGION || 'us-east-1';

    // Upload images to temp folder for processing
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const imageKey = `temp/${userId}/${videoId}/image_${i + 1}.jpg`;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await s3Client.send(command);

      const imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/${imageKey}`;
      uploadedImageUrls.push(imageUrl);
    }

    // Calculate duration based on number of images
    // Each pair of images generates a 10s segment, segments are stitched together:
    // Basic (2 images): 1 segment = 10s | Pro (4 images): 2 segments = 20s | Premium (6 images): 3 segments = 30s
    const durationSeconds = files.length <= 2 ? 10 : files.length <= 4 ? 20 : 30;

    // Create Video record with processing status
    const newVideo = new Video({
      videoId,
      userId,
      imageUrls: uploadedImageUrls,
      prompt: prompt.trim(),
      status: 'processing',
      durationSeconds,
      isPublic: true,
    });

    await newVideo.save();

    // Queue the video generation job
    await videoQueue.add('generate-video', {
      videoId,
      userId,
      imageUrls: uploadedImageUrls,
      prompt: prompt.trim(),
      durationSeconds,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    console.log(`🎬 Queued video generation: ${videoId} with ${files.length} images and prompt`);

    res.json({ 
      success: true,
      message: `Video generation started! Your ${durationSeconds}s video will be ready soon.`,
      videoId,
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;