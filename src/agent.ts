import { query } from "@anthropic-ai/claude-agent-sdk";
import { cfg } from "./config.js";

const SYSTEM = `당신은 "coocoo", 81'DEGREE의 cc-os(Next.js 15 App Router + TypeScript + Supabase) 레포에서 일하는 개발 봇입니다.
- 현재 작업 디렉터리가 cc-os 레포의 클론입니다. 요청을 구현하기 위해 필요한 파일을 읽고 수정하세요.
- 변경은 최소·명확하게. 기존 코드 스타일(주석 밀도·네이밍·관용구)을 따르세요.
- 가능하면 \`npm run build\`(또는 타입체크)로 변경이 깨지지 않는지 확인하세요. 오래 걸리면 생략 가능.
- git 커밋/푸시/PR은 당신이 하지 않습니다. 호스트가 처리하니, 파일 변경까지만 완료하세요.
- 비밀키·토큰을 출력하거나 커밋하지 마세요.
- 마지막에는 "무엇을/어떤 파일을 왜 바꿨는지" 2~5줄로 한국어 요약하세요.`;

export interface RunResult {
  finalText: string;
}

interface RunOpts {
  prompt: string;
  cwd: string;
  onProgress?: (text: string) => void;
}

/** Claude Agent SDK 를 cwd(레포 클론) 위에서 자율 실행 */
export async function runAgent(opts: RunOpts): Promise<string> {
  let finalText = "";

  const stream = query({
    prompt: opts.prompt,
    options: {
      cwd: opts.cwd,
      model: cfg.model,
      // 슬랙에서 트리거되는 비대화형 실행 → 모든 도구 자동 승인
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true, // bypassPermissions 사용 조건
      allowedTools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"],
      systemPrompt: { type: "preset", preset: "claude_code", append: SYSTEM },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  for await (const message of stream as AsyncIterable<any>) {
    const type = message?.type;
    if (type === "assistant") {
      const blocks = message?.message?.content ?? [];
      const txt = Array.isArray(blocks)
        ? blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
        : "";
      if (txt) {
        finalText = txt;
        opts.onProgress?.(txt);
      }
    } else if (type === "result" && message?.subtype === "success") {
      if (typeof message?.result === "string" && message.result.trim()) {
        finalText = message.result;
      }
    }
  }

  return finalText || "(요약 없음)";
}
