# trip and end — 백엔드/앱 개발 계획 (DEVELOPMENT_PLAN)

> 본 문서는 구현 착수 전 설계 문서입니다. 코드, Entity, Controller, Repository는 아직 작성되지 않았으며, 이 계획이 팀 내 확인된 이후 Phase 순서대로 구현을 시작합니다.

| 항목 | 내용 |
|---|---|
| 문서 작성일 | 2026-07-10 |
| 대상 프로젝트 | trip and end (AI 기반 여행 계획 및 기록 앱, KAIST 몰입캠프 공통과제 II) |
| 앱/백엔드 스택 | Flutter(Riverpod), NestJS(TypeORM), PostgreSQL(Supabase), Firebase Storage, JWT(Passport), OpenAI API, TourAPI, Google Places API (New) |
| 팀 | 이예원(FullStack, Flutter 중심) / 이지민(BackEnd, NestJS 중심) |
| 참고 문서 | `README.md`, `AI_기반_여행_계획_및_기록_앱_기능명세서_2026-07-10_v2.md`, `trip_and_end_erd.dbml`, `API_명세서_2026-07-10_v1.md` |

---

## 1. 프로젝트 분석

### 1.1 프로젝트 목적

여행 전 계획 수립의 시간/노력 부담과, 여행 후 사진 정리·기록의 번거로움을 AI로 줄여 여행의 시작과 끝 모두에서 사용자 만족도를 높이는 것이 목적입니다. 단순 정보 제공이 아니라, **AI가 초안을 만들고 사용자가 다듬는 협업형 계획 수립**과 **AI가 후보를 추리고 사용자가 최종 선택하는 사진 기록**이라는 두 개의 "AI 초안 + 사람의 최종 확정" 구조가 제품 전체를 관통합니다.

### 1.2 핵심 기능 요약

기능명세서 기준으로 백엔드가 지원해야 할 핵심 기능은 다음과 같습니다.

1. **사용자 인증(소셜 로그인 전용)** — 카카오/애플/구글로만 가입·로그인, 이메일/비밀번호 미제공
2. **AI 기반 여행 계획 생성 및 수정** — 도시·날짜 입력 → 후보 장소 추천 → 사용자 선택 → AI 동선 생성 → 수동 편집/프롬프트 재수정
3. **공동 여행 계획 수립** — 공유 링크로 친구 초대, 동시 편집 시 데이터 충돌 없는 동기화(선택 기능)
4. **AI 기반 여행 사진 선별 및 기록** — 온디바이스 1차 필터 → 서버 임시 버퍼 → OpenAI 배치 선별(최대 15장) → 사용자 최종 선택 → 암호화 스토리지 영구 저장
5. **사용자 여행 기록 관리** — 기록 목록/상세/수정/삭제, 삭제 시 연결 사진 완전 삭제

### 1.3 주요 도메인

ERD(`trip_and_end_erd.dbml`)와 API 명세서를 대조한 결과, 아래 8개 도메인(NestJS 모듈)으로 구분됩니다.

| 도메인(모듈) | 책임 | 관련 테이블 |
|---|---|---|
| `auth` | 소셜 로그인 검증, JWT 발급/재발급/폐기 | (Entity 없음, `users`/`social_accounts` 재사용) |
| `users` | 프로필, 디바이스 푸시 토큰, 회원 탈퇴 | `users`, `social_accounts`, `user_devices` |
| `trips` | 여행 생성/조회/수정/삭제, 멤버·초대링크 | `trips`, `trip_members`, `trip_invite_links` |
| `places` | TourAPI/Kakao 장소 캐싱, 후보 추천 | `places` |
| `schedule` | 일자별 장소 배치, AI 계획 생성/재수정 | `trip_places`, `ai_plan_requests` |
| `collaboration` | 공동 편집 실시간 동기화(WebSocket) | 자체 Entity 없음 → `trip_members`/`trip_places` 재사용 |
| `records` | 여행 기록(일기+사진) 작성/관리, 사진 파이프라인 | `travel_records`, `record_photos` |
| `notifications` | 여행 종료 감지, 기록 유도 푸시 | `notification_logs` |

`common`, `config`는 도메인이 아니라 횡단 관심사(공통 응답/에러 포맷, 전역 예외 처리, 환경설정, 외부 API 클라이언트 설정)를 담당합니다. `storage`는 자체 Entity 없이 Firebase Storage 업로드만 담당하는 유틸리티 모듈로, `records` 도메인(Phase 11)에서 처음 필요해집니다.

### 1.4 전체 시스템 흐름

```
[소셜 로그인(카카오/애플/구글) — 최초 로그인 시 신규 회원 자동 생성]
        │
        ▼
1) 프로필 최소 정보 입력(닉네임) — users 도메인
        │
        ▼
2) 여행 생성(도시·날짜) — trips 도메인, trip_members에 owner 자동 등록
        │
        ▼
3) 관광지 후보 추천(TourAPI+Kakao 병합 인기순) — places 도메인
        │
        ▼
4) 후보 선택 → AI 동선 생성(OpenAI, 동기) — schedule 도메인, trip_places bulk insert
        │
        ├─ (선택) 공유 링크로 친구 초대 → 공동 편집 — trips.invite-links + collaboration(WS)
        │
        ▼
5) 수동 편집 / 프롬프트 재수정 — schedule 도메인, ai_plan_requests 이력 기록
        │
        ▼
6) [여행 진행 기간 — 서비스 외부 활동]
        │
        ▼
7) 여행 종료일 다음날 배치가 trips.status=completed 전환 + 기록 유도 푸시 — notifications 도메인
        │
        ▼
8) 사용자가 알림 클릭/"기록 시작" 선택 → 온디바이스 1차 필터 → metadata 등록 → 실물 업로드(임시 버퍼)
        │
        ▼
9) curate(OpenAI 일자별 배치, 최종 최대 15장) → candidates 미리보기 → finalize(선택분만 영구 저장) — records 도메인
        │
        ▼
10) 여행 기록(일기) 작성 → 기록 목록/상세 조회, 수정, 삭제 — records 도메인
```

이 흐름에서 `users`는 모든 도메인의 기반이 되고, `trips`는 `places`/`schedule`/`collaboration`/`records`의 기반이 됩니다. `records`는 `trips.status=completed` 이후에만 의미가 있으므로 `notifications`(여행 종료 감지)에 의존하며, `notifications`는 반대로 `trips`의 상태 변화를 감지하는 파생 도메인입니다. 이 의존 방향이 이후 Phase 순서(§5)와 API 구현 순서(§6)의 근거가 됩니다.

---

## 2. 스택 확정에 따른 구체화 항목

