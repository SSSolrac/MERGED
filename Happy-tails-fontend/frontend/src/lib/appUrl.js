const LOCAL_DEV_APP_ORIGIN = "http://127.0.0.1:5173";
const LOCALHOST_HOSTNAMES = new Set(["127.0.0.1", "0.0.0.0", "localhost"]);

function asNonEmptyText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeOrigin(value) {
  const text = asNonEmptyText(value);
  if (!text) return "";

  try {
    return new URL(text).origin;
  } catch {
    return "";
  }
}

function readBrowserOrigin(locationLike) {
  if (!locationLike) return "";
  return normalizeOrigin(locationLike.origin || locationLike.href || "");
}

export function isLocalDevelopmentOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  try {
    const { hostname } = new URL(normalized);
    return LOCALHOST_HOSTNAMES.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function getPublicAppOrigin({ env = import.meta.env ?? {}, location = typeof window !== "undefined" ? window.location : null } = {}) {
  const configuredOrigin = normalizeOrigin(env?.VITE_APP_URL);
  const browserOrigin = readBrowserOrigin(location);
  const isProdBuild = Boolean(env?.PROD);

  if (isProdBuild) {
    if (configuredOrigin && !isLocalDevelopmentOrigin(configuredOrigin)) return configuredOrigin;
    if (browserOrigin && !isLocalDevelopmentOrigin(browserOrigin)) return browserOrigin;

    if (configuredOrigin && isLocalDevelopmentOrigin(configuredOrigin)) {
      throw new Error("VITE_APP_URL cannot point to localhost in production. Set it to your deployed app URL.");
    }

    throw new Error("VITE_APP_URL must be set to your deployed app URL in production.");
  }

  if (configuredOrigin) return configuredOrigin;
  if (browserOrigin) return browserOrigin;
  return LOCAL_DEV_APP_ORIGIN;
}

export function buildPublicAppUrl(pathname = "/", options) {
  const origin = getPublicAppOrigin(options);
  const nextPath = asNonEmptyText(pathname) || "/";
  const normalizedPath = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return new URL(normalizedPath, `${origin}/`).toString();
}

export { LOCAL_DEV_APP_ORIGIN };
