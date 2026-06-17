
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

// Exponential Backoff Retrying logic with jitter for Gemini API
const withRetry = async <T>(fn: () => Promise<T>, retries = 4, initialDelay = 1500): Promise<T> => {
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
    // If the error still persists after all exponential backoff retries are exhausted,
    // map rate limit errors to the standard "QUOTA_EXCEEDED" expected by outer catch blocks.
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
        dateTime: "Ngày và giờ của cuộc họp. Nên là '[Chưa xác định]' nếu không được đề cập.",
        location: "Địa điểm của cuộc họp. Nên là '[Chưa xác định]' nếu không được đề cập.",
        attendees: "Danh sách người tham dự. Thêm '(Chủ trì)' vào sau tên người chủ trì nếu có thể xác định.",
        mainObjectives: "1-2 mục tiêu cốt lõi của cuộc họp.",
        discussionSummary: "Bản tóm tắt định dạng Markdown về các điểm thảo luận chính. Sử dụng '##' cho các chủ đề chính và '*' cho các gạch đầu dòng.",
        decisions: "Các quyết định quan trọng đã được chốt.",
        decision: "Quyết định cụ thể đã được đưa ra.",
        actionItems: "Bảng các nhiệm vụ được giao.",
        task: "Nhiệm vụ cụ thể cần thực hiện.",
        owner: "Người chịu trách nhiệm cho nhiệm vụ. Nên là null nếu không được chỉ định.",
        collaborators: "Những người phối hợp trong nhiệm vụ. Nên là null nếu không được chỉ định.",
        deadline: "Hạn chót cho nhiệm vụ. Nên là null nếu không được chỉ định.",
        notes: "Ghi chú bổ sung cho nhiệm vụ. Nên là null nếu không được chỉ định.",
        pendingIssues: "Các vấn đề chưa được giải quyết hoặc các chủ đề cho cuộc họp tiếp theo.",
        notesAndReferences: "Các đề xuất, nhận xét đáng chú ý, hoặc các tài liệu/liên kết được đề cập.",
        tags: "Mảng danh sách các nhãn tag phân loại bổ sung cho cuộc họp. Hãy phân tích bản ghi/nội dung để tự động gắn các nhãn phù hợp nhất (ví dụ: 'Internal', 'Client', 'Technical', 'Urgent', 'Brainstorm', 'Planning', 'Review', 'Marketing', 'Support'...). Trích xuất tối đa 3-4 nhãn."
    } : {
        category: "The category/tag of the meeting. Choose 1 most appropriate from: 'Project', 'Marketing', 'Technical', 'HR', 'Finance', 'Operations', 'General'. Only write one of these category names.",
        overview: "Overall information about the meeting.",
        topic: "The main topic of the meeting.",
        dateTime: "Date and time of the meeting. Should be '[Unspecified]' if not mentioned.",
        location: "Location of the meeting. Should be '[Unspecified]' if not mentioned.",
        attendees: "List of attendees. Append '(Host)' to the host's name if identifiable.",
        mainObjectives: "1-2 core objectives of the meeting.",
        discussionSummary: "A Markdown-formatted summary of the main discussion points. Use '##' for main topics and '*' for bullet points.",
        decisions: "Key decisions that were finalized.",
        decision: "The specific decision made.",
        actionItems: "Table of assigned tasks.",
        task: "The specific task to be done.",
        owner: "Person responsible for the task. Should be null if not specified.",
        collaborators: "People collaborating on the task. Should be null if not specified.",
        deadline: "Deadline for the task. Should be null if not specified.",
        notes: "Additional notes for the task. Should be null if not specified.",
        pendingIssues: "Unresolved issues or topics for the next meeting.",
        notesAndReferences: "Notable suggestions, comments, or mentioned documents/links.",
        tags: "Array of additional category/label tags for the meeting. Analyze the context and assign highly relevant labels (e.g., 'Internal', 'Client', 'Technical', 'Urgent', 'Brainstorm', 'Planning', 'Review', 'Marketing', 'Support'). Up to 3-4 tags."
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
                    },
                    required: ["task", "owner", "collaborators", "deadline", "notes"]
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
            model: 'gemini-3.5-flash',
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
             if (error.message === "QUOTA_EXCEEDED") {
                 throw new Error(lang === 'vi' ? "Bạn đã vượt quá giới hạn sử dụng (quota) của Gemini API. Vui lòng kiểm tra lại tài khoản hoặc thử lại sau." : "You have exceeded your Gemini API quota. Please check your account or try again later.");
             }
             if (error.message.includes("TIMEOUT:") || error.message.includes("took too long")) {
                 throw new Error(lang === 'vi'
                    ? "Quá trình gỡ băng phân đoạn âm thanh mất quá nhiều thời gian. Vui lòng thử lại sau."
                    : "Transcription of audio chunk took too long. Please try again later.");
             }
             if (error.message.includes('Rpc failed') || error.message.includes('fetch failed')) {
                throw new Error(t.errorNetwork);
             }
             const emptyResponseMessages = [
                'Phản hồi của AI trống hoặc không hợp lệ. Không thể phân tích cú pháp JSON.',
                'AI response was empty or invalid. Cannot parse JSON.'
            ];
            if (emptyResponseMessages.includes(error.message)) {
                console.warn('Caught an empty response error. Treating as an empty segment.');
                return [];
            }
             throw error;
        }

        throw new Error(t.errorGeneric);
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
    
    const pool = [...chunkPromises.entries()]; 
    const workers = Array(Math.min(CONCURRENCY_LIMIT, pool.length)).fill(null).map(async () => {
      while (pool.length > 0) {
        const item = pool.shift();
        if (!item) break;
        const [index, task] = item;
        try {
          allSegmentsByChunk[index] = await task();
        } catch (taskError) {
          console.error(`Error processing chunk index ${index}:`, taskError);
          throw taskError; // Propagate up to stop transcription gracefully rather than freezing
        }
      }
    });

    await Promise.all(workers);
    
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
VAI TRÒ & BỐI CẢNH: Bạn là một Trợ lý Điều hành Cấp cao kiêm Chuyên gia Phân tích Hệ thống (Senior Executive Assistant & Business Analyst). Bạn có khả năng bóc tách, xử lý thông tin đa nghiệp vụ (Kỹ thuật, Kinh doanh, Vận hành, Tài chính, Nhân sự...) và chuyển đổi các bản ghi thoại (transcript) thô, nhiễu thành Biên bản Cuộc họp (Meeting Memo) chuyên nghiệp, có độ chính xác và chi tiết cao.

