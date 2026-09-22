'use strict';
require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const cookieParser = require('cookie-parser');
const { connectDB } = require('./db.cjs');

// ── Routes ───────────────────────────────────────────────────────────────────
const profilesRouter        = require('./routes/profiles.cjs');
const collectionsRouter     = require('./routes/collections.cjs');
const lessonsRouter         = require('./routes/lessons.cjs');
const lessonProgressRouter  = require('./routes/lessonProgress.cjs');
const learningPathsRouter   = require('./routes/learningPaths.cjs');
const levelOverridesRouter  = require('./routes/levelOverrides.cjs');
const flashcardsRouter      = require('./routes/flashcards.cjs');
const weakTopicsRouter      = require('./routes/weakTopics.cjs');
const completionsRouter     = require('./routes/completions.cjs');
const quizHistoryRouter     = require('./routes/quizHistory.cjs');

// Legacy routes (kept as-is)
const { guestAuthRouter }   = require('./auth/guest.route.cjs');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
].filter(Boolean);

const isDev = process.env.NODE_ENV !== 'production';

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // server-to-server
    if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return cb(null, true); // allow any localhost port in dev
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '25mb' }));
app.use(cookieParser());

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── MongoDB-backed API routes ─────────────────────────────────────────────────
app.use('/api/profiles',       profilesRouter);
app.use('/api/collections',    collectionsRouter);
app.use('/api/lessons',        lessonsRouter);
app.use('/api/lesson-progress', lessonProgressRouter);
app.use('/api/learning-paths', learningPathsRouter);
app.use('/api/level-overrides', levelOverridesRouter);
app.use('/api/flashcards',     flashcardsRouter);
app.use('/api/weak-topics',    weakTopicsRouter);
app.use('/api/complete-lesson', completionsRouter);
app.use('/api/quiz-history',   quizHistoryRouter);

// ── Legacy routes ────────────────────────────────────────────────────────────
app.use(guestAuthRouter);

// Pronunciation scoring (HuggingFace ASR — no DB)
const JLPT_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);

function base64ToBuffer(b64) { return Buffer.from(b64, 'base64'); }
function normalize(s) { return (s ?? '').toString().trim().toLowerCase(); }
function similarityPercent(a, b) {
  const aa = normalize(a), bb = normalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 100;
  const max = Math.max(aa.length, bb.length);
  let same = 0;
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] === bb[i]) same++;
  return Math.max(0, Math.round((same / max) * 100));
}

app.post('/api/pronunciation/score', async (req, res) => {
  try {
    const { audioBase64, targetText } = req.body ?? {};
    if (!audioBase64 || !targetText) return res.status(400).json({ message: 'audioBase64 and targetText are required' });

    const hfToken = process.env.HF_API_TOKEN;
    const hfModel = process.env.HF_JA_ASR_MODEL || 'kotoba-tech/kotoba-whisper-v2.0';
    if (!hfToken) return res.status(503).json({ message: 'HF_API_TOKEN not configured' });

    const asrRes = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hfToken}`, 'Content-Type': 'audio/webm' },
      body: base64ToBuffer(audioBase64),
    });
    const asrPayload = await asrRes.json();
    if (!asrRes.ok) return res.status(502).json({ message: asrPayload?.error || `ASR failed (${asrRes.status})` });

    const transcript = (asrPayload?.text ?? '').toString().trim();
    const pronunciationScore = similarityPercent(transcript, targetText);
    const pitchAccentScore = Math.max(40, pronunciationScore - 8);

    return res.json({
      transcript, pronunciationScore, pitchAccentScore,
      suggestions: pronunciationScore < 75
        ? ['Speak slightly slower and keep mora timing even.', 'Repeat while shadowing native audio 2-3 times.', 'Focus on vowel length and small-tsu pauses.']
        : ['Good clarity. Next: refine pitch accent contour.'],
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Pronunciation scoring failed' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const port = Number(process.env.PORT || 4000);
  connectDB().then(() => {
    app.listen(port, () => console.log(`[Server] Listening on http://localhost:${port}`));
  });
}

module.exports = { app };
