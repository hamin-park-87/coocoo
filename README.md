# 🐣 coocoo — 슬랙 대화로 개발하는 AI 봇

슬랙 채널에서 **`@coocoo ○○ 기능 만들어줘`** 라고 말하면, coocoo가
**cc-os 레포를 수정하고 Pull Request를 열어** 스레드로 링크를 돌려줍니다.
비개발 기획자도 CLI 없이 **대화만으로** 개발을 요청할 수 있습니다.

> 엔진: **Claude Agent SDK** · 슬랙 연결: **Socket Mode**(공개 URL 불필요)
> 배포: **Railway**(상주 서버) · PR은 사람이 리뷰·머지 → Vercel 자동 배포

```
슬랙 @coocoo "…"  →  coocoo(Railway)  →  cc-os 클론 수정 → 브랜치 PR
                 ←  스레드에 진행상황 + PR 링크
```

---

## 1) 사전 준비물
- **Slack 앱**(아래 2에서 생성) — 봇 토큰 `xoxb-`, 앱 토큰 `xapp-`
- **Anthropic API 키** — coocoo 전용 키 권장(cc-os와 분리)
- **GitHub PAT** — `cc-os` 레포에 `contents`+`pull_requests` 쓰기 권한
- **Railway 계정** — 상주 서버 호스팅(무료 스크롤 있음)

---

## 2) Slack 앱 만들기 (Socket Mode)
> **빠른 길:** https://api.slack.com/apps → **Create New App → From an app manifest** →
> 워크스페이스 선택 → `slack-app-manifest.json` 내용 붙여넣기 → 생성.
> 그다음 아래 2·5·6번(앱토큰 발급 → 설치 → 봇토큰 복사)만 하면 됩니다.

수동으로 할 경우:
1. https://api.slack.com/apps → **Create New App → From scratch** → 이름 `coocoo`, 워크스페이스 선택
2. **Socket Mode** 메뉴 → **Enable Socket Mode** 켜기 → App-Level Token 발급
   (scope `connections:write`) → `xapp-...` 복사 → `SLACK_APP_TOKEN`
3. **OAuth & Permissions → Bot Token Scopes** 에 추가:
   - `app_mentions:read`, `chat:write`, `channels:history`, `groups:history`
4. **Event Subscriptions → Enable** → **Subscribe to bot events** 에 `app_mention` 추가
   *(Socket Mode라 Request URL은 필요 없음)*
5. **Install App** → 워크스페이스에 설치 → **Bot User OAuth Token** `xoxb-...` 복사 → `SLACK_BOT_TOKEN`
6. 사용할 채널에서 `/invite @coocoo`

> ⚠️ 이전에 "Enterprise 전용" 설치 제한이 떴다면, 이 최소 설정(Socket Mode + app_mention)으로
> 설치가 되는지 먼저 확인하세요. 설치만 되면 공개 엔드포인트 없이 동작합니다.

---

## 3) GitHub PAT
- **Fine-grained token** 권장: Repository access = `hamin-park-87/cc-os`,
  Permissions → **Contents: Read/Write**, **Pull requests: Read/Write**
- 토큰 문자열 → `GITHUB_TOKEN`
- (권장) `main` 브랜치 보호 규칙에 **"1명 이상 승인 필요"** 를 켜서 coocoo PR이 리뷰 없이 머지되지 않게 하세요.

---

## 4) 로컬 실행(테스트)
```bash
cd coocoo
npm install
cp .env.example .env   # 값 채우기
npm run dev            # 로그에 "🐣 coocoo 가동" 뜨면 OK
```
슬랙 채널에서 `@coocoo README에 한 줄 추가해줘` 로 테스트 → 스레드에 PR 링크가 오면 성공.

---

## 5) Railway 배포
1. 이 `coocoo` 폴더를 **GitHub 레포로 push**(cc-os와 별개 레포 권장)
2. https://railway.app → **New Project → Deploy from GitHub repo** → coocoo 선택
3. **Variables** 에 `.env.example` 의 키들을 모두 입력
   (`SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `REPO_URL` …)
4. 배포되면 상주 실행됩니다. Socket Mode라 **도메인/포트 설정 불필요**.
   - `railway.json` 이 git 설치(aptPkgs)와 `npm start` 를 처리합니다.

---

## 6) 환경변수
`.env.example` 참고. 핵심:
| 키 | 설명 |
|---|---|
| `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` | 봇(xoxb) / Socket Mode 앱(xapp) 토큰 |
| `ANTHROPIC_API_KEY` | Claude Agent SDK |
| `COOCOO_MODEL` | `sonnet`(기본) / `opus` |
| `GITHUB_TOKEN` | PR 생성용 PAT |
| `REPO_URL` / `BASE_BRANCH` / `REPO_DIR` | 대상 레포 / 기준 브랜치 / 클론 위치 |
| `ALLOWED_CHANNELS` / `ALLOWED_USERS` | (선택) 호출 허용 화이트리스트 |

---

## 7) 동작 방식 / 안전장치
- 요청마다 레포를 **base 브랜치 최신으로 리셋** 후 **새 브랜치**에서 작업 → **PR만 생성**(main 직접 push 없음).
- 요청은 **직렬 처리**(레포 디렉터리 경쟁 방지).
- 변경이 없으면 PR 없이 요약만 보고.
- `ALLOWED_CHANNELS`/`ALLOWED_USERS` 로 호출 범위를 제한할 수 있습니다.
- coocoo는 샌드박스에서 bash를 실행할 수 있으므로(코딩 에이전트 특성), **PR은 반드시 사람이 리뷰 후 머지**하세요.

---

## 8) 한계
- 큰 작업/모호한 요청은 한 번에 완벽하지 않을 수 있음 → PR에서 리뷰·추가 요청.
- 빌드 검증은 시간 관계상 생략될 수 있음 → PR에서 CI/프리뷰로 확인.
- Railway Free는 유휴 시 슬립 가능 → 상시 필요하면 유료 플랜 고려.
