import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/lib/errors';
import { authService } from '@/services/authService';
import { businessSettingsService } from '@/services/businessSettingsService';
import { staffService, type StaffMember } from '@/services/staffService';

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

  const isBusinessSettingsBusy = isLoadingSettings || isSavingSettings;

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
          <label className="block text-sm md:col-span-2">
            Logo URL / Branding asset
            <input
              className="block border rounded mt-1 px-2 py-1 w-full"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              disabled={isBusinessSettingsBusy}
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border bg-white dark:bg-slate-800 p-4 space-y-3">
        <h3 className="font-medium">Payment & Service Rules</h3>
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
