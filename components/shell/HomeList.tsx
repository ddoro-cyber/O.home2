'use client';
// 자관(홈) 리스트 (v2.1) — 총관리자가 로그인하면 보는 첫 화면.
// 홈을 만들고(이름 + 가입코드), 들어가고, 코드를 바꾸고, 지운다.
// 홈 안의 환경설정(테마·메뉴·권한)은 들어가서 바꾼다 — 여기서는 홈 자체와 회원 연결만 다룬다.
//
// 회원 연결 — 가입코드로 들어온 회원은 그 자관에 묶이지만, 자관이 지워지면 갈 곳을 잃는다.
// 어느 자관에도 연결되지 않은 회원(코드 없이 만들어졌거나 자관이 사라진 회원)은 만들기·수정 화면에
// 목록으로 보여 주고, 골라서 이 자관에 붙일 수 있다.
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { backend } from '@/lib/backend';
import type { HomeRow } from '@/lib/backend/types';
import { enterHome, randomInviteCode } from '@/lib/home';
import { newId } from '@/lib/postStore';
import { KInput, KCheck } from '@/components/ui/Kit';
import { useConfirmDelete } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface MemberRow { id: string; nickname: string; role: 'admin' | 'member'; homeId?: string }

/** 오류 문구 — 권한 거부는 거의 늘 「새 규칙(v2.1)을 아직 게시하지 않음」이라 그 길을 바로 알려 준다 */
const why = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? '';
  return /permission|insufficient/i.test(m)
    ? '권한이 없습니다 — Firebase 콘솔 → Firestore Database → 규칙에 저장소의 firebase/firestore.rules(v2.1) 내용을 붙여넣고 [게시]해 주세요. 이전 규칙에는 자관(homes) 권한이 없습니다.'
    : m;
};

