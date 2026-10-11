'use client';
// 감상타래 (4.17) — 본 것·읽은 것의 감상을 트위터식 타래로.
// 보기 2종(타래/리스트, 기본 보기는 환경설정) · 분류 필터 · 작품명 검색 · 이어쓰기 컴포저
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery, sectionHref } from '@/lib/sectionStore';
import { useMenuSettings, canWriteAt, writeKeyOf } from '@/lib/menuStore';
import {
  useLocalList, newId, fmtDate, Comment,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import {
  ThreadWork, ThreadPost, THREAD_SEED, useThreadSettings, threadCats, catLabel, threadBadgeStyle, lastDate, fmtMD, fmtMDHM,
  THR_POST_KEY, THR_POST_SEED, ThreadPostRow, MergedPost, postsOf, threadPartnerIds,
} from '@/lib/threadStore';
import { Character, CHAR_SEED, inCharChoices, Relation, REL_SEED, charInAu, charAuOptions } from '@/lib/charStore';
import { useMembers, type MemberLite } from '@/lib/members';
import { useFonts } from '@/lib/fontStore';
import { putBlob, BlobImg, useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { SearchBar, KTextarea, KInput, KSelect } from '@/components/ui/Kit';
import { GuestIdBar } from '@/components/ui/GuestId';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { Lightbox } from '@/components/ui/Lightbox';
import { useToast } from '@/components/ui/Toast';
import { pushNotif, notifyAdmins } from '@/lib/notifStore';

// 접기 문구 (게시판 6.2와 동일)
const FOLD_LABEL = { spoiler: '스포일러 주의', adult: '수위 주의' };
type FoldPick = 'none' | 'spoiler' | 'adult' | 'custom';
const FOLD_OPTIONS = [
  { value: 'none', label: '접기 없음' },
  { value: 'spoiler', label: '스포일러 접기' },
  { value: 'adult', label: '수위 주의 접기' },
  { value: 'custom', label: '직접 입력 문구' },
];

// 사진 첨부 픽토그램 (이모지 아님 — v1.8)
const PhotoIcon = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M3.5 17.5 9 13l4 3.5 3.5-3 4 4" />
  </svg>
);

/** 수정 모달의 기존 첨부 이미지 썸네일 (IndexedDB) */
function KeepThumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = useBlobUrl(id);
  return (
    <div className="at">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" />}
      <button onClick={onRemove}>✕</button>
    </div>
  );
}

/** 타래 글 이미지 — 1장=와이드, 2~4장=격자 (4.17) · 클릭 시 확대 보기 */
function PostImgs({ p, onOpen }: { p: ThreadPost; onOpen: (ids: string[], idx: number) => void }) {
  const ids = p.images.length ? p.images : [];
  const phs = !ids.length && p.phList ? p.phList : [];
  const n = ids.length + phs.length;
  if (n === 0) return null;
  return (
    <div className={`thr-imgs ${n === 1 ? 'one' : n === 3 ? 'three' : ''}`}>
      {ids.map((id, i) => (
        <div key={id} className="im" onClick={() => onOpen(ids, i)}><BlobImg fileRef={id} /></div>
      ))}
      {phs.map((ph, i) => <div key={i} className={`im ph ${ph}`} />)}
    </div>
  );
}

/** 캐릭터 얼굴(없으면 테마색 원) + 이름 — 캐입 글·댓글 공용 (커플홈) */
function CharTag({ ch, className }: { ch: Character; className: string }) {
  return (
    <b className={`${className} as-char`}>
      <span className="cf" style={{ background: ch.color, ['--cc' as string]: ch.color }}>
        {ch.thumbId && <CroppedBlobImg fileRef={ch.thumbId} crop={ch.thumbCrop} />}
      </span>
      {ch.name}
    </b>
  );
}

/** 댓글 이름 (커플홈) — 캐입 댓글이면 캐릭터, 아니면 쓴 사람 이름.
 *  캐릭터가 지워졌으면 쓸 당시 이름(author)으로 */
function CmtWho({ c, chars, rels }: { c: Comment; chars: Character[]; rels: Relation[] }) {
  const base = c.charId ? chars.find(x => x.id === c.charId) : undefined;
  const ch = base ? charInAu(base, rels, c.auKey) : undefined;   // AU 캐릭터로 쓴 댓글은 그 AU 모습으로 (커플홈)
  return ch ? <CharTag ch={ch} className="cmt-char" /> : <b>{c.author}</b>;
}

