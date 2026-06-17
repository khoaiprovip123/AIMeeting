
import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { AnalysisResult, TranscriptSegment } from '../types';
import { ClipboardIcon, CheckIcon, TagIcon, CalendarIcon, ClockIcon, MapPinIcon, UsersIcon, BookOpenIcon, TrashIcon, DownloadIcon, EmailIcon } from './Icons';
import { useTranslation } from '../i18n';
import { geminiService } from '../services/geminiService';
import { initAuth, googleSignIn, getAccessToken, createGmailDraft, uploadDocxToGoogleDrive, logout } from '../services/googleAuthService';
import type { User } from 'firebase/auth';
import { HelpTooltip } from './HelpTooltip';

import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, PageBreak, BorderStyle } from 'docx';
import saveAs from 'file-saver';
import * as XLSX from 'xlsx';


interface AnalysisViewProps {
  transcript: TranscriptSegment[];
  setTranscript: React.Dispatch<React.SetStateAction<TranscriptSegment[] | null>>;
  result: AnalysisResult | null;
  onAnalyze: () => Promise<void>;
  audioUrl: string | null;
  audioFile: File | null;
  analysisHint: string;
  setAnalysisHint: React.Dispatch<React.SetStateAction<string>>;
  isFocusMode?: boolean;
  setIsFocusMode?: (val: boolean) => void;
  onUpdateResult?: (updated: AnalysisResult) => void;
}

const timeStringToSeconds = (time: string): number => {
    if (!time || typeof time !== 'string') return 0;
    const timeParts = time.split(':');
    if (timeParts.length > 0 && timeParts.every(p => !isNaN(parseFloat(p)))) {
        return timeParts
            .map(p => parseFloat(p))
            .reverse()
            .reduce((acc, part, index) => acc + part * Math.pow(60, index), 0);
    }
    console.warn(`Could not parse time string: ${time}`);
    return 0; // Fallback
};

const secondsToTimestamp = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) {
        return "00:00:00";
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

const formatTimestamp = (time: string): string => {
    const segmentSeconds = timeStringToSeconds(time);
    return secondsToTimestamp(segmentSeconds);
};

interface AutoResizingTextareaProps {
  value: string;
  onChange: (value: string) => void;
  index: number;
  isActive: boolean;
}

const AutoResizingTextarea: React.FC<AutoResizingTextareaProps> = ({ value, onChange, index, isActive }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  useEffect(() => {
    adjustHeight();
    const handle = requestAnimationFrame(adjustHeight);
    return () => cancelAnimationFrame(handle);
  }, [isActive]);

  useEffect(() => {
    window.addEventListener('resize', adjustHeight);
    return () => window.removeEventListener('resize', adjustHeight);
  }, []);

  return (
    <textarea 
      ref={textareaRef}
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      onInput={adjustHeight}
      aria-label={`Transcript segment ${index + 1}`}
      className="w-full bg-transparent border-0 rounded-xl resize-none leading-relaxed focus:bg-white focus:ring-1 focus:ring-sky-500 focus:p-3 p-1 text-slate-750 hover:text-slate-900 text-sm font-sans transition-all duration-250 focus:shadow-sm"
      rows={1} 
    />
  );
};

const ReportSection: React.FC<{ title: string; children: React.ReactNode; icon?: React.ReactNode }> = ({ title, children, icon }) => {
    return (
        <section className="relative z-10 bg-white/55 backdrop-blur-xl rounded-[32px] border border-white/80 p-8 shadow-[inset_0_2px_4px_rgba(255,255,255,0.85),_0_12px_28px_rgba(31,38,135,0.035)] hover:shadow-[inset_0_2px_4px_rgba(255,255,255,0.85),_0_16px_36px_rgba(31,38,135,0.055)] transition-all duration-300">
            <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-white/40">
                {icon && <div className="text-indigo-600 bg-white/90 p-2.5 rounded-2xl flex-shrink-0 shadow-sm border border-white/50">{icon}</div>}
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-850 font-display tracking-tight">{title}</h3>
            </div>
            <div className="prose max-w-none text-slate-700 prose-p:my-1 prose-li:my-1 prose-ul:my-2 prose-table:my-2 font-sans text-sm leading-relaxed">{children}</div>
        </section>
    );
};

const SlackEmailExporter: React.FC<{ result: AnalysisResult; language: string }> = ({ result, language }) => {
    const vi = language === 'vi';
    const [copiedSlack, setCopiedSlack] = useState(false);
    const [copiedEmail, setCopiedEmail] = useState(false);
    
    const slackText = useMemo(() => {
        const topic = result.overview.topic || (vi ? '[Chưa xác định]' : '[Unspecified]');
        const dateTime = result.overview.dateTime || (vi ? '[Chưa xác định]' : '[Unspecified]');
        const location = result.overview.location || (vi ? '[Chưa xác định]' : '[Unspecified]');
        const attendees = (result.overview.attendees || []).join(', ') || (vi ? '[Trống]' : '[None]');
        const tags = (result.tags || []).map(t => `#${t}`).join(', ') || (vi ? '[Trống]' : '[None]');
        
        let out = '';
        if (vi) {
            out += `*📢 BIÊN BẢN HỢP: ${topic.toUpperCase()}*\n`;
            out += `_📅 Thời gian: ${dateTime}_\n`;
            out += `_📍 Địa điểm: ${location}_\n`;
            out += `_👥 Thành viên tham gia: ${attendees}_\n`;
            out += `_🏷️ Nhãn phân loại: ${tags}_\n\n`;
            
            out += `*🎯 CÁC QUYẾT ĐỊNH ĐÃ ĐƯA RA:*\n`;
            if (result.decisions && result.decisions.length > 0) {
                out += result.decisions.map((d, index) => `${index + 1}. *${d.decision}*`).join('\n') + '\n\n';
            } else {
                out += `_• Chưa có quyết định nào được đưa ra._\n\n`;
            }
            
            out += `*✅ CÁC VIỆC CẦN LÀM & NGƯỜI PHỤ TRÁCH:*\n`;
            if (result.actionItems && result.actionItems.length > 0) {
                out += result.actionItems.map((a, index) => {
                    const ownerText = a.owner ? `👤 *${a.owner}*` : '_Chưa phân công_';
                    const deadlineText = a.deadline ? ` 📅 Hạn: _${a.deadline}_` : '';
                    const notesText = a.notes ? ` (📝 Ghi chú: _${a.notes}_)` : '';
                    return `• *${a.task}*\n  └ Phụ trách: ${ownerText}${deadlineText}${notesText}`;
                }).join('\n') + '\n\n';
            } else {
                out += `_• Không có việc phân công cụ thể._\n\n`;
            }
            
            out += `*⚠️ VẤN ĐỀ CHƯA GIẢI QUYẾT:*\n`;
            if (result.pendingIssues && result.pendingIssues.length > 0) {
                out += result.pendingIssues.map((p, index) => `• *${p}*`).join('\n') + '\n\n';
            } else {
                out += `_• Tất cả vấn đề đã được giải quyết._\n\n`;
            }
            
            out += `*📌 MỤC CẦN FOLLOW-UP & GHI CHÚ BỔ SUNG:*\n`;
            if (result.notesAndReferences && result.notesAndReferences.length > 0) {
                out += result.notesAndReferences.map((n, index) => `• *${n}*`).join('\n') + '\n';
            } else {
                out += `_• Không có ghi chú nào khác._\n`;
            }
        } else {
            out += `*📢 MEETING MINUTES: ${topic.toUpperCase()}*\n`;
            out += `_📅 Date & Time: ${dateTime}_\n`;
            out += `_📍 Location: ${location}_\n`;
            out += `_👥 Attendees: ${attendees}_\n`;
            out += `_🏷️ Assigned Tags: ${tags}_\n\n`;
            
            out += `*🎯 DECISIONS FINALIZED:*\n`;
            if (result.decisions && result.decisions.length > 0) {
                out += result.decisions.map((d, index) => `${index + 1}. *${d.decision}*`).join('\n') + '\n\n';
            } else {
                out += `_• No decisions registered._\n\n`;
            }
            
            out += `*✅ ACTION ITEMS & ASSIGNEES:*\n`;
            if (result.actionItems && result.actionItems.length > 0) {
                out += result.actionItems.map((a, index) => {
                    const ownerText = a.owner ? `👤 *${a.owner}*` : '_Unassigned_';
                    const deadlineText = a.deadline ? ` 📅 Deadline: _${a.deadline}_` : '';
                    const notesText = a.notes ? ` (📝 Notes: _${a.notes}_)` : '';
                    return `• *${a.task}*\n  └ Assignee: ${ownerText}${deadlineText}${notesText}`;
                }).join('\n') + '\n\n';
            } else {
                out += `_• No action items registered._\n\n`;
            }
            
            out += `*⚠️ UNRESOLVED PENDING ISSUES:*\n`;
            if (result.pendingIssues && result.pendingIssues.length > 0) {
                out += result.pendingIssues.map((p, index) => `• *${p}*`).join('\n') + '\n\n';
            } else {
                out += `_• No unresolved issues listed._\n\n`;
            }
            
            out += `*📌 FOLLOW-UP ITEMS & ADDITIONAL NOTES:*\n`;
            if (result.notesAndReferences && result.notesAndReferences.length > 0) {
                out += result.notesAndReferences.map((n, index) => `• *${n}*`).join('\n') + '\n';
            } else {
                out += `_• No additional references listed._\n`;
            }
        }
        return out;
    }, [result, vi]);

    const emailText = useMemo(() => {
        const topic = result.overview.topic || (vi ? '[Chưa xác định]' : '[Unspecified]');
        const dateTime = result.overview.dateTime || (vi ? '[Chưa xác định]' : '[Unspecified]');
        const location = result.overview.location || (vi ? '[Chưa xác định]' : '[Unspecified]');
        const attendees = (result.overview.attendees || []).join(', ') || (vi ? '[Trống]' : '[None]');
        const tags = (result.tags || []).map(t => `#${t}`).join(', ') || (vi ? '[Trống]' : '[None]');
        
        let out = '';
        if (vi) {
            out += `📢 BIÊN BẢN HỢP: ${topic.toUpperCase()}\n`;
            out += `==================================================\n`;
            out += `📅 Thời gian: ${dateTime}\n`;
            out += `📍 Địa điểm: ${location}\n`;
            out += `👥 Thành viên tham gia: ${attendees}\n`;
            out += `🏷️ Nhãn phân loại: ${tags}\n\n`;
            
            out += `🎯 CÁC QUYẾT ĐỊNH ĐÃ ĐƯA RA:\n`;
            out += `--------------------------------------------------\n`;
            if (result.decisions && result.decisions.length > 0) {
                out += result.decisions.map((d, index) => `${index + 1}. ${d.decision}`).join('\n') + '\n\n';
            } else {
                out += `• Chưa có quyết định nào được đưa ra.\n\n`;
            }
            
            out += `✅ CÁC VIỆC CẦN LÀM & NGƯỜI PHỤ TRÁCH:\n`;
            out += `--------------------------------------------------\n`;
            if (result.actionItems && result.actionItems.length > 0) {
                out += result.actionItems.map((a, index) => {
                    const ownerText = a.owner ? `${a.owner}` : 'Chưa phân công';
                    const deadlineText = a.deadline ? ` (Hạn chót: ${a.deadline})` : '';
                    const notesText = a.notes ? ` [Ghi chú: ${a.notes}]` : '';
                    return `• Nhiệm vụ: ${a.task}\n  └ Người phụ trách: ${ownerText}${deadlineText}${notesText}`;
                }).join('\n') + '\n\n';
            } else {
                out += `• Không có việc phân công cụ thể.\n\n`;
            }
            
            out += `⚠️ VẤN ĐỀ CHƯA GIẢI QUYẾT:\n`;
            out += `--------------------------------------------------\n`;
            if (result.pendingIssues && result.pendingIssues.length > 0) {
                out += result.pendingIssues.map((p, index) => `• ${p}`).join('\n') + '\n\n';
            } else {
                out += `• Tất cả vấn đề đã được giải quyết.\n\n`;
            }
            
            out += `📌 MỤC CẦN FOLLOW-UP & GHI CHÚ BỔ SUNG:\n`;
            out += `--------------------------------------------------\n`;
            if (result.notesAndReferences && result.notesAndReferences.length > 0) {
                out += result.notesAndReferences.map((n, index) => `• ${n}`).join('\n') + '\n';
            } else {
                out += `• Không có ghi chú nào khác.\n`;
            }
        } else {
            out += `📢 MEETING SUMMARY: ${topic.toUpperCase()}\n`;
            out += `==================================================\n`;
            out += `📅 Date & Time: ${dateTime}\n`;
            out += `📍 Location: ${location}\n`;
            out += `👥 Attendees: ${attendees}\n`;
            out += `🏷️ Assigned Tags: ${tags}\n\n`;
            
            out += `🎯 DECISIONS FINALIZED:\n`;
            out += `--------------------------------------------------\n`;
            if (result.decisions && result.decisions.length > 0) {
                out += result.decisions.map((d, index) => `${index + 1}. ${d.decision}`).join('\n') + '\n\n';
            } else {
                out += `• No decisions registered.\n\n`;
            }
            
            out += `✅ ACTION ITEMS & ASSIGNEES:\n`;
            out += `--------------------------------------------------\n`;
            if (result.actionItems && result.actionItems.length > 0) {
                out += result.actionItems.map((a, index) => {
                    const ownerText = a.owner ? `${a.owner}` : 'Unassigned';
                    const deadlineText = a.deadline ? ` (Deadline: ${a.deadline})` : '';
                    const notesText = a.notes ? ` [Notes: ${a.notes}]` : '';
                    return `• Task: ${a.task}\n  └ Assignee: ${ownerText}${deadlineText}${notesText}`;
                }).join('\n') + '\n\n';
            } else {
                out += `• No action items registered.\n\n`;
            }
            
            out += `⚠️ UNRESOLVED PENDING ISSUES:\n`;
            out += `--------------------------------------------------\n`;
            if (result.pendingIssues && result.pendingIssues.length > 0) {
                out += result.pendingIssues.map((p, index) => `• ${p}`).join('\n') + '\n\n';
            } else {
                out += `• No unresolved issues listed.\n\n`;
            }
            
            out += `📌 FOLLOW-UP ITEMS & ADDITIONAL NOTES:\n`;
            out += `--------------------------------------------------\n`;
            if (result.notesAndReferences && result.notesAndReferences.length > 0) {
                out += result.notesAndReferences.map((n, index) => `• ${n}`).join('\n') + '\n';
            } else {
                out += `• No additional notes or references.\n`;
            }
        }
        return out;
    }, [result, vi]);

    const copyToClipboard = (text: string, type: 'slack' | 'email') => {
        navigator.clipboard.writeText(text);
        if (type === 'slack') {
            setCopiedSlack(true);
            setTimeout(() => setCopiedSlack(false), 2000);
        } else {
            setCopiedEmail(true);
            setTimeout(() => setCopiedEmail(false), 2000);
        }
    };

    return (
        <section className="bg-white/80 backdrop-blur-md rounded-3xl border border-slate-200/50 p-6 md:p-8 custom-shadow hover:shadow-lg transition-all duration-300">
            <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-100">
                <div className="text-indigo-500 bg-indigo-50 p-2.5 rounded-xl flex-shrink-0 animate-pulse">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-lg font-extrabold text-slate-800 font-display tracking-tight">
                        {vi ? 'Hệ Thống Sao Chép Nhanh' : 'Quick Copy System'}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                        {vi 
                            ? 'Sao chép định dạng tối ưu hóa để paste trực tiếp vào Slack hoặc soạn thảo email nhanh gọn.' 
                            : 'Copy formats optimized to paste directly into Slack or compose emails seamlessly.'}
                    </p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Slack Formatter Column */}
                <div className="flex flex-col bg-slate-50 border border-slate-200/50 rounded-2xl p-4.5">
                    <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center space-x-2">
                            <span className="text-lg">💬</span>
                            <span className="font-extrabold text-slate-705 font-display text-[12.5px] tracking-wide uppercase">
                                {vi ? 'Định dạng Slack (Markdown)' : 'Slack Format (Markdown)'}
                            </span>
                        </div>
                        <button
                            onClick={() => copyToClipboard(slackText, 'slack')}
                            className={`flex items-center space-x-1.5 py-1.5 px-3.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-97 cursor-pointer border ${
                                copiedSlack 
                                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                                    : 'bg-indigo-600 hover:bg-indigo-505 border-indigo-600 text-white'
                            }`}
                        >
                            {copiedSlack ? (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>{vi ? 'Đã copy!' : 'Copied!'}</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <span>{vi ? 'Sao chép nhanh' : 'Copy Slack'}</span>
                                </>
                            )}
                        </button>
                    </div>
                    <pre className="flex-1 w-full p-4 bg-slate-900 border border-slate-950 text-slate-300 font-mono text-[11px] leading-relaxed rounded-xl overflow-auto select-all max-h-[380px] text-left">
                        {slackText}
                    </pre>
                </div>

                {/* Email Formatter Column */}
                <div className="flex flex-col bg-slate-50 border border-slate-200/50 rounded-2xl p-4.5">
                    <div className="flex items-center justify-between mb-3.5">
                        <div className="flex items-center space-x-2">
                            <span className="text-lg">✉️</span>
                            <span className="font-extrabold text-slate-705 font-display text-[12.5px] tracking-wide uppercase">
                                {vi ? 'Định dạng Email (Văn bản sạch)' : 'Email Format (Plain Text)'}
                            </span>
                        </div>
                        <button
                            onClick={() => copyToClipboard(emailText, 'email')}
                            className={`flex items-center space-x-1.5 py-1.5 px-3.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-97 cursor-pointer border ${
                                copiedEmail 
                                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                                    : 'bg-indigo-600 hover:bg-indigo-505 border-indigo-600 text-white'
                            }`}
                        >
                            {copiedEmail ? (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span>{vi ? 'Đã copy!' : 'Copied!'}</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    <span>{vi ? 'Sao chép nhanh' : 'Copy Email'}</span>
                                </>
                            )}
                        </button>
                    </div>
                    <pre className="flex-1 w-full p-4 bg-slate-900 border border-slate-950 text-slate-300 font-mono text-[11px] leading-relaxed rounded-xl overflow-auto select-all max-h-[380px] text-left">
                        {emailText}
                    </pre>
                </div>
            </div>
        </section>
    );
};

