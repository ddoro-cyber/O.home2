'use client';
// 메시지 알림음 (커플홈 사용자 요청 — "웹사이트 열고 있는 중에 메시지가 오면 아이폰 메시지 오는 듯한 간단한 알림음").
// 파일 없이 Web Audio로 두 음을 합성한다. 켜고 끄는 건 브라우저마다 (사람마다 취향이 달라 서버에 두지 않는다).
const KEY = 'ohome.msgsound.v1';   // 'off'면 끔
export const MSG_SOUND_EVT = 'ohome-msgsound';

export function isMsgSoundOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setMsgSoundOn(on: boolean): void {
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, 'off'); } catch { /* 무시 */ }
  try { window.dispatchEvent(new Event(MSG_SOUND_EVT)); } catch { /* 무시 */ }
}

let ctx: AudioContext | null = null;
let armed = false;

/** 브라우저 정책상 소리는 사용자가 한 번이라도 클릭·키 입력을 한 뒤에만 난다 — 첫 상호작용에서 AudioContext를 만들어 둔다 */
export function armMsgSound(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const make = () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC && !ctx) ctx = new AC();
      ctx?.resume().catch(() => { /* 무시 */ });
    } catch { /* 소리 없이 */ }
    remove();
  };
  const remove = () => {
    window.removeEventListener('pointerdown', make, true);
    window.removeEventListener('keydown', make, true);
  };
  window.addEventListener('pointerdown', make, true);
  window.addEventListener('keydown', make, true);
}

/** 두 음짜리 짧은 종소리 — E6를 짧게, A6를 길게 여운. 아직 상호작용이 없었으면(컨텍스트 없음) 조용히 넘어간다 */
export function playMsgTone(): void {
  if (!isMsgSoundOn() || !ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* 무시 */ });
    const t0 = ctx.currentTime + 0.01;
    const note = (freq: number, start: number, dur: number, vol: number) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(ctx!.destination);
      o.start(start);
      o.stop(start + dur + 0.02);
    };
    note(1318.5, t0, 0.16, 0.12);
    note(1760, t0 + 0.11, 0.42, 0.14);
    window.dispatchEvent(new CustomEvent('ohome-ding'));   // 확인용 — 실제로 울린 순간
  } catch { /* 무시 */ }
}
