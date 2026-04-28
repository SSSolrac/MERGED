import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, EmptyState, Image, SectionCard, StatusChip } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { useMenuCategories } from '@/hooks/useMenuCategories';
import { useMenuItems } from '@/hooks/useMenuItems';
import { menuService } from '@/services/menuService';
import type { MenuCategory, MenuItem } from '@/types/menuItem';
import { formatCurrency } from '@/utils/currency';

const createDefaultMenuItemDraft = (): MenuItem => ({
  id: '',
  code: '',
  name: '',
  categoryId: '',
  description: null,
  price: 0,
  cost: 0,
  effectivePrice: 0,
  discount: 0,
  discountType: 'amount',
  discountValue: 0,
  discountLabel: null,
  effectiveDiscount: 0,
  isDiscountActive: false,
  discountStartsAt: null,
  discountEndsAt: null,
  isAvailable: true,
  imageUrl: null,
  limitedTimeEndsAt: null,
  newTagStartedAt: null,
  newTagExpiresAt: null,
  isNew: false,
  isLimited: false,
  isLimitedExpired: false,
  categoryIsNew: false,
  createdAt: '',
  updatedAt: '',
});

const defaultCategoryDraft: MenuCategory = {
  id: '',
  name: '',
  description: null,
  imageUrl: null,
  sortOrder: 0,
  isActive: true,
  newTagStartedAt: null,
  newTagExpiresAt: null,
  isNew: false,
  createdAt: '',
  updatedAt: '',
};

type DiscountMode = 'amount' | 'percent';
type DraftDiscountMode = DiscountMode | 'none';
type BulkScope = 'all' | 'specific';
type MenuEditorTab = 'discount-tools' | 'discounted-items';
type MenuItemGroup = {
  id: string;
  name: string;
  items: MenuItem[];
};

const LIMITED_ITEM_SENTINEL = '9999-12-31T23:59:00.000Z';
const MENU_GROUP_PREVIEW_LIMIT = 10;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const asTrimmed = (value: string | null | undefined) => String(value || '').trim();
const asNumberOrZero = (value: string | number | null | undefined) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const normalizeAmount = (value: number) => roundCurrency(Math.max(0, asNumberOrZero(value)));
const normalizePercent = (value: number) => Math.min(100, Math.max(0, roundCurrency(asNumberOrZero(value))));
const formatPriceInput = (value: number) => {
  const normalized = normalizeAmount(value);
  return normalized > 0 ? String(normalized) : '0';
};
const sanitizePriceInput = (rawValue: string) => {
  const cleaned = rawValue.replace(/[^\d.]/g, '');
  if (!cleaned) return '';

  const [wholeRaw, ...decimalParts] = cleaned.split('.');
  const wholeNormalized = wholeRaw.replace(/^0+(?=\d)/, '');
  const wholePart = wholeNormalized || (wholeRaw.length > 0 ? '0' : '');

  if (decimalParts.length === 0) return wholePart;

  const decimalPart = decimalParts.join('').slice(0, 2);
  if (!decimalPart.length) return `${wholePart || '0'}.`;
  return `${wholePart || '0'}.${decimalPart}`;
};

const formatDateTime = (value: string | null | undefined) => {
  const text = asTrimmed(value);
  if (!text) return 'Not set';
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
};

const isLimitedSentinel = (value: string | null | undefined) => asTrimmed(value).startsWith('9999-12-31');

const getLimitedDisplayLabel = (value: string | null | undefined) => {
  if (!asTrimmed(value)) return '';
  if (isLimitedSentinel(value)) return 'Limited item';
  return `Limited until: ${formatDateTime(value)}`;
};

const getDiscountScheduleLabel = (item: MenuItem) => {
  if (!item.discount || item.discount <= 0) return 'No discount';

  const startsAt = asTrimmed(item.discountStartsAt);
  const endsAt = asTrimmed(item.discountEndsAt);
  if (!startsAt && !endsAt) return 'Active without schedule';
  if (item.isDiscountActive) {
    return endsAt ? `Active until ${formatDateTime(endsAt)}` : startsAt ? `Active since ${formatDateTime(startsAt)}` : 'Active now';
  }
  if (startsAt) return `Starts ${formatDateTime(startsAt)}`;
  if (endsAt) return `Ends ${formatDateTime(endsAt)}`;
  return 'Scheduled';
};

const getDiscountFromMode = (price: number, inputValue: number, mode: DiscountMode) => {
  const safePrice = normalizeAmount(price);
  if (safePrice <= 0) return 0;

  if (mode === 'percent') {
    const percent = normalizePercent(inputValue);
    return roundCurrency(Math.min(safePrice, (safePrice * percent) / 100));
  }

  return roundCurrency(Math.min(safePrice, normalizeAmount(inputValue)));
};

const getNormalizedDiscountValue = (value: number, mode: DiscountMode) => {
  if (mode === 'percent') return normalizePercent(value);
  return normalizeAmount(value);
};

