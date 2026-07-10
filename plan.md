# trip and end — 개발 계획 (Plan)

> 기준 문서: `AI_기반_여행_계획_및_기록_앱_기능명세서_2026-07-10_v2.md`, `trip_and_end_erd.dbml`, `API_명세서_2026-07-10_v1.md`
> 팀: 이예원(FullStack, Flutter 중심) / 이지민(BackEnd, NestJS)
> 스택: **Flutter(앱) + NestJS(백엔드) + Supabase(Postgres DB + Storage)**
> 일정: README 개발 일정(Day 1~7)과 동기화. Day 1~2는 완료(주제 확정, 기능명세서/ERD/API 명세서 작성), **Day 4(2026-07-12)는 휴식일**이라 실제 작업일은 **Day 3, 5, 6, 7 총 4일**이다. 원래 5일 분량을 4일로 압축하므로, 각 날짜를 의존성 순서에 따른 Phase 단위로 나눠 "무엇을 먼저 끝내야 다음이 풀리는지"를 명시한다.

---

## 0. 스택 확정에 따른 구체화 항목

| 항목 | 결정 |
|---|---|
| 백엔드 프레임워크 | NestJS (모듈: `auth`, `users`, `trips`, `places`, `schedule`, `collaboration`(WS), `records`, `notifications`, `common`) |
| DB | Supabase Postgres — `trip_and_end_erd.dbml`을 그대로 마이그레이션 |
| ORM | TypeORM (NestJS 공식 통합, 팀 확정 필요 시 Prisma로 대체 가능) |
| 인증 | Supabase Auth는 사용하지 않고 **자체 JWT 발급**(NestJS Passport-JWT). 소셜 로그인 검증은 백엔드가 직접 처리 (API 명세서 §1) |
| Storage | Supabase Storage — `record-photos` 버킷(영구, 최종 선택 사진만) / 임시 버퍼는 **로컬 서버 디스크**(§6 보안 원칙과 동일, Supabase Storage 미사용) |
| 실시간 통신 | NestJS `@nestjs/websockets` + Socket.IO adapter |
| 외부 API | OpenAI(`openai` SDK), TourAPI(REST), Kakao 로컬 API(리뷰/평점) |

---

## 1. Day별 실행 계획 (Phase 단위)

> 표기 규칙: 각 Phase는 순서대로 진행하되, "BE"와 "FE"가 같은 번호로 나란히 있으면 병렬 가능. FE가 BE 완료를 기다려야 하는 지점은 **"⛓ 의존"**으로 표시. 사람 이름 대신 역할(BE=이지민, FE=이예원)로 표기.

### Day 3 (2026-07-11, 작업일 1/4) — 기반 세팅 & 로그인 E2E까지 끝내기

이 날의 목표는 딱 하나: **로그인이 실기기에서 끝까지 동작하는 것.** 이후 모든 API가 JWT 인증을 전제로 하므로, 여기서 막히면 Day 5부터 전부 밀린다.

**Phase 1 (오전, 병렬)**
- BE: NestJS 프로젝트 초기화, 모듈 스캐폴딩(`auth`, `users`, `trips`, `places`, `schedule`, `records`, `common`), Supabase 프로젝트 생성
- FE: Flutter 프로젝트 초기화, 폴더 구조(feature-first)·상태관리(Riverpod 권장) 결정, 디자인 토큰(메인 컬러 `#CBFCE7`) 정리

**Phase 2 (낮, BE 선행 → FE는 그 사이 독립 작업)**
- BE: ERD(dbml) → Supabase SQL 마이그레이션 **한 번에 전체 테이블** 생성 (`users`, `social_accounts`, `user_devices`, `trips`, `trip_members`, `trip_invite_links`, `places`, `trip_places`, `ai_plan_requests`, `travel_records`, `record_photos`, `notification_logs`) → TypeORM entity 매핑, `.env` 구성(**키 값 커밋 금지, `.env.example`만 커밋**)
- FE: (BE 마이그레이션 기다리는 동안 병렬) 카카오/구글/애플 로그인 SDK 연동, 로그인 화면 UI — 아직 실 API 없이 SDK 콜백까지만

