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
      input?: any;
      output?: any;
      metadata?: any;
    }>;
    total_entries?: number;
  };
}

export interface ConversationLog {
  id: string;
  timestamp: string;
  query: string;
  fileName: string;
}

export interface ConversationDetail extends ConversationLog {
  data: ResearchData;
}
