import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RP LOG 주소를 /trpg → /log 로 (커플홈 사용자 요청: "trpg라고 뜨는데 log로 바꿔줘") —
  // 옛 주소·북마크·알림 링크는 새 주소로 보낸다 (쿼리 ?s=·?rel= 는 그대로 따라간다). DB 테이블 이름(trpg_logs…)은 바꾸지 않는다
  async redirects() {
    return [
      { source: '/trpg', destination: '/log', permanent: false },
      { source: '/trpg/:path*', destination: '/log/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
