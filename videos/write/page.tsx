'use client';
// Videos 작성 (커플홈) — 공용 폼(VideoForm). ?s= 를 읽으므로 Suspense 경계
import React, { Suspense } from 'react';
import { VideoForm } from '@/components/videos/VideoForm';

export default function VideoWritePage() {
  return <Suspense fallback={<section className="page" />}><VideoForm initial={null} /></Suspense>;
}
