export type UserRole = 'owner' | 'staff' | 'customer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export interface SessionUser extends User {
  token?: string;
}
