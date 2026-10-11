'use client';
// 디스코드 복사본 → 역극 로그 변환 패널 (커플홈 사용자 요청 — 따로 「가져오기」 버튼을 두지 말고 ＋ ADD LOG의 붙여넣기·직접 작성·
// 파일 첨부에 디스코드 복사본이 들어오면 알아서 구분해 파싱). ADD LOG 모달이 본문 글을 parseDiscordLog로 읽어 발화가 나오면 이 패널을
// 띄운다. 순서는 ① 자관·AU → ② 발화자 매칭 → ③ 모양 (사용자 요청: "디스코드로 읽히면 AU부터 선택하고 캐릭터를 선택하게").
// AU를 고르기 전에는 매칭 목록을 보여 주지 않는다 — 그 AU의 모습·이름으로 매칭해야 하므로. 저장은 모달의 add()가 renderLogSrc로 한다.
import React, { useEffect, useRef } from 'react';
import type { Character, Relation } from '@/lib/charStore';
import { guessChar, type DcMap, type DcParsed } from '@/lib/discordLog';
import { KSelect, KCheck } from '@/components/ui/Kit';

const DESC = '__desc', SKIP = '__skip';

/** 모달이 들고 있는 변환 설정 — convert를 끄면 디스코드 복사본이어도 글 그대로 저장한다 (자동 판별이 틀렸을 때) */
export interface DcOptions {
  convert: boolean;
  /** 자관의 AU(원본 설정 포함)를 골랐는가 — AU가 있는 자관은 이걸 골라야 매칭 목록이 열린다 */
  auPicked: boolean;
  map: DcMap;
  style: 'script' | 'imsg';
  fmt: 'html' | 'text';
  faces: boolean;
}
export const DC_DEFAULT: DcOptions = { convert: true, auPicked: false, map: {}, style: 'imsg', fmt: 'html', faces: true };

/** 아직 정하지 않은 발화자 */
export const dcUnmapped = (parsed: DcParsed, map: DcMap) => parsed.speakers.filter(s => !map[s.name]);

/** 그 자관의 AU 목록 (원본 제외) */
const ausOf = (rels: Relation[], relId: string) => rels.find(r => r.id === relId)?.aus.filter(a => a.id !== 'base') ?? [];

/** ①이 끝났는가 — 자관 없이 / AU가 없는 자관 / AU(또는 원본)를 고른 자관 */
export const dcReady = (rels: Relation[], relId: string, dc: DcOptions) =>
  relId === 'none' || (!!rels.find(r => r.id === relId) && (ausOf(rels, relId).length === 0 || dc.auPicked));

