// 역극 모양 로그의 원본 발화(RpLogSrc)로 RP LOG 본문을 (다시) 만든다 — 디스코드 가져오기와 상세의 「본문 편집」이
// 같은 길을 쓴다 (커플홈 사용자 요청: "등록한 다음에 편집모드를 켜서 내용도 수정할 수 있게").
import type { Character, Relation } from './charStore';
import { charInAu, faceCropOf, pairSides } from './charStore';
import { rpLogHtml, rpLogText, rpSpeakers, type RpLogSrc } from './rpLog';
import { resolveFaces, type FaceInfo } from '@/components/rp/RpLogModal';

/** 로그에 연동된 자관(·AU) 기준 캐릭터들 — 자관 멤버(AU면 그 AU 모습·이름) 먼저, 그 밖은 뒤에. 자관이 없으면 전부 「그 밖」 */
export function logViewChars(chars: Character[], rels: Relation[], relId?: string, auId?: string) {
  const rel = rels.find(r => r.id === relId);
  const auKey = rel && auId && auId !== 'base' ? `${rel.id}:${auId}` : undefined;
  const ids = rel ? (pairSides(rel) ?? rel.members.map(m => m.charId)) : [];
  const view = (c: Character) => (auKey ? charInAu(c, rels, auKey) : c);
  const members = ids.map(id => chars.find(c => c.id === id)).filter((c): c is Character => !!c).map(view);
  const others = chars.filter(c => !ids.includes(c.id)).map(view);
  return { rel, auKey, members, others, viewChars: chars.map(view) };
}

/** 원본 발화 → 본문. 프로필 사진은 자관에서 잡아 둔 얼굴 위치 그대로(AU면 그 AU의 사진·위치), 주소는 홈 저장소.
 *  게시판 본문은 좌우를 정하지 않는다 — 보는 사람에 따라 상세 페이지가 정한다(neutralSides) */
export async function renderLogSrc(
  src: RpLogSrc, title: string, chars: Character[], rels: Relation[], relId?: string, auId?: string,
): Promise<{ bodyText: string; speakers: Character[]; withText: string }> {
  const { rel, auKey, viewChars } = logViewChars(chars, rels, relId, auId);
  const speakers = rpSpeakers(src.msgs, viewChars);
  const faceInfo: FaceInfo = Object.fromEntries(
    viewChars.map(c => [c.id, { ref: c.thumbId, crop: faceCropOf(c, rels, { relId: rel?.id, auKey }) }]),
  );
  const faces = src.fmt === 'html' && src.faces ? await resolveFaces(speakers, faceInfo) : undefined;   // 메신저·대본 모두 (사용자 요청)
  const withText = speakers.map(c => c.name).join(' · ');
  const info = { title, sub: withText };
  const bodyText = src.fmt === 'html'
    ? rpLogHtml(info, src.msgs, viewChars, { time: src.time, forBoard: true, style: src.style, rightIds: [], faces, neutralSides: true, noMeta: src.noMeta })
    : rpLogText(info, src.msgs, viewChars, { time: src.time, forBoard: true, noMeta: src.noMeta });
  return { bodyText, speakers, withText };
}
