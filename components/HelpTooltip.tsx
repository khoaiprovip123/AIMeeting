import React from 'react';

interface HelpTooltipProps {
  content: string;
  position?: 
    | 'top' 
    | 'bottom' 
    | 'left' 
    | 'right' 
    | 'top-left' 
    | 'top-right' 
    | 'bottom-left' 
    | 'bottom-right';
  className?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ 
  content, 
  position = 'top', 
  className = '' 
}) => {
  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2.5';
      case 'bottom':
        return 'top-full left-1/2 -translate-x-1/2 mt-2.5';
      case 'left':
        return 'right-full top-1/2 -translate-y-1/2 mr-2.5';
      case 'right':
        return 'left-full top-1/2 -translate-y-1/2 ml-2.5';
      case 'top-left':
        return 'bottom-full right-0 mb-2.5';
      case 'top-right':
        return 'bottom-full left-0 mb-2.5';
      case 'bottom-left':
        return 'top-full right-0 mt-2.5';
      case 'bottom-right':
        return 'top-full left-0 mt-2.5';
      default:
        return 'bottom-full left-1/2 -translate-x-1/2 mb-2.5';
    }
  };

  const getArrowClasses = () => {
    switch (position) {
      case 'top':
        return 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 border-x-transparent border-b-transparent';
      case 'bottom':
        return 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 border-x-transparent border-t-transparent';
      case 'left':
        return 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 border-y-transparent border-r-transparent';
      case 'right':
        return 'right-full top-1/2 -translate-y-1/2 border-r-slate-900 border-y-transparent border-l-transparent';
      case 'top-left':
        return 'top-full right-4 border-t-slate-900 border-x-transparent border-b-transparent';
      case 'top-right':
        return 'top-full left-4 border-t-slate-900 border-x-transparent border-b-transparent';
      case 'bottom-left':
        return 'bottom-full right-4 border-b-slate-900 border-x-transparent border-t-transparent';
      case 'bottom-right':
        return 'bottom-full left-4 border-b-slate-900 border-x-transparent border-t-transparent';
      default:
        return 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 border-x-transparent border-b-transparent';
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      <div className="group inline-flex items-center justify-center">
        {/* Help Icon/Button */}
        <button
          type="button"
          aria-label="Help information"
          className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-150/80 hover:bg-gradient-to-r hover:from-sky-500 hover:to-indigo-500 text-slate-500 hover:text-white transition-all duration-300 md:custom-shadow-sm font-bold font-sans text-[11px] border border-slate-200 cursor-help transform hover:scale-105"
        >
          ?
        </button>

        {/* Tooltip Card */}
        <div 
          className={`absolute hidden group-hover:block z-50 w-64 bg-slate-950/95 backdrop-blur-md text-white text-xs font-medium p-4 rounded-2xl shadow-xl transition-all duration-200 border border-slate-800/80 leading-relaxed font-sans ${getPositionClasses()}`}
        >
          {/* Tooltip Content */}
          <div className="relative text-left font-normal text-slate-200">
            {content}
          </div>

          {/* Micro arrow indicator */}
          <div className={`absolute border-[5px] ${getArrowClasses()}`} />
        </div>
      </div>
    </div>
  );
};
