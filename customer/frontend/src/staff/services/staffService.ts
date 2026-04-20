import { AppError, normalizeError } from '@/lib/errors';
import { asRecord, mapUserRole } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  jobTitle: string;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const asBoolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : value == null ? fallback : Boolean(value));
const readJobTitle = (value: unknown) => asString((asRecord(value) ?? {}).jobTitle ?? (asRecord(value) ?? {}).title, '').trim();
const readAvatarUrl = (value: unknown) => {
  const preferences = asRecord(value) ?? {};
  const avatar = asString(preferences.avatarUrl ?? preferences.profilePhotoUrl, '').trim();
  return avatar || null;
};

const mapStaffMemberRow = (row: unknown): StaffMember => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  const parsedRole = mapUserRole(r.role);
  const role: StaffMember['role'] = parsedRole === 'owner' || parsedRole === 'staff' ? parsedRole : 'staff';

  return {
    id: asString(r.id, ''),
    name: asString(r.name, ''),
    email: asString(r.email, ''),
    role,
    jobTitle: readJobTitle(r.preferences),
    avatarUrl: readAvatarUrl(r.preferences),
    isActive: asBoolean(r.is_active, true),
    createdAt: asString(r.created_at, now),
    updatedAt: asString(r.updated_at, asString(r.created_at, now)),
  };
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

type StaffAccessRecord = Pick<StaffMember, 'id' | 'name' | 'email'>;

export const staffService = {
  async listStaffMembers(): Promise<StaffMember[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,email,role,is_active,preferences,created_at,updated_at')
      .eq('role', 'staff')
      .order('created_at', { ascending: false });

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load staff members.' });
    return (Array.isArray(data) ? data : []).map(mapStaffMemberRow);
  },

  async addStaffMemberByEmail(params: { email: string; name?: string; jobTitle?: string }): Promise<StaffMember> {
    const email = normalizeEmail(params.email);
    const name = params.name?.trim() ?? '';
    const jobTitle = params.jobTitle?.trim() ?? '';

    if (!email) throw new AppError({ category: 'auth', message: 'Staff email is required.' });
    if (!email.includes('@')) throw new AppError({ category: 'auth', message: 'Enter a valid staff email.' });

    const supabase = requireSupabaseClient();
    const profileResult = await supabase
      .from('profiles')
      .select('id,name,email,role,is_active,preferences,created_at,updated_at')
      .ilike('email', email)
      .maybeSingle();

    if (profileResult.error) {
      throw normalizeError(profileResult.error, { fallbackMessage: 'Unable to verify the account email.' });
    }

    if (!profileResult.data) {
      throw new AppError({
        category: 'schema',
        message: 'No account found for this email. Have them sign up first, then add them as staff.',
      });
    }

    const existingRole = mapUserRole(profileResult.data.role);
    if (existingRole === 'owner') {
      throw new AppError({ category: 'permission', message: 'This account already has owner access.' });
    }

    const nextPreferences = { ...(asRecord(profileResult.data.preferences) ?? {}) };
    if (jobTitle) nextPreferences.jobTitle = jobTitle;

    const updatePayload: { role: 'staff'; is_active: boolean; name?: string; preferences?: Record<string, unknown> } = {
      role: 'staff',
      is_active: true,
    };
    if (name) updatePayload.name = name;
    if (jobTitle) updatePayload.preferences = nextPreferences;

    const { data, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', profileResult.data.id)
      .select('id,name,email,role,is_active,preferences,created_at,updated_at')
      .single();

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to grant staff access.' });
    return mapStaffMemberRow(data);
  },

  async revokeStaffAccess(staffId: string): Promise<StaffAccessRecord> {
    const id = asString(staffId, '').trim();
    if (!id) throw new AppError({ category: 'auth', message: 'Staff account could not be identified.' });

    const supabase = requireSupabaseClient();
    const profileResult = await supabase
      .from('profiles')
      .select('id,name,email,role')
      .eq('id', id)
      .maybeSingle();

    if (profileResult.error) {
      throw normalizeError(profileResult.error, { fallbackMessage: 'Unable to verify this staff account.' });
    }

    if (!profileResult.data) {
      throw new AppError({ category: 'schema', message: 'That staff account could not be found.' });
    }

    const existingRole = mapUserRole(profileResult.data.role);
    if (existingRole === 'owner') {
      throw new AppError({ category: 'permission', message: 'Owner access cannot be revoked from this screen.' });
    }
    if (existingRole !== 'staff') {
      throw new AppError({ category: 'permission', message: 'This account no longer has staff access.' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        role: 'customer',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id,name,email')
      .single();

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to revoke staff access.' });

    return {
      id: asString(data?.id, id),
      name: asString(data?.name, ''),
      email: asString(data?.email, ''),
    };
  },
};
