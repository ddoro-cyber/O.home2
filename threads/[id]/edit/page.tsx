'use client';
// 감상타래 — 작품 정보 수정 (4.17 페이지형)
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { ThreadWork, THREAD_SEED } from '@/lib/threadStore';
import { useSectionTitle } from '@/lib/sectionStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { ThreadForm } from '@/components/threads/ThreadForm';

export default function ThreadEditPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  // 큰 글씨 — 고치는 타래가 추가 섹션 것이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보).
  // 수정 주소에는 ?s=가 없으므로 타래 자신의 소속(secId)에서 읽는다
  const [works, , loaded] = useLocalList<ThreadWork>('ohome.threads.v1', THREAD_SEED);
  const work = works.find(w => w.id === id);
  const tt = useSectionTitle('threads', work?.secId, 'THREADS');
  if (!loaded) return <section className="page" />;
  // 관리자 또는 이 타래를 시작한 사람 (커플홈 — 두 사람이 같이 쓴다)
  if (!isAdmin && !(user && work?.createdBy === user.id)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>관리자 또는 이 타래를 시작한 사람만 고칠 수 있습니다</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <EditableDesc k="threads-edit-desc" def="작품 정보 수정" />
      </div>
      <ThreadForm editId={id} />
    </section>
  );
}
