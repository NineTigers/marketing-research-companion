# Marketing Research Companion

사용자가 자기 ChatGPT 계정으로 Codex를 연결해 육아·키즈 제품 시장조사, 경쟁 분석,
VOC 분석, 업무별 상품·가격 제안, 공식 제품 이미지와 대표 보고서 생성을 실행하는 로컬 웹 서비스입니다.

이 저장소는 Workbench나 사내 pack을 런타임에 요구하지 않습니다. 조사 지침, 구조화
스키마, 품질 검사와 보고서 렌더러가 모두 프로젝트 안에 포함됩니다.

## Product contract

- 배포 형태: 사용자별 로컬 컴패니언 서비스
- 인증: Codex App Server가 관리하는 ChatGPT 브라우저 로그인
- 사용량: 연결한 사용자의 ChatGPT/Codex 플랜과 워크스페이스 정책 적용
- 애플리케이션 비밀: OpenAI API key 또는 서비스 공용 인증키 불필요
- 저장 위치: 설치한 기기의 `.data`
- 네트워크: 기본값은 `127.0.0.1`; 원격 열람은 SSH 포트 포워딩 권장

여러 사람이 하나의 중앙 서버에 로그인하는 SaaS가 아닙니다. 여러 사용자는 각자 이
저장소를 설치하고 자신의 ChatGPT 계정을 연결합니다.

처음 설치하거나 운영 방법을 확인하려면 [한국어 사용자 매뉴얼](docs/user-manual-ko.md)을
참조하세요.

## Requirements

- Node.js 20 이상
- ChatGPT 데스크톱 앱에 포함된 Codex 또는 Codex CLI
- Codex 사용 권한이 있는 ChatGPT 계정

외부 npm 패키지는 사용하지 않습니다.
macOS에서는 ChatGPT 데스크톱 앱에 포함된 Codex 실행 파일을 자동으로 찾습니다. 별도
CLI 경로를 사용할 때만 `.env`의 `CODEX_BIN`을 지정합니다.

## Install and onboard

```bash
git clone https://github.com/NineTigers/marketing-research-companion.git
cd marketing-research-companion
npm run doctor
npm start
```

`http://127.0.0.1:8787`을 엽니다. 이미 Codex에 ChatGPT로 로그인했다면 같은 로컬
자격 증명을 재사용합니다. 로그아웃 상태라면 화면의 **ChatGPT로 연결**을 눌러 브라우저
로그인을 완료합니다.

`8787`이 사용 중이면 앱은 다음 사용 가능한 포트를 자동으로 선택하고 터미널에 실제
접속 URL을 출력합니다. 자동 시작 서비스의 실제 URL은 `npm run service:status`에서도
확인할 수 있습니다.

설치 후에는 웹의 **운영 참고 → 서비스 관리**에서 **업데이트 확인**과 **업데이트**를
사용할 수 있습니다. 공식 저장소의 `main` 브랜치를 추적하는 독립 Git 설치본이며 추적
파일에 로컬 변경이 없을 때만 fast-forward 업데이트를 적용합니다. 실행 중인 조사가 있거나
이력이 갈라진 경우에는 적용하지 않고 이유를 표시합니다.

Codex에게 Git 링크와 함께 설치를 맡길 때 사용할 간단한 지시는 다음과 같습니다.

```text
현재 운영체제에서 Git, Node.js 20 이상, Codex 요구사항을 먼저 확인해줘.
누락된 시스템 도구가 있으면 설치 계획과 권한 변경을 한 번에 설명하고 내 승인을 받은 뒤 설치해줘.
그 다음 이 저장소를 로컬에 설치하고 doctor, check, test를 통과시킨 뒤 서비스를 시작해줘.
내 ChatGPT 계정 연결 상태를 확인하고 실제 접속 URL, 설치 위치와 재시작 방법을 알려줘.
```

시스템 요구사항 설치까지 포함한 상세 지시는
[Codex용 설치·온보딩 전체 지시문](docs/install-onboarding-order-ko.md)을 사용하세요.

## Runtime

앱 서버는 로컬에서 `codex app-server --listen stdio://`를 실행합니다. 웹은 계정 상태와
OAuth 시작만 요청하며 토큰을 읽거나 저장하지 않습니다. 시장조사는 읽기 전용 Codex
스레드와 JSON Schema로 결과 형식을 제한하고, 선택한 이미지 생성 단계만 작업 저장소에
생성 파일을 기록할 수 있는 별도 스레드로 실행합니다.

