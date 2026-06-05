const colors = {
  brand: "#589BFF",
  "brand-accent": "#D8EE53",
  "brand-dark": "#131313",
  "brand-white": "#FFFFFF",
  "brand-bg": "#F4F6FB",
  "brand-subtext": "#4B5563",
  "brand-surface": "#FBFCFF",
  "brand-surface-strong": "#F0F4FA",
  "brand-ink-soft": "#1F2937",
  
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#589BFF",

  "status-success-bg": "#ECFDF3",
  "status-success-text": "#027A48",
  "status-warning-bg": "#FFFAEB",
  "status-warning-text": "#B54708",
  "status-error-bg": "#FEF3F2",
  "status-error-text": "#B42318",
  "status-info-bg": "#EFF6FF",
  "status-info-text": "#1D4ED8",
  "status-neutral-bg": "#F3F4F6",
  "status-neutral-text": "#475467",

  // Call-specific theme tokens
  "call-bg": "#111113",
  "call-surface": "#161618",
  "call-lobby": "#060B14",
  "call-border": "rgba(255, 255, 255, 0.06)",
};

const state = {
  waiting: "#f59e0b",
  connecting: "#3b82f6",
  live: "#22c55e",
  error: "#ef4444",
};

const fonts = {
  sans: ["var(--font-sans)", "sans-serif"],
  display: ["var(--font-display)", "sans-serif"],
};

const radius = {
  lg: "1rem",
  xl: "1.5rem",
};

const layout = {
  "container-max": "1200px",
  "page-max": "1440px",
  "space-page-x": "2rem",
  "space-page-y": "2rem",
  "space-section": "1.5rem",
};

const fontSizes = {
  display: "clamp(2rem, 3vw, 3rem)",
  h1: "clamp(1.625rem, 2.15vw, 2.25rem)",
  h2: "clamp(1.375rem, 1.6vw, 1.75rem)",
  h3: "clamp(1rem, 1.05vw, 1.125rem)",
  body: "0.875rem",
  "body-sm": "0.8125rem",
  caption: "0.75rem",
  label: "0.78125rem",
};

module.exports = {
  colors,
  state,
  fonts,
  radius,
  layout,
  fontSizes,
};
