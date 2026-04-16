import type { CustomerProfile } from '@/types/customer';
import type { DailyMenu, DailyMenuItem } from '@/types/dailyMenu';
import type { Ingredient, RecipeLine } from '@/types/ingredient';
import type { InventoryCategory, InventoryItem } from '@/types/inventory';
import type { LoyaltyAccount, Reward } from '@/types/loyalty';
import type { MenuCategory, MenuItem } from '@/types/menuItem';
import type { Order, OrderItem, OrderStatusHistoryItem, PaymentMethod, PaymentStatus } from '@/types/order';
import type { UserRole } from '@/types/user';
import { normalizePaymentMethod } from '@/utils/payment';

type DbRecord = Record<string, unknown>;

export const asRecord = (value: unknown): DbRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as DbRecord;
};

const asString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const asNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const asBoolean = (value: unknown, fallback = false) => (typeof value === 'boolean' ? value : value == null ? fallback : Boolean(value));

const asIsoString = (value: unknown, fallback: string) => {
  const v = asString(value, '');
  if (v) return v;
  return fallback;
};

export const mapUserRole = (value: unknown): UserRole => {
  const role = asString(value, '').trim().toLowerCase();
  if (role === 'owner' || role === 'staff' || role === 'customer') return role;
  return 'customer';
};

export const mapCustomerProfileRow = (row: unknown): CustomerProfile => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  const customerCode = r.customer_code == null ? null : asString(r.customer_code, '').trim() || null;
  return {
    id: asString(r.id, ''),
    customerCode,
    name: asString(r.name, ''),
    email: asString(r.email, ''),
    phone: asString(r.phone, ''),
    addresses: Array.isArray(r.addresses) ? r.addresses : [],
    preferences: (asRecord(r.preferences) ?? {}) as Record<string, unknown>,
    isActive: asBoolean(r.is_active, true),
    createdAt: asIsoString(r.created_at, now),
    updatedAt: asIsoString(r.updated_at, asIsoString(r.created_at, now)),
  };
};

export const mapMenuCategoryRow = (row: unknown): MenuCategory => {
  const r = asRecord(row) ?? {};
  return {
    id: asString(r.id, ''),
    name: asString(r.name, ''),
    description: r.description == null ? null : asString(r.description, ''),
    sortOrder: asNumber(r.sort_order, 0),
    isActive: asBoolean(r.is_active, true),
  };
};

export const mapMenuItemRow = (row: unknown): MenuItem => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  const effectiveAvailability =
    r.effective_is_available ??
    r.effectiveIsAvailable ??
    r.is_effectively_available ??
    r.isEffectivelyAvailable ??
    r.is_available;
  return {
    id: asString(r.id, ''),
    code: asString(r.code, ''),
    categoryId: asString(r.category_id, ''),
    name: asString(r.name, ''),
    description: r.description == null ? null : asString(r.description, ''),
    price: asNumber(r.price, 0),
    discount: asNumber(r.discount, 0),
    isAvailable: asBoolean(effectiveAvailability, true),
    imageUrl: r.image_url == null ? null : asString(r.image_url, ''),
    createdAt: asIsoString(r.created_at, now),
    updatedAt: asIsoString(r.updated_at, asIsoString(r.created_at, now)),
  };
};

export const mapIngredientRow = (row: unknown): Ingredient => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  return {
    id: asString(r.id, ''),
    code: asString(r.code, ''),
    name: asString(r.name, ''),
    unit: asString(r.unit, 'pcs') as Ingredient['unit'],
    stockOnHand: asNumber(r.stock_on_hand, 0),
    reorderLevel: asNumber(r.reorder_level, 0),
    isActive: asBoolean(r.is_active, true),
    createdAt: asIsoString(r.created_at, now),
    updatedAt: asIsoString(r.updated_at, asIsoString(r.created_at, now)),
  };
};

export const mapRecipeLineRow = (row: unknown): RecipeLine => {
  const r = asRecord(row) ?? {};
  return {
    id: asString(r.id, ''),
    menuItemId: asString(r.menu_item_id, ''),
    ingredientId: asString(r.ingredient_id, ''),
    quantityRequired: asNumber(r.quantity_required, 0),
  };
};

export const mapInventoryCategoryRow = (row: unknown): InventoryCategory => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  return {
    id: asString(r.id, ''),
    name: asString(r.name, ''),
    sortOrder: asNumber(r.sort_order, 0),
    isActive: asBoolean(r.is_active, true),
    createdAt: asIsoString(r.created_at, now),
    updatedAt: asIsoString(r.updated_at, asIsoString(r.created_at, now)),
  };
};

export const mapInventoryItemRow = (row: unknown): InventoryItem => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  return {
    id: asString(r.id, ''),
    code: asString(r.code, ''),
    categoryId: asString(r.category_id, ''),
    name: asString(r.name, ''),
    unit: asString(r.unit, 'pcs'),
    quantityOnHand: asNumber(r.quantity_on_hand, 0),
    reorderLevel: asNumber(r.reorder_level, 0),
    displayQuantity: r.display_quantity == null ? null : asString(r.display_quantity, ''),
    notes: r.notes == null ? null : asString(r.notes, ''),
    isActive: asBoolean(r.is_active, true),
    createdAt: asIsoString(r.created_at, now),
    updatedAt: asIsoString(r.updated_at, asIsoString(r.created_at, now)),
  };
};

