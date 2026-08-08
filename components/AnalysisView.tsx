
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { AnalysisResult, TranscriptSegment, DocumentTemplate, ExportFormat } from '../types';
import { ClipboardIcon, CheckIcon, TagIcon, CalendarIcon, ClockIcon, MapPinIcon, UsersIcon, BookOpenIcon, TrashIcon, DownloadIcon, EmailIcon } from './Icons';
import { useTranslation } from '../i18n';
import { geminiService } from '../services/geminiService';
import { initAuth, googleSignIn, getAccessToken, createGmailDraft, uploadDocxToGoogleDrive, logout, syncTaskToGoogleTasks, syncAllActionItemsToGoogleTasks } from '../services/googleAuthService';
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
  isBold?: boolean;
  isImportant?: boolean;
}

const AutoResizingTextarea: React.FC<AutoResizingTextareaProps> = ({ value, onChange, index, isActive, isBold, isImportant }) => {
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
      className={`w-full bg-transparent border-0 rounded-xl resize-none leading-relaxed focus:bg-white focus:ring-1 focus:ring-sky-500 focus:p-3 p-1 hover:text-slate-900 text-sm font-sans transition-all duration-250 focus:shadow-sm
        ${isBold ? 'font-bold' : 'font-normal'}
        ${isImportant ? 'text-amber-900 bg-amber-500/10 shadow-[inner_0_1px_3px_rgba(245,158,11,0.05)] px-3 py-2 rounded-xl border border-amber-200/50' : 'text-slate-750'}
      `}
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

interface TabItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    badgeCount?: number;
    hasData: boolean;
    content: React.ReactNode;
}

