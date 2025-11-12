import React from "react";
import "./ErrorBanner.css";

interface ErrorBannerProps {
  error: string | Error;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  error,
  onRetry,
  onDismiss,
}) => {
  const errorMessage = error instanceof Error ? error.message : error;

  return (
    <div className="error-banner" role="alert" aria-live="assertive">
      <div className="error-banner-content">
        <span className="error-icon" aria-hidden="true">
          ⚠️
        </span>
        <div className="error-message">
          <strong>Error</strong>
          <p>{errorMessage}</p>
        </div>
        <div className="error-actions">
          {onRetry && (
            <button
              onClick={onRetry}
              className="error-button retry-button"
              aria-label="Retry operation"
            >
              🔄 Retry
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="error-button dismiss-button"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
