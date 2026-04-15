import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';
import { getBrowserLocalStorage } from '@/auth/sessionPersistence';
import type { LoginHistoryEntry, LoginHistoryFilters } from '@/types/loginHistory';

type DbLoginHistoryRow = {
  id?: unknown;
  profile_id?: unknown;
  email?: unknown;
  role?: unknown;
  success?: unknown;
  device?: unknown;
  ip_address?: unknown;
  user_agent?: unknown;
  logged_in_at?: unknown;
  logged_out_at?: unknown;
};

type DbProfileRow = { id?: unknown; name?: unknown; email?: unknown };

const OPEN_LOGIN_ID_KEY = 'staffowner_open_login_history_id';

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const asBoolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : value == null ? fallback : Boolean(value));

const getUserAgent = () => {
  try {
    return typeof navigator !== 'undefined' ? navigator.userAgent : '';
  } catch {
    return '';
  }
};

const getDevice = () => {
  try {
    // Keep it simple: store platform if available, else fall back to UA string.
    // This is best-effort only; browsers vary in what they expose.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    return asString(nav?.platform, '') || getUserAgent();
  } catch {
    return getUserAgent();
  }
};

const loadOpenLoginId = (): string | null => {
  const storage = getBrowserLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(OPEN_LOGIN_ID_KEY);
    const id = raw ? raw.trim() : '';
    return id || null;
  } catch {
    return null;
  }
};

const persistOpenLoginId = (id: string | null) => {
  const storage = getBrowserLocalStorage();
  if (!storage) return;
  try {
    if (id) storage.setItem(OPEN_LOGIN_ID_KEY, id);
    else storage.removeItem(OPEN_LOGIN_ID_KEY);
  } catch {}
};

const mapRow = (row: DbLoginHistoryRow, profileNameById: Map<string, string>): LoginHistoryEntry => {
  const profileId = row.profile_id == null ? '' : asString(row.profile_id, '');
  const email = row.email == null ? '' : asString(row.email, '');
  const role = row.role == null ? '' : asString(row.role, '');
  const device = row.device == null ? null : asString(row.device, '') || null;
  const ipAddress = row.ip_address == null ? null : asString(row.ip_address, '') || null;
  const loginTime = row.logged_in_at == null ? '' : asString(row.logged_in_at, '');
  const logoutTime = row.logged_out_at == null ? null : asString(row.logged_out_at, '') || null;
  const success = asBoolean(row.success, true);

  return {
    id: asString(row.id, ''),
    userId: profileId,
    userName: profileNameById.get(profileId) || email || profileId || 'Unknown',
    role: role || 'unknown',
    loginTime,
    logoutTime,
    ipAddress,
    device,
    loginStatus: success ? 'success' : 'failed',
  };
};

const toStartOfUtcDay = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

export const loginHistoryService = {
  async recordLogin(params: { userId: string; email: string; role: 'owner' | 'staff'; success?: boolean }) {
    try {
      const supabase = requireSupabaseClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('login_history')
        .insert({
          profile_id: params.userId,
          email: params.email,
          role: params.role,
          success: params.success ?? true,
          device: getDevice() || null,
          user_agent: getUserAgent() || null,
          logged_in_at: now,
        })
        .select('id')
        .single();

      if (error) throw error;
      const id = asString((data as { id?: unknown })?.id, '').trim();
      if (id) persistOpenLoginId(id);
    } catch (error) {
      // Best-effort: login should still succeed even if history logging fails.
      console.warn('Unable to record login history', error);
    }
  },

  async recordLogout(params: { userId: string }) {
    try {
      const supabase = requireSupabaseClient();
      const now = new Date().toISOString();
      const openId = loadOpenLoginId();

      let targetId = openId;
      if (!targetId) {
        const lookup = await supabase
          .from('login_history')
          .select('id')
          .eq('profile_id', params.userId)
          .is('logged_out_at', null)
          .order('logged_in_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lookup.error) {
          targetId = asString((lookup.data as { id?: unknown })?.id, '').trim() || null;
        }
      }

      if (!targetId) return;

      const { error } = await supabase.from('login_history').update({ logged_out_at: now }).eq('id', targetId).eq('profile_id', params.userId);
      if (error) throw error;
      persistOpenLoginId(null);
    } catch (error) {
      console.warn('Unable to record logout time', error);
    }
  },

  async getLoginHistory(filters: LoginHistoryFilters) {
    const supabase = requireSupabaseClient();
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(filters.pageSize || 10)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
      const queryText = asString(filters.query, '').trim();
      const role = asString(filters.role, '').trim();
      const status = asString(filters.status, '').trim();
      const date = asString(filters.date, '').trim();

      let query = supabase
        .from('login_history')
        .select('*', { count: 'exact' })
        .order('logged_in_at', { ascending: false })
        .range(from, to);

      if (queryText) query = query.ilike('email', `%${queryText}%`);
      if (role && role !== 'all') query = query.eq('role', role);
      if (status === 'success') query = query.eq('success', true);
      if (status === 'failed') query = query.eq('success', false);
      if (date) {
        const start = toStartOfUtcDay(date);
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 1);
        query = query.gte('logged_in_at', start.toISOString()).lt('logged_in_at', end.toISOString());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (Array.isArray(data) ? data : []) as DbLoginHistoryRow[];
      const profileIds = rows.map((row) => asString(row.profile_id, '')).filter(Boolean);
      const uniqueProfileIds = Array.from(new Set(profileIds));

      const profileNameById = new Map<string, string>();
      if (uniqueProfileIds.length) {
        const profilesResult = await supabase.from('profiles').select('id,name,email').in('id', uniqueProfileIds);
        if (!profilesResult.error) {
          (Array.isArray(profilesResult.data) ? profilesResult.data : []).forEach((profile) => {
            const p = profile as DbProfileRow;
            const id = asString(p.id, '').trim();
            if (!id) return;
            const name = asString(p.name, '').trim();
            const email = asString(p.email, '').trim();
            profileNameById.set(id, name || email || id);
          });
        }
      }

      return {
        rows: rows.map((row) => mapRow(row, profileNameById)).filter((row) => row.id),
        total: Number.isFinite(Number(count)) ? Number(count) : rows.length,
      };
    } catch (error) {
      throw normalizeError(error, { fallbackMessage: 'Unable to load login history.' });
    }
  },

  async getLoginStats() {
    const supabase = requireSupabaseClient();
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const { data, error } = await supabase.from('login_history').select('success, role, logged_in_at').gte('logged_in_at', start.toISOString());
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as Array<{ success?: unknown; role?: unknown }>;

      const totalToday = rows.length;
      const failed = rows.filter((row) => asBoolean(row.success, true) === false).length;
      const staff = rows.filter((row) => asString(row.role, '') === 'staff').length;
      const customer = rows.filter((row) => asString(row.role, '') === 'customer').length;

      return { totalToday, failed, staff, customer };
    } catch (error) {
      // Best-effort: stats are non-critical.
      console.warn('Unable to load login stats', error);
      return { totalToday: 0, failed: 0, staff: 0, customer: 0 };
    }
  },
};