const LiquidGlassTabsBar: React.FC<{
    tabs: TabItem[];
    activeTab: string;
    setActiveTab: (id: string) => void;
    tooltipText: string;
}> = ({ tabs, activeTab, setActiveTab, tooltipText }) => {
    const visibleTabs = tabs.filter(t => t.hasData);

    return (
        <div className="relative mb-6">
            <div className="relative bg-white/40 backdrop-blur-2xl border border-white/80 p-1 sm:p-1.5 rounded-2xl sm:rounded-full shadow-[0_8px_24px_-4px_rgba(31,38,135,0.07),_inset_0_1px_2px_0_rgba(255,255,255,0.95)] flex items-center justify-between gap-1">
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1 flex-grow w-full">
                    {visibleTabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex-1 min-w-[100px] sm:min-w-0 flex items-center justify-center space-x-1.5 py-2 px-2 sm:py-2.5 sm:px-3 rounded-xl sm:rounded-full font-black text-[11px] sm:text-xs md:text-[12.5px] tracking-tight transition-all duration-200 cursor-pointer select-none group z-10 ${
                                    isActive
                                        ? 'text-slate-900 font-black'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/30 font-extrabold'
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="activeLiquidTabPill"
                                        className="absolute inset-0 rounded-xl sm:rounded-full bg-gradient-to-r from-white/95 via-white to-sky-50/90 shadow-[0_4px_16px_-2px_rgba(14,165,233,0.18),_0_2px_6px_rgba(0,0,0,0.05),_inset_0_1.5px_2px_rgba(255,255,255,1)] border border-white ring-1 ring-sky-400/30 -z-10"
                                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                    />
                                )}

                                <span className="shrink-0 transition-transform duration-200 group-hover:scale-110">
                                    {tab.icon}
                                </span>

                                <span className="truncate">{tab.label}</span>

                                {typeof tab.badgeCount === 'number' && tab.badgeCount > 0 && (
                                    <span
                                        className={`shrink-0 ml-0.5 px-1.5 py-0.2 rounded-full text-[9.5px] font-mono font-extrabold transition-all ${
                                            isActive
                                                ? 'bg-sky-500 text-white shadow-sky-500/20'
                                                : 'bg-slate-200/80 text-slate-700 group-hover:bg-slate-300'
                                        }`}
                                    >
                                        {tab.badgeCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="shrink-0 pl-1 border-l border-slate-200/50 flex items-center pr-1">
                    <HelpTooltip content={tooltipText} position="bottom-left" />
                </div>
            </div>
        </div>
    );
};

const ReportTabsView: React.FC<{ result: AnalysisResult; onUpdateResult?: (updated: AnalysisResult) => void }> = ({ result, onUpdateResult }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const { t, language } = useTranslation();
    const [completedTasks, setCompletedTasks] = useState<Record<number, boolean>>({});
    const [copiedDecisionIndex, setCopiedDecisionIndex] = useState<number | null>(null);

    // Google Tasks sync state
    const [isSyncingAllTasks, setIsSyncingAllTasks] = useState(false);
    const [syncingSingleIndex, setSyncingSingleIndex] = useState<number | null>(null);
    const [syncedTaskIndexes, setSyncedTaskIndexes] = useState<Set<number>>(new Set());
    const [tasksToast, setTasksToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const [isEditingOverview, setIsEditingOverview] = useState(false);
    const [editedTopic, setEditedTopic] = useState('');
    const [editedDateTime, setEditedDateTime] = useState('');
    const [editedLocation, setEditedLocation] = useState('');
    const [editedAttendees, setEditedAttendees] = useState('');
    const [isSuggestingTitle, setIsSuggestingTitle] = useState(false);
    const [copiedSummary, setCopiedSummary] = useState(false);

    const handleSyncSingleTaskToGoogleTasks = async (item: ActionItem, index: number) => {
        setSyncingSingleIndex(index);
        try {
            await syncTaskToGoogleTasks(item, result.overview.topic);
            setSyncedTaskIndexes(prev => new Set(prev).add(index));
            setTasksToast({
                type: 'success',
                message: language === 'vi' 
                    ? `Đã thêm công việc "${item.task.slice(0, 32)}..." vào Google Tasks!`
                    : `Added task "${item.task.slice(0, 32)}..." to Google Tasks!`
            });
            setTimeout(() => setTasksToast(null), 4000);
        } catch (error: any) {
            if (error?.message === 'TOKEN_REQUIRED' || error?.message === 'TOKEN_EXPIRED') {
                try {
                    await googleSignIn();
                    await syncTaskToGoogleTasks(item, result.overview.topic);
                    setSyncedTaskIndexes(prev => new Set(prev).add(index));
                    setTasksToast({
                        type: 'success',
                        message: language === 'vi' 
                            ? `Đã thêm công việc "${item.task.slice(0, 32)}..." vào Google Tasks!`
                            : `Added task "${item.task.slice(0, 32)}..." to Google Tasks!`
                    });
                    setTimeout(() => setTasksToast(null), 4000);
                } catch (authErr) {
                    console.error("Google auth error:", authErr);
                    setTasksToast({
                        type: 'error',
                        message: language === 'vi'
                            ? 'Cần đăng nhập Google để đồng bộ Google Tasks.'
                            : 'Google login required to sync to Google Tasks.'
                    });
                    setTimeout(() => setTasksToast(null), 4000);
                }
            } else {
                console.error("Sync task error:", error);
                setTasksToast({
                    type: 'error',
                    message: language === 'vi' ? 'Không thể kết nối Google Tasks.' : 'Error connecting to Google Tasks.'
                });
                setTimeout(() => setTasksToast(null), 4000);
            }
        } finally {
            setSyncingSingleIndex(null);
        }
    };

    const handleSyncAllTasksToGoogleTasks = async () => {
        if (!result.actionItems || result.actionItems.length === 0) return;
        setIsSyncingAllTasks(true);
        try {
            const { successCount } = await syncAllActionItemsToGoogleTasks(result.actionItems, result.overview.topic);
            const allSet = new Set<number>();
            result.actionItems.forEach((_, idx) => allSet.add(idx));
            setSyncedTaskIndexes(allSet);

            setTasksToast({
                type: 'success',
                message: language === 'vi'
                    ? `Thành công! Đã đồng bộ ${successCount} công việc vào Google Tasks.`
                    : `Success! Synced ${successCount} tasks to Google Tasks.`
            });
            setTimeout(() => setTasksToast(null), 5000);
        } catch (error: any) {
            if (error?.message === 'TOKEN_REQUIRED' || error?.message === 'TOKEN_EXPIRED') {
                try {
                    await googleSignIn();
                    const { successCount } = await syncAllActionItemsToGoogleTasks(result.actionItems, result.overview.topic);
                    const allSet = new Set<number>();
                    result.actionItems.forEach((_, idx) => allSet.add(idx));
                    setSyncedTaskIndexes(allSet);

                    setTasksToast({
                        type: 'success',
                        message: language === 'vi'
                            ? `Thành công! Đã đồng bộ ${successCount} công việc vào Google Tasks.`
                            : `Success! Synced ${successCount} tasks to Google Tasks.`
                    });
                    setTimeout(() => setTasksToast(null), 5000);
                } catch (authErr) {
                    console.error("Google auth error:", authErr);
                    setTasksToast({
                        type: 'error',
                        message: language === 'vi'
                            ? 'Cần đăng nhập tài khoản Google để đồng bộ Google Tasks.'
                            : 'Google login required to sync to Google Tasks.'
                    });
                    setTimeout(() => setTasksToast(null), 4000);
                }
            } else {
                console.error("Sync all tasks error:", error);
                setTasksToast({
                    type: 'error',
                    message: language === 'vi' ? 'Không thể đồng bộ vào Google Tasks.' : 'Failed to sync to Google Tasks.'
                });
                setTimeout(() => setTasksToast(null), 4000);
            }
        } finally {
            setIsSyncingAllTasks(false);
        }
    };

    useEffect(() => {
        if (result) {
            setEditedTopic(result.overview.topic || '');
            setEditedDateTime(result.overview.dateTime || '');
            setEditedLocation(result.overview.location || '');
            setEditedAttendees((result.overview.attendees || []).join(', '));
        }
    }, [result]);

    const handleSuggestTitle = async () => {
        setIsSuggestingTitle(true);
        try {
            const content = `
Summary/Discussion: ${result.discussionSummary || ''}
Objectives: ${(result.mainObjectives || []).join(', ')}
Current Title/Topic: ${editedTopic || ''}
`;
            const suggested = await geminiService.generateSuggestedTitle(content, language);
            if (suggested) {
                setEditedTopic(suggested);
            }
        } catch (error) {
            console.error("Failed to suggest title via AI:", error);
        } finally {
            setIsSuggestingTitle(false);
        }
    };

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

    const toggleDecisionImportant = (idx: number) => {
        if (onUpdateResult) {
            const updatedDecisions = (result.decisions || []).map((d, i) => {
                if (i === idx) {
                    return { ...d, isImportant: !d.isImportant };
                }
                return d;
            });
            onUpdateResult({
                ...result,
                decisions: updatedDecisions
            });
        }
    };

    const toggleDecisionBold = (idx: number) => {
        if (onUpdateResult) {
            const updatedDecisions = (result.decisions || []).map((d, i) => {
                if (i === idx) {
                    return { ...d, isBold: !d.isBold };
                }
                return d;
            });
            onUpdateResult({
                ...result,
                decisions: updatedDecisions
            });
        }
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

    const getCleanDiscussionSummary = (text: string) => {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\r/g, '');

        // 1. Remove main document title line e.g. "# MEMO CUỘC HỌP" or "# MEETING MEMO"
        cleaned = cleaned.replace(/^#+\s+(MEMO CUỘC HỌP|MEETING MEMO|MEMO|BIÊN BẢN HỌP)[^\n]*\n*/i, '');

        // 2. Remove Section 1 (1. Tổng quan cuộc họp / General Information / Overview) block if present
        cleaned = cleaned.replace(/(?:##?\s*)?1\.\s*(Tổng quan cuộc họp|Tổng quan|Thông tin chung|General Information|Overview)[\s\S]*?(?=(?:##?\s*)?[23]\.|\n\s*(?:-\s*|\*\s*|\d+\.\s*)[A-ZÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴĐ])/i, '');

        // 3. Remove Section 4 (4. Nội dung trao đổi chi tiết / Detailed Discussion) and any following detailed tables/sections
        cleaned = cleaned.replace(/(?:##?\s*)?4\.\s*(Nội dung trao đổi chi tiết|Detailed Discussion)[\s\S]*/i, '');

        // 4. Remove Section 5 & 6 if they appear in text
        cleaned = cleaned.replace(/(?:##?\s*)?[56]\.\s*(Danh sách quyết định|Quyết định|Decisions|Công việc|Action Items|Tasks|Tồn đọng|Ghi chú)[\s\S]*/i, '');

        // 5. Remove leftover markdown tables (lines starting with '|')
        cleaned = cleaned.replace(/^\s*\|.*\|.*$/gm, '');

        // 6. Strip out redundant section headings like "2. Tóm tắt các Nội dung Thảo luận Chính", "3. Tóm tắt điều hành"
        cleaned = cleaned.replace(/^(?:##?\s*)?(?:\d+\.\s*)?(Tóm tắt các Nội dung Thảo luận Chính|Tóm tắt điều hành|Executive Summary|Tóm tắt thảo luận)[^\n]*/gmi, '');

        // 7. Clean up multiple blank lines
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

        return cleaned;
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
        let currentTableRows: string[] = [];

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

        const flushTable = () => {
            if (currentTableRows.length > 0) {
                const validRows = currentTableRows.filter(r => !/^\s*\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)*\|?\s*$/.test(r.trim()));
                if (validRows.length > 0) {
                    const parseCells = (rowStr: string) => {
                        let cells = rowStr.trim().split('|');
                        if (cells[0] === '') cells.shift();
                        if (cells[cells.length - 1] === '') cells.pop();
                        return cells.map(c => c.trim());
                    };

                    const headerCells = parseCells(validRows[0]);
                    const bodyRows = validRows.slice(1).map(parseCells);

                    elements.push(
                        <div key={`table-${elements.length}`} className="my-5 overflow-x-auto border border-slate-200/80 rounded-2xl shadow-sm bg-white/95">
                            <table className="w-full text-left border-collapse text-xs sm:text-sm font-sans">
                                <thead className="bg-slate-900 text-white font-bold font-display uppercase tracking-wider text-[11px] sm:text-xs">
                                    <tr>
                                        {headerCells.map((h, i) => (
                                            <th key={i} className="px-4 py-3 border-b border-slate-800 font-semibold">{formatInlineStyles(h)}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700">
                                    {bodyRows.map((r, rIdx) => (
                                        <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/60 hover:bg-slate-100/80'}>
                                            {r.map((c, cIdx) => (
                                                <td key={cIdx} className="px-4 py-3 leading-relaxed font-normal align-top">{formatInlineStyles(c)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }
                currentTableRows = [];
            }
        };

        const flushAll = () => {
            flushList();
            flushTable();
        };

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('|')) {
                flushList();
                currentTableRows.push(trimmedLine);
            } else if (trimmedLine.startsWith('# ') || trimmedLine.startsWith('## ') || trimmedLine.startsWith('### ') || trimmedLine.startsWith('#### ')) {
                flushAll();
                const titleText = trimmedLine.replace(/^#+\s+/, '');
                const isMainHeading = trimmedLine.startsWith('# ') || trimmedLine.startsWith('## ');
                elements.push(
                    <h4 key={index} className={isMainHeading
                        ? "text-xl sm:text-2xl font-black text-slate-900 font-display mt-8 mb-4 tracking-tight leading-snug pb-2 border-b border-slate-200/80"
                        : "text-lg sm:text-xl font-extrabold text-slate-800 font-display mt-6 mb-3 tracking-tight leading-snug"
                    }>
                        {formatInlineStyles(titleText)}
                    </h4>
                );
            } else if (trimmedLine.startsWith('* ') || trimmedLine.startsWith('- ')) {
                flushTable();
                const itemText = trimmedLine.substring(2);
                currentListItems.push(
                    <li key={index} className="flex items-start gap-2.5 text-slate-655 leading-relaxed">
                        <span className="w-1.5 h-1.5 mt-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/20 flex-shrink-0" />
                        <span className="font-sans text-slate-700 sm:text-[14.5px] text-sm leading-relaxed">{formatInlineStyles(itemText)}</span>
                    </li>
                );
            } else {
                flushAll();
                elements.push(
                    <p key={index} className="leading-relaxed hover:text-slate-950 transition-colors my-3 text-slate-700 font-sans sm:text-[14.5px] text-sm">
                        {formatInlineStyles(trimmedLine)}
                    </p>
                );
            }
        });
        flushAll();
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
                                        <div className="space-y-2 mt-1.5 min-w-0">
                                            <textarea
                                                value={editedTopic}
                                                onChange={(e) => setEditedTopic(e.target.value)}
                                                className="w-full p-2 text-sm border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500 bg-slate-50/50 focus:bg-white resize-none"
                                                rows={2}
                                                aria-label="Topic"
                                            />
                                            <button
                                                type="button"
                                                onClick={handleSuggestTitle}
                                                disabled={isSuggestingTitle}
                                                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/70 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none shadow-[0_2px_4px_rgba(99,102,241,0.05)]"
                                            >
                                                {isSuggestingTitle ? (
                                                    <>
                                                        <svg className="animate-spin h-3.5 w-3.5 text-indigo-600 animate-pulse" viewBox="0 0 24 24" fill="none">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                        </svg>
                                                        <span>{language === 'vi' ? 'Đang tạo gợi ý...' : 'Suggesting title...'}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-sm">🪄</span>
                                                        <span>{language === 'vi' ? 'AI Gợi ý tiêu đề thông minh' : 'AI Suggest Intelligent Title'}</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
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
                    <div className="space-y-6">
                        {/* Executive Summary Utility Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 px-4 bg-slate-50/80 border border-slate-200/60 rounded-2xl">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100/70 text-indigo-700 text-xs font-bold font-sans">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
                                    {language === 'vi' ? 'Báo cáo Tóm tắt Executive' : 'Executive Briefing'}
                                </span>
                                <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                                    ⚡ ~{Math.max(1, Math.ceil((getCleanDiscussionSummary(result.discussionSummary) || '').split(/\s+/).length / 200))} {language === 'vi' ? 'phút đọc' : 'min read'}
                                </span>
                            </div>

                            <button
                                onClick={() => {
                                    const cleanText = getCleanDiscussionSummary(result.discussionSummary);
                                    navigator.clipboard.writeText(cleanText);
                                    setCopiedSummary(true);
                                    setTimeout(() => setCopiedSummary(false), 2000);
                                }}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100/80 border border-slate-200 shadow-sm transition-all duration-150 active:scale-95 cursor-pointer"
                                title={language === 'vi' ? 'Sao chép toàn bộ tóm tắt' : 'Copy summary to clipboard'}
                            >
                                {copiedSummary ? (
                                    <>
                                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="text-emerald-700">{language === 'vi' ? 'Đã sao chép!' : 'Copied!'}</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                        <span>{language === 'vi' ? 'Sao chép Tóm tắt' : 'Copy Summary'}</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Summary Content Body */}
                        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/60 shadow-sm text-slate-850 space-y-4 font-sans text-base leading-relaxed">
                            {renderMarkdown(getCleanDiscussionSummary(result.discussionSummary))}
                        </div>
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
            badgeCount: result.decisions.length,
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
                            <div 
                              key={index} 
                              className={`relative group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-3xl transition-all duration-300 border
                                ${item.isImportant 
                                  ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-300/80 shadow-[0_4px_16px_rgba(245,158,11,0.06)]' 
                                  : 'bg-white/45 backdrop-blur-md hover:bg-white/65 border-white/70 hover:border-white hover:shadow-md'}`}
                            >
                                <div className="flex items-start space-x-4 flex-grow">
                                    <div className={`p-2.5 rounded-xl flex-shrink-0 mt-0.5 transition-all duration-300
                                      ${item.isImportant ? 'bg-amber-500 text-white' : 'bg-sky-500 text-white'}`}>
                                        {item.isImportant ? (
                                          <svg className="w-4 h-4 fill-current text-white" viewBox="0 0 24 24">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                          </svg>
                                        ) : (
                                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                                          </svg>
                                        )}
                                    </div>
                                    <span className={`text-slate-800 text-sm leading-relaxed transition-all duration-300
                                      ${item.isBold ? 'font-black' : 'font-semibold'}
                                      ${item.isImportant ? 'text-amber-950 px-1 py-0.5 rounded-lg' : ''}
                                    `}>
                                      {item.decision}
                                    </span>
                                </div>

                                <div className="flex items-center space-x-1.5 ml-2 mt-2 sm:mt-0 self-end sm:self-auto shrink-0 transition-all duration-300">
                                    <button
                                        onClick={() => handleCopyDecision(item.decision, index)}
                                        className="p-1.5 px-3 text-[10px] font-bold text-slate-500 hover:text-slate-850 bg-white hover:bg-slate-50 rounded-xl border border-slate-200/50 shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                                        title={language === 'vi' ? 'Sao chép quyết định này' : 'Copy this decision'}
                                    >
                                        {copiedDecisionIndex === index ? (
                                            <>
                                                <svg className="w-3.5 h-3.5 text-emerald-500 stroke-current flex-shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth="3">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span>{language === 'vi' ? 'Đã chép' : 'Copied'}</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                                </svg>
                                                <span>{language === 'vi' ? 'Chép' : 'Copy'}</span>
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => toggleDecisionBold(index)}
                                        className={`w-7 h-7 rounded-xl border shadow-sm transition-all cursor-pointer flex items-center justify-center text-xs
                                          ${item.isBold 
                                            ? 'bg-slate-850 hover:bg-black border-slate-700 text-white font-extrabold' 
                                            : 'bg-white hover:bg-slate-50 border-slate-200/50 text-slate-500 hover:text-slate-800'}`}
                                        title={language === 'vi' ? 'Bôi đậm chữ quyết định này' : 'Bold text'}
                                    >
                                        <span>B</span>
                                    </button>

                                    <button
                                        onClick={() => toggleDecisionImportant(index)}
                                        className={`w-7 h-7 rounded-xl border shadow-sm transition-all cursor-pointer flex items-center justify-center
                                          ${item.isImportant 
                                            ? 'bg-amber-400 border-amber-500 text-slate-900 font-bold' 
                                            : 'bg-white hover:bg-amber-50 border-slate-200/50 text-slate-400 hover:text-amber-500'}`}
                                        title={language === 'vi' ? 'Đánh dấu quan trọng' : 'Bookmark as important'}
                                    >
                                        <svg className={`w-3.5 h-3.5 ${item.isImportant ? 'fill-current text-slate-950' : 'fill-none stroke-current'}`} viewBox="0 0 24 24" strokeWidth="2.5">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                        </svg>
                                    </button>
                                </div>
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
            badgeCount: result.actionItems.length,
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
                    {/* Google Tasks Sync Header Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 p-3.5 sm:p-4 bg-gradient-to-r from-sky-50/90 via-indigo-50/60 to-white rounded-2xl border border-sky-100/90 shadow-sm">
                        <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-white text-sky-600 flex items-center justify-center shadow-sm border border-sky-100 shrink-0">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="#4285F4"/>
                                    <path d="M9.5 12.5L11 14L15.5 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-xs sm:text-sm font-black text-slate-800 flex items-center gap-1.5">
                                    <span>{language === 'vi' ? 'Đồng bộ Google Tasks' : 'Google Tasks Integration'}</span>
                                    <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">Trực tiếp</span>
                                </h4>
                                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                                    {language === 'vi' ? 'Tạo danh sách việc cần làm To-do trên Google Tasks từ thông tin cuộc họp' : 'Create tasks in Google Tasks automatically from action items'}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={handleSyncAllTasksToGoogleTasks}
                            disabled={isSyncingAllTasks || result.actionItems.length === 0}
                            className="inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-95 text-white font-bold text-xs transition-all shadow-md shadow-sky-500/20 disabled:opacity-50 cursor-pointer shrink-0"
                        >
                            {isSyncingAllTasks ? (
                                <>
                                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    <span>{language === 'vi' ? 'Đang đồng bộ...' : 'Syncing...'}</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="#4285F4"/>
                                        <path d="M9.5 12.5L11 14L15.5 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    <span>{language === 'vi' ? 'Đồng bộ tất cả vào Google Tasks' : 'Sync All to Google Tasks'}</span>
                                </>
                            )}
                        </button>
                    </div>

                    {tasksToast && (
                        <div className={`p-3.5 mb-4 rounded-xl text-xs font-bold flex items-center justify-between border shadow-sm ${
                            tasksToast.type === 'success' 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}>
                            <span>{tasksToast.message}</span>
                            <button onClick={() => setTasksToast(null)} className="text-slate-400 hover:text-slate-600 font-extrabold ml-2 cursor-pointer">✕</button>
                        </div>
                    )}

                    <div className="overflow-hidden border border-slate-200/50 rounded-2xl custom-shadow bg-white text-slate-800">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse font-sans text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200/50">
                                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-[11px]">{t('actionItemsTableHeaderTask')}</th>
                                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-[11px] whitespace-nowrap">{t('actionItemsTableHeaderPriority')}</th>
                                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-[11px] whitespace-nowrap">{t('actionItemsTableHeaderOwner')}</th>
                                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-[11px] whitespace-nowrap">{t('actionItemsTableHeaderCollaborators')}</th>
                                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-[11px] whitespace-nowrap">{t('actionItemsTableHeaderDeadline')}</th>
                                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-[11px]">{t('actionItemsTableHeaderNotes')}</th>
                                        <th className="p-4 font-bold text-slate-500 uppercase tracking-wider text-[11px] text-right whitespace-nowrap">Google Tasks</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-100">
                                    {result.actionItems.map((item, index) => {
                                        const getPriorityBadge = (p: string | null) => {
                                            if (!p || p === '-' || p.trim() === '') {
                                                return <span className="inline-flex text-xs font-semibold text-slate-400 px-2">─</span>;
                                            }
                                            const lowerP = p.toLowerCase().trim();
                                            if (lowerP === 'cao' || lowerP === 'high') {
                                                return <span className="inline-flex items-center gap-1.5 text-xs font-bold font-sans bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full border border-rose-100"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>{p}</span>;
                                            }
                                            if (lowerP === 'trung bình' || lowerP === 'trung binh' || lowerP === 'medium') {
                                                return <span className="inline-flex items-center gap-1.5 text-xs font-bold font-sans bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-100"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>{p}</span>;
                                            }
                                            return <span className="inline-flex items-center gap-1.5 text-xs font-bold font-sans bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full border border-teal-100"><span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>{p}</span>;
                                        };
                                        const isItemSynced = syncedTaskIndexes.has(index);
                                        return (
                                            <tr key={index} className="hover:bg-slate-50/50 transition-colors duration-200">
                                                <td className="p-4 text-slate-800 font-semibold align-top max-w-xs text-sm leading-relaxed">{item.task}</td>
                                                <td className="p-4 align-top whitespace-nowrap">
                                                    {getPriorityBadge(item.priority)}
                                                </td>
                                                <td className="p-4 align-top whitespace-nowrap">
                                                    <span className="inline-flex items-center text-xs font-bold font-sans bg-sky-50 text-sky-700 px-2.5 py-1 rounded-full border border-sky-100/50">{item.owner}</span>
                                                </td>
                                                <td className="p-4 text-slate-500 font-medium align-top text-sm">{item.collaborators || '─'}</td>
                                                <td className="p-4 font-mono text-xs text-slate-600 font-semibold align-top whitespace-nowrap">{item.deadline || '─'}</td>
                                                <td className="p-4 text-slate-500 align-top text-xs leading-relaxed max-w-xs">{item.notes || '─'}</td>
                                                <td className="p-4 align-top text-right whitespace-nowrap">
                                                    {isItemSynced ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80">
                                                            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            <span>{language === 'vi' ? 'Đã thêm' : 'Added'}</span>
                                                        </span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleSyncSingleTaskToGoogleTasks(item, index)}
                                                            disabled={syncingSingleIndex === index}
                                                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200/80 font-bold text-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                                                            title={language === 'vi' ? 'Thêm công việc này vào Google Tasks' : 'Add this task to Google Tasks'}
                                                        >
                                                            {syncingSingleIndex === index ? (
                                                                <svg className="animate-spin w-3.5 h-3.5 text-sky-600" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                                                                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="#4285F4"/>
                                                                    <path d="M9.5 12.5L11 14L15.5 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                                </svg>
                                                            )}
                                                            <span>{language === 'vi' ? '+ Tasks' : '+ Tasks'}</span>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
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
            badgeCount: result.pendingIssues.length,
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
            badgeCount: result.notesAndReferences.length,
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
            
            {/* Liquid Glass Navigation Bar */}
            <LiquidGlassTabsBar 
                tabs={tabs} 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                tooltipText={t('tooltipReportTabs')} 
            />

            {/* Tab Content with Fluid Glass Fade & Motion */}
            <div className="mt-8">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 12, scale: 0.995 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -12, scale: 0.995 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {tabs.find(tab => tab.id === activeTab)?.content}
                    </motion.div>
                </AnimatePresence>
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
              className={`relative p-5 pr-28 rounded-3xl border transition-all duration-300 flex flex-col md:flex-row md:items-start gap-4 hover:shadow-md
                ${isActive 
                  ? 'bg-sky-50/70 border-sky-200 shadow-md shadow-sky-500/5 md:translate-x-1.5' 
                  : segment.isImportant 
                    ? 'bg-amber-50/40 border-amber-200 shadow-sm' 
                    : 'bg-white border-slate-200/50'}
                ${segment.isImportant ? 'border-l-4 border-l-amber-400' : ''}`}
            >
                {/* Speaker badge / Left Col */}
                <div className="flex items-center md:flex-col md:items-start gap-2 md:w-36 flex-shrink-0">
                  <div className={`p-2 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300
                    ${isActive ? 'bg-sky-500 text-white' : segment.isImportant ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
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
                        : segment.isImportant 
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200' 
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
                    isBold={segment.isBold}
                    isImportant={segment.isImportant}
                  />
                </div>

                {/* Top-Right Premium Tool Buttons: Bold, Important/Bookmark, Quick Play */}
                <div className="absolute right-3.5 top-3.5 flex items-center space-x-1.5">
                  <button
                    onClick={() => {
                      const newTranscript = [...transcript];
                      newTranscript[index] = { ...newTranscript[index], isBold: !newTranscript[index].isBold };
                      setTranscript(newTranscript);
                    }}
                    className={`w-7 h-7 rounded-lg border transition-all duration-200 shadow-sm flex items-center justify-center cursor-pointer text-xs
                      ${segment.isBold 
                        ? 'bg-slate-850 hover:bg-black border-slate-700 text-white font-extrabold' 
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200/45 text-slate-500 hover:text-slate-800'}`}
                    title={vi ? 'Bôi đậm chữ' : 'Bold text'}
                  >
                    <span>B</span>
                  </button>

                  <button
                    onClick={() => {
                      const newTranscript = [...transcript];
                      newTranscript[index] = { ...newTranscript[index], isImportant: !newTranscript[index].isImportant };
                      setTranscript(newTranscript);
                    }}
                    className={`w-7 h-7 rounded-lg border transition-all duration-200 shadow-sm flex items-center justify-center cursor-pointer
                      ${segment.isImportant 
                        ? 'bg-amber-400 hover:bg-amber-500 border-amber-400 text-slate-900' 
                        : 'bg-slate-50 hover:bg-amber-50 border-slate-200/45 text-slate-400 hover:text-amber-500 hover:border-amber-200'}`}
                    title={vi ? 'Đánh dấu quan trọng' : 'Bookmark as important'}
                  >
                    <svg className={`w-3.5 h-3.5 ${segment.isImportant ? 'fill-current text-slate-900' : 'fill-none stroke-current'}`} viewBox="0 0 24 24" strokeWidth="2.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>

                  <button
                    onClick={() => handleSegmentClick(segment.startTime)}
                    className={`w-7 h-7 rounded-lg border transition-all duration-200 shadow-sm flex items-center justify-center cursor-pointer
                      ${isActive 
                        ? 'bg-sky-100 hover:bg-sky-200 border-sky-300 text-sky-700' 
                        : 'bg-slate-50 hover:bg-sky-50 border-slate-200/45 text-slate-400 hover:text-sky-600 hover:border-sky-200'}`}
                    title={vi ? 'Nhấn để phát đoạn âm thanh này' : 'Play this audio portion'}
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
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
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('analysis-fullscreen');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('analysis-fullscreen');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('analysis-fullscreen');
    };
  }, [isFullscreen]);

  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isGmailLoading, setIsGmailLoading] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [draftCreated, setDraftCreated] = useState(false);

  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveFileUrl, setDriveFileUrl] = useState<string | null>(null);

  // Export Modal & Template Selection State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate>('standard');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('docx');
  const [includeTranscriptOption, setIncludeTranscriptOption] = useState<boolean>(true);

  const openExportModal = (format: ExportFormat = 'docx') => {
    setSelectedFormat(format);
    setIsExportModalOpen(true);
  };

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

  const extractDate = (dateTimeStr: string): string => {
    if (!dateTimeStr) {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
    const matchYYYYMMDD = dateTimeStr.match(/(\d{4})[-/.](\d{2})[-/.](\d{2})/);
    if (matchYYYYMMDD) {
      return `${matchYYYYMMDD[1]}-${matchYYYYMMDD[2]}-${matchYYYYMMDD[3]}`;
    }
    const matchDDMMYYYY = dateTimeStr.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
    if (matchDDMMYYYY) {
      return `${matchDDMMYYYY[3]}-${matchDDMMYYYY[2]}-${matchDDMMYYYY[1]}`;
    }
    try {
      const parsed = Date.parse(dateTimeStr);
      if (!isNaN(parsed)) {
        const dateObj = new Date(parsed);
        return dateObj.toISOString().split('T')[0];
      }
    } catch (e) {
      // ignore
    }
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const removeVietnameseTones = (str: string): string => {
    let resultStr = str;
    resultStr = resultStr.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    resultStr = resultStr.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    resultStr = resultStr.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    resultStr = resultStr.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    resultStr = resultStr.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    resultStr = resultStr.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    resultStr = resultStr.replace(/đ/g, "d");
    resultStr = resultStr.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    resultStr = resultStr.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    resultStr = resultStr.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    resultStr = resultStr.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    resultStr = resultStr.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    resultStr = resultStr.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    resultStr = resultStr.replace(/Đ/g, "D");
    try {
      resultStr = resultStr.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch (e) {
      // ignore normalisation issues if unsupported
    }
    return resultStr;
  };

  const getRecommendedFileName = (resVal: AnalysisResult, audioFileName?: string): string => {
    const datePart = extractDate(resVal.overview?.dateTime);
    let topicText = resVal.overview?.topic || '';
    if (!topicText && audioFileName) {
      topicText = audioFileName.replace(/\.[^/.]+$/, "");
    }
    if (!topicText) {
      topicText = 'ChuDeHop';
    }
    topicText = removeVietnameseTones(topicText);
    topicText = topicText.replace(/[\/\\:*?"<>|._\-–+=\(\)\[\]\{\};,!@#\$%\^&\*]/g, ' ').trim();
    let cleanTopic = topicText
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    if (!cleanTopic) cleanTopic = 'ChuDeHop';

    let dept = resVal.category || 'Chung';
    dept = removeVietnameseTones(dept);
    const deptMap: Record<string, string> = {
      'Project': 'DuAn',
      'Marketing': 'Marketing',
      'Technical': 'KyThuat',
      'HR': 'NhanSu',
      'Finance': 'TaiChinh',
      'Operations': 'VanHanh',
      'General': 'Chung',
      'Chung': 'Chung'
    };
    if (deptMap[dept]) {
      dept = deptMap[dept];
    } else {
      dept = dept.replace(/[^a-zA-Z0-9]/g, '');
    }
    if (!dept) dept = 'Chung';
    return `${datePart}_${cleanTopic}_${dept}_v1.0`;
  };

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

      const fileName = getRecommendedFileName(result, audioFile?.name);
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

      const fileName = getRecommendedFileName(result, audioFile?.name);
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

  const handleExecuteExport = async () => {
    if (!result) return;
    setIsExporting(true);
    const fileName = getRecommendedFileName(result, audioFile?.name);
    const tplSuffix = selectedTemplate === 'summary' 
      ? '_ExecutiveBrief' 
      : selectedTemplate === 'technical' 
        ? '_TechnicalReport' 
        : '_StandardMoM';
    const finalFileName = `${fileName}${tplSuffix}`;

    try {
      if (selectedFormat === 'docx') {
        const blob = await generateDocxBlob(result, transcript, selectedTemplate, includeTranscriptOption);
        saveAs(blob, `${finalFileName}.docx`);
        setIsExportModalOpen(false);
      } else if (selectedFormat === 'xlsx') {
        await exportXlsx(finalFileName, result, transcript, selectedTemplate, includeTranscriptOption);
        setIsExportModalOpen(false);
      } else if (selectedFormat === 'gmail') {
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
              setIsExporting(false);
              return;
            }
          }
          const blob = await generateDocxBlob(result, transcript, selectedTemplate, includeTranscriptOption);
          await createGmailDraft(result, language, blob, `${finalFileName}.docx`);
          setDraftCreated(true);
          setIsExportModalOpen(false);
        } catch (innerErr: any) {
          console.error("Gmail draft creation failed:", innerErr);
          setGmailError(innerErr.message || (language === 'vi' ? "Không thể tạo email nháp trong Gmail." : "Failed to create draft email in Gmail."));
        } finally {
          setIsGmailLoading(false);
        }
      } else if (selectedFormat === 'drive') {
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
              setIsExporting(false);
              return;
            }
          }
          const blob = await generateDocxBlob(result, transcript, selectedTemplate, includeTranscriptOption);
          const res = await uploadDocxToGoogleDrive(blob, `${finalFileName}.docx`, language);
          setDriveFileUrl(res.webViewLink);
          setIsExportModalOpen(false);
        } catch (innerErr: any) {
          console.error("Google Drive upload failed:", innerErr);
          setDriveError(innerErr.message || (language === 'vi' ? "Không thể tải tệp lên Google Drive." : "Failed to upload document to Google Drive."));
        } finally {
          setIsDriveLoading(false);
        }
      }
    } catch (error) {
      console.error(`Failed to export as ${selectedFormat}:`, error);
      alert(t('exportError', { format: selectedFormat }));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async (format: 'docx' | 'xlsx') => {
    openExportModal(format);
  };

    const generateDocxBlob = async (
      result: AnalysisResult, 
      transcript: TranscriptSegment[],
      template: DocumentTemplate = 'standard',
      includeTranscript: boolean = true
    ): Promise<Blob> => {
        let docTitle = (language === 'vi' ? 'BIÊN BẢN CUỘC HỌP PHÁT HÀNH' : 'OFFICIAL MEETING MINUTES');
        if (template === 'summary') {
          docTitle = (language === 'vi' ? 'BẢN TÓM TẮT CUỘC HỌP (EXECUTIVE BRIEF)' : 'EXECUTIVE MEETING BRIEF');
        } else if (template === 'technical') {
          docTitle = (language === 'vi' ? 'BÁO CÁO CHI TIẾT KỸ THUẬT VÀ DỰ ÁN' : 'TECHNICAL & ENGINEERING REPORT');
        }

        const docCreator = (language === 'vi' ? 'Trợ lý Họp AI' : 'AI Meeting Assistant');
        const docDesc = (language === 'vi' ? `Biên bản được tạo tự động cho cuộc họp ngày ${result.overview.dateTime}` : `Automatically generated minutes for the meeting on ${result.overview.dateTime}`);
        const docTopic = (language === 'vi' ? `Biên bản họp - ${result.overview.topic}` : `Meeting Minutes - ${result.overview.topic}`);
        
        // Inline Markdown to docx TextRun helper (strips **bold** and *italic* tags into real docx styles)
        const parseInlineMarkdownToTextRuns = (
            text: string, 
            options: { baseSize?: number; baseColor?: string; font?: string; italic?: boolean } = {}
        ): TextRun[] => {
            const size = options.baseSize ?? 20; // 10pt default
            const color = options.baseColor ?? "334155";
            const font = options.font ?? "Inter";
            const baseItalic = options.italic ?? false;

            if (!text) return [new TextRun({ text: '', size, color, font })];

            const runs: TextRun[] = [];
            const boldRegex = /(\*\*[^*]+\*\*)/g;
            const parts = text.split(boldRegex);

            for (const part of parts) {
                if (!part) continue;
                if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                    const innerText = part.slice(2, -2);
                    runs.push(new TextRun({
                        text: innerText,
                        bold: true,
                        italic: baseItalic,
                        size,
                        color,
                        font
                    }));
                } else {
                    const italicRegex = /(\*[^*]+\*)/g;
                    const subParts = part.split(italicRegex);
                    for (const sub of subParts) {
                        if (!sub) continue;
                        if (sub.startsWith('*') && sub.endsWith('*') && sub.length >= 2) {
                            runs.push(new TextRun({
                                text: sub.slice(1, -1),
                                bold: false,
                                italic: true,
                                size,
                                color,
                                font
                            }));
                        } else {
                            runs.push(new TextRun({
                                text: sub,
                                bold: false,
                                italic: baseItalic,
                                size,
                                color,
                                font
                            }));
                        }
                    }
                }
            }
            return runs.length > 0 ? runs : [new TextRun({ text: text || '', size, color, font })];
        };

        const createTitle = (text: string) => new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 480 },
            children: [
                new TextRun({
                    text: text.toUpperCase(),
                    bold: true,
                    size: 36, // 18pt
                    color: "0F172A",
                    font: "Inter"
                })
            ]
        });

        const createHeading1 = (text: string, options?: { pageBreakBefore?: boolean }) => new Paragraph({
            spacing: { before: 360, after: 160 },
            keepWithNext: true,
            pageBreakBefore: options?.pageBreakBefore,
            children: parseInlineMarkdownToTextRuns(text, {
                baseSize: 26, // 13pt
                baseColor: "0F172A", // Slate 900
                font: "Inter"
            })
        });

        const createHeading2 = (text: string) => new Paragraph({
            spacing: { before: 260, after: 120 },
            keepWithNext: true,
            children: parseInlineMarkdownToTextRuns(text, {
                baseSize: 22, // 11pt
                baseColor: "0284C7", // Sky Blue Primary
                font: "Inter"
            })
        });

        const createHeading3 = (text: string) => new Paragraph({
            spacing: { before: 200, after: 100 },
            keepWithNext: true,
            children: parseInlineMarkdownToTextRuns(text, {
                baseSize: 20, // 10pt
                baseColor: "0369A1",
                font: "Inter"
            })
        });

        const createBody = (text: string, options?: { indent?: number, italic?: boolean, bullet?: boolean }) => {
            return new Paragraph({
                spacing: { before: 80, after: 80, line: 250 },
                bullet: options?.bullet ? { level: 0 } : undefined,
                indent: options?.indent ? { left: options.indent } : undefined,
                children: parseInlineMarkdownToTextRuns(text, {
                    baseSize: 20, // 10pt
                    baseColor: "334155", // Slate 700
                    font: "Inter",
                    italic: options?.italic
                })
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
                        color: "1E293B",
                        font: "Inter"
                    }),
                    ...parseInlineMarkdownToTextRuns(value, {
                        baseSize: 20,
                        baseColor: "475569",
                        font: "Inter"
                    })
                ]
            });
        };

        const createDocxTableFromMarkdownRows = (headerCells: string[], bodyRows: string[][]): Table => {
            const colCount = Math.max(headerCells.length, ...bodyRows.map(r => r.length));
            if (colCount === 0) return new Table({ rows: [] });

            const totalWidthDxa = 9360; // 6.5 in
            const colWidthDxa = Math.floor(totalWidthDxa / colCount);
            const columnWidths = Array(colCount).fill(colWidthDxa);

            const headerRow = new TableRow({
                tableHeader: true,
                cantSplit: true,
                children: Array.from({ length: colCount }).map((_, i) => {
                    const cellText = headerCells[i] || '';
                    return new TableCell({
                        width: { size: colWidthDxa, type: WidthType.DXA },
                        shading: { fill: "0F172A" },
                        margins: { top: 120, bottom: 120, left: 140, right: 140 },
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: parseInlineMarkdownToTextRuns(cellText, {
                                    baseSize: 18,
                                    baseColor: "FFFFFF",
                                    font: "Inter"
                                })
                            })
                        ]
                    });
                })
            });

            const dataRows = bodyRows.map((row, rowIndex) => {
                const bgFill = rowIndex % 2 === 0 ? "FFFFFF" : "F8FAFC";
                return new TableRow({
                    cantSplit: true,
                    children: Array.from({ length: colCount }).map((_, i) => {
                        const cellText = row[i] || '';
                        return new TableCell({
                            width: { size: colWidthDxa, type: WidthType.DXA },
                            shading: { fill: bgFill },
                            margins: { top: 100, bottom: 100, left: 140, right: 140 },
                            children: [
                                new Paragraph({
                                    spacing: { before: 40, after: 40, line: 220 },
                                    children: parseInlineMarkdownToTextRuns(cellText, {
                                        baseSize: 18,
                                        baseColor: "334155",
                                        font: "Inter"
                                    })
                                })
                            ]
                        });
                    })
                });
            });

            return new Table({
                width: { size: totalWidthDxa, type: WidthType.DXA },
                columnWidths,
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    left: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    right: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }
                },
                rows: [headerRow, ...dataRows]
            });
        };

        const parseMarkdownToDocxElements = (markdownText: string): (Paragraph | Table)[] => {
            const elements: (Paragraph | Table)[] = [];
            const lines = markdownText.split('\n');

            let inTable = false;
            let tableHeaderCells: string[] = [];
            let tableBodyRows: string[][] = [];

            const flushTable = () => {
                if (inTable && tableHeaderCells.length > 0) {
                    elements.push(createDocxTableFromMarkdownRows(tableHeaderCells, tableBodyRows));
                    elements.push(new Paragraph({ spacing: { after: 120 } }));
                }
                inTable = false;
                tableHeaderCells = [];
                tableBodyRows = [];
            };

            for (let i = 0; i < lines.length; i++) {
                const rawLine = lines[i];
                const trimmed = rawLine.trim();

                if (!trimmed) {
                    if (inTable) flushTable();
                    continue;
                }

                // Check if line is a markdown table row (contains '|')
                if (trimmed.includes('|') && (trimmed.startsWith('|') || trimmed.endsWith('|') || trimmed.split('|').length > 2)) {
                    const rawCells = trimmed.split('|');
                    let cells = rawCells.map(c => c.trim());
                    if (trimmed.startsWith('|')) cells.shift();
                    if (trimmed.endsWith('|')) cells.pop();

                    const isDelimiter = cells.every(c => /^[:\-\s]+$/.test(c));
                    if (isDelimiter) {
                        inTable = true;
                        continue;
                    }

                    if (!inTable) {
                        inTable = true;
                        tableHeaderCells = cells;
                        tableBodyRows = [];
                    } else {
                        tableBodyRows.push(cells);
                    }
                    continue;
                } else {
                    if (inTable) {
                        flushTable();
                    }
                }

                // Headings
                if (trimmed.startsWith('# ')) {
                    elements.push(createHeading1(trimmed.replace(/^#+\s*/, '')));
                } else if (trimmed.startsWith('## ')) {
                    elements.push(createHeading1(trimmed.replace(/^#+\s*/, '')));
                } else if (trimmed.startsWith('### ')) {
                    elements.push(createHeading2(trimmed.replace(/^#+\s*/, '')));
                } else if (trimmed.startsWith('#### ')) {
                    elements.push(createHeading3(trimmed.replace(/^#+\s*/, '')));
                } else if (/^\d+\.\s+[A-Z0-9À-Ỹ]/.test(trimmed) && trimmed.length < 80 && !trimmed.includes(':')) {
                    elements.push(createHeading2(trimmed));
                } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('● ')) {
                    const cleanBulletText = trimmed.replace(/^[*•●-]\s*/, '');
                    elements.push(createBody(cleanBulletText, { bullet: true }));
                } else {
                    elements.push(createBody(trimmed));
                }
            }

            if (inTable) {
                flushTable();
            }

            return elements;
        };

        const docChildren: any[] = [];
        docChildren.push(createTitle(docTitle));

        if (template === 'technical') {
            docChildren.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: -200, after: 300 },
                children: [
                    new TextRun({
                        text: language === 'vi' ? '[ BÁO CÁO CHUYÊN MÔN KỸ THUẬT, KIẾN TRÚC & TIẾN ĐỘ ]' : '[ TECHNICAL SPECIFICATION & ENGINEERING REPORT ]',
                        bold: true,
                        size: 18,
                        color: "4F46E5",
                        font: "Inter"
                    })
                ]
            }));
        }

        const overviewHeading = template === 'technical' 
          ? (language === 'vi' ? '1. THÔNG TIN KỸ THUẬT & BỐI CẢNH DỰ ÁN' : '1. TECHNICAL OVERVIEW & PROJECT CONTEXT')
          : t('tabOverview');
        docChildren.push(createHeading1(overviewHeading));
        docChildren.push(createHeading2(t('overviewInfoTitle')));
        docChildren.push(createDetailRow(t('topic'), result.overview.topic));
        docChildren.push(createDetailRow(t('dateTime'), result.overview.dateTime));
        docChildren.push(createDetailRow(t('location'), result.overview.location));
        docChildren.push(createDetailRow(t('attendees'), result.overview.attendees.join(', ')));

        if (result.mainObjectives?.length > 0) {
            const objTitle = template === 'technical' 
              ? (language === 'vi' ? 'Mục tiêu Kỹ thuật & Chuyên môn' : 'Technical & Engineering Objectives')
              : t('mainObjectivesTitle');
            docChildren.push(createHeading2(objTitle));
            result.mainObjectives.forEach(o => docChildren.push(createBody(o, { bullet: true })));
        }

        if (result.discussionSummary) {
            const summaryTitle = template === 'summary' 
              ? (language === 'vi' ? '2. Tóm tắt Nội dung Thảo luận Chính' : '2. Executive Discussion Highlights')
              : template === 'technical'
                ? (language === 'vi' ? '2. Chi tiết Thảo luận Kỹ thuật & Triển khai' : '2. Technical Discussion Breakdown')
                : t('summarySectionTitle');
            docChildren.push(createHeading1(summaryTitle));
            const summaryElements = parseMarkdownToDocxElements(result.discussionSummary);
            docChildren.push(...summaryElements);
        }

        const summaryHasDecisions = /Quyết định|Decisions/i.test(result.discussionSummary || '');
        if (result.decisions?.length > 0 && !summaryHasDecisions) {
            const decTitle = template === 'technical'
              ? (language === 'vi' ? '3. Quyết định Kỹ thuật & Công nghệ' : '3. Engineering & Technical Decisions')
              : t('decisionsSectionTitle');
            docChildren.push(createHeading1(decTitle));
            result.decisions.forEach(d => docChildren.push(createBody(d.decision, { bullet: true })));
        }

        const summaryHasActionItemsTable = /Mã việc|Công việc cần thực hiện|Action Item|Phân công Công việc/i.test(result.discussionSummary || '');
        if (result.actionItems?.length > 0 && !summaryHasActionItemsTable) {
            const actionTitle = template === 'technical'
              ? (language === 'vi' ? '4. Bảng Phân công Nhiệm vụ Kỹ thuật' : '4. Engineering Action Items Assignment')
              : t('actionItemsSectionTitle');
            docChildren.push(createHeading1(actionTitle));
            
            const headerBg = template === 'technical' ? "1E1B4B" : "0F172A";

            const tableHeaderCell = (text: string, widthDxa: number) => new TableCell({
                width: { size: widthDxa, type: WidthType.DXA },
                shading: { fill: headerBg },
                margins: { top: 120, bottom: 120, left: 140, right: 140 },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.LEFT,
                        children: parseInlineMarkdownToTextRuns(text, {
                            baseSize: 18,
                            baseColor: "FFFFFF",
                            font: "Inter"
                        })
                    })
                ]
            });

            const tableBodyCell = (text: string, widthDxa: number, boldText = false) => new TableCell({
                width: { size: widthDxa, type: WidthType.DXA },
                shading: { fill: "FFFFFF" },
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                children: [
                    new Paragraph({
                        spacing: { before: 40, after: 40, line: 220 },
                        children: parseInlineMarkdownToTextRuns(text || '-', {
                            baseSize: 18,
                            baseColor: "334155",
                            font: "Inter"
                        })
                    })
                ]
            });

            docChildren.push(new Table({
                width: { size: 9360, type: WidthType.DXA },
                columnWidths: [2808, 936, 1404, 1404, 1404, 1404],
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
                            tableHeaderCell(t('actionItemsTableHeaderTask'), 2808),
                            tableHeaderCell(t('actionItemsTableHeaderPriority'), 936),
                            tableHeaderCell(t('actionItemsTableHeaderOwner'), 1404),
                            tableHeaderCell(t('actionItemsTableHeaderCollaborators'), 1404),
                            tableHeaderCell(t('actionItemsTableHeaderDeadline'), 1404),
                            tableHeaderCell(t('actionItemsTableHeaderNotes'), 1404),
                        ]
                    }),
                    ...result.actionItems.map((item) => new TableRow({
                        cantSplit: true,
                        children: [
                            tableBodyCell(item.task, 2808, true),
                            tableBodyCell(item.priority || '', 936),
                            tableBodyCell(item.owner || '', 1404),
                            tableBodyCell(item.collaborators || '', 1404),
                            tableBodyCell(item.deadline || '', 1404),
                            tableBodyCell(item.notes || '', 1404),
                        ]
                    }))
                ]
            }));
            
            docChildren.push(new Paragraph({ spacing: { after: 180 } }));
        }

        const summaryHasPending = /Tồn đọng|Pending|Khó khăn/i.test(result.discussionSummary || '');
        if (result.pendingIssues?.length > 0 && !summaryHasPending && template !== 'summary') {
            const pendingTitle = template === 'technical'
              ? (language === 'vi' ? '5. Tồn đọng Kỹ thuật, Blocker & Rủi ro' : '5. Technical Debt, Blockers & Risks')
              : t('pendingIssuesSectionTitle');
            docChildren.push(createHeading1(pendingTitle));
            result.pendingIssues.forEach(i => docChildren.push(createBody(i, { bullet: true })));
        }

        const summaryHasNotes = /Ghi chú|References|Tài liệu/i.test(result.discussionSummary || '');
        if (result.notesAndReferences?.length > 0 && !summaryHasNotes && template !== 'summary') {
            const notesTitle = template === 'technical'
              ? (language === 'vi' ? '6. Tài liệu Kỹ thuật, API & Tham chiếu' : '6. Technical Documentation & API References')
              : t('notesSectionTitle');
            docChildren.push(createHeading1(notesTitle));
            result.notesAndReferences.forEach(n => docChildren.push(createBody(n, { bullet: true })));
        }

        if (includeTranscript && transcript && transcript.length > 0) {
            const appendixTitle = template === 'technical'
              ? (language === 'vi' ? 'Phụ lục: Nhật ký gỡ băng chi tiết kỹ thuật' : 'Appendix: Full Verbatim Technical Transcript')
              : (language === 'vi' ? 'Phụ lục: Nội dung chi tiết cuộc họp' : 'Appendix: Full Meeting Transcript');
            
            docChildren.push(createHeading1(appendixTitle, { pageBreakBefore: true }));
            transcript.forEach(t => docChildren.push(new Paragraph({
                spacing: { before: 80, after: 80, line: 240 },
                children: [
                    new TextRun({ 
                        text: `${t.speaker ? `[${t.speaker}] ` : ''}[${formatTimestamp(t.startTime)}] `, 
                        bold: true,
                        size: 19,
                        color: "0284C7",
                        font: "Inter"
                    }),
                    ...parseInlineMarkdownToTextRuns(t.text, { baseSize: 19, baseColor: "475569", font: "Inter" })
                ]
            })));
        }

        const doc = new Document({
            creator: docCreator,
            title: docTopic,
            description: docDesc,
            sections: [{ children: docChildren }]
        });
        const blob = await Packer.toBlob(doc);
        return blob;
    };

    const exportXlsx = async (
      fileName: string, 
      result: AnalysisResult, 
      transcript: TranscriptSegment[],
      template: DocumentTemplate = 'standard',
      includeTranscript: boolean = true
    ) => {
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
                [t('actionItemsTableHeaderPriority')]: item.priority || '-',
                [t('actionItemsTableHeaderOwner')]: item.owner,
                [t('actionItemsTableHeaderCollaborators')]: item.collaborators || '-',
                [t('actionItemsTableHeaderDeadline')]: item.deadline || '-',
                [t('actionItemsTableHeaderNotes')]: item.notes || '-'
            }));
            const actionItems_ws = XLSX.utils.json_to_sheet(actionItems_ws_data);
            actionItems_ws['!cols'] = [{ wch: 45 }, { wch: 15 }, { wch: 22 }, { wch: 25 }, { wch: 18 }, { wch: 35 }];
            XLSX.utils.book_append_sheet(wb, actionItems_ws, t('tabActionItems').substring(3).trim());
        }

        // 6. Pending Issues Sheet
        if (result.pendingIssues?.length > 0 && template !== 'summary') {
            const pending_ws = XLSX.utils.json_to_sheet(result.pendingIssues.map(i => ({ [t('pendingIssuesSectionTitle')]: i })));
            pending_ws['!cols'] = [{ wch: 95 }];
            XLSX.utils.book_append_sheet(wb, pending_ws, t('tabPendingIssues').substring(3).trim());
        }

        // 7. Notes Sheet
        if (result.notesAndReferences?.length > 0 && template !== 'summary') {
            const notes_ws = XLSX.utils.json_to_sheet(result.notesAndReferences.map(n => ({ [t('notesSectionTitle')]: n })));
            notes_ws['!cols'] = [{ wch: 95 }];
            XLSX.utils.book_append_sheet(wb, notes_ws, t('tabNotes').substring(3).trim());
        }

        // 8. Full Transcript Sheet
        if (includeTranscript && transcript && transcript.length > 0) {
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
        }

        XLSX.writeFile(wb, `${fileName}.xlsx`);
    };

  return (
    <div className={isFullscreen 
      ? "fixed inset-0 sm:inset-[1.5%] z-[200] bg-white/95 backdrop-blur-3xl border border-white/95 rounded-none sm:rounded-[32px] shadow-[0_24px_80px_rgba(15,23,42,0.18)] overflow-y-auto flex flex-col transition-all duration-300"
      : "relative bg-white/30 backdrop-blur-2xl border border-white/70 rounded-[28px] sm:rounded-[36px] shadow-[0_20px_60px_-15px_rgba(15,23,42,0.06)] overflow-hidden transition-all duration-300 w-full"
    }>
        {/* Dynamic glossy glass watery backdrop blobs */}
        <div className={`absolute inset-0 overflow-hidden pointer-events-none z-0 ${isFullscreen ? 'rounded-none sm:rounded-[36px]' : 'rounded-[36px]'}`}>
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
                              onClick={() => openExportModal('docx')} 
                              disabled={isExporting} 
                              title={language === 'vi' ? 'Xuất báo cáo & Chọn Template' : 'Export Report & Select Template'}
                              className="group flex items-center justify-center bg-gradient-to-r from-indigo-600 via-sky-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white font-extrabold font-display h-9 px-4 rounded-full disabled:bg-slate-300 disabled:cursor-wait text-xs transition-all duration-300 shadow-[0_8px_20px_-4px_rgba(79,70,229,0.35)] active:scale-95 border-t border-white/30 select-none cursor-pointer flex-shrink-0"
                            >
                                <DownloadIcon className="w-4 h-4 flex-shrink-0 mr-1.5" />
                                <span className="text-[11px]">
                                    {language === 'vi' ? 'Xuất & Mẫu Template' : 'Export & Templates'}
                                </span>
                            </button>

                            <button 
                              onClick={() => openExportModal('docx')} 
                              disabled={isExporting} 
                              title={t('downloadDocx')}
                              className="group flex items-center justify-center bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-extrabold font-display h-9 px-3 hover:px-4 rounded-full disabled:bg-slate-300 disabled:cursor-wait text-xs transition-all duration-300 shadow-[0_8px_20px_-4px_rgba(14,165,233,0.3)] active:scale-95 border-t border-white/20 select-none overflow-hidden cursor-pointer"
                            >
                                <span className="text-xs mr-1">📄</span>
                                <span className="text-[11px]">.docx</span>
                            </button>
                            <button 
                              onClick={() => openExportModal('xlsx')} 
                              disabled={isExporting} 
                              title={t('downloadXlsx')}
                              className="group flex items-center justify-center bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-extrabold font-display h-9 px-3 hover:px-4 rounded-full disabled:bg-slate-300 disabled:cursor-wait text-xs transition-all duration-300 shadow-[0_8px_20px_-4px_rgba(16,185,129,0.3)] active:scale-95 border-t border-white/20 select-none overflow-hidden cursor-pointer"
                            >
                                <span className="text-xs mr-1">📊</span>
                                <span className="text-[11px]">.xlsx</span>
                            </button>

                            <button 
                              onClick={() => openExportModal('gmail')} 
                              disabled={isGmailLoading} 
                              title={language === 'vi' ? 'Tạo nháp Gmail' : 'Create Gmail Draft'}
                              className={`group flex items-center justify-center font-extrabold font-display h-9 px-3 hover:px-4 rounded-full text-xs transition-all duration-300 active:scale-95 border-t border-white/20 select-none overflow-hidden cursor-pointer ${
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
                                <span className="ml-1.5 text-[11px]">
                                  {isGmailLoading 
                                    ? (language === 'vi' ? 'Đang tạo...' : 'Drafting...') 
                                    : draftCreated 
                                      ? (language === 'vi' ? 'Đã tạo nháp!' : 'Drafted!')
                                      : 'Gmail'}
                                </span>
                            </button>

                            <button 
                              onClick={() => openExportModal('drive')} 
                              disabled={isDriveLoading} 
                              title={language === 'vi' ? 'Lưu Google Drive' : 'Save to Google Drive'}
                              className={`group flex items-center justify-center font-extrabold font-display h-9 px-3 hover:px-4 rounded-full text-xs transition-all duration-300 active:scale-95 border-t border-white/20 select-none overflow-hidden cursor-pointer ${
                                driveFileUrl 
                                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white shadow-[0_8px_20px_-4px_rgba(245,158,11,0.3)]'
                                  : 'bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white shadow-[0_8px_20px_-4px_rgba(99,102,241,0.3)] disabled:bg-slate-300 disabled:cursor-wait'
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
                            <button
                                onClick={() => setIsFullscreen(!isFullscreen)}
                                className={`w-full sm:w-auto h-10 text-xs font-bold font-sans px-5 sm:px-6 rounded-full transition-all duration-300 border-2 active:scale-95 flex items-center justify-center space-x-2.5 cursor-pointer shadow-sm ${
                                    isFullscreen 
                                        ? 'bg-emerald-50/90 border-emerald-500/40 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500/60 shadow-[0_4px_12px_rgba(16,185,129,0.08)]' 
                                        : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                }`}
                            >
                                {isFullscreen ? (
                                    <>
                                        <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0l5 0M4 4l0 5m11 0l5-5m0 0l-5 0m5 0l0 5m0 6l-5 5m5 0l0-5m0 5l-5 0M4 20l5-5m-5 5l0-5m0 5l5 0" />
                                        </svg>
                                        <span>{t('exitFullscreen')}</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4 text-sky-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0L15 15" />
                                        </svg>
                                        <span>{t('fullscreen')}</span>
                                    </>
                                )}
                            </button>

                            {setIsFocusMode && (
                                <button
                                    onClick={() => setIsFocusMode(!isFocusMode)}
                                    className={`w-full sm:w-auto h-10 text-xs font-bold font-sans px-5 sm:px-6 rounded-full transition-all duration-300 border-2 active:scale-95 flex items-center justify-center space-x-2.5 cursor-pointer shadow-sm ${
                                        isFocusMode 
                                            ? 'bg-indigo-50/90 border-indigo-500/40 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-500/60 shadow-[0_4px_12px_rgba(99,102,241,0.08)]' 
                                            : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                    }`}
                                >
                                    {isFocusMode ? (
                                        <>
                                            <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                                            </svg>
                                            <span>
                                                {language === 'vi' ? 'Xem lịch sử' : 'Show History'}
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <circle cx="12" cy="12" r="10" />
                                                <circle cx="12" cy="12" r="6" />
                                                <circle cx="12" cy="12" r="2" />
                                            </svg>
                                            <span>
                                                {language === 'vi' ? 'Chế độ tập trung' : 'Focus Mode'}
                                            </span>
                                        </>
                                    )}
                                </button>
                            )}
                            <button
                                onClick={() => setViewMode(viewMode === 'report' ? 'transcript' : 'report')}
                                className="w-full sm:w-auto h-10 text-xs text-slate-700 bg-white hover:bg-slate-50/90 hover:text-slate-900 font-bold font-sans px-5 sm:px-6 rounded-full transition-all duration-300 border-2 border-slate-200 hover:border-slate-350 active:scale-95 flex items-center justify-center space-x-2.5 shadow-sm shadow-slate-100"
                            >
                                {viewMode === 'report' ? (
                                  <>
                                    <svg className="w-4 h-4 text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                    <span>{t('viewEditTranscript')}</span>
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-4 h-4 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span>{t('viewReport')}</span>
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

        <div className="p-4 sm:p-6 md:p-8 lg:p-10">
            {viewMode === 'report' && result ? (
                <div className="space-y-8">
                    <ReportTabsView result={result} onUpdateResult={onUpdateResult} />
                </div>
            ) : (
                <TranscriptViewEditor {...props} />
            )}
        </div>

        {/* Export Template Selection Modal */}
        <AnimatePresence>
          {isExportModalOpen && (
            <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in overflow-y-auto">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ duration: 0.2 }}
                className="relative w-full max-w-2xl bg-white/95 backdrop-blur-2xl rounded-3xl shadow-[0_25px_70px_rgba(15,23,42,0.25)] border border-white/80 overflow-hidden flex flex-col my-auto"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-sky-50/50">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-sky-500 flex items-center justify-center text-white shadow-md shadow-indigo-200 flex-shrink-0">
                      <DownloadIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-slate-800 tracking-tight font-display">
                        {t('exportModalTitle')}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t('exportModalSubtitle')}
                      </p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsExportModalOpen(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 sm:p-6 space-y-6 max-h-[72vh] overflow-y-auto custom-scrollbar">
                  
                  {/* Section 1: Choose Template */}
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                      <span>{t('templateTitle')}</span>
                    </label>

                    <div className="grid grid-cols-1 gap-3">
                      
                      {/* Option 1: Standard MoM */}
                      <button
                        type="button"
                        onClick={() => setSelectedTemplate('standard')}
                        className={`relative text-left p-4 rounded-2xl border transition-all duration-200 flex items-start space-x-3.5 cursor-pointer ${
                          selectedTemplate === 'standard'
                            ? 'bg-gradient-to-r from-sky-50/90 to-indigo-50/80 border-sky-500 shadow-md ring-2 ring-sky-400/40'
                            : 'bg-white hover:bg-slate-50/80 border-slate-200/80 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 mt-0.5 ${
                          selectedTemplate === 'standard' ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                        }`}>
                          📋
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-slate-800 font-display">
                              {t('templateStandardTitle')}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 flex-shrink-0">
                              {t('templateStandardBadge')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {t('templateStandardDesc')}
                          </p>
                        </div>
                        {selectedTemplate === 'standard' && (
                          <div className="w-5 h-5 rounded-full bg-sky-500 text-white flex items-center justify-center flex-shrink-0 self-center">
                            <CheckIcon className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>

                      {/* Option 2: Executive Brief */}
                      <button
                        type="button"
                        onClick={() => setSelectedTemplate('summary')}
                        className={`relative text-left p-4 rounded-2xl border transition-all duration-200 flex items-start space-x-3.5 cursor-pointer ${
                          selectedTemplate === 'summary'
                            ? 'bg-gradient-to-r from-amber-50/90 to-orange-50/80 border-amber-500 shadow-md ring-2 ring-amber-400/40'
                            : 'bg-white hover:bg-slate-50/80 border-slate-200/80 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 mt-0.5 ${
                          selectedTemplate === 'summary' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                        }`}>
                          ⚡
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-slate-800 font-display">
                              {t('templateSummaryTitle')}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                              {t('templateSummaryBadge')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {t('templateSummaryDesc')}
                          </p>
                        </div>
                        {selectedTemplate === 'summary' && (
                          <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center flex-shrink-0 self-center">
                            <CheckIcon className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>

                      {/* Option 3: Technical Detail */}
                      <button
                        type="button"
                        onClick={() => setSelectedTemplate('technical')}
                        className={`relative text-left p-4 rounded-2xl border transition-all duration-200 flex items-start space-x-3.5 cursor-pointer ${
                          selectedTemplate === 'technical'
                            ? 'bg-gradient-to-r from-indigo-50/90 to-violet-50/80 border-indigo-500 shadow-md ring-2 ring-indigo-400/40'
                            : 'bg-white hover:bg-slate-50/80 border-slate-200/80 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 mt-0.5 ${
                          selectedTemplate === 'technical' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600'
                        }`}>
                          🛠️
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-slate-800 font-display">
                              {t('templateTechnicalTitle')}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 flex-shrink-0">
                              {t('templateTechnicalBadge')}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {t('templateTechnicalDesc')}
                          </p>
                        </div>
                        {selectedTemplate === 'technical' && (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 self-center">
                            <CheckIcon className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>

                    </div>
                  </div>

                  {/* Section 2: Choose Export Format */}
                  <div className="space-y-3">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center space-x-1.5">
                      <span>{t('exportFormatTitle')}</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      
                      {/* Word */}
                      <button
                        type="button"
                        onClick={() => setSelectedFormat('docx')}
                        className={`p-3 rounded-xl border font-semibold text-xs transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                          selectedFormat === 'docx'
                            ? 'bg-sky-500 text-white border-sky-600 shadow-sm ring-2 ring-sky-300'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:bg-sky-50/50'
                        }`}
                      >
                        <span className="text-base">📄</span>
                        <span>Word (.docx)</span>
                      </button>

                      {/* Excel */}
                      <button
                        type="button"
                        onClick={() => setSelectedFormat('xlsx')}
                        className={`p-3 rounded-xl border font-semibold text-xs transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                          selectedFormat === 'xlsx'
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-300'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                        }`}
                      >
                        <span className="text-base">📊</span>
                        <span>Excel (.xlsx)</span>
                      </button>

                      {/* Gmail Draft */}
                      <button
                        type="button"
                        onClick={() => setSelectedFormat('gmail')}
                        className={`p-3 rounded-xl border font-semibold text-xs transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                          selectedFormat === 'gmail'
                            ? 'bg-rose-600 text-white border-rose-700 shadow-sm ring-2 ring-rose-300'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-rose-300 hover:bg-rose-50/50'
                        }`}
                      >
                        <span className="text-base">✉️</span>
                        <span>Gmail Draft</span>
                      </button>

                      {/* Google Drive */}
                      <button
                        type="button"
                        onClick={() => setSelectedFormat('drive')}
                        className={`p-3 rounded-xl border font-semibold text-xs transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                          selectedFormat === 'drive'
                            ? 'bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-300'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'
                        }`}
                      >
                        <span className="text-base">☁️</span>
                        <span>Google Drive</span>
                      </button>

                    </div>
                  </div>

                  {/* Section 3: Options */}
                  <div className="pt-2 border-t border-slate-100">
                    <label className="flex items-center space-x-3 cursor-pointer group select-none">
                      <input
                        type="checkbox"
                        checked={includeTranscriptOption}
                        onChange={(e) => setIncludeTranscriptOption(e.target.checked)}
                        className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                        {t('optionIncludeTranscript')}
                      </span>
                    </label>
                  </div>

                </div>

                {/* Modal Footer */}
                <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 font-medium hidden sm:block">
                    {language === 'vi' ? 'Sẵn sàng xuất file theo định dạng đã chọn.' : 'Ready to export in your selected template.'}
                  </div>
                  <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setIsExportModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 font-bold text-xs transition-colors cursor-pointer"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteExport}
                      disabled={isExporting || isGmailLoading || isDriveLoading}
                      className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-600 to-indigo-700 hover:from-sky-400 hover:to-indigo-600 text-white font-extrabold text-xs shadow-md shadow-sky-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center space-x-2 cursor-pointer"
                    >
                      {(isExporting || isGmailLoading || isDriveLoading) ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          <span>{t('exporting')}</span>
                        </>
                      ) : (
                        <>
                          <span>{t('btnExportNow')}</span>
                          <DownloadIcon className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>
    </div>
  );
};