| 항목 | 결정 |
|---|---|
| 백엔드 프레임워크 | NestJS (모듈: `auth`, `users`, `trips`, `places`, `schedule`, `collaboration`(WS), `records`, `notifications`, `storage`, `common`, `config`) |
| DB | Supabase Postgres — `trip_and_end_erd.dbml`을 그대로 마이그레이션 |
| ORM | TypeORM (NestJS 공식 통합, 팀 확정 필요 시 Prisma로 대체 가능) |
| 인증 | Supabase Auth는 사용하지 않고 **자체 JWT 발급**(NestJS Passport-JWT). 소셜 로그인 검증은 백엔드가 직접 처리 (API 명세서 §1) |
| Storage | Firebase Storage — `record-photos/` 경로(영구, 최종 선택 사진만), `profile-images/` 경로(프로필 사진, FE 직접 업로드) / 임시 버퍼는 **로컬 서버 디스크**(API 명세서 §6과 동일) |
| 실시간 통신 | NestJS `@nestjs/websockets` + Socket.IO adapter |
| 외부 API | OpenAI(`openai` SDK), TourAPI(REST, 국내 전용), Google Places API (New)(평점/리뷰수 — Kakao 로컬 API는 이 데이터를 제공하지 않아 대체, §16 참고) |

---

## 3. 백엔드 아키텍처

### 3.1 계층 구조

Layered Architecture를 도메인별로 적용합니다.

```
Controller  →  요청/응답 매핑, class-validator 검증, DTO 변환만 담당 (비즈니스 로직 없음)
    ↓
Service     →  트랜잭션 경계, 비즈니스 로직, 도메인 간 조합
    ↓
Repository  →  TypeORM Repository, 영속성 접근만 담당
    ↓
Entity      →  DB 테이블 매핑, 도메인 불변조건(invariant) 캡슐화
```

- **DTO 경계**: Entity는 어떤 계층에서도 Controller 밖으로 직접 반환하지 않습니다. Request DTO → Service에서 Entity로 변환, Entity → Response DTO로 변환 후 반환.
- **의존 방향**: Controller → Service → Repository 단방향. Service는 다른 도메인의 Service를 호출해 조합하며(예: `records` 서비스가 `trips` 서비스를 호출해 소속 확인), 다른 도메인의 Repository를 직접 건드리지 않습니다.
- **예외 흐름**: 각 도메인의 커스텀 예외(`TripNotFoundException` 등)는 `common/filters`의 `GlobalExceptionFilter`가 일괄 처리하여 표준 에러 응답(§12)으로 변환합니다.

### 3.2 모듈(디렉터리) 구조

```
src
├── main.ts
├── app.module.ts
│
├── auth/                       # 로그인/JWT — Entity 없음(users/social_accounts 재사용)
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/             # JwtStrategy, 소셜 provider 검증기(Kakao/Apple/Google)
│   ├── guards/                 # JwtAuthGuard
│   └── dto/
│
├── users/                      # 프로필 + 디바이스 푸시 토큰
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── entities/                # User, SocialAccount, UserDevice
│   └── dto/
│
├── trips/                       # 여행 생성/멤버/초대링크
│   ├── trips.controller.ts
│   ├── trips.service.ts
│   ├── entities/                # Trip, TripMember, TripInviteLink
│   └── dto/
│
├── places/                       # TourAPI/Kakao 장소 캐시 + 후보 추천
│   ├── places.controller.ts
│   ├── places.service.ts
│   ├── entities/                # Place
│   └── clients/                  # TourApiClient, KakaoLocalClient
│
├── schedule/                      # 일자별 배치 + AI 계획 생성/재수정
│   ├── schedule.controller.ts
│   ├── schedule.service.ts
│   ├── entities/                  # TripPlace, AiPlanRequest
│   └── client/                    # OpenAiScheduleClient
│
├── collaboration/                  # 공동 편집 실시간 동기화(자체 Entity 없음)
│   ├── collaboration.gateway.ts    # WebSocket Gateway
│   └── conflict-resolution.service.ts
│
├── records/                        # 여행 기록 + 사진 파이프라인
│   ├── records.controller.ts
│   ├── records.service.ts
│   ├── entities/                    # TravelRecord, RecordPhoto
│   ├── pipeline/                    # PhotoBufferService, PhotoCurationService
│   └── dto/
│
├── notifications/                    # 여행 종료 감지 + 푸시
│   ├── notifications.service.ts
│   ├── notification.scheduler.ts     # trip 종료 배치(cron)
│   └── entities/                      # NotificationLog
│
├── storage/                            # Firebase Storage 업로드 유틸(자체 Entity 없음)
│   └── supabase-storage.client.ts
│
├── common/                              # 횡단 관심사
│   ├── filters/                          # GlobalExceptionFilter
│   ├── exceptions/                        # BusinessException, ErrorCode
│   ├── pipes/                              # 전역 ValidationPipe 설정
│   └── decorators/                          # @CurrentUser() 등
│
└── config/
    ├── database.config.ts
    ├── jwt.config.ts
    ├── openai.config.ts
    ├── tourapi.config.ts
    ├── kakao.config.ts
    └── supabase-storage.config.ts
```

`collaboration`이 자체 Entity 없이 `trip_members`/`trip_places`를 재사용하는 것은 의도된 설계입니다. 실시간 동기화는 별도 데이터를 저장하지 않고 기존 스케줄 데이터의 변경을 브로드캐스트할 뿐이므로, 새 테이블을 만들지 않고 `schedule` 도메인의 Repository/Service를 그대로 재사용해 DRY 원칙을 지킵니다.

### 3.3 데이터 흐름 예시 (요청 → 응답)

AI 스케줄 생성 API를 예로 계층 간 데이터 흐름을 설명합니다.

```
POST /trips/{tripId}/schedule/generate
  → ScheduleController: JwtAuthGuard로 인증, @Valid ScheduleGenerateDto 검증(selectedPlaceIds 배열)
  → ScheduleService.generate()
      1. TripsService.assertMember(tripId, userId) 호출 → trip_members 소속 검증(다른 도메인 Service 호출로 조합)
      2. PlacesService.findByIds(selectedPlaceIds) → 선택된 장소 상세 정보 조회
      3. OpenAiScheduleClient.requestSchedule(placesDetail, tripDuration) 호출 → 일자별 동선 응답 수신
      4. TripPlace bulk insert(day_number/order_in_day 배정, added_by=요청자)
      5. CollaborationGateway.broadcast(tripId, 'schedule:generated', schedule) — 다른 협업 멤버 화면 갱신
  → ScheduleResponseDto로 변환 후 반환
```

이처럼 하나의 API 호출이 여러 도메인 서비스를 조합하지만, 각 도메인은 자신의 Repository만 사용하고 다른 도메인의 Repository에 직접 접근하지 않습니다(도메인 간 결합은 Service 인터페이스 수준에서만 발생).

---

## 4. 도메인 설계 (ERD 기반)

ERD(`trip_and_end_erd.dbml`) 기준으로 12개 테이블을 도메인별로 정리합니다.

### 4.1 User 도메인

**User** (`users`) — 닉네임, 프로필 이미지 URL(Firebase Storage에 FE가 직접 업로드 후 URL만 저장), 상태(`active`/`withdrawn`, soft delete)

