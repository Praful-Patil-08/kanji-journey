'use strict';
const mongoose = require('mongoose');

const flashcardReviewSchema = new mongoose.Schema(
  {
    id: { type: String, default: () => crypto.randomUUID() },
    user_id: { type: String, required: true, index: true },
    card_id: { type: String, required: true, index: true },
    grade: { type: Number, required: true, min: 0, max: 5 },
    ease_before: { type: Number, required: true },
    ease_after: { type: Number, required: true },
    interval_before: { type: Number, required: true },
    interval_after: { type: Number, required: true },
    review_state_before: { type: String, required: true },
    review_state_after: { type: String, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'flashcard_reviews', versionKey: false }
);

flashcardReviewSchema.index({ user_id: 1, createdAt: -1 });
flashcardReviewSchema.index({ card_id: 1, createdAt: -1 });
flashcardReviewSchema.index({ user_id: 1, card_id: 1, createdAt: -1 });

flashcardReviewSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.models.FlashcardReview || mongoose.model('FlashcardReview', flashcardReviewSchema);
