export function cssVarsStyle(): string {
	return `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  :root {
    --page-bg: #111111;
    --page-fg: #d0d0d0;
    --panel-bg: #11161d;
    --panel-border: #243241;
    --panel-muted: #8a97a6;
    --panel-accent: #f3f7fb;
    --panel-success: #73c991;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }`;
}
