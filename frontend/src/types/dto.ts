export interface ResearchData {
  sources: Record<string, any>;
  analysis: Record<string, any>;
  insights: Record<string, any>;
  credibility?: Record<string, any>;
  report: string;
  status: string;
  error?: string;
  /**
   * Stages that fell back during the run — a failed analyzer, heuristic-only
   * credibility, an empty retrieval channel. Empty or absent means every
   * stage ran. Surfaced to the reader so a partial report is never mistaken
   * for a complete one.
   */
  degraded?: string[];
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
