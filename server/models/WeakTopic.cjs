'use strict';
const mongoose = require('mongoose');

const weakTopicSchema = new mongoose.Schema(
  {
    id:             { type: String, default: () => crypto.randomUUID() },
    user_id:        { type: String, required: true, index: true },
    topic:          { type: String, required: true, trim: true, maxlength: 64 },
    skill_area:     { type: String, required: true, trim: true, maxlength: 64 },
    mistakes_count: { type: Number, default: 1, min: 0, max: 10000 },
    last_seen_at:   { type: String, default: () => new Date().toISOString(), trim: true, maxlength: 30 },
  },
  { collection: 'weak_topics', versionKey: false }
);

weakTopicSchema.index({ user_id: 1, topic: 1, skill_area: 1 }, { unique: true });

weakTopicSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.models.WeakTopic || mongoose.model('WeakTopic', weakTopicSchema);
