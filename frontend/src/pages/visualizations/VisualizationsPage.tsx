import React from "react";

export const VisualizationsPage: React.FC = () => {
  return (
    <div className="page-container">
      <h2>Data Visualizations</h2>
      <p>Explore interactive charts and insights</p>
      <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
        <p>📊 Visualizations playground coming soon...</p>
        <p style={{ fontSize: "0.9rem", marginTop: "1rem" }}>
          This page will showcase D3.js charts for credibility scores, source
          types, and agent performance.
        </p>
      </div>
    </div>
  );
};
