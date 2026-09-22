'use strict';
const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    id:                   { type: String, default: () => crypto.randomUUID() },
    user_id:              { type: String, required: true, unique: true, index: true },
    display_name:         { type: String, default: null, trim: true, maxlength: 50 },
    bio:                  { type: String, default: null, trim: true, maxlength: 500 },
    avatar_url:           { type: String, default: null, trim: true, maxlength: 500 },
    current_level:        { type: String, default: 'N5', enum: ['N5','N4','N3','N2','N1'], trim: true },
    xp:                   { type: Number, default: 0, min: 0, max: 1000000 },
    streak:               { type: Number, default: 0, min: 0, max: 3650 },
    readiness_score:      { type: Number, default: 0, min: 0, max: 100 },
    daily_goal_minutes:   { type: Number, default: 20, min: 5, max: 120 },
    exam_date:            { type: String, default: null, trim: true, maxlength: 20 },
    learning_path:        { type: String, default: null, trim: true, maxlength: 20 },
    onboarding_completed: { type: Boolean, default: false },
    last_activity_date:   { type: String, default: null, trim: true, maxlength: 20 },
    created_at:           { type: String, default: () => new Date().toISOString() },
    updated_at:           { type: String, default: () => new Date().toISOString() },
  },
  { collection: 'profiles', versionKey: false }
);

profileSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret.id || ret._id?.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.models.Profile || mongoose.model('Profile', profileSchema);
