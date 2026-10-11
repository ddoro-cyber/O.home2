// RP LOG 등록·수정 권한 (커플홈 사용자 요청 — "수정 권한이나 등록 권한은 멤버에게도 있었으면").
//  · 등록: 환경설정 > 권한의 RP LOG 「등록」(기본 가입자 · 「등록 멤버」로 특정 회원까지 좁힐 수 있다) — 다른 게시판과 같은 canWriteAt
//  · 수정: 관리자 · 등록한 본인 · 등록 권한이 있는 회원. 서버 규칙(Firestore·RLS)은 문서에 적힌 editorIds만 보므로,
//    저장할 때마다 「지금 등록 권한이 있는 회원 전원」을 로그·본문 문서에 적는다(trpgEditorIds). 화면 판정(canEditTrpg)도
//    같은 목록을 본다 — 목록에 없는 회원에게 수정 버튼을 보여 줬다가 서버가 저장을 거부하는 일이 없게.
//    회원이 등록할 수 있게 되기 전의 옛 로그는 관리자가 RP LOG 페이지를 열 때 채워진다 (trpg/page.tsx)
//  · 삭제: 관리자 · 등록한 본인 (화면에서만 좁힌다 — 규칙은 editorIds에게도 열려 있다)
import { canWriteAt, writeKeyOf, type MenuSettings, type MenuViewer } from './menuStore';
import type { MemberLite } from './members';

/** 기본값 — 커플홈이라 회원도 등록한다 */
export const TRPG_WRITE_DEF = 'member' as const;

/** 권한 저장 키 — 기본 RP LOG는 /log, 여러 개로 만든 것은 /log?s=<id> (writeKeyOf). 옛 /trpg 키는 menuStore의 MOVED가 옮긴다 */
export const trpgWriteKey = (secId?: string) => writeKeyOf('/log', secId);

/** 이 RP LOG에 등록(＋ ADD LOG · 디스코드 가져오기)할 수 있는가 */
export function canAddTrpg(ms: MenuSettings, secId: string | undefined, viewer: MenuViewer): boolean {
  return canWriteAt(ms, trpgWriteKey(secId), viewer, TRPG_WRITE_DEF);
}

/** 저장할 때 로그·본문 문서에 적는 「수정할 수 있는 회원」 — 지금 이 게시판에 등록 권한이 있는 회원 전원.
 *  「등록 멤버」를 골랐으면 그들만, 아니면 가입 회원 모두(관리자는 늘 되므로 뺀다).
 *  회원 목록이 아직 안 왔으면(서버 모드 첫 화면) 지금 문서에 적힌 값을 그대로 둔다 — 비워 버리면 회원이 수정 권한을 잃는다 */
export function trpgEditorIds(ms: MenuSettings, secId: string | undefined, members: MemberLite[], prev?: string[]): string[] {
  const key = trpgWriteKey(secId);
  if ((ms.writePerm?.[key] ?? TRPG_WRITE_DEF) === 'admin') return [];
  const picked = ms.writeMembers?.[key];
  if (picked?.length) return [...new Set(picked)].sort();
  const pool = members.filter(m => m.role !== 'admin').map(m => m.id);
  if (!pool.length) return prev ?? [];
  return [...new Set(pool)].sort();
}

/** 이 로그(또는 본문)를 고칠 수 있는가 — 관리자 · 등록한 본인 · editorIds에 든 회원 */
export function canEditTrpg(l: { authorId?: string; editorIds?: string[] }, viewer: MenuViewer): boolean {
  if (viewer.isAdmin) return true;
  if (!viewer.loggedIn || !viewer.id) return false;
  return l.authorId === viewer.id || !!l.editorIds?.includes(viewer.id);
}

/** 같은 회원 목록인가 (순서 무관) — 바뀐 문서만 다시 쓰려고 */
export const sameIds = (a: string[] | undefined, b: string[]) =>
  !!a && a.length === b.length && b.every(x => a.includes(x));