const getDiscountDisplayLabel = (mode: DiscountMode, value: number) => {
  const normalized = getNormalizedDiscountValue(value, mode);
  if (normalized <= 0) return 'No discount';
  return mode === 'percent' ? `${normalized}% off` : `${formatCurrency(normalized)} off`;
};

const getMenuItemDiscountLabel = (item: MenuItem) => {
  if (normalizeAmount(item.effectiveDiscount || item.discount) <= 0) return 'No discount';
  const storedLabel = asTrimmed(item.discountLabel);
  if (storedLabel) return storedLabel;
  return getDiscountDisplayLabel(item.discountType, item.discountValue || item.discount);
};

const validateMenuItemDraft = (draft: MenuItem) => {
  if (!asTrimmed(draft.name)) return 'Menu item name is required.';
  if (asTrimmed(draft.name).length < 2) return 'Menu item name must be at least 2 characters.';
  if (!asTrimmed(draft.categoryId)) return 'Category is required.';
  if (!Number.isFinite(draft.price) || draft.price < 0) return 'Price must be zero or higher.';
  if (draft.price === 0) return 'Price must be greater than zero.';
  if (!Number.isFinite(draft.cost) || draft.cost < 0) return 'Item cost must be zero or higher.';
  if (!Number.isFinite(draft.discount) || draft.discount < 0) return 'Discount must be zero or higher.';
  if (draft.price > 0 && draft.discount > draft.price) return 'Discount cannot be greater than price.';
  if (draft.discountType === 'percent' && draft.discountValue > 100) return 'Percent discount cannot exceed 100%.';
  return '';
};

