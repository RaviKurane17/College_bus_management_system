const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, '..');
const cssDir = path.join(frontendDir, 'css');
const layoutCssPath = path.join(cssDir, 'layout.css');

// 1. Create the new mobile-first layout.css
const layoutCSSContent = `
/* ========================================================
   COLLEGE BUS MANAGEMENT - MOBILE FIRST CORE LAYOUT
   ======================================================== */

/* ---------- CSS VARIABLES ---------- */
:root {
  --sidebar-w:        260px;
  --header-h:          64px;
  --clr-bg:            #0b1120;
  --clr-surface:       #111a2e;
  --clr-surface-2:     #162032;
  --clr-border:        rgba(255,255,255,0.06);
  --clr-border-strong: rgba(255,255,255,0.10);
  --clr-text:          #e2e8f0;
  --clr-muted:         #94a3b8;
  --clr-accent:        #f59e0b;
  --clr-accent-2:      #3b82f6;
  --clr-green:         #10b981;
  --clr-red:           #ef4444;
  --clr-orange:        #f97316;
  --clr-purple:        #8b5cf6;
  --clr-cyan:          #06b6d4;
  --radius-sm:         8px;
  --radius-md:         12px;
  --radius-lg:         16px;
  --radius-xl:         20px;
  --shadow-card:       0 4px 24px rgba(0,0,0,0.30);
  --shadow-elevated:   0 8px 40px rgba(0,0,0,0.45);
  --transition:        0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ---------- RESET & BASE ---------- */
*, *::before, *::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html { 
  font-size: 14px; /* Mobile first typography */
  scroll-behavior: smooth; 
}

body {
  font-family: 'Poppins', 'Segoe UI', system-ui, sans-serif;
  background: var(--clr-bg);
  color: var(--clr-text);
  min-height: 100vh;
  overflow-x: hidden;
}

img, table {
  max-width: 100%;
}

/* ---------- APP SHELL (MOBILE DEFAULT) ---------- */
.app-shell {
  display: flex;
  min-height: 100vh;
  width: 100%;
}

/* Sidebar Drawer - Hidden by default on Mobile */
.sidebar {
  width: 280px;
  min-width: 280px;
  background: var(--clr-surface);
  border-right: 1px solid var(--clr-border);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; left: 0; bottom: 0;
  z-index: 1000;
  transform: translateX(-100%); /* Hidden */
  transition: transform var(--transition);
  overflow-x: hidden;
}

.sidebar.open {
  transform: translateX(0); /* Shown */
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  z-index: 999;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition);
}

.sidebar-overlay.show {
  opacity: 1;
  pointer-events: all;
}

/* Main Content Wrapper - 100% width on Mobile */
.main-wrap {
  flex: 1;
  width: 100%;
  max-width: 100%;
  margin-left: 0; /* No margin on mobile */
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* Topbar - Mobile */
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: rgba(11,17,32,0.95);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--clr-border);
  padding: 10px 14px;
  min-height: var(--header-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-left .page-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #f1f5f9;
  white-space: nowrap;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Buttons & Inputs - Touch Optimized */
button, .btn {
  min-height: 44px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-weight: 600;
  transition: all var(--transition);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
}

input, select, textarea {
  min-height: 48px;
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--clr-border-strong);
  color: var(--clr-text);
  font-family: inherit;
  outline: none;
}

input:focus, select:focus {
  border-color: var(--clr-accent);
  background: rgba(255,255,255,0.1);
}

/* Base Grids - 1 Column Mobile */
.stats-row, .dashboard-grid, .cards-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.page-content {
  padding: 16px;
  flex: 1;
}

/* Cards */
.card, .panel, .stat-card {
  width: 100%;
  background: var(--clr-surface);
  border: 1px solid var(--clr-border);
  border-radius: var(--radius-lg);
  padding: 16px;
  margin-bottom: 16px;
}

/* Tables */
.table-responsive {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* ========================================================
   TABLET & DESKTOP SCALING (MIN-WIDTH)
   ======================================================== */

@media (min-width: 768px) {
  html { font-size: 15px; }
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .dashboard-grid { grid-template-columns: repeat(2, 1fr); }
  .page-content { padding: 24px; }
}

@media (min-width: 992px) {
  /* Sidebar docks to the left */
  .sidebar {
    transform: translateX(0);
    width: var(--sidebar-w);
    min-width: var(--sidebar-w);
  }
  
  .sidebar.collapsed {
    width: 72px;
    min-width: 72px;
  }
  
  .sidebar-overlay {
    display: none !important;
  }
  
  /* Main content shifts right */
  .main-wrap {
    margin-left: var(--sidebar-w);
    width: calc(100% - var(--sidebar-w));
  }
  
  .sidebar.collapsed ~ .main-wrap {
    margin-left: 72px;
    width: calc(100% - 72px);
  }
  
  /* Desktop Layouts */
  .stats-row { grid-template-columns: repeat(4, 1fr); }
  .topbar { padding: 0 28px; }
  .page-content { padding: 24px 28px 40px; }
}
`;

fs.writeFileSync(layoutCssPath, layoutCSSContent);
console.log('Created css/layout.css');

// 2. Strip duplicate <style> blocks and add layout.css
const files = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(frontendDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  let modified = false;

  // Add layout.css if missing
  if (!content.includes('layout.css')) {
    content = content.replace('<link rel="stylesheet" href="css/style.css?v=8">', '<link rel="stylesheet" href="css/layout.css">\n  <link rel="stylesheet" href="css/style.css?v=8">');
    modified = true;
  }

  // Remove the giant <style> block
  // A simple regex to find the <style> that contains 'ADMIN DASHBOARD' or similar
  // Or just find <style> and </style> and if it contains --sidebar-w, wipe it.
  const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
  
  content = content.replace(styleRegex, (match, innerCss) => {
    if (innerCss.includes('--sidebar-w:') || innerCss.includes('.app-shell') || innerCss.includes('.sidebar-nav')) {
      // Keep only specific non-layout rules if needed, but for now we wipe the block.
      // Wait, we need to keep page-specific CSS!
      // Let's just wipe the layout parts.
      // Actually, removing it entirely and letting layout.css take over is safer if they duplicated EVERYTHING.
      // Let's do a safer approach: Replace the entire match with a <style> containing only what is NOT layout.
      let keptCss = innerCss
        .replace(/\/\* ---------- RESET & BASE ---------- \*\/[\s\S]*?(?=\/\* ----------)/, '')
        .replace(/\/\* ---------- CSS VARIABLES ---------- \*\/[\s\S]*?(?=\/\* ----------)/, '')
        .replace(/\/\* ---------- LAYOUT ---------- \*\/[\s\S]*?(?=\/\* ----------)/, '')
        .replace(/\/\* ---------- SIDEBAR ---------- \*\/[\s\S]*?(?=\/\* ----------)/, '')
        .replace(/\/\* ---------- MAIN CONTENT ---------- \*\/[\s\S]*?(?=\/\* ----------)/, '')
        .replace(/\/\* ---------- TOP HEADER ---------- \*\/[\s\S]*?(?=\/\* ----------)/, '');
      
      // If it still has variables:
      keptCss = keptCss.replace(/:root\s*{[\s\S]*?}/, '');
      keptCss = keptCss.replace(/\.app-shell\s*{[\s\S]*?}/, '');
      keptCss = keptCss.replace(/\.main-wrap\s*{[\s\S]*?}/, '');
      
      return `<style>\n${keptCss.trim()}\n  </style>`;
    }
    return match; // Keep other styles untouched
  });

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log('Refactored:', file);
  }
});
