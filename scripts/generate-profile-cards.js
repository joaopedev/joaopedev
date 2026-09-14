const fs = require("fs");
const https = require("https");
const path = require("path");

const configPath = path.join(process.cwd(), "profile-cards.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const themes = {
  tokyonight: {
    bg: "#1a1b27",
    panel: "#161821",
    border: "#30363d",
    title: "#70a5fd",
    text: "#c9d1d9",
    muted: "#8b949e",
    accent: "#bf91f3",
    accent2: "#7dcfff",
    grid: "#2f3549"
  }
};

const languageColors = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  HTML: "#e34c26",
  CSS: "#563d7c",
  "C#": "#178600",
  SCSS: "#c6538c",
  Python: "#3572A5",
  Java: "#b07219",
  PHP: "#4F5D95",
  Vue: "#41b883",
  Shell: "#89e051",
  Dockerfile: "#384d54"
};

const theme = themes[config.theme] || themes.tokyonight;

function requestJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "joaopedev-profile-cards"
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return new Promise((resolve, reject) => {
    https
      .get(url, { headers }, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub API returned ${res.statusCode}: ${data}`));
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchRepos(username) {
  const repos = [];

  for (let page = 1; page <= 10; page += 1) {
    const url = `https://api.github.com/users/${encodeURIComponent(
      username
    )}/repos?per_page=100&page=${page}&sort=updated&type=owner`;
    const pageRepos = await requestJson(url);
    repos.push(...pageRepos);

    if (pageRepos.length < 100) {
      break;
    }
  }

  return repos;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}m`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return String(value);
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [, month] = key.split("-");
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Number(month) - 1
  ];
}

function getActivity(repos, monthsCount) {
  const now = new Date();
  const months = [];

  for (let index = monthsCount - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    months.push({ key: monthKey(date), label: monthLabel(monthKey(date)), count: 0 });
  }

  const byMonth = new Map(months.map((month) => [month.key, month]));

  for (const repo of repos) {
    const key = monthKey(new Date(repo.updated_at));
    if (byMonth.has(key)) {
      byMonth.get(key).count += 1;
    }
  }

  return months;
}

