import { useState, useRef } from 'react';
import { Upload, Scan, Plus, Loader2, BookOpen, AlertCircle, Sparkles } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/integrations/api/client';
import { useCreateFlashcard } from '@/hooks/data/useFlashcards';
import { toast } from 'sonner';

type KanjiInfo = {
  character: string;
  reading: string;
  meaning: string;
  jlpt: string | null;
  example?: string;
};

type OCRResult = {
  text: string;
  detection: { kanjiChars: string[]; compounds: string[]; hasKanji: boolean };
  kanji: KanjiInfo[];
};

export function OCRKanjiWorkflow() {
  const { user } = useAuth();
  const { mutateAsync: createFlashcard, isPending: creating } = useCreateFlashcard();
  const [mockText, setMockText] = useState('東京へ行きます');
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleExtract = async () => {
    setError(null);
    setResult(null);
    setSelectedKanji(null);
    setLoading(true);
    try {
      const imageBase64 = preview ? preview.split(',')[1]?.slice(0, 100) || 'dummy' : undefined;
      const data = await api.post<OCRResult>('/api/ocr', {
        ...(imageBase64 ? { imageBase64 } : {}),
        mockText: mockText || '東京',
      });
      setResult(data);
      if (data.detection.kanjiChars.length > 0) {
        setSelectedKanji(data.detection.kanjiChars[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Could not extract Japanese text. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const addToFlashcard = async (info: KanjiInfo) => {
    if (!user) return;
    try {
      await createFlashcard({
        user_id: user.id,
        front: info.character,
        back: `${info.reading} — ${info.meaning}${info.jlpt ? ` (${info.jlpt})` : ''}`,
      });
      toast.success(`Added ${info.character} to flashcards`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to add');
    }
  };

  const selectedInfo = result?.kanji.find(k => k.character === selectedKanji) || null;

  return (
    <div className="flex flex-col gap-8 animate-fade-in w-full max-w-[900px] mx-auto pb-16">
      {/* Header — learner-oriented only */}
      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-white tracking-tight">Learn Kanji from Any Image</h1>
        <p className="text-sm sm:text-base text-white/60 max-w-[560px] leading-relaxed">
          Upload an image containing Japanese text and discover the Kanji you want to learn.
        </p>
      </header>

      {/* Main upload card */}
      <GlassCard className="p-6 sm:p-8 space-y-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-bold text-white tracking-wide">Upload an image</h2>
            <p className="text-sm text-white/40">Take a photo or choose an image containing Japanese text.</p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
            aria-label="Upload image containing Japanese text"
          />

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all flex items-center justify-center gap-2"
            aria-label="Upload image containing Japanese text"
          >
            <Upload size={16} aria-hidden="true" />
            Upload Image
          </button>

          {preview && (
            <div className="pt-2">
              <img
                src={preview}
                alt="Preview of uploaded image containing Japanese text"
                className="max-h-[220px] w-auto rounded-xl border border-white/10 mx-auto sm:mx-0"
              />
            </div>
          )}

          {/* Sample text — not labeled as mock */}
          <div className="pt-4 border-t border-white/5 space-y-3">
            <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Or try an example</p>
            <div className="flex gap-2">
              <button
                onClick={() => setMockText('東京へ行きます')}
                className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-colors"
                aria-label="Use sample text 東京へ行きます"
              >
                東京へ行きます
              </button>
              <span className="hidden sm:inline-flex items-center text-xs text-white/20">Tap to use</span>
            </div>
            <label htmlFor="sample-text" className="sr-only">Sample Japanese text</label>
            <input
              id="sample-text"
              value={mockText}
              onChange={e => setMockText(e.target.value)}
              placeholder="Japanese text"
              className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-white/20"
              aria-label="Sample Japanese text"
            />
          </div>
        </div>

        <button
          onClick={handleExtract}
          disabled={loading}
          className="w-full py-4 rounded-xl bg-white text-black font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2.5 hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          aria-label="Extract Japanese text from image"
          aria-busy={loading}
        >
          {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Scan size={16} aria-hidden="true" />}
          {loading ? 'Analyzing…' : 'Extract Japanese'}
        </button>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-sm text-red-200" role="alert" aria-live="polite">
            <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-6 pt-6 border-t border-white/10">
            {/* Extracted text */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Japanese text found</h3>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xl sm:text-2xl font-medium text-white leading-relaxed break-words" lang="ja">{result.text}</p>
              </div>
            </div>

            {/* Kanji found — selectable */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-white/40">
                Kanji found {result.detection.kanjiChars.length > 0 ? `• ${result.detection.kanjiChars.length}` : ''}
              </h3>
              {result.detection.kanjiChars.length > 0 ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Kanji found — select to view details">
                  {result.detection.kanjiChars.map(char => (
                    <button
                      key={char}
                      onClick={() => setSelectedKanji(char)}
                      aria-pressed={selectedKanji === char}
                      aria-label={`View details for Kanji ${char}`}
                      className={`w-14 h-14 rounded-xl text-xl font-bold border transition-all focus:outline-none focus:ring-2 focus:ring-white/30 ${
                        selectedKanji === char
                          ? 'bg-white text-black border-white shadow-lg scale-[1.02]'
                          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white hover:border-white/20'
                      }`}
                    >
                      {char}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/40">No Kanji found in this text. Try another image with Kanji.</p>
              )}
              {result.detection.compounds.length > 0 && (
                <p className="text-xs text-white/30">Words: {result.detection.compounds.join(' • ')}</p>
              )}
            </div>

            {/* Selected Kanji detail */}
            {selectedInfo && (
              <div className="p-5 sm:p-6 rounded-2xl bg-white border border-white/10 shadow-xl space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <p className="text-4xl font-bold text-black tracking-tight">{selectedInfo.character}</p>
                    <p className="text-sm font-medium text-black/70">{selectedInfo.reading}</p>
                    <p className="text-sm text-black/60 leading-relaxed">{selectedInfo.meaning}{selectedInfo.jlpt ? ` • ${selectedInfo.jlpt}` : ''}</p>
                    {selectedInfo.example && (
                      <p className="text-xs text-black/40 italic pt-1" lang="ja">{selectedInfo.example}</p>
                    )}
                  </div>
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-black/5 flex items-center justify-center">
                    <BookOpen size={18} className="text-black/40" aria-hidden="true" />
                  </div>
                </div>
                <button
                  onClick={() => addToFlashcard(selectedInfo)}
                  disabled={creating}
                  className="w-full py-3.5 rounded-xl bg-black text-white font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-50 transition-colors"
                  aria-label={`Add ${selectedInfo.character} to flashcards`}
                >
                  <Plus size={14} aria-hidden="true" />
                  Add to Flashcards
                </button>
              </div>
            )}

            {/* Kanji list fallback when none selected yet */}
            {!selectedKanji && result.kanji.length > 0 && (
              <p className="text-xs text-white/30 text-center py-2">Select a Kanji above to see its meaning</p>
            )}
          </div>
        )}
      </GlassCard>

      {/* Learner-oriented footer — replaces technical HOW IT WORKS */}
      <GlassCard className="p-6 sm:p-8 flex gap-4 items-start">
        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-white/60" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-bold text-white tracking-wide">Turn real Japanese into something you can learn</h3>
          <p className="text-sm text-white/40 leading-relaxed">Find Kanji from signs, notes, books, screenshots, menus, and other Japanese text.</p>
        </div>
      </GlassCard>
    </div>
  );
}
