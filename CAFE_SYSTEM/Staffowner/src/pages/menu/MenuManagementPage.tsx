import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Image, StatusChip } from '@/components/ui';
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
  discount: 0,
  isAvailable: true,
  imageUrl: null,
  createdAt: '',
  updatedAt: '',
});

const defaultCategoryDraft: MenuCategory = { id: '', name: '', description: null, sortOrder: 0, isActive: true };

type DiscountMode = 'amount' | 'percent';
type BulkScope = 'all' | 'specific';

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

const getDiscountFromMode = (price: number, inputValue: number, mode: DiscountMode) => {
  const safePrice = normalizeAmount(price);
  if (safePrice <= 0) return 0;

  if (mode === 'percent') {
    const percent = normalizePercent(inputValue);
    return roundCurrency(Math.min(safePrice, (safePrice * percent) / 100));
  }

  return roundCurrency(Math.min(safePrice, normalizeAmount(inputValue)));
};

const hasValidImageUrl = (value: string | null | undefined) => {
  const text = asTrimmed(value);
  if (!text) return true;
  if (text.startsWith('data:image/')) return true;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const validateMenuItemDraft = (draft: MenuItem) => {
  if (!asTrimmed(draft.name)) return 'Menu item name is required.';
  if (!asTrimmed(draft.categoryId)) return 'Category is required.';
  if (!Number.isFinite(draft.price) || draft.price < 0) return 'Price must be zero or higher.';
  if (!Number.isFinite(draft.discount) || draft.discount < 0) return 'Discount must be zero or higher.';
  if (draft.price > 0 && draft.discount > draft.price) return 'Discount cannot be greater than price.';
  if (!hasValidImageUrl(draft.imageUrl)) return 'Image URL must be http(s) or a valid image data URL.';
  return '';
};

export const MenuManagementPage = () => {
  const { categories, loading: categoriesLoading, error: categoriesError, saveCategory, deleteCategory } = useMenuCategories();
  const { items, loading: itemsLoading, error: itemsError, saveItem, deleteItem } = useMenuItems();
  const [categoryDraft, setCategoryDraft] = useState<MenuCategory>(defaultCategoryDraft);
  const [draft, setDraft] = useState<MenuItem>(() => createDefaultMenuItemDraft());
  const [draftPriceInput, setDraftPriceInput] = useState('');
  const [query, setQuery] = useState('');
  const [menuItemError, setMenuItemError] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isMenuItemModalOpen, setIsMenuItemModalOpen] = useState(false);
  const [bulkDiscountMode, setBulkDiscountMode] = useState<DiscountMode>('amount');
  const [bulkDiscountInput, setBulkDiscountInput] = useState('0');
  const [bulkScope, setBulkScope] = useState<BulkScope>('all');
  const [bulkItemQuery, setBulkItemQuery] = useState('');
  const [selectedBulkItemIds, setSelectedBulkItemIds] = useState<string[]>([]);
  const [isApplyingBulkDiscount, setIsApplyingBulkDiscount] = useState(false);

  const filtered = useMemo(() => items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())), [items, query]);
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
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  useEffect(() => {
    setSelectedBulkItemIds((current) => current.filter((id) => items.some((item) => item.id === id)));
  }, [items]);

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
    setDraftPriceInput('');
    setMenuItemError('');
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
      discount: Math.min(normalizeAmount(current.discount), nextPrice),
    }));
  };

  const handleDraftPriceBlur = () => {
    if (!draftPriceInput) {
      setDraft((current) => ({
        ...current,
        price: 0,
        discount: Math.min(normalizeAmount(current.discount), 0),
      }));
      return;
    }

    const normalized = normalizeAmount(draftPriceInput);
    setDraftPriceInput(formatPriceInput(normalized));
    setDraft((current) => ({
      ...current,
      price: normalized,
      discount: Math.min(normalizeAmount(current.discount), normalized),
    }));
  };

  const handleSaveMenuItem = async () => {
    const preparedDraft: MenuItem = {
      ...draft,
      price: normalizeAmount(draft.price),
      discount: Math.min(normalizeAmount(draft.discount), normalizeAmount(draft.price)),
    };

    const validationError = validateMenuItemDraft(preparedDraft);
    if (validationError) {
      setMenuItemError(validationError);
      toast.error(validationError);
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
      toast.success(draft.id ? 'Menu item updated.' : 'Menu item created.');
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

  const handleSaveCategory = async () => {
    const name = asTrimmed(categoryDraft.name);
    const description = asTrimmed(categoryDraft.description) || null;
    if (!name) {
      toast.error('Category name is required.');
      return;
    }

    try {
      const saved = await saveCategory({ ...categoryDraft, name, description });
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
    setDraftPriceInput(formatPriceInput(normalizedPrice));
    setMenuItemError('');
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

    const updates = targetItems
      .map((item) => {
        const nextDiscount = getDiscountFromMode(item.price, inputValue, bulkDiscountMode);
        return {
          ...item,
          discount: nextDiscount,
          hasChanged: Math.abs(nextDiscount - normalizeAmount(item.discount)) >= 0.005,
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

    const updates = targetItems.filter((item) => normalizeAmount(item.discount) > 0).map((item) => ({ ...item, discount: 0 }));

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

  const bulkPreviewLabel =
    bulkDiscountMode === 'percent'
      ? `${normalizePercent(asNumberOrZero(bulkDiscountInput))}% off`
      : `${formatCurrency(normalizeAmount(asNumberOrZero(bulkDiscountInput)))} off`;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Manage Menu Items</h2>
        <p className="text-sm text-[#6B7280]">Add, edit, and validate menu items with optional image upload support.</p>
        {categoriesLoading ? <p className="text-sm text-[#6B7280]">Loading categories...</p> : null}
        {categoriesError ? <p className="text-sm text-red-600">{categoriesError}</p> : null}

        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Menu Item Editor</h3>
          <button className="border rounded px-3 py-1 text-sm" onClick={handleOpenCreateMenuItemModal}>
            Add New Menu Item
          </button>
        </div>
        <p className="text-xs text-[#6B7280]">Use the popup editor for adding or updating menu items.</p>

        <div className="rounded border border-dashed p-3 space-y-3">
          <h4 className="font-medium text-sm">Apply Discount</h4>
          <div className="grid md:grid-cols-4 gap-3">
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
            <div className="rounded border p-3 space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  className="border rounded px-2 py-1 text-sm min-w-[220px]"
                  placeholder="Filter items by name"
                  value={bulkItemQuery}
                  onChange={(event) => setBulkItemQuery(event.target.value)}
                />
                <button className="border rounded px-2 py-1 text-sm" type="button" onClick={selectAllVisibleBulkItems}>
                  Select Visible
                </button>
                <button className="border rounded px-2 py-1 text-sm" type="button" onClick={clearBulkSelection}>
                  Clear Selection
                </button>
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
            <button className="border rounded px-3 py-1" onClick={handleApplyBulkDiscount} disabled={isApplyingBulkDiscount}>
              {isApplyingBulkDiscount ? 'Applying...' : bulkScope === 'all' ? 'Apply To All Items' : 'Apply To Selected Items'}
            </button>
            <button className="border rounded px-3 py-1" onClick={handleClearAllDiscounts} disabled={isApplyingBulkDiscount}>
              {bulkScope === 'all' ? 'Clear All Discounts' : 'Clear Selected Discounts'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h3 className="font-medium">Manage Categories</h3>
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
        </div>
        <div className="flex gap-2">
          <button className="border rounded px-3 py-1" onClick={handleSaveCategory}>
            Save Category
          </button>
          {categoryDraft.id ? (
            <button className="border rounded px-3 py-1" onClick={() => setCategoryDraft(defaultCategoryDraft)}>
              Cancel Edit
            </button>
          ) : null}
        </div>
        <div className="space-y-2">
          {categories.map((category) => (
            <div key={category.id} className="border rounded p-2 text-sm flex items-center justify-between">
              <div>
                <p>
                  {category.sortOrder} - {category.name} {category.isActive ? '' : '(inactive)'}
                </p>
                {asTrimmed(category.description) ? <p className="text-xs text-[#6B7280]">{category.description}</p> : null}
              </div>
              <div className="flex gap-2">
                <button className="border rounded px-2 py-1" onClick={() => setCategoryDraft(category)}>
                  Edit
                </button>
                <button className="border rounded px-2 py-1" onClick={() => handleDeleteCategory(category.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Manage Menu Items</h3>
          <input className="border rounded px-2 py-1 text-sm" placeholder="Search item name" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="border rounded p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex-1 min-w-[260px]">
                <p className="font-medium">
                  {item.name} - {formatCurrency(Math.max(item.price - item.discount, 0))}
                  {item.discount > 0 ? <span className="text-[#6B7280]"> (was {formatCurrency(item.price)})</span> : null}
                </p>
                <p className="text-[#6B7280]">
                  Category: {categoryById.get(item.categoryId) ?? (item.categoryId || 'uncategorized')} - Updated:{' '}
                  {new Date(item.updatedAt).toLocaleString()}
                </p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <StatusChip label={item.isAvailable ? 'Available' : 'Unavailable'} tone={item.isAvailable ? 'success' : 'warning'} />
                  <StatusChip label={item.discount > 0 ? `${formatCurrency(item.discount)} off` : 'No discount'} tone={item.discount > 0 ? 'warning' : 'neutral'} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <button className="border rounded px-2 py-1" onClick={() => handleEditMenuItem(item)}>
                  Edit
                </button>
                <button className="border rounded px-2 py-1" onClick={() => handleDeleteMenuItem(item.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {isMenuItemModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/40" onClick={handleCloseMenuItemModal} aria-label="Close menu item editor overlay" />
          <div className="relative w-full max-w-4xl rounded-lg border bg-white p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-medium">{draft.id ? `Edit Menu Item: ${draft.name}` : 'Add New Menu Item'}</h4>
              <button className="border rounded px-2 py-1 text-sm" onClick={handleCloseMenuItemModal} aria-label="Close menu item editor">
                Close
              </button>
            </div>

            {menuItemError ? <p className="text-sm text-red-600">{menuItemError}</p> : null}

            <div className="grid md:grid-cols-2 gap-3">
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
                Availability
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.isAvailable} onChange={(event) => setDraft({ ...draft, isAvailable: event.target.checked })} />
                  <span>{draft.isAvailable ? 'Available' : 'Unavailable'}</span>
                </div>
              </label>
              <label className="text-sm md:col-span-2">
                Description
                <input
                  className="block border rounded mt-1 px-2 py-1 w-full"
                  value={draft.description ?? ''}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <label className="text-sm md:col-span-2">
                Image URL (optional)
                <input
                  className="block border rounded mt-1 px-2 py-1 w-full"
                  placeholder="https://..."
                  value={draft.imageUrl ?? ''}
                  onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
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
              <p className="text-xs text-[#6B7280]">{isUploadingImage ? 'Uploading image...' : 'Uploads use Supabase Storage bucket "menu-images".'}</p>
              {draft.imageUrl ? <Image src={draft.imageUrl} alt={draft.name || 'menu image'} className="h-14 w-14 rounded object-cover border" /> : null}
            </div>

            <div className="flex gap-2">
              <button className="border rounded px-3 py-1" onClick={handleSaveMenuItem}>
                {draft.id ? 'Update Menu Item' : 'Add New Menu Item'}
              </button>
              <button className="border rounded px-3 py-1" onClick={handleCloseMenuItemModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
