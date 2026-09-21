'use strict';
const mongoose = require('mongoose');

// PracticeAttempt — granular record of every quiz/practice answer.
// Feeds mastery engine and recommendation engine. Minimal duplication.
const practiceAttemptSchema = new mongoose.Schema(
  {
    id:              { type: String, default: () => crypto.randomUUID() },
    user_id:         { type: String, required: true, index: true },
    questionId:      { type: String, required: true }, // stable question id (e.g. practice catalog id)
    topic:           { type: String, required: true }, // kanji | vocabulary | grammar | reading | listening | particles etc.
    section:         { type: String, default: null },   // vocabulary | grammar | reading | listening
    selectedAnswer:  { type: String, required: true },
    correctAnswer:   { type: String, required: true },
    isCorrect:       { type: Boolean, required: true },
    responseTimeMs:  { type: Number, default: null },   // client-measured, optional
    difficulty:      { type: String, enum: ['easy','medium','hard', null], default: null },
    level:           { type: String, default: 'N5' },   // JLPT level context
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
