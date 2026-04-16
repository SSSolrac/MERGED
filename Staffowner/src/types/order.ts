import type { DateRangePreset } from './dashboard';
import type { CustomerProfile } from './customer';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type PaymentMethod = 'qrph' | 'gcash' | 'maribank' | 'bdo' | 'cash' | null;

export type OrderType = 'dine_in' | 'pickup' | 'takeout' | 'delivery';

export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type OrderItem = {
  id: string;
  orderId: string;
  menuItemId: string | null;
  menuItemCode: string | null;
  itemName: string;
  unitPrice: number;
  discountAmount: number;
  quantity: number;
  lineTotal: number;
  createdAt: string;
};

export type OrderStatusHistoryItem = {
  id: string;
  orderId: string;
  status: OrderStatus;
  changedBy: string | null;
  note: string | null;
  changedAt: string;
};

export type Order = {
  id: string;
  code: string;
  customerId: string | null;
  customerName?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  orderType: OrderType;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  discountTotal: number;
  totalAmount: number;
  receiptImageUrl: string | null;
  notes: string | null;
  deliveryAddress: unknown;
  placedAt: string;
  createdAt: string;
  updatedAt: string;

  items?: OrderItem[];
  statusTimeline?: OrderStatusHistoryItem[];
  customer?: Pick<CustomerProfile, 'id' | 'customerCode' | 'name' | 'email' | 'phone'> | null;
};

export type OrderFilters = {
  query?: string;
  status?: OrderStatus | 'all';
  paymentMethod?: PaymentMethod | 'all';
  range?: DateRangePreset;
  limit?: number;
};
