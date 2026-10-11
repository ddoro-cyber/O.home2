'use client';
// TRPG 캐릭터 등록 (v1.9 — 페이지형)
import { useAuth } from '@/lib/auth';
import { useMenuSettings, canWriteAt } from '@/lib/menuStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { TCharForm } from '@/components/trpg/TCharForm';

export default function TCharNewPage() {
  const { user, isAdmin } = useAuth();
  // 등록 권한 (커플홈) — 환경설정 「권한」에서 (기본: 관리자) · ADD 버튼과 같은 판정으로 주소 직접 진입도 막는다
  const [menuSet, , menuLoaded] = useMenuSettings();
  if (!menuLoaded) return <section className="page" />;
  if (!canWriteAt(menuSet, '/tchars', { loggedIn: !!user, isAdmin, id: user?.id }, 'admin')) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>TRPG CHARACTERS</PageTitle><p>허용된 회원만 등록할 수 있습니다</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-new-desc" def="캐릭터 등록 — 표정별 이미지와 1:1 썸네일 위치" />
      </div>
      <TCharForm />
    </section>
  );
}
