"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "../../components/icons";
import { Skeleton } from "../../components/Skeleton";
import { listConversations } from "../../services/conversationsService";
import { ConversationLog, ResearchData } from "../../types/dto";
import "./VisualizationsPage.css";

// D3-backed visualization components are dynamically imported so the D3
// bundle only loads on this page (not in the shared chunk).
const ChartFallback = () => <Skeleton height={300} radius={12} />;

const AgentPerformance = dynamic(
  () => import("../../components/visualizations").then((m) => m.AgentPerformance),
  { ssr: false, loading: ChartFallback }
);
const AgentTimeline = dynamic(
  () => import("../../components/visualizations").then((m) => m.AgentTimeline),
  { ssr: false, loading: ChartFallback }
);
const CredibilityHistogram = dynamic(
  () =>
    import("../../components/visualizations").then((m) => m.CredibilityHistogram),
  { ssr: false, loading: ChartFallback }
);
const CredibilityScatter = dynamic(
  () =>
    import("../../components/visualizations").then((m) => m.CredibilityScatter),
  { ssr: false, loading: ChartFallback }
);
const SourceTypeDonut = dynamic(
  () => import("../../components/visualizations").then((m) => m.SourceTypeDonut),
  { ssr: false, loading: ChartFallback }
);

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
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
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
        { title: "Sample Source 3", url: "https://example.com/3" },
      ],
      papers: [{ title: "Sample Paper 1", url: "https://arxiv.org/abs/1" }],
      news: [{ title: "Sample News 1", url: "https://news.example.com/1" }],
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
        { source: "Source 1", score: 0.85, quality: 0.78, type: "web" },
        { source: "Source 2", score: 0.72, quality: 0.81, type: "web" },
        { source: "Paper 1", score: 0.91, quality: 0.88, type: "papers" },
        { source: "News 1", score: 0.64, quality: 0.6, type: "news" },
      ],
    },
    report: "# Sample Report\n\nThis is a sample visualization.",
    status: "success",
    conversation: {
      query_id: "sample",
      conversation: [
        {
          timestamp: new Date(Date.now() - 4000).toISOString(),
          agent: "retriever",
          action: "retrieve",
          type: "action",
        },
        {
          timestamp: new Date(Date.now() - 3000).toISOString(),
          agent: "enricher",
          action: "enrich",
          type: "action",
        },
        {
          timestamp: new Date(Date.now() - 2000).toISOString(),
          agent: "analyzer",
          action: "analyze",
          type: "action",
        },
        {
          timestamp: new Date(Date.now() - 1000).toISOString(),
          agent: "reporter",
          action: "report",
          type: "action",
        },
      ],
      total_entries: 4,
    },
  });

  const displayData =
    currentData || (dataset === "current" ? getMockData() : null);
  const conversationArray = displayData?.conversation?.conversation || [];

  const credibilityScores = useMemo<
    Array<{
      score: number;
      quality: number;
      type: string;
      title: string;
      url?: string;
    }>
  >(
    () =>
      (displayData?.credibility?.scores || []).map((s: any) => ({
        score: s.score ?? 0,
        quality: s.quality ?? s.score ?? 0,
        type: s.type || "web",
        title: s.source || "Unknown",
        url: s.url,
      })),
    [displayData]
  );

  const scatterData = useMemo(
    () =>
      credibilityScores.map((s) => ({
        credibility: s.score,
        domainScore: s.quality,
        type: s.type,
        title: s.title,
        url: s.url,
      })),
    [credibilityScores]
  );

  const sourceTypeData = useMemo(
    () =>
      Object.entries(displayData?.sources || {})
        .map(([type, sources]) => ({
          type,
          count: Array.isArray(sources) ? sources.length : 0,
        }))
        .filter((d) => d.count > 0),
    [displayData]
  );

  const kpis = useMemo(() => {
    const totalSources = sourceTypeData.reduce((acc, d) => acc + d.count, 0);
    const avgCred =
      credibilityScores.length > 0
        ? credibilityScores.reduce((acc, s) => acc + s.score, 0) /
          credibilityScores.length
        : null;
    const agents = new Set(
      conversationArray.map((c: any) => c.agent).filter(Boolean)
    );
    return {
      totalSources,
      avgCred: avgCred !== null ? avgCred.toFixed(2) : "—",
      agents: agents.size,
      actions: conversationArray.length,
    };
  }, [sourceTypeData, credibilityScores, conversationArray]);

  return (
    <div className="visualizations-page">
      <header className="viz-header">
        <div className="viz-header__icon">
          <Icon name="analysis" size={22} />
        </div>
        <div>
          <h1 className="viz-title">Data Visualizations</h1>
          <p>Interactive charts and insights from research data</p>
        </div>
      </header>

      <div className="viz-controls">
        <label htmlFor="dataset-select" className="control-label">
          Dataset
        </label>
        <div className="select-wrap">
          <select
            id="dataset-select"
            value={dataset}
            onChange={(e) => handleDatasetChange(e.target.value)}
            className="dataset-select"
            aria-label="Select research session"
          >
            <option value="current">Current results (sample data)</option>
            <optgroup label="Recent sessions">
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.query
                    ? `${session.query.substring(0, 60)}…`
                    : session.id}
                </option>
              ))}
            </optgroup>
          </select>
          <span className="select-chevron" aria-hidden="true">
            <Icon name="chevron-down" size={16} />
          </span>
        </div>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading visualization data…</p>
        </div>
      )}

      {!loading && displayData && (
        <>
          <div className="viz-kpis" role="group" aria-label="Summary metrics">
            <div className="kpi-card">
              <div className="kpi-icon">
                <Icon name="sources" size={18} />
              </div>
              <div className="kpi-value">{kpis.totalSources}</div>
              <div className="kpi-label">Sources</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">
                <Icon name="star" size={18} />
              </div>
              <div className="kpi-value">{kpis.avgCred}</div>
              <div className="kpi-label">Avg credibility</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">
                <Icon name="agent" size={18} />
              </div>
              <div className="kpi-value">{kpis.agents}</div>
              <div className="kpi-label">Agents</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon">
                <Icon name="trending-up" size={18} />
              </div>
              <div className="kpi-value">{kpis.actions}</div>
              <div className="kpi-label">Actions</div>
            </div>
          </div>

          <section className="viz-section">
            <h2 className="viz-section__title">Source credibility</h2>
            <div className="viz-grid two">
              <div className="viz-card">
                <CredibilityHistogram credibilityData={credibilityScores} />
              </div>
              <div className="viz-card">
                <CredibilityScatter data={scatterData} />
              </div>
            </div>
          </section>

          <section className="viz-section">
            <h2 className="viz-section__title">Source distribution</h2>
            <div className="viz-grid">
              <div className="viz-card">
                <SourceTypeDonut data={sourceTypeData} />
              </div>
            </div>
          </section>

          {conversationArray.length > 0 && (
            <section className="viz-section">
              <h2 className="viz-section__title">Agent activity</h2>
              <div className="viz-grid">
                <div className="viz-card">
                  <AgentTimeline conversation={conversationArray} />
                </div>
                <div className="viz-card">
                  <AgentPerformance conversation={conversationArray} />
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {!loading && !displayData && (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            <Icon name="analysis" size={40} />
          </span>
          <p>No visualization data available</p>
          <p className="empty-hint">
            Select a research session or run a new query to see visualizations
          </p>
        </div>
      )}
    </div>
  );
};
