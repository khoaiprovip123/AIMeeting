
import React from 'react';

interface LoaderProps {
  message: string;
  progress?: number | null;
}

export const Loader: React.FC<LoaderProps> = ({ message, progress }) => {
  const hasProgress = typeof progress === 'number' && progress >= 0;
  const clampedProgress = hasProgress ? Math.min(100, Math.max(0, progress)) : null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex flex-col items-center justify-center z-50 transition-all duration-500">
      <div className="bg-white/95 backdrop-blur-xl p-10 rounded-3xl custom-shadow-lg border border-slate-100 flex flex-col items-center max-w-md w-full mx-4 animate-in fade-in zoom-in duration-300">
        <div className="relative flex items-center justify-center mb-8">
          {/* Inner Glowing Ring */}
          <div className="absolute inset-0 rounded-full bg-sky-500/10 blur-xl"></div>
          {/* External Spinning Accent */}
          <div className={`animate-spin rounded-full h-20 w-20 border-[3px] border-slate-100 border-t-sky-500 border-r-indigo-500 ${hasProgress ? 'ease-out duration-1000' : ''}`}></div>
          {/* Custom Logo/Icon placeholder or logo itself */}
          <div className="absolute text-sky-600 animate-pulse font-display font-black text-sm tracking-wider">AI</div>
        </div>
        
        <p className="text-slate-800 text-base font-extrabold font-display text-center leading-relaxed tracking-tight min-h-[3rem] px-2">
          {message}
        </p>
        
        {clampedProgress !== null ? (
          <div className="w-full mt-6 space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-semibold text-slate-400 font-display uppercase tracking-wider">Completing...</span>
              <span className="text-sm font-bold text-sky-600 font-mono">{clampedProgress}%</span>
            </div>
            {/* Progress track */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200/50 p-0.5">
              {/* Progress fill */}
              <div 
                className="h-full bg-gradient-to-r from-sky-500 via-indigo-500 to-indigo-600 rounded-full transition-all duration-300 ease-out relative"
                style={{ width: `${clampedProgress}%` }}
              >
                {/* Glowing pulse effect */}
                <span className="absolute inset-0 bg-white/20 animate-pulse rounded-full"></span>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-16 h-1 mt-6 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full animate-pulse"></div>
        )}
        
        <p className="text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-6">Processing via Neural Network</p>
      </div>
    </div>
  );
};
