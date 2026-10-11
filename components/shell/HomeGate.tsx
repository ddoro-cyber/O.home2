'use client';
// 홈(자관) 게이트 (v2.1) — 누가 어느 홈을 보는지 정하는 한 곳.
//
//   비로그인            → 로그인 카드만 (홈은 전부 로그인 뒤에만)
//   총관리자 · 홈 미선택 → 자관 리스트 (들어갈 홈을 고른다)
//   회원 · 홈 없음       → 안내 (가입코드 없이 만들어진 계정 — 보통은 없다)
//   그 외               → 홈 화면 (상단바·본문)
//
// 홈 자체는 부팅(ServerBoot)에서 이미 정해져 있다 — 여기서는 그 결과에 맞는 화면만 고른다.
// 로컬 모드(백엔드 없음)는 홈 개념이 없으니 그대로 통과.
import React from 'react';
import { useAuth } from '@/lib/auth';
import { isServerMode } from '@/lib/backend';
import { currentHomeId } from '@/lib/home';
import { LoginCard } from './LoginCard';
import { HomeList } from './HomeList';

export function HomeGate({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, ready, logout } = useAuth();
  if (!isServerMode()) return <>{children}</>;
  if (!ready) return null;
  const home = currentHomeId();

  if (!user) {
    return (
      <div className="setup-wrap">
        <div style={{ width: 'min(480px, 100%)', margin: 'auto' }}>
          <LoginCard />
        </div>
      </div>
    );
  }
  if (isAdmin && !home) return <HomeList />;
  if (!home) {
    return (
      <div className="setup-wrap">
        <div className="panel setup-box">
          <h1 style={{ fontFamily: 'var(--serif-base)', fontSize: 20, letterSpacing: '.2em', textAlign: 'center', margin: '0 0 10px' }}>NO HOME</h1>
          <p className="d" style={{ textAlign: 'center' }}>
            이 계정은 아직 어느 자관에도 속해 있지 않습니다.<br />
            총관리자에게 가입코드를 받아 새로 가입하거나, 계정을 연결해 달라고 요청해 주세요.
          </p>
          <button className="btn btn-ghost" style={{ margin: '16px auto 0', display: 'block' }} onClick={() => logout()}>로그아웃</button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
