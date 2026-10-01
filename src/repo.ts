import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Octokit } from "@octokit/rest";
import { cfg, parseRepo } from "./config.js";

const execFileAsync = promisify(execFile);

/** 토큰이 박힌 push/clone 용 인증 URL (로그에 노출 금지) */
function authUrl(): string {
  const { owner, repo } = parseRepo(cfg.repoUrl);
  return `https://x-access-token:${cfg.githubToken}@github.com/${owner}/${repo}.git`;
}

async function git(args: string[], cwd = cfg.repoDir): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

/** 레포가 없으면 clone, 있으면 base 브랜치 최신으로 하드 리셋 */
export async function ensureFreshRepo(): Promise<void> {
  if (!existsSync(cfg.repoDir)) {
    await mkdir(dirname(cfg.repoDir), { recursive: true });
    await execFileAsync("git", ["clone", authUrl(), cfg.repoDir], {
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    await git(["config", "user.email", "coocoo-bot@81degree.com"]);
    await git(["config", "user.name", "coocoo"]);
  }
  await git(["remote", "set-url", "origin", authUrl()]);
  await git(["fetch", "origin", cfg.baseBranch]);
  await git(["checkout", cfg.baseBranch]);
  await git(["reset", "--hard", `origin/${cfg.baseBranch}`]);
  await git(["clean", "-fd"]);
}

/** 새 작업 브랜치 생성 */
export async function createBranch(slug: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const safe = (slug || "task")
    .toLowerCase()
    .replace(/[^a-z0-9ㄱ-힣]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "task";
  const branch = `coocoo/${stamp}-${safe}`;
  await git(["checkout", "-b", branch]);
  return branch;
}

/** 변경이 있으면 커밋·푸시 후 PR 생성. 변경 없으면 null 반환 */
export async function commitAndOpenPR(opts: {
  branch: string;
  title: string;
  body: string;
}): Promise<{ url: string; number: number } | null> {
  const status = await git(["status", "--porcelain"]);
  if (!status) return null; // 변경 없음

  await git(["add", "-A"]);
  await git(["commit", "-m", opts.title]);
  await git(["push", "-u", "origin", opts.branch]);

  const { owner, repo } = parseRepo(cfg.repoUrl);
  const octokit = new Octokit({ auth: cfg.githubToken });
  const pr = await octokit.pulls.create({
    owner,
    repo,
    head: opts.branch,
    base: cfg.baseBranch,
    title: opts.title,
    body: opts.body,
  });
  return { url: pr.data.html_url, number: pr.data.number };
}

/** 변경 요약(파일 목록) — 슬랙 보고용 */
export async function changedFiles(): Promise<string[]> {
  const out = await git(["status", "--porcelain"]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => l.slice(3));
}
