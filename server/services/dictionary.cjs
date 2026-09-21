'use strict';

/**
 * Dictionary service — lookup Kanji and vocabulary.
 * Uses Jisho API (https://jisho.org/api/v1/search/words?keyword=) with local cache.
 * Falls back to static JLPT data when offline.
 */

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function isCacheValid(entry) {
  return entry && Date.now() - entry.timestamp < CACHE_TTL;
}

// Minimal static dictionary for offline/demo and JLPT N5 core
const STATIC_DICT = {
  '東京': { reading: 'とうきょう', meaning: 'Tokyo', jlpt: 'N5', examples: ['東京へ行きます (I go to Tokyo)'] },
  '行': { reading: 'い・ぎょう', meaning: 'to go; line', jlpt: 'N5', examples: ['行きます (to go)'] },
  '京': { reading: 'きょう', meaning: 'capital', jlpt: 'N5', examples: ['東京 (Tokyo)'] },
  '学': { reading: 'がく', meaning: 'study', jlpt: 'N5', examples: ['学校 (school)'] },
  '校': { reading: 'こう', meaning: 'school', jlpt: 'N5', examples: ['学校 (school)'] },
  '学校': { reading: 'がっこう', meaning: 'school', jlpt: 'N5', examples: ['学校へ行きます'] },
  'は': { reading: 'わ', meaning: 'topic particle', jlpt: 'N5', examples: ['私は学生です'] },
  '水': { reading: 'みず', meaning: 'water', jlpt: 'N5', examples: ['水を飲みます'] },
  '火': { reading: 'ひ', meaning: 'fire', jlpt: 'N5', examples: ['火曜日 (Tuesday)'] },
};

async function lookupJisho(query) {
  const cacheKey = `jisho:${query}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.value;

  try {
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Jisho ${res.status}`);
    const data = await res.json();
    const first = data?.data?.[0];
    if (!first) throw new Error('No Jisho result');
    const japanese = first.japanese?.[0] || {};
    const senses = first.senses?.[0] || {};
    const result = {
      query,
      kanji: japanese.word || japanese.reading || query,
      reading: japanese.reading || '',
      meaning: (senses.english_definitions || []).slice(0, 3).join('; ') || 'No definition',
      jlpt: (first.jlpt || [])[0] || null,
      example: null,
      source: 'jisho',
      raw: first,
    };
    cache.set(cacheKey, { value: result, timestamp: Date.now() });
    return result;
  } catch (e) {
    // Fallback to static
    if (STATIC_DICT[query]) {
      const s = STATIC_DICT[query];
      const result = { query, kanji: query, reading: s.reading, meaning: s.meaning, jlpt: s.jlpt, example: s.examples[0], source: 'static' };
      cache.set(cacheKey, { value: result, timestamp: Date.now() });
      return result;
    }
    throw e;
  }
}

async function lookupKanji(character) {
  // For single Kanji, try Jisho first, then static
  return lookupJisho(character);
}

async function searchDictionary(query, limit = 10) {
  const cacheKey = `search:${query}:${limit}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.value;

  // Try Jisho search
  try {
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Jisho ${res.status}`);
    const data = await res.json();
    const results = (data?.data || []).slice(0, limit).map(item => {
      const japanese = item.japanese?.[0] || {};
      const senses = item.senses?.[0] || {};
      return {
        kanji: japanese.word || japanese.reading || '',
        reading: japanese.reading || '',
        meaning: (senses.english_definitions || []).slice(0, 2).join('; '),
        jlpt: (item.jlpt || [])[0] || null,
        is_common: !!item.is_common,
      };
    });
    cache.set(cacheKey, { value: results, timestamp: Date.now() });
    return results;
  } catch {
    // Fallback: search static dict
    const results = Object.entries(STATIC_DICT)
      .filter(([k, v]) => k.includes(query) || v.meaning.toLowerCase().includes(query.toLowerCase()) || v.reading.includes(query))
      .slice(0, limit)
      .map(([k, v]) => ({ kanji: k, reading: v.reading, meaning: v.meaning, jlpt: v.jlpt, is_common: true }));
    cache.set(cacheKey, { value: results, timestamp: Date.now() });
    return results;
  }
}

function clearCache() {
  cache.clear();
}

module.exports = { lookupJisho, lookupKanji, searchDictionary, clearCache, STATIC_DICT };
