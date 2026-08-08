
export interface ActionItem {
  task: string;
  owner: string | null;
  collaborators: string | null;
  deadline: string | null;
  notes: string | null;
  priority: string | null; // 'Cao' | 'Trung bình' | 'Thấp' or 'High' | 'Medium' | 'Low'
}

export interface Decision {
  decision: string;
  isImportant?: boolean;
  isBold?: boolean;
}

export interface TranscriptSegment {
  startTime: string;
  speaker?: string;
  text: string;
  isImportant?: boolean;
  isBold?: boolean;
}

export interface Overview {
  topic: string;
  dateTime: string;
  location: string;
  attendees: string[];
}

export interface AnalysisResult {
  category?: string; // Auto-generated category, e.g., 'Project', 'Marketing', 'Technical', 'HR', 'Finance', 'Operations', 'General' etc.
  tags?: string[]; // Auto-generated tags/labels automatically assigned by Gemini API (e.g., 'Internal', 'Client', 'Technical', 'Urgent')
  overview: Overview;
  mainObjectives: string[];
  discussionSummary: string;
  decisions: Decision[];
  actionItems: ActionItem[];
  pendingIssues: string[];
  notesAndReferences: string[];
}

export type DocumentTemplate = 'standard' | 'summary' | 'technical';
export type ExportFormat = 'docx' | 'xlsx' | 'gmail' | 'drive';
