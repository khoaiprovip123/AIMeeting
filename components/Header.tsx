import React, { useState, useEffect, useRef } from 'react';
import { LogoIcon, BookOpenIcon } from './Icons';
import { useTranslation } from '../i18n';
import { initAuth, googleSignIn, logout } from '../services/googleAuthService';
import type { User } from 'firebase/auth';
import { UserGuideModal } from './UserGuideModal';

interface HeaderProps {
    onReset: () => void;
    showReset: boolean;
    onOpenHistory?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onReset, showReset, onOpenHistory }) => {
  const { t, language, changeLanguage } = useTranslation();
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
      },
      () => {
        setGoogleUser(null);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignIn = async () => {
    setAuthLoading(true);
    try {
      await googleSignIn();
    } catch (err) {
      console.error('Sign in failed:', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  return (
    <>
      <header className="bg-white/85 backdrop-blur-xl sticky top-0 z-50 border-b border-slate-200/70 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.03)] transition-all duration-300">
        <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center gap-4">
          {/* Brand Group */}
          <div 
            onClick={showReset ? onReset : undefined} 
            className={`flex items-center space-x-3 group ${showReset ? 'cursor-pointer' : 'cursor-default'} select-none`}
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 p-0.5 shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform duration-300 flex items-center justify-center">
                <LogoIcon className="w-5 h-5 text-white" />
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-white"></span>
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight font-display">
                  {t('appTitle')}
                </h1>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/60 font-mono">
                  Gemini 3.7 Flash
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium tracking-normal leading-tight">
                {language === 'vi' ? 'Biên bản & Phân tích cuộc họp thông minh' : 'Smart Meeting Minutes & AI Analysis'}
              </p>
            </div>
          </div>

          {/* Controls Group */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto relative" ref={dropdownRef}>
            {onOpenHistory && (
              <button 
                onClick={onOpenHistory}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200/60 py-2 px-3 sm:px-3.5 rounded-xl active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
                title={language === 'vi' ? 'Xem lịch sử cuộc họp đã lưu' : 'View saved meeting history'}
              >
                <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="hidden sm:inline">{language === 'vi' ? 'Lịch sử' : 'History'}</span>
              </button>
            )}

            <button 
              onClick={() => setIsGuideOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50/80 hover:bg-sky-100/90 border border-sky-200/60 py-2 px-3 sm:px-3.5 rounded-xl active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
              title={language === 'vi' ? 'Xem cẩm nang hướng dẫn sử dụng' : 'Open user guide'}
            >
              <BookOpenIcon className="w-4 h-4 text-sky-600" />
              <span className="hidden sm:inline">{language === 'vi' ? 'Hướng dẫn' : 'Guide'}</span>
            </button>

            {showReset && (
              <button 
                onClick={onReset}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 py-2 px-3 sm:px-3.5 rounded-xl active:scale-95 transition-all duration-200 shadow-sm"
              >
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{t('startOver')}</span>
              </button>
            )}

            {/* User Profile Avatar / Sign in button */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="focus:outline-none relative group active:scale-95 transition-all duration-200"
              aria-label="User profile menu"
            >
              {googleUser ? (
                <div className="relative">
                  {googleUser.photoURL ? (
                    <img 
                      src={googleUser.photoURL} 
                      alt={googleUser.displayName || 'Google user'} 
                      referrerPolicy="no-referrer" 
                      className="w-9 h-9 rounded-xl border border-slate-200 object-cover shadow-sm group-hover:border-sky-400 transition-all duration-200" 
                    />
                  ) : (
                    <div className="w-9 h-9 bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-bold flex items-center justify-center rounded-xl text-xs shadow-sm uppercase">
                      {(googleUser.displayName || googleUser.email || 'U')[0]}
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>
              ) : (
                <div className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm transition-all duration-200">
                  <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="hidden md:inline">{language === 'vi' ? 'Đăng nhập' : 'Sign in'}</span>
                </div>
              )}
            </button>

            {/* User Profile Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200/80 shadow-2xl py-3 px-3 z-50 transform origin-top-right transition-all">
                {googleUser ? (
                  <div className="space-y-3">
                    {/* User Profile Details */}
                    <div className="flex items-center space-x-3 p-2 bg-slate-50 rounded-xl border border-slate-100">
                      {googleUser.photoURL ? (
                        <img 
                          src={googleUser.photoURL} 
                          alt={googleUser.displayName || 'User'} 
                          referrerPolicy="no-referrer" 
                          className="w-10 h-10 rounded-xl border border-slate-200 shadow-sm flex-shrink-0 object-cover" 
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-bold flex items-center justify-center rounded-xl text-sm shadow-sm uppercase flex-shrink-0">
                          {(googleUser.displayName || googleUser.email || 'U')[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate leading-tight">{googleUser.displayName || 'User'}</p>
                        <p className="text-[11px] font-medium text-slate-400 truncate leading-normal mt-0.5">{googleUser.email}</p>
                      </div>
                    </div>

                    {/* Language Settings inside Dropdown */}
                    <div className="pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">
                        {language === 'vi' ? 'Ngôn ngữ' : 'Language'}
                      </span>
                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                        <button
                          onClick={() => changeLanguage('vi')}
                          aria-pressed={language === 'vi'}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                            language === 'vi' 
                            ? 'bg-white text-sky-700 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Tiếng Việt
                        </button>
                        <button
                          onClick={() => changeLanguage('en')}
                          aria-pressed={language === 'en'}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                            language === 'en' 
                            ? 'bg-white text-sky-700 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          English
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 my-1" />

                    {/* Log Out button */}
                    <button
                      onClick={async () => {
                        setDropdownOpen(false);
                        await handleSignOut();
                      }}
                      className="flex w-full items-center justify-center space-x-2 bg-rose-50/80 hover:bg-rose-100 border border-rose-200/60 text-rose-700 rounded-xl py-2 px-3 text-xs font-bold transition-all duration-200 active:scale-97 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>{language === 'vi' ? 'Đăng xuất' : 'Sign Out'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-center py-2 px-1">
                      <p className="text-xs font-bold text-slate-900">
                        {language === 'vi' ? 'Chào mừng bạn!' : 'Welcome!'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        {language === 'vi' 
                          ? 'Đăng nhập để lưu trữ cuộc họp và đồng bộ Gmail / Google Drive.' 
                          : 'Sign in to save meeting history and sync with Google Drive.'}
                      </p>
                    </div>

                    {/* Google Sign-in inside dropdown */}
                    <button
                      onClick={async () => {
                        setDropdownOpen(false);
                        await handleSignIn();
                      }}
                      disabled={authLoading}
                      className="flex w-full items-center justify-center space-x-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-3 rounded-xl shadow-md text-xs transition-all duration-200 active:scale-97 disabled:opacity-50 cursor-pointer"
                    >
                      {authLoading ? (
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 bg-white rounded-full p-0.5 flex-shrink-0" viewBox="0 0 48 48">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        </svg>
                      )}
                      <span>{language === 'vi' ? 'Đăng nhập Google' : 'Sign in with Google'}</span>
                    </button>

                    <div className="border-t border-slate-100 my-1" />

                    {/* Language Settings inside Dropdown */}
                    <div className="pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 px-1">
                        {language === 'vi' ? 'Ngôn ngữ' : 'Language'}
                      </span>
                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                        <button
                          onClick={() => changeLanguage('vi')}
                          aria-pressed={language === 'vi'}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                            language === 'vi' 
                            ? 'bg-white text-sky-700 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Tiếng Việt
                        </button>
                        <button
                          onClick={() => changeLanguage('en')}
                          aria-pressed={language === 'en'}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                            language === 'en' 
                            ? 'bg-white text-sky-700 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          English
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Interactive User Guide Modal */}
      <UserGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  );
};
