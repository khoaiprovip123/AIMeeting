import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ isOpen, onClose }) => {
  const { language } = useTranslation();
  const [activeTab, setActiveTab] = useState<'steps' | 'batch_merge' | 'report' | 'tips'>('steps');

  if (!isOpen) return null;

  const tabs = [
    {
      id: 'steps' as const,
      label_vi: '🔄 4 Bước chuẩn hóa',
      label_en: '🔄 4-Step Standard',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.9 1.51-.9 1.82 0l1.151 3.451a1.1 1.1 0 001.046.76h3.63c.95 0 1.34 1.22.57 1.79l-2.94 2.133a1.1 1.1 0 00-.38 1.178l1.15 3.452c.3.9-.74 1.63-1.51 1.07l-2.94-2.132a1.1 1.1 0 00-1.17-.002L9.5 17.575c-.77.56-1.81-.17-1.51-1.07l1.15-3.452a1.1 1.1 0 00-.38-1.178L5.82 8.928c-.77-.57-.38-1.79.57-1.79h3.63a1.1 1.1 0 001.046-.76l1.15-3.45z" />
        </svg>
      )
    },
    {
      id: 'batch_merge' as const,
      label_vi: '⚡ Xử lý Hàng loạt & Gộp',
      label_en: '⚡ Batch & Merge Reports',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      )
    },
    {
      id: 'report' as const,
      label_vi: '📊 Cấu trúc Báo cáo AI',
      label_en: '📊 AI Report Cards',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
        </svg>
      )
    },
    {
      id: 'tips' as const,
      label_vi: '💡 Mẹo Cắt file & Tăng âm',
      label_en: '💡 Splitting & Quality Tips',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
    }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-5 overflow-hidden">
        {/* Semi-transparent Backdrop with heavy smooth blur for frosted-glass accentuation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-[14px] cursor-pointer"
        />

        {/* Modal Container: Frosted Water Glass Styling */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ type: 'spring', duration: 0.5, bounce: 0.12 }}
          className="relative bg-white/70 backdrop-blur-2xl border border-white/50 rounded-3xl shadow-2xl w-full max-w-3xl h-[94%] sm:h-[85%] flex flex-col overflow-hidden z-10"
          style={{
            boxShadow: '0 8px 32px 0 rgba(15, 23, 42, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.45)'
          }}
        >
          {/* Ambient luminous dynamic droplets in the background */}
          <div className="absolute top-[-30px] left-[-30px] w-64 h-64 bg-sky-200/45 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-30px] right-[-30px] w-64 h-64 bg-indigo-200/35 rounded-full blur-3xl pointer-events-none" />

          {/* Header - Glassmorphism water flow design */}
          <div className="relative border-b border-white/40 p-4 sm:p-5 flex justify-between items-center bg-gradient-to-r from-sky-500/15 via-indigo-500/5 to-transparent backdrop-blur-md">
            <div className="flex items-center space-x-3.5">
              {/* Luminous circular glass badge for book icon */}
              <div className="relative group flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-sky-400/20 to-indigo-500/10 border border-sky-400/30 text-sky-600 shadow-[inset_0_2px_10px_rgba(255,255,255,0.6)] overflow-hidden flex-shrink-0">
                <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 relative z-10 animate-pulse text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                {/* Micro reflection highlight */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/50 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              </div>
              
              <div className="min-w-0">
                <h2 className="text-sm sm:text-lg font-black font-display text-slate-800 tracking-tight leading-tight flex flex-wrap items-center gap-1.5">
                  <span>{language === 'vi' ? 'Cẩm Nang Trợ Lý Họp AI' : 'AI Meeting Assistant Field Guide'}</span>
                  <span className="text-[9px] uppercase tracking-wider font-mono font-black text-sky-600 bg-sky-200/30 px-2 py-0.5 rounded-md border border-sky-300/20">{language === 'vi' ? 'CHÍNH THỨC' : 'OFFICIAL'}</span>
                </h2>
                <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">
                  {language === 'vi' 
                    ? 'Làm chủ tính năng tải lên hàng loạt, gộp báo cáo và tinh chỉnh dữ liệu' 
                    : 'Master simultaneous upload, custom report merge tools and transcript correction'}
                </p>
              </div>
            </div>
            
            {/* Elegant glass close window button closer */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 bg-white/40 hover:bg-white/80 border border-slate-200/50 transition-all duration-200 flex-shrink-0 cursor-pointer shadow-sm ml-2"
              title={language === 'vi' ? 'Đóng hướng dẫn' : 'Close guide'}
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation Bar/Tabs - Liquid-smooth glass segment tabs */}
          <div className="bg-slate-50/50 backdrop-blur-md border-b border-white/30 px-3 sm:px-6 overflow-x-auto flex scrollbar-none gap-1 py-2 font-display">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-black whitespace-nowrap transition-all duration-300 relative flex items-center gap-1.5 border select-none cursor-pointer group ${
                    isActive 
                      ? 'bg-white/80 text-sky-650 shadow-sm border-slate-200/65' 
                      : 'bg-transparent text-slate-500 border-transparent hover:text-slate-800 hover:bg-white/30 hover:border-slate-200/30'
                  }`}
                >
                  <span className={`${isActive ? 'text-sky-500' : 'text-slate-400 group-hover:text-slate-600'} transition-colors duration-200`}>
                    {tab.icon}
                  </span>
                  <span>{language === 'vi' ? tab.label_vi : tab.label_en}</span>

                  {isActive && (
                    <motion.div 
                      layoutId="activeTabUnderline"
                      className="absolute bottom-0 left-3 right-3 h-[2px] bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Scrolling Main Body Panel */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-slate-700 leading-relaxed text-xs sm:text-sm space-y-4 sm:space-y-6">
            
            {activeTab === 'steps' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-sky-500/10 to-indigo-500/5 backdrop-blur-md border border-sky-450/20 p-3.5 rounded-2xl flex items-start gap-2.5 shadow-inner">
                  <span className="text-sky-600 text-base mt-0.5">🚀</span>
                  <div className="text-xs text-slate-600 font-sans">
                    <strong>{language === 'vi' ? 'Tiết kiệm 95% thời gian viết biên bản:' : 'Save 95% of manual memo effort:'}</strong>{' '}
                    {language === 'vi' 
                      ? 'Ứng dụng tự động hóa hoàn toàn quy trình nghe lại âm thanh, gỡ chi tiết tiếng Việt và lập báo cáo bám sát mục tiêu thông tin của bạn.' 
                      : 'Step-by-step automatic audio conversion, Vietnamese speech transcription and action tracker drafting.'}
                  </div>
                </div>

                {/* 4 Steps timeline: Liquid glass icons design */}
                <div className="space-y-5.5 relative border-l-2 border-slate-200/40 pl-6 ml-3">
                  
                  {/* Step 1 */}
                  <div className="relative group">
                    <span className="absolute -left-[34px] top-0.5 flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-b from-sky-400 to-sky-500 text-white text-xs font-black shadow-lg shadow-sky-500/20 border border-white/30 transition-transform duration-300 group-hover:scale-110">1</span>
                    <h3 className="font-extrabold text-slate-800 text-xs sm:text-sm leading-tight mb-1 flex items-center gap-1.5 font-display">
                      {language === 'vi' ? 'Tải tệp cuộc họp lên hệ thống (Chọn một hoặc PHÂN NHIỀU FILE)' : 'Upload Media Content (Single or BATCH MULTI-SELECT)'}
                    </h3>
                    <p className="text-[11.5px] sm:text-xs text-slate-500 font-normal leading-relaxed">
                      {language === 'vi' 
                        ? 'Kéo thả trực tiếp hoặc click chọn tệp ghi âm, ghi hình họp (MP3, WAV, M4A, hoặc MP4 Video) lên tới 200MB. Hệ thống cho phép lựa chọn và tải lên CÙNG LÚC NHIỀU FILE âm thanh rời.' 
                        : 'Drag & drop or browse media elements (MP3, WAV, M4A, or MP4 video) under 200MB. You can select & upload MULTIPLE files together to kick-start simultaneous queues.'}
                    </p>
                  </div>

                  {/* Step 2 */}
                  <div className="relative group">
                    <span className="absolute -left-[34px] top-0.5 flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-b from-indigo-400 to-indigo-500 text-white text-xs font-black shadow-lg shadow-indigo-500/20 border border-white/30 transition-transform duration-300 group-hover:scale-110">2</span>
                    <h3 className="font-extrabold text-slate-800 text-xs sm:text-sm leading-tight mb-1 font-display">
                      {language === 'vi' ? 'Xử lý gỡ băng tự động từng mốc thời gian' : 'Automated Transcription Pipeline'}
                    </h3>
                    <p className="text-[11.5px] sm:text-xs text-slate-500 font-normal leading-relaxed">
                      {language === 'vi' 
                        ? 'Lựa chọn ngôn ngữ cuộc họp (Tiếng Việt/English) và nhấn "Bắt đầu Gỡ băng". AI tối tân sẽ tiến hành chuyển dịch giọng nói thành chữ thô và gán mốc giờ tương ứng của người phát ngôn.' 
                        : 'Choose target dialect & hit "Start Transcription". Advanced Gemini models parse vocals to editable strings mapped directly to playback seconds.'}
                    </p>
                  </div>

                  {/* Step 3 */}
                  <div className="relative group">
                    <span className="absolute -left-[34px] top-0.5 flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-b from-violet-400 to-violet-500 text-white text-xs font-black shadow-lg shadow-violet-500/20 border border-white/30 transition-transform duration-300 group-hover:scale-110">3</span>
                    <h3 className="font-extrabold text-slate-800 text-xs sm:text-sm leading-tight mb-1 font-display">
                      {language === 'vi' ? 'Hiệu chỉnh văn bản thô & Gắn bối cảnh gợi ý' : 'Corrections & Analysis Guidance hints'}
                    </h3>
                    <p className="text-[11.5px] sm:text-xs text-slate-500 font-normal leading-relaxed">
                      {language === 'vi' 
                        ? 'Tại bảng chỉnh sửa, bấm vào từ bị nhận sai để sửa tay, nghe lại đúng giây của câu nói bằng cách bấm vào mốc thời gian, sửa nhãn Người nói (Người phát biểu) và thêm "Gợi ý bối cảnh" để định dạng cấu trúc báo cáo mong muốn.' 
                        : 'Edit misheard cells manually, re-play sound sequences via Timestamp badges, rename default Speakers to actual names, and append structural guidelines in the Analysis Hint.'}
                    </p>
                  </div>

                  {/* Step 4 */}
                  <div className="relative group">
                    <span className="absolute -left-[34px] top-0.5 flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-500/20 border border-white/30 transition-transform duration-300 group-hover:scale-110">4</span>
                    <h3 className="font-extrabold text-slate-800 text-xs sm:text-sm leading-tight mb-1 font-display">
                      {language === 'vi' ? 'Biên soạn báo cáo bento & Gộp buổi họp (Merge)' : 'Generate Bento Reports & Consolidation'}
                    </h3>
                    <p className="text-[11.5px] sm:text-xs text-slate-500 font-normal leading-relaxed">
                      {language === 'vi' 
                        ? 'Bấm "Lưu và Phân tích" để AI chế tác văn bản thô thành 6 cấu phần biên lai. Hơn nữa, bạn có thể chọn nhiều báo cáo có sẵn trong Lịch sử và nhấp "Gộp báo cáo" để liên kết các biên bản rời thành một báo cáo tổng hợp duy nhất.' 
                        : 'Click "Save & Analyze" for full AI bento panels. Select various older logs in history and hit the "Merge Reports" control button to seamlessly compile a master project summary.'}
                    </p>
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'batch_merge' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-sky-500/5 via-indigo-500/5 to-transparent border border-sky-400/20 p-4 rounded-2xl flex items-start gap-3.5 hover:shadow-md transition-shadow">
                  {/* Frosted water droplet batch container icon */}
                  <div className="w-10 h-10 rounded-xl bg-sky-550/10 border border-sky-400/25 flex items-center justify-center text-sky-600 text-xl flex-shrink-0 shadow-inner">📦</div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-slate-800 text-xs sm:text-sm font-display">
                      {language === 'vi' ? '1. Đột phá Tải tệp Hàng loạt (Batch Process)' : '1. High-Performance Simultaneous Batch Upload'}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-normal leading-relaxed">
                      {language === 'vi'
                        ? 'Không cần phải chờ tệp này hoàn tất mới tải tệp khác lên! Bạn có thể chọn và kéo cùng lúc 2 - 5 tệp ghi âm cuộc họp khác nhau vào khung tải lên. Hệ thống sẽ tự động ghim hàng đợi thông minh, xử lý giải phóng tệp lần lượt. Mỗi cuộc thảo luận sẽ được thiết lập thành một biên bản thô độc lập.'
                        : 'Do not wait for single streams to complete before initiating others. Select and upload 2-5 files simultaneously. Our queue engine arranges, downloads and triggers individual speech transcribes safely in consecutive loops.'}
                    </p>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-indigo-500/5 via-violet-500/5 to-transparent border border-indigo-400/20 p-4 rounded-2xl flex items-start gap-3.5 hover:shadow-md transition-shadow">
                  {/* Frosted water droplet merger checkmark icon */}
                  <div className="w-10 h-10 rounded-xl bg-indigo-550/10 border border-indigo-400/25 flex items-center justify-center text-indigo-650 text-xl flex-shrink-0 shadow-inner">🔗</div>
                  <div className="space-y-1">
                    <h4 className="font-extrabold text-slate-800 text-xs sm:text-sm font-display">
                      {language === 'vi' ? '2. Gộp đa cuộc họp thành một Biên bản họp Tổng hợp (Merge / Meeting Memo)' : '2. Consolidate Multiple Gatherings into a Master Meeting Memo'}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-slate-505 font-normal leading-relaxed">
                      {language === 'vi'
                        ? 'Bạn có nhiều cuộc họp tiến độ hàng ngày (Daily Standup) hoặc các phần thảo luận chia nhỏ của một dự án? Hãy click chọn nhiều cuộc họp đại diện tương ứng tại cột "Lịch sử biên bản", sau đó nhấp vào nút "Gộp báo cáo 🔗". AI của hệ thống sẽ tiến hành tổng hợp chéo, gom phân chia tất cả ý kiến tranh biện, kết quả công việc và danh sách nhiệm vụ thành một bản Báo cáo Tổng thể (Meeting Memo Summary) dự án duy nhất.'
                        : 'Got multiple stand-ups to compile or sections split due to timing cuts? Click and tick multiple reports in the sidebar "History List", and activate the "Merge Reports 🔗" button. Gemini models automatically aggregate key objectives, decisions, and assignments across all inputs to spawn a beautiful master overview document.'}
                    </p>
                  </div>
                </div>

                {/* Direct Instruction step illustration cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="bg-white/45 backdrop-blur-md border border-slate-200/50 p-3.5 rounded-2xl">
                    <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 font-display mb-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                      <span>{language === 'vi' ? 'Cách chọn nhiều file tải lên' : 'How to batch upload'}</span>
                    </h5>
                    <ul className="space-y-1 text-[11px] text-slate-500 list-decimal list-inside pl-0.5">
                      <li>{language === 'vi' ? 'Tại bảng kéo thả, giữ nút Ctrl / Cmd' : 'Under the Drag box, hold Ctrl / Cmd key'}</li>
                      <li>{language === 'vi' ? 'Nhấp chọn cùng lúc các file âm thanh muốn họp' : 'Click to highlight and select various audio files'}</li>
                      <li>{language === 'vi' ? 'Nhấn Open để ném thẳng đồng thời vào hàng chờ' : 'Press Open to send them into simultaneous queues'}</li>
                    </ul>
                  </div>

                  <div className="bg-white/45 backdrop-blur-md border border-slate-200/50 p-3.5 rounded-2xl">
                    <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 font-display mb-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      <span>{language === 'vi' ? 'Cách gộp báo cáo từ lịch sử' : 'How to merge history logs'}</span>
                    </h5>
                    <ul className="space-y-1 text-[11px] text-slate-500 list-decimal list-inside pl-0.5">
                      <li>{language === 'vi' ? 'Tại cột Lịch sử, tích vào ô tròn ở chân thẻ ghi chép' : 'In the History Feed, check checkboxes at bottom card corners'}</li>
                      <li>{language === 'vi' ? 'Chọn tối thiểu 2 báo cáo muốn gộp' : 'Choose at least 2 target meeting entities'}</li>
                      <li>{language === 'vi' ? 'Nhấp nút "Gộp báo cáo" màu xanh dương nổi ở đỉnh' : 'Click the blue floating "Merge Reports" button'}</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'report' && (
              <div className="space-y-4">
                <h3 className="font-black font-display text-slate-800 text-sm sm:text-base flex items-center gap-2">
                  <div className="w-1.5 h-3.5 bg-sky-500 rounded-full" />
                  <span>{language === 'vi' ? 'Chi tiết 6 tab phân tích bento từ trí tuệ nhân tạo:' : 'Specification of the 6 AI-Report cards:'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {[
                    {
                      num: '01',
                      title_vi: 'Tổng quan cuộc họp',
                      title_en: 'General Objectives',
                      desc_vi: 'Nhận diện chủ thể bàn luận, mốc thời gian tổ chức, mục tiêu cốt lõi và liệt kê nhân vật trực tiếp tiếp nhận thông tin.',
                      desc_en: 'Synthesizes host times, general discussion headings, and participating attendees.',
                    },
                    {
                      num: '02',
                      title_vi: 'Tóm tắt thảo luận',
                      title_en: 'Discussion Recap',
                      desc_vi: 'Xâu chuỗi, phân loại hệ thống các luồng quan điểm, lý lẽ tranh biện nổi bật của tất cả đồng nghiệp.',
                      desc_en: 'Groups opinions, suggestions, and debating loops sequentially.',
                    },
                    {
                      num: '03',
                      title_vi: 'Nhiệm vụ cụ thể (Action Items)',
                      title_en: 'Action Assignment Grid',
                      desc_vi: 'Bảng phân giao nhân sự bám sát công việc: Nội dung công vụ cụ thể, Người gánh trách nhiệm, người phối hợp, và Hạn hoàn thành.',
                      desc_en: 'Provides detailed action lists itemized with specified assignees and timeline limits.',
                    },
                    {
                      num: '04',
                      title_vi: 'Quyết định then chốt',
                      title_en: 'Agreed Decisions',
                      desc_vi: 'Cô đọng, chọn lọc các quyết sách lớn nhỏ đã được các bên đồng thuận cao nhất để cả đội ngũ đồng lòng thực thi.',
                      desc_en: 'Crystallizes strategic agreements approved by members so that everyone aligns together.',
                    },
                    {
                      num: '05',
                      title_vi: 'Nội dung tồn đọng',
                      title_en: 'Deferred Obstacles',
                      desc_vi: 'Các băn khoăn, đề xuất chưa đúc rút được kết quả cuối cùng, dời lịch biểu phân tích ở cuộc họp kế tiếp.',
                      desc_en: 'Safekeeps pending questions, unsolved bugs, or issues slated for further discussions.',
                    },
                    {
                      num: '06',
                      title_vi: 'Ghi chú & Tài liệu',
                      title_en: 'Context & References',
                      desc_vi: 'Quy chuẩn hành pháp bên lề, các đường link tài liệu đính kèm, hoặc bối cảnh gián tiếp giúp mở rộng chiều sâu thông tin buổi họp.',
                      desc_en: 'Preserves supplementary guidelines, drive doc links, or optional contextual references.',
                    }
                  ].map((item, idx) => (
                    <div 
                      key={idx} 
                      className="relative bg-white/45 backdrop-blur-md border border-slate-205/60 p-4 rounded-2xl hover:border-sky-400/30 hover:bg-white/90 transition-all duration-300 shadow-sm overflow-hidden group"
                    >
                      <span className="absolute top-2 right-3 text-2xl font-black font-mono text-slate-100 group-hover:text-indigo-500/10 transition-colors">{item.num}</span>
                      <h4 className="font-extrabold text-slate-800 text-xs sm:text-sm mb-1 sm:mb-1.5 flex items-center gap-1.5 relative z-10 font-display">
                        <span className="w-1.5 h-1.5 bg-gradient-to-tr from-sky-400 to-indigo-650 rounded-full" />
                        <span>{language === 'vi' ? item.title_vi : item.title_en}</span>
                      </h4>
                      <p className="text-[11.5px] sm:text-xs text-slate-500 font-normal leading-relaxed relative z-10">
                        {language === 'vi' ? item.desc_vi : item.desc_en}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'tips' && (
              <div className="space-y-4">
                
                {/* Advanced Audio File Splitting / Compression Box - Frosted amber water styled card */}
                <div 
                  className="relative p-4.5 sm:p-5 rounded-2xl space-y-4 overflow-hidden border border-amber-300/40 bg-white/40"
                  style={{
                    boxShadow: 'inset 0 0 10px rgba(245, 158, 11, 0.05), 0 4px 20px rgba(15, 23, 42, 0.02)'
                  }}
                >
                  <div className="absolute top-[-40px] right-[-40px] w-24 h-24 bg-amber-200/20 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="flex items-start space-x-3.5">
                    <div className="text-2xl mt-0.5 select-none animate-bounce">✂️</div>
                    <div className="space-y-3.5 flex-1 min-w-0">
                      <div>
                        <h4 className="font-black text-xs sm:text-sm text-amber-900 font-display uppercase tracking-wide leading-none">
                          {language === 'vi' ? 'HƯỚNG DẪN CẮT & GIẢM NHẸ TỆP TIN QUÁ LỚN (> 200MB)' : 'COMPRESSION TIPS FOR OVERSIZED RECORDINGS (> 200MB)'}
                        </h4>
                        <p className="text-xs sm:text-[13px] text-amber-950 mt-2 leading-relaxed">
                          {language === 'vi' ? (
                            <>
                              Hạn mức dữ liệu tiếp nhận cho mỗi phiên tải lên tối đa là <strong>200MB</strong>. Đối với các buổi hội thảo/vạ đàm kéo dài vượt mức, vui lòng thực hiện giảm nhẹ tệp tin bằng các thủ thật vô cùng đơn giản sau:
                            </>
                          ) : (
                            <>
                              Individual upload allowances limits size up to <strong>200MB</strong>. For longer project workshops (or raw high-dynamic MP4 files), optimize data sizes via these easy steps:
                            </>
                          )}
                        </p>
                      </div>

                      {/* Side by side compression pathways */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className="bg-white/70 p-3 rounded-xl border border-amber-200/40 backdrop-blur-md">
                          <h5 className="font-extrabold text-amber-805 text-xs flex items-center gap-1.5 font-display">
                            <span className="bg-amber-100 text-amber-800 rounded-full w-4.5 h-4.5 font-bold flex items-center justify-center text-[10px]">1</span>
                            <span>{language === 'vi' ? 'Cách 1: Đổi định dạng tệp thô' : 'Option 1: Extract MP3 Audio'}</span>
                          </h5>
                          <p className="text-[11px] sm:text-xs text-slate-600 mt-1 leading-relaxed">
                            {language === 'vi' 
                              ? 'Nếu có tệp ghi hình Zoom nặng vài GB, đừng tải thẳng lên! Hãy dùng mọc công cụ Convert trực tuyến đổi sang audio âm thanh .mp3 hoặc .m4a (128kbps, Mono). Dung lượng sẽ co giảm tới 95% (từ 1.5GB xuống chỉ còn ~30MB).' 
                              : 'Do not upload gigabyte MP4 video files directly. Convert them to MP3 or M4A audio formats (128kbps, Mono) using online converters. This slashes size by 95% while keeping speech clarity crisp.'}
                          </p>
                        </div>

                        <div className="bg-white/70 p-3 rounded-xl border border-amber-200/40 backdrop-blur-md">
                          <h5 className="font-extrabold text-amber-805 text-xs flex items-center gap-1.5 font-display">
                            <span className="bg-amber-100 text-amber-800 rounded-full w-4.5 h-4.5 font-bold flex items-center justify-center text-[10px]">2</span>
                            <span>{language === 'vi' ? 'Cách 2: Chia tệp nhạc online miễn phí' : 'Option 2: Divide Lengthy Sections'}</span>
                          </h5>
                          <p className="text-[11px] sm:text-xs text-slate-600 mt-1 leading-relaxed">
                            {language === 'vi' ? (
                              <>
                                Sử dụng trang phát nhạc/cắt nhạc trực tuyến nổi tiếng miễn phí{' '}
                                <a 
                                  href="https://mp3cut.net/vi/" 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="font-black text-amber-700 underline hover:text-amber-500 transition-colors"
                                >
                                  https://mp3cut.net/vi/
                                </a>{' '}
                                để cắt nhỏ ghi âm họp thành các mẩu ngắn dưới 1 tiếng để đạt hiệu suất gỡ tiếng nhanh và hiệu quả nhất.
                              </>
                            ) : (
                              <>
                                Utilize free cloud tools like{' '}
                                <a 
                                  href="https://mp3cut.net" 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="font-black text-amber-700 underline hover:text-amber-500 transition-colors"
                                >
                                  https://mp3cut.net
                                </a>{' '}
                                to truncate files. Drag sliding pins to cut lengthy meetings into pieces under 1 hour each for lightning-fast transcription accuracy.
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

                {/* Sky Blue Volume Boosting Sound Enhancing Card */}
                <div 
                  className="relative p-4.5 sm:p-5 rounded-2xl space-y-4 overflow-hidden border border-sky-350/40 bg-white/40"
                  style={{
                    boxShadow: 'inset 0 0 10px rgba(14, 165, 233, 0.05), 0 4px 20px rgba(15, 23, 42, 0.02)'
                  }}
                >
                  <div className="absolute top-[-40px] right-[-40px] w-24 h-24 bg-sky-200/20 rounded-full blur-2xl pointer-events-none" />
                  
                  <div className="flex items-start space-x-3.5">
                    <div className="text-2xl mt-0.5 select-none animate-pulse">🔊</div>
                    <div className="space-y-3.5 flex-1 min-w-0">
                      <div>
                        <h4 className="font-black text-xs sm:text-sm text-sky-900 font-display uppercase tracking-wide leading-none">
                          {language === 'vi' ? 'BÍ QUYẾT TĂNG XOÁ RÈ & KÍCH LỚN ÂM LƯỢNG TIẾNG NÓI' : 'TIPS FOR NOISE SUPPRESSION & FAINT VOICE BOOSTING'}
                        </h4>
                        <p className="text-xs sm:text-[13px] text-sky-950 mt-2 leading-relaxed">
                          {language === 'vi' ? (
                            <>
                              Tạp âm rè, tiếng quạt quay xì xào hoặc giọng quá xa míc làm sút giảm độ thấu hiểu của AI. Hãy nâng cấp tệp qua quy trình thanh lọc cực nhạy sau:
                            </>
                          ) : (
                            <>
                              Faint voices, room echoes, or heavy wind hisses degrade automated speech engines. Standardize and improve audio outputs prior to upload via:
                            </>
                          )}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        <div className="bg-white/70 p-3 rounded-xl border border-sky-200/40 backdrop-blur-md">
                          <h5 className="font-extrabold text-sky-805 text-xs flex items-center gap-1.5 font-display">
                            <span className="bg-sky-100 text-sky-800 rounded-full w-4.5 h-4.5 font-bold flex items-center justify-center text-[10px]">🎙️</span>
                            <span>{language === 'vi' ? 'Adobe Podcast AI (Khuyên Dùng)' : 'Adobe Podcast AI Voice Enhancer'}</span>
                          </h5>
                          <p className="text-[11px] sm:text-xs text-slate-600 mt-1 leading-relaxed">
                            {language === 'vi' ? (
                              <>
                                Truy cập website lọc tiếng ồn số một của Adobe:{' '}
                                <a 
                                  href="https://enhance.podcast.adobe.com/" 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="font-black text-sky-700 underline hover:text-sky-500"
                                >
                                  enhance.podcast.adobe
                                </a>{' '}
                                và tải file âm thanh vào. AI sẽ lọc hết tiếng vang, tiếng xì điều hòa đưa giọng nói về chuẩn studio cao nhất.
                              </>
                            ) : (
                              <>
                                Drop noisy tracks at Adobe`s platform:{' '}
                                <a 
                                  href="https://enhance.podcast.adobe.com" 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="font-black text-sky-700 underline hover:text-sky-400"
                                >
                                  enhance.podcast.adobe
                                </a>{' '}
                                . The AI eliminates ambient hums, echoes or surrounding whispers to mimic pristine professional studio conditions.
                              </>
                            )}
                          </p>
                        </div>

                        <div className="bg-white/70 p-3 rounded-xl border border-sky-200/40 backdrop-blur-md">
                          <h5 className="font-extrabold text-sky-805 text-xs flex items-center gap-1.5 font-display">
                            <span className="bg-sky-100 text-sky-800 rounded-full w-4.5 h-4.5 font-bold flex items-center justify-center text-[10px]">📢</span>
                            <span>{language === 'vi' ? 'Khuếch đại biên độ âm' : 'Boost Sound Gain & Decibels'}</span>
                          </h5>
                          <p className="text-[11px] sm:text-xs text-slate-600 mt-1 leading-relaxed">
                            {language === 'vi' ? (
                              <>
                                Nếu tiếng gốc nhỏ, hãy dùng công vụ tăng loa trực tuyến miễn phí{' '}
                                <a 
                                  href="https://123apps.com/change-volume" 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="font-black text-sky-700 underline hover:text-sky-500"
                                >
                                  123apps Change Volume
                                </a>{' '}
                                để nhân to biên độ lên 1.5x - 2.0x để AI có thể bóc tách dễ chịu nhất.
                              </>
                            ) : (
                              <>
                                For quiet audios, increase gain by 1.5x to 2x at {' '}
                                <a 
                                  href="https://123apps.com/change-volume" 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="font-black text-sky-700 underline hover:text-sky-450"
                                >
                                  123apps Volume tool
                                </a>{' '}
                                to amplify speakers perfectly before starting process.
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>

          {/* Footer - Elegant unified glass footer */}
          <div className="border-t border-white/40 p-4 bg-slate-50/70 backdrop-blur-md flex justify-end">
            <button
              onClick={onClose}
              className="bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-extrabold font-display py-2.5 px-6 rounded-2xl text-xs sm:text-sm transition-all duration-300 active:scale-95 shadow-lg shadow-sky-500/15 hover:from-sky-600 hover:to-indigo-700 cursor-pointer"
            >
              {language === 'vi' ? 'Tôi Đã Hiểu (Đóng)' : 'I Understand (Close)'}
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
