
import React, { useState, useCallback, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { Loader } from './components/Loader';
import { AnalysisView } from './components/AnalysisView';
import { geminiService } from './services/geminiService';
import type { AnalysisResult, TranscriptSegment } from './types';
import { Header } from './components/Header';
import { ErrorDisplay } from './components/ErrorDisplay';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useTranslation } from './i18n';
import { initAuth } from './services/googleAuthService';
import { saveMeeting } from './services/firestoreService';
import { MeetingHistory } from './components/MeetingHistory';
import type { User } from 'firebase/auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SystemDiagnostics } from './components/SystemDiagnostics';
import { AuthScreen } from './components/AuthScreen';

export default function App(): React.ReactNode {
  const [files, setFiles] = useState<File[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[] | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisHint, setAnalysisHint] = useState<string>('');
  const [isFocusMode, setIsFocusMode] = useState<boolean>(true);
  const { t, language } = useTranslation();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [activeMeetingId, setActiveMeetingId] = useState<string | undefined>(undefined);
  const [activeMeetingAudioName, setActiveMeetingAudioName] = useState<string | null>(null);
  const [refreshHistoryTrigger, setRefreshHistoryTrigger] = useState<number>(0);
  const [isAutoMergeSelected, setIsAutoMergeSelected] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setCurrentUser(user);
        setAuthChecking(false);
      },
      () => {
        setCurrentUser(null);
        setAuthChecking(false);
      }
    );
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Clean up the object URL when the component unmounts or the URL changes.
    return () => {
        if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
        }
    };
  }, [audioUrl]);

  const handleFileSelect = (selectedFiles: File[]): void => {
    // Max file size: 200MB per file
    const isTooLarge = selectedFiles.some(f => f.size > 200 * 1024 * 1024);
    if (isTooLarge) {
      setError(t('fileTooLargeError'));
      return;
    }
    setError(null);
    setFiles(selectedFiles);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(URL.createObjectURL(selectedFiles[0]));
    setTranscript(null);
    setAnalysisResult(null);
  };

  const handleStartQueueProcessing = useCallback(async () => {
    if (files.length === 0) return;

    setIsLoading(true);
    setLoadingMessage(t('loadingPrepareFile'));
    setProgressPercent(5);
    setError(null);

    try {
      const generatedMeetings: any[] = [];
      let consolidatedSegments: TranscriptSegment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // 1. Transcribe the current segment file
        setLoadingMessage(language === 'vi' 
          ? `[Phần ${i + 1}/${files.length}] Đang dịch tệp thoại: ${file.name}...` 
          : `[Part ${i + 1}/${files.length}] Transcribing audio: ${file.name}...`
        );
        setProgressPercent(Math.round((i / files.length) * 100) + 5);

        const onProgress = (progress: { chunk: number, totalChunks: number }) => {
          const chunkProgress = (progress.chunk - 0.5) / progress.totalChunks;
          const relativeStep = (i + chunkProgress * 0.7) / files.length;
          setProgressPercent(Math.round(relativeStep * 90));
          setLoadingMessage(language === 'vi'
            ? `Dịch âm thanh phần ${i + 1}/${files.length} (${file.name}): Đoạn ${progress.chunk}/${progress.totalChunks}...`
            : `Transcribing part ${i + 1}/${files.length} (${file.name}): Chunk ${progress.chunk}/${progress.totalChunks}...`
          );
        };

        const result = await geminiService.transcribeAudio(file, language, onProgress, 0);
        
        if (!result.segments || result.segments.length === 0) {
          throw new Error(language === 'vi' 
            ? `Không phân tách được giọng nói trong: ${file.name}` 
            : `Could not transcribe speech in: ${file.name}`
          );
        }

        // 2. Analyze the current file transcript
        setLoadingMessage(language === 'vi'
          ? `[Phần ${i + 1}/${files.length}] AI đang phân tích sơ bộ: ${file.name}...`
          : `[Part ${i + 1}/${files.length}] AI is analyzing transcript: ${file.name}...`
        );
        const relativeAnalyzeStep = (i + 0.8) / files.length;
        setProgressPercent(Math.round(relativeAnalyzeStep * 90));

        const segmentTranscriptText = result.segments.map(s => s.text).join('\n');
        const segmentAnalysis = await geminiService.analyzeTranscript(segmentTranscriptText, language, analysisHint);

        // 3. Save current segment as its own historic meeting item
        if (currentUser) {
          const subMeetingId = 'm_sub_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
          await saveMeeting(subMeetingId, language, segmentAnalysis, result.segments, file.name);
          
          const virtualDoc = {
            id: subMeetingId,
            createdAt: new Date().toISOString(),
            language,
            transcript: result.segments,
            result: segmentAnalysis,
            audioFileName: file.name
          };
          generatedMeetings.push(virtualDoc);
        }
        
        consolidatedSegments = consolidatedSegments.concat(result.segments);
      }

      setRefreshHistoryTrigger(prev => prev + 1);

      // 4. Auto-merge if checked and there are multiple files
      if (isAutoMergeSelected && generatedMeetings.length >= 2) {
        setLoadingMessage(language === 'vi'
          ? `🔄 Đang tự động gộp báo cáo thống nhất từ ${generatedMeetings.length} phần...`
          : `🔄 Automatically merging and synthesizing report from ${generatedMeetings.length} parts...`
        );
        setProgressPercent(95);

        const meetingsPayload = generatedMeetings.map(m => ({
          title: m.result?.overview?.topic || m.audioFileName || 'Meeting Part',
          date: new Date().toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US'),
          result: m.result
        }));

        const mergedResult = await geminiService.mergeMeetingSummaries(meetingsPayload, language, '');

        if (currentUser) {
          const mergeId = 'm_merged_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
          const label = language === 'vi'
            ? `Báo cáo tổng hợp (${generatedMeetings.length} phần)`
            : `Synthesized report (${generatedMeetings.length} parts)`;

          await saveMeeting(mergeId, language, mergedResult, consolidatedSegments, label);
          setActiveMeetingId(mergeId);
          setActiveMeetingAudioName(label);
        }

        setAnalysisResult(mergedResult);
        setTranscript(consolidatedSegments);
        setRefreshHistoryTrigger(prev => prev + 1);
      } else if (generatedMeetings.length > 0) {
        // Show the processed/last item
        const lastM = generatedMeetings[generatedMeetings.length - 1];
        setActiveMeetingId(lastM.id);
        setActiveMeetingAudioName(lastM.audioFileName);
        setTranscript(lastM.transcript);
        setAnalysisResult(lastM.result);
      } else {
        // Non-saved fallback state
        setTranscript(consolidatedSegments);
      }

      setFiles([]);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : (language === 'vi' ? 'Lỗi xử lý hàng loạt.' : 'Error during batch processing.'));
    } finally {
      setIsLoading(false);
      setProgressPercent(null);
    }
  }, [files, language, currentUser, analysisHint, isAutoMergeSelected, t]);


  const handleAnalyze = useCallback(async () => {
    if (!transcript) return;
    
    setIsLoading(true);
    setLoadingMessage(t('loadingAnalyzing'));
    setProgressPercent(0);
    setError(null);

    const fullTranscriptText = transcript.map(segment => segment.text).join('\n');

    let progressInterval: NodeJS.Timeout | null = null;
    progressInterval = setInterval(() => {
      setProgressPercent(prev => {
        if (prev === null) return 0;
        if (prev >= 95) {
          if (prev >= 98) return prev;
          return prev + 1;
        }
        return prev + Math.floor(Math.random() * 5) + 3;
      });
    }, 400);

    try {
      const result = await geminiService.analyzeTranscript(fullTranscriptText, language, analysisHint);
      setAnalysisResult(result);

      if (currentUser) {
        const meetingId = activeMeetingId || ('m_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now());
        const audioName = files[0]?.name || activeMeetingAudioName || null;
        try {
          await saveMeeting(meetingId, language, result, transcript, audioName);
          setActiveMeetingId(meetingId);
          setRefreshHistoryTrigger(prev => prev + 1);
        } catch (saveError) {
          console.error("Auto-save analysis to Firestore failed:", saveError);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : t('analysisGenericError'));
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setProgressPercent(null);
      setIsLoading(false);
    }
  }, [transcript, t, language, analysisHint, currentUser, files, activeMeetingId, activeMeetingAudioName]);

  const handleUpdateResult = useCallback(async (updated: AnalysisResult) => {
    setAnalysisResult(updated);
    if (currentUser && activeMeetingId) {
      const audioName = files[0]?.name || activeMeetingAudioName || null;
      try {
        await saveMeeting(activeMeetingId, language, updated, transcript || [], audioName);
        setRefreshHistoryTrigger(prev => prev + 1);
      } catch (saveError) {
        console.error("Auto-save updated analysis to Firestore failed:", saveError);
      }
    }
  }, [currentUser, activeMeetingId, files, activeMeetingAudioName, language, transcript]);

  const handleReset = (): void => {
    setFiles([]);
    setTranscript(null);
    setAnalysisResult(null);
    setError(null);
    setIsLoading(false);
    setProgressPercent(null);
    setAnalysisHint('');
    setActiveMeetingId(undefined);
    setActiveMeetingAudioName(null);
    if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
  };

  const handleSelectHistoricalMeeting = useCallback((meeting: any) => {
    setActiveMeetingId(meeting.id);
    setAnalysisResult(meeting.result || null);
    setTranscript(meeting.transcript);
    setActiveMeetingAudioName(meeting.audioFileName || null);
    setFiles([]);
  }, []);

  const handleMergeMeetings = useCallback(async (selectedMeetings: any[], instruction: string) => {
    if (selectedMeetings.length < 2) return;
    
    setIsLoading(true);
    setLoadingMessage(language === 'vi' 
      ? `Đang tổng hợp gộp ${selectedMeetings.length} biên bản cuộc họp...` 
      : `Synthesizing ${selectedMeetings.length} meeting reports...`
    );
    setProgressPercent(20);
    setError(null);

    try {
      const meetingsPayload = selectedMeetings.map(m => ({
        title: m.result?.overview?.topic || (language === 'vi' ? 'Cuộc họp chưa đặt tên' : 'Untitled Meeting'),
        date: m.createdAt ? new Date(m.createdAt).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US') : '',
        result: m.result
      }));

      setProgressPercent(45);
      const mergedResult = await geminiService.mergeMeetingSummaries(meetingsPayload, language, instruction);
      setProgressPercent(85);

      const concatenatedSegments = selectedMeetings.flatMap(m => m.transcript || []);

      if (currentUser) {
        const mergeMeetingId = 'm_merged_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
        const virtualAudioLabel = language === 'vi' 
          ? `Báo cáo gộp từ ${selectedMeetings.length} phiên` 
          : `Synthesized from ${selectedMeetings.length} reports`;
          
        await saveMeeting(mergeMeetingId, language, mergedResult, concatenatedSegments, virtualAudioLabel);
        setActiveMeetingId(mergeMeetingId);
        setActiveMeetingAudioName(virtualAudioLabel);
      }

      setAnalysisResult(mergedResult);
      setTranscript(concatenatedSegments);
      setFiles([]);
      setRefreshHistoryTrigger(prev => prev + 1);

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : (language === 'vi' ? 'Lỗi gộp biên bản báo cáo.' : 'Error merging reports.'));
    } finally {
      setIsLoading(false);
      setProgressPercent(null);
    }
  }, [language, currentUser]);

  const renderContent = () => {
    if (transcript) {
      if (isFocusMode) {
        return (
          <AnalysisView 
            transcript={transcript}
            setTranscript={setTranscript}
            result={analysisResult} 
            onAnalyze={handleAnalyze}
            audioUrl={files.length === 1 ? audioUrl : null}
            audioFile={files.length === 1 ? files[0] : null}
            analysisHint={analysisHint}
            setAnalysisHint={setAnalysisHint}
            isFocusMode={isFocusMode}
            setIsFocusMode={setIsFocusMode}
            onUpdateResult={handleUpdateResult}
          />
        );
      } else {
        return (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start animate-fade-in">
            <div className="lg:col-span-3">
              <AnalysisView 
                transcript={transcript}
                setTranscript={setTranscript}
                result={analysisResult} 
                onAnalyze={handleAnalyze}
                audioUrl={files.length === 1 ? audioUrl : null}
                audioFile={files.length === 1 ? files[0] : null}
                analysisHint={analysisHint}
                setAnalysisHint={setAnalysisHint}
                isFocusMode={isFocusMode}
                setIsFocusMode={setIsFocusMode}
                onUpdateResult={handleUpdateResult}
              />
            </div>
            <div className="lg:col-span-1">
              <MeetingHistory 
                onSelectMeeting={handleSelectHistoricalMeeting}
                selectedId={activeMeetingId}
                refreshTrigger={refreshHistoryTrigger}
                onMergeMeetings={handleMergeMeetings}
              />
            </div>
          </div>
        );
      }
    }

    if (files.length === 0) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            <FileUpload onFileSelect={handleFileSelect} />
            <WelcomeScreen />
          </div>
          <div className="lg:col-span-1">
            <MeetingHistory 
              onSelectMeeting={handleSelectHistoricalMeeting}
              selectedId={activeMeetingId}
              refreshTrigger={refreshHistoryTrigger}
              onMergeMeetings={handleMergeMeetings}
            />
          </div>
        </div>
      );
    }
    
    if (!transcript) {
      return (
        <div className="text-center bg-white/80 backdrop-blur-xl border border-slate-200/60 p-10 rounded-3xl custom-shadow-lg max-w-2xl mx-auto my-8 relative overflow-hidden">
            {/* Background light glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="inline-flex items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-100 p-3 rounded-2xl mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            
            <h2 className="text-3xl font-black text-slate-900 mb-2 font-display tracking-tight">{t('readyTitle')}</h2>
            <p className="text-slate-500 text-sm font-medium mb-6">{t('uploadedFile')}</p>
            
            {/* List of files with size and name */}
            <div className="space-y-3 max-w-md mx-auto mb-8 text-left">
              {files.map((f, idx) => (
                <div key={idx} className="flex items-center justify-between p-3.5 bg-slate-50/80 border border-slate-200/50 rounded-2xl custom-shadow">
                  <div className="flex items-center space-x-3 truncate">
                    <div className="bg-sky-500/10 p-2 rounded-xl text-sky-600 flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    </div>
                    <span className="font-semibold text-slate-800 text-sm truncate">{f.name}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400 font-medium ml-4 p-1 px-2.5 bg-white border border-slate-200/40 rounded-lg shadow-sm flex-shrink-0">{(f.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
              ))}
            </div>
            
            {files.some(f => f.type.startsWith('video/')) && (
                <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-100 p-2.5 px-4 rounded-xl text-xs font-semibold mb-6 max-w-sm mx-auto">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{t('videoNote')}</span>
                </div>
            )}

            {files.length > 1 && (
              <div className="mb-6 bg-sky-50/50 hover:bg-sky-50/80 border border-sky-100 p-4.5 rounded-2xl max-w-md mx-auto text-left animate-fade-in relative z-10 transition-all">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAutoMergeSelected}
                    onChange={(e) => setIsAutoMergeSelected(e.target.checked)}
                    className="mt-1 h-4 w-4 text-sky-600 border-gray-300 rounded focus:ring-sky-500 cursor-pointer"
                  />
                  <div className="flex-1">
                    <span className="text-[10px] font-black uppercase text-sky-800 tracking-wider font-mono block mb-1">
                      {language === 'vi' ? '⚡ CHẾ ĐỘ XỬ LÝ HÀNG LOẠT VÀ TỰ ĐỘNG GỘP' : '⚡ SEQUENTIAL BATCH PROCESSING & AUTO-MERGE'}
                    </span>
                    <span className="text-[10.5px] font-medium text-slate-500 leading-relaxed block">
                      {language === 'vi' 
                        ? 'Hệ thống sẽ chạy phân tách độc lập từng đoạn âm thanh (phần 1, 2, 3...) sau đó gộp tất cả các mốc thời gian, quyết định & nhiệm vụ thành 1 Biên Bản Tổng Hợp đồng nhất của cuộc họp.'
                        : 'Processes each audio version/part sequentially, then merges all discussion notes, tasks and finalized decisions into a single consolidated report.'}
                    </span>
                  </div>
                </label>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 border-t border-slate-100/10 pt-6">
                <button
                    onClick={handleStartQueueProcessing}
                    className="w-full sm:w-auto bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold font-display py-3.5 px-8 rounded-2xl transition-all duration-300 shadow-md hover:shadow-lg hover:shadow-sky-500/10 active:scale-98 text-sm flex items-center justify-center gap-1.5"
                >
                    {files.length > 1 ? (
                      <>
                        <span>⚡ {language === 'vi' ? 'Bắt đầu xử lý hàng loạt' : 'Start Batch Processing'}</span>
                      </>
                    ) : (
                      <>
                        <span>{t('startTranscriptionButton')}</span>
                      </>
                    )}
                </button>
                <button
                    onClick={handleReset}
                    className="w-full sm:w-auto text-slate-500 hover:text-slate-800 hover:bg-slate-100/60 font-bold font-display py-3.5 px-8 rounded-2xl transition-all duration-300 text-sm"
                >
                    {t('chooseAnotherFile')}
                </button>
            </div>
        </div>
      );
    }

    return (
      <AnalysisView 
        transcript={transcript}
        setTranscript={setTranscript}
        result={analysisResult} 
        onAnalyze={handleAnalyze}
        audioUrl={files.length === 1 ? audioUrl : null}
        audioFile={files.length === 1 ? files[0] : null}
        analysisHint={analysisHint}
        setAnalysisHint={setAnalysisHint}
        isFocusMode={isFocusMode}
        setIsFocusMode={setIsFocusMode}
        onUpdateResult={handleUpdateResult}
      />
    );
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-sky-600 border-t-transparent"></div>
        <p className="mt-4 text-[11px] font-mono text-slate-400 uppercase tracking-widest animate-pulse font-bold">
          {language === 'vi' ? 'Đang tải phiên làm việc...' : 'Loading session...'}
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <Header onReset={handleReset} showReset={files.length > 0 || !!analysisResult} />
      <main className="container mx-auto px-4 py-8">
        {isLoading && <Loader message={loadingMessage} progress={progressPercent} />}

        {!isLoading && error && <ErrorDisplay message={error} onClear={() => setError(null)} />}
        
        {!isLoading && !error && (
          <div className={`${transcript && !isFocusMode ? 'max-w-7xl' : 'max-w-5xl'} mx-auto transition-all duration-300`}>
            <ErrorBoundary onReset={handleReset}>
              {renderContent()}
            </ErrorBoundary>
          </div>
        )}
      </main>
      <SystemDiagnostics />
    </div>
  );
}