export const MenuManagementPage = () => {
  const { categories, loading: categoriesLoading, error: categoriesError, saveCategory, deleteCategory } = useMenuCategories();
  const { items, loading: itemsLoading, error: itemsError, saveItem, deleteItem } = useMenuItems();
  const [categoryDraft, setCategoryDraft] = useState<MenuCategory>(defaultCategoryDraft);
  const [draft, setDraft] = useState<MenuItem>(() => createDefaultMenuItemDraft());
  const [activeCategoryTab, setActiveCategoryTab] = useState('all');
  const [draftDiscountMode, setDraftDiscountMode] = useState<DraftDiscountMode>('none');
  const [draftPriceInput, setDraftPriceInput] = useState('');
  const [query, setQuery] = useState('');
  const [menuItemError, setMenuItemError] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingCategoryImage, setIsUploadingCategoryImage] = useState(false);
  const [isMenuItemModalOpen, setIsMenuItemModalOpen] = useState(false);
  const [savedMenuImageUrl, setSavedMenuImageUrl] = useState('');
  const [lastSaveMessage, setLastSaveMessage] = useState('');
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [activeEditorTab, setActiveEditorTab] = useState<MenuEditorTab>('discount-tools');
  const [bulkDiscountMode, setBulkDiscountMode] = useState<DiscountMode>('amount');
  const [bulkDiscountInput, setBulkDiscountInput] = useState('0');
  const [bulkScope, setBulkScope] = useState<BulkScope>('all');
  const [bulkItemQuery, setBulkItemQuery] = useState('');
  const [selectedBulkItemIds, setSelectedBulkItemIds] = useState<string[]>([]);
  const [isApplyingBulkDiscount, setIsApplyingBulkDiscount] = useState(false);

  const filtered = useMemo(() => items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const groupedMenuItems = useMemo<MenuItemGroup[]>(() => {
    const categoryIds = new Set(categories.map((category) => category.id));
    const categoryGroups = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        items: filtered.filter((item) => item.categoryId === category.id),
      }))
      .filter((group) => group.items.length > 0);
    const uncategorizedItems = filtered.filter((item) => !categoryIds.has(item.categoryId));
    if (!uncategorizedItems.length) return categoryGroups;
    return [...categoryGroups, { id: 'uncategorized', name: 'Uncategorized', items: uncategorizedItems }];
  }, [categories, filtered]);
  const categoryTabs = useMemo(
    () => [
      { id: 'all', label: 'All items', count: filtered.length },
      ...groupedMenuItems.map((group) => ({
        id: group.id,
        label: group.name,
        count: group.items.length,
      })),
    ],
    [filtered.length, groupedMenuItems],
  );
  const visibleGroupedMenuItems = useMemo(
    () => (activeCategoryTab === 'all' ? groupedMenuItems : groupedMenuItems.filter((group) => group.id === activeCategoryTab)),
    [activeCategoryTab, groupedMenuItems],
  );
  const expandedGroupSet = useMemo(() => new Set(expandedGroupIds), [expandedGroupIds]);
  const bulkSelectableItems = useMemo(() => {
    const needle = asTrimmed(bulkItemQuery).toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.name.toLowerCase().includes(needle));
  }, [bulkItemQuery, items]);
  const selectedBulkSet = useMemo(() => new Set(selectedBulkItemIds), [selectedBulkItemIds]);
  const selectedBulkCount = useMemo(
    () => items.reduce((count, item) => count + (selectedBulkSet.has(item.id) ? 1 : 0), 0),
    [items, selectedBulkSet],
  );
  const bulkTargetCount = bulkScope === 'all' ? items.length : selectedBulkCount;
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const discountedItems = useMemo(
    () => items.filter((item) => item.isDiscountActive && normalizeAmount(item.effectiveDiscount) > 0),
    [items],
  );
  const menuEditorTabs = useMemo(
    () => [
      {
        id: 'discount-tools' as const,
        label: 'Discount Tools',
        description:
          bulkScope === 'all'
            ? `Apply to ${items.length} item${items.length === 1 ? '' : 's'}`
            : `${selectedBulkCount} selected item${selectedBulkCount === 1 ? '' : 's'}`,
      },
      {
        id: 'discounted-items' as const,
        label: 'Discounted Items',
        description: `${discountedItems.length} active`,
      },
    ],
    [bulkScope, discountedItems.length, items.length, selectedBulkCount],
  );

  useEffect(() => {
    setSelectedBulkItemIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

  useEffect(() => {
    if (activeCategoryTab === 'all') return;
    if (!groupedMenuItems.some((group) => group.id === activeCategoryTab)) {
      setActiveCategoryTab('all');
    }
  }, [activeCategoryTab, groupedMenuItems]);

  useEffect(() => {
    setExpandedGroupIds((current) => current.filter((id) => groupedMenuItems.some((group) => group.id === id)));
  }, [groupedMenuItems]);

  useEffect(() => {
    if (!isMenuItemModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuItemModalOpen(false);
        setDraft(createDefaultMenuItemDraft());
        setMenuItemError('');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMenuItemModalOpen]);

  if (itemsLoading) return <p>Loading menu...</p>;
  if (itemsError) return <p className="text-red-600">{itemsError}</p>;

  const resetMenuItemDraft = () => {
    setDraft(createDefaultMenuItemDraft());
    setDraftDiscountMode('none');
    setDraftPriceInput('');
    setMenuItemError('');
    setSavedMenuImageUrl('');
  };

  const handleOpenCreateMenuItemModal = () => {
    resetMenuItemDraft();
    setIsMenuItemModalOpen(true);
  };

  const handleCloseMenuItemModal = () => {
    setIsMenuItemModalOpen(false);
    resetMenuItemDraft();
  };

  const handleDraftPriceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const sanitizedInput = sanitizePriceInput(event.target.value);
    setDraftPriceInput(sanitizedInput);
    const nextPrice = sanitizedInput ? normalizeAmount(sanitizedInput) : 0;
    setDraft((current) => ({
      ...current,
      price: nextPrice,
      discount: getDiscountFromMode(nextPrice, current.discountValue, current.discountType),
    }));
  };

  const handleDraftPriceBlur = () => {
    if (!draftPriceInput) {
      setDraft((current) => ({
        ...current,
        price: 0,
        discount: 0,
      }));
      return;
    }

    const normalized = normalizeAmount(draftPriceInput);
    setDraftPriceInput(formatPriceInput(normalized));
    setDraft((current) => ({
      ...current,
      price: normalized,
      discount: getDiscountFromMode(normalized, current.discountValue, current.discountType),
    }));
  };

  const handleSaveMenuItem = async () => {
    const normalizedPrice = normalizeAmount(draft.price);
    const activeDiscountMode: DiscountMode = draftDiscountMode === 'none' ? 'amount' : draft.discountType;
    const normalizedDiscountValue = draftDiscountMode === 'none' ? 0 : getNormalizedDiscountValue(draft.discountValue, activeDiscountMode);
    const normalizedDiscount = getDiscountFromMode(normalizedPrice, normalizedDiscountValue, activeDiscountMode);
    const preparedDraft: MenuItem = {
      ...draft,
      price: normalizedPrice,
      cost: normalizeAmount(draft.cost),
      effectivePrice: Math.max(normalizedPrice - normalizedDiscount, 0),
      discount: normalizedDiscount,
      discountType: normalizedDiscount > 0 ? activeDiscountMode : 'amount',
      discountValue: normalizedDiscount > 0 ? normalizedDiscountValue : 0,
      discountLabel: normalizedDiscount > 0 ? getDiscountDisplayLabel(activeDiscountMode, normalizedDiscountValue) : null,
      effectiveDiscount: normalizedDiscount,
      isDiscountActive: normalizedDiscount > 0,
      discountStartsAt: null,
      discountEndsAt: null,
      limitedTimeEndsAt: asTrimmed(draft.limitedTimeEndsAt) || null,
    };

    const validationError = validateMenuItemDraft(preparedDraft);
    if (validationError) {
      setMenuItemError(validationError);
      toast.error(validationError);
      return;
    }
    if (!categories.some((category) => category.id === preparedDraft.categoryId)) {
      const message = 'Select a valid category before saving this menu item.';
      setMenuItemError(message);
      toast.error(message);
      return;
    }

    try {
      setMenuItemError('');
      await saveItem({
        ...preparedDraft,
        name: asTrimmed(preparedDraft.name),
        categoryId: asTrimmed(preparedDraft.categoryId),
        description: asTrimmed(preparedDraft.description) || null,
        imageUrl: asTrimmed(preparedDraft.imageUrl) || null,
      });
      const message = draft.id ? `Saved changes to ${asTrimmed(preparedDraft.name)}.` : `Created ${asTrimmed(preparedDraft.name)}.`;
      setLastSaveMessage(message);
      toast.success(message);
      setIsMenuItemModalOpen(false);
      resetMenuItemDraft();
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to save menu item.');
      setMenuItemError(message);
      toast.error(message);
    }
  };

  const handleMenuImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      const message = 'Menu image must be an image file.';
      setMenuItemError(message);
      toast.error(message);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const message = 'Menu image must be 5 MB or smaller.';
      setMenuItemError(message);
      toast.error(message);
      return;
    }

    try {
      setIsUploadingImage(true);
      const uploadedUrl = await menuService.uploadMenuItemImage(file);
      setDraft((current) => ({ ...current, imageUrl: uploadedUrl }));
      setMenuItemError('');
      toast.success('Menu image uploaded.');
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to upload image.');
      setMenuItemError(message);
      toast.error(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleCategoryImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Category image must be an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error('Category image must be 5 MB or smaller.');
      return;
    }

    try {
      setIsUploadingCategoryImage(true);
      const uploadedUrl = await menuService.uploadMenuCategoryImage(file);
      setCategoryDraft((current) => ({ ...current, imageUrl: uploadedUrl }));
      toast.success('Category image uploaded.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to upload category image.'));
    } finally {
      setIsUploadingCategoryImage(false);
    }
  };

  const handleSaveCategory = async () => {
    const name = asTrimmed(categoryDraft.name);
    const description = asTrimmed(categoryDraft.description) || null;
    if (!name) {
      toast.error('Category name is required.');
      return;
    }

    try {
      const saved = await saveCategory({
        ...categoryDraft,
        name,
        description,
        imageUrl: asTrimmed(categoryDraft.imageUrl) || null,
      });
      setCategoryDraft(defaultCategoryDraft);
      toast.success(`Category saved (${saved.name}).`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to save category.'));
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await deleteCategory(categoryId);
      toast.info('Category removed.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to remove category.'));
    }
  };

  const handleDeleteMenuItem = async (itemId: string) => {
    try {
      await deleteItem(itemId);
      toast.info('Menu item removed.');
      if (draft.id === itemId) resetMenuItemDraft();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to remove menu item.'));
    }
  };

  const handleEditMenuItem = (item: MenuItem) => {
    const normalizedPrice = normalizeAmount(item.price);
    setDraft({ ...item, price: normalizedPrice });
    setDraftDiscountMode(normalizeAmount(item.discount) > 0 ? item.discountType : 'none');
    setDraftPriceInput(formatPriceInput(normalizedPrice));
    setMenuItemError('');
    setSavedMenuImageUrl(asTrimmed(item.imageUrl));
    setIsMenuItemModalOpen(true);
  };

  const toggleBulkItemSelection = (itemId: string) => {
    setSelectedBulkItemIds((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));
  };

  const selectAllVisibleBulkItems = () => {
    setSelectedBulkItemIds((current) => {
      const merged = new Set(current);
      bulkSelectableItems.forEach((item) => merged.add(item.id));
      return Array.from(merged);
    });
  };

  const clearBulkSelection = () => setSelectedBulkItemIds([]);

  const handleApplyBulkDiscount = async () => {
    const targetItems = bulkScope === 'all' ? items : items.filter((item) => selectedBulkSet.has(item.id));

    if (!targetItems.length) {
      toast.error(bulkScope === 'all' ? 'No menu items found to update.' : 'Select at least one menu item first.');
      return;
    }

    const inputValue = asNumberOrZero(bulkDiscountInput);
    if (inputValue < 0) {
      toast.error('Discount value must be zero or higher.');
      return;
    }

    if (bulkDiscountMode === 'percent' && inputValue > 100) {
      toast.error('Percent discount cannot exceed 100%.');
      return;
    }

    const normalizedDiscountValue = getNormalizedDiscountValue(inputValue, bulkDiscountMode);
    const updates = targetItems
      .map((item) => {
        const nextDiscount = getDiscountFromMode(item.price, normalizedDiscountValue, bulkDiscountMode);
        return {
          ...item,
          discount: nextDiscount,
          discountType: nextDiscount > 0 ? bulkDiscountMode : 'amount',
          discountValue: nextDiscount > 0 ? normalizedDiscountValue : 0,
          discountLabel: nextDiscount > 0 ? getDiscountDisplayLabel(bulkDiscountMode, normalizedDiscountValue) : null,
          effectiveDiscount: nextDiscount,
          effectivePrice: Math.max(normalizeAmount(item.price) - nextDiscount, 0),
          isDiscountActive: nextDiscount > 0,
          discountStartsAt: null,
          discountEndsAt: null,
          hasChanged:
            Math.abs(nextDiscount - normalizeAmount(item.discount)) >= 0.005 ||
            item.discountType !== (nextDiscount > 0 ? bulkDiscountMode : 'amount') ||
            Math.abs(normalizeAmount(item.discountValue) - (nextDiscount > 0 ? normalizedDiscountValue : 0)) >= 0.005 ||
            Boolean(item.discountStartsAt || item.discountEndsAt),
        };
      })
      .filter((item) => item.hasChanged)
      .map(({ hasChanged: _ignored, ...item }) => item);

    if (!updates.length) {
      toast.info('All menu items already match this discount.');
      return;
    }

    try {
      setIsApplyingBulkDiscount(true);
      await Promise.all(updates.map((item) => saveItem(item)));
      toast.success(`Updated discount for ${updates.length} ${bulkScope === 'all' ? 'menu item(s)' : 'selected item(s)'}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to apply bulk discount.'));
    } finally {
      setIsApplyingBulkDiscount(false);
    }
  };

  const handleClearAllDiscounts = async () => {
    const targetItems = bulkScope === 'all' ? items : items.filter((item) => selectedBulkSet.has(item.id));
    if (!targetItems.length) {
      toast.error(bulkScope === 'all' ? 'No menu items found to update.' : 'Select at least one menu item first.');
      return;
    }

    const updates = targetItems
      .filter((item) => normalizeAmount(item.discount) > 0 || item.discountStartsAt || item.discountEndsAt)
      .map((item) => ({
        ...item,
        discount: 0,
        discountType: 'amount' as const,
        discountValue: 0,
        discountLabel: null,
        effectiveDiscount: 0,
        effectivePrice: normalizeAmount(item.price),
        isDiscountActive: false,
        discountStartsAt: null,
        discountEndsAt: null,
      }));

    if (!updates.length) {
      toast.info(bulkScope === 'all' ? 'All menu items are already at zero discount.' : 'Selected items already have zero discount.');
      return;
    }

    try {
      setIsApplyingBulkDiscount(true);
      await Promise.all(updates.map((item) => saveItem(item)));
      toast.success(`Cleared discount on ${updates.length} ${bulkScope === 'all' ? 'menu item(s)' : 'selected item(s)'}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to clear discounts.'));
    } finally {
      setIsApplyingBulkDiscount(false);
    }
  };

  const bulkPreviewLabel = getDiscountDisplayLabel(bulkDiscountMode, asNumberOrZero(bulkDiscountInput));
  const menuImageStatus = (() => {
    const imageUrl = asTrimmed(draft.imageUrl);
    if (isUploadingImage) return { label: 'Uploading image', tone: 'warning' as const };
    if (!imageUrl) return { label: 'Image not uploaded', tone: 'neutral' as const };
    if (draft.id && imageUrl === savedMenuImageUrl) return { label: 'Image saved', tone: 'success' as const };
    return { label: draft.id ? 'Uploaded, update to save' : 'Uploaded, save item to keep', tone: 'info' as const };
  })();

  return (
    <div className="space-y-3">
      <SectionCard
        title="Manage Menu Items"
        subtitle="Add, edit, and validate menu items with optional image upload support."
        actions={
          <Button variant="secondary" onClick={handleOpenCreateMenuItemModal}>
            Add Menu Item
          </Button>
        }
        contentClassName="space-y-2"
      >
        {categoriesLoading ? <p className="text-sm text-[#6B7280]">Loading categories...</p> : null}
        {categoriesError ? <p className="text-sm text-red-600">{categoriesError}</p> : null}
        {lastSaveMessage ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">{lastSaveMessage}</p> : null}

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {menuEditorTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`min-w-[150px] rounded border px-2 py-1.5 text-left text-sm ${
                  activeEditorTab === tab.id ? 'border-[#F3B8C8] bg-[#FFE4E8] text-[#C94F7C]' : 'bg-white text-[#4B5563]'
                }`}
                onClick={() => setActiveEditorTab(tab.id)}
              >
                <span className="block font-medium">{tab.label}</span>
                <span className="block text-xs text-[#6B7280]">{tab.description}</span>
              </button>
            ))}
          </div>

          {activeEditorTab === 'discount-tools' ? (
            <div className="rounded border border-dashed p-2 space-y-2">
              <h4 className="font-medium text-sm">Apply Discount</h4>
              <div className="grid md:grid-cols-4 gap-2">
                <label className="text-sm">
                  Scope
                  <select className="block border rounded mt-1 px-2 py-1 w-full" value={bulkScope} onChange={(event) => setBulkScope(event.target.value as BulkScope)}>
                    <option value="all">All menu items</option>
                    <option value="specific">Specific items</option>
                  </select>
                </label>
                <label className="text-sm">
                  Discount mode
                  <select
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    value={bulkDiscountMode}
                    onChange={(event) => setBulkDiscountMode(event.target.value as DiscountMode)}
                  >
                    <option value="amount">Fixed amount (PHP)</option>
                    <option value="percent">Percent off (%)</option>
                  </select>
                </label>
                <label className="text-sm">
                  Discount value
                  <input
                    type="number"
                    min={0}
                    max={bulkDiscountMode === 'percent' ? 100 : undefined}
                    step="0.01"
                    className="block border rounded mt-1 px-2 py-1 w-full"
                    value={bulkDiscountInput}
                    onChange={(event) => setBulkDiscountInput(event.target.value)}
                  />
                </label>
                <div className="text-sm flex items-end">
                  <p className="text-[#6B7280]">
                    Preview: {bulkPreviewLabel} on {bulkTargetCount} {bulkTargetCount === 1 ? 'item' : 'items'}
                  </p>
                </div>
              </div>
              {bulkScope === 'specific' ? (
                <div className="rounded border p-2 space-y-2">
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      className="border rounded px-2 py-1 text-sm min-w-[220px]"
                      placeholder="Filter items by name"
                      value={bulkItemQuery}
                      onChange={(event) => setBulkItemQuery(event.target.value)}
                    />
                    <Button variant="outline" size="sm" type="button" onClick={selectAllVisibleBulkItems}>
                      Select Visible
                    </Button>
                    <Button variant="outline" size="sm" type="button" onClick={clearBulkSelection}>
                      Clear Selection
                    </Button>
                  </div>
                  <div className="max-h-44 overflow-auto space-y-1 pr-1">
                    {!bulkSelectableItems.length ? <p className="text-xs text-[#6B7280]">No items match this filter.</p> : null}
                    {bulkSelectableItems.map((item) => (
                      <label key={item.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={selectedBulkSet.has(item.id)} onChange={() => toggleBulkItemSelection(item.id)} />
                        <span>
                          {item.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleApplyBulkDiscount} disabled={isApplyingBulkDiscount}>
                  {isApplyingBulkDiscount ? 'Applying...' : bulkScope === 'all' ? 'Apply To All Items' : 'Apply To Selected Items'}
                </Button>
                <Button variant="outline" onClick={handleClearAllDiscounts} disabled={isApplyingBulkDiscount}>
                  {bulkScope === 'all' ? 'Clear All Discounts' : 'Clear Selected Discounts'}
                </Button>
              </div>
            </div>
          ) : null}

          {activeEditorTab === 'discounted-items' ? (
            <div className="rounded border p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-medium text-sm">Discounted Items</h4>
                <StatusChip label={`${discountedItems.length} active`} tone={discountedItems.length ? 'warning' : 'neutral'} />
              </div>
              {!discountedItems.length ? <p className="text-sm text-[#6B7280]">No menu items have an active discount right now.</p> : null}
              <div className="space-y-2">
                {discountedItems.map((item) => (
                  <div key={`discounted-${item.id}`} className="rounded border p-2 text-sm flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {item.name} - {formatCurrency(item.effectivePrice)}
                        <span className="text-[#6B7280]"> (was {formatCurrency(item.price)})</span>
                      </p>
                      <p className="text-[#6B7280]">{getMenuItemDiscountLabel(item)} - {getDiscountScheduleLabel(item)}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleEditMenuItem(item)}>
                      Edit discount
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Manage Categories" subtitle="Keep customer-facing menu groups organized." contentClassName="space-y-3">
        <div className="grid md:grid-cols-3 gap-2">
          <input
            className="border rounded px-2 py-1"
            placeholder="Category name"
            value={categoryDraft.name}
            onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })}
          />
          <input
            className="border rounded px-2 py-1"
            type="number"
            placeholder="Sort order"
            value={categoryDraft.sortOrder}
            onChange={(event) => setCategoryDraft({ ...categoryDraft, sortOrder: Number(event.target.value) })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={categoryDraft.isActive} onChange={(event) => setCategoryDraft({ ...categoryDraft, isActive: event.target.checked })} />
            Active
          </label>
          <input
            className="border rounded px-2 py-1 md:col-span-3"
            placeholder="Category description (optional)"
            value={categoryDraft.description ?? ''}
            onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })}
          />
          <div className="md:col-span-3 rounded border p-3 flex flex-wrap items-center gap-3 text-sm">
            <label>
              Upload category picture
              <input
                type="file"
                accept="image/*"
                className="block border rounded mt-1 px-2 py-1 w-full text-sm"
                onChange={handleCategoryImageUpload}
                disabled={isUploadingCategoryImage}
              />
            </label>
            <span className="text-xs text-[#6B7280]">
              {isUploadingCategoryImage ? 'Uploading category image...' : 'Shown on the customer category cards.'}
            </span>
            {categoryDraft.imageUrl ? <Image src={categoryDraft.imageUrl} alt={categoryDraft.name || 'category image'} className="h-14 w-14 rounded object-cover border" /> : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleSaveCategory}>Save Category</Button>
          {categoryDraft.id ? (
            <Button variant="outline" onClick={() => setCategoryDraft(defaultCategoryDraft)}>
              Discard edit
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {categories.map((category) => (
            <div key={category.id} className="border rounded p-2 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                {category.imageUrl ? <Image src={category.imageUrl} alt={category.name} className="h-12 w-12 rounded object-cover border" /> : null}
                <div>
                <p>
                  {category.sortOrder} - {category.name} {category.isActive ? '' : '(inactive)'}
                </p>
                <div className="flex gap-2 mt-1">
                  {category.isNew ? <StatusChip label="NEW" tone="success" /> : null}
                </div>
                {asTrimmed(category.description) ? <p className="text-xs text-[#6B7280]">{category.description}</p> : null}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCategoryDraft(category)}>
                  Edit
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDeleteCategory(category.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Menu List" subtitle="Showing 10 items per category by default to keep the page scannable." contentClassName="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">Manage Menu Items</h3>
          <input className="border rounded px-2 py-1 text-sm" placeholder="Search item name" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="space-y-3">
          {!filtered.length ? <EmptyState title="No menu items found" message="Try another search or add a new menu item." /> : null}
          {categoryTabs.length > 1 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Menu Categories</p>
              <div className="flex flex-wrap gap-2">
                {categoryTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`min-w-[160px] rounded border px-3 py-2 text-left text-sm ${
                      activeCategoryTab === tab.id ? 'border-[#F3B8C8] bg-[#FFE4E8] text-[#C94F7C]' : 'bg-white text-[#4B5563]'
                    }`}
                    onClick={() => setActiveCategoryTab(tab.id)}
                  >
                    <span className="block font-medium">{tab.label}</span>
                    <span className="block text-xs text-[#6B7280]">
                      {tab.count} item{tab.count === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
          {visibleGroupedMenuItems.map((group) => {
            const isExpanded = expandedGroupSet.has(group.id);
            const visibleItems = isExpanded ? group.items : group.items.slice(0, MENU_GROUP_PREVIEW_LIMIT);
            return (
            <div key={group.id} className="rounded border border-dashed p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-sm">{group.name}</h4>
                <StatusChip label={`${group.items.length} item${group.items.length === 1 ? '' : 's'}`} tone="neutral" />
              </div>
              {visibleItems.map((item) => (
                <div key={item.id} className="border rounded p-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex-1 min-w-[260px]">
                    <p className="font-medium">
                      {item.name} - {formatCurrency(item.effectivePrice)}
                      {item.isDiscountActive ? <span className="text-[#6B7280]"> (was {formatCurrency(item.price)})</span> : null}
                    </p>
                    <p className="text-[#6B7280]">
                      Category: {categoryNameById.get(item.categoryId) ?? (item.categoryId || 'uncategorized')} - Updated:{' '}
                      {new Date(item.updatedAt).toLocaleString()}
                    </p>
                    <p className="text-[#6B7280]">Item cost: {formatCurrency(item.cost)}</p>
                    {item.limitedTimeEndsAt ? <p className="text-[#6B7280]">{getLimitedDisplayLabel(item.limitedTimeEndsAt)}</p> : null}
                    {item.discount > 0 ? <p className="text-[#6B7280]">{getMenuItemDiscountLabel(item)} - {getDiscountScheduleLabel(item)}</p> : null}
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <StatusChip label={item.isAvailable ? 'Available' : 'Unavailable'} tone={item.isAvailable ? 'success' : 'warning'} />
                      {item.isDiscountActive || item.discount > 0 ? (
                        <StatusChip label={item.isDiscountActive ? getMenuItemDiscountLabel(item) : 'Scheduled discount'} tone="warning" />
                      ) : null}
                      {item.isNew ? <StatusChip label="NEW" tone="success" /> : null}
                      {item.isLimited ? <StatusChip label="LIMITED" tone="warning" /> : null}
                      {item.isLimitedExpired ? <StatusChip label="Expired limited" tone="danger" /> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button variant="outline" size="sm" onClick={() => handleEditMenuItem(item)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDeleteMenuItem(item.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {group.items.length > MENU_GROUP_PREVIEW_LIMIT ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExpandedGroupIds((current) => (current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id]))
                  }
                >
                  {isExpanded ? 'Show Less' : `Show All ${group.items.length}`}
                </Button>
              ) : null}
            </div>
          )})}
          </div>
        </div>
      </SectionCard>

      {isMenuItemModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/40" onClick={handleCloseMenuItemModal} aria-label="Close menu item editor overlay" />
          <div className="relative w-full max-w-4xl rounded-lg border bg-white p-3 space-y-2 shadow-xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-medium">{draft.id ? draft.name || 'Edit Menu Item' : 'Add Menu Item'}</h4>
              <Button variant="outline" size="sm" onClick={handleCloseMenuItemModal} aria-label="Close menu item editor">
                Close
              </Button>
            </div>

            {menuItemError ? <p className="text-sm text-red-600">{menuItemError}</p> : null}

            <div className="grid md:grid-cols-2 gap-2">
              <label className="text-sm">
                Item Name
                <input
                  className="block border rounded mt-1 px-2 py-1 w-full"
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label className="text-sm">
                Category
                <select
                  className="block border rounded mt-1 px-2 py-1 w-full"
                  value={draft.categoryId}
                  onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Price
                <input
                  type="text"
                  inputMode="decimal"
                  className="block border rounded mt-1 px-2 py-1 w-full"
                  placeholder="0.00"
                  value={draftPriceInput}
                  onChange={handleDraftPriceChange}
                  onBlur={handleDraftPriceBlur}
                />
              </label>
              <label className="text-sm">
                Item cost
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="block border rounded mt-1 px-2 py-1 w-full"
                  placeholder="0.00"
                  value={draft.cost}
                  onChange={(event) => setDraft({ ...draft, cost: normalizeAmount(Number(event.target.value)) })}
                />
              </label>
              <div className="text-sm">
                <span className="block">Discount</span>
                <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(120px,160px)] gap-2">
                  <select
                    className="border rounded px-2 py-1 w-full"
                    value={draftDiscountMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as DraftDiscountMode;
                      setDraftDiscountMode(nextMode);
                      setDraft((current) => {
                        if (nextMode === 'none') {
                          return {
                            ...current,
                            discount: 0,
                            discountType: 'amount',
                            discountValue: 0,
                            discountLabel: null,
                            effectiveDiscount: 0,
                            effectivePrice: normalizeAmount(current.price),
                            isDiscountActive: false,
                          };
                        }
                        const nextValue = nextMode === current.discountType ? current.discountValue : 0;
                        const nextDiscount = getDiscountFromMode(current.price, nextValue, nextMode);
                        return {
                          ...current,
                          discountType: nextMode,
                          discountValue: nextValue,
                          discount: nextDiscount,
                          discountLabel: nextDiscount > 0 ? getDiscountDisplayLabel(nextMode, nextValue) : null,
                          effectiveDiscount: nextDiscount,
                          effectivePrice: Math.max(normalizeAmount(current.price) - nextDiscount, 0),
                          isDiscountActive: nextDiscount > 0,
                        };
                      });
                    }}
                  >
                    <option value="none">No discount</option>
                    <option value="amount">Fixed amount</option>
                    <option value="percent">Percent off</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={draftDiscountMode === 'percent' ? 100 : draft.price || undefined}
                    step="0.01"
                    className="border rounded px-2 py-1 w-full"
                    value={draft.discountValue}
                    disabled={draftDiscountMode === 'none'}
                    onChange={(event) =>
                      setDraft((current) => {
                        const nextValue = getNormalizedDiscountValue(Number(event.target.value), current.discountType);
                        const nextDiscount = getDiscountFromMode(current.price, nextValue, current.discountType);
                        return {
                          ...current,
                          discountValue: nextValue,
                          discount: nextDiscount,
                          discountLabel: nextDiscount > 0 ? getDiscountDisplayLabel(current.discountType, nextValue) : null,
                          effectiveDiscount: nextDiscount,
                          effectivePrice: Math.max(normalizeAmount(current.price) - nextDiscount, 0),
                          isDiscountActive: nextDiscount > 0,
                        };
                      })
                    }
                  />
                </div>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Customer label: {draftDiscountMode !== 'none' && draft.discountValue > 0 ? getDiscountDisplayLabel(draft.discountType, draft.discountValue) : 'No discount'}
                </p>
              </div>
              <label className="text-sm">
                Availability
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.isAvailable} onChange={(event) => setDraft({ ...draft, isAvailable: event.target.checked })} />
                  <span>{draft.isAvailable ? 'Available' : 'Unavailable'}</span>
                </div>
              </label>
              <label className="text-sm md:col-span-2 rounded border p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(asTrimmed(draft.limitedTimeEndsAt))}
                    onChange={(event) => setDraft({ ...draft, limitedTimeEndsAt: event.target.checked ? LIMITED_ITEM_SENTINEL : null })}
                  />
                  <span>Mark as limited item</span>
                </div>
                <p className="mt-1 text-xs text-[#6B7280]">Limited items show a LIMITED tag on the customer menu card.</p>
              </label>
              <label className="text-sm md:col-span-2">
                Description
                <input
                  className="block border rounded mt-1 px-2 py-1 w-full"
                  value={draft.description ?? ''}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">
                Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="block border rounded mt-1 px-2 py-1 w-full text-sm"
                  onChange={handleMenuImageUpload}
                  disabled={isUploadingImage}
                />
              </label>
              <StatusChip label={menuImageStatus.label} tone={menuImageStatus.tone} />
              <p className="text-xs text-[#6B7280]">Uploads use Supabase Storage bucket "menu-images". JPG, PNG, or WebP under 5 MB.</p>
              {draft.imageUrl ? <Image src={draft.imageUrl} alt={draft.name || 'menu image'} className="h-14 w-14 rounded object-cover border" /> : null}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleSaveMenuItem}>
                {draft.id ? 'Update' : 'Save'}
              </Button>
              <Button variant="outline" onClick={handleCloseMenuItemModal}>
                Discard
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
