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

function getRewardActionLabel(reward, isRedeeming, stampsNeeded) {
  if (isRedeeming) return "Redeeming...";
  if (reward?.canRedeem) return "Redeem item";
  if (reward?.isRedeemedThisCycle) {
    return reward?.pendingRewardItemCount ? "Free drink ready" : "Redeemed this cycle";
  }
  return `${stampsNeeded} more stamp${stampsNeeded === 1 ? "" : "s"}`;
}

function LoyaltyCard({
  loyaltyData,
  onRedeemReward,
  redeemingRewardId = "",
  latteRewardOptions = [],
  selectedLatteItemIds = {},
  onLatteSelectionChange,
}) {
  const {
    stampCount = 0,
    allRewards = [],
    availableRewards = [],
    customerName,
    recentActivity = [],
  } = loyaltyData || {};

  const earnedStamps = Math.min(stampCount, TOTAL_STAMPS);
  const unlockedRewards = Array.isArray(availableRewards) ? availableRewards : [];
  const rewards = Array.isArray(allRewards) ? allRewards : [];

  return (
    <section className="loyalty-card" aria-label="Customer loyalty card">
      <div className="loyalty-card__header">
        <h2>Paws & Perks Loyalty Card</h2>
        <p>Earn 1 stamp per completed order. 6/10 unlocks Free Latte. 10/10 unlocks Free Groom and resets the card.</p>
      </div>

      {customerName ? <p className="loyalty-card__customer">Hi {customerName}, welcome back.</p> : null}

      <div className="loyalty-card__progress-row">
        <p className="loyalty-card__progress">
          {earnedStamps} / {TOTAL_STAMPS} stamps
        </p>
        <p className="loyalty-card__remaining">
          {unlockedRewards.length
            ? `Rewards unlocked: ${unlockedRewards.map((reward) => reward.label).join(", ")}`
            : "Keep ordering to unlock rewards."}
        </p>
      </div>

      <div className="loyalty-card__milestones" aria-label="Available rewards">
        {rewards.length ? (
          rewards.map((reward) => {
            const rewardId = String(reward.id || "");
            const required = asNumber(reward.requiredStamps, 0);
            const canRedeem = Boolean(reward.canRedeem);
            const stampsNeeded = Math.max(required - asNumber(stampCount, 0), 0);
            const isRedeeming = redeemingRewardId === rewardId;
            const selectedLatteItemId = String(selectedLatteItemIds?.[rewardId] || latteRewardOptions[0]?.menuItemId || "");

            return (
              <div key={rewardId} className="loyalty-reward-row">
                <div className="loyalty-reward-row__info">
                  <p>
                    {reward.label} (requires {required} stamps)
                  </p>
                  {reward.isLatteReward && canRedeem && latteRewardOptions.length ? (
                    <div className="loyalty-reward-row__choice">
                      <label htmlFor={`latte-choice-${rewardId}`}>Free drink choice</label>
                      <select
                        id={`latte-choice-${rewardId}`}
                        value={selectedLatteItemId}
                        onChange={(event) => onLatteSelectionChange?.(rewardId, event.target.value)}
                      >
                        {latteRewardOptions.map((option) => (
                          <option key={option.menuItemId} value={option.menuItemId}>
                            {option.displayLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {reward.isRedeemedThisCycle && reward.pendingRewardItemCount ? (
                    <p className="loyalty-reward-row__hint">Redeemed for this cycle. Add the free drink to your basket below when you’re ready.</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="loyalty-redeem-btn"
                  disabled={!canRedeem || isRedeeming}
                  onClick={() => onRedeemReward?.(reward)}
                >
                  {getRewardActionLabel(reward, isRedeeming, stampsNeeded)}
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
