export type MenuItem = {
  id: string;
  code: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  effectivePrice: number;
  isAvailable: boolean;
  imageUrl: string | null;
  discount: number;
  effectiveDiscount: number;
  isDiscountActive: boolean;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
  limitedTimeEndsAt: string | null;
  newTagStartedAt: string | null;
  newTagExpiresAt: string | null;
  isNew: boolean;
  isLimited: boolean;
  isLimitedExpired: boolean;
  categoryIsNew: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MenuCategory = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  newTagStartedAt: string | null;
  newTagExpiresAt: string | null;
  isNew: boolean;
  createdAt: string;
  updatedAt: string;
};
