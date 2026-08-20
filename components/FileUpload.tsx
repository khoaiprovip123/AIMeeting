import React, { useState, useCallback } from 'react';
import { UploadCloudIcon } from './Icons';
import { useTranslation } from '../i18n';
import { HelpTooltip } from './HelpTooltip';

interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);
  const { t, language } = useTranslation();

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
      className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all duration-300 relative overflow-hidden bg-white/80 backdrop-blur-xl shadow-glass hover:shadow-glass-hover
        ${isDragging 
          ? 'border-sky-500 bg-sky-50/60 scale-[1.01]' 
          : 'border-slate-200/90 hover:border-sky-400'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Help Tooltip */}
      <div className="absolute top-4 right-4 z-20">
        <HelpTooltip content={t('tooltipUpload')} position="bottom-left" />
      </div>

      <input
        type="file"
        id="file-upload"
        className="hidden"
        multiple
        onChange={handleFileChange}
        accept="audio/*,video/mp4,video/x-m4v,video/quicktime,video/x-ms-wmv"
      />
      
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center relative z-10 select-none group">
        {/* Animated Icon Circle */}
        <div className="relative mb-5">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100/80 flex items-center justify-center text-sky-600 group-hover:scale-110 group-hover:from-sky-500 group-hover:to-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm">
            <UploadCloudIcon className="w-8 h-8 sm:w-10 sm:h-10 transition-colors duration-300" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-60"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-sky-500 border-2 border-white"></span>
          </span>
        </div>

        <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-display tracking-tight group-hover:text-sky-600 transition-colors">
          {t('dropzoneTitle')}
        </h3>
        
        <p className="text-slate-500 text-xs sm:text-sm mt-1.5 max-w-md">
          {language === 'vi' 
            ? 'Kéo thả một hoặc nhiều file ghi âm / video cuộc họp vào đây' 
            : 'Drag and drop one or multiple audio/video meeting files here'}
        </p>

        {/* Action Button */}
        <div className="mt-6">
          <span className="inline-flex items-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold py-3 px-7 rounded-xl text-sm shadow-md shadow-sky-600/20 active:scale-95 transition-all duration-200">
            <svg className="w-4 h-4 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('selectFileButton')}
          </span>
        </div>

        {/* Supported formats & batch note */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5 max-w-lg">
          {['MP3', 'WAV', 'M4A', 'AAC', 'MP4', 'MOV', 'FLAC'].map((format) => (
            <span key={format} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60 font-mono text-[11px] font-medium">
              {format}
            </span>
          ))}
          <span className="text-[11px] text-slate-400 ml-1 font-medium">
            (Tối đa 200MB/file)
          </span>
        </div>
      </label>
    </div>
  );
};
