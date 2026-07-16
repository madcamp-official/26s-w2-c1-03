# 26s-w2-c1-03

## 공통과제 II : 협업형 실전 산출물 제작 (2인 1팀)

**목적:** 실시간 인터랙션, LLM Wrapper, Cross-Platform 중 하나의 옵션을 선택해 구현하며, 선택한 기술을 실제로 동작하는 형태의 산출물로 완성한다.

**선택 옵션:**

| 옵션 | 설명 |
|---|---|
| 실시간 인터랙션 | 사용자 간 상태 변화, 실시간 데이터 흐름, 스트리밍 응답 등 실시간성이 드러나는 기능을 구현 |
| LLM Wrapper | LLM API를 활용하여 AI 기능이 포함된 산출물을 구현 |
| Cross-Platform | 하나의 산출물을 여러 실행 환경에서 사용할 수 있도록 구현* |

> *데스크톱 앱 ↔ 모바일 앱; 혹은 다른 폼팩터에서의 앱; 웹만/웹 기반 프레임워크(Electron, Tauri 등) 대신 다른 프레임워크를 시도해보는 것을 적극 권장

**결과물:** 선택한 옵션이 적용된 작동 가능한 산출물, 실행 가능한 코드, 시연 자료 및 관련 문서

---

## 팀원

