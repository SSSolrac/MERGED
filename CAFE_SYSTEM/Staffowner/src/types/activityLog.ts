export type ActivityLogType = 'login' | 'order' | 'import' | 'inventory' | 'menu' | 'settings' | 'system';

export interface ActivityLogEntry {
  id: string;
  type: ActivityLogType;
  occurredAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityLabel: string;
  details: string;
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
  importEvents: number;
  updateEvents: number;
}
