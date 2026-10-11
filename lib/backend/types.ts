'use client';
// 백엔드 어댑터 (v2.0) — Supabase / Firebase 두 버전을 같은 인터페이스로 쓴다.
//
// 화면 코드는 이 파일의 타입만 알고, 어떤 서비스에 붙었는지는 모른다.
// 새 백엔드를 추가하려면 이 인터페이스만 구현하면 된다.

export type BackendKind = 'supabase' | 'firebase';

/** 설치 화면에서 입력받는 연결 정보 — 모두 공개돼도 되는 값이다(보안은 서버 규칙이 담당) */
export type BackendConfig =
  | { kind: 'supabase'; url: string; anonKey: string }
  | {
      kind: 'firebase';
      apiKey: string; authDomain: string; projectId: string;
      storageBucket: string; appId: string; messagingSenderId?: string;
      /** Firestore 데이터베이스 ID — 비우면 (default). 콘솔에서 다른 이름으로 만들었을 때만 필요 */
      databaseId?: string;
    };

/** 로그인 사용자 */
export interface BackendUser {
  id: string;
  nickname: string;
  role: 'admin' | 'member';
  email?: string;
  avatarUrl?: string;
  avatarColor?: string;
  /** 속한 홈(자관) — 가입코드로 정해진다. 총관리자는 없다 (v2.1) */
  homeId?: string;
}

/** 홈(자관) 한 칸 — homes/{id} (v2.1) */
export interface HomeRow {
  id: string;
  name: string;
  inviteCode: string;
  createdAt?: number;
}

/** 연결·규칙 점검 결과 (설치 화면의 [연결 확인]) */
export interface BackendCheck {
  ok: boolean;
  reachable: boolean;   // 프로젝트에 닿음
  schema: boolean;      // 테이블/규칙 준비됨
  hasAdmin: boolean;    // 관리자 계정 있음
  message: string;
}

export interface ListItem { id: string; [k: string]: unknown }

export interface Backend {
  kind: BackendKind;

  /* ---- 연결 점검 ---- */
  check(): Promise<BackendCheck>;

