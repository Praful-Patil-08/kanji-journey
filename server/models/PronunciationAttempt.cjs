'use strict';
const mongoose = require('mongoose');

const pronunciationAttemptSchema = new mongoose.Schema(
  {
    id: { type: String, default: () => crypto.randomUUID() },
    user_id: { type: String, required: true, index: true },
    targetText: { type: String, required: true },
    transcript: { type: String, required: true },
    pronunciationScore: { type: Number, required: true, min: 0, max: 100 },
    pitchAccentScore: { type: Number, required: true, min: 0, max: 100 },
    attemptNumber: { type: Number, required: true, min: 1 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { collection: 'pronunciation_attempts', versionKey: false }
);

pronunciationAttemptSchema.index({ user_id: 1, targetText: 1, createdAt: -1 });
pronunciationAttemptSchema.index({ user_id: 1, createdAt: -1 });
pronunciationAttemptSchema.index({ targetText: 1, createdAt: -1 });

pronunciationAttemptSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.models.PronunciationAttempt || mongoose.model('PronunciationAttempt', pronunciationAttemptSchema);
