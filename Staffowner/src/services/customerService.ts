import { loyaltyService } from '@/services/loyaltyService';
import type { CustomerWithLoyalty } from '@/types/customer';
import { normalizeError } from '@/lib/errors';
import { mapCustomerProfileRow } from '@/lib/mappers';
import { requireSupabaseClient } from '@/lib/supabase';

const loadCustomerProfile = async (customerId: string) => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from('profiles').select('*').eq('id', customerId).maybeSingle();
  if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load customer profile.' });
  if (!data) throw new Error('Customer profile not found.');
  return mapCustomerProfileRow(data);
};

export const customerService = {
  async getCustomers(): Promise<CustomerWithLoyalty[]> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.from('profiles').select('*').eq('role', 'customer');
    if (error) throw normalizeError(error, { fallbackMessage: 'Unable to load customers.' });

    const customers = (Array.isArray(data) ? data : []).map(mapCustomerProfileRow);
    const loyaltyByCustomerId = await loyaltyService.getCustomersLoyalty(customers.map((c) => c.id));

    return customers.map((customer) => ({
      ...customer,
      loyalty: loyaltyByCustomerId[customer.id] ?? {
        customerId: customer.id,
        stampCount: 0,
        availableRewards: [],
        redeemedRewards: [],
        rewardRedemptionCounts: [],
        updatedAt: new Date().toISOString(),
      },
    }));
  },

  async getCustomerById(customerId: string): Promise<CustomerWithLoyalty> {
    const [customer, loyalty] = await Promise.all([loadCustomerProfile(customerId), loyaltyService.getCustomerLoyalty(customerId)]);
    return { ...customer, loyalty };
  },
};
