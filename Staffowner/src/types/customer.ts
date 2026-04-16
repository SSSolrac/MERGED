import type { LoyaltyAccount } from './loyalty';

export interface CustomerProfile {
  id: string;
  customerCode: string | null;
  name: string;
  email: string;
  phone: string;
  addresses: unknown[];
  preferences: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerWithLoyalty extends CustomerProfile {
  loyalty: LoyaltyAccount;
}

export type Customer = CustomerWithLoyalty;
