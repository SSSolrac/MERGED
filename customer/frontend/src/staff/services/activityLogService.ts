import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';
import type { ActivityLogEntry, ActivityLogFilters, ActivityLogStats, ActivityLogType } from '@/types/activityLog';

type ProfileRow = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  role?: unknown;
};

type LoginRow = {
  id?: unknown;
  profile_id?: unknown;
  email?: unknown;
  role?: unknown;
  success?: unknown;
  logged_in_at?: unknown;
  logged_out_at?: unknown;
};

type OrderStatusHistoryRow = {
  id?: unknown;
  order_id?: unknown;
  status?: unknown;
  note?: unknown;
  changed_by?: unknown;
  changed_at?: unknown;
};

type OrderRow = {
  id?: unknown;
  code?: unknown;
};

type ImportBatchRow = {
  id?: unknown;
  code?: unknown;
  created_by?: unknown;
  file_name?: unknown;
  total_rows?: unknown;
  valid_rows?: unknown;
  invalid_rows?: unknown;
  created_at?: unknown;
};

type ActivityRow = {
  id?: unknown;
  actor_id?: unknown;
  actor_role?: unknown;
  action?: unknown;
  entity_type?: unknown;
  entity_id?: unknown;
  entity_label?: unknown;
  details?: unknown;
  metadata?: unknown;
  occurred_at?: unknown;
};

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const asBoolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : value == null ? fallback : Boolean(value));
const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeStatus = (value: unknown) => asString(value, '').trim().toLowerCase().replace(/\s+/g, '_');

const isMissingRelationError = (error: unknown) => {
  const message = asString((error as { message?: unknown })?.message, '').toLowerCase();
  const code = asString((error as { code?: unknown })?.code, '').toLowerCase();
  return code === '42p01' || message.includes('does not exist');
};

const activityTypeFromEntity = (entityType: unknown, action: unknown): ActivityLogType => {
  const normalizedEntity = normalizeStatus(entityType);
  const normalizedAction = normalizeStatus(action);
  const combined = `${normalizedEntity} ${normalizedAction}`;

  if (combined.includes('inventory')) return 'inventory';
  if (combined.includes('menu')) return 'menu';
  if (combined.includes('setting') || combined.includes('business_settings')) return 'settings';
  if (combined.includes('loyalty') || combined.includes('stamp')) return 'loyalty';
  if (combined.includes('login')) return 'login';
  if (combined.includes('order')) return 'order';
  if (combined.includes('import')) return 'import';
  return 'system';
};

