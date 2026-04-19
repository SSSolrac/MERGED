import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

const PROFILE_IMAGE_BUCKET = 'menu-images';
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

export type StaffProfile = {
  id: string;
  role: 'owner' | 'staff' | 'customer';
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
};

const asText = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
};

const asRecord = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

const readPreferences = (value: unknown) => asRecord(value);

const mapProfileRow = (row: unknown): StaffProfile => {
  const record = asRecord(row);
  const preferences = readPreferences(record.preferences);

  return {
    id: asText(record.id),
    role: (asText(record.role) || 'staff') as StaffProfile['role'],
    name: asText(record.name),
    email: asText(record.email),
    phone: asText(record.phone),
    jobTitle: asText(preferences.jobTitle ?? preferences.title),
    avatarUrl: asText(preferences.avatarUrl ?? preferences.profilePhotoUrl) || null,
    preferences,
  };
};

const sanitizeImageFileName = (fileName: string) => {
  const trimmed = fileName.trim().toLowerCase();
  if (!trimmed) return 'profile-photo';
  return trimmed
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const getImageExtension = (fileName: string) => {
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1]?.trim() : '';
  if (!ext) return 'jpg';
  return ext.replace(/[^a-z0-9]/gi, '') || 'jpg';
};

const requireCurrentUserId = async () => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load your session.' });
  if (!data.user?.id) throw new Error('You must be signed in to manage your profile.');
  return data.user.id;
};

const getCurrentProfileRow = async () => {
  const supabase = requireSupabaseClient();
  const userId = await requireCurrentUserId();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load your profile.' });
  if (!data) throw new Error('Profile not found.');
  return { userId, data };
};

export const profileService = {
  async getCurrentProfile(): Promise<StaffProfile> {
    const { data } = await getCurrentProfileRow();
    return mapProfileRow(data);
  },

  async saveCurrentProfile(input: { name: string; jobTitle: string; avatarUrl: string | null }): Promise<StaffProfile> {
    const supabase = requireSupabaseClient();
    const { userId } = await getCurrentProfileRow();
    const current = await profileService.getCurrentProfile();
    const nextPreferences = {
      ...current.preferences,
    };

    const jobTitle = asText(input.jobTitle);
    const avatarUrl = asText(input.avatarUrl);

    if (jobTitle) nextPreferences.jobTitle = jobTitle;
    else delete nextPreferences.jobTitle;
    delete nextPreferences.title;

    if (avatarUrl) nextPreferences.avatarUrl = avatarUrl;
    else delete nextPreferences.avatarUrl;
    delete nextPreferences.profilePhotoUrl;

    const payload = {
      name: asText(input.name),
      preferences: nextPreferences,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('profiles').update(payload).eq('id', userId).select('*').single();
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to save your profile.' });
    return mapProfileRow(data);
  },

  async uploadProfileImage(file: File): Promise<string> {
    if (!file) throw new Error('Select an image file before uploading.');
    if (!file.type || !file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
    if (file.size > MAX_PROFILE_IMAGE_BYTES) throw new Error('Image must be 5 MB or smaller.');

    const supabase = requireSupabaseClient();
    const userId = await requireCurrentUserId();
    const safeName = sanitizeImageFileName(file.name || 'profile-photo');
    const extension = getImageExtension(safeName);
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const path = `profiles/${userId}/${Date.now()}-${randomSuffix}.${extension}`;

    const { error } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('bucket') && message.includes('not found')) {
        throw new Error('Storage bucket "menu-images" is missing. Create it in Supabase before uploading profile photos.');
      }
      throw normalizeError(error, { fallbackMessage: 'Unable to upload your profile photo.' });
    }

    const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error('Profile photo uploaded, but public URL could not be generated.');
    return data.publicUrl;
  },
};
