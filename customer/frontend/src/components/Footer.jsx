import React, { useEffect, useMemo, useState } from "react";
import logoImg from "../assets/logo.png";
import { getPublicBusinessSettings } from "../services/businessSettingsService";

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

const DEFAULT_BUSINESS_SETTINGS = {
  cafeName: "Happy Tails Pet Cafe",
  businessHours: "Monday - Friday: 8:00 AM - 7:30 PM\nSaturday - Sunday: 8:00 AM - 8:00 PM",
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

  const footerLogoSrc = logoImg;
  const footerStyle = {
    backgroundColor: "#F8C8DC",
    paddingTop: "34px",
    paddingBottom: "22px",
    color: "#423151",
    boxShadow: "0 -10px 24px rgba(64, 40, 86, 0.08)",
  };
  const contentTextColor = "#4f3b61";
  const headingColor = "#203a74";
  const dividerColor = "rgba(32,58,116,0.18)";
  const bottomBarTextColor = "#4f3b61";

  return (
    <footer style={{ fontFamily: "'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>
      <div style={footerStyle}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "28px", flexWrap: "wrap" }}>
            <div style={{ flex: "1", minWidth: "220px", marginBottom: "12px" }}>
              <img src={footerLogoSrc} alt={`${businessSettings.cafeName || "Cafe"} Logo`} style={{ maxWidth: "132px", marginBottom: "8px", display: "block" }} />
              <p style={{ fontSize: "14px", margin: 0, color: contentTextColor }}>{businessSettings.cafeName || "Cafe"}</p>
            </div>

            <div style={{ flex: "1", minWidth: "220px", marginBottom: "12px" }}>
              <h3 style={{ color: headingColor, fontSize: "18px", fontWeight: "600", marginBottom: "14px", marginTop: "2px" }}>Operating Hours</h3>
              {hoursLines.length ? (
                hoursLines.map((line, index) => (
                  <p key={`hours-${index}`} style={{ fontSize: "14px", margin: index === hoursLines.length - 1 ? 0 : "0 0 8px 0", color: contentTextColor }}>
                    {line}
                  </p>
                ))
              ) : null}
            </div>

            <div style={{ flex: "1.2", minWidth: "280px", marginBottom: "12px" }}>
              <h3 style={{ color: headingColor, fontSize: "18px", fontWeight: "600", marginBottom: "14px", marginTop: "2px" }}>Contact Us</h3>
              <p style={{ fontSize: "14px", margin: "0 0 8px 0", color: contentTextColor }}>FB: {businessSettings.facebookHandle}</p>
              <p style={{ fontSize: "14px", margin: "0 0 8px 0", color: contentTextColor }}>IG: {businessSettings.instagramHandle}</p>
              <p style={{ fontSize: "14px", margin: "0 0 8px 0", color: contentTextColor }}>Phone: {businessSettings.contactNumber}</p>
              <p style={{ fontSize: "14px", margin: "0 0 12px 0", color: contentTextColor }}>Email: {businessSettings.businessEmail}</p>

              <p style={{ fontSize: "13px", margin: 0, color: contentTextColor, lineHeight: "1.6" }}>
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

            <div style={{ borderTop: `1px solid ${dividerColor}`, width: "100%", margin: "18px 0 14px" }} />

            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "16px", color: bottomBarTextColor, margin: "0 0 8px 0" }}>(c) 2026 HappyTails. All rights reserved.</p>
              <p style={{ fontSize: "16px", color: bottomBarTextColor, margin: 0 }}>Pet Shop, Grooming & Cafe Services</p>
            </div>
          </div>
      </div>
    </footer>
  );
};

export default Footer;