const toDateBounds = (dateText: string) => {
  const trimmed = dateText.trim();
  if (!trimmed) return null;
  const start = new Date(`${trimmed}T00:00:00.000`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

const actionForOrderStatus = (status: unknown) => {
  const normalized = normalizeStatus(status);
  if (normalized === 'preparing') return 'Accepted order';
  if (normalized === 'ready') return 'Marked order as ready';
  if (normalized === 'out_for_delivery') return 'Marked order out for delivery';
  if (normalized === 'completed' || normalized === 'delivered') return 'Completed order';
  if (normalized === 'cancelled') return 'Cancelled order';
  if (normalized === 'refunded') return 'Refunded order';
  if (normalized === 'pending') return 'Created/updated pending order';
  return `Updated order status to ${normalized || 'unknown'}`;
};

const includesQuery = (entry: ActivityLogEntry, query: string) => {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystack = `${entry.actorName} ${entry.actorRole} ${entry.action} ${entry.entityLabel} ${entry.details}`.toLowerCase();
  return haystack.includes(needle);
};

const startOfTodayMs = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

export const activityLogService = {
  async getActivityLog(filters: ActivityLogFilters): Promise<{ rows: ActivityLogEntry[]; total: number; stats: ActivityLogStats }> {
    const supabase = requireSupabaseClient();
    const page = Math.max(1, Number(filters.page || 1));
    const pageSize = Math.max(1, Math.min(100, Number(filters.pageSize || 10)));
    const dateBounds = toDateBounds(filters.date);

    try {
      const [loginResult, statusResult, importResult, activityResult] = await Promise.all([
        (() => {
          let query = supabase
            .from('login_history')
            .select('id,profile_id,email,role,success,logged_in_at,logged_out_at')
            .order('logged_in_at', { ascending: false })
            .limit(1000);
          if (dateBounds) query = query.gte('logged_in_at', dateBounds.start).lt('logged_in_at', dateBounds.end);
          return query;
        })(),
        (() => {
          let query = supabase
            .from('order_status_history')
            .select('id,order_id,status,note,changed_by,changed_at')
            .order('changed_at', { ascending: false })
            .limit(2000);
          if (dateBounds) query = query.gte('changed_at', dateBounds.start).lt('changed_at', dateBounds.end);
          return query;
        })(),
        (() => {
          let query = supabase
            .from('sales_import_batches')
            .select('id,code,created_by,file_name,total_rows,valid_rows,invalid_rows,created_at')
            .order('created_at', { ascending: false })
            .limit(1000);
          if (dateBounds) query = query.gte('created_at', dateBounds.start).lt('created_at', dateBounds.end);
          return query;
        })(),
        (() => {
          let query = supabase
            .from('activity_logs')
            .select('id,actor_id,actor_role,action,entity_type,entity_id,entity_label,details,metadata,occurred_at')
            .order('occurred_at', { ascending: false })
            .limit(2000);
          if (dateBounds) query = query.gte('occurred_at', dateBounds.start).lt('occurred_at', dateBounds.end);
          return query;
        })(),
      ]);

      if (loginResult.error) throw loginResult.error;
      if (statusResult.error) throw statusResult.error;
      if (importResult.error) throw importResult.error;
      if (activityResult.error && !isMissingRelationError(activityResult.error)) throw activityResult.error;

      const loginRows = (Array.isArray(loginResult.data) ? loginResult.data : []) as LoginRow[];
      const statusRows = (Array.isArray(statusResult.data) ? statusResult.data : []) as OrderStatusHistoryRow[];
      const importRows = (Array.isArray(importResult.data) ? importResult.data : []) as ImportBatchRow[];
      const activityRows =
        !activityResult.error && Array.isArray(activityResult.data)
          ? (activityResult.data as ActivityRow[])
          : [];

      const profileIds = new Set<string>();
      loginRows.forEach((row) => {
        const profileId = asString(row.profile_id, '').trim();
        if (profileId) profileIds.add(profileId);
      });
      statusRows.forEach((row) => {
        const changedBy = asString(row.changed_by, '').trim();
        if (changedBy) profileIds.add(changedBy);
      });
      importRows.forEach((row) => {
        const createdBy = asString(row.created_by, '').trim();
        if (createdBy) profileIds.add(createdBy);
      });
      activityRows.forEach((row) => {
        const actorId = asString(row.actor_id, '').trim();
        if (actorId) profileIds.add(actorId);
      });

      const profileMap = new Map<string, { name: string; role: string }>();
      const profileIdList = Array.from(profileIds);
      if (profileIdList.length) {
        const profileResult = await supabase.from('profiles').select('id,name,email,role').in('id', profileIdList);
        if (!profileResult.error) {
          (Array.isArray(profileResult.data) ? profileResult.data : []).forEach((row) => {
            const p = row as ProfileRow;
            const id = asString(p.id, '').trim();
            if (!id) return;
            const name = asString(p.name, '').trim() || asString(p.email, '').trim() || id;
            const role = asString(p.role, 'unknown').trim() || 'unknown';
            profileMap.set(id, { name, role });
          });
        }
      }

      const orderIdSet = new Set<string>();
      statusRows.forEach((row) => {
        const orderId = asString(row.order_id, '').trim();
        if (orderId) orderIdSet.add(orderId);
      });

      const orderMap = new Map<string, string>();
      const orderIds = Array.from(orderIdSet);
      if (orderIds.length) {
        const orderResult = await supabase.from('orders').select('id,code').in('id', orderIds);
        if (!orderResult.error) {
          (Array.isArray(orderResult.data) ? orderResult.data : []).forEach((row) => {
            const order = row as OrderRow;
            const id = asString(order.id, '').trim();
            if (!id) return;
            orderMap.set(id, asString(order.code, '').trim() || id);
          });
        }
      }

      const entries: ActivityLogEntry[] = [];

      loginRows.forEach((row) => {
        const id = asString(row.id, '').trim();
        const profileId = asString(row.profile_id, '').trim() || null;
        const profile = profileId ? profileMap.get(profileId) : null;
        const actorName = profile?.name || asString(row.email, '').trim() || 'Unknown';
        const actorRole = profile?.role || asString(row.role, 'unknown').trim() || 'unknown';
        const loginAt = asString(row.logged_in_at, '').trim();
        const logoutAt = asString(row.logged_out_at, '').trim();
        const success = asBoolean(row.success, true);

        if (loginAt) {
          entries.push({
            id: `login-${id || loginAt}`,
            type: 'login',
            occurredAt: loginAt,
            actorId: profileId,
            actorName,
            actorRole,
            action: success ? 'Logged in' : 'Failed login attempt',
            entityLabel: 'Staffowner account',
            details: success ? 'Session started.' : 'Credentials were rejected.',
          });
        }

        if (logoutAt) {
          entries.push({
            id: `logout-${id || logoutAt}`,
            type: 'login',
            occurredAt: logoutAt,
            actorId: profileId,
            actorName,
            actorRole,
            action: 'Logged out',
            entityLabel: 'Staffowner account',
            details: 'Session ended.',
          });
        }
      });

      statusRows.forEach((row) => {
        const id = asString(row.id, '').trim();
        const actorId = asString(row.changed_by, '').trim() || null;
        const profile = actorId ? profileMap.get(actorId) : null;
        const actorName = profile?.name || 'System';
        const actorRole = profile?.role || 'system';
        const occurredAt = asString(row.changed_at, '').trim();
        if (!occurredAt) return;

        const orderId = asString(row.order_id, '').trim();
        const orderCode = orderMap.get(orderId) || orderId || 'Unknown order';
        const note = asString(row.note, '').trim();
        const status = normalizeStatus(row.status);

        entries.push({
          id: `order-${id || `${orderId}-${occurredAt}`}`,
          type: 'order',
          occurredAt,
          actorId,
          actorName,
          actorRole,
          action: actionForOrderStatus(status),
          entityLabel: orderCode,
          details: note || (status ? `Status set to ${status}.` : 'Order status changed.'),
        });
      });

      importRows.forEach((row) => {
        const id = asString(row.id, '').trim();
        const actorId = asString(row.created_by, '').trim() || null;
        const profile = actorId ? profileMap.get(actorId) : null;
        const actorName = profile?.name || 'Unknown';
        const actorRole = profile?.role || 'unknown';
        const occurredAt = asString(row.created_at, '').trim();
        if (!occurredAt) return;

        const code = asString(row.code, '').trim() || id || 'Import batch';
        const fileName = asString(row.file_name, '').trim();
        const totalRows = asNumber(row.total_rows, 0);
        const validRows = asNumber(row.valid_rows, 0);
        const invalidRows = asNumber(row.invalid_rows, 0);
        const details = `${fileName || 'CSV file'} - total ${totalRows}, valid ${validRows}, invalid ${invalidRows}`;

        entries.push({
          id: `import-${id || occurredAt}`,
          type: 'import',
          occurredAt,
          actorId,
          actorName,
          actorRole,
          action: 'Imported sales data',
          entityLabel: code,
          details,
        });
      });

      activityRows.forEach((row) => {
        const occurredAt = asString(row.occurred_at, '').trim();
        if (!occurredAt) return;

        const id = asString(row.id, '').trim() || occurredAt;
        const actorId = asString(row.actor_id, '').trim() || null;
        const profile = actorId ? profileMap.get(actorId) : null;
        const actorName = profile?.name || 'Unknown';
        const actorRole = profile?.role || asString(row.actor_role, 'unknown').trim() || 'unknown';
        const action = asString(row.action, '').trim() || 'Updated record';
        const entityType = asString(row.entity_type, '').trim();
        const entityLabel = asString(row.entity_label, '').trim() || asString(row.entity_id, '').trim() || entityType || 'Record';
        const details = asString(row.details, '').trim() || `Activity recorded on ${entityType || 'system'}.`;
        const type = activityTypeFromEntity(entityType, action);

        entries.push({
          id: `activity-${id}`,
          type,
          occurredAt,
          actorId,
          actorName,
          actorRole,
          action,
          entityLabel,
          details,
        });
      });

      const sorted = [...entries].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
      const query = filters.query.trim();
      const typeFilter = filters.type;
      const roleFilter = filters.role.trim().toLowerCase();

      const filtered = sorted.filter((entry) => {
        if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
        if (roleFilter && roleFilter !== 'all' && entry.actorRole.toLowerCase() !== roleFilter) return false;
        if (!includesQuery(entry, query)) return false;
        return true;
      });

      const total = filtered.length;
      const from = (page - 1) * pageSize;
      const to = from + pageSize;
      const paginated = filtered.slice(from, to);

      const todayStart = startOfTodayMs();
      const stats: ActivityLogStats = {
        totalToday: entries.filter((entry) => new Date(entry.occurredAt).getTime() >= todayStart).length,
        loginEvents: entries.filter((entry) => entry.type === 'login').length,
        orderEvents: entries.filter((entry) => entry.type === 'order').length,
        loyaltyEvents: entries.filter((entry) => entry.type === 'loyalty').length,
        importEvents: entries.filter((entry) => entry.type === 'import').length,
        updateEvents: entries.filter((entry) => entry.type === 'inventory' || entry.type === 'menu' || entry.type === 'settings').length,
      };

      return { rows: paginated, total, stats };
    } catch (error) {
      throw normalizeError(error, { fallbackMessage: 'Unable to load activity log.' });
    }
  },
};
