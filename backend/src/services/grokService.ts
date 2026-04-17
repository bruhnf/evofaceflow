import axios from 'axios';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

const GROK_VIDEO_API_URL = 'https://api.x.ai/v1/videos/generations';
const GROK_VIDEO_STATUS_URL = 'https://api.x.ai/v1/videos';

// Read API key at runtime, not module load time
function getGrokApiKey(): string {
  const key = process.env.GROK_API_KEY;
  if (!key) {
    throw new Error('GROK_API_KEY is not configured in environment variables');
  }
  return key;
}

interface GrokVideoRequest {
  images: string[]; // Array of image URLs (used as reference images)
  duration?: number; // Target duration in seconds (max 10s for reference images)
  prompt: string;    // Required prompt for reference images API
}

interface GrokVideoResponse {
  request_id?: string;
  status?: 'pending' | 'done' | 'failed';
  progress?: number;
  video?: {
    url: string;
    duration: number;
  };
  error?: string;
}

/**
 * Download image from S3 and convert to base64 data URL
 */
async function getImageAsDataUrl(imageUrl: string): Promise<string> {
  try {
    const bucket = process.env.S3_BUCKET!;
    if (imageUrl.includes(bucket)) {
      const urlParts = new URL(imageUrl);
      const key = urlParts.pathname.substring(1);
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      const response = await s3Client.send(command);
      const bodyContents = await response.Body?.transformToByteArray();
      if (bodyContents) {
        const base64 = Buffer.from(bodyContents).toString('base64');
        return `data:image/jpeg;base64,${base64}`;
      }
    }
    
    // Fallback: fetch via HTTP
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error('Failed to convert image to data URL:', imageUrl, error);
    throw error;
  }
}

/**
 * Submit video generation request to xAI Grok Imagine Video API
 * Using "Generate Videos using Reference Images" API
 * Reference images influence what appears in the video without locking the first frame
 * Note: Max 7 reference images, max 10 seconds duration for reference images
 */
export async function generateVideo(request: GrokVideoRequest): Promise<GrokVideoResponse> {
  const apiKey = getGrokApiKey();

  try {
    // Convert all images to data URLs for reference_image_urls
    console.log(`Converting ${request.images.length} images to data URLs for xAI API...`);
    const referenceImageUrls: string[] = [];
    for (const imageUrl of request.images) {
      const dataUrl = await getImageAsDataUrl(imageUrl);
      referenceImageUrls.push(dataUrl);
    }

    // API requires prompt for reference images
    const prompt = request.prompt;

    // Max duration for reference images is 10 seconds per API docs
    const duration = Math.min(request.duration || 10, 10);

    const requestBody = {
      model: 'grok-imagine-video',
      prompt: prompt,
      reference_image_urls: referenceImageUrls,
      duration: duration,
      aspect_ratio: '9:16',
      resolution: '720p',
    };

    // Log request details
    console.log('========== GROK API REQUEST ==========');
    console.log('URL:', GROK_VIDEO_API_URL);
    console.log('Method: POST');
    console.log('Model:', requestBody.model);
    console.log('Prompt:', prompt);
    console.log('Reference Images:', referenceImageUrls.length);
    console.log('Duration:', duration);
    console.log('Aspect Ratio:', requestBody.aspect_ratio);
    console.log('Resolution:', requestBody.resolution);
    console.log('=======================================');
    
    const response = await axios.post(
      GROK_VIDEO_API_URL,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 1 minute timeout for initial request
      }
    );

    console.log('========== GROK API RESPONSE ==========');
    console.log('Status:', response.status, response.statusText);
    console.log('Body:', JSON.stringify(response.data, null, 2));
    console.log('========================================');

    // xAI returns request_id for polling
    return {
      request_id: response.data.request_id,
      status: 'pending',
      progress: 0,
    };
  } catch (error: any) {
    console.log('========== GROK API ERROR ==========');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Response Body:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    console.log('=====================================');
    
    if (error.response?.status === 401) {
      throw new Error('Invalid Grok API key');
    } else if (error.response?.status === 429) {
      throw new Error('Grok API rate limit exceeded');
    } else if (error.response?.status === 400 || error.response?.status === 422) {
      throw new Error(`Grok API bad request: ${JSON.stringify(error.response?.data)}`);
    }
    
    throw new Error(`Grok API error: ${error.message}`);
  }
}

/**
 * Check the status of a video generation job
 */
