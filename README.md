# 서울 임대주택 어시스턴트

LH/SH 임대주택 공고를 수집해 SQLite에 저장하고, 텔레그램에 바로 보낼 수 있는 짧은 응답을 만드는 Node.js 앱입니다.

## 빠른 점검

```bash
npm install
npm run build
npm test
npm run answer -- 최신 공고 확인해줘
npm run answer -- 서울만 보여줘
```

기본 DB 파일은 `rental-housing.db`입니다. 다른 위치를 쓰려면 명령 앞에 `RENTAL_HOUSING_DB_PATH=/path/to/rental-housing.db`를 붙입니다.

## 텔레그램/OpenClaw용 단일 명령

```bash
npm run answer -- 최신 공고 확인해줘
```

`answer`는 사용자 문장을 받아 응답 텍스트만 출력합니다.

- `최신`, `새로고침`, `수집`, `업데이트`, `갱신`이 들어간 문장: LH/SH live collect 실행 후 신규/변경 요약 출력
- 그 외 문장: 저장된 DB에서 조회 후 목록, 상세, 링크 응답 출력
- 결과가 없을 때도 빈 메시지 대신 `조건에 맞는 공고 없음` 또는 `새 공고/변경 없음` 출력

조회 예시:

```bash
npm run answer -- 서울만 보여줘
npm run answer -- 공고 조회 / 지역 경기 / 상태 모집중 / 기관 LH
npm run answer -- 1번 자세히
npm run answer -- 2번 링크만
```

번호형 후속 질문은 방금 받은 목록 기준입니다. 예를 들어 `서울만 보여줘` 응답에서 2번으로 보인 공고는, 다음 `2번 자세히`에서도 같은 공고를 가리킵니다. `answer`는 이를 위해 기본적으로 `.rental-housing-context.json`에 마지막 목록을 저장합니다. 다른 위치를 쓰려면 `RENTAL_HOUSING_CONTEXT_PATH=/path/to/context.json`을 지정합니다.

## 개별 명령

```bash
npm run collect
npm run collect -- --json
npm run query -- 서울만 보여줘
```

- `collect`: LH/SH에서 live 공고를 수집하고 텔레그램용 요약을 출력합니다.
- `collect -- --json`: 기존 JSON 결과가 필요할 때 사용합니다.
- `query`: 저장된 DB를 기준으로 사용자 문장을 조회합니다.

## 스크립트

- `npm run build`: TypeScript 컴파일 확인
- `npm test`: Vitest 전체 테스트
- `npm run collect`: live 수집 실행
- `npm run query`: 저장된 데이터 조회
- `npm run answer`: OpenClaw/텔레그램에서 호출하기 쉬운 단일 응답 명령

## 현재 구현 상태

- LH/SH live 목록 수집
- LH 상세 링크 생성
- SQLite 저장 및 변경 감지
- 텔레그램용 수집 요약
- 자연어/옵션형 조회
- OpenClaw/텔레그램 호출용 `answer` 진입점

아직 공고 상세 페이지의 보증금, 월세, 면적 같은 세부 테이블 파싱은 다음 단계로 남아 있습니다.
