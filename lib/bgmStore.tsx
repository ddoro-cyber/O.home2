'use client';
// BGM 저장소 (4.1) — 재생목록·설정 localStorage (→ 서버 설정으로 공유)
// 플레이리스트 여러 개 (커플홈 사용자 요청): 기본 목록은 예전 저장 형식 그대로 tracks에, 추가한 목록은 lists에
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { newId } from './postStore';
import { getRawSetting, setSetting } from './settingStore';

export interface BgmTrack {
  id: string;
  title: string;
  desc: string;
  videoId: string;   // 유튜브 영상 ID
}

/** 플레이리스트 — 기본 목록(id 'main')은 state.tracks, 나머지는 state.lists */
export interface BgmPlaylist { id: string; name: string; tracks: BgmTrack[] }
export const MAIN_LIST = 'main';

export interface BgmSettings {
  volume: number;              // 0~100 기본 볼륨
  position: 'br' | 'bl';       // 플레이어 위치 (기본: 오른쪽 아래, v1.4)
  shuffle: boolean;
  repeat: boolean;
  enabled: boolean;            // 플레이어 표시 여부
  autoplay: boolean;           // 입장 후 첫 상호작용 시 자동 재생 (4.1 — 정책상 완전 자동재생은 불가)
  /** PC에서도 모바일처럼 화면 아래에 붙는 슬림 바로 (커플홈 사용자 요청 — 환경설정 BGM) */
  dock?: boolean;
  /** 처음 재생할 플레이리스트 (기본: 기본 목록) — 방문자가 플레이어에서 바꾼 선택은 그 브라우저에만 기억된다 */
  defList?: string;
}

interface BgmState {
  tracks: BgmTrack[];          // 기본 목록
  settings: BgmSettings;
  lists: BgmPlaylist[];        // 추가 플레이리스트 (커플홈)
  mainName?: string;           // 기본 목록 이름 (비우면 「기본」)
}

const DEFAULT_STATE: BgmState = {
  // 데모 트랙 제거 (v1.9 사용자 발견 — 배포본 더미 데이터 정리에서 빠져 있었음)
  tracks: [],
  settings: { volume: 60, position: 'br', shuffle: false, repeat: true, enabled: true, autoplay: true },
  lists: [],
};

const STORAGE_KEY = 'ohome.bgm.v1';

interface BgmCtx {
  state: BgmState;
  /** 모든 플레이리스트 — 기본 목록이 첫 번째 */
  lists: BgmPlaylist[];
  tracksOf: (listId: string) => BgmTrack[];
  setTracks: (t: BgmTrack[], listId?: string) => void;
  addTrack: (title: string, desc: string, urlOrId: string, listId?: string) => boolean;
  removeTrack: (id: string, listId?: string) => void;
  /** 새 플레이리스트 — 만든 id, 이름이 비면 null */
  addList: (name: string) => string | null;
  renameList: (id: string, name: string) => void;
  /** 기본 목록은 지울 수 없다 */
  removeList: (id: string) => void;
  setSettings: (patch: Partial<BgmSettings>) => void;
}

const Ctx = createContext<BgmCtx | null>(null);

/** 유튜브 URL/ID → videoId 추출 */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/** 기본 목록 + 추가 목록을 한 줄로 */
export const listsOf = (s: BgmState): BgmPlaylist[] =>
  [{ id: MAIN_LIST, name: s.mainName?.trim() || '기본', tracks: s.tracks }, ...s.lists];

/** 한 목록의 곡만 바꾼 새 상태 */
const withTracks = (s: BgmState, listId: string, fn: (t: BgmTrack[]) => BgmTrack[]): BgmState =>
  (listId === MAIN_LIST
    ? { ...s, tracks: fn(s.tracks) }
    : { ...s, lists: s.lists.map(l => (l.id === listId ? { ...l, tracks: fn(l.tracks) } : l)) });

export function BgmStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BgmState>(DEFAULT_STATE);

  useEffect(() => {
    try {
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<BgmState>;
        setState({
          tracks: parsed.tracks ?? DEFAULT_STATE.tracks,
          settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
          lists: Array.isArray(parsed.lists) ? parsed.lists : [],
          mainName: parsed.mainName,
        });
      }
    } catch { /* 기본값 */ }
  }, []);

  const persist = (s: BgmState) => {
    try { setSetting(STORAGE_KEY, s); } catch { /* 무시 */ }
  };
  const apply = (fn: (s: BgmState) => BgmState) => setState(s => { const n = fn(s); persist(n); return n; });

  const setTracks = useCallback((tracks: BgmTrack[], listId: string = MAIN_LIST) => {
    apply(s => withTracks(s, listId, () => tracks));
  }, []);

  const addTrack = useCallback((title: string, desc: string, urlOrId: string, listId: string = MAIN_LIST): boolean => {
    const vid = parseVideoId(urlOrId);
    if (!vid || !title.trim()) return false;
    apply(s => withTracks(s, listId, t => [...t, { id: newId(), title: title.trim(), desc: desc.trim(), videoId: vid }]));
    return true;
  }, []);

  const removeTrack = useCallback((id: string, listId: string = MAIN_LIST) => {
    apply(s => withTracks(s, listId, t => t.filter(x => x.id !== id)));
  }, []);

  const addList = useCallback((name: string): string | null => {
    const nm = name.trim();
    if (!nm) return null;
    const id = newId();
    apply(s => ({ ...s, lists: [...s.lists, { id, name: nm, tracks: [] }] }));
    return id;
  }, []);

  const renameList = useCallback((id: string, name: string) => {
    apply(s => (id === MAIN_LIST
      ? { ...s, mainName: name.trim() || undefined }
      : { ...s, lists: s.lists.map(l => (l.id === id ? { ...l, name: name.trim() || l.name } : l)) }));
  }, []);

  const removeList = useCallback((id: string) => {
    if (id === MAIN_LIST) return;
    apply(s => ({
      ...s,
      lists: s.lists.filter(l => l.id !== id),
      // 지운 목록이 「처음 재생할 플레이리스트」였으면 기본 목록으로
      settings: s.settings.defList === id ? { ...s.settings, defList: undefined } : s.settings,
    }));
  }, []);

  const setSettings = useCallback((patch: Partial<BgmSettings>) => {
    apply(s => ({ ...s, settings: { ...s.settings, ...patch } }));
  }, []);

  const lists = useMemo(() => listsOf(state), [state]);
  const tracksOf = useCallback((listId: string) => lists.find(l => l.id === listId)?.tracks ?? [], [lists]);

  return (
    <Ctx.Provider value={{ state, lists, tracksOf, setTracks, addTrack, removeTrack, addList, renameList, removeList, setSettings }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBgm(): BgmCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBgm must be used within BgmStoreProvider');
  return ctx;
}
