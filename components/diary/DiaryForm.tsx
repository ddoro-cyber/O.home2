'use client';
// 일기 작성/수정 공용 폼 (4.14) — 제목 · 날짜 · 무드 · 내용(MD) · 이미지 · 공개범위
// 커플홈: 누구의 일기(캐릭터) · 구분 탭 · 임시 저장 (5분마다 자동, 버튼으로 바로)
import React, { useEffect, useRef, useState } from 'react';
import {
  DiaryPost, Mood, moodTint, DiaryCat,
  DiaryDraft, DIARY_DRAFT_EVERY, loadDiaryDraft, saveDiaryDraft, clearDiaryDraft,
} from '@/lib/diaryStore';
import { Visibility, Character } from '@/lib/charStore';
import { newId } from '@/lib/postStore';
import { KInput, KTextarea, KSelect, KDate } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { useConfirmDelete, ConfirmModal } from '@/components/ui/Modal';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

export interface DiaryFormValue {
  title: string; date: string; moodId: string; body: string;
  imgIds: string[]; visibility: Visibility;
  charId?: string;   // 누구의 일기 (커플홈) — 이 캐릭터 이름으로, 자관의 그 캐릭터 칸에 보인다
  catId?: string;    // 구분 탭 (커플홈)
}

interface ImgItem { id: string; ref?: string; url?: string; file?: File }

/** 임시 저장본의 내용 부분 (저장 시각 빼고) */
type DraftFields = Omit<DiaryDraft, 'savedAt'>;
const sameDraft = (a: DraftFields, b: DraftFields) =>
  a.title === b.title && a.date === b.date && a.moodId === b.moodId && a.body === b.body &&
  a.visibility === b.visibility && (a.charId ?? '') === (b.charId ?? '') && (a.catId ?? '') === (b.catId ?? '') &&
  a.imgIds.join('\n') === b.imgIds.join('\n');
/** 임시 저장 시각 — 오늘이면 시:분, 아니면 월/일 시:분 */
function fmtAt(iso: string) {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

function ImgThumb({ item }: { item: ImgItem }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6 }} /> : null;
}