**Phase 3 (오후, ⛓ 순서 중요)**
- BE: ① JWT 발급/검증 공통 모듈(Passport-JWT strategy, AuthGuard) → ② 이걸 기반으로 소셜 로그인 3종 검증 로직 → ③ `POST /auth/{provider}/login`, `/auth/token/refresh`, `/auth/logout` 완성 (①→②→③ 순서 필수, 거꾸로 하면 다시 만들어야 함)
- FE: `flutter_secure_storage` + Dio 인터셉터(JWT 자동 첨부/갱신) 골격 구성 — BE Phase 3 결과 나오는 대로 바로 붙일 수 있게 미리 준비

**Phase 4 (저녁, ⛓ 통합 체크포인트 — Day 3 내 반드시 완료)**
- 공통: BE `/auth/*` 완성 → FE가 실제 소셜 로그인 3종 붙여서 실기기/에뮬레이터 E2E 테스트. 여기서 로그인 실패하면 다음 날로 넘기지 말고 그날 안에 해결
- 공통: API 명세서 기준 요청/응답 필드명 재확인, Apple Developer 인증서 상태만 미리 확인(설정은 Day 5로 미뤄도 됨 — 심사 문제 조기 발견이 목적)

---

### Day 4 (2026-07-12) — 휴식일 (작업 없음)

---

### Day 5 (2026-07-13, 작업일 2/4) — 여행 계획 핵심 플로우 (필수 기능의 절반)

이 날이 전체 계획에서 **가장 중요**하다. "도시 입력 → 후보 → 선택 → AI 스케줄"이 안 되면 시연 자체가 안 되므로 다른 모든 것보다 우선.

**Phase 1 (오전, ⛓ BE가 순서대로 쌓아 올라감)**
1. BE: `POST/GET/PATCH/DELETE /trips` — `trip_members` owner 자동 등록까지. **가장 먼저** 만들어야 하는 이유: 이후 모든 여행 관련 API가 `tripId`를 전제로 함
2. BE: TourAPI 연동 모듈 + `places` 캐싱
- FE: (BE 1~2 진행되는 동안 병렬) 여행 생성 화면(도시 검색+날짜), 후보 리스트/지도 화면을 **목데이터로 먼저 UI 구현** — 나중에 API만 갈아끼우면 되게

**Phase 2 (낮, ⛓)**
3. BE: Kakao 로컬 API 리뷰수/평점 병합 정렬 → `GET /trips/{id}/places/candidates` 완성
- FE: BE 3 완료되는 대로 후보 화면 실 데이터 연동(인기순 리스트 + 카테고리별 지도 마커)

**Phase 3 (오후, ⛓ 이 프로젝트에서 제일 까다로운 AI 연동)**
4. BE: OpenAI 클라이언트 세팅 → `POST /trips/{id}/schedule/generate`(동기) — 프롬프트 설계에 시간이 걸릴 수 있으므로 최소 결과물(오류 없이 스케줄 형태로 반환)부터 확보하고 품질은 나중에 튜닝
- FE: "선택 완료 → 생성 중" 로딩 화면 먼저 구현 → BE 4 완료되면 실제 결과 화면(일자별 리스트) 연동

**Phase 4 (저녁)**
5. BE: `GET /trips/{id}/schedule`, 수동 편집 API(`add/patch/delete/reorder`), `POST /schedule/revise`(프롬프트 재수정) + `ai_plan_requests` 기록
- FE: 편집 화면(드래그앤드롭 순서변경), 프롬프트 재수정 입력 UI 연동

