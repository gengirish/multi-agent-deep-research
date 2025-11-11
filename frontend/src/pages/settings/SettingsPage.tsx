import React from "react";

export const SettingsPage: React.FC = () => {
  return (
    <div className="page-container">
      <h2>Settings</h2>
      <p>Configure your research experience</p>
      <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
        <p>⚙️ Settings panel coming soon...</p>
        <p style={{ fontSize: "0.9rem", marginTop: "1rem" }}>
          This page will allow you to configure API endpoints, demo mode, and
          other preferences.
        </p>
      </div>
    </div>
  );
};
