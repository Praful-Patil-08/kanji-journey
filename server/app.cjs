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
const practiceAttemptsRouter = require('./routes/practiceAttempts.cjs');
const masteryRouter         = require('./routes/mastery.cjs');
const recommendationsRouter  = require('./routes/recommendations.cjs');
const pronunciationRouter    = require('./routes/pronunciation.cjs');
const ocrRouter              = require('./routes/ocr.cjs');
const dictionaryRouter       = require('./routes/dictionary.cjs');
const chatRouter            = require('./routes/chat.cjs').chatRouter;
const PronunciationAttempt   = require('./models/PronunciationAttempt.cjs');
const { authSupabase }       = require('./middleware/authSupabase.cjs');
const { notFound, errorHandler } = require('./middleware/errorHandler.cjs');
const { rateLimit }          = require('./middleware/rateLimit.cjs');

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

// ── Request logging (dev) ────────────────────────────────────────────────────
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// ── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Rate limiting for expensive endpoints ─────────────────────────────────────
const chatLimiter = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'chat' });
const pronLimiter = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'pron' });
const ocrLimiter  = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: 'ocr' });

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
app.use('/api/practice-attempts', practiceAttemptsRouter);
app.use('/api/mastery',        masteryRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/chat', chatLimiter, chatRouter);
app.use('/api/pronunciation', pronLimiter, pronunciationRouter);
app.use('/api/ocr', ocrLimiter, ocrRouter);
app.use('/api',                dictionaryRouter); // handles /api/dictionary/search and /api/kanji/:character

// ── Legacy routes ────────────────────────────────────────────────────────────
app.use(guestAuthRouter);

// ── Pronunciation scoring (HuggingFace ASR — no DB) ─────────────────────────────────────
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

// Pronunciation scoring + history (scores not faked, persisted when authenticated) — rate limited
app.post('/api/pronunciation/score', pronLimiter, async (req, res) => {
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

    const baseResponse = {
      transcript, pronunciationScore, pitchAccentScore,
      suggestions: pronunciationScore < 75
        ? ['Speak slightly slower and keep mora timing even.', 'Repeat while shadowing native audio 2-3 times.', 'Focus on vowel length and small-tsu pauses.']
        : ['Good clarity. Next: refine pitch accent contour.'],
    };

    // Try to persist if authenticated (optional — don't fail the scoring if not)
    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        // Reuse auth logic without requiring it: try Supabase verification, fallback to decode
        const { createClient } = require('@supabase/supabase-js');
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (supabaseUrl && serviceKey) {
          const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
          const { data } = await supabase.auth.getUser(token);
          userId = data?.user?.id || null;
        } else {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
          userId = payload?.sub || null;
        }
      } catch {}
    }

    if (userId) {
      try {
        const count = await PronunciationAttempt.countDocuments({ user_id: userId, targetText });
        const attemptNumber = count + 1;
        const doc = await PronunciationAttempt.create({
          id: crypto.randomUUID(),
          user_id: userId,
          targetText,
          transcript,
          pronunciationScore,
          pitchAccentScore,
          attemptNumber,
          createdAt: new Date(),
        });
        // Also feed a lightweight PracticeAttempt for analytics (listening/speaking)
        try {
          const PracticeAttempt = require('./models/PracticeAttempt.cjs');
          await PracticeAttempt.create({
            id: crypto.randomUUID(),
            user_id: userId,
            questionId: `pronunciation:${targetText}`,
            topic: 'listening',
            section: 'listening',
            selectedAnswer: transcript,
            correctAnswer: targetText,
            isCorrect: pronunciationScore >= 75,
            responseTimeMs: null,
            difficulty: pronunciationScore >= 75 ? 'easy' : 'hard',
            level: 'N5',
            createdAt: new Date(),
          });
        } catch {}
        return res.json({ ...baseResponse, attemptNumber, historyId: doc.id, persisted: true });
      } catch (e) {
        console.error('[pronunciation] persist failed:', e.message);
        return res.json({ ...baseResponse, persisted: false });
      }
    }

    return res.json({ ...baseResponse, persisted: false });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Pronunciation scoring failed' });
  }
});

// ── 404 + centralized error handling ───────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`[Server] Listening on http://localhost:${port}`));
connectDB().catch((err) => console.error('[DB Error]', err));

module.exports = { app };