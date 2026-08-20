import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from '../i18n';
import { googleSignIn, emailSignIn, emailSignUp } from '../services/googleAuthService';
import { LogoIcon } from './Icons';

export const AuthScreen: React.FC = () => {
  const { language, changeLanguage } = useTranslation();
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Local Translations Dictionary
  const localLangs = {
    vi: {
      welcome: "Trợ lý Họp AI",
      subtitle: "Gỡ băng thông minh & Tự động tổng hợp biên bản họp",
      email: "Địa chỉ Email",
      pass: "Mật khẩu",
      confirmPass: "Xác nhận mật khẩu",
      fullName: "Họ và tên",
      signInBtn: "Đăng nhập",
      signUpBtn: "Đăng ký tài khoản",
      googleBtn: "Tiếp tục bằng Google",
      or: "hoặc đăng nhập bằng email",
      notHaveAccount: "Chưa có tài khoản?",
      alreadyHaveAccount: "Đã có tài khoản?",
      registerPrompt: "Đăng ký ngay",
      loginPrompt: "Đăng nhập tại đây",
      fieldsRequired: "Vui lòng nhập đầy đủ các trường thông tin.",
      passwordsDoNotMatch: "Mật khẩu xác nhận không trùng khớp.",
      passwordTooShort: "Mật khẩu phải chứa ít nhất 6 ký tự.",
      authError429: "Yêu cầu quá nhanh. Vui lòng thử lại sau.",
      genericError: "Đã xảy ra sự cố xác thực. Vui lòng thử lại.",
      invalidEmail: "Địa chỉ email không hợp lệ.",
      userNotFound: "Tài khoản email này chưa được đăng ký.",
      wrongPassword: "Mật khẩu hoặc email chưa chính xác.",
      emailInUse: "Email này đã được sử dụng bởi một tài khoản khác.",
      weakPassword: "Mật khẩu quá yếu (tối thiểu 6 ký tự)."
    },
    en: {
      welcome: "AI Meeting Assistant",
      subtitle: "Smart Transcription & Executive Meeting Minutes",
      email: "Email Address",
      pass: "Password",
      confirmPass: "Confirm Password",
      fullName: "Full Name",
      signInBtn: "Sign In",
      signUpBtn: "Create Account",
      googleBtn: "Continue with Google",
      or: "or sign in with email",
      notHaveAccount: "Don't have an account?",
      alreadyHaveAccount: "Already have an account?",
      registerPrompt: "Sign up now",
      loginPrompt: "Sign in here",
      fieldsRequired: "Please fill in all required fields.",
      passwordsDoNotMatch: "Passwords do not match.",
      passwordTooShort: "Password must be at least 6 characters.",
      authError429: "Too many requests. Please try again later.",
      genericError: "An authentication error occurred. Please try again.",
      invalidEmail: "Invalid email address format.",
      userNotFound: "No account found with this email.",
      wrongPassword: "Incorrect email or password.",
      emailInUse: "This email address is already in use.",
      weakPassword: "Password is too weak (minimum 6 characters)."
    }
  };

  const tl = localLangs[language === 'vi' ? 'vi' : 'en'];

  const parseAuthError = (errCode: string): string => {
    switch (errCode) {
      case 'auth/invalid-email':
        return tl.invalidEmail;
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return tl.wrongPassword;
      case 'auth/email-already-in-use':
        return tl.emailInUse;
      case 'auth/weak-password':
        return tl.weakPassword;
      case 'auth/too-many-requests':
        return tl.authError429;
      default:
        return tl.genericError;
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setError(null);
    try {
      await googleSignIn();
    } catch (err: any) {
      console.error("Google Sign-in failure: ", err);
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(parseAuthError(err?.code || ''));
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || (isRegisterMode && (!fullName || !confirmPassword))) {
      setError(tl.fieldsRequired);
      return;
    }

    if (isRegisterMode && password !== confirmPassword) {
      setError(tl.passwordsDoNotMatch);
      return;
    }

    if (password.length < 6) {
      setError(tl.passwordTooShort);
      return;
    }

    setAuthLoading(true);
    try {
      if (isRegisterMode) {
        await emailSignUp(email.trim(), password, fullName.trim());
      } else {
        await emailSignIn(email.trim(), password);
      }
    } catch (err: any) {
      console.error("Email authentication failed: ", err);
      setError(parseAuthError(err?.code || ''));
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div id="auth-screen-container" className="min-h-screen flex flex-col justify-center items-center py-12 px-4 sm:px-6 relative overflow-hidden bg-slate-900 text-slate-100 selection:bg-sky-500 selection:text-white">
      
      {/* Background ambient lighting */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Language Switcher in top right corner */}
      <div className="absolute top-4 right-4 z-20 flex bg-slate-800/80 backdrop-blur-md p-1 rounded-xl border border-slate-700/80">
        <button
          onClick={() => changeLanguage('vi')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
            language === 'vi' 
              ? 'bg-sky-600 text-white shadow-sm' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Tiếng Việt
        </button>
        <button
          onClick={() => changeLanguage('en')}
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
            language === 'en' 
              ? 'bg-sky-600 text-white shadow-sm' 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          English
        </button>
      </div>

      <motion.div 
        id="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="max-w-md w-full bg-slate-800/90 backdrop-blur-2xl border border-slate-700/80 p-8 sm:p-10 rounded-3xl shadow-2xl relative z-10"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex bg-gradient-to-br from-sky-500 via-sky-600 to-indigo-600 p-3.5 rounded-2xl shadow-lg shadow-sky-500/20 mb-4">
            <LogoIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display tracking-tight">
            {tl.welcome}
          </h2>
          <p className="mt-1.5 text-xs sm:text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">
            {tl.subtitle}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <motion.div 
            id="auth-error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium p-3.5 rounded-xl flex items-start gap-2.5"
          >
            <svg className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="flex-1 leading-relaxed">{error}</span>
          </motion.div>
        )}

        {/* Google Authentication */}
        <div>
          <button
            id="auth-google-btn"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-bold py-3 px-4 rounded-xl shadow-sm active:scale-[0.99] transition-all duration-200 disabled:opacity-50 cursor-pointer text-sm"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            </svg>
            <span>{tl.googleBtn}</span>
          </button>
        </div>

        {/* Separator */}
        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-slate-700"></div>
          <span className="px-3 text-[11px] text-slate-400 font-medium uppercase tracking-wider">{tl.or}</span>
          <div className="flex-1 border-t border-slate-700"></div>
        </div>

        {/* Email Credentials Form */}
        <form onSubmit={handleEmailAuthSubmit} className="space-y-4">
          {isRegisterMode && (
            <div className="space-y-1">
              <label htmlFor="fullName" className="block text-xs font-bold text-slate-300">{tl.fullName}</label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={language === 'vi' ? "Nguyễn Văn A" : "John Doe"}
                className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl placeholder-slate-500 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
              />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-xs font-bold text-slate-300">{tl.email}</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl placeholder-slate-500 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs font-bold text-slate-300">{tl.pass}</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={isRegisterMode ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl placeholder-slate-500 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {isRegisterMode && (
            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="block text-xs font-bold text-slate-300">{tl.confirmPass}</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl placeholder-slate-500 text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 transition-all"
              />
            </div>
          )}

          <div className="pt-2">
            <button
              id="auth-submit-btn"
              type="submit"
              disabled={authLoading}
              className="w-full flex justify-center items-center bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-md active:scale-[0.99] transition-all duration-200 text-sm disabled:opacity-50 cursor-pointer"
            >
              {authLoading ? (
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <span>{isRegisterMode ? tl.signUpBtn : tl.signInBtn}</span>
              )}
            </button>
          </div>
        </form>

        {/* Toggle Mode */}
        <div className="text-center pt-4 border-t border-slate-700/60 mt-6">
          <p className="text-xs text-slate-400">
            {isRegisterMode ? tl.alreadyHaveAccount : tl.notHaveAccount}{' '}
            <button
              id="auth-toggle-mode"
              type="button"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setError(null);
              }}
              className="text-sky-400 hover:text-sky-300 font-bold ml-1 focus:outline-none cursor-pointer underline"
            >
              {isRegisterMode ? tl.loginPrompt : tl.registerPrompt}
            </button>
          </p>
        </div>

      </motion.div>
    </div>
  );
};
