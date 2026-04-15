import { FormEvent } from 'react';
import { toast } from 'sonner';
import { Image } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

export const ProfilePage = () => {
  const { user } = useAuth();

  const updatePassword = (event: FormEvent) => {
    event.preventDefault();
    toast.success('Password updated');
  };

  return (
    <div className="rounded-lg border bg-white dark:bg-slate-800 p-4 max-w-2xl">
      <h2 className="text-xl font-semibold mb-4">Profile</h2>
      <div className="flex items-center gap-4 mb-4">
        <Image alt={user?.name} src={user?.avatar} className="h-16 w-16 rounded-full" />
        <div><p>{user?.name}</p><p className="text-sm text-[#6B7280]">{user?.email}</p></div>
      </div>
      <form onSubmit={updatePassword} className="space-y-2">
        <input required type="password" placeholder="New password" className="border rounded px-2 py-1 w-full" />
        <button className="rounded bg-[#FFB6C1] text-[#1F2937] px-3 py-2">Change password</button>
      </form>
    </div>
  );
};
