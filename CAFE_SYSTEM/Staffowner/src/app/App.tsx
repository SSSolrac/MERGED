import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { toast, Toaster } from 'sonner';
import { router } from '@/app/router';
import { AuthProvider } from '@/auth/AuthProvider';
import { getErrorMessage } from '@/lib/errors';

export default function App() {
  useEffect(() => {
    let lastAt = 0;
    let lastMessage = '';

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason, 'Something went wrong.');
      console.error('Unhandled promise rejection', event.reason);

      const now = Date.now();
      if (message === lastMessage && now - lastAt < 1500) return;
      lastAt = now;
      lastMessage = message;
      toast.error(message);
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster richColors />
    </AuthProvider>
  );
}
