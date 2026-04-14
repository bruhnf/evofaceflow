import { Schema, model, Document } from 'mongoose';

export interface IUserLocation extends Document {
  userId: string;
  ip: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  timestamp: Date;
}

const UserLocationSchema = new Schema<IUserLocation>({
  userId: { type: String, required: true, index: true },
  ip: { type: String, required: true },
  country: { type: String },
  region: { type: String },
  city: { type: String },
  latitude: { type: Number },
  longitude: { type: Number },
  timezone: { type: String },
  timestamp: { type: Date, default: Date.now },
});

// Compound index for efficient queries
UserLocationSchema.index({ userId: 1, timestamp: -1 });

export const UserLocation = model<IUserLocation>('UserLocation', UserLocationSchema);

// Helper function to add location and maintain max 20 records per user
export async function addUserLocation(
  userId: string,
  ip: string,
  geoData: {
    country?: string;
    region?: string;
    city?: string;
    ll?: [number, number];
    timezone?: string;
  } | null
): Promise<void> {
  // Add new location
  await UserLocation.create({
    userId,
    ip,
    country: geoData?.country,
    region: geoData?.region,
    city: geoData?.city,
    latitude: geoData?.ll?.[0],
    longitude: geoData?.ll?.[1],
    timezone: geoData?.timezone,
  });

  // Count total locations for this user
  const count = await UserLocation.countDocuments({ userId });

  // If more than 20, delete the oldest ones
  if (count > 20) {
    const locationsToDelete = await UserLocation.find({ userId })
      .sort({ timestamp: 1 }) // oldest first
      .limit(count - 20)
      .select('_id');

    const idsToDelete = locationsToDelete.map(loc => loc._id);
    await UserLocation.deleteMany({ _id: { $in: idsToDelete } });
  }
}