export function DiscordPanel({ parsed, rels, relId, auId, onRel, onAu, relChars, others, value, onChange }: {
  parsed: DcParsed;
  rels: Relation[];
  /** 모달의 자관·AU 값 (nRel/nAu) — 디스코드 변환 중에는 모달 위쪽 대신 여기서 고른다 */
  relId: string;
  auId: string;
  onRel: (relId: string) => void;
  onAu: (auId: string) => void;
  /** 고른 자관(·AU)의 캐릭터 — 목록 앞에, AU면 그 모습·이름 */
  relChars: Character[];
  /** 그 밖의 캐릭터 */
  others: Character[];
  value: DcOptions;
  onChange: (v: DcOptions) => void;
}) {
  const valueRef = useRef(value); valueRef.current = value;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onRelRef = useRef(onRel); onRelRef.current = onRel;

  // 자관을 아직 안 골랐으면 첫 자관으로 — 커플홈은 보통 하나라 AU 고르기부터 시작하게 (사용자 요청: "AU부터")
  useEffect(() => {
    if (relId === 'none' && rels.length) onRelRef.current(rels[0].id);
  }, [relId, rels]);

  const aus = ausOf(rels, relId);
  const ready = dcReady(rels, relId, value);

  // 발화자 목록·자관(AU)이 정해지면 아직 안 정한 것만 자동으로 채운다 (이름이 같은 캐릭터, 「-」는 지문).
  // value/onChange는 ref로 — 의존성에 넣으면 채울 때마다 다시 돌아 맴돈다
  useEffect(() => {
    if (!ready) return;
    const cur = valueRef.current;
    const next: DcMap = { ...cur.map };
    let changed = false;
    for (const s of parsed.speakers) {
      if (next[s.name]) continue;
      if (s.name.trim() === '-') { next[s.name] = { kind: 'desc' }; changed = true; continue; }
      const g = guessChar(s.name, [...relChars, ...others]);
      if (g) { next[s.name] = { kind: 'char', charId: g.id }; changed = true; }
    }
    if (changed) onChangeRef.current({ ...cur, map: next });
  }, [parsed, relChars, others, ready]);

  const set = (patch: Partial<DcOptions>) => onChange({ ...value, ...patch });
  const mapValue = (name: string) => { const m = value.map[name]; return !m ? '' : m.kind === 'char' ? m.charId : m.kind === 'desc' ? DESC : SKIP; };
  const setMapValue = (name: string, v: string) =>
    set({ map: { ...value.map, [name]: v === DESC ? { kind: 'desc' } : v === SKIP ? { kind: 'skip' } : { kind: 'char', charId: v } } });
  const charOptions = [
    { value: '', label: '선택…' },
    ...relChars.map(c => ({ value: c.id, label: c.name })),
    ...others.map(c => ({ value: c.id, label: `그 밖 · ${c.name}` })),
    { value: DESC, label: '지문(서술)으로' },
    { value: SKIP, label: '제외' },
  ];
  const unmapped = dcUnmapped(parsed, value.map);

  return (
    <div style={{ display: 'grid', gap: 8, padding: '10px 12px', border: '1px dashed var(--line)', borderRadius: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12 }}>디스코드 복사본으로 읽었습니다</b>
        <small className="hint" style={{ margin: 0 }}>발화 {parsed.messages.length}개 · 발화자 {parsed.speakers.length}명</small>
        <div className="mini-seg" style={{ marginLeft: 'auto' }}>
          <button className={value.convert ? 'on' : ''} onClick={() => set({ convert: true })}>역극 로그로 변환</button>
          <button className={!value.convert ? 'on' : ''} onClick={() => set({ convert: false })}>글 그대로</button>
        </div>
      </div>
      {value.convert && (
        <>
          {/* ① 자관·AU — 매칭 목록의 이름·사진·위치가 여기 따른다 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="cp-lb">① 자관 · AU</span>
            <KSelect minWidth={140} value={relId} placeholder="자관 선택…"
              onChange={v => { onRel(v); onAu('base'); set({ auPicked: false }); }}
              options={[...rels.map(r => ({ value: r.id, label: r.name })), { value: 'none', label: '자관 없이 (단발)' }]} />
            {aus.length > 0 && (
              <KSelect minWidth={130} value={value.auPicked ? auId : ''} placeholder="AU 선택…"
                onChange={v => { onAu(v); set({ auPicked: true }); }}
                options={[{ value: 'base', label: '원본 설정' }, ...aus.map(a => ({ value: a.id, label: a.label || 'AU' }))]} />
            )}
            {!ready && <small className="hint" style={{ margin: 0 }}>{aus.length ? 'AU(또는 원본 설정)를 고르면 그 모습·이름으로 발화자를 매칭합니다' : '자관을 고르면 그 캐릭터로 발화자를 매칭합니다'}</small>}
          </div>
          {ready && (
            <>
              {/* ② 발화자 매칭 — 고른 자관(AU)의 캐릭터가 먼저 */}
              <div style={{ display: 'grid', gap: 4 }}>
                <label className="k-label" style={{ margin: 0 }}>② 발화자 매칭 — 등장인물마다 누구인지</label>
                {parsed.speakers.map(s => (
                  <div key={s.name} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
                    <b style={{ fontSize: 12.5, minWidth: 90 }}>{s.name === '-' ? '－ (구분선)' : s.name}</b>
                    <small style={{ color: 'var(--faint)' }}>{s.count}개</small>
                    <div style={{ marginLeft: 'auto' }}>
                      <KSelect minWidth={170} value={mapValue(s.name)} onChange={v => setMapValue(s.name, v)} options={charOptions} />
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                    onClick={() => window.open('/chars/new?next=/log', '_blank')}>＋ 캐릭터 추가 (새 탭)</button>
                  <small className="hint" style={{ margin: 0 }}>
                    맞는 캐릭터가 없으면 새 탭에서 등록한 뒤 여기 목록에서 고르면 됩니다 · 지문(서술)이나 제외로 둘 수도
                    {unmapped.length > 0 && <> · <span style={{ color: 'var(--accent)' }}>아직 정하지 않은 발화자 {unmapped.length}명</span></>}
                  </small>
                </div>
              </div>
              {/* ③ 모양 — 프로필 사진은 메신저·대본 모두 (사용자 요청) */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="cp-lb">③ 모양</span>
                <div className="mini-seg">
                  <button className={value.style === 'imsg' ? 'on' : ''} onClick={() => set({ style: 'imsg' })}>메신저</button>
                  <button className={value.style === 'script' ? 'on' : ''} onClick={() => set({ style: 'script' })}>대본</button>
                </div>
                <div className="mini-seg">
                  <button className={value.fmt === 'html' ? 'on' : ''} onClick={() => set({ fmt: 'html' })}>HTML</button>
                  <button className={value.fmt === 'text' ? 'on' : ''} onClick={() => set({ fmt: 'text' })}>텍스트</button>
                </div>
                {value.fmt === 'html' && <KCheck label="프로필 사진" checked={value.faces} onChange={v => set({ faces: v })} />}
              </div>
              <p className="hint" style={{ margin: 0 }}>
                매칭된 캐릭터의 사진·이름·테마색이 그대로 들어가고, 시각·날짜는 남기지 않습니다(이름과 내용만). 메신저 모양의 좌우는 보는 사람 기준.
                타이틀을 비우면 「자관 이름 로그」, 같이 간 사람을 비우면 말한 캐릭터 이름이 들어갑니다. 올린 뒤에도 EDIT에서 모양을, 「편집모드」에서 발화 하나하나를 고칠 수 있습니다.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
