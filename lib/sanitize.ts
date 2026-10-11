// HTML 보안 정책 (6.3 확정) — 스크립트 실행 불허, 스타일은 유지
// <script>·인라인 이벤트(onclick 등)·javascript: 링크 제거. DOMPurify 사용.
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export type PostMode = 'md' | 'html';

export function sanitizeHtml(html: string): string {
  // DOMPurify는 브라우저 DOM 필요 — SSR 프리렌더 시 빈 값 (클라이언트에서 렌더됨)
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['style', 'target', 'align'],   // 스타일 자유 (6.3)
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
  });
}

/** MD/HTML 본문 → 렌더 가능한 안전한 HTML */
export function renderBody(mode: PostMode, body: string): string {
  // breaks: 엔터 한 번이 그대로 줄바꿈 (커플홈 사용자 제보 — 「일기에 엔터가 통하지 않아」).
  // 마크다운 원칙대로면 빈 줄을 둬야 문단이 나뉘는데, 일기·게시글을 쓰는 사람은 엔터 = 줄바꿈으로 기대한다
  const raw = mode === 'md' ? (marked.parse(body, { async: false, breaks: true }) as string) : body;
  return sanitizeHtml(raw);
}
