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

  useEffect(() => {
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [totalSize]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const sizeInMB = totalSize ? totalSize / (1024 * 1024) : 0;
  const baseTotalEstimatedSeconds = totalSize ? Math.max(12, Math.round(sizeInMB * 3.5 + 8)) : 25;

  let remainingText = '';
  if (clampedProgress !== null) {
    let remainingSecondsEstimate = 0;
    if (clampedProgress > 0) {
      const timeBasedTotalSeconds = elapsedSeconds / (clampedProgress / 100);
      const timeBasedRemainingSeconds = Math.max(1, Math.round(timeBasedTotalSeconds - elapsedSeconds));
      
      const progressWeight = clampedProgress / 100;
      const sizeBasedRemainingSeconds = Math.max(1, Math.round(baseTotalEstimatedSeconds * (1 - progressWeight)));
      
      remainingSecondsEstimate = Math.round(
        sizeBasedRemainingSeconds * (1 - progressWeight) + timeBasedRemainingSeconds * progressWeight
      );
    } else {
      remainingSecondsEstimate = baseTotalEstimatedSeconds;
    }

    if (remainingSecondsEstimate <= 0) {
      remainingText = vi ? 'Sắp hoàn tất...' : 'Almost done...';
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
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4 transition-all duration-300">
      <div className="bg-white/95 backdrop-blur-2xl p-8 sm:p-10 rounded-3xl shadow-2xl border border-slate-200/80 flex flex-col items-center max-w-md w-full mx-auto animate-in fade-in zoom-in duration-300">
        
        {/* Animated AI Waveform Icon */}
        <div className="relative mb-6 flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-0.5 shadow-lg shadow-sky-500/25 flex items-center justify-center">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center gap-1 px-4">
              <span className="w-1.5 h-6 bg-sky-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-10 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-8 bg-sky-300 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-11 bg-indigo-300 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
              <span className="w-1.5 h-5 bg-sky-400 rounded-full animate-bounce [animation-delay:-0.35s]"></span>
            </div>
          </div>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-sky-500 ring-2 ring-white"></span>
          </span>
        </div>
        
        <h3 className="text-base sm:text-lg font-bold text-slate-900 text-center font-display leading-snug tracking-tight min-h-[3rem] px-2 flex items-center justify-center">
          {message}
        </h3>
        
        {clampedProgress !== null ? (
          <div className="w-full mt-6 space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="flex justify-between items-center px-0.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
                {vi ? 'Tiến trình' : 'Progress'}
              </span>
              <span className="text-sm font-extrabold text-sky-600 font-mono">{clampedProgress}%</span>
            </div>
            
            {/* Progress track */}
            <div className="w-full h-2.5 bg-slate-200/70 rounded-full overflow-hidden p-0.5">
              <div 
                className="h-full bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 rounded-full transition-all duration-300 ease-out relative"
                style={{ width: `${clampedProgress}%` }}
              >
                <span className="absolute inset-0 bg-white/30 animate-pulse rounded-full"></span>
              </div>
            </div>

            {/* Estimates & Info */}
            <div className="flex flex-col space-y-1.5 pt-2 border-t border-slate-200/60 text-xs font-medium text-slate-600">
              {totalSize ? (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{vi ? 'Dung lượng tệp:' : 'File size:'}</span>
                  <span className="font-mono font-semibold text-slate-700">{formatFileSize(totalSize)}</span>
                </div>
              ) : null}
              {remainingText ? (
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 flex items-center gap-1">
                    <span>⏱️</span> {vi ? 'Thời gian dự kiến:' : 'Est. time remaining:'}
                  </span>
                  <span className="font-mono text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                    {remainingText}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="w-20 h-1 mt-6 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full animate-pulse"></div>
        )}
        
        <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase mt-6">
          Powered by Gemini 2.5 Flash
        </p>
      </div>
    </div>
  );
};
