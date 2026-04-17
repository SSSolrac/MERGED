import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '@/lib/errors';
import { activityLogService } from '@/services/activityLogService';
import type { ActivityLogEntry, ActivityLogFilters, ActivityLogStats } from '@/types/activityLog';

const initialFilters: ActivityLogFilters = {
  query: '',
  role: 'all',
  type: 'all',
  date: '',
  page: 1,
  pageSize: 10,
};

const initialStats: ActivityLogStats = {
  totalToday: 0,
  loginEvents: 0,
  orderEvents: 0,
  loyaltyEvents: 0,
  importEvents: 0,
  updateEvents: 0,
};

export const useActivityLog = () => {
  const [filters, setFilters] = useState<ActivityLogFilters>(initialFilters);
  const [rows, setRows] = useState<ActivityLogEntry[]>([]);
  const [stats, setStats] = useState<ActivityLogStats>(initialStats);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const result = await activityLogService.getActivityLog(filters);
        setRows(result.rows);
        setTotal(result.total);
        setStats(result.stats);
      } catch (loadError) {
        setRows([]);
        setTotal(0);
        setStats(initialStats);
        setError(getErrorMessage(loadError, 'Unable to load activity log.'));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [filters]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / filters.pageSize)), [total, filters.pageSize]);

  return { filters, setFilters, rows, stats, totalPages, loading, error };
};
