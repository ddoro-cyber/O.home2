'use client';
// BGM 미니 플레이어 (4.1) — 유튜브 IFrame API, 화면은 숨기고 자체 컨트롤만 표시
// 기본 위치 오른쪽 아래 · 곡 리스트 팝업 (v1.9) · 페이지 이동에도 유지(레이아웃 상주)
// 브라우저 정책상 소리 재생은 사용자의 첫 클릭부터 시작
import React, { useEffect, useRef, useState } from 'react';
import { useBgm, BgmTrack, MAIN_LIST } from '@/lib/bgmStore';

const LIST_PICK_KEY = 'ohome.bgm.list';   // 이 브라우저에서 고른 플레이리스트 (방문자별)

/** 흐르는 글씨 — 재생 중이고 글자가 넘칠 때만 무한 스크롤, 평소엔 말줄임.
 *  넘침 판정은 숨김 측정용 스팬으로 — 마운트 직후(레이아웃·폰트 확정 전) 1회 측정만 하면
 *  짧은 제목도 흐르는 글씨로 오판되는 버그가 있어 ResizeObserver로 계속 재측정 */
function Marquee({ text, active, className }: { text: string; active: boolean; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measRef = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const box = boxRef.current, meas = measRef.current;
    if (!box || !meas) return;
    const m = () => setOver(meas.scrollWidth > box.clientWidth + 1);
    m();
    const ro = new ResizeObserver(m);
    ro.observe(box);
    ro.observe(meas);
    return () => ro.disconnect();
  }, [text]);
  const run = active && over;
  return (
    <div ref={boxRef} className={`mq ${className ?? ''} ${run ? 'run' : ''}`} style={{ position: 'relative' }}>
      <span ref={measRef} aria-hidden
        style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {text}
      </span>
      {run ? <span className="mq-in"><span>{text}</span><span>{text}</span></span> : text}
    </div>
  );
}

/* 최소한의 YT IFrame API 타입 */
interface YTPlayer {
  loadVideoById: (id: string) => void;
  cueVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  destroy: () => void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { ENDED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// 곡 목록 픽토그램 (리스트 줄 + 음표) — 색은 CSS에서 currentColor(--bgm-ic) 연동
const ListIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M21 15V6" />
    <circle cx="18.5" cy="15.5" r="2.5" />
    <path d="M16 6H3" /><path d="M12 12H3" /><path d="M12 18H3" />
  </svg>
);

export function BgmPlayer() {
  const { state, lists, tracksOf } = useBgm();
  const { settings } = state;
  /* 플레이리스트 여러 개 (커플홈 사용자 요청) — 지금 듣는 목록은 방문자별로 기억, 처음에는 관리자가 정한 defList */
  const [listId, setListId] = useState(MAIN_LIST);
  const tracks = tracksOf(listId);
  const anyTracks = lists.some(l => l.tracks.length > 0);
  const listInitRef = useRef(false);
  useEffect(() => {
    if (listInitRef.current || !anyTracks) return;
    listInitRef.current = true;
    let want: string | null = null;
    try { want = localStorage.getItem(LIST_PICK_KEY); } catch { /* 무시 */ }
    const pick = want && lists.some(l => l.id === want) ? want
      : settings.defList && lists.some(l => l.id === settings.defList) ? settings.defList
      : MAIN_LIST;
    setListId(pick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyTracks]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [volume, setVolume] = useState(settings.volume);
  // 접기 상태 — 방문자별 기억 (4.1)
  const [folded, setFolded] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);       // onReady 이후에만 playVideo가 실제 동작 (그 전엔 무시됨)
  const startedRef = useRef(false);     // 한 번이라도 실제 재생 시작됨 — 첫 재생은 loadVideoById 경로 필수
  const rootRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const track = tracks[idx] ?? tracks[0];

  useEffect(() => { setVolume(settings.volume); playerRef.current?.setVolume(settings.volume); }, [settings.volume]);

  useEffect(() => {
    try { setFolded(localStorage.getItem('ohome.bgm.fold') === '1'); } catch { /* 무시 */ }
  }, []);
  const setFold = (v: boolean) => {
    setFolded(v);
    setListOpen(false);
    try { localStorage.setItem('ohome.bgm.fold', v ? '1' : '0'); } catch { /* 무시 */ }
  };

  // YT API 로드 + 플레이어 생성
  useEffect(() => {
    if (!settings.enabled || tracks.length === 0) return;
    let cancelled = false;
    const create = () => {
      if (cancelled || !holderRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(holderRef.current, {
        width: 0, height: 0,
        videoId: tracks[0].videoId,
        playerVars: { controls: 0, disablekb: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            // 자동 재생이 무장된 상태(첫 상호작용이 플레이어 준비보다 먼저)면 바로 시작
            if (armedRef.current) {
              armedRef.current = false;
              playAtRef.current(idxRef.current);
            }
          },
          onStateChange: (e: { data: number }) => {
            // 1=재생, 2=일시정지, 0=종료 — 버퍼링(3)·큐(5) 같은 과도 상태는 무시
            if (e.data === 0) {
              nextRef.current(); // 곡 종료 → 반복/다음 곡 (셔플 지원)
            } else if (e.data === 1) {
              startedRef.current = true;
              setPlaying(true);
            } else if (e.data === 2) {
              setPlaying(false);
            } else if (e.data === -1) {
              // 미시작(재생이 정책에 막힌 경우 포함) — "재생 중인 척" 하지 않기
              // (정상 시작 시에도 -1→3→1로 지나가므로 잠깐 ▶로 보였다가 1에서 복구됨)
              setPlaying(false);
              startedRef.current = false;
            }
          },
        },
      });
    };
    if (window.YT?.Player) create();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); create(); };
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script');
        s.id = 'yt-iframe-api';
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, tracks.length > 0]);

