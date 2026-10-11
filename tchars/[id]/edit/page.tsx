'use client';
// TRPG 캐릭터 수정 (v1.9 — 페이지형)
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { TrpgChar, TCHAR_SEED } from '@/lib/tcharStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { TCharForm } from '@/components/trpg/TCharForm';

export default function TCharEditPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  // 수정은 등록한 본인과 관리자 (커플홈 — 일반 회원도 등록할 수 있게 되면서)
  const [tchars, , loaded] = useLocalList<TrpgChar>('ohome.tchars.v1', TCHAR_SEED);
  const c = tchars.find(x => x.id === id);
  if (!loaded) return <section className="page" />;
  if (!(isAdmin || (!!user && !!c && c.authorId === user.id))) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>TRPG CHARACTERS</PageTitle><p>등록한 본인과 관리자만 수정할 수 있습니다</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-edit-desc" def="캐릭터 수정" />
      </div>
      <TCharForm editId={id} />
    </section>
  );
}
