'use client';
// 감상타래 (4.17) — 작품 단위 타래 데이터 + 분류·기본 보기 설정 (localStorage → Supabase 이전 예정)
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility, Character } from './charStore';
import { charGrant } from './charStore';
import { getRawSetting, setSetting } from './settingStore';
import { MAIN_SEC } from './sectionStore';

/* ---------- 타래 데이터 ---------- */
export interface ThreadPost {
  id: string;
  text: string;
  images: string[];          // IndexedDB 파일 id — 최대 4장 (1장=와이드, 2~4장=격자)
  phList?: string[];         // 데모 플레이스홀더 (시드 전용)
  date: string;              // ISO 작성 시각
  /** 접기 (v2.0 사용자 요청 — 스포일러 1차 쿠션). 게시판 글 접기(6.2)와 같은 모양:
   *  spoiler/adult는 정해진 문구, custom은 label을 그대로 보여 준다. 없으면 바로 보인다. */
  fold?: { type: 'spoiler' | 'adult' | 'custom'; label?: string } | null;
  /** 캐입 글 (커플홈) — 이 캐릭터로 쓴 글. 따로 저장된 글이면 author에 쓸 당시 캐릭터 이름이 있다 */
  charId?: string;
  /** 그 캐릭터의 AU 모습으로 쓴 글 (커플홈 사용자 요청) — `relId:auId`. 없으면 원래 모습 */
  auKey?: string;
}

export interface ThreadWork {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;             // 작품명 (필수)
  titleFontId?: string;      // 작품명 폰트 개별 지정 (5.1 폰트 라이브러리)
  author: string;            // 작가/감독 이름
  authorRole?: string;       // 표기 (감독·작가 등, 선택)
  catId: string;             // 분류 (환경설정 관리 리스트)
  posterId?: string;         // 대표 이미지 (3:4 포스터형, IndexedDB)
  posterCrop?: CropValue;
  ph: string;                // 이미지 없을 때 플레이스홀더
  visibility: Visibility;
  created: string;           // 타래 시작 ISO
  /** (구버전) 타래 안에 쌓던 글 — 새 글은 따로 저장한다(ThreadPostRow, 아래). 읽을 때 합친다 */
  posts: ThreadPost[];
  /** 타래를 시작한 회원 (커플홈 — 두 사람이 같이 쓴다). 없으면 예전 타래 = 관리자 것 */
  createdBy?: string;
}

/* ---------- 타래 글 = 자기 행 하나 (커플홈) ----------
   예전엔 글이 타래(ThreadWork) 문서 안 배열에 있었다. 그러면 글을 쓸 때마다 타래를 UPDATE 해야 해서
   「수정은 작성자·관리자만」 규칙에 걸려 상대 오너가 관리자 타래에 이어 쓸 수 없다 — 역극 발화·문답 답변과
   같은 이유로 글을 따로 저장한다. 옛 글(타래 안 배열)은 지우지 않고 그대로 합쳐 읽는다. */
export const THR_POST_KEY = 'ohome.thrposts.v1';

export interface ThreadPostRow extends ThreadPost {
  workId: string;
  authorId: string;          // 쓴 회원 — 서버 행 주인(본인·관리자만 수정·삭제)
  author: string;            // 쓸 당시 닉네임 (회원 목록에서 못 찾을 때 표시용)
  visibility: Visibility;    // 타래의 공개범위를 그대로 — 나만보기 타래의 글만 따로 새지 않게
  secId?: string;            // 타래의 소속 섹션 — 메뉴 비공개 판정(visFloor)이 글에도 걸리게
}

export const THR_POST_SEED: ThreadPostRow[] = [];

/** 화면에서 다루는 글 — 따로 저장된 것이면 rowId·작성자가 붙는다 (옛 글은 없음 = 관리자 글) */
export type MergedPost = ThreadPost & { rowId?: string; authorId?: string; author?: string };

/** 타래 하나의 글 — 옛 타래 안의 것 + 따로 저장된 것, 시간순 */
export function postsOf(w: ThreadWork, rows: ThreadPostRow[]): MergedPost[] {
  const mine: MergedPost[] = rows.filter(r => r.workId === w.id).map(r => ({ ...r, rowId: r.id }));
  return [...w.posts, ...mine].sort((a, b) => a.date.localeCompare(b.date));
}

/** 감상타래를 같이 쓰는 사람 (커플홈) — 관리자 + 캐릭터 권한을 받은 회원(상대 오너).
 *  역극 참여자와 같은 기준이라, 상대 캐릭터에 회원 권한을 주면 따로 설정할 것 없이 같이 쓰게 된다 */
