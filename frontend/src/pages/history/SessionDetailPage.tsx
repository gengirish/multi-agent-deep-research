import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ResearchResults } from "../../components/ResearchResults";
import { getConversation } from "../../services/conversationsService";
import { ConversationDetail } from "../../types/dto";
import "./SessionDetailPage.css";

export const SessionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"report" | "conversation">(
    "report"
  );

  useEffect(() => {
    if (!id) {
      setError("No session ID provided");
      setLoading(false);
      return;
    }

    loadSession(id);
  }, [id]);

  const loadSession = async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getConversation(sessionId);
      setSession(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load session details"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate("/history");
  };

  if (loading) {
    return (
      <div className="session-detail-page">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading session...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="session-detail-page">
        <div className="error-state" role="alert">
          <span className="error-icon">⚠️</span>
          <p>{error || "Session not found"}</p>
          <button onClick={handleBack} className="back-button">
            ← Back to History
          </button>
        </div>
      </div>
    );
  }

  const conversation = session.data.conversation?.conversation || [];
  const query =
    conversation.find((entry) => entry.type === "query")?.content || "N/A";

  return (
    <div className="session-detail-page">
      <div className="session-header">
        <button onClick={handleBack} className="back-button">
          ← Back to History
        </button>
        <div className="session-info">
          <h2>Research Session Details</h2>
          <p className="session-query">
            <strong>Query:</strong> {query}
          </p>
          <p className="session-id">
            <strong>Session ID:</strong> {session.id}
          </p>
        </div>
      </div>

      <div className="session-tabs">
        <button
          className={`tab-button ${activeTab === "report" ? "active" : ""}`}
          onClick={() => setActiveTab("report")}
          aria-pressed={activeTab === "report"}
        >
          📄 Report & Analysis
        </button>
        <button
          className={`tab-button ${
            activeTab === "conversation" ? "active" : ""
          }`}
          onClick={() => setActiveTab("conversation")}
          aria-pressed={activeTab === "conversation"}
        >
          💬 Conversation Log ({conversation.length} entries)
        </button>
      </div>

      <div className="session-content">
        {activeTab === "report" && (
          <div className="report-tab">
            <ResearchResults data={session.data} />
          </div>
        )}

        {activeTab === "conversation" && (
          <div className="conversation-tab">
            <div className="conversation-timeline">
              {conversation.map((entry, index) => (
                <div
                  key={index}
                  className={`conversation-entry ${entry.type || "unknown"}`}
                >
                  <div className="entry-header">
                    <span className="entry-timestamp">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    {entry.agent && (
                      <span className="entry-agent">
                        🤖 {entry.agent}
                        {entry.action && ` → ${entry.action}`}
                      </span>
                    )}
                    {entry.type && (
                      <span className={`entry-type ${entry.type}`}>
                        {entry.type}
                      </span>
                    )}
                  </div>

                  {entry.content && (
                    <div className="entry-content">
                      <strong>Content:</strong>
                      <p>{entry.content}</p>
                    </div>
                  )}

                  {entry.input && (
                    <details className="entry-details">
                      <summary>Input Data</summary>
                      <pre>{JSON.stringify(entry.input, null, 2)}</pre>
                    </details>
                  )}

                  {entry.output && (
                    <details className="entry-details">
                      <summary>Output Data</summary>
                      <pre>
                        {typeof entry.output === "string"
                          ? entry.output
                          : JSON.stringify(entry.output, null, 2)}
                      </pre>
                    </details>
                  )}

                  {entry.metadata && (
                    <details className="entry-details">
                      <summary>Metadata</summary>
                      <pre>{JSON.stringify(entry.metadata, null, 2)}</pre>
                    </details>
                  )}

                  {entry.type === "error" && entry.error && (
                    <div className="entry-error">
                      <strong>Error:</strong> {entry.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
