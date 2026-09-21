'use strict';

/**
 * Modular OCR service — provider can be swapped without changing callers.
 * For portfolio/demo, the default is a deterministic mock that extracts
 * Japanese characters via regex from a `mockText` field, plus a real
 * HuggingFace TrOCR provider if HF_API_TOKEN is set.
 *
 * Interface: recognize({ imageBase64, mockText? }) => { text, provider }
 * - text: extracted Japanese text (or mockText if provided)
 * - provider: 'mock' | 'hf-trOCR' | 'tesseract'
 */

function extractJapanese(text) {
  // Extract Japanese characters (hiragana, katakana, kanji, etc.)
  const matches = (text || '').match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]+/g) || [];
  return matches.join('');
}

async function recognizeWithHF(imageBase64) {
  const hfToken = process.env.HF_API_TOKEN;
  const hfModel = process.env.HF_OCR_MODEL || 'microsoft/trocr-base-printed';
  if (!hfToken) return null;
  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: imageBase64 }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    // TrOCR returns [{ generated_text: "..." }]
    const text = data?.[0]?.generated_text || data?.generated_text || data?.text || '';
    if (text) return { text: text.trim(), provider: 'hf-trOCR' };
  } catch {}
  return null;
}

async function recognize({ imageBase64, mockText } = {}) {
  if (!imageBase64 && !mockText) throw new Error('imageBase64 or mockText is required');

  // For testing/demo, allow passing mockText directly to bypass real OCR
  if (mockText) {
    return { text: mockText.trim(), provider: 'mock' };
  }

  // Try HF provider first if configured
  if (process.env.HF_API_TOKEN) {
    const hfResult = await recognizeWithHF(imageBase64);
    if (hfResult) return hfResult;
  }

  // Fallback: try to extract from imageBase64 if it happens to be plain text (data URL with text)
  // For now, return a helpful error instead of faking
  throw new Error('OCR provider not configured. Set HF_API_TOKEN or provide mockText for testing. See server/services/ocr.cjs');
}

function detectKanji(text) {
  const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF]/g;
  const kanjiChars = [...new Set((text || '').match(kanjiRegex) || [])];
  // Also extract contiguous kanji compounds (e.g., 東京)
  const compounds = (text || '').match(/[\u4E00-\u9FAF]{2,}/g) || [];
  const uniqueCompounds = [...new Set(compounds)];
  return {
    text,
    kanjiChars,
    compounds: uniqueCompounds,
    hasKanji: kanjiChars.length > 0,
  };
}

module.exports = { recognize, detectKanji, extractJapanese };