  const playAt = (i: number, list: BgmTrack[] = tracks) => {
    const t = list[i];
    if (!t || !playerRef.current) { setIdx(i); return; }
    setIdx(i);
    startedRef.current = true;
    // loadVideoById는 로드 + 즉시 재생 — 큐만 된 첫 영상의 playVideo()가 무시되는
    // 유튜브 IFrame 이슈를 피하기 위해 첫 재생도 반드시 이 경로를 탄다
    playerRef.current.loadVideoById(t.videoId);
    playerRef.current.setVolume(volume);
    playerRef.current.playVideo();
    setPlaying(true); // 버튼 즉시 반영 (이벤트는 보정용)
  };
  const playAtRef = useRef(playAt);
  playAtRef.current = playAt;

  const next = () => {
    if (tracks.length === 0) return;
    const cur = idxRef.current;
    let n: number;
    if (settings.shuffle && tracks.length > 1) {
      do { n = Math.floor(Math.random() * tracks.length); } while (n === cur);
    } else {
      n = cur + 1;
      if (n >= tracks.length) {
        if (!settings.repeat) { setPlaying(false); return; }
        n = 0;
      }
    }
    playAt(n);
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  // 입장 자동 재생 (4.1) — 브라우저 정책상 완전 자동재생은 불가하므로
  // 방문자의 "첫 상호작용(클릭/키)"과 동시에 재생을 시작 (1회만)
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const armedRef = useRef(false);
  useEffect(() => {
    if (!settings.autoplay || !settings.enabled || tracks.length === 0) return;
    const fire = (ev: Event) => {
      remove();
      // 플레이어 자체를 조작하는 클릭(재생/이전/다음 등)은 버튼 핸들러에 맡김 —
      // 여기서 먼저 재생을 시작하면 곧이어 오는 버튼 click이 "일시정지"로 뒤집힘
      if (rootRef.current?.contains(ev.target as Node)) return;
      if (playingRef.current) return;
      if (readyRef.current && playerRef.current) {
        // 첫 재생은 loadVideoById 경로 (큐 상태 playVideo 무시 이슈 회피)
        playAtRef.current(idxRef.current);
      } else {
        // 플레이어 준비 전(onReady 이전)에는 재생 명령이 무시됨 — 준비되는 즉시 재생하도록 무장
        armedRef.current = true;
      }
    };
    const remove = () => {
      window.removeEventListener('pointerdown', fire, true);
      window.removeEventListener('keydown', fire, true);
    };
    window.addEventListener('pointerdown', fire, true);
    window.addEventListener('keydown', fire, true);
    return remove;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoplay, settings.enabled, tracks.length]);

  const prev = () => playAt((idxRef.current - 1 + tracks.length) % tracks.length);

  /** 플레이리스트 바꾸기 — 처음 곡부터. 듣던 중이면 바로 이어서 재생, 아니면 곡만 바꿔 둔다 */
  const pickList = (id: string) => {
    if (id === listId) return;
    setListId(id);
    try { localStorage.setItem(LIST_PICK_KEY, id); } catch { /* 무시 */ }
    const nt = tracksOf(id);
    if (playingRef.current && nt.length) playAt(0, nt);
    else { setIdx(0); if (nt[0] && playerRef.current && readyRef.current) { playerRef.current.cueVideoById(nt[0].videoId); startedRef.current = false; } }
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pauseVideo();
      setPlaying(false); // 버튼 즉시 반영
    } else if (!readyRef.current) {
      armedRef.current = true; // 준비 전이면 무장 — onReady에서 즉시 재생
    } else if (!startedRef.current) {
      playAt(idxRef.current); // 첫 재생 — 큐 상태 playVideo 무시 이슈 회피
    } else {
      // 일시정지 후 재개 — 위치 유지를 위해 playVideo
      playerRef.current.setVolume(volume);
      playerRef.current.playVideo();
      setPlaying(true);
    }
  };