**SocialAccount** (`social_accounts`) — `(provider, provider_uid)` unique. 한 사용자가 여러 소셜 계정을 연결할 수 있는 구조로 확장 대비.

**UserDevice** (`user_devices`) — 푸시 토큰, 플랫폼(ios/android), 활성 여부. 알림 발송 대상 조회에 사용.

관계: `User 1 --- N SocialAccount`, `User 1 --- N UserDevice`

### 4.2 Trip 도메인

**Trip** (`trips`) — 제목, 대표 도시명, TourAPI 지역/시군구 코드, 시작/종료일, 상태(`planning`/`ongoing`/`completed`), 대표사진 URL(`cover_image_url`), soft delete

**TripMember** (`trip_members`) — `(trip_id, user_id)` unique, 역할(`owner`/`editor`/`viewer`). 여행 생성 시 생성자가 `owner`로 자동 등록됨.

**TripInviteLink** (`trip_invite_links`) — 공유 링크 토큰, 만료 시각. 링크로 참여 시 기본 `role=editor`로 `trip_members`에 등록.

관계: `User 1 --- N Trip`(owner), `Trip 1 --- N TripMember N --- 1 User`(N:M), `Trip 1 --- N TripInviteLink`

### 4.3 Place 도메인

**Place** (`places`) — TourAPI/Kakao 응답을 캐싱하는 마스터 테이블. `(source, external_id)` unique로 외부 API 재호출을 최소화하며, `(area_code, sigungu_code)`/`(latitude, longitude)` 인덱스로 후보 조회를 지원. 사용자가 직접 추가한 장소는 `source=custom`.

### 4.4 Schedule / AI Plan 도메인

**TripPlace** (`trip_places`) — 여행의 일자별(`day_number`) 장소 목록과 순서(`order_in_day`). `place_id`가 없으면 `custom_name`/`custom_address`로 사용자 직접 입력 장소를 표현.

**AiPlanRequest** (`ai_plan_requests`) — AI 계획 생성/수정 요청 이력(`prompt_text`, `response_summary`). 추후 개인화 추천 모델 학습 데이터로 활용 가능.

관계: `Trip 1 --- N TripPlace`, `Place 1 --- N TripPlace`(nullable), `Trip 1 --- N AiPlanRequest`

### 4.5 Collaboration 도메인

자체 테이블은 없습니다. `trip_invite_links`(§4.2)로 초대를, WebSocket Gateway가 `trip_places`(§4.4)의 변경을 실시간으로 브로드캐스트합니다. 충돌 처리는 `trip_places.updated_at` 기반 낙관적 잠금으로 처리합니다(§10).

### 4.6 Record / Photo 도메인

**TravelRecord** (`travel_records`) — `(trip_id, user_id)` unique(한 여행당 사용자 1인 1기록). `status`(`draft`/`published`), 작성자 본인만 조회 가능(비공개 원칙).

**RecordPhoto** (`record_photos`) — **최종 선택된 사진만** 저장(`storage_url`). EXIF에서 추출한 촬영일시/지명(원본 GPS 좌표는 미저장), 캡션, 순서, 대표사진 여부(`is_cover`). AI가 추천했으나 미선택된 사진은 이 테이블에 없음(pass-through 처리, §11).

관계: `Trip 1 --- N TravelRecord N --- 1 User`, `TravelRecord 1 --- N RecordPhoto`

### 4.7 Notification 도메인

**NotificationLog** (`notification_logs`) — 여행 종료 알림(`trip_end_reminder`), 초대 알림(`trip_invite`) 발송 이력과 클릭 시각(`clicked_at`, 사용자가 알림을 클릭해 기록 작성을 시작한 시각).

### 4.8 ERD 요약

```mermaid
erDiagram
    USERS ||--o{ SOCIAL_ACCOUNTS : links
    USERS ||--o{ USER_DEVICES : registers
    USERS ||--o{ TRIPS : owns
    USERS ||--o{ TRIP_MEMBERS : joins
    TRIPS ||--o{ TRIP_MEMBERS : has
    TRIPS ||--o{ TRIP_INVITE_LINKS : issues
    TRIPS ||--o{ TRIP_PLACES : schedules
    PLACES ||--o{ TRIP_PLACES : referenced_by
    TRIPS ||--o{ AI_PLAN_REQUESTS : requests
    TRIPS ||--o{ TRAVEL_RECORDS : produces
    USERS ||--o{ TRAVEL_RECORDS : writes
    TRAVEL_RECORDS ||--o{ RECORD_PHOTOS : contains
    USERS ||--o{ NOTIFICATION_LOGS : receives
    TRIPS ||--o{ NOTIFICATION_LOGS : triggers
```

---

## 5. 개발 Phase

의존 관계(§1.4, §4)에 따라 총 14개 Phase로 나눕니다. 각 Phase는 이전 Phase가 완료되어야 시작할 수 있습니다. FE(이예원)/BE(이지민) 작업은 각 Phase 안에 함께 표기하며, FE가 BE 완료를 기다려야 하는 항목은 **"⛓ 의존"**으로 표시합니다.

### Phase 1 — 프로젝트 초기 설정
- **목표**: 실행 가능한 최소 골격 구축, Supabase 프로젝트 연결 확보
- **구현 내용**:
  - BE: NestJS 프로젝트 초기화, 모듈 스캐폴딩(§3.2 전체 디렉터리), Supabase 프로젝트 생성(Postgres+Storage)
  - FE: Flutter 프로젝트 초기화, feature-first 폴더 구조, 상태관리(Riverpod) 채택, 디자인 토큰(메인 컬러 `#CBFCE7`) 정리
  - 공통: `.env`/`.env.example` 분리(민감정보 Git 미포함 확인)
- **완료 조건**: `npm run start:dev`와 `flutter run`이 각각 정상 기동, Supabase 대시보드에서 연결 정보 확보
- **선행 Phase**: 없음
- **산출물**: NestJS/Flutter 초기 커밋, `.env.example`

### Phase 2 — 공통 기반(Common/Config) 구축
- **목표**: 모든 도메인이 공유할 표준을 이후 Phase보다 먼저 확정해 반복 작업 제거
- **구현 내용**:
  - BE: 공통 응답/에러 포맷 구현(API 명세서 §0 기준 — 성공은 raw JSON, 실패는 `{ error: { code, message } }`), `common/filters/GlobalExceptionFilter`, `common/exceptions/BusinessException`+`ErrorCode`, 전역 `ValidationPipe`(class-validator), `ConfigModule`(env 스키마 검증), CORS 설정
- **완료 조건**: 임시 테스트 컨트롤러에서 예외 발생 시 표준 에러 포맷으로 응답됨을 확인
- **선행 Phase**: Phase 1
- **산출물**: `common/`, `config/` 모듈 일체

