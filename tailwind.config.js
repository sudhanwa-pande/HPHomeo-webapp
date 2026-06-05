const tokens = require("./src/config/design-tokens");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Base brand tokens mapping to CSS variables
        brand: {
          DEFAULT: "var(--brand)",
          accent: "var(--brand-accent)",
          dark: "var(--brand-dark)",
          white: "var(--brand-white)",
          bg: "var(--brand-bg)",
          subtext: "var(--brand-subtext)",
          surface: "var(--brand-surface)",
          "surface-strong": "var(--brand-surface-strong)",
          "ink-soft": "var(--brand-ink-soft)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        error: "var(--error)",
        info: "var(--info)",

        // Status backgrounds and text
        "status-success-bg": "var(--status-success-bg)",
        "status-success-text": "var(--status-success-text)",
        "status-warning-bg": "var(--status-warning-bg)",
        "status-warning-text": "var(--status-warning-text)",
        "status-error-bg": "var(--status-error-bg)",
        "status-error-text": "var(--status-error-text)",
        "status-info-bg": "var(--status-info-bg)",
        "status-info-text": "var(--status-info-text)",
        "status-neutral-bg": "var(--status-neutral-bg)",
        "status-neutral-text": "var(--status-neutral-text)",

        // Call UI design system variables
        "call-bg": "var(--call-bg)",
        "call-surface": "var(--call-surface)",
        "call-lobby": "var(--call-lobby)",
        "call-border": "var(--call-border)",

        // Semantic UX mapping layer
        "app-bg": "var(--call-bg)",
        panel: "var(--call-surface)",
        overlay: "var(--call-lobby)",

        // State tokens layer
        state: {
          waiting: "var(--state-waiting)",
          connecting: "var(--state-connecting)",
          live: "var(--state-live)",
          error: "var(--state-error)",
        },
      },
      fontFamily: tokens.fonts,
      borderRadius: {
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      spacing: tokens.layout,
      fontSize: tokens.fontSizes,
    },
  },
  plugins: [],
};
