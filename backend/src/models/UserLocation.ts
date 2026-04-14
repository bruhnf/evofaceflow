import { Schema, model, Document } from 'mongoose';

// Distance thresholds for suspicious activity detection
const SUSPICIOUS_DISTANCE_MILES = 500;
const SUSPICIOUS_TIME_HOURS = 2; // Flag if user travels >500 miles in <2 hours

// Haversine formula - calculates distance between two GPS coordinates in miles
function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) *
            Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface IUserLocation extends Document {
  userId: string;
  ip: string;
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  trigger?: string;
  suspiciousLocation: boolean;
  distanceFromLast?: number;
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
  trigger: { type: String, default: 'login' },
  suspiciousLocation: { type: Boolean, default: false },
  distanceFromLast: { type: Number },
  timestamp: { type: Date, default: Date.now },
});

// Compound index for efficient queries
UserLocationSchema.index({ userId: 1, timestamp: -1 });
// Index for finding suspicious logins
UserLocationSchema.index({ suspiciousLocation: 1, timestamp: -1 });

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
  } | null,
  trigger: string = 'login'
): Promise<{ suspicious: boolean; distance?: number }> {
  let suspiciousLocation = false;
  let distanceFromLast: number | undefined;

  // Skip suspicious check for private/local IPs
  const isPrivateIp = !ip || ip === '::1' || ip.startsWith('127.') || 
    ip.startsWith('10.') || ip.startsWith('172.') || ip.startsWith('192.168.');

  // Check against last location for suspicious activity
  if (!isPrivateIp && geoData?.ll) {
    const lastLocation = await UserLocation.findOne({ userId })
      .sort({ timestamp: -1 })
      .limit(1);

    if (lastLocation?.latitude && lastLocation?.longitude) {
      const miles = distanceMiles(
        lastLocation.latitude,
        lastLocation.longitude,
        geoData.ll[0],
        geoData.ll[1]
      );
      distanceFromLast = Math.round(miles);

      // Calculate hours since last login
      const hoursSinceLast = (Date.now() - lastLocation.timestamp.getTime()) / (1000 * 60 * 60);

      // Flag as suspicious if distance is too far in too little time
      // (impossible travel velocity)
      if (miles > SUSPICIOUS_DISTANCE_MILES && hoursSinceLast < SUSPICIOUS_TIME_HOURS) {
        suspiciousLocation = true;
        const velocity = Math.round(miles / hoursSinceLast);
        console.warn(`⚠️ SUSPICIOUS LOGIN for user ${userId}: ${miles.toFixed(0)} miles in ${hoursSinceLast.toFixed(1)} hours (${velocity} mph)`);
      }
    }
  }

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
    trigger,
    suspiciousLocation,
    distanceFromLast,
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

  return { suspicious: suspiciousLocation, distance: distanceFromLast };
}