### Phase 3 — DB 스키마 및 Entity 생성 (전 도메인)
- **목표**: ERD 12개 테이블을 한 번에 Supabase에 생성하고 TypeORM Entity로 매핑
- **구현 내용**:
  - BE: `trip_and_end_erd.dbml` 기준 마이그레이션 작성(§7 순서 준수), 전 도메인 Entity(User, SocialAccount, UserDevice, Trip, TripMember, TripInviteLink, Place, TripPlace, AiPlanRequest, TravelRecord, RecordPhoto, NotificationLog) + Repository 작성
  - unique 인덱스 반영: `(provider, provider_uid)`, `(trip_id, user_id)`(trip_members), `(source, external_id)`(places), `(trip_id, user_id)`(travel_records)
  - 연관관계는 지연 로딩 기본, N+1 방지는 이후 Phase에서 필요한 조회에 한해 쿼리 최적화
- **완료 조건**: 마이그레이션 실행 후 12개 테이블 전부 생성 확인, Repository 단위 테스트로 기본 CRUD 동작 확인
- **선행 Phase**: Phase 2
- **산출물**: 전 도메인 `entities/`, 마이그레이션 스크립트

### Phase 4 — 인증(Auth): 소셜 로그인 & JWT
- **목표**: 이후 모든 API가 전제하는 인증 계층 완성 (E2E 체크포인트)
- **구현 내용**:
  - BE: ① JWT 발급/검증 공통 모듈(Access 30분 / Refresh 30일, DB에 해시로 저장, 재발급 시 rotation + 재사용 탐지 시 해당 유저 전체 세션 무효화) ② 카카오/애플/구글 각 제공자 토큰(idToken/authorizationCode) 검증 로직 ③ `POST /auth/{provider}/login`, `POST /auth/token/refresh`, `POST /auth/logout` 완성 — ①→②→③ 순서 필수
  - 실패 사유별 에러코드(`USER_CANCELLED`/`NETWORK_ERROR`/`TOKEN_INVALID`/`PROVIDER_ERROR`) 구현
  - FE: 카카오/구글/애플 로그인 SDK 연동, 로그인 화면, `flutter_secure_storage` + Dio 인터셉터(JWT 자동 첨부/재발급) — ⛓ BE ①~③ 완료를 기다려 실제 연동
- **완료 조건**: 3개 제공자 모두 실기기에서 로그인 성공, 미인증 요청 401, refresh rotation/재사용탐지 동작 확인
- **선행 Phase**: Phase 3(User/SocialAccount Entity)
- **산출물**: `auth/` 모듈 전체, FE 로그인 플로우

### Phase 5 — User API
- **목표**: 프로필/디바이스 관리, 최초 로그인 온보딩
- **구현 내용**:
  - BE: `GET/PATCH/DELETE /users/me`, `POST/DELETE /users/me/devices`
  - FE: 최초 로그인 시 닉네임 입력 화면, 프로필 조회/수정 화면, 프로필 이미지는 **Firebase Storage에 직접 업로드**(firebase_storage 패키지) 후 반환된 다운로드 URL을 `PATCH /users/me`로 전달, 푸시 권한 요청 + 토큰 등록
- **완료 조건**: 프로필 조회/수정/탈퇴, 디바이스 등록/해제 정상 동작. 프로필 이미지가 Storage에 저장되고 URL이 반영됨
- **선행 Phase**: Phase 4
- **산출물**: `users/` 모듈

> 프로필 이미지는 백엔드가 파일을 직접 다루지 않고 URL 문자열만 저장합니다(§11.1). 반면 여행 기록 사진은 AI 선별·암호화·임시 폐기 요구사항 때문에 반드시 백엔드를 경유합니다(§11.2, Phase 11) — 같은 "이미지 저장"이라도 두 경로가 다른 이유입니다.

### Phase 6 — Trip 생성/관리 API
- **목표**: 이후 모든 여행 관련 API가 전제하는 `tripId` 리소스 확보
- **구현 내용**:
  - BE: `POST/GET/PATCH/DELETE /trips` — 생성 시 `trip_members`에 `owner` 자동 등록
  - FE: 여행 생성 화면(도시 검색 + 날짜 선택), 여행 목록/상세 화면
- **완료 조건**: 여행 생성 시 owner가 자동 등록되고, 목록/상세/수정/삭제 정상 동작(삭제는 owner만, soft delete)
- **선행 Phase**: Phase 5
- **산출물**: `trips/` 모듈(Trip CRUD 부분)

### Phase 7 — Place 후보 추천 (구현 완료, 국내 여행 전용)
- **목표**: 도시 기준 관광지 후보를 인기순으로 제시
- **범위 변경(팀 결정)**: TourAPI(한국관광공사)가 국내 지역코드만 제공함을 착수 전 확인(`areaCode2` 응답에 서울/부산 등 17개 국내 광역만 존재, 해외 지역코드 없음). `design.md`/기능명세서의 오사카 등 해외 도시 예시와 어긋나지만, **이번 범위는 국내 여행으로 한정**하기로 결정. 해외 여행 지원은 별도 데이터 소스(예: Google Places 자체를 후보 소스로도 사용)가 필요한 후속 과제로 남긴다.
- **데이터 소스 변경(팀 결정)**: 원래 계획이던 "Kakao 로컬 API 리뷰수/평점 병합 정렬"은 착수 전 연결 테스트에서 **불가능으로 확인**됨 — Kakao 로컬 API(키워드/카테고리 검색)는 평점·리뷰수 필드 자체를 제공하지 않으며, 카카오 공식 답변(데브톡, 2026-01-14)으로 "내부 정책상 미제공, 제휴로도 검토 불가"임을 확인. 대신 **Google Places API (New)**(Text Search)로 각 TourAPI 후보의 `rating`/`userRatingCount`를 조회해 병합 정렬하는 방식으로 대체.
- **구현 내용**:
  - BE: TourAPI 연동 모듈(`area_code`/`sigungu_code` 기준 조회 → `places` 캐싱, `places/clients/tour-api.client.ts`) → Google Places API(New)로 각 후보의 평점/리뷰수 조회(`places/clients/google-places.client.ts`) → `rating × log10(reviewCount+1)` 가중치로 정렬 → `GET /trips/{tripId}/places/candidates` 완성, `GET /places/{placeId}` 상세
  - FE: 후보 리스트(인기순) + 카테고리 선택 시 지도 마커 필터링(후보 목록 범위 내에서 클라이언트가 처리, 별도 재조회 없음)
- **완료 조건**: 후보 목록이 평점·리뷰수 가중치로 정렬되어 반환되고, Google Places 미매칭 장소는 최하위로 정렬됨 — 충족(단위테스트 22건, 실제 TourAPI/Google Places 연결 테스트로 검증 완료)
- **선행 Phase**: Phase 6
- **산출물**: `places/` 모듈(Controller/Service/Client 전체)

### Phase 8 — AI 여행 계획 생성
- **목표**: 선택한 장소로 AI가 일자별 최적 동선을 생성 (이 프로젝트에서 가장 까다로운 AI 연동)
- **구현 내용**:
  - BE: OpenAI 클라이언트 세팅(`schedule/client/OpenAiScheduleClient`) → `POST /trips/{tripId}/schedule/generate`(동기 처리, `trip_places` bulk insert, `added_by`=요청자) — 최소 동작(오류 없이 스케줄 형태 반환)부터 확보하고 프롬프트 품질은 이후 튜닝
  - FE: "선택 완료 → 생성 중" 로딩 화면 → 결과 화면(일자별 리스트)
