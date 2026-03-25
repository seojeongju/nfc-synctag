# WowTag 로컬 실행 및 GitHub 연동 가이드

이 문서는 개발된 WowTag 프로젝트를 로컬 환경에서 실행하고 GitHub에 연결하는 방법을 설명합니다.

## 1. 프로젝트 구조
- `apps/backend`: Cloudflare Workers 기반 API 서버
- `apps/frontend-user`: 사용자용 모바일 웹 (NFC 랜딩)
- `apps/frontend-admin`: 관리자용 모바일/PC 대시보드

---

## 2. 로컬 실행 방법

### A. 백엔드 (API 서버) 실행
1. 터미널에서 `apps/backend` 폴더로 이동합니다.
2. 의존성을 설치합니다: `npm install`
3. 로컬 서버를 실행합니다: `npx wrangler dev`
   - 기본적으로 `http://localhost:8787`에서 실행됩니다.

### B. 프론트엔드 (사용자/관리자 앱) 실행
1. 각 앱 폴더(`apps/frontend-user` 또는 `apps/frontend-admin`)로 이동합니다.
2. 의존성을 설치합니다: `npm install`
3. 개발 서버를 실행합니다: `npm run dev`
   - 사용자 앱: `http://localhost:5173` (기본값)
   - 관리자 앱: 다른 포트에서 실행되거나 포트 충돌 시 자동 조정됩니다.

---

## 3. GitHub 연동 방법

이미 로컬 저장소 초기화(`git init`)와 첫 커밋이 완료된 상태입니다. 아래 명령어를 통해 본인의 GitHub 저장소에 연결하세요.

1. GitHub에서 새로운 public/private 리포지토리를 생성합니다.
2. 터미널(루트 폴더)에서 다음 명령어를 입력합니다:
   ```bash
   # 원격 저장소 주소 연결 (본인의 리포지토리 주소로 변경)
   git remote add origin https://github.com/사용자이름/wowtag.git

   # 브랜치 이름을 main으로 변경
   git branch -M main

   # GitHub으로 코드 푸시
   git push -u origin main
   ```

---

## 4. Cloudflare 배포 (추후 진행)
로컬 확인이 완료된 후, 다음 명령어를 통해 실제 클라우드에 배포할 수 있습니다.
- 백엔드: `npx wrangler deploy` (apps/backend 폴더 내)
- 프론트엔드: Cloudflare Pages 대시보드에서 `apps/frontend-user`, `apps/frontend-admin` 폴더를 각각 연결.

---

추가로 궁금하신 점이나 실행 중 오류가 발생하면 말씀해 주세요!
