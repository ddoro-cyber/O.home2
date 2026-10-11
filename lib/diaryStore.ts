// 다이어리 (4.14) — 무드 일기 + 무드 리스트 (환경설정 관리)
// 커플홈: 두 사람이 같이 쓰는 일기 — 대표 자관의 왼쪽/오른쪽 캐릭터 칸 · 구분 탭(환경설정) · 댓글
import { useCallback, useEffect, useState } from 'react';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';

/* ---------- 무드 (5.2 — 환경설정에서 이름/아이콘/색 관리) ---------- */
export interface Mood {
  id: string;
  name: string;
  icon: string;      // 이모지/특수문자 1~2자
  color: string;     // 아이콘 색 (배경은 자동 틴트)
}

/** 무드는 처음부터 비어 있다 (v2.0) — 예시 4종은 프로토타입 잔재라 환경설정에서 직접 만든다 */
export const MOOD_SEED: Mood[] = [];

/* ---------- 일기 ---------- */
export interface DiaryPost {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  moodId: string;
  body: string;              // MD
  imgIds: string[];          // 첨부 이미지 (IndexedDB)
  visibility: Visibility;
  /** 누구의 일기인지 (커플홈) — 이 캐릭터로 쓴 일기. 대표 자관의 왼쪽/오른쪽 칸으로 나뉘어 보인다 */
  charId?: string;
  /** 쓴 회원 (커플홈 — 두 사람이 같이 쓴다) — 서버 행 주인이라 수정·삭제는 본인·관리자 */
  authorId?: string;
  /** 구분 탭 (커플홈 — 환경설정 > 다이어리에서 관리) — 없으면 구분 없음 */
  catId?: string;
  /** 쓴 시각 (ISO, 커플홈) — 같은 날짜의 일기를 쓴 순서대로 놓기 위해. 없는 옛 일기는 id에 든 시각으로 */
  createdAt?: string;
}

export const DIARY_SEED: DiaryPost[] = [];

/** 쓴 시각 (ms) — createdAt이 없는 옛 일기는 id 앞부분(newId가 넣는 36진수 시각)으로 */
export function diaryWrittenAt(p: DiaryPost): number {
  if (p.createdAt) { const t = Date.parse(p.createdAt); if (Number.isFinite(t)) return t; }
  const n = parseInt(p.id.slice(0, 8), 36);
  return Number.isFinite(n) ? n : 0;
}
/** 목록 순서 — 일기 날짜(최신이 위), 같은 날이면 쓴 순서(나중에 쓴 것이 위).
 *  (커플홈 사용자 제보 — 「고치니까 순서가 바뀐 것 같다」: 날짜만으로는 같은 날 일기의 순서가
 *  저장 순서(sort)에 달려 있어, 두 사람이 각자 저장할 때마다 뒤바뀔 수 있었다) */
export const diaryOrder = (a: DiaryPost, b: DiaryPost) =>
  b.date.localeCompare(a.date) || diaryWrittenAt(b) - diaryWrittenAt(a);

/** 한 페이지에 보일 일기 수 (커플홈 사용자 요청 — 달별 나눔 대신 페이지로) */
export const DIARY_PER_PAGE = 5;

/* ---------- 구분 탭 (커플홈 사용자 요청 — 무드 말고도 일기를 나눠 보는 탭, 환경설정에서 관리) ---------- */
/** 구분 탭. auKey(`relId:auId`)를 정하면 그 탭에서는 칸 머리의 캐릭터가 그 AU 모습으로 보인다 (커플홈 사용자 요청) */
export interface DiaryCat { id: string; name: string; auKey?: string }
export interface DiarySettings {
  cats: DiaryCat[];
  /** 다이어리(섹션)마다 칸을 나눌 자관 — 섹션 id → 자관 id (커플홈 사용자 요청: 자관이 여럿일 때).
   *  정하지 않은 다이어리는 첫 번째 자관 */
  relBySec?: Record<string, string>;
}
export const DEFAULT_DIARY_SETTINGS: DiarySettings = { cats: [] };

const SET_KEY = 'ohome.diaryset.v1';

export function useDiarySettings(): [DiarySettings, (patch: Partial<DiarySettings>) => void, boolean] {
  const [st, setSt] = useState<DiarySettings>(DEFAULT_DIARY_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_DIARY_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<DiarySettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/* ---------- 임시 저장 (커플홈 사용자 요청 — 「일기 내용 중간 세이브 · 5분 간격 자동 저장」) ----------
   쓰던 일기를 이 브라우저(localStorage)에 남겨 둔다. 서버에 올리지 않으니 다른 기기에서는 안 보이고,
   등록·저장을 마치면 지운다. 새로 고른 이미지 파일은 담지 못한다 (이미 올라간 이미지는 id로 남긴다) */
export const DIARY_DRAFT_EVERY = 5 * 60 * 1000;
export interface DiaryDraft {
  title: string; date: string; moodId: string; body: string;
  imgIds: string[]; visibility: Visibility; charId?: string; catId?: string;
  savedAt: string;   // ISO — 화면에 「몇 시에 저장됨」으로 보인다
}
/** 저장 자리 — 회원마다, 그리고 새 일기(다이어리별)·고치는 일기(글 id)마다 따로 */
export const diaryDraftKey = (userId: string | undefined, target: string) =>
  `ohome.diarydraft.v1:${userId || 'anon'}:${target}`;
export function loadDiaryDraft(key: string): DiaryDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d.savedAt === 'string' && typeof d.title === 'string' ? { ...d, imgIds: Array.isArray(d.imgIds) ? d.imgIds : [] } : null;
  } catch { return null; }
}
export function saveDiaryDraft(key: string, d: DiaryDraft) {
  try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* 저장 공간 부족 등 — 조용히 넘어간다 */ }
}
export function clearDiaryDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
}

/** hex(#rrggbb) → 옅은 틴트 배경 (아이콘 원 배경용) */
export const moodTint = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}26` : 'rgba(127,127,127,.15)';
