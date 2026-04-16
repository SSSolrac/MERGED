import { useEffect, useMemo, useState } from "react";
import { getActiveCampaignAnnouncements } from "../services/campaignService";
import "./CampaignBanner.css";

export default function CampaignBanner({ overlay = false }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let isCancelled = false;

    const loadAnnouncements = async () => {
      const announcements = await getActiveCampaignAnnouncements();
      if (isCancelled) return;
      setItems(Array.isArray(announcements) ? announcements : []);
    };

    loadAnnouncements().catch(() => {
      if (isCancelled) return;
      setItems([]);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  const announcementTexts = useMemo(() => {
    return (Array.isArray(items) ? items : [])
      .map((entry) => {
        const title = String(entry?.title || "").trim();
        const message = String(entry?.message || "").trim();
        return message || title;
      })
      .filter(Boolean);
  }, [items]);

  if (!announcementTexts.length) return null;

  // Build two identical long lines so the marquee can loop seamlessly.
  const baseLine = `${announcementTexts.join(" \u2022 ")} \u2022 `;
  const repeatedLine = `${baseLine.repeat(8)}`.trim();

  return (
    <section className={`campaign-banner${overlay ? " campaign-banner--overlay" : ""}`} aria-label="Cafe announcements">
      <div className="campaign-banner__surface">
        <div className="campaign-banner__track">
          <span className="campaign-banner__line" role="status" aria-live="polite">
            {repeatedLine}
          </span>
          <span className="campaign-banner__line" aria-hidden="true">
            {repeatedLine}
          </span>
        </div>
      </div>
    </section>
  );
}
