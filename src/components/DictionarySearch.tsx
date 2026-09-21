import { useState } from 'react';
import { Search, Plus, BookOpen, Loader2 } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/integrations/api/client';
import { useCreateFlashcard } from '@/hooks/data/useFlashcards';
import { toast } from 'sonner';

type DictEntry = {
  kanji: string;
  reading: string;
  meaning: string;
  jlpt: string | null;
  is_common?: boolean;
};

export function DictionarySearch() {
  const { user } = useAuth();
  const { mutateAsync: createFlashcard, isPending } = useCreateFlashcard();
  const [query, setQuery] = useState('東京');
  const [results, setResults] = useState<DictEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DictEntry | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ query: string; results: DictEntry[] }>(`/api/dictionary/search?q=${encodeURIComponent(query)}&limit=10`);
      setResults(data.results);
      if (data.results.length === 0) setError('No results');
    } catch (e: any) {
      setError(e.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const lookupKanji = async (char: string) => {
    setLoading(true);
    try {
      const data = await api.get<any>(`/api/kanji/${encodeURIComponent(char)}`);
      setSelected({ kanji: data.kanji || char, reading: data.reading, meaning: data.meaning, jlpt: data.jlpt });
      setResults([data]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const addToFlashcard = async (entry: DictEntry) => {
    if (!user) return;
    try {
      await createFlashcard({
        user_id: user.id,
        front: entry.kanji,
        back: `${entry.reading} — ${entry.meaning}${entry.jlpt ? ` (${entry.jlpt})` : ''}`,
      });
      toast.success(`Added ${entry.kanji} to flashcards`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[800px] mx-auto pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">Dictionary</h1>
        <p className="text-sm text-white/50">Search Jisho → view Kanji → add to flashcards → SRS</p>
      </header>

      <GlassCard className="p-5 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="Search Kanji, reading or meaning (e.g., 東京, water, みず)"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30"
            />
          </div>
          <button onClick={search} disabled={loading} className="px-5 py-2.5 rounded-xl bg-white text-black text-xs font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search
          </button>
        </div>

        <div className="flex gap-2">
          {['東京', '水', '学', 'は vs が'].map(ex => (
            <button key={ex} onClick={() => { setQuery(ex); setTimeout(search, 0); }} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/60">
              {ex}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-red-300">{error}</p>}

        {results.length > 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2"><BookOpen size={12} /> Results ({results.length})</p>
            {results.map((r, i) => (
              <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 cursor-pointer" onClick={() => r.kanji && [...r.kanji].length === 1 && lookupKanji(r.kanji)}>
                  <p className="text-xl font-bold text-white">{r.kanji}</p>
                  <p className="text-xs text-white/60">{r.reading} • {r.meaning} {r.jlpt ? `• ${r.jlpt}` : ''}</p>
                </div>
                <button
                  onClick={() => addToFlashcard(r)}
                  disabled={isPending}
                  className="px-3 py-2 rounded-full bg-white text-black text-xs font-black uppercase tracking-wide flex items-center gap-1"
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div className="p-4 rounded-xl bg-white text-black space-y-1">
            <p className="text-2xl font-bold">{selected.kanji}</p>
            <p className="text-sm">{selected.reading} — {selected.meaning}</p>
            <p className="text-xs text-black/50">{selected.jlpt || 'No JLPT'}</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
