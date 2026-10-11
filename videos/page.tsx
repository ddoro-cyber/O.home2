'use client';
// Videos 게시판 (커플홈 사용자 요청) — 영상 하나짜리 글을 카드로. 갤러리와 따로 둔다
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, secQuery } from '@/lib/sectionStore';
import { useMenuSettings, canWriteAt, writeKeyOf } from '@/lib/menuStore';
import { useBoardSettings, videoCatsOf } from '@/lib/boardStore';
import { useLocalList, fmtDate } from '@/lib/postStore';
import { VideoPost, VIDEO_KEY, VIDEO_SEED } from '@/lib/videoStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const PER = 12;   // 한 줄에 3개 — 4줄

function VideosPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [postsAll] = useLocalList<VideoPost>(VIDEO_KEY, VIDEO_SEED);
  // 여러 개로 만든 섹션 — 주소의 ?s= 가 가리키는 것만
  const sec = useSectionParam('videos');
  const [menuSet] = useMenuSettings();
  /* 말머리 탭 (커플홈 사용자 요청 — 갤러리처럼) — 왼쪽에 ALL / 환경설정 「게시판」의 비디오 말머리 */
  const { st: boardSet } = useBoardSettings();
  const videoCats = videoCatsOf(boardSet, sec.id);
  const [cat, setCat] = useState('');   // '' = ALL
  const posts = filterSection(postsAll, sec.id);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  // 내가 쓴 나만보기 글은 나에게도 보인다
  const visible = posts
    .filter(p => isAdmin || p.visibility === 'public' || (p.visibility === 'member' && !!user) || (!!user && p.authorId === user.id))
    .filter(p => !cat || p.category === cat)   // 말머리 탭 (커플홈)
    .filter(p => !query || p.title.toLowerCase().includes(query) || (p.category ?? '').toLowerCase().includes(query)
      || (p.tags ?? []).some(t => t.toLowerCase().includes(query)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(visible.length / PER));
  const cur = Math.min(page, pages);
  const paged = visible.slice((cur - 1) * PER, cur * PER);
  useEffect(() => { setPage(1); }, [q, sec.id, cat]);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'VIDEOS' : sec.name}</PageTitle>
        <EditableDesc k="videos-desc" def="영상 하나씩 — 파일로 올리거나 링크로" />
      </div>
      <div className="toolrow">
        {/* 왼쪽: 말머리 탭 — ALL / 환경설정에서 정한 비디오 말머리 (커플홈 사용자 요청 — 갤러리와 같은 형태) */}
        <div className="seg">
          <button className={cat === '' ? 'on' : ''} onClick={() => setCat('')}>ALL</button>
          {videoCats.map(c => (
            <button key={c.label} className={cat === c.label ? 'on' : ''} onClick={() => setCat(c.label)}>{c.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar onSearch={setQ} />
          {/* 글쓰기 권한 (커플홈) — 환경설정 「권한」에서 게시판마다 · 멤버 선택으로 좁힐 수 있다 */}
          {canWriteAt(menuSet, writeKeyOf('/videos', sec.id), { loggedIn: !!user, isAdmin, id: user?.id }) && (
            <button className="btn btn-dark" onClick={() => router.push('/videos/write' + secQuery('videos', sec.id))}>✎ WRITE</button>
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <div className="g3">
          {paged.map(p => (
            <div key={p.id} className="panel g-item vid" onClick={() => router.push(`/videos/${p.id}`)}>
              <div className="thumb">
                <div style={{ position: 'absolute', inset: 0 }}>
                  <CroppedBlobImg fileRef={p.poster} ph="cool" />
                </div>
                <span className="vmark">▶</span>
              </div>
              <div className="info">
                <b>{p.title}</b>
                <small>
                  {p.author} · {fmtDate(p.date)}
                  {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
      {visible.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          {q || cat ? '검색 결과가 없습니다' : '아직 올린 영상이 없습니다'}
        </div>
      )}
      {pages > 1 && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
          <Pager page={cur} total={pages} onChange={setPage} />
        </div>
      )}
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function VideosPage() {
  return <Suspense fallback={<section className="page" />}><VideosPageInner /></Suspense>;
}
