
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { ActionItem, Decision, TranscriptSegment, AnalysisResult } from "../types";
import { withExponentialBackoff } from "./retryUtils";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY is not defined. Please set the API_KEY environment variable.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

type Language = 'vi' | 'en';

const withTimeout = <T>(promise: Promise<T>, ms: number, errorMessage = "Timeout"): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), ms))
  ]);
};

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
            ? '⚠️ PHÁT HIỆN TỆP ÂM THANH BỊ LỖI CẤU TRÚC (MALFORMED FILE ERROR): Tệp âm thanh bị hỏng dữ liệu hoặc không đúng định dạng chuẩn (FFmpeg/Avcodec decode failed). Quá trình phân tích đã TỰ ĐỘNG NGỪNG NGAY LẬP TỨC để bảo vệ tài nguyên và tránh lãng phí API. Vui lòng kiểm tra lại tệp âm thanh, xuất lại định dạng MP3, WAV hoặc M4A chuẩn và thử lại.'
            : '⚠️ MALFORMED AUDIO FILE DETECTED: The audio file is corrupted or in an invalid format (FFmpeg/Avcodec decode failed). Processing was AUTOMATICALLY STOPPED IMMEDIATELY to preserve API quota. Please check your audio file, re-export in standard MP3, WAV, or M4A format, and try again.';
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
            ? '⚠️ ĐÃ VƯỢT QUÁ GIỚI HẠN API (QUOTA EXCEEDED): Bạn đã vượt quá hạn ngạch sử dụng Gemini API. Quá trình xử lý đã tự động dừng lại để tránh phát sinh thêm lỗi. Vui lòng thử lại sau.'
            : '⚠️ API QUOTA EXCEEDED: You have exceeded your Gemini API quota limit. Processing was halted to avoid further errors. Please try again later.';
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
    if (errorMsgLower.includes('rpc failed') || errorMsgLower.includes('fetch failed') || errorMsgLower.includes('network')) {
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

          // Immediately FAIL-FAST on malformed input or corrupted file errors!
          const isMalformedFile = 
            errorMsgLower.includes('file_error_parsing') ||
            errorMsgLower.includes('malformed_input') ||
            errorMsgLower.includes('avcodec_send_packet') ||
            errorMsgLower.includes('invalid_argument') ||
            errorMsgLower.includes('ffmpeg');

          if (isMalformedFile) {
            return false; // NEVER retry malformed audio files!
          }

          const isQuotaError = 
            errorMsgLower.includes('429') || 
            errorMsgLower.includes('resource_exhausted') || 
            errorMsgLower.includes('quota_exceeded') ||
            errorMsgLower.includes('quota exceeded') ||
            errorMsgLower.includes('rate limit') ||
            errorMsgLower.includes('limit exceeded') ||
            errorMsgLower.includes('exhausted') ||
            (error && typeof error === 'object' && (
              error.status === 429 ||
              error.statusCode === 429 ||
              error.code === 429 ||
              error.status === 'RESOURCE_EXHAUSTED'
            ));

          const isNetworkError = 
            errorMsgLower.includes('rpc failed') || 
            errorMsgLower.includes('fetch failed') ||
            errorMsgLower.includes('network') ||
            errorMsgLower.includes('timeout') ||
            errorMsgLower.includes('took too long') ||
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
    
    const isQuotaError = 
      errorMsgLower.includes('429') || 
      errorMsgLower.includes('resource_exhausted') || 
      errorMsgLower.includes('quota_exceeded') ||
      errorMsgLower.includes('quota exceeded') ||
      errorMsgLower.includes('rate limit') ||
      errorMsgLower.includes('limit exceeded') ||
      errorMsgLower.includes('exhausted') ||
      (error && typeof error === 'object' && (
        error.status === 429 ||
        error.statusCode === 429 ||
        error.code === 429 ||
        error.status === 'RESOURCE_EXHAUSTED'
      ));

    if (isQuotaError) {
      throw new Error("QUOTA_EXCEEDED");
    }
    throw error;
  }
};


const getSystemInstructionForJson = (lang: Language): string => {
    const t = {
        vi: `Bạn là một API trả về CHỈ JSON thô, hợp lệ. TOÀN BỘ phản hồi của bạn PHẢI là một đối tượng hoặc mảng JSON hợp lệ duy nhất theo yêu cầu. Tuân thủ các quy tắc nghiêm ngặt sau:
1.  **KHÔNG MARKDOWN.** Phản hồi của bạn không được bọc trong markdown (ví dụ: \`\`\`json).
2.  **KHÔNG CÓ VĂN BẢN THỪA.** Không thêm bất kỳ bình luận, văn bản giới thiệu nào hoặc bất kỳ văn bản nào khác ngoài JSON.
3.  **CÚ PHÁP HỢP LỆ.** Đảm bảo tất cả các chuỗi được thoát đúng cách (ví dụ: dòng mới là \\n, dấu ngoặc kép là \\"), và tất cả dấu phẩy và dấu ngoặc được đặt đúng vị trí.
4.  **KHÔNG CÓ KÝ TỰ RÁC.** JSON không được chứa bất kỳ ký tự ngẫu nhiên hoặc không liên quan nào. Ví dụ: một mảng phải kết thúc bằng ']', chứ không phải '], some_random_text}'.
5.  **HOÀN CHỈNH & KHÔNG BỊ CẮT NGANG.** JSON phải hoàn chỉnh và không bị cắt bớt.

Đầu ra của bạn sẽ được phân tích cú pháp trực tiếp bằng máy, vì vậy độ chính xác 100% là rất quan trọng.`,
        en: `You are an API that returns ONLY valid, raw JSON. Your entire response MUST be a single, valid JSON object or array as requested. Adhere to the following strict rules:
1.  **NO MARKDOWN.** Your response must not be wrapped in markdown (e.g., \`\`\`json).
2.  **NO EXTRA TEXT.** Do not add any commentary, introductory text, or any text other than the JSON itself.
3.  **VALID SYNTAX.** Ensure all strings are properly escaped (e.g., newlines as \\n, quotes as \\"), and that all commas and brackets are correctly placed.
4.  **NO GARBAGE TEXT.** The JSON must not contain any random or extraneous characters. For example, an array must end with ']', not '], some_random_text}'.
5.  **COMPLETE & UNTRUNCATED.** The JSON must be complete and not cut off.

Your output will be parsed directly by a machine, so 100% correctness is critical.`
    };
    return t[lang];
};

