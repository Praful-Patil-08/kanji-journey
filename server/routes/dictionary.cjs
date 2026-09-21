'use strict';
const express = require('express');
const { authSupabase } = require('../middleware/authSupabase.cjs');
const { searchDictionary, lookupKanji } = require('../services/dictionary.cjs');

const router = express.Router();

// GET /api/dictionary/search?q=...&limit=10  (mounted at /api)
router.get('/dictionary/search', authSupabase(), async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(400).json({ error: 'q is required' });
    if (q.length > 100) return res.status(400).json({ error: 'q too long' });
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 10, 1), 20);
    const results = await searchDictionary(q, limit);
    return res.json({ query: q, results, cached: false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/kanji/:character
router.get('/kanji/:character', authSupabase(), async (req, res) => {
  try {
    const char = req.params.character;
    if (!char || [...char].length !== 1) return res.status(400).json({ error: 'Single Kanji character required' });
    if (!/[\u4E00-\u9FAF]/.test(char)) return res.status(400).json({ error: 'Not a Kanji character' });
    const info = await lookupKanji(char);
    return res.json(info);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
