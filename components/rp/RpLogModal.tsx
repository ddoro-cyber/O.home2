'use client';
// 역극 로그 (커플홈) — 방의 발화를 로그로 만들어 txt/html 파일로 저장하거나 RP LOG 게시판에 올린다.
// 파일 저장은 방 참여자 누구나, 게시판 올리기는 관리자만 (로그 등록이 원래 관리자 전용이다).
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RpRoom, RpMessage } from '@/lib/rpStore';
import type { Character, Visibility } from '@/lib/charStore';
import { rpLogText, rpLogHtml, rpLogRange, rpLogLastDate, rpSpeakers, logFileName, downloadText, openLogWindow, rpLogSrcFits, type RpLogSrc } from '@/lib/rpLog';
import { useAuth } from '@/lib/auth';
import { useMenuSettings } from '@/lib/menuStore';
import { useMembers } from '@/lib/members';
import { trpgEditorIds } from '@/lib/trpgPerm';
import { useLocalList, newId, putDoc } from '@/lib/postStore';
import { TrpgLog, TRPG_SEED, TrpgLogBody, bodyVisibility, saveLogBody } from '@/lib/galleryStore';
import { useSections, filterSection, secStamp, MAIN_SEC } from '@/lib/sectionStore';
import { Modal } from '@/components/ui/Modal';
import { KInput, KSelect, KCheck } from '@/components/ui/Kit';
import { coverImgStyle, type CropValue } from '@/components/ui/CropEditor';
import { blobUrlOf } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

const isHex = (c?: string) => !!c && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c);

/** 얼굴 사진 정보 — 캐릭터 id → 파일 참조와 자관에서 잡아 둔 1:1 위치 */
export type FaceInfo = Record<string, { ref?: string; crop?: CropValue }>;
export type Faces = Record<string, { url: string; style: string }>;

/** React 스타일 객체 → 인라인 CSS 문자열 (로그 HTML은 문자열이라) */
const cssOf = (s: React.CSSProperties) =>
  Object.entries(s).map(([k, v]) => `${k.replace(/[A-Z]/g, ch => '-' + ch.toLowerCase())}:${v}`).join(';');

/** 말한 캐릭터들의 얼굴 주소·위치를 모은다 — 주소는 홈 저장소(서버 모드) 그대로, 위치는 그림 비율을 재서 역극 화면과 같은 식으로 */
export async function resolveFaces(speakers: Character[], info: FaceInfo): Promise<Faces> {
  const out: Faces = {};
  await Promise.all(speakers.map(async c => {
    const fi = info[c.id];
    const url = await blobUrlOf(fi?.ref);
    if (!url) return;
    const wide = await new Promise<boolean>(res => {
      const im = new Image();
      im.onload = () => res(im.naturalWidth >= im.naturalHeight);
      im.onerror = () => res(true);
      im.src = url;
    });
    out[c.id] = { url, style: cssOf(coverImgStyle(fi?.crop, wide)) };
  }));
  return out;
}