  /* ---- 인증 ---- */
  currentUser(): Promise<BackendUser | null>;
  onAuthChange(cb: (u: BackendUser | null) => void): () => void;
  signIn(id: string, password: string): Promise<{ ok: boolean; error?: string }>;
  /** 가입 — inviteCode가 있으면 그 코드의 홈에 속한 회원으로, 없으면 홈 없는 계정(총관리자 설치용) (v2.1) */
  signUp(id: string, password: string, nickname: string, inviteCode?: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<{ ok: boolean; error?: string }>;
  /** 내 정보 수정 — 닉네임·프로필 사진·색, 그리고 비밀번호(현재 비밀번호 확인 뒤 새 비밀번호).
   *  비밀번호 항목은 여태 타입에 없어 서버 모드에서 **조용히 무시되고 「변경되었습니다」만 떴다** (커플홈 사용자 제보 — "비밀번호가 변경이 안 된다") */
  updateProfile(patch: {
    nickname?: string; avatarUrl?: string | null; avatarColor?: string | null;
    currentPassword?: string; newPassword?: string;
  }): Promise<{ ok: boolean; error?: string }>;
  /** 첫 계정을 이 홈의 관리자로 등록 (관리자가 아직 없을 때만) */
  claimOwner(): Promise<{ ok: boolean; error?: string }>;
  /** 가입 회원 목록 — 역극 참여자 선택·회원 관리 화면용.
   *  avatarUrl도 내준다 (v2.0 사용자 제보) — 이미지 정리가 콘텐츠·설정만 훑던 시절, 프로필 사진은
   *  어디에도 참조가 안 잡혀 「아무도 안 쓰는 파일」로 지워졌다. */
  listMembers(): Promise<{ id: string; nickname: string; role: 'admin' | 'member'; email?: string; avatarUrl?: string; homeId?: string }[]>;

  /* ---- 홈(자관) (v2.1) ---- */
  /** 이후의 콘텐츠·설정 읽기/쓰기가 향할 홈 — 부팅 때 한 번 정한다. null = 홈 없음(리스트 화면) */
  setHome(homeId: string | null): void;
  /** 총관리자: 전체 / 회원: 자기 홈 하나 */
  listHomes(): Promise<HomeRow[]>;
  createHome(h: HomeRow): Promise<void>;
  updateHome(id: string, patch: Partial<Pick<HomeRow, 'name' | 'inviteCode'>>): Promise<void>;
  /** 홈 문서와 그 안의 설정·콘텐츠를 지운다 (회원 프로필·이미지 파일은 남는다) */
  deleteHome(id: string): Promise<void>;
  /** 회원을 홈에 연결/해제 — 총관리자 전용. 자관이 지워져 갈 곳을 잃은 회원을 다른 자관에 붙일 때 */
  setMemberHome(uid: string, homeId: string | null): Promise<void>;

  /* ---- 목록(콘텐츠) ---- */
  fetchList<T extends ListItem>(coll: string): Promise<T[]>;
  /** 문서 한 건 (커플홈 — RP LOG 본문처럼 큰 문서가 모인 컬렉션은 목록 통째로 받으면 느리다). 없거나 읽을 권한이 없으면 null */
  fetchOne<T extends ListItem>(coll: string, id: string): Promise<T | null>;
  syncList<T extends ListItem>(coll: string, prev: T[], next: T[], uid: string | null): Promise<void>;
  /** 이미 저장된 행의 공개범위만 다시 계산해 덮어쓴다 (v2.0) — 메뉴를 비공개로 바꾼 뒤
   *  「글에도 적용」을 누르면 돈다. 내용(data)·순서(sort)는 건드리지 않는다. */
  refreshVis<T extends ListItem>(coll: string, items: T[], uid: string | null): Promise<number>;
  subscribe(coll: string, onChange: () => void): () => void;

  /* ---- 설정(key/value) ---- */
  fetchSetting<T>(key: string): Promise<T | null>;
  saveSetting(key: string, value: unknown): Promise<void>;
  fetchAllSettings(): Promise<Record<string, unknown>>;

  /* ---- 이미지·파일 ---- */
  uploadFile(blob: Blob, ext: string): Promise<string>;   // → 공개 URL
  /** 저장소에 있는 파일 전부 — 어디서도 참조하지 않는 파일을 찾아 지우는 데 쓴다.
   *  글을 지워도 이미지는 저장소에 남기 때문에(참조가 다른 곳에 남아 있을 수 있어 자동 삭제는 위험)
   *  관리자가 환경설정에서 직접 확인하고 정리한다. */
  listFiles(): Promise<{ ref: string; size: number }[]>;
  deleteFile(ref: string): Promise<void>;

  /** 회원 프로필(닉네임·아바타) 삭제 — 홈의 회원 목록에서 사라진다.
   *  **로그인 계정 자체는 지울 수 없다.** Firebase Authentication / Supabase Auth의 계정 삭제는
   *  관리자 키가 있어야 하는데, 공개 홈에 그 키를 두면 누구나 계정을 지울 수 있게 된다.
   *  계정 삭제는 각 서비스 콘솔에서 (설치 가이드에 안내). */
  deleteMember(id: string): Promise<void>;
}

/** 콘텐츠 컬렉션 이름 (localStorage 키 → 컬렉션/테이블) — 두 백엔드가 같은 이름을 쓴다 */
export const COLLECTION_OF: Record<string, string> = {
  'ohome.board.v1': 'posts',
  'ohome.guest.v1': 'guestbook',
  'ohome.chars.v1': 'characters',
  'ohome.rels.v1': 'relations',
  'ohome.backup.v1': 'gallery',
  'ohome.road.v1': 'roadview',
  'ohome.trpg.v1': 'trpg_logs',
  // TRPG 로그 본문 — 목록 문서와 분리 저장 (v2.0). 목록 노출(listHidden)과 열람 권한(visibility)이
  // Firestore에서는 같은 read 규칙을 타므로(질의로 노출된 문서는 단일 조회도 전부 읽힌다),
  // "나만보기여도 목록엔 표시" 조건을 안전하게 만족하려면 본문을 아예 다른 문서에 둬야 한다
  'ohome.trpgbody.v1': 'trpg_log_bodies',
  'ohome.tchars.v1': 'trpg_chars',
  'ohome.dotori.v1': 'dotori',
  'ohome.playlog.v1': 'playlog',
  'ohome.rp.v1': 'rp_rooms',
  'ohome.threads.v1': 'threads',
  'ohome.diary.v1': 'diary',
  'ohome.memo.v1': 'memos',
  'ohome.comm.v1': 'commissions',
  'ohome.commapply.v1': 'applicants',
  'ohome.moods.v1': 'moods',
  // 댓글 — 글 안이 아니라 자기 문서로 (v2.0). 글 안에 두면 댓글을 달 때마다 글을 UPDATE 해야 해서
  // 「글 수정은 작성자·관리자만」 규칙에 걸려 일반 회원이 관리자 글에 댓글을 달 수 없었다
  'ohome.comments.v1': 'comments',
  // 자관 문답 답변 — 자관 안이 아니라 자기 문서로 (v2.0). 댓글과 같은 이유:
  // 자관 안에 두면 답을 달 때마다 자관을 UPDATE 해야 해서 일반 회원이 답할 수 없었다
  'ohome.qaanswers.v1': 'qa_answers',
  // 역극 발화 — 방 안이 아니라 자기 문서로 (v2.0). 같은 이유로, 방 안에 두면 말할 때마다
  // 방을 UPDATE 해야 해서 남이 만든 방에서 참여자가 발화할 수 없었다
  'ohome.rpmsgs.v1': 'rp_messages',
  // 역극 입력 중 표시 (v2.1 사용자 요청) — 방·사람당 문서 하나, 몇 초 뒤 지워지는 가벼운 표시.
  // 발화(rp_messages)에 섞으면 표시 한 번마다 모든 참여자가 발화 전체를 다시 받게 돼 따로 둔다
  'ohome.rptyping.v1': 'rp_typing',
  // 감상타래 글 — 타래 안이 아니라 자기 문서로 (커플홈). 같은 이유로, 타래 안에 두면
  // 상대 오너가 관리자 타래에 이어 쓸 수 없다 (두 사람이 같이 쓰는 타래)
  'ohome.thrposts.v1': 'thread_posts',
  // Videos 게시판 (커플홈 사용자 요청) — 영상 하나를 파일·링크로 올리는 글. 갤러리와 따로 둔다
  'ohome.videos.v1': 'videos',
  // 알림 — 기기 보관이던 것을 서버로 (v2.0 포크 제보 「알림이 안 와요」).
  // 행 주인(authorId)을 받는 사람으로 적어, 받는 사람 계정이 어느 기기에서나 받아 간다
  'ohome.notif.v1': 'notifications',
};

export const CONTENT_COLLECTIONS = Object.values(COLLECTION_OF);

/** 항목 배열 비교 — 두 백엔드가 공유하는 diff (바뀐 것만 저장).
 *
 *  **내용이 그대로고 자리만 바뀐 항목은 moves로 분리한다** (v2.0 포크 제보 — 큰 로그 본문 저장 실패).
 *  새 항목을 목록 맨 앞에 끼우면 기존 항목 전부의 자리가 밀리는데, 이걸 전부 updates로 취급하면
 *  **본문까지 통째로 다시 전송**된다. TRPG 로그 본문(문서당 최대 700KB)이 쌓인 홈에서는 그 합이
 *  Firestore 쓰기 한 번의 최대 크기(10MiB)를 넘어 **새 로그의 본문 저장만 조용히 실패**했다 —
 *  티켓은 생기는데 본문은 「비어 있습니다」가 되는 원인. moves는 sort 값만 고쳐 저장하면 된다. */
export function diffList<T extends ListItem>(prev: T[], next: T[]) {
  const prevMap = new Map(prev.map((it, i) => [it.id, { it, i }]));
  const nextIds = new Set(next.map(it => it.id));
  const inserts: { item: T; sort: number }[] = [];
  const updates: { item: T; sort: number }[] = [];
  const moves: { id: string; sort: number }[] = [];
  next.forEach((it, i) => {
    const before = prevMap.get(it.id);
    if (!before) inserts.push({ item: it, sort: i });
    else if (JSON.stringify(before.it) !== JSON.stringify(it)) updates.push({ item: it, sort: i });
    else if (before.i !== i) moves.push({ id: it.id, sort: i });
  });
  const deletes = prev.filter(it => !nextIds.has(it.id)).map(it => it.id);
  return { inserts, updates, moves, deletes };
}

/** 항목에서 권한 판단에 쓰는 값 뽑기.
 *
 *  listHidden 필드가 있는 항목(TRPG 로그 목록 문서 등)은 "목록에 뜨는지"가 곧 질의(list) 단계의
 *  공개 여부다 — 실제 열람 권한(item.visibility)과는 별개로 다룬다 (v2.0 사용자 확정: "나만보기여도
 *  목록에는 표시돼야해"). Firestore·Supabase RLS 둘 다 list/get을 같은 규칙으로 묶어 판단하므로,
 *  이 필드가 있는 문서에는 민감한 내용(본문 등)을 절대 함께 두면 안 된다 — 질의로 노출되면
 *  단일 조회 권한도 함께 열리기 때문. (그래서 TRPG 로그는 본문을 별도 문서로 분리해 저장한다.) */
export function metaOf(item: ListItem, uid: string | null, floor = 'public') {
  const rawAuthor = typeof item.authorId === 'string' ? item.authorId : '';
  const authorId = rawAuthor || uid || null;
  const hasListHidden = typeof item.listHidden === 'boolean';
  const own = hasListHidden
    ? (item.listHidden ? 'private' : 'public')
    : (typeof item.visibility === 'string' ? item.visibility : 'public');
  /* 메뉴를 비공개로 둔 곳의 글은 그 기준까지 좁혀 저장한다 (v2.0 사용자 요청 — visFloor 참조).
     **좁히기만 한다** — 글이 이미 더 좁으면 그대로다. 게시판 글처럼 visibility 칸이 아예 없는
     종류도 여기서 정해지므로, 서버가 내주지 않는 것은 화면과 무관하게 보장된다. */
  const rank: Record<string, number> = { public: 0, member: 1, private: 2 };
  const visibility = (rank[floor] ?? 0) > (rank[own] ?? 0) ? floor : own;
  return { authorId, visibility, editorIds: editorIdsOf(item) };
}

/**
 * 이 항목을 작성자가 아니어도 수정할 수 있는 회원 목록 (v2.0).
 *
 * 캐릭터의 grants에서 「편집까지」를 준 회원을 뽑아 **평평한 문자열 배열**로 따로 저장한다.
 * 보안 규칙은 grants처럼 객체가 든 배열에서 "어떤 원소의 userId가 나와 같은가"를 물을 수단이
 * 없어서(Firestore 규칙에 some()이 없다), 규칙이 그대로 확인할 수 있는 형태가 따로 필요하다.
 * 이게 없으면 편집 권한을 줘도 서버가 저장을 거부해 「편집 화면은 뜨는데 SAVE가 먹지 않는」다
 * (v2.0 사용자 발견 — 댓글 문제와 같은 뿌리).
 */
export function editorIdsOf(item: ListItem): string[] {
  // 문서에 바로 적어 둔 평평한 목록 (커플홈 — RP LOG: 등록 권한이 있는 회원은 수정도, trpgPerm.ts)
  const flat = Array.isArray(item.editorIds)
    ? (item.editorIds as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const grants = item.grants;
  if (!Array.isArray(grants)) return flat;
  const fromGrants = grants
    .filter((g): g is { userId: string; level: string } =>
      !!g && typeof g === 'object'
      && typeof (g as { userId?: unknown }).userId === 'string'
      && (g as { level?: unknown }).level === 'edit')
    .map(g => g.userId);
  return [...new Set([...flat, ...fromGrants])];
}
