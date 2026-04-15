export type StaffOwnerNotificationType = 'low_stock' | 'out_of_stock' | 'new_order' | 'order_cancelled' | 'promo_updated';

export type StaffOwnerNotification = {
  id: string;
  type: StaffOwnerNotificationType;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  relatedOrderId?: string;
  relatedInventoryItemId?: string;
};
