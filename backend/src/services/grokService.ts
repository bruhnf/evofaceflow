import axios from 'axios';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3';

const GROK_API_URL = 'https://api.x.ai/v1/videos/generations';

// Read API key at runtime, not module load time
function getGrokApiKey(): string {
  const key = process.env.GROK_API_KEY;
  if (!key) {
    throw new Error('GROK_API_KEY is not configured in environment variables');
  }
  return key;
}

interface GrokVideoRequest {
  images: string[]; // Array of image URLs
  duration?: number; // Target duration in seconds
  style?: 'morph' | 'timelapse' | 'cinematic';
  fps?: number;
}

interface GrokVideoResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  thumbnail_url?: string;
  error?: string;
}

/**
 * Download image from S3 and convert to base64
 */
async function getImageAsBase64(imageUrl: string): Promise<string> {
  try {
    // If it's an S3 URL from our bucket, download directly
    const bucket = process.env.S3_BUCKET!;
    if (imageUrl.includes(bucket)) {
      // Extract key from URL
      const urlParts = new URL(imageUrl);
      const key = urlParts.pathname.substring(1); // Remove leading /
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      const response = await s3Client.send(command);
      const bodyContents = await response.Body?.transformToByteArray();
      if (bodyContents) {
        return `data:image/jpeg;base64,${Buffer.from(bodyContents).toString('base64')}`;
      }
    }
    
    // Fallback: fetch via HTTP
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(response.data).toString('base64');
    const contentType = response.headers['content-type'] || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('Failed to convert image to base64:', imageUrl, error);
    throw error;
  }
}

/**
 * Submit images to Grok Imagine API for video generation
 */
export async function generateVideo(request: GrokVideoRequest): Promise<GrokVideoResponse> {
  const apiKey = getGrokApiKey();

  try {
    // Convert image URLs to base64 for API submission
    console.log(`Converting ${request.images.length} images to base64...`);
    const base64Images = await Promise.all(
      request.images.map(url => getImageAsBase64(url))
    );

    const requestBody = {
      model: 'grok-2-image', // or whatever the model name is
      images: base64Images,
      parameters: {
        duration: request.duration || 15,
        style: request.style || 'morph',
        fps: request.fps || 24,
        transition: 'smooth', // smooth morphing between images
      },
    };

    // Log request details (excluding base64 data which is huge)
    console.log('========== GROK API REQUEST ==========');
    console.log('URL:', GROK_API_URL);
    console.log('Method: POST');
    console.log('Headers:', JSON.stringify({
      'Authorization': 'Bearer [REDACTED]',
      'Content-Type': 'application/json',
    }, null, 2));
    console.log('Body:', JSON.stringify({
      ...requestBody,
      images: requestBody.images.map((img, i) => `[BASE64_IMAGE_${i + 1}: ${img.length} chars]`),
    }, null, 2));
    console.log('=======================================');
    
    const response = await axios.post(
      GROK_API_URL,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 300000, // 5 minute timeout for video generation
      }
    );

    // Log response details
    console.log('========== GROK API RESPONSE ==========');
    console.log('Status:', response.status, response.statusText);
    console.log('Headers:', JSON.stringify(response.headers, null, 2));
    console.log('Body:', JSON.stringify(response.data, null, 2));
    console.log('========================================');

    return response.data;
  } catch (error: any) {
    // Log error details
    console.log('========== GROK API ERROR ==========');
    console.log('Status:', error.response?.status);
    console.log('Status Text:', error.response?.statusText);
    console.log('Response Headers:', JSON.stringify(error.response?.headers, null, 2));
    console.log('Response Body:', JSON.stringify(error.response?.data, null, 2));
    console.log('Error Message:', error.message);
    console.log('=====================================');
    
    // Check for specific error types
    if (error.response?.status === 401) {
      throw new Error('Invalid Grok API key');
    } else if (error.response?.status === 429) {
      throw new Error('Grok API rate limit exceeded');
    } else if (error.response?.status === 400) {
      throw new Error(`Grok API bad request: ${JSON.stringify(error.response?.data)}`);
    }
    
    throw new Error(`Grok API error: ${error.message}`);
  }
}

/**
 * Check the status of a video generation job
 */
export async function checkVideoStatus(generationId: string): Promise<GrokVideoResponse> {
  const apiKey = getGrokApiKey();

  const url = `${GROK_API_URL}/${generationId}`;
  
  console.log('========== GROK STATUS CHECK ==========');
  console.log('URL:', url);
  console.log('Method: GET');
  console.log('========================================');

  try {
    const response = await axios.get(
      url,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    console.log('========== GROK STATUS RESPONSE ==========');
    console.log('Status:', response.status, response.statusText);
    console.log('Body:', JSON.stringify(response.data, null, 2));
    console.log('==========================================');

    return response.data;
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

  // Upload video to S3
  const videoKey = `videos/${userId}/${videoId}.mp4`;
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: videoKey,
    Body: videoBuffer,
    ContentType: 'video/mp4',
  }));

  console.log(`Video uploaded to S3: ${videoKey}`);

  // For thumbnail, we'll generate a placeholder or extract first frame later
  // For now, use a placeholder
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
