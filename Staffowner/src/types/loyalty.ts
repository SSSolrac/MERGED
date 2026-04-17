export const LOYALTY_TOTAL_STAMPS = 10;

export type Reward = {
  id: string;
  label: string;
  requiredStamps: number;
};

export type LoyaltyAccount = {
  customerId: string;
  stampCount: number;
  availableRewards: Reward[];
  redeemedRewards: Reward[];
  updatedAt: string;
};

export type LoyaltyActivitySource = 'automatic-order-confirmation' | 'manual-staff-adjustment';

export interface LoyaltyActivityEntry {
  id: string;
  customerId: string;
  source: LoyaltyActivitySource;
  stampDelta: number;
  at: string;
  orderId?: string;
  reason?: string;
}

export type ManualStampAwardResult = {
  eventId: string;
  customerId: string;
  customerLabel: string;
  stampDelta: number;
  newStampCount: number;
  reason: string | null;
  awardedAt: string;
};
