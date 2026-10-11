'use client';
// TRPG 캐릭터 리스트 (v1.9 신규) — 1:1 대표 인장 카드 · 클릭 시 상세(표정 전환은 상세에서)
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, canWriteAt } from '@/lib/menuStore';
import { useLocalList } from '@/lib/postStore';
import { TrpgChar, TCHAR_SEED, faceCrop } from '@/lib/tcharStore';
import { SearchBar } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

export default function TCharsPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  // 등록 권한 (커플홈) — 환경설정 「권한」에서 (기본: 관리자) · 수정·삭제는 등록한 본인과 관리자
  const [menuSet] = useMenuSettings();
  const canAdd = canWriteAt(menuSet, '/tchars', { loggedIn: !!user, isAdmin, id: user?.id }, 'admin');
  const canEdit = (c: TrpgChar) => isAdmin || (!!user && c.authorId === user.id);
  const { editOn } = useMainStore();
  const del = useConfirmDelete();
  const [tchars, setTchars, loaded] = useLocalList<TrpgChar>('ohome.tchars.v1', TCHAR_SEED);
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();
  const shown = tchars.filter(c => !query
    || c.name.toLowerCase().includes(query)
    || c.scenario.toLowerCase().includes(query)
    || c.rule.toLowerCase().includes(query)
    || c.role.toLowerCase().includes(query));

  // 편집모드 카드 드래그 정렬 (v1.9) — 훅이므로 early return보다 먼저
  const sort = useCardSort(shown, next => setTchars(mergeOrder(tchars, next)), editOn && isAdmin);

  if (!loaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-desc" def="1:1 인장 카드 — 클릭하면 표정과 소개를 볼 수 있습니다" />
        <div className="head-actions">
          <SearchBar placeholder="이름·시나리오·룰·역할 검색" onSearch={setQ} />
          {canAdd && <button className="btn btn-dark" onClick={() => router.push('/tchars/new')}>＋ ADD</button>}
        </div>
      </div>

      <div className="tc-grid">
        {shown.map((c, i) => {
          const face = c.faces[0]; // 대표 인장 = 첫 표정
          return (
            <div key={c.id} className="panel tc-card" {...sort(i)}
              style={{ cursor: 'var(--cur-pointer,pointer)', ...(sort(i) as { style?: React.CSSProperties }).style }}
              onClick={() => { if (!editOn) router.push(`/tchars/${c.id}`); }}>
              <div className="main" style={{ cursor: 'var(--cur-pointer,pointer)' }}>
                <CroppedBlobImg fileRef={face?.imgId} crop={faceCrop(c, face)} ph={face?.ph ?? c.ph} />
                {canEdit(c) && (
                  <div className="th-actions hv-actions">
                    <button onClick={e => { e.stopPropagation(); router.push(`/tchars/${c.id}/edit`); }}>EDIT</button>
                    <button className="del" onClick={e => {
                      e.stopPropagation();
                      del.ask(`「${c.name}」를 삭제하시겠습니까?`, () => setTchars(tchars.filter(x => x.id !== c.id)));
                    }}>DELETE</button>
                  </div>
                )}
              </div>
              <div className="bd">
                <b className="nm">
                  {c.name}
                  {c.role && <span className="pill dark">{c.role}</span>}
                </b>
                <small className="meta">{[c.scenario, c.rule].filter(Boolean).join(' · ')}</small>
                {c.desc && (
                  <div className="desc">
                    {/* 태그 제거한 일반 텍스트 — 2줄 말줄임 (전체 설명은 상세에서) */}
                    {c.desc.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          {query ? '검색 결과가 없습니다' : '등록된 캐릭터가 없습니다'}
        </div>
      )}
      {del.element}
    </section>
  );
}
