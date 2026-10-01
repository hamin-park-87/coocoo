import { App } from "@slack/bolt";
import { cfg } from "./config.js";
import { runAgent } from "./agent.js";
import {
  ensureFreshRepo,
  createBranch,
  commitAndOpenPR,
  changedFiles,
} from "./repo.js";

const app = new App({
  token: cfg.slackBotToken,
  appToken: cfg.slackAppToken,
  socketMode: true,
});

/** 레포 디렉터리 경쟁을 막기 위해 요청을 직렬 처리 */
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

type SayFn = (args: { text: string; thread_ts?: string }) => Promise<unknown>;

async function handleRequest(params: {
  text: string;
  user: string;
  channel: string;
  threadTs: string;
  say: SayFn;
}) {
  const { text, threadTs, say } = params;

  await say({ thread_ts: threadTs, text: `🐣 coocoo 작업 시작할게요.\n> ${text}` });

  await ensureFreshRepo();
  const branch = await createBranch(text.slice(0, 40));

  // 진행상황은 과도한 스팸 방지를 위해 간헐적으로만 게시
  let lastPost = 0;
  const final = await runAgent({
    prompt: text,
    cwd: cfg.repoDir,
    onProgress: (t) => {
      const now = Date.now();
      if (now - lastPost > 20000 && t.trim()) {
        lastPost = now;
        void say({ thread_ts: threadTs, text: `… ${t.slice(0, 500)}` });
      }
    },
  });

  const files = await changedFiles();
  if (files.length === 0) {
    await say({
      thread_ts: threadTs,
      text: `✅ 작업 완료 (코드 변경 없음)\n\n${final.slice(0, 2500)}`,
    });
    return;
  }

  const pr = await commitAndOpenPR({
    branch,
    title: `coocoo: ${text.slice(0, 60)}`,
    body: `Slack에서 coocoo가 생성한 PR입니다.\n\n**요청**\n> ${text}\n\n**요약**\n${final.slice(0, 3000)}\n\n---\n🤖 coocoo (Claude Agent SDK) · 머지 전 반드시 사람 리뷰`,
  });

  const fileList = files.slice(0, 20).map((f) => `• ${f}`).join("\n");
  await say({
    thread_ts: threadTs,
    text: pr
      ? `✅ PR 생성 완료 → ${pr.url}\n\n*변경 파일 (${files.length})*\n${fileList}`
      : `⚠️ 변경을 감지했지만 PR 생성에 실패했습니다. 로그를 확인하세요.`,
  });
}

app.event("app_mention", async ({ event, say, context }) => {
  const ev = event as {
    text?: string;
    user?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
  };
  const channel = ev.channel || "";
  const user = ev.user || "";
  const threadTs = ev.thread_ts || ev.ts || "";

  // 접근 제한
  if (cfg.allowedChannels.length && !cfg.allowedChannels.includes(channel)) return;
  if (cfg.allowedUsers.length && user && !cfg.allowedUsers.includes(user)) return;

  // 멘션 토큰 제거 → 순수 요청문
  const botId = context.botUserId ? `<@${context.botUserId}>` : "";
  const text = (ev.text || "").replace(botId, "").replace(/<@[A-Z0-9]+>/g, "").trim();

  const sayFn = say as unknown as SayFn;

  if (!text) {
    await sayFn({ thread_ts: threadTs, text: "무엇을 만들까요? 예) `@coocoo 대시보드 상단에 새로고침 버튼 추가해줘`" });
    return;
  }

  try {
    await enqueue(() => handleRequest({ text, user, channel, threadTs, say: sayFn }));
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await sayFn({ thread_ts: threadTs, text: `❌ 오류: ${msg.slice(0, 1500)}` });
  }
});

await app.start();
console.log("🐣 coocoo 가동 (Socket Mode). @coocoo 로 호출하세요.");
