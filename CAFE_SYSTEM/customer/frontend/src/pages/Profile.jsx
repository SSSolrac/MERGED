import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import LoyaltyCard from "../components/loyalty/LoyaltyCard";
import { FREE_LATTE_CHOICES, getCustomerLoyaltyData, isLatteReward, redeemLoyaltyReward } from "../services/loyaltyService";
import { getCustomerProfile, saveCustomerProfile } from "../services/profileService";
import { useAuth } from "../context/AuthContext";
import {
  composeLucenaAddress,
  findLucenaBarangay,
  findLucenaPurok,
  getPuroksForBarangay,
  LUCENA_CITY_LABEL,
  LUCENA_PROVINCE_LABEL,
  parseLucenaAddress,
} from "../utils/lucenaAddress";
import "./Profile.css";

const blankProfile = {
  name: "",
  phone: "",
  email: "",
  addresses: [],
  preferences: {}
};

const DELIVERY_BARANGAY = "Ilayang Iyam";

const blankAddressFields = {
  houseDetails: "",
  purok: "",
  barangay: DELIVERY_BARANGAY,
};

function Profile({ linkComponent: LinkComponent }) {
  const { user, session } = useAuth();
  const [formData, setFormData] = useState(blankProfile);
  const [addressFields, setAddressFields] = useState(blankAddressFields);
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
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
    const loadProfile = async () => {
      setIsLoading(true);
      setError("");
      try {
        const profile = await getCustomerProfile();
        const mergedProfile = {
          ...blankProfile,
          email: user?.email || "",
          ...profile
        };
        setFormData(mergedProfile);
        const primaryAddress = Array.isArray(mergedProfile.addresses) ? String(mergedProfile.addresses[0] || "") : "";
        const parsedAddress = parseLucenaAddress(primaryAddress);
        setAddressFields({
          houseDetails: parsedAddress.houseDetails || "",
          purok: parsedAddress.purok || "",
          barangay: parsedAddress.barangay || DELIVERY_BARANGAY,
        });
        await loadLoyaltyData();
      } catch (loadError) {
        setError(loadError?.message || "We couldn't load your account details right now.");
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [user?.email]);

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
    setErrors((prev) => ({ ...prev, [event.target.name]: "" }));
    setMessage("");
  };

  const updateAddressFields = (nextFields) => {
    const houseDetails = String(nextFields.houseDetails || "");
    const canonicalBarangay = findLucenaBarangay(nextFields.barangay);
    const canonicalPurok = findLucenaPurok(canonicalBarangay, nextFields.purok);
    const composedAddress = composeLucenaAddress({
      houseDetails,
      purok: canonicalPurok,
      barangay: canonicalBarangay,
    });

    setAddressFields({
      houseDetails,
      purok: canonicalPurok,
      barangay: canonicalBarangay,
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

  const handleBarangayChange = (event) => {
    const nextBarangay = findLucenaBarangay(event.target.value);
    const availablePuroks = getPuroksForBarangay(nextBarangay);
    const nextPurok = availablePuroks.includes(addressFields.purok) ? addressFields.purok : "";

    updateAddressFields({
      ...addressFields,
      barangay: nextBarangay,
      purok: nextPurok,
    });
  };

  const handlePurokChange = (event) => {
    updateAddressFields({
      ...addressFields,
      purok: event.target.value,
    });
  };

  const handleSave = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    const houseDetails = String(addressFields.houseDetails || "").trim();
    const canonicalBarangay = findLucenaBarangay(addressFields.barangay || DELIVERY_BARANGAY);
    const canonicalPurok = findLucenaPurok(canonicalBarangay, addressFields.purok);
    const normalizedAddress = composeLucenaAddress({
      houseDetails,
      purok: canonicalPurok,
      barangay: canonicalBarangay,
    });

    if (!formData.name.trim()) nextErrors.name = "Name is required.";
    if (!/^\+?[0-9\-\s]{7,15}$/.test(formData.phone.trim())) nextErrors.phone = "Enter a valid phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) nextErrors.email = "Enter a valid email address.";
    if (!houseDetails || canonicalBarangay !== DELIVERY_BARANGAY || !canonicalPurok) {
      nextErrors.addresses = "Use an address inside Barangay Ilayang Iyam, Lucena City (House/Unit/Street + Purok).";
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
        addresses: [normalizedAddress],
      };
      await saveCustomerProfile(profileToSave);
      setFormData(profileToSave);
      setAddressFields({
        houseDetails,
        purok: canonicalPurok,
        barangay: canonicalBarangay,
      });
      setMessage("Profile saved. Checkout will use your latest details automatically.");
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

  return (
      <div className="profile-page">
      <h1>My Profile</h1>
      <p className="profile-session">Signed in as <strong>{user?.email || session?.user?.email}</strong></p>

      {error ? <p className="field-error profile-top-error">{error}</p> : null}

      {loyaltyData ? (
        <LoyaltyCard loyaltyData={loyaltyData} onRedeemReward={handleRedeemReward} redeemingRewardId={redeemingRewardId} />
      ) : (
        <p className="loyalty-loading">Loading loyalty card...</p>
      )}

      <div className="profile-links">
        <LinkImpl href="/order-history" to="/order-history">View order history</LinkImpl>
        <LinkImpl href="/track-order" to="/track-order">Track latest order</LinkImpl>
      </div>

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
            placeholder="House/Unit, Street"
            value={addressFields.houseDetails}
            onChange={handleHouseDetailsChange}
            autoComplete="address-line1"
          />
          <select value={DELIVERY_BARANGAY} onChange={handleBarangayChange} disabled>
            <option value={DELIVERY_BARANGAY}>{DELIVERY_BARANGAY}</option>
          </select>
          {addressFields.barangay ? (
            <select value={addressFields.purok} onChange={handlePurokChange}>
              <option value="">Select Purok (Ilayang Iyam)</option>
              {getPuroksForBarangay(addressFields.barangay).map((purok) => (
                <option key={purok} value={purok}>
                  {purok}
                </option>
              ))}
            </select>
          ) : null}
          <input className="profile-fixed-address" value={LUCENA_CITY_LABEL} readOnly aria-label="City" />
          <input className="profile-fixed-address" value={LUCENA_PROVINCE_LABEL} readOnly aria-label="Province" />
        </div>
        <p className="profile-address-hint">Delivery is only available in Barangay Ilayang Iyam, Lucena City, Quezon.</p>
        {errors.addresses ? <p className="field-error">{errors.addresses}</p> : null}

        <button type="submit" className="save-btn" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Information"}
        </button>

        {message ? <p className="profile-message">{message}</p> : null}
      </form>
    </div>
  );
}

export default Profile;
