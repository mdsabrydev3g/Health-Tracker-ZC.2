// api/_lib/aiTypes — أنواع مشتركة بين طبقة المزودين (بلا استيراد من src
// حتى يبقى مجلد api مستقلاً عن إعدادات vite).

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiRequest {
  capability: 'summarize_lab' | 'summarize_imaging' | 'medbox_vision' | 'chat';
  messages: AiMessage[];
  fileDataUrl?: string;
  fileMime?: string;
  maxTokens?: number;
}
