import React from 'react';
import { motion } from 'framer-motion';
import {
  Target,
  Clock,
  Flame,
  TrendingUp,
  Award,
  BookOpen,
  Loader2,
  AlertTriangle,
  Sparkles,
  Brain,
  Languages,
  PenTool,
  Headphones,
} from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { useAuth } from '@/hooks/useAuth';
import { useMastery } from '@/hooks/data/useMastery';
import { useRecommendations } from '@/hooks/data/useRecommendations';
import { useFlashcardsDue } from '@/hooks/data/useFlashcards';
import { useQuizHistory } from '@/hooks/data/useQuizHistory';
import { useNavigate } from 'react-router-dom';

const SKILLS = [
  { key: 'kanji', label: 'Kanji', icon: PenTool, color: '#FFFFFF' },
  { key: 'vocabulary', label: 'Vocabulary', icon: Languages, color: '#A78BFA' },
  { key: 'grammar', label: 'Grammar', icon: Brain, color: '#60A5FA' },
  { key: 'reading', label: 'Reading', icon: BookOpen, color: '#34D399' },
  { key: 'listening', label: 'Listening', icon: Headphones, color: '#FBBF24' },
] as const;

export function Progress() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { data: mastery, isLoading: masteryLoading } = useMastery(user?.id);
  const { data: rec } = useRecommendations(user?.id);
  const { data: dueCards } = useFlashcardsDue(user?.id);
  const { data: history } = useQuizHistory(user?.id, 20);

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const isLoading = masteryLoading;

  // Real metrics — no fake fallbacks
  const overallMastery = mastery?.overall.mastery ?? 0;
  const avgAccuracy = mastery?.overall.accuracy ?? 0;
  const recentAccuracy = mastery?.overall.recentAccuracy ?? 0;
  const totalAttempts = mastery?.overall.totalAttempts ?? 0;
  const weakCount = mastery?.overall.weakCount ?? 0;
  const dueCount = dueCards?.length ?? 0;
  const weakTopics = mastery?.weakTopics ?? [];
  const recommended = rec?.session;

  // Study time: from practice attempts (avgResponseTime * total) + quizHistory duration
  const practiceTimeSec = totalAttempts > 0 && mastery?.overall.avgResponseTimeMs
    ? Math.round((totalAttempts * (mastery.overall.avgResponseTimeMs || 2000)) / 1000)
    : 0;
  const quizTimeSec = (history || []).reduce((s: number, r: any) => s + (r.duration_sec || 0), 0);
  const totalTimeSec = practiceTimeSec + quizTimeSec;
  const timeStudiedHours = (totalTimeSec / 3600).toFixed(1);
  const timeStudiedMinutes = Math.round(totalTimeSec / 60);

  // Recent improvement: recentAccuracy - accuracy
  const improvement = Math.round((recentAccuracy - avgAccuracy) * 10) / 10;
  const improvementLabel = improvement > 0 ? `+${improvement}%` : improvement < 0 ? `${improvement}%` : 'steady';
  const improvementColor = improvement > 2 ? 'text-emerald-400' : improvement < -2 ? 'text-red-400' : 'text-white/40';

  // Per-skill mastery for visualization
  const skillMastery = SKILLS.map(s => {
    const stats = mastery?.bySection?.[s.key] || mastery?.byTopic?.[s.key];
    return {
      ...s,
      mastery: stats?.mastery ?? 0,
      accuracy: stats?.accuracy ?? 0,
      total: stats?.totalAttempts ?? 0,
      hasData: (stats?.totalAttempts ?? 0) > 0,
    };
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Loading Analytics</p>
      </div>
    );
  }

  const hasAnyData = totalAttempts > 0 || (history && history.length > 0);

  return (
    <div className="flex flex-col gap-10 animate-fade-in w-full pb-20 selection:bg-white/20 text-white font-sans text-left">
      {/* Header */}
      <header className="flex flex-col gap-8">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-3 flex flex-col items-start">
            <h1 className="text-5xl font-display font-bold text-white tracking-tight leading-none">Scholar Analytics</h1>
            <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">
              {hasAnyData ? `${totalAttempts} attempts • ${timeStudiedMinutes} min studied` : 'No practice data yet'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-5 py-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3">
              <Flame size={16} className="text-orange-400" />
              <span className="text-xs font-bold text-white">{profile.streak || 0} day streak</span>
            </div>
            <div className="px-5 py-3 bg-white text-black rounded-xl flex items-center gap-2">
              <Award size={16} />
              <span className="text-xs font-black">{overallMastery}% mastery</span>
            </div>
          </div>
        </div>

        {/* Top metrics — all from real data */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Overall Mastery', val: `${overallMastery}%`, sub: `${avgAccuracy}% avg accuracy`, icon: Target },
            { label: 'Recent Accuracy', val: `${recentAccuracy}%`, sub: improvementLabel, icon: TrendingUp, subColor: improvementColor },
            { label: 'Time Studied', val: `${timeStudiedHours}h`, sub: `${timeStudiedMinutes} min`, icon: Clock },
            { label: 'SRS Due', val: String(dueCount), sub: dueCount > 0 ? 'cards due today' : 'all caught up', icon: BookOpen },
          ].map(m => (
            <GlassCard key={m.label} className="p-6 space-y-4 flex flex-col items-start">
              <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50">
                <m.icon size={16} />
              </div>
              <div className="space-y-1 flex flex-col items-start">
                <p className="text-2xl font-display font-bold text-white tracking-tight">{m.val}</p>
                <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.15em]">{m.label}</p>
                <p className={`text-[10px] font-bold tracking-wide ${m.subColor || 'text-white/30'}`}>{m.sub}</p>
              </div>
            </GlassCard>
          ))}
        </div>
      </header>

      {!hasAnyData ? (
        <GlassCard className="p-16 text-center space-y-6 flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30">
            <Target size={24} />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-lg font-display font-bold text-white uppercase tracking-wide">No analytics yet</h3>
            <p className="text-sm text-white/40 leading-relaxed normal-case">
              Complete a practice quiz or flashcard review to see your mastery, accuracy trends, and personalized recommendations. Every metric here comes from real attempts — no placeholders.
            </p>
          </div>
          <button
            onClick={() => navigate('/session/quiz')}
            className="mt-2 px-6 py-3 bg-white text-black rounded-full text-xs font-black uppercase tracking-[0.12em] hover:bg-white/90 transition-colors"
          >
            Start Practice
          </button>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Left: per-skill mastery */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <GlassCard className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-white/60 uppercase tracking-[0.2em]">Skill Mastery</h2>
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{totalAttempts} total attempts</span>
              </div>
              <div className="space-y-4">
                {skillMastery.map(s => (
                  <div key={s.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <s.icon size={14} className="text-white/40" />
                        <span className="text-xs font-bold text-white/80 uppercase tracking-[0.1em]">{s.label}</span>
                        {!s.hasData && <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">no data</span>}
                      </div>
                      <span className="text-xs font-mono font-bold text-white">{s.mastery}%</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${s.mastery}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{ background: s.hasData ? s.color : 'rgba(255,255,255,0.15)' }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-bold text-white/20 uppercase tracking-widest">
                      <span>{s.total} attempts</span>
                      <span>{s.accuracy}% accuracy</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Accuracy trend — overall vs recent */}
            <GlassCard className="p-8 space-y-6">
              <h2 className="text-sm font-black text-white/60 uppercase tracking-[0.2em]">Accuracy Trend</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-white/5 border border-white/5 space-y-2">
                  <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Average</p>
                  <p className="text-3xl font-display font-bold text-white">{avgAccuracy}%</p>
                  <p className="text-[10px] text-white/30">over {totalAttempts} attempts</p>
                </div>
                <div className="p-5 rounded-xl bg-white text-black space-y-2">
                  <p className="text-[10px] font-black text-black/40 uppercase tracking-widest">Recent (last 20)</p>
                  <p className="text-3xl font-display font-bold">{recentAccuracy}%</p>
                  <p className={`text-[10px] font-bold ${improvement >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{improvementLabel} vs avg</p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Right: weak topics + next session */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            {/* Weak topics */}
            <GlassCard className="p-6 space-y-5">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <h2 className="text-sm font-black text-white/60 uppercase tracking-[0.2em]">Weak Topics</h2>
                <span className="ml-auto text-[10px] font-bold text-white/20">{weakCount} found</span>
              </div>
              {weakTopics.length > 0 ? (
                <div className="space-y-3">
                  {weakTopics.slice(0, 4).map(w => (
                    <div
                      key={w.topic}
                      onClick={() => navigate('/session/quiz')}
                      className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 cursor-pointer transition-colors space-y-2 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white uppercase tracking-wide">{w.topic}</span>
                        <span className="text-xs font-mono font-bold text-amber-300">{w.mastery}%</span>
                      </div>
                      <p className="text-[11px] text-white/40 leading-relaxed normal-case line-clamp-2">{w.reason}</p>
                      <div className="flex items-center gap-2 text-[9px] font-bold text-white/20 uppercase tracking-widest">
                        <span>{w.totalAttempts} attempts</span>
                        <span>•</span>
                        <span>{w.accuracy}% acc</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 rounded-xl bg-white/5 border border-dashed border-white/10 text-center space-y-2">
                  <p className="text-xs font-bold text-white/60 uppercase tracking-wide">No weak topics</p>
                  <p className="text-[11px] text-white/30 normal-case">Great work — all topics ≥60% mastery. Keep practicing to maintain.</p>
                </div>
              )}
            </GlassCard>

            {/* Recommended next session */}
            <GlassCard className="p-6 space-y-5">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-violet-400" />
                <h2 className="text-sm font-black text-white/60 uppercase tracking-[0.2em]">Recommended Next</h2>
                {recommended && <span className="ml-auto text-[10px] font-bold text-white/30">{recommended.estimatedMinutes} min</span>}
              </div>
              {recommended && recommended.items.length > 0 ? (
                <div className="space-y-3">
                  {recommended.items.map((item, i) => (
                    <div key={i} className="p-4 rounded-xl bg-white text-black space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-black/50">{item.type} {item.topic ? `• ${item.topic}` : ''}</span>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-black/5">{item.estimatedMinutes}m</span>
                      </div>
                      <p className="text-xs font-bold leading-snug normal-case">{item.reasonDetail}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-black/40">{item.reason}</p>
                    </div>
                  ))}
                  <button
                    onClick={() => navigate('/session/quiz')}
                    className="w-full mt-2 py-3 bg-white/10 border border-white/10 rounded-xl text-xs font-black uppercase tracking-[0.12em] text-white hover:bg-white/15 transition-colors"
                  >
                    Start Session
                  </button>
                </div>
              ) : (
                <div className="p-6 rounded-xl bg-white/5 border border-white/5 text-center">
                  <p className="text-xs text-white/30 normal-case">Complete a few attempts to get personalized recommendations.</p>
                </div>
              )}
            </GlassCard>

            {/* SRS summary */}
            <GlassCard className="p-6 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">SRS Due Today</p>
                <p className="text-2xl font-display font-bold text-white">{dueCount} cards</p>
              </div>
              <button
                onClick={() => navigate('/session/quiz')}
                className="px-5 py-2.5 bg-white text-black rounded-full text-xs font-black uppercase tracking-wide hover:bg-white/90"
              >
                Review
              </button>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
