import { useCallback, useEffect, useMemo, useState } from 'react';
import { notificationService } from '@/services/notificationService';
import type { StaffOwnerNotification } from '@/types/notification';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<StaffOwnerNotification[]>([]);

  const refresh = useCallback(() => {
    setNotifications(notificationService.list());
  }, []);

  const markRead = useCallback((id: string) => {
    notificationService.markRead(id);
    refresh();
  }, [refresh]);

  const markAllRead = useCallback(() => {
    notificationService.markAllRead();
    refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unreadCount = useMemo(() => notifications.filter((row) => !row.isRead).length, [notifications]);
  const unreadNotifications = useMemo(() => notifications.filter((row) => !row.isRead), [notifications]);
  const readNotifications = useMemo(() => notifications.filter((row) => row.isRead), [notifications]);

  return { notifications, unreadNotifications, readNotifications, unreadCount, refresh, markRead, markAllRead };
};
