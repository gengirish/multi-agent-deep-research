import React, { useMemo, useState } from "react";
import { ResearchData } from "../types/dto";
import "./ResearchMetrics.css";
import {
  CredibilityHistogram,
  CredibilityScatter,
  SourceTypeDonut,
} from "./visualizations";

interface Props {
  data: ResearchData;
}

export const ResearchMetrics: React.FC<Props> = ({ data }) => {
  const [useD3Visualizations, setUseD3Visualizations] = useState(true);
  const sources = data.sources || {};
  const metadata = sources.metadata || {};
  const credibility = data.credibility || {};

  // Collect enriched data from sources
  const enrichedSources: Array<{
    title: string;
    domain_score?: number;
    sentiment?: { label: string; score: number };
    category?: string;
    url?: string;
  }> = [];

  // Extract enriched data from web and news sources
  Object.values(sources).forEach((sourceArray) => {
    if (Array.isArray(sourceArray)) {
      sourceArray.forEach((source: any) => {
        if (
          source &&
          (source.domain_score !== undefined ||
            source.sentiment ||
            source.category)
        ) {
          enrichedSources.push({
            title: source.title || "Untitled",
            domain_score: source.domain_score,
            sentiment: source.sentiment,
            category: source.category,
            url: source.url,
          });
        }
      });
    }
  });

  // Calculate statistics
  const totalSources = metadata.total_sources || enrichedSources.length;
  const enrichmentApplied = metadata.enrichment_applied || false;

  // Sentiment distribution
  const sentimentCounts = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };

  enrichedSources.forEach((source) => {
    if (source.sentiment) {
      const label = source.sentiment.label;
      if (label === "positive") sentimentCounts.positive++;
      else if (label === "negative") sentimentCounts.negative++;
      else sentimentCounts.neutral++;
    }
  });

  // Category distribution
  const categoryCounts: Record<string, number> = {};
  enrichedSources.forEach((source) => {
    if (source.category) {
      categoryCounts[source.category] =
        (categoryCounts[source.category] || 0) + 1;
    }
  });

  // Average domain score
  const domainScores = enrichedSources
    .map((s) => s.domain_score)
    .filter((score): score is number => score !== undefined);
  const avgDomainScore =
    domainScores.length > 0
      ? domainScores.reduce((a, b) => a + b, 0) / domainScores.length
      : 0;

  // Quality breakdown
  const highQuality = domainScores.filter((s) => s >= 0.8).length;
  const mediumQuality = domainScores.filter((s) => s >= 0.5 && s < 0.8).length;
  const lowQuality = domainScores.filter((s) => s < 0.5).length;

  // Prepare data for D3 visualizations
  const credibilityData = useMemo(() => {
    const data: Array<{
      score: number;
      type: string;
      title: string;
      url?: string;
    }> = [];

    // Extract credibility scores from credibility data
    // Structure: credibility.web/papers/news = [{ source: {...}, score: 0.8, ... }]
    if (credibility.web && Array.isArray(credibility.web)) {
      credibility.web.forEach((item: any) => {
        if (item.score !== undefined && item.source) {
          data.push({
            score: item.score,
            type: "web",
            title: item.source.title || item.source.url || "Unknown",
            url: item.source.url,
          });
        }
      });
    }

    if (credibility.papers && Array.isArray(credibility.papers)) {
      credibility.papers.forEach((item: any) => {
        if (item.score !== undefined && item.source) {
          data.push({
            score: item.score,
            type: "papers",
            title: item.source.title || item.source.url || "Unknown",
            url: item.source.url,
          });
        }
      });
    }

    if (credibility.news && Array.isArray(credibility.news)) {
      credibility.news.forEach((item: any) => {
        if (item.score !== undefined && item.source) {
          data.push({
            score: item.score,
            type: "news",
            title: item.source.title || item.source.url || "Unknown",
            url: item.source.url,
          });
        }
      });
    }

    return data;
  }, [credibility]);

  // Prepare source type data for donut chart
  const sourceTypeData = useMemo(() => {
    const webCount = sources.web?.length || 0;
    const papersCount = sources.papers?.length || 0;
    const newsCount = sources.news?.length || 0;

    return [
      { type: "web", count: webCount },
      { type: "papers", count: papersCount },
      { type: "news", count: newsCount },
    ].filter((item) => item.count > 0);
  }, [sources]);

  // Prepare scatter plot data
  const scatterData = useMemo(() => {
    const data: Array<{
      credibility: number;
      domainScore: number;
      type: string;
      title: string;
      url?: string;
    }> = [];

    // Combine credibility scores with domain scores
    credibilityData.forEach((credItem) => {
      const enrichedSource = enrichedSources.find(
        (s) => s.title === credItem.title || s.url === credItem.url
      );

      if (enrichedSource && enrichedSource.domain_score !== undefined) {
        data.push({
          credibility: credItem.score,
          domainScore: enrichedSource.domain_score,
          type: credItem.type,
          title: credItem.title,
          url: credItem.url || enrichedSource.url,
        });
      }
    });

    return data;
  }, [credibilityData, enrichedSources]);

  if (!enrichmentApplied && enrichedSources.length === 0) {
    return (
      <div className="research-metrics">
        <div className="metrics-placeholder">
          <p>📊 Enrichment metrics will appear here after research completes</p>
          <p className="hint">
            Source enrichment adds metadata, sentiment, and quality scores
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="research-metrics"
      role="region"
      aria-label="Research metrics"
    >
      <div className="metrics-header">
        <h2 className="metrics-title">📈 Research Metrics</h2>
        <div className="visualization-toggle">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={useD3Visualizations}
              onChange={(e) => setUseD3Visualizations(e.target.checked)}
            />
            <span>D3.js Visualizations (Default)</span>
          </label>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="metrics-summary">
        <div className="metric-card">
          <div className="metric-icon">📚</div>
          <div className="metric-value">{totalSources}</div>
          <div className="metric-label">Total Sources</div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⭐</div>
          <div className="metric-value">{avgDomainScore.toFixed(2)}</div>
          <div className="metric-label">Avg Domain Score</div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">✅</div>
          <div className="metric-value">{enrichmentApplied ? "Yes" : "No"}</div>
          <div className="metric-label">Enrichment Applied</div>
        </div>
      </div>

      {/* D3 Visualizations */}
      {useD3Visualizations && (
        <div className="d3-visualizations">
          {credibilityData.length > 0 && (
            <CredibilityHistogram credibilityData={credibilityData} />
          )}

          {sourceTypeData.length > 0 && (
            <SourceTypeDonut data={sourceTypeData} />
          )}

          {scatterData.length > 0 && <CredibilityScatter data={scatterData} />}
        </div>
      )}

      {/* Sentiment Analysis */}
      {sentimentCounts.positive +
        sentimentCounts.negative +
        sentimentCounts.neutral >
        0 && (
        <div className="metrics-section">
          <h3 className="section-title">📊 Sentiment Analysis</h3>
          <div className="sentiment-chart">
            <div className="sentiment-bar">
              <div
                className="sentiment-fill positive"
                style={{
                  width: `${(sentimentCounts.positive / totalSources) * 100}%`,
                }}
                title={`Positive: ${sentimentCounts.positive}`}
              />
              <div
                className="sentiment-fill neutral"
                style={{
                  width: `${(sentimentCounts.neutral / totalSources) * 100}%`,
                }}
                title={`Neutral: ${sentimentCounts.neutral}`}
              />
              <div
                className="sentiment-fill negative"
                style={{
                  width: `${(sentimentCounts.negative / totalSources) * 100}%`,
                }}
                title={`Negative: ${sentimentCounts.negative}`}
              />
            </div>
            <div className="sentiment-legend">
              <span className="legend-item">
                <span className="legend-color positive"></span>
                Positive: {sentimentCounts.positive}
              </span>
              <span className="legend-item">
                <span className="legend-color neutral"></span>
                Neutral: {sentimentCounts.neutral}
              </span>
              <span className="legend-item">
                <span className="legend-color negative"></span>
                Negative: {sentimentCounts.negative}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Category Distribution */}
      {Object.keys(categoryCounts).length > 0 && (
        <div className="metrics-section">
          <h3 className="section-title">🏷️ Category Distribution</h3>
          <div className="category-list">
            {Object.entries(categoryCounts)
              .sort(([, a], [, b]) => b - a)
              .map(([category, count]) => (
                <div key={category} className="category-item">
                  <span className="category-name">{category}</span>
                  <div className="category-bar">
                    <div
                      className="category-fill"
                      style={{ width: `${(count / totalSources) * 100}%` }}
                    />
                  </div>
                  <span className="category-count">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Source Quality Breakdown */}
      {domainScores.length > 0 && (
        <div className="metrics-section">
          <h3 className="section-title">⭐ Source Quality Breakdown</h3>
          <div className="quality-breakdown">
            <div className="quality-item">
              <span className="quality-label">High Quality (≥0.8)</span>
              <div className="quality-bar">
                <div
                  className="quality-fill high"
                  style={{
                    width: `${(highQuality / domainScores.length) * 100}%`,
                  }}
                />
              </div>
              <span className="quality-count">{highQuality}</span>
            </div>
            <div className="quality-item">
              <span className="quality-label">Medium Quality (0.5-0.8)</span>
              <div className="quality-bar">
                <div
                  className="quality-fill medium"
                  style={{
                    width: `${(mediumQuality / domainScores.length) * 100}%`,
                  }}
                />
              </div>
              <span className="quality-count">{mediumQuality}</span>
            </div>
            <div className="quality-item">
              <span className="quality-label">Low Quality (&lt;0.5)</span>
              <div className="quality-bar">
                <div
                  className="quality-fill low"
                  style={{
                    width: `${(lowQuality / domainScores.length) * 100}%`,
                  }}
                />
              </div>
              <span className="quality-count">{lowQuality}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