const getTranscriptionSchema = (lang: Language) => {
    const t = {
        vi: {
            startSeconds: "Thời gian bắt đầu của đoạn bản ghi tính bằng giây từ đầu âm thanh.",
            speaker: "Nhãn nhận dạng cho người nói (ví dụ: 'Người nói 1').",
            text: "Văn bản đã được gỡ băng cho đoạn này."
        },
        en: {
            startSeconds: "The start time of the transcript segment in seconds from the beginning of the audio.",
            speaker: "The identified speaker label (e.g., 'Speaker 1').",
            text: "The transcribed text for this segment."
        }
    };
    return {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                startSeconds: { type: Type.NUMBER, description: t[lang].startSeconds },
                speaker: { type: Type.STRING, description: t[lang].speaker },
                text: { type: Type.STRING, description: t[lang].text }
            },
            required: ["startSeconds", "speaker", "text"]
        }
    };
};

const getAnalysisSchema = (lang: Language) => {
    const t = (lang === 'vi') ? {
        category: "Thể loại/Nhóm của cuộc họp (chọn 1 nhãn phù hợp nhất từ danh sách: 'Project', 'Marketing', 'Technical', 'HR', 'Finance', 'Operations', 'General').",
        overview: "Thông tin tổng quan về cuộc họp.",
        topic: "Chủ đề chính của cuộc họp.",
        dateTime: "Ngày và giờ của cuộc họp. Nếu không đề cập ghi 'Chưa được cung cấp'.",
        location: "Địa điểm hoặc hình thức họp. Nếu không đề cập ghi 'Chưa được cung cấp'.",
        attendees: "Danh sách người tham dự. Thêm '(Chủ trì)' vào sau tên người điều hành.",
        mainObjectives: "Danh sách 1-3 mục tiêu cốt lõi của cuộc họp.",
        discussionSummary: "MEMO Cuộc họp chi tiết gồm đúng 13 phần theo chuẩn Thư ký Điều hành Cấp cao (sử dụng Markdown và các Bảng Markdown cho các phần 4, 6, 8, 12).",
        decisions: "Danh sách các quyết định quan trọng đã chốt.",
        decision: "Quyết định cụ thể đã được chốt.",
        actionItems: "Danh sách các công việc được giao trong cuộc họp.",
        task: "Công việc cần thực hiện.",
        owner: "Người phụ trách. Nếu chưa rõ ghi 'Cần xác nhận'.",
        collaborators: "Đơn vị hoặc người phối hợp. Nếu chưa rõ ghi 'Cần xác nhận'.",
        deadline: "Thời hạn hoàn thành. Nếu chưa rõ ghi 'Cần xác nhận'.",
        notes: "Ghi chú kết quả đầu ra, tiêu chí hoàn thành, hoặc phụ thuộc.",
        priority: "Mức độ ưu tiên của công việc: 'Cao', 'Trung bình', hoặc 'Thấp'.",
        pendingIssues: "Các công việc tồn đọng, rủi ro, hoặc thông tin chưa làm rõ.",
        notesAndReferences: "Các phụ thuộc, ghi chú tổng quan, hoặc tài liệu dẫn chứng.",
        tags: "Thẻ phân loại cuộc họp (2-4 thẻ)."
    } : {
        category: "The category/tag of the meeting ('Project', 'Marketing', 'Technical', 'HR', 'Finance', 'Operations', 'General').",
        overview: "Overall information about the meeting.",
        topic: "The main topic of the meeting.",
        dateTime: "Date and time of the meeting. Write 'Not provided' if missing.",
        location: "Location or platform. Write 'Not provided' if missing.",
        attendees: "List of attendees. Append '(Chair)' to the chairperson.",
        mainObjectives: "List of 1-3 core objectives.",
        discussionSummary: "Full 13-section Executive Meeting MEMO formatted in Markdown (using Markdown tables for sections 4, 6, 8, 12).",
        decisions: "List of finalized decisions.",
        decision: "Specific decision finalized.",
        actionItems: "List of assigned tasks.",
        task: "Specific task to execute.",
        owner: "Owner responsible. Write 'To Be Clarified' if unspecified.",
        collaborators: "Collaborators or department. Write 'To Be Clarified' if unspecified.",
        deadline: "Deadline. Write 'To Be Clarified' if unspecified.",
        notes: "Deliverable criteria, status, or dependencies.",
        priority: "Priority: 'High', 'Medium', or 'Low'.",
        pendingIssues: "Pending items, risks, or points needing clarification.",
        notesAndReferences: "Dependencies, general notes, or referenced materials.",
        tags: "Assigned tags (2-4 items)."
    };

    return {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING, description: t.category },
            tags: { type: Type.ARRAY, description: t.tags, items: { type: Type.STRING } },
            overview: {
                type: Type.OBJECT, description: t.overview,
                properties: {
                    topic: { type: Type.STRING, description: t.topic },
                    dateTime: { type: Type.STRING, description: t.dateTime },
                    location: { type: Type.STRING, description: t.location },
                    attendees: { type: Type.ARRAY, description: t.attendees, items: { type: Type.STRING } }
                },
                required: ["topic", "dateTime", "location", "attendees"]
            },
            mainObjectives: { type: Type.ARRAY, description: t.mainObjectives, items: { type: Type.STRING } },
            discussionSummary: { type: Type.STRING, description: t.discussionSummary },
            decisions: {
                type: Type.ARRAY, description: t.decisions,
                items: {
                    type: Type.OBJECT,
                    properties: { decision: { type: Type.STRING, description: t.decision } },
                    required: ["decision"]
                }
            },
            actionItems: {
                type: Type.ARRAY, description: t.actionItems,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        task: { type: Type.STRING, description: t.task },
                        owner: { type: Type.STRING, nullable: true, description: t.owner },
                        collaborators: { type: Type.STRING, nullable: true, description: t.collaborators },
                        deadline: { type: Type.STRING, nullable: true, description: t.deadline },
                        notes: { type: Type.STRING, nullable: true, description: t.notes },
                        priority: { type: Type.STRING, nullable: true, description: t.priority },
                    },
                    required: ["task", "owner", "collaborators", "deadline", "notes", "priority"]
                }
            },
            pendingIssues: { type: Type.ARRAY, description: t.pendingIssues, items: { type: Type.STRING } },
            notesAndReferences: { type: Type.ARRAY, description: t.notesAndReferences, items: { type: Type.STRING } }
        },
        required: ["category", "tags", "overview", "mainObjectives", "discussionSummary", "decisions", "actionItems", "pendingIssues", "notesAndReferences"]
    };
};

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
        // Response is likely truncated.
        if (rootType === 'array') {
            // For arrays, find the last '}' and close the array. This salvages partial transcripts.
            const lastBraceIndex = jsonStr.lastIndexOf('}');
            if (lastBraceIndex > startIndex) {
                let potentialJson = jsonStr.substring(startIndex, lastBraceIndex + 1);
                potentialJson = potentialJson.trim();
                if (potentialJson.endsWith(',')) {
                    potentialJson = potentialJson.slice(0, -1);
                }
                jsonStr = potentialJson + ']';
            } else {
                // No full objects, return empty array.
                jsonStr = '[]';
            }
        } else {
            // For objects, we cannot safely salvage. Let it fail parsing.
            jsonStr = jsonStr.substring(startIndex);
        }
    }
    
    try {
        return JSON.parse(jsonStr) as T;
    } catch (e) {
        console.error("Failed to parse JSON response. Raw text:", text, "Processed string:", jsonStr, e);
        let message = '';
        if (lang === 'vi') {
            message = `AI đã trả về định dạng không hợp lệ và không thể phân tích dưới dạng JSON.`;
            if (e instanceof SyntaxError && (e.message.toLowerCase().includes('unterminated string') || e.message.toLowerCase().includes('unexpected end of json input'))) {
                message = `Phản hồi của AI có vẻ đã bị cắt ngắn, dẫn đến lỗi phân tích JSON. Điều này có thể xảy ra với các tệp âm thanh rất dài. Vui lòng thử lại với một tệp nhỏ hơn.`;
            } else if (e instanceof SyntaxError) {
                message = `Phản hồi của AI chứa lỗi cú pháp JSON và không thể phân tích được.`;
            }
        } else {
            message = `The AI returned an invalid format that could not be parsed as JSON.`;
            if (e instanceof SyntaxError && (e.message.toLowerCase().includes('unterminated string') || e.message.toLowerCase().includes('unexpected end of json input'))) {
                message = `The AI's response appears to have been truncated, leading to a JSON parsing error. This can happen with very long audio files. Please try again with a smaller file.`;
            } else if (e instanceof SyntaxError) {
                message = `The AI's response contained a JSON syntax error and could not be parsed.`;
            }
        }
        throw new Error(message);
    }
};

