import { Router } from 'express';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3';
import { v4 as uuidv4 } from 'uuid';
import { Image } from '../models/Image';
import { authenticateToken } from '../middleware/auth';

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

    const uploadedImages: any[] = [];

    for (const file of files) {
      const imageId = 'img_' + uuidv4();
      const key = `images/${userId}/${imageId}.jpg`;

      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      });

      await s3Client.send(command);

      const imageUrl = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

      // Save to Image model
      const newImage = new Image({
        imageId,
        userId,
        imageUrl,
        isPublic: true, // Images are public for the feed
      });

      await newImage.save();
      uploadedImages.push({
        imageId,
        imageUrl,
      });
    }

    res.json({ 
      success: true,
      message: `${uploadedImages.length} images uploaded successfully!`,
      images: uploadedImages,
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;