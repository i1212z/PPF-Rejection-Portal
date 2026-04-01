import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, rightSlot, children, className }: CardProps) {
  return (
    <section
      className={`bg-white border border-gray-100 rounded-2xl shadow-sm px-4 py-3 sm:px-5 sm:py-4 min-w-0 max-w-full ${className ?? ''}`}
    >
      {(title || subtitle || rightSlot) && (
        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3 sm:gap-3 min-w-0">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-medium text-gray-900">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {rightSlot && <div className="shrink-0 w-full sm:w-auto">{rightSlot}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