NHIỆM VỤ CỦA BẠN: Phân tích toàn bộ bản ghi thô được cung cấp. Lọc bỏ các từ đệm, chuyện phiếm, câu trùng lặp. Trích xuất và cấu trúc lại toàn bộ nội dung một cách ĐẦY ĐỦ, CHI TIẾT, không tóm tắt sơ sài, bám sát 100% sự thật trong văn bản để tạo ra một biên bản sẵn sàng bàn giao cho Ban Giám đốc và các Trưởng bộ phận.

CẤU TRÚC ĐẦU RA BẮT BUỘC TRONG ĐỐI TƯỢNG JSON (Trình bày chuẩn Heading và Numbering để xuất bản):

0. **THỂ LOẠI CUỘC HỌP (category):**
   - Xác định và điền thể loại phù hợp nhất của cuộc họp từ danh sách chuẩn bằng tiếng Anh: 'Project', 'Marketing', 'Technical', 'HR', 'Finance', 'Operations', 'General'.

1. **THÔNG TIN TỔNG QUAN (overview):**
   - **topic (Chủ đề cuộc họp):** Tóm tắt bản chất/chủ đề chính của cuộc họp trong 1 câu ngắn gọn, chuyên nghiệp.
   - **dateTime (Ngày & Giờ):** Trích xuất dạng "DD/MM/YYYY - HH:MM". Nếu không có, ghi "[Chưa xác định]".
   - **location (Địa điểm/Hình thức):** Trực tiếp tại phòng họp nào hoặc Trực tuyến qua nền tảng nào. Nếu không có, ghi "[Chưa xác định]".
   - **attendees (Thành phần tham dự):** Liệt kê đầy đủ tên và chức vụ của những người phát biểu/tham gia đóng góp ý kiến. Ghi chú rõ "(Chủ trì)" bên cạnh người điều hành cuộc họp (ví dụ: "Nguyễn Văn A (Chủ trì)").

