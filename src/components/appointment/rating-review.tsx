"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Loader2, Check, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./star-rating";
import api, { getApiError } from "@/lib/api";
import { notifySuccess, notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/appointment-utils";

interface Review {
  rating: number;
  comment?: string;
  created_at: string;
}

interface RatingReviewProps {
  appointmentId: string;
  existingReview?: Review | null;
  doctorName: string;
  className?: string;
}

const QUICK_TAGS: Record<number, string[]> = {
  5: ["Excellent care", "Very thorough", "Great listener", "Highly recommend"],
  4: ["Professional", "Helpful advice", "Good experience", "Clear explanation"],
  3: ["Okay experience", "Could improve", "Average consultation"],
  2: ["Rushed", "Not helpful", "Poor communication"],
  1: ["Very unsatisfied", "No improvement", "Would not recommend"],
};

export function RatingReview({
  appointmentId,
  existingReview,
  doctorName,
  className,
}: RatingReviewProps) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(existingReview?.rating || 0);
  const [comment, setComment] = useState(existingReview?.comment || "");
  const [submitted, setSubmitted] = useState(!!existingReview);
  const [showThankYou, setShowThankYou] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const finalComment = [
    ...selectedTags,
    comment.trim(),
  ]
    .filter(Boolean)
    .join(". ");

  const submitMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/patient/appointments/${appointmentId}/review`, {
        rating,
        comment: finalComment || undefined,
      });
    },
    onSuccess: () => {
      setShowThankYou(true);
      setTimeout(() => {
        setShowThankYou(false);
        setSubmitted(true);
        notifySuccess("Review submitted", "Thank you for your feedback!");
        queryClient.invalidateQueries({ queryKey: ["patient"] });
      }, 2200);
    },
    onError: (error) => {
      notifyError("Couldn't submit review", getApiError(error));
    },
  });

  // Thank-you animation overlay
  if (showThankYou) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-gray-200/60 bg-white p-8",
          className,
        )}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 ring-6 ring-rose-50/50"
          >
            <Heart className="h-7 w-7 fill-rose-400 text-rose-400" />
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-base font-bold text-gray-900"
          >
            Thank you!
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-1 text-sm text-gray-500"
          >
            Your feedback helps improve our service
          </motion.p>
        </motion.div>
      </div>
    );
  }

  // Read-only mode (already submitted)
  if (submitted || existingReview) {
    const review = existingReview || {
      rating,
      comment: finalComment,
      created_at: new Date().toISOString(),
    };
    return (
      <div
        className={cn(
          "rounded-2xl border border-gray-200/60 bg-white p-5",
          className,
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">Your Review</h3>
        </div>
        <div className="flex items-center gap-3">
          <StarRating value={review.rating} readonly size="md" />
          <span className="text-xs text-gray-400">
            {formatShortDate(review.created_at)}
          </span>
        </div>
        {review.comment && (
          <p className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-700 ring-1 ring-gray-100">
            {review.comment}
          </p>
        )}
      </div>
    );
  }

  // Submit mode
  const tags = rating > 0 ? QUICK_TAGS[rating] || [] : [];

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200/60 bg-white p-5",
        className,
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">
          Rate Your Experience
        </h3>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        How was your consultation with {doctorName}?
      </p>

      <div className="flex flex-col items-center gap-4">
        <StarRating value={rating} onChange={setRating} size="lg" />

        <AnimatePresence mode="wait">
          {rating > 0 && (
            <motion.div
              key={rating}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full space-y-3 overflow-hidden"
            >
              {/* Quick tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                          isSelected
                            ? "bg-brand/10 text-brand ring-1 ring-brand/20"
                            : "bg-gray-50 text-gray-600 ring-1 ring-gray-100 hover:bg-gray-100",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}

              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a personal note (optional)..."
                maxLength={300}
                className="min-h-[72px] w-full resize-none rounded-xl border-gray-200/60 text-sm"
              />

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">
                  {comment.length}/300
                </span>
                <Button
                  size="sm"
                  onClick={() => submitMutation.mutate()}
                  disabled={submitMutation.isPending || rating === 0}
                  className="gap-1.5 rounded-xl bg-brand px-5 hover:bg-brand/90"
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Submit
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
