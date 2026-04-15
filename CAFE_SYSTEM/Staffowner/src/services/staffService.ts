import { AppError, normalizeError } from '@/lib/errors';
import { asRecord, mapUserRole } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'staff';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const asBoolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : value == null ? fallback : Boolean(value));

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
    isActive: asBoolean(r.is_active, true),
    createdAt: asString(r.created_at, now),
    updatedAt: asString(r.updated_at, asString(r.created_at, now)),
  };
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const staffService = {
  async listStaffMembers(): Promise<StaffMember[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id,name,email,role,is_active,created_at,updated_at')
      .eq('role', 'staff')
      .order('created_at', { ascending: false });

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load staff members.' });
    return (Array.isArray(data) ? data : []).map(mapStaffMemberRow);
  },

  async addStaffMemberByEmail(params: { email: string; name?: string }): Promise<StaffMember> {
    const email = normalizeEmail(params.email);
    const name = params.name?.trim() ?? '';

    if (!email) throw new AppError({ category: 'auth', message: 'Staff email is required.' });
    if (!email.includes('@')) throw new AppError({ category: 'auth', message: 'Enter a valid staff email.' });

    const supabase = requireSupabaseClient();
    const profileResult = await supabase
      .from('profiles')
      .select('id,name,email,role,is_active,created_at,updated_at')
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

    const updatePayload: { role: 'staff'; is_active: boolean; name?: string } = {
      role: 'staff',
      is_active: true,
    };
    if (name) updatePayload.name = name;

    const { data, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', profileResult.data.id)
      .select('id,name,email,role,is_active,created_at,updated_at')
      .single();

    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to grant staff access.' });
    return mapStaffMemberRow(data);
  },
};
