'use client';
// 브라우저 탭 제목 (v1.9 사용자 요청) — 디자인 탭에서 지정, 비우면 「로고 텍스트 — 개인홈」
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSiteSettings } from '@/lib/siteStore';

export function DocTitle() {
  const [site, , loaded] = useSiteSettings();
  const pathname = usePathname();
  useEffect(() => {
    if (!loaded) return;
    const want = site.docTitle?.trim() || `${site.title} — 개인홈`;
    const apply = () => { if (document.title !== want) document.title = want; };
    apply();
    // 페이지를 옮기면 Next가 layout.tsx의 metadata 제목으로 <title>을 되돌려 놓는다
    // (새로고침 직후에는 맞는데 이동만 하면 기본값으로 바뀌던 원인).
    // head를 지켜보다가 제목이 바뀌면 우리 값으로 다시 맞춘다 —
    // 우리가 쓴 값과 같으면 아무것도 하지 않으므로 되풀이되지 않는다.
    const ob = new MutationObserver(apply);
    ob.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => ob.disconnect();
  }, [loaded, site.docTitle, site.title, pathname]);
  return null;
}
