## **🌏 Promotional Poster**

---

![TripAndEnd](./TripAndEnd.png)

                  여행의 시작부터 끝까지,  
        계획은 AI가 가볍게, 기록은 추억답게 남기겠습니다.

---

## 🌏 Who Made This!!!!

### 👩🏻‍💻 **이예원**

🏫 숙명여대

**💻 Full-Stack / Front-End / UI·UX**

https://github.com/ywlee1127

### 👩🏻‍💻 **이지민**

🏫 KAIST

**💻 Back-End / AI / Database**

https://github.com/ljm030206

---

## 🌏 서비스 개요

**trip and end**는 여행 전 계획 수립과 여행 후 기록 정리를 AI로 돕는 **모바일 기반 여행 계획 및 기록 앱**이다.

사용자는 여행 도시와 날짜를 입력해 AI가 생성한 여행 일정 초안을 받고, 장소 추가·삭제·순서 변경 또는 프롬프트 기반 재수정을 통해 자신만의 여행 계획을 완성할 수 있다.

여행이 끝난 뒤에는 앱이 여행 기간 동안 촬영된 사진을 분석하고, 온디바이스 필터링과 AI 선별 과정을 통해 기록에 어울리는 베스트 사진을 추천한다. 사용자는 추천 사진을 바탕으로 여행 기록을 작성하고, 나중에 다시 조회·수정·관리할 수 있다.

trip and end는 여행의 **시작(plan)**과 **끝(record)**을 모두 책임지는 AI 여행 동반자를 목표로 한다.

## 🌏 기획 배경

여행은 즐겁지만, 여행을 준비하고 정리하는 과정은 생각보다 많은 에너지를 요구한다.

여행 전에는 어떤 도시를 갈지, 어떤 장소를 어떤 순서로 방문할지, 맛집과 관광지를 어떻게 조합할지 고민해야 한다. 특히 친구와 함께 떠나는 여행이라면 일정 조율과 장소 선택 과정이 더 복잡해진다.

여행 후에는 더 큰 문제가 남는다. 수백 장의 사진 중 좋은 사진을 고르고, 날짜별로 정리하고, 기억이 흐려지기 전에 기록으로 남기는 일은 번거롭다. 결국 많은 여행 사진은 갤러리 속에만 남고, 여행의 감정과 이야기는 제대로 기록되지 못한다.

이에 trip and end는 AI를 활용해 여행 계획의 부담을 줄이고, 여행 후 기록의 진입 장벽을 낮추는 서비스를 제안한다.

## 🌏 문제 정의

**여행 계획 수립의 높은 피로도**  
여행자는 관광지, 맛집, 이동 동선, 날짜별 일정 등을 직접 검색하고 비교해야 하며, 계획을 세우는 데 많은 시간과 노력을 소비한다.

**동행자와의 일정 조율 어려움**  
함께 떠나는 여행에서는 각자의 선호와 의견을 반영해야 하지만, 이를 하나의 일정으로 정리하고 공유하는 과정이 번거롭다.

**여행 후 사진 정리와 기록의 부담**  
여행이 끝난 뒤 수많은 사진 중 의미 있는 장면을 고르고 글로 정리하는 과정이 귀찮아, 기록 작성이 쉽게 미뤄진다.

**개인정보가 포함된 사진 처리의 민감성**  
여행 사진에는 얼굴, 위치, 문서, 카드 등 민감한 정보가 포함될 수 있어 AI 활용 시 안전한 처리 구조가 필요하다.

## 🌏 유저 페르소나

---

![persona-1](./docs/images/persona-1.png)

![persona-2](./docs/images/persona-2.png)

## 🌏 Recommended For

- **✈️ 여행 계획은 좋아하지만 검색은 귀찮은 사람**
  - 도시와 날짜만 입력하면 AI가 관광지·맛집·카페를 포함한 일정 초안을 만들어주길 원하는 사용자
