import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'inset';
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className, 
  variant = 'default',
  ...props 
}) => {
  return (
    <div 
      className={cn(
        "glass-card",
        variant === 'default' && "glass-card-default",
        variant === 'elevated' && "glass-card-elevated",
        variant === 'inset' && "glass-card-inset",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};