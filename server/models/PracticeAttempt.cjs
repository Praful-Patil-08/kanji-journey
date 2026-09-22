'use strict';
const mongoose = require('mongoose');

// PracticeAttempt — granular record of every quiz/practice answer.
// Feeds mastery engine and recommendation engine. Minimal duplication.
const practiceAttemptSchema = new mongoose.Schema(
  {
    id:              { type: String, default: () => crypto.randomUUID() },
    user_id:         { type: String, required: true, index: true },
    questionId:      { type: String, required: true, trim: true, maxlength: 100 },
    topic:           { type: String, required: true, trim: true, maxlength: 64 },
    section:         { type: String, default: null, trim: true, maxlength: 64 },
    selectedAnswer:  { type: String, required: true, trim: true, maxlength: 500 },
    correctAnswer:   { type: String, required: true, trim: true, maxlength: 500 },
    isCorrect:       { type: Boolean, required: true },
    responseTimeMs:  { type: Number, default: null, min: 0, max: 600000 },
    difficulty:      { type: String, enum: ['easy','medium','hard', null], default: null, trim: true },
    level:           { type: String, default: 'N5', enum: ['N5','N4','N3','N2','N1'], trim: true },
    createdAt:       { type: Date, default: () => new Date() },
  },
  { collection: 'practice_attempts', versionKey: false }
);

// ── Indexes for required access patterns ──────────────────────────────────
// user history (all attempts for user, newest first)
practiceAttemptSchema.index({ user_id: 1, createdAt: -1 });
// topic history (per-user per-topic)
practiceAttemptSchema.index({ user_id: 1, topic: 1, createdAt: -1 });
// question history (per-question for item analysis)
practiceAttemptSchema.index({ questionId: 1, createdAt: -1 });
// recent attempts (global recent, for admin/analytics if needed)
practiceAttemptSchema.index({ createdAt: -1 });
// compound for mastery engine: user + topic + correctness window
practiceAttemptSchema.index({ user_id: 1, isCorrect: 1, createdAt: -1 });

practiceAttemptSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.models.PracticeAttempt || mongoose.model('PracticeAttempt', practiceAttemptSchema);
