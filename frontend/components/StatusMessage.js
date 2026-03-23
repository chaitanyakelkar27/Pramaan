"use client";

import { useEffect, useRef } from "react";

/**
 * StatusMessage - A reusable component for displaying status messages
 * 
 * @param {Object} props
 * @param {'info' | 'success' | 'warning' | 'error' | 'progress'} props.type - Message type
 * @param {string} props.message - The message text
 * @param {string} [props.title] - Optional title/header
 * @param {boolean} [props.animate] - Whether to announce to screen readers
 * @param {React.ReactNode} [props.children] - Additional content
 * @param {React.ReactNode} [props.action] - Optional action button/link
 */
export default function StatusMessage({ 
  type = "info", 
  message, 
  title,
  animate = true,
  children,
  action
}) {
  const ref = useRef(null);

  // Styles based on type
  const styles = {
    info: {
      background: "var(--color-info-bg)",
      borderColor: "var(--color-info-border)",
      color: "var(--color-info)",
      icon: "i"
    },
    success: {
      background: "var(--color-success-bg)",
      borderColor: "var(--color-success-border)",
      color: "var(--color-success)",
      icon: "checkmark"
    },
    warning: {
      background: "var(--color-warning-bg)",
      borderColor: "var(--color-warning-border)",
      color: "var(--color-warning)",
      icon: "!"
    },
    error: {
      background: "var(--color-error-bg)",
      borderColor: "var(--color-error-border)",
      color: "var(--color-error)",
      icon: "x"
    },
    progress: {
      background: "var(--color-info-bg)",
      borderColor: "var(--color-info-border)",
      color: "var(--color-info)",
      icon: "spinner"
    }
  };

  const style = styles[type] || styles.info;

  // Auto-scroll into view when message appears
  useEffect(() => {
    if (animate && ref.current && message) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [message, animate]);

  if (!message && !children) {
    return null;
  }

  return (
    <div
      ref={ref}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-md)",
        padding: "var(--space-md) var(--space-lg)",
        background: style.background,
        border: `1px solid ${style.borderColor}`,
        borderRadius: "var(--radius-lg)",
        color: style.color
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          background: style.color,
          color: "white",
          fontSize: 12,
          fontWeight: 700
        }}
      >
        {style.icon === "spinner" ? (
          <div
            style={{
              width: 14,
              height: 14,
              border: "2px solid rgba(255,255,255,0.3)",
              borderTopColor: "white",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }}
          />
        ) : style.icon === "checkmark" ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : style.icon === "x" ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : (
          style.icon
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontWeight: 700, marginBottom: "var(--space-xs)" }}>
            {title}
          </div>
        )}
        {message && (
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            {message}
          </div>
        )}
        {children}
        {action && (
          <div style={{ marginTop: "var(--space-sm)" }}>
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ProgressSteps - Shows multi-step progress
 */
export function ProgressSteps({ currentStep, steps }) {
  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-sm)",
        padding: "var(--space-md) var(--space-lg)",
        background: "var(--color-info-bg)",
        border: "1px dashed var(--color-info-border)",
        borderRadius: "var(--radius-lg)"
      }}
    >
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isComplete = index < currentStep;
        
        return (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-sm)",
              opacity: isActive || isComplete ? 1 : 0.5
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                background: isComplete ? "var(--color-success)" : isActive ? "var(--color-primary)" : "var(--color-border)",
                color: isComplete || isActive ? "white" : "var(--color-text-muted)"
              }}
            >
              {isComplete ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : isActive ? (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "white",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite"
                  }}
                />
              ) : (
                index + 1
              )}
            </div>
            <span
              style={{
                fontSize: 14,
                color: isActive ? "var(--color-info)" : isComplete ? "var(--color-success)" : "var(--color-text-muted)",
                fontWeight: isActive ? 600 : 400
              }}
            >
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * InlineStatus - A compact inline status indicator
 */
export function InlineStatus({ type = "info", message }) {
  const colors = {
    info: "var(--color-info)",
    success: "var(--color-success)",
    warning: "var(--color-warning)",
    error: "var(--color-error)"
  };

  if (!message) {
    return null;
  }

  return (
    <p
      role="status"
      aria-live="polite"
      style={{
        margin: 0,
        fontSize: 14,
        color: colors[type] || colors.info
      }}
    >
      {message}
    </p>
  );
}
