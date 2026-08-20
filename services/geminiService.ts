import type { ActionItem, Decision, TranscriptSegment, AnalysisResult } from "../types";
import { withExponentialBackoff } from "./retryUtils";

type Language = 'vi' | 'en';

export function parseGeminiError(error: any, lang: Language = 'vi'): Error {
    let errorMsg = '';
    if (error instanceof Error) {
        errorMsg = error.message;
    } else if (typeof error === 'string') {
        errorMsg = error;
    } else if (error && typeof error === 'object') {
        try {
            errorMsg = JSON.stringify(error);
        } catch (_) {
            errorMsg = String(error);
        }
    }

    const errorMsgLower = errorMsg.toLowerCase();

    // Check for API key leaked / permission denied / 403
    const isLeakedOrAuthError =
        errorMsgLower.includes('leaked') ||
        errorMsgLower.includes('permission_denied') ||
        errorMsgLower.includes('permission denied') ||
        errorMsgLower.includes('api key was reported') ||
        errorMsgLower.includes('invalid api key') ||
        errorMsgLower.includes('api_key_invalid') ||
        errorMsgLower.includes('403') ||
        (error && typeof error === 'object' && (error.status === 403 || error.code === 'PERMISSION_DENIED'));

    if (isLeakedOrAuthError) {
        const msg = lang === 'vi'
            ? '🔑 LỖI KHÓA API GEMINI (403 PERMISSION DENIED / LEAKED KEY): Khóa API hiện tại không hợp lệ hoặc đã bị Google bảo mật đánh dấu bị lộ. Vui lòng cập nhật API key mới trong cài đặt dự án.'
            : '🔑 GEMINI API AUTHENTICATION ERROR (403 Permission Denied): API key is invalid or was flagged as leaked. Please update your API key in project settings.';
        return new Error(msg);
    }

    // Check for malformed audio / corrupted input / ffmpeg / avcodec / 400 bad request errors
    const isMalformedFile = 
        errorMsgLower.includes('file_error_parsing_malformed_input') ||
        errorMsgLower.includes('malformed_input') ||
        errorMsgLower.includes('avcodec_send_packet') ||
        errorMsgLower.includes('ffmpeg function failed') ||
        errorMsgLower.includes('invalid_argument') ||
        errorMsgLower.includes('cannot decode') ||
        errorMsgLower.includes('unsupported audio') ||
        errorMsgLower.includes('nda') ||
        (error && typeof error === 'object' && (error.status === 'INVALID_ARGUMENT' || error.code === 400));

    if (isMalformedFile) {
        const msg = lang === 'vi'
            ? '⚠️ PHÁT HIỆN TỆP ÂM THANH BỊ LỖI CẤU TRÚC (MALFORMED FILE ERROR): Tệp âm thanh bị hỏng dữ liệu hoặc không đúng định dạng chuẩn. Quá trình phân tích đã TỰ ĐỘNG NGỪNG NGAY LẬP TỨC để bảo vệ tài nguyên và tránh lãng phí API. Vui lòng kiểm tra lại tệp âm thanh và thử lại.'
            : '⚠️ MALFORMED AUDIO FILE DETECTED: The audio file is corrupted or in an invalid format. Processing was AUTOMATICALLY STOPPED IMMEDIATELY to preserve API quota. Please check your audio file and try again.';
        return new Error(msg);
    }

    // Quota Exceeded / Rate Limit
    const isQuotaError = 
        errorMsgLower.includes('quota_exceeded') || 
        errorMsgLower.includes('quota exceeded') || 
        errorMsgLower.includes('resource_exhausted') || 
        errorMsgLower.includes('429') ||
        errorMsgLower.includes('rate limit');

    if (isQuotaError || errorMsg === 'QUOTA_EXCEEDED') {
        const msg = lang === 'vi'
            ? '⚠️ ĐÃ VƯỢT QUÁ GIỚI HẠN API (QUOTA EXCEEDED / 429): Bạn đã vượt quá hạn ngạch sử dụng Gemini API. Quá trình xử lý đã tự động dừng lại để tránh phát sinh thêm lỗi. Vui lòng thử lại sau.'
            : '⚠️ API QUOTA EXCEEDED (429): You have exceeded your Gemini API quota limit. Processing was halted to avoid further errors. Please try again later.';
        return new Error(msg);
    }

    // Timeout
    if (errorMsgLower.includes('timeout') || errorMsgLower.includes('took too long')) {
        const msg = lang === 'vi'
            ? '⏱️ QUÁ THỜI GIAN XỬ LÝ (TIMEOUT): Quá trình gỡ băng/phân tích mất quá nhiều thời gian. Đã tự động dừng để giải phóng kết nối API. Vui lòng thử lại với tệp âm thanh ngắn hơn.'
            : '⏱️ PROCESSING TIMEOUT: Audio processing took too long. Automatically stopped to free API connections. Please try again with a shorter file.';
        return new Error(msg);
    }

    // Network error
    if (errorMsgLower.includes('rpc failed') || errorMsgLower.includes('fetch failed') || errorMsgLower.includes('network') || errorMsgLower.includes('failed to fetch')) {
        const msg = lang === 'vi'
            ? '🌐 LỖI KẾT NỐI MẠNG: Không thể kết nối tới dịch vụ AI do sự cố mạng. Quá trình đã tạm ngừng. Vui lòng thử lại.'
            : '🌐 NETWORK CONNECTION ERROR: Failed to connect to AI service due to network issue. Process paused. Please try again.';
        return new Error(msg);
    }

    // Return original Error if it's already clean
    if (error instanceof Error && !errorMsg.startsWith('{')) {
        return error;
    }

    // Extract JSON message if available
    let cleanedText = errorMsg;
    try {
        const parsed = JSON.parse(errorMsg);
        if (parsed?.error?.message) {
            cleanedText = parsed.error.message;
        }
    } catch (_) {}

    const genericMsg = lang === 'vi'
        ? `⚠️ LỖI XỬ LÝ XẢY RA: ${cleanedText}. Đã lập tức ngừng phân tích cuộc họp để bảo vệ hệ thống.`
        : `⚠️ PROCESSING ERROR: ${cleanedText}. Meeting analysis stopped immediately to protect resources.`;
    return new Error(genericMsg);
}

