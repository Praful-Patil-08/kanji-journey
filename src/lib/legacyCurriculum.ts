export type LegacyCollectionId = 'h1' | 'k1' | 'p1' | 'v1' | 'f1' | 'f2';

export interface LegacyCollectionMeta {
  id: LegacyCollectionId;
  title: string;
  subtitle: string;
  icon: string;
  description: string;
  level: string;
  sortOrder: number;
}

export interface CatalogLessonRow {
  id: string;
  level: string;
  week_number: number;
  lesson_number: number;
  title: string;
  skill_area: string;
  topics: string[] | null;
}

export interface LegacyLesson {
  id: string;
  collection_id: string;
  title: string;
  subtitle: string;
  characters: string[];
  sort_order: number;
  content: Record<string, unknown>;
  lesson_catalog_id: string;
}

export const LEGACY_COLLECTIONS: LegacyCollectionMeta[] = [
  {
    id: 'h1',
    title: 'Hiragana Mastery',
    subtitle: 'The Foundation of Script',
    icon: 'あ',
    description: 'Master the 46 basic characters of the Japanese phonetic script.',
    level: 'N5',
    sortOrder: 1,
  },
  {
    id: 'k1',
    title: 'Katakana Essentials',
    subtitle: 'Foreign Loanwords',
    icon: 'ア',
    description: 'Focus on the script used specifically for foreign concepts, names, and loanwords.',
    level: 'N5',
    sortOrder: 2,
  },
  {
    id: 'p1',
    title: 'Particle Logic',
    subtitle: 'Grammatical Glue',
    icon: '助',
    description: 'Decode the mystery of WA, GA, WO, and NI. The particles that hold sentences together.',
    level: 'N5',
    sortOrder: 3,
  },
  {
    id: 'v1',
    title: 'Verbal Rituals',
    subtitle: 'Conjugation Pillars',
    icon: '動',
    description: 'Master the fundamental polite and plain verb forms of the N5 level.',
    level: 'N5',
    sortOrder: 4,
  },
  {
    id: 'f1',
    title: 'The Starter Pack',
    subtitle: 'Daily Life',
    icon: '基',
    description: 'The absolute essentials for surviving daily life in Japan.',
    level: 'N5',
    sortOrder: 5,
  },
  {
    id: 'f2',
    title: 'Intermediate Pack',
    subtitle: 'Complex Contexts',
    icon: '極',
    description: 'Nuanced grammar and vocabulary for the bridge to N4.',
    level: 'N4',
    sortOrder: 6,
  },
];

const CHARACTER_PRESETS: Record<string, string[]> = {
  'Hiragana — あいうえお row': ['あ', 'い', 'う', 'え', 'お'],
  'Hiragana — かきくけこ row': ['か', 'き', 'く', 'け', 'こ'],
  'Katakana — アイウエオ row': ['ア', 'イ', 'ウ', 'エ', 'オ'],
  'Katakana — カキクケコ row': ['カ', 'キ', 'ク', 'ケ', 'コ'],
  'Core Particles は を に で': ['は', 'を', 'に', 'で'],
};