2. **MỤC TIÊU CHIẾN LƯỢC CỦA CUỘC HỌP (mainObjectives):**
   - Nêu rõ các mục đích cốt lõi và kết quả kỳ vọng của buổi họp từ 1-3 gạch đầu dòng.

3. **CHI TIẾT NỘI DUNG THẢO LUẬN & TRANH LUẬN (discussionSummary) - ĐỊNH DẠNG TRÌNH BÀY CHUẨN HÀNH CHÍNH (THEO NGHỊ ĐỊNH 30/2020/NĐ-CP):**
   - Bắt buộc phân rã chi tiết toàn bộ các chủ đề được thảo luận. Không gộp chung lười biếng.
   - Tuyệt đối KHÔNG sử dụng ký tự đầu dòng hoang dã như dấu hoa thị `*` hay dấu gạch ngang `-` ở đầu các tiểu mục bàn luận.
   - Trình bày biên bản họp một cách rành mạch, có quy luật và trình tự của một tờ trình/biên bản hành chính chính thống gửi tới các doanh nghiệp và đối tác lớn. Với mỗi chủ đề, bắt buộc dùng đánh số thứ tự 1., 2., 3. như sau (mỗi mục nằm một đoạn văn riêng biệt, không có dấu hoa thị hay gạch đầu dòng):
     Chủ đề [Số]: [Tên chủ đề hoặc Vấn đề nghiệp vụ]
     1. Bối cảnh thực trạng: [Chi tiết về thực trạng, các số liệu thực tế, khó khăn hoặc các mốc cần xử lý].
     2. Quan điểm và tranh luận từ các bên: [Trình bày rõ ràng luồng ý kiến, đề đạt cụ thể từng bộ phận/thành viên liên quan].
     3. Diễn biến và giải pháp được chọn: [Cách thức các bên thảo luận, thỏa hiệp và phương án chính thức được chốt cuối cùng bởi người chủ trì].
   - Quy tắc bổ sung: Bôi đậm các thông tin quan trọng như con số chỉ tiêu, mốc thời gian, quyết định then chốt, nhưng không sử dụng dấu hoa thị ở đầu dòng.

4. **CÁC QUYẾT ĐỊNH THEN CHỐT & RÀNG BUỘC ĐÃ CHỐT (decisions):**
   - Liệt kê dứt khoát các quyết định đã thống nhất thông qua trong mảng decisions. Đây là căn cứ pháp lý để thực thi các bước tiếp theo.
   - Định dạng chuỗi decision: "Quyết định [Số]: [Nội dung quyết định] - *Phạm vi áp dụng:* [Bộ phận, Dự án hoặc Toàn công ty] - *Yêu cầu đặc biệt:* [Về chi phí, bảo mật, quy trình nếu có]". Mọi quyết định phải rành mạch, có đầy đủ chủ vị.

