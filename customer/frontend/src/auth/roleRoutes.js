import { normalizeAppRole } from "../services/auth/getCurrentUserRole";

export function getSafeRouteForRole(role) {
  const normalized = normalizeAppRole(role, null);
  if (normalized === "owner") return "/owner/dashboard";
  if (normalized === "staff") return "/staff/orders";
  return "/";
}

export function roleCanAccess(role, allowedRoles = []) {
  const normalized = normalizeAppRole(role, null);
  if (!normalized) return false;
  return allowedRoles.includes(normalized);
}
