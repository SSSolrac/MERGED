export type DailyMenuItem = {
  id: string;
  dailyMenuId: string;
  menuItemId: string;
  createdAt: string;
};

export type DailyMenu = {
  id: string;
  menuDate: string;
  isPublished: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items: DailyMenuItem[];
};