- **완료 조건**: 선택한 장소들이 일자별로 배정되어 반환되고 `trip_places`에 저장됨
- **선행 Phase**: Phase 7
- **산출물**: `schedule/` 모듈(생성 부분), `config/openai.config.ts`

### Phase 9 — 스케줄 조회/수동 편집/프롬프트 재수정
- **목표**: AI 초안을 사용자가 다듬을 수 있게 함
- **구현 내용**:
  - BE: `GET /trips/{tripId}/schedule`, `POST/PATCH/DELETE .../schedule/places/{tripPlaceId}`, `PATCH .../schedule/reorder`, `POST .../schedule/revise`(자연어 프롬프트 재수정, `ai_plan_requests`에 `prompt_text`/`response_summary` 기록)
  - FE: 편집 화면(드래그앤드롭 순서 변경), 프롬프트 재수정 입력 UI
- **완료 조건**: 장소 추가/제거/순서변경이 반영되고, 프롬프트 재수정 요청이 이력과 함께 스케줄에 반영됨
- **선행 Phase**: Phase 8
- **산출물**: `schedule/` 모듈 완성

> **체크포인트**: 로그인 → 여행 생성 → 후보 선택 → AI 스케줄 생성 → 수동 편집까지 실기기 E2E로 한 번에 확인. 여기까지가 필수 기능의 절반이며, 시간이 부족하면 Phase 10(공동편집)의 실시간 동기화 부분을 먼저 축소합니다(§15).

### Phase 10 — 공동 여행 계획 수립 (Collaboration)
- **목표**: 초대 링크로 함께 계획을 편집(REST는 필수, WebSocket 실시간 동기화는 선택)
- **구현 내용**:
  - BE(REST, 필수): `POST /trips/{tripId}/invite-links`, `POST /trips/invite-links/{token}/join`(기본 `role=editor`), `GET .../members`, `PATCH/DELETE .../members/{userId}`
  - BE(WebSocket, 선택): `collaboration/collaboration.gateway.ts` — 연결 시 JWT 검증 + `trip_members` 소속 확인(미소속 시 4403 close), `schedule:op`/`presence:ping` 수신, `schedule:op`/`schedule:generated`/`schedule:conflict`/`member:joined`/`member:left` 브로드캐스트. 충돌 처리는 `trip_places.updated_at` 낙관적 잠금(§10.1)
  - FE: 공유 링크 UI(생성/공유 시트, 딥링크 참여), (WS 구현되면) 실시간 반영, 안 되면 폴링/새로고침으로 대체
- **완료 조건**: 초대 링크로 참여 및 역할 변경/추방이 정상 동작(REST 필수). WebSocket은 되면 실시간 반영, 안 되면 "새로고침 시 반영"까지만 허용(§15)
- **선행 Phase**: Phase 9
- **산출물**: `trips/` 모듈(멤버·초대링크 부분), `collaboration/` 모듈

### Phase 11 — AI 사진 선별 및 기록 파이프라인
- **목표**: 온디바이스 필터부터 최종 저장까지 사진 파이프라인 전 구간 동작 (개인정보 요구사항이 걸린 핵심 Phase)
- **구현 내용**:
  - FE(가장 난이도 높은 항목, 먼저 착수): 온디바이스 1차 필터링(흔들림/노출/중복 제거, OCR 문서 감지, 얼굴 감지 기반 제3자 감점), EXIF 추출·GPS→지명 변환(기기 내 처리)
  - BE(반드시 이 순서, §6): ① `POST /trips/{tripId}/records`(기록 세션 시작, `(trip_id,user_id)` unique이므로 기존 draft 재사용) ② `.../photos/metadata`(텍스트 메타데이터 배치 등록, `photoRefId` 발급) ③ `.../photos/upload`(1차 필터 통과 사진 실물, 로컬 임시 디스크 pass-through 저장 + TTL cron 삭제, 최대 100장) — ①→②→③ 순서인 이유: metadata로 `photoRefId`를 먼저 발급해야 upload가 그 id에 파일을 매칭할 수 있음 ④ `.../photos/curate`(`taken_at` 기준 일자별 그룹핑 → OpenAI 배치 → 최종 최대 15장, 비추천분 즉시 폐기) ⑤ `.../photos/candidates`(서명 URL 미리보기), `.../photos/finalize`(선택분만 `storage/` 모듈로 Firebase Storage 영구 업로드 + `record_photos` insert, 나머지 전량 폐기)
  - FE: 필터링 완성되는 대로 BE ①~③에 맞춰 업로드 화면 연동(지연 시 "필터 없이 최근 N장" 폴백으로 나머지 파이프라인 먼저 검증), 추천 15장 그리드 → 선택 화면
- **완료 조건**: 사진 업로드 → curate → 사용자 선택 → finalize까지 실기기로 최소 1회 완주, **임시 버퍼 폐기(curate 비추천분, finalize 미선택분)가 실제로 지워지는지 확인**(안 지워지면 개인정보 요구사항 위반)
- **선행 Phase**: Phase 10 (단, 실제로는 Phase 3의 Entity/Repository만으로 구현 가능하며 Phase 10의 WebSocket 부분에는 의존하지 않음 — 시간이 부족하면 Phase 10 WS보다 이 Phase를 우선)
- **산출물**: `records/` 모듈(파이프라인 부분), `storage/` 모듈

### Phase 12 — 여행 기록 관리 & 대표사진
- **목표**: 작성된 기록을 조회·수정·삭제하고 여행 대표사진을 관리
- **구현 내용**:
  - BE: `PATCH /trips/{tripId}/records/{recordId}`(일기 본문, `draft`→`published`), `GET /records`(본인 기록만 요약), `GET/DELETE /records/{recordId}`(삭제 시 `record_photos` 스토리지까지 hard delete), `PUT/DELETE /trips/{tripId}/cover`(대표사진 지정/해제, 본인이 작성한 기록의 사진만 가능 — §11.3)
  - FE: 기록 작성 화면(캡션+본문), 기록 목록/상세/수정/삭제 화면, 대표사진 지정 UI
- **완료 조건**: 목록/상세/수정/삭제, 대표사진 지정과 삭제 시 자동 해제가 정상 동작
- **선행 Phase**: Phase 11
- **산출물**: `records/` 모듈 완성

### Phase 13 — 알림(Notification)
- **목표**: 여행 종료를 감지해 기록 작성을 유도
- **구현 내용**:
  - BE: 여행 종료 배치(cron) — `end_date` 다음날 `trips.status`를 `completed`로 전환, `notification_logs(type=trip_end_reminder)` 기록 + 등록된 `user_devices`로 푸시 발송
  - FE: 푸시 수신 시 "기록 시작" 딥링크 처리(Phase 11 진입점과 연결)
