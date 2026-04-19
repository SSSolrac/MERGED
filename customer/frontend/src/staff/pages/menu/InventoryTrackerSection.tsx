import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StatusChip } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { useInventory } from '@/hooks/useInventory';
import type { InventoryCategory, InventoryItem } from '@/types/inventory';

const inventoryUnits = ['pcs', 'pack', 'packs', 'orders', 'bottle', 'bottles', 'roll', 'rolls', 'jar', 'can', 'liters'];

const asTrimmed = (value: string | null | undefined) => String(value ?? '').trim();

const parseQuantityText = (value: string): number | null => {
  const normalized = asTrimmed(value).replace(',', '');
  if (!normalized) return null;

  // Accept friendly mixed-fraction input variants such as:
  // "1 1/4", "1 1 / 4", "1\\u00bc", and plain decimals like "1.25".
  const canonical = normalized
    .replace(/\u00bc/g, '1/4')
    .replace(/\u00bd/g, '1/2')
    .replace(/\u00be/g, '3/4')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ');

  if (/^-?\d+(\.\d+)?$/.test(canonical)) {
    const direct = Number(canonical);
    return Number.isFinite(direct) ? direct : null;
  }

  const mixedFraction = canonical.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFraction) {
    const whole = Number(mixedFraction[1]);
    const numerator = Number(mixedFraction[2]);
    const denominator = Number(mixedFraction[3]);
    if (!denominator) return null;
    const valueFromMixed = whole >= 0 ? whole + numerator / denominator : whole - numerator / denominator;
    return Number.isFinite(valueFromMixed) ? valueFromMixed : null;
  }

  const fraction = canonical.match(/^(-?\d+)\/(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!denominator) return null;
    const valueFromFraction = numerator / denominator;
    return Number.isFinite(valueFromFraction) ? valueFromFraction : null;
  }

  return null;
};

const formatQuantityText = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
};

const formatMetricText = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

const createCategoryDraft = (): InventoryCategory => ({
  id: '',
  name: '',
  sortOrder: 0,
  isActive: true,
  createdAt: '',
  updatedAt: '',
});

const createItemDraft = (categoryId = ''): InventoryItem => ({
  id: '',
  code: '',
  categoryId,
  name: '',
  unit: 'pcs',
  quantityOnHand: 0,
  reorderLevel: 0,
  displayQuantity: '0',
  notes: null,
  isActive: true,
  createdAt: '',
  updatedAt: '',
});

const getItemStatus = (item: InventoryItem) => {
  if (item.quantityOnHand <= 0) {
    return { label: 'Out of stock', tone: 'danger' as const };
  }
  if (item.reorderLevel > 0 && item.quantityOnHand <= item.reorderLevel) {
    return { label: 'Low stock', tone: 'warning' as const };
  }
  return { label: 'In stock', tone: 'success' as const };
};

