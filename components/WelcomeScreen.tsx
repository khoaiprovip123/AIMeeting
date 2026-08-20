import React, { useState } from 'react';
import { SparklesIcon, ListIcon, TargetIcon } from './Icons';
import { useTranslation } from '../i18n';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description, badge }) => (
  <div className="bg-white/80 backdrop-blur-xl border border-slate-200/80 hover:border-sky-300 p-6 rounded-2xl text-left flex flex-col shadow-sm hover:shadow-md transition-all duration-300 group">
    <div className="flex items-center justify-between mb-4">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-100 flex items-center justify-center text-sky-600 group-hover:scale-105 group-hover:from-sky-500 group-hover:to-indigo-600 group-hover:text-white transition-all duration-300">
        {icon}
      </div>
      {badge && (
        <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/60 text-[10px] font-bold font-mono">
          {badge}
        </span>
      )}
    </div>
    <h3 className="font-bold text-base text-slate-900 font-display tracking-tight group-hover:text-sky-600 transition-colors">
      {title}
    </h3>
    <p className="text-slate-500 mt-2 text-xs sm:text-sm leading-relaxed">
      {description}
    </p>
  </div>
);

export const WelcomeScreen: React.FC = () => {
  const { t, language } = useTranslation();
  const [tipsExpanded, setTipsExpanded] = useState(false);

  return (
    <div className="space-y-6">
      {/* 3-Column Bento Grid */}
      <div className="grid sm:grid-cols-3 gap-4">
        <FeatureCard 
          icon={<SparklesIcon className="w-6 h-6"/>} 
          title={t('feature1Title')}
          description={t('feature1Desc')}
          badge="Gemini 3.7 Flash"
        />
        <FeatureCard 
          icon={<ListIcon className="w-6 h-6"/>} 
          title={t('feature2Title')}
          description={t('feature2Desc')}
          badge="Auto-MoM"
        />
        <FeatureCard 
          icon={<TargetIcon className="w-6 h-6"/>} 
          title={t('feature3Title')}
          description={t('feature3Desc')}
          badge="Tasks Sync"
        />
      </div>

      {/* Audio Optimization Tips Card */}
      <div className="bg-gradient-to-r from-amber-50/70 to-orange-50/50 border border-amber-200/60 p-4 sm:p-5 rounded-2xl text-left shadow-sm">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100/80 border border-amber-200 flex items-center justify-center text-amber-700 flex-shrink-0 text-base">
            💡
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold text-slate-900 text-xs sm:text-sm">
                {language === 'vi' ? 'Mẹo tối ưu chất lượng âm thanh trước khi tải lên' : 'Audio Optimization & File Size Tips'}
              </h4>
              <button 
                onClick={() => setTipsExpanded(!tipsExpanded)}
                className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline sm:hidden flex-shrink-0"
              >
                {tipsExpanded ? (language === 'vi' ? 'Thu gọn' : 'Less') : (language === 'vi' ? 'Xem thêm' : 'More')}
              </button>
            </div>
            <p className={`text-xs text-slate-600 mt-1.5 leading-relaxed ${tipsExpanded ? 'block' : 'hidden sm:block'}`}>
              {language === 'vi' ? (
                <>
                  Nếu tệp ghi âm quá lớn hoặc thời lượng dài hơn 1 giờ, bạn có thể dùng công cụ miễn phí {' '}
                  <a 
                    href="https://mp3cut.net/vi/" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="font-bold text-amber-800 underline hover:text-amber-950"
                  >
                    mp3cut.net
                  </a>{' '}
                  để chia thành các phần nhỏ dưới 60 phút. Sau đó tải nhiều phần cùng lúc, hệ thống sẽ tự động gỡ băng và tổng hợp thành 1 biên bản hoàn chỉnh.
                </>
              ) : (
                <>
                  For long recordings over 1 hour, you can split audio files using {' '}
                  <a 
                    href="https://mp3cut.net" 
                    target="_blank" 
                    rel="noreferrer" 
                    className="font-bold text-amber-800 underline hover:text-amber-950"
                  >
                    mp3cut.net
                  </a>{' '}
                  into chunks. Upload them together and AI will automatically consolidate into one executive report.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
