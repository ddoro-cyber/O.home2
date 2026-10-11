'use client';
// 이미지 저장 방지 (v1.9 사용자 요청) — 메뉴 관리 > 권한에서 체크한 영역(게시판(갤러리·로드비 포함)/
// 커미션/TRPG 캐릭터/자캐/자관)에서 이미지 우클릭 저장·드래그 반출을 차단. 관리자 계정은 제외.
// 완전한 차단은 웹 특성상 불가능 — 일반 방문자의 손쉬운 저장을 막는 수준 (기획서 6.3 참조).
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useMenuSettings, imgProtectAreaFor } from '@/lib/menuStore';
import { useAuth } from '@/lib/auth';

export function ImgProtect() {
  const pathname = usePathname();
  const [ms] = useMenuSettings();
  const { isAdmin } = useAuth();
  const area = imgProtectAreaFor(pathname ?? '');
  const active = !isAdmin && !!area && (ms.imgProtect ?? []).includes(area);

  useEffect(() => {
    if (!active) return;
    const isImg = (t: EventTarget | null) => t instanceof HTMLElement && t.tagName === 'IMG';
    const onCtx = (e: MouseEvent) => { if (isImg(e.target)) e.preventDefault(); };
    const onDrag = (e: DragEvent) => { if (isImg(e.target)) e.preventDefault(); };
    document.addEventListener('contextmenu', onCtx);
    document.addEventListener('dragstart', onDrag);
    document.documentElement.classList.add('img-protect-on');
    return () => {
      document.removeEventListener('contextmenu', onCtx);
      document.removeEventListener('dragstart', onDrag);
      document.documentElement.classList.remove('img-protect-on');
    };
  }, [active]);

  return null;
}