// Exponential Backoff Retrying logic with jitter for Gemini API
const withRetry = async <T>(fn: () => Promise<T>, retries = 3, initialDelay = 1500): Promise<T> => {
  try {
    return await withExponentialBackoff(
      fn,
      {
        retries,
        initialDelay,
        backoffFactor: 2,
        maxDelay: 15000,
        jitter: true,
        isRetriable: (error: any) => {
          const errorMsg = error instanceof Error ? error.message : String(error);
          const errorMsgLower = errorMsg.toLowerCase();

          // Immediately FAIL-FAST on leaked key, auth, or malformed input errors!
          if (
            errorMsgLower.includes('leaked') ||
            errorMsgLower.includes('permission_denied') ||
            errorMsgLower.includes('permission denied') ||
            errorMsgLower.includes('403') ||
            errorMsgLower.includes('file_error_parsing') ||
            errorMsgLower.includes('malformed_input') ||
            errorMsgLower.includes('avcodec_send_packet') ||
            errorMsgLower.includes('invalid_argument') ||
            errorMsgLower.includes('ffmpeg')
          ) {
            return false; // NEVER retry auth or malformed audio files!
          }

          const isQuotaError = 
            errorMsgLower.includes('429') || 
            errorMsgLower.includes('resource_exhausted') || 
            errorMsgLower.includes('quota_exceeded') ||
            errorMsgLower.includes('quota exceeded') ||
            errorMsgLower.includes('rate limit') ||
            (error && typeof error === 'object' && (error.status === 429 || error.code === 429));

          const isNetworkError = 
            errorMsgLower.includes('fetch failed') ||
            errorMsgLower.includes('failed to fetch') ||
            errorMsgLower.includes('network') ||
            errorMsgLower.includes('timeout') ||
            errorMsgLower.includes('500') ||
            errorMsgLower.includes('502') ||
            errorMsgLower.includes('503') ||
            errorMsgLower.includes('504');

          return isQuotaError || isNetworkError;
        }
      }
    );
  } catch (error: any) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorMsgLower = errorMsg.toLowerCase();
    
    if (
      errorMsgLower.includes('429') || 
      errorMsgLower.includes('resource_exhausted') || 
      errorMsgLower.includes('quota_exceeded') ||
      errorMsgLower.includes('quota exceeded')
    ) {
      throw new Error("QUOTA_EXCEEDED");
    }
    throw error;
  }
};

