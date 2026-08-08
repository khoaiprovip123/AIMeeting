
import React from 'react';
import { SparklesIcon, ListIcon, TargetIcon } from './Icons';
import { useTranslation } from '../i18n';

const FeatureCard: React.FC<{ icon: React.ReactNode; title: string; description: string }> = ({ icon, title, description }) => (
    <div className="group bg-white/40 hover:bg-white/60 backdrop-blur-md border border-white/85 hover:border-white p-8 rounded-[24px] text-center flex flex-col items-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.75),_0_10px_30px_-10px_rgba(148,163,184,0.12)] hover:shadow-[inset_0_2px_4px_rgba(255,255,255,0.85),_0_20px_40px_-15px_rgba(148,163,184,0.18)] hover:-translate-y-1 transition-all duration-300">
        <div className="bg-gradient-to-tr from-sky-50 to-indigo-50/50 p-4 rounded-2xl mb-5 group-hover:scale-110 group-hover:from-sky-500 group-hover:to-indigo-600 transition-all duration-300 text-sky-500 group-hover:text-white shadow-inner">
            {icon}
        </div>
        <h3 className="font-extrabold text-lg text-slate-800 font-display tracking-tight transition-colors duration-200 group-hover:text-sky-600">{title}</h3>
        <p className="text-slate-500 mt-2.5 text-sm leading-relaxed font-sans">{description}</p>
    </div>
);

export const WelcomeScreen: React.FC = () => {
    const { t, language } = useTranslation();
    return (
        <div className="text-center p-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-50 border border-sky-100/50 text-sky-600 text-xs font-semibold uppercase tracking-wider font-mono mb-6">
                <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping"></span>
                v2.0 Beta Released
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight font-display mb-5 leading-[1.15]">
              {t('welcomeTitle').split(' ').map((word, i) => (
                <span key={i} className={i >= 3 ? "gradient-text font-display" : "font-display"}>
                  {word}{' '}
                </span>
              ))}
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-12 font-sans leading-relaxed">
                {t('welcomeSubtitle')}
            </p>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-10">
                <FeatureCard 
                    icon={<SparklesIcon className="w-6 h-6"/>} 
                    title={t('feature1Title')}
                    description={t('feature1Desc')}
                />
                 <FeatureCard 
                    icon={<ListIcon className="w-6 h-6"/>} 
                    title={t('feature2Title')}
                    description={t('feature2Desc')}
                />
                 <FeatureCard 
                    icon={<TargetIcon className="w-6 h-6"/>} 
                    title={t('feature3Title')}
                    description={t('feature3Desc')}
                />
            </div>

            {/* Audio size cutting and volume boosting tips card */}
            <div className="mt-8 max-w-3xl mx-auto bg-amber-50/40 backdrop-blur-md border border-amber-200/40 p-5 rounded-[24px] text-left shadow-[inset_0_2px_4px_rgba(255,255,255,0.7),_0_8px_24px_rgba(245,158,11,0.04)] hover:shadow-md transition-all duration-300">
                <div className="flex items-start space-x-3.5">
                    <span className="text-2xl mt-0.5" role="img" aria-label="lightbulb">💡</span>
                    <div>
                        <h4 className="font-extrabold text-amber-900 font-display text-sm sm:text-base">
                            {language === 'vi' ? 'Mẹo tối ưu hóa tệp tin & chất lượng nhận âm' : 'File Size and Sound Volume Optimization Tips'}
                        </h4>
                        <p className="text-xs sm:text-sm text-amber-850 mt-1.5 leading-relaxed font-sans">
                            {language === 'vi' ? (
                                <>
                                    Nếu tệp video hoặc ghi âm cuộc họp của bạn <strong>quá nặng</strong> (vượt quá dung lượng cho phép), bạn hãy truy cập trang web{' '}
                                    <a 
                                        href="https://mp3cut.net/vi/" 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="font-black text-amber-700 underline hover:text-amber-500 transition-colors"
                                    >
                                        https://mp3cut.net/vi/
                                    </a>{' '}
                                    để cắt bớt các phần không quan trọng hoặc phân nhỏ cuộc họp thành các đoạn <strong>dao động dưới 1 tiếng</strong>. Nếu âm thanh cuộc họp của bạn <strong>quá nhỏ</strong>, bạn nên sử dụng các dịch vụ tăng cường âm lượng trực tuyến (Volume Booster) để nâng cao chất lượng âm của bản ghi trước khi tải lên, giúp AI gỡ băng và bóc tách tiếng chính xác nhất.
                                </>
                            ) : (
                                <>
                                    If your meeting video or audio file is <strong>too heavy/large</strong>, you can use the free tool {' '}
                                    <a 
                                        href="https://mp3cut.net" 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        className="font-black text-amber-700 underline hover:text-amber-500 transition-colors"
                                    >
                                        https://mp3cut.net
                                    </a>{' '}
                                    to trim or divide it into sub-sessions <strong>under 1 hour</strong>. If speaker volume is <strong>too low</strong>, running it through a volume booster online beforehand improves sound quality significantly so Gemini can transcribe perfectly.
                                </>
                            )}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
