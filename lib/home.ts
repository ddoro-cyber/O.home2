'use client';
// 자관(홈) 단위 (v2.1) — 한 배포에 여러 홈이 들어가고, 홈마다 콘텐츠·설정·회원이 따로 논다.
//
//   homes/{homeId}                { name, inviteCode, createdAt }
//   homes/{homeId}/settings/{key} 테마·메뉴·폰트… (홈마다)
//   homes/{homeId}/<콘텐츠>/{id}   글·그림·자관·역극… (홈마다)
//   profiles/{uid}.homeId         회원이 속한 홈 — 가입코드로 정해지고 바뀌지 않는다
//
// 누가 어느 홈을 보는가
//   · 일반 회원: 프로필의 homeId. 로그인하면 바로 그 홈이다.
//   · 총관리자(meta/owner): 홈에 속하지 않는다. 리스트에서 하나를 골라 들어가고, 고른 홈은
//     이 브라우저(ohome.home.v1)에 남는다. 「리스트로」가 그 선택을 지운다.
//   · 로컬 모드(백엔드 없음): 홈 개념 없음 — 예전처럼 한 홈으로 동작한다.
//
// 홈을 바꾸는 것은 전부 **새로고침**으로 한다 — 모든 스토어가 모듈 상태·메모리 캐시라
// 홈을 바꾸면 처음부터 다시 받는 게 가장 안전하다.

export interface Home {
  id: string;
  name: string;
  inviteCode: string;
  createdAt?: number;
}

const PICK_KEY = 'ohome.home.v1';   // 총관리자가 고른 홈 (기기 보관)

let current: string | null = null;

/** 부팅 때 ServerBoot가 확정해 준다 — 그 전에는 null */
export function currentHomeId(): string | null { return current; }
export function setCurrentHomeId(id: string | null) { current = id; }

/** 총관리자가 리스트에서 고른 홈 */
export function pickedHomeId(): string | null {
  try { return localStorage.getItem(PICK_KEY); } catch { return null; }
}

/** 리스트에서 홈을 골라 들어간다 — 선택을 남기고 메인부터 다시 연다 */
export function enterHome(id: string) {
  try { localStorage.setItem(PICK_KEY, id); } catch { /* 무시 */ }
  window.location.href = '/';
}

/** 「리스트로」 — 선택을 지우고 리스트(메인)로 */
export function leaveHome() {
  try { localStorage.removeItem(PICK_KEY); } catch { /* 무시 */ }
  window.location.href = '/';
}

/** 새 홈의 가입코드 — 읽기 쉬운 8자 (혼동되는 0/O/1/I 제외) */
export function randomInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
