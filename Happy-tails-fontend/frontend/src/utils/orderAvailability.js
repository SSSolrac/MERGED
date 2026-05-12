const PH_TIME_ZONE = "Asia/Manila";
const DEFAULT_ORDER_WINDOW_CONFIG = Object.freeze({
  weekdayOpen: "08:00",
  weekdayClose: "19:30",
  weekendOpen: "08:00",
  weekendClose: "20:00",
});

function normalizeTimeValue(value, fallback) {
  const trimmed = String(value || "").trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return fallback;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function toMinutes(value, fallback) {
  const normalized = normalizeTimeValue(value, fallback);
  const [hours, minutes] = normalized.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTimeLabel(value) {
  const normalized = normalizeTimeValue(value, "08:00");
  const [hours, minutes] = normalized.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function buildNormalizedConfig(input = {}) {
  return {
    weekdayOpen: normalizeTimeValue(input.weekdayOpen, DEFAULT_ORDER_WINDOW_CONFIG.weekdayOpen),
    weekdayClose: normalizeTimeValue(input.weekdayClose, DEFAULT_ORDER_WINDOW_CONFIG.weekdayClose),
    weekendOpen: normalizeTimeValue(input.weekendOpen, DEFAULT_ORDER_WINDOW_CONFIG.weekendOpen),
    weekendClose: normalizeTimeValue(input.weekendClose, DEFAULT_ORDER_WINDOW_CONFIG.weekendClose),
  };
}

export const ORDER_WINDOW_WEEKDAY_LABEL = `${formatTimeLabel(DEFAULT_ORDER_WINDOW_CONFIG.weekdayOpen)} - ${formatTimeLabel(DEFAULT_ORDER_WINDOW_CONFIG.weekdayClose)}`;
export const ORDER_WINDOW_WEEKEND_LABEL = `${formatTimeLabel(DEFAULT_ORDER_WINDOW_CONFIG.weekendOpen)} - ${formatTimeLabel(DEFAULT_ORDER_WINDOW_CONFIG.weekendClose)}`;
export const ORDER_WINDOW_DISPLAY_LINES = Object.freeze([
  `Monday - Friday: ${ORDER_WINDOW_WEEKDAY_LABEL}`,
  `Saturday - Sunday: ${ORDER_WINDOW_WEEKEND_LABEL}`,
]);
export const DEFAULT_BUSINESS_HOURS_TEXT = ORDER_WINDOW_DISPLAY_LINES.join("\n");
export const ORDER_WINDOW_STORAGE_VALUE = "Weekdays 08:00-19:30; Weekends 08:00-20:00";

const DAY_INDEX_BY_SHORT_NAME = Object.freeze({
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
});

function readScheduleSourceValue(source) {
  if (!source) return "";
  if (typeof source === "string") return source;
  if (typeof source === "object") {
    return String(source.kitchenCutoff || source.kitchen_cutoff || source.orderWindow || "").trim();
  }
  return "";
}

export function serializeOrderWindowConfig(input) {
  const config = buildNormalizedConfig(input);
  return `Weekdays ${config.weekdayOpen}-${config.weekdayClose}; Weekends ${config.weekendOpen}-${config.weekendClose}`;
}

export function buildOrderWindowDisplayLines(input) {
  const config = buildNormalizedConfig(input);
  return [
    `Monday - Friday: ${formatTimeLabel(config.weekdayOpen)} - ${formatTimeLabel(config.weekdayClose)}`,
    `Saturday - Sunday: ${formatTimeLabel(config.weekendOpen)} - ${formatTimeLabel(config.weekendClose)}`,
  ];
}

export function buildBusinessHoursText(input) {
  return buildOrderWindowDisplayLines(input).join("\n");
}

export function parseOrderWindowConfig(source) {
  if (source && typeof source === "object") {
    const hasDirectConfig =
      "weekdayOpen" in source || "weekdayClose" in source || "weekendOpen" in source || "weekendClose" in source;
    if (hasDirectConfig) {
      return buildNormalizedConfig(source);
    }
  }

  const rawValue = readScheduleSourceValue(source);
  const compactPattern =
    /weekdays?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*;\s*weekends?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i;
  const compactMatch = compactPattern.exec(rawValue);
  if (compactMatch) {
    return buildNormalizedConfig({
      weekdayOpen: compactMatch[1],
      weekdayClose: compactMatch[2],
      weekendOpen: compactMatch[3],
      weekendClose: compactMatch[4],
    });
  }

  const legacySingleCutoff = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(rawValue);
  if (legacySingleCutoff) {
    const normalizedClose = `${legacySingleCutoff[1].padStart(2, "0")}:${legacySingleCutoff[2]}`;
    return buildNormalizedConfig({
      weekdayOpen: DEFAULT_ORDER_WINDOW_CONFIG.weekdayOpen,
      weekdayClose: normalizedClose,
      weekendOpen: DEFAULT_ORDER_WINDOW_CONFIG.weekendOpen,
      weekendClose: normalizedClose,
    });
  }

  return buildNormalizedConfig(DEFAULT_ORDER_WINDOW_CONFIG);
}

export function getOrderWindowMessage(scheduleSource) {
  const config = parseOrderWindowConfig(scheduleSource);
  const weekdayLabel = `${formatTimeLabel(config.weekdayOpen)} - ${formatTimeLabel(config.weekdayClose)}`;
  const weekendLabel = `${formatTimeLabel(config.weekendOpen)} - ${formatTimeLabel(config.weekendClose)}`;
  return `Orders can only be placed from ${weekdayLabel} on weekdays and ${weekendLabel} on weekends.`;
}

function resolveReferenceDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  return new Date();
}

function getManilaTimeParts(referenceDate) {
  const safeDate = resolveReferenceDate(referenceDate);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PH_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(safeDate);
  const weekday = parts.find((part) => part.type === "weekday")?.value || "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");

  return {
    dayIndex: DAY_INDEX_BY_SHORT_NAME[weekday] ?? 1,
    totalMinutes: hour * 60 + minute,
  };
}

export function getOrderWindowStatus(referenceDate, scheduleSource) {
  const config = parseOrderWindowConfig(scheduleSource);
  const { dayIndex, totalMinutes } = getManilaTimeParts(referenceDate);
  const isWeekend = dayIndex === 0 || dayIndex === 6;
  const openMinutes = isWeekend ? toMinutes(config.weekendOpen, DEFAULT_ORDER_WINDOW_CONFIG.weekendOpen) : toMinutes(config.weekdayOpen, DEFAULT_ORDER_WINDOW_CONFIG.weekdayOpen);
  const closeMinutes = isWeekend ? toMinutes(config.weekendClose, DEFAULT_ORDER_WINDOW_CONFIG.weekendClose) : toMinutes(config.weekdayClose, DEFAULT_ORDER_WINDOW_CONFIG.weekdayClose);
  const isOpen = totalMinutes >= openMinutes && totalMinutes <= closeMinutes;

  return {
    isOpen,
    isWeekend,
    openMinutes,
    closeMinutes,
    config,
    message: isOpen ? "" : getOrderWindowMessage(config),
  };
}
