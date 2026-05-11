import { useEffect, useState } from "react";
import {
  formatReviewRating,
  getCommunityReviewSnapshot,
} from "../services/reviewService";
import "./CommunityReviews.css";

const EMPTY_REVIEW_STATS = {
  averageRating: 0,
  customerCountLabel: "0",
  recommendationRate: 0,
};

function ReviewStars({ rating }) {
  const starCount = Math.min(5, Math.max(1, Math.round(Number(rating) || 5)));

  return (
    <div className="community-review-card__rating" aria-label={`${starCount} out of 5 stars`}>
      <span className="community-review-card__stars" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span className={index < starCount ? "is-filled" : ""} key={index}>
            ★
          </span>
        ))}
      </span>
      <span className="community-review-card__rating-value" aria-hidden="true">
        {starCount}/5
      </span>
    </div>
  );
}

export default function CommunityReviews() {
  const [snapshot, setSnapshot] = useState(() => ({
    reviews: [],
    stats: EMPTY_REVIEW_STATS,
    backendReady: true,
  }));

  useEffect(() => {
    let cancelled = false;

    const loadReviews = async () => {
      const nextSnapshot = await getCommunityReviewSnapshot();
      if (!cancelled) setSnapshot(nextSnapshot);
    };

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, []);

  const { reviews, stats, backendReady } = snapshot;
  const hasReviews = reviews.length > 0;

  return (
    <section className="community-reviews" aria-labelledby="community-reviews-title">
      <div className="community-reviews__summary">
        <div className="community-reviews__heading">
          <h2 id="community-reviews-title">Community Reviews</h2>
          <p>Real experiences from Happy Tails customers</p>
        </div>

        <div className="community-reviews__stats" aria-label="Community review summary">
          <div>
            <strong>{formatReviewRating(stats.averageRating)}</strong>
            <span>Average Rating</span>
          </div>
          <div>
            <strong>{stats.customerCountLabel}</strong>
            <span>Customers</span>
          </div>
          <div>
            <strong>{stats.recommendationRate}%</strong>
            <span>Would Recommend</span>
          </div>
        </div>
      </div>

      {hasReviews ? (
        <div className="community-reviews__grid">
          {reviews.map((review) => (
            <article className="community-review-card" key={review.id}>
              <div className="community-review-card__header">
                <h3>{review.reviewerName}</h3>
                <ReviewStars rating={review.rating} />
              </div>
              <p className="community-review-card__comment">{review.comment}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="community-reviews__empty" role="status">
          <h3>{backendReady ? "No customer reviews yet" : "Customer reviews are unavailable right now"}</h3>
          <p>{backendReady ? "Reviews from completed orders will appear here." : "Please try again later."}</p>
        </div>
      )}
    </section>
  );
}
