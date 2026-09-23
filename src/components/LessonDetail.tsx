import React from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, 
  Lock, 
  ArrowRight,
  Loader2,
  Search
} from "lucide-react";
import { GlassCard } from './ui/GlassCard';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/useAuth';
import { useLessons, useCollectionDetail } from '@/hooks/data/useLessons';
import { FULL_HIRAGANA, FULL_KATAKANA } from '@/data/japanese/reference';
import { useNavigate } from 'react-router-dom';

export function LessonDetail({ lessonId, onBack }: { lessonId: string | null, onBack: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = React.useState('');
  
  const { data: colRaw, isLoading: colLoading } = useCollectionDetail(lessonId);
  const { data: lessons, isLoading: lesLoading } = useLessons(lessonId, user?.id);
  const collection = colRaw as any;

  const handleStartLesson = (lesson?: { skill_area?: string; collection_id?: string }) => {
    // Data-driven: use the lesson's skill_area if available, otherwise the collection's dominant skill_area
    const skill = lesson?.skill_area || lessons?.[0]?.skill_area || collection?.level === 'N5' ? 'kanji' : 'vocabulary';
    const map: Record<string, 'reading' | 'writing' | 'quiz' | 'vocab' | 'grammar'> = {
      kanji: 'writing',
      vocabulary: 'vocab',
      grammar: 'grammar',
      reading: 'reading',
      listening: 'quiz',
    };
    // Fallback: derive from collectionId if skill still generic
    let type: 'reading' | 'writing' | 'quiz' | 'vocab' | 'grammar' = map[skill] || 'quiz';
    if (!lesson && lessonId) {
      // No specific lesson - pick the collection's most common skill_area
      const counts = (lessons || []).reduce((acc: Record<string, number>, l: any) => {
        acc[l.skill_area] = (acc[l.skill_area] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (dominant && map[dominant]) type = map[dominant];
    }
    navigate(`/session/${type}`);
  };

  if (colLoading || lesLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-6">
        <Loader2 className="w-10 h-10 text-white/20 animate-spin" />
        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] animate-pulse">Establishing Connection</p>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-6">
        <p className="text-[11px] font-black text-white/30 uppercase tracking-[0.4em]">Collection not found</p>
        <button onClick={onBack} className="text-[10px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors">
          ← Return to Library
        </button>
      </div>
    );
  }

  const filteredLessons = lessons?.filter(l => 
    l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.subtitle?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.characters?.some((c: string) => c.includes(searchQuery))
  );

  return (
    <div className="flex flex-col gap-14 animate-fade-in w-full pb-24 mt-4 text-left font-sans text-white">
      {/* Top Utility Nav */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8 pt-2 px-1">
        <div className="flex items-center gap-4 text-[11px] font-black text-white/40 tracking-widest uppercase font-sans">
          <span className="cursor-pointer hover:text-white transition-colors" onClick={() => navigate('/library')}>Library</span>
          <span className="text-white/20">›</span>
          <span className="text-white font-black">{collection.title}</span>
        </div>

        <div className="relative group w-full md:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#FFD6E0] transition-colors" size={14} />
          <input 
            type="text" 
            placeholder="Search Sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-2xl py-3 px-10 text-[10px] text-white placeholder:text-white/20 w-full md:w-80 focus:outline-none focus:border-[#FFD6E0]/40 focus:bg-white/10 transition-all font-sans uppercase tracking-widest font-black"
          />
        </div>
      </header>

      {/* Hero Section */}
      <section className="space-y-6 max-w-3xl flex flex-col items-start text-left font-sans">
        <div className="flex items-center gap-4">
           <div className="h-px w-8 bg-white/20" />
           <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em]">{collection.subtitle}</span>
        </div>
        <h1 className="text-7xl font-display font-bold text-white tracking-tight leading-tight uppercase">{collection.title}</h1>
        <p className="text-white/60 text-lg leading-relaxed font-medium italic font-display opacity-80 uppercase tracking-wider">
          {collection.description}
        </p>
      </section>

      {/* Lessons List Area */}
      <div className="space-y-12 w-full">
        <GlassCard className="overflow-hidden divide-y divide-white/10 shadow-xl border-white/10 bg-white/5 text-white">
          {filteredLessons && filteredLessons.length > 0 ? (
            filteredLessons.map((lesson) => (
              <div key={lesson.id} className={cn(
                "p-10 flex items-center justify-between transition-colors group",
                lesson.status === 'LOCKED' ? "opacity-30" : "hover:bg-white/[0.07] cursor-pointer"
              )}>
                <div className="flex flex-col md:flex-row items-start md:items-center gap-12 flex-1">
                  {/* Character Cards Group */}
                  <div className="flex items-center gap-3">
                    {lesson.characters?.map((char: string) => {
                      const info = [...FULL_HIRAGANA, ...FULL_KATAKANA].find(item => item.char === char);
                      return (
                        <div key={char} className="w-20 h-24 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center group/card hover:border-[#FFD6E0]/40 transition-all uppercase">
                          <span className="text-3xl font-display font-bold text-white mb-0.5">{char}</span>
                          <span className="text-[9px] font-black text-[#FFD6E0] uppercase tracking-widest">{info?.romaji || '?'}</span>
                          
                          {/* Hidden Reveal Hint */}
                          <div className="absolute opacity-0 group-hover/card:opacity-100 transition-opacity bg-[#050505] border border-white/10 p-2 rounded-lg text-[8px] text-white/60 italic w-32 text-center -bottom-10 pointer-events-none z-50">
                            {info?.hint}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-3 border-l-2 border-white/10 pl-12 flex flex-col items-start text-left font-sans">
                    <h3 className="text-2xl font-display font-bold text-white tracking-wide leading-tight group-hover:text-[#FFD6E0] transition-colors uppercase">{lesson.title}</h3>
                    <p className="text-[10px] text-white/20 font-black tracking-[0.3em] uppercase">{lesson.subtitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-16 min-w-[320px] justify-end font-sans">
                  <div className="text-right">
                    {lesson.status === 'COMPLETED' && <span className="text-[10px] font-black text-white/40 tracking-[0.2em] uppercase mr-10 italic">FINISHED</span>}
                    {lesson.status === 'CURRENT' && <span className="text-[10px] font-black text-white tracking-[0.2em] uppercase mr-10 animate-pulse font-sans">ACTIVE</span>}
                    {lesson.status === 'LOCKED' && (
                      <div className="flex items-center gap-3 text-white/20 mr-10">
                        <Lock size={14} />
                        <span className="text-[10px] font-black tracking-[0.2em] uppercase">Locked</span>
                      </div>
                    )}
                  </div>

                  <div className="w-48 flex justify-end font-sans">
                    {lesson.status === 'COMPLETED' && (
                      <button 
                        onClick={() => handleStartLesson(lesson as any)}
                        className="bg-white/10 hover:bg-white/20 text-white !px-10 !py-3 !text-[10px] shadow-sm flex items-center gap-3 rounded-full transition-all uppercase tracking-widest font-black"
                      >
                        Review
                      </button>
                    )}
                    {lesson.status === 'CURRENT' && (
                      <button 
                        onClick={() => handleStartLesson(lesson as any)}
                        className="bg-white text-black hover:bg-white/90 !px-10 !py-3 !text-[10px] shadow-xl flex items-center gap-3 rounded-full transition-all uppercase tracking-widest font-black"
                      >
                        Start Lesson <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-20 text-center flex flex-col items-center justify-center gap-6 shadow-xl w-full">
              <Search size={40} className="text-white/10" />
              <div className="space-y-2">
                <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.4em]">No matching sessions</p>
                <p className="text-[9px] text-white/10 uppercase tracking-widest">Adjust your search query or return to the library</p>
              </div>
            </div>
          )}
        </GlassCard>

        <div className="flex items-center justify-between pb-10 w-full mt-4 font-sans text-white">
          <div className="flex gap-20">
            <div className="space-y-3 flex flex-col items-start text-left font-sans uppercase">
               <p className="text-[10px] font-black text-white/40 tracking-widest uppercase">Total Progress</p>
               <p className="text-2xl font-display font-bold text-white uppercase tracking-tight">{lessons?.filter(l => l.status === 'COMPLETED').length || 0} / {lessons?.length || 0} Lessons</p>
            </div>
            <div className="space-y-3 flex flex-col items-start text-left font-sans uppercase">
               <p className="text-[10px] font-black text-white/40 tracking-widest uppercase">Level Target</p>
               <p className="text-2xl font-display font-bold text-white uppercase tracking-tight">{collection.level || 'N5'}</p>
            </div>
          </div>

          <div className="flex items-center gap-12 flex-1 justify-end font-sans">
            <div className="h-0.5 flex-1 max-w-sm bg-white/10 rounded-full" />
            <button 
              onClick={() => onBack()}
              className="text-[11px] font-black text-white/40 hover:text-white transition-colors flex items-center gap-4 tracking-widest uppercase font-sans"
            >
              Back to Library <ArrowRight size={18} className="rotate-180" />
            </button>
          </div>
        </div>
      </div>

      {/* Global Branding Footer */}
      <footer className="mt-auto pt-24 pb-12 flex justify-center w-full font-sans">
        <p className="text-[11px] font-black text-white/10 uppercase tracking-[0.6em] text-center italic">
          Scholarly Japanese Curriculum — Ed. 2024
        </p>
      </footer>
    </div>
  );
}
