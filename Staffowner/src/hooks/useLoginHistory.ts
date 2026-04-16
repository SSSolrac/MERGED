import { useEffect, useMemo, useState } from 'react';
import { loginHistoryService } from '@/services/loginHistoryService';
import type { LoginHistoryFilters, LoginHistoryEntry } from '@/types/loginHistory';

const initialFilters: LoginHistoryFilters = {
  query: '',
  role: 'all',
  status: 'all',
  date: '',
  page: 1,
  pageSize: 5,
};

export const useLoginHistory = () => {
  const [filters, setFilters] = useState<LoginHistoryFilters>(initialFilters);
  const [rows, setRows] = useState<LoginHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ totalToday: 0, failed: 0, staff: 0, customer: 0 });

  useEffect(() => {
    loginHistoryService.getLoginHistory(filters).then((result) => {
      setRows(result.rows);
      setTotal(result.total);
    });
  }, [filters]);

  useEffect(() => {
    loginHistoryService.getLoginStats().then(setStats);
  }, [rows.length]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / filters.pageSize)), [total, filters.pageSize]);

  return { filters, setFilters, rows, totalPages, stats };
};
