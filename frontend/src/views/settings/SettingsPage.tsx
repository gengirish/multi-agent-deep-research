import React from "react";
import { getApiUrl } from "../../services/http";

export const SettingsPage: React.FC = () => {
  const apiUrl = getApiUrl();

  return (
    <div className="page-container" style={{ paddingTop: "1rem" }}>
      <div
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          textAlign: "left",
          padding: "0 1rem",
          lineHeight: 1.6,
        }}
      >
        <h1 style={{ marginBottom: "0.25rem", fontSize: "1.6rem", fontWeight: 700 }}>Settings</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          Configure your Chronicle workspace.
        </p>

        <section style={{ marginTop: "2rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Backend</h3>
          <div
            style={{
              padding: "14px 16px",
              border: "1px solid #e2e8f0",
              borderRadius: 10,
              background: "#f8fafc",
              fontFamily:
                "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
              fontSize: "0.92rem",
              color: "#0f172a",
              wordBreak: "break-all",
            }}
          >
            {apiUrl}
          </div>
          <p style={{ color: "#64748b", fontSize: "0.88rem", marginTop: 8 }}>
            Set <code>VITE_API_URL</code> at build time to change which
            backend this frontend talks to.
          </p>
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Privacy</h3>
          <p>
            Chronicle does not require an account. Queries are sent to the
            backend and to upstream providers (OpenRouter, Tavily, Perplexity,
            ArXiv) to fulfill the research. We do not sell, rent, or share
            your queries.
          </p>
        </section>

        <section style={{ marginTop: "2rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Open source</h3>
          <p>
            Everything you see is open source. Inspect the agents, the
            prompts, and the orchestration on{" "}
            <a
              href="https://github.com/gengirish/multi-agent-deep-research"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
};