- **👥 친구들과 함께 여행 일정을 짜는 사람**
  - 초대 링크로 여행 계획을 공유하고, 함께 일정을 수정하며 협업하고 싶은 사용자
- **📸 여행 후 사진 정리가 막막한 사람**
  - 수백 장의 사진 중 기록에 남길 만한 베스트샷을 빠르게 고르고 싶은 사용자
- **📝 여행 기록을 예쁘게 남기고 싶은 사람**
  - 사진과 글을 함께 정리해 여행의 감정과 순간을 오래 보관하고 싶은 사용자
- **🤖 AI를 실용적으로 써보고 싶은 사람**
  - 단순 챗봇이 아니라 여행 계획 생성, 일정 수정, 사진 선별에 AI를 활용해보고 싶은 사용자

## 🌏 기능 소개

**여행의 시작과 끝을 AI로 연결하는 모바일 여행 메이트**

### **🤖 1. AI 여행 계획 생성**

- **도시·날짜 기반 일정 생성**: 사용자가 여행 도시와 날짜를 입력하면 AI가 여행 일정 초안을 생성한다.
- **장소 추천 포함**: 관광지, 맛집, 카페 등 여행에 필요한 장소를 일정 안에 함께 구성한다.
- **동선 중심 일정 구성**: 날짜별 방문 장소와 이동 흐름을 고려한 여행 계획을 제공한다.

### **💬 2. 프롬프트 기반 일정 수정**

- **AI에게 다시 요청하기**: “카페를 더 넣어줘”, “빡빡하지 않게 바꿔줘”처럼 자연어로 일정을 수정할 수 있다.
- **직접 편집 지원**: 사용자는 장소 추가, 삭제, 순서 변경을 통해 AI가 만든 일정을 자유롭게 다듬을 수 있다.
- **AI 요청 이력 관리**: 백엔드에서 AI 일정 생성 요청을 관리하여 일정 생성 흐름을 안정적으로 처리한다.

### **🗺️ 3. 장소 탐색 및 지도 기반 일정 관리**

- **장소 검색**: 여행지 주변의 장소 후보를 검색하고 일정에 추가할 수 있다.
- **지도 마커 UI**: Google Maps 기반으로 일정 장소를 지도 위에서 확인할 수 있다.
- **장소 상세 패널**: 선택한 장소의 상세 정보와 일정 반영 여부를 확인할 수 있다.

### **🤝 4. 공동 여행 계획**

- **초대 링크 생성**: 여행 계획별 초대 링크를 생성해 친구를 초대할 수 있다.
- **딥링크 참여**: 초대 링크를 통해 앱으로 진입하고 해당 여행에 참여할 수 있다.
- **실시간 동기화 구조**: Socket.IO 기반 협업 구조를 통해 공동 일정 편집을 지원한다.

### **📸 5. AI 기반 여행 사진 선별**

- **온디바이스 1차 필터링**: 흐림, 노출, 중복 사진 등을 먼저 기기에서 필터링한다.
- **민감 정보 감지**: OCR, 얼굴 감지, 바코드 감지 등을 통해 문서성 사진이나 개인정보 위험이 있는 사진을 선별한다.
- **EXIF 기반 여행 사진 추출**: 촬영일시와 위치 정보를 활용해 여행 기간 내 사진을 후보로 추린다.
- **AI 베스트샷 추천**: 1차 필터링을 통과한 사진을 AI가 분석해 최대 15장의 추천 사진을 제공한다.

### **📝 6. 여행 기록 작성 및 관리**

- **추천 사진 기반 기록 작성**: AI가 추천한 사진 중 사용자가 최종 선택한 사진으로 여행 기록을 작성한다.
- **수동 사진 선택 지원**: AI 추천을 사용하지 않고 직접 사진을 선택해 기록을 만들 수도 있다.
- **기록 목록 조회**: 작성한 여행 기록을 목록으로 확인할 수 있다.
- **기록 상세·수정·삭제**: 여행 기록 상세 확인, 내용 수정, 삭제를 지원한다.

