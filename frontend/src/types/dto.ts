export interface ResearchData {
  sources: Record<string, any>;
  analysis: Record<string, any>;
  insights: Record<string, any>;
  credibility?: Record<string, any>;
  report: string;
  status: string;
  error?: string;
  conversation?: {
    query_id?: string;
    conversation?: Array<{
      timestamp: string;
      agent?: string;
      action?: string;
      type?: string;
      content?: string;
      input?: any;
      output?: any;
      metadata?: any;
      error?: string;
      error_type?: string;
    }>;
    total_entries?: number;
  };
}

export interface ConversationLog {
  id: string;
  timestamp: string;
  query: string;
  file_name: string;
  file_size: number;
}

export interface ConversationDetail extends ConversationLog {
  data: ResearchData;
}
