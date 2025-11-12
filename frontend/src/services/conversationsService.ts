/**
 * Conversations Service
 * Handles fetching research conversation history
 */

import { ConversationDetail, ConversationLog } from "../types/dto";
import { get } from "./http";

/**
 * List conversations with pagination
 */
export async function listConversations(
  limit = 50,
  offset = 0
): Promise<ConversationLog[]> {
  return get<ConversationLog[]>(
    `/api/conversations?limit=${limit}&offset=${offset}`
  );
}

/**
 * Get conversation details by ID
 */
export async function getConversation(
  conversationId: string
): Promise<ConversationDetail> {
  return get<ConversationDetail>(`/api/conversations/${conversationId}`);
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string): string {
  // Parse timestamp format: YYYYMMDD_HHMMSS_mmmmmm
  const year = timestamp.substring(0, 4);
  const month = timestamp.substring(4, 6);
  const day = timestamp.substring(6, 8);
  const hour = timestamp.substring(9, 11);
  const minute = timestamp.substring(11, 13);
  const second = timestamp.substring(13, 15);

  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );

  // Format as readable string
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
