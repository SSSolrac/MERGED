import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Edit Daily Menu</h2>
            <p className="text-sm text-[#6B7280] dark:text-slate-300">Build and publish daily menus from canonical daily menu tables.</p>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded ${draft.isPublished ? 'bg-green-100 text-green-700' : 'bg-[#FFE4E8] text-slate-700'}`}
          >
            {draft.isPublished ? 'Published' : 'Draft'}
          </span>
        </div>

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
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button className="border rounded px-2 py-1" onClick={addItem} disabled={!menuItemToAdd}>
                Add Menu Item
              </button>
            </div>
          </div>

          {draft.items.length === 0 ? (
            <p className="text-sm text-[#6B7280]">No items selected yet.</p>
          ) : (
            <div className="space-y-2">
              {draft.items.map((item) => {
                const menuItem = byId.get(item.menuItemId);
                const label = menuItem ? menuItem.name : item.menuItemId;
                return (
                  <div key={item.menuItemId} className="border rounded p-3 flex items-center justify-between gap-2 text-sm">
                    <p>{label}</p>
                    <button className="border rounded px-2 py-1" onClick={() => removeItem(item.menuItemId)}>
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="border rounded px-3 py-1"
            disabled={saving}
            onClick={async () => {
              const saved = await saveDraft({ ...draft, menuDate });
              setDraft(saved);
              toast.success('Daily menu draft saved.');
            }}
          >
            Save Daily Menu Draft
          </button>
          <button
            className="border rounded px-3 py-1"
            disabled={saving}
            onClick={async () => {
              const saved = await publish({ ...draft, menuDate });
              setDraft(saved);
              toast.success('Daily menu published.');
            }}
          >
            Publish Daily Menu
          </button>
          <button
            className="border rounded px-3 py-1"
            disabled={saving}
            onClick={async () => {
              const saved = await unpublish();
              setDraft(saved);
              toast.info('Daily menu unpublished.');
            }}
          >
            Unpublish Daily Menu
          </button>
          <button
            className="border rounded px-3 py-1"
            disabled={saving}
            onClick={async () => {
              const saved = await clearMenu();
              setDraft(saved);
              toast.info('Daily menu cleared.');
            }}
          >
            Clear Daily Menu
          </button>
        </div>
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h3 className="font-semibold">Owner Preview</h3>
        <p className="text-sm">Date: {menuDate}</p>
        <p className="text-sm">State: {draft.isPublished ? 'Live for customers' : 'Not currently visible to customers'}</p>
        <div className="space-y-2">
          {draft.items.map((item) => {
            const menuItem = byId.get(item.menuItemId);
            const label = menuItem ? menuItem.name : item.menuItemId;
            return (
              <div key={`preview-${item.menuItemId}`} className="border rounded p-3 text-sm">
                {label}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