5. **BẢNG PHÂN CÔNG NHIỆM VỤ TOÀN DIỆN (actionItems):**
   - Thiết lập các nhiệm vụ phân công chi tiết. Tuyệt đối không bỏ sót bất kỳ đầu việc nào được giao trong cuộc họp.
   - **task (Nhiệm vụ):** Bắt đầu bằng động từ hành động hành vi rõ ràng (ví dụ: "Hoàn thiện kế hoạch...", "Kiểm thử tính năng...").
   - **owner (Người phụ trách chính):** Tên cụ thể, nếu thiếu thông tin bắt buộc ghi "[Cần làm rõ]".
   - **collaborators (Người phối hợp/Phòng ban liên quan):** Tên/Bộ phận cụ thể, nếu thiếu thông tin bắt buộc ghi "[Cần làm rõ]".
   - **deadline (Thời hạn):** Trích xuất ngày cụ thể định dạng "DD/MM/YYYY". Có thể ghi ngày ước lượng kèm dấu "?" ở cuối (ví dụ: "15/10/2026?") dựa trên ngữ cảnh, nếu không rõ ghi "[Cần làm rõ]".
   - **notes (Kết quả đầu ra & Sự phụ thuộc):** Tích hợp cả hai yêu cầu: "(1) *Tiêu chí nghiệm thu/Kết quả đầu ra:* [Báo cáo hành vi/Dashboard/Tính năng code xong...]; (2) *Ghi chú & Phụ thuộc:* [Việc này cần làm sau khi ai hoàn thành/Rủi ro kỹ thuật cần tránh]".

6. **RỦI RO, ĐIỂM NGHẼN & CÁC VẤN ĐỀ TỒN ĐỌNG (pendingIssues):**
   - Liệt kê chi tiết trong mảng pendingIssues dưới dạng:
     - **Rủi ro tiềm ẩn & Điểm nghẽn:** Các nguy cơ về hiệu năng, bảo mật, dòng tiền, nhân sự hoặc xung đột lợi ích giữa các phòng ban được cảnh báo trong cuộc họp.
     - **Vấn đề tồn đọng chưa giải quyết:** Các câu hỏi, đề xuất chưa được chốt hạ, cần nghiên cứu thêm hoặc chờ dữ liệu từ bên thứ ba.
     - **Chương trình nghị sự buổi tới (nếu có nhắm tới):** Các nội dung hoãn lại, lịch họp tiếp theo.

7. **ĐỀ XUẤT SÁNG TẠO & TÀI LIỆU THAM KHẢO (notesAndReferences):**
   - Liệt kê chi tiết trong mảng notesAndReferences dưới dạng:
     - **Ý tưởng & Đề xuất đáng chú ý:** Các ý kiến hay, giải pháp đột phá được đề cập nhưng chưa đưa vào kế hoạch hành động ngay do giới hạn nguồn lực.
     - **Tài liệu/Hệ thống nhắc đến:** Tên các công cụ, phần mềm, báo cáo, luật, hoặc tài liệu số được các bên dẫn chứng trong cuộc họp.

---
**NGUYÊN TẮC TUÂN THỦ TUYỆT ĐỐI CỦA TRỢ LÝ:**
1. **TRUNG THỰC VỚI TRANSCRIPT:** Không tự ý bịa đặt hoặc thêm thắt thông tin nằm ngoài văn bản đầu vào. Thà để trống và ghi "[Cần làm rõ]" chứ không tự đoán ý người nói.
2. **XỬ LÝ LỖI NGỮ CẢNH ĐA NGHIỆP VỤ:** Tự động chuẩn hóa các từ viết sai chính tả hoặc phát âm do AI nhận diện sai (Ví dụ: "sa lary" -> "Lương/Salary", "bê rôn" -> "Payroll", "kê toán" -> "Kế toán", "api" -> "API", "misa" -> "MISA").
3. **BẢO TOÀN DIỄN BIẾN:** Nếu có sự thay đổi quyết định (quay xe) giữa đầu và cuối cuộc họp, bắt buộc phải làm rõ tiến trình đó ở Phần Thảo luận (discussionSummary) và chỉ ghi kết quả cuối cùng ở phần Quyết định (decisions).
4. **NGÔN NGỮ ĐẦU RA:** TOÀN BỘ Biên bản cuộc họp phải được ghi nhận và trả về hoàn toàn bằng **TIẾNG VIỆT** chuyên nghiệp cao cấp nhất dành cho Ban Giám đốc.

${hintSection}
`;
    }

    return `
