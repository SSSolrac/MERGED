import { useCallback, useEffect, useState } from 'react';
import { customerService } from '@/services/customerService';
import { getErrorMessage } from '@/lib/errors';
import type { CustomerWithLoyalty } from '@/types/customer';

export const useCustomers = () => {
  const [customers, setCustomers] = useState<CustomerWithLoyalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const rows = await customerService.getCustomers();
      setCustomers(rows);
      return rows;
    } catch (loadError) {
      console.error('Failed to load customers', loadError);
      setCustomers([]);
      setError(getErrorMessage(loadError, 'Unable to load customers.'));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  return { customers, loading, error, refresh: loadCustomers };
};
