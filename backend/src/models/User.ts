import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  userId: string;
  username: string;
  email: string;
  password: string;
  verified: boolean;
  subscriptionLevel: 'beginner' | 'intermediate' | 'advanced';
  bio?: string;
  avatarUrl?: string;
  followingCount: number;
  followersCount: number;
  likesCount: number;
  address?: string;
  city?: string;
  state?: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  verified: { type: Boolean, default: false },
  subscriptionLevel: { 
    type: String, 
    enum: ['beginner', 'intermediate', 'advanced'], 
    default: 'beginner' 
  },
  bio: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
  followingCount: { type: Number, default: 0 },
  followersCount: { type: Number, default: 0 },
  likesCount: { type: Number, default: 0 },
  address: String,
  city: String,
  state: String,
  createdAt: { type: Date, default: Date.now },
});

export const User = model<IUser>('User', UserSchema);