// API Helper
async function callServerApi(endpoint: string, body?: any, method = 'POST'): Promise<any> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(endpoint, options);
  if (!res.ok) {
    let errorData: any;
    try {
      errorData = await res.json();
    } catch (_) {
      errorData = { error: { message: `HTTP ${res.status}: ${res.statusText}` } };
    }
    const errObj = errorData?.error || errorData;
    const msg = errObj?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    (err as any).status = res.status;
    (err as any).code = errObj?.code;
    throw err;
  }
  return await res.json();
}

interface RawTranscriptSegment {
    startSeconds: number;
    speaker: string;
    text: string;
}

const extractAndParseJson = <T,>(text: string, rootType: 'object' | 'array' = 'object', lang: Language): T => {
    if (typeof text !== 'string' || text.trim() === '') {
        const errorMsg = lang === 'vi'
            ? 'Phản hồi của AI trống hoặc không hợp lệ. Không thể phân tích cú pháp JSON.'
            : 'AI response was empty or invalid. Cannot parse JSON.';
        throw new Error(errorMsg);
    }
    
    let jsonStr = text.trim();
    const startChar = rootType === 'object' ? '{' : '[';
    const endChar = rootType === 'object' ? '}' : ']';

    const startIndex = jsonStr.indexOf(startChar);
    if (startIndex === -1) {
        const errorMsg = lang === 'vi' 
            ? `Phản hồi của AI không chứa định dạng JSON ${rootType} như mong đợi. Phản hồi nhận được: ${jsonStr}`
            : `AI response did not contain the expected JSON ${rootType} format. Received: ${jsonStr}`;
        throw new Error(errorMsg);
    }

    const endIndex = jsonStr.lastIndexOf(endChar);
    if (endIndex > startIndex) {
        jsonStr = jsonStr.substring(startIndex, endIndex + 1);
    } else {
        if (rootType === 'array') {
            const lastBraceIndex = jsonStr.lastIndexOf('}');
            if (lastBraceIndex > startIndex) {
                let potentialJson = jsonStr.substring(startIndex, lastBraceIndex + 1);
                potentialJson = potentialJson.trim();
                if (potentialJson.endsWith(',')) {
                    potentialJson = potentialJson.slice(0, -1);
                }
                jsonStr = potentialJson + ']';
            } else {
                jsonStr = '[]';
            }
        } else {
            jsonStr = jsonStr.substring(startIndex);
        }
    }
    
    try {
        return JSON.parse(jsonStr) as T;
    } catch (e) {
        console.error("Failed to parse JSON response. Raw text:", text, "Processed string:", jsonStr, e);
        const message = lang === 'vi'
            ? `AI đã trả về định dạng không hợp lệ và không thể phân tích dưới dạng JSON.`
            : `The AI returned an invalid format that could not be parsed as JSON.`;
        throw new Error(message);
    }
};

const secondsToTimestamp = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
        return "00:00:00";
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const pad = (num: number) => num.toString().padStart(2, '0');

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

const fileToBase64 = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                const base64Data = reader.result.split(',')[1];
                if (base64Data) {
                    resolve(base64Data);
                } else {
                    reject(new Error("Failed to extract base64 data from file"));
                }
            } else {
                reject(new Error("FileReader result is not a string"));
            }
        };
        reader.onerror = (error) => {
            reject(error);
        };
        reader.readAsDataURL(file);
    });
};