### **🔐 7. 소셜 로그인 및 사용자 관리**

- **카카오 로그인**: Kakao SDK 기반 간편 로그인을 지원한다.
- **구글 로그인**: Google Sign-In 및 Firebase 연동 로그인을 지원한다.
- **보안 토큰 저장**: Flutter Secure Storage를 활용해 액세스/리프레시 토큰을 안전하게 저장한다.
- **프로필 관리**: 닉네임 설정, 프로필 이미지 업로드, 사용자 정보 조회를 지원한다.

### **🔔 8. 알림 시스템**

- **푸시 알림 연동**: Firebase Messaging 기반으로 사용자 기기 알림을 처리한다.
- **알림함 제공**: 앱 내 알림 목록에서 여행 관련 알림을 확인할 수 있다.
- **여행 기록 유도**: 여행 종료 후 기록 작성을 유도하는 알림 흐름을 지원한다.

### **🛠 9. 기술적 특징**

- **Cross-Platform**: Flutter 기반 단일 코드베이스로 모바일 앱을 구현한다.
- **LLM Wrapper**: AI API를 활용해 여행 일정 생성·수정과 사진 선별 기능을 제공한다.
- **Privacy-Aware Photo Pipeline**: 온디바이스 필터링, EXIF 제거, 임시 버퍼, 최종 선택 사진만 저장하는 구조로 개인정보 부담을 줄인다.
- **Backend API Architecture**: NestJS 기반 모듈형 서버 구조로 인증, 여행, 일정, 장소, 기록, 알림 기능을 분리한다.

## 🌏 데이터베이스 스키마 다이어그램

![DB Schema](./TripAndEnd.png)

주요 엔티티:

- `users`
- `social_accounts`
- `refresh_tokens`
- `trips`
- `trip_members`
- `trip_invite_links`
- `places`
- `trip_places`
- `ai_plan_requests`
- `travel_records`
- `record_photos`
- `record_day_entries`
- `notification_logs`
- `user_devices`

## 🌏 Tech Stack

**Frontend**

---

- Flutter
- Dart
- Riverpod
- Dio
- Flutter Secure Storage
- Kakao Flutter SDK
- Google Sign-In
- Firebase Core / Messaging / Storage
- Google Maps Flutter
- Photo Manager
- Google ML Kit
- Socket.IO Client

**Backend**

---

- NestJS
- TypeScript
- TypeORM
- Passport JWT
- Socket.IO
- Firebase Admin
- Sharp
- OpenAI API 연동 구조

**DB / Infra**

---

- PostgreSQL
- Firebase
- REST API
- WebSocket Gateway
- Secure Storage
- External AI API

## 🌏 Architecture

```text
[Flutter App]
   │
   ├─ Social Login
   ├─ Trip / Schedule UI
   ├─ Place Search / Map
   ├─ Photo Filtering Pipeline
   └─ Record Management
        │
        ▼
[NestJS Backend]
   │
   ├─ Auth Module
   ├─ Users Module
   ├─ Trips Module
   ├─ Schedule Module
   ├─ Places Module
   ├─ Records Module
   ├─ Notifications Module
   └─ Collaboration Gateway
        │
        ▼
[Database / Storage / External APIs]
   │
   ├─ PostgreSQL
   ├─ Firebase
   ├─ Google Maps
   └─ AI API
```

## 🌏 실행 방법

### Backend

```bash
cp .env.example .env
npm install
npm run start:dev
```

### Frontend

```bash
cd frontend
flutter pub get
flutter run
```

## 🌏 Github Link

GitHub - ljm030206 / trip_and_end

## 🌏 Thank You

여행은 시작도 중요하지만, 끝까지 남기는 것도 중요하니까.  
**trip and end**가 계획부터 기록까지 함께합니다.
