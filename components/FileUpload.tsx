
import React, { useState, useCallback } from 'react';
import { UploadCloudIcon } from './Icons';
import { useTranslation } from '../i18n';
import { HelpTooltip } from './HelpTooltip';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { t } = useTranslation();

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(Array.from(e.dataTransfer.files));
    }
  }, [onFileSelect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(Array.from(e.target.files));
    }
  };

  return (
    <div
      className={`mt-4 border-2 border-dashed rounded-3xl p-6 sm:p-12 text-center transition-all duration-500 relative overflow-hidden custom-shadow-lg
        ${isDragging 
          ? 'border-sky-500 bg-sky-50/70 scale-[1.01] animate-pulseGlow' 
          : 'border-slate-300/80 hover:border-sky-400/80 bg-white/70 backdrop-blur-md'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Help Tooltip */}
      <div className="absolute top-4 right-4 z-20">
        <HelpTooltip content={t('tooltipUpload')} position="bottom-left" />
      </div>

      {/* Glow Effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-sky-400/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
      
      <input
        type="file"
        id="file-upload"
        className="hidden"
        multiple
        onChange={handleFileChange}
        accept="audio/*,video/mp4,video/x-m4v,video/quicktime,video/x-ms-wmv"
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center relative z-10 select-none group">
        <div className="inline-flex items-center justify-center bg-gradient-to-tr from-sky-50 to-indigo-50 p-6 rounded-3xl mb-6 shadow-sm border border-slate-100 group-hover:scale-110 group-hover:from-sky-500 group-hover:to-indigo-500 group-hover:text-white transition-all duration-300">
          <UploadCloudIcon className="w-12 h-12 text-sky-500 group-hover:text-white transition-colors duration-300" />
        </div>
        <p className="text-2xl font-extrabold text-slate-800 font-display tracking-tight group-hover:text-sky-600 transition-colors duration-200">{t('dropzoneTitle')}</p>
        <p className="text-slate-400 text-sm font-medium mt-1 font-sans">{t('or')}</p>
        <span className="mt-4 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-sky-500/20 active:scale-95 text-white font-bold font-display py-3 px-8 rounded-2xl transition-all duration-300 text-sm">
          {t('selectFileButton')}
        </span>
        <p className="text-xs text-slate-400 font-medium mt-6 font-mono tracking-wide">{t('supportedFormats')}</p>
      </label>
    </div>
  );
};
