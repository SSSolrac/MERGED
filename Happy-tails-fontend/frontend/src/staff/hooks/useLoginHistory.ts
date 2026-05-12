import { useEffect, useMemo, useState } from 'react';
import { getErrorMessage } from '@/lib/errors';
import { loginHistoryService } from '@/services/loginHistoryService';
import type { LoginHistoryFilters, LoginHistoryEntry } from '@/types/loginHistory';

const initialFilters: LoginHistoryFilters = {
  query: '',
  role: 'all',
  status: 'all',
  date: '',
  page: 1,
  pageSize: 10,
};

export const useLoginHistory = () => {
  const [filters, setFilters] = useState<LoginHistoryFilters>(initialFilters);
  const [rows, setRows] = useState<LoginHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ totalToday: 0, failed: 0, staff: 0, customer: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const result = await loginHistoryService.getLoginHistory(filters);
        setRows(result.rows);
        setTotal(result.total);
      } catch (loadError) {
        setRows([]);
        setTotal(0);
        setError(getErrorMessage(loadError, 'Unable to load login history.'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [filters]);

  useEffect(() => {
    loginHistoryService.getLoginStats().then(setStats);
  }, [rows.length]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / filters.pageSize)), [total, filters.pageSize]);

  return { filters, setFilters, rows, total, totalPages, stats, loading, error };
};
