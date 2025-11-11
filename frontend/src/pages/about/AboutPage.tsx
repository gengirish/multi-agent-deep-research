import React from "react";

export const AboutPage: React.FC = () => {
  return (
    <div className="page-container">
      <h2>About</h2>
      <div style={{ maxWidth: "800px", margin: "0 auto", lineHeight: "1.8" }}>
        <h3>Multi-Agent AI Deep Researcher</h3>
        <p>
          An advanced research platform powered by specialized AI agents working
          in parallel to provide comprehensive, credible insights.
        </p>

        <h4 style={{ marginTop: "2rem" }}>Our Agents</h4>
        <ul style={{ listStyle: "none", padding: 0 }}>
          <li>
            🔍 <strong>Retriever</strong> - Searches web, papers, and news
          </li>
          <li>
            📊 <strong>Enricher</strong> - Adds metadata and sentiment analysis
          </li>
          <li>
            🔬 <strong>Analyzer</strong> - Identifies patterns and
            contradictions
          </li>
          <li>
            💡 <strong>Insight Generator</strong> - Generates hypotheses and
            insights
          </li>
          <li>
            📄 <strong>Report Builder</strong> - Compiles comprehensive reports
          </li>
        </ul>

        <h4 style={{ marginTop: "2rem" }}>Technology Stack</h4>
        <p>
          Built with React, Vite, TypeScript, FastAPI, and powered by
          state-of-the-art language models through OpenRouter.
        </p>

        <h4 style={{ marginTop: "2rem" }}>Accessibility</h4>
        <p>
          Designed with WCAG 2.1 AA standards in mind, featuring keyboard
          navigation, screen reader support, and high contrast themes.
        </p>
      </div>
    </div>
  );
};
