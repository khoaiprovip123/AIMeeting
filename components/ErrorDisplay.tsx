
import React from 'react';
import { AlertTriangleIcon } from './Icons';
import { useTranslation } from '../i18n';

interface ErrorDisplayProps {
  message: string;
  onClear: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ message, onClear }) => {
  const { t, language } = useTranslation();
  const isMalformed = message.includes('MALFORMED') || message.includes('LỖI CẤU TRÚC') || message.includes('⚠️');

  return (
    <div className={`border px-5 py-4 rounded-2xl relative flex items-start shadow-xl transition-all duration-300 max-w-2xl mx-auto my-6 ${
      isMalformed 
        ? 'bg-amber-50/95 border-amber-300/80 text-amber-900 shadow-amber-100/60 ring-2 ring-amber-400/30' 
        : 'bg-rose-50/90 border-rose-200/60 text-rose-800 shadow-rose-100/50'
    }`} role="alert">
      <div className={`p-2.5 rounded-xl mr-4 flex-shrink-0 shadow-inner mt-0.5 ${
        isMalformed ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-600'
      }`}>
        <AlertTriangleIcon className="w-6 h-6" />
      </div>
      <div className="flex-grow pr-8">
        <h4 className="font-extrabold text-slate-900 font-display tracking-tight text-sm mb-1.5 flex items-center gap-2">
          <span>{isMalformed ? (language === 'vi' ? 'CẢNH BÁO: ĐÃ LẬP TỨC NGỪNG XỬ LÝ CUỘC HỌP' : 'WARNING: MEETING ANALYSIS HALTED') : t('errorTitle')}</span>
          {isMalformed && (
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-200/90 text-amber-900 uppercase">
              {language === 'vi' ? 'Đã Bảo Vệ API' : 'API Protected'}
            </span>
          )}
        </h4>
        <div className="text-slate-700 font-sans text-xs leading-relaxed space-y-2">
          <p className="font-medium whitespace-pre-line leading-normal">{message}</p>
          {isMalformed && (
            <div className="mt-2.5 pt-2.5 border-t border-amber-200/80 text-[11px] text-amber-800/90 font-medium space-y-1">
              <p className="font-bold text-amber-900">💡 {language === 'vi' ? 'Hướng dẫn xử lý đề xuất:' : 'Recommended steps:'}</p>
              <ul className="list-disc list-inside space-y-0.5 pl-1 text-amber-900/90">
                <li>{language === 'vi' ? 'Tệp đã gặp sự cố không được tính cước API bổ sung.' : 'The faulty file did not consume additional API credits.'}</li>
                <li>{language === 'vi' ? 'Xuất lại tệp âm thanh dưới định dạng MP3, M4A hoặc WAV tiêu chuẩn.' : 'Re-export the audio file in standard MP3, M4A, or WAV format.'}</li>
                <li>{language === 'vi' ? 'Thử mở phát âm thanh trên máy tính để chắc chắn file không bị hỏng.' : 'Play the file locally to ensure it is valid.'}</li>
              </ul>
            </div>
          )}
        </div>
      </div>
      <button 
        onClick={onClear} 
        className="absolute top-3.5 right-4 text-slate-400 hover:text-amber-800 hover:bg-amber-200/50 p-1.5 rounded-lg transition-all duration-200 cursor-pointer" 
        aria-label="Close"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