const secondsToTimestamp = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

interface RawTranscriptSegment {
  startSeconds: number;
  speaker: string;
  text: string;
}

function fileToBase64(fileOrBlob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            if (result) {
                const base64 = result.split(',')[1];
                resolve(base64);
            } else {
                reject(new Error("Failed to read file as Data URL"));
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(fileOrBlob);
    });
}

function getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const element = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
        element.src = url;
        element.preload = 'metadata';
        
        const cleanup = () => {
            URL.revokeObjectURL(url);
        };

        const timeoutId = setTimeout(() => {
            cleanup();
            resolve(0);
        }, 8000); // 8 seconds timeout limit

        element.onloadedmetadata = () => {
            clearTimeout(timeoutId);
            cleanup();
            resolve(element.duration || 0);
        };

        element.onerror = () => {
            clearTimeout(timeoutId);
            cleanup();
            resolve(0);
        };
    });
}

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

// #region WAV Encoding Helpers
function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function encodeWAV(samples: Float32Array, sampleRate: number, numChannels: number): ArrayBuffer {
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

function interleave(audioBuffer: AudioBuffer): Float32Array {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length;
    const result = new Float32Array(length * numberOfChannels);
    let inputIndex = 0;

    for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            result[inputIndex++] = audioBuffer.getChannelData(channel)[i];
        }
    }
    return result;
}
// #endregion

