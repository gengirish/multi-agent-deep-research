import React, { lazy } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { MainLayout } from "./layouts/MainLayout";

// Lazy load pages for code splitting
const ResearchPage = lazy(() =>
  import("./pages/research/ResearchPage").then((module) => ({
    default: module.ResearchPage,
  }))
);

const HistoryPage = lazy(() =>
  import("./pages/history/HistoryPage").then((module) => ({
    default: module.HistoryPage,
  }))
);

const SessionDetailPage = lazy(() =>
  import("./pages/history/SessionDetailPage").then((module) => ({
    default: module.SessionDetailPage,
  }))
);

const VisualizationsPage = lazy(() =>
  import("./pages/visualizations/VisualizationsPage").then((module) => ({
    default: module.VisualizationsPage,
  }))
);

const SettingsPage = lazy(() =>
  import("./pages/settings/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  }))
);

const AboutPage = lazy(() =>
  import("./pages/about/AboutPage").then((module) => ({
    default: module.AboutPage,
  }))
);

interface AppRouterProps {
  demoMode: boolean;
  onDemoModeChange: (value: boolean) => void;
  sidebarOpen: boolean;
  onSidebarToggle: (value: boolean) => void;
  onQuerySelect: (query: string) => void;
  initialQuery: string;
  onQueryChange: (query: string) => void;
}

export const createAppRouter = (props: AppRouterProps) => {
  return createBrowserRouter([
    {
      path: "/",
      element: (
        <MainLayout
          demoMode={props.demoMode}
          onDemoModeChange={props.onDemoModeChange}
          sidebarOpen={props.sidebarOpen}
          onSidebarToggle={props.onSidebarToggle}
          onQuerySelect={props.onQuerySelect}
        />
      ),
      children: [
        {
          index: true,
          element: <Navigate to="/research" replace />,
        },
        {
          path: "research",
          element: (
            <React.Suspense
              fallback={<div className="loading">Loading...</div>}
            >
              <ResearchPage
                initialQuery={props.initialQuery}
                onQueryChange={props.onQueryChange}
              />
            </React.Suspense>
          ),
        },
        {
          path: "history",
          element: (
            <React.Suspense
              fallback={<div className="loading">Loading...</div>}
            >
              <HistoryPage />
            </React.Suspense>
          ),
        },
        {
          path: "history/:id",
          element: (
            <React.Suspense
              fallback={<div className="loading">Loading...</div>}
            >
              <SessionDetailPage />
            </React.Suspense>
          ),
        },
        {
          path: "visualizations",
          element: (
            <React.Suspense
              fallback={<div className="loading">Loading...</div>}
            >
              <VisualizationsPage />
            </React.Suspense>
          ),
        },
        {
          path: "settings",
          element: (
            <React.Suspense
              fallback={<div className="loading">Loading...</div>}
            >
              <SettingsPage />
            </React.Suspense>
          ),
        },
        {
          path: "about",
          element: (
            <React.Suspense
              fallback={<div className="loading">Loading...</div>}
            >
              <AboutPage />
            </React.Suspense>
          ),
        },
      ],
    },
  ]);
};

export const AppRouter: React.FC<AppRouterProps> = (props) => {
  const router = createAppRouter(props);
  return <RouterProvider router={router} />;
};
