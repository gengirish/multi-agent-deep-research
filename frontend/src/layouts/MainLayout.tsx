import React from "react";
import { Outlet } from "react-router-dom";
import "../App.css";
import { Sidebar } from "../components/Sidebar";

interface MainLayoutProps {
  demoMode: boolean;
  onDemoModeChange: (value: boolean) => void;
  sidebarOpen: boolean;
  onSidebarToggle: (value: boolean) => void;
  onQuerySelect: (query: string) => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  demoMode,
  onDemoModeChange,
  sidebarOpen,
  onSidebarToggle,
  onQuerySelect,
}) => {
  return (
    <div
      className={`app-container ${sidebarOpen ? "sidebar-open" : ""}`}
      role="main"
    >
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <Sidebar
        onQuerySelect={onQuerySelect}
        demoMode={demoMode}
        onDemoModeChange={onDemoModeChange}
        isOpen={sidebarOpen}
        onToggle={onSidebarToggle}
      />

      <header className="app-header" role="banner">
        <h1>🤖 Multi-Agent AI Deep Researcher</h1>
        <p>Accessible research powered by specialized AI agents</p>
      </header>

      <main id="main-content" className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer" role="contentinfo">
        <p>
          Multi-Agent AI Deep Researcher | Built with React, Vite, and FastAPI
        </p>
      </footer>
    </div>
  );
};