**체크포인트**: 로그인 → 여행 생성 → 후보 선택 → AI 스케줄 생성 → 수동 편집까지 하루 안에 실기기 E2E 확인. **여기까지가 필수 기능 절반**, 안 되면 Day 6 계획(공동편집/사진)을 축소해서라도 이걸 마무리해야 함.

---

### Day 6 (2026-07-14, 작업일 3/4) — 두 트랙 병렬: 공동편집(BE 여유분) + 사진 파이프라인(핵심)

이 날은 **BE는 사진 파이프라인에 집중**하고, **FE는 온디바이스 필터링(가장 난이도 높은 항목)에 집중**한다. 공동편집(WebSocket)은 우선순위가 낮으므로 BE가 사진 파이프라인 사이 자투리 시간에 최소 기능만 넣는다.

**Phase 1 (오전)**
- BE: `POST /trips/{id}/invite-links`, `POST /trips/invite-links/{token}/join`, 멤버 관리 API — 비교적 단순하니 오전에 빨리 끝내고 오후엔 사진 파이프라인으로 이동
- FE: 공유 링크 UI(생성/공유 시트, 딥링크 참여) + **온디바이스 1차 필터링 패키지 조사 및 착수**(흔들림/노출/중복 제거, OCR 문서 감지, 얼굴 감지) — 조사에 시간이 걸릴 수 있으니 이 날 첫 작업으로 배치

**Phase 2 (낮~오후, ⛓ BE 사진 파이프라인은 반드시 이 순서)**
1. `POST /trips/{id}/records`(기록 세션 시작)
2. `.../photos/metadata`(텍스트 메타데이터 배치 등록)
3. `.../photos/upload`(로컬 임시 버퍼 저장 모듈 + TTL 삭제 크론) — 1→2→3 순서인 이유: metadata로 photoRefId를 먼저 발급해야 upload가 그 id에 파일을 매칭할 수 있음
4. `.../photos/curate`(일자별 그룹핑 → OpenAI 배치 → 비추천분 즉시 폐기)
5. `.../photos/candidates`(미리보기 서명 URL), `.../photos/finalize`(선택분만 Supabase Storage 영구 업로드 + `record_photos` insert)
- FE: 온디바이스 필터링 계속 진행 → 완성되는 대로 BE 1~3에 맞춰 업로드 화면 연동(필터링이 늦어지면 임시로 "필터 없이 최근 N장" 폴백으로 먼저 연동 테스트)

**Phase 3 (저녁, 선택 항목 처리)**
- BE: 시간이 남으면 NestJS WebSocket Gateway 최소 기능(JWT 인증 + `trip_members` 확인 + `schedule:op` 단순 브로드캐스트, 낙관적 잠금/충돌 처리는 생략) 추가. **안 되면 그대로 REST만으로 두고 "새로고침하면 반영"으로 축소** — 시연에서 치명적이지 않음
- FE: BE 4~5 완료되는 대로 사진 추천(15장 그리드) → 선택 화면 연동

**체크포인트**: 사진 업로드 → AI 추천 → 사용자 선택까지 최소 1회 실기기로 끝까지 돌려보기 (임시 버퍼 폐기 로직 포함해서 확인 — 여기서 안 지워지면 개인정보 요구사항 위반)

---

### Day 7 (2026-07-15, 작업일 4/4) — 기록 관리 마무리 + 전체 통합 + 시연 준비

**Phase 1 (오전)**
- BE: 여행 기록 CRUD(`PATCH /trips/{id}/records/{id}`, `GET/DELETE /records`, `/records/{id}`, 삭제 시 스토리지 hard delete), `PUT/DELETE /trips/{id}/cover`(대표사진, 소유권 검증 + 자동 해제), 여행 종료 배치(cron) + 푸시(`notification_logs`) — 시간 되면만
- FE: 기록 작성 화면(캡션+본문, draft→published), 기록 목록/상세/수정/삭제 화면, 대표사진 지정 UI

