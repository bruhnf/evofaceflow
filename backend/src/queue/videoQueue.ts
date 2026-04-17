import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Video } from '../models/Video';
import { 
  generateVideo, 
  checkVideoStatus, 
  downloadAndUploadVideo, 
  getS3Url,
  downloadVideoToFile,
  stitchVideos,
  uploadVideoToS3,
  cleanupTempFiles,
  getTempDir
} from '../services/grokService';
import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3';
import * as path from 'path';

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
const IMAGES_PER_SEGMENT = 2; // Each video segment uses 2 reference images

/**
 * Split image URLs into segments of 2 for multi-video generation
 * Basic (2 images): 1 segment
 * Pro (4 images): 2 segments  
 * Premium (6 images): 3 segments
 */
function splitIntoSegments(imageUrls: string[]): string[][] {
  const segments: string[][] = [];
  for (let i = 0; i < imageUrls.length; i += IMAGES_PER_SEGMENT) {
    segments.push(imageUrls.slice(i, i + IMAGES_PER_SEGMENT));
  }
  return segments;
}

/**
 * Generate a single video segment and poll until complete
 * Returns the xAI video URL when done
 */
async function generateAndPollSegment(
  segmentImages: string[],
  prompt: string,
  segmentIndex: number,
  totalSegments: number,
  resolution: '480p' | '720p' = '720p'
): Promise<string> {
  console.log(`🎬 Generating segment ${segmentIndex + 1}/${totalSegments} with ${segmentImages.length} images at ${resolution}...`);

  // Modify prompt for multi-segment videos to ensure continuity
  let segmentPrompt = prompt;
  if (totalSegments > 1) {
    if (segmentIndex === 0) {
      segmentPrompt = `${prompt} This is the beginning of the video.`;
    } else if (segmentIndex === totalSegments - 1) {
      segmentPrompt = `${prompt} This is the ending of the video, continuing smoothly from previous scenes.`;
    } else {
      segmentPrompt = `${prompt} This is a middle section, continuing smoothly from previous scenes.`;
    }
  }

  const grokResponse = await generateVideo({
    images: segmentImages,
    duration: 10, // Each segment is 10 seconds
    prompt: segmentPrompt,
    resolution,
  });

  if (!grokResponse.request_id) {
    throw new Error(`No request_id returned for segment ${segmentIndex + 1}`);
  }

  // Poll for completion
  let pollCount = 0;
  while (pollCount < MAX_POLL_ATTEMPTS) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    pollCount++;

    console.log(`Polling segment ${segmentIndex + 1} (attempt ${pollCount}/${MAX_POLL_ATTEMPTS})...`);
    
    const statusResponse = await checkVideoStatus(grokResponse.request_id);
    
    if (statusResponse.status === 'done' && statusResponse.video?.url) {
      console.log(`✅ Segment ${segmentIndex + 1} completed!`);
      return statusResponse.video.url;
    }

    if (statusResponse.status === 'failed') {
      throw new Error(statusResponse.error || `Segment ${segmentIndex + 1} failed on xAI API`);
    }
  }

  throw new Error(`Segment ${segmentIndex + 1} timed out after 5 minutes`);
}

const worker = new Worker('video-generation', async (job) => {
  const { videoId, imageUrls, userId, prompt, durationSeconds, resolution = '720p' } = job.data;

  // Split images into segments (pairs of 2)
  const segments = splitIntoSegments(imageUrls);
  const isMultiSegment = segments.length > 1;

  console.log(`🎬 Starting video generation for ${videoId}`);
  console.log(`📊 ${imageUrls.length} images → ${segments.length} segment(s) → ${segments.length * 10}s total`);
  console.log(`📝 Prompt: ${prompt}`);
  console.log(`📺 Resolution: ${resolution}`);

  const tempFiles: string[] = [];
  const tempDir = getTempDir();

  try {
    if (isMultiSegment) {
      // Multi-segment: Generate each segment, download, stitch, upload
      const segmentVideoUrls: string[] = [];

      // Generate all segments
      for (let i = 0; i < segments.length; i++) {
        const segmentUrl = await generateAndPollSegment(segments[i], prompt, i, segments.length, resolution);
        segmentVideoUrls.push(segmentUrl);
        
        // Update progress
        await Video.findOneAndUpdate(
          { videoId },
          { grokGenerationId: `segment_${i + 1}_of_${segments.length}` }
        );
      }

      // Download all segment videos to temp files
      const segmentPaths: string[] = [];
      for (let i = 0; i < segmentVideoUrls.length; i++) {
        const segmentPath = path.join(tempDir, `${videoId}_segment_${i}.mp4`);
        await downloadVideoToFile(segmentVideoUrls[i], segmentPath);
        segmentPaths.push(segmentPath);
        tempFiles.push(segmentPath);
      }

      // Stitch videos together
      const stitchedPath = path.join(tempDir, `${videoId}_final.mp4`);
      tempFiles.push(stitchedPath);
      await stitchVideos(segmentPaths, stitchedPath);

      // Upload final video to S3
      const { videoKey, thumbnailKey } = await uploadVideoToS3(stitchedPath, userId, videoId);
      
      const finalVideoUrl = getS3Url(videoKey);
      const finalThumbnailUrl = getS3Url(thumbnailKey);

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

      console.log(`🎉 Multi-segment video ${videoId} completed: ${finalVideoUrl}`);
      
      // Clean up temp images from S3
      await cleanupTempImages(imageUrls);
      
      return { success: true, videoId, segments: segments.length };

    } else {
      // Single segment: Use original flow
      const grokResponse = await generateVideo({
        images: imageUrls,
        duration: 10,
        prompt: prompt,
        resolution,
      });

      if (!grokResponse.request_id) {
        throw new Error('No request_id returned from Grok API');
      }

      await Video.findOneAndUpdate(
        { videoId },
        { grokGenerationId: grokResponse.request_id }
      );

      // Poll for completion
      let pollCount = 0;
      while (pollCount < MAX_POLL_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        pollCount++;

        console.log(`Polling xAI API for ${videoId} (attempt ${pollCount}/${MAX_POLL_ATTEMPTS})...`);
        
        const statusResponse = await checkVideoStatus(grokResponse.request_id);
        
        if (statusResponse.status === 'done' && statusResponse.video?.url) {
          await handleCompletedVideo(videoId, userId, statusResponse.video.url, undefined, imageUrls);
          return { success: true, videoId, segments: 1 };
        }

        if (statusResponse.status === 'failed') {
          throw new Error(statusResponse.error || 'Video generation failed on xAI API');
        }
      }

      throw new Error('Video generation timed out after 5 minutes');
    }
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
  } finally {
    // Always clean up temp files
    cleanupTempFiles(tempFiles);
  }
}, { 
  connection: redisConnection,
  concurrency: 2, // Process 2 videos at a time
});

/**
 * Handle a completed video from xAI API
 */
async function handleCompletedVideo(
  videoId: string,
  userId: string,
  videoUrl: string,
  thumbnailUrl: string | undefined,
  imageUrls: string[]
): Promise<void> {
  console.log(`✅ Video ${videoId} completed, downloading from xAI...`);

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