/** 글쓴이 (커플홈) — 캐입 글이면 캐릭터, 아니면 지금 닉네임(못 찾으면 쓸 당시 이름).
 *  캐릭터가 지워졌으면 쓸 당시 이름으로. 옛 글(관리자 혼자 쓰던 때)은 표시 없음 */
function PostWho({ p, chars, rels, pool }: { p: MergedPost; chars: Character[]; rels: Relation[]; pool: MemberLite[] }) {
  const base = p.charId ? chars.find(x => x.id === p.charId) : undefined;
  const ch = base ? charInAu(base, rels, p.auKey) : undefined;   // AU 캐릭터로 쓴 글은 그 AU 모습으로 (커플홈)
  if (ch) return <CharTag ch={ch} className="who" />;
  const name = p.charId ? p.author
    : p.authorId ? pool.find(m => m.id === p.authorId)?.nickname ?? p.author : undefined;
  return name ? <b className="who">{name}</b> : null;
}

function ThreadsPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const del = useConfirmDelete();
  const { familyOf } = useFonts();
  const [worksAll, setWorksAll, loaded] = useLocalList<ThreadWork>('ohome.threads.v1', THREAD_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('threads');
  const [menuSet] = useMenuSettings();
  const works = filterSection(worksAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setWorks = sectionSetter(worksAll, sec.id, setWorksAll);
  const [settings, , setLoaded] = useThreadSettings();
  // 분류는 섹션마다 따로 (v2.0 사용자 요청) — 정한 적 없으면 기본 섹션 것
  const cats = threadCats(settings, sec.id);

  const [view, setView] = useState<'thread' | 'list'>('thread');
  const [lb, setLb] = useState<{ srcs: string[]; idx: number } | null>(null); // 이미지 확대 보기
  const [viewInit, setViewInit] = useState(false);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  // 기본 보기 — 환경설정값 로드 후 1회 적용 (v1.8 확정)
  useEffect(() => {
    if (setLoaded && !viewInit) { setView(settings.defaultView); setViewInit(true); }
  }, [setLoaded, viewInit, settings.defaultView]);

  /* 두 사람이 같이 쓰는 타래 (커플홈) — 관리자 + 캐릭터 권한을 받은 회원(상대 오너).
     글은 타래 안이 아니라 따로 저장한다(ThreadPostRow) — 상대가 관리자 타래에 이어 쓸 수 있게 */
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);   // AU 캐릭터로 쓰기 (커플홈) — 자관의 AU 목록
  const [postRows, setPostRows] = useLocalList<ThreadPostRow>(THR_POST_KEY, THR_POST_SEED);
  const pool = useMembers();
  // 글쓰기 권한 (커플홈) — 환경설정 「권한」에서 타래 게시판마다 (기본: 로그인한 회원) · 멤버 선택으로 좁힐 수 있다
  const canWrite = canWriteAt(menuSet, writeKeyOf('/threads', sec.id), { loggedIn: !!user, isAdmin, id: user?.id });
  const postsOfW = (w: ThreadWork): MergedPost[] => postsOf(w, postRows);
  /** 타래 정보 수정·삭제 — 관리자 또는 그 타래를 시작한 사람 */
  const canManageWork = (w: ThreadWork) => isAdmin || (!!user && w.createdBy === user.id);
  /** 글 수정·삭제 — 관리자 또는 쓴 사람 (옛 글은 타래 안에 있어 관리자만) */
  const canEditPost = (p: MergedPost) => isAdmin || (!!user && !!p.rowId && p.authorId === user.id);
  /* 캐입 (커플홈) — 타래 글·댓글 모두 캐릭터로 쓸 수 있다. 관리자는 자캐로, 상대 오너는 권한 받은 캐릭터로.
     권한(수정·삭제)은 그대로 쓴 회원 기준이고, 화면에는 캐릭터만 보인다 (역극처럼 오너 계정은 드러내지 않는다) */
  const charChoices = user ? inCharChoices(chars, { isAdmin, id: user.id }) : [];
  // AU 캐릭터로도 쓴다 (커플홈 사용자 요청) — 원래 모습 + 자관 AU마다 하나씩. 고른 값은 `charId` 또는 `charId|relId:auId`
  const asList = charAuOptions(charChoices, rels);
  const optKey = (o: { charId: string; auKey?: string }) => (o.auKey ? `${o.charId}|${o.auKey}` : o.charId);
  const asOptions = user ? [
    { value: 'me', label: `나 (${user.nickname})` as React.ReactNode },
    ...asList.map(o => ({
      value: optKey(o),
      label: <span className="dot-lbl"><i className="cmt-dot" style={{ background: o.char.color }} />{o.label}</span> as React.ReactNode,
    })),
  ] : [];

  // 공개범위 → 분류 필터 → 검색, 최근 글 순. 내가 시작한 나만보기 타래는 나에게도 보인다
  const visible = useMemo(() => works
    .filter(w => isAdmin || w.visibility === 'public' || (w.visibility === 'member' && user)
      || (!!user && w.createdBy === user.id))
    .filter(w => cat === 'all' || w.catId === cat)
    .filter(w => !q || w.title.includes(q))
    .sort((a, b) => lastDate(b, postRows).localeCompare(lastDate(a, postRows))), [works, isAdmin, user, cat, q, postRows]);

  const sel = visible.find(w => w.id === selId) ?? visible[0];

  // 댓글 — 글과 따로 저장 (v2.0 사용자 요청, 게시판·로드비와 같은 컬렉션을 target으로 나눠 쓴다)
  const [cmtRows, setCmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  // 타래 우클릭 메뉴 (v2.0 사용자 요청) — 바로 삭제 모달을 띄우지 않고 메뉴를 한 단계 거친다
  const [wCtx, setWCtx] = useState<{ x: number; y: number; id: string } | null>(null);
  useEffect(() => {
    if (!wCtx) return;
    const close = () => setWCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setWCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [wCtx]);
  // 접기 해제한 글 (v2.0 스포일러 쿠션) — 이 화면에 있는 동안만 기억한다
  const [openFolds, setOpenFolds] = useState<Set<string>>(new Set());

  // 이어쓰기 컴포저 — 누구로 쓸지(본인/캐릭터)는 댓글과 따로 고른다 (커플홈)
  const [postAs, setPostAs] = useState('me');
  const postPick = asList.find(o => optKey(o) === postAs);   // 고른 캐릭터(AU)가 사라졌으면 본인으로
  const [text, setText] = useState('');
  const [foldType, setFoldType] = useState<FoldPick>('none');       // 접기 (v2.0 스포일러 쿠션)
  const [foldLabel, setFoldLabel] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const imgRef = useRef<HTMLInputElement>(null);
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 4); // 이미지 4장 제한 (4.17)
    if (files.length + list.length > 4) toast('이미지는 최대 4장까지 첨부할 수 있습니다');
    setFiles(next);
    setUrls(next.map(f => URL.createObjectURL(f)));
  };
  const removeFile = (i: number) => {
    const next = files.filter((_, x) => x !== i);
    setFiles(next);
    setUrls(next.map(f => URL.createObjectURL(f)));
  };
  const post = async () => {
    if (!sel || !user) return;
    if (!text.trim() && files.length === 0) { toast('내용을 입력해 주세요'); return; }
    const images: string[] = [];
    for (const f of files) images.push(await putBlob(f));
    const p: ThreadPost = {
      id: newId(), text: text.trim(), images, date: new Date().toISOString(),
      fold: foldType === 'none' ? undefined : { type: foldType, label: foldType === 'custom' ? foldLabel.trim() || undefined : undefined },
    };
    // 타래는 건드리지 않는다 — 글만 자기 행으로, 뒤에 붙인다 (커플홈)
    const row: ThreadPostRow = {
      ...p, workId: sel.id, authorId: user.id, author: postPick?.char.name ?? user.nickname,
      ...(postPick ? { charId: postPick.charId, ...(postPick.auKey ? { auKey: postPick.auKey } : {}) } : {}),
      visibility: sel.visibility, ...(sel.secId ? { secId: sel.secId } : {}),
    };
    setPostRows([...postRows, row]);
    /* 알림 — 같이 쓰는 사람(관리자·상대 오너)에게, 본인 제외. 같은 타래는 안 읽은 알림 하나로 묶는다 */
    const n = {
      type: 'thread' as const, href: sectionHref('threads', sel.secId ?? 'main'), dedupeKey: `thr:${sel.id}`,
      title: `「${sel.title}」 타래에 새 글`, body: `${row.author} — ${p.text.slice(0, 50) || '사진'}`,
    };
    notifyAdmins(n);
    threadPartnerIds(chars).filter(id => id !== user.id).forEach(id => pushNotif({ ...n, toUserId: id }));
    setText(''); setFiles([]); setUrls([]); setFoldType('none'); setFoldLabel('');
  };

  // 글 수정 모달 — 텍스트 + 첨부 이미지 관리 (총 4장 제한)
  const [epId, setEpId] = useState<string | null>(null);
  const [epText, setEpText] = useState('');
  const [epFoldType, setEpFoldType] = useState<FoldPick>('none');   // 접기 (v2.0)
  const [epFoldLabel, setEpFoldLabel] = useState('');
  const [epKeep, setEpKeep] = useState<string[]>([]);   // 유지할 기존 이미지 id
  const [epPh, setEpPh] = useState<string[]>([]);       // 유지할 데모 플레이스홀더 (시드)
  const [epFiles, setEpFiles] = useState<File[]>([]);
  const [epUrls, setEpUrls] = useState<string[]>([]);
  const epImgRef = useRef<HTMLInputElement>(null);
  const epCount = epKeep.length + epPh.length + epFiles.length;
  /* 누구로 쓴 글인지도 고칠 수 있다 (커플홈 캐입) — 내가 쓴 글일 때만. 관리자가 상대 글을 고칠 때는
     관리자의 캐릭터로 바뀌면 안 되므로 손대지 않는다 */
  const [epAs, setEpAs] = useState('me');
  const epRow = postRows.find(r => r.id === epId);
  const epMine = !!user && !!epRow && epRow.authorId === user.id;
  const epPick = asList.find(o => optKey(o) === epAs);
  const openEdit = (p: ThreadPost) => {
    setEpId(p.id); setEpText(p.text);
    setEpAs(p.charId ? (p.auKey ? `${p.charId}|${p.auKey}` : p.charId) : 'me');
    setEpFoldType(p.fold?.type ?? 'none'); setEpFoldLabel(p.fold?.label ?? '');
    setEpKeep(p.images); setEpPh(p.images.length ? [] : (p.phList ?? []));
    setEpFiles([]); setEpUrls([]);
  };
  const epAddFiles = (list: FileList | null) => {
    if (!list) return;
    const room = 4 - epKeep.length - epPh.length;
    const next = [...epFiles, ...Array.from(list)].slice(0, Math.max(0, room));
    if (epFiles.length + list.length > room) toast('이미지는 최대 4장까지 첨부할 수 있습니다');
    setEpFiles(next);
    setEpUrls(next.map(f => URL.createObjectURL(f)));
  };
  const saveEdit = async () => {
    if (!sel || !epId) return;
    if (!epText.trim() && epCount === 0) { toast('내용을 입력해 주세요'); return; }
    const added: string[] = [];
    for (const f of epFiles) added.push(await putBlob(f));
    const patch: Partial<ThreadPost> = {
      text: epText.trim(), images: [...epKeep, ...added],
      phList: [...epKeep, ...added].length ? undefined : (epPh.length ? epPh : undefined),
      fold: epFoldType === 'none' ? undefined : { type: epFoldType, label: epFoldType === 'custom' ? epFoldLabel.trim() || undefined : undefined },
    };
    // 따로 저장된 글이면 그 행만, 옛 글이면 타래 안에서 (커플홈)
    if (epRow) {
      const who = epMine
        ? { charId: epPick?.charId, auKey: epPick?.auKey, author: epPick?.char.name ?? user!.nickname }   // 본인 ↔ 캐릭터(AU) 전환
        : {};
      setPostRows(postRows.map(r => (r.id === epId ? { ...r, ...patch, ...who } : r)));
    } else {
      setWorks(works.map(w => w.id === sel.id
        ? { ...w, posts: w.posts.map(p => (p.id === epId ? { ...p, ...patch } : p)) } : w));
    }
    setEpId(null);
    toast('저장되었습니다');
  };

  const removePost = (p: MergedPost) => {
    if (!sel) return;
    del.ask('이 글을 삭제하시겠습니까?', () => {
      if (p.rowId) setPostRows(postRows.filter(r => r.id !== p.rowId));
      else setWorks(works.map(w => w.id === sel.id ? { ...w, posts: w.posts.filter(x => x.id !== p.id) } : w));
    });
  };
  const removeWork = (w: ThreadWork) => {
    const rows = postRows.filter(r => r.workId === w.id);
    const cmts = cmtRows.filter(c => c.target === 'thread' && c.targetId === w.id);
    /* 상대가 쓴 글·댓글까지 지우는 것은 관리자만 (커플홈) — 남의 행은 서버가 지우게 두지 않는다.
       시작한 사람도 자기 글·댓글만 있는 타래는 지울 수 있다 */
    if (!isAdmin && (w.posts.length > 0
      || rows.some(r => r.authorId !== user?.id) || cmts.some(c => c.authorId !== user?.id))) {
      toast('상대가 쓴 글이나 댓글이 있는 타래는 관리자만 지울 수 있어요');
      return;
    }
    del.ask(`「${w.title}」 타래를 삭제하시겠습니까?`, () => {
      setWorks(works.filter(x => x.id !== w.id));
      // 딸린 글·댓글도 함께 지운다 — 따로 저장되므로 남겨 두면 주인 없는 줄이 된다 (v2.0)
      if (rows.length) setPostRows(postRows.filter(r => r.workId !== w.id));
      if (cmts.length) setCmtRows(cmtRows.filter(c => !(c.target === 'thread' && c.targetId === w.id)));
      setSelId(null);
    }, `타래의 글 ${postsOfW(w).length}개도 함께 삭제됩니다.`);
  };

  /* ---------- 댓글 (v2.0 사용자 요청) — 게시판과 같은 모양: 한 단계 답글, 손님은 닉네임으로 ---------- */
  const [cmt, setCmt] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [gName, setGName] = useState('');
  const guestMode = !user;                       // 손님 작성 허용 (방명록·로드비 기본과 동일)
  // 캐입 댓글 (커플홈) — 선택지는 타래 글과 같고, 고른 값은 따로
  const [asChar, setAsChar] = useState('me');
  const speakPick = asList.find(o => optKey(o) === asChar);   // 고른 캐릭터(AU)가 사라졌으면 본인으로
  const comments = sel ? commentsFor(cmtRows, 'thread', sel.id) : [];
  const addComment = () => {
    if (!sel || !cmt.trim()) return;
    if (guestMode && !gName.trim()) { toast('닉네임을 입력해 주세요'); return; }
    const base = { id: newId(), text: cmt.trim(), date: new Date().toISOString(), parentId: replyTo ?? undefined };
    const c: CommentRow = user
      ? {
          ...base, target: 'thread' as const, targetId: sel.id, authorId: user.id,
          author: speakPick?.char.name ?? user.nickname,
          ...(speakPick ? { charId: speakPick.charId, ...(speakPick.auKey ? { auKey: speakPick.auKey } : {}) } : {}),
        }
      : { ...base, target: 'thread' as const, targetId: sel.id, author: gName.trim(), authorId: '' };
    setCmtRows([...cmtRows, c]);
    /* 알림 — 타래는 두 사람의 것이라(커플홈) 관리자와 상대 오너에게, 본인 제외.
       답글이면 아래에서 그 대화에 참여한 사람에게도 */
    const n = {
      type: 'comment' as const, href: sectionHref('threads', sel.secId ?? 'main'),
      title: `「${sel.title}」 타래에 새 댓글`, body: `${c.author} — ${c.text.slice(0, 50)}`,
    };
    notifyAdmins(n);
    threadPartnerIds(chars).filter(id => id !== (user?.id ?? '')).forEach(id => pushNotif({ ...n, toUserId: id }));
    if (replyTo) {
      // 뿌리 주인만이 아니라 그 대화에 답글을 단 전원에게 (v2.0 포크 제보 — 게시판과 동일)
      const rootAuthor = comments.find(x => x.id === replyTo)?.authorId;
      const seen = new Set<string>();
      for (const t of comments.filter(x => x.id === replyTo || x.parentId === replyTo)) {
        const to = t.authorId;
        if (!to || to === (user?.id ?? '') || seen.has(to)) continue;
        seen.add(to);
        pushNotif({
          type: 'comment', toUserId: to, href: sectionHref('threads', sel.secId ?? 'main'),
          title: to === rootAuthor ? '내 댓글에 답글이 달렸습니다' : '참여한 댓글에 새 답글이 달렸습니다',
          body: `${c.author} — ${c.text.slice(0, 50)}`,
        });
      }
    }
    setCmt(''); setReplyTo(null);
  };
  // 댓글 삭제 — 답글도 함께. 손님 댓글은 관리자만 지운다 (게시판 v2.0 확정과 동일)
  const removeComment = (c: Comment) =>
    del.ask('이 댓글을 삭제하시겠습니까?', () =>
      setCmtRows(cmtRows.filter(x => !(x.id === c.id || x.parentId === c.id))));
  const cmtRoots = comments.filter(c => !c.parentId);
  const cmtChildren = (pid: string) => comments.filter(c => c.parentId === pid);

  if (!loaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'THREADS' : sec.name}</PageTitle>
        <EditableDesc k="threads-desc" def="본 것, 읽은 것의 감상을 타래로" />
      </div>

      <div className="toolrow">
        {/* 분류 필터 (환경설정 관리 리스트) */}
        <div className="seg">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>전체</button>
          {cats.map(c => (
            <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
        </div>
        <div className="thr-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="seg">
            <button className={view === 'thread' ? 'on' : ''} onClick={() => setView('thread')}>타래</button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>리스트</button>
          </div>
          <SearchBar onSearch={setQ} />
          {canWrite && (
            <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }}
              onClick={() => router.push('/threads/new' + secQuery('threads', sec.id))}>＋ NEW THREAD</button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: 48, fontSize: 13, color: 'var(--faint)' }}>
          {q || cat !== 'all' ? '조건에 맞는 타래가 없습니다' : '타래가 없습니다'}
        </div>
      ) : view === 'list' ? (
        /* 리스트 보기 — 포스터 카드 그리드 (한 줄 5개, 3:4) */
        <div className="g5">
          {visible.map(w => (
            <div key={w.id} className="panel thr-card"
              onClick={() => { setSelId(w.id); setView('thread'); }}
              /* 우클릭 → 메뉴 → 삭제 확인 모달 (v2.0 사용자 요청) — 리스트 보기에는 삭제 버튼이 없었다 */
              onContextMenu={e => { if (!canManageWork(w)) return; e.preventDefault(); setWCtx({ x: e.clientX, y: e.clientY, id: w.id }); }}>
              <div className="th">
                <CroppedBlobImg fileRef={w.posterId} crop={w.posterCrop} ph={w.ph} />
                <span className="pill dark" style={threadBadgeStyle(cats.find(c => c.id === w.catId))}>
                  {catLabel(cats, w.catId)}
                </span>
              </div>
              <div className="info">
                <div className="tt" style={{ fontFamily: familyOf(w.titleFontId) }}>{w.title}</div>
                {/* Author 칸 내용 — 제목과 글 수 사이, 2줄까지 (v2.0 포크 사용자 요청) */}
                {w.author && (
                  <div className="row" style={{
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', lineHeight: 1.45,
                  }}>{w.author}{w.authorRole ? ` ${w.authorRole}` : ''}</div>
                )}
                <div className="row"><b>글</b> {postsOfW(w).length}</div>
                <div className="row"><b>최근</b> {fmtMD(lastDate(w, postRows))}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 타래 보기 — 좌 타래 + 우 작품 리스트 */
        <div className="thr-layout">
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            {sel && (
              <>
                <div className="thr-head">
                  <span className="cat-badge" style={threadBadgeStyle(cats.find(c => c.id === sel.catId))}>
                    {catLabel(cats, sel.catId)}
                  </span>
                  <div className="poster">
                    <CroppedBlobImg fileRef={sel.posterId} crop={sel.posterCrop} ph={sel.ph} />
                  </div>
                  <div>
                    <div className="tt" style={{ fontFamily: familyOf(sel.titleFontId) }}>{sel.title}</div>
                    <div className="author">{sel.author}{sel.authorRole && <> <b>{sel.authorRole}</b></>}</div>
                    <small>
                      타래 시작 {fmtMD(sel.created)} · 글 {postsOfW(sel).length}
                      {sel.visibility !== 'public' && ` · ${sel.visibility === 'member' ? '멤버공개' : '나만보기'}`}
                    </small>
                    {canManageWork(sel) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 10.5 }}
                          onClick={() => router.push(`/threads/${sel.id}/edit`)}>EDIT</button>
                        <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 10.5 }}
                          onClick={() => removeWork(sel)}>DELETE</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="thr-body">
                  {postsOfW(sel).map(p => {
                    const folded = !!p.fold && !openFolds.has(p.id);
                    return (
                      <div key={p.id} className="thr-post">
                        {folded ? (
                          /* 접기 쿠션 (v2.0 사용자 요청) — 문구만 보이고, 눌러야 내용이 나온다 */
                          <div className="thr-fold" onClick={() => setOpenFolds(s => { const n = new Set(s); n.add(p.id); return n; })}>
                            <b>{p.fold!.type === 'custom' ? (p.fold!.label || '접힌 글') : FOLD_LABEL[p.fold!.type]}</b>
                            <span>클릭하면 내용이 표시됩니다</span>
                          </div>
                        ) : (
                          <>
                            {p.text && <p>{p.text}</p>}
                            <PostImgs p={p} onOpen={(ids, idx) => setLb({ srcs: ids, idx })} />
                            {p.fold && (
                              /* 다시 접기 — 열어 본 뒤에도 쿠션을 되돌릴 수 있게 */
                              <button className="thr-refold" onClick={() => setOpenFolds(s => { const n = new Set(s); n.delete(p.id); return n; })}>접기</button>
                            )}
                          </>
                        )}
                        {/* 글쓴이 — 두 사람이 같이 쓰므로 (커플홈). 옛 글은 표시 없음 */}
                        <div className="tm"><PostWho p={p} chars={chars} rels={rels} pool={pool} />{fmtMDHM(p.date)}</div>
                        {canEditPost(p) && (
                          <div className="hv-actions">
                            <button onClick={() => openEdit(p)}>EDIT</button>
                            <button className="del" onClick={() => removePost(p)}>DELETE</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {postsOfW(sel).length === 0 && (
                    <p style={{ fontSize: 12.5, color: 'var(--faint)', paddingBottom: 18 }}>아직 글이 없습니다</p>
                  )}
                </div>
                {/* 이어쓰기 컴포저 (트위터식) — 같이 쓰는 두 사람 (커플홈) */}
                {canWrite && (
                  <div className="thr-write">
                    <textarea placeholder="타래 이어쓰기…" value={text} onChange={e => setText(e.target.value)} />
                    {urls.length > 0 && (
                      <div className="thr-att">
                        {urls.map((u, i) => (
                          <div key={i} className="at">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt="" />
                            <button onClick={() => removeFile(i)}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="wfoot">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                        <button className="icobtn" data-tip="사진 추가 (최대 4장)" onClick={() => imgRef.current?.click()}>
                          <PhotoIcon />
                        </button>
                        {/* 접기 (v2.0 스포일러 쿠션) — 게시판 글쓰기의 접기와 같은 선택지 */}
                        <KSelect minWidth={122} value={foldType} onChange={v => setFoldType(v as FoldPick)} options={FOLD_OPTIONS} />
                        {foldType === 'custom' && (
                          <KInput placeholder="접기 문구" value={foldLabel} onChange={e => setFoldLabel(e.target.value)}
                            style={{ width: 130 }} />
                        )}
                      </div>
                      <div className="wpost">
                        {/* 누구로 쓸지 (커플홈 캐입) — 캐릭터가 있을 때만 */}
                        {charChoices.length > 0 && (
                          <KSelect minWidth={120} maxWidth={170} value={postPick ? optKey(postPick) : 'me'} onChange={setPostAs}
                            options={asOptions} />
                        )}
                        <button className="btn btn-dark" style={{ padding: '8px 20px', fontSize: 12, borderRadius: 20 }}
                          onClick={post}>POST</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 댓글 (v2.0 사용자 요청) — 게시판과 같은 모양: 한 단계 답글, 손님은 닉네임으로 */}
                <div className="thr-cmts">
                  <h4>COMMENTS {comments.length > 0 && <span>{comments.length}</span>}</h4>
                  {cmtRoots.map(c => (
                    <React.Fragment key={c.id}>
                      {[c, ...cmtChildren(c.id)].map((x, i) => (
                        <div key={x.id} className={`cmt ${i > 0 ? 'reply-depth' : ''}`}>
                          <CmtWho c={x} chars={chars} rels={rels} /><small>{fmtDate(x.date)}</small>
                          {i === 0 && (
                            <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8 }}
                              onClick={() => setReplyTo(replyTo === x.id ? null : x.id)}>
                              {replyTo === x.id ? '답글 취소' : '답글'}
                            </small>
                          )}
                          {/* 손님 댓글은 관리자만 지운다 (v2.0 확정) — 서버가 그렇게밖에 못 받는다 */}
                          {(isAdmin || (user && x.authorId === user.id)) && (
                            <small style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 8 }}
                              onClick={() => removeComment(x)}>삭제</small>
                          )}
                          <p>{x.text}</p>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                  {comments.length === 0 && <p className="hint" style={{ margin: 0 }}>첫 댓글을 남겨보세요</p>}
                </div>
                <div className={`cmt-input ${guestMode ? 'guest' : ''}`}>
                  {guestMode && <GuestIdBar name={gName} onName={setGName} />}
                  <div className="ci-row" style={guestMode ? undefined : { display: 'contents' }}>
                    {charChoices.length > 0 && user && (
                      <KSelect minWidth={120} maxWidth={160} value={speakPick ? optKey(speakPick) : 'me'} onChange={setAsChar}
                        options={asOptions} />
                    )}
                    <KInput placeholder={replyTo ? '답글 작성...' : '댓글 남기기...'} value={cmt}
                      onChange={e => setCmt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addComment(); }} />
                    <button className="btn btn-dark" onClick={addComment}>POST</button>
                  </div>
                </div>
              </>
            )}
          </div>
          {/* 우측 작품 리스트 */}
          <div className="panel" style={{ padding: 10 }}>
            {visible.map(w => (
              <div key={w.id} className={`thr-item ${sel?.id === w.id ? 'on' : ''}`} onClick={() => setSelId(w.id)}
                /* 우클릭 → 메뉴 → 삭제 확인 모달 (v2.0 사용자 요청) — 타래 보기의 오른쪽 카드에서도 */
                onContextMenu={e => { if (!canManageWork(w)) return; e.preventDefault(); setWCtx({ x: e.clientX, y: e.clientY, id: w.id }); }}>
                <div className="th">
                  <CroppedBlobImg fileRef={w.posterId} crop={w.posterCrop} ph={w.ph} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <b>{w.title}</b>
                  <small>{catLabel(cats, w.catId)} · 글 {postsOfW(w).length} · {fmtMD(lastDate(w, postRows))}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 글 수정 모달 — 텍스트 + 이미지 관리 (4장 제한) */}
      <Modal open={epId !== null} onClose={() => setEpId(null)} title="글 수정" dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEpId(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveEdit}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          {/* 누구로 쓴 글인지 (커플홈 캐입) — 내가 쓴 글이고 캐릭터가 있을 때만 */}
          {epMine && charChoices.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cp-lb">쓴 사람</span>
              <KSelect minWidth={140} maxWidth={200} value={epPick ? optKey(epPick) : 'me'} onChange={setEpAs} options={asOptions} />
            </div>
          )}
          <KTextarea style={{ minHeight: 120 }} value={epText} onChange={e => setEpText(e.target.value)} />
          {/* 접기 (v2.0 스포일러 쿠션) — 컴포저와 같은 선택지 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={epFoldType} onChange={v => setEpFoldType(v as FoldPick)} options={FOLD_OPTIONS} />
            {epFoldType === 'custom' && (
              <KInput placeholder="접기 문구" value={epFoldLabel} onChange={e => setEpFoldLabel(e.target.value)} style={{ flex: 1 }} />
            )}
          </div>
          {(epCount > 0) && (
            <div className="thr-att" style={{ padding: 0 }}>
              {epKeep.map(id => (
                <KeepThumb key={id} id={id} onRemove={() => setEpKeep(epKeep.filter(x => x !== id))} />
              ))}
              {epPh.map((ph, i) => (
                <div key={`ph${i}`} className={`at ph ${ph}`}>
                  <button onClick={() => setEpPh(epPh.filter((_, x) => x !== i))}>✕</button>
                </div>
              ))}
              {epUrls.map((u, i) => (
                <div key={u} className="at">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" />
                  <button onClick={() => {
                    const next = epFiles.filter((_, x) => x !== i);
                    setEpFiles(next);
                    setEpUrls(next.map(f => URL.createObjectURL(f)));
                  }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div>
            <input ref={epImgRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => { epAddFiles(e.target.files); e.target.value = ''; }} />
            <button className="icobtn" data-tip="사진 추가 (최대 4장)" onClick={() => epImgRef.current?.click()}>
              <PhotoIcon />
            </button>
          </div>
        </div>
      </Modal>
      {/* 타래 우클릭 메뉴 (v2.0 사용자 요청) — 여기서 골라야 삭제 확인 모달이 뜬다.
          카드에 hover transform이 있어 fixed 위치가 어긋나지 않게 body로 포탈 */}
      {wCtx && createPortal(
        (() => {
          const w = works.find(x => x.id === wCtx.id);
          return w ? (
            <div className="ctx-menu on" style={{ left: wCtx.x, top: wCtx.y }} onClick={e => e.stopPropagation()}>
              <div className="ctx-ttl">{w.title}</div>
              <button className="danger" onClick={() => { setWCtx(null); removeWork(w); }}>삭제</button>
            </div>
          ) : null;
        })(),
        document.body,
      )}
      {lb && <Lightbox srcs={lb.srcs} index={lb.idx} onClose={() => setLb(null)} />}
      {del.element}
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function ThreadsPage() {
  return <Suspense fallback={<section className="page" />}><ThreadsPageInner /></Suspense>;
}
