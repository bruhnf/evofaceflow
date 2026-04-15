import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Video } from '../models/Video';
import { generateVideo, checkVideoStatus, downloadAndUploadVideo, getS3Url } from '../services/grokService';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3';

const redisConnection = new IORedis({
  host: 'redis',
  port: 6379,
  maxRetriesPerRequest: null,
});

export const videoQueue = new Queue('video-generation', {
  connection: redisConnection,
});

const MAX_POLL_ATTEMPTS = 60; // Max 5 minutes of polling (60 * 5 seconds)
const POLL_INTERVAL = 5000; // 5 seconds

const worker = new Worker('video-generation', async (job) => {
  const { videoId, imageUrls, userId, durationSeconds } = job.data;

  console.log(`🎬 Starting video generation for ${videoId} (${imageUrls.length} images, ${durationSeconds}s)`);

  try {
    // Call Grok Imagine API
    const grokResponse = await generateVideo({
      images: imageUrls,
      duration: durationSeconds,
      style: 'morph',
    });

    console.log(`Grok API response:`, grokResponse);

    // If the API returns a completed video immediately
    if (grokResponse.status === 'completed' && grokResponse.video_url) {
      await handleCompletedVideo(videoId, userId, grokResponse.video_url, grokResponse.thumbnail_url, imageUrls);
      return { success: true, videoId };
    }

    // If the API returns a pending/processing status, we need to poll
    if (grokResponse.id && (grokResponse.status === 'pending' || grokResponse.status === 'processing')) {
      // Save generation ID for tracking
      await Video.findOneAndUpdate(
        { videoId },
        { grokGenerationId: grokResponse.id }
      );

      // Poll for completion
      let pollCount = 0;
      while (pollCount < MAX_POLL_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        pollCount++;

        console.log(`Polling Grok API for ${videoId} (attempt ${pollCount}/${MAX_POLL_ATTEMPTS})...`);
        
        const statusResponse = await checkVideoStatus(grokResponse.id);
        
        if (statusResponse.status === 'completed' && statusResponse.video_url) {
          await handleCompletedVideo(videoId, userId, statusResponse.video_url, statusResponse.thumbnail_url, imageUrls);
          return { success: true, videoId };
        }

        if (statusResponse.status === 'failed') {
          throw new Error(statusResponse.error || 'Video generation failed on Grok API');
        }
      }

      // Timeout
      throw new Error('Video generation timed out');
    }

    // If we got an error or unexpected status
    if (grokResponse.status === 'failed' || grokResponse.error) {
      throw new Error(grokResponse.error || 'Video generation failed');
    }

    throw new Error(`Unexpected Grok API response status: ${grokResponse.status}`);
  } catch (error: any) {
    console.error(`❌ Video generation failed for ${videoId}:`, error.message);
    
    await Video.findOneAndUpdate(
      { videoId },
      { 
        status: 'failed',
        errorMessage: error.message || 'Unknown error',
      }
    );
    
    throw error;
  }
}, { 
  connection: redisConnection,
  concurrency: 2, // Process 2 videos at a time
});

/**
 * Handle a completed video from Grok API
 */
async function handleCompletedVideo(
  videoId: string,
  userId: string,
  videoUrl: string,
  thumbnailUrl: string | undefined,
  imageUrls: string[]
): Promise<void> {
  console.log(`✅ Video ${videoId} completed, downloading from Grok...`);

  // Download video and upload to our S3
  const { videoKey, thumbnailKey } = await downloadAndUploadVideo(videoUrl, userId, videoId);

  const finalVideoUrl = getS3Url(videoKey);
  const finalThumbnailUrl = thumbnailUrl || getS3Url(thumbnailKey);

  // Update video record
  await Video.findOneAndUpdate(
    { videoId },
    { 
      status: 'completed',
      finalVideoUrl,
      thumbnailUrl: finalThumbnailUrl,
      completedAt: new Date(),
    }
  );

  console.log(`🎉 Video ${videoId} saved to S3: ${finalVideoUrl}`);

  // Clean up temp images
  await cleanupTempImages(imageUrls);
}

/**
 * Delete temporary images from S3 after video is generated
 */
async function cleanupTempImages(imageUrls: string[]): Promise<void> {
  try {
    const bucket = process.env.S3_BUCKET!;
    const keys = imageUrls.map(url => {
      const urlParts = new URL(url);
      return urlParts.pathname.substring(1); // Remove leading /
    }).filter(key => key.startsWith('temp/'));

    if (keys.length === 0) return;

    await s3Client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: keys.map(Key => ({ Key })),
      },
    }));

    console.log(`🧹 Cleaned up ${keys.length} temp images`);
  } catch (error) {
    console.error('Failed to cleanup temp images:', error);
    // Don't throw - cleanup failure shouldn't fail the job
  }
}

// Handle worker events
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

export default videoQueue;