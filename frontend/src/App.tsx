import React, { useState } from "react";
import "./App.css";
import { AppRouter } from "./router";

export const App: React.FC = () => {
  const [demoMode, setDemoMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [initialQuery, setInitialQuery] = useState<string>("");

  const handleQuerySelect = (selectedQuery: string) => {
    setInitialQuery(selectedQuery);
  };

  return (
    <AppRouter
      demoMode={demoMode}
      onDemoModeChange={setDemoMode}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={setSidebarOpen}
      onQuerySelect={handleQuerySelect}
      initialQuery={initialQuery}
      onQueryChange={setInitialQuery}
    />
  );
};