ROLE & CONTEXT: You are a Senior Executive Assistant & Business Analyst. You possess the ability to dissect and process multi-disciplinary business information (Technical, Business, Operations, Finance, HR...) and transform raw, noisy, or fragmented voice transcripts into highly accurate, detailed, and professional Meeting Minutes (Meeting Memo) suitable for the Executive Board and Department Heads.

YOUR MISSION: Analyze the entire raw transcript provided. Filter out filler words, small talk, and repetitive statements. Extract and restructure the entire content in a FULL, DETAILED manner without brief or lazy summaries, adhering 100% to the facts in the text to generate minutes ready to be handed over to the Board of Directors and Department Heads.

OUTPUT EXPECTATIONS IN THE JSON OBJECT (Structured with standard formatting for publication):

0. **MEETING CATEGORY (category):**
   - Identify active meeting category from: 'Project', 'Marketing', 'Technical', 'HR', 'Finance', 'Operations', 'General'. Must match one of these items exactly.

1. **OVERVIEW (overview):**
   - **topic (Meeting Topic):** Summarize the true essence/core topic of the meeting in 1 concise, highly professional sentence.
   - **dateTime (Date & Time):** Extract with format "DD/MM/YYYY - HH:MM". If not available, write "[Unspecified]".
   - **location (Venue/Platform):** Direct meeting room or online platform. If not available, write "[Unspecified]".
   - **attendees (Attendees Component):** List names and roles of speakers or actively contributing members. Note "(Host)" or "(Chairperson)" next to the moderator if identifiable from context.

2. **STRATEGIC MEETINGS OBJECTIVES (mainObjectives):**
   - Detail the core objectives and expected outcomes of this meeting in 1 to 3 solid bullet points.

3. **DETAILED DISCUSSION SUMMARY & ROADMAP (discussionSummary) - STREAMLINED OFFICIAL ADMINISTRATIVE DOCUMENT FORMAT:**
   - Must completely dissect and analyze each discussion theme. Avoid lazy generalization.
   - Absolutely DO NOT use wild bullet points, list items, asterisks (`*`), or dashes (`-`) at the beginning of sub-sections.
   - Present with a beautiful structured sequence, resembling an official administrative report or proposal sent to prominent corporate clients and stakeholders. For every major topic discussed, format strictly with the following numbered sequence (each on its own separate line without list bullets):
     Topic [Number]: [Topic Name or Operational Issue]
     1. Operational Context: [Details about the context, data patterns, bugs, issues, or status raised at the beginning].
     2. Arguments & Departmental Perspectives: [Detailed arguments, concerns, or proposals voiced by specific individuals/departments].
     3. Dynamics & Agreed Resolution: [The compromise progress or finalized solution decided by the host].
   - Rule: Bold important facts like key metrics, deadlines, critical decisions, or strategic terms, but never put list bullets at the beginning of paragraph lines.

4. **KEY DECISIONS & AGREED COMMITMENTS (decisions):**
   - Extract firm, finalized agreements voted or approved.
   - Format each decision string: "Decision [Number]: [Decision Details] - *Scope of Impact:* [Department, Project, or Company-wide] - *Special Requirement:* [Budget caps, security clearances, or process changes, if any]". All items must have proper subject-object syntax.

5. **COMPREHENSIVE ACTION PLAN (actionItems):**
   - Formulate task delegations ensuring absolutely no assignments from the conversation are missed.
   - **task (Action Item):** Must begin with a strong, actionable verb (e.g., "Finalize business plan...", "Deploy security patches...").
   - **owner (Primary Owner):** Specific name, fallback to "[To Be Clarified]" if missing from text.
   - **collaborators (Collaborators / Departments):** Collaborative peers/teams, fallback to "[To Be Clarified]" if missing.
   - **deadline (Deadline):** Exact ISO date "DD/MM/YYYY" or smart context estimates followed by "?" (e.g., "15/10/2026?"). If impossible to predict, use "[To Be Clarified]".
   - **notes (Deliverables & Dependencies):** Combine: "(1) *Deliverable/Acceptance Criteria:* [File/Dashboard/Coded feature...]; (2) *Technical Notes & Dependencies:* [Prerequisite tasks done by other owners / Critical risks to bypass]".