| 이름 | 학교 | GitHub | 역할 |
|---|---|---|---|
| 이예원 | 숙명여대 | [ywlee1127](https://github.com/ywlee1127) | FullStack Dev |
| 이지민 | KAIST | [ljm030206](https://github.com/ljm030206) | BackEnd Dev |

---

## 선택 옵션

- [ ] 실시간 인터랙션
- [x] LLM Wrapper
- [x] Cross-Platform

---

## 기획안

- **산출물 주제:** trip and end — AI 기반 여행 계획 및 기록 앱
- **제작 목적:** 여행 전 계획 수립의 시간/노력 부담과, 여행 후 사진 정리·기록의 번거로움을 AI로 줄여 여행 시작과 끝 모두에서 사용자 만족도를 높인다.
- **선택 옵션:** LLM Wrapper (OpenAI API 기반 여행 계획 생성·수정, 사진 선별) + Cross-Platform (Flutter 기반 단일 코드베이스로 iOS/Android 대응)
- **핵심 구현 요소:**
  - AI 기반 여행 계획 초안 생성 및 프롬프트 기반 수정 (OpenAI API 연동)
  - 온디바이스 1차 필터링 → 일자별 배치 전송 → AI 베스트샷(최대 15장) 선별 파이프라인
  - 카카오/구글 소셜 로그인 전용 인증 시스템
- **사용 / 시연 시나리오:** 사용자가 도시와 날짜를 입력하면 AI가 관광지·맛집을 포함한 최적 동선의 여행 계획 초안을 생성한다. 사용자는 초안을 직접 수정하거나 추가 프롬프트로 AI에게 재요청해 계획을 완성한다. 여행이 끝나면 앱이 촬영 기간 내 사진을 온디바이스에서 1차 필터링하고, AI가 일자별 배치로 베스트샷 최대 15장을 추천한다. 사용자는 그중 최종 사용할 사진을 선택해 글과 함께 여행 기록을 작성하고, 이후 기록 목록에서 조회·수정·삭제할 수 있다.
- **팀원별 역할:**
  - 이예원 (FullStack Dev): Flutter 앱 UI/UX 전반(로그인, 계획 생성/편집, 사진 선별, 기록 작성/관리 화면), 백엔드 API 연동, 온디바이스 필터링(흔들림/노출/중복 제거, OCR, 얼굴 감지, EXIF 추출) 구현
  - 이지민 (BackEnd Dev): 백엔드 서버(API/DB 설계), 소셜 로그인 서버 측 토큰 검증, OpenAI API 연동(계획 생성·사진 선별 배치 처리), 임시 버퍼·암호화 스토리지 등 개인정보 처리 파이프라인 구현

### 개발 일정

| 날짜 | 목표 |
|---|---|
| Day 1 | 주제 정하기 |
| Day 2 | 기능 구체화 (기능명세서 작성, 기술 스택 확정), DB 스키마 설계 |
| Day 3 | 프로젝트 초기 세팅 (Flutter/백엔드 구조 잡기, 소셜 로그인 연동 착수) |
| Day 4 | 소셜 로그인 완료, AI 여행 계획 생성 기능(OpenAI 연동) 개발 |
| Day 5 | 여행 계획 수정/공동 편집 기능, AI 사진 선별 파이프라인(온디바이스 필터링~배치 전송) 개발 |
| Day 6 | 사진 선별 결과 UI, 여행 기록 작성/관리 기능 개발 및 전체 통합 테스트 |
| Day 7 | 버그 수정, UI 폴리싱, 시연 자료·발표 준비 |

---

## 구현 명세서

| 구현 요소 | 설명 | 우선순위 |
|---|---|---|
| 소셜 로그인 (카카오/구글) | 이메일/비밀번호 없이 소셜 계정으로만 로그인, 최초 로그인 시 회원 자동 생성/연결 | 필수 |
| AI 기반 여행 계획 생성 및 수정 | 도시·날짜 입력 → AI가 동선 최적화된 계획 초안 생성, 장소 추가/제거/순서 변경 및 프롬프트 재수정 | 필수 |
| AI 기반 여행 사진 선별 및 기록 | 온디바이스 1차 필터링(흔들림/중복/OCR/얼굴 감지) → 최대 100장 임시 버퍼 → OpenAI 배치 선별(최대 15장) → 사용자 최종 선택 → 암호화 스토리지 저장 | 필수 |
| 사용자 여행 기록 관리 | 작성한 여행 기록 목록 조회, 요약 표시, 수정/삭제(연결 사진 함께 삭제) | 필수 |
| 공동 여행 계획 수립 | 공유 링크로 친구 초대, 동시 편집 시 데이터 충돌 없는 동기화 | 선택 |
| 로그인 실패/취소 및 로그아웃 처리 | 상황별 오류 안내·재시도, 로그아웃 시 세션 삭제 및 보호 화면 접근 제어 | 선택 |

---

## 아키텍처

```text
[Flutter App]
   │
   ├─ Social Login (Kakao / Google)
   ├─ Trip / Schedule UI (AI 일정 생성·편집)
   ├─ Place Search / Map (Google Maps)
   ├─ On-device Photo Filtering Pipeline
   └─ Record Management
        │  REST(Dio) + Socket.IO
        ▼
[NestJS Backend]
   │
   ├─ Auth Module (JWT access/refresh + 소셜 로그인 검증)
   ├─ Users / Trips / Schedule Module
   ├─ Places Module (TourAPI · Google Places 캐시)
   ├─ Records Module (사진 파이프라인 · AI 큐레이션)
   ├─ Notifications Module (FCM)
   └─ Collaboration Gateway (Socket.IO, 공동 일정 편집)
        │
        ▼
[Database / Storage / External APIs]
   │
   ├─ PostgreSQL (Supabase, TypeORM 마이그레이션)
   ├─ Firebase (Storage 사진 저장 · Cloud Messaging)
   ├─ OpenAI API (일정 생성/수정, 사진 선별)
   └─ TourAPI / Google Places / Google Maps
```

---

## 설계 문서

### 화면 / 인터페이스 설계

<!-- Figma 링크, 앱 화면 캡처 등 -->

### 데이터 구조

주요 엔티티(12개 테이블, TypeORM 마이그레이션 기준): `users`, `social_accounts`, `refresh_tokens`, `trips`, `trip_members`, `trip_invite_links`, `places`, `trip_places`, `ai_plan_requests`, `travel_records`, `record_photos`, `record_day_entries`, `notification_logs`, `user_devices`.

![DB 스키마](./TripAndEnd.png)

### API / 외부 서비스 연동

| Method / 방식 | Endpoint / 서비스 | 설명 | 요청 | 응답 | 비고 |
|---|---|---|---|---|---|
| REST | `/auth/*` | 카카오/구글 소셜 로그인, JWT access/refresh 발급·재발급 | 소셜 idToken | accessToken, refreshToken | Passport 전략 기반 |
| REST | `/trips`, `/trips/{id}/schedule` | 여행 CRUD, AI 일정 초안 생성·수정 | 도시/날짜/프롬프트 | 일정(day별 장소 목록) | OpenAI Chat Completions 연동 |
| REST | `/trips/{id}/places/candidates` | 여행지 주변 장소 후보 검색 | areaCode/sigunguCode/category | 장소 목록(사진·평점 포함) | TourAPI + Google Places 매칭 캐시 |
| REST | `/records/*` | 기록 세션 시작, 사진 메타등록/업로드/큐레이션/확정, Day별 다이어리 CRUD | 사진 파일, 캡션, Day 텍스트 | 기록 상세 | Firebase Storage 업로드 |
| REST | `/notifications` | 기기 등록, 알림함 조회 | FCM 토큰 | 알림 목록 | Firebase Cloud Messaging |
| WebSocket | Collaboration Gateway (`Socket.IO`) | 공동 여행 계획 실시간 동기화 | 일정 변경 이벤트 | 브로드캐스트 이벤트 | 초대 링크로 참여 |
| External | OpenAI API | 여행 일정 생성/수정, 사진 베스트샷 선별(Vision) | 프롬프트/이미지 | 일정 JSON, 선별 결과 | 배치 처리 |
| External | Firebase (Storage / Messaging) | 사진 저장, 푸시 알림 발송 | 파일, 메시지 | URL, 전송 결과 | Firebase Admin SDK |

---

## 산출물 및 실행 방법

- **산출물 설명:** trip and end — AI가 여행 일정 초안을 만들어주고, 여행이 끝나면 사진을 자동 선별해 기록으로 남겨주는 Flutter 앱(iOS/Android/Web) + NestJS 백엔드
- **실행 환경:** Flutter 3.x / Node.js 20+ / PostgreSQL(Supabase) — 모바일은 iOS 시뮬레이터·Android 에뮬레이터 또는 실기기, 웹은 Chrome
- **실행 방법:** 아래 [실행 방법](#실행-방법) 참고 — 백엔드(NestJS) 먼저 띄운 뒤 프론트(Flutter)에서 연결
- **시연 영상 / 이미지:** (선택)

### 실행 방법

**Backend**

```bash
# 환경 설정 (.env에 DB 연결 문자열, JWT 시크릿, OpenAI/Firebase/카카오·구글 키 등 채우기)
cp .env.example .env

# 의존성 설치
npm install

# DB 마이그레이션
npm run migration:run

# 개발 서버 실행 (http://localhost:3000)
npm run start:dev
```

**Frontend**

```bash
cd frontend

# 의존성 설치
flutter pub get

# 실행 (연결된 기기/에뮬레이터 또는 -d chrome)
flutter run
```

> 카카오/구글 소셜 로그인, Firebase(Storage/Messaging), Google Maps, OpenAI API는 각각 콘솔에서 발급받은 키를 `.env`(백엔드) 및 `frontend/android`, `frontend/ios`, `frontend/web`의 플랫폼별 설정 파일에 넣어야 정상 동작한다.

### 기술 구성

| 분류 | 사용 기술 |
|---|---|
| 핵심 기술 | Flutter(Dart) · NestJS(TypeScript) · Riverpod · TypeORM |
| 실행 환경 | iOS / Android / Web (Flutter 단일 코드베이스) |
| 데이터 저장 | PostgreSQL(Supabase) · Firebase Storage |
| 외부 API / 서비스 | OpenAI API · TourAPI · Google Maps / Places · Kakao Login · Google Sign-In · Firebase Cloud Messaging |
| 기타 | Socket.IO(공동 편집 실시간 동기화) · Google ML Kit(온디바이스 사진 필터링) · JWT 인증(access/refresh 로테이션) |

---

## 회고 문서

> [KPT 방법론 참고](https://velog.io/@habwa/%EB%8B%A8%EA%B8%B0-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-%ED%9A%8C%EA%B3%A0-KPT-%EB%B0%A9%EB%B2%95%EB%A1%A0)

### Keep — 잘 된 점, 다음에도 유지할 것

-
-
-

### Problem — 아쉬웠던 점, 개선이 필요한 것

-
-
-

### Try — 다음번에 시도해볼 것

-
-
-

### 팀원별 소감

**이예원:**

> 

**이지민:**

> 

---

## 참고 자료

> 선택 옵션(LLM Wrapper, Cross-Platform)에 해당하는 자료만 남겨뒀다. 공동 편집 기능에 쓴 Socket.IO는 [공식 문서](https://socket.io/docs/v4/)를 클라이언트 연동 방식 위주로 참고했다.

### LLM Wrapper

- https://github.com/teddylee777/openai-api-kr
- https://github.com/teddylee777/langchain-kr
- https://devocean.sk.com/blog/techBoardDetail.do?ID=167407
- https://mastra.ai/docs

### Cross-Platform

- https://flutter.dev/
- https://reactnative.dev/
- https://docs.expo.dev/
- https://kotlinlang.org/multiplatform/