- **완료 조건**: 종료일이 지난 여행이 배치로 `completed` 전환되고 푸시가 발송됨, 클릭 시 `clicked_at` 기록
- **선행 Phase**: Phase 12 (records 진입점이 있어야 알림의 딥링크가 의미를 가짐)
- **산출물**: `notifications/` 모듈

### Phase 14 — 통합 테스트, 보안 점검 및 배포 준비
- **목표**: 전체 플로우 검증과 배포 가능한 상태 확보
- **구현 내용**:
  - 전체 플로우 e2e 통합 테스트: 로그인 → 여행 생성 → 후보 선택 → AI 스케줄 → (공유/편집) → 사진 선별 → 기록 작성까지 1회 완주, 발견된 버그 즉시 수정(신규 기능 추가는 이 시점부터 중단)
  - 보안 점검(§12·API 명세서 §6 재확인): OpenAI 전송 전 EXIF 완전 제거 이중 검증, TLS 설정, `.env`/시크릿 노출 여부, 기록 비공개 원칙(작성자 본인만 접근) 재확인
  - UI 폴리싱(로딩/에러/빈 상태 화면, 메인 컬러 `#CBFCE7` 일관성), `Dockerfile`(Multi-stage) 작성, 환경변수/시크릿 분리
- **완료 조건**: Docker 이미지로 로컬 실행 시 전체 플로우 정상 동작
- **선행 Phase**: Phase 4~13
- **산출물**: `Dockerfile`, 통합 테스트 결과, 최종 API 문서

---

## 6. API 구현 순서 및 근거

Phase 순서가 곧 API 구현 순서입니다. 근거는 다음과 같습니다.

1. **인증이 먼저다**: 이후 모든 API가 `Authorization: Bearer` 토큰의 `userId`에 의존하므로, JWT 인증 없이는 어떤 도메인 API도 의미 있게 테스트할 수 없습니다.
2. **User → Trip → Place/Schedule 순서가 FK 의존 순서와 동일하다**: Trip은 owner(User)가 있어야 생성 가능하고, TripPlace/AiPlanRequest는 Trip과 Place가 이미 존재해야 합니다.
3. **Collaboration(초대·WS)은 Trip이 이미 존재해야 의미 있는 부가 기능이다**: `trip_members`/`trip_invite_links`는 존재하는 여행을 전제로 하므로, 계획 도메인(Phase 6~9)보다 먼저 만들 이유가 없습니다.
4. **Record/Photo가 Schedule보다 뒤인 이유**: 여행이 끝나야(`trips.status=completed`) 기록이 의미를 가지므로, 계획 도메인의 API가 먼저 갖춰져야 통합 테스트가 가능합니다.
5. **Notification이 마지막인 이유**: `trip_end_reminder`는 Trip 상태 전환 배치에 의존하고, 알림의 딥링크는 Record 진입점(Phase 11~12)이 이미 있어야 실제로 동작을 검증할 수 있습니다.

---

## 7. DB 구현 순서

`ddl-auto`/마이그레이션 스크립트 어느 쪽을 쓰든 FK 제약을 순서대로 만족시키려면 아래 순서로 테이블을 생성합니다.

| 순서 | 테이블 | 의존 대상 |
|---|---|---|
| 1 | `users` | 없음(독립) |
| 2 | `places` | 없음(독립, 외부 캐시) |
| 3 | `social_accounts` | `users` |
| 4 | `user_devices` | `users` |
| 5 | `trips` | `users`(owner_id) |
| 6 | `trip_members` | `trips`, `users` |
| 7 | `trip_invite_links` | `trips`, `users` |
| 8 | `trip_places` | `trips`, `places`(nullable), `users`(added_by) |
| 9 | `ai_plan_requests` | `trips`, `users` |
| 10 | `travel_records` | `trips`, `users` |
| 11 | `record_photos` | `travel_records` |
| 12 | `notification_logs` | `users`, `trips` |

`places`는 독립 테이블이지만 실제로는 Phase 7(후보 추천)에서만 채워지므로, 테이블 자체는 Phase 3에서 미리 생성하고 데이터 적재는 Phase 7에서 진행합니다.

---

## 8. 인증 및 인가

### 8.1 JWT 구조

- **Access Token**: 만료 30분, 클레임에 `userId` 포함
- **Refresh Token**: 만료 30일, 서버 DB에 해시로 저장, 재발급 시 rotation + 재사용 탐지 시 해당 유저의 전체 세션 무효화
- 클라이언트 저장: `flutter_secure_storage`(Keychain/Keystore), 평문 저장 금지
- WebSocket 인증: 연결 시 쿼리 파라미터로 access token 전달, 서버가 검증 + `trip_members` 소속 확인, 실패 시 4403으로 close

### 8.2 권한 관리 방식

이 서비스는 복잡한 Role 체계보다 **리소스 기반 인가**가 핵심입니다.

- 기본 인증: 로그인 사용자만 API 접근 가능
- **여행 단위 인가**: 여행 상세/스케줄/멤버 관련 API는 `trip_members`에 해당 사용자가 존재하는지, 필요 시 역할(`owner`/`editor`/`viewer`)까지 Service 레벨에서 검증(NestJS Guard보다 도메인 로직으로 처리하는 것이 적합)
- **기록 비공개 인가**: `travel_records`/`record_photos`는 역할과 무관하게 **작성자 본인만** 접근 가능. 같은 여행의 다른 멤버라도 조회 불가(`record.user_id == 요청자` 검증 후 아니면 403)
- **대표사진 인가**: `trips.cover_image_url` 지정은 트립 멤버 누구나 가능하지만, 지정할 수 있는 사진은 **자기 자신이 작성한 기록의 사진**으로 한정

---

## 9. AI 기능 설계

### 9.1 OpenAI API 사용 방식

- 공식 `openai` Node SDK 사용, API Key는 `OPENAI_API_KEY` 환경변수로 주입하고 코드/설정 파일에 하드코딩하지 않습니다.
- 두 곳에서 독립적으로 사용됩니다: (1) `schedule/client/OpenAiScheduleClient` — 여행 계획 생성/재수정, (2) `records/pipeline/PhotoCurationClient` — 사진 선별. 각각 인터페이스로 추상화해 이후 모델/제공자 교체가 가능하도록 합니다.

### 9.2 여행 계획 프롬프트 설계

- **생성**: 선택된 장소 리스트 + 여행 일수를 프롬프트에 포함해 일자별 최적 동선을 요청, 응답을 파싱해 `trip_places`에 bulk insert
- **재수정**: 기존 스케줄 + 사용자의 자연어 프롬프트를 함께 전달해 전체를 재생성, `ai_plan_requests`에 `prompt_text`/`response_summary` 기록

### 9.3 사진 선별 프롬프트 설계

