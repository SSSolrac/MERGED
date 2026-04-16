import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import LoyaltyCard from "../components/loyalty/LoyaltyCard";
import { FREE_LATTE_CHOICES, getCustomerLoyaltyData, isLatteReward, redeemLoyaltyReward } from "../services/loyaltyService";
import { getCustomerProfile, saveCustomerProfile } from "../services/profileService";
import { getActiveDeliveryConfig } from "../services/deliveryAreaService";
import { buildDeliveryAddress, parseDeliveryAddress } from "../utils/deliveryAddress";
import { useAuth } from "../context/AuthContext";
import "./Profile.css";

const blankProfile = {
  name: "",
  phone: "",
  email: "",
  addresses: [],
  preferences: {},
};

const blankAddressFields = {
  houseDetails: "",
  selectedPurokId: "",
};

function Profile({ linkComponent: LinkComponent, view = "info" }) {
  const { user, session } = useAuth();
  const [formData, setFormData] = useState(blankProfile);
  const [addressFields, setAddressFields] = useState(blankAddressFields);
  const [deliveryConfig, setDeliveryConfig] = useState(null);
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDeliveryConfig, setIsLoadingDeliveryConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [redeemingRewardId, setRedeemingRewardId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});

  const loadLoyaltyData = async () => {
    const data = await getCustomerLoyaltyData();
    setLoyaltyData(data);
  };

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setIsLoading(true);
      setIsLoadingDeliveryConfig(true);
      setError("");

      try {
        const [profile, config] = await Promise.all([
          getCustomerProfile(),
          getActiveDeliveryConfig({ force: true }),
        ]);

        if (cancelled) return;

        const mergedProfile = {
          ...blankProfile,
          email: user?.email || "",
          ...profile,
        };
        const primaryAddress = Array.isArray(mergedProfile.addresses) ? String(mergedProfile.addresses[0] || "") : "";
        const parsedAddress = parseDeliveryAddress(primaryAddress, config);

        setDeliveryConfig(config);
        setFormData(mergedProfile);
        setAddressFields({
          houseDetails: parsedAddress.houseDetails || "",
          selectedPurokId: parsedAddress.selectedPurokId || "",
        });

        await loadLoyaltyData();
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError?.message || "We couldn't load your account details right now.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setIsLoadingDeliveryConfig(false);
        }
      }
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const activePuroks = useMemo(
    () =>
      (Array.isArray(deliveryConfig?.puroks) ? deliveryConfig.puroks : []).filter(
        (purok) => purok?.isActive !== false && String(purok?.deliveryStatus || "active").toLowerCase() !== "inactive"
      ),
    [deliveryConfig?.puroks]
  );

  const canEditDeliveryAddress =
    deliveryConfig &&
    deliveryConfig.isActive !== false &&
    String(deliveryConfig.deliveryStatus || "active").toLowerCase() !== "inactive" &&
    activePuroks.length > 0;

  const addressInputsDisabled = isSaving || isLoadingDeliveryConfig || !canEditDeliveryAddress;

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
    setErrors((prev) => ({ ...prev, [event.target.name]: "" }));
    setMessage("");
  };

  const updateAddressFields = (nextFields) => {
    const houseDetails = String(nextFields.houseDetails || "");
    const selectedPurokId = String(nextFields.selectedPurokId || "");
    const matchedPurok = activePuroks.find((purok) => String(purok.id) === selectedPurokId) || null;
    const composedAddress =
      canEditDeliveryAddress && matchedPurok
        ? buildDeliveryAddress({
            houseDetails,
            purokName: matchedPurok.purokName,
            fixedBarangayName: deliveryConfig?.fixedBarangayName,
            city: deliveryConfig?.city,
            province: deliveryConfig?.province,
            country: deliveryConfig?.country,
          })
        : "";

    setAddressFields({
      houseDetails,
      selectedPurokId: matchedPurok ? matchedPurok.id : "",
    });
    setFormData((prev) => ({
      ...prev,
      addresses: composedAddress ? [composedAddress] : [],
    }));
    setErrors((prev) => ({ ...prev, addresses: "" }));
    setMessage("");
  };

  const handleHouseDetailsChange = (event) => {
    updateAddressFields({
      ...addressFields,
      houseDetails: event.target.value,
    });
  };

  const handlePurokChange = (event) => {
    updateAddressFields({
      ...addressFields,
      selectedPurokId: event.target.value,
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();

    const nextErrors = {};
    const houseDetails = String(addressFields.houseDetails || "").trim();
    const wantsToSaveAddress = Boolean(houseDetails || addressFields.selectedPurokId);
    const matchedPurok = activePuroks.find((purok) => String(purok.id) === String(addressFields.selectedPurokId || "")) || null;

    let normalizedAddress = "";
    if (canEditDeliveryAddress && matchedPurok) {
      normalizedAddress = buildDeliveryAddress({
        houseDetails,
        purokName: matchedPurok.purokName,
        fixedBarangayName: deliveryConfig?.fixedBarangayName,
        city: deliveryConfig?.city,
        province: deliveryConfig?.province,
        country: deliveryConfig?.country,
      });
    }

    if (!formData.name.trim()) nextErrors.name = "Name is required.";
    if (!/^\+?[0-9\-\s]{7,15}$/.test(formData.phone.trim())) nextErrors.phone = "Enter a valid phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) nextErrors.email = "Enter a valid email address.";

    if (wantsToSaveAddress) {
      if (!canEditDeliveryAddress) {
        nextErrors.addresses = "Delivery coverage is unavailable right now, so address changes are temporarily disabled.";
      } else if (!houseDetails || !matchedPurok || !normalizedAddress) {
        nextErrors.addresses = "Enter your house/unit/street and choose an active purok.";
      }
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const profileToSave = {
        ...formData,
        addresses: canEditDeliveryAddress
          ? normalizedAddress
            ? [normalizedAddress]
            : []
          : Array.isArray(formData.addresses)
            ? formData.addresses
            : [],
      };

      await saveCustomerProfile(profileToSave);
      setFormData(profileToSave);
      setAddressFields({
        houseDetails,
        selectedPurokId: matchedPurok ? matchedPurok.id : "",
      });
      setMessage(
        normalizedAddress
          ? "Profile saved. Checkout will prefill this address, but you still need to confirm the exact delivery pin during checkout."
          : "Profile saved."
      );
      await loadLoyaltyData();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRedeemReward = async (reward) => {
    const rewardId = String(reward?.id || "").trim();
    if (!rewardId) return;

    let redeemNotes = "";
    if (isLatteReward(reward)) {
      const promptText = `Pick your free latte (${FREE_LATTE_CHOICES.join(" / ")}).`;
      const selected = String(window.prompt(promptText, FREE_LATTE_CHOICES[0]) || "").trim();
      const matchedChoice = FREE_LATTE_CHOICES.find((choice) => choice.toLowerCase() === selected.toLowerCase());
      if (!matchedChoice) {
        setError(`Choose a valid latte: ${FREE_LATTE_CHOICES.join(", ")}.`);
        return;
      }
      redeemNotes = `Redeemed - ${matchedChoice} (no payment)`;
    }

    setError("");
    setMessage("");
    setRedeemingRewardId(rewardId);

    try {
      await redeemLoyaltyReward(rewardId, redeemNotes);
      await loadLoyaltyData();
      setMessage(redeemNotes ? redeemNotes : `${reward?.label || "Reward"} redeemed successfully.`);
    } catch (redeemError) {
      setError(redeemError?.message || "Unable to redeem reward right now.");
    } finally {
      setRedeemingRewardId("");
    }
  };

  if (isLoading) {
    return <div className="loyalty-loading">Loading your profile...</div>;
  }

  const LinkImpl = LinkComponent || RouterLink;
  const isLoyaltyView = view === "loyalty";

  return (
    <div className="profile-page">
      <h1>{isLoyaltyView ? "Loyalty and Perks" : "Profile Info"}</h1>
      <p className="profile-session">
        Signed in as <strong>{user?.email || session?.user?.email}</strong>
      </p>

      {error ? <p className="field-error profile-top-error">{error}</p> : null}

      {isLoyaltyView ? (
        <>
          {loyaltyData ? (
            <LoyaltyCard loyaltyData={loyaltyData} onRedeemReward={handleRedeemReward} redeemingRewardId={redeemingRewardId} />
          ) : (
            <p className="loyalty-loading">Loading loyalty card...</p>
          )}

          <div className="profile-links">
            <LinkImpl href="/order-history" to="/order-history">
              View order history
            </LinkImpl>
            <LinkImpl href="/track-order" to="/track-order">
              Track latest order
            </LinkImpl>
          </div>
        </>
      ) : (
        <form className="profile-form" onSubmit={handleSave}>
          <input type="text" name="name" placeholder="Full Name" value={formData.name} onChange={handleChange} />
          {errors.name ? <p className="field-error">{errors.name}</p> : null}

          <input type="email" name="email" placeholder="Email" value={formData.email} onChange={handleChange} />
          {errors.email ? <p className="field-error">{errors.email}</p> : null}

          <input type="text" name="phone" placeholder="Phone Number" value={formData.phone} onChange={handleChange} />
          {errors.phone ? <p className="field-error">{errors.phone}</p> : null}

          <div className="profile-address-group">
            <input
              type="text"
              placeholder="House/Unit, Street, Landmark"
              value={addressFields.houseDetails}
              onChange={handleHouseDetailsChange}
              autoComplete="address-line1"
              disabled={addressInputsDisabled}
            />
            <select value={addressFields.selectedPurokId} onChange={handlePurokChange} disabled={addressInputsDisabled}>
              <option value="">
                {isLoadingDeliveryConfig
                  ? "Loading delivery coverage..."
                  : canEditDeliveryAddress
                    ? "Select a purok"
                    : "Delivery coverage unavailable"}
              </option>
              {activePuroks.map((purok) => (
                <option key={purok.id} value={purok.id}>
                  {purok.purokName}
                </option>
              ))}
            </select>

            <div className="profile-fixed-address-grid">
              <label>
                Barangay / Area
                <input className="profile-fixed-address" value={String(deliveryConfig?.fixedBarangayName || "")} readOnly aria-label="Barangay / Area" />
              </label>
              <label>
                City
                <input className="profile-fixed-address" value={String(deliveryConfig?.city || "")} readOnly aria-label="City" />
              </label>
              <label>
                Province
                <input className="profile-fixed-address" value={String(deliveryConfig?.province || "")} readOnly aria-label="Province" />
              </label>
              <label>
                Country
                <input className="profile-fixed-address" value={String(deliveryConfig?.country || "")} readOnly aria-label="Country" />
              </label>
            </div>
          </div>

          <p className="profile-address-hint">
            Save your house/unit + purok here for checkout autofill. The exact delivery pin is still confirmed on the map during checkout.
          </p>
          {!canEditDeliveryAddress ? (
            <p className="profile-address-hint profile-address-warning">
              Active delivery coverage is not available right now. You can still update your basic profile details, but address changes are disabled until owner delivery settings are restored.
            </p>
          ) : null}
          {errors.addresses ? <p className="field-error">{errors.addresses}</p> : null}

          <button type="submit" className="save-btn" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Information"}
          </button>

          {message ? <p className="profile-message">{message}</p> : null}
        </form>
      )}
    </div>
  );
}

export default Profile;
