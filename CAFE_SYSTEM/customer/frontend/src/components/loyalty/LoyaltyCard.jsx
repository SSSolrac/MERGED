import "./LoyaltyCard.css";

const TOTAL_STAMPS = 10;

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatActivityStampDelta(delta) {
  const safe = asNumber(delta, 0);
  if (safe > 0) return `+${safe} stamp${safe === 1 ? "" : "s"}`;
  if (safe < 0) return `${safe} stamp${Math.abs(safe) === 1 ? "" : "s"}`;
  return "0 stamp";
}

function LoyaltyCard({ loyaltyData, onRedeemReward, redeemingRewardId = "" }) {
  const {
    stampCount = 0,
    allRewards = [],
    availableRewards = [],
    customerName,
    recentActivity = [],
  } = loyaltyData || {};

  const earnedStamps = Math.min(stampCount, TOTAL_STAMPS);
  const availableRewardIds = new Set((Array.isArray(availableRewards) ? availableRewards : []).map((reward) => String(reward.id)));
  const rewards = Array.isArray(allRewards) ? allRewards : [];

  return (
    <section className="loyalty-card" aria-label="Customer loyalty card">
      <div className="loyalty-card__header">
        <h2>Paws & Perks Loyalty Card</h2>
        <p>Earn 1 stamp per completed order. 6/10 unlocks Free Latte. 10/10 unlocks Free Groom and resets the card.</p>
      </div>

      {customerName ? <p className="loyalty-card__customer">Hi {customerName}, welcome back.</p> : null}

      <div className="loyalty-card__progress-row">
        <p className="loyalty-card__progress">{earnedStamps} / {TOTAL_STAMPS} stamps</p>
        <p className="loyalty-card__remaining">
          {availableRewards.length
            ? `Rewards unlocked: ${availableRewards.map((reward) => reward.label).join(", ")}`
            : "Keep ordering to unlock rewards."}
        </p>
      </div>

      <div className="loyalty-card__milestones" aria-label="Available rewards">
        {rewards.length ? (
          rewards.map((reward) => {
            const rewardId = String(reward.id || "");
            const required = asNumber(reward.requiredStamps, 0);
            const isEligible = availableRewardIds.has(rewardId);
            const stampsNeeded = Math.max(required - asNumber(stampCount, 0), 0);
            const isRedeeming = redeemingRewardId === rewardId;

            return (
              <div key={rewardId} className="loyalty-reward-row">
                <p>
                  {reward.label} (requires {required} stamps)
                </p>
                <button
                  type="button"
                  className="loyalty-redeem-btn"
                  disabled={!isEligible || isRedeeming}
                  onClick={() => onRedeemReward?.(reward)}
                >
                  {isRedeeming ? "Redeeming..." : isEligible ? "Redeem item" : `${stampsNeeded} more stamp${stampsNeeded === 1 ? "" : "s"}`}
                </button>
              </div>
            );
          })
        ) : (
          <p>No rewards available yet.</p>
        )}
      </div>

      <div className="loyalty-card__meta">
        {recentActivity.length ? (
          <ul>
            {recentActivity.map((entry) => (
              <li key={entry.id}>
                {new Date(entry.earnedAt).toLocaleDateString()} - {entry.status} - {entry.description} - {formatActivityStampDelta(entry.stampDelta)}
              </li>
            ))}
          </ul>
        ) : (
          <p>Your recent loyalty activity will appear here.</p>
        )}
      </div>
    </section>
  );
}

export default LoyaltyCard;

