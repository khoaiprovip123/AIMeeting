import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../i18n';
import { testFirestoreConnection, recoverFirestoreConnection } from '../services/firestoreService';
import { geminiService } from '../services/geminiService';

export const SystemDiagnostics: React.FC = () => {
  const { t, language } = useTranslation();
  
  // Status Types: 'checking' | 'healthy' | 'unresponsive' | 'error' | 'recovering' | 'quota-exceeded'
  const [firestoreStatus, setFirestoreStatus] = useState<'checking' | 'healthy' | 'unresponsive' | 'error' | 'recovering' | 'quota-exceeded'>('healthy');
  const [geminiStatus, setGeminiStatus] = useState<'checking' | 'healthy' | 'unresponsive' | 'error' | 'recovering' | 'quota-exceeded'>('healthy');
  
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(new Date());
  const [recoveryLog, setRecoveryLog] = useState<{ time: string; service: string; type: string }[]>([]);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<{ id: string; type: 'success' | 'warning' | 'info'; textVi: string; textEn: string } | null>(null);

  // New States for Full System Health Monitor Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [firestoreLatency, setFirestoreLatency] = useState<number | null>(null);
  const [geminiLatency, setGeminiLatency] = useState<number | null>(null);
  const [localStorageUsage, setLocalStorageUsage] = useState<{ kb: number; percentage: number; text: string; items: { key: string; size: number }[] }>({ kb: 0, percentage: 0, text: '0 KB', items: [] });
  const [isManualReconnecting, setIsManualReconnecting] = useState<boolean>(false);

  const checkIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const checkInProgressRef = useRef<boolean>(false);

  // Keep a mutable ref for geminiStatus to access the latest status inside intervals without closing over stale state
  const geminiStatusRef = useRef<string>(geminiStatus);
  useEffect(() => {
    geminiStatusRef.current = geminiStatus;
  }, [geminiStatus]);

  // Storage Stats Calculator
  const calculateLocalStorageStats = useCallback(() => {
    let totalBytes = 0;
    const items: { key: string; size: number }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        const itemSize = (key.length + value.length) * 2;
        totalBytes += itemSize;
        items.push({ key, size: itemSize });
      }
    }
    items.sort((a, b) => b.size - a.size);
    const kb = parseFloat((totalBytes / 1024).toFixed(2));
    const maxCapacity = 5120; // 5MB standard storage limit
    const percentage = parseFloat(Math.min((kb / maxCapacity) * 100, 100).toFixed(2));
    setLocalStorageUsage({
      kb,
      percentage,
      text: `${kb} KB / ${maxCapacity} KB`,
      items
    });
  }, []);

  // Translations dictionary for dynamic language support
  const localTranslation = {
    vi: {
      title: "Chẩn đoán hệ thống",
      lastCheck: "Kiểm tra lúc",
      firestore: "Firestore DB",
      gemini: "Gemini API Proxy",
      healthy: "Hoạt động tốt",
      unresponsive: "Không phản hồi (>10s)",
      error: "Sự cố kết nối",
      recovering: "Đang tự phục hồi...",
      checking: "Đang kiểm tra...",
      'quota-exceeded': "Hạn mức bị vượt quá (429)",
      runBtn: "Kiểm tra ngay",
      healingBtn: "Kích hoạt Phục hồi",
      autoRecoveryHeading: "Lịch sử Hệ thống tự Phục hồi",
      noRecoveryLogs: "Hệ thống đang hoạt động ổn định và chưa cần khởi chạy phục hồi.",
      alertFirestoreRecovered: "Kết nối dữ liệu đám mây Firestore đã được tự động tái lập và sẵn sàng ghi nhận lịch sử cuộc họp.",
      alertGeminiRecovered: "Kênh kết nối trí tuệ nhân tạo Gemini API đã được gỡ nghẽn và sẵn sàng hoạt động trở lại.",
      alertUnresponsiveDetected: "Hệ thống phát hiện kết nối đang gián đoạn hoặc phản hồi lâu hơn 10 giây. Đang thực thi cơ chế tự sửa lỗi...",
      alertAllHealthy: "Tất cả các tuyến dịch vụ kết nối (AI & Cloud DB) đều đang ở trạng thái tối ưu.",
      forceResetLog: "Đã thiết lập lại đường truyền mạng cục bộ.",
      modalTitle: "Bộ Giám Sát Sức Khỏe Hệ Thống",
      modalDesc: "Báo cáo thực tế độ trễ của AI Gemini, trạng thái Firestore Cloud DB và mức chiếm dụng dung lượng lưu trữ trình duyệt.",
      latency: "Độ trễ",
      storageUsage: "Dung lượng Trình duyệt",
      reconnectBtn: "Khôi phục Kết nối",
      reconnecting: "Đang khôi phục...",
      successReconnect: "Đã tái lập toàn bộ kênh truyền liên lạc thành công!",
      latencySuccess: "Khỏe mạnh",
      latencySlow: "Cảnh báo (>10s)",
      latencyOffline: "Lỗi kết nối",
      itemLabel: "Nhãn Khóa Bộ Nhớ",
      sizeLabel: "Dung lượng (Bytes)",
      emptyStorage: "Không tìm thấy bộ đệm làm việc cục bộ nào.",
      inspectBtn: "Thông số chi tiết",
      diskUsageDesc: "Bộ nhớ localStorage tối đa cho phép trên ứng dụng web là 5.0 MB (5,120 KB).",
      manualTriggerTitle: "Điều khiển Kênh Liên lạc",
      testMetrics: "Đo lường kiểm tra mới",
      clearCache: "Làm sạch Cache",
      clearedCacheSucceed: "Đã làm sạch bộ đệm cache cục bộ và giải phóng dung lượng bộ nhớ."
    },
    en: {
      title: "System Diagnostics",
      lastCheck: "Last checked",
      firestore: "Firestore DB",
      gemini: "Gemini API Proxy",
      healthy: "Healthy",
      unresponsive: "Unresponsive (>10s)",
      error: "Connection Error",
      recovering: "Self-healing...",
      checking: "Checking...",
      'quota-exceeded': "Quota Exceeded (429)",
      runBtn: "Check Now",
      healingBtn: "Trigger Recovery",
      autoRecoveryHeading: "Self-healing History Logs",
      noRecoveryLogs: "Connection channels are fully optimal. No recovery needed so far.",
      alertFirestoreRecovered: "Firestore cloud storage connection has been successfully self-healed and re-established.",
      alertGeminiRecovered: "Gemini AI connection has been cleared of blockages and is ready for use.",
      alertUnresponsiveDetected: "Detected connection lag/unresponsiveness over 10 seconds. Launching automated channel repair...",
      alertAllHealthy: "All network connection channels (Gemini API & Firestore DB) are fully healthy.",
      forceResetLog: "Forced local socket network recovery.",
      modalTitle: "System Health Monitor",
      modalDesc: "Real-time diagnostic metrics representing Gemini API latency thresholds, Cloud Firestore synchronization lines, and client-side physical storage quotas.",
      latency: "Latency",
      storageUsage: "Local Browser Storage",
      reconnectBtn: "Force Reconnection",
      reconnecting: "Reconnecting...",
      successReconnect: "All connection channels successfully re-established!",
      latencySuccess: "Healthy",
      latencySlow: "Lagging (>10s)",
      latencyOffline: "Offline / Error",
      itemLabel: "Storage Cache Key ID",
      sizeLabel: "Format Capacity (Bytes)",
      emptyStorage: "No passive session cached items inside Local Storage.",
      inspectBtn: "Full Health Monitor",
      diskUsageDesc: "Web architectures specify a maximum local persistent limit of 5.0 MB (5,120 KB) for security standard compliance.",
      manualTriggerTitle: "Connection Overrides & Control",
      testMetrics: "Run Live Tests",
      clearCache: "Wipe Local Cache",
      clearedCacheSucceed: "Successfully evicted cached session profiles and reclaimed memory space."
    }
  };

  const getTranslation = useCallback((key: keyof typeof localTranslation.vi) => {
    const lang = language === 'vi' ? 'vi' : 'en';
    return (localTranslation[lang] as any)[key] || (localTranslation.en as any)[key] || String(key);
  }, [language]);

  // Alert Manager
  const triggerAlert = (type: 'success' | 'warning' | 'info', textVi: string, textEn: string) => {
    const id = Math.random().toString(36).substring(7);
    setAlertMessage({ id, type, textVi, textEn });
    
    // Auto clear alert in 6 seconds
    setTimeout(() => {
      setAlertMessage((current) => current?.id === id ? null : current);
    }, 6500);
  };

  // Heartbeat check with strict 10 second timeout threshold and real-time latency recording
  const runHeartbeatCheck = async (isManual: boolean = false) => {
    if (checkInProgressRef.current) return;
    checkInProgressRef.current = true;
    
    setFirestoreStatus(prev => prev === 'recovering' ? 'recovering' : 'checking');
    
    // If Gemini is rate-limited/quota-exceeded, skip testing if it's an automatic background check
    const skipGemini = !isManual && geminiStatusRef.current === 'quota-exceeded';
    if (!skipGemini) {
      setGeminiStatus(prev => prev === 'recovering' ? 'recovering' : 'checking');
    }
    
    // Calculate local storage size
    calculateLocalStorageStats();
    
    // 1. Check Firestore Heartbeat with 10 seconds threshold limit and compute latency
    const firestoreCheckPromise = (async () => {
      const startTime = Date.now();
      try {
        await testFirestoreConnection();
        const duration = Date.now() - startTime;
        setFirestoreLatency(duration);
        if (duration > 10000) {
          throw new Error("unresponsive");
        }
        setFirestoreStatus('healthy');
        return 'healthy';
      } catch (err: any) {
        setFirestoreLatency(null);
        if (err?.message === "unresponsive") {
          setFirestoreStatus('unresponsive');
          return 'unresponsive';
        }
        setFirestoreStatus('error');
        return 'error';
      }
    })();

    // 2. Check Gemini Heartbeat with 10 seconds threshold limit and compute latency
    const geminiCheckPromise = (async () => {
      if (skipGemini) {
        return 'quota-exceeded';
      }
      
      const startTime = Date.now();
      let timeoutHandle: NodeJS.Timeout | null = null;
      
      const timeoutPromise = new Promise<'unresponsive'>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve('unresponsive');
        }, 10000);
      });

      const actualCall = (async () => {
        try {
          await geminiService.testGeminiConnection();
          const duration = Date.now() - startTime;
          setGeminiLatency(duration);
          return 'healthy';
        } catch (err: any) {
          const errMsg = err?.message || '';
          const errStr = String(err);
          const isQuota = errMsg.includes('429') || 
                          errMsg.includes('RESOURCE_EXHAUSTED') || 
                          errMsg.includes('Quota') || 
                          errMsg.includes('quota') || 
                          errMsg.includes('limit') || 
                          errMsg.includes('Limit') ||
                          errStr.includes('429') ||
                          errStr.includes('RESOURCE_EXHAUSTED') ||
                          JSON.stringify(err).includes('429') ||
                          JSON.stringify(err).includes('RESOURCE_EXHAUSTED');
          if (isQuota) {
            return 'quota-exceeded';
          }
          return 'error';
        }
      })();

      const result = await Promise.race([actualCall, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      
      if (result === 'unresponsive') {
        setGeminiLatency(null);
        setGeminiStatus('unresponsive');
        return 'unresponsive';
      } else if (result === 'quota-exceeded') {
        setGeminiLatency(null);
        setGeminiStatus('quota-exceeded');
        return 'quota-exceeded';
      } else if (result === 'error') {
        setGeminiLatency(null);
        setGeminiStatus('error');
        return 'error';
      } else {
        setGeminiStatus('healthy');
        return 'healthy';
      }
    })();

    const [fsRes, gemRef] = await Promise.all([firestoreCheckPromise, geminiCheckPromise]);
    setLastCheckTime(new Date());
    checkInProgressRef.current = false;

    // Detect 429 quota specifically to alert the user directly with zero recovery attempts
    if (gemRef === 'quota-exceeded') {
      triggerAlert(
        'warning',
        'Phát hiện vượt quá hạn mức sử dụng (429 RESOURCE_EXHAUSTED) của Gemini API. Toàn bộ tính năng AI tạm ngắt kết nối cho đến khi chu kỳ hạn mức hồi phục.',
        'Detected Gemini API quota/rate limit (429 RESOURCE_EXHAUSTED). AI operations paused until current period reset.'
      );
    } else if (fsRes === 'unresponsive' || fsRes === 'error' || gemRef === 'unresponsive' || gemRef === 'error') {
      // For general latency lapses, trigger automated channel repair
      triggerAlert(
        'warning',
        localTranslation.vi.alertUnresponsiveDetected,
        localTranslation.en.alertUnresponsiveDetected
      );
      
      // Auto cure corresponding connection
      if (fsRes === 'unresponsive' || fsRes === 'error') {
        await cureFirestore();
      }
      if (gemRef === 'unresponsive' || gemRef === 'error') {
        await cureGemini();
      }
    }
  };

  // Recover Firestore
  const cureFirestore = async () => {
    setFirestoreStatus('recovering');
    try {
      await recoverFirestoreConnection();
      setFirestoreStatus('healthy');
      
      // Add log
      setRecoveryLog((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          service: 'Cloud Storage (Firestore)',
          type: 'SOCKET_RESET'
        },
        ...prev
      ]);
      
      triggerAlert(
        'success',
        localTranslation.vi.alertFirestoreRecovered,
        localTranslation.en.alertFirestoreRecovered
      );
    } catch (e) {
      setFirestoreStatus('error');
    }
  };

  // Recover Gemini
  const cureGemini = async () => {
    // If rate-limited, skip triggering recovery since network warming would just issue more requests
    if (geminiStatusRef.current === 'quota-exceeded') {
      return;
    }
    
    setGeminiStatus('recovering');
    try {
      await geminiService.recoverGeminiConnection();
      setGeminiStatus('healthy');
      
      // Add log
      setRecoveryLog((prev) => [
        {
          time: new Date().toLocaleTimeString(),
          service: 'Gemini Generative API',
          type: 'TLS_SESSION_WARM'
        },
        ...prev
      ]);
      
      triggerAlert(
        'success',
        localTranslation.vi.alertGeminiRecovered,
        localTranslation.en.alertGeminiRecovered
      );
    } catch (e) {
      setGeminiStatus('error');
    }
  };

  // Manual Full Reset Healing Option
  const triggerManualHealing = async () => {
    triggerAlert('info', 'Đang thiết lập lại đường truyền hệ thống...', 'Resetting full connection channels...');
    await cureFirestore();
    if (geminiStatusRef.current !== 'quota-exceeded') {
      await cureGemini();
    } else {
      triggerAlert(
        'warning',
        'Bỏ qua tự phục hồi kết nối Gemini do tài khoản đang chạm hạn mức tối đa (429). Tránh ghi đè thêm lưu lượng mới.',
        'Bypassing Gemini connection recovery as the current quota is exhausted (429). Advised to withhold sending requests.'
      );
    }
  };

  useEffect(() => {
    // Run diagnostics immediately on mount
    runHeartbeatCheck();

    // Check every 180 seconds (3 minutes) instead of 30 seconds to dramatically protect API quotas
    checkIntervalRef.current = setInterval(() => {
      // Skip background diagnostics in inactive browser tabs to save developer quota extremely heavily
      if (document.hidden) return;
      runHeartbeatCheck();
    }, 180000);

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-500 shadow-emerald-500/30';
      case 'checking':
        return 'bg-sky-400 animate-pulse';
      case 'recovering':
        return 'bg-violet-500 animate-bounce shadow-violet-500/30';
      case 'unresponsive':
        return 'bg-amber-500 animate-pulse shadow-amber-500/30';
      case 'quota-exceeded':
        return 'bg-amber-600 shadow-amber-600/30';
      case 'error':
        return 'bg-rose-500 shadow-rose-500/30';
      default:
        return 'bg-slate-400';
    }
  };

  const getBadgeStyle = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-emerald-50 text-emerald-700 border-emerald-150';
      case 'checking':
        return 'bg-sky-50 text-sky-700 border-sky-150 animate-pulse';
      case 'recovering':
        return 'bg-violet-50 text-violet-700 border-violet-150';
      case 'unresponsive':
        return 'bg-amber-50 text-amber-700 border-amber-150';
      case 'quota-exceeded':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'error':
        return 'bg-rose-50 text-rose-700 border-rose-150';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-150';
    }
  };

  return (
    <>
      {/* Toast Alert Banner for connection state changes */}
      {alertMessage && (
        <div 
          className="fixed bottom-6 left-6 z-50 flex max-w-md items-center gap-3.5 bg-white/95 backdrop-blur-md px-5 py-4 border border-slate-200/60 rounded-2xl shadow-xl animate-slideUp transition-all duration-300"
          id="diagnostic-alert-toast"
        >
          <div className={`p-2 rounded-xl text-white flex-shrink-0 ${
            alertMessage.type === 'success' ? 'bg-emerald-500 shadow-sm shadow-emerald-500/20' : 
            alertMessage.type === 'warning' ? 'bg-amber-500 shadow-sm shadow-amber-500/20 animate-bounce' : 
            'bg-sky-500 shadow-sm shadow-sky-500/20'
          }`}>
            {alertMessage.type === 'success' && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {alertMessage.type === 'warning' && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {alertMessage.type === 'info' && (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div className="flex-grow">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
              {language === 'vi' ? 'Hệ thống tự động chẩn đoán' : 'Diagnostics Auto-Cure'}
            </h4>
            <p className="text-slate-700 text-xs font-semibold leading-relaxed mt-1 select-none font-sans">
              {language === 'vi' ? alertMessage.textVi : alertMessage.textEn}
            </p>
          </div>
          <button 
            onClick={() => setAlertMessage(null)}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Miniature Floating Widget Pill (Collapsible Dashboard for Developer / Admin / Health Monitoring) */}
      <div 
        className="fixed bottom-6 right-6 z-50 flex flex-col items-end"
        id="diagnostics-float-widget"
      >
        {isExpanded ? (
          <div className="w-80 bg-white border border-slate-200/70 rounded-[24px] shadow-2xl overflow-hidden animate-fadeIn select-none">
            {/* Header */}
            <div className="bg-slate-905 flex items-center justify-between p-4 border-b border-slate-800/25" style={{ backgroundColor: '#1e293b' }}>
              <div className="flex items-center space-x-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="font-bold text-xs text-white uppercase tracking-wider font-display">
                  {getTranslation('title')}
                </span>
              </div>
              <button 
                onClick={() => setIsExpanded(false)}
                className="text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Connection Check statuses */}
            <div className="p-4 space-y-3.5">
              {/* Firestore */}
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/50 rounded-2xl">
                <span className="text-xs font-bold text-slate-600">{getTranslation('firestore')}</span>
                <div className={`flex items-center space-x-1.5 px-2.5 py-0.75 text-[10px] font-black uppercase rounded-lg border ${getBadgeStyle(firestoreStatus)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(firestoreStatus)}`}></span>
                  <span>{getTranslation(firestoreStatus)}</span>
                </div>
              </div>

              {/* Gemini */}
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/50 rounded-2xl">
                <span className="text-xs font-bold text-slate-600">{getTranslation('gemini')}</span>
                <div className={`flex items-center space-x-1.5 px-2.5 py-0.75 text-[10px] font-black uppercase rounded-lg border ${getBadgeStyle(geminiStatus)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(geminiStatus)}`}></span>
                  <span>{getTranslation(geminiStatus)}</span>
                </div>
              </div>

              {/* Time stamp */}
              <div className="text-[10px] font-medium text-slate-400 text-right font-mono px-1">
                {getTranslation('lastCheck')}: {lastCheckTime ? lastCheckTime.toLocaleTimeString() : '--:--:--'}
              </div>

              {/* Recovery Log area */}
              <div className="border-t border-slate-100 pt-3 mt-1">
                <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 font-mono">
                  {getTranslation('autoRecoveryHeading')}
                </h5>
                <div className="max-h-24 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin text-[10.5px]">
                  {recoveryLog.length === 0 ? (
                    <div className="text-slate-400 text-center py-2 italic font-medium leading-relaxed bg-slate-50 border border-slate-150 rounded-xl px-2.5">
                      {getTranslation('noRecoveryLogs')}
                    </div>
                  ) : (
                    recoveryLog.map((log, index) => (
                      <div key={index} className="flex justify-between items-start gap-2 bg-slate-50 border border-slate-150 p-2 rounded-xl leading-normal text-slate-600 font-mono">
                        <span className="font-extrabold text-indigo-600">{log.time}</span>
                        <div className="text-right truncate font-sans font-semibold">
                          <span className="text-slate-800">{log.service}</span>
                          <span className="text-[8.5px] font-mono px-1 py-0.25 bg-slate-200/70 border border-slate-300/40 rounded-md text-slate-500 block text-right mt-0.5 ml-auto w-max">{log.type}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => runHeartbeatCheck(true)}
                    disabled={firestoreStatus === 'checking' || firestoreStatus === 'recovering' || geminiStatus === 'checking' || geminiStatus === 'recovering'}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xxs py-1.5 px-2 rounded-xl transition-all duration-200 cursor-pointer text-center text-[10.5px] disabled:opacity-50"
                  >
                    {getTranslation('runBtn')}
                  </button>
                  <button 
                    onClick={triggerManualHealing}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xxs py-1.5 px-2 rounded-xl transition-all duration-200 cursor-pointer text-center text-[10.5px] shadow-sm shadow-indigo-600/10"
                  >
                    {getTranslation('healingBtn')}
                  </button>
                </div>
                <button 
                  onClick={() => {
                    setIsModalOpen(true);
                    calculateLocalStorageStats();
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black text-xxs py-2 px-2.5 rounded-xl transition-all duration-200 cursor-pointer text-center text-[10.5px] flex items-center justify-center space-x-1.5 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                  </svg>
                  <span>{getTranslation('inspectBtn')}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setIsExpanded(true)}
            className="flex items-center space-x-2 bg-white hover:bg-slate-50 border border-slate-200/80 p-2.5 px-4.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer select-none ring-4 ring-slate-100/40 active:scale-95 group"
            title={getTranslation('title')}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                firestoreStatus === 'healthy' && geminiStatus === 'healthy' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                firestoreStatus === 'healthy' && geminiStatus === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}></span>
            </span>
            <span className="font-extrabold text-[11px] text-slate-700 uppercase tracking-widest font-mono">
              {getTranslation('title')}
            </span>
          </button>
        )}
      </div>

      {/* Dedicated System Health Detailed Diagnostic Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn select-none"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="relative w-full max-w-2xl bg-white border border-slate-200/90 rounded-[28px] shadow-2xl p-6 sm:p-8 animate-scaleIn transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Cross icon */}
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Title & Description Headers */}
            <div className="flex items-start space-x-4 mb-6">
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl text-indigo-600 shrink-0 shadow-sm">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight font-display">
                  {getTranslation('modalTitle')}
                </h3>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                  {getTranslation('modalDesc')}
                </p>
              </div>
            </div>

            {/* Real-time Connection Latency Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {/* Gemini API Proxy Latency card */}
              <div className="bg-slate-50 border border-slate-200/55 rounded-2xl p-4.5 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase">{getTranslation('gemini')}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(geminiStatus)}`}></span>
                  </div>
                  <div className="flex items-baseline space-x-1.5 mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight font-mono">
                      {geminiLatency !== null ? `${geminiLatency} ms` : '--'}
                    </span>
                    {geminiLatency !== null && (
                      <span className="text-[9px] uppercase font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 font-mono">
                        {getTranslation('latencySuccess')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/40">
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        geminiStatus === 'healthy' ? 'bg-emerald-500' :
                        geminiStatus === 'unresponsive' ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${geminiLatency ? Math.min((geminiLatency / 4000) * 100, 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1.5 block font-mono">Max limit threshold: 10,000ms</span>
                </div>
              </div>

              {/* Firestore Cloud storage latency card */}
              <div className="bg-slate-50 border border-slate-200/55 rounded-2xl p-4.5 flex flex-col justify-between shadow-sm">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase">{getTranslation('firestore')}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(firestoreStatus)}`}></span>
                  </div>
                  <div className="flex items-baseline space-x-1.5 mt-2">
                    <span className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight font-mono">
                      {firestoreLatency !== null ? `${firestoreLatency} ms` : '--'}
                    </span>
                    {firestoreLatency !== null && (
                      <span className="text-[9px] uppercase font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 font-mono">
                        {getTranslation('latencySuccess')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/40">
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        firestoreStatus === 'healthy' ? 'bg-emerald-500' :
                        firestoreStatus === 'unresponsive' ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${firestoreLatency ? Math.min((firestoreLatency / 4000) * 100, 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1.5 block font-mono">Max limit threshold: 10,000ms</span>
                </div>
              </div>
            </div>

            {/* Storage Quota Inspector */}
            <div className="bg-slate-50 border border-slate-200/55 rounded-2xl p-5 mb-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono flex items-center">
                  <svg className="w-4 h-4 mr-1.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  {getTranslation('storageUsage')}
                </h4>
                <span className="text-xs font-bold text-slate-700 font-mono bg-white border border-slate-200 px-2 py-0.75 rounded-lg shadow-sm">
                  {localStorageUsage.text}
                </span>
              </div>

              {/* Progress limit bar */}
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden mb-2.5 relative shadow-inner">
                <div 
                  className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${
                    localStorageUsage.percentage > 85 ? 'from-amber-500 to-rose-500' :
                    localStorageUsage.percentage > 50 ? 'from-sky-500 to-amber-500' :
                    'from-sky-500 to-indigo-600'
                  }`}
                  style={{ width: `${localStorageUsage.percentage}%` }}
                />
              </div>

              <p className="text-[10px] text-slate-400 leading-normal mb-4 font-sans font-semibold">
                {getTranslation('diskUsageDesc')}
              </p>

              {/* Local Storage Keys Inspector */}
              <div className="max-h-36 overflow-y-auto border border-slate-200/60 bg-white rounded-xl divide-y divide-slate-100 scrollbar-thin">
                {localStorageUsage.items.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400 italic">
                    {getTranslation('emptyStorage')}
                  </div>
                ) : (
                  localStorageUsage.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 text-xs">
                      <div className="flex items-center space-x-2 truncate pr-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <span className="font-mono font-bold text-slate-700 truncate" title={item.key}>{item.key}</span>
                      </div>
                      <span className="font-mono text-[10.5px] font-black text-slate-500 shrink-0">{item.size.toLocaleString()} B</span>
                    </div>
                  ))
                )}
              </div>

              {/* Clear Cache Trigger */}
              {localStorageUsage.items.length > 0 && (
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => {
                      if (window.confirm(language === 'vi' ? 'Bạn có chắc chắn muốn giải phóng bộ đệm lưu trữ phiên làm việc của trình duyệt?' : 'Are you sure you want to evict user browser cache memory?')) {
                        localStorage.clear();
                        calculateLocalStorageStats();
                        triggerAlert('success', localTranslation.vi.clearedCacheSucceed, localTranslation.en.clearedCacheSucceed);
                      }
                    }}
                    className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 font-bold text-[10px] font-mono px-2.5 py-1 rounded-lg border border-rose-200/50 transition-colors cursor-pointer select-none"
                  >
                    {getTranslation('clearCache')}
                  </button>
                </div>
              )}
            </div>

            {/* Manual Commands & Reconnection Overrides */}
            <div className="border-t border-slate-100 pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h5 className="text-[11px] font-black uppercase tracking-wider text-slate-400 font-mono">
                  {getTranslation('manualTriggerTitle')}
                </h5>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Last verified: {lastCheckTime ? lastCheckTime.toLocaleString() : '--'}
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button 
                  onClick={async () => {
                    setIsManualReconnecting(true);
                    triggerAlert('info', 'Đang phân tích phản hồi kết nối...', 'Measuring real-time throughput responses...');
                    await runHeartbeatCheck(true);
                    setIsManualReconnecting(false);
                  }}
                  disabled={isManualReconnecting}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-4 rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 font-sans"
                >
                  {getTranslation('testMetrics')}
                </button>
                <button 
                  onClick={async () => {
                    setIsManualReconnecting(true);
                    triggerAlert('info', 'Khởi tạo dọn dẹp cổng kết nối cục bộ...', 'Resetting full connection sockets...');
                    await triggerManualHealing();
                    setIsManualReconnecting(false);
                    triggerAlert(
                      'success',
                      localTranslation.vi.successReconnect,
                      localTranslation.en.successReconnect
                    );
                  }}
                  disabled={isManualReconnecting}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-all duration-200 cursor-pointer shadow-md shadow-indigo-600/10 font-sans disabled:opacity-50"
                >
                  {isManualReconnecting ? getTranslation('reconnecting') : getTranslation('reconnectBtn')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
