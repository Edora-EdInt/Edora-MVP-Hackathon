# EdInt — AI Examination Platform

A modern SaaS-style dashboard landing page for an AI-powered examination platform, built with vanilla HTML, CSS, and JavaScript.

---

## Quick Start

Open `index.html` in any modern browser. No build step, no dependencies.

```bash
# Just serve the file
npx serve .
# or open directly
start index.html
```

> **Important:** Google OAuth requires the page to be served over HTTP/HTTPS (not `file://`). Use `npx serve .` and open the URL shown in the terminal.

---

## Google OAuth Setup

The page uses Google Identity Services (GIS) for Gmail-based sign-in. The dashboard is locked until authentication succeeds.

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services > OAuth consent screen**
4. Choose **External** user type (or Internal if you're on Google Workspace)
5. Fill in the required fields (App name, support email, developer contact)
6. Add these scopes: `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid`
7. Add your email as a test user

### 2. Create an OAuth Client ID

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Choose **Web application**
4. Under **Authorized JavaScript origins**, add your domain:
   - `http://localhost:3000` (local dev)
   - `https://yourdomain.com` (production)
5. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000`
   - `https://yourdomain.com`
6. Click **Create** and copy the **Client ID**

### 3. Configure the Client ID in the code

In `index.html`, find this line near the bottom of the `<script>` block:

```javascript
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```

Replace the placeholder with your actual Client ID.

### How it works

| Step | What happens |
|------|-------------|
| Page load | Checks `sessionStorage` for an existing session |
| No session | Shows login view with Google Sign-In button and Demo option |
| Google Sign-In | Opens Google's OAuth popup; on success, decodes the JWT and stores user info in `sessionStorage` |
| Authenticated | Dashboard is shown with the user's name, email, and profile picture populated in the sidebar and top nav |
| Sign out | Clears `sessionStorage`, resets Google auto-select, returns to login view |

### Demo mode

A **"Continue as Guest (Demo)"** button is available on the login screen. This bypasses Google OAuth and logs in with a preset profile — useful for testing the dashboard without configuring OAuth.

---

## Customising the Brand

### Logo & Identity

| What | Where | Example |
|------|-------|---------|
| Logo text | `.logo-text` in sidebar | `<div class="logo-text">Ed<span>Int</span></div>` |
| App name | `<title>` tag | `<title>EdInt — AI Examination Platform</title>` |
| Favicon | `<link rel="icon">` in `<head>` | Add your own `.ico` or `.svg` |

To replace the logo mark (blue square with "E"), edit the `.logo-mark` div in the sidebar:

```html
<div class="logo-mark">
  <!-- Replace with your logo SVG or image -->
  <img src="logo.svg" alt="EdInt" width="36" height="36">
</div>
```

### Colour Palette

All colours are defined as CSS custom properties in `:root`. Override them to rebrand:

```css
:root {
  --indigo-600: #4F46E5;  /* Primary — buttons, active states, links */
  --indigo-50:  #EEF2FF;  /* Light background — active nav, stat icons */
  --gray-50:    #F9FAFB;  /* Page background */
  --gray-100:   #F3F4F6;  /* Borders, card dividers */
  --gray-900:   #111827;  /* Heading text */
  --gray-500:   #6B7280;  /* Body text */
  --gray-400:   #9CA3AF;  /* Secondary/placeholder text */
}
```

To switch to a different accent (e.g. blue, emerald, rose), replace the `--indigo-*` family and the stat-icon colour classes (`.stat-icon.exams`, `.stat-icon.students`, etc.).

---

## Structure Overview

```
edint/
  index.html    — single-file page (HTML + CSS + JS)
  README.md     — this file
```

Everything lives in one file for zero-config deployment. The three sections are clearly delimited with comments:

- `<!-- ===== SIDEBAR ===== -->`
- `<!-- ===== TOP NAV ===== -->`
- `<!-- ===== MAIN CONTENT ===== -->`

---

## Customising the Content

### Navigation Items

Find `<nav class="sidebar-nav">` and edit the `<a>` elements:

```html
<a href="#" class="nav-item active">
  <!-- SVG icon -->
  <span>Dashboard</span>
</a>
```

Change the SVG icons by replacing the `<svg>` content with your own (use any 20×20 icon set). The `active` class highlights the current page.

### Stats Cards

Located inside `<section class="stats-grid">`. Each card follows this pattern:

```html
<div class="stat-card">
  <div class="stat-card-top">
    <div class="stat-icon exams">...</div>
    <span class="stat-trend up">+12%</span>
  </div>
  <div class="stat-value">24</div>
  <div class="stat-label">Total Exams</div>
</div>
```

| Class | Purpose |
|-------|---------|
| `stat-icon exams` | Indigo icon background |
| `stat-icon students` | Green icon background |
| `stat-icon questions` | Yellow icon background |
| `stat-icon score` | Blue icon background |
| `stat-trend up` | Green badge |
| `stat-trend down` | Red badge |

To add more stat cards, duplicate a `.stat-card` block. The grid auto-adjusts (4 columns → 2 → 1 on smaller screens).

### Quick Actions

Edit the four cards inside `<section class="quick-actions">`. Each `.action-card` has an icon, heading, and description. The entire card is clickable — wire it up:

```html
<div class="action-card" onclick="location.href='/create-exam'">
  ...
</div>
```

### Exams Table

The `<table>` inside `<section class="recent-exams">` uses these status badges:

```html
<span class="badge completed"><span class="badge-dot"></span>Completed</span>
<span class="badge in-progress"><span class="badge-dot"></span>Evaluating</span>
<span class="badge scheduled"><span class="badge-dot"></span>Scheduled</span>
```

Define additional statuses by copying the `.badge` pattern and adding a new colour class.

### AI Insights

The `insights-grid` holds four metric tiles. The `activity-chart` section below it renders a weekly bar chart. Heights are set inline as percentages — adjust the `style="height: X%;"` attributes to change values.

### Upcoming Exams

Each `.upcoming-item` has a date block, exam info, and a chevron. Duplicate the block and update the day/month, title, and metadata.

---

## Adding Real Data

The page uses static demo content. To connect real data:

1. **Hardcoded approach** — replace the static values directly in the HTML
2. **Fetch API** — add a `<script>` block that calls your API and populates the DOM:

```javascript
fetch('/api/dashboard')
  .then(r => r.json())
  .then(data => {
    document.querySelector('.stat-value').textContent = data.totalExams;
    // ... populate table rows, chart bars, etc.
  });
```

The chart-bars use inline `style="height: X%"` — update these dynamically by setting `element.style.height`.

---

## Responsive Breakpoints

| Breakpoint | Behaviour |
|------------|-----------|
| > 1400px | 4-column stats & actions, 2-column bottom grid |
| 1100–1400px | 2-column stats & actions |
| 768–1100px | Single-column bottom grid, smaller search |
| < 768px | Sidebar hidden off-screen, toggled via hamburger + overlay |

To add more breakpoints, edit the `@media` blocks at the bottom of the `<style>` section.

---

## Dependencies

**Zero.** The only external resource is the Inter font from Google Fonts:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;700&display=swap" rel="stylesheet">
```

Remove and self-host if preferred (the Inter font files are available as a npm package: `@fontsource/inter`).

---

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge). IE11 is not supported.

---

## Deployment

Since this is a single static HTML file, deploy anywhere:

- **GitHub Pages** — push to `docs/` or a `gh-pages` branch
- **Vercel / Netlify** — drag and drop the folder
- **Any web server** — copy `index.html` to your server root