export function DiaryForm({ initial, moods, cats, charChoices, initialCharId, initialCatId, lockChar, draftKey, onSave, onCancel }: {
  initial: DiaryPost | null;
  moods: Mood[];
  cats: DiaryCat[];
  /** 이 사람이 일기를 쓸 수 있는 캐릭터 (관리자는 자캐, 상대 오너는 권한 받은 캐릭터) */
  charChoices: Character[];
  /** 새 일기에서 먼저 골라 둘 캐릭터 — 칸 머리의 ＋ WRITE로 들어오면 그 칸 캐릭터 */
  initialCharId?: string;
  /** 새 일기에서 먼저 골라 둘 구분 — 보고 있던 구분 탭 */
  initialCatId?: string;
  /** 관리자가 남의 일기를 고칠 때 — 누구의 일기인지는 바꾸지 않는다 */
  lockChar?: boolean;
  /** 임시 저장 자리 (diaryDraftKey) — 없으면 임시 저장을 하지 않는다 */
  draftKey?: string;
  onSave: (v: DiaryFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const isNew = !initial;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // 처음 상태 — 새 일기는 빈 폼, 고치는 일기는 원래 글. 임시 저장본을 버리면 여기로 돌아간다
  const base = (): DraftFields => initial ? {
    title: initial.title, date: initial.date, moodId: initial.moodId, body: initial.body,
    imgIds: initial.imgIds ?? [], visibility: initial.visibility,
    charId: initial.charId || undefined, catId: initial.catId || undefined,
  } : {
    title: '', date: todayStr, moodId: moods[0]?.id ?? '', body: '', imgIds: [], visibility: 'public',
    charId: (initialCharId && charChoices.some(c => c.id === initialCharId) ? initialCharId : charChoices[0]?.id) || undefined,
    catId: initialCatId && cats.some(c => c.id === initialCatId) ? initialCatId : undefined,
  };
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? todayStr);
  const [moodId, setMoodId] = useState(initial?.moodId ?? moods[0]?.id ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [imgs, setImgs] = useState<ImgItem[]>(() => (initial?.imgIds ?? []).map(r => ({ id: newId(), ref: r })));
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [charId, setCharId] = useState<string>(
    initial?.charId ?? (initialCharId && charChoices.some(c => c.id === initialCharId) ? initialCharId : charChoices[0]?.id ?? ''));
  const [catId, setCatId] = useState<string>(
    initial?.catId ?? (initialCatId && cats.some(c => c.id === initialCatId) ? initialCatId : ''));
  // 구분 목록은 한 박자 늦게 읽힐 수 있다 — 새 일기면 도착했을 때 보고 있던 구분을 골라 둔다
  useEffect(() => {
    if (isNew && !catId && initialCatId && cats.some(c => c.id === initialCatId)) setCatId(initialCatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats]);
  const del = useConfirmDelete();   // 이미지 제거도 경고를 거친다

  /* ----- 임시 저장 (커플홈 사용자 요청 — 「중간 세이브 · 5분 간격 자동 저장」) -----
     지금 입력을 이 브라우저에 남긴다: 5분마다, 「지금 저장」을 누르면, 화면을 떠날 때(다른 메뉴·탭 숨김·창 닫기).
     새 일기는 다시 열면 바로 불러오고(빈 폼이라 잃을 게 없다), 고치던 일기는 원래 글이 있으니 물어본다.
     등록·저장을 마치면 지운다. 남길 게 없으면(새 일기가 비었거나 원래 글 그대로) 있던 것도 지운다 */
  const [draftAt, setDraftAt] = useState<string | null>(null);        // 마지막으로 남긴(불러온) 시각
  const [askDraft, setAskDraft] = useState<DiaryDraft | null>(null);  // 고치던 일기의 임시 저장본 — 불러올지 묻는 중
  const emptyOf = (s: DraftFields) => (isNew ? !s.title.trim() && !s.body.trim() : sameDraft(s, base()));
  const cur: DraftFields = {
    title, date, moodId, body,
    imgIds: imgs.filter(i => i.ref).map(i => i.ref!),   // 새로 고른 파일은 못 담는다
    visibility, charId: charId || undefined, catId: catId || undefined,
  };
  // 타이머·화면 떠날 때는 렌더 밖에서 읽으므로 ref에 둔다 (불러오기·버리기 직후 화면이 갱신되기 전에도 맞도록 거기서도 맞춘다)
  const curRef = useRef(cur);
  curRef.current = cur;
  const lastRef = useRef('');          // 마지막으로 남긴 내용 (JSON) — 같으면 다시 쓰지 않는다
  const doneRef = useRef(false);       // 등록·저장 끝 — 떠나면서 다시 남기지 않는다
  const restoredRef = useRef('');      // 이 자리의 임시 저장본을 이미 확인했다 (StrictMode 두 번 실행 대비)
  const apply = (s: DraftFields) => {
    setTitle(s.title); setDate(s.date); setMoodId(s.moodId); setBody(s.body); setVisibility(s.visibility);
    if (!lockChar && s.charId && charChoices.some(c => c.id === s.charId)) setCharId(s.charId);
    setCatId(s.catId ?? '');
    setImgs(s.imgIds.map(r => ({ id: newId(), ref: r })));
    curRef.current = s;
  };
  const persist = (manual = false) => {
    if (!draftKey || doneRef.current) return;
    const s = curRef.current;
    if (emptyOf(s)) {
      if (lastRef.current) { clearDiaryDraft(draftKey); lastRef.current = ''; setDraftAt(null); }
      if (manual) toast('남길 내용이 없어요');
      return;
    }
    const json = JSON.stringify(s);
    if (json === lastRef.current && !manual) return;   // 바뀐 게 없으면 조용히
    const at = new Date().toISOString();
    saveDiaryDraft(draftKey, { ...s, savedAt: at });
    lastRef.current = json;
    setDraftAt(at);
    if (manual) toast('임시 저장했어요');
  };
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const takeDraft = (d: DiaryDraft) => {
    const { savedAt, ...s } = d;
    apply(s);
    lastRef.current = JSON.stringify(s);
    setDraftAt(savedAt);
  };
  useEffect(() => {
    if (!draftKey || restoredRef.current === draftKey) return;
    restoredRef.current = draftKey;
    const d = loadDiaryDraft(draftKey);
    if (!d) return;
    if (isNew) { takeDraft(d); toast('임시 저장한 내용을 불러왔어요'); }
    else if (emptyOf(d)) clearDiaryDraft(draftKey);   // 원래 글과 같으면 남길 이유가 없다
    else setAskDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey) return;
    const tick = setInterval(() => persistRef.current(), DIARY_DRAFT_EVERY);
    const onHide = () => { if (document.visibilityState === 'hidden') persistRef.current(); };
    const onLeave = () => persistRef.current();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      persistRef.current();   // 다른 메뉴로 옮겨 가도 남긴다
    };
  }, [draftKey]);
  const discard = () => del.ask('임시 저장한 내용을 버릴까요?', () => {
    if (draftKey) clearDiaryDraft(draftKey);
    lastRef.current = '';
    setDraftAt(null);
    apply(base());   // 화면도 처음으로
    toast('임시 저장본을 버렸어요');
  }, '지금 쓰고 있던 내용도 처음 상태로 돌아갑니다.', '버리기');

  const save = async () => {
    if (!title.trim()) { toast('제목을 입력해 주세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('날짜를 YYYY-MM-DD 형식으로 입력해 주세요'); return; }
    const imgIds = await Promise.all(imgs.map(i => (i.file ? putBlob(i.file) : Promise.resolve(i.ref!))));
    // 등록됐으니 임시 저장본은 지운다 — 떠나면서 다시 남기지도 않는다
    doneRef.current = true;
    if (draftKey) clearDiaryDraft(draftKey);
    onSave({
      title: title.trim(), date, moodId, body, imgIds, visibility,
      charId: lockChar ? initial?.charId : (charId || undefined),
      catId: catId && cats.some(c => c.id === catId) ? catId : undefined,   // 임시 저장본에 남은 옛 구분은 버린다
    });
  };

  return (
    <div className="write-grid">
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <KInput placeholder="제목" value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          <KDate value={date} onChange={setDate} style={{ maxWidth: 130 }} />
        </div>
        {/* 구분 (커플홈). 「누구의 일기」 선택은 뺐다 (사용자 요청) — 일기 탭을 만들 때 어느 자관·AU인지
            이미 정해지고, 칸 머리의 ＋ WRITE가 그 칸 캐릭터(?char=)를 넘겨 주므로 고를 일이 없다.
            charId는 그 값(없으면 첫 캐릭터)으로 조용히 정해진다 */}
        {cats.length > 0 ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {cats.length > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="cp-lb">구분</span>
                <KSelect minWidth={120} value={catId} onChange={setCatId}
                  options={[{ value: '', label: '구분 없음' }, ...cats.map(c => ({ value: c.id, label: c.name }))]} />
              </div>
            )}
          </div>
        ) : null}
        <div>
          <label className="k-label" style={{ marginBottom: 6 }}>무드</label>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {moods.map(m => (
              <button key={m.id}
                className="mood-pick"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999,
                  border: `1.5px solid ${moodId === m.id ? m.color : 'var(--line)'}`,
                  background: moodId === m.id ? moodTint(m.color) : 'transparent',
                  fontSize: 12, transition: '.15s',
                }}
                onClick={() => setMoodId(m.id)}>
                <span style={{ color: m.color }}>{m.icon}</span> {m.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="k-label" style={{ marginBottom: 6 }}>내용 — 마크다운 지원</label>
          <KTextarea value={body} onChange={e => setBody(e.target.value)} style={{ minHeight: 180 }} />
        </div>
        <label className="k-label" style={{ margin: 0 }}>이미지 (선택) — 본문 아래에 순서대로 표시 · ⠿ 순서</label>
        {imgs.length > 0 && (
          <DragList items={imgs} keyOf={i => i.id} onReorder={setImgs}
            render={i => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <ImgThumb item={i} />
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('이 이미지를 빼시겠습니까?',
                    () => setImgs(l => l.filter(x => x.id !== i.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="dyImgF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => {
            const list = e.target.files;
            if (list) setImgs(prev => [...prev, ...Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }))]);
            e.target.value = '';
          }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          onClick={() => document.getElementById('dyImgF')?.click()}>＋ ADD IMAGE</button>
      </div>

      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>공개범위</h4>
          <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
            options={[
              { value: 'public', label: '전체공개' },
              { value: 'member', label: '멤버공개' },
              { value: 'private', label: '나만보기' },
            ]} />
          <p className="hint" style={{ marginTop: 8 }}>비공개 일기는 메인 「최근 일기」 위젯에 절대 노출되지 않습니다</p>
        </div>
        {draftKey && (
          <div className="panel widget dy-draft" style={{ marginBottom: 14 }}>
            <h4>임시 저장</h4>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }} onClick={() => persist(true)}>지금 저장</button>
              <span className="hint" style={{ margin: 0 }}>
                {draftAt
                  ? <>{fmtAt(draftAt)} 저장됨 · <span className="lnk" onClick={discard}>버리기</span></>
                  : '아직 저장 전'}
              </span>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              5분마다 자동으로 저장되고, 등록하면 지워집니다. 이 브라우저에만 남으며 새로 넣은 이미지는 담기지 않습니다
            </p>
          </div>
        )}
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'POST' : 'SAVE'}
          </button>
        </div>
      </div>
      {del.element}
      {/* 고치던 일기에 임시 저장본이 있을 때 — 원래 글을 덮어쓰는 일이라 물어본다. 둘 중 하나는 골라야 한다 */}
      <ConfirmModal open={askDraft !== null} title="임시 저장한 내용이 있어요" onClose={() => {}}
        body={askDraft ? `${fmtAt(askDraft.savedAt)}에 임시 저장한 내용을 불러올까요? 불러오지 않으면 임시 저장본은 지워집니다.` : undefined}
        buttons={[
          { label: '불러오기', kind: 'accent', onClick: () => { if (askDraft) takeDraft(askDraft); setAskDraft(null); } },
          { label: '지우기', kind: 'ghost', onClick: () => { if (draftKey) clearDiaryDraft(draftKey); setAskDraft(null); } },
        ]} />
    </div>
  );
}
