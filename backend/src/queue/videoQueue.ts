import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Video } from '../models/Video';

const redisConnection = new IORedis({
  host: 'redis',
  port: 6379,
  maxRetriesPerRequest: null,
});

export const videoQueue = new Queue('video-generation', {
  connection: redisConnection,
});

const worker = new Worker('video-generation', async (job) => {
  const { videoId, imageUrls, userId, durationSeconds } = job.data;

  console.log(`🎬 Starting video generation simulation for ${videoId} (${imageUrls.length} images)`);

  try {
    // Simulate pairwise Kling morph generation
    for (let i = 0; i < imageUrls.length - 1; i++) {
      console.log(`Simulating Kling morph segment ${i+1}/${imageUrls.length-1}`);
      await new Promise(resolve => setTimeout(resolve, 4500)); // ~4.5s per segment
    }

    // Simulate FFmpeg stitching
    console.log(`Simulating FFmpeg stitching into final ${durationSeconds}s video...`);
    await new Promise(resolve => setTimeout(resolve, 3500));

    const finalVideoKey = `videos/${userId}/${videoId}.mp4`;
    const thumbnailKey = `thumbnails/${userId}/${videoId}.jpg`;

    await Video.findOneAndUpdate(
      { videoId },
      {
        status: 'completed',
        finalVideoUrl: `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${finalVideoKey}`,
        thumbnailUrl: `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${thumbnailKey}`,
      }
    );

    console.log(`✅ Video ${videoId} marked as completed (simulation mode)`);
  } catch (error) {
    console.error(`❌ Simulation failed for ${videoId}:`, error);
    await Video.findOneAndUpdate({ videoId }, { status: 'failed' });
  }
}, { 
  connection: redisConnection,
  concurrency: 1
});

export default videoQueue;