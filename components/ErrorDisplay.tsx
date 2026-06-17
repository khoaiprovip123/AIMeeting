
import React from 'react';
import { AlertTriangleIcon } from './Icons';
import { useTranslation } from '../i18n';

interface ErrorDisplayProps {
  message: string;
  onClear: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message, onClear }) => {
  const { t } = useTranslation();
  return (
    <div className="bg-rose-50/90 backdrop-blur-md border border-rose-200/60 text-rose-800 px-5 py-4 rounded-2xl relative flex items-start shadow-md shadow-rose-100/50 hover:shadow-lg transition-all duration-300 max-w-2xl mx-auto my-6" role="alert">
      <div className="bg-rose-100 p-2 rounded-xl mr-4 flex-shrink-0 shadow-inner">
        <AlertTriangleIcon className="w-5 h-5 text-rose-600" />
      </div>
      <div className="flex-grow pr-8">
        <h4 className="font-extrabold text-slate-900 font-display tracking-tight text-sm mb-1">{t('errorTitle')}</h4>
        <span className="block text-slate-600 font-sans text-xs leading-relaxed">{message}</span>
      </div>
      <button 
        onClick={onClear} 
        className="absolute top-3.5 right-4 text-slate-400 hover:text-rose-600 hover:bg-rose-100/50 p-1.5 rounded-lg transition-all duration-200" 
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
