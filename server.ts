import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limits for base64 audio chunks
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Lazy GoogleGenAI client
let aiClient: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (apiKey) {
      aiClient = new GoogleGenAI({ apiKey });
    } else {
      aiClient = new GoogleGenAI({});
    }
  }
  return aiClient;
}

type Language = 'vi' | 'en';

const getTranscriptionSchema = (lang: Language) => {
  const t = (lang === 'vi') ? {
    segments: "Danh sách các phân đoạn gỡ băng âm thanh.",
    startSeconds: "Thời điểm bắt đầu nói tính bằng giây (số thực).",
    speaker: "Tên hoặc nhãn người nói.",
    text: "Nội dung lời nói."
  } : {
    segments: "List of transcribed audio segments.",
    startSeconds: "Start timestamp in seconds.",
    speaker: "Speaker label or identified name.",
    text: "Transcribed text."
  };

  return {
    type: Type.ARRAY,
    description: t.segments,
    items: {
      type: Type.OBJECT,
      properties: {
        startSeconds: { type: Type.NUMBER, description: t.startSeconds },
        speaker: { type: Type.STRING, description: t.speaker },
        text: { type: Type.STRING, description: t.text }
      },
      required: ["startSeconds", "speaker", "text"]
    }
  };
};

const getAnalysisSchema = (lang: Language) => {
  const t = (lang === 'vi') ? {
    category: "Chủ đề phân loại của cuộc họp.",
    overview: "Thông tin tổng quan về cuộc họp.",
    topic: "Chủ đề chính của cuộc họp.",
    dateTime: "Thời gian diễn ra.",
    location: "Địa điểm hoặc nền tảng họp trực tuyến.",
    attendees: "Danh sách người tham dự.",
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
    priority: "Mức độ ưu tiên: 'Cao', 'Trung bình', hoặc 'Thấp'.",
    pendingIssues: "Các công việc tồn đọng, rủi ro, hoặc thông tin chưa làm rõ.",
    notesAndReferences: "Các phụ thuộc, ghi chú tổng quan, hoặc tài liệu dẫn chứng.",
    tags: "Thẻ phân loại cuộc họp (2-4 thẻ)."
  } : {
    category: "The category/tag of the meeting.",
    overview: "Overall information about the meeting.",
    topic: "The main topic of the meeting.",
    dateTime: "Date and time of the meeting.",
    location: "Location or platform.",
    attendees: "List of attendees.",
    mainObjectives: "List of 1-3 core objectives.",
    discussionSummary: "Full 13-section Executive Meeting MEMO formatted in Markdown.",
    decisions: "List of finalized decisions.",
    decision: "Specific decision finalized.",
    actionItems: "List of assigned tasks.",
    task: "Specific task to execute.",
    owner: "Owner responsible.",
    collaborators: "Collaborators or department.",
    deadline: "Deadline.",
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

const getSystemInstructionForJson = (lang: Language) => {
  if (lang === 'vi') {
    return `Bạn là Thư ký Điều hành Cấp cao (Senior Executive Secretary). Nhiệm vụ của bạn là lập Biên bản Cuộc họp (Minutes of Meeting - MoM) và MEMO chi tiết nhất từ dữ liệu đầu vào.
CẦU TRÚC ĐẦU RA BẮT BUỘC: Phản hồi PHẢI TUÂN THỦ HOÀN TOÀN cấu trúc JSON schema được cung cấp.`;
  }
  return `You are a Senior Executive Secretary. Your task is to generate accurate, high-fidelity Executive Meeting Minutes and MEMO. Output must strictly conform to JSON schema.`;
};

function formatServerError(error: any) {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();
  
  if (lower.includes('leaked') || lower.includes('permission_denied') || lower.includes('403') || lower.includes('api key')) {
    return {
      status: 403,
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Your Gemini API key was reported as leaked or invalid. Please check and update your API key in project settings.'
      }
    };
  }
  if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
    return {
      status: 429,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'API quota exceeded. Please wait a moment and try again.'
      }
    };
  }
  return {
    status: 500,
    error: {
      code: 'INTERNAL_ERROR',
      message: msg
    }
  };
}

// === API ROUTES ===