export const InventoryTrackerSection = () => {
  const { categories, items, loading, error, saveCategory, deleteCategory, saveItem, deleteItem } = useInventory();
  const [categoryDraft, setCategoryDraft] = useState<InventoryCategory>(createCategoryDraft);
  const [itemDraft, setItemDraft] = useState<InventoryItem>(createItemDraft);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const itemCountByCategoryId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    const lowered = query.toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
      if (!lowered) return true;
      const categoryName = categoryNameById.get(item.categoryId) ?? '';
      const haystack = `${item.name} ${categoryName} ${item.unit} ${item.notes ?? ''}`.toLowerCase();
      return haystack.includes(lowered);
    });
  }, [items, query, categoryFilter, categoryNameById]);

  const groupedItems = useMemo(() => {
    const grouped = new Map<string, InventoryItem[]>();
    for (const item of filteredItems) {
      if (!grouped.has(item.categoryId)) grouped.set(item.categoryId, []);
      grouped.get(item.categoryId)?.push(item);
    }
    return grouped;
  }, [filteredItems]);

  const inventorySummary = useMemo(() => {
    const totalCategories = categories.length;
    const totalProducts = items.length;
    const totalStockUnits = items.reduce((sum, item) => sum + item.quantityOnHand, 0);
    const lowStockItems = items.filter((item) => item.quantityOnHand > 0 && item.quantityOnHand <= item.reorderLevel).length;

    return {
      totalCategories,
      totalProducts,
      totalStockUnits,
      lowStockItems,
    };
  }, [categories, items]);

  const inventoryTabs = useMemo(
    () => [
      {
        id: 'all',
        label: 'All Items',
        description: `${items.length} item${items.length === 1 ? '' : 's'} in inventory`,
      },
      ...categories.map((category) => {
        const count = itemCountByCategoryId.get(category.id) ?? 0;
        return {
          id: category.id,
          label: category.name,
          description: `${count} item${count === 1 ? '' : 's'}${category.isActive ? '' : ' - inactive'}`,
        };
      }),
    ],
    [categories, itemCountByCategoryId, items.length]
  );

  const handleSaveCategory = async () => {
    const name = asTrimmed(categoryDraft.name);
    if (!name) {
      toast.error('Inventory category name is required.');
      return;
    }

    try {
      const saved = await saveCategory({ ...categoryDraft, name });
      setCategoryDraft(createCategoryDraft());
      toast.success(`Inventory category saved (${saved.name}).`);
      if (!itemDraft.categoryId) {
        setItemDraft((current) => ({ ...current, categoryId: saved.id }));
      }
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to save inventory category.'));
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await deleteCategory(categoryId);
      toast.info('Inventory category removed.');
      if (itemDraft.categoryId === categoryId) {
        setItemDraft((current) => ({ ...current, categoryId: '' }));
      }
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, 'Unable to remove inventory category.'));
    }
  };

  const handleSaveItem = async () => {
    const name = asTrimmed(itemDraft.name);
    if (!name) {
      toast.error('Inventory item name is required.');
      return;
    }
    if (!asTrimmed(itemDraft.categoryId)) {
      toast.error('Inventory category is required.');
      return;
    }

    const displayQuantity = asTrimmed(itemDraft.displayQuantity) || formatQuantityText(itemDraft.quantityOnHand);
    const parsedQuantity = parseQuantityText(displayQuantity);
    if (parsedQuantity == null || parsedQuantity < 0) {
      toast.error('Quantity must be a valid number or fraction.');
      return;
    }

    const reorderLevel = Number(itemDraft.reorderLevel);
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      toast.error('Reorder level must be zero or higher.');
      return;
    }

    try {
      const saved = await saveItem({
        ...itemDraft,
        name,
        unit: asTrimmed(itemDraft.unit) || 'pcs',
        quantityOnHand: parsedQuantity,
        displayQuantity,
        notes: asTrimmed(itemDraft.notes) || null,
        reorderLevel,
      });
      toast.success(`Inventory item saved (${saved.name}).`);
      setItemDraft(createItemDraft(saved.categoryId));
      setIsItemModalOpen(false);
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to save inventory item.'));
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteItem(itemId);
      toast.info('Inventory item removed.');
      if (itemDraft.id === itemId) {
        setItemDraft(createItemDraft());
      }
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, 'Unable to remove inventory item.'));
    }
  };

  const handleEditItem = (item: InventoryItem) => {
    setItemDraft({
      ...item,
      displayQuantity: asTrimmed(item.displayQuantity) || formatQuantityText(item.quantityOnHand),
      notes: item.notes ?? '',
    });
    setIsItemModalOpen(true);
  };

  const handleOpenCreateItemModal = () => {
    setItemDraft(createItemDraft(categories[0]?.id ?? ''));
    setIsItemModalOpen(true);
  };

  const handleCloseItemModal = () => {
    setIsItemModalOpen(false);
    setItemDraft(createItemDraft());
  };

  useEffect(() => {
    if (!isItemModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseItemModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isItemModalOpen]);

  useEffect(() => {
    if (categoryFilter === 'all') return;
    if (!categories.some((category) => category.id === categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [categories, categoryFilter]);

  const handleAdjustStock = async (item: InventoryItem, delta: number) => {
    const nextQuantity = Math.max(0, item.quantityOnHand + delta);
    try {
      await saveItem({
        ...item,
        quantityOnHand: nextQuantity,
        displayQuantity: formatQuantityText(nextQuantity),
      });
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to update stock quantity.'));
    }
  };

  return (
    <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold text-[#2B7A87]">Inventory</p>
      <h3 className="text-2xl font-semibold leading-tight">Inventory</h3>
      <p className="text-sm text-[#6B7280]">Track inventory by category, monitor low stock, and update quantities quickly.</p>
      {loading ? <p className="text-sm text-[#6B7280]">Loading inventory tracker...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold text-[#6B7280]">Total Categories</p>
          <p className="mt-1 text-3xl font-bold leading-none text-[#1F2937]">{formatMetricText(inventorySummary.totalCategories)}</p>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold text-[#6B7280]">Total Products</p>
          <p className="mt-1 text-3xl font-bold leading-none text-[#1F2937]">{formatMetricText(inventorySummary.totalProducts)}</p>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold text-[#6B7280]">Total Stock Units</p>
          <p className="mt-1 text-3xl font-bold leading-none text-[#1F2937]">{formatMetricText(inventorySummary.totalStockUnits)}</p>
        </div>
        <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold text-[#6B7280]">Low Stock Items</p>
          <p className="mt-1 text-3xl font-bold leading-none text-[#1F2937]">{formatMetricText(inventorySummary.lowStockItems)}</p>
        </div>
      </div>

      {inventoryTabs.length > 1 ? (
        <div className="space-y-2">
          <div>
            <h4 className="font-medium">Inventory Categories</h4>
            <p className="text-sm text-[#6B7280]">Browse one stock group at a time.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {inventoryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`min-w-[160px] rounded border px-3 py-2 text-left text-sm ${
                  categoryFilter === tab.id ? 'border-[#F3B8C8] bg-[#FFE4E8] text-[#C94F7C]' : 'bg-white text-[#4B5563]'
                }`}
                onClick={() => setCategoryFilter(tab.id)}
              >
                <span className="block font-medium">{tab.label}</span>
                <span className="block text-xs text-[#6B7280]">{tab.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border rounded p-3 space-y-2">
        <h4 className="font-medium">Manage Inventory Categories</h4>
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
            <input
              type="checkbox"
              checked={categoryDraft.isActive}
              onChange={(event) => setCategoryDraft({ ...categoryDraft, isActive: event.target.checked })}
            />
            Active
          </label>
        </div>
        <div className="flex gap-2">
          <button className="border rounded px-3 py-1" onClick={handleSaveCategory}>
            Save Category
          </button>
          {categoryDraft.id ? (
            <button className="border rounded px-3 py-1" onClick={() => setCategoryDraft(createCategoryDraft())}>
              Cancel Edit
            </button>
          ) : null}
        </div>
        <div className="space-y-2">
          {categories.map((category) => (
            <div key={category.id} className="border rounded p-2 text-sm flex items-center justify-between">
              <p>
                {category.sortOrder} - {category.name} {category.isActive ? '' : '(inactive)'}
              </p>
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
      </div>

      <div className="border rounded p-3 space-y-3">
        <div className="grid md:grid-cols-[2fr_auto] gap-2">
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="Search inventory item"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="border rounded px-3 py-1 text-sm" onClick={handleOpenCreateItemModal}>
            Add Inventory Item
          </button>
        </div>

        <div className="space-y-3">
          {categories.map((category) => {
            const rows = groupedItems.get(category.id) ?? [];
            if (!rows.length) return null;
            return (
              <div key={category.id} className="space-y-2">
                <h5 className="font-medium text-sm">
                  {category.name} ({rows.length})
                </h5>
                {rows.map((item) => {
                  const status = getItemStatus(item);
                  return (
                    <div key={item.id} className="border rounded p-2 text-sm flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {item.name}
                        </p>
                        <p className="text-[#6B7280]">
                          {item.displayQuantity || formatQuantityText(item.quantityOnHand)} {item.unit} on hand, reorder {item.reorderLevel}
                        </p>
                        {item.notes ? <p className="text-[#6B7280]">{item.notes}</p> : null}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusChip label={status.label} tone={status.tone} />
                        <button className="border rounded px-2 py-1" onClick={() => handleAdjustStock(item, -1)}>
                          -1
                        </button>
                        <button className="border rounded px-2 py-1" onClick={() => handleAdjustStock(item, 1)}>
                          +1
                        </button>
                        <button className="border rounded px-2 py-1" onClick={() => handleEditItem(item)}>
                          Edit
                        </button>
                        <button className="border rounded px-2 py-1" onClick={() => handleDeleteItem(item.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {!filteredItems.length ? <p className="text-sm text-[#6B7280]">No inventory items matched your filter.</p> : null}
        </div>
      </div>

      {isItemModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={handleCloseItemModal} />
          <div className="relative w-full max-w-5xl rounded-lg border bg-white p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-medium">{itemDraft.id ? `Edit Inventory Item: ${itemDraft.name}` : 'Add Inventory Item'}</h4>
              <button className="border rounded px-2 py-1 text-sm" onClick={handleCloseItemModal} aria-label="Close inventory item editor">
                Close
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-2">
              <input
                className="border rounded px-2 py-1"
                placeholder="Item name"
                value={itemDraft.name}
                onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })}
              />
              <select
                className="border rounded px-2 py-1"
                value={itemDraft.categoryId}
                onChange={(event) => setItemDraft({ ...itemDraft, categoryId: event.target.value })}
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                className="border rounded px-2 py-1"
                value={itemDraft.unit}
                onChange={(event) => setItemDraft({ ...itemDraft, unit: event.target.value })}
              >
                {inventoryUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              <input
                className="border rounded px-2 py-1"
                placeholder="Quantity (example: 3/4, 2, 2 1/2)"
                value={itemDraft.displayQuantity ?? ''}
                onChange={(event) => setItemDraft({ ...itemDraft, displayQuantity: event.target.value })}
              />
              <input
                className="border rounded px-2 py-1"
                type="number"
                min={0}
                step="0.001"
                placeholder="Reorder level"
                value={itemDraft.reorderLevel}
                onChange={(event) => setItemDraft({ ...itemDraft, reorderLevel: Number(event.target.value) })}
              />
              <input
                className="border rounded px-2 py-1 md:col-span-2"
                placeholder="Notes (optional, e.g. bawas na)"
                value={itemDraft.notes ?? ''}
                onChange={(event) => setItemDraft({ ...itemDraft, notes: event.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={itemDraft.isActive}
                  onChange={(event) => setItemDraft({ ...itemDraft, isActive: event.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="flex gap-2">
              <button className="border rounded px-3 py-1" onClick={handleSaveItem}>
                {itemDraft.id ? 'Update Inventory Item' : 'Save Inventory Item'}
              </button>
              <button className="border rounded px-3 py-1" onClick={handleCloseItemModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};
