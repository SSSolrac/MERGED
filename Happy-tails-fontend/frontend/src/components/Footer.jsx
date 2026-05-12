import React, { useEffect, useMemo, useState } from "react";
import { getPublicBusinessSettings } from "../services/businessSettingsService";
import { DEFAULT_BUSINESS_HOURS_TEXT } from "../utils/orderAvailability";

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

const DEFAULT_BUSINESS_SETTINGS = {
  cafeName: "Happy Tails Pet Cafe",
  businessHours: DEFAULT_BUSINESS_HOURS_TEXT,
  contactNumber: "0917 520 9713",
  businessEmail: "happytailspetcafe@gmail.com",
  cafeAddress: "AMCJ Commercial Building, Bonifacio Drive, Pleasantville Subdivision, Phase 1, Ilayang Iyam, Lucena, Philippines, 4301",
  facebookHandle: "Happy Tails Pet Cafe - Lucena",
  instagramHandle: "@happytailspetcaflc",
  logoUrl: "",
};

function mergeBusinessSettings(partial) {
  const safe = partial && typeof partial === "object" ? partial : {};
  return {
    cafeName: safe.cafeName || DEFAULT_BUSINESS_SETTINGS.cafeName,
    businessHours: safe.businessHours || DEFAULT_BUSINESS_SETTINGS.businessHours,
    contactNumber: safe.contactNumber || DEFAULT_BUSINESS_SETTINGS.contactNumber,
    businessEmail: safe.businessEmail || DEFAULT_BUSINESS_SETTINGS.businessEmail,
    cafeAddress: safe.cafeAddress || DEFAULT_BUSINESS_SETTINGS.cafeAddress,
    facebookHandle: safe.facebookHandle || DEFAULT_BUSINESS_SETTINGS.facebookHandle,
    instagramHandle: safe.instagramHandle || DEFAULT_BUSINESS_SETTINGS.instagramHandle,
    logoUrl: safe.logoUrl || DEFAULT_BUSINESS_SETTINGS.logoUrl,
  };
}

const Footer = () => {
  const [businessSettings, setBusinessSettings] = useState(DEFAULT_BUSINESS_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    const loadBusinessSettings = async () => {
      try {
        const settings = await getPublicBusinessSettings();
        if (!cancelled) setBusinessSettings(mergeBusinessSettings(settings));
      } catch {
        if (!cancelled) setBusinessSettings(DEFAULT_BUSINESS_SETTINGS);
      }
    };

    loadBusinessSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const hoursLines = useMemo(() => {
    return splitLines(businessSettings.businessHours);
  }, [businessSettings.businessHours]);

  const addressLines = useMemo(() => {
    return splitLines(businessSettings.cafeAddress);
  }, [businessSettings.cafeAddress]);

  const footerStyle = {
    backgroundColor: "#2c4053",
    paddingTop: "46px",
    paddingBottom: "28px",
    color: "#d9e0e8",
  };
  const contentTextColor = "#d7dde4";
  const headingColor = "#ff4b9b";
  const dividerColor = "rgba(217,224,232,0.14)";
  const bottomBarTextColor = "#b9c3ce";

  return (
    <footer style={{ fontFamily: "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      <div style={footerStyle}>
        <div style={{ maxWidth: "1704px", margin: "0 auto", padding: "0 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "48px", flexWrap: "wrap" }}>
            <div style={{ flex: "1", minWidth: "220px", marginBottom: "12px" }}>
              <div style={{ fontSize: "32px", fontWeight: 900, lineHeight: 1.05, marginBottom: "12px" }} aria-label={businessSettings.cafeName || "Happy Tails"}>
                <span style={{ color: "#ff4b9b" }}>Happy</span>
                <span style={{ color: "#2fe8f0" }}>Tails</span>
              </div>
              <p style={{ fontSize: "16px", margin: 0, color: contentTextColor }}>Your pet&apos;s paradise since 2015</p>
            </div>

            <div style={{ flex: "1", minWidth: "250px", marginBottom: "12px" }}>
              <h3 style={{ color: headingColor, fontSize: "22px", fontWeight: "800", marginBottom: "14px", marginTop: "2px" }}>Operating Hours</h3>
              <div style={{ width: "48px", height: "2px", background: "#ff4b9b", margin: "-8px 0 14px" }} />
              {hoursLines.length ? (
                hoursLines.map((line, index) => (
                  <p key={`hours-${index}`} style={{ fontSize: "17px", margin: index === hoursLines.length - 1 ? 0 : "0 0 9px 0", color: contentTextColor }}>
                    {line}
                  </p>
                ))
              ) : null}
            </div>

            <div style={{ flex: "1.35", minWidth: "300px", marginBottom: "12px" }}>
              <h3 style={{ color: headingColor, fontSize: "22px", fontWeight: "800", marginBottom: "14px", marginTop: "2px" }}>Contact Us</h3>
              <div style={{ width: "48px", height: "2px", background: "#ff4b9b", margin: "-8px 0 14px" }} />
              <p style={{ fontSize: "17px", margin: "0 0 8px 0", color: contentTextColor }}>FB: {businessSettings.facebookHandle}</p>
              <p style={{ fontSize: "17px", margin: "0 0 8px 0", color: contentTextColor }}>IG: {businessSettings.instagramHandle}</p>
              <p style={{ fontSize: "17px", margin: "0 0 8px 0", color: contentTextColor }}>Phone: {businessSettings.contactNumber}</p>
              <p style={{ fontSize: "17px", margin: "0 0 12px 0", color: contentTextColor }}>Email: {businessSettings.businessEmail}</p>

              <p style={{ fontSize: "17px", margin: 0, color: contentTextColor, lineHeight: "1.45" }}>
                {addressLines.length ? (
                  addressLines.map((line, index) => (
                    <React.Fragment key={`address-${index}`}>
                      {line}
                      {index < addressLines.length - 1 ? <br /> : null}
                    </React.Fragment>
                  ))
                ) : null}
              </p>
            </div>
            </div>

            <div style={{ borderTop: `1px solid ${dividerColor}`, width: "100%", margin: "26px 0 20px" }} />

            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "16px", color: bottomBarTextColor, margin: "0 0 8px 0" }}>&copy; 2026 HappyTails. All rights reserved.</p>
              <p style={{ fontSize: "14px", color: "#d7dde4", margin: 0 }}>Pet Shop, Grooming, Boarding & Cafe Services</p>
            </div>
          </div>
      </div>
    </footer>
  );
};

export default Footer;