export function RpLogModal({ room, msgs, chars, sub, isAdmin, rightIds, faceInfo, onClose }: {
  room: RpRoom;
  msgs: RpMessage[];
  chars: Character[];       // 이 방에서 쓰는 캐릭터 — AU 방이면 AU 프로필로 바꿔 끼운 것
  sub: string;              // 방 소제목 (캐릭터 이름 둘 / 자관명 / 자유 개설)
  isAdmin: boolean;
  /** 메신저 모양에서 오른쪽(파란 말풍선)에 둘 캐릭터 — 보는 사람이 방에서 보던 그대로 (커플홈) */
  rightIds: string[];
  /** 캐릭터 얼굴 사진 (프로필 사진 옵션용) */
  faceInfo: FaceInfo;
  onClose: () => void;
}) {
  const [time, setTime] = useState(false);
  // HTML 모양 — 메신저 방은 메신저 모양이 기본 (커플홈 사용자 요청: 저장해도 메신저 느낌이 나게)
  const [style, setStyle] = useState<'script' | 'imsg'>(room.style === 'imsg' ? 'imsg' : 'script');
  /* 프로필 사진 (커플홈 사용자 요청) — 켜면 말한 캐릭터의 얼굴 주소를 홈 저장소에서 그대로 가져와 적는다 */
  const [withFaces, setWithFaces] = useState(false);
  const [faces, setFaces] = useState<Faces | null>(null);
  const speakers = useMemo(() => rpSpeakers(msgs, chars), [msgs, chars]);
  useEffect(() => {
    if (!withFaces) { setFaces(null); return; }
    let alive = true;
    resolveFaces(speakers, faceInfo).then(f => { if (alive) setFaces(f); });
    return () => { alive = false; };
  }, [withFaces, speakers, faceInfo]);
  const facesBusy = withFaces && !faces;
  const text = useMemo(() => rpLogText({ title: room.title, sub }, msgs, chars, { time }),
    [room.title, sub, msgs, chars, time]);
  const faceOpt = withFaces && faces ? faces : undefined;   // 메신저·대본 모두 (사용자 요청: "대본 형식으로 선택해도 프로필 사진이")
  const html = () => rpLogHtml({ title: room.title, sub }, msgs, chars, { time, style, rightIds, faces: faceOpt });

  // 파일은 방 제목으로. txt 앞의 BOM은 오래된 편집기에서도 한글이 깨지지 않게 하려는 것
  const saveTxt = () => downloadText(logFileName(room.title, 'txt'), `﻿${text}`, 'text/plain');
  const saveHtml = () => downloadText(logFileName(room.title, 'html'), html(), 'text/html');
  // 전체보기 — 방 안에서는 최근 것만 잘라 보여 주므로, 전체는 새 탭에 한 장으로 (커플홈 사용자 요청)
  const viewAll = () => openLogWindow(room.title, html());

  const range = rpLogRange(msgs);
  return (
    <Modal open onClose={onClose} title="역극 로그"
      desc={[sub, range, `대화 ${msgs.length}개`].filter(Boolean).join(' · ')}
      actions={<button className="btn btn-ghost" onClick={onClose}>CLOSE</button>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <KCheck label="시각 표시 (날짜가 바뀌는 곳에 구분선)" checked={time} onChange={setTime} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="cp-lb">HTML 모양</span>
          <div className="mini-seg">
            <button className={style === 'script' ? 'on' : ''} onClick={() => setStyle('script')}>대본</button>
            <button className={style === 'imsg' ? 'on' : ''} onClick={() => setStyle('imsg')}>메신저</button>
          </div>
          <small className="hint" style={{ margin: 0 }}>HTML 저장 · 전체보기 · RP LOG 본문에 쓰입니다 (TXT는 글만)</small>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <KCheck label="프로필 사진 넣기" checked={withFaces} onChange={setWithFaces} />
          <small className="hint" style={{ margin: 0 }}>
            {facesBusy ? '사진 주소를 불러오는 중…' : style === 'imsg' ? '말풍선 옆에 얼굴 — 주소는 홈 저장소의 것을 그대로 씁니다' : '이름 앞에 얼굴 — 주소는 홈 저장소의 것을 그대로 씁니다'}
          </small>
        </div>
        <div>
          <label className="k-label">미리보기</label>
          <pre className="rp-log-pre">{text}</pre>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-dark" onClick={saveTxt}>⤓ TXT 저장</button>
          <button className="btn btn-ghost" disabled={facesBusy} onClick={saveHtml}>⤓ HTML 저장</button>
          <button className="btn btn-ghost" disabled={facesBusy} onClick={viewAll}>전체보기 ↗</button>
          <small className="hint" style={{ margin: 0 }}>전체보기는 대화 전부를 새 탭 한 장에 펼칩니다</small>
        </div>
        {isAdmin && <PostToTrpg room={room} msgs={msgs} chars={chars} sub={sub} time={time} style={style} rightIds={rightIds} faces={faceOpt} facesBusy={facesBusy} />}
      </div>
    </Modal>
  );
}

/** RP LOG 게시판에 올리기 — 관리자에게만 그려서, 참여자에게는 로그 목록을 불러오지도 않는다 */
function PostToTrpg({ room, msgs, chars, sub, time, style, rightIds, faces, facesBusy }: {
  room: RpRoom; msgs: RpMessage[]; chars: Character[]; sub: string; time: boolean;
  style: 'script' | 'imsg'; rightIds: string[]; faces?: Faces; facesBusy: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [logsAll, setLogsAll, logsLoaded] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const { list } = useSections();
  const secs = list('trpg');   // RP LOG를 여러 개로 만들었으면 어디에 올릴지 고른다
  const { user } = useAuth();
  const [menuSet] = useMenuSettings();
  const members = useMembers();   // 등록 권한이 있는 회원 = 수정 가능 (trpgEditorIds)

  const [title, setTitle] = useState(room.title);
  const [catchphrase, setCatchphrase] = useState('');
  // 공개 전환한 방이면 전체공개, 아니면 멤버공개부터 — 참여자끼리만 보던 대화가 한 번에 전체로 나가지 않게
  const [vis, setVis] = useState<Visibility>(room.isPublic ? 'public' : 'member');
  const [secId, setSecId] = useState(MAIN_SEC);
  const [fmt, setFmt] = useState<'html' | 'text'>('html');
  const [busy, setBusy] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);
  const ready = logsLoaded;

  const post = async () => {
    if (!title.trim()) { toast('제목을 입력해 주세요'); return; }
    if (!ready || busy) return;
    setBusy(true);
    try {
      const id = newId();
      const speakers = rpSpeakers(msgs, chars);
      const colors = speakers.map(c => c.color).filter(isHex);
      const info = { title: title.trim(), sub };
      const bodyText = fmt === 'html'
        // 게시판 본문은 좌우를 정하지 않는다 — 보는 사람에 따라 상세 페이지가 정한다 (커플홈 사용자 요청)
        ? rpLogHtml(info, msgs, chars, { time, forBoard: true, style, rightIds, faces, neutralSides: true })
        : rpLogText(info, msgs, chars, { time, forBoard: true });
      // 원본 발화도 함께 — 올린 뒤 상세의 「본문 편집」에서 발화를 고치고 같은 모양으로 다시 그릴 수 있게 (커플홈 사용자 요청)
      const src: RpLogSrc = { msgs, style, fmt, faces: !!faces, time };
      const editorIds = trpgEditorIds(menuSet, secId, members);
      const log: TrpgLog = {
        id,
        no: Math.max(0, ...filterSection(logsAll, secId).map(l => l.no)) + 1,   // 그 게시판 안의 순번
        title: title.trim(),
        catchphrase: catchphrase.trim() || undefined,
        writer: '',
        withText: speakers.map(c => c.name).join(' · '),
        relId: room.relId,                  // 자관 기반 방이면 자관 페이지의 로그 목록에도 뜬다
        auId: room.auId,                    // 그 방의 AU 그대로 — 자관 페이지에서 같은 AU의 로그 칸에만 뜬다
        date: rpLogLastDate(msgs),
        ph: 'cool',
        visibility: vis,
        listHidden: false,
        // 썸네일은 두 캐릭터의 테마색 그라데이션 (한 명이면 단색)
        thumbColor: colors.length
          ? { c1: colors[0], c2: colors[1] }
          : { c1: '#4c5a6e', c2: '#242b36' },
        authorId: user?.id,
        editorIds,
        ...secStamp(secId),
      };
      // 본문은 목록과 분리 저장 — RP LOG 페이지의 등록과 같은 방식 (본문 문서는 뒤에 붙인다)
      const body: TrpgLogBody = {
        id,
        ...(await saveLogBody(bodyText)),
        bodyHtml: fmt === 'html',
        src: rpLogSrcFits(src) ? src : undefined,
        authorId: user?.id,
        editorIds,
        visibility: bodyVisibility(log),
        ...secStamp(secId),
      };
      setLogsAll([log, ...logsAll]);
      void putDoc('ohome.trpgbody.v1', body);   // 본문은 한 건만 넣는다 (커플홈 — 전체 본문을 받지 않는다)
      setPostedId(id);
      toast('RP LOG에 올렸습니다');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ borderTop: '1px dashed var(--line)', paddingTop: 14, display: 'grid', gap: 9 }}>
      <label className="k-label" style={{ margin: 0 }}>RP LOG에 올리기</label>
      <KInput placeholder="제목 (필수)" value={title} onChange={e => setTitle(e.target.value)} />
      <KInput placeholder="캐치프레이즈 (선택)" value={catchphrase} onChange={e => setCatchphrase(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <KSelect minWidth={120} value={vis} onChange={v => setVis(v as Visibility)}
          options={[
            { value: 'public', label: '전체공개' },
            { value: 'member', label: '멤버공개' },
            { value: 'private', label: '나만보기' },
          ]} />
        {secs.length > 1 && (
          <KSelect minWidth={130} value={secId} onChange={setSecId}
            options={secs.map(s => ({ value: s.id, label: s.name }))} />
        )}
        <div className="mini-seg">
          <button className={fmt === 'html' ? 'on' : ''} onClick={() => setFmt('html')}>{style === 'imsg' ? '메신저 HTML' : '테마색 HTML'}</button>
          <button className={fmt === 'text' ? 'on' : ''} onClick={() => setFmt('text')}>텍스트</button>
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {room.relId
          ? '이 방의 자관에 연동되어 자관 페이지의 로그 목록에도 표시됩니다. '
          : ''}
        위의 시각 표시 설정이 본문에도 그대로 들어갑니다.
        {style === 'imsg' ? ' 메신저 모양의 좌우는 보는 사람 기준입니다 — 관리자에게는 자캐가, 역극 참여 회원에게는 자기 캐릭터가 오른쪽.' : ''}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-dark" disabled={!ready || busy || facesBusy || !!postedId} onClick={post}>
          {busy ? '올리는 중…' : postedId ? '올렸습니다' : !ready ? '불러오는 중…' : '＋ RP LOG에 올리기'}
        </button>
        {postedId && (
          <button className="btn btn-ghost" onClick={() => router.push(`/log/${postedId}`)}>올린 로그 보기 ›</button>
        )}
      </div>
    </div>
  );
}
