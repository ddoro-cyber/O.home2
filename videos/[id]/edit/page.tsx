'use client';
// Videos 수정 (커플홈) — 작성자 또는 관리자만. 폼이 ?s= 를 읽으므로 Suspense 경계
import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { VideoPost, VIDEO_KEY, VIDEO_SEED } from '@/lib/videoStore';
import { VideoForm } from '@/components/videos/VideoForm';
import { PageTitle } from '@/components/ui/PageText';

function VideoEditInner() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [posts, , loaded] = useLocalList<VideoPost>(VIDEO_KEY, VIDEO_SEED);
  const p = posts.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  if (!p || !(isAdmin || (!!p.authorId && p.authorId === user?.id))) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>영상 글을 찾을 수 없거나 수정 권한이 없습니다</p></div>
      </section>
    );
  }
  return <VideoForm initial={p} />;
}

export default function VideoEditPage() {
  return <Suspense fallback={<section className="page" />}><VideoEditInner /></Suspense>;
}
