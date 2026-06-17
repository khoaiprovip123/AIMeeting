import React, { useState, useEffect } from 'react';
import { getUserMeetings, removeMeeting, MeetingDocument } from '../services/firestoreService';
import { initAuth } from '../services/googleAuthService';
import { useTranslation } from '../i18n';
import type { User } from 'firebase/auth';
import { HelpTooltip } from './HelpTooltip';

interface MeetingHistoryProps {
  onSelectMeeting: (meeting: MeetingDocument) => void;
  selectedId?: string;
  refreshTrigger?: number;
  onMergeMeetings?: (meetings: MeetingDocument[], instruction: string) => Promise<void>;
}

const CATEGORIES_META: Record<string, {
  colorClass: string;
  activeClass: string;
  dotColor: string;
  labelEn: string;
  labelVi: string;
  emoji: string;
  bgHexLight: string;
}> = {
  project: {
    colorClass: 'bg-indigo-50/50 text-indigo-700 border-indigo-200/50 hover:bg-indigo-100/60',
    activeClass: 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-100',
    dotColor: 'bg-indigo-500',
    labelEn: 'Project',
    labelVi: 'Dự án',
    emoji: '📁',
    bgHexLight: 'bg-indigo-50 text-indigo-700 border-indigo-200/40 font-bold'
  },
  marketing: {
    colorClass: 'bg-rose-50/50 text-rose-700 border-rose-200/50 hover:bg-rose-100/60',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-100',
    dotColor: 'bg-rose-500',
    labelEn: 'Marketing',
    labelVi: 'Tiếp thị',
    emoji: '📢',
    bgHexLight: 'bg-rose-50 text-rose-700 border-rose-200/40 font-bold'
  },
  technical: {
    colorClass: 'bg-amber-50/50 text-amber-700 border-amber-200/50 hover:bg-amber-100/60',
    activeClass: 'bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-100',
    dotColor: 'bg-amber-500',
    labelEn: 'Technical',
    labelVi: 'Kỹ thuật',
    emoji: '⚙️',
    bgHexLight: 'bg-amber-50 text-amber-700 border-amber-200/40 font-bold'
  },
  hr: {
    colorClass: 'bg-teal-50/50 text-teal-700 border-teal-200/50 hover:bg-teal-100/60',
    activeClass: 'bg-teal-600 text-white border-teal-600 shadow-sm shadow-teal-100',
    dotColor: 'bg-teal-500',
    labelEn: 'HR',
    labelVi: 'Nhân sự',
    emoji: '👥',
    bgHexLight: 'bg-teal-50 text-teal-700 border-teal-200/40 font-bold'
  },
  finance: {
    colorClass: 'bg-emerald-50/50 text-emerald-700 border-emerald-200/50 hover:bg-emerald-100/60',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-100',
    dotColor: 'bg-emerald-500',
    labelEn: 'Finance',
    labelVi: 'Tài chính',
    emoji: '💵',
    bgHexLight: 'bg-emerald-50 text-emerald-700 border-emerald-200/40 font-bold'
  },
  operations: {
    colorClass: 'bg-purple-50/50 text-purple-700 border-purple-200/50 hover:bg-purple-100/60',
    activeClass: 'bg-purple-600 text-white border-purple-600 shadow-sm shadow-purple-100',
    dotColor: 'bg-purple-500',
    labelEn: 'Operations',
    labelVi: 'Vận hành',
    emoji: '🔄',
    bgHexLight: 'bg-purple-50 text-purple-700 border-purple-200/40 font-bold'
  },
  general: {
    colorClass: 'bg-slate-55/80 text-slate-600 border-slate-200/60 hover:bg-slate-100/70',
    activeClass: 'bg-slate-700 text-white border-slate-705 shadow-sm shadow-slate-200',
    dotColor: 'bg-slate-400',
    labelEn: 'General',
    labelVi: 'Chung',
    emoji: '💬',
    bgHexLight: 'bg-slate-100 text-slate-600 border-slate-200/50 font-bold'
  }
};

