import React from 'react';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Library,
  PenTool,
  BarChart2,
  User,
  Settings as SettingsIcon,
  Scan,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'library', label: 'Library', icon: Library, path: '/library' },
  { id: 'practice', label: 'Practice', icon: PenTool, path: '/practice' },
  { id: 'progress', label: 'Progress', icon: BarChart2, path: '/progress' },
  { id: 'dictionary', label: 'Dictionary', icon: BookOpen, path: '/dictionary' },
  { id: 'ocr', label: 'OCR', icon: Scan, path: '/ocr' },
  { id: 'profile', label: 'Profile', icon: User, path: '/profile' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, path: '/settings' },
];

export function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine active item based on route pathname
  const pathname = location.pathname;
  let activeTab = 'dashboard';
  if (pathname.startsWith('/library')) {
    activeTab = 'library';
  } else if (pathname.startsWith('/practice')) {
    activeTab = 'practice';
  } else if (pathname.startsWith('/progress')) {
    activeTab = 'progress';
  } else if (pathname.startsWith('/dictionary')) {
    activeTab = 'dictionary';
  } else if (pathname.startsWith('/ocr')) {
    activeTab = 'ocr';
  } else if (pathname.startsWith('/profile')) {
    activeTab = 'profile';
  } else if (pathname.startsWith('/settings')) {
    activeTab = 'settings';
  }

  return (
    <div className="h-screen w-[280px] bg-[var(--bg-surface)] border-r border-white/10 flex flex-col pt-12 pb-10 flex-shrink-0 relative z-50 backdrop-blur-md">
      {/* Brand Header */}
      <div className="px-9 mb-12 space-y-3 flex flex-col items-start text-left">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-display font-bold text-white tracking-tight">学�識者</h1>
          <p className="text-xs font-black text-white/60 uppercase tracking-[0.15em] leading-none font-sans">Scholarly Practitioner</p>
        </div>
        <div className="w-full h-px bg-white/10"></div>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-4 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={cn(
              "flex items-center gap-4 px-4 py-3.5 min-h-[50px] rounded-xl transition-all group relative font-sans",
              "text-white/60 hover:text-white hover:bg-white/6 focus:text-white focus:bg-white/7 active:scale-[0.97] transition-[background,transform,box-shadow] duration-300 ease-in-out",
              activeTab === item.id 
                ? "bg-[#FFD6E0]/15 text-white/90 font-black shadow-[0_0_20px_-4px_rgba(255,214,224,0.25)] ring-1 ring-[#FFD6E0]/25" 
                : "hover:bg-white/4 focus:bg-white/5"
            )}
          >
            {/* Active indicator - more subtle and purposeful */}
            {activeTab === item.id && (
              <motion.div 
                layoutId="active-indicator"
                className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#FFD6E0]/50 rounded-r-lg shadow-[0_0_15px_rgba(255,214,224,0.3)]"
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              />
            )}
            <item.icon size={20} className={cn(
              activeTab === item.id ? "text-[#FFD6E0]/90 drop-shadow-[0_0_6px_rgba(255,214,224,0.3)]" : "text-white/50 group-hover:text-white/80 transition-colors focus:text-white/90"
            )} strokeWidth={activeTab === item.id ? 2 : 1.5} />
            <span className={cn(
              "text-sm font-[500] tracking-[0.05em] transition-colors font-sans leading-none",
              activeTab === item.id ? "text-white/90" : "text-white/60 group-hover:text-white/80 focus:text-white/90"
            )}>
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}