6. **RISKS, PENETRATION BARRIERS & PENDING TOPICS (pendingIssues):**
   - Capture in the pendingIssues array:
     - **Potential Risks & Roadblocks:** Risks about performance, security, cash flow, staffing, or departmental friction pointed out in the meeting.
     - **Unresolved Disputes:** Postponed questions, suggestions without alignment, or awaiting third-party updates.
     - **Next Meeting Agenda:** Postponed agenda items, scheduled follow-ups.

7. **CREATIVE SUGGESTIONS & REFERENCE ARTIFACTS (notesAndReferences):**
   - Capture in the notesAndReferences array:
     - **Notable Out-of-Scope Ideas:** Smart ideas or game-changing brainstorms mentioned but deferred due to resource constraints.
     - **References & Documentations:** Named software systems, regulations, codes, visual reports, or assets referenced in arguments.

---
**ABSOLUTE SYSTEM CONSTRAINTS FOR THE SECRETARY:**
1. **TRANSCRIPT FIDELITY:** Never hallucinate or inject facts not mentioned in the text. Prefer "[To Be Clarified]" rather than guessing intent.
2. **CONTEXT ERROR CORRECTION:** Automatically normalize voice recognition spelling typos or acoustic glitches (e.g., "sa lary" -> "Salary", "bê rôn" -> "Payroll", "kê toán" -> "Accounting", "api" -> "API").
3. **PRESERVE SHIFTS:** If participants changed decisions halfway through, document the dialogue flow in the Discussion (discussionSummary) and record only the final official outcome in Decisions (decisions).
4. **OUTPUT LANGUAGE:** The entire output JSON object MUST be written in highly professional, executive-grade corporate ENGLISH.

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
            model: 'gemini-3.5-flash',
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
       if (error instanceof Error) {
           if (error.message === "QUOTA_EXCEEDED") {
               throw new Error(lang === 'vi' ? "Bạn đã vượt quá giới hạn sử dụng (quota) của Gemini API. Vui lòng kiểm tra lại tài khoản hoặc thử lại sau." : "You have exceeded your Gemini API quota. Please check your account or try again later.");
           }
           if (error.message.includes("TIMEOUT:") || error.message.includes("took too long")) {
               throw new Error(lang === 'vi' 
                   ? "Mất quá nhiều thời gian để AI phản hồi. Vui lòng thử lại với một bản ghi ngắn hơn hoặc cung cấp ít gợi ý hơn."
                   : "AI response took too long. Please try again with a shorter transcript or fewer hints.");
           }
           if (error.message.includes('Rpc failed') || error.message.includes('fetch failed')) {
               throw new Error(t.errorNetwork);
           }
           throw error;
       }
      throw new Error(t.errorGeneric);
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
            model: 'gemini-3.5-flash',
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
      if (error instanceof Error) {
          if (error.message === "QUOTA_EXCEEDED") {
              throw new Error(lang === 'vi' ? "Bạn đã vượt quá giới hạn sử dụng (quota) của Gemini API. Vui lòng kiểm tra lại tài khoản hoặc thử lại sau." : "You have exceeded your Gemini API quota. Please check your account or try again later.");
          }
          if (error.message.includes("TIMEOUT:") || error.message.includes("took too long")) {
              throw new Error(lang === 'vi' 
                  ? "Mất quá nhiều thời gian để AI phản hồi khi gộp báo cáo. Vui lòng thử lại với ít tài liệu hơn hoặc bớt gợi ý."
                  : "AI response took too long while merging reports. Please try again with fewer meetings or shorter details.");
          }
          throw error;
      }
      throw new Error(lang === 'vi' ? "Không thể gộp báo cáo do lỗi không xác định từ dịch vụ AI." : "Could not merge due to an unknown AI service error.");
    }
  },

  async testGeminiConnection(): Promise<boolean> {
    try {
      const response = await withRetry(() => 
        ai.models.generateContent({
          model: 'gemini-3.5-flash',
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
