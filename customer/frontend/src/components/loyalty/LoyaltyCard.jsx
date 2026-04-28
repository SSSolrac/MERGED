import "./LoyaltyCard.css";

const TOTAL_STAMPS = 10;

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRewardActionLabel(reward, isRedeeming, stampsNeeded) {
  if (isRedeeming) return "Redeeming...";
  if (reward?.canRedeem) return reward?.isGroomReward ? "Save in-store reward" : "Redeem item";
  if (reward?.isRedeemedThisCycle) {
    return reward?.pendingRewardItemCount ? "Free drink ready" : "Redeemed this cycle";
  }
  return `${stampsNeeded} more stamp${stampsNeeded === 1 ? "" : "s"}`;
}

function getRewardForStampSlot(rewards, slotNumber) {
  return rewards.find((reward) => asNumber(reward?.requiredStamps, 0) === slotNumber) || null;
}

function LoyaltyCard({
  loyaltyData,
  onRedeemReward,
  isAuthenticated = true,
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
  } = loyaltyData || {};

  const earnedStamps = Math.min(stampCount, TOTAL_STAMPS);
  const unlockedRewards = Array.isArray(availableRewards) ? availableRewards : [];
  const rewards = Array.isArray(allRewards) ? allRewards : [];

  if (!isAuthenticated) {
    return (
      <section className="loyalty-card" aria-label="Customer loyalty card">
        <div className="loyalty-card__header">
          <h2>Paws & Perks Loyalty Card</h2>
          <p>Create an account to access your loyalty card and rewards.</p>
        </div>
      </section>
    );
  }

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

      <div className="loyalty-card__grid" aria-label="Loyalty stamp progress">
        {Array.from({ length: TOTAL_STAMPS }, (_, index) => {
          const stampNumber = index + 1;
          const isFilled = stampNumber <= earnedStamps;
          const reward = getRewardForStampSlot(rewards, stampNumber);
          const canRedeemReward = Boolean(reward?.canRedeem);
          const isRedeeming = reward && redeemingRewardId === String(reward.id || "");
          const className = [
            "stamp-slot",
            isFilled ? "stamp-slot--filled" : "",
            reward ? "stamp-slot--milestone" : "",
            canRedeemReward ? "stamp-slot--actionable" : "",
          ].filter(Boolean).join(" ");

          return (
            <button
              key={stampNumber}
              type="button"
              className={className}
              disabled={!canRedeemReward || isRedeeming}
              onClick={() => canRedeemReward && onRedeemReward?.(reward)}
              aria-label={reward ? `${reward.label}, stamp ${stampNumber}` : `Stamp ${stampNumber}`}
            >
              <span className="stamp-slot__icon">{stampNumber}</span>
              {reward ? (
                <span className={`stamp-slot__reward ${reward.isUnlocked ? "stamp-slot__reward--unlocked" : ""}`}>
                  <span>{reward.label}</span>
                  <small>{isRedeeming ? "Saving..." : canRedeemReward ? "Tap to redeem" : `${Math.max(stampNumber - stampCount, 0)} more`}</small>
                </span>
              ) : (
                <span>Stamp {stampNumber}</span>
              )}
            </button>
          );
        })}
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
                    <p className="loyalty-reward-row__hint">Redeemed for this cycle. Add the free drink to your basket below when you're ready.</p>
                  ) : null}
                  {reward.isGroomReward && canRedeem ? (
                    <p className="loyalty-reward-row__hint">Free Groom can only be claimed in store. Redeem here to save it to your profile.</p>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="loyalty-redeem-btn"
                  disabled={!isAuthenticated || !canRedeem || isRedeeming}
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

    </section>
  );
}

export default LoyaltyCard;
