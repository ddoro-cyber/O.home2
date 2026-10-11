'use client';
// 설치 화면에서 복사해 쓰는 Firebase 보안 규칙 — 원본: firebase/firestore.rules · firebase/storage.rules
// (원본을 고치면 이 파일도 함께 갱신)

export const FIRESTORE_RULES = `rules_version = '2';

// ============================================================
// O.HOME Firestore 보안 규칙 (v2.1 — 자관(홈) 분리판)
// Firebase 콘솔 → Firestore Database → 규칙 에 붙여넣고 [게시].
//
// 문서 구조
//   meta/owner                      { uid, admins[] }   ← 첫 계정이 1회만 자기를 총관리자로 등록
//   profiles/{uid}                  { nickname, avatarUrl, avatarColor, homeId, joinCode }
//   homes/{homeId}                  { name, inviteCode, createdAt }
//   homes/{homeId}/settings/{key}   { value }           ← 홈마다 테마·메뉴·폰트·메인 위젯
//   homes/{homeId}/<콘텐츠>/{id}     { data, authorId, visibility, sort }
//
// 누가 무엇을 보나
//   · 비로그인: 아무것도 못 읽는다 (홈은 전부 로그인 뒤에만)
//   · 회원: 프로필의 homeId 홈 하나만. 가입코드가 그 홈을 정하고, 바꿀 수 없다
//   · 총관리자(meta/owner): 모든 홈
// ============================================================

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function ownerData() {
      return get(/databases/$(database)/documents/meta/owner).data;
    }

    function isAdmin() {
      return signedIn()
        && exists(/databases/$(database)/documents/meta/owner)
        && (ownerData().uid == request.auth.uid
            || (ownerData().keys().hasAny(['admins']) && request.auth.uid in ownerData().admins));
    }

    function hasProfile() {
      return signedIn() && exists(/databases/$(database)/documents/profiles/$(request.auth.uid));
    }

    function myProfile() {
      return get(/databases/$(database)/documents/profiles/$(request.auth.uid)).data;
    }

    // 이 홈의 회원인가 — 총관리자는 모든 홈
    function inHome(homeId) {
      return isAdmin()
        || (hasProfile() && myProfile().keys().hasAny(['homeId']) && myProfile().homeId == homeId);
    }

    // 콘텐츠 컬렉션 목록 — 여기 없는 이름은 아무 권한도 없다
    function isContent(name) {
      return name in [
        'posts', 'guestbook', 'characters', 'relations', 'gallery', 'roadview',
        'trpg_logs', 'trpg_log_bodies', 'trpg_chars', 'dotori', 'playlog', 'rp_rooms', 'threads',
        'diary', 'memos', 'commissions', 'applicants', 'moods', 'comments', 'qa_answers', 'rp_messages',
        'notifications', 'thread_posts', 'videos', 'rp_typing'
      ];
    }

    // ── 총관리자 지정 — 아직 없을 때 딱 한 번 ──────────────────────
    match /meta/owner {
      allow read: if true;
      allow create: if signedIn() && !exists(/databases/$(database)/documents/meta/owner);
      allow update, delete: if isAdmin();
    }

    // ── 회원 프로필 ─────────────────────────────────────────────
    //  · 만들기: 본인. homeId를 적으려면 그 홈의 가입코드(joinCode)가 맞아야 한다 —
    //    코드 없이 만드는 프로필은 홈이 없는 계정(총관리자 설치용)이라 아무 홈도 못 본다
    //  · 고치기: 본인은 homeId를 바꿀 수 없다 (닉네임·아바타만). 총관리자는 전부
    match /profiles/{uid} {
      //  · 읽기: 총관리자 전부 · 본인 · 같은 홈의 회원 (v2.1.1 — 프로필 없는 계정이 남의 홈 회원을 훑지 못하게)
      allow read: if isAdmin()
        || (signedIn() && request.auth.uid == uid)
        || (hasProfile() && myProfile().keys().hasAny(['homeId'])
            && resource.data.keys().hasAny(['homeId']) && resource.data.homeId == myProfile().homeId);
      allow create: if isAdmin() || (signedIn() && request.auth.uid == uid && (
        !request.resource.data.keys().hasAny(['homeId'])
        || (exists(/databases/$(database)/documents/homes/$(request.resource.data.homeId))
            && request.resource.data.keys().hasAny(['joinCode'])
            && get(/databases/$(database)/documents/homes/$(request.resource.data.homeId)).data.inviteCode
               == request.resource.data.joinCode)
      ));
      allow update: if isAdmin() || (signedIn() && request.auth.uid == uid
        && request.resource.data.get('homeId', null) == resource.data.get('homeId', null));
      allow delete: if isAdmin();
    }

    // ── 설치 화면의 연결 확인용 (최상위 settings — 홈 설정은 아래 homes/ 안에 있다) ──
    match /settings/{key} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // ── 가입코드 → 홈 (v2.1.1) ──────────────────────────────────
    //  invites/{코드} { homeId }. 가입하는 계정은 **정확한 코드로 한 건(get)만** 읽을 수 있고,
    //  목록 조회(list)는 막혀 있어 코드를 모르면 캐낼 수 없다. 쓰기는 총관리자(자관 만들기·코드 바꾸기)
    match /invites/{code} {
      allow get: if signedIn();
      allow list: if false;
      allow write: if isAdmin();
    }

    // ── 홈(자관) ───────────────────────────────────────────────
    //  읽기: 총관리자 전부 · 회원은 자기 홈 (v2.1.1 — 「프로필 없는 새 계정」에게 열어 두던 것을 닫았다:
    //  계정만 만들면 모든 자관의 가입코드를 볼 수 있었다. 가입 때의 코드 조회는 아래 invites로)
    match /homes/{homeId} {
      allow read: if isAdmin() || inHome(homeId);
      allow create, update, delete: if isAdmin();

      // 홈 설정 (읽기 홈 회원 · 쓰기 총관리자)
      match /settings/{key} {
        allow read: if inHome(homeId);
        allow write: if isAdmin();
      }

      // 홈 콘텐츠
      match /{coll}/{docId} {
        // 읽기: 홈 회원이면서 — 전체공개 / 멤버공개 / 내가 쓴 것 / 총관리자
        allow read: if isContent(coll) && inHome(homeId) && (
          resource.data.visibility == 'public'
          || resource.data.visibility == 'member'
          || resource.data.authorId == request.auth.uid
          || isAdmin()
        );

        // 쓰기: 홈 회원
        allow create: if isContent(coll) && inHome(homeId);

        // 수정·삭제: 작성자 본인 · 편집 권한을 받은 회원(editorIds) · 총관리자
        allow update, delete: if isContent(coll) && inHome(homeId)
          && (resource.data.authorId == request.auth.uid
              || isAdmin()
              || (resource.data.keys().hasAny(['editorIds'])
                  && request.auth.uid in resource.data.editorIds));
      }
    }
  }
}
`;

export const STORAGE_RULES = `rules_version = '2';

// ============================================================
// O.HOME Storage 보안 규칙 (이미지·파일)
// Firebase 콘솔 → Storage → 규칙 에 붙여넣고 [게시].
//   · 읽기는 공개 (그림 주소를 아는 사람은 볼 수 있다 — 주소는 홈 안에서만 노출된다)
//   · 올리기·지우기는 로그인 회원만
//   · 한 번에 20MB 초과 업로드 차단
// ============================================================

service firebase.storage {
  match /b/{bucket}/o {
    match /ohome/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.resource.size < 20 * 1024 * 1024;
      allow delete: if request.auth != null;
    }
  }
}
`;
