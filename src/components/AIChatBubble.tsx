import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Sparkles, Loader2, Minimize2, Maximize2 } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { api } from '@/integrations/api/client';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold** and *italic* in one pass
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(<React.Fragment key={`${keyBase}-t-${last}`}>{text.slice(last, match.index)}</React.Fragment>);
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b-${match.index}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={`${keyBase}-i-${match.index}`}>{match[2]}</em>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(<React.Fragment key={`${keyBase}-t-${last}`}>{text.slice(last)}</React.Fragment>);
  return nodes.length ? nodes : [<React.Fragment key={keyBase}>{text}</React.Fragment>];
}

function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        const listMatch = trimmed.match(/^[-•*]\s+(.+)/);
        if (listMatch) {
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="opacity-50 mt-0.5 shrink-0 text-[10px]">•</span>
              <span>{renderInline(listMatch[1], String(i))}</span>
            </div>
          );
        }
        return <p key={i}>{renderInline(trimmed, String(i))}</p>;
      })}
    </div>
  );
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AIChatBubble() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputValue.trim() || !user || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const aiMessageId = crypto.randomUUID();

    try {
      const history = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Derive current page context for scoped RAG
      const currentPage = location.pathname + location.search;
      // Try to extract lessonId from URL like /library/:id or /lesson/:id or /session/:type
      const lessonMatch = location.pathname.match(/\/(?:library|lesson|session)\/([^/]+)/);
      const currentLessonId = lessonMatch ? lessonMatch[1] : null;
      // Current topic: if user is asking about a specific topic, let the backend retrieve; also send page as hint
      const currentTopic = currentLessonId || (location.pathname.includes('grammar') ? 'grammar' : location.pathname.includes('reading') ? 'reading' : null);

      const data = await api.post<{ reply?: string; error?: string; retrieval?: { lessonCount: number; tokens: number } }>(
        '/api/chat/enhanced',
        {
          message: userMessage.content,
          history,
          currentPage,
          currentLessonId,
          currentTopic,
          userId: user?.id,
        },
      );
      if (data.error) throw new Error(data.error);
      if (!data.reply) throw new Error('Empty response from Scholar AI.');

      setMessages(prev => [...prev, {
        id: aiMessageId,
        role: 'assistant',
        content: data.reply!,
        timestamp: new Date(),
      }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Scholar AI is unavailable. Try again.';
      toast.error(msg);
      // Remove the empty placeholder if we added one
      setMessages(prev => prev.filter(m => !(m.id === aiMessageId && !m.content)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] font-sans flex flex-col items-end">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9, y: 15, filter: 'blur(8px)' }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              filter: 'blur(0px)',
              height: isMinimized ? 64 : 520,
              width: 340,
            }}
            exit={{ opacity: 0, scale: 0.9, y: 15, filter: 'blur(8px)' }}
            transition={{
              type: 'spring',
              damping: 25,
              stiffness: 220,
              height: { duration: 0.35, ease: [0.23, 1, 0.32, 1] },
            }}
            className="mb-4 pointer-events-auto origin-bottom-right"
          >
            <GlassCard className="h-full flex flex-col overflow-hidden shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] border-white/10 ring-1 ring-white/10">
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5 backdrop-blur-xl shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-[#FFD6E0] border border-white/5">
                    <Sparkles size={14} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-[11px] font-display font-bold text-white uppercase tracking-widest">Scholar AI</h3>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Oracle Active</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                  >
                    {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/40 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {!isMinimized && (
                <>
                  {/* Messages */}
                  <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-black/20"
                  >
                    {messages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-10 py-10 text-center">
                        <Sparkles size={32} />
                        <p className="text-[9px] font-black uppercase tracking-[0.2em]">Begin Inquiry</p>
                      </div>
                    )}

                    {messages.map(m => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          'flex flex-col max-w-[90%] text-left',
                          m.role === 'user' ? 'ml-auto items-end' : 'items-start'
                        )}
                      >
                        <div
                          className={cn(
                            'p-4 rounded-2xl text-[12px] leading-relaxed font-medium',
                            m.role === 'user'
                              ? 'bg-white text-black rounded-tr-none shadow-xl font-bold'
                              : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none'
                          )}
                        >
                          {m.role === 'user'
                            ? m.content
                            : <MarkdownText content={m.content} />
                          }
                          {/* Blinking cursor while this message is still streaming */}
                          {m.role === 'assistant' && isLoading === false && m.id === messages[messages.length - 1]?.id && m.content && (
                            <span className="inline-block w-0.5 h-3.5 ml-0.5 bg-white/40 align-middle animate-pulse" />
                          )}
                        </div>
                        {m.content && (
                          <span className="text-[7px] font-black text-white/20 uppercase tracking-[0.2em] mt-2 px-2">
                            {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </motion.div>
                    ))}

                    {isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-start max-w-[90%]"
                      >
                        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-white/40 rounded-tl-none flex items-center gap-3">
                          <Loader2 size={12} className="animate-spin" />
                          <span className="text-[9px] font-black uppercase tracking-[0.2em] animate-pulse">Scribing...</span>
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Input */}
                  <div className="p-4 border-t border-white/10 bg-white/5 backdrop-blur-xl shrink-0">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={inputValue}
                        onChange={e => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Inquire..."
                        disabled={isLoading}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-5 pr-16 text-[11px] font-medium text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all shadow-inner disabled:opacity-50"
                      />
                      <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                        className="absolute right-2.5 p-2.5 bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-20 disabled:hover:bg-white transition-all active:scale-95 shadow-lg"
                      >
                        <Send size={12} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      <motion.button
        layout="position"
        onClick={() => {
          if (isOpen && isMinimized) {
            setIsMinimized(false);
          } else {
            setIsOpen(!isOpen);
          }
        }}
        whileHover={{ scale: 1.02, y: -1 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'relative group p-4 rounded-2xl shadow-[0_15px_35px_-5px_rgba(0,0,0,0.5)] transition-all overflow-hidden border border-white/5',
          isOpen
            ? 'bg-white text-black w-[60px] h-[60px] flex items-center justify-center p-0'
            : 'bg-[#1A1A1E] backdrop-blur-2xl text-white hover:bg-black/80'
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        {isOpen && !isMinimized ? (
          <X className="relative z-10" size={24} strokeWidth={2.5} />
        ) : (
          <div className="relative z-10 flex items-center gap-3">
            <MessageSquare
              size={24}
              strokeWidth={2.5}
              className={cn(!isOpen && 'text-[#FFD6E0] drop-shadow-[0_0_10px_rgba(255,214,224,0.5)]')}
            />
            {!isOpen && (
              <motion.span
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] font-black uppercase tracking-[0.2em] pr-1 whitespace-nowrap"
              >
                Scholar Chat
              </motion.span>
            )}
          </div>
        )}
        {!isOpen && (
          <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-[#FFD6E0] rounded-full border-2 border-black shadow-[0_0_8px_rgba(255,214,224,0.8)]" />
        )}
      </motion.button>
    </div>
  );
}
