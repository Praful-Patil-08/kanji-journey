import { useRef, useState } from 'react';
import { Mic, Square, Loader2, TrendingUp, History } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePronunciationHistory, usePronunciationStats, useScorePronunciation } from '@/hooks/data/usePronunciation';

export function PronunciationPractice() {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<{ transcript: string; pronunciationScore: number; pitchAccentScore: number; suggestions: string[]; attemptNumber?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetText, setTargetText] = useState('おはようございます');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const { mutateAsync: scoreAsync, isPending: scoring } = useScorePronunciation();
  const { data: historyInfinite } = usePronunciationHistory(user?.id, targetText, 10);
  const { data: stats } = usePronunciationStats(user?.id, targetText);

  const history = historyInfinite?.pages.flatMap(p => p.data) ?? [];
  const loading = scoring;

  const start = async () => {
    setError(null);
    setResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      recorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          const arrayBuffer = await audioBlob.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          bytes.forEach((b) => { binary += String.fromCharCode(b); });
          const audioBase64 = btoa(binary);
          const data = await scoreAsync({ audioBase64, targetText });
          setResult(data);
        } catch (err: unknown) {
          setError((err as Error).message || 'Failed to score pronunciation');
        }
      };
      mediaRecorder.start();
      setRecording(true);
    } catch (err: unknown) {
      setError((err as Error).message || 'Microphone access failed');
    }
  };

  const stop = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== 'recording') return;
    rec.stop();
    rec.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div>
        <p className="font-medium text-foreground">Pronunciation Practice</p>
        <p className="text-sm text-muted-foreground">Record and get ASR + pitch-accent feedback.</p>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Target phrase</label>
        <input
          value={targetText}
          onChange={(e) => setTargetText(e.target.value)}
          className="mt-1 w-full px-3 py-2 rounded-xl bg-secondary text-foreground"
        />
      </div>

      <div className="flex gap-2">
        {!recording ? (
          <button onClick={start} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2">
            <Mic className="w-4 h-4" />
            Record
          </button>
        ) : (
          <button onClick={stop} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-medium flex items-center justify-center gap-2">
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Scoring pronunciation...
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {result && (
        <div className="glass-card-subtle p-4 rounded-xl space-y-2">
          <p className="text-sm text-muted-foreground">Transcript: <span className="text-foreground">{result.transcript}</span></p>
          <p className="text-sm text-muted-foreground">Pronunciation score: <span className="text-foreground">{result.pronunciationScore}%</span>{result.attemptNumber ? <span className="text-muted-foreground"> (attempt {result.attemptNumber})</span> : null}</p>
          <p className="text-sm text-muted-foreground">Pitch accent score: <span className="text-foreground">{result.pitchAccentScore}%</span></p>
          {result.suggestions.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Suggestions</p>
              <ul className="text-sm text-foreground list-disc list-inside">
                {result.suggestions.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* History for current target */}
      {history.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2">
            <History size={14} className="text-muted-foreground" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">History for “{targetText}”</p>
            {stats && stats.count > 1 && (
              <span className={`ml-auto text-xs font-bold flex items-center gap-1 ${stats.improvement >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                <TrendingUp size={12} /> {stats.improvement >= 0 ? '+' : ''}{stats.improvement}%
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-[200px] overflow-auto">
            {history.slice(0, 5).map((h: any) => (
              <div key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50">
                <div>
                  <p className="text-xs font-bold">Attempt {h.attemptNumber}: {h.pronunciationScore}%</p>
                  <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">{h.transcript}</p>
                </div>
                <span className="text-[10px] text-muted-foreground">{new Date(h.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
          {stats && (
            <p className="text-[11px] text-muted-foreground">
              Avg {stats.avgScore}% • Best {stats.best}% • {stats.count} attempts • {stats.improvement >= 0 ? 'Improving' : 'Needs practice'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
