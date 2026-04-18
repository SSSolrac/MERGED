import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { authService } from '@/services/authService';
import { businessSettingsService } from '@/services/businessSettingsService';
import {
  campaignAnnouncementService,
  type CampaignAnnouncement,
  type CampaignAnnouncementSource,
} from '@/services/campaignAnnouncementService';
import { staffService, type StaffMember } from '@/services/staffService';

const toSimpleTickerAnnouncement = (entry: CampaignAnnouncement): CampaignAnnouncement => {
  const title = String(entry.title || '').trim();
  const message = String(entry.message || '').trim();
  return {
    ...entry,
    title: '',
    ctaText: '',
    ctaLink: '',
    startAt: String(entry.startAt || '').trim(),
    endAt: String(entry.endAt || '').trim(),
    isActive: entry.isActive !== false,
    message: message || title,
  };
};

export const SettingsPage = () => {
  const { user } = useAuth();
  const [cafeName, setCafeName] = useState('');
  const [hours, setHours] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [facebookHandle, setFacebookHandle] = useState('');
  const [instagramHandle, setInstagramHandle] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const [enableQrph, setEnableQrph] = useState(false);
  const [enableGcash, setEnableGcash] = useState(false);
  const [enableMariBank, setEnableMariBank] = useState(false);
  const [enableBdo, setEnableBdo] = useState(false);
  const [enableCash, setEnableCash] = useState(false);

  const [dineIn, setDineIn] = useState(false);
  const [pickup, setPickup] = useState(false);
  const [takeout, setTakeout] = useState(false);
  const [delivery, setDelivery] = useState(false);

  const [deliveryRadius, setDeliveryRadius] = useState(0);
  const [serviceFeePct, setServiceFeePct] = useState(0);
  const [taxPct, setTaxPct] = useState(0);
  const [kitchenCutoff, setKitchenCutoff] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(true);
  const [staffLoadError, setStaffLoadError] = useState('');
  const [campaignAnnouncements, setCampaignAnnouncements] = useState<CampaignAnnouncement[]>([]);
  const [announcementSource, setAnnouncementSource] = useState<CampaignAnnouncementSource>('fallback');
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [isSavingAnnouncements, setIsSavingAnnouncements] = useState(false);

  const toDateTimeLocal = (value: string): string => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    const hh = String(parsed.getHours()).padStart(2, '0');
    const min = String(parsed.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const fromDateTimeLocal = (value: string): string => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
  };

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        setIsLoadingSettings(true);
        const settings = await businessSettingsService.getBusinessSettings();
        if (cancelled) return;
        setCafeName(settings.cafeName);
        setHours(settings.businessHours);
        setContact(settings.contactNumber);
        setEmail(settings.businessEmail);
        setAddress(settings.cafeAddress);
        setFacebookHandle(settings.facebookHandle);
        setInstagramHandle(settings.instagramHandle);
        setLogoUrl(settings.logoUrl);
        setEnableQrph(settings.enableQrph);
        setEnableGcash(settings.enableGcash);
        setEnableMariBank(settings.enableMariBank);
        setEnableBdo(settings.enableBdo);
        setEnableCash(settings.enableCash);
        setDineIn(settings.enableDineIn);
        setPickup(settings.enablePickup);
        setTakeout(settings.enableTakeout);
        setDelivery(settings.enableDelivery);
        setDeliveryRadius(settings.deliveryRadiusKm);
        setServiceFeePct(settings.serviceFeePct);
        setTaxPct(settings.taxPct);
        setKitchenCutoff(settings.kitchenCutoff);
      } catch (error) {
        if (cancelled) return;
        toast.error(getErrorMessage(error, 'Unable to load business settings.'));
      } finally {
        if (cancelled) return;
        setIsLoadingSettings(false);
      }
    };

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAnnouncements = async () => {
      try {
        setIsLoadingAnnouncements(true);
        const result = await campaignAnnouncementService.listCampaignAnnouncements();
        if (cancelled) return;
        setCampaignAnnouncements(result.items.map(toSimpleTickerAnnouncement));
        setAnnouncementSource(result.source);
      } catch (error) {
        if (cancelled) return;
        toast.error(getErrorMessage(error, 'Unable to load homepage banner announcements.'));
      } finally {
        if (cancelled) return;
        setIsLoadingAnnouncements(false);
      }
    };

    void loadAnnouncements();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStaff = async () => {
      try {
        setIsLoadingStaff(true);
        setStaffLoadError('');
        const rows = await staffService.listStaffMembers();
        if (cancelled) return;
        setStaffMembers(rows);
      } catch (error) {
        if (cancelled) return;
        setStaffLoadError(getErrorMessage(error, 'Unable to load staff members.'));
      } finally {
        if (cancelled) return;
        setIsLoadingStaff(false);
      }
    };

    void loadStaff();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const password = newPassword.trim();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }

    try {
      setIsUpdatingPassword(true);
      await authService.updatePassword(password);
      setNewPassword('');
      toast.success('Password updated.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to update password.'));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleAddStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setIsAddingStaff(true);
      const saved = await staffService.addStaffMemberByEmail({
        email: staffEmail,
        name: staffName,
      });

      setStaffMembers((current) => [saved, ...current.filter((member) => member.id !== saved.id)]);
      setStaffName('');
      setStaffEmail('');
      toast.success(`${saved.email} now has staff access.`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to add staff member.'));
    } finally {
      setIsAddingStaff(false);
    }
  };

  const handleSaveBusinessSettings = async () => {
    try {
      setIsSavingSettings(true);
      const saved = await businessSettingsService.saveBusinessSettings({
        cafeName,
        businessHours: hours,
        contactNumber: contact,
        businessEmail: email,
        cafeAddress: address,
        facebookHandle,
        instagramHandle,
        logoUrl,
        enableQrph,
        enableGcash,
        enableMariBank,
        enableBdo,
        enableCash,
        enableDineIn: dineIn,
        enablePickup: pickup,
        enableTakeout: takeout,
        enableDelivery: delivery,
        deliveryRadiusKm: deliveryRadius,
        serviceFeePct,
        taxPct,
        kitchenCutoff,
      });

      setCafeName(saved.cafeName);
      setHours(saved.businessHours);
      setContact(saved.contactNumber);
      setEmail(saved.businessEmail);
      setAddress(saved.cafeAddress);
      setFacebookHandle(saved.facebookHandle);
      setInstagramHandle(saved.instagramHandle);
      setLogoUrl(saved.logoUrl);
      setEnableQrph(saved.enableQrph);
      setEnableGcash(saved.enableGcash);
      setEnableMariBank(saved.enableMariBank);
      setEnableBdo(saved.enableBdo);
      setEnableCash(saved.enableCash);
      setDineIn(saved.enableDineIn);
      setPickup(saved.enablePickup);
      setTakeout(saved.enableTakeout);
      setDelivery(saved.enableDelivery);
      setDeliveryRadius(saved.deliveryRadiusKm);
      setServiceFeePct(saved.serviceFeePct);
      setTaxPct(saved.taxPct);
      setKitchenCutoff(saved.kitchenCutoff);
      toast.success('Business settings saved.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to save business settings.'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setIsUploadingLogo(true);
      const uploadedUrl = await businessSettingsService.uploadBrandingAsset(file);
      setLogoUrl(uploadedUrl);
      toast.success('Branding image uploaded.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to upload branding image.'));
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleAnnouncementChange = <K extends keyof CampaignAnnouncement>(
    id: string,
    key: K,
    value: CampaignAnnouncement[K]
  ) => {
    setCampaignAnnouncements((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [key]: value, updatedAt: new Date().toISOString() } : entry
      )
    );
  };

  const handleAddAnnouncement = () => {
    setCampaignAnnouncements((current) => [...current, campaignAnnouncementService.createAnnouncementDraft()]);
  };

  const handleRemoveAnnouncement = (id: string) => {
    setCampaignAnnouncements((current) => current.filter((entry) => entry.id !== id));
  };

  const handleSaveAnnouncements = async () => {
    try {
      setIsSavingAnnouncements(true);
      const normalized = campaignAnnouncements.map((entry) => ({
        ...entry,
        title: '',
        ctaText: '',
        ctaLink: '',
        startAt: String(entry.startAt || '').trim(),
        endAt: String(entry.endAt || '').trim(),
        isActive: entry.isActive !== false,
        message: String(entry.message || '').trim(),
      }));
      const result = await campaignAnnouncementService.saveCampaignAnnouncements(normalized);
      setCampaignAnnouncements(result.items.map(toSimpleTickerAnnouncement));
      setAnnouncementSource(result.source);
      toast.success('Homepage banner announcements saved.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to save homepage banner announcements.'));
    } finally {
      setIsSavingAnnouncements(false);
    }
  };

  const isBusinessSettingsBusy = isLoadingSettings || isSavingSettings || isUploadingLogo;
  const isAnnouncementsBusy = isLoadingAnnouncements || isSavingAnnouncements;
  const announcementSourceLabel =
    announcementSource === 'campaign_table'
      ? 'campaign_announcements table'
      : announcementSource === 'business_settings'
      ? 'business_settings JSON'
      : 'fallback/default data';

  return (
    <div className="space-y-4 max-w-4xl">
      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h2 className="text-xl font-semibold">Business Settings</h2>
        <p className="text-sm text-[#6B7280]">Configure cafe operations and owner-level controls.</p>
        {isLoadingSettings ? <p className="text-sm text-[#6B7280]">Loading business settings...</p> : null}

        <label className="block text-sm">
          Cafe Name
          <input
            className="block border rounded mt-1 px-2 py-1 w-full"
            value={cafeName}
            onChange={(e) => setCafeName(e.target.value)}
            disabled={isBusinessSettingsBusy}
          />
        </label>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="block text-sm">
            Business Hours
            <textarea
              className="block border rounded mt-1 px-2 py-1 w-full min-h-[72px]"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              disabled={isBusinessSettingsBusy}
            />
          </label>
          <label className="block text-sm">
            Contact Number
            <input
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              disabled={isBusinessSettingsBusy}
            />
          </label>
          <label className="block text-sm">
            Business Email
            <input
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isBusinessSettingsBusy}
            />
          </label>
          <label className="block text-sm">
            Cafe Address
            <textarea
              className="block border rounded mt-1 px-2 py-1 w-full min-h-[72px]"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isBusinessSettingsBusy}
            />
          </label>
          <label className="block text-sm">
            Facebook Page
            <input
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={facebookHandle}
              onChange={(e) => setFacebookHandle(e.target.value)}
              disabled={isBusinessSettingsBusy}
            />
          </label>
          <label className="block text-sm">
            Instagram Handle
            <input
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              disabled={isBusinessSettingsBusy}
            />
          </label>
          <div className="block text-sm md:col-span-2">
            <span className="block">Logo / Branding picture</span>
            <div className="mt-1 flex flex-wrap items-center gap-3 rounded border p-3">
              <input
                type="file"
                accept="image/*"
                className="block text-sm"
                onChange={handleLogoUpload}
                disabled={isBusinessSettingsBusy}
              />
              <span className="text-xs text-[#6B7280]">
                {isUploadingLogo ? 'Uploading...' : 'Upload a logo or branding image for the customer storefront.'}
              </span>
              {logoUrl ? (
                <img src={logoUrl} alt="Current cafe branding" className="h-16 w-16 rounded border object-cover" />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h3 className="font-medium">Homepage Banner Announcements</h3>
        <p className="text-sm text-[#6B7280]">
          Enter the exact text you want to scroll in the continuous left-moving ticker over the hero section.
        </p>
        <p className="text-xs text-[#6B7280]">
          You can optionally schedule start/end dates and toggle each announcement active/inactive.
        </p>
        <p className="text-xs text-[#6B7280]">Current data source: {announcementSourceLabel}</p>
        {isLoadingAnnouncements ? <p className="text-sm text-[#6B7280]">Loading announcements...</p> : null}

        {!isLoadingAnnouncements && !campaignAnnouncements.length ? (
          <p className="text-sm text-[#6B7280]">No announcements yet. Add one to start the ticker.</p>
        ) : null}

        <div className="space-y-3">
          {campaignAnnouncements.map((announcement, index) => (
            <article key={announcement.id} className="rounded border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Announcement {index + 1}</p>
                <button
                  type="button"
                  className="rounded border px-2 py-1 text-xs"
                  onClick={() => handleRemoveAnnouncement(announcement.id)}
                  disabled={isAnnouncementsBusy}
                >
                  Remove
                </button>
              </div>

              <div className="grid md:grid-cols-1 gap-3">
                <label className="block text-sm">
                  Text To Display
                  <textarea
                    className="block border rounded mt-1 px-2 py-1 w-full min-h-[72px]"
                    value={announcement.message}
                    onChange={(event) => handleAnnouncementChange(announcement.id, 'message', event.target.value)}
                    placeholder="Example: Try our new Chicken Fingers"
                    disabled={isAnnouncementsBusy}
                  />
                </label>
                <div className="grid md:grid-cols-2 gap-3">
                  <label className="block text-sm">
                    Start Date (optional)
                    <input
                      type="datetime-local"
                      className="block border rounded mt-1 px-2 py-1 w-full"
                      value={toDateTimeLocal(announcement.startAt)}
                      onChange={(event) =>
                        handleAnnouncementChange(announcement.id, 'startAt', fromDateTimeLocal(event.target.value))
                      }
                      disabled={isAnnouncementsBusy}
                    />
                  </label>
                  <label className="block text-sm">
                    End Date (optional)
                    <input
                      type="datetime-local"
                      className="block border rounded mt-1 px-2 py-1 w-full"
                      value={toDateTimeLocal(announcement.endAt)}
                      onChange={(event) =>
                        handleAnnouncementChange(announcement.id, 'endAt', fromDateTimeLocal(event.target.value))
                      }
                      disabled={isAnnouncementsBusy}
                    />
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={announcement.isActive}
                    onChange={(event) => handleAnnouncementChange(announcement.id, 'isActive', event.target.checked)}
                    disabled={isAnnouncementsBusy}
                  />
                  Active
                </label>
              </div>

              <p className="text-xs text-[#6B7280]">
                This text becomes part of the moving banner exactly as written.
              </p>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border px-3 py-2"
            onClick={handleAddAnnouncement}
            disabled={isAnnouncementsBusy}
          >
            Add announcement
          </button>
          <button
            type="button"
            className="rounded bg-[#FFB6C1] text-[#1F2937] px-3 py-2"
            onClick={handleSaveAnnouncements}
            disabled={isAnnouncementsBusy}
          >
            {isSavingAnnouncements ? 'Saving...' : 'Save announcements'}
          </button>
        </div>
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h3 className="font-medium">Payment & Service Rules</h3>
        <p className="text-sm text-[#6B7280]">
          Customer checkout reads these availability toggles from <code>business_settings</code>. Delivery coverage itself is
          managed from the dedicated Delivery Coverage page.
        </p>
        <div className="space-y-2">
          <p className="text-sm font-medium">Available order types</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label><input type="checkbox" checked={dineIn} onChange={(e) => setDineIn(e.target.checked)} /> Dine-in</label>
            <label><input type="checkbox" checked={pickup} onChange={(e) => setPickup(e.target.checked)} /> Pickup</label>
            <label><input type="checkbox" checked={takeout} onChange={(e) => setTakeout(e.target.checked)} /> Takeout</label>
            <label><input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> Delivery</label>
          </div>
          <p className="text-xs text-[#6B7280]">
            Polygon coverage, fixed barangay labels, and allowed puroks are controlled in Admin &gt; Delivery Coverage. The
            legacy radius field remains in the schema for compatibility but does not drive polygon validation anymore.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Enabled payment methods</p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label><input type="checkbox" checked={enableQrph} onChange={(e) => setEnableQrph(e.target.checked)} /> QRPH</label>
          <label><input type="checkbox" checked={enableGcash} onChange={(e) => setEnableGcash(e.target.checked)} /> GCash</label>
          <label><input type="checkbox" checked={enableMariBank} onChange={(e) => setEnableMariBank(e.target.checked)} /> MariBank</label>
          <label><input type="checkbox" checked={enableBdo} onChange={(e) => setEnableBdo(e.target.checked)} /> BDO</label>
          <label><input type="checkbox" checked={enableCash} onChange={(e) => setEnableCash(e.target.checked)} /> Cash</label>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm">
            Service Fee (%)
            <input type="number" min={0} className="block border rounded mt-1 px-2 py-1 w-full" value={serviceFeePct} onChange={(e) => setServiceFeePct(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Tax (%)
            <input type="number" min={0} className="block border rounded mt-1 px-2 py-1 w-full" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} />
          </label>
          <label className="text-sm">
            Kitchen cut-off time
            <input type="time" className="block border rounded mt-1 px-2 py-1 w-full" value={kitchenCutoff} onChange={(e) => setKitchenCutoff(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h3 className="font-medium">Owner Account</h3>
        <p className="text-sm text-[#6B7280]">Manage owner credentials in this tab.</p>
        <p className="text-sm text-[#6B7280]">{user?.email || 'No owner email loaded.'}</p>
        <form onSubmit={handlePasswordChange} className="space-y-2 max-w-lg">
          <input
            required
            minLength={8}
            type="password"
            placeholder="New password"
            className="border rounded px-2 py-1 w-full"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <button className="rounded bg-[#FFB6C1] text-[#1F2937] px-3 py-2" disabled={isUpdatingPassword}>
            {isUpdatingPassword ? 'Updating...' : 'Change password'}
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h3 className="font-medium">Add Staff Member</h3>
        <p className="text-sm text-[#6B7280]">Grant staff access to an existing account by email.</p>
        <form className="grid md:grid-cols-3 gap-3 items-end" onSubmit={handleAddStaff}>
          <label className="text-sm">
            Staff Name (optional)
            <input
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={staffName}
              onChange={(event) => setStaffName(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Staff Email
            <input
              required
              type="email"
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={staffEmail}
              onChange={(event) => setStaffEmail(event.target.value)}
            />
          </label>
          <button className="rounded bg-[#FFB6C1] text-[#1F2937] px-3 py-2 h-10" disabled={isAddingStaff}>
            {isAddingStaff ? 'Adding...' : 'Add Staff'}
          </button>
        </form>
        <p className="text-xs text-[#6B7280]">If no account is found, ask them to sign up first, then add them here.</p>
        {staffLoadError ? <p className="text-sm text-red-600">{staffLoadError}</p> : null}
        {isLoadingStaff ? (
          <p className="text-sm text-[#6B7280]">Loading current staff members...</p>
        ) : (
          <div className="space-y-2">
            {!staffMembers.length ? <p className="text-sm text-[#6B7280]">No staff members found.</p> : null}
            {staffMembers.map((member) => (
              <div key={member.id} className="border rounded p-2 text-sm flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{member.name || 'Unnamed staff'}</p>
                  <p className="text-[#6B7280]">{member.email}</p>
                </div>
                <div className="text-xs text-[#6B7280]">{member.isActive ? 'Active' : 'Inactive'}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button
        className="rounded bg-[#FFB6C1] text-[#1F2937] px-3 py-2"
        onClick={handleSaveBusinessSettings}
        disabled={isBusinessSettingsBusy}
      >
        {isSavingSettings ? 'Saving...' : 'Save business settings'}
      </button>
    </div>
  );
};
