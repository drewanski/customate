import React, { forwardRef } from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

export function Card({ children, className = '', padding = 'md', hover = false }: CardProps) {
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6'
  };
  
  const hoverStyles = hover ? 'hover:shadow-lg transition-shadow duration-200' : '';
  
  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${paddingStyles[padding]} ${hoverStyles} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`font-semibold text-gray-900 ${className}`}>{children}</h3>;
}

export interface CardContentProps {
  children: React.ReactNode;
  className?: string;
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ children, className = '' }, ref) => {
    return (
      <div className={className} ref={ref}>
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';
