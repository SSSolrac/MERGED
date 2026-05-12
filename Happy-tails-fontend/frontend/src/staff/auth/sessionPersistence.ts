import type { SessionUser } from '@/types/user';

export const SESSION_KEY = 'staffowner_session';

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem' | 'removeItem'>;

const isRoleAllowed = (role: unknown): role is Extract<SessionUser['role'], 'owner' | 'staff'> => role === 'owner' || role === 'staff';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const deserializeSessionUser = (raw: string | null): SessionUser | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;

    const id = parsed.id;
    const email = parsed.email;
    const name = parsed.name;
    const role = parsed.role;

    if (typeof id !== 'string' || !id.trim()) return null;
    if (typeof email !== 'string') return null;
    if (typeof name !== 'string') return null;
    if (!isRoleAllowed(role)) return null;

    return parsed as SessionUser;
  } catch {
    return null;
  }
};

export const getBrowserLocalStorage = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export const loadSessionUser = (storage: StorageReader | null, key = SESSION_KEY): SessionUser | null => {
  if (!storage) return null;
  try {
    return deserializeSessionUser(storage.getItem(key));
  } catch {
    return null;
  }
};

export const persistSessionUser = (storage: StorageWriter | null, user: SessionUser | null, key = SESSION_KEY) => {
  if (!storage) return;
  try {
    if (user) storage.setItem(key, JSON.stringify(user));
    else storage.removeItem(key);
  } catch {}
};

