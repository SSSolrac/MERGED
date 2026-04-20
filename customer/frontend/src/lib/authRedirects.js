const AUTH_REDIRECT_KEYS = [
  "access_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "expires_at",
  "expires_in",
  "provider_refresh_token",
  "provider_token",
  "refresh_token",
  "token_hash",
  "token_type",
  "type",
];

function asNonEmptyText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toSearchParams(value) {
  const text = asNonEmptyText(value);
  if (!text) return new URLSearchParams();
  const normalized = text.startsWith("?") || text.startsWith("#") ? text.slice(1) : text;
  return new URLSearchParams(normalized);
}

function readParam(key, searchParams, hashParams) {
  return asNonEmptyText(searchParams.get(key) || hashParams.get(key) || "");
}

export function readAuthRedirectState(locationLike = typeof window !== "undefined" ? window.location : null) {
  const href = asNonEmptyText(locationLike?.href);
  const searchParams = toSearchParams(locationLike?.search);
  const hashParams = toSearchParams(locationLike?.hash);
  const type = readParam("type", searchParams, hashParams).toLowerCase();
  const code = readParam("code", searchParams, hashParams);
  const tokenHash = readParam("token_hash", searchParams, hashParams);
  const accessToken = readParam("access_token", searchParams, hashParams);
  const refreshToken = readParam("refresh_token", searchParams, hashParams);
  const error = readParam("error", searchParams, hashParams);
  const errorCode = readParam("error_code", searchParams, hashParams);
  const errorDescription = readParam("error_description", searchParams, hashParams);

  return {
    href,
    type,
    code,
    tokenHash,
    accessToken,
    refreshToken,
    error,
    errorCode,
    errorDescription,
    hasAuthParams: Boolean(type || code || tokenHash || accessToken || refreshToken || error || errorCode),
  };
}

export function isAuthActionLink(state) {
  return Boolean(state?.hasAuthParams);
}

export function clearAuthRedirectState(locationLike = typeof window !== "undefined" ? window.location : null, historyLike = typeof window !== "undefined" ? window.history : null) {
  const href = asNonEmptyText(locationLike?.href);
  if (!href || typeof historyLike?.replaceState !== "function") return;

  const url = new URL(href);
  AUTH_REDIRECT_KEYS.forEach((key) => url.searchParams.delete(key));

  const hashParams = toSearchParams(url.hash);
  AUTH_REDIRECT_KEYS.forEach((key) => hashParams.delete(key));
  const nextHash = hashParams.toString();
  url.hash = nextHash ? `#${nextHash}` : "";

  historyLike.replaceState(historyLike.state, "", url.toString());
}

export function buildAuthActionErrorMessage(source, expectedType = "recovery") {
  const actionLabel = expectedType === "email_change" ? "email change" : "password reset";
  const code = asNonEmptyText(source?.errorCode || source?.code).toLowerCase();
  const description = asNonEmptyText(source?.errorDescription || source?.message).toLowerCase();

  if (code === "otp_expired" || description.includes("expired")) {
    return `This ${actionLabel} link is invalid or has expired. Request a new link and use it right away.`;
  }

  if (code === "access_denied" || description.includes("access denied")) {
    return `This ${actionLabel} link was denied or already used. Request a fresh link and try again.`;
  }

  if (description.includes("invalid") || description.includes("verification") || description.includes("token")) {
    return `This ${actionLabel} link is invalid or incomplete. Request a new link and try again.`;
  }

  if (expectedType === "email_change") {
    return "We could not complete that email change link. Request a new confirmation email from your profile settings.";
  }

  return "We could not verify that password reset link. Request a new reset email and try again.";
}
