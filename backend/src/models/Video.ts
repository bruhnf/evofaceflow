import { Schema, model, Document } from 'mongoose';

export interface IVideo extends Document {
  videoId: string;
  userId: string;
  imageUrls: string[];           // ordered S3 urls from slots
  status: 'processing' | 'completed' | 'failed';
  finalVideoUrl?: string;
  thumbnailUrl?: string;
  durationSeconds: number;       // 15, 30 or 45
  isPublic: boolean;             // Whether video shows on public feed
  grokGenerationId?: string;     // Grok API generation ID for polling
  errorMessage?: string;         // Error details if failed
  createdAt: Date;
  completedAt?: Date;
}

const VideoSchema = new Schema<IVideo>({
  videoId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  imageUrls: [{ type: String, required: true }],
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing', index: true },
  finalVideoUrl: String,
  thumbnailUrl: String,
  durationSeconds: { type: Number, required: true },
  isPublic: { type: Boolean, default: true },
  grokGenerationId: String,
  errorMessage: String,
  createdAt: { type: Date, default: Date.now, index: true },
  completedAt: Date,
});

export const Video = model<IVideo>('Video', VideoSchema);