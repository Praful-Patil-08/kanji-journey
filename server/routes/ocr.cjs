'use strict';
const express = require('express');
const { authSupabase } = require('../middleware/authSupabase.cjs');
const { recognize, detectKanji } = require('../services/ocr.cjs');
const { lookupKanji } = require('../services/dictionary.cjs');

const router = express.Router();

// POST /api/ocr — Image → OCR → Japanese text → Kanji detection → Dictionary lookup
// Body: { imageBase64?: string, mockText?: string }  (mockText for testing/demo)
// Requires auth
router.post('/', authSupabase(), async (req, res) => {
  try {
    const { imageBase64, mockText } = req.body || {};
    if (!imageBase64 && !mockText) {
      return res.status(400).json({ error: 'imageBase64 or mockText is required' });
    }
    if (imageBase64 && imageBase64.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 10MB base64)' });
    }

    const { text, provider } = await recognize({ imageBase64, mockText });
    if (!text) return res.status(422).json({ error: 'No Japanese text detected', provider });

    const detection = detectKanji(text);
    if (!detection.hasKanji) {
      return res.json({ text, provider, detection, kanji: [] });
    }

    // Lookup each unique kanji (limit to 5 for performance)
    const toLookup = [...detection.kanjiChars.slice(0, 5), ...detection.compounds.slice(0, 2)].slice(0, 5);
    const kanjiResults = [];
    for (const char of toLookup) {
      try {
        const info = await lookupKanji(char);
        kanjiResults.push({ character: char, ...info });
      } catch (e) {
        kanjiResults.push({ character: char, reading: '', meaning: 'Lookup failed', jlpt: null, source: 'error', error: e.message });
      }
    }

    return res.json({
      text,
      provider,
      detection,
      kanji: kanjiResults,
    });
  } catch (err) {
    // Handle OCR provider not configured gracefully
    if (err.message && err.message.includes('OCR provider not configured')) {
      return res.status(503).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
