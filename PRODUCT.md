# Product

## Register

product

## Users

Solo developers and terminal-first operators who run long-lived tmux sessions on a home server, remote VPS, or workstation. They access the tool from whatever device is nearby — laptop, tablet, phone — through a browser.

## Product Purpose

tmux-weblink turns a tmux server into a personal, always-available terminal reachable from any browser. It is not a team dashboard or a generic cloud shell; it is a focused tool for one person who wants their sessions in their pocket without installing a native app.

Success means the interface gets out of the way: you open it, authenticate quickly, and you are back in your session. The design should feel like a calm, considered native app rather than a web portal.

## Brand Personality

Soft, quiet, precise.

- **Gentle**: muted colors, no harsh contrasts, no neon accents.
- **Tidy**: generous whitespace, clear hierarchy, nothing decorative without purpose.
- **Considered**: small thoughtful details — smooth transitions, proper focus states, responsive touch targets — that reward frequent use.

## Anti-references

- Traditional enterprise admin panels: heavy sidebars, dense tables, icon overload, corporate blue everywhere.
- SaaS landing-page aesthetics inside the app: gradient hero cards, oversized illustrations, chat widgets, upsell banners.
- "Developer tool" clichés: terminal-green highlights, matrix effects, exaggerated glow, monospace body text everywhere.

## Design Principles

1. **Personal workspace, not a portal.** The interface is a frame around your tmux session; the chrome should recede.
2. **Clarity over novelty.** Every visual choice must improve readability or wayfinding, not decorate.
3. **Touch the surface, keep the structure.** Polished details are welcome when they make the tool feel native, but never at the cost of performance or simplicity.
4. **One hand, any screen.** Authentication and primary controls must work comfortably on a phone held in one hand.
5. **Restrained warmth.** Use soft, slightly tinted neutrals and a single calm accent; avoid cold grays and sterile whites.

## Accessibility & Inclusion

- Target WCAG 2.2 AA for all auth and control surfaces.
- Respect `prefers-reduced-motion`; no motion-only affordances.
- Touch targets ≥ 44 × 44 dp on mobile.
- Placeholder and muted text must maintain 4.5:1 contrast.
