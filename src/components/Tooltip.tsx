import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  text: string;
  title?: string;
  children?: React.ReactNode;
  icon?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, title, children, icon = true }) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 12,
    width: 260,
    placement: 'top',
  });
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const tooltipWidth = Math.min(280, Math.max(220, viewportWidth - 24));
    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    if (left < 12) left = 12;
    if (left + tooltipWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - tooltipWidth - 12);
    }
    const placement: 'top' | 'bottom' = rect.top > 150 ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8;
    setCoords({ top, left, width: tooltipWidth, placement });
  };

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [visible]);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center shrink-0"
        onMouseEnter={() => {
          updatePosition();
          setVisible(true);
        }}
        onMouseLeave={() => setVisible(false)}
        onClick={(e) => {
          e.stopPropagation();
          updatePosition();
          setVisible((prev) => !prev);
        }}
      >
        {children}
        {icon && (
          <span
            className="ml-1 text-slate-400 hover:text-cyan-300 cursor-help transition-colors"
            aria-label={text}
          >
            <HelpCircle className="w-3.5 h-3.5 inline opacity-70 hover:opacity-100" />
          </span>
        )}
      </span>
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: coords.placement === 'top' ? 'translateY(-100%)' : 'translateY(0)',
              width: `${coords.width}px`,
              maxWidth: 'calc(100vw - 24px)',
              zIndex: 9999,
            }}
            className="p-3 bg-slate-950/98 border border-cyan-500/40 rounded-xl shadow-2xl text-[11px] font-sans text-slate-200 pointer-events-none select-none"
          >
            {title && (
              <span className="font-bold text-cyan-300 block mb-1 border-b border-slate-800 pb-1">
                {title}
              </span>
            )}
            <span className="leading-relaxed block text-slate-300">{text}</span>
          </div>,
          document.body
        )}
    </>
  );
};
