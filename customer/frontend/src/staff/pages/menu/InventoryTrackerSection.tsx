import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, EmptyState, PaginationControls, SectionCard, StatusChip } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { useInventory } from '@/hooks/useInventory';
import type { InventoryCategory, InventoryItem, InventoryItemType, InventoryMovement, InventoryMovementType, InventoryRecipeLine } from '@/types/inventory';

const inventoryUnits = ['pcs', 'pack', 'packs', 'orders', 'bottle', 'bottles', 'roll', 'rolls', 'jar', 'can', 'liters', 'g', 'kg', 'ml', 'l'];
const PAGE_SIZE = 10;

const asTrimmed = (value: string | null | undefined) => String(value ?? '').trim();

const parseQuantityText = (value: string): number | null => {
  const normalized = asTrimmed(value).replace(',', '');
  if (!normalized) return null;

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

const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;

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

const createItemDraft = (params: { categoryId?: string; itemType?: InventoryItemType } = {}): InventoryItem => ({
  id: '',
  code: '',
  categoryId: params.categoryId ?? '',
  name: '',
  unit: 'pcs',
  quantityOnHand: 0,
  reorderLevel: 0,
  displayQuantity: '0',
  notes: null,
  itemType: params.itemType ?? 'raw_material',
  recipeYieldQuantity: 1,
  isActive: true,
  createdAt: '',
  updatedAt: '',
});

const createRecipeDraft = (finishedItemId = '', rawItemId = '') => ({
  finishedItemId,
  rawItemId,
  quantityRequired: '1',
});

const createAdjustmentDraft = () => ({
  itemId: '',
  movementType: 'stock_in' as Exclude<InventoryMovementType, 'production'>,
  quantity: '1',
  reason: '',
});

const createProductionDraft = (finishedItemId = '') => ({
  finishedItemId,
  quantity: '1',
  reason: '',
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

const movementLabel = (movementType: InventoryMovementType) => {
  if (movementType === 'stock_in') return 'Stock-in';
  if (movementType === 'stock_out') return 'Stock-out';
  if (movementType === 'waste') return 'Waste';
  return 'Production';
};

const movementTone = (movement: InventoryMovement) => {
  if (movement.movementType === 'waste' || movement.quantityDelta < 0) return 'warning' as const;
  if (movement.movementType === 'production') return 'info' as const;
  return 'success' as const;
};

export const InventoryTrackerSection = () => {
  const {
    categories,
    items,
    recipeLines,
    movements,
    loading,
    error,
    saveCategory,
    deleteCategory,
    saveItem,
    deleteItem,
    saveRecipeLine,
    deleteRecipeLine,
    adjustStock,
    produceFinishedProduct,
  } = useInventory();
  const [categoryDraft, setCategoryDraft] = useState<InventoryCategory>(createCategoryDraft);
  const [itemDraft, setItemDraft] = useState<InventoryItem>(createItemDraft);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeView, setActiveView] = useState<'raw' | 'finished' | 'waste'>('raw');
  const [rawPage, setRawPage] = useState(1);
  const [finishedPage, setFinishedPage] = useState(1);
  const [recipeDraft, setRecipeDraft] = useState(createRecipeDraft);
  const [adjustmentDraft, setAdjustmentDraft] = useState(createAdjustmentDraft);
  const [productionDraft, setProductionDraft] = useState(createProductionDraft);
  const [lastConfirmation, setLastConfirmation] = useState('');

  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const rawMaterials = useMemo(() => items.filter((item) => item.itemType !== 'finished_product'), [items]);
  const finishedProducts = useMemo(() => items.filter((item) => item.itemType === 'finished_product'), [items]);

  const itemCountByCategoryId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const filterItems = (source: InventoryItem[]) => {
    const lowered = query.toLowerCase();
    return source.filter((item) => {
      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
      if (!lowered) return true;
      const categoryName = categoryNameById.get(item.categoryId) ?? '';
      const haystack = `${item.name} ${categoryName} ${item.unit} ${item.notes ?? ''}`.toLowerCase();
      return haystack.includes(lowered);
    });
  };

  const filteredRawMaterials = useMemo(() => filterItems(rawMaterials), [categoryFilter, categoryNameById, query, rawMaterials]);
  const filteredFinishedProducts = useMemo(() => filterItems(finishedProducts), [categoryFilter, categoryNameById, query, finishedProducts]);
  const rawTotalPages = Math.max(1, Math.ceil(filteredRawMaterials.length / PAGE_SIZE));
  const finishedTotalPages = Math.max(1, Math.ceil(filteredFinishedProducts.length / PAGE_SIZE));
  const visibleRawMaterials = useMemo(() => filteredRawMaterials.slice((rawPage - 1) * PAGE_SIZE, rawPage * PAGE_SIZE), [filteredRawMaterials, rawPage]);
  const visibleFinishedProducts = useMemo(
    () => filteredFinishedProducts.slice((finishedPage - 1) * PAGE_SIZE, finishedPage * PAGE_SIZE),
    [filteredFinishedProducts, finishedPage],
  );
  const wasteMovements = useMemo(() => movements.filter((movement) => movement.movementType === 'waste'), [movements]);

  const inventorySummary = useMemo(() => {
    const lowStockItems = items.filter((item) => item.quantityOnHand > 0 && item.quantityOnHand <= item.reorderLevel).length;
    const totalStockUnits = items.reduce((sum, item) => sum + item.quantityOnHand, 0);
    return {
      rawMaterials: rawMaterials.length,
      finishedProducts: finishedProducts.length,
      wasteRecords: wasteMovements.length,
      lowStockItems,
      totalStockUnits,
    };
  }, [finishedProducts.length, items, rawMaterials.length, wasteMovements.length]);

  const inventoryTabs = useMemo(
    () => [
      {
        id: 'all',
        label: 'All categories',
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
    [categories, itemCountByCategoryId, items.length],
  );

  const selectedFinishedProduct = productionDraft.finishedItemId ? itemById.get(productionDraft.finishedItemId) : finishedProducts[0] ?? null;
  const selectedRecipeLines = selectedFinishedProduct ? recipeLines.filter((line) => line.finishedItemId === selectedFinishedProduct.id) : [];
  const productionQuantity = parseQuantityText(productionDraft.quantity) ?? 0;

  useEffect(() => {
    setRawPage(1);
    setFinishedPage(1);
  }, [query, categoryFilter]);

  useEffect(() => {
    setRawPage((page) => Math.min(page, rawTotalPages));
  }, [rawTotalPages]);

  useEffect(() => {
    setFinishedPage((page) => Math.min(page, finishedTotalPages));
  }, [finishedTotalPages]);

  useEffect(() => {
    if (categoryFilter === 'all') return;
    if (!categories.some((category) => category.id === categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [categories, categoryFilter]);

  useEffect(() => {
    if (!finishedProducts.length) return;
    setProductionDraft((current) => (current.finishedItemId ? current : { ...current, finishedItemId: finishedProducts[0].id }));
    setRecipeDraft((current) => (current.finishedItemId ? current : { ...current, finishedItemId: finishedProducts[0].id }));
  }, [finishedProducts]);

  useEffect(() => {
    if (!rawMaterials.length) return;
    setRecipeDraft((current) => (current.rawItemId ? current : { ...current, rawItemId: rawMaterials[0].id }));
  }, [rawMaterials]);

  useEffect(() => {
    if (!isItemModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsItemModalOpen(false);
        setItemDraft(createItemDraft());
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isItemModalOpen]);

  const handleSaveCategory = async () => {
    const name = asTrimmed(categoryDraft.name);
    if (!name) {
      toast.error('Inventory category name is required.');
      return;
    }
    if (!Number.isFinite(categoryDraft.sortOrder)) {
      toast.error('Sort order must be a valid number.');
      return;
    }

    try {
      const saved = await saveCategory({ ...categoryDraft, name });
      setCategoryDraft(createCategoryDraft());
      setLastConfirmation(`Category saved: ${saved.name}`);
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
      toast.error('Quantity must be zero or higher.');
      return;
    }

    const reorderLevel = Number(itemDraft.reorderLevel);
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      toast.error('Reorder level must be zero or higher.');
      return;
    }

    const recipeYieldQuantity = Number(itemDraft.recipeYieldQuantity);
    if (!Number.isFinite(recipeYieldQuantity) || recipeYieldQuantity <= 0) {
      toast.error('Recipe yield must be greater than zero.');
      return;
    }

    try {
      const saved = await saveItem({
        ...itemDraft,
        name,
        unit: asTrimmed(itemDraft.unit) || 'pcs',
        quantityOnHand: roundQuantity(parsedQuantity),
        displayQuantity,
        notes: asTrimmed(itemDraft.notes) || null,
        reorderLevel,
        recipeYieldQuantity,
      });
      setLastConfirmation(`${saved.name} saved with ${formatQuantityText(saved.quantityOnHand)} ${saved.unit} on hand.`);
      toast.success(`Inventory item saved (${saved.name}).`);
      setItemDraft(createItemDraft({ categoryId: saved.categoryId, itemType: saved.itemType }));
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
      recipeYieldQuantity: item.recipeYieldQuantity || 1,
    });
    setIsItemModalOpen(true);
  };

  const handleOpenCreateItemModal = (itemType: InventoryItemType) => {
    setItemDraft(createItemDraft({ categoryId: categories[0]?.id ?? '', itemType }));
    setIsItemModalOpen(true);
  };

  const handleCloseItemModal = () => {
    setIsItemModalOpen(false);
    setItemDraft(createItemDraft());
  };

  const handleSaveRecipeLine = async () => {
    const quantity = parseQuantityText(recipeDraft.quantityRequired);
    if (!recipeDraft.finishedItemId) {
      toast.error('Select a finished product first.');
      return;
    }
    if (!recipeDraft.rawItemId) {
      toast.error('Select a raw material first.');
      return;
    }
    if (recipeDraft.finishedItemId === recipeDraft.rawItemId) {
      toast.error('A finished product cannot use itself as a raw material.');
      return;
    }
    if (quantity == null || quantity <= 0) {
      toast.error('Raw material quantity must be greater than zero.');
      return;
    }

    try {
      const rawItem = itemById.get(recipeDraft.rawItemId);
      await saveRecipeLine({
        id: '',
        finishedItemId: recipeDraft.finishedItemId,
        rawItemId: recipeDraft.rawItemId,
        quantityRequired: roundQuantity(quantity),
        unit: rawItem?.unit ?? null,
        createdAt: '',
        updatedAt: '',
      });
      setRecipeDraft((current) => ({ ...current, quantityRequired: '1' }));
      toast.success('Recipe line saved.');
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, 'Unable to save recipe line.'));
    }
  };

  const handleAdjustStock = async () => {
    const item = itemById.get(adjustmentDraft.itemId);
    const quantity = parseQuantityText(adjustmentDraft.quantity);
    if (!item) {
      toast.error('Select an inventory item first.');
      return;
    }
    if (quantity == null || quantity <= 0) {
      toast.error('Stock adjustment quantity must be greater than zero.');
      return;
    }
    if (adjustmentDraft.movementType === 'waste' && !asTrimmed(adjustmentDraft.reason)) {
      toast.error('Waste reason is required.');
      return;
    }

    try {
      const saved = await adjustStock({
        item,
        movementType: adjustmentDraft.movementType,
        quantity: roundQuantity(quantity),
        reason: adjustmentDraft.reason,
      });
      const label = movementLabel(adjustmentDraft.movementType);
      const message = `${label} recorded for ${saved.name}. New stock: ${formatQuantityText(saved.quantityOnHand)} ${saved.unit}.`;
      setLastConfirmation(message);
      toast.success(message);
      setAdjustmentDraft(createAdjustmentDraft());
    } catch (adjustError) {
      toast.error(getErrorMessage(adjustError, 'Unable to adjust stock.'));
    }
  };

  const handleProduce = async () => {
    const finishedItem = selectedFinishedProduct;
    const quantity = parseQuantityText(productionDraft.quantity);
    if (!finishedItem) {
      toast.error('Select a finished product first.');
      return;
    }
    if (quantity == null || quantity <= 0) {
      toast.error('Production quantity must be greater than zero.');
      return;
    }

    try {
      await produceFinishedProduct({
        finishedItem,
        quantity: roundQuantity(quantity),
        reason: productionDraft.reason,
      });
      const message = `Produced ${formatQuantityText(quantity)} ${finishedItem.unit} of ${finishedItem.name}. Raw materials were deducted automatically.`;
      setLastConfirmation(message);
      toast.success(message);
      setProductionDraft((current) => ({ ...current, quantity: '1', reason: '' }));
    } catch (produceError) {
      toast.error(getErrorMessage(produceError, 'Unable to produce finished product.'));
    }
  };

  const renderItemRows = (rows: InventoryItem[]) => (
    <div className="space-y-2">
      {rows.map((item) => {
        const status = getItemStatus(item);
        return (
          <div key={item.id} className="grid gap-3 rounded-lg border p-3 text-sm md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{item.name}</p>
                <StatusChip label={item.itemType === 'finished_product' ? 'Finished product' : 'Raw material'} tone={item.itemType === 'finished_product' ? 'info' : 'neutral'} />
                <StatusChip label={status.label} tone={status.tone} />
              </div>
              <p className="text-[#6B7280]">{categoryNameById.get(item.categoryId) ?? 'Uncategorized'}</p>
              {item.notes ? <p className="text-[#6B7280]">{item.notes}</p> : null}
            </div>
            <div>
              <p className="font-medium">
                {item.displayQuantity || formatQuantityText(item.quantityOnHand)} {item.unit} on hand
              </p>
              <p className="text-[#6B7280]">Reorder at {formatQuantityText(item.reorderLevel)} {item.unit}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdjustmentDraft({ itemId: item.id, movementType: 'stock_in', quantity: '1', reason: '' });
                  setActiveView(item.itemType === 'finished_product' ? 'finished' : 'raw');
                }}
              >
                Stock-in
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdjustmentDraft({ itemId: item.id, movementType: 'stock_out', quantity: '1', reason: '' });
                  setActiveView(item.itemType === 'finished_product' ? 'finished' : 'raw');
                }}
              >
                Stock-out
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleEditItem(item)}>
                Edit
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDeleteItem(item.id)}>
                Delete
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderMovementRows = (rows: InventoryMovement[]) => (
    <div className="overflow-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-left">
            <th className="p-2">Time</th>
            <th className="p-2">Item</th>
            <th className="p-2">Type</th>
            <th className="p-2">Change</th>
            <th className="p-2">Stock After</th>
            <th className="p-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((movement) => {
            const item = itemById.get(movement.itemId);
            return (
              <tr key={movement.id} className="border-t">
                <td className="p-2">{new Date(movement.createdAt).toLocaleString()}</td>
                <td className="p-2">{item?.name ?? movement.itemId}</td>
                <td className="p-2">
                  <StatusChip label={movementLabel(movement.movementType)} tone={movementTone(movement)} />
                </td>
                <td className="p-2">{movement.quantityDelta > 0 ? '+' : ''}{formatQuantityText(movement.quantityDelta)}</td>
                <td className="p-2">{formatQuantityText(movement.quantityAfter)}</td>
                <td className="p-2">{movement.reason || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        eyebrow="Inventory"
        title="Inventory"
        subtitle="Separate raw materials, produced items, and waste records while keeping stock movements auditable."
        actions={
          <>
            <Button variant="secondary" onClick={() => handleOpenCreateItemModal('raw_material')}>
              Add Raw Material
            </Button>
            <Button variant="outline" onClick={() => handleOpenCreateItemModal('finished_product')}>
              Add Finished Product
            </Button>
          </>
        }
      >
        {loading ? <p className="text-sm text-[#6B7280]">Loading inventory tracker...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {lastConfirmation ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{lastConfirmation}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border p-3">
            <p className="text-[11px] font-semibold text-[#6B7280]">Raw Materials</p>
            <p className="mt-1 text-2xl font-bold">{formatMetricText(inventorySummary.rawMaterials)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] font-semibold text-[#6B7280]">Finished Products</p>
            <p className="mt-1 text-2xl font-bold">{formatMetricText(inventorySummary.finishedProducts)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] font-semibold text-[#6B7280]">Waste Records</p>
            <p className="mt-1 text-2xl font-bold">{formatMetricText(inventorySummary.wasteRecords)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] font-semibold text-[#6B7280]">Stock Units</p>
            <p className="mt-1 text-2xl font-bold">{formatMetricText(inventorySummary.totalStockUnits)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] font-semibold text-[#6B7280]">Low Stock</p>
            <p className="mt-1 text-2xl font-bold">{formatMetricText(inventorySummary.lowStockItems)}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Inventory Views" subtitle="Each list shows 10 records by default. Use filters or pagination for more.">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'raw', label: 'Raw Materials', count: filteredRawMaterials.length },
            { id: 'finished', label: 'Finished Products', count: filteredFinishedProducts.length },
            { id: 'waste', label: 'Wasted/Destroyed Items', count: wasteMovements.length },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeView === tab.id ? 'secondary' : 'outline'}
              onClick={() => setActiveView(tab.id as typeof activeView)}
            >
              {tab.label} ({tab.count})
            </Button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
          <input
            className="border rounded px-2 py-2 text-sm"
            placeholder="Search inventory item"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select className="border rounded px-2 py-2 text-sm" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            {inventoryTabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label} - {tab.description}
              </option>
            ))}
          </select>
        </div>
      </SectionCard>

      {activeView === 'raw' ? (
        <SectionCard title="Raw Materials" subtitle="Ingredients, packaging, and supplies used to produce finished products.">
          {!filteredRawMaterials.length ? (
            <EmptyState title="No raw materials found" message="Add raw materials or adjust the search filters." />
          ) : (
            <>
              <div className="max-h-[620px] overflow-auto pr-1">{renderItemRows(visibleRawMaterials)}</div>
              <PaginationControls
                page={rawPage}
                totalPages={rawTotalPages}
                totalItems={filteredRawMaterials.length}
                pageSize={PAGE_SIZE}
                onPageChange={setRawPage}
                itemLabel="raw materials"
              />
            </>
          )}
        </SectionCard>
      ) : null}

      {activeView === 'finished' ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <SectionCard title="Finished Products" subtitle="Produced items that can be increased only after raw materials are available.">
            {!filteredFinishedProducts.length ? (
              <EmptyState title="No finished products found" message="Add finished products, then define their raw material recipe." />
            ) : (
              <>
                <div className="max-h-[620px] overflow-auto pr-1">{renderItemRows(visibleFinishedProducts)}</div>
                <PaginationControls
                  page={finishedPage}
                  totalPages={finishedTotalPages}
                  totalItems={filteredFinishedProducts.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setFinishedPage}
                  itemLabel="finished products"
                />
              </>
            )}
          </SectionCard>

          <SectionCard title="Production" subtitle="Produce finished stock from exact recipe quantities.">
            {!finishedProducts.length ? (
              <EmptyState title="No finished products yet" message="Create a finished product before recording production." />
            ) : (
              <div className="space-y-3">
                <label className="block text-sm">
                  Finished product
                  <select
                    className="mt-1 block w-full rounded border px-2 py-2"
                    value={productionDraft.finishedItemId || selectedFinishedProduct?.id || ''}
                    onChange={(event) => {
                      setProductionDraft((current) => ({ ...current, finishedItemId: event.target.value }));
                      setRecipeDraft((current) => ({ ...current, finishedItemId: event.target.value }));
                    }}
                  >
                    {finishedProducts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-sm">
                    Quantity to produce
                    <input
                      className="mt-1 block w-full rounded border px-2 py-2"
                      value={productionDraft.quantity}
                      onChange={(event) => setProductionDraft((current) => ({ ...current, quantity: event.target.value }))}
                    />
                  </label>
                  <label className="block text-sm">
                    Reason / note
                    <input
                      className="mt-1 block w-full rounded border px-2 py-2"
                      placeholder="Batch prep, restock, etc."
                      value={productionDraft.reason}
                      onChange={(event) => setProductionDraft((current) => ({ ...current, reason: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Recipe / BOM</p>
                    <StatusChip label={`${selectedRecipeLines.length} line${selectedRecipeLines.length === 1 ? '' : 's'}`} tone={selectedRecipeLines.length ? 'info' : 'neutral'} />
                  </div>
                  {!selectedRecipeLines.length ? (
                    <p className="text-sm text-[#6B7280]">Not enough data yet. Add raw materials for this finished product.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedRecipeLines.map((line) => {
                        const rawItem = itemById.get(line.rawItemId);
                        const required = roundQuantity(line.quantityRequired * Math.max(0, productionQuantity));
                        const isInsufficient = rawItem ? rawItem.quantityOnHand < required : true;
                        return (
                          <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                            <div>
                              <p className="font-medium">{rawItem?.name ?? line.rawItemId}</p>
                              <p className="text-[#6B7280]">
                                Needs {formatQuantityText(required)} {rawItem?.unit ?? line.unit ?? ''}; available{' '}
                                {rawItem ? `${formatQuantityText(rawItem.quantityOnHand)} ${rawItem.unit}` : 'missing'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusChip label={isInsufficient ? 'Insufficient' : 'Enough'} tone={isInsufficient ? 'danger' : 'success'} />
                              <Button variant="danger" size="sm" onClick={() => deleteRecipeLine(line.id).catch((deleteError) => toast.error(getErrorMessage(deleteError, 'Unable to remove recipe line.')))}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">Add recipe line</p>
                  <div className="grid gap-2">
                    <select
                      className="rounded border px-2 py-2 text-sm"
                      value={recipeDraft.rawItemId}
                      onChange={(event) => setRecipeDraft((current) => ({ ...current, rawItemId: event.target.value }))}
                    >
                      <option value="">Select raw material</option>
                      {rawMaterials.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      className="rounded border px-2 py-2 text-sm"
                      placeholder="Quantity required per finished unit"
                      value={recipeDraft.quantityRequired}
                      onChange={(event) => setRecipeDraft((current) => ({ ...current, quantityRequired: event.target.value }))}
                    />
                    <Button variant="outline" onClick={handleSaveRecipeLine}>
                      Add Raw Material
                    </Button>
                  </div>
                </div>

                <Button variant="secondary" disabled={!selectedRecipeLines.length} onClick={handleProduce}>
                  Produce Finished Product
                </Button>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeView === 'waste' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)]">
          <SectionCard title="Record Wasted / Destroyed Item" subtitle="Waste automatically deducts stock and requires a reason.">
            <div className="space-y-3">
              <label className="block text-sm">
                Item
                <select
                  className="mt-1 block w-full rounded border px-2 py-2"
                  value={adjustmentDraft.itemId}
                  onChange={(event) => setAdjustmentDraft((current) => ({ ...current, itemId: event.target.value, movementType: 'waste' }))}
                >
                  <option value="">Select item</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({formatQuantityText(item.quantityOnHand)} {item.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Quantity wasted
                <input
                  className="mt-1 block w-full rounded border px-2 py-2"
                  value={adjustmentDraft.quantity}
                  onChange={(event) => setAdjustmentDraft((current) => ({ ...current, quantity: event.target.value, movementType: 'waste' }))}
                />
              </label>
              <label className="block text-sm">
                Reason
                <textarea
                  className="mt-1 block w-full rounded border px-2 py-2"
                  rows={3}
                  placeholder="Expired, spilled, damaged packaging, etc."
                  value={adjustmentDraft.reason}
                  onChange={(event) => setAdjustmentDraft((current) => ({ ...current, reason: event.target.value, movementType: 'waste' }))}
                />
              </label>
              <Button variant="danger" onClick={handleAdjustStock}>
                Record Waste
              </Button>
            </div>
          </SectionCard>
          <SectionCard title="Waste Log" subtitle="Latest waste records, limited to 10 by default.">
            {!wasteMovements.length ? (
              <EmptyState title="No waste records yet" message="Waste records will appear after stock is deducted with a reason." />
            ) : (
              renderMovementRows(wasteMovements.slice(0, PAGE_SIZE))
            )}
          </SectionCard>
        </div>
      ) : null}

      {activeView !== 'waste' ? (
        <SectionCard title="Stock Adjustment" subtitle="Record stock-in, stock-out, or waste without editing counts by hand.">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_140px_minmax(0,1fr)_auto] md:items-end">
            <label className="block text-sm">
              Item
              <select
                className="mt-1 block w-full rounded border px-2 py-2"
                value={adjustmentDraft.itemId}
                onChange={(event) => setAdjustmentDraft((current) => ({ ...current, itemId: event.target.value }))}
              >
                <option value="">Select item</option>
                {(activeView === 'finished' ? finishedProducts : rawMaterials).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({formatQuantityText(item.quantityOnHand)} {item.unit})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Type
              <select
                className="mt-1 block w-full rounded border px-2 py-2"
                value={adjustmentDraft.movementType}
                onChange={(event) => setAdjustmentDraft((current) => ({ ...current, movementType: event.target.value as typeof adjustmentDraft.movementType }))}
              >
                <option value="stock_in">Stock-in</option>
                <option value="stock_out">Stock-out</option>
                <option value="waste">Waste</option>
              </select>
            </label>
            <label className="block text-sm">
              Quantity
              <input
                className="mt-1 block w-full rounded border px-2 py-2"
                value={adjustmentDraft.quantity}
                onChange={(event) => setAdjustmentDraft((current) => ({ ...current, quantity: event.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Reason
              <input
                className="mt-1 block w-full rounded border px-2 py-2"
                placeholder={adjustmentDraft.movementType === 'waste' ? 'Required for waste' : 'Optional'}
                value={adjustmentDraft.reason}
                onChange={(event) => setAdjustmentDraft((current) => ({ ...current, reason: event.target.value }))}
              />
            </label>
            <Button variant={adjustmentDraft.movementType === 'waste' ? 'danger' : 'secondary'} onClick={handleAdjustStock}>
              Record
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Recent Inventory Log" subtitle="Latest stock movements are capped at 10 records.">
        {!movements.length ? (
          <EmptyState title="No stock movements yet" message="Stock-in, stock-out, waste, and production entries will appear here." />
        ) : (
          renderMovementRows(movements)
        )}
      </SectionCard>

      <SectionCard title="Inventory Categories" subtitle="Keep categories compact so filtering stays useful.">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_120px_auto] md:items-end">
          <input
            className="rounded border px-2 py-2 text-sm"
            placeholder="Category name"
            value={categoryDraft.name}
            onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })}
          />
          <input
            className="rounded border px-2 py-2 text-sm"
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
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleSaveCategory}>
              Save
            </Button>
            {categoryDraft.id ? (
              <Button variant="outline" size="sm" onClick={() => setCategoryDraft(createCategoryDraft())}>
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 max-h-72 space-y-2 overflow-auto">
          {categories.map((category) => (
            <div key={category.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
              <p>
                {category.sortOrder} - {category.name} {category.isActive ? '' : '(inactive)'}
              </p>
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
          {!categories.length ? <EmptyState title="No categories yet" message="Create a category before adding inventory items." /> : null}
        </div>
      </SectionCard>

      {isItemModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/40" onClick={handleCloseItemModal} aria-label="Close inventory item editor overlay" />
          <div className="relative w-full max-w-4xl rounded-lg border bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="font-medium">{itemDraft.id ? itemDraft.name || 'Edit Inventory Item' : itemDraft.itemType === 'finished_product' ? 'Add Finished Product' : 'Add Raw Material'}</h4>
              <Button variant="outline" size="sm" onClick={handleCloseItemModal} aria-label="Close inventory item editor">
                Close
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block text-sm">
                Item name
                <input
                  className="mt-1 block w-full rounded border px-2 py-2"
                  value={itemDraft.name}
                  onChange={(event) => setItemDraft({ ...itemDraft, name: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                Item type
                <select
                  className="mt-1 block w-full rounded border px-2 py-2"
                  value={itemDraft.itemType}
                  onChange={(event) => setItemDraft({ ...itemDraft, itemType: event.target.value as InventoryItemType })}
                >
                  <option value="raw_material">Raw material</option>
                  <option value="finished_product">Finished product</option>
                </select>
              </label>
              <label className="block text-sm">
                Category
                <select
                  className="mt-1 block w-full rounded border px-2 py-2"
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
              </label>
              <label className="block text-sm">
                Unit
                <select
                  className="mt-1 block w-full rounded border px-2 py-2"
                  value={itemDraft.unit}
                  onChange={(event) => setItemDraft({ ...itemDraft, unit: event.target.value })}
                >
                  {inventoryUnits.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Quantity on hand
                <input
                  className="mt-1 block w-full rounded border px-2 py-2"
                  placeholder="Example: 3/4, 2, 2 1/2"
                  value={itemDraft.displayQuantity ?? ''}
                  onChange={(event) => setItemDraft({ ...itemDraft, displayQuantity: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                Reorder level
                <input
                  className="mt-1 block w-full rounded border px-2 py-2"
                  type="number"
                  min={0}
                  step="0.001"
                  value={itemDraft.reorderLevel}
                  onChange={(event) => setItemDraft({ ...itemDraft, reorderLevel: Number(event.target.value) })}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                Notes
                <input
                  className="mt-1 block w-full rounded border px-2 py-2"
                  placeholder="Optional"
                  value={itemDraft.notes ?? ''}
                  onChange={(event) => setItemDraft({ ...itemDraft, notes: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                Recipe yield
                <input
                  className="mt-1 block w-full rounded border px-2 py-2"
                  type="number"
                  min={1}
                  step="0.001"
                  value={itemDraft.recipeYieldQuantity}
                  onChange={(event) => setItemDraft({ ...itemDraft, recipeYieldQuantity: Number(event.target.value) })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={itemDraft.isActive}
                  onChange={(event) => setItemDraft({ ...itemDraft, isActive: event.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleSaveItem}>
                {itemDraft.id ? 'Save Changes' : 'Save'}
              </Button>
              <Button variant="outline" onClick={handleCloseItemModal}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