- 1차 필터를 통과한 사진(최대 100장)을 `taken_at` 기준 일자별로 그룹핑해 배치 호출
- 여행 일수 기준 동적 배분으로 일별 할당 장수를 계산해 합계가 최대 15장이 되도록 함(사진이 적은 날짜는 사진이 많았던 날짜로 가중치 재분배)
- OpenAI로 전송되는 이미지는 **EXIF가 완전히 제거된 상태**여야 하며, 서버가 전송 직전 재검증(이중 스트립)합니다.

### 9.4 오류 처리 및 테스트

- OpenAI 호출 실패(네트워크 오류, 타임아웃, 빈 응답)는 표준 에러코드(`OPENAI_REQUEST_FAILED`, 502)로 변환합니다.
- 외부 네트워크 접근이 없는 테스트 환경에서는 `OpenAiScheduleClient`/`PhotoCurationClient`를 인터페이스 Mock으로 대체해 나머지 로직(스케줄 배정, curate 배분, gating)만 검증합니다. 실제 HTTP 왕복 확인은 배포 환경에서 별도로 진행합니다.

---

## 10. 실시간 협업(WebSocket) 설계

- **연결/인증**: `wss://.../v1/ws/trips/{tripId}?token={accessToken}` — 연결 시 토큰 검증 + `trip_members` 소속 확인, 실패 시 4403 close
- **클라이언트→서버 이벤트**: `schedule:op`(편집 동작 전파), `presence:ping`(접속 유지)
- **서버→클라이언트 이벤트**: `schedule:op`(+`authorUserId`, 다른 멤버 편집 브로드캐스트), `schedule:generated`(AI 스케줄 생성 완료), `schedule:conflict`(충돌 시 서버 최신 상태 강제 전달), `member:joined`/`member:left`

### 10.1 충돌 처리 원칙

`trip_places` 각 행은 `updated_at` 기반 낙관적 잠금(버전 비교)을 사용합니다. 먼저 도착한 변경을 반영하고, 이후 도착한 변경이 stale하면 거부한 뒤 `schedule:conflict`로 최신 상태를 클라이언트에 강제 동기화합니다. CRDT/OT 등 정교한 병합은 1차 구현 범위 밖으로 두고 향후 과제로 남깁니다.

### 10.2 폴백 전략

WebSocket 구현이 일정상 지연되면 REST(§초대·멤버 관리)만으로 축소하고 "새로고침하면 반영"으로 시연 범위를 낮춥니다. 단, 초대 링크로 참여할 수 있는 REST 기능 자체는 필수이며 축소 대상이 아닙니다(§15).

---

## 11. 이미지/사진 저장 구조

### 11.1 프로필 이미지

FE가 Firebase Storage에 **직접** 업로드(`profile-images/{userId}/...` 경로, `image_picker`로 선택 → `firebase_storage`로 업로드)하고, 반환된 다운로드 URL만 `PATCH /users/me`로 백엔드에 전달합니다. 백엔드는 파일 자체를 다루지 않고 `users.profile_image_url` 문자열만 저장합니다. (구현 완료 — Phase 5 `PATCH /users/me`가 이 URL을 받아 저장)

이 앱은 Firebase Auth를 쓰지 않고 자체 JWT로 인증하므로, Storage 보안 규칙이 `request.auth`를 요구하면 업로드가 막힙니다. 현재는 `profile-images/**` 경로만 인증 없이 read/write를 허용하도록 열어둔 임시 상태이며, 강화 필요 여부는 §16 열린 질문 참고.

### 11.2 여행 기록 사진 파이프라인

여행 기록 사진은 AI 선별과 개인정보 보호 요구사항 때문에 프로필 이미지와 달리 반드시 백엔드를 경유합니다.

```
[온디바이스] 1차 필터링(흔들림/노출/중복 제거, OCR 문서 감지, 얼굴 감지 감점) + EXIF 추출/GPS→지명 변환
        │
        ├─ 텍스트 메타데이터(촬영일시, 지명, 로컬 식별자) → photos/metadata → photoRefId 발급
        │
        └─ 사진 실물(최대 100장) → photos/upload → 로컬 서버 임시 디스크 pass-through 저장(TTL cron 삭제)
                  ↓
        photos/curate → 일자별 그룹핑 → OpenAI 배치 → 최종 최대 15장 추천, 비추천분 즉시 폐기
                  ↓
        photos/candidates → 서명 URL 미리보기 제시
                  ↓
        [사용자] 최종 사용할 사진 선택
                  ↓
        photos/finalize → 선택분만 `storage/` 모듈로 Firebase Storage 암호화 영구 업로드 + record_photos insert
                          (미선택 사진은 임시 버퍼에서 전량 폐기)
```

### 11.3 삭제 정책

- 여행(`trips`)/기록(`travel_records`)은 soft delete(`deleted_at`)
- 사진 실물(`record_photos.storage_url`)은 삭제 요청 시 스토리지에서 **hard delete**(기록 전체 삭제 시 연결된 모든 사진도 함께 삭제)
- 대표사진(`trips.cover_image_url`)으로 지정된 사진이 삭제되면 서버가 자동으로 `null` 처리하고, 클라이언트는 기본 플레이스홀더 이미지를 표시

---

## 12. 예외 처리 전략

### 12.1 Global Exception Filter

`common/filters/GlobalExceptionFilter`가 모든 컨트롤러의 예외를 일괄 처리합니다.

| 예외 유형 | 처리 |
|---|---|
| 도메인 커스텀 예외(`BusinessException` 상속) | 예외에 담긴 `ErrorCode`로 상태코드/메시지 결정 |
| Validation 실패(class-validator) | 400, 필드별 에러 메시지 포함 |
| 인증 실패/JWT 검증 실패 | 401 |
| 인가 실패(트립 멤버 아님, 기록 본인 아님 등) | 403 |
| 리소스 없음 | 404 |
| 그 외 미처리 예외 | 500, 예외 스택은 로그로만 남기고 응답에는 노출하지 않음 |

WebSocket은 REST와 별도로 연결 단계 인증 실패 시 4403 close code를 사용합니다(§10).

### 12.2 에러 응답 포맷 (API 명세서 §0 기준)

```json
{
  "error": {
    "code": "TRIP_NOT_FOUND",
    "message": "여행을 찾을 수 없습니다."
  }
}
```

성공 응답은 래퍼 없이 리소스(또는 `{ items, nextCursor }`) 형태를 그대로 반환합니다.

### 12.3 로깅 원칙

사진 바이트, 원본 GPS 좌표, 소셜 로그인 토큰 원문은 어떤 로그에도 남기지 않습니다(API 명세서 §6).

---

## 13. 테스트 전략

