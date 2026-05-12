import type { StaffOwnerNotification, StaffOwnerNotificationType } from '@/types/notification';

const STORAGE_KEY = 'staffowner_notifications';

const getStorage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

const load = (): StaffOwnerNotification[] => {
  const storage = getStorage();
  if (!storage) return [];
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StaffOwnerNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const save = (rows: StaffOwnerNotification[]) => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {}
};

const dedupeWindowMs = 30 * 1000;

export const notificationService = {
  list(): StaffOwnerNotification[] {
    return load().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  create(notification: Omit<StaffOwnerNotification, 'id' | 'createdAt' | 'isRead'> & { type: StaffOwnerNotificationType }) {
    const rows = load();
    const now = Date.now();
    const duplicate = rows.find((row) =>
      row.type === notification.type
      && row.relatedOrderId === notification.relatedOrderId
      && row.relatedInventoryItemId === notification.relatedInventoryItemId
      && row.title === notification.title
      && row.message === notification.message
      && now - new Date(row.createdAt).getTime() <= dedupeWindowMs,
    );

    if (duplicate) return duplicate;

    const next: StaffOwnerNotification = {
      id: `notif-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: new Date().toISOString(),
      isRead: false,
      ...notification,
    };

    save([next, ...rows].slice(0, 300));
    return next;
  },

  markRead(id: string) {
    const rows = load();
    save(rows.map((row) => (row.id === id ? { ...row, isRead: true } : row)));
  },

  markAllRead() {
    const rows = load();
    save(rows.map((row) => ({ ...row, isRead: true })));
  },
};
