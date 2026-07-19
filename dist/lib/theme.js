import{vscodeTheme as n}from"./themes/vscode.js";function a(e=n.shell){return`
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --page-bg: ${e.pageBg};
    --page-fg: ${e.pageFg};
    --panel-bg: ${e.panelBg};
    --panel-border: ${e.panelBorder};
    --panel-muted: ${e.panelMuted};
    --panel-accent: ${e.panelAccent};
    --panel-accent-on: ${e.panelAccentOn};
    --panel-success: ${e.panelSuccess};
    --terminal-bg: ${e.terminalBg};
    --header-gradient: ${e.headerGradient??"none"};

    /* Typography */
    --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --font-mono: 'JetBrains Mono', 'SF Mono', 'Menlo', 'Consolas', monospace;

    --text-xs: 0.75rem;      /* 12px */
    --text-sm: 0.875rem;     /* 14px */
    --text-base: 1rem;       /* 16px */
    --text-lg: 1.25rem;      /* 20px */
    --text-xl: 1.5rem;       /* 24px */
    --text-2xl: 1.75rem;     /* 28px */
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-family: var(--font-sans); font-size: 16px; line-height: 1.5; }
  body { font-family: var(--font-sans); }`}export{a as cssVarsStyle};
