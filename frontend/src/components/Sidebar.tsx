"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./Sidebar.css";

interface Props {
  onQuerySelect: (query: string) => void;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
}

const STARTER_QUERIES = [
  {
    id: "ai_coding_assistants",
    query: "Market size and key players in AI coding assistants 2025",
  },
  {
    id: "smb_accounting",
    query: "Top pain points cited by SMB owners about accounting software",
  },
  {
    id: "vertical_saas_health",
    query: "Recent Series A rounds in vertical SaaS for healthcare",
  },
  {
    id: "support_agents",
    query: "Competitive landscape for AI customer support agents",
  },
];

interface NavItemProps {
  href: string;
  label: string;
}

const NavItem: React.FC<NavItemProps> = ({ href, label }) => {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(`${href}/`);
  return (
    <Link href={href} className={`nav-link${isActive ? " active" : ""}`}>
      {label}
    </Link>
  );
};

export const Sidebar: React.FC<Props> = ({
  onQuerySelect,
  isOpen,
  onToggle,
}) => {
  const handleQueryClick = (query: string) => {
    onQuerySelect(query);
  };

  return (
    <aside
      className={`sidebar ${isOpen ? "open" : "closed"}`}
      role="complementary"
      aria-label="Navigation and starter queries"
    >
      <button
        className="sidebar-toggle"
        onClick={() => onToggle(!isOpen)}
        aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
        aria-expanded={isOpen}
      >
        {isOpen ? "◀" : "▶"}
      </button>

      {isOpen && (
        <div className="sidebar-content">
          <nav className="sidebar-section" aria-label="Main navigation">
            <h2 className="sidebar-heading">Workspace</h2>
            <div className="nav-links">
              <NavItem href="/research" label="Research" />
              <NavItem href="/history" label="History" />
              <NavItem href="/visualizations" label="Visualizations" />
              <NavItem href="/settings" label="Settings" />
              <NavItem href="/about" label="About" />
            </div>
          </nav>

          <div className="sidebar-divider"></div>

          <div className="sidebar-section">
            <h2 className="sidebar-heading">Starter queries</h2>
            <p className="sidebar-subtle">
              Real questions founders ask before a sprint, fundraise, or launch.
            </p>
            <div className="demo-queries">
              {STARTER_QUERIES.map((item) => (
                <button
                  key={item.id}
                  className="demo-query-button"
                  onClick={() => handleQueryClick(item.query)}
                  aria-label={`Run starter query: ${item.query}`}
                >
                  <span className="query-text">{item.query}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