function getLanguages(repos, maxLanguages) {
  const counts = new Map();

  for (const repo of repos) {
    if (!repo.language) {
      continue;
    }

    counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
  }

  const languages = [...counts.entries()]
    .map(([name, count]) => ({ name, count, color: languageColors[name] || "#8b949e" }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const visible = languages.slice(0, maxLanguages);
  const remaining = languages.slice(maxLanguages).reduce((total, language) => total + language.count, 0);

  if (remaining > 0) {
    visible.push({ name: "Other", count: remaining, color: "#8b949e" });
  }

  return visible;
}

function baseSvg(width, height, content) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
  <style>
    .title { fill: ${theme.title}; font: 600 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .text { fill: ${theme.text}; font: 500 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .small { fill: ${theme.muted}; font: 500 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .value { fill: ${theme.text}; font: 700 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  </style>
  <rect width="${width}" height="${height}" rx="8" fill="${theme.bg}"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="7.5" stroke="${theme.border}"/>
  ${content}
</svg>
`;
}

function renderSummary(data) {
  const width = 640;
  const height = 320;
  const statWidth = 112;
  const statGap = 8;
  const stats = [
    ["Repos", data.repoCount],
    ["Stars", data.totalStars],
    ["Forks", data.totalForks],
    ["Followers", data.user.followers],
    ["Languages", data.languages.length]
  ];

  const statCards = stats
    .map(([label, value], index) => {
      const x = 24 + index * (statWidth + statGap);
      return `<rect x="${x}" y="58" width="${statWidth}" height="60" rx="7" fill="${theme.panel}" stroke="${theme.border}"/>
  <text x="${x + 12}" y="82" class="small">${escapeXml(label)}</text>
  <text x="${x + 12}" y="108" class="value">${escapeXml(formatNumber(value))}</text>`;
    })
    .join("\n  ");

  const chartX = 28;
  const chartY = 168;
  const chartW = 345;
  const chartH = 82;
  const maxActivity = Math.max(1, ...data.activity.map((month) => month.count));
  const barGap = 8;
  const barWidth = (chartW - barGap * (data.activity.length - 1)) / data.activity.length;

  const gridLines = [0, 0.5, 1]
    .map((part) => {
      const y = chartY + chartH - chartH * part;
      return `<line x1="${chartX}" y1="${y}" x2="${chartX + chartW}" y2="${y}" stroke="${theme.grid}" stroke-width="1"/>`;
    })
    .join("\n  ");

  const bars = data.activity
    .map((month, index) => {
      const h = Math.max(4, (month.count / maxActivity) * chartH);
      const x = chartX + index * (barWidth + barGap);
      const y = chartY + chartH - h;
      const label = index % 2 === 0 ? `<text x="${x + barWidth / 2}" y="273" class="small" text-anchor="middle">${month.label}</text>` : "";

      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(
        1
      )}" height="${h.toFixed(1)}" rx="3" fill="${theme.accent2}" opacity="0.9"/>
  ${label}`;
    })
    .join("\n  ");

  const languageTotal = data.languages.reduce((total, language) => total + language.count, 0) || 1;
  const languageBars = data.languages
    .slice(0, 5)
    .map((language, index) => {
      const y = 164 + index * 23;
      const percent = (language.count / languageTotal) * 100;
      const width = Math.max(8, (percent / 100) * 104);
      return `<text x="420" y="${y}" class="small">${escapeXml(language.name)}</text>
  <rect x="506" y="${y - 9}" width="104" height="8" rx="4" fill="${theme.grid}"/>
  <rect x="506" y="${y - 9}" width="${width.toFixed(1)}" height="8" rx="4" fill="${language.color}"/>
  <text x="612" y="${y}" class="small" text-anchor="end">${percent.toFixed(0)}%</text>`;
    })
    .join("\n  ");

  return baseSvg(
    width,
    height,
    `<text x="24" y="34" class="title">GitHub Profile Summary</text>
  <text x="24" y="49" class="small">${escapeXml(data.user.login)} / public repositories</text>
  ${statCards}
  <text x="28" y="153" class="text">Repository activity</text>
  ${gridLines}
  ${bars}
  <text x="420" y="153" class="text">Top languages by repo</text>
  ${languageBars}`
  );
}

function renderStats(data) {
  const rows = [
    ["Public repositories", data.user.public_repos],
    ["Profile repositories", data.repoCount],
    ["Total stars", data.totalStars],
    ["Total forks", data.totalForks],
    ["Followers", data.user.followers],
    ["Following", data.user.following]
  ];

  const rowSvg = rows
    .map(([label, value], index) => {
      const y = 72 + index * 22;
      return `<text x="28" y="${y}" class="text">${escapeXml(label)}</text>
  <text x="292" y="${y}" class="text" text-anchor="end">${escapeXml(formatNumber(value))}</text>`;
    })
    .join("\n  ");

  return baseSvg(
    320,
    215,
    `<text x="24" y="34" class="title">GitHub Stats</text>
  <text x="24" y="50" class="small">${escapeXml(data.user.login)} / ${escapeXml(config.theme)}</text>
  ${rowSvg}`
  );
}

function renderLanguages(data) {
  const total = data.languages.reduce((sum, language) => sum + language.count, 0) || 1;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = data.languages
    .map((language) => {
      const length = (language.count / total) * circumference;
      const segment = `<circle cx="238" cy="112" r="${radius}" fill="transparent" stroke="${language.color}" stroke-width="22" stroke-dasharray="${length.toFixed(
        2
      )} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(
        2
      )}" transform="rotate(-90 238 112)"/>`;
      offset += length;
      return segment;
    })
    .join("\n  ");

  const legend = data.languages
    .slice(0, 6)
    .map((language, index) => {
      const y = 78 + index * 21;
      const percent = ((language.count / total) * 100).toFixed(0);

      return `<rect x="24" y="${y - 10}" width="10" height="10" rx="2" fill="${language.color}"/>
  <text x="42" y="${y}" class="text">${escapeXml(language.name)}</text>
  <text x="148" y="${y}" class="small" text-anchor="end">${percent}%</text>`;
    })
    .join("\n  ");

  return baseSvg(
    320,
    215,
    `<text x="24" y="34" class="title">Top Languages by Repo</text>
  <text x="24" y="50" class="small">Primary language across repositories</text>
  ${legend}
  <circle cx="238" cy="112" r="${radius}" fill="transparent" stroke="${theme.grid}" stroke-width="22"/>
  ${segments}
  <text x="238" y="108" class="value" text-anchor="middle">${total}</text>
  <text x="238" y="125" class="small" text-anchor="middle">repos</text>`
  );
}

async function main() {
  const username = config.username;
  const user = await requestJson(`https://api.github.com/users/${encodeURIComponent(username)}`);
  const allRepos = await fetchRepos(username);
  const repos = config.includeForks ? allRepos : allRepos.filter((repo) => !repo.fork);
  const totalStars = repos.reduce((total, repo) => total + repo.stargazers_count, 0);
  const totalForks = repos.reduce((total, repo) => total + repo.forks_count, 0);
  const languages = getLanguages(repos, config.maxLanguages || 6);
  const activity = getActivity(repos, config.activityMonths || 12);
  const data = {
    user,
    repos,
    repoCount: repos.length,
    totalStars,
    totalForks,
    languages,
    activity
  };

  const outputs = [
    [config.output.summary, renderSummary(data)],
    [config.output.stats, renderStats(data)],
    [config.output.languages, renderLanguages(data)]
  ];

  for (const [file, svg] of outputs) {
    const absolutePath = path.join(process.cwd(), file);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, svg);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