// 1. Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 2. Ping / Connection test
app.get('/api/gemini/ping', async (req: Request, res: Response) => {
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: 'ping',
    });
    res.json({ success: true, text: response.text });
  } catch (error) {
    const formatted = formatServerError(error);
    res.status(formatted.status).json(formatted);
  }
});

// 3. Transcribe Audio Chunk
app.post('/api/gemini/transcribe', async (req: Request, res: Response) => {
  try {
    const { base64Data, mimeType = 'audio/wav', lang = 'vi' } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENT', message: 'Missing base64Data' } });
    }

    const ai = getAi();
    const systemInstruction = lang === 'vi' 
      ? `Bạn là một chuyên gia gỡ băng âm thanh cấp cao với độ chính xác hoàn hảo. Chuyển đổi âm thanh thành văn bản tiếng Việt chuẩn. Phản hồi mảng JSON gồm startSeconds, speaker, text.`
      : `You are an expert audio transcriptionist. Convert audio into high accuracy text with speaker labels. Output JSON array with startSeconds, speaker, text.`;

    const prompt = lang === 'vi'
      ? `Hãy gỡ băng tệp âm thanh tiếng Việt này của cuộc họp, xác định người nói thật kỹ và phân bổ định dạng JSON chính xác nhất.`
      : `Please transcribe this audio file with optimal speaker labeling and perfect word resolution using raw JSON array format.`;

    const audioPart = { inlineData: { mimeType, data: base64Data } };

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: { parts: [audioPart, { text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: getTranscriptionSchema(lang),
        systemInstruction: systemInstruction,
      }
    });

    const text = response.text || '[]';
    res.json({ text });
  } catch (error) {
    const formatted = formatServerError(error);
    res.status(formatted.status).json(formatted);
  }
});

// 4. Analyze Meeting Transcript
app.post('/api/gemini/analyze', async (req: Request, res: Response) => {
  try {
    const { prompt, lang = 'vi' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENT', message: 'Missing prompt' } });
    }

    const ai = getAi();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: getAnalysisSchema(lang),
        systemInstruction: getSystemInstructionForJson(lang)
      }
    });

    const text = response.text || '{}';
    res.json({ text });
  } catch (error) {
    const formatted = formatServerError(error);
    res.status(formatted.status).json(formatted);
  }
});

// 5. Merge Multiple Meeting Reports
app.post('/api/gemini/merge', async (req: Request, res: Response) => {
  try {
    const { prompt, lang = 'vi' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENT', message: 'Missing prompt' } });
    }

    const ai = getAi();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: getAnalysisSchema(lang),
        systemInstruction: getSystemInstructionForJson(lang)
      }
    });

    const text = response.text || '{}';
    res.json({ text });
  } catch (error) {
    const formatted = formatServerError(error);
    res.status(formatted.status).json(formatted);
  }
});

// 6. Generate Suggested Title
app.post('/api/gemini/suggest-title', async (req: Request, res: Response) => {
  try {
    const { content, lang = 'vi' } = req.body;
    if (!content) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENT', message: 'Missing content' } });
    }

    const systemPrompt = (lang === 'vi')
      ? `Bạn là một Trợ lý AI chuyên nghiệp. Hãy đọc nội dung tóm tắt buổi họp và tạo ra duy nhất một dòng tiêu đề gợi ý thông minh, ngắn gọn, súc tích (4-10 từ) cho cuộc họp đó. Không thêm tiền tố "Tiêu đề:".`
      : `You are a professional AI Assistant. Read the meeting summary and generate exactly one line concise title (4-10 words). No prefix.`;

    const ai = getAi();
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: content,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      }
    });

    let title = response.text ? response.text.trim() : '';
    title = title.replace(/^#+\s*/g, '');
    title = title.replace(/^["'“‘](.*)["'”’]$/g, '$1');
    title = title.replace(/^(Tiêu đề gợi ý|Tiêu đề|Suggested Title|Title):\s*/i, '');
    
    res.json({ title: title.trim() });
  } catch (error) {
    const formatted = formatServerError(error);
    res.status(formatted.status).json(formatted);
  }
});

// === SERVER START & VITE MIDDLEWARE ===

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
