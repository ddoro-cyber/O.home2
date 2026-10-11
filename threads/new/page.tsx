'use client';
// 감상타래 — 새 타래 시작 (작품 등록, 4.17 페이지형)
import { Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, canWriteAt, writeKeyOf } from '@/lib/menuStore';
import { useSectionParam, useSectionTitle } from '@/lib/sectionStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { ThreadForm } from '@/components/threads/ThreadForm';

function ThreadNewInner() {
  const { user, isAdmin } = useAuth();
  // 글쓰기 권한 (커플홈) — 환경설정 「권한」에서 타래 게시판마다 · NEW THREAD 버튼과 같은 판정
  const [menuSet, , menuLoaded] = useMenuSettings();
  // 큰 글씨 — 추가 섹션에서 들어왔으면(?s=) 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const sec = useSectionParam('threads');
  const tt = useSectionTitle('threads', sec.id, 'THREADS');
  if (!menuLoaded) return <section className="page" />;
  if (!canWriteAt(menuSet, writeKeyOf('/threads', sec.id), { loggedIn: !!user, isAdmin, id: user?.id })) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>허용된 회원만 타래를 시작할 수 있는 게시판입니다</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <EditableDesc k="threads-new-desc" def="새 타래 시작 — 작품 정보를 등록하면 타래에 글을 이어 쓸 수 있습니다" />
      </div>
      <ThreadForm />
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function ThreadNewPage() {
  return <Suspense fallback={<section className="page" />}><ThreadNewInner /></Suspense>;
}
