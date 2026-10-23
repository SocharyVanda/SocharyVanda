// Builds assets/contribution-calendar.svg: a GitHub-style yearly contribution grid.
// Runs in GitHub Actions (see .github/workflows/activity-graph.yml).
// Optional: pass a JSON file of {total, weeks:[{contributionDays:[{date,contributionCount,contributionLevel}]}]}.
import fs from 'node:fs';

const OUT = 'assets/contribution-calendar.svg';
const login = process.env.GH_USER || 'SocharyVanda';

async function fetchCalendar() {
  const token = process.env.GRAPH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('No GRAPH_TOKEN or GITHUB_TOKEN set');
  const query = `query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { contributionDays { date contributionCount contributionLevel weekday } }
        }
      }
    }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'contribution-calendar' },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (json.errors || !json.data || !json.data.user) throw new Error('GitHub API error: ' + JSON.stringify(json.errors || json));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  return { total: cal.totalContributions, weeks: cal.weeks };
}

const LEVEL = {
  NONE: '#161B22',
  FIRST_QUARTILE: '#0E4429',
  SECOND_QUARTILE: '#006D32',
  THIRD_QUARTILE: '#26A641',
  FOURTH_QUARTILE: '#39D353',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function buildSvg({ total, weeks }) {
  const cell = 11, gap = 3, step = cell + gap;
  const L = 44, T = 64;
  const W = L + weeks.length * step + 20;
  const gridH = 7 * step;
  const H = T + gridH + 48;
  const C = { bg: '#0D1117', border: '#30363D', text: '#C9D1D9', muted: '#8B949E' };

  let cells = '';
  let months = '';
  let lastMonth = -1;
  weeks.forEach((w, wi) => {
    const x = L + wi * step;
    w.contributionDays.forEach((d) => {
      const wd = d.weekday ?? new Date(d.date + 'T00:00:00Z').getUTCDay();
      const y = T + wd * step;
      const fill = LEVEL[d.contributionLevel] || LEVEL.NONE;
      const n = d.contributionCount;
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${fill}" stroke="rgba(240,246,252,0.06)"><title>${n} contribution${n === 1 ? '' : 's'} on ${d.date}</title></rect>`;
    });
    const first = w.contributionDays[0];
    if (first) {
      const m = Number(first.date.slice(5, 7)) - 1;
      if (m !== lastMonth && wi < weeks.length - 1) {
        if (lastMonth !== -1 || first.date.slice(8, 10) <= '07') {
          months += `<text x="${x}" y="${T - 10}" fill="${C.text}" font-size="11">${MONTHS[m]}</text>`;
        }
        lastMonth = m;
      }
    }
  });

  const dayLabels = [['Mon', 1], ['Wed', 3], ['Fri', 5]]
    .map(([t, i]) => `<text x="${L - 8}" y="${T + i * step + cell - 2}" fill="${C.text}" font-size="11" text-anchor="end">${t}</text>`)
    .join('');

  const legendY = T + gridH + 18;
  const legendX = W - 20 - (5 * step) - 34;
  const legend = `<text x="${legendX - 6}" y="${legendY + cell - 2}" fill="${C.muted}" font-size="11" text-anchor="end">Less</text>` +
    Object.values(LEVEL).map((c, i) => `<rect x="${legendX + i * step}" y="${legendY}" width="${cell}" height="${cell}" rx="2" fill="${c}" stroke="rgba(240,246,252,0.06)"/>`).join('') +
    `<text x="${legendX + 5 * step + 4}" y="${legendY + cell - 2}" fill="${C.muted}" font-size="11">More</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" role="img" aria-label="${total} contributions in the last year">
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="${C.bg}" stroke="${C.border}"/>
<text x="20" y="30" fill="${C.text}" font-size="15">${total} contribution${total === 1 ? '' : 's'} in the last year</text>
${months}
${dayLabels}
${cells}
<text x="${L}" y="${legendY + cell - 2}" fill="${C.muted}" font-size="11">${login}</text>
${legend}
</svg>
`;
}

const data = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : await fetchCalendar();
fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync(OUT, buildSvg(data));
console.log(`Wrote ${OUT} (${data.weeks.length} weeks, ${data.total} contributions)`);
