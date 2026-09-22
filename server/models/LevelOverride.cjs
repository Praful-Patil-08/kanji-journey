'use strict';
const mongoose = require('mongoose');

const levelOverrideSchema = new mongoose.Schema(
  {
    id:           { type: String, default: () => crypto.randomUUID() },
    user_id:      { type: String, required: true, unique: true, index: true },
    level:        { type: String, required: true, enum: ['N5','N4','N3','N2','N1'], trim: true },
    confirmed_at: { type: String, default: () => new Date().toISOString(), trim: true, maxlength: 30 },
  },
  { collection: 'level_overrides', versionKey: false }
);

levelOverrideSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.models.LevelOverride || mongoose.model('LevelOverride', levelOverrideSchema);
