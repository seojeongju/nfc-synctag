# Gold SyncTag 세션 정책

## 관리자

- 이메일·비밀번호 로그인 후 `admin_token` + **12시간 만료** 메타 저장
- 만료 시 자동 로그아웃, `/admin` 접근 시 `/login`으로 이동

## 소비자 — 3단계

| 단계 | 조건 | 가능 기능 |
|------|------|-----------|
| 공개 | 없음 | 홈, 전체 상품 목록 |
| 태그 증명 | `/t/:uid` 또는 NFC 스캔 (`sessionStorage` + 선택적 7일 기기 신뢰) | 해당 태그 정품 정보 확인, 게스트 1건 프리뷰 |
| 계정 지갑 | 로그인 + `POST /api/user/wallet/link-tag` | 내 지갑, 전자앨범, 소유권 해지 요청 |

- URL만으로 홈 접속 시 지갑·앨범 불가
- 로그인만으로 지갑 불가 — **태그 스캔으로 계정에 연결** 필요
- 연결된 지갑은 서버(`user_tag_links`, `user_goldbars`)에 저장되어 기기·탭을 바꿔도 조회 가능

## API

- `GET /api/user/wallet?userId=`
- `POST /api/user/wallet/link-tag` — `{ userId, tagUid }`
