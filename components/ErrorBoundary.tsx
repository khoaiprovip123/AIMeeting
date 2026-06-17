import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error captured by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="bg-rose-50/95 backdrop-blur-md border border-rose-200/60 text-rose-800 px-6 py-6 rounded-2xl flex flex-col items-center justify-center shadow-lg max-w-xl mx-auto my-12 text-center animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none"></div>
          <div className="bg-rose-100 p-3.5 rounded-2xl mb-4 text-rose-600 shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-base font-black text-slate-900 mb-1 font-display tracking-tight">
            Đã xảy ra sự cố hiển thị / Render Boundary Crash
          </h3>
          <p className="text-slate-500 text-xs leading-relaxed max-w-md mb-6 font-semibold">
            Có lẽ cấu trúc dữ liệu không khớp mong đợi. Bạn có thể bấm nút bên dưới để thử khôi phục nhanh hoặc tải lại trang.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="bg-slate-800 hover:bg-slate-705 text-white font-black text-[11px] px-4.5 py-2.5 rounded-xl transition-all shadow-md active:scale-95"
            >
              Thử lại / Reset UI View
            </button>
            <button
              onClick={() => window.location.reload()}
              className="bg-white hover:bg-slate-100 text-slate-750 border border-slate-200/80 font-black text-[11px] px-4.5 py-2.5 rounded-xl transition-all shadow-sm active:scale-95"
            >
              Tải lại trang / Reload Page
            </button>
          </div>
          {this.state.error && (
            <details className="mt-5 text-left w-full text-[10px] text-rose-650 font-mono bg-rose-100/30 p-3.5 rounded-xl border border-rose-200/20 max-h-40 overflow-y-auto">
              <summary className="cursor-pointer font-extrabold select-none text-rose-700 pb-1">Chi tiết kỹ thuật / Debug Stack</summary>
              <pre className="mt-1.5 whitespace-pre-wrap leading-relaxed opacity-90">{this.state.error.stack || this.state.error.message}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
