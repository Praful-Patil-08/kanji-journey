'use strict';
const mongoose = require('mongoose');

const lessonProgressSchema = new mongoose.Schema(
  {
    id:             { type: String, default: () => crypto.randomUUID() },
    user_id:        { type: String, required: true, index: true },
    lesson_id:      { type: String, required: true },
    level:          { type: String, default: 'N5' },
    week_number:    { type: Number, default: 1 },
    completed:      { type: Boolean, default: false },
    completed_at:   { type: String, default: null },
    quiz_score:     { type: Number, default: null },
    time_spent_sec: { type: Number, default: 0 },
    created_at:     { type: String, default: () => new Date().toISOString() },
  },
  { collection: 'lesson_progress', versionKey: false }
);

lessonProgressSchema.index({ user_id: 1, lesson_id: 1 }, { unique: true });
// Pagination for quiz history: GET /:userId?cursor=completed_at
lessonProgressSchema.index({ user_id: 1, completed: 1, completed_at: -1 });
lessonProgressSchema.index({ user_id: 1, completed_at: -1 });

lessonProgressSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.models.LessonProgress || mongoose.model('LessonProgress', lessonProgressSchema);
