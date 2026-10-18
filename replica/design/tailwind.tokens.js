// Generated from tokens.json. Spread into tailwind.config: { ...require('./replica/design/tailwind.tokens.js') }
module.exports = {
  "theme": {
    "screens": {
      "sm": "640px",
      "md": "768px",
      "lg": "1024px",
      "xl": "1280px"
    },
    "extend": {
      "colors": {
        "bg": "var(--color-bg)",
        "surface": "var(--color-surface)",
        "border": "var(--color-border)",
        "border-input": "var(--color-border-input)",
        "text": "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
        "accent": "var(--color-accent)",
        "on-accent": "var(--color-on-accent)",
        "danger": "var(--color-danger)",
        "success": "var(--color-success)",
        "verdict-real": "var(--color-verdict-real)",
        "verdict-unsure": "var(--color-verdict-unsure)",
        "highlight": "var(--color-highlight)",
        "warning": "var(--color-warning)",
        "focus": "var(--color-focus)",
        "verdict-real-bg": "var(--color-verdict-real-bg)",
        "verdict-ai": "var(--color-verdict-ai)",
        "verdict-ai-bg": "var(--color-verdict-ai-bg)",
        "verdict-edited": "var(--color-verdict-edited)",
        "verdict-edited-bg": "var(--color-verdict-edited-bg)",
        "verdict-context": "var(--color-verdict-context)",
        "verdict-context-bg": "var(--color-verdict-context-bg)",
        "verdict-unsure-bg": "var(--color-verdict-unsure-bg)",
        "strength-on": "var(--color-strength-on)",
        "strength-off": "var(--color-strength-off)"
      },
      "fontFamily": {
        "sans": [
          "var(--font-sans)"
        ],
        "mono": [
          "var(--font-mono)"
        ]
      },
      "fontSize": {
        "xs": [
          "var(--text-xs)",
          {
            "lineHeight": "var(--leading-xs)",
            "fontWeight": "var(--weight-xs)"
          }
        ],
        "sm": [
          "var(--text-sm)",
          {
            "lineHeight": "var(--leading-sm)",
            "fontWeight": "var(--weight-sm)"
          }
        ],
        "base": [
          "var(--text-base)",
          {
            "lineHeight": "var(--leading-base)",
            "fontWeight": "var(--weight-base)"
          }
        ],
        "lg": [
          "var(--text-lg)",
          {
            "lineHeight": "var(--leading-lg)",
            "fontWeight": "var(--weight-lg)"
          }
        ],
        "xl": [
          "var(--text-xl)",
          {
            "lineHeight": "var(--leading-xl)",
            "fontWeight": "var(--weight-xl)"
          }
        ],
        "display": [
          "var(--text-display)",
          {
            "lineHeight": "var(--leading-display)",
            "fontWeight": "var(--weight-display)"
          }
        ]
      },
      "spacing": {
        "0": "0px",
        "4": "4px",
        "8": "8px",
        "12": "12px",
        "16": "16px",
        "24": "24px",
        "32": "32px",
        "48": "48px",
        "64": "64px"
      },
      "borderRadius": {
        "sm": "var(--radius-sm)",
        "md": "var(--radius-md)",
        "lg": "var(--radius-lg)",
        "pill": "var(--radius-pill)"
      },
      "boxShadow": {
        "card": "var(--shadow-card)",
        "pop": "var(--shadow-pop)"
      },
      "maxWidth": {
        "content": "var(--layout-content-max)",
        "reading": "var(--layout-reading-max)"
      }
    }
  }
};