export const mapDailyMenuRow = (row: unknown, items: DailyMenuItem[] = []): DailyMenu => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  return {
    id: asString(r.id, ''),
    menuDate: asString(r.menu_date, new Date().toISOString().slice(0, 10)),
    isPublished: asBoolean(r.is_published, false),
    createdBy: r.created_by == null ? null : asString(r.created_by, ''),
    createdAt: asIsoString(r.created_at, now),
    updatedAt: asIsoString(r.updated_at, asIsoString(r.created_at, now)),
    items,
  };
};

export const mapDailyMenuItemRow = (row: unknown): DailyMenuItem => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  return {
    id: asString(r.id, ''),
    dailyMenuId: asString(r.daily_menu_id, ''),
    menuItemId: asString(r.menu_item_id, ''),
    createdAt: asIsoString(r.created_at, now),
  };
};

export const mapRewardRow = (row: unknown): Reward => {
  const r = asRecord(row) ?? {};
  return {
    id: asString(r.id, ''),
    label: asString(r.label, ''),
    requiredStamps: asNumber(r.required_stamps, 0),
  };
};

export const mapLoyaltyAccountRow = (row: unknown): Pick<LoyaltyAccount, 'customerId' | 'stampCount' | 'updatedAt'> => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  return {
    customerId: asString(r.customer_id, ''),
    stampCount: asNumber(r.stamp_count, 0),
    updatedAt: asIsoString(r.updated_at, now),
  };
};

export const mapOrderRow = (row: unknown): Order => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  const customerId = (r.customer_id ?? r.customerId) as unknown;
  const customerName = (r.customer_name ?? r.customerName) as unknown;
  const orderType = (r.order_type ?? r.orderType) as unknown;
  const paymentMethod = (r.payment_method ?? r.paymentMethod) as unknown;
  const paymentStatus = (r.payment_status ?? r.paymentStatus) as unknown;
  const subtotal = (r.subtotal ?? r.sub_total ?? r.subTotal) as unknown;
  const discountTotal = (r.discount_total ?? r.discountTotal ?? r.discount_amount ?? r.discountAmount ?? r.discount) as unknown;
  const totalAmount = (r.total_amount ?? r.totalAmount ?? r.grand_total ?? r.grandTotal ?? r.total ?? r.amount) as unknown;
  const receiptImageUrl = (r.receipt_image_url ?? r.receiptImageUrl) as unknown;
  const deliveryAddress = (r.delivery_address ?? r.deliveryAddress) as unknown;
  const placedAt = (r.placed_at ?? r.placedAt) as unknown;
  const createdAt = (r.created_at ?? r.createdAt) as unknown;
  const updatedAt = (r.updated_at ?? r.updatedAt) as unknown;
  return {
    id: asString(r.id, ''),
    code: asString(r.code, ''),
    customerId: customerId == null ? null : asString(customerId, ''),
    customerName: customerName == null ? null : asString(customerName, '').trim() || null,
    orderType: asString(orderType, 'takeout') as Order['orderType'],
    status: asString(r.status, 'pending') as Order['status'],
    paymentMethod: normalizePaymentMethod(paymentMethod == null ? null : asString(paymentMethod, '')) as PaymentMethod,
    paymentStatus: asString(paymentStatus, 'pending') as PaymentStatus,
    subtotal: asNumber(subtotal, 0),
    discountTotal: asNumber(discountTotal, 0),
    totalAmount: asNumber(totalAmount, 0),
    receiptImageUrl: receiptImageUrl == null ? null : asString(receiptImageUrl, ''),
    notes: r.notes == null ? null : asString(r.notes, ''),
    deliveryAddress: deliveryAddress ?? null,
    placedAt: asIsoString(placedAt, asIsoString(createdAt, now)),
    createdAt: asIsoString(createdAt, now),
    updatedAt: asIsoString(updatedAt, asIsoString(createdAt, now)),
  };
};

export const mapOrderItemRow = (row: unknown): OrderItem => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  const orderId = (r.order_id ?? r.orderId) as unknown;
  const menuItemId = (r.menu_item_id ?? r.menuItemId) as unknown;
  const menuItemCode = (r.menu_item_code ?? r.menuItemCode) as unknown;
  const itemName = (r.item_name ?? r.itemName) as unknown;
  const unitPrice = (r.unit_price ?? r.unitPrice ?? r.price) as unknown;
  const discountAmount = (r.discount_amount ?? r.discountAmount) as unknown;
  const quantity = (r.quantity ?? r.qty) as unknown;
  const lineTotal = (r.line_total ?? r.lineTotal ?? r.total) as unknown;
  const createdAt = (r.created_at ?? r.createdAt) as unknown;
  return {
    id: asString(r.id, ''),
    orderId: asString(orderId, ''),
    menuItemId: menuItemId == null ? null : asString(menuItemId, ''),
    menuItemCode: menuItemCode == null ? null : asString(menuItemCode, ''),
    itemName: asString(itemName, ''),
    unitPrice: asNumber(unitPrice, 0),
    discountAmount: asNumber(discountAmount, 0),
    quantity: asNumber(quantity, 1),
    lineTotal: asNumber(lineTotal, 0),
    createdAt: asIsoString(createdAt, now),
  };
};

export const mapOrderStatusHistoryRow = (row: unknown): OrderStatusHistoryItem => {
  const r = asRecord(row) ?? {};
  const now = new Date().toISOString();
  return {
    id: asString(r.id, ''),
    orderId: asString(r.order_id, ''),
    status: asString(r.status, 'pending') as OrderStatusHistoryItem['status'],
    changedBy: r.changed_by == null ? null : asString(r.changed_by, ''),
    note: r.note == null ? null : asString(r.note, ''),
    changedAt: asIsoString(r.changed_at, now),
  };
};
