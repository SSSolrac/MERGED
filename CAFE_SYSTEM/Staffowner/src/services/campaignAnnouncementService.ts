import { normalizeError } from '@/lib/errors';
import { requireSupabaseClient } from '@/lib/supabase';

export type CampaignAnnouncement = {
  id: string;
  title: string;
  message: string;
  ctaText: string;
  ctaLink: string;
  isActive: boolean;
  startAt: string;
  endAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignAnnouncementSource = 'campaign_table' | 'business_settings' | 'fallback';

export type CampaignAnnouncementResult = {
  source: CampaignAnnouncementSource;
  items: CampaignAnnouncement[];
};

const TABLE_NAME = 'campaign_announcements';
const TABLE_SELECT = 'id, title, message, cta_text, cta_link, is_active, start_at, end_at, created_at, updated_at';
const SETTINGS_COLUMNS = ['campaign_announcements', 'homepage_announcements', 'announcements'] as const;

const FALLBACK_ANNOUNCEMENTS: CampaignAnnouncement[] = [];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const asBoolean = (value: unknown, fallback = false): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'active'].includes(key)) return true;
    if (['false', '0', 'no', 'off', 'inactive'].includes(key)) return false;
  }
  return fallback;
};

const toDateMs = (value: unknown): number => {
  const ms = new Date(String(value || '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const toAnnouncement = (row: unknown, index = 0): CampaignAnnouncement => {
  const safe = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
  return {
    id: asText(safe.id || safe.slug || `announcement-${index + 1}`),
    title: asText(safe.title || safe.name),
    message: asText(safe.message || safe.body || safe.description),
    ctaText: asText(safe.cta_text || safe.ctaText || safe.action_text || safe.actionText),
    ctaLink: asText(safe.cta_link || safe.ctaLink || safe.action_link || safe.actionLink),
    isActive: asBoolean(safe.is_active ?? safe.active ?? safe.isActive, true),
    startAt: asText(safe.start_at || safe.starts_at || safe.startAt || safe.startsAt),
    endAt: asText(safe.end_at || safe.ends_at || safe.endAt || safe.endsAt),
    createdAt: asText(safe.created_at || safe.createdAt || new Date().toISOString()),
    updatedAt: asText(safe.updated_at || safe.updatedAt || safe.created_at || safe.createdAt || new Date().toISOString()),
  };
};

const sortAnnouncements = (items: CampaignAnnouncement[]): CampaignAnnouncement[] =>
  [...items].sort((left, right) => {
    const leftMs = toDateMs(left.startAt) || toDateMs(left.createdAt);
    const rightMs = toDateMs(right.startAt) || toDateMs(right.createdAt);
    return rightMs - leftMs;
  });

const cloneAnnouncements = (items: CampaignAnnouncement[]): CampaignAnnouncement[] =>
  items.map((item) => ({ ...item }));

const newestAnnouncementMs = (items: CampaignAnnouncement[]): number =>
  items.reduce((latest, entry) => {
    const ms = toDateMs(entry.updatedAt) || toDateMs(entry.startAt) || toDateMs(entry.createdAt);
    return Math.max(latest, ms);
  }, 0);

const normalizeAnnouncementInput = (items: CampaignAnnouncement[]): CampaignAnnouncement[] => {
  return items
    .map((item) => {
      const rawId = asText(item?.id);
      const id = UUID_RE.test(rawId) ? rawId : crypto.randomUUID();
      const message = asText(item?.message);
      return {
        id,
        title: asText(item?.title),
        message,
        ctaText: '',
        ctaLink: '',
        isActive: asBoolean(item?.isActive, true),
        startAt: asText(item?.startAt),
        endAt: asText(item?.endAt),
        createdAt: asText(item?.createdAt || new Date().toISOString()),
        updatedAt: new Date().toISOString(),
      };
    })
    .filter((item) => item.message);
};

const mapTablePayload = (item: CampaignAnnouncement): Record<string, unknown> => ({
  id: item.id,
  title: item.title || '',
  message: item.message || '',
  cta_text: null,
  cta_link: null,
  is_active: item.isActive,
  start_at: item.startAt || null,
  end_at: item.endAt || null,
  updated_at: new Date().toISOString(),
});

const mapBusinessSettingsPayload = (item: CampaignAnnouncement): Record<string, unknown> => ({
  id: item.id,
  title: item.title || '',
  message: item.message || '',
  cta_text: null,
  cta_link: null,
  is_active: item.isActive,
  start_at: item.startAt || null,
  end_at: item.endAt || null,
  created_at: item.createdAt || new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const readCampaignAnnouncementsTable = async (): Promise<CampaignAnnouncement[]> => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(TABLE_SELECT)
    .order('start_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw normalizeError(error, { fallbackMessage: 'Unable to load campaign announcements.' });
  }

  const mapped = (Array.isArray(data) ? data : []).map((row, index) => toAnnouncement(row, index));
  return sortAnnouncements(mapped);
};

type SettingsAnnouncementsResult = {
  key: string | null;
  items: CampaignAnnouncement[];
};

const readAnnouncementsFromBusinessSettings = async (): Promise<SettingsAnnouncementsResult> => {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.from('business_settings').select('*').eq('id', 1).maybeSingle();

  if (error) {
    throw normalizeError(error, { fallbackMessage: 'Unable to load campaign announcements from business settings.' });
  }

  const row = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const availableKeys = SETTINGS_COLUMNS.filter((column) => Object.prototype.hasOwnProperty.call(row, column));
  const key =
    availableKeys.find((column) => {
      const value = row[column];
      return Array.isArray(value) && value.length > 0;
    }) ||
    availableKeys[0] ||
    null;
  if (!key) return { key: null, items: [] };

  const raw = row[key];
  const items = (Array.isArray(raw) ? raw : []).map((entry, index) => toAnnouncement(entry, index));
  return {
    key,
    items: sortAnnouncements(items),
  };
};

const saveCampaignAnnouncementsTable = async (items: CampaignAnnouncement[]): Promise<CampaignAnnouncement[]> => {
  const supabase = requireSupabaseClient();
  const { data: existingRows, error: existingError } = await supabase.from(TABLE_NAME).select('id');

  if (existingError) {
    throw normalizeError(existingError, { fallbackMessage: 'Unable to save campaign announcements.' });
  }

  const existingIds = (Array.isArray(existingRows) ? existingRows : [])
    .map((row) => asText((row as Record<string, unknown>)?.id))
    .filter(Boolean);
  const incomingIds = new Set(items.map((item) => item.id));
  const toDelete = existingIds.filter((id) => !incomingIds.has(id));

  if (toDelete.length) {
    const { error: deleteError } = await supabase.from(TABLE_NAME).delete().in('id', toDelete);
    if (deleteError) {
      throw normalizeError(deleteError, { fallbackMessage: 'Unable to save campaign announcements.' });
    }
  }

  if (items.length) {
    const payload = items.map(mapTablePayload);
    const { error: upsertError } = await supabase.from(TABLE_NAME).upsert(payload, { onConflict: 'id' });
    if (upsertError) {
      throw normalizeError(upsertError, { fallbackMessage: 'Unable to save campaign announcements.' });
    }
  }

  return readCampaignAnnouncementsTable();
};

const saveAnnouncementsToBusinessSettings = async (items: CampaignAnnouncement[]): Promise<CampaignAnnouncement[]> => {
  const supabase = requireSupabaseClient();
  const { data: currentRow, error: currentError } = await supabase.from('business_settings').select('*').eq('id', 1).maybeSingle();

  if (currentError) {
    throw normalizeError(currentError, { fallbackMessage: 'Unable to save campaign announcements.' });
  }

  const safeCurrent = (currentRow && typeof currentRow === 'object' ? currentRow : {}) as Record<string, unknown>;
  const key = SETTINGS_COLUMNS.find((column) => Object.prototype.hasOwnProperty.call(safeCurrent, column)) || null;
  if (!key) {
    throw new Error(
      'Campaign announcements storage is not configured in business_settings. Apply updated Supabase schema to add campaign_announcements JSON storage.'
    );
  }

  const { data: authData } = await supabase.auth.getUser();
  const payload: Record<string, unknown> = {
    [key]: items.map(mapBusinessSettingsPayload),
  };

  if (authData?.user?.id) {
    payload.updated_by = authData.user.id;
  }

  const { data: savedRow, error: saveError } = await supabase
    .from('business_settings')
    .update(payload)
    .eq('id', 1)
    .select('*')
    .single();

  if (saveError) {
    throw normalizeError(saveError, { fallbackMessage: 'Unable to save campaign announcements.' });
  }

  const rawSaved = (savedRow && typeof savedRow === 'object' ? savedRow : {}) as Record<string, unknown>;
  const savedItems = (Array.isArray(rawSaved[key]) ? rawSaved[key] : []).map((entry, index) => toAnnouncement(entry, index));
  return sortAnnouncements(savedItems);
};

const getFallbackAnnouncements = (): CampaignAnnouncement[] => cloneAnnouncements(FALLBACK_ANNOUNCEMENTS);

export const campaignAnnouncementService = {
  createAnnouncementDraft(): CampaignAnnouncement {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      title: '',
      message: '',
      ctaText: '',
      ctaLink: '',
      isActive: true,
      startAt: '',
      endAt: '',
      createdAt: now,
      updatedAt: now,
    };
  },

  async listCampaignAnnouncements(): Promise<CampaignAnnouncementResult> {
    let fromTable: CampaignAnnouncement[] = [];
    let fromSettings: SettingsAnnouncementsResult = { key: null, items: [] };

    try {
      fromTable = await readCampaignAnnouncementsTable();
    } catch {
      // Continue to fallback source.
    }

    try {
      fromSettings = await readAnnouncementsFromBusinessSettings();
    } catch {
      // Continue to fallback source.
    }

    if (fromTable.length && fromSettings.items.length) {
      if (newestAnnouncementMs(fromSettings.items) > newestAnnouncementMs(fromTable)) {
        return { source: 'business_settings', items: fromSettings.items };
      }
      return { source: 'campaign_table', items: fromTable };
    }

    if (fromTable.length) return { source: 'campaign_table', items: fromTable };
    if (fromSettings.items.length) return { source: 'business_settings', items: fromSettings.items };

    return { source: 'fallback', items: getFallbackAnnouncements() };
  },

  async saveCampaignAnnouncements(items: CampaignAnnouncement[]): Promise<CampaignAnnouncementResult> {
    const normalized = normalizeAnnouncementInput(items);

    try {
      const saved = await saveCampaignAnnouncementsTable(normalized);
      try {
        await saveAnnouncementsToBusinessSettings(normalized);
      } catch {
        // best effort mirror to keep customer fallback source aligned
      }
      return { source: 'campaign_table', items: saved };
    } catch (error) {
      const message = String((error as Error)?.message || '').toLowerCase();
      const canFallback =
        message.includes('relation') ||
        message.includes('schema') ||
        message.includes('campaign_announcements');
      if (!canFallback) throw error;
    }

    const savedFromSettings = await saveAnnouncementsToBusinessSettings(normalized);
    return { source: 'business_settings', items: savedFromSettings };
  },
};