const transcribeAudioChunk = async (base64Data: string, mimeType: string, lang: Language): Promise<RawTranscriptSegment[]> => {
    const t = (lang === 'vi') ? {
        systemInstruction: `Bạn là một chuyên gia gỡ băng âm thanh cấp cao với độ chính xác hoàn hảo. Hãy chuyển đổi âm thanh thành văn bản tiếng Việt chuẩn, tự nhiên và chuyên nghiệp:
1.  **ĐỊNH DẠNG JSON:** Toàn bộ phản hồi PHẢI là một mảng JSON duy nhất tuân thủ chính xác schema. Tuyệt đối không dùng khối mã markdown (như \`\`\`json).
2.  **CẤU TRÚC PHÂN ĐOẠN:** Mỗi phân đoạn phải chứa 'startSeconds', 'speaker' và 'text'. Hãy ghép các cụm câu ngắn cùng ý của cùng một người nói thành các câu hoàn chỉnh, logic, tránh ngắt quãng vụn vặt từng từ làm mất mạch văn văn bản.
3.  **NHẬN DIỆN VÀ ĐỔI TÊN NGƯỜI NÓI (CẦN LƯU Ý):**
    - Sử dụng nhãn người nói nhất quán (ví dụ: 'Người nói 1', 'Người nói 2').
    - **Đặc biệt:** Nếu trong cuộc hội thoại người nói tự giới thiệu bản thân (ví dụ: "Mình là Nam", "Tôi là Thảo") hoặc được người khác gọi bằng tên cụ thể, bạn cần tự động cập nhật và phân bổ tên thật của họ (ví dụ: "Nam", "Thảo") thay thế cho các nhãn chung chung một cách nhất quán cho tất cả các phân đoạn liên quan từ đầu đến cuối.
4.  **CHỮ VIẾT CHUẨN:** Đảm bảo viết đúng chính tả, ngữ pháp tiếng Việt, thêm đầy đủ các dấu câu (chấm, phẩy, hỏi, chấm than). Loại bỏ bớt các từ đệm, từ lắp rườm rà không cần thiết (như 'ừm', 'ờ', 'à') khi viết câu để văn bản mạch lạc và gọn gàng, nhưng không làm thay đổi nghĩa gốc của lời nói.
5.  **SỰ THẬT & TOÀN VẸN:** Chỉ ghi lại chân thực những gì có trong âm thanh, tuyệt đối không bịa đặt, lặp lại các đoạn văn hoặc thêm thông tin bên ngoài. Nếu toàn bộ âm thanh bị im lặng hoặc chỉ có tiếng ồn rác, hãy phản hồi bằng một mảng rỗng [].`,
        prompt: `Hãy gỡ băng tệp âm thanh tiếng Việt này của cuộc họp, xác định người nói thật kỹ và phân bổ định dạng JSON chính xác nhất.`,
        errorInvalidFormat: "AI đã trả về định dạng bản ghi không hợp lệ.",
        errorGeneric: "Đã xảy ra lỗi không xác định khi gỡ băng.",
        errorNetwork: "Không thể kết nối đến dịch vụ AI sau nhiều lần thử. Vui lòng kiểm tra kết nối mạng của bạn và thử lại sau."
    } : {
        systemInstruction: `You are an expert high-precision audio transcriptionist. Convert the audio into clean, natural, and professionally written text:
1.  **RAW JSON FORMAT:** The entire response MUST be a single, valid JSON array conforming to the schema. Do not use markdown code blocks (such as \`\`\`json).
2.  **SEGMENTATION:** Each segment must contain 'startSeconds', 'speaker', and 'text'. Group short phrases of the same speaker into coherent, grammatically sound sentences rather than fragmented words to keep the transcript readable.
3.  **SPEAKER RESOLUTION (VERY IMPORTANT):**
    - Label speakers consistently (e.g., 'Speaker 1', 'Speaker 2').
    - **Name Override:** If a speaker introduces themselves (e.g., "Hi, directories John here", "My name is Jane") or is addressed by name in the conversation, prioritize replacing their speaker label with their actual name (e.g., "John", "Jane") consistently across all their respective segments.
4.  **REFINED GRAMMAR & PUNCTUATION:** Remove redundant filler words and stutters (e.g., 'uh', 'um', 'ah') to produce a professional text flow, while preserving the accurate verbatim content. Apply proper capitalization and punctuation.
5.  **CONTENT INTEGRITY:** Absolutely DO NOT repeat arbitrary segments, assume facts, or distort contents. If there is only noise or silence, return an empty array [].`,
        prompt: `Please transcribe this audio file with optimal speaker labeling and perfect word resolution using the raw JSON array format.`,
        errorInvalidFormat: "The AI returned an invalid transcript format.",
        errorGeneric: "An unknown error occurred during transcription.",
        errorNetwork: "Could not connect to the AI service after multiple attempts. Please check your network connection and try again later."
    };

    try {
      const audioPart = { inlineData: { mimeType, data: base64Data } };
      
      const response: GenerateContentResponse = await withRetry(() => 
        withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: { parts: [audioPart, { text: t.prompt }] },
            config: { 
                responseMimeType: "application/json",
                responseSchema: getTranscriptionSchema(lang),
                systemInstruction: t.systemInstruction
            },
          }),
          120000,
          "TIMEOUT: Transcription of audio chunk took too long."
        ),
        3,
        1500
      );

      if (!response.text || response.text.trim() === '') {
        console.warn('AI returned an empty response for an audio chunk, likely due to silence or content filtering. Treating as an empty segment.');
        return [];
      }

      const rawTranscript = extractAndParseJson<RawTranscriptSegment[]>(response.text, 'array', lang);

      if (!Array.isArray(rawTranscript)) {
          console.error("Parsed transcript is not an array:", rawTranscript);
          throw new Error(t.errorInvalidFormat);
      }
      return rawTranscript;

    } catch (error) {
        console.error("Error during transcription chunk:", error);

        if (error instanceof Error) {
            const emptyResponseMessages = [
                'Phản hồi của AI trống hoặc không hợp lệ. Không thể phân tích cú pháp JSON.',
                'AI response was empty or invalid. Cannot parse JSON.'
            ];
            if (emptyResponseMessages.includes(error.message)) {
                console.warn('Caught an empty response error. Treating as an empty segment.');
                return [];
            }
        }

        throw parseGeminiError(error, lang);
    }
}


