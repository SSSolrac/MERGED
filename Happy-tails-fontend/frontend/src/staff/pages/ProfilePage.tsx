import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Image } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { authService } from '@/services/authService';
import { profileService } from '@/services/profileService';

export const ProfilePage = () => {
  const { user, refreshProfile, refreshSession } = useAuth();
  const canEditJobTitle = user?.role === 'owner';
  const canManageCredentials = user?.role === 'owner';
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [nextEmail, setNextEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const pendingEmail = String(user?.pendingEmail || '').trim();

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      try {
        setIsLoading(true);
        const profile = await profileService.getCurrentProfile();
        if (cancelled) return;
        setName(profile.name);
        setJobTitle(profile.jobTitle);
        setAvatarUrl(profile.avatarUrl || '');
      } catch (error) {
        if (cancelled) return;
        toast.error(getErrorMessage(error, 'Unable to load your profile.'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const avatarFallback = useMemo(() => {
    const source = String(name || user?.name || user?.email || 'S').trim();
    const parts = source.split(/\s+/).filter(Boolean).slice(0, 2);
    return (parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'S').slice(0, 2);
  }, [name, user?.email, user?.name]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setIsSavingProfile(true);
      const saved = await profileService.saveCurrentProfile({
        name,
        jobTitle,
        avatarUrl: avatarUrl || null,
      });
      setName(saved.name);
      setJobTitle(saved.jobTitle);
      setAvatarUrl(saved.avatarUrl || '');
      await refreshProfile?.();
      toast.success('Profile updated.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to save your profile.'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManageCredentials) {
      toast.error('Only owners can change staff-side passwords.');
      return;
    }
    try {
      setIsUpdatingPassword(true);
      await authService.updatePassword(password);
      setPassword('');
      toast.success('Password updated.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to update password.'));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const updateEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManageCredentials) {
      toast.error('Only owners can change staff-side email addresses.');
      return;
    }

    const normalizedEmail = nextEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error('Enter the new email address you want to use.');
      return;
    }
    if (normalizedEmail === String(user?.email || '').trim().toLowerCase()) {
      toast.error('That email is already active on this owner account.');
      return;
    }
    if (pendingEmail && normalizedEmail === pendingEmail.toLowerCase()) {
      toast.error('That email is already waiting for confirmation.');
      return;
    }

    try {
      setIsUpdatingEmail(true);
      const updatedUser = await authService.updateEmail(normalizedEmail);
      const syncedUser = (await refreshSession?.().catch(() => null)) || updatedUser;
      await refreshProfile?.().catch(() => null);
      setNextEmail('');

      if (syncedUser?.new_email) {
        toast.success(`Confirmation email sent to ${syncedUser.new_email}. Follow the link in that inbox to finish the change.`);
      } else if (syncedUser?.email) {
        toast.success(`Email updated to ${syncedUser.email}.`);
      } else {
        toast.success('Email update started successfully.');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to update your email.'));
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setIsUploadingImage(true);
      const nextAvatarUrl = await profileService.uploadProfileImage(file);
      setAvatarUrl(nextAvatarUrl);
      toast.success('Profile photo uploaded. Save your profile to keep it.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to upload your profile photo.'));
    } finally {
      setIsUploadingImage(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Profile</h2>
          <p className="text-sm text-[#6B7280]">
            {canEditJobTitle
              ? 'Set the name, job title, and photo shown in the staff workspace.'
              : 'Set the name and photo shown in the staff workspace.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed p-4">
          {avatarUrl ? (
            <Image alt={name || user?.name || 'Profile'} src={avatarUrl} className="h-20 w-20 rounded-full border object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFE4E8] text-lg font-semibold text-[#D44F7F]">
              {avatarFallback}
            </div>
          )}
          <div className="space-y-2">
            <div>
              <p className="font-medium text-[#1F2937]">{name || user?.name || 'Staff / Owner'}</p>
              <p className="text-sm text-[#6B7280]">{jobTitle || (user?.role === 'owner' ? 'Owner' : 'Staff')}</p>
              <p className="text-xs text-[#94A3B8]">{user?.email}</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm">
              <span>{isUploadingImage ? 'Uploading...' : 'Upload profile photo'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploadingImage || isSavingProfile} />
            </label>
          </div>
        </div>

        {isLoading ? <p className="text-sm text-[#6B7280]">Loading profile...</p> : null}

        <form onSubmit={saveProfile} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Name
            <input
              className="mt-1 block w-full rounded border px-2 py-1"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isLoading || isSavingProfile}
            />
          </label>
          {canEditJobTitle ? (
            <label className="text-sm">
              Job title
              <input
                className="mt-1 block w-full rounded border px-2 py-1"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder={user?.role === 'owner' ? 'Owner' : 'Staff'}
                disabled={isLoading || isSavingProfile}
              />
            </label>
          ) : null}
          {canManageCredentials ? (
            <label className="text-sm md:col-span-2">
              Email
              <input className="mt-1 block w-full rounded border px-2 py-1 bg-slate-50" value={user?.email || ''} readOnly />
            </label>
          ) : (
            <div className="text-sm md:col-span-2">
              <p className="font-medium text-[#1F2937]">Email</p>
              <p className="mt-1 rounded border bg-slate-50 px-3 py-2 text-[#6B7280]">{user?.email || 'No email assigned'}</p>
            </div>
          )}
          <div className="md:col-span-2">
            <button className="rounded bg-[#FFB6C1] px-3 py-2 text-[#1F2937]" disabled={isLoading || isSavingProfile} type="submit">
              {isSavingProfile ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>
      </section>

      {canManageCredentials ? (
        <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
          <div>
            <h3 className="font-medium">Email</h3>
            <p className="text-sm text-[#6B7280]">Change the owner sign-in email using Supabase email confirmation.</p>
          </div>
          <form onSubmit={updateEmail} className="space-y-3">
            <label className="text-sm block">
              Current email
              <input className="mt-1 block w-full rounded border px-2 py-1 bg-slate-50" value={user?.email || ''} readOnly />
            </label>
            <label className="text-sm block">
              New email
              <input
                required
                type="email"
                className="mt-1 block w-full rounded border px-2 py-1"
                placeholder="owner@happytails.com"
                value={nextEmail}
                onChange={(event) => setNextEmail(event.target.value)}
                disabled={isUpdatingEmail}
              />
            </label>
            {pendingEmail ? (
              <p className="rounded border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-sm text-[#9A3412]">
                Pending confirmation: {pendingEmail}. Finish the email link flow before requesting another change.
              </p>
            ) : (
              <p className="text-sm text-[#6B7280]">
                We will send a confirmation link to the new email and route it back to this production app.
              </p>
            )}
            <button className="rounded bg-[#FFB6C1] px-3 py-2 text-[#1F2937]" disabled={isUpdatingEmail}>
              {isUpdatingEmail ? 'Sending confirmation...' : 'Change email'}
            </button>
          </form>
        </section>
      ) : null}

      {canManageCredentials ? (
        <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
          <div>
            <h3 className="font-medium">Password</h3>
            <p className="text-sm text-[#6B7280]">Update your password for this account.</p>
          </div>
          <form onSubmit={updatePassword} className="space-y-2">
            <input
              required
              minLength={8}
              type="password"
              placeholder="New password"
              className="w-full rounded border px-2 py-1"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="rounded bg-[#FFB6C1] px-3 py-2 text-[#1F2937]" disabled={isUpdatingPassword}>
              {isUpdatingPassword ? 'Updating...' : 'Change password'}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
};
