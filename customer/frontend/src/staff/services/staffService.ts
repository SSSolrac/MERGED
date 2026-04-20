import { AppError, normalizeError } from '@/lib/errors';
import { asRecord, mapUserRole } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';

export type StaffAssignmentStatus = 'granted' | 'already_staff';

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
  assignmentStatus?: StaffAssignmentStatus;
}

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const asBoolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : value == null ? fallback : Boolean(value));
const readJobTitle = (value: unknown) => asString((asRecord(value) ?? {}).jobTitle ?? (asRecord(value) ?? {}).title, '').trim();
const readAvatarUrl = (value: unknown) => {
  const preferences = asRecord(value) ?? {};
  const avatar = asString(preferences.avatarUrl ?? preferences.profilePhotoUrl, '').trim();
  return avatar || null;
};

const mapStaffMemberRow = (row: unknown, assignmentStatus?: StaffAssignmentStatus): StaffMember => {
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
    ...(assignmentStatus ? { assignmentStatus } : {}),
  };
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const normalizeStaffPermissionError = (error: unknown, fallbackMessage: string) => {
  const normalized = normalizeError(error, { fallbackMessage });
  if (normalized.category !== 'permission') return normalized;

  return new AppError({
    category: 'permission',
    message: 'Only owners can grant or revoke staff access.',
    code: normalized.code,
    status: normalized.status,
    details: normalized.details,
    hint: normalized.hint,
    cause: error,
  });
};

const requireCurrentActorId = async () => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error, { fallbackMessage: 'Unable to verify your account permissions.' });
  if (!data.user?.id) throw new AppError({ category: 'auth', message: 'You must be signed in to manage staff access.' });
  return {
    supabase,
    actorId: data.user.id,
  };
};

type StaffAccessRecord = Pick<StaffMember, 'id' | 'name' | 'email'>;

export const staffService = {
  async listStaffMembers(): Promise<StaffMember[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,email,role,is_active,preferences,created_at,updated_at')
      .eq('role', 'staff')
      .order('created_at', { ascending: false });

    if (error) throw normalizeStaffPermissionError(error, 'Unable to load staff members.');
    return (Array.isArray(data) ? data : []).map((row) => mapStaffMemberRow(row));
  },

  async addStaffMemberByEmail(params: { email: string; name?: string; jobTitle?: string }): Promise<StaffMember> {
    const email = normalizeEmail(params.email);
    const name = params.name?.trim() ?? '';
    const jobTitle = params.jobTitle?.trim() ?? '';

    if (!email) throw new AppError({ category: 'auth', message: 'Staff email is required.' });
    if (!email.includes('@')) throw new AppError({ category: 'auth', message: 'Enter a valid staff email.' });

    const { supabase, actorId } = await requireCurrentActorId();
    const profileResult = await supabase
      .from('profiles')
      .select('id,name,email,role,is_active,preferences,created_at,updated_at')
      .ilike('email', email)
      .maybeSingle();

    if (profileResult.error) {
      throw normalizeStaffPermissionError(profileResult.error, 'Unable to verify the account email.');
    }

    if (!profileResult.data) {
      throw new AppError({
        category: 'schema',
        message: 'No account found for this email. Have them sign up first, then add them as staff.',
      });
    }

    if (asString(profileResult.data.id, '').trim() === actorId) {
      throw new AppError({
        category: 'permission',
        message: 'You already own this workspace. Use the profile screen for your own account changes.',
      });
    }

    const existingRole = mapUserRole(profileResult.data.role);
    if (existingRole === 'owner') {
      throw new AppError({ category: 'permission', message: 'This account already has owner access.' });
    }

    const assignmentStatus: StaffAssignmentStatus = existingRole === 'staff' ? 'already_staff' : 'granted';
    const nextPreferences = { ...(asRecord(profileResult.data.preferences) ?? {}) };
    if (jobTitle) nextPreferences.jobTitle = jobTitle;

    const needsUpdate = assignmentStatus === 'granted' || !profileResult.data.is_active || Boolean(name || jobTitle);
    if (!needsUpdate) {
      return mapStaffMemberRow(profileResult.data, assignmentStatus);
    }

    const updatePayload: {
      role: 'staff';
      is_active: boolean;
      updated_at: string;
      name?: string;
      preferences?: Record<string, unknown>;
    } = {
      role: 'staff',
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    if (name) updatePayload.name = name;
    if (jobTitle) updatePayload.preferences = nextPreferences;

    const { data, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', profileResult.data.id)
      .select('id,name,email,role,is_active,preferences,created_at,updated_at')
      .single();

    if (error) throw normalizeStaffPermissionError(error, 'Unable to grant staff access.');
    return mapStaffMemberRow(data, assignmentStatus);
  },

  async revokeStaffAccess(staffId: string): Promise<StaffAccessRecord> {
    const id = asString(staffId, '').trim();
    if (!id) throw new AppError({ category: 'auth', message: 'Staff account could not be identified.' });

    const { supabase, actorId } = await requireCurrentActorId();
    const profileResult = await supabase
      .from('profiles')
      .select('id,name,email,role')
      .eq('id', id)
      .maybeSingle();

    if (profileResult.error) {
      throw normalizeStaffPermissionError(profileResult.error, 'Unable to verify this staff account.');
    }

    if (!profileResult.data) {
      throw new AppError({ category: 'schema', message: 'That staff account could not be found.' });
    }

    if (asString(profileResult.data.id, '').trim() === actorId) {
      throw new AppError({ category: 'permission', message: 'You cannot revoke your own access from this screen.' });
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

    if (error) throw normalizeStaffPermissionError(error, 'Unable to revoke staff access.');

    return {
      id: asString(data?.id, id),
      name: asString(data?.name, ''),
      email: asString(data?.email, ''),
    };
  },
};
