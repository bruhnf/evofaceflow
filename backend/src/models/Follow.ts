import { Schema, model, Document } from 'mongoose';

export interface IFollow extends Document {
  followerId: string;    // The user who is following
  followingId: string;   // The user being followed
  createdAt: Date;
}

const FollowSchema = new Schema<IFollow>({
  followerId: { type: String, required: true, index: true },
  followingId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

// Compound index to ensure unique follow relationships
FollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

export const Follow = model<IFollow>('Follow', FollowSchema);