  const onVolDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const set = (clientX: number) => {
      const r = volRef.current!.getBoundingClientRect();
      const v = Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100);
      setVolume(v);
      playerRef.current?.setVolume(v);
    };
    set(e.clientX);
    const mv = (ev: PointerEvent) => set(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  if (!settings.enabled || !anyTracks) return null;

  return (
    <div
      ref={rootRef}
      /* bgm-dock (커플홈 사용자 요청) — PC에서도 모바일처럼 화면 아래에 붙는 바. 위치는 CSS(.bgm-left)가 맡는다 */
      className={`bgm ${folded ? 'folded' : ''} ${settings.position === 'bl' ? 'bgm-left' : ''} ${settings.dock ? 'bgm-dock' : ''}`}
      onClick={() => { if (folded) setFold(false); }}
      data-tip={folded ? '펼치기' : undefined}
    >
      {/* 숨겨진 유튜브 플레이어 */}
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div ref={holderRef} />
      </div>
      <div className="disc" style={{ animationPlayState: playing ? 'running' : 'paused' }} />
      <div className="title">
        {/* 흐르는 글씨는 제목만 — 설명은 항상 말줄임 (정신없지 않게) */}
        <Marquee className="tt" text={track?.title ?? ''} active={playing} />
        {track?.desc && <div className="mq">{track.desc}</div>}
      </div>
      <div className="ctrl">
        <button onClick={prev} data-tip="이전">◂◂</button>
        <button onClick={togglePlay} data-tip={playing ? '일시정지' : '재생'}>{playing ? '❚❚' : '▶'}</button>
        <button onClick={next} data-tip="다음">▸▸</button>
        <button className="lst" data-tip="BGM 리스트" onClick={e => { e.stopPropagation(); setListOpen(o => !o); }}>
          <ListIcon />
        </button>
      </div>
      <div className="vol" ref={volRef} onPointerDown={onVolDrag} data-tip={`볼륨 ${volume}`}>
        <i style={{ width: `${volume}%` }} />
      </div>
      {/* 접기 — 디스크만 남김 (4.1) · 화살표는 접히는 방향(화면 가장자리 쪽) */}
      <button className="fold-btn" data-tip="접기" onClick={e => { e.stopPropagation(); setFold(true); }}>
        {settings.position === 'bl' ? '«' : '»'}
      </button>
      {/* 곡 목록 팝업 (v1.9) — 바깥 클릭 시 닫힘 */}
      {listOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setListOpen(false)} />
          <div className="bgm-list on">
            <div className="h">BGM LIST</div>
            {/* 플레이리스트 고르기 (커플홈) — 둘 이상일 때만 */}
            {lists.length > 1 && (
              <div className="pl">
                {lists.map(l => (
                  <button key={l.id} className={l.id === listId ? 'on' : ''} disabled={l.tracks.length === 0}
                    data-tip={l.tracks.length === 0 ? '비어 있음' : undefined}
                    onClick={e => { e.stopPropagation(); pickList(l.id); }}>{l.name}</button>
                ))}
              </div>
            )}
            {tracks.length === 0 && <div className="it"><small>이 플레이리스트에는 곡이 없습니다</small></div>}
            {/* 곡은 8개까지 보이고 넘어가면 안에서 스크롤 (사용자 요청) */}
            <div className="tracks">
              {tracks.map((t, i) => (
                <div key={t.id} className={`it ${i === idx ? 'on' : ''}`}
                  onClick={() => { playAt(i); setListOpen(false); }}>
                  <b>{t.title}</b><small>{t.desc}</small>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