**Phase 2 (오후, 공통)**
- **전체 플로우 e2e 통합 테스트**: 로그인 → 여행 생성 → 후보 선택 → AI 스케줄 → (공유/편집) → 사진 선별 → 기록 작성까지 처음부터 끝까지 최소 1회 완주
- 통합 중 발견된 버그 즉시 수정 (새 기능 추가는 이 시점부터 중단)

**Phase 3 (저녁)**
- 보안 점검: OpenAI 전송 전 EXIF 완전 제거 검증, TLS 설정, `.env`/시크릿 노출 여부, 기록 비공개 원칙(작성자 본인만 접근) 재확인
- UI 폴리싱(로딩/에러/빈 상태 화면, 메인 컬러 `#CBFCE7` 일관성)

**Phase 4 (밤)**
- 시연 시나리오 리허설, README/발표 자료 정리

---

## 2. 우선순위 및 스코프 조절 기준

| 구분 | 항목 | 시간 부족 시 대응 |
|---|---|---|
| 필수 | 소셜 로그인, AI 여행 계획(후보→선택→스케줄), AI 사진 선별, 여행 기록 관리 | 축소 불가, Day 3·5·6 안에 반드시 확보 |
| 선택 | 공동 편집(WebSocket 실시간 동기화) | Day 6 Phase 3에서만 시도, 안 되면 REST "새로고침하면 반영"으로 확정 |
| 드랍 후보 | AI 글쓰기 템플릿 | Day 4가 휴식일로 빠지며 여유가 없어짐 — 기본 드랍, Day 7 Phase 1~2가 예정보다 빨리 끝나면만 추가 |
| 선택 | 로그인 실패 UX 디테일(에러코드별 안내) | Day 7 Phase 3에 여유 있으면 추가 |

---

## 3. 리스크 및 대응

| 리스크 | 대응 |
|---|---|
| 온디바이스 얼굴 감지/OCR이 Flutter에서 난이도 높음 | Day 6 Phase 1(오전) 최우선 착수. 늦어지면 "필터 없이 최근 N장" 폴백으로 먼저 연동해 나머지 파이프라인부터 확인, 최후 수단으로만 서버 사이드 처리 검토 |
| 애플 로그인 인증서/심사 이슈 | Day 3 Phase 4에 미리 확인 |
| OpenAI 사진 배치 프롬프트 튜닝 시간 부족 | Day 6 Phase 2 진행하며 실제 사진 데이터로 프롬프트 실험 병행 |
| AI 스케줄 생성 응답 지연(동기 처리) | Day 5 Phase 3에서 체감 지연 측정, 심하면 로딩 UX만 보강(비동기 전환은 범위 밖) |
| Day 4 휴식일로 전체 일정 20% 압축 | AI 글쓰기 템플릿 기본 드랍, 공동편집은 Day 6 Phase 3 자투리 시간에만 시도해 스코프 유동적으로 관리 |
| Supabase Storage/DB 요금·쿼터 | 무료 티어 한도 확인, 테스트 데이터 정리 주기적 수행 |

---

## 4. Definition of Done

| 기능 | 완료 조건 |
|---|---|
| 소셜 로그인 | 3개 제공자 모두 로그인 성공, JWT 발급/재발급/로그아웃 동작, 실패 시 에러 코드별 안내 |
| AI 여행 계획 | 후보 추천 → 선택 → 스케줄 생성까지 실제 API로 동작, 수동 편집·프롬프트 재수정 반영 |
| 공동 편집 | 초대 링크로 참여 가능은 필수. 실시간 반영은 되면 좋고(WebSocket), 안 되면 "새로고침하면 반영"도 허용 |
| AI 사진 선별 | 온디바이스 필터 → 업로드 → curate → finalize 전 구간 동작, 미선택 사진 서버 미보관 확인 |
| 기록 관리 | 목록/상세/수정/삭제, 대표사진 지정/자동 해제 동작 |
| 보안 | EXIF 스트립, TLS, 시크릿 미노출, 기록 비공개 원칙 확인 |