| 계층 | 도구 | 대상 | 우선순위 근거 |
|---|---|---|---|
| Repository | 테스트 DB(도커 Postgres 또는 sqlite) | 연관관계 매핑, 커스텀 쿼리 | Entity 설계 오류를 가장 초기에 발견 |
| Service | Jest 단위 테스트(Repository mock) | AI 스케줄 생성 흐름, 사진 curate 일자별 배분 로직, 낙관적 잠금 충돌 처리, JWT rotation/재사용 탐지 | 이 프로젝트의 핵심 로직이 몰려 있어 회귀 위험이 가장 큼 |
| API(통합) | `@nestjs/testing` + supertest | 인증 흐름, 여행 생성~스케줄 생성 트랜잭션 전체, 사진 gating(비공개 원칙) 시나리오 | 여러 도메인이 얽히는 지점을 실제 동작으로 검증 |
| 외부 연동 | HTTP mock(nock/msw) 또는 인터페이스 Mock | TourAPI, Google Places API, OpenAI 호출 | 실제 외부 API 비용/불안정성 없이 검증 |

특히 **사진 curate/finalize의 임시 버퍼 폐기**와 **WebSocket 낙관적 잠금 충돌 처리**는 사용자가 손으로 검증하기 어려운 로직이므로, Phase 11·10에서 Service 단위 테스트를 반드시 함께 작성합니다.

---

## 14. 배포 전략

- **Docker**: Multi-stage 빌드(Node 빌드 스테이지 → 실행 스테이지)로 이미지 크기 최소화. 환경변수(DB 접속정보, JWT 시크릿, OpenAI Key, Firebase 서비스 계정 키)는 이미지에 포함하지 않고 실행 시 주입
- **Supabase**: PostgreSQL 서버리스만 사용(Auth/Realtime/Storage는 사용하지 않음 — 인증은 자체 JWT, Storage는 Firebase Storage로 구현)
- **로컬 임시 버퍼 전제**: 사진 파이프라인의 임시 버퍼가 "로컬 서버 디스크"를 전제로 하므로(§11.2) **단일 서버 배포**를 가정합니다. 다중 서버로 수평 확장할 경우 공유 스토리지 방식으로 재검토가 필요합니다(§16 열린 질문).
- **환경 분리**: `.env.local`/`.env.production` 또는 NestJS `ConfigModule` 프로필로 분리, 민감 정보는 배포 플랫폼의 Secret 관리 기능 사용
- **배포 플랫폼**: 미확정(§16 열린 질문) — Phase 14 착수 전 팀 확정 필요

---

## 15. 우선순위 및 스코프 조절 기준

| 구분 | 항목 | 시간 부족 시 대응 |
|---|---|---|
| 필수 | 소셜 로그인(Phase 4), AI 여행 계획(Phase 6~9), AI 사진 선별(Phase 11), 여행 기록 관리(Phase 12) | 축소 불가, 반드시 확보 |
| 선택 | 공동 편집 실시간 동기화(Phase 10의 WebSocket 부분) | REST(초대·멤버 관리)만 필수로 유지, WS는 안 되면 "새로고침하면 반영"으로 확정 |
| 드랍 후보 | AI 글쓰기 템플릿(`GET .../writing-template`) | Phase 12까지 여유가 있을 때만 추가 |
| 선택 | 로그인 실패 UX 디테일(에러코드별 안내) | Phase 14에 여유 있으면 추가 |

---

## 16. 리스크 및 열린 질문 (Open Questions)

| 구분 | 항목 | 대응/확인 필요 사항 |
|---|---|---|
| 리스크 | 온디바이스 얼굴 감지/OCR이 Flutter에서 난이도 높음(Phase 11) | 가장 먼저 착수. 늦어지면 "필터 없이 최근 N장" 폴백으로 나머지 파이프라인부터 검증, 최후 수단으로만 서버 사이드 처리 검토 |
| 리스크 | 애플 로그인 인증서/심사 이슈(Phase 4) | Phase 4 완료 시점에 미리 상태 확인 |
| 리스크 | OpenAI 사진 배치 프롬프트 튜닝 시간 부족(Phase 11) | 실제 사진 데이터로 프롬프트 실험을 파이프라인 구현과 병행 |
| 리스크 | AI 스케줄 생성 응답 지연(동기 처리, Phase 8) | 체감 지연 측정 후 심하면 로딩 UX만 보강(비동기 전환은 1차 범위 밖) |
| 리스크 | Firebase Storage/Supabase DB 요금·쿼터 | 무료 티어 한도 확인, 테스트 데이터 정리 주기적 수행 |
| **TODO** | **Firebase Storage 보안 규칙이 임시로 열려 있음(§11.1)** — 현재 `profile-images/**` 경로가 인증 없이 `allow read, write: if true`로 되어 있어 다른 사용자의 프로필 이미지 경로에도 덮어쓰기가 가능한 상태 | 백엔드가 서명된 업로드 URL(Firebase Admin SDK로 발급)을 내려주는 방식으로 전환해 `userId` 소유자만 자기 경로에 쓸 수 있도록 강화. Phase 11(Firebase Storage를 record-photos에도 본격 사용하는 시점) 전까지는 반드시 정리 |
| 해결됨(Phase 7) | ~~TourAPI 장소와 Kakao 로컬 API 리뷰/평점 매칭 로직~~ | Kakao 로컬 API는 평점/리뷰수를 아예 제공하지 않아(카카오 공식 정책) 매칭 로직 문제가 아니었음. Google Places API (New)로 데이터 소스 자체를 교체해 해결(Phase 7 §7 참고) |
| 열린 질문 | 해외 여행 후보 추천 미지원 | TourAPI/Google Places 조합은 국내 여행만 지원(Phase 7에서 팀이 범위를 국내로 한정하기로 결정). `design.md`·기능명세서의 해외 도시 예시(오사카 등)를 실제로 지원하려면 별도 데이터 소스 검토 필요 — 일정 여유 있을 때 팀 논의 |
| 열린 질문 | "로컬 임시 디스크" 전제가 실제 배포 환경과 맞는지(§14) | 인프라 확정 후 재검토, 다중 서버 확장 시 공유 스토리지 전환 검토 |
| 열린 질문 | 배포 플랫폼 미확정(§14) | Phase 14 착수 전 팀 확정 필요 |

---

## 17. 부록 — Phase ↔ 일정(Day) 매핑

README 개발 일정(Day 1~7, **Day 4는 휴식일**)과 대조한 참고용 매핑입니다. 실제 진행 중 Phase가 밀리면 이 매핑보다 §5의 의존 순서를 우선합니다.

| Day | 목표 Phase |
|---|---|
| Day 3 (2026-07-11) | Phase 1~4 (초기 세팅 ~ 로그인 E2E) |
| Day 4 (2026-07-12) | 휴식일 |
| Day 5 (2026-07-13) | Phase 5~9 (User ~ 스케줄 편집/재수정) |
| Day 6 (2026-07-14) | Phase 10~11 (공동편집 ~ 사진 파이프라인) |
| Day 7 (2026-07-15) | Phase 12~14 (기록 관리 ~ 통합/배포 준비) |

---

## 18. 다음 단계

이 계획이 팀 내에서 확인되면 **Phase 1(프로젝트 초기 설정)**부터 순서대로 구현을 시작합니다. Phase 진행 중 §16의 열린 질문 중 해당 Phase에 영향을 주는 항목이 있다면, 그 부분만 먼저 확인한 뒤 진행합니다.
