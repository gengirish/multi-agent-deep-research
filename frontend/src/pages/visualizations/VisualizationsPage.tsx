import React, { useEffect, useState } from "react";
import {
  AgentPerformance,
  AgentTimeline,
  CredibilityHistogram,
  CredibilityScatter,
  SourceTypeDonut,
} from "../../components/visualizations";
import { listConversations } from "../../services/conversationsService";
import { ConversationLog, ResearchData } from "../../types/dto";
import "./VisualizationsPage.css";

export const VisualizationsPage: React.FC = () => {
  const [dataset, setDataset] = useState<"current" | string>("current");
  const [sessions, setSessions] = useState<ConversationLog[]>([]);
  const [currentData, setCurrentData] = useState<ResearchData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await listConversations(20, 0);
      setSessions(data);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  };

  const loadSessionData = async (sessionId: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:8000"
        }/api/conversations/${sessionId}`
      );
      if (!response.ok) throw new Error("Failed to load session");
      const sessionDetail = await response.json();
      setCurrentData(sessionDetail.data);
    } catch (error) {
      console.error("Failed to load session data:", error);
      setCurrentData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = (value: string) => {
    setDataset(value);
    if (value !== "current") {
      loadSessionData(value);
    } else {
      setCurrentData(null);
    }
  };

  // Mock data for "current" dataset when no real data is available
  const getMockData = (): ResearchData => ({
    sources: {
      web: [
        { title: "Sample Source 1", url: "https://example.com/1" },
        { title: "Sample Source 2", url: "https://example.com/2" },
      ],
    },
    analysis: {
      contradictions: ["Sample contradiction 1"],
      signals: ["Sample signal 1", "Sample signal 2"],
    },
    insights: {
      insights: ["Sample insight 1", "Sample insight 2", "Sample insight 3"],
    },
    credibility: {
      scores: [
        { source: "Source 1", score: 0.85 },
        { source: "Source 2", score: 0.72 },
      ],
    },
    report: "# Sample Report\n\nThis is a sample visualization.",
    status: "success",
    conversation: {
      query_id: "sample",
      conversation: [
        {
          timestamp: new Date().toISOString(),
          agent: "retriever",
          action: "retrieve",
          type: "action",
        },
        {
          timestamp: new Date().toISOString(),
          agent: "analyzer",
          action: "analyze",
          type: "action",
        },
      ],
      total_entries: 2,
    },
  });

  const displayData =
    currentData || (dataset === "current" ? getMockData() : null);
  const conversationArray = displayData?.conversation?.conversation || [];

  return (
    <div className="visualizations-page">
      <div className="viz-header">
        <h2>📊 Data Visualizations</h2>
        <p>Interactive charts and insights from research data</p>
      </div>

      <div className="viz-controls">
        <label htmlFor="dataset-select" className="control-label">
          Select Dataset:
        </label>
        <select
          id="dataset-select"
          value={dataset}
          onChange={(e) => handleDatasetChange(e.target.value)}
          className="dataset-select"
          aria-label="Select research session"
        >
          <option value="current">Current Results (Sample Data)</option>
          <optgroup label="Recent Sessions">
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.query
                  ? `${session.query.substring(0, 60)}...`
                  : session.id}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading visualization data...</p>
        </div>
      )}

      {!loading && displayData && (
        <div className="viz-grid">
          {/* Credibility Visualizations */}
          <div className="viz-section">
            <h3>Source Credibility Analysis</h3>
            <div className="viz-row">
              <div className="viz-card">
                <h4>Credibility Distribution</h4>
                <CredibilityHistogram
                  credibilityData={
                    displayData.credibility?.scores?.map((s: any) => ({
                      score: s.score || 0,
                      type: s.type || "unknown",
                      title: s.source || "Unknown",
                      url: s.url,
                    })) || []
                  }
                />
              </div>
              <div className="viz-card">
                <h4>Credibility vs Quality</h4>
                <CredibilityScatter
                  data={
                    displayData.credibility?.scores?.map((s: any) => ({
                      x: s.score || 0,
                      y: s.quality || s.score || 0,
                      label: s.source || "Unknown",
                    })) || []
                  }
                />
              </div>
            </div>
          </div>

          {/* Source Types */}
          <div className="viz-section">
            <h3>Source Distribution</h3>
            <div className="viz-row">
              <div className="viz-card">
                <h4>Sources by Type</h4>
                <SourceTypeDonut
                  data={
                    Object.entries(displayData.sources || {}).map(
                      ([type, sources]) => ({
                        type,
                        count: Array.isArray(sources) ? sources.length : 0,
                      })
                    ) || []
                  }
                />
              </div>
            </div>
          </div>

          {/* Agent Activity */}
          {conversationArray.length > 0 && (
            <div className="viz-section">
              <h3>Agent Activity</h3>
              <div className="viz-row">
                <div className="viz-card wide">
                  <h4>Agent Timeline</h4>
                  <AgentTimeline conversation={conversationArray} />
                </div>
              </div>
              <div className="viz-row">
                <div className="viz-card">
                  <h4>Agent Performance</h4>
                  <AgentPerformance conversation={conversationArray} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !displayData && (
        <div className="empty-state">
          <span className="empty-icon">📊</span>
          <p>No visualization data available</p>
          <p className="empty-hint">
            Select a research session or run a new query to see visualizations
          </p>
        </div>
      )}
    </div>
  );
};