export function canWriteThreads(chars: Character[], viewer: { isAdmin: boolean; id?: string }): boolean {
  return viewer.isAdmin || (!!viewer.id && chars.some(c => !!charGrant(c, viewer.id)));
}

/** 같이 쓰는 회원(관리자 제외) — 새 글·댓글 알림을 받을 사람 */
export const threadPartnerIds = (chars: Character[]): string[] =>
  [...new Set(chars.flatMap(c => (c.grants ?? []).map(g => g.userId)))];


/* ---------- 분류 + 기본 보기 설정 (4.17 — 환경설정에서 관리) ---------- */
/* 분류는 섹션(여러 개로 만든 타래)마다 따로 가질 수 있다 (v2.0 사용자 요청) */
export interface ThreadCat {
  id: string; label: string;
  // 뱃지 색 (v1.9 — 환경설정에서 지정, 미지정 시 기본 잉크 뱃지)
  bg?: string; border?: string; fg?: string;
}
export interface ThreadSettings {
  /** 기본 섹션의 분류 — 예전 저장분이 그대로 여기 있다 */
  cats: ThreadCat[];
  /** 섹션별 분류 (v2.0 사용자 요청) — 여러 개로 만든 타래는 다루는 게 달라 분류도 달라진다.
   *  **정한 적이 없으면 기본 섹션 것을 그대로 쓴다** — 섹션을 만들자마자 분류가 빈칸이 되면
   *  글부터 못 쓴다. 손대는 순간 그 섹션만의 목록이 생긴다. */
  secCats?: Record<string, ThreadCat[]>;
  defaultView: 'thread' | 'list'; // 메뉴 진입 시 먼저 보일 보기 (v1.8 확정)
}

/** 그 섹션에서 쓸 분류 (v2.0) — 따로 정한 적이 없으면 기본 섹션 것 */
export const threadCats = (s: ThreadSettings, secId: string): ThreadCat[] =>
  (secId === MAIN_SEC ? s.cats : s.secCats?.[secId] ?? s.cats);

/** 그 섹션의 분류를 담은 patch (v2.0) — 기본 섹션이면 예전 자리에 그대로 저장한다 */
export const threadCatsPatch = (
  s: ThreadSettings, secId: string, cats: ThreadCat[],
): Partial<ThreadSettings> =>
  (secId === MAIN_SEC ? { cats } : { secCats: { ...s.secCats, [secId]: cats } });

export const DEFAULT_THREAD_SETTINGS: ThreadSettings = {
  cats: [
    { id: 'book', label: '도서' },
    { id: 'movie', label: '영화' },
    { id: 'drama', label: '드라마' },
    { id: 'ani', label: '애니' },
    { id: 'manga', label: '만화' },
    { id: 'webtoon', label: '웹툰' },
    { id: 'webnovel', label: '웹소' },
  ],
  defaultView: 'thread',
};

const SET_KEY = 'ohome.threadset.v1';

export function useThreadSettings(): [ThreadSettings, (patch: Partial<ThreadSettings>) => void, boolean] {
  const [st, setSt] = useState<ThreadSettings>(DEFAULT_THREAD_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_THREAD_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<ThreadSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/** 분류 라벨 — 삭제된 분류는 중립 표기 */
export const catLabel = (cats: ThreadCat[], id: string) => cats.find(c => c.id === id)?.label ?? '기타';

/** 분류 뱃지 색 스타일 — 미지정 항목은 기본 잉크 뱃지 (배경/테두리/글씨) */
export function threadBadgeStyle(cat?: ThreadCat): CSSProperties {
  return {
    background: cat?.bg ?? '#1d2025',
    border: `1px solid ${cat?.border ?? cat?.bg ?? '#1d2025'}`,
    color: cat?.fg ?? '#ffffff',
  };
}

/** 최근 글 날짜 (없으면 타래 시작일) — 리스트 정렬·표시용. 따로 저장된 글까지 본다 */
export const lastDate = (w: ThreadWork, rows: ThreadPostRow[] = []) => {
  const ps = postsOf(w, rows);
  return ps.length ? ps[ps.length - 1].date : w.created;
};

export const fmtMD = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtMDHM = (iso: string) => {
  const d = new Date(iso);
  return `${fmtMD(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ---------- 시드 (프로토타입 데모 계승) ---------- */
export const THREAD_SEED: ThreadWork[] = [];
