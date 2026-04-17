import { Schema, model, Document } from 'mongoose';

export interface IImage extends Document {
  imageId: string;
  userId: string;
  imageUrl: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  isPublic: boolean;
  createdAt: Date;
}

const ImageSchema = new Schema<IImage>({
  imageId: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  imageUrl: { type: String, required: true },
  thumbnailUrl: { type: String },
  width: { type: Number, default: 720 },
  height: { type: Number, default: 720 },
  isPublic: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Index for random feed queries
ImageSchema.index({ isPublic: 1, createdAt: -1 });

export const Image = model<IImage>('Image', ImageSchema);
