# Seoul Rental Housing Assistant

A small Node.js + TypeScript project for collecting rental housing notices in Seoul/Gyeonggi, normalizing the data, storing it in SQLite, and preparing Telegram-friendly summaries.

## Current Status

This repository is in the bootstrap stage.

Implemented so far:
- TypeScript project setup
- Vitest test runner setup
- Basic smoke test

Planned next:
- Domain types and normalization
- SQLite schema and repository layer
- Diff engine for new/changed listings
- Query and collection flows
- Telegram-friendly formatting

## Tech Stack

- Node.js
- TypeScript
- Vitest
- better-sqlite3
- zod
- tsx

## Getting Started

### Install dependencies

```bash
npm install
```

### Run tests

```bash
npm test
```

### Build

```bash
npm run build
```

## Project Structure

```text
.
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── tests/
    └── bootstrap.test.ts
```

## Goal

The goal is to build an assistant that can:
- collect rental housing notices from selected sources
- normalize notice and listing data into a shared format
- store snapshots in SQLite
- detect new or changed listings
- generate concise summaries suitable for Telegram delivery

## Notes

- `node_modules/` is excluded from Git.
- The repository currently contains only the initial bootstrap.
- README updates should include a Korean translation when the main text is written in English.

---

# 서울 임대주택 어시스턴트

서울/경기 지역의 임대주택 공고를 수집하고, 데이터를 정규화하고, SQLite에 저장한 뒤, 텔레그램에 맞는 요약을 만들기 위한 작은 Node.js + TypeScript 프로젝트입니다.

## 현재 상태

이 저장소는 현재 부트스트랩 단계입니다.

지금까지 구현된 내용:
- TypeScript 프로젝트 설정
- Vitest 테스트 러너 설정
- 기본 스모크 테스트

다음으로 구현할 예정:
- 도메인 타입 및 정규화
- SQLite 스키마와 저장소 레이어
- 신규/변경 매물 감지용 diff 엔진
- 조회 및 수집 흐름
- 텔레그램용 요약 포맷팅

## 기술 스택

- Node.js
- TypeScript
- Vitest
- better-sqlite3
- zod
- tsx

## 시작하기

### 의존성 설치

```bash
npm install
```

### 테스트 실행

```bash
npm test
```

### 빌드

```bash
npm run build
```

## 프로젝트 구조

```text
.
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── tests/
    └── bootstrap.test.ts
```

## 목표

이 프로젝트의 목표는 다음을 할 수 있는 어시스턴트를 만드는 것입니다:
- 선택한 소스에서 임대주택 공고 수집
- 공고/매물 데이터를 공통 형식으로 정규화
- SQLite에 스냅샷 저장
- 신규 또는 변경된 매물 감지
- 텔레그램에 보내기 좋은 간결한 요약 생성

## 참고

- `node_modules/`는 Git에서 제외됩니다.
- 현재 저장소에는 초기 부트스트랩만 들어 있습니다.
- README를 영어로 쓸 때는 아래에 한국어 번역본도 함께 유지합니다.
