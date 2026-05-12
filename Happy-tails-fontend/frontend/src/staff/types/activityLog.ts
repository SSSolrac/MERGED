export type ActivityLogType = 'login' | 'order' | 'import' | 'inventory' | 'menu' | 'settings' | 'loyalty' | 'system';

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  occurredAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType?: string;
  entityId?: string | null;
  entityLabel: string;
  details: string;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityLogFilters {
  query: string;
  role: string;
  type: 'all' | ActivityLogType;
  date: string;
  page: number;
  pageSize: number;
}

export interface ActivityLogStats {
  totalToday: number;
  loginEvents: number;
  orderEvents: number;
  loyaltyEvents: number;
  importEvents: number;
  updateEvents: number;
}