async function downsampleAudioBuffer(audioBuffer: AudioBuffer, targetSampleRate = 16000): Promise<AudioBuffer> {
    const numberOfChannels = 1; // Downmix to mono
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
            else mimeType = 'audio/wav'; // Default fallback
        }

        const base64Data = await fileToBase64(file);
        const rawSegments = await transcribeAudioChunk(base64Data, mimeType, lang);

        const adjustedSegments: TranscriptSegment[] = rawSegments.map((segment): TranscriptSegment | null => {
            if (typeof segment.startSeconds !== 'number' || typeof segment.text !== 'string' || typeof segment.speaker !== 'string') {
                console.warn("Skipping invalid segment:", segment);
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

    // Standard Chunking Flow (Using FileReader for much faster & safer Base64 generation)
    // 1. Resample to 16kHz Mono to optimize processing speed and reduce base64 size drastically
    let resampledBuffer = audioBuffer!;
    if (audioBuffer!.sampleRate !== 16000 || audioBuffer!.numberOfChannels !== 1) {
      try {
        console.log(`Resampling audio from ${audioBuffer!.sampleRate}Hz ${audioBuffer!.numberOfChannels}ch to 16000Hz 1ch (Mono)...`);
        resampledBuffer = await downsampleAudioBuffer(audioBuffer!, 16000);
        console.log(`Resampling complete. New rate: ${resampledBuffer.sampleRate}Hz, Channels: ${resampledBuffer.numberOfChannels}, Duration: ${resampledBuffer.duration.toFixed(2)}s`);
      } catch (resampleError) {
        console.warn("Failed to resample audio context, proceeding with original sample rate:", resampleError);
      }
    }

    const activeAudioBuffer = resampledBuffer;
    const chunkSizeInSeconds = 5 * 60; // 5 minutes chunk size: perfect sweet spot for speaker continuity, memory limits, and fast parallel processing
    const numChunks = Math.ceil(duration / chunkSizeInSeconds);
    
    // Set progress to starting point
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

            // Run intensive CPU interleaving and WAV binary packaging on a separate background thread
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
                    console.warn(`Skipping invalid segment in chunk ${chunkIndex + 1}:`, segment);
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

    // Execute chunk promises with a strict concurrency limit (e.g. 3) to prevent rate limit thundering herds
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
          isAborted = true; // IMMEDIATELY ABORT ALL REMAINING CHUNKS!
          pool.length = 0; // Empty the pool so other workers stop instantly!
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
    
    // Flatten segments preserving correct piece order
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
- Nhóm các nội dung trùng nhau nhưng phải giữ nguyên ý nghĩa và bối cảnh.
- Phân biệt rõ:
  1. Nội dung đã chốt.
  2. Định hướng đã thống nhất.
  3. Phương án đang xem xét.
  4. Nội dung chưa thống nhất.
  5. Nội dung cần bổ sung hoặc xác minh.
- Chỉ ghi “đã giao việc” khi có phát biểu giao việc rõ ràng.
- Không tự gán người phụ trách, đơn vị phối hợp, thời hạn, mức ưu tiên, số liệu hoặc quyết định.
- Không rõ Owner hoặc thời hạn thì ghi “Cần xác nhận”.
- Không đủ dữ liệu thì ghi “Chưa đủ thông tin để kết luận”.
- Nội dung suy luận phải ghi “Giả định – cần xác nhận”.
- Tên người, tên đối tác, thuật ngữ hoặc số liệu nghe không rõ phải đánh dấu “Cần kiểm tra lại theo nguồn gốc”.
- Nội dung quan trọng nên có timestamp hoặc vị trí nguồn nếu xác định được.
- Không biến ý kiến đề xuất hoặc phản biện thành kết luận chính thức.

CẤU TRÚC ĐẦU RA BẮT BUỘC TRONG TRƯỜNG discussionSummary (TÓM TẮT & NỘI DUNG THẢO LUẬN DẠNG MARKDOWN CÓ BẢNG):
Trường discussionSummary PHẢI chứa nội dung Markdown trình bày các phần tóm tắt và thảo luận dưới đây. Đối với các phần nội dung trao đổi chi tiết, công việc, khó khăn/rủi ro, BẮT BUỘC DÙNG BẢNG MARKDOWN (| Cột 1 | Cột 2 | ... |):

## 1. Tổng quan cuộc họp
Trình bày bối cảnh, lý do tổ chức, vấn đề cần giải quyết, phạm vi trao đổi và kết quả mong muốn.

## 3. Tóm tắt điều hành
Tóm tắt đầy đủ nhưng cô đọng:
- Vấn đề trọng tâm.
- Các nội dung đã trao đổi.
- Kết quả chính.
- Điều đã chốt.
- Điều chưa chốt.
- Các việc quan trọng cần xử lý tiếp.

## 4. Nội dung trao đổi chi tiết
Lập BẢNG MARKDOWN gồm các cột:
| Chủ đề | Nội dung trình bày | Ý kiến của các bên | Ý kiến phản biện / bất đồng | Phương án được đề xuất | Kết luận / Trạng thái hiện tại |
Phải phản ánh đầy đủ các quan điểm khác nhau, không chỉ lấy ý kiến cuối cùng.

## 5. Nội dung đã chốt và định hướng đã thống nhất
Tách riêng:
- Quyết định đã chốt: ...
- Định hướng/nguyên tắc đã thống nhất: ...
- Điều kiện kèm theo: ...
- Nội dung vẫn cần xác nhận: ...
(Nếu chưa có quyết định cuối cùng, phải ghi rõ).

## 6. Công việc được giao
Lập BẢNG MARKDOWN gồm các cột:
| Mã việc | Công việc cần thực hiện | Kết quả đầu ra mong muốn | Người giao | Owner | Đơn vị phối hợp | Thời hạn | Phụ thuộc | Tiêu chí hoàn thành | Trạng thái |
Mỗi công việc là một dòng riêng, không gộp nhiều đầu việc khác nhau.

## 7. Công việc đang thực hiện và công việc tồn đọng
Nêu rõ:
- Việc đang thực hiện: ...
- Việc chưa hoàn thành & nguyên nhân tồn đọng: ...
- Ảnh hưởng & điều kiện cần có để xử lý: ...
- Nội dung cần xác nhận thêm: ...

## 8. Khó khăn, điểm nghẽn và rủi ro
Lập BẢNG MARKDOWN gồm các cột:
| Khó khăn / Rủi ro | Loại (Hiện tại / Phân loại rủi ro) | Nguyên nhân | Ảnh hưởng | Bộ phận / Công việc bị ảnh hưởng | Hướng xử lý được đề cập | Nội dung chưa có phương án xử lý |
Phân biệt rõ khó khăn hiện tại với rủi ro có thể xảy ra.

## 9. Các phụ thuộc
Tổng hợp các phụ thuộc về: Quyết định của Ban Lãnh đạo, Dữ liệu, Nhân sự, Ngân sách, Quy trình, Hệ thống, Nhà cung cấp, Tài liệu hoặc đơn vị phối hợp.

## 10. Nội dung cần làm rõ
Liệt kê: Các vấn đề chưa thống nhất, Các câu hỏi chưa được trả lời, Thông tin cần xác minh, Tài liệu còn thiếu, Nội dung cần nhà cung cấp phản hồi, Nội dung cần Ban Lãnh đạo quyết định.

## 11. Ghi chú tổng quan
Nêu các điểm được nhấn mạnh nhiều lần, cảnh báo quan trọng, thay đổi quan điểm, nội dung dễ bị hiểu sai và điều kiện cần có trước khi chuyển sang bước tiếp theo.

## 12. Next Actions
Lập BẢNG MARKDOWN gồm các cột:
| STT | Việc cần làm | Kết quả đầu ra | Owner | Thời hạn | Phụ thuộc | Điều kiện hoàn thành |

## 13. Kết luận điều hành
Viết đoạn kết luận ngắn để báo cáo cấp trên, thể hiện:
- Trạng thái hiện tại.
- Điều đã thống nhất.
- Điều chưa thống nhất.
- Việc cần xử lý tiếp.
- Nội dung cần xin ý kiến hoặc phê duyệt.
BẮT BUỘC KẾT THÚC BẰNG MỘT TRONG CÁC TRẠNG THÁI CHÍNH THỨC:
- **Trạng thái:** [Đủ cơ sở triển khai] / [Đủ cơ sở trình phê duyệt] / [Cần bổ sung thông tin trước khi trình] / [Chưa đủ thông tin để kết luận]

YÊU CẦU TRÌNH BÀY
- Báo cáo phải chi tiết, nhưng không lặp lại transcript từng câu.
- Ưu tiên bảng biểu, câu ngắn và rõ ý.
- Người không tham dự cuộc họp phải đọc hiểu được toàn bộ bối cảnh, kết quả và việc cần làm.
- Trước khi hoàn tất, tự kiểm tra xem có bỏ sót quyết định, việc được giao, việc tồn đọng, khó khăn, rủi ro, phụ thuộc hoặc nội dung cần xác minh hay không.

ĐỒNG THỜI, TRÍCH XUẤT ĐỒNG BỘ CÁC TRƯỜNG DẠNG STRUCTURED JSON:
- category: 'Project' | 'Marketing' | 'Technical' | 'HR' | 'Finance' | 'Operations' | 'General'
- tags: Array từ 2-4 tag phân loại
- overview: { topic, dateTime, location, attendees }
- mainObjectives: Array 1-3 mục tiêu cốt lõi
- decisions: Array các quyết định đã chốt trong cuộc họp ({ decision: "Quyết định..." })
- actionItems: Array các công việc được giao ({ task, owner, collaborators, deadline, notes, priority })
- pendingIssues: Array các việc tồn đọng, rủi ro, thông tin cần làm rõ
- notesAndReferences: Array ghi chú tổng quan, phụ thuộc và tài liệu

${hintSection}
`;
    }

    return `
You are a Senior Executive Secretary. Please read/listen to the ENTIRE audio recording, transcript, and attached documents, then prepare a detailed, clear Meeting MEMO suitable for reporting to the Executive Board and tracking post-meeting tasks.

ANALYSIS REQUIREMENTS
- Do not just summarize generally; fully document all topics, viewpoints, counterarguments, decisions, assigned tasks, pending items, difficulties, risks, and proposed solutions.
- Remove greetings, off-topic remarks, and repetitive phrases; do not omit important opinions even if mentioned only once.
- Group duplicate points while preserving original context and meaning.
- Clearly distinguish:
  1. Finalized decisions.
  2. Agreed directions.
  3. Options under consideration.
  4. Unaligned/Unresolved items.
  5. Items needing additions or verification.
- Only log assigned tasks when explicit assignment statements are made.
- Do not invent/hallucinate owners, collaborating units, deadlines, priorities, figures, or decisions.
- Unclear Owner or Deadline must be logged as "To Be Clarified".
- Insufficient data must be logged as "Insufficient information to conclude".
- Inferred points must be marked as "Assumption – Needs Confirmation".
- Unclear names, partner names, terms, or figures must be marked as "Needs verification from original source".
- Important content should include timestamps or source locations if identifiable.
- Do not turn proposed opinions or counterarguments into official conclusions.

REQUIRED OUTPUT STRUCTURE FOR discussionSummary (MARKDOWN DISCUSSION SUMMARY WITH TABLES):
The discussionSummary field MUST contain the full Markdown text for the discussion sections below. For detailed discussion points, action items, risks, MANDATORILY USE MARKDOWN TABLES (| Col 1 | Col 2 | ... |):

## 1. Meeting Overview
Context, rationale, problem to solve, scope of discussion, and expected outcomes.

## 3. Executive Summary
Comprehensive yet concise summary: Core problem, discussed topics, key outcomes, finalized points, unresolved points, and critical next steps.

## 4. Detailed Discussion Points
Formulate a MARKDOWN TABLE with columns:
| Topic | Presentation Content | Perspectives | Counterarguments / Disagreements | Proposed Options | Conclusion / Current Status |
Must reflect all different viewpoints, not just the final opinion.

## 5. Finalized Decisions & Agreed Directions
Separate bullet points:
- Finalized decisions: ...
- Agreed directions/principles: ...
- Accompanying conditions: ...
- Points still needing confirmation: ...
(If no final decision, state clearly).

## 6. Assigned Tasks
Formulate a MARKDOWN TABLE with columns:
| Task ID | Task Description | Expected Output | Assigner | Owner | Collaborating Unit | Deadline | Dependencies | Completion Criteria | Status |
Each task must be a separate row.

## 7. Ongoing Work & Pending Tasks
Detail: Ongoing tasks, incomplete tasks & root causes, impact & required conditions, and additional confirmation needs.

## 8. Difficulties, Bottlenecks & Risks
Formulate a MARKDOWN TABLE with columns:
| Difficulty / Risk | Type (Current / Risk Category) | Cause | Impact | Affected Department / Task | Mentioned Solution | Items Without Solution |
Differentiate current difficulties from potential risks.

## 9. Dependencies
Synthesize dependencies regarding: Executive decisions, Data, Staffing, Budget, Processes, Systems, Vendors, Documents, or Collaborating units.

## 10. Items Needing Clarification
List: Unresolved issues, unanswered questions, information to verify, missing documents, vendor feedback needed, executive decisions required.

## 11. General Notes
Repeatedly emphasized points, critical warnings, shifts in perspective, easily misunderstood content, and prerequisite conditions before next steps.

## 12. Next Actions
Formulate a MARKDOWN TABLE with columns:
| No. | Action Required | Expected Output | Owner | Deadline | Dependencies | Completion Condition |

## 13. Executive Conclusion
Short conclusion for executive reporting showing: Current status, agreed items, unaligned items, next steps to handle, items needing approval.
MUST END WITH ONE OF THE OFFICIAL STATUS STATES:
- **Status:** [Ready for Deployment] / [Ready for Executive Approval] / [Requires Additional Info Before Submission] / [Insufficient Information to Conclude]

PRESENTATION REQUIREMENTS
- Detailed, but avoid line-by-line transcript repetition.
- Prioritize tables, concise sentences, and clear logic.
- Anyone who did not attend must be able to understand the full context, results, and action items.
- Self-check before finalizing to ensure no omitted decisions, assigned tasks, pending items, risks, dependencies, or points to verify.

SYNCHRONOUSLY EXTRACT STRUCTURED JSON FIELDS:
- category: 'Project' | 'Marketing' | 'Technical' | 'HR' | 'Finance' | 'Operations' | 'General'
- tags: Array of 2-4 tags
- overview: { topic, dateTime, location, attendees }
- mainObjectives: Array of 1-3 core objectives
- decisions: Array of finalized decisions ({ decision: "..." })
- actionItems: Array of assigned tasks ({ task, owner, collaborators, deadline, notes, priority })
- pendingIssues: Array of pending items, risks, points needing clarification
- notesAndReferences: Array of general notes, dependencies, and reference materials

${hintSection}
`;
  },

  async analyzeTranscript(transcript: string, lang: Language, hint?: string): Promise<AnalysisResult> {
    const hintSection = (lang === 'vi') ? `
---
HƯỚNG DẪN BỔ SUNG TỪ NGƯỜI DÙNG (ƯU TIÊN HƯỚNG DẪN NÀY):
${hint}
---
` : `
---
ADDITIONAL GUIDANCE FROM USER (PRIORITIZE THIS GUIDANCE):
${hint}
---
`;

    const t = (lang === 'vi') ? {
        prompt: this.getAnalysisPromptTemplate(lang, hint) + `
---
BẢN GHI CUỘC HỌP THÔ CẦN PHÂN TÍCH:
${transcript}
---
`,
        errorGeneric: "Không thể phân tích bản ghi do lỗi không xác định từ dịch vụ AI.",
        errorNetwork: "Không thể phân tích bản ghi do sự cố kết nối với dịch vụ AI. Vui lòng thử lại sau."
    } : {
        prompt: this.getAnalysisPromptTemplate(lang, hint) + `
---
RAW MEETING TRANSCRIPT TO ANALYZE:
${transcript}
---
`,
        errorGeneric: "Could not analyze the transcript due to an unknown error from the AI service.",
        errorNetwork: "Could not analyze the transcript due to a connection issue with the AI service. Please try again later."
    };

    try {
      // FIX: Explicitly type `response` to `GenerateContentResponse` to fix a type inference issue.
      const response: GenerateContentResponse = await withRetry(() => 
        withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: t.prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: getAnalysisSchema(lang),
              systemInstruction: getSystemInstructionForJson(lang)
            },
          }),
          180000,
          "TIMEOUT: AI response took too long."
        ),
        2,
        1000
      );
      return extractAndParseJson<AnalysisResult>(response.text, 'object', lang);
    } catch (error) {
      console.error("Error during analysis:", error);
      throw parseGeminiError(error, lang);
    }
  },

  async mergeMeetingSummaries(meetings: { title: string, date: string, result: AnalysisResult }[], lang: Language, customInstruction?: string): Promise<AnalysisResult> {
    const meetingsDataText = meetings.map((m, idx) => {
        const r = m.result;
        if (!r) {
            return `
=== MEETING #${idx + 1}: ${m.title} (${m.date}) ===
[No summary or analysis available for this meeting]
=======================================
`;
        }
        return `
=== MEETING #${idx + 1}: ${m.title} (${m.date}) ===
Topic/Topic: ${r.overview?.topic || '[Unspecified]'}
Attendees: ${r.overview?.attendees?.join(', ') || '[]'}
Objectives:
${r.mainObjectives?.map(o => `- ${o}`).join('\n') || ''}

Discussion Summary:
${r.discussionSummary || ''}

Decisions:
${r.decisions?.map((d, i) => `${i + 1}. ${d.decision}`).join('\n') || ''}

Action Items/Tasks:
${r.actionItems?.map((a, i) => `${i + 1}. Task: ${a.task} | Owner: ${a.owner || 'None'} | Deadline: ${a.deadline || 'None'} | Notes: ${a.notes || 'None'}`).join('\n') || ''}

Pending Issues:
${r.pendingIssues?.map(p => `- ${p}`).join('\n') || ''}

Notes & References:
${r.notesAndReferences?.map(n => `- ${n}`).join('\n') || ''}
=======================================
`;
    }).join('\n\n');

    const systemRolePrompt = (lang === 'vi') ? `
Bạn là một Trợ lý Điều hành Cấp cao kiêm Chuyên gia Phân tích Hệ thống. Nhiệm vụ của bạn là gộp và tổng hợp báo cáo từ các cuộc hội thảo/cuộc họp khác nhau thành một Biên bản Báo cáo Tổng hợp đồng nhất.
Hãy gom nhóm, cấu trúc lại toàn bộ các chủ đề thảo luận một cách mạch lạc và theo quy luật biên bản chính thống hành chính, kết hợp danh sách phân công nhiệm vụ (Action Items) và các quyết định (Decisions) của tất cả cuộc họp lại làm một mà không bị lặp lại, giữ đầy đủ tính chính xác cao.
Nếu người dùng cung cấp chỉ dẫn bổ sung, hãy ưu tiên áp dụng chỉ dẫn đó tối đa.
Chế độ ngôn ngữ đầu ra: TIẾNG VIỆT chuyên nghiệp.
` : `
You are a Senior Executive Assistant & Business Analyst. Your task is to merge and synthesize multiple meeting minutes into a single Unified Master Report.
Group and restructure discussion themes coherently, consolidate action items and finalized decisions from all sessions without duplication, maintaining absolute correctness.
If the user provides custom instruction, prioritize applying it to guide the merged output.
Output language: English.
`;

    const instructionText = (customInstruction && customInstruction.trim()) ? `
HƯỚNG DẪN KHÁCH HÀNG / CUSTOM INSTRUCTIONS (PRIORITIZE THIS):
${customInstruction}
` : '';

    const prompt = `
${systemRolePrompt}

${instructionText}

BÊN DƯỚI LÀ CÁC THÔNG TIN BIÊN BẢN CẦN GỘP:
${meetingsDataText}

Hãy tổng hợp tất cả các buổi họp này dựa trên schema được định nghĩa sẵn. Đảm bảo cấu trúc đầu ra hợp lệ hoàn toàn 100% dạng JSON.
`;

    try {
      const response: GenerateContentResponse = await withRetry(() => 
        withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: getAnalysisSchema(lang),
              systemInstruction: getSystemInstructionForJson(lang)
            },
          }),
          180000,
          "TIMEOUT: AI response took too long while merging reports."
        ),
        2,
        1000
      );
      return extractAndParseJson<AnalysisResult>(response.text, 'object', lang);
    } catch (error) {
      console.error("Error during meeting merge:", error);
      throw parseGeminiError(error, lang);
    }
  },

  async generateSuggestedTitle(content: string, lang: Language): Promise<string> {
    const systemPrompt = (lang === 'vi') ? `
Bạn là một Trợ lý AI chuyên nghiệp. Hãy đọc nội dung tóm tắt buổi họp hoặc cuộc thảo luận dưới đây và tạo ra duy nhất một dòng tiêu đề gợi ý thông minh, ngắn gọn, súc tích, chuyên nghiệp và có ý nghĩa nhất cho cuộc họp đó để lưu vào cơ sở dữ liệu.
Quy tắc:
1. KHÔNG thêm bất kỳ từ ngữ thừa nào khác như "Tiêu đề gợi ý:", "Tiêu đề:", hoặc dấu ngoặc kép.
2. Tiêu đề nên khoảng từ 4 đến 10 từ.
3. Ngôn ngữ: TIẾNG VIỆT chuyên nghiệp.
` : `
You are a professional AI Assistant. Read the meeting summary or transcript below and generate exactly one line of a smart, concise, professional, and meaningful suggested title/topic for that meeting to save in the database.
Rules:
1. DO NOT add any extra labels like "Suggested Title:", "Title:", or surrounding quotes.
2. The title should be around 4 to 10 words.
3. Language: English.
`;

    try {
      const response: GenerateContentResponse = await withRetry(() => 
        withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: content,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.7,
            },
          }),
          30000,
          "TIMEOUT: AI response took too long while generating suggested title."
        ),
        2,
        1000
      );
      
      let title = response.text ? response.text.trim() : '';
      title = title.replace(/^#+\s*/g, '');
      title = title.replace(/^["'“‘](.*)["'”’]$/g, '$1');
      title = title.replace(/^(Tiêu đề gợi ý|Tiêu đề|Suggested Title|Title):\s*/i, '');
      return title.trim();
    } catch (error) {
      console.error("Error generating suggested title:", error);
      return lang === 'vi' ? 'Biên bản cuộc họp mới' : 'New Meeting Minutes';
    }
  },

  async testGeminiConnection(): Promise<boolean> {
    try {
      const response = await withRetry(() => 
        ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: 'ping',
        }),
        2,
        1000
      );
      return !!response.text;
    } catch (err) {
      console.error("Gemini connection test failed:", err);
      throw err;
    }
  },

  async recoverGeminiConnection(): Promise<void> {
    console.log("Triggering Gemini connection recovery...");
    try {
      // Warm-up ping to force DNS resolution and TCP/TLS session reuse
      await this.testGeminiConnection();
      console.log("Gemini connection recovery completed successfully.");
    } catch (err) {
      console.warn("Gemini recovery ping failed:", err);
    }
  }
};

export { geminiService };
