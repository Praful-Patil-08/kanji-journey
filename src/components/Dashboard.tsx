import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Flame, 
  BookOpen,
  Loader2
} from "lucide-react";
import { cn } from '@/lib/utils';
import { GlassCard } from './ui/GlassCard';
import { useAuth } from '@/hooks/useAuth';
import { useCollections } from '@/hooks/data/useCollections';
import { useMastery } from '@/hooks/data/useMastery';
import { useRecommendations } from '@/hooks/data/useRecommendations';
import { useFlashcardsDue } from '@/hooks/data/useFlashcards';
import { useNavigate } from 'react-router-dom';

export function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: collections, isFetching } = useCollections(user?.id);
  const { data: mastery } = useMastery(user?.id);
  const { data: rec } = useRecommendations(user?.id);
  const { data: dueCards } = useFlashcardsDue(user?.id);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [showResults, setShowResults] = React.useState(false);

  // Universal Destination Index — must be before any early return (Rules of Hooks)
  const searchDestinations = useMemo(() => [
    { name: 'Profile / Status', query: 'profile', action: () => navigate('/profile'), icon: '���👤' },
    { name: 'Progress / Analytics', query: 'progress analytics accuracy stats', action: () => navigate('/progress'), icon: '���📊' },
    { name: 'Library / Curriculum', query: 'library curriculum packs archive', action: () => navigate('/library'), icon: '���📚' },
    { name: 'Flashcards', query: 'flashcards deck review', action: () => navigate('/session/quiz'), icon: '���🎴' },
    { name: 'Settings / Account', query: 'settings account preferences', action: () => navigate('/settings'), icon: '��⚙��️' },
    { name: 'Writing Session', query: 'writing kanji hiragana katakana ritual', action: () => navigate('/session/writing'), icon: '���🖊��️' },
    { name: 'Vocabulary Quiz', query: 'vocab words quiz dictionary', action: () => navigate('/session/vocab'), icon: '���🗣��️' },
    { name: 'Grammar Ritual', query: 'grammar particles verbs sentence', action: () => navigate('/session/grammar'), icon: '��⛩��️' },
    { name: 'Reading Practice', query: 'reading stories text narrative', action: () => navigate('/session/reading'), icon: '���📖' },
    ...(collections?.map(c => ({
      name: c.title,
      query: `${c.title.toLowerCase()} ${c.subtitle?.toLowerCase() || ''} pack level`,
      action: () => navigate('/library/' + c.id),
      icon: c.icon || '学'
    })) || [])
  ], [collections, navigate]);

  const filteredResults = useMemo(() =>
    searchQuery.length > 0
      ? searchDestinations.filter(d =>
          d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.query.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : [],
  [searchQuery, searchDestinations]);

  const handleSearchCommit = (dest: any) => {
    dest.action();
    setSearchQuery('');
    setShowResults(false);
  };

  const activeCollection = collections?.find(c => (c.progressPercentage || 0) < 100) || collections?.[0];

  if (!user || !profile) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-white/10 border-t-white rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-12 animate-fade-in w-full max-w-[1880px] mx-auto pb-16 font-sans">
       {/* Header / Top Nav area within main content */}
       <header className="flex items-start justify-between pb-6 border-b border-white/10">
         <div className="flex items-start gap-4">
           <div className="flex items-center gap-2">
             <h1 className="text-3xl xl:text-4xl font-display font-bold text-white tracking-tight leading-none">
               The Ink-Stone <span className="mx-1.5 text-white/30 font-sans font-light">/</span> <span className="text-white/40 text-base font-display tracking-[0.15em] font-[500]">{profile.display_name || 'Scholar'}</span>
             </h1>
           </div>
           <div className="text-sm font-[500] text-white/50 uppercase tracking-[0.08em]">
             Level {profile.current_level || 'N5'} • {profile.xp?.toLocaleString() || '0'} XP
           </div>
         </div>
          
         <div className="relative group w-[420px] max-w-full">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 group-focus-within:text-white/80 transition-colors" size={13} />
           <input 
             type="text" 
             placeholder="Seek Anywhere..."
             value={searchQuery}
             onFocus={() => setShowResults(true)}
             onChange={(e) => setSearchQuery(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === 'Enter' && filteredResults.length > 0) {
                 handleSearchCommit(filteredResults[0]);
               }
             }}
             className="bg-white/6 border border-white/8 rounded-xl h-10 px-9 text-sm text-white placeholder:text-white/35 w-full focus:border-white/30 focus:bg-white/10 transition-all font-[500] tracking-[0.1em]"
           />
           
           {/* Popover Results */}
           {showResults && filteredResults.length > 0 && (
             <div className="absolute right-0 top-full mt-2 w-full z-50">
               <GlassCard variant="elevated" className="p-2 overflow-hidden border-white/12 bg-black/40 shadow-xl backdrop-blur-lg divide-y divide-white/8">
                 {filteredResults.map((dest, i) => (
                   <div 
                     key={dest.name} 
                     onClick={() => handleSearchCommit(dest)}
                     className={cn(
                       "p-2 flex items-center justify-between cursor-pointer group/item transition-all rounded-lg",
                       i === 0 ? "bg-white/6" : "hover:bg-white/3"
                     )}
                   >
                     <div className="flex items-center gap-2">
                       <span className="text-[8px]">{dest.icon}</span>
                       <span className="text-[7px] font-[500] text-white/50 group-hover/item:text-white/70 uppercase tracking-[0.06em]">{dest.name}</span>
                     </div>
                     {i === 0 && <span className="text-[6px] font-[500] text-white/35 uppercase">ENTER</span>}
                   </div>
                 ))}
               </GlassCard>
             </div>
           )}
           {showResults && searchQuery.length > 0 && filteredResults.length === 0 && (
             <div className="absolute right-0 top-full mt-2 w-full z-50">
               <GlassCard variant="default" className="p-3 text-center text-[7px] font-[500] text-white/35 uppercase tracking-[0.08em] border-white/8 bg-black/40 shadow-lg backdrop-blur-md">
                 No ritual paths found
               </GlassCard>
             </div>
           )}
         </div>
       </header>

      {/* Main Grid */}
      <div className="grid grid-cols-12 gap-8 pt-4 items-stretch">
        {/* Left Column */}
        <div className="col-span-12 xl:col-span-8 space-y-6">
          
          {/* Active Curriculum */}
          <section className="space-y-5 flex flex-col items-start w-full">
            <h2 className="text-lg font-[500] text-white/60 uppercase tracking-[0.08em]">
              Active Curriculum
            </h2>
             {activeCollection ? (
               <GlassCard variant="elevated" className="p-6 xl:p-8 relative overflow-hidden group w-full min-h-[380px] xl:min-h-[420px] flex flex-col items-start justify-between">
                 <div className="flex justify-between items-start relative z-10 w-full mb-8 gap-6">
                   <div className="space-y-3 flex flex-col items-start">
                     <h3 className="text-4xl xl:text-5xl font-display font-bold text-white tracking-tight leading-[0.9] uppercase max-w-[20ch]">
                       {activeCollection.title}
                     </h3>
                     <p className="text-base text-white/50 leading-relaxed font-medium italic font-display opacity-60 tracking-wider max-w-[42ch]">
                       {activeCollection.subtitle}
                     </p>
                   </div>
                   
                   <div className="text-right space-y-3 w-[280px] pt-1">
                     <div className="flex justify-between text-sm font-[500] tracking-[0.08em] text-white/50 uppercase">
                       <span className="flex items-center gap-1.5">
                         Overall Mastery
                         {isFetching && <Loader2 size={8} className="animate-spin opacity-50" />}
                       </span>
                       <span className="font-mono text-[24px]">{activeCollection.progressPercentage || 0}%</span>
                     </div>
                     <div className="h-1.5 w-full bg-white/6 rounded-full overflow-hidden border border-white/6">
                       <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: `${activeCollection.progressPercentage || 0}%` }}
                         transition={{ duration: 1.2, ease: "easeOut" }}
                         className="h-full bg-white/70 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                       />
                     </div>
                   </div>
                 </div>
 
                 <div className="pt-6 border-t border-white/12 flex items-center gap-4 xl:gap-6 relative z-10 w-full flex-wrap">
                   <button 
                     onClick={() => navigate(`/library/${activeCollection.id}`)}
                     className="bg-white/90 text-black/90 hover:bg-white/80 focus:bg-white/85 px-5 min-h-[10] rounded-full transition-all font-[500] text-sm uppercase tracking-[0.08em] shadow-md active:scale-[0.97]"
                   >
                     Continue Study
                   </button>
                   <button 
                     onClick={() => navigate('/library')}
                     className="text-xs font-[500] text-white/50 hover:text-white/70 focus:text-white/75 uppercase tracking-[0.08em] transition-colors font-sans px-3.5 py-2.5 min-h-[9]"
                   >
                     CURRICULUM INDEX
                   </button>
                 </div>
               </GlassCard>
              ) : (
                <GlassCard variant="default" className="p-5 w-full min-h-[360px] flex flex-col items-center justify-center gap-4 hover:bg-white/5 focus:bg-white/6 transition-all">
                  <BookOpen size={24} className="mb-3" />
                  <p className="text-sm font-[500] text-white/50 uppercase tracking-[0.08em]">No Active Curriculum Found</p>
                  <button onClick={() => navigate('/library')} className="btn-pink px-4 py-2 min-h-[9]">Browse Library</button>
                </GlassCard>
            )}
          </section>

            {/* Your Mastery — real data */}
            <section className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-[500] text-white/60 uppercase tracking-[0.08em]">Your Mastery</h2>
                <button onClick={() => navigate('/progress')} className="text-[10px] font-black text-white/30 hover:text-white/60 uppercase tracking-widest">View Analytics →</button>
              </div>
              {mastery && mastery.overall.totalAttempts > 0 ? (
                <GlassCard variant="default" className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-display font-bold text-white tracking-tight">{mastery.overall.mastery}%</p>
                      <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Overall Mastery</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white/70">{mastery.overall.accuracy}% avg</p>
                      <p className="text-[10px] text-white/30">{mastery.overall.totalAttempts} attempts</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: 'Kanji', key: 'kanji' },
                      { label: 'Vocabulary', key: 'vocabulary' },
                      { label: 'Grammar', key: 'grammar' },
                      { label: 'Reading', key: 'reading' },
                      { label: 'Listening', key: 'listening' },
                    ].map(s => {
                      const stats = (mastery.bySection as any)?.[s.key] || (mastery.byTopic as any)?.[s.key];
                      const val = stats?.mastery ?? 0;
                      const hasData = (stats?.totalAttempts ?? 0) > 0;
                      return (
                        <div key={s.key} className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                            <span className={hasData ? 'text-white/60' : 'text-white/20'}>{s.label}</span>
                            <span className={hasData ? 'text-white' : 'text-white/20'}>{hasData ? `${val}%` : '—'}</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${val}%` }} transition={{ duration: 0.8 }} className={`h-full ${hasData ? 'bg-white/70' : 'bg-white/10'}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {mastery.weakTopics.length > 0 && (
                    <div className="pt-4 border-t border-white/5 space-y-2">
                      <p className="text-[10px] font-black text-amber-300/70 uppercase tracking-widest">Weak Topics</p>
                      <div className="flex flex-wrap gap-2">
                        {mastery.weakTopics.slice(0, 3).map((w: any) => (
                          <span key={w.topic} className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-200 uppercase tracking-wide">
                            {w.topic} • {w.mastery}%
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </GlassCard>
              ) : (
                <GlassCard variant="default" className="p-8 text-center space-y-3">
                  <p className="text-sm font-bold text-white/50 uppercase tracking-wide">No mastery data yet</p>
                  <p className="text-xs text-white/30 normal-case">Complete a quiz to see your real mastery breakdown — no placeholders.</p>
                  <button onClick={() => navigate('/session/quiz')} className="mt-2 px-5 py-2 bg-white text-black rounded-full text-xs font-black uppercase tracking-wide">Start Quiz</button>
                </GlassCard>
              )}
            </section>
        </div>

        {/* Right Column */}
        <div className="col-span-12 xl:col-span-4 space-y-6 flex flex-col items-start text-left">
          
          {/* Recommended Next Session — real */}
          <section className="space-y-5 w-full flex flex-col items-start">
            <div className="flex items-center justify-between w-full">
              <h2 className="text-lg font-[500] text-white/60 uppercase tracking-[0.08em]">Recommended Next</h2>
              {rec?.session && <span className="text-[10px] font-bold text-white/30">{rec.session.estimatedMinutes} min</span>}
            </div>
            {rec?.session?.items?.length ? (
              <div className="space-y-3 w-full">
                {rec.session.items.slice(0, 3).map((item: any, i: number) => (
                  <GlassCard
                    key={i}
                    onClick={() => navigate(item.type === 'flashcard' ? '/session/quiz' : '/session/quiz')}
                    className="p-4 w-full space-y-2 hover:bg-white/10 cursor-pointer text-left"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/50">{item.type}{item.topic ? ` • ${item.topic}` : ''}</span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/10 text-white/60">{item.estimatedMinutes}m</span>
                    </div>
                    <p className="text-xs font-bold text-white leading-snug normal-case line-clamp-2">{item.reasonDetail}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/20">{item.reason}</p>
                  </GlassCard>
                ))}
                <button onClick={() => navigate('/progress')} className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70">View Full Analytics →</button>
              </div>
            ) : (
              <GlassCard variant="default" className="p-6 w-full text-center space-y-2">
                <p className="text-xs font-bold text-white/50 uppercase">No recommendation yet</p>
                <p className="text-[11px] text-white/30 normal-case">Complete a practice to generate a personalized session.</p>
              </GlassCard>
            )}
            {/* SRS Due quick access */}
            <GlassCard variant="elevated" onClick={() => navigate('/session/quiz')} className="p-4 w-full flex items-center justify-between hover:bg-white/10 cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50">
                  <BookOpen size={16} />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-white uppercase tracking-wide">SRS Due</p>
                  <p className="text-[10px] text-white/30">{dueCards?.length ?? 0} cards ready</p>
                </div>
              </div>
              <span className="text-[10px] font-black text-white/40 uppercase">Review →</span>
            </GlassCard>
          </section>

            {/* Scholar's Note */}
            <GlassCard variant="default" className="p-4 min-h-[14] space-y-5 flex flex-col items-start w-full hover:bg-white/5 focus:bg-white/6 transition-all">
              <h2 className="text-lg font-[500] text-white/60 uppercase tracking-[0.08em]">
                Scholar's Note
              </h2>
              <div className="space-y-3 text-left pt-2">
                <p className="text-base font-display italic text-white/40 leading-relaxed uppercase tracking-wider">
                  "If you wish to know the road ahead, ask those who are coming back."
                </p>
                <div className="h-px w-8 bg-white/6" />
                <div className="flex items-center gap-2">
                  <div className="w-0.5 h-0.5 rounded-full bg-white/60 animate-pulse" />
                  <span className="text-[8px] font-black text-white/25 uppercase tracking-[0.12em]">Focus for today</span>
                </div>
              </div>
            </GlassCard>
        </div>
      </div>
    </div>
  );
}