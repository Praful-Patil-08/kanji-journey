'use strict';
const mongoose = require('mongoose');

const flashcardSchema = new mongoose.Schema(
  {
    id:               { type: String, default: () => crypto.randomUUID() },
    user_id:          { type: String, required: true, index: true },
    lesson_id:        { type: String, default: null, trim: true, maxlength: 50 },
    front:            { type: String, required: true, trim: true, maxlength: 500 },
    back:             { type: String, required: true, trim: true, maxlength: 500 },
    review_state:     { type: String, default: 'new', enum: ['new','learning','review','relearning'], trim: true },
    ease_factor:      { type: Number, default: 2.5, min: 1.3, max: 5 },
    interval_days:    { type: Number, default: 1, min: 1, max: 365 },
    next_review_date: { type: String, default: () => new Date().toISOString().slice(0, 10), trim: true, maxlength: 10 },
    reviews_total:    { type: Number, default: 0, min: 0, max: 10000 },
    reviews_correct:  { type: Number, default: 0, min: 0, max: 10000 },
    created_at:       { type: String, default: () => new Date().toISOString() },
    updated_at:       { type: String, default: () => new Date().toISOString() },
  },
  { collection: 'flashcards', versionKey: false }
);

// Unique per user + front text (prevents duplicate cards)
flashcardSchema.index({ user_id: 1, front: 1 }, { unique: true });
// Efficient due query: GET /:userId/due filters by next_review_date
flashcardSchema.index({ user_id: 1, next_review_date: 1 });
// Cursor pagination: GET /:userId?cursor=created_at
flashcardSchema.index({ user_id: 1, created_at: -1 });
// For user history and analytics
flashcardSchema.index({ user_id: 1, updated_at: -1 });

flashcardSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.models.Flashcard || mongoose.model('Flashcard', flashcardSchema);
