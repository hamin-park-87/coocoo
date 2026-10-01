import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 누락: ${name}`);
  return v;
}

function list(name: string): string[] {
  return (process.env[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const cfg = {
  // Slack (Socket Mode)
  slackBotToken: req("SLACK_BOT_TOKEN"), // xoxb-
  slackAppToken: req("SLACK_APP_TOKEN"), // xapp-

  // Claude
  anthropicApiKey: req("ANTHROPIC_API_KEY"),
  model: process.env.COOCOO_MODEL || "sonnet",

  // GitHub
  githubToken: req("GITHUB_TOKEN"),
  repoUrl: process.env.REPO_URL || "https://github.com/hamin-park-87/cc-os",
  baseBranch: process.env.BASE_BRANCH || "main",
  repoDir: process.env.REPO_DIR || "/app/workspace/cc-os",

  // 접근 제한(선택)
  allowedChannels: list("ALLOWED_CHANNELS"),
  allowedUsers: list("ALLOWED_USERS"),
};

/** owner/repo 파싱 (https://github.com/owner/repo[.git]) */
export function parseRepo(url: string): { owner: string; repo: string } {
  const m = url.replace(/\.git$/, "").match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (!m) throw new Error(`REPO_URL 파싱 실패: ${url}`);
  return { owner: m[1], repo: m[2] };
}
