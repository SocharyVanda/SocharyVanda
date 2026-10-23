// Builds assets/activity-graph.svg from your GitHub contribution calendar.
// Runs in GitHub Actions (see .github/workflows/activity-graph.yml).
// Optional: pass a JSON file of [{date, contributionCount}] to render offline.
import fs from 'node:fs';

const DAYS = 31;
const OUT = 'assets/activity-graph.svg';
const login = process.env.GH_USER || 'SocharyVanda';
const title = process.env.GRAPH_TITLE || `${login}'s Contribution Graph`;

async function fetchDays() {
  const token = process.env.GRAPH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('No GRAPH_TOKEN or GITHUB_TOKEN set');
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      }
    }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'activity-graph',
    },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (json.errors || !json.data || !json.data.user) {
    throw new Error('GitHub API error: ' + JSON.stringify(json.errors || json));
  }
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays);
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function niceMax(v) {
  if (v <= 4) return 4;
  const steps = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const s of steps) if (v <= s * 5) return Math.ceil(v / s) * s;
  return Math.ceil(v / 1000) * 1000;
}

function buildSvg(days) {
  const W = 1000, H = 380;
  const L = 64, R = 28, T = 78, B = 64;
  const pw = W - L - R, ph = H - T - B;
  const counts = days.map((d) => d.contributionCount);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = niceMax(Math.max(...counts, 0));
  const x = (i) => L + (days.length === 1 ? pw / 2 : (i * pw) / (days.length - 1));
  const y = (v) => T + ph - (v / max) * ph;

  const C = {
    bg: '#0D1117', panel: '#161B22', grid: '#30363D', text: '#C9D1D9',
    muted: '#8B949E', line: '#58A6FF',
  };

  let grid = '';
  const ticks = 5;
  for (let t = 0; t <= ticks; t++) {
    const v = (max / ticks) * t;
    const yy = y(v).toFixed(1);
    grid += `<line x1="${L}" y1="${yy}" x2="${W - R}" y2="${yy}" stroke="${C.grid}" stroke-width="1"/>`;
    grid += `<text x="${L - 10}" y="${yy}" fill="${C.muted}" font-size="12" text-anchor="end" dominant-baseline="middle">${Math.round(v)}</text>`;
  }

  let xLabels = '';
  days.forEach((d, i) => {
    const day = Number(d.date.slice(8, 10));
    xLabels += `<line x1="${x(i).toFixed(1)}" y1="${T}" x2="${x(i).toFixed(1)}" y2="${T + ph}" stroke="${C.grid}" stroke-width="1" stroke-opacity="0.45"/>`;
    xLabels += `<text x="${x(i).toFixed(1)}" y="${T + ph + 20}" fill="${C.muted}" font-size="12" text-anchor="middle">${day}</text>`;
  });

  const pts = days.map((d, i) => `${x(i).toFixed(1)},${y(d.contributionCount).toFixed(1)}`);
  const linePath = 'M' + pts.join(' L');
  const areaPath = `${linePath} L${x(days.length - 1).toFixed(1)},${(T + ph).toFixed(1)} L${x(0).toFixed(1)},${(T + ph).toFixed(1)} Z`;
  const dots = days.map((d, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(d.contributionCount).toFixed(1)}" r="3.5" fill="${C.bg}" stroke="${C.line}" stroke-width="2"><title>${esc(d.date)}: ${d.contributionCount}</title></circle>`
  ).join('');

  const first = days[0].date, last = days[days.length - 1].date;
  const subtitle = `${first} to ${last} · ${total} contribution${total === 1 ? '' : 's'}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" role="img" aria-label="${esc(title)}">
<defs>
<linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${C.line}" stop-opacity="0.35"/>
<stop offset="1" stop-color="${C.line}" stop-opacity="0"/>
</linearGradient>
</defs>
<rect width="${W}" height="${H}" rx="10" fill="${C.panel}"/>
<text x="${W / 2}" y="34" fill="${C.text}" font-size="18" font-weight="600" text-anchor="middle">${esc(title)}</text>
<text x="${W / 2}" y="56" fill="${C.muted}" font-size="12" text-anchor="middle">${esc(subtitle)}</text>
${grid}
${xLabels}
<path d="${areaPath}" fill="url(#fill)"/>
<path d="${linePath}" fill="none" stroke="${C.line}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${dots}
<text x="18" y="${T + ph / 2}" fill="${C.muted}" font-size="12" text-anchor="middle" transform="rotate(-90 18 ${T + ph / 2})">Contributions</text>
<text x="${L + pw / 2}" y="${H - 14}" fill="${C.muted}" font-size="12" text-anchor="middle">Days</text>
</svg>
`;
}

const all = process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  : await fetchDays();
const days = all.slice(-DAYS);
fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync(OUT, buildSvg(days));
console.log(`Wrote ${OUT} (${days.length} days)`);
