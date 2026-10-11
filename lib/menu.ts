// 상단 메뉴 트리 — 기획서 3장 (계층 메뉴, 메뉴 선택제)
// 기본 구성은 프로토타입_2 상단 메뉴를 따름 (기록 그룹 포함 · 커미션은 제거)
// ※ 프로토타입의 「로그인」 gnb 항목은 임시 배치 — 실제로는 우상단 사용자 영역에 표시 (3장 주석)
// TODO(환경설정 메뉴 관리): 관리자가 이 구조를 GUI로 편집 → DB 저장으로 이전
export interface MenuItem {
  label: string;
  href?: string;             // 하위가 없는 단독 메뉴
  children?: { label: string; href: string }[];
}

/** 배치 가능한 기능(모듈) 전체 — href → 기본 이름. 메뉴 트리에 넣어야 노출됨 (3장 메뉴 선택제) */
// 커플홈 — /chars(캐릭터 목록)는 두지 않는다. 캐릭터는 자관 페이지의 멤버 카드에서 연다. 방명록(/guest)도 제거
export const FEATURES: { href: string; label: string }[] = [
  { href: '/rels', label: '자관' },
  { href: '/rp', label: '역극' },
  { href: '/board', label: '리스트' },
  { href: '/gallery', label: '갤러리' },
  { href: '/videos', label: 'Videos' },   // 영상 게시판 (커플홈)
  { href: '/loadb', label: '로드비' },
  { href: '/tchars', label: '캐릭터' },   // TRPG 캐릭터 — 자놀 캐릭터와는 href로 구분
  { href: '/log', label: 'RP LOG' },    // 로그 백업 — 커플홈에서 이름을 RP LOG로, 주소도 /log 로 (옛 /trpg 는 자동 이동)
  { href: '/dotori', label: '도토리' },
  { href: '/playlog', label: '플레이기록' },
  { href: '/cal', label: '스케줄러' },
  { href: '/diary', label: '다이어리' },
  { href: '/threads', label: '감상타래' },
  { href: '/memo', label: '메모장' },
  { href: '/intro', label: '소개' },
];

export const DEFAULT_MENU: MenuItem[] = [
  {
    label: '자놀',
    children: [
      { label: '자관', href: '/rels' },
      { label: '역극', href: '/rp' },
      { label: 'RP LOG', href: '/log' },    // 역극 로그를 올리는 곳이라 역극 옆에 (원래 TRPG 그룹)
    ],
  },
  {
    label: '게시판',
    children: [
      { label: '리스트', href: '/board' },
      { label: '갤러리', href: '/gallery' },
      { label: 'Videos', href: '/videos' },
      { label: '로드비', href: '/loadb' },
    ],
  },
  {
    label: 'TRPG',
    children: [
      { label: '캐릭터', href: '/tchars' },
      { label: '도토리', href: '/dotori' },
      { label: '플레이기록', href: '/playlog' },
    ],
  },
  {
    label: '기록',
    children: [
      { label: '스케줄러', href: '/cal' },
      { label: '다이어리', href: '/diary' },
      { label: '감상타래', href: '/threads' },
      { label: '메모장', href: '/memo' },
    ],
  },
];
