import { Schema, model, Document } from 'mongoose';

export interface IVideo extends Document {
  videoId: string;
  userId: string;
  imageUrls: string[];           // ordered S3 urls from slots
  status: 'processing' | 'completed' | 'failed';
  finalVideoUrl?: string;
  thumbnailUrl?: string;
  durationSeconds: number;       // 15, 30 or 60
  createdAt: Date;
}

const VideoSchema = new Schema<IVideo>({
  videoId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  imageUrls: [{ type: String, required: true }],
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  finalVideoUrl: String,
  thumbnailUrl: String,
  durationSeconds: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Video = model<IVideo>('Video', VideoSchema);