const ReportTabsView: React.FC<{ result: AnalysisResult; onUpdateResult?: (updated: AnalysisResult) => void }> = ({ result, onUpdateResult }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const { t, language } = useTranslation();
    const [completedTasks, setCompletedTasks] = useState<Record<number, boolean>>({});
    const [copiedDecisionIndex, setCopiedDecisionIndex] = useState<number | null>(null);

    const [isEditingOverview, setIsEditingOverview] = useState(false);
    const [editedTopic, setEditedTopic] = useState('');
    const [editedDateTime, setEditedDateTime] = useState('');
    const [editedLocation, setEditedLocation] = useState('');
    const [editedAttendees, setEditedAttendees] = useState('');

    useEffect(() => {
        if (result) {
            setEditedTopic(result.overview.topic || '');
            setEditedDateTime(result.overview.dateTime || '');
            setEditedLocation(result.overview.location || '');
            setEditedAttendees((result.overview.attendees || []).join(', '));
        }
    }, [result]);

    const handleSaveOverview = () => {
        if (onUpdateResult) {
            const list = editedAttendees
                .split(',')
                .map(item => item.trim())
                .filter(item => item.length > 0);
            
            onUpdateResult({
                ...result,
                overview: {
                    ...result.overview,
                    topic: editedTopic,
                    dateTime: editedDateTime,
                    location: editedLocation,
                    attendees: list
                }
            });
        }
        setIsEditingOverview(false);
    };

    const handleCopyDecision = (text: string, idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedDecisionIndex(idx);
        setTimeout(() => setCopiedDecisionIndex(null), 2000);
    };

    const getTabTheme = (id: string, isActive: boolean) => {
        const themes: Record<string, { active: string, inactive: string }> = {
            overview: {
                active: 'bg-gradient-to-r from-sky-100/70 via-sky-50/60 to-white/70 text-sky-700 border-t border-white border border-sky-200/50 shadow-[0_8px_24px_-4px_rgba(14,165,233,0.12),_inset_0_2px_4px_rgba(255,255,255,0.95)] font-extrabold scale-[1.03] rounded-full',
                inactive: 'text-slate-600 hover:text-sky-600 hover:bg-white/50 border border-transparent rounded-full font-bold'
            },
            summary: {
                active: 'bg-gradient-to-r from-indigo-100/70 via-indigo-50/60 to-white/70 text-indigo-700 border-t border-white border border-indigo-200/50 shadow-[0_8px_24px_-4px_rgba(99,102,241,0.12),_inset_0_2px_4px_rgba(255,255,255,0.95)] font-extrabold scale-[1.03] rounded-full',
                inactive: 'text-slate-600 hover:text-indigo-600 hover:bg-white/50 border border-transparent rounded-full font-bold'
            },
            decisions: {
                active: 'bg-gradient-to-r from-emerald-100/70 via-emerald-50/60 to-white/70 text-emerald-700 border-t border-white border border-emerald-200/50 shadow-[0_8px_24px_-4px_rgba(16,185,129,0.12),_inset_0_2px_4px_rgba(255,255,255,0.95)] font-extrabold scale-[1.03] rounded-full',
                inactive: 'text-slate-600 hover:text-emerald-700 hover:bg-white/50 border border-transparent rounded-full font-bold'
            },
            actionItems: {
                active: 'bg-gradient-to-r from-violet-100/70 via-violet-50/60 to-white/70 text-violet-700 border-t border-white border border-violet-200/50 shadow-[0_8px_24px_-4px_rgba(139,92,246,0.12),_inset_0_2px_4px_rgba(255,255,255,0.95)] font-extrabold scale-[1.03] rounded-full',
                inactive: 'text-slate-600 hover:text-violet-700 hover:bg-white/50 border border-transparent rounded-full font-bold'
            },
            pendingIssues: {
                active: 'bg-gradient-to-r from-amber-100/70 via-amber-50/60 to-white/70 text-amber-700 border-t border-white border border-amber-200/50 shadow-[0_8px_24px_-4px_rgba(245,158,11,0.12),_inset_0_2px_4px_rgba(255,255,255,0.95)] font-extrabold scale-[1.03] rounded-full',
                inactive: 'text-slate-600 hover:text-amber-700 hover:bg-white/50 border border-transparent rounded-full font-bold'
            },
            notesAndReferences: {
                active: 'bg-gradient-to-r from-slate-200/70 via-slate-100/60 to-white/70 text-slate-800 border-t border-white border border-slate-300/50 shadow-[0_8px_24px_-4px_rgba(100,116,139,0.12),_inset_0_2px_4px_rgba(255,255,255,0.95)] font-extrabold scale-[1.03] rounded-full',
                inactive: 'text-slate-600 hover:text-slate-800 hover:bg-slate-100/50 border border-transparent rounded-full font-bold'
            },
            slackEmail: {
                active: 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-[0_8px_24px_-4px_rgba(99,102,241,0.25),_inset_0_2px_4px_rgba(255,255,255,0.3)] border border-indigo-700 font-extrabold scale-[1.03] rounded-full',
                inactive: 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-transparent rounded-full font-bold'
            }
        };
        const theme = themes[id] || {
            active: 'bg-white text-slate-900 border border-slate-200/50 shadow-sm scale-[1.02] rounded-full',
            inactive: 'text-slate-500 hover:text-slate-905 hover:bg-white/60 border border-transparent rounded-full'
        };
        return isActive ? theme.active : theme.inactive;
    };

    const renderMarkdown = (text: string) => {
        if (!text || typeof text !== 'string') {
            return <p className="text-slate-400 font-medium italic">{t('noContent')}</p>;
        }

        // Clean up escaped string newlines that are commonly returned by double parsing or raw API formats
        let cleanedText = text
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\r/g, '');

        const lines = cleanedText.split('\n').filter(p => p.trim() !== '');
        const elements: React.ReactNode[] = [];
        let currentListItems: React.ReactNode[] = [];

        const formatInlineStyles = (txt: string) => {
            const parts = txt.split(/(\*\*.*?\*\*)/g);
            return parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} className="font-extrabold text-slate-900 font-sans">{part.slice(2, -2)}</strong>;
                }
                return part;
            });
        };

        const flushList = () => {
            if (currentListItems.length > 0) {
                elements.push(
                    <ul key={`ul-${elements.length}`} className="list-none space-y-3.5 my-4 pl-1 text-slate-650 sm:text-base text-sm">
                        {currentListItems}
                    </ul>
                );
                currentListItems = [];
            }
        };

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('## ') || trimmedLine.startsWith('### ')) {
                flushList();
                const titleText = trimmedLine.replace(/^#+\s+/, '');
                elements.push(
                    <h4 key={index} className="text-lg sm:text-xl font-extrabold text-slate-800 font-display mt-6 mb-3 tracking-tight leading-snug">
                        {formatInlineStyles(titleText)}
                    </h4>
                );
            } else if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
                const itemText = trimmedLine.substring(2);
                currentListItems.push(
                    <li key={index} className="flex items-start gap-2.5 text-slate-655 leading-relaxed">
                        <span className="w-1.5 h-1.5 mt-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/20 flex-shrink-0" />
                        <span className="font-sans text-slate-700 sm:text-[14.5px] text-sm leading-relaxed">{formatInlineStyles(itemText)}</span>
                    </li>
                );
            } else {
                flushList();
                elements.push(
                    <p key={index} className="leading-relaxed hover:text-slate-950 transition-colors my-3 text-slate-700 font-sans sm:text-[14.5px] text-sm">
                        {formatInlineStyles(trimmedLine)}
                    </p>
                );
            }
        });
        flushList();
        return elements.length > 0 ? <div className="space-y-1">{elements}</div> : <p className="text-slate-400 font-medium italic">{t('noContentToShow')}</p>;
    };

    const tabs = useMemo(() => [
        {
            id: 'overview',
            label: t('tabOverview'),
            icon: (
                <svg className="w-4 h-4 mr-1 text-sky-500 transition-colors group-hover:text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" className="stroke-sky-200" fill="currentColor" fillOpacity="0.1" />
                    <circle cx="12" cy="12" r="3" className="stroke-sky-600 fill-sky-200" />
                    <line x1="12" y1="2" x2="12" y2="4" className="stroke-sky-600" />
                    <line x1="12" y1="20" x2="12" y2="22" className="stroke-sky-600" />
                    <line x1="2" y1="12" x2="4" y2="12" className="stroke-sky-600" />
                    <line x1="20" y1="12" x2="22" y2="12" className="stroke-sky-600" />
                </svg>
            ),
            hasData: true,
            content: (
                 <ReportSection 
                    title={t('overviewSectionTitle')}
                    icon={
                        <svg className="w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" >
                            <circle cx="12" cy="12" r="10" className="stroke-sky-200 fill-sky-50" />
                            <circle cx="12" cy="12" r="4" className="stroke-sky-600 fill-sky-200" />
                            <line x1="12" y1="2" x2="12" y2="22" className="stroke-sky-600" />
                            <line x1="2" y1="12" x2="22" y2="12" className="stroke-sky-600" />
                        </svg>
                    }
                 >
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <p className="font-extrabold text-slate-900 font-display tracking-tight text-base">{t('overviewInfoTitle')}</p>
                            {!isEditingOverview ? (
                                <button 
                                    onClick={() => {
                                        setEditedTopic(result.overview.topic || '');
                                        setEditedDateTime(result.overview.dateTime || '');
                                        setEditedLocation(result.overview.location || '');
                                        setEditedAttendees((result.overview.attendees || []).join(', '));
                                        setIsEditingOverview(true);
                                    }}
                                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-sky-600 bg-sky-50 hover:bg-sky-100/80 hover:text-sky-700 transition duration-200 border border-sky-100 shadow-[0_2px_4px_rgba(14,165,233,0.05)] active:scale-95"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    <span>{language === 'vi' ? 'Chỉnh sửa' : 'Edit'}</span>
                                </button>
                            ) : (
                                <div className="flex items-center space-x-2">
                                    <button 
                                        onClick={() => setIsEditingOverview(false)}
                                        className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition duration-200 active:scale-95"
                                    >
                                        {language === 'vi' ? 'Hủy' : 'Cancel'}
                                    </button>
                                    <button 
                                        onClick={handleSaveOverview}
                                        className="px-3.5 py-1.5 rounded-full text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 shadow-[0_2px_4px_rgba(14,165,233,0.15)] transition duration-200 active:scale-95"
                                    >
                                        {language === 'vi' ? 'Lưu' : 'Save'}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-5">
                            <div className="p-5 bg-white border border-slate-200/50 rounded-2xl custom-shadow hover:bg-slate-50/50 hover:border-sky-300/40 transition-all duration-200 flex items-start gap-4">
                                <div className="text-sky-500 bg-sky-50 p-2.5 rounded-xl flex-shrink-0">
                                    <BookOpenIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-xs font-mono font-black text-sky-600 uppercase tracking-widest block mb-1 leading-none">{t('topic')}</span>
                                    {isEditingOverview ? (
                                        <textarea
                                            value={editedTopic}
                                            onChange={(e) => setEditedTopic(e.target.value)}
                                            className="w-full mt-1.5 p-2 text-sm border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-slate-50/50 focus:bg-white resize-none"
                                            rows={2}
                                            aria-label="Topic"
                                        />
                                    ) : (
                                        <span className="text-slate-800 font-extrabold text-sm leading-relaxed block">{result.overview.topic}</span>
                                    )}
                                </div>
                            </div>
                            <div className="p-5 bg-white border border-slate-200/50 rounded-2xl custom-shadow hover:bg-slate-50/50 hover:border-indigo-300/40 transition-all duration-200 flex items-start gap-4">
                                <div className="text-indigo-500 bg-indigo-50 p-2.5 rounded-xl flex-shrink-0">
                                    <CalendarIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-xs font-mono font-black text-indigo-600 uppercase tracking-widest block mb-1 leading-none">{t('dateTime')}</span>
                                    {isEditingOverview ? (
                                        <input
                                            type="text"
                                            value={editedDateTime}
                                            onChange={(e) => setEditedDateTime(e.target.value)}
                                            className="w-full mt-1.5 p-2 text-sm border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50/50 focus:bg-white"
                                            aria-label="Date & Time"
                                        />
                                    ) : (
                                        <span className="text-slate-800 font-extrabold text-sm leading-relaxed block">{result.overview.dateTime}</span>
                                    )}
                                </div>
                            </div>
                            <div className="p-5 bg-white border border-slate-200/50 rounded-2xl custom-shadow hover:bg-slate-50/50 hover:border-emerald-300/40 transition-all duration-200 flex items-start gap-4">
                                <div className="text-emerald-500 bg-emerald-50 p-2.5 rounded-xl flex-shrink-0">
                                    <MapPinIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-xs font-mono font-black text-emerald-600 uppercase tracking-widest block mb-1 leading-none">{t('location')}</span>
                                    {isEditingOverview ? (
                                        <input
                                            type="text"
                                            value={editedLocation}
                                            onChange={(e) => setEditedLocation(e.target.value)}
                                            className="w-full mt-1.5 p-2 text-sm border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-slate-50/50 focus:bg-white"
                                            aria-label="Location"
                                        />
                                    ) : (
                                        <span className="text-slate-800 font-extrabold text-sm leading-relaxed block">{result.overview.location}</span>
                                    )}
                                </div>
                            </div>
                            <div className="p-5 bg-white border border-slate-200/50 rounded-2xl custom-shadow hover:bg-slate-50/50 hover:border-purple-300/40 transition-all duration-200 flex items-start gap-4">
                                <div className="text-purple-500 bg-purple-50 p-2.5 rounded-xl flex-shrink-0">
                                    <UsersIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <span className="text-xs font-mono font-black text-purple-600 uppercase tracking-widest block mb-1 leading-none">{t('attendees')}</span>
                                    {isEditingOverview ? (
                                        <textarea
                                            value={editedAttendees}
                                            onChange={(e) => setEditedAttendees(e.target.value)}
                                            placeholder={language === 'vi' ? 'Cách nhau bởi dấu phẩy (vd: Nguyễn Văn A, Trần Thị B...)' : 'Separated by commas (e.g., Alice, Bob...)'}
                                            className="w-full mt-1.5 p-2 text-sm border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500 bg-slate-50/50 focus:bg-white resize-none animate-fade-in"
                                            rows={2}
                                            aria-label="Attendees"
                                        />
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {result.overview.attendees.map((person, i) => (
                                                <span key={i} className="inline-flex items-center text-xs font-bold font-display bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg border border-purple-100/60">{person}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {result.mainObjectives.length > 0 && (
                            <div className="mt-8 border-t border-slate-250/50 pt-6">
                                <p className="font-extrabold text-slate-900 font-display tracking-tight text-base mb-4">{t('mainObjectivesTitle')}</p>
                                <div className="space-y-2.5">
                                    {result.mainObjectives.map((item, index) => (
                                        <div key={index} className="flex items-start space-x-3.5 p-4.5 bg-indigo-50/30 border border-indigo-100/30 rounded-2xl hover:bg-indigo-50/50 transition-colors">
                                            <div className="bg-indigo-100 text-indigo-700 p-2 rounded-xl flex-shrink-0 mt-0.5">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <span className="text-slate-700 text-sm font-medium leading-relaxed">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                 </ReportSection>
            )
        },
        {
            id: 'summary',
            label: t('tabSummary'),
            icon: (
                <svg className="w-4 h-4 mr-1 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" className="stroke-indigo-300" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" className="stroke-indigo-600 fill-indigo-50" />
                </svg>
            ),
            hasData: !!result.discussionSummary,
            content: (
                <ReportSection 
                    title={t('summarySectionTitle')}
                    icon={
                        <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" className="stroke-indigo-300" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" className="stroke-indigo-600 fill-indigo-50" />
                        </svg>
                    }
                >
                    <div className="space-y-2 text-slate-850">
                        {renderMarkdown(result.discussionSummary)}
                    </div>
                </ReportSection>
            )
        },
        {
            id: 'decisions',
            label: t('tabDecisions'),
            icon: (
                <svg className="w-4 h-4 mr-1 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" className="stroke-emerald-600 fill-emerald-50" />
                    <path d="M2 17l10 5 10-5" className="stroke-emerald-400" />
                    <path d="M2 12l10 5 10-5" className="stroke-emerald-500" />
                </svg>
            ),
            hasData: result.decisions.length > 0,
            content: (
                <ReportSection 
                    title={t('decisionsSectionTitle')}
                    icon={
                        <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" className="stroke-emerald-600 fill-emerald-50" />
                            <path d="M2 17l10 5 10-5" className="stroke-emerald-400" />
                            <path d="M2 12l10 5 10-5" className="stroke-emerald-500" />
                        </svg>
                    }
                >
                    <div className="grid gap-3.5">
                        {result.decisions.map((item, index) => (
                            <div key={index} className="flex items-start space-x-4.5 p-5 bg-sky-50/40 hover:bg-sky-50/70 border border-sky-100/60 rounded-2xl transition-all duration-200">
                                <div className="bg-sky-100 text-sky-700 p-2.5 rounded-xl flex-shrink-0 mt-0.5">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                                    </svg>
                                </div>
                                <span className="text-slate-800 text-sm font-semibold leading-relaxed">{item.decision}</span>
                            </div>
                        ))}
                    </div>
                </ReportSection>
            )
        },
        {
            id: 'actionItems',
            label: t('tabActionItems'),
            icon: (
                <svg className="w-4 h-4 mr-1 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" className="stroke-violet-400 fill-violet-50" />
                    <path d="M9 9h6" className="stroke-violet-600" />
                    <path d="M9 13h6" className="stroke-violet-600" />
                    <path d="M9 17h4" className="stroke-violet-500" />
                </svg>
            ),
            hasData: result.actionItems.length > 0,
            content: (
                <ReportSection 
                    title={t('actionItemsSectionTitle')}
                    icon={
                        <svg className="w-5 h-5 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" className="stroke-violet-400 fill-violet-50" />
                            <path d="M9 9h6" className="stroke-violet-600" />
                            <path d="M9 13h6" className="stroke-violet-600" />
                            <path d="M9 17h4" className="stroke-violet-500" />
                        </svg>
                    }
                >
                    <div className="overflow-hidden border border-slate-200/50 rounded-2xl custom-shadow bg-white text-slate-800">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse font-sans text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200/60">
                                        <th className="p-4.5 font-extrabold text-slate-800 font-display">{t('actionItemsTableHeaderTask')}</th>
                                        <th className="p-4.5 font-extrabold text-slate-800 font-display">{t('actionItemsTableHeaderOwner')}</th>
                                        <th className="p-4.5 font-extrabold text-slate-800 font-display">{t('actionItemsTableHeaderCollaborators')}</th>
                                        <th className="p-4.5 font-extrabold text-slate-800 font-display">{t('actionItemsTableHeaderDeadline')}</th>
                                        <th className="p-4.5 font-extrabold text-slate-800 font-display">{t('actionItemsTableHeaderNotes')}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {result.actionItems.map((item, index) => (
                                        <tr key={index} className="hover:bg-slate-50/50 transition-colors duration-200">
                                            <td className="p-4.5 font-semibold text-slate-800 align-top max-w-xs">{item.task}</td>
                                            <td className="p-4.5 align-top">
                                                <span className="inline-flex text-xs font-bold font-display bg-sky-50 text-sky-700 px-2.5 py-1 rounded-lg border border-sky-100/30">{item.owner}</span>
                                            </td>
                                            <td className="p-4.5 text-slate-500 font-medium align-top">{item.collaborators || '-'}</td>
                                            <td className="p-4.5 font-mono text-xs text-slate-600 font-semibold align-top whitespace-nowrap">{item.deadline || '-'}</td>
                                            <td className="p-4.5 text-slate-500 align-top text-xs leading-relaxed max-w-xs">{item.notes || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </ReportSection>
            )
        },
        {
            id: 'pendingIssues',
            label: t('tabPendingIssues'),
            icon: (
                <svg className="w-4 h-4 mr-1 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" className="stroke-amber-400 fill-amber-50" />
                    <polyline points="12 6 12 12 16 14" className="stroke-amber-650" />
                </svg>
            ),
            hasData: result.pendingIssues.length > 0,
            content: (
                 <ReportSection 
                    title={t('pendingIssuesSectionTitle')}
                    icon={
                        <svg className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" className="stroke-amber-400 fill-amber-50" />
                            <polyline points="12 6 12 12 16 14" className="stroke-amber-650" />
                        </svg>
                    }
                 >
                    <div className="grid gap-3">
                        {result.pendingIssues.map((item, index) => (
                            <div key={index} className="flex items-start space-x-4 p-4.5 bg-amber-50/40 border border-amber-100/60 rounded-2xl">
                                <span className="bg-amber-100 text-amber-700 p-2 rounded-xl flex-shrink-0 mt-0.5 animate-pulse">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                                    </svg>
                                </span>
                                <span className="text-slate-800 text-sm font-semibold leading-relaxed">{item}</span>
                            </div>
                        ))}
                    </div>
                </ReportSection>
            )
        },
        {
            id: 'notesAndReferences',
            label: t('tabNotes'),
            icon: (
                <svg className="w-4 h-4 mr-1 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" className="stroke-slate-600" />
                </svg>
            ),
            hasData: result.notesAndReferences.length > 0,
            content: (
                <ReportSection 
                    title={t('notesSectionTitle')}
                    icon={
                        <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" className="stroke-slate-600" />
                        </svg>
                    }
                >
                    <div className="grid gap-3">
                        {result.notesAndReferences.map((item, index) => (
                            <div key={index} className="flex items-start space-x-4 p-4.5 bg-slate-50 border border-slate-200/50 rounded-2xl hover:bg-slate-100/50 transition-all duration-200">
                                <span className="bg-slate-200 text-slate-650 p-2 rounded-xl flex-shrink-0 mt-0.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </span>
                                <span className="text-slate-700 text-sm font-medium leading-relaxed">{item}</span>
                            </div>
                        ))}
                    </div>
                </ReportSection>
            )
        },
        {
            id: 'slackEmail',
            label: language === 'vi' ? 'Sao chép nhanh (Slack/Email) 📲' : 'Quick Copy (Slack/Email) 📲',
            icon: (
                <svg className="w-4 h-4 mr-1 pb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
            ),
            hasData: true,
            content: (
                <SlackEmailExporter result={result} language={language} />
            )
        }
    ], [result, t, language, isEditingOverview, editedTopic, editedDateTime, editedLocation, editedAttendees]);

    return (
        <div className="relative z-10">
            {/* Elegant glassmorphic title card */}
            <div className="text-center max-w-3xl mx-auto mb-10 pt-4 pb-2 animate-fade-in">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 backdrop-blur-md border border-white/80 text-[11px] font-mono font-black uppercase tracking-widest text-indigo-650 shadow-[0_4px_12px_rgba(31,38,135,0.03),_inset_0_1.5px_2px_rgba(255,255,255,0.9)] mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                    {t('meetingMinutesTitle')}
                </span>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-850 tracking-tight font-display mb-3 leading-tight">{result.overview.topic}</h2>
                <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-xs text-slate-500 font-semibold">
                    <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        {result.overview.dateTime}
                    </span>
                    <span className="hidden sm:inline text-slate-350">•</span>
                    <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        {result.overview.location}
                    </span>
                </div>
            </div>
            
            {/* Matte frosted glass navigation pill row */}
            <div className="bg-white/45 backdrop-blur-xl border border-white/75 p-2 rounded-[28px] mb-8 flex items-center justify-between gap-4 shadow-[inset_0_2px_4px_rgba(255,255,255,0.75),_0_12px_28px_rgba(31,38,135,0.02)]">
                <nav className="flex space-x-1.5 overflow-x-auto no-scrollbar flex-grow py-1 px-1.5" aria-label="Tabs">
                    {tabs.filter(t => t.hasData).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`whitespace-nowrap flex items-center space-x-2 py-2.5 px-5 rounded-full font-black text-xs transition-all duration-300 cursor-pointer active:scale-95 ${getTabTheme(tab.id, activeTab === tab.id)}`}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </nav>
                <div className="flex-shrink-0 pr-2">
                    <HelpTooltip content={t('tooltipReportTabs')} position="bottom-left" />
                </div>
            </div>

            <div className="mt-8 transition-opacity duration-300">
                {tabs.find(tab => tab.id === activeTab)?.content}
            </div>
        </div>
    );
};


const PromptViewer: React.FC<{ language: any; hint: string }> = ({ language, hint }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const promptText = useMemo(() => {
    return geminiService.getAnalysisPromptTemplate(language, hint);
  }, [language, hint]);

  const handleCopy = () => {
    navigator.clipboard.writeText(promptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <div className="bg-slate-50 border border-slate-200/50 rounded-2xl overflow-hidden mb-6 transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 px-5 text-left font-bold font-display text-slate-700 text-sm hover:bg-slate-100/60 transition-colors duration-200"
      >
        <div className="flex items-center space-x-2.5">
          <svg className="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span>{language === 'vi' ? '🔍 Xem cấu trúc Prompt hệ thống (Hệ quản lý Thư ký Điều hành)' : '🔍 View Executive Secretarial System Prompt'}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-xs text-slate-400 font-semibold">{isOpen ? (language === 'vi' ? 'Thu gọn' : 'Collapse') : (language === 'vi' ? 'Xem chi tiết' : 'View') + ' (' + (language === 'vi' ? 'Sao chép' : 'Copy') + ')'}</span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && (
        <div className="border-t border-slate-200/40 bg-slate-900 p-5 text-slate-100 relative font-mono text-[11.5px] leading-relaxed max-h-96 overflow-y-auto">
          <div className="sticky top-0 float-right z-10">
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-705 text-white font-bold p-1.5 px-3 rounded-lg transition-all duration-200 text-[10px]"
            >
              {copiedPrompt ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-emerald-400">{language === 'vi' ? 'Đã sao chép!' : 'Copied!'}</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>{language === 'vi' ? 'Sao chép Prompt dạng thô' : 'Copy Raw Prompt'}</span>
                </>
              )}
            </button>
          </div>
          <pre className="whitespace-pre-wrap font-mono uppercase-none tracking-normal normal-case select-all leading-relaxed text-slate-300">{promptText}</pre>
        </div>
      )}
    </div>
  );
};


const TranscriptViewEditor: React.FC<Pick<AnalysisViewProps, 'transcript' | 'setTranscript' | 'onAnalyze' | 'audioUrl' | 'audioFile' | 'result' | 'analysisHint' | 'setAnalysisHint'>> = ({ transcript, setTranscript, onAnalyze, audioUrl, audioFile, result, analysisHint, setAnalysisHint }) => {
  const [copied, setCopied] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(null);
  const { t, language } = useTranslation();
  const vi = language === 'vi';

  const audioRef = useRef<HTMLAudioElement>(null);
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    segmentRefs.current = segmentRefs.current.slice(0, transcript.length);
  }, [transcript]);

  useEffect(() => {
    if (activeSegmentIndex !== null && segmentRefs.current[activeSegmentIndex]) {
        setTimeout(() => {
            segmentRefs.current[activeSegmentIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
  }, [activeSegmentIndex]);

  const transcriptTimeInSeconds = useMemo(() => transcript.map(segment => timeStringToSeconds(segment.startTime)), [transcript]);

  const handleSpeakerChange = (index: number, newSpeaker: string) => {
    const newTranscript = [...transcript];
    newTranscript[index] = { ...newTranscript[index], speaker: newSpeaker };
    setTranscript(newTranscript);
  };

  const handleTranscriptChange = (index: number, newText: string) => {
    const newTranscript = [...transcript];
    newTranscript[index] = { ...newTranscript[index], text: newText };
    setTranscript(newTranscript);
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const currentTime = e.currentTarget.currentTime;
    let newActiveIndex: number | null = null;
    for (let i = transcriptTimeInSeconds.length - 1; i >= 0; i--) {
        if (currentTime >= transcriptTimeInSeconds[i]) {
            newActiveIndex = i;
            break;
        }
    }
    if (newActiveIndex !== activeSegmentIndex) {
      setActiveSegmentIndex(newActiveIndex);
    }
  };
  
  const handleSegmentClick = (startTime: string) => {
    if (audioRef.current) {
        audioRef.current.currentTime = timeStringToSeconds(startTime);
        if (audioRef.current.paused) {
            audioRef.current.play().catch(console.error);
        }
    }
  };
  
  const handleCopyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTranscriptForCopy = (segments: TranscriptSegment[]): string => {
    return segments.map(seg => `${seg.speaker ? `[${seg.speaker}] ` : ''}[${formatTimestamp(seg.startTime)}] ${seg.text}`).join('\n');
  };

  return (
    <div>
      <div className="sticky top-[80px] z-30 bg-white/95 backdrop-blur-md pb-5 mb-6 border-b border-slate-200/50 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-2xl font-black text-slate-900 font-display tracking-tight">{result ? t('transcriptTitle') : t('editTranscriptTitle')}</h2>
            <HelpTooltip content={t('tooltipTranscriptEditor')} position="bottom-right" />
          </div>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">Click on speaker names or text to modify</p>
        </div>
        <div className="flex items-center gap-3 self-end md:self-auto flex-wrap">
          <button 
            onClick={() => handleCopyToClipboard(formatTranscriptForCopy(transcript))} 
            className="flex items-center space-x-2 text-xs font-bold font-display bg-slate-100 hover:bg-slate-200 text-slate-700 p-2.5 px-4 rounded-xl transition-all duration-200 active:scale-95 border border-slate-200/40"
          >
            {copied ? <CheckIcon className="w-4 h-4 text-emerald-600"/> : <ClipboardIcon className="w-4 h-4 text-slate-500"/>}
            <span>{copied ? t('copied') : t('copy')}</span>
          </button>
        </div>
        {audioUrl && audioFile && (
          <div className="w-full md:max-w-md">
              <audio ref={audioRef} controls className="w-full h-10 rounded-xl bg-slate-100 accent-sky-600 shadow-inner" onTimeUpdate={handleTimeUpdate}>
                  <source src={audioUrl} type={audioFile.type} />
                  {t('audioNotSupported')}
              </audio>
          </div>
        )}
      </div>

      <div ref={transcriptContainerRef} className="space-y-4 max-w-4xl mx-auto my-6 relative">
        {transcript.map((segment, index) => {
          const isActive = activeSegmentIndex === index;
          return (
            <div 
              key={index} 
              ref={el => { segmentRefs.current[index] = el; }}
              className={`relative p-5 pr-12 rounded-3xl border transition-all duration-300 flex flex-col md:flex-row md:items-start gap-4 hover:shadow-md
                ${isActive 
                  ? 'bg-sky-50/70 border-sky-200 shadow-md shadow-sky-500/5 md:translate-x-1.5' 
                  : 'bg-white border-slate-200/50'}`}
            >
                {/* Speaker badge / Left Col */}
                <div className="flex items-center md:flex-col md:items-start gap-2 md:w-36 flex-shrink-0">
                  <div className={`p-2 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300
                    ${isActive ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <TagIcon className="w-4 h-4" />
                  </div>
                  <input
                      type="text"
                      value={segment.speaker || ''}
                      onChange={(e) => handleSpeakerChange(index, e.target.value)}
                      placeholder={t('speakerPlaceholder')}
                      aria-label={`${t('speakerLabel')} ${index + 1}`}
                      className="text-xs font-bold bg-transparent border-0 rounded-lg p-1 px-1.5 focus:ring-1 focus:ring-sky-500 focus:bg-white w-28 text-slate-800 font-display uppercase tracking-wide"
                  />
                  <button 
                    onClick={() => handleSegmentClick(segment.startTime)} 
                    className={`text-[10px] font-mono font-bold flex items-center gap-1 p-1 px-2.5 rounded-lg border transition-all duration-200 ml-auto md:ml-0 md:mt-2 shadow-sm
                      ${isActive 
                        ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-500' 
                        : 'bg-slate-50 hover:bg-sky-50 text-slate-500 hover:text-sky-600 border-slate-200/40 hover:border-sky-200'}`}
                    title={vi ? 'Nhấn để nghe lại đoạn này' : 'Click to replay this segment'}
                  >
                      {/* Play icon */}
                      <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <span>{formatTimestamp(segment.startTime)}</span>
                  </button>
                </div>
                
                {/* Content bubble / Right Col */}
                <div className="flex-grow w-full">
                  <AutoResizingTextarea 
                    value={segment.text}
                    onChange={(newText) => handleTranscriptChange(index, newText)}
                    index={index}
                    isActive={isActive}
                  />
                </div>

                {/* Top-Right Quick Play Button */}
                <div className="absolute right-3.5 top-3.5">
                  <button
                    onClick={() => handleSegmentClick(segment.startTime)}
                    className={`p-1.5 rounded-xl border transition-all duration-200 shadow-sm flex items-center justify-center
                      ${isActive 
                        ? 'bg-sky-100 hover:bg-sky-200 border-sky-300 text-sky-700' 
                        : 'bg-slate-50 hover:bg-sky-50 border-slate-200/45 text-slate-400 hover:text-sky-600 hover:border-sky-200'}`}
                    title={vi ? 'Nhấn để phát đoạn âm thanh này' : 'Play this audio portion'}
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                    </svg>
                  </button>
                </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-10 border-t border-slate-200/60 pt-8 max-w-4xl mx-auto">
          <div className="bg-slate-50/70 p-8 rounded-3xl border border-slate-200/40 custom-shadow mb-8">
              <div className="flex items-center gap-1.5 mb-1.5">
                  <label htmlFor="analysis-hint" className="text-sm font-black text-slate-800 font-display block uppercase tracking-wider">{t('analysisHintLabel')}</label>
                  <HelpTooltip content={t('tooltipAnalysisHint')} position="right" />
              </div>
              <p className="text-xs text-slate-400 font-medium leading-relaxed mb-4">{t('analysisHintDescription')}</p>
              <textarea
                  id="analysis-hint"
                  rows={3}
                  className="mt-2 block w-full rounded-2xl border-slate-200 shadow-inner focus:border-sky-500 focus:ring-sky-500 sm:text-sm p-4 text-slate-700 bg-white/95"
                  placeholder={t('analysisHintPlaceholder')}
                  value={analysisHint}
                  onChange={(e) => setAnalysisHint(e.target.value)}
                  aria-label={t('analysisHintLabel')}
              />
          </div>
          <div className="text-center p-8 bg-gradient-to-tr from-slate-900 to-indigo-950 text-white rounded-3xl custom-shadow-lg relative overflow-hidden">
              {/* Decorative design elements */}
              <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <h3 className="text-xl font-extrabold font-display tracking-tight text-white mb-2 relative z-10">{result ? t('finishEditingTitleImprove') : t('finishEditingTitle')}</h3>
              <p className="text-slate-400 font-sans text-xs max-w-lg mx-auto mb-6 leading-relaxed relative z-10">{result ? t('finishEditingDescriptionImprove') : t('finishEditingDescription')}</p>
              <button 
                onClick={onAnalyze} 
                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-extrabold font-display py-3.5 px-10 rounded-2xl transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-emerald-500/20 active:scale-98 text-sm relative z-10"
              >
                  {result ? t('reanalyzeButton') : t('saveAndAnalyzeButton')}
              </button>
          </div>
      </div>
    </div>
  );
};


export const AnalysisView: React.FC<AnalysisViewProps> = (props) => {
  const { result, transcript, audioFile, isFocusMode = false, setIsFocusMode, onUpdateResult } = props;
  const { t, language } = useTranslation();
  const [viewMode, setViewMode] = useState<'transcript' | 'report'>('transcript');
  const [isExporting, setIsExporting] = useState(false);

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isGmailLoading, setIsGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [draftCreated, setDraftCreated] = useState(false);

  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveFileUrl, setDriveFileUrl] = useState<string | null>(null);

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
    if (result) {
      setViewMode('report');
    } else {
      setViewMode('transcript');
    }
  }, [result]);

  const sanitizeFileName = (name: string): string => {
    if (!name) return "analysis_export";
    let cleaned = name.replace(/\.[^/.]+$/, ""); // strip extension
    cleaned = cleaned.replace(/[\/\\:*?"<>|]/g, '').trim(); // omit forbidden OS characters
    cleaned = cleaned.replace(/\s+/g, ' '); // collapse double spaces
    return cleaned || "analysis_export";
  }

  const handleCreateGmailDraft = async () => {
    if (!result) return;
    setIsGmailLoading(true);
    setGmailError(null);
    setDraftCreated(false);

    try {
      let currentUser = googleUser;
      const token = await getAccessToken();
      if (!currentUser || !token) {
        const signInResult = await googleSignIn();
        if (signInResult) {
          currentUser = signInResult.user;
          setGoogleUser(currentUser);
        } else {
          setIsGmailLoading(false);
          return;
        }
      }

      const fileName = sanitizeFileName(result.overview.topic || audioFile?.name || 'analysis_export');
      const docBlob = await generateDocxBlob(result, transcript);
      
      try {
        await createGmailDraft(result, language, docBlob, `${fileName}.docx`);
      } catch (innerErr: any) {
        if (innerErr?.message === 'TOKEN_EXPIRED') {
          console.log("Token expired, re-authenticating with Google...");
          const signInResult = await googleSignIn();
          if (signInResult) {
            setGoogleUser(signInResult.user);
            await createGmailDraft(result, language, docBlob, `${fileName}.docx`);
          } else {
            throw new Error(language === 'vi' ? 'Phiên làm việc hết hạn. Hãy đăng nhập lại.' : 'Session expired. Please sign in again.');
          }
        } else {
          throw innerErr;
        }
      }
      
      setDraftCreated(true);
    } catch (err: any) {
      console.error("Gmail draft creation failed:", err);
      setGmailError(err.message || (language === 'vi' ? "Không thể tạo email nháp trong Gmail của bạn." : "Failed to create draft email in your Gmail."));
    } finally {
      setIsGmailLoading(false);
    }
  };

  const handleUploadToDrive = async () => {
    if (!result) return;
    setIsDriveLoading(true);
    setDriveError(null);
    setDriveFileUrl(null);

    try {
      let currentUser = googleUser;
      const token = await getAccessToken();
      if (!currentUser || !token) {
        const signInResult = await googleSignIn();
        if (signInResult) {
          currentUser = signInResult.user;
          setGoogleUser(currentUser);
        } else {
          setIsDriveLoading(false);
          return;
        }
      }

      const fileName = sanitizeFileName(result.overview.topic || audioFile?.name || 'analysis_export');
      const docBlob = await generateDocxBlob(result, transcript);
      
      let res;
      try {
        res = await uploadDocxToGoogleDrive(docBlob, `${fileName}.docx`, language);
      } catch (innerErr: any) {
        if (innerErr?.message === 'TOKEN_EXPIRED') {
          console.log("Token expired, re-authenticating with Google...");
          const signInResult = await googleSignIn();
          if (signInResult) {
            setGoogleUser(signInResult.user);
            res = await uploadDocxToGoogleDrive(docBlob, `${fileName}.docx`, language);
          } else {
            throw new Error(language === 'vi' ? 'Phiên làm việc hết hạn. Hãy đăng nhập lại.' : 'Session expired. Please sign in again.');
          }
        } else {
          throw innerErr;
        }
      }
      
      setDriveFileUrl(res.webViewLink);
    } catch (err: any) {
      console.error("Google Drive upload failed:", err);
      setDriveError(err.message || (language === 'vi' ? "Không thể tải tệp lên Google Drive của bạn." : "Failed to upload document to your Google Drive."));
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleExport = async (format: 'docx' | 'xlsx') => {
    if (!result) return;
    setIsExporting(true);
    const fileName = sanitizeFileName(result.overview.topic || audioFile?.name || 'analysis_export');

    await new Promise(resolve => setTimeout(resolve, 50));

    try {
        if (format === 'docx') {
            await exportDocx(fileName, result, transcript);
        } else {
            await exportXlsx(fileName, result, transcript);
        }
    } catch (error) {
        console.error(`Failed to export as ${format}:`, error);
        alert(t('exportError', {format}));
    } finally {
        setIsExporting(false);
    }
  };

    const generateDocxBlob = async (result: AnalysisResult, transcript: TranscriptSegment[]): Promise<Blob> => {
        const docTitle = (language === 'vi' ? 'BIÊN BẢN CUỘC HỌP PHÁT HÀNH' : 'OFFICIAL MEETING MINUTES');
        const docCreator = (language === 'vi' ? 'Trợ lý Họp AI' : 'AI Meeting Assistant');
        const docDesc = (language === 'vi' ? `Biên bản được tạo tự động cho cuộc họp ngày ${result.overview.dateTime}` : `Automatically generated minutes for the meeting on ${result.overview.dateTime}`);
        const docTopic = (language === 'vi' ? `Biên bản họp - ${result.overview.topic}` : `Meeting Minutes - ${result.overview.topic}`);
        
        const createTitle = (text: string) => new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 480 },
            children: [
                new TextRun({
                    text: text.toUpperCase(),
                    bold: true,
                    size: 38, // 19pt
                    color: "0F172A",
                    font: "Segoe UI"
                })
            ]
        });

        const createHeading1 = (text: string, options?: { pageBreakBefore?: boolean }) => new Paragraph({
            spacing: { before: 400, after: 180 },
            keepWithNext: true,
            pageBreakBefore: options?.pageBreakBefore,
            children: [
                new TextRun({
                    text: text,
                    bold: true,
                    size: 26, // 13pt
                    color: "0F172A",
                    font: "Segoe UI"
                })
            ]
        });

        const createHeading2 = (text: string) => new Paragraph({
            spacing: { before: 240, after: 120 },
            keepWithNext: true,
            children: [
                new TextRun({
                    text: text,
                    bold: true,
                    size: 22, // 11pt
                    color: "0284C7", // Sky blue primary
                    font: "Segoe UI"
                })
            ]
        });

        const createBody = (text: string, options?: { indent?: number, italic?: boolean, bullet?: boolean }) => {
            return new Paragraph({
                spacing: { before: 100, after: 100, line: 265 },
                bullet: options?.bullet ? { level: 0 } : undefined,
                indent: options?.indent ? { left: options.indent } : undefined,
                children: [
                    new TextRun({
                        text: text,
                        size: 20, // 10pt
                        color: "334155", // Slate 700
                        font: "Segoe UI",
                        italic: options?.italic
                    })
                ]
            });
        };

        const createDetailRow = (label: string, value: string) => {
            return new Paragraph({
                spacing: { before: 80, after: 80, line: 240 },
                children: [
                    new TextRun({
                        text: `• ${label}: `,
                        bold: true,
                        size: 20,
                        color: "1E293B", // Slate 800
                        font: "Segoe UI"
                    }),
                    new TextRun({
                        text: value,
                        size: 20,
                        color: "475569", // Slate 600
                        font: "Segoe UI"
                    })
                ]
            });
        };

        const docChildren: any[] = [];
        docChildren.push(createTitle(docTitle));

        docChildren.push(createHeading1(t('tabOverview')));
        docChildren.push(createHeading2(t('overviewInfoTitle')));
        docChildren.push(createDetailRow(t('topic'), result.overview.topic));
        docChildren.push(createDetailRow(t('dateTime'), result.overview.dateTime));
        docChildren.push(createDetailRow(t('location'), result.overview.location));
        docChildren.push(createDetailRow(t('attendees'), result.overview.attendees.join(', ')));

        if (result.mainObjectives?.length > 0) {
            docChildren.push(createHeading2(t('mainObjectivesTitle')));
            result.mainObjectives.forEach(o => docChildren.push(createBody(o, { bullet: true })));
        }

        if (result.discussionSummary) {
            docChildren.push(createHeading1(t('summarySectionTitle')));
            result.discussionSummary.split('\n').filter(line => line.trim()).forEach(line => {
                const cleanedLine = line.trim();
                if (cleanedLine.startsWith('## ')) {
                    docChildren.push(createHeading2(cleanedLine.substring(3)));
                } else if (cleanedLine.startsWith('* ')) {
                    docChildren.push(createBody(cleanedLine.substring(2), { bullet: true }));
                } else if (cleanedLine.startsWith('- ')) {
                    docChildren.push(createBody(cleanedLine.substring(2), { bullet: true }));
                } else {
                    docChildren.push(createBody(cleanedLine));
                }
            });
        }

        if (result.decisions?.length > 0) {
            docChildren.push(createHeading1(t('decisionsSectionTitle')));
            result.decisions.forEach(d => docChildren.push(createBody(d.decision, { bullet: true })));
        }

        if (result.actionItems?.length > 0) {
            docChildren.push(createHeading1(t('actionItemsSectionTitle')));
            
            const tableHeaderCell = (text: string, widthDxa: number) => new TableCell({
                width: { size: widthDxa, type: WidthType.DXA },
                shading: { fill: "0F172A" }, // High contrast dark slate header
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.LEFT,
                        children: [
                            new TextRun({
                                text: text,
                                bold: true,
                                size: 19, // 9.5pt
                                color: "FFFFFF",
                                font: "Segoe UI"
                            })
                        ]
                    })
                ]
            });

            const tableBodyCell = (text: string, widthDxa: number, boldText = false) => new TableCell({
                width: { size: widthDxa, type: WidthType.DXA },
                shading: { fill: "FFFFFF" }, // Use high compatibility clean white background for table cells in Google Docs
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                children: [
                    new Paragraph({
                        spacing: { before: 40, after: 40, line: 220 },
                        children: [
                            new TextRun({
                                text: text || '-',
                                size: 19, // 9.5pt
                                color: "334155",
                                font: "Segoe UI",
                                bold: boldText
                            })
                        ]
                    })
                ]
            });

            docChildren.push(new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [3276, 1404, 1404, 1404, 1872],
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    left: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    right: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }
                },
                rows: [
                    new TableRow({
                        tableHeader: true,
                        cantSplit: true,
                        children: [
                            tableHeaderCell(t('actionItemsTableHeaderTask'), 3276),
                            tableHeaderCell(t('actionItemsTableHeaderOwner'), 1404),
                            tableHeaderCell(t('actionItemsTableHeaderCollaborators'), 1404),
                            tableHeaderCell(t('actionItemsTableHeaderDeadline'), 1404),
                            tableHeaderCell(t('actionItemsTableHeaderNotes'), 1872),
                        ]
                    }),
                    ...result.actionItems.map((item) => new TableRow({
                        cantSplit: true,
                        children: [
                            tableBodyCell(item.task, 3276, true),
                            tableBodyCell(item.owner || '', 1404),
                            tableBodyCell(item.collaborators || '', 1404),
                            tableBodyCell(item.deadline || '', 1404),
                            tableBodyCell(item.notes || '', 1872),
                        ]
                    }))
                ]
            }));
            
            // Subtle layout margin after table
            docChildren.push(new Paragraph({ spacing: { after: 180 } }));
        }

        if (result.pendingIssues?.length > 0) {
            docChildren.push(createHeading1(t('pendingIssuesSectionTitle')));
            result.pendingIssues.forEach(i => docChildren.push(createBody(i, { bullet: true })));
        }

        if (result.notesAndReferences?.length > 0) {
            docChildren.push(createHeading1(t('notesSectionTitle')));
            result.notesAndReferences.forEach(n => docChildren.push(createBody(n, { bullet: true })));
        }

        const appendixTitle = language === 'vi' ? 'Phụ lục: Nội dung chi tiết cuộc họp' : 'Appendix: Full Meeting Transcript';
        docChildren.push(createHeading1(appendixTitle, { pageBreakBefore: true }));
        transcript.forEach(t => docChildren.push(new Paragraph({
            spacing: { before: 80, after: 80, line: 240 },
            children: [
                new TextRun({ 
                    text: `${t.speaker ? `[${t.speaker}] ` : ''}[${formatTimestamp(t.startTime)}] `, 
                    bold: true,
                    size: 19,
                    color: "0284C7", // Sky blue theme highlight
                    font: "Segoe UI"
                }),
                new TextRun({
                    text: t.text,
                    size: 19,
                    color: "475569",
                    font: "Segoe UI"
                })
            ]
        })));

        const doc = new Document({
            creator: docCreator,
            title: docTopic,
            description: docDesc,
            sections: [{ children: docChildren }]
        });
        const blob = await Packer.toBlob(doc);
        return blob;
    };

    const exportDocx = async (fileName: string, result: AnalysisResult, transcript: TranscriptSegment[]) => {
        const blob = await generateDocxBlob(result, transcript);
        saveAs(blob, `${fileName}.docx`);
    };

    const exportXlsx = async (fileName: string, result: AnalysisResult, transcript: TranscriptSegment[]) => {
        const wb = XLSX.utils.book_new();
        
        // 1. Overview Sheet
        const overview_data = [
            { field: t('topic'), value: result.overview.topic },
            { field: t('dateTime'), value: result.overview.dateTime },
            { field: t('location'), value: result.overview.location },
            { field: t('attendees'), value: result.overview.attendees.join(', ') }
        ];
        const overview_ws = XLSX.utils.json_to_sheet(overview_data, {skipHeader: true});
        overview_ws['!cols'] = [{ wch: 25 }, { wch: 70 }];
        XLSX.utils.book_append_sheet(wb, overview_ws, t('tabOverview').substring(3).trim());

        // 2. Main Objectives Sheet
        if (result.mainObjectives?.length > 0) {
            const objectives_ws = XLSX.utils.json_to_sheet(result.mainObjectives.map(o => ({ [t('mainObjectivesTitle')]: o })));
            objectives_ws['!cols'] = [{ wch: 85 }];
            XLSX.utils.book_append_sheet(wb, objectives_ws, t('mainObjectivesTitle').substring(0, 30));
        }

        // 3. Discussion Summary Sheet
        if (result.discussionSummary) {
            const cleanedSummary = result.discussionSummary
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map(line => line.replace(/## /g, '').replace(/\* /g, '  - '))
                .join('\n');
            const summary_ws = XLSX.utils.json_to_sheet([{ [t('summarySectionTitle')]: cleanedSummary }]);
            summary_ws['!cols'] = [{ wch: 100 }];
            XLSX.utils.book_append_sheet(wb, summary_ws, t('tabSummary').substring(3).trim());
        }

        // 4. Key Decisions Sheet
        if (result.decisions?.length > 0) {
            const decisions_ws = XLSX.utils.json_to_sheet(result.decisions.map(d => ({ [t('decisionsSectionTitle')]: d.decision })));
            decisions_ws['!cols'] = [{ wch: 95 }];
            XLSX.utils.book_append_sheet(wb, decisions_ws, t('tabDecisions').substring(3).trim());
        }

        // 5. Action Items Sheet
        if (result.actionItems?.length > 0) {
            const actionItems_ws_data = result.actionItems.map(item => ({
                [t('actionItemsTableHeaderTask')]: item.task,
                [t('actionItemsTableHeaderOwner')]: item.owner,
                [t('actionItemsTableHeaderCollaborators')]: item.collaborators || '-',
                [t('actionItemsTableHeaderDeadline')]: item.deadline || '-',
                [t('actionItemsTableHeaderNotes')]: item.notes || '-'
            }));
            const actionItems_ws = XLSX.utils.json_to_sheet(actionItems_ws_data);
            actionItems_ws['!cols'] = [{ wch: 45 }, { wch: 22 }, { wch: 25 }, { wch: 18 }, { wch: 35 }];
            XLSX.utils.book_append_sheet(wb, actionItems_ws, t('tabActionItems').substring(3).trim());
        }

        // 6. Pending Issues Sheet
        if (result.pendingIssues?.length > 0) {
            const pending_ws = XLSX.utils.json_to_sheet(result.pendingIssues.map(i => ({ [t('pendingIssuesSectionTitle')]: i })));
            pending_ws['!cols'] = [{ wch: 95 }];
            XLSX.utils.book_append_sheet(wb, pending_ws, t('tabPendingIssues').substring(3).trim());
        }

        // 7. Notes Sheet
        if (result.notesAndReferences?.length > 0) {
            const notes_ws = XLSX.utils.json_to_sheet(result.notesAndReferences.map(n => ({ [t('notesSectionTitle')]: n })));
            notes_ws['!cols'] = [{ wch: 95 }];
            XLSX.utils.book_append_sheet(wb, notes_ws, t('tabNotes').substring(3).trim());
        }

        // 8. Full Transcript Sheet
        const transcriptTitle = language === 'vi' ? 'Nội dung chi tiết' : 'Transcript';
        const speakerTitle = language === 'vi' ? 'Người nói' : 'Speaker';
        const timeTitle = language === 'vi' ? 'Thời gian' : 'Time';
        const contentTitle = language === 'vi' ? 'Nội dung' : 'Content';
        
        const transcript_ws = XLSX.utils.json_to_sheet(transcript.map(t => ({ 
            [speakerTitle]: t.speaker || '-', 
            [timeTitle]: formatTimestamp(t.startTime), 
            [contentTitle]: t.text 
        })));
        transcript_ws['!cols'] = [{ wch: 22 }, { wch: 15 }, { wch: 90 }];
        XLSX.utils.book_append_sheet(wb, transcript_ws, transcriptTitle);

        XLSX.writeFile(wb, `${fileName}.xlsx`);
    };

  return (
    <div className="relative bg-white/20 border border-white/60 rounded-[36px] shadow-2xl overflow-hidden transition-all duration-300">
        {/* Dynamic glossy glass watery backdrop blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-[36px] z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[450px] h-[450px] rounded-full bg-sky-200/35 blur-[120px] animate-pulse" style={{ animationDuration: '9s' }}></div>
            <div className="absolute top-[30%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-200/30 blur-[130px] animate-pulse" style={{ animationDuration: '14s', animationDelay: '2s' }}></div>
            <div className="absolute bottom-[-10%] left-[20%] w-[400px] h-[400px] rounded-full bg-teal-100/25 blur-[110px] animate-pulse" style={{ animationDuration: '11s', animationDelay: '4s' }}></div>
        </div>

        {result && (
            <div className="relative z-45 m-3 p-4 bg-white/60 backdrop-blur-xl border border-white/85 rounded-[24px] shadow-[inset_0_2px_4px_rgba(255,255,255,0.85),_0_8px_32px_rgba(31,38,135,0.02)] sticky top-0">
                <div className="flex flex-col justify-center gap-3">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                            <div className="flex items-center space-x-1.5 bg-white/95 backdrop-blur-md rounded-full py-1.5 px-3.5 border border-white shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.95),_0_2px_8px_rgba(0,0,0,0.015)] mr-1 select-none flex-shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 font-sans">
                                    {t('reportTitle')}
                                </span>
                            </div>
                            <button 
                              onClick={() => handleExport('docx')} 
                              disabled={isExporting} 
                              title={t('downloadDocx')}
                              className="group flex items-center justify-center bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-extrabold font-display h-9 px-3 hover:px-4.5 rounded-full disabled:bg-slate-300 disabled:cursor-wait text-xs transition-all duration-300 shadow-[0_8px_20px_-4px_rgba(14,165,233,0.3)] active:scale-95 border-t border-white/20 select-none overflow-hidden"
                            >
                                <DownloadIcon className="w-4 h-4 flex-shrink-0" />
                                <span className="max-w-0 opacity-0 group-hover:max-w-[140px] group-hover:opacity-100 group-hover:ml-1.5 overflow-hidden transition-all duration-300 ease-out whitespace-nowrap text-[11px]">
                                    {isExporting ? t('exporting') : t('downloadDocx')}
                                </span>
                            </button>
                            <button 
                              onClick={() => handleExport('xlsx')} 
                              disabled={isExporting} 
                              title={t('downloadXlsx')}
                              className="group flex items-center justify-center bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold font-display h-9 px-3 hover:px-4.5 rounded-full disabled:bg-slate-300 disabled:cursor-wait text-xs transition-all duration-300 shadow-[0_8px_20px_-4px_rgba(16,185,129,0.3)] active:scale-95 border-t border-white/20 select-none overflow-hidden"
                            >
                                <DownloadIcon className="w-4 h-4 flex-shrink-0" />
                                <span className="max-w-0 opacity-0 group-hover:max-w-[140px] group-hover:opacity-100 group-hover:ml-1.5 overflow-hidden transition-all duration-300 ease-out whitespace-nowrap text-[11px]">
                                    {isExporting ? t('exporting') : t('downloadXlsx')}
                                </span>
                            </button>

                            <button 
                              onClick={handleCreateGmailDraft} 
                              disabled={isGmailLoading} 
                              title={language === 'vi' ? 'Tạo nháp Gmail' : 'Create Gmail Draft'}
                              className={`group flex items-center justify-center font-extrabold font-display h-9 px-3 hover:px-4.5 rounded-full text-xs transition-all duration-300 active:scale-95 border-t border-white/20 select-none overflow-hidden ${
                                draftCreated 
                                  ? 'bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white shadow-[0_8px_20px_-4px_rgba(20,184,166,0.3)]'
                                  : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-[0_8px_20px_-4px_rgba(239,68,68,0.3)] disabled:bg-slate-300 disabled:cursor-wait'
                              }`}
                            >
                                {isGmailLoading ? (
                                  <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                ) : draftCreated ? (
                                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <EmailIcon className="w-4 h-4 flex-shrink-0" />
                                )}
                                <span className="max-w-0 opacity-0 group-hover:max-w-[140px] group-hover:opacity-100 group-hover:ml-1.5 overflow-hidden transition-all duration-300 ease-out whitespace-nowrap text-[11px]">
                                  {isGmailLoading 
                                    ? (language === 'vi' ? 'Đang tạo nháp...' : 'Drafting...') 
                                    : draftCreated 
                                      ? (language === 'vi' ? 'Đã tạo nháp!' : 'Draft Created!')
                                      : (language === 'vi' ? 'Tạo nháp Gmail' : 'Create Gmail Draft')}
                                </span>
                            </button>

                            <button 
                              onClick={handleUploadToDrive} 
                              disabled={isDriveLoading} 
                              title={language === 'vi' ? 'Lưu Google Drive' : 'Save to Google Drive'}
                              className={`group flex items-center justify-center font-extrabold font-display h-9 px-3 hover:px-4.5 rounded-full text-xs transition-all duration-300 active:scale-95 border-t border-white/20 select-none overflow-hidden ${
                                driveFileUrl 
                                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-[0_8px_20px_-4px_rgba(245,158,11,0.3)]'
                                  : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-505 text-white shadow-[0_8px_20px_-4px_rgba(99,102,241,0.3)] disabled:bg-slate-300 disabled:cursor-wait'
                              }`}
                            >
                                {isDriveLoading ? (
                                  <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                ) : driveFileUrl ? (
                                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                  </svg>
                                )}
                                <span className="max-w-0 opacity-0 group-hover:max-w-[150px] group-hover:opacity-100 group-hover:ml-1.5 overflow-hidden transition-all duration-300 ease-out whitespace-nowrap text-[11px]">
                                  {isDriveLoading 
                                    ? (language === 'vi' ? 'Đang lưu Drive...' : 'Saving Drive...') 
                                    : driveFileUrl 
                                      ? (language === 'vi' ? 'Đã lưu Drive!' : 'Saved Drive!')
                                      : (language === 'vi' ? 'Lưu Google Drive' : 'Save Google Drive')}
                                </span>
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
                            {setIsFocusMode && (
                                <button
                                    onClick={() => setIsFocusMode(!isFocusMode)}
                                    className={`w-full sm:w-auto h-9 text-xs font-bold font-display px-4.5 rounded-full transition-all duration-300 border active:scale-95 flex items-center justify-center space-x-2 cursor-pointer shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.8),_0_4px_12px_rgba(0,0,0,0.025)] ${
                                        isFocusMode 
                                            ? 'bg-gradient-to-r from-indigo-50/90 to-indigo-100/90 border-indigo-200/50 text-indigo-700 hover:from-indigo-100/95 hover:to-indigo-150/95' 
                                            : 'bg-white/95 border-slate-200/60 text-slate-600 hover:bg-slate-50/95 hover:text-slate-800'
                                    }`}
                                >
                                    {isFocusMode ? (
                                        <>
                                            <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            <span className="text-[11px]">
                                                {language === 'vi' ? 'Xem lịch sử' : 'Show History'}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.25">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21M15.53 15.53A3 3 0 0110.47 10.47m5.06 5.06L10.47 10.47" />
                                            </svg>
                                            <span className="text-[11px]">
                                                {language === 'vi' ? 'Chế độ tập trung' : 'Focus Mode'}
                                            </span>
                                        </>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => setViewMode(viewMode === 'report' ? 'transcript' : 'report')}
                                className="w-full sm:w-auto h-9 text-xs bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 font-bold font-display px-4.5 rounded-full transition-all duration-300 border border-slate-200/50 active:scale-95 flex items-center justify-center space-x-2 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.8),_0_4px_12px_rgba(0,0,0,0.02)]"
                            >
                                {viewMode === 'report' ? (
                                  <>
                                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    <span className="text-[11px]">{t('viewEditTranscript')}</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="text-[11px]">{t('viewReport')}</span>
                                  </>
                                )}
                            </button>
                        </div>
                    </div>

                    {draftCreated && (
                      <div className="text-xs bg-emerald-50 border border-emerald-200/60 rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-emerald-800 shadow-sm animate-fade-in w-full">
                        <div className="flex items-center space-x-2">
                          <span className="flex-shrink-0 flex items-center justify-center w-5.5 h-5.5 bg-emerald-100 rounded-full text-emerald-600">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                          <span>
                            {language === 'vi' 
                              ? 'Đã soạn nháp email kèm báo cáo Word thành công! Bạn hãy mở thư nháp, điền địa chỉ người nhận và tự bấm gửi.' 
                              : 'Gmail draft with Word document attachment created successfully! Open your Gmail drafts to specify recipients and send.'}
                          </span>
                        </div>
                        <a 
                          href="https://mail.google.com/mail/u/0/#drafts" 
                          target="_blank" 
                          rel="noreferrer" 
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-1.5 px-3 rounded-lg text-[10.5px] transition-colors duration-200 flex items-center space-x-1 flex-shrink-0"
                        >
                          <span>{language === 'vi' ? 'Xem nháp trên Gmail' : 'Open Gmail Drafts'}</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    )}

                    {gmailError && (
                      <div className="text-xs bg-rose-50 border border-rose-200/60 rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-rose-800 shadow-sm animate-fade-in w-full">
                        <div className="flex items-center space-x-2">
                          <span className="flex-shrink-0 flex items-center justify-center w-5.5 h-5.5 bg-rose-100 rounded-full text-rose-600">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </span>
                          <span>{gmailError}</span>
                        </div>
                        <button 
                          onClick={handleCreateGmailDraft} 
                          className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-1.5 px-3 rounded-lg text-[10.5px] transition-colors duration-200 flex-shrink-0"
                        >
                          {language === 'vi' ? 'Thử lại' : 'Retry'}
                        </button>
                      </div>
                    )}

                    {driveFileUrl && (
                      <div className="text-xs bg-amber-50 border border-amber-200/60 rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-amber-850 shadow-sm animate-fade-in w-full">
                        <div className="flex items-center space-x-2">
                          <span className="flex-shrink-0 flex items-center justify-center w-5.5 h-5.5 bg-amber-100 rounded-full text-amber-600">
                            <svg className="w-3 h-3 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                          <span>
                            {language === 'vi' 
                              ? 'Đã tải và lưu báo cáo cuộc họp dạng Word (.docx) trực tiếp lên Google Drive thành công!' 
                              : 'Word meeting minutes report (.docx) successfully uploaded and saved directly to your Google Drive!'}
                          </span>
                        </div>
                        <a 
                          href={driveFileUrl}
                          target="_blank" 
                          rel="noreferrer" 
                          className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold py-1.5 px-3 rounded-lg text-[10.5px] transition-colors duration-200 flex items-center space-x-1 flex-shrink-0"
                        >
                          <span>{language === 'vi' ? 'Mở tệp trên Drive' : 'Open file on Drive'}</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>
                    )}

                    {driveError && (
                      <div className="text-xs bg-rose-50 border border-rose-200/60 rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-rose-800 shadow-sm animate-fade-in w-full">
                        <div className="flex items-center space-x-2">
                          <span className="flex-shrink-0 flex items-center justify-center w-5.5 h-5.5 bg-rose-100 rounded-full text-rose-600">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </span>
                          <span>{driveError}</span>
                        </div>
                        <button 
                          onClick={handleUploadToDrive} 
                          className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-1.5 px-3 rounded-lg text-[10.5px] transition-colors duration-200 flex-shrink-0"
                        >
                          {language === 'vi' ? 'Thử lại' : 'Retry'}
                        </button>
                      </div>
                    )}
                </div>
            </div>
        )}

        <div className="p-6 md:p-8">
            {viewMode === 'report' && result ? (
                <div className="space-y-8">
                    <ReportTabsView result={result} onUpdateResult={onUpdateResult} />
                </div>
            ) : (
                <TranscriptViewEditor {...props} />
            )}
        </div>
    </div>
  );
};