const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const audio = new Audio(url);

        const cleanup = () => {
            URL.revokeObjectURL(url);
            audio.removeEventListener('loadedmetadata', onLoadedMetadata);
            audio.removeEventListener('error', onError);
        };

        const onLoadedMetadata = () => {
            const duration = audio.duration;
            cleanup();
            if (isFinite(duration)) {
                resolve(duration);
            } else {
                resolve(0);
            }
        };

        const onError = () => {
            cleanup();
            resolve(0);
        };

        audio.addEventListener('loadedmetadata', onLoadedMetadata);
        audio.addEventListener('error', onError);

        setTimeout(() => {
            if (audio.duration && isFinite(audio.duration)) {
                cleanup();
                resolve(audio.duration);
            } else {
                cleanup();
                resolve(0);
            }
        }, 3000);
    });
};

// #region Web Worker for Audio Processing
const audioWorkerCode = `
function floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function encodeWAV(samples, sampleRate, numChannels) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    floatTo16BitPCM(view, 44, samples);
    return buffer;
}

function interleave(channels, length) {
    const numberOfChannels = channels.length;
    const result = new Float32Array(length * numberOfChannels);
    let inputIndex = 0;

    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            result[inputIndex++] = channels[channel][i];
        }
    }
    return result;
}

self.onmessage = function(e) {
    const { channels, sampleRate, length } = e.data;
    try {
        const interleaved = interleave(channels, length);
        const wavBuffer = encodeWAV(interleaved, sampleRate, channels.length);
        self.postMessage({ status: 'success', wavBuffer }, [wavBuffer]);
    } catch (err) {
        self.postMessage({ status: 'error', error: err.message || String(err) });
    }
};
`;

function processAudioInWorker(channels: Float32Array[], sampleRate: number, length: number): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        try {
            const blob = new Blob([audioWorkerCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            const worker = new Worker(url);

            worker.onmessage = (e) => {
                if (e.data.status === 'success') {
                    resolve(e.data.wavBuffer);
                } else {
                    reject(new Error(e.data.error || 'Worker audio processing failed'));
                }
                worker.terminate();
                URL.revokeObjectURL(url);
            };

            worker.onerror = (err) => {
                reject(err);
                worker.terminate();
                URL.revokeObjectURL(url);
            };

            const buffers = channels.map(c => c.buffer);
            worker.postMessage({
                channels,
                sampleRate,
                length
            }, buffers);
        } catch (err) {
            reject(err);
        }
    });
}
// #endregion

async function downsampleAudioBuffer(audioBuffer: AudioBuffer, targetSampleRate = 16000): Promise<AudioBuffer> {
    const numberOfChannels = 1;
    const duration = audioBuffer.duration;
    const length = Math.floor(duration * targetSampleRate);
    
    const OfflineContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!OfflineContextClass) {
        throw new Error("OfflineAudioContext is not supported by this browser.");
    }
    
    const offlineCtx = new OfflineContextClass(
        numberOfChannels,
        length,
        targetSampleRate
    );
    
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start();
    
    return await offlineCtx.startRendering();
}

const transcribeAudioChunk = async (base64Data: string, mimeType: string, lang: Language): Promise<RawTranscriptSegment[]> => {
    try {
      const data = await withRetry(() => 
        callServerApi('/api/gemini/transcribe', { base64Data, mimeType, lang }),
        3,
        1500
      );

      if (!data.text || data.text.trim() === '') {
        return [];
      }

      const rawTranscript = extractAndParseJson<RawTranscriptSegment[]>(data.text, 'array', lang);
      if (!Array.isArray(rawTranscript)) {
          return [];
      }
      return rawTranscript;
    } catch (error) {
        console.error("Error during transcription chunk:", error);
        throw parseGeminiError(error, lang);
    }
};

