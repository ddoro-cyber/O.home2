// Videos 게시판 (커플홈 사용자 요청) — 영상 하나를 파일로 올리거나 링크로 거는 글.
// 갤러리에 섞지 않고 따로 둔다 (사용자 확정 — 「섞이면 이상할 것 같다」). 여러 개로 만들 수 있다(섹션 kind 'videos').
import type { Visibility } from './charStore';

export interface VideoPost {
  /** 소속 섹션 — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  /** 영상 — 올린 파일의 id(저장소 주소), 또는 링크(유튜브·비메오·mp4/mov 파일 주소). videoEmbed로 해석 */
  video: string;
  /** 썸네일(포스터) 한 장 — 파일 id 또는 주소 (선택). 없으면 어두운 칸에 ▶ */
  poster?: string;
  desc: string;              // HTML (에디터) — 렌더 시 sanitize
  /** 말머리 (커플홈 사용자 요청 — 갤러리처럼) — 환경설정 「게시판」의 비디오 말머리 이름(label). 없으면 말머리 없음 */
  category?: string;
  tags?: string[];
  date: string;              // ISO — 올린 시각
  author: string;
  authorId: string;
  visibility: Visibility;
}

export const VIDEO_KEY = 'ohome.videos.v1';
export const VIDEO_SEED: VideoPost[] = [];

/** 영상 주소 해석 — 유튜브·비메오 링크는 끼워 넣는(embed) 주소로, 그 외(파일 id·mp4/mov 주소)는 <video>로 재생.
 *  유튜브는 썸네일 주소도 함께 준다 (포스터를 안 골랐을 때 쓴다) */
export function videoEmbed(src: string): { kind: 'youtube' | 'vimeo' | 'file'; url: string; thumb?: string } {
  const yt = src.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: 'youtube', url: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`, thumb: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
  const vm = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: 'vimeo', url: `https://player.vimeo.com/video/${vm[1]}` };
  return { kind: 'file', url: src };
}

/** 링크 모드인가 — 바깥 주소(유튜브·노션 파일 주소 등). 우리 저장소 주소와 파일 id는 「파일」 */
export const isVideoLink = (v: string | undefined, isStoreUrl: (s: string) => boolean) =>
  !!v && /^https?:/.test(v) && !isStoreUrl(v);
