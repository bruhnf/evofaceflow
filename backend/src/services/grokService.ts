import axios from 'axios';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/s3';

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
  images: string[]; // Array of image URLs
  duration?: number; // Target duration in seconds
  prompt?: string;   // Optional custom prompt
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
 * Note: xAI's API generates video from prompt + optional single image
 * For morphing multiple images, we use the first image with a descriptive prompt
 */
export async function generateVideo(request: GrokVideoRequest): Promise<GrokVideoResponse> {
  const apiKey = getGrokApiKey();

  try {
    // Get the first image as the starting point
    console.log(`Converting first image to data URL for xAI API...`);
    const imageDataUrl = await getImageAsDataUrl(request.images[0]);

    // Generate a prompt for life journey video
    const prompt = request.prompt || 
      `Create a smooth, cinematic video showing the progression of time and aging. ` +
      `Start from this person's current appearance and create a beautiful, ` +
      `artistic visualization of their life journey spanning ${request.duration || 15} seconds. ` +
      `Use smooth transitions and subtle morphing effects.`;

    const requestBody = {
      model: 'grok-imagine-video',
      prompt: prompt,
      image: {
        url: imageDataUrl,
      },
    };

    // Log request details
    console.log('========== GROK API REQUEST ==========');
    console.log('URL:', GROK_VIDEO_API_URL);
    console.log('Method: POST');
    console.log('Model:', requestBody.model);
    console.log('Prompt:', prompt);
    console.log('Image: [data URL provided]');
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

  // Upload video to S3
  const videoKey = `videos/${userId}/${videoId}.mp4`;
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: videoKey,
    Body: videoBuffer,
    ContentType: 'video/mp4',
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
