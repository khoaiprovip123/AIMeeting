
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../i18n';

interface LoaderProps {
  message: string;
  progress?: number | null;
  totalSize?: number | null;
}

export const Loader: React.FC<LoaderProps> = ({ message, progress, totalSize }) => {
  const { language } = useTranslation();
  const vi = language === 'vi';
  
  const hasProgress = typeof progress === 'number' && progress >= 0;
  const clampedProgress = hasProgress ? Math.min(100, Math.max(0, progress)) : null;

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Reset/start the timer whenever totalSize or Loader is initialized
  useEffect(() => {
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [totalSize]);

  // Format file size nicely
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Base estimated total seconds based on file size
  // Video or audio processing/uploading generally takes around 3.5 seconds per MB + 8 seconds baseline.
  const sizeInMB = totalSize ? totalSize / (1024 * 1024) : 0;
  const baseTotalEstimatedSeconds = totalSize ? Math.max(12, Math.round(sizeInMB * 3.5 + 8)) : 25;

  let remainingText = '';
  if (clampedProgress !== null) {
    let remainingSecondsEstimate = 0;
    if (clampedProgress > 0) {
      // Linear extrapolation of total seconds using elapsed time vs current progress
      const timeBasedTotalSeconds = elapsedSeconds / (clampedProgress / 100);
      const timeBasedRemainingSeconds = Math.max(1, Math.round(timeBasedTotalSeconds - elapsedSeconds));
      
      const progressWeight = clampedProgress / 100; // 0 to 1
      const sizeBasedRemainingSeconds = Math.max(1, Math.round(baseTotalEstimatedSeconds * (1 - progressWeight)));
      
      // Weighted blend: shift weight from size baseline to active time performance as progress grows
      remainingSecondsEstimate = Math.round(
        sizeBasedRemainingSeconds * (1 - progressWeight) + timeBasedRemainingSeconds * progressWeight
      );
    } else {
      remainingSecondsEstimate = baseTotalEstimatedSeconds;
    }

    if (remainingSecondsEstimate <= 0) {
      remainingText = vi ? 'Sắp xong...' : 'Almost done...';
    } else if (remainingSecondsEstimate < 60) {
      remainingText = vi ? `~ ${remainingSecondsEstimate} giây` : `~ ${remainingSecondsEstimate}s`;
    } else {
      const mins = Math.floor(remainingSecondsEstimate / 60);
      const secs = remainingSecondsEstimate % 60;
      remainingText = vi 
        ? `~ ${mins} phút ${secs} giây` 
        : `~ ${mins}m ${secs}s`;
    }
  }

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
          <div className="w-full mt-6 space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-semibold text-slate-400 font-display uppercase tracking-wider">
                {vi ? 'Tiến trình' : 'Progress'}
              </span>
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

            {/* Estimates & Info */}
            <div className="flex flex-col space-y-1.5 pt-1.5 border-t border-slate-200/40 text-[11px] font-medium text-slate-500 font-sans">
              {totalSize ? (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{vi ? 'Dung lượng tệp:' : 'File size:'}</span>
                  <span className="font-mono text-slate-700 font-semibold">{formatFileSize(totalSize)}</span>
                </div>
              ) : null}
              {remainingText ? (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center">
                    <span className="mr-1">⏱️</span> {vi ? 'Ước tính còn lại:' : 'Est. remaining:'}
                  </span>
                  <span className="font-mono text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/70 shadow-[0_1px_2px_rgba(99,102,241,0.05)]">
                    {remainingText}
                  </span>
                </div>
              ) : null}
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