export async function checkVideoStatus(requestId: string): Promise<GrokVideoResponse> {
  const apiKey = getGrokApiKey();
  const url = `${GROK_VIDEO_STATUS_URL}/${requestId}`;
  
  console.log('========== GROK STATUS CHECK ==========');
  console.log('URL:', url);
  console.log('========================================');

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    console.log('========== GROK STATUS RESPONSE ==========');
    console.log('Status:', response.status);
    console.log('Body:', JSON.stringify(response.data, null, 2));
    console.log('==========================================');

    return {
      request_id: requestId,
      status: response.data.status,
      progress: response.data.progress,
      video: response.data.video,
    };
  } catch (error: any) {
    console.log('========== GROK STATUS ERROR ==========');
    console.log('Status:', error.response?.status);
    console.log('Response Body:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    console.log('=======================================');
    throw error;
  }
}

/**
 * Download video from URL and upload to S3
 */
export async function downloadAndUploadVideo(
  videoUrl: string,
  userId: string,
  videoId: string
): Promise<{ videoKey: string; thumbnailKey: string }> {
  const bucket = process.env.S3_BUCKET!;
  const region = process.env.AWS_REGION || 'us-east-1';

  // Download the video
  console.log(`Downloading video from: ${videoUrl}`);
  const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
  const videoBuffer = Buffer.from(videoResponse.data);

  // Upload video to S3 with public read access
  const videoKey = `videos/${userId}/${videoId}.mp4`;
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: videoKey,
    Body: videoBuffer,
    ContentType: 'video/mp4',
    ACL: 'public-read',
  }));

  console.log(`Video uploaded to S3: ${videoKey}`);

  // For thumbnail, we'll use a placeholder path
  const thumbnailKey = `thumbnails/${userId}/${videoId}.jpg`;
  
  return {
    videoKey,
    thumbnailKey,
  };
}

/**
 * Get the full S3 URL for a key
 */
export function getS3Url(key: string): string {
  const bucket = process.env.S3_BUCKET!;
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Download a video from URL to a local temp file
 */
export async function downloadVideoToFile(videoUrl: string, filePath: string): Promise<void> {
  console.log(`Downloading video to: ${filePath}`);
  const response = await axios.get(videoUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, Buffer.from(response.data));
}

/**
 * Stitch multiple video files together using ffmpeg
 * Returns the path to the stitched video file
 */
export async function stitchVideos(videoPaths: string[], outputPath: string): Promise<void> {
  if (videoPaths.length === 0) {
    throw new Error('No videos to stitch');
  }

  if (videoPaths.length === 1) {
    // Just copy the single video
    fs.copyFileSync(videoPaths[0], outputPath);
    return;
  }

  console.log(`🎬 Stitching ${videoPaths.length} videos together...`);

  // Create a concat file for ffmpeg
  const tempDir = path.dirname(outputPath);
  const concatFilePath = path.join(tempDir, 'concat.txt');
  
  // Write the concat file with proper escaping
  const concatContent = videoPaths
    .map(p => `file '${p.replace(/'/g, "'\\''")}'`)
    .join('\n');
  fs.writeFileSync(concatFilePath, concatContent);

  try {
    // Use ffmpeg concat demuxer for seamless stitching
    const ffmpegCommand = `ffmpeg -y -f concat -safe 0 -i "${concatFilePath}" -c copy "${outputPath}"`;
    console.log(`Running: ${ffmpegCommand}`);
    
    const { stdout, stderr } = await execAsync(ffmpegCommand);
    if (stderr) {
      console.log('ffmpeg stderr:', stderr);
    }
    
    console.log(`✅ Videos stitched successfully: ${outputPath}`);
  } finally {
    // Clean up concat file
    if (fs.existsSync(concatFilePath)) {
      fs.unlinkSync(concatFilePath);
    }
  }
}

/**
 * Upload a local video file to S3
 */
export async function uploadVideoToS3(
  localPath: string,
  userId: string,
  videoId: string
): Promise<{ videoKey: string; thumbnailKey: string }> {
  const bucket = process.env.S3_BUCKET!;

  const videoBuffer = fs.readFileSync(localPath);
  const videoKey = `videos/${userId}/${videoId}.mp4`;
  
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: videoKey,
    Body: videoBuffer,
    ContentType: 'video/mp4',
    ACL: 'public-read',
  }));

  console.log(`Video uploaded to S3: ${videoKey}`);

  const thumbnailKey = `thumbnails/${userId}/${videoId}.jpg`;
  
  return {
    videoKey,
    thumbnailKey,
  };
}

/**
 * Clean up temporary files
 */
export function cleanupTempFiles(filePaths: string[]): void {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }
}

/**
 * Get a temp directory path for video processing
 */
export function getTempDir(): string {
  const tempDir = path.join(os.tmpdir(), 'evofaceflow-videos');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}
