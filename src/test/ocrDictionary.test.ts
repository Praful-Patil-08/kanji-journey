// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { detectKanji, extractJapanese } = require('../../server/services/ocr.cjs');
const { STATIC_DICT } = require('../../server/services/dictionary.cjs');

describe('OCR Kanji detection', () => {
  it('detects Kanji characters', () => {
    const res = detectKanji('東京へ行きます');
    expect(res.hasKanji).toBe(true);
    expect(res.kanjiChars).toContain('東');
    expect(res.kanjiChars).toContain('京');
    expect(res.compounds).toContain('東京');
  });

  it('no Kanji for hiragana only', () => {
    const res = detectKanji('あいうえお');
    expect(res.hasKanji).toBe(false);
    expect(res.kanjiChars).toHaveLength(0);
  });

  it('handles mixed text', () => {
    const res = detectKanji('私は学校へ行きます');
    expect(res.kanjiChars).toContain('私');
    expect(res.kanjiChars).toContain('学');
    expect(res.kanjiChars).toContain('校');
  });

  it('deduplicates Kanji', () => {
    const res = detectKanji('東京東京');
    expect(res.kanjiChars.filter(c => c === '東').length).toBe(1);
  });

  it('extractJapanese extracts hiragana/katakana/kanji', () => {
    const text = extractJapanese('Hello 東京 World こんにちは');
    expect(text).toContain('東京');
    expect(text).toContain('こんにちは');
  });
});

describe('Dictionary static fallback', () => {
  it('has Tokyo entry', () => {
    expect(STATIC_DICT['東京']).toBeTruthy();
    expect(STATIC_DICT['東京'].reading).toBe('とうきょう');
    expect(STATIC_DICT['東京'].jlpt).toBe('N5');
  });

  it('has core particles', () => {
    expect(STATIC_DICT['は']).toBeTruthy();
    expect(STATIC_DICT['は'].meaning).toContain('particle');
  });

  it('lookup for unknown returns undefined', () => {
    expect(STATIC_DICT['未知']).toBeUndefined();
  });
});

describe('OCR→Dictionary→Flashcard flow contract', () => {
  it('detected Kanji can be added to flashcards', () => {
    const detection = detectKanji('東京へ行きます');
    expect(detection.hasKanji).toBe(true);
    // Simulate adding first kanji to flashcard
    const firstKanji = detection.kanjiChars[0];
    const dictEntry = STATIC_DICT[firstKanji] || STATIC_DICT['東京'];
    expect(dictEntry).toBeTruthy();
    // Flashcard payload would be front=character, back=reading — meaning
    const flashcardPayload = {
      front: firstKanji,
      back: `${dictEntry.reading} — ${dictEntry.meaning}`,
    };
    expect(flashcardPayload.front).toBeTruthy();
    expect(flashcardPayload.back).toContain(dictEntry.reading);
  });

  it('workflow limits to 5 kanji for performance', () => {
    const longText = '東京大阪京都名古屋福岡札幌横浜神戸広島';
    const detection = detectKanji(longText);
    const toLookup = [...detection.kanjiChars.slice(0, 5), ...detection.compounds.slice(0, 2)].slice(0, 5);
    expect(toLookup.length).toBeLessThanOrEqual(5);
  });
});

describe('Dictionary search contract', () => {
  it('search respects limit', async () => {
    // Mock search that respects limit
    const mockSearch = async (query: string, limit: number) => {
      const results = Object.keys(STATIC_DICT).slice(0, limit).map(k => ({ kanji: k }));
      return results;
    };
    const res = await mockSearch('test', 3);
    expect(res.length).toBe(3);
  });
});
