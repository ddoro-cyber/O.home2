'use client';
// Videos 상세 (커플홈) — 깔끔한 16:9 플레이어 하나 + 제목 줄(작성자 · 날짜 · 태그) + 설명
import React, { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useLocalList, fmtDate } from '@/lib/postStore';
import { VideoPost, VIDEO_KEY, VIDEO_SEED, videoEmbed } from '@/lib/videoStore';
import { ConfirmModal } from '@/components/ui/Modal';
import { useBlobUrl } from '@/lib/blobStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { PageTitle } from '@/components/ui/PageText';
import { useBoardSettings, boardBadgeStyle, videoCatsOf } from '@/lib/boardStore';

/** 플레이어 — 올린 파일·mp4/mov 주소는 <video>, 유튜브·비메오 링크는 끼워 넣기(iframe). 16:9 검은 틀 */
function VideoViewer({ src, poster }: { src: string; poster?: string }) {
  const url = useBlobUrl(src);          // 파일 id → 재생 주소, 링크는 그대로
  const posterUrl = useBlobUrl(poster);
  const emb = videoEmbed(src);
  return (
    <div className="video-viewer">
      {emb.kind !== 'file' ? (
        <iframe src={emb.url} title="video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
      ) : url ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={url} poster={posterUrl} controls playsInline preload="metadata" />
      ) : null}
    </div>
  );
}

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [posts, setPosts, loaded] = useLocalList<VideoPost>(VIDEO_KEY, VIDEO_SEED);
  const [delAsk, setDelAsk] = useState(false);
  const p = posts.find(x => x.id === id);
  // 비공개 메뉴(섹션)는 주소로 들어와도 열리지 않게
  const blocked = useHrefBlock(p && sectionHref('videos', p.secId ?? MAIN_SEC));
  const { st: boardSet } = useBoardSettings();   // 말머리 뱃지 색 (커플홈)
  const tt = useSectionTitle('videos', p?.secId, 'VIDEOS');
  const html = useMemo(() => (p && loaded ? sanitizeHtml(p.desc) : ''), [p, loaded]);

  if (!loaded) return <section className="page" />;
  if (blocked) return blocked;
  const mine = !!p && !!user && p.authorId === user.id;
  const canSee = !!p && (isAdmin || mine || p.visibility === 'public' || (p.visibility === 'member' && !!user));
  if (!p || !canSee) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>영상을 찾을 수 없거나 열람 권한이 없습니다</p></div>
      </section>
    );
  }
  const canManage = isAdmin || mine;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <div className="head-actions">
          {canManage && <button className="btn btn-dark" onClick={() => router.push(`/videos/${p.id}/edit`)}>EDIT</button>}
          {canManage && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      <div className="panel" style={{ padding: 20, maxWidth: 960, margin: '0 auto' }}>
        {/* 제목 줄 — 오른쪽 끝에 작성자 · 날짜 · 태그 (갤러리 상세와 같은 모양) */}
        <h2 style={{ fontSize: 18, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {p.title}
          <span style={{
            marginLeft: 'auto', fontSize: 'calc(11.5px*var(--fs,1))', fontWeight: 400, letterSpacing: 0,
            color: 'var(--faint)', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {/* 말머리 뱃지 — 이 비디오 게시판의 말머리 색으로 (커플홈) */}
            {p.category && <span style={{ ...boardBadgeStyle(videoCatsOf(boardSet, p.secId ?? MAIN_SEC).find(c => c.label === p.category)), marginRight: 8 }}>{p.category}</span>}
            {p.author} · {fmtDate(p.date)}
            {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
          </span>
        </h2>
        <VideoViewer src={p.video} poster={p.poster} />
        {p.desc && p.desc !== '<p></p>' && (
          <div className="post-body" style={{ fontSize: 12.5, margin: '16px 0 0' }} dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>

      <ConfirmModal open={delAsk} title="영상 글을 삭제하시겠습니까?" body="삭제한 글은 복구할 수 없습니다."
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setPosts(posts.filter(x => x.id !== p.id)); router.push(tt.href); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
