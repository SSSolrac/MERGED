import { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import LoyaltyCard from "../components/loyalty/LoyaltyCard";
import {
  buildLoyaltyRewardCartItem,
  getCustomerLoyaltyData,
  getFreeLatteRewardOptions,
  isLatteReward,
  redeemLoyaltyReward,
} from "../services/loyaltyService";
import { getCustomerProfile, saveCustomerProfile, uploadCustomerProfileImage } from "../services/profileService";
import { getActiveDeliveryConfig } from "../services/deliveryAreaService";
import { buildDeliveryAddress, parseDeliveryAddress } from "../utils/deliveryAddress";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import "./Profile.css";

const blankProfile = {
  name: "",
  phone: "",
  email: "",
  addresses: [],
  preferences: {},
  avatarUrl: "",
};

const blankAddressFields = {
  houseDetails: "",
  selectedPurokId: "",
};

function isRewardCartItem(item) {
  return Boolean(item?.isLoyaltyReward || item?.loyaltyRewardItemId);
}

function Profile({ linkComponent: LinkComponent, view = "info" }) {
  const { user, session, refreshProfile } = useAuth();
  const { addItem, cart, openMiniCart } = useCart();
  const [formData, setFormData] = useState(blankProfile);
  const [addressFields, setAddressFields] = useState(blankAddressFields);
  const [deliveryConfig, setDeliveryConfig] = useState(null);
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [latteRewardOptions, setLatteRewardOptions] = useState([]);
  const [selectedLatteItemIds, setSelectedLatteItemIds] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDeliveryConfig, setIsLoadingDeliveryConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [redeemingRewardId, setRedeemingRewardId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState({});
  const hasClaimableOrderCart = useMemo(() => cart.some((item) => !isRewardCartItem(item)), [cart]);

  const loadLoyaltyData = useCallback(async () => {
    const data = await getCustomerLoyaltyData();
    setLoyaltyData(data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setIsLoading(true);
      setIsLoadingDeliveryConfig(true);
      setError("");

      try {
        const [profile, config, latteOptions] = await Promise.all([
          getCustomerProfile(),
          getActiveDeliveryConfig({ force: true }),
          getFreeLatteRewardOptions().catch(() => []),
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
        setLatteRewardOptions(Array.isArray(latteOptions) ? latteOptions : []);

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
  }, [loadLoyaltyData, user?.email]);

  useEffect(() => {
    if (view !== "loyalty" || !user?.id) return undefined;

    const refreshLoyalty = () => {
      loadLoyaltyData().catch(() => {
        // Keep the current card visible if a background refresh fails.
      });
    };

    window.addEventListener("focus", refreshLoyalty);
    const intervalId = window.setInterval(refreshLoyalty, 30000);

    return () => {
      window.removeEventListener("focus", refreshLoyalty);
      window.clearInterval(intervalId);
    };
  }, [loadLoyaltyData, user?.id, view]);

  useEffect(() => {
    if (!latteRewardOptions.length) return;
    const defaultOptionId = String(latteRewardOptions[0]?.menuItemId || "").trim();
    if (!defaultOptionId) return;

    setSelectedLatteItemIds((prev) => {
      const rewards = Array.isArray(loyaltyData?.allRewards) ? loyaltyData.allRewards : [];
      const next = { ...prev };
      let changed = false;

      rewards.forEach((reward) => {
        if (!isLatteReward(reward)) return;
        const rewardId = String(reward?.id || "").trim();
        if (!rewardId || next[rewardId]) return;
        next[rewardId] = defaultOptionId;
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [latteRewardOptions, loyaltyData?.allRewards]);

  const activePuroks = useMemo(
    () =>
      (Array.isArray(deliveryConfig?.puroks) ? deliveryConfig.puroks : []).filter(
        (purok) => purok?.isActive !== false && String(purok?.deliveryStatus || "active").toLowerCase() !== "inactive"
      ),
    [deliveryConfig?.puroks]
  );

  const pendingRewardItems = useMemo(
    () => (Array.isArray(loyaltyData?.pendingRewardItems) ? loyaltyData.pendingRewardItems : []),
    [loyaltyData?.pendingRewardItems]
  );
  const inStoreRewardBalances = useMemo(
    () => (Array.isArray(loyaltyData?.inStoreRewardBalances) ? loyaltyData.inStoreRewardBalances : []),
    [loyaltyData?.inStoreRewardBalances]
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

  const handleLatteSelectionChange = (rewardId, menuItemId) => {
    setSelectedLatteItemIds((prev) => ({
      ...prev,
      [rewardId]: menuItemId,
    }));
    setError("");
    setMessage("");
  };

  const addRewardItemToBasket = (rewardItem, successMessage) => {
    if (!rewardItem?.id) return;
    if (!hasClaimableOrderCart) {
      setError("Start a pickup, dine-in, or takeout order before claiming this free latte.");
      setMessage("");
      return;
    }

    const alreadyInCart = cart.some((item) => String(item?.loyaltyRewardItemId || "") === String(rewardItem.id));
    addItem(buildLoyaltyRewardCartItem(rewardItem), 1);
    if (!alreadyInCart) openMiniCart();
    setMessage(successMessage || `${rewardItem.itemName || "Free drink"} added to your basket. Place an order to claim it.`);
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
        avatarUrl: String(formData.avatarUrl || "").trim(),
      };

      const savedProfile = await saveCustomerProfile(profileToSave);
      setFormData({
        ...blankProfile,
        email: user?.email || "",
        ...savedProfile,
      });
      setAddressFields({
        houseDetails,
        selectedPurokId: matchedPurok ? matchedPurok.id : "",
      });
      setMessage(
        normalizedAddress
          ? "Profile saved. Checkout will prefill this address, but you still need to confirm the exact delivery pin during checkout."
          : "Profile saved."
      );
      await refreshProfile?.();
      await loadLoyaltyData();
    } catch (saveError) {
      setError(saveError?.message || "Unable to save right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      const avatarUrl = await uploadCustomerProfileImage(file);
      setFormData((current) => ({
        ...current,
        avatarUrl,
      }));
      setError("");
      setMessage("Profile photo uploaded. Save your profile to keep it.");
    } catch (uploadError) {
      setError(uploadError?.message || "Unable to upload your profile photo right now.");
      setMessage("");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleRedeemReward = async (reward) => {
    const rewardId = String(reward?.id || "").trim();
    if (!rewardId) return;

    const redeemOptions = {};
    if (isLatteReward(reward)) {
      const selectedMenuItemId = String(
        selectedLatteItemIds[rewardId] || latteRewardOptions[0]?.menuItemId || ""
      ).trim();
      const selectedOption =
        latteRewardOptions.find((option) => String(option.menuItemId) === selectedMenuItemId) || null;

      if (!selectedOption) {
        setError("Choose a valid free drink before redeeming this reward.");
        return;
      }

      redeemOptions.menuItemId = selectedOption.menuItemId;
    }

    setError("");
    setMessage("");
    setRedeemingRewardId(rewardId);

    try {
      const result = await redeemLoyaltyReward(rewardId, redeemOptions);
      if (result?.rewardItem) {
        if (hasClaimableOrderCart) {
          addRewardItemToBasket(
            result.rewardItem,
            `${result.rewardItem.itemName || reward?.label || "Free drink"} redeemed and added to your basket.`
          );
        } else {
          setMessage(
            `${result.rewardItem.itemName || reward?.label || "Free drink"} redeemed and saved. Start a pickup, dine-in, or takeout order first, then claim it from Ready to Claim.`
          );
        }
      } else if (result?.resetsCard) {
        setMessage(`${result.rewardLabel || reward?.label || "Free Groom"} can only be redeemed in store. This reward has been saved to your profile.`);
      } else {
        setMessage(`${reward?.label || "Reward"} redeemed successfully.`);
      }
      await loadLoyaltyData();
    } catch (redeemError) {
      setError(redeemError?.message || "Unable to redeem reward right now.");
    } finally {
      setRedeemingRewardId("");
    }
  };

  const handleAddPendingRewardToBasket = (rewardItem) => {
    addRewardItemToBasket(rewardItem, `${rewardItem.itemName || "Free drink"} added to your basket.`);
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
      {message ? <p className="profile-message profile-top-message">{message}</p> : null}

      {isLoyaltyView ? (
        <>
          {loyaltyData ? (
            <LoyaltyCard
              loyaltyData={loyaltyData}
              onRedeemReward={handleRedeemReward}
              redeemingRewardId={redeemingRewardId}
              latteRewardOptions={latteRewardOptions}
              selectedLatteItemIds={selectedLatteItemIds}
              onLatteSelectionChange={handleLatteSelectionChange}
            />
          ) : (
            <p className="loyalty-loading">Loading loyalty card...</p>
          )}

          {inStoreRewardBalances.length ? (
            <section className="profile-in-store-rewards">
              <h2>Saved In-Store Rewards</h2>
              <p>Show these rewards to cafe staff when you visit. Free Groom can only be redeemed in store.</p>
              <div className="profile-in-store-rewards__list">
                {inStoreRewardBalances.map((reward) => (
                  <div key={reward.rewardId || reward.label} className="profile-in-store-rewards__row">
                    <strong>{reward.label} x {reward.count}</strong>
                    {reward.latestRedeemedAt ? (
                      <span>Saved {new Date(reward.latestRedeemedAt).toLocaleDateString()}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {pendingRewardItems.length ? (
            <section className="profile-reward-items">
              <h2>Ready to Claim</h2>
              <p>Redeemed drinks stay pending until you include them with a pickup, dine-in, or takeout order.</p>
              <div className="profile-reward-items__list">
                {pendingRewardItems.map((rewardItem) => {
                  const isInBasket = cart.some(
                    (item) => String(item?.loyaltyRewardItemId || "") === String(rewardItem.id || "")
                  );

                  return (
                    <div key={rewardItem.id} className="profile-reward-items__row">
                      <div>
                        <strong>{rewardItem.itemName || rewardItem.optionLabel || rewardItem.rewardLabel}</strong>
                        <p>
                          {rewardItem.rewardLabel}
                          {rewardItem.optionLabel ? ` • ${rewardItem.optionLabel}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="save-btn profile-reward-items__btn"
                        disabled={isInBasket || !hasClaimableOrderCart}
                        onClick={() => handleAddPendingRewardToBasket(rewardItem)}
                      >
                        {isInBasket ? "In basket" : hasClaimableOrderCart ? "Add to basket" : "Start an order first"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

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
          <div className="profile-avatar-panel">
            <div className="profile-avatar-preview">
              {formData.avatarUrl ? (
                <img src={formData.avatarUrl} alt={formData.name || user?.email || "Customer profile"} />
              ) : (
                <span>{String(formData.name || user?.email || "C").trim().charAt(0).toUpperCase() || "C"}</span>
              )}
            </div>
            <div className="profile-avatar-copy">
              <strong>Profile Photo</strong>
              <p>Upload a photo so your account feels a little more like yours.</p>
              <label className="profile-avatar-upload">
                <span>{isUploadingAvatar ? "Uploading..." : "Upload photo"}</span>
                <input type="file" accept="image/*" onChange={handleAvatarUpload} disabled={isUploadingAvatar || isSaving} />
              </label>
            </div>
          </div>

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
        </form>
      )}
    </div>
  );
}

export default Profile;
