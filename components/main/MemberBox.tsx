'use client';
// 회원정보창 (고정 요소, 4.0) — 비로그인: 로그인 버튼만 (위젯 크기 유지 · 폼은 /login 페이지)
// 로그인: 프로필 요약 + 마이페이지/로그아웃
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useBlobUrl } from '@/lib/blobStore';

export function MemberBox() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const avatarSrc = useBlobUrl(user?.avatarUrl);

  return (
    <div className="panel login-box" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3>MEMBER</h3>
      {user ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
            {/* 기본 아바타는 이니셜 없이 단색/그라데이션 (v1.9) */}
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: avatarSrc ? undefined : (user.avatarColor ?? 'linear-gradient(135deg,#6b7280,#3c434d)'),
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>{user.nickname}</b>
              <small style={{ display: 'block', fontSize: 10.5, color: 'var(--faint)' }}>
                {user.role === 'admin' ? '관리자' : '회원'} · 알림 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>0</span>
              </small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
              onClick={() => router.push('/mypage')}>마이페이지</button>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
              onClick={logout}>로그아웃</button>
          </div>
        </>
      ) : (
        /* 비로그인 — 남는 높이 안에서 세로 가운데 정렬 (v1.9) */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '0 0 12px', lineHeight: 1.6 }}>
            로그인 후 멤버 전용 콘텐츠를 열람할 수 있습니다
          </p>
          <button className="btn btn-dark" style={{ width: '100%', justifyContent: 'center', padding: 10 }}
            onClick={() => router.push('/login')}>로그인</button>
        </div>
      )}
    </div>
  );
}