const geminiService = {
  async transcribeAudio(file: File, lang: Language, onProgress: (progress: { chunk: number, totalChunks: number }) => void, timeOffset: number = 0): Promise<{segments: TranscriptSegment[], duration: number}> {
    if (!file || file.size === 0) {
      throw parseGeminiError('FILE_ERROR_PARSING_MALFORMED_INPUT: File is empty or 0 bytes', lang);
    }

    let audioCtx: AudioContext | null = null;
    let audioBuffer: AudioBuffer | null = null;
    let duration = 0;
    let useFallback = false;

    try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch(e) {
        console.warn("Web Audio API is not supported in this browser, falling back to direct file upload.", e);
        useFallback = true;
    }

    if (audioCtx) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            duration = audioBuffer.duration;
        } catch (decodeError) {
            console.warn("AudioContext decodeAudioData failed, falling back to direct file upload:", decodeError);
            useFallback = true;
        }
    }

    if (useFallback) {
        onProgress({ chunk: 1, totalChunks: 1 });
        duration = await getAudioDuration(file);
        
        let mimeType = file.type;
        if (!mimeType) {
            if (file.name.endsWith('.mp3')) mimeType = 'audio/mp3';
            else if (file.name.endsWith('.wav')) mimeType = 'audio/wav';
            else if (file.name.endsWith('.m4a')) mimeType = 'audio/x-m4a';
            else if (file.name.endsWith('.mp4')) mimeType = 'video/mp4';
            else mimeType = 'audio/wav';
        }

        const base64Data = await fileToBase64(file);
        const rawSegments = await transcribeAudioChunk(base64Data, mimeType, lang);

        const adjustedSegments: TranscriptSegment[] = rawSegments.map((segment): TranscriptSegment | null => {
            if (typeof segment.startSeconds !== 'number' || typeof segment.text !== 'string' || typeof segment.speaker !== 'string') {
                return null;
            }
            return {
                startTime: secondsToTimestamp(segment.startSeconds + timeOffset),
                speaker: segment.speaker,
                text: segment.text
            };
        }).filter((segment): segment is TranscriptSegment => segment !== null);

        if (audioCtx) {
            try {
                await audioCtx.close();
            } catch (ignored) {}
        }

        return { segments: adjustedSegments, duration: duration || 0 };
    }

    // Standard Chunking Flow
    let resampledBuffer = audioBuffer!;
    if (audioBuffer!.sampleRate !== 16000 || audioBuffer!.numberOfChannels !== 1) {
      try {
        resampledBuffer = await downsampleAudioBuffer(audioBuffer!, 16000);
      } catch (resampleError) {
        console.warn("Failed to resample audio context, proceeding with original sample rate:", resampleError);
      }
    }

    const activeAudioBuffer = resampledBuffer;
    const chunkSizeInSeconds = 5 * 60;
    const numChunks = Math.ceil(duration / chunkSizeInSeconds);
    
    onProgress({ chunk: 0, totalChunks: numChunks });

    const chunkPromises: (() => Promise<TranscriptSegment[]>)[] = [];
    let completedChunks = 0;

    for (let i = 0; i < numChunks; i++) {
        const chunkIndex = i;
        const start = chunkIndex * chunkSizeInSeconds;
        const end = Math.min(start + chunkSizeInSeconds, duration);
        
        const startSample = Math.floor(start * activeAudioBuffer.sampleRate);
        const endSample = Math.floor(end * activeAudioBuffer.sampleRate);
        const chunkLengthSamples = endSample - startSample;

        chunkPromises.push(async () => {
            const channels: Float32Array[] = [];
            for (let channel = 0; channel < activeAudioBuffer.numberOfChannels; channel++) {
                const rawSubarray = activeAudioBuffer.getChannelData(channel).subarray(startSample, endSample);
                channels.push(new Float32Array(rawSubarray));
            }

            const wavBuffer = await processAudioInWorker(
                channels,
                activeAudioBuffer.sampleRate,
                chunkLengthSamples
            );

            const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
            const base64Data = await fileToBase64(wavBlob);

            const rawSegments = await transcribeAudioChunk(base64Data, 'audio/wav', lang);

            const adjustedSegments: TranscriptSegment[] = rawSegments.map((segment): TranscriptSegment | null => {
                if (typeof segment.startSeconds !== 'number' || typeof segment.text !== 'string' || typeof segment.speaker !== 'string') {
                    return null;
                }
                return {
                    startTime: secondsToTimestamp(segment.startSeconds + start + timeOffset),
                    speaker: segment.speaker,
                    text: segment.text
                };
            }).filter((segment): segment is TranscriptSegment => segment !== null);

            completedChunks++;
            onProgress({ chunk: completedChunks, totalChunks: numChunks });

            return adjustedSegments;
        });
    }

    const CONCURRENCY_LIMIT = 3;
    const allSegmentsByChunk: TranscriptSegment[][] = new Array(numChunks);
    let isAborted = false;
    let abortError: any = null;
    
    const pool = [...chunkPromises.entries()]; 
    const workers = Array(Math.min(CONCURRENCY_LIMIT, pool.length)).fill(null).map(async () => {
      while (pool.length > 0 && !isAborted) {
        const item = pool.shift();
        if (!item) break;
        const [index, task] = item;
        try {
          if (isAborted) break;
          allSegmentsByChunk[index] = await task();
        } catch (taskError) {
          console.error(`Error processing chunk index ${index}:`, taskError);
          isAborted = true;
          pool.length = 0;
          abortError = taskError;
          throw taskError;
        }
      }
    });

    try {
      await Promise.all(workers);
    } catch (err) {
      if (audioCtx) {
        try { await audioCtx.close(); } catch (_) {}
      }
      throw parseGeminiError(abortError || err, lang);
    }
    
    let allSegments: TranscriptSegment[] = [];
    for (let i = 0; i < numChunks; i++) {
        if (allSegmentsByChunk[i]) {
            allSegments = allSegments.concat(allSegmentsByChunk[i]);
        }
    }

    await audioCtx!.close();
    return { segments: allSegments, duration: duration };
  },

  getAnalysisPromptTemplate(lang: Language, hint?: string): string {
    const hintSection = hint ? ((lang === 'vi') ? `
---
HƯỚNG DẪN BỔ SUNG TỪ NGƯỜI DÙNG (ƯU TIÊN HƯỚNG DẪN NÀY):
${hint}
---
` : `
---
ADDITIONAL GUIDANCE FROM USER (PRIORITIZE THIS GUIDANCE):
${hint}
---
`) : '';

    if (lang === 'vi') {
        return `
Bạn là Thư ký Điều hành cấp cao (Senior Executive Secretary). Hãy đọc/nghe TOÀN BỘ file ghi âm, transcript và tài liệu đính kèm, sau đó lập MEMO cuộc họp chi tiết, rõ ràng, có thể dùng để báo cáo Ban Lãnh đạo và theo dõi công việc sau họp.

YÊU CẦU PHÂN TÍCH
- Không chỉ tóm tắt chung; phải ghi nhận đầy đủ các chủ đề, quan điểm, phản biện, quyết định, việc được giao, việc tồn đọng, khó khăn, rủi ro và hướng xử lý.
- Loại bỏ lời chào, nội dung ngoài lề và câu nói lặp; không bỏ sót các ý kiến quan trọng dù chỉ được nhắc một lần.
- Phân biệt rõ:
  1. Nội dung đã chốt.
  2. Định hướng đã thống nhất.
  3. Phương án đang xem xét.
  4. Nội dung chưa thống nhất.
  5. Nội dung cần bổ sung hoặc xác minh.
- Chỉ ghi “đã giao việc” khi có phát biểu giao việc rõ ràng.
- Không tự gán người phụ trách, đơn vị phối hợp, thời hạn, mức ưu tiên, số liệu hoặc quyết định.

CẤU TRÚC ĐẦU RA BẮT BUỘC TRONG TRƯỜNG discussionSummary:
Trường discussionSummary PHẢI chứa nội dung Markdown trình bày các phần tóm tắt và thảo luận dưới đây:
## 1. Tổng quan cuộc họp
## 3. Tóm tắt điều hành
## 4. Nội dung trao đổi chi tiết (Bảng Markdown)
## 5. Nội dung đã chốt và định hướng đã thống nhất
## 6. Công việc được giao (Bảng Markdown)
## 7. Công việc đang thực hiện và công việc tồn đọng
## 8. Khó khăn, điểm nghẽn và rủi ro (Bảng Markdown)
## 9. Các phụ thuộc
## 10. Nội dung cần làm rõ
## 11. Ghi chú tổng quan
## 12. Next Actions (Bảng Markdown)
## 13. Kết luận điều hành

${hintSection}
`;
    }

    return `
You are a Senior Executive Secretary. Review the full transcript and generate an executive meeting memo and minutes conforming to the 13 sections in Markdown format with Markdown tables for detailed points, tasks, and risks.

${hintSection}
`;
  },

  async analyzeTranscript(transcript: string, lang: Language, hint?: string): Promise<AnalysisResult> {
    const prompt = (lang === 'vi') 
      ? this.getAnalysisPromptTemplate(lang, hint) + `\n---\nBẢN GHI CUỘC HỌP THÔ CẦN PHÂN TÍCH:\n${transcript}\n---\n`
      : this.getAnalysisPromptTemplate(lang, hint) + `\n---\nRAW MEETING TRANSCRIPT TO ANALYZE:\n${transcript}\n---\n`;

    try {
      const data = await withRetry(() => 
        callServerApi('/api/gemini/analyze', { prompt, lang }),
        2,
        1000
      );
      return extractAndParseJson<AnalysisResult>(data.text, 'object', lang);
    } catch (error) {
      console.error("Error during analysis:", error);
      throw parseGeminiError(error, lang);
    }
  },

  async mergeMeetingSummaries(meetings: { title: string, date: string, result: AnalysisResult }[], lang: Language, customInstruction?: string): Promise<AnalysisResult> {
    const meetingsDataText = meetings.map((m, idx) => {
        const r = m.result;
        if (!r) {
            return `=== MEETING #${idx + 1}: ${m.title} (${m.date}) ===\n[No summary available]\n`;
        }
        return `=== MEETING #${idx + 1}: ${m.title} (${m.date}) ===\nTopic: ${r.overview?.topic || ''}\nAttendees: ${r.overview?.attendees?.join(', ') || ''}\nDiscussion: ${r.discussionSummary || ''}\n`;
    }).join('\n\n');

    const prompt = `Gộp và tổng hợp các biên bản cuộc họp sau thành một bản duy nhất:\n${customInstruction || ''}\n${meetingsDataText}`;

    try {
      const data = await withRetry(() => 
        callServerApi('/api/gemini/merge', { prompt, lang }),
        2,
        1000
      );
      return extractAndParseJson<AnalysisResult>(data.text, 'object', lang);
    } catch (error) {
      console.error("Error during meeting merge:", error);
      throw parseGeminiError(error, lang);
    }
  },

  async generateSuggestedTitle(content: string, lang: Language): Promise<string> {
    try {
      const data = await withRetry(() => 
        callServerApi('/api/gemini/suggest-title', { content, lang }),
        2,
        1000
      );
      return data.title || (lang === 'vi' ? 'Biên bản cuộc họp mới' : 'New Meeting Minutes');
    } catch (error) {
      console.error("Error generating suggested title:", error);
      return lang === 'vi' ? 'Biên bản cuộc họp mới' : 'New Meeting Minutes';
    }
  },

  async testGeminiConnection(): Promise<boolean> {
    try {
      const data = await callServerApi('/api/gemini/ping', undefined, 'GET');
      return !!data.success;
    } catch (err) {
      console.error("Gemini connection test failed:", err);
      throw err;
    }
  },

  async recoverGeminiConnection(): Promise<void> {
    console.log("Triggering Gemini connection recovery...");
    try {
      await this.testGeminiConnection();
      console.log("Gemini connection recovery completed successfully.");
    } catch (err) {
      console.warn("Gemini recovery ping failed:", err);
    }
  }
};

export { geminiService };
