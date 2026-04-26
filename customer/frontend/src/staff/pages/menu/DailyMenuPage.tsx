import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, EmptyState, SectionCard, StatusChip } from '@/components/ui';
import { useDailyMenu } from '@/hooks/useDailyMenu';
import { useMenuItems } from '@/hooks/useMenuItems';
import type { DailyMenu, DailyMenuItem } from '@/types/dailyMenu';

const emptyMenu = (menuDate: string): DailyMenu => ({
  id: '',
  menuDate,
  isPublished: false,
  createdBy: null,
  createdAt: '',
  updatedAt: '',
  items: [],
});

const buildDraftItem = (params: { dailyMenuId: string; menuItemId: string }): DailyMenuItem => ({
  id: '',
  dailyMenuId: params.dailyMenuId,
  menuItemId: params.menuItemId,
  createdAt: '',
});

export const DailyMenuPage = () => {
  const { items: menuItems } = useMenuItems();
  const { menuDate, setMenuDate, menu, loading, error, saving, saveDraft, publish, unpublish, clearMenu } = useDailyMenu();
  const [draft, setDraft] = useState<DailyMenu>(() => emptyMenu(menuDate));
  const [menuItemToAdd, setMenuItemToAdd] = useState('');

  useEffect(() => {
    setDraft(menu ?? emptyMenu(menuDate));
  }, [menu, menuDate]);

  const byId = useMemo(() => new Map(menuItems.map((item) => [item.id, item])), [menuItems]);
  const selectedMenuItemIds = useMemo(() => new Set(draft.items.map((item) => item.menuItemId)), [draft.items]);
  const selectedMenuItem = menuItemToAdd ? byId.get(menuItemToAdd) : null;
  const isSelectedItemAlreadyAdded = Boolean(menuItemToAdd && selectedMenuItemIds.has(menuItemToAdd));
  const previewItems = draft.items.slice(0, 5);
  const previewOverflowCount = Math.max(0, draft.items.length - previewItems.length);

  if (loading) return <p>Loading daily menu...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const addItem = () => {
    if (!menuItemToAdd) return;
    if (draft.items.some((item) => item.menuItemId === menuItemToAdd)) {
      toast.info('Item already in this daily menu.');
      setMenuItemToAdd('');
      return;
    }

    setDraft((current) => ({
      ...current,
      items: [...current.items, buildDraftItem({ dailyMenuId: current.id, menuItemId: menuItemToAdd })],
    }));
    setMenuItemToAdd('');
  };

  const removeItem = (menuItemId: string) => {
    setDraft((current) => ({ ...current, items: current.items.filter((item) => item.menuItemId !== menuItemId) }));
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <SectionCard
        title="Edit Daily Menu"
        subtitle="Build and publish the customer-facing Menu of the Day."
        actions={<StatusChip label={draft.isPublished ? 'Published' : 'Draft'} tone={draft.isPublished ? 'success' : 'neutral'} />}
        contentClassName="space-y-4"
      >

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Menu Date
            <input
              type="date"
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={menuDate}
              onChange={(e) => setMenuDate(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h3 className="font-medium">Edit Daily Menu Items</h3>
            <div className="flex gap-2 items-end">
              <select className="border rounded px-2 py-1 text-sm" value={menuItemToAdd} onChange={(e) => setMenuItemToAdd(e.target.value)}>
                <option value="">Select menu item</option>
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id} disabled={selectedMenuItemIds.has(item.id)}>
                    {item.name}{selectedMenuItemIds.has(item.id) ? ' (already selected)' : ''}
                  </option>
                ))}
              </select>
              <Button variant="secondary" size="sm" onClick={addItem} disabled={!menuItemToAdd || isSelectedItemAlreadyAdded}>
                {isSelectedItemAlreadyAdded ? 'Already Added' : 'Add Menu Item'}
              </Button>
            </div>
          </div>

          {selectedMenuItem && !isSelectedItemAlreadyAdded ? (
            <p className="text-sm text-[#6B7280]">
              Ready to add: <strong>{selectedMenuItem.name}</strong>
            </p>
          ) : null}

          <div className="rounded-lg border border-dashed p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium">Selected Items</h4>
              <span className="text-xs rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                {draft.items.length} item{draft.items.length === 1 ? '' : 's'}
              </span>
            </div>
            {draft.items.length ? (
              <div className="max-h-72 space-y-2 overflow-auto pr-1">
                {draft.items.map((item) => {
                  const menuItem = byId.get(item.menuItemId);
                  const label = menuItem ? menuItem.name : item.menuItemId;
                  return (
                    <div key={`selected-${item.menuItemId}`} className="flex items-center justify-between gap-3 rounded border bg-white p-2 text-sm">
                      <span className="font-medium">{label}</span>
                      <Button variant="outline" size="sm" onClick={() => removeItem(item.menuItemId)} type="button">
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No items selected" message="Choose an item above, then add it to the Menu of the Day." />
            )}
          </div>

        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={async () => {
              const saved = await saveDraft({ ...draft, menuDate });
              setDraft(saved);
              toast.success('Daily menu draft saved.');
            }}
          >
            Save Daily Menu Draft
          </Button>
          <Button
            variant="secondary"
            disabled={saving}
            onClick={async () => {
              const saved = await publish({ ...draft, menuDate });
              setDraft(saved);
              toast.success('Daily menu published.');
            }}
          >
            Publish Daily Menu
          </Button>
          <Button
            variant="outline"
            disabled={saving}
            onClick={async () => {
              const saved = await unpublish();
              setDraft(saved);
              toast.info('Daily menu unpublished.');
            }}
          >
            Unpublish Daily Menu
          </Button>
          <Button
            variant="danger"
            disabled={saving}
            onClick={async () => {
              const saved = await clearMenu();
              setDraft(saved);
              toast.info('Daily menu cleared.');
            }}
          >
            Clear Daily Menu
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Menu of the Day Preview"
        subtitle={`${menuDate} - ${draft.isPublished ? 'Live for customers' : 'Not currently visible to customers'}`}
        contentClassName="space-y-3"
      >
        <div className="space-y-2">
          {draft.items.length ? (
            previewItems.map((item) => {
              const menuItem = byId.get(item.menuItemId);
              const label = menuItem ? menuItem.name : item.menuItemId;
              return (
                <div key={`preview-${item.menuItemId}`} className="border rounded p-3 text-sm">
                  {label}
                </div>
              );
            })
          ) : (
            <EmptyState title="No preview yet" message="Add menu items to show a useful owner preview." />
          )}
          {previewOverflowCount > 0 ? <p className="text-sm text-[#6B7280]">+{previewOverflowCount} more item{previewOverflowCount === 1 ? '' : 's'} selected.</p> : null}
        </div>
      </SectionCard>
    </div>
  );
};
