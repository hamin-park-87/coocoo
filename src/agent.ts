import { query } from "@anthropic-ai/claude-agent-sdk";
import { cfg } from "./config.js";

const SYSTEM = `당신은 "coocoo", 81'DEGREE의 cc-os(Next.js 15 App Router + TypeScript + Supabase) 레포에서 일하는 개발 봇입니다.
슬랙 채널에서 매니저가 "개발 요청 가이드" 양식(제목/목적/대상/상세 요청/완료 조건 등)에 따라 요청을 남깁니다. 한국어 또는 일본어로 들어옵니다.

[작업 원칙]
- 현재 작업 디렉터리가 cc-os 레포의 클론입니다. 먼저 관련 파일을 읽어 구조를 파악한 뒤 수정하세요.
- 변경은 최소·명확하게. 기존 코드 스타일(주석 밀도·네이밍·관용구)을 그대로 따르세요.
- 요청 범위 밖의 파일은 건드리지 마세요. "하나의 요청 = 하나의 집중된 변경".
- 가능하면 타입체크/빌드로 깨지지 않는지 확인하세요. 너무 오래 걸리면 생략 가능.
- git 커밋/푸시/PR은 당신이 하지 않습니다. 호스트가 처리하니 "파일 변경"까지만 하세요.
- 비밀키·토큰을 출력하거나 커밋하지 마세요.

[정보가 부족하거나 모호할 때 — 매우 중요]
- 무엇을 어디에 바꿔야 할지 불명확하면, 추측으로 아무 파일이나 고치지 마세요.
- 그럴 때는 코드를 수정하지 말고(변경 0), 대신 "무엇이 더 필요한지"를 요청자 언어로 구체적으로 되물어 정리하세요.
  (예: 어떤 화면/파일인지, 기대 동작, 완료 조건 등 빠진 항목을 짚어줄 것)

[마무리]
- 요청자 언어(한국어면 한국어, 일본어면 일본어)로, "무엇을 / 어떤 파일을 / 왜" 바꿨는지 2~5줄로 요약하세요.
- 변경을 안 했다면, 왜 안 했고 무엇이 필요한지 요약하세요.`;

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
