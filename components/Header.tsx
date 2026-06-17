
import React, { useState, useEffect, useRef } from 'react';
import { LogoIcon, BookOpenIcon } from './Icons';
import { useTranslation } from '../i18n';
import { initAuth, googleSignIn, logout } from '../services/googleAuthService';
import type { User } from 'firebase/auth';
import { UserGuideModal } from './UserGuideModal';

interface HeaderProps {
    onReset: () => void;
    showReset: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onReset, showReset }) => {
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
      <header className="bg-white/70 backdrop-blur-xl sticky top-0 z-50 border-b border-slate-200/60 shadow-sm transition-all duration-300">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex justify-between items-center gap-3">
          {/* Brand Group */}
          <div className="flex items-center space-x-2.5 group cursor-pointer flex-shrink-0">
            <div className="bg-gradient-to-tr from-sky-500 to-indigo-600 p-1.5 sm:p-2 rounded-xl shadow-md shadow-sky-500/10 group-hover:scale-105 transition-transform duration-300">
              <LogoIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg md:text-xl font-extrabold text-slate-900 tracking-tight font-display select-none whitespace-nowrap">
                <span className="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-700 bg-clip-text text-transparent">
                  {t('appTitle')}
                </span>
              </h1>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-mono tracking-wider uppercase mt-0.5 leading-none">Powered by Gemini AI 3.5</p>
            </div>
          </div>

          {/* Controls Group */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0 ml-auto relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsGuideOpen(true)}
              className="text-[10px] sm:text-xs bg-sky-50 hover:bg-sky-100 text-sky-600 border border-sky-100/60 font-extrabold font-display py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl active:scale-95 transition-all duration-200 flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
              title={language === 'vi' ? 'Xem cẩm nang hướng dẫn sử dụng' : 'Open user guide'}
            >
              <BookOpenIcon className="w-3.5 h-3.5" />
              <span>{language === 'vi' ? 'Hướng dẫn' : 'Guide'}</span>
            </button>

            {showReset && (
              <button 
                onClick={onReset}
                className="text-[10px] sm:text-xs bg-slate-905 hover:bg-slate-800 border border-slate-950/20 text-slate-900 font-bold font-display py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl hover:shadow-lg active:scale-95 transition-all duration-200 flex-shrink-0"
                style={{ backgroundColor: '#1e293b', color: '#ffffff' }}
              >
                {t('startOver')}
              </button>
            )}

            {/* User Profile Avatar / Guest outline toggle button */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="focus:outline-none flex-shrink-0 relative group active:scale-95 transition-all duration-150"
              aria-label="User profile menu"
            >
              {googleUser ? (
                <div className="relative">
                  {googleUser.photoURL ? (
                    <img 
                      src={googleUser.photoURL} 
                      alt={googleUser.displayName || 'Google user'} 
                      referrerPolicy="no-referrer" 
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-sky-200 group-hover:border-sky-400 shadow-sm transition-all duration-200" 
                    />
                  ) : (
                    <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-tr from-sky-500 to-indigo-650 text-white font-extrabold flex items-center justify-center rounded-full text-xs shadow-sm uppercase">
                      {(googleUser.displayName || 'G')[0]}
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </div>
              ) : (
                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 text-slate-600 p-1.5 sm:p-2 rounded-full flex items-center justify-center shadow-sm hover:text-slate-800 transition-all duration-200">
                  <svg className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              )}
            </button>

            {/* User Profile Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-slate-200/60 shadow-xl py-4 px-4 z-50 transform origin-top-right transition-all animate-fadeIn">
                {googleUser ? (
                  <div className="space-y-4">
                    {/* User Profile Details */}
                    <div className="flex items-center space-x-3">
                      {googleUser.photoURL ? (
                        <img 
                          src={googleUser.photoURL} 
                          alt={googleUser.displayName || 'User'} 
                          referrerPolicy="no-referrer" 
                          className="w-11 h-11 rounded-full border border-slate-100 shadow-sm flex-shrink-0" 
                        />
                      ) : (
                        <div className="w-11 h-11 bg-gradient-to-tr from-sky-500 to-indigo-600 text-white font-extrabold flex items-center justify-center rounded-full text-sm shadow-sm uppercase flex-shrink-0">
                          {(googleUser.displayName || 'G')[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black font-display text-slate-800 truncate leading-tight">{googleUser.displayName}</p>
                        <p className="text-[10.5px] font-medium text-slate-400 truncate leading-normal mt-0.5">{googleUser.email}</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 my-2" />

                    {/* Language Settings inside Dropdown */}
                    <div>
                      <span className="text-[9.5px] font-mono font-black text-slate-400 uppercase tracking-widest block mb-2 px-0.5">
                        {language === 'vi' ? 'Ngôn ngữ hiển thị' : 'Display Language'}
                      </span>
                      <div className="flex bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-200/40">
                        <button
                          onClick={() => changeLanguage('vi')}
                          aria-pressed={language === 'vi'}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-extrabold font-display transition-all duration-205 ${
                            language === 'vi' 
                            ? 'bg-white text-sky-650 shadow-sm border border-slate-200/30' 
                            : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Tiếng Việt
                        </button>
                        <button
                          onClick={() => changeLanguage('en')}
                          aria-pressed={language === 'en'}
                          className={`flex-1 py-1.5 rounded-lg text-[11px] font-extrabold font-display transition-all duration-205 ${
                            language === 'en' 
                            ? 'bg-white text-sky-650 shadow-sm border border-slate-200/30' 
                            : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          English
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 my-2" />

                    {/* Log Out button */}
                    <button
                      onClick={async () => {
                        setDropdownOpen(false);
                        await handleSignOut();
                      }}
                      className="flex w-full items-center justify-center space-x-2 bg-rose-50 hover:bg-rose-100/70 border border-rose-105 text-rose-600 rounded-xl py-2 px-3 text-xs font-extrabold transition-all duration-200 active:scale-97 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      <span>{language === 'vi' ? 'Đăng xuất' : 'Sign Out'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center py-2 px-1">
                      <p className="text-sm font-extrabold text-slate-800 leading-snug">
                        {language === 'vi' ? 'Xin chào khách!' : 'Hello Guest!'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {language === 'vi' 
                          ? 'Đăng nhập Google để quản lý báo cáo và đồng bộ thư nháp Gmail, Google Drive.' 
                          : 'Sign in with Google to sync meeting notes with Gmail & Google Drive.'}
                      </p>
                    </div>

                    {/* Google Sign-in inside dropdown */}
                    <button
                      onClick={async () => {
                        setDropdownOpen(false);
                        await handleSignIn();
                      }}
                      disabled={authLoading}
                      className="flex w-full items-center justify-center space-x-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold font-display py-2 px-3 rounded-xl shadow-md shadow-slate-900/10 text-xs transition-all duration-200 active:scale-97 disabled:opacity-50 cursor-pointer"
                    >
                      {authLoading ? (
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
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

                    <div className="border-t border-slate-100 my-2" />

                    {/* Language Settings inside Dropdown */}
                    <div>
                      <span className="text-[9.5px] font-mono font-black text-slate-400 uppercase tracking-widest block mb-2 px-0.5">
                        {language === 'vi' ? 'Ngôn ngữ hiển thị' : 'Display Language'}
                      </span>
                      <div className="flex bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-200/40">
                        <button
                          onClick={() => changeLanguage('vi')}
                          aria-pressed={language === 'vi'}
                          className={`flex-1 py-1.5 rounded-lg text-[11.5px] font-extrabold font-display transition-all duration-205 ${
                            language === 'vi' 
                            ? 'bg-white text-sky-650 shadow-sm border border-slate-200/30' 
                            : 'text-slate-500 hover:text-slate-900'
                          }`}
                        >
                          Tiếng Việt
                        </button>
                        <button
                          onClick={() => changeLanguage('en')}
                          aria-pressed={language === 'en'}
                          className={`flex-1 py-1.5 rounded-lg text-[11.5px] font-extrabold font-display transition-all duration-205 ${
                            language === 'en' 
                            ? 'bg-white text-sky-650 shadow-sm border border-slate-200/30' 
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

      {/* Interactive User Guide Modal - Mounted out of header context for absolute safety */}
      <UserGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  );
};
