import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import {
  formatReviewRating,
  getReviewServiceLabel,
  markOrderReviewDismissed,
  shouldPromptForOrderReview,
  submitOrderReview,
} from "../services/reviewService";
import { getOrderReference } from "../services/orderService";
import "./ReviewPrompt.css";

export default function ReviewPrompt({ order }) {
  const [isVisible, setIsVisible] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const checkReviewPrompt = async () => {
      setMessage("");
      setError("");
      setComment("");
      setRating(5);

      if (!order?.id) {
        setIsVisible(false);
        return;
      }

      const shouldShow = await shouldPromptForOrderReview(order);
      if (!cancelled) setIsVisible(shouldShow);
    };

    checkReviewPrompt();
    return () => {
      cancelled = true;
    };
  }, [order]);

  const handleDismiss = () => {
    markOrderReviewDismissed(order?.id);
    setIsVisible(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      await submitOrderReview({ order, rating, comment });
      setMessage("Thank you. Your review has been shared.");
      window.setTimeout(() => {
        setIsVisible(false);
      }, 1100);
    } catch (submitError) {
      setError(submitError?.message || "Unable to submit your review right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isVisible || !order) return null;

  return (
    <div className="review-prompt" role="dialog" aria-modal="true" aria-labelledby="review-prompt-title">
      <form className="review-prompt__panel" onSubmit={handleSubmit}>
        <button className="review-prompt__close" type="button" onClick={handleDismiss} aria-label="Close review prompt">
          <X size={22} strokeWidth={2.4} aria-hidden="true" />
        </button>

        <p className="review-prompt__eyebrow">{getReviewServiceLabel(order)}</p>
        <h2 id="review-prompt-title">How was your Happy Tails order?</h2>
        <p className="review-prompt__copy">
          Order <strong>{getOrderReference(order)}</strong> is complete. Share a quick rating and comment for the
          community reviews.
        </p>

        <div className="review-prompt__stars" role="radiogroup" aria-label="Select star rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={value <= rating ? "is-active" : ""}
              onClick={() => setRating(value)}
              role="radio"
              aria-checked={value === rating}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
            >
              <Star size={30} aria-hidden="true" />
            </button>
          ))}
          <span>{formatReviewRating(rating)}</span>
        </div>

        <label className="review-prompt__comment">
          Comment
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={800}
            placeholder="Tell us what you liked about your order..."
            required
          />
        </label>

        {error ? <p className="review-prompt__error">{error}</p> : null}
        {message ? <p className="review-prompt__success">{message}</p> : null}

        <button className="review-prompt__submit" type="submit" disabled={isSubmitting || !comment.trim()}>
          {isSubmitting ? "Submitting..." : "Submit Review"}
        </button>
      </form>
    </div>
  );
}