export const STATIC_LESSONS: Record<string, LegacyLesson[]> = {
  h1: [
    { id: 'n5-w1-l1', collection_id: 'h1', title: 'Hiragana — あいうえお row', subtitle: 'Week 1 Lesson 1', characters: ['あ','い','う','え','お'], sort_order: 101, content: { topics: ['hiragana'], skill_area: 'kanji', level: 'N5' }, lesson_catalog_id: 'n5-w1-l1' },
    { id: 'n5-w1-l2', collection_id: 'h1', title: 'Hiragana — かきくけこ row', subtitle: 'Week 1 Lesson 2', characters: ['か','き','く','け','こ'], sort_order: 102, content: { topics: ['hiragana'], skill_area: 'kanji', level: 'N5' }, lesson_catalog_id: 'n5-w1-l2' },
  ],
  k1: [
    { id: 'n5-w2-l1', collection_id: 'k1', title: 'Katakana — アイウエオ row', subtitle: 'Week 2 Lesson 1', characters: ['ア','イ','ウ','エ','オ'], sort_order: 201, content: { topics: ['katakana'], skill_area: 'kanji', level: 'N5' }, lesson_catalog_id: 'n5-w2-l1' },
    { id: 'n5-w2-l2', collection_id: 'k1', title: 'Katakana — カキクケコ row', subtitle: 'Week 2 Lesson 2', characters: ['カ','キ','ク','ケ','コ'], sort_order: 202, content: { topics: ['katakana'], skill_area: 'kanji', level: 'N5' }, lesson_catalog_id: 'n5-w2-l2' },
  ],
  p1: [
    { id: 'n5-w3-l2', collection_id: 'p1', title: 'Core Particles は を に で', subtitle: 'Week 3 Lesson 2', characters: ['は','を','に','で'], sort_order: 302, content: { topics: ['particles'], skill_area: 'grammar', level: 'N5' }, lesson_catalog_id: 'n5-w3-l2' },
  ],
  v1: [
    { id: 'n5-w6-l1', collection_id: 'v1', title: 'Essential Verbs — Group 1', subtitle: 'Week 6 Lesson 1', characters: [], sort_order: 601, content: { topics: ['verbs'], skill_area: 'grammar', level: 'N5' }, lesson_catalog_id: 'n5-w6-l1' },
    { id: 'n5-w6-l2', collection_id: 'v1', title: 'Essential Verbs — Group 2', subtitle: 'Week 6 Lesson 2', characters: [], sort_order: 602, content: { topics: ['verbs'], skill_area: 'grammar', level: 'N5' }, lesson_catalog_id: 'n5-w6-l2' },
  ],
  f1: [
    { id: 'n5-w3-l1', collection_id: 'f1', title: 'Basic Greetings', subtitle: 'Week 3 Lesson 1', characters: [], sort_order: 301, content: { topics: ['greetings'], skill_area: 'vocabulary', level: 'N5' }, lesson_catalog_id: 'n5-w3-l1' },
    { id: 'n5-w4-l1', collection_id: 'f1', title: 'Numbers 1–100', subtitle: 'Week 4 Lesson 1', characters: [], sort_order: 401, content: { topics: ['numbers'], skill_area: 'vocabulary', level: 'N5' }, lesson_catalog_id: 'n5-w4-l1' },
  ],
  f2: [
    { id: 'n4-w1-l1', collection_id: 'f2', title: 'N4 Kanji — Part 1', subtitle: 'Week 1 Lesson 1', characters: [], sort_order: 101, content: { topics: ['kanji'], skill_area: 'kanji', level: 'N4' }, lesson_catalog_id: 'n4-w1-l1' },
    { id: 'n4-w1-l2', collection_id: 'f2', title: 'N4 Grammar — て-form uses', subtitle: 'Week 1 Lesson 2', characters: [], sort_order: 102, content: { topics: ['grammar'], skill_area: 'grammar', level: 'N4' }, lesson_catalog_id: 'n4-w1-l2' },
  ],
};

export function getLegacyCollectionMeta(collectionId: string) {
  return LEGACY_COLLECTIONS.find((collection) => collection.id === collectionId) ?? null;
}

export function deriveLegacyCollectionId(row: Pick<CatalogLessonRow, 'level' | 'title' | 'skill_area' | 'topics'>): LegacyCollectionId {
  const topics = row.topics ?? [];
  const normalizedTitle = row.title.toLowerCase();

  if (topics.includes('hiragana') || normalizedTitle.includes('hiragana')) return 'h1';
  if (topics.includes('katakana') || normalizedTitle.includes('katakana')) return 'k1';
  if (topics.includes('particles') || normalizedTitle.includes('particle')) return 'p1';
  if (topics.includes('verbs') || normalizedTitle.includes('verb')) return 'v1';
  if (row.level === 'N4') return 'f2';
  return 'f1';
}

function extractCharacters(title: string) {
  if (CHARACTER_PRESETS[title]) return CHARACTER_PRESETS[title];

  const matches = title.match(/[ぁ-ゖァ-ヺー一-龯々]+/g) ?? [];
  return matches.flatMap((match) => Array.from(match)).filter(Boolean);
}

export function toLegacyLesson(row: CatalogLessonRow): LegacyLesson {
  const collectionId = deriveLegacyCollectionId(row);
  return {
    id: row.id,
    collection_id: collectionId,
    title: row.title,
    subtitle: `Week ${row.week_number} Lesson ${row.lesson_number}`,
    characters: extractCharacters(row.title),
    sort_order: row.week_number * 100 + row.lesson_number,
    content: {
      topics: row.topics ?? [],
      skill_area: row.skill_area,
      level: row.level,
    },
    lesson_catalog_id: row.id,
  };
}