export function HomeList() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const del = useConfirmDelete();
  const [homes, setHomes] = useState<HomeRow[] | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [busy, setBusy] = useState(false);
  // 새 자관 — 이름 · 가입코드(직접 입력, 기본은 자동 생성) · 연결할 회원
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState(() => randomInviteCode());
  const [newPick, setNewPick] = useState<string[]>([]);
  // 한 줄 편집 — 이름·가입코드·연결할 회원
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState('');
  const [eCode, setECode] = useState('');
  const [ePick, setEPick] = useState<string[]>([]);

  const load = async () => {
    const be = backend();
    if (!be) return;
    try {
      const [hs, ms] = await Promise.all([be.listHomes(), be.listMembers().catch(() => [])]);
      setHomes(hs);
      setMembers(ms.map(m => ({ id: m.id, nickname: m.nickname, role: m.role, homeId: m.homeId })));
    } catch (e) {
      toast(`자관 목록을 받지 못했습니다 — ${why(e)}`);
      setHomes([]);
    }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const homeIds = new Set((homes ?? []).map(h => h.id));
  /** 어느 자관에도 연결되지 않은 회원 — 총관리자는 원래 자관에 속하지 않으므로 제외 */
  const orphans = members.filter(m => m.role !== 'admin' && (!m.homeId || !homeIds.has(m.homeId)));
  const membersOf = (id: string) => members.filter(m => m.homeId === id);

  /** 가입코드 중복 — 코드가 곧 자관을 정하므로 자관마다 달라야 한다 */
  const codeTaken = (code: string, except?: string) =>
    (homes ?? []).some(h => h.id !== except && h.inviteCode.trim().toLowerCase() === code.toLowerCase());

  const attach = async (homeId: string, ids: string[]) => {
    const be = backend();
    if (!be) return 0;
    let n = 0;
    for (const id of ids) {
      try { await be.setMemberHome(id, homeId); n++; }
      catch (e) { toast(`${members.find(m => m.id === id)?.nickname ?? id} 연결 실패 — ${why(e)}`); }
    }
    return n;
  };

  const create = async () => {
    const name = newName.trim(); const code = newCode.trim();
    if (!name) { toast('자관 이름을 입력해 주세요'); return; }
    if (!code) { toast('가입코드를 입력해 주세요'); return; }
    if (codeTaken(code)) { toast('이미 다른 자관이 쓰는 가입코드입니다 — 자관마다 달라야 합니다'); return; }
    const be = backend();
    if (!be) return;
    setBusy(true);
    try {
      const id = newId();
      await be.createHome({ id, name, inviteCode: code, createdAt: Date.now() });
      const n = await attach(id, newPick);
      setNewName(''); setNewCode(randomInviteCode()); setNewPick([]);
      await load();
      toast(n ? `자관을 만들고 회원 ${n}명을 연결했습니다` : '자관을 만들었습니다 — 가입코드를 회원에게 알려 주세요');
    } catch (e) {
      toast(`만들지 못했습니다 — ${why(e)}`);
    }
    setBusy(false);
  };

  const startEdit = (h: HomeRow) => { setEditId(h.id); setEName(h.name); setECode(h.inviteCode); setEPick([]); };
  const saveEdit = async () => {
    const be = backend();
    if (!be || !editId) return;
    const name = eName.trim(); const code = eCode.trim();
    if (!name || !code) { toast('이름과 가입코드를 모두 입력해 주세요'); return; }
    if (codeTaken(code, editId)) { toast('이미 다른 자관이 쓰는 가입코드입니다 — 자관마다 달라야 합니다'); return; }
    setBusy(true);
    try {
      await be.updateHome(editId, { name, inviteCode: code });
      const n = await attach(editId, ePick);
      setEditId(null);
      await load();
      toast(n ? `저장하고 회원 ${n}명을 연결했습니다` : '저장했습니다');
    } catch (e) {
      toast(`저장하지 못했습니다 — ${why(e)}`);
    }
    setBusy(false);
  };

  const remove = (h: HomeRow) => {
    const n = membersOf(h.id).length;
    del.ask(`「${h.name}」 자관 삭제`, async () => {
      const be = backend();
      if (!be) return;
      setBusy(true);
      try {
        await be.deleteHome(h.id);
        await load();
        toast('자관을 지웠습니다');
      } catch (e) {
        toast(`지우지 못했습니다 — ${why(e)}`);
      }
      setBusy(false);
    }, <>
      이 자관의 글·그림·설정이 모두 지워집니다. 되돌릴 수 없습니다.<br />
      {n > 0 && <>회원 {n}명은 계정이 남지만 갈 자관이 없어집니다 — 다른 자관을 만들거나 수정할 때 「연결 안 된 회원」에서 다시 붙일 수 있습니다.</>}
    </>);
  };

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast('가입코드를 복사했습니다'); }
    catch { toast(`가입코드: ${code}`); }
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) =>
    set(on ? [...new Set([...list, id])] : list.filter(x => x !== id));

  /** 연결 안 된 회원 고르기 — 만들기·수정 화면 공용 */
  const orphanPicker = (picked: string[], set: (v: string[]) => void) => (
    <div style={{ marginTop: 8 }}>
      <label className="k-label">연결 안 된 회원 — 골라서 이 자관에 연결</label>
      {orphans.length === 0 ? (
        <p className="hint" style={{ margin: '2px 0 0' }}>연결이 필요한 회원이 없습니다. (자관이 지워진 회원·코드 없이 만든 계정이 여기에 뜹니다)</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {orphans.map(m => (
            <KCheck key={m.id} label={m.nickname} checked={picked.includes(m.id)}
              onChange={(on: boolean) => toggle(picked, set, m.id, on)} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="setup-wrap">
      <div className="panel setup-box wide" style={{ margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'var(--serif-base)', fontSize: 22, letterSpacing: '.25em', margin: 0, color: 'var(--ink)' }}>Relation List</h1>
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>
            {user?.nickname} · 총관리자
            <button className="btn btn-ghost" style={{ marginLeft: 10, padding: '3px 10px', fontSize: 11 }} onClick={() => logout()}>로그아웃</button>
          </span>
        </div>
        <div style={{ height: 18 }} />

        {homes === null && <p className="hint">불러오는 중…</p>}
        {homes && homes.length === 0 && (
          <p className="hint" style={{ margin: '0 0 14px' }}>아직 자관이 없습니다 — 아래에서 첫 자관을 만들어 보세요.</p>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {homes?.map(h => (
            <div key={h.id} className="panel" style={{ padding: '14px 16px', boxShadow: 'none', border: '1px solid var(--line)' }}>
              {editId === h.id ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <label className="k-label">이름</label>
                  <KInput value={eName} onChange={e => setEName(e.target.value)} />
                  <label className="k-label">가입코드 — 다른 자관과 달라야 합니다</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <KInput value={eCode} onChange={e => setECode(e.target.value)} style={{ flex: 1 }} />
                    <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setECode(randomInviteCode())}>자동 생성</button>
                  </div>
                  {membersOf(h.id).length > 0 && (
                    <div>
                      <label className="k-label">이 자관의 회원</label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        {membersOf(h.id).map(m => <span key={m.id} className="pill">{m.nickname}</span>)}
                      </div>
                    </div>
                  )}
                  {orphanPicker(ePick, setEPick)}
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                    <button className="btn btn-ghost" onClick={() => setEditId(null)}>CANCEL</button>
                    <button className="btn btn-dark" disabled={busy} onClick={saveEdit}>SAVE</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <b style={{ fontSize: 15, color: 'var(--ink)' }}>{h.name}</b>
                    <div style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span>가입코드 <code style={{ fontSize: 12, color: 'var(--ink)', letterSpacing: '.08em' }}>{h.inviteCode || '—'}</code>
                        <button className="btn btn-ghost" style={{ marginLeft: 6, padding: '1px 7px', fontSize: 10 }} onClick={() => copy(h.inviteCode)}>복사</button>
                      </span>
                      <span>회원 {membersOf(h.id).length}명</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => startEdit(h)}>수정</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11 }} disabled={busy} onClick={() => remove(h)}>삭제</button>
                    <button className="btn btn-dark" onClick={() => enterHome(h.id)}>들어가기 →</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="setup-sep" />
        <label className="k-label">새 자관 만들기</label>
        <div style={{ display: 'grid', gap: 8 }}>
          <KInput placeholder="자관 이름" value={newName} onChange={e => setNewName(e.target.value)} />
          <div style={{ display: 'flex', gap: 6 }}>
            <KInput placeholder="가입코드 — 이 자관 전용" value={newCode} onChange={e => setNewCode(e.target.value)} style={{ flex: 1 }} />
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setNewCode(randomInviteCode())}>자동 생성</button>
          </div>
          {newCode.trim() && codeTaken(newCode.trim()) && (
            <p className="setup-err" style={{ margin: 0 }}>이미 다른 자관이 쓰는 가입코드입니다.</p>
          )}
          {orphanPicker(newPick, setNewPick)}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-accent" disabled={busy} onClick={create}>＋ 만들기</button>
          </div>
        </div>
        <p className="hint">가입코드는 자관마다 달라야 합니다 — 같은 코드를 쓰면 어느 자관으로 보낼지 정할 수 없습니다.</p>
      </div>
      {del.element}
    </div>
  );
}
