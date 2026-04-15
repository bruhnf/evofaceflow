import { Schema, model, Document } from 'mongoose';

export interface IAppSettings extends Document {
  key: string;
  value: any;
  description?: string;
  updatedAt: Date;
}

const AppSettingsSchema = new Schema<IAppSettings>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true },
  description: { type: String },
  updatedAt: { type: Date, default: Date.now },
});

export const AppSettings = model<IAppSettings>('AppSettings', AppSettingsSchema);

// Helper to get a setting with default
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const setting = await AppSettings.findOne({ key });
  return setting ? setting.value : defaultValue;
}

// Helper to set a setting
export async function setSetting<T>(key: string, value: T, description?: string): Promise<void> {
  await AppSettings.findOneAndUpdate(
    { key },
    { value, description, updatedAt: new Date() },
    { upsert: true }
  );
}

// Initialize default settings
export async function initializeSettings(): Promise<void> {
  const defaults = [
    { key: 'fillerImagePercent', value: 30, description: 'Percentage of filler images to mix into feed (0-100)' },
    { key: 'fillerS3Prefix', value: 'images/filler/', description: 'S3 prefix for filler images' },
  ];

  for (const setting of defaults) {
    const exists = await AppSettings.findOne({ key: setting.key });
    if (!exists) {
      await AppSettings.create(setting);
    }
  }
}