공식 판매 페이지의 제품 이미지는 이미지 생성 선택과 관계없이 경쟁 제품별로 회수해 로컬
보고서 자산으로 보관합니다. **경쟁 제품별 동일 제품 사용 장면 생성**은 기본 해제입니다.
선택하면 Codex App Server의 이미지 생성 capability를 확인하고, 각 공식 제품 이미지를
참조 입력으로 사용해 같은 제품의 사용 장면을 생성합니다. 별도 OpenAI API 키를 요구하지
않으며 capability가 없는 계정에서는 생성만 선택할 수 없습니다.

운영 모델은 `gpt-5.6-terra / high`를 우선 사용합니다. 연결 계정에서 Terra를 사용할 수
없을 때만 `gpt-5.5 / high`로 전환합니다. 두 모델 모두 사용할 수 없으면 준비 상태를
차단하며 계정 기본 모델로 조용히 대체하지 않습니다. 화면의 빠른·표준·심층 선택은
모델이나 추론 강도를 낮추지 않고 조사 범위와 확인할 대안의 폭만 조절합니다.

경쟁 제품 매출은 공식 판매량·공개 매출, 구매·주문 수, 리뷰 수 역산, 조회 수 역산,
댓글·좋아요·저장 신호 순으로 계산 근거를 선택합니다. 모델이 근거와 입력값을 정리한 뒤
애플리케이션 계산기가 월 판매량과 월 매출의 보수·기준·낙관값을 다시 계산합니다. 공식
가격이 없으면 현재 판매 페이지 표시 가격, 동일 SKU 가격, 동일 채널 가격 범위를 차례로
사용하며 추정값과 공식 수치를 구분합니다.

VOC는 표본수, 수집기간, 채널, 언급수와 비중을 함께 기록하고 계산 일치 여부를 검사합니다.
화면에서 선택한 근거별 차트 형식은 조사 요청에 전달되어 실제 수치 차트로 보고서에
렌더링됩니다. 추천·MD 소싱·유통·증거 대조 업무는 각각 별도 결과 계약을 사용합니다.

```text
Browser -> local Node server -> Codex App Server -> user's ChatGPT account
                         |-> .data jobs and reports
```

## Commands

```bash
npm run doctor  # Node, Codex, ChatGPT 로그인 점검
npm start       # 로컬 서비스 시작
npm run service:install # macOS/Linux 로그인 시 자동 시작
npm run release:export  # 공개 저장소용 독립 배포본 생성
npm test        # 자동 테스트
npm run check   # 구문 검사
```

`MARKETING_RUNTIME=demo npm start`는 네트워크 조사 없이 설치와 화면 흐름만 확인합니다.
Docker 이미지는 Codex 인증을 전달하지 않으므로 데모 모드 전용입니다.

## API

- `GET /api/config`: 런타임과 연결 계정 상태
- `POST /api/auth/chatgpt`: Codex 관리형 ChatGPT 로그인 시작
- `POST /api/auth/logout`: 로컬 Codex 로그아웃
- `GET /api/runtime/limits`: 연결 계정의 Codex 사용량 상태
- `POST /api/update/check`: 공식 저장소 업데이트 확인
- `POST /api/update/apply`: 검증된 fast-forward 업데이트 적용
- `POST /api/research`: 조사 시작
- `GET /api/jobs`, `GET /api/jobs/:id`: 작업 조회
- `POST /api/jobs/:id/cancel`, `POST /api/jobs/:id/retry`: 작업 제어
- `GET /api/jobs/:id/report`: 보고서 열람
- `GET /api/jobs/:id/assets/:name`: 공식 제품 이미지와 선택 생성한 작업별 보고서 이미지

## Security

앱은 개인 기기의 단일 사용자 로컬 서비스로 설계되었습니다. 인터넷에 직접 노출하지
마세요. 다른 기기에서 볼 때는 `ssh -L 8787:127.0.0.1:8787 <host>`처럼 포트 포워딩을
사용하고 [SECURITY.md](SECURITY.md)를 확인하세요. VOC와 내부 상품 계획은 `.data`에
저장되므로 운영체제 계정과 디스크 권한으로 보호해야 합니다.

## License

[MIT](LICENSE)
