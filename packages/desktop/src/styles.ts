/**
 * Stylesheet for the desktop GUI, inlined into the single HTML document.
 * Written by hand rather than generated so the app has zero runtime styling
 * dependencies.
 */

export const BRAND_CSS = `
:root {
  --brand: #4338ca;
  --brand-dark: #3730a3;
  --ink: #0f172a;
  --muted: #64748b;
  --faint: #94a3b8;
  --line: #e2e8f0;
  --surface: #f8fafc;
  --good: #059669;
  --warn: #d97706;
  --bad: #dc2626;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font: 14px/1.5 "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  color: var(--ink);
  background: var(--surface);
  -webkit-font-smoothing: antialiased;
}
#app { display: flex; min-height: 100vh; }

/* Rail ------------------------------------------------------------------ */
.rail {
  width: 210px; flex-shrink: 0; background: var(--ink); color: #cbd5e1;
  display: flex; flex-direction: column; padding: 18px 12px;
}
.logo { display: flex; align-items: center; gap: 9px; color: #fff; font-weight: 700; margin-bottom: 22px; }
.logo span {
  width: 28px; height: 28px; border-radius: 7px; background: var(--brand);
  display: grid; place-items: center; font-weight: 800; font-size: 14px;
}
.rail nav { display: flex; flex-direction: column; gap: 2px; }
.nav {
  appearance: none; border: 0; background: transparent; color: #cbd5e1;
  text-align: left; padding: 9px 11px; border-radius: 8px; cursor: pointer;
  font-size: 13.5px; font-weight: 500; font-family: inherit;
}
.nav:hover { background: rgba(255,255,255,.07); color: #fff; }
.nav.active { background: var(--brand); color: #fff; }
.rail-foot { margin-top: auto; padding: 10px 11px; border-top: 1px solid rgba(255,255,255,.1); }

/* Main ------------------------------------------------------------------ */
main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 26px; background: #fff; border-bottom: 1px solid var(--line);
  position: sticky; top: 0; z-index: 10;
}
.topbar h1 { font-size: 18px; margin: 0; font-weight: 700; }
.topbar-right { display: flex; align-items: center; gap: 10px; }
.pill {
  background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
  padding: 4px 12px; font-size: 12.5px; font-weight: 700;
}
.pill.good { color: var(--good); border-color: #a7f3d0; background: #ecfdf5; }
.pill.warn { color: var(--warn); border-color: #fde68a; background: #fffbeb; }
.pill.bad { color: var(--bad); border-color: #fecaca; background: #fef2f2; }
.view { padding: 24px 26px 60px; max-width: 1080px; width: 100%; }

/* Typography ------------------------------------------------------------ */
h2 { font-size: 16px; font-weight: 700; margin: 26px 0 12px; }
h3 { font-size: 14px; font-weight: 700; margin: 0 0 4px; }
p { margin: 0 0 12px; }
.muted { color: var(--muted); }
.small { font-size: 12.5px; }
.tiny { font-size: 11.5px; }

/* Cards ----------------------------------------------------------------- */
.card {
  background: #fff; border: 1px solid var(--line); border-radius: 10px;
  padding: 16px; margin-bottom: 12px;
}
.card.flush { padding: 0; overflow: hidden; }
.card.bad { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
.grid { display: grid; gap: 12px; }
.grid.two { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.grid.three { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.row-right { text-align: right; flex-shrink: 0; }
.gap-top { margin-top: 14px; }

/* KPIs ------------------------------------------------------------------ */
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 8px; }
.kpi { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 13px 15px; }
.kpi-value { font-size: 24px; font-weight: 800; line-height: 1.1; }
.kpi-value.good { color: var(--good); }
.kpi-value.warn { color: var(--warn); }
.kpi-value.bad { color: var(--bad); }
.kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--faint); margin-top: 3px; }

/* Bars ------------------------------------------------------------------ */
.bar { height: 7px; background: var(--surface); border-radius: 999px; overflow: hidden; border: 1px solid var(--line); margin-top: 10px; }
.bar-fill { height: 100%; }
.bar-fill.good { background: var(--good); }
.bar-fill.warn { background: var(--warn); }
.bar-fill.bad { background: var(--bad); }
.score { font-size: 22px; font-weight: 800; }
.score.good { color: var(--good); }
.score.warn { color: var(--warn); }
.score.bad { color: var(--bad); }

/* Countdowns ------------------------------------------------------------ */
.countdown { border-left: 3px solid var(--brand); }
.countdown.urgent { border-left-color: var(--warn); background: #fffbeb; }
.cd-label { font-weight: 600; margin: 2px 0 6px; }
.cd-days { font-size: 26px; font-weight: 800; color: var(--brand); line-height: 1; }
.cd-days.bad { color: var(--bad); font-size: 18px; }

/* Gaps ------------------------------------------------------------------ */
.gap { display: flex; gap: 11px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.gap:last-child { border-bottom: 0; }
.gap-body { min-width: 0; }
.gap-title { font-weight: 600; margin-bottom: 2px; }
.sev {
  flex-shrink: 0; width: 68px; text-align: center; align-self: flex-start;
  font-size: 10.5px; font-weight: 700; text-transform: uppercase;
  padding: 3px 0; border-radius: 5px; letter-spacing: .03em;
}
.sev.error, .sev.critical { background: #fee2e2; color: #991b1b; }
.sev.warning, .sev.high { background: #fef3c7; color: #92400e; }
.sev.info, .sev.medium, .sev.low { background: #e0f2fe; color: #075985; }

/* Scope ----------------------------------------------------------------- */
.scope-row { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--line); }
.scope-row:last-child { border-bottom: 0; }
.dot { color: var(--line); }
.dot.on { color: var(--good); }

/* Forms ----------------------------------------------------------------- */
.field { display: block; margin-bottom: 12px; }
.field > span { display: block; font-size: 12.5px; font-weight: 600; margin-bottom: 4px; }
.field.check { display: flex; align-items: center; gap: 9px; }
.field.check > span { margin: 0; order: 2; }
.input, .field input[type=text], .field input[type=number] {
  width: 100%; padding: 8px 11px; border: 1px solid var(--line); border-radius: 7px;
  font: inherit; background: #fff; outline: none;
}
.input:focus, .field input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px #e0e7ff; }
select {
  width: 100%; padding: 7px 10px; border: 1px solid var(--line);
  border-radius: 7px; font: inherit; background: #fff;
}

/* Buttons --------------------------------------------------------------- */
.btn {
  appearance: none; border: 0; border-radius: 8px; padding: 9px 15px;
  font: inherit; font-weight: 600; font-size: 13.5px; cursor: pointer;
}
.btn.primary { background: var(--brand); color: #fff; }
.btn.primary:hover { background: var(--brand-dark); }
.btn.ghost { background: var(--surface); color: var(--ink); border: 1px solid var(--line); }
.btn.ghost:hover { background: #fff; }
.btn:disabled { opacity: .55; cursor: not-allowed; }

/* Questionnaire --------------------------------------------------------- */
.tabs { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
.tab {
  appearance: none; border: 1px solid var(--line); background: #fff;
  border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 13px;
  font-weight: 600; cursor: pointer; color: var(--muted);
}
.tab.active { background: var(--brand); border-color: var(--brand); color: #fff; }
.article { padding: 16px 18px; }
.q { padding: 11px 0; border-top: 1px solid var(--line); }
.q:first-child { border-top: 0; }
.q-text { font-weight: 500; margin-bottom: 6px; }
.q select { max-width: 460px; }

/* States ---------------------------------------------------------------- */
.empty { text-align: center; padding: 56px 24px; }
.empty h2 { font-size: 20px; }
.empty p { color: var(--muted); max-width: 480px; margin: 0 auto 18px; }
.loading { padding: 30px; color: var(--muted); text-align: center; }
.doc h3 { margin: 0 0 3px; }

/* Toast ----------------------------------------------------------------- */
.toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: #fff; padding: 11px 18px; border-radius: 9px;
  font-size: 13.5px; z-index: 100; max-width: 70vw; box-shadow: 0 10px 30px rgba(15,23,42,.3);
}
.toast.warn { background: var(--bad); }

@media (max-width: 760px) {
  #app { flex-direction: column; }
  .rail { width: 100%; flex-direction: row; align-items: center; overflow-x: auto; }
  .rail nav { flex-direction: row; }
  .rail-foot { display: none; }
  .view { padding: 18px 16px 50px; }
}
`;
