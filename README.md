# Seoul Rental Housing Assistant

Collect Seoul/Gyeonggi rental housing notices, normalize/store them in SQLite, and render Telegram-friendly summaries for daily checks or on-demand queries.

## Smoke checklist

- `npm install`
- `npm run build`
- `npm test`
- `npm run collect`
- `npm run query`

## Runbook

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Run tests

```bash
npm test
```

### Run collect

```bash
npm run collect
```

By default this creates/uses `rental-housing.db`. Override with `RENTAL_HOUSING_DB_PATH=/path/to/file.db` if needed.

### Run query

```bash
npm run query
```

The current CLI entrypoint prints a default list query result from the local SQLite database.

## Scripts

- `npm run build` — TypeScript compile check
- `npm test` — run Vitest once
- `npm run collect` — execute collection flow
- `npm run query` — execute query flow

## Future integration note

Next steps are wiring a scheduler/cron trigger for regular collection and connecting Telegram delivery/query handling on top of these app services.

---

# 서울 임대주택 어시스턴트

서울/경기 임대주택 공고를 수집하고, SQLite에 정규화 저장한 뒤, 텔레그램 친화적인 요약을 만드는 도구입니다.

## 스모크 체크리스트

- `npm install`
- `npm run build`
- `npm test`
- `npm run collect`
- `npm run query`

## 실행 가이드

### 설치

```bash
npm install
```

### 빌드

```bash
npm run build
```

### 테스트 실행

```bash
npm test
```

### 수집 실행

```bash
npm run collect
```

기본적으로 `rental-housing.db`를 생성/사용합니다. 필요하면 `RENTAL_HOUSING_DB_PATH=/path/to/file.db`로 변경할 수 있습니다.

### 조회 실행

```bash
npm run query
```

현재 CLI 엔트리포인트는 로컬 SQLite 데이터베이스 기준 기본 목록 조회 결과를 출력합니다.

## 스크립트

- `npm run build` — TypeScript 컴파일 확인
- `npm test` — Vitest 1회 실행
- `npm run collect` — 수집 플로우 실행
- `npm run query` — 조회 플로우 실행

## 향후 연동 메모

다음 단계는 정기 수집용 cron/스케줄러 연결과 텔레그램 발송/질의 처리 레이어를 이 앱 서비스 위에 붙이는 것입니다.
