import { useState, useRef } from 'react';
import { Upload, Scan, Plus, Loader2, BookOpen, AlertCircle } from 'lucide-react';
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
  source: string;
  example?: string;
};

type OCRResult = {
  text: string;
  provider: string;
  detection: { kanjiChars: string[]; compounds: string[]; hasKanji: boolean };
  kanji: KanjiInfo[];
};

export function OCRKanjiWorkflow() {
  const { user } = useAuth();
  const { mutateAsync: createFlashcard, isPending: creating } = useCreateFlashcard();
  const [mockText, setMockText] = useState('東京へ行きます');
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<OCRResult | null>(null);
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

  const runOCR = async () => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      // For demo/portfolio, we use mockText to avoid needing a real OCR provider.
      // In production, imageBase64 would be sent and HF TrOCR would run.
      const imageBase64 = preview ? preview.split(',')[1]?.slice(0, 100) || 'dummy' : undefined;
      const data = await api.post<OCRResult>('/api/ocr', {
        ...(imageBase64 ? { imageBase64 } : {}),
        mockText: mockText || '東京',
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'OCR failed');
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

  return (
    <div className="flex flex-col gap-8 animate-fade-in w-full max-w-[900px] mx-auto pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-display font-bold text-white tracking-tight">OCR Kanji Workflow</h1>
        <p className="text-sm text-white/50">Image → OCR → Kanji detection → Dictionary → Flashcard</p>
      </header>

      <GlassCard className="p-6 space-y-6">
        <div className="space-y-3">
          <label className="text-xs font-black uppercase tracking-widest text-white/60">Image (or use mock text)</label>
          <div className="flex gap-3">
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white/70 flex items-center gap-2">
              <Upload size={14} /> Upload Image
            </button>
            <input
              value={mockText}
              onChange={e => setMockText(e.target.value)}
              placeholder="Mock Japanese text for demo (e.g., 東京へ行きます)"
              className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30"
            />
          </div>
          {preview && <img src={preview} alt="preview" className="max-h-[200px] rounded-xl border border-white/10" />}
        </div>

        <button
          onClick={runOCR}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Scan size={14} />}
          Run OCR
        </button>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-xs text-red-300">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {result && (
          <div className="space-y-4 pt-4 border-t border-white/10">
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Detected Text via {result.provider}</p>
              <p className="text-lg font-medium text-white font-jp">{result.text}</p>
              <p className="text-xs text-white/40">
                Kanji: {result.detection.kanjiChars.join(' ') || '—'} {result.detection.compounds.length ? `• Compounds: ${result.detection.compounds.join(', ')}` : ''}
              </p>
            </div>

            {result.kanji.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-white/60 flex items-center gap-2">
                  <BookOpen size={12} /> Dictionary
                </p>
                {result.kanji.map(k => (
                  <div key={k.character} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-2xl font-bold text-white">{k.character}</p>
                      <p className="text-xs text-white/60">{k.reading} • {k.meaning} {k.jlpt ? `• ${k.jlpt}` : ''} <span className="text-white/20">({k.source})</span></p>
                      {k.example && <p className="text-[11px] text-white/40 italic">{k.example}</p>}
                    </div>
                    <button
                      onClick={() => addToFlashcard(k)}
                      disabled={creating}
                      className="px-3 py-2 rounded-full bg-white text-black text-xs font-black uppercase tracking-wide flex items-center gap-1 disabled:opacity-50"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/30">No Kanji detected — try a text like 東京へ行きます</p>
            )}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-5 space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-white/60">How it works</p>
        <p className="text-xs text-white/40 leading-relaxed">
          Modular OCR provider (`server/services/ocr.cjs`) can be swapped: mock for demo/tests, HuggingFace TrOCR for production (set `HF_API_TOKEN`), or Tesseract. Kanji detection is regex (`[\u4E00-\u9FAF]`), dictionary is Jisho API with local cache and static fallback. Each detected Kanji can be added to flashcards → SRS.
        </p>
      </GlassCard>
    </div>
  );
}
