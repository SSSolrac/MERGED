export interface LoginHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  role: string;
  loginTime: string;
  logoutTime?: string | null;
  ipAddress?: string | null;
  device?: string | null;
  loginStatus: string;
}

export interface LoginHistoryFilters {
  query: string;
  role: string;
  status: string;
  date: string;
  page: number;
  pageSize: number;
}
