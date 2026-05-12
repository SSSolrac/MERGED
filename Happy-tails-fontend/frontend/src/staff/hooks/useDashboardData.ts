import { useEffect, useState } from 'react';
import { dashboardService } from '@/services/dashboardService';
import { getErrorMessage } from '@/lib/errors';
import { useAuth } from '@/hooks/useAuth';
import type { DashboardData, DateRangePreset } from '@/types/dashboard';

export const useDashboardData = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [selectedRange, setSelectedRange] = useState<DateRangePreset>('30d');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        setData(await dashboardService.getDashboardData(selectedRange, { includeFinancialSummary: isOwner }));
      } catch (loadError) {
        console.error('Failed to load dashboard data', loadError);
        setError(getErrorMessage(loadError, 'Unable to load dashboard data.'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isOwner, selectedRange]);

  return { data, loading, error, selectedRange, setSelectedRange };
};