export const MeetingHistory: React.FC<MeetingHistoryProps> = ({ onSelectMeeting, selectedId, refreshTrigger = 0, onMergeMeetings }) => {
  const { t, language } = useTranslation();
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [meetings, setMeetings] = useState<MeetingDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('list');

  // Multi-Select synthesis merge states
  const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
  const [selectedMergeIds, setSelectedMergeIds] = useState<string[]>([]);
  const [mergeInstruction, setMergeInstruction] = useState<string>('');
  const [isMergingInProgress, setIsMergingInProgress] = useState<boolean>(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const vi = language === 'vi';

  const handleToggleMergeItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMergeIds(prev => 
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const handleStartMerge = async () => {
    if (selectedMergeIds.length < 2) return;
    const selectedList = meetings.filter(m => selectedMergeIds.includes(m.id));
    if (!onMergeMeetings) return;
    setIsMergingInProgress(true);
    setMergeError(null);
    try {
      await onMergeMeetings(selectedList, mergeInstruction);
      setIsMultiSelectMode(false);
      setSelectedMergeIds([]);
      setMergeInstruction('');
    } catch (err) {
      console.error(err);
      setMergeError(err instanceof Error ? err.message : 'Error merging reports');
    } finally {
      setIsMergingInProgress(false);
    }
  };

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {
      all: meetings.length,
      project: 0,
      marketing: 0,
      technical: 0,
      hr: 0,
      finance: 0,
      operations: 0,
      general: 0
    };
    meetings.forEach(m => {
      const cat = (m.result?.category || 'General').trim().toLowerCase();
      if (counts[cat] !== undefined) {
        counts[cat]++;
      } else {
        counts.general++;
      }
    });
    return counts;
  }, [meetings]);

  const getCategoryBadge = (category?: string) => {
    if (!category) return null;
    const cat = category.trim();
    const catLower = cat.toLowerCase();
    const meta = CATEGORIES_META[catLower] || CATEGORIES_META.general;
    
    return (
      <span className={`text-[9.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border font-mono flex items-center gap-1 shrink-0 ${meta.bgHexLight}`}>
        <span>{meta.emoji}</span>
        <span>{vi ? meta.labelVi : meta.labelEn}</span>
      </span>
    );
  };

  // Listen to auth to reload meetings
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
      },
      () => {
        setGoogleUser(null);
        setMeetings([]);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const loadMeetings = async () => {
    if (!googleUser) return;
    setLoading(true);
    try {
      const data = await getUserMeetings();
      setMeetings(data);
    } catch (err) {
      console.error("Failed to load meetings", err);
    } finally {
      setLoading(false);
    }
  };

  // Sync / load meetings when user or trigger changes
  useEffect(() => {
    if (googleUser) {
      loadMeetings();
    } else {
      setMeetings([]);
    }
  }, [googleUser, refreshTrigger]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeMeeting(id);
      setMeetings(prev => prev.filter(m => m.id !== id));
      setDeletingId(null);
    } catch (err) {
      console.error("Failed to delete meeting", err);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString(vi ? 'vi-VN' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  };

  const filteredMeetings = meetings.filter(meeting => {
    // 1. Filter by category pill selection first
    if (selectedCategoryFilter) {
      const cat = (meeting.result?.category || '').trim().toLowerCase();
      if (cat !== selectedCategoryFilter.toLowerCase()) {
        return false;
      }
    }

    // 2. Filter by search query
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    
    // Topic comparison
    const topic = (meeting.result?.overview?.topic || '').toLowerCase();
    const pendingText = (vi ? 'chờ phân tích ai (bản thô)' : 'pending ai analysis (raw)').toLowerCase();
    const topicMatch = topic ? topic.includes(query) : pendingText.includes(query);
    
    // Date comparison
    const dateFormatted = formatDate(meeting.createdAt).toLowerCase();
    const dateMatch = dateFormatted.includes(query);
    
    // File name comparison
    const fileName = (meeting.audioFileName || '').toLowerCase();
    const fileNameMatch = fileName.includes(query);

    // Category comparison
    const category = (meeting.result?.category || '').toLowerCase();
    const categoryMatch = category.includes(query);

    // Tags list comparison
    const tagsStr = (meeting.result?.tags || []).join(' ').toLowerCase();
    const tagsMatch = tagsStr.includes(query);
    
    return topicMatch || dateMatch || fileNameMatch || categoryMatch || tagsMatch;
  });

  const groupedByCategory = React.useMemo(() => {
    const groups: Record<string, MeetingDocument[]> = {
      Project: [],
      Marketing: [],
      Technical: [],
      HR: [],
      Finance: [],
      Operations: [],
      General: []
    };
    
    filteredMeetings.forEach(meeting => {
      const dbCat = (meeting.result?.category || 'General').trim();
      const matchedKey = Object.keys(groups).find(k => k.toLowerCase() === dbCat.toLowerCase()) || 'General';
      groups[matchedKey].push(meeting);
    });
    
    // Ensure chronological ordering within groups
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA; // descending
      });
    });
    
    return Object.entries(groups).filter(([_, items]) => items.length > 0);
  }, [filteredMeetings]);

  // Render state for guests
  if (!googleUser) {
    return (
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 p-6 rounded-3xl custom-shadow text-center">
        <div className="w-12 h-12 bg-sky-50 text-sky-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="font-extrabold text-slate-800 font-display mb-2">
          {vi ? 'Đồng bộ Lịch sử' : 'Sync History'}
        </h3>
        <p className="text-slate-400 text-xs font-semibold leading-relaxed mb-1">
          {vi 
            ? 'Đăng nhập bằng tài khoản Google để lưu trữ tự động và xem lại danh sách tất cả biên bản cuộc họp đã tạo mọi lúc!' 
            : 'Sign in with your Google account to automatically store and access all generated meeting details at any time!'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 p-6 rounded-3xl custom-shadow">
      <div className="flex items-center justify-between mb-5 pb-3.5 border-b border-slate-100 flex-wrap gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="text-sky-500 bg-sky-50 p-1.5 rounded-lg">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="flex items-center gap-1.5">
            <h3 className="font-extrabold text-slate-800 font-display hover:text-slate-900 leading-none">
              {vi ? 'Lịch sử Biên bản' : 'Meeting History'}
            </h3>
            <HelpTooltip content={t('tooltipHistory')} position="bottom-right" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {meetings.length > 1 && onMergeMeetings && (
            <button
              onClick={() => {
                setIsMultiSelectMode(prev => !prev);
                setSelectedMergeIds([]);
                setMergeError(null);
              }}
              className={`text-[10px] font-extrabold font-display py-1.5 px-3 rounded-xl border transition-all flex items-center gap-1 shadow-sm select-none
                ${isMultiSelectMode 
                  ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100' 
                  : 'bg-gradient-to-tr from-sky-50 to-indigo-50 hover:from-sky-500 hover:to-indigo-500 hover:text-white border-slate-200/60 text-sky-600'}`}
            >
              <span>{isMultiSelectMode ? (vi ? 'Dừng gộp' : 'Cancel') : (vi ? 'Gộp báo cáo 🔗' : 'Merge 🔗')}</span>
            </button>
          )}
          {meetings.length > 0 && (
            <span className="text-[10px] font-mono font-bold bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full shadow-sm">
              {meetings.length}
            </span>
          )}
        </div>
      </div>

      {loading && meetings.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <svg className="animate-spin h-6 w-6 text-sky-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-[11px] font-semibold text-slate-400">{vi ? 'Đang tải lịch sử...' : 'Loading history...'}</span>
        </div>
      ) : meetings.length === 0 ? (
        <div className="py-10 text-center text-slate-400">
          <svg className="w-10 h-10 mx-auto text-slate-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-xs font-semibold">{vi ? 'Chưa có cuộc họp nào.' : 'No saved meetings found.'}</p>
          <p className="text-[10px] mt-1 text-slate-400 max-w-[180px] mx-auto leading-relaxed">{vi ? 'Biên bản cục bộ sẽ được đồng bộ khi phân tích xong!' : 'New summaries will auto-sync upon successful analysis!'}</p>
        </div>
      ) : (
        <>
          {/* Search/filter input and View Mode Switch */}
          <div className="flex gap-2 mb-3.5 items-center">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchMeetingsPlaceholder')}
                className="w-full pl-9 pr-8 py-2 bg-slate-50/70 border border-slate-200/60 rounded-xl text-[11.5px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-sky-500 focus:bg-white focus:border-sky-500 transition-all placeholder:text-slate-400/80"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  title={vi ? 'Xóa tìm kiếm' : 'Clear search'}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* View Mode Toggle Selector */}
            <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/50 shrink-0 shadow-sm">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'list'
                    ? 'bg-white text-sky-600 shadow-sm font-black'
                    : 'text-slate-450 hover:text-slate-700'
                }`}
                title={vi ? 'Dạng danh sách' : 'List View'}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('grouped')}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === 'grouped'
                    ? 'bg-white text-sky-600 shadow-sm font-black'
                    : 'text-slate-450 hover:text-slate-705'
                }`}
                title={vi ? 'Nhóm theo thể loại' : 'Group by Category'}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
            </div>
          </div>

          {/* Category filter pills with Emojis & Counts */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-3 mb-2.5  no-scrollbar">
            <button
              onClick={() => setSelectedCategoryFilter(null)}
              className={`px-2.5 py-1 text-[9.5px] font-black uppercase tracking-wider rounded-lg border transition-all duration-250 shrink-0 flex items-center gap-1.5 ${
                selectedCategoryFilter === null
                  ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                  : 'bg-slate-50/70 text-slate-500 border-slate-200/60 hover:bg-slate-100/75'
              }`}
            >
              <span>⭐</span>
              <span>{vi ? 'Tất cả' : 'All'}</span>
              <span className={`text-[8.5px] font-mono font-bold px-1 rounded-md ${
                selectedCategoryFilter === null ? 'bg-slate-700 text-slate-100' : 'bg-slate-200/60 text-slate-600'
              }`}>
                {categoryCounts.all}
              </span>
            </button>
            {Object.entries(CATEGORIES_META).map(([key, meta]) => {
              const count = categoryCounts[key] || 0;
              const isSelected = selectedCategoryFilter?.toLowerCase() === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedCategoryFilter(meta.labelEn)}
                  className={`px-2.5 py-1 text-[9.5px] font-black uppercase tracking-wider rounded-lg border transition-all duration-250 shrink-0 flex items-center gap-1.5 ${
                    isSelected ? meta.activeClass : 'bg-slate-50/70 text-slate-500 border-slate-200/60 hover:bg-slate-100/75'
                  }`}
                >
                  <span>{meta.emoji}</span>
                  <span>{vi ? meta.labelVi : meta.labelEn}</span>
                  {count > 0 && (
                    <span className={`text-[8.5px] font-mono font-bold px-1.5 py-0.2 rounded-md ${
                      isSelected ? 'bg-black/20 text-white' : 'bg-slate-200/60 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {filteredMeetings.length === 0 ? (
            <div className="py-10 text-center text-slate-400 bg-slate-50/45 rounded-2xl border border-dashed border-slate-200/30">
              <svg className="w-8 h-8 mx-auto text-slate-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-[11px] font-semibold font-sans">{vi ? 'Không tìm thấy kết quả phù hợp' : 'No matching results'}</p>
            </div>
          ) : viewMode === 'grouped' ? (
            <div className="space-y-4.5 max-h-[480px] overflow-y-auto pr-1">
              {groupedByCategory.map(([catName, groupMeetings]) => {
                const meta = CATEGORIES_META[catName.toLowerCase()] || CATEGORIES_META.general;
                return (
                  <div key={catName} className="bg-slate-50/30 border border-slate-200/30 p-3 rounded-2xl">
                    <div className="flex items-center justify-between mb-2.5 px-1 pb-1 border-b border-dashed border-slate-200/50">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-base leading-none">{meta.emoji}</span>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700 font-mono">
                          {vi ? meta.labelVi : meta.labelEn}
                        </h4>
                      </div>
                      <span className={`text-[9.5px] font-mono font-black px-2 py-0.5 rounded-full border ${meta.bgHexLight}`}>
                        {groupMeetings.length}
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      {groupMeetings.map((meeting) => {
                        const isSelected = isMultiSelectMode 
                          ? selectedMergeIds.includes(meeting.id)
                          : selectedId === meeting.id;
                        const isDeleting = deletingId === meeting.id;
                        const isPendingAnalysis = !meeting.result;
                        const isDisabled = isMultiSelectMode && isPendingAnalysis;

                        return (
                          <div
                            key={meeting.id}
                            onClick={(e) => {
                              if (isDeleting) return;
                              if (isMultiSelectMode) {
                                if (isPendingAnalysis) return;
                                handleToggleMergeItem(meeting.id, e);
                              } else {
                                onSelectMeeting(meeting);
                              }
                            }}
                            className={`relative group p-3 rounded-xl border transition-all duration-300 cursor-pointer flex items-center space-x-3 select-none ${
                              isDisabled ? 'opacity-40 cursor-not-allowed' : ''
                            } ${
                              isSelected 
                                ? 'bg-sky-50/60 border-sky-300 shadow-sm ring-1 ring-sky-200/50' 
                                : 'bg-white hover:bg-slate-50 border-slate-100 hover:border-slate-300/50 hover:shadow-sm'
                            }`}
                          >
                            {isMultiSelectMode && (
                              <div className="flex-shrink-0">
                                {isPendingAnalysis ? (
                                  <div className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px]" title={vi ? 'Bản ghi thô chưa được phân tích' : 'Raw transcript not yet analyzed'}>
                                    🔒
                                  </div>
                                ) : (
                                  <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-all ${
                                    isSelected 
                                      ? 'bg-sky-600 border-sky-600 text-white shadow-sm' 
                                      : 'border-slate-300 hover:border-sky-450 bg-white'
                                  }`}>
                                    {isSelected && (
                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2.5">
                                <div className="flex flex-col min-w-0 pr-6">
                                  <span className="text-[11.5px] font-extrabold text-slate-800 tracking-tight font-display line-clamp-1 leading-snug group-hover:text-slate-900 transition-colors">
                                    {meeting.result?.overview?.topic || (vi ? 'Chờ phân tích AI (Bản thô)' : 'Pending AI Analysis (Raw)')}
                                  </span>
                                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <span className="text-[8.5px] font-semibold text-slate-400 flex items-center space-x-1 font-mono leading-none">
                                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span>{formatDate(meeting.createdAt)}</span>
                                    </span>
                                    {meeting.audioFileName && (
                                      <span className="text-[8.5px] truncate max-w-[100px] font-mono text-slate-400 underline decoration-slate-200/50 decoration-1">
                                        {meeting.audioFileName}
                                      </span>
                                    )}
                                    <span className="text-[7.5px] font-black uppercase tracking-wider px-1 py-0.2 rounded font-mono bg-sky-50/80 text-sky-600 border border-sky-100">
                                      {meeting.language === 'vi' ? 'VIE' : 'ENG'}
                                    </span>
                                    {meeting.result?.decisions?.length > 0 && (
                                      <span className="text-[7.5px] font-bold px-1 rounded font-mono bg-teal-50 text-teal-600 border border-teal-100/50">
                                        {meeting.result.decisions.length}D
                                      </span>
                                    )}
                                    {meeting.result?.actionItems?.length > 0 && (
                                      <span className="text-[7.5px] font-bold px-1 rounded font-mono bg-indigo-50 text-indigo-600 border border-indigo-100/50">
                                        {meeting.result.actionItems.length}T
                                      </span>
                                    )}
                                    {meeting.result?.tags && meeting.result.tags.map((tag, tIdx) => (
                                      <span key={tIdx} className="text-[7px] font-bold px-1 rounded font-sans bg-slate-100 text-slate-500 border border-slate-200/40">
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="absolute right-2 top-2.5 z-10">
                                  {!isMultiSelectMode && (
                                    isDeleting ? (
                                      <div className="flex items-center space-x-1 animate-fade-in bg-white border border-slate-200/70 p-1 rounded-lg shadow-md">
                                        <button
                                          onClick={(e) => handleDelete(meeting.id, e)}
                                          className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold px-1.5 py-0.5 rounded text-[8px] transition-all"
                                        >
                                          {vi ? 'Xóa' : 'Del'}
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold px-1 py-0.5 rounded text-[8px] transition-all"
                                        >
                                          {vi ? 'Hủy' : 'Esc'}
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setDeletingId(meeting.id); }}
                                        className="p-1 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200"
                                        title={vi ? 'Xóa biên bản này' : 'Delete this report'}
                                      >
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[480px] overflow-y-auto pr-1">
              {filteredMeetings.map((meeting) => {
                const isSelected = isMultiSelectMode
                  ? selectedMergeIds.includes(meeting.id)
                  : selectedId === meeting.id;
                const isDeleting = deletingId === meeting.id;
                const isPendingAnalysis = !meeting.result;
                const isDisabled = isMultiSelectMode && isPendingAnalysis;

                return (
                  <div
                    key={meeting.id}
                    onClick={(e) => {
                      if (isDeleting) return;
                      if (isMultiSelectMode) {
                        if (isPendingAnalysis) return;
                        handleToggleMergeItem(meeting.id, e);
                      } else {
                        onSelectMeeting(meeting);
                      }
                    }}
                    className={`relative group p-3.5 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center space-x-3 select-none ${
                      isDisabled ? 'opacity-40 cursor-not-allowed' : ''
                    } ${
                      isSelected 
                        ? 'bg-sky-50/60 border-sky-300 shadow-sm ring-1 ring-sky-200/50' 
                        : 'bg-slate-50/60 hover:bg-slate-50/90 border-slate-200/40 hover:border-slate-300/60 hover:shadow-sm'
                    }`}
                  >
                    {isMultiSelectMode && (
                      <div className="flex-shrink-0">
                        {isPendingAnalysis ? (
                          <div className="w-4 h-4 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[8px]" title={vi ? 'Bản ghi thô chưa được phân tích' : 'Raw transcript not yet analyzed'}>
                            🔒
                          </div>
                        ) : (
                          <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-all ${
                            isSelected 
                              ? 'bg-sky-600 border-sky-600 text-white shadow-sm' 
                              : 'border-slate-300 hover:border-sky-450 bg-white'
                          }`}>
                            {isSelected && (
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2.5">
                        <div className="flex flex-col min-w-0 pr-6">
                          <span className="text-xs font-black text-slate-800 tracking-tight font-display line-clamp-2 leading-snug group-hover:text-slate-900">
                            {meeting.result?.overview?.topic || (vi ? 'Chờ phân tích AI (Bản thô)' : 'Pending AI Analysis (Raw)')}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-400 mt-1.5 flex items-center space-x-1 font-mono leading-none">
                            <svg className="w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{formatDate(meeting.createdAt)}</span>
                          </span>
                          {meeting.audioFileName && (
                            <span className="text-[8.5px] truncate max-w-[150px] font-mono text-slate-400 mt-1 leading-none underline decoration-slate-200/55">
                              {meeting.audioFileName}
                            </span>
                          )}
                        </div>

                        <div className="absolute right-2 top-2 z-10 animate-fade-in">
                          {!isMultiSelectMode && (
                            isDeleting ? (
                              <div className="flex items-center space-x-1 animate-fade-in bg-white border border-slate-200/70 p-1.5 rounded-xl shadow-md">
                                <button
                                  onClick={(e) => handleDelete(meeting.id, e)}
                                  className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold px-2 py-1 rounded-lg text-[9px] transition-all"
                                >
                                  {vi ? 'Xóa' : 'Del'}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold px-1.5 py-1 rounded-lg text-[9px] transition-all"
                                >
                                  {vi ? 'Hủy' : 'Esc'}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletingId(meeting.id); }}
                                className="p-1.5 hover:bg-slate-200/80 text-slate-400 hover:text-rose-600 rounded-xl opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-200"
                                title={vi ? 'Xóa biên bản này' : 'Delete this report'}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center space-x-1.5 flex-wrap gap-y-1">
                        <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md font-mono bg-sky-50 text-sky-600 border border-sky-200/50">
                          {meeting.language === 'vi' ? 'VIE' : 'ENG'}
                        </span>
                        
                        {meeting.result?.category && getCategoryBadge(meeting.result.category)}
                        
                        {meeting.result?.tags && meeting.result.tags.map((tag, tIdx) => (
                          <span key={tIdx} className="text-[8px] font-black tracking-tight px-1.5 py-0.5 rounded-md font-sans bg-slate-50 text-slate-500 border border-slate-200/40">
                            #{tag}
                          </span>
                        ))}
                        
                        {isPendingAnalysis ? (
                          <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md font-mono bg-amber-50 text-amber-600 border border-amber-100/70 flex items-center gap-0.5">
                            <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                            <span>{vi ? 'Bản Thô (Chờ AI)' : 'Raw (Needs AI)'}</span>
                          </span>
                        ) : (
                          <>
                            <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md font-mono bg-emerald-50 text-emerald-600 border border-emerald-100/70">
                              {vi ? 'Đã Phân Tích' : 'Analyzed'}
                            </span>
                            {meeting.result?.decisions?.length > 0 && (
                              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md font-sans bg-teal-50 text-teal-600 border border-teal-100/60">
                                {meeting.result.decisions.length} {vi ? 'Quyết Định' : 'Decisions'}
                              </span>
                            )}
                            {meeting.result?.actionItems?.length > 0 && (
                              <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-md font-sans bg-indigo-50 text-indigo-600 border border-indigo-100/60">
                                {meeting.result.actionItems.length} {vi ? 'Nhiệm Vụ' : 'Tasks'}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating Merge Panel when isMultiSelectMode is active */}
          {isMultiSelectMode && (
            <div className="mt-5 p-4.5 bg-gradient-to-br from-slate-50 to-sky-50/30 border border-sky-200 rounded-2xl shadow-sm animate-fade-in relative z-20">
              <div className="flex items-center justify-between mb-3 border-b border-dashed border-slate-200 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700 font-mono">
                    {selectedMergeIds.length}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-700 font-mono">
                    {vi ? 'BIÊN BẢN ĐÃ CHỌN GỘP' : 'SELECTED TO MERGE'}
                  </span>
                </div>
                {selectedMergeIds.length > 0 && (
                  <button
                    onClick={() => setSelectedMergeIds([])}
                    className="text-[10px] text-slate-400 hover:text-slate-600 font-bold underline cursor-pointer"
                  >
                    {vi ? 'Bỏ chọn toàn bộ' : 'Clear all'}
                  </button>
                )}
              </div>

              {selectedMergeIds.length < 2 ? (
                <div className="p-3.5 bg-white/70 border border-slate-100 rounded-xl text-center text-[10px] text-slate-500 font-medium">
                  {vi ? '💡 Vui lòng tích chọn ít nhất 2 biên bản đã phân tích thành công để gộp!' : '💡 Please select at least 2 already analyzed meetings to merge!'}
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex flex-wrap gap-1 bg-white/60 p-2 rounded-xl border border-dashed border-slate-200">
                    {meetings
                      .filter(m => selectedMergeIds.includes(m.id))
                      .map(m => (
                        <span key={m.id} className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded text-[9.5px] font-semibold">
                          <span className="max-w-[120px] truncate">{m.result?.overview?.topic || 'Meeting'}</span>
                          <button
                            onClick={(e) => handleToggleMergeItem(m.id, e)}
                            className="hover:bg-sky-250 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center font-extrabold text-[8px] text-sky-600 transition-colors"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                  </div>

                  <div>
                    <label className="block text-[9.5px] font-black uppercase tracking-wider text-slate-600 mb-1.5 font-mono">
                      {vi ? 'Yêu cầu tùy chọn gửi AI (Ví dụ: Tập trung hành động...):' : 'ADDITIONAL PROMPT FOR AI MERGER (OPTIONAL):'}
                    </label>
                    <textarea
                      value={mergeInstruction}
                      onChange={(e) => setMergeInstruction(e.target.value)}
                      placeholder={vi ? 'Hãy gộp các hành động trùng lặp và phân nhóm theo mốc thời gian...' : 'e.g. Combine duplicate owner tasks, organize chronologically...'}
                      className="w-full text-xs font-medium p-3 text-slate-700 bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 rounded-xl max-h-[85px] leading-relaxed resize-none"
                    />
                  </div>

                  {mergeError && (
                    <div className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 p-2.5 rounded-xl animate-fade-in">
                      ⚠️ {mergeError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/50">
                    <button
                      type="button"
                      disabled={isMergingInProgress}
                      onClick={() => {
                        setIsMultiSelectMode(false);
                        setSelectedMergeIds([]);
                        setMergeInstruction('');
                        setMergeError(null);
                      }}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                    >
                      {vi ? 'Hủy bỏ' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      disabled={isMergingInProgress || selectedMergeIds.length < 2}
                      onClick={handleStartMerge}
                      className="h-8.5 px-4 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 text-white text-[10px] font-black uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer"
                    >
                      {isMergingInProgress ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24 animate-slow">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>{vi ? 'Đang tổng hợp gộp...' : 'Synthesizing...'}</span>
                        </>
                      ) : (
                        <>
                          <span>⚡ {vi ? 'Bắt đầu gộp báo cáo' : 'START MERGE REPORT'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
