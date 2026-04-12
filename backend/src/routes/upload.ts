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

router.post('/images', authenticateToken, upload.array('images', 9), async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const files = req.files as Express.Multer.File[];

    if (!files || files.length < 3) {
      return res.status(400).json({ message: 'At least 3 images required' });
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const key = `uploads/${userId}/${Date.now()}-${uuidv4()}-${file.originalname}`;

      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await s3Client.send(command);

      const url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
      uploadedUrls.push(url);
    }

    const durationSeconds = uploadedUrls.length === 3 ? 15 : uploadedUrls.length <= 6 ? 30 : 60;

    // Create Video record
    const newVideo = new Video({
      videoId: 'vid_' + uuidv4(),
      userId,
      imageUrls: uploadedUrls,
      status: 'processing',
      durationSeconds,
    });

    await newVideo.save();

    // Queue the AI generation job
    await videoQueue.add('generate-video', {
      videoId: newVideo.videoId,
      imageUrls: uploadedUrls,
      userId,
      durationSeconds,
    });

    res.json({ 
      success: true,
      message: 'Images uploaded successfully. Video generation started in background.',
      videoId: newVideo.videoId,
      durationSeconds
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;