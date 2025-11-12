import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  formatFileSize,
  formatTimestamp,
  listConversations,
} from "../../services/conversationsService";
import { ConversationLog } from "../../types/dto";
import "./HistoryPage.css";

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listConversations(50, 0);
      setConversations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      conv.query?.toLowerCase().includes(searchLower) ||
      conv.id.toLowerCase().includes(searchLower)
    );
  });

  const handleRowClick = (id: string) => {
    navigate(`/history/${id}`);
  };

  return (
    <div className="history-page">
      <div className="history-header">
        <h2>📚 Research History</h2>
        <p>View and revisit your past research sessions</p>
      </div>

      <div className="history-controls">
        <input
          type="search"
          placeholder="Search by query or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
          aria-label="Search conversations"
        />
        <button
          onClick={loadConversations}
          className="refresh-button"
          disabled={loading}
          aria-label="Refresh history"
        >
          🔄 Refresh
        </button>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading history...</p>
        </div>
      )}

      {error && (
        <div className="error-state" role="alert">
          <span className="error-icon">⚠️</span>
          <p>{error}</p>
          <button onClick={loadConversations} className="retry-button">
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && filteredConversations.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">📭</span>
          <p>
            {searchTerm
              ? "No conversations match your search"
              : "No research history yet"}
          </p>
          {!searchTerm && (
            <p className="empty-hint">
              Start a new research query to see results here
            </p>
          )}
        </div>
      )}

      {!loading && !error && filteredConversations.length > 0 && (
        <div className="history-table-container">
          <table className="history-table" role="table">
            <thead>
              <tr>
                <th>Query</th>
                <th>Timestamp</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredConversations.map((conv) => (
                <tr
                  key={conv.id}
                  onClick={() => handleRowClick(conv.id)}
                  className="history-row"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(conv.id);
                    }
                  }}
                  aria-label={`View conversation: ${conv.query || conv.id}`}
                >
                  <td className="query-cell">
                    <span className="query-text">
                      {conv.query || <em>No query text</em>}
                    </span>
                  </td>
                  <td className="timestamp-cell">
                    {formatTimestamp(conv.timestamp)}
                  </td>
                  <td className="size-cell">
                    {formatFileSize(conv.file_size)}
                  </td>
                  <td className="actions-cell">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(conv.id);
                      }}
                      className="view-button"
                      aria-label={`View details for ${conv.query || conv.id}`}
                    >
                      👁️ View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && conversations.length > 50 && (
        <div className="pagination-info">
          <p>
            Showing {filteredConversations.length} of {conversations.length}{" "}
            conversations
          </p>
          <p className="pagination-hint">
            More pagination features coming soon
          </p>
        </div>
      )}
    </div>
  );
};
