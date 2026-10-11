'use client';
// 위젯 프레임 (4.0 편집모드) — 드래그 이동 · 우하단 리사이즈 · 우클릭 겹침 순서 · 클릭 차단
// 프로토타입의 편집 모델을 계승: 그리드 배치는 유지하고 transform 오프셋 + 크기 동결(px)로 조작
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { ConfirmModal } from '@/components/ui/Modal';

export function WidgetFrame({ conf, mobileOrder, children, className, style, onCtx }: {
  conf: WidgetConf;
  mobileOrder: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onCtx: (id: string, x: number, y: number) => void;
}) {
  const { editOn, gridOn, updateWidget } = useMainStore();
  // 메인은 항상 고정 캔버스 (v1.9 — 반응형 옵션 제거, PC/모바일 두 가지만) — 저장 크기 상시 유지
  const useSize = true;
  const ref = useRef<HTMLDivElement>(null);
  // Shift+드래그 중앙 정렬에서 폭이 20px 배수가 아니라 딱 가운데가 안 될 때의 안내 (v1.9 사용자 요청)
  const [centerAsk, setCenterAsk] = useState<{ w: number; canvasW: number; grow: number; shrink: number } | null>(null);

  // 편집모드 진입 시 크기 동결 (v1.8 — 위젯 크기 독립)
  // 렌더된 크기 그대로 동결 — 진입만으로 위젯이 움직이거나 커지지 않음
  // (격자 정렬은 절대 격자 스냅이 담당하므로 여기서 10px 반올림하지 않음)
  useEffect(() => {
    if (!editOn || !ref.current) return;
    if (conf.w == null || conf.h == null) {
      const r = ref.current.getBoundingClientRect();
      if (r.width > 2) {
        updateWidget(conf.id, {
          w: Math.max(160, Math.round(r.width)),
          h: Math.max(80, Math.round(r.height)),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOn]);

  // PC 절대배치 (v1.9 사용자 확정) — ax/ay가 있으면 캔버스 절대 좌표로 렌더.
  // 문서 흐름이 없으므로 드래그·리사이즈 때 다른 위젯이 절대 밀리지 않고, 안 맞으면 겹친다.
  const abs = conf.ax != null && conf.ay != null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editOn || e.button !== 0) return;
    const t = e.target as HTMLElement;
    // body 포털(설정 모달·셀렉트 팝업·컬러피커 등)은 리액트 트리로 버블돼 들어옴 — 드래그 시작 아님 (v1.9)
    if (!ref.current?.contains(t)) return;
    if (t.closest('.rs') || t.closest('.rr')) return;
    e.preventDefault();
    document.body.classList.add('drag-move');   // 드래그 중 전역 커서 고정 — 커서 튐 방지 (v1.9)
    const sx = e.clientX, sy = e.clientY;
    if (abs) {
      // 절대 좌표 이동 — 그리드 원점 = 캔버스 좌상단이라 스냅 계산도 단순
      const bx = conf.ax!, by = conf.ay!;
      // Shift+드래그 = 캔버스 가로 한가운데 정렬 (v1.9 사용자 요청)
      const canvasW = (ref.current?.closest('.main-grid') as HTMLElement | null)?.clientWidth ?? 0;
      const myW = () => conf.w ?? Math.round(ref.current?.getBoundingClientRect().width ?? 0);
      let centered = false;
      const mv = (ev: PointerEvent) => {
        const nx = bx + (ev.clientX - sx), ny = by + (ev.clientY - sy);
        const snap = gridOn && !conf.freeMove;   // freeMove(그리드 무시)는 그리드가 켜져 있어도 자유 배치
        if (ev.shiftKey && canvasW > 0) {
          centered = true;
          const cx = (canvasW - myW()) / 2;
          updateWidget(conf.id, {
            ax: snap ? Math.round(cx / 10) * 10 : Math.round(cx),
            ay: snap ? Math.round(ny / 10) * 10 : ny,
          });
          return;
        }
        centered = false;
        if (snap) updateWidget(conf.id, { ax: Math.round(nx / 10) * 10, ay: Math.round(ny / 10) * 10 });
        else updateWidget(conf.id, { ax: nx, ay: ny });
      };
      const up = () => {
        document.body.classList.remove('drag-move');
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        // 그리드(10px)에서 딱 가운데에 놓으려면 (캔버스폭 - 가로)가 20의 배수여야 함 — 아니면 5px 치우침
        if (centered && gridOn && !conf.freeMove && canvasW > 0) {
          const w = myW();
          const r = (((canvasW - w) % 20) + 20) % 20;
          if (r !== 0) setCenterAsk({ w, canvasW, grow: r, shrink: 20 - r });
        }
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
      return;
    }
    // (마이그레이션 전 폴백) 흐름 + transform 오프셋
    const bx = conf.tx, by = conf.ty;
    const gr = ref.current?.closest('.main-grid')?.getBoundingClientRect();
    const r0 = ref.current?.getBoundingClientRect();
    const natX = gr && r0 ? r0.left - bx - gr.left : 0;
    const natY = gr && r0 ? r0.top - by - gr.top : 0;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (gridOn && !conf.freeMove) {
        updateWidget(conf.id, {
          tx: Math.round((natX + bx + dx) / 10) * 10 - natX,
          ty: Math.round((natY + by + dy) / 10) * 10 - natY,
        });
      } else {
        updateWidget(conf.id, { tx: bx + dx, ty: by + dy });
      }
    };
    const up = () => { document.body.classList.remove('drag-move'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  // 기울기 (v1.9 사용자 요청 — 이미지·자유 텍스트) — 왼쪽 위 핸들 드래그로 위젯 중심 기준 회전
  const rotatable = conf.type === 'deco' || conf.type === 'freetext';
  const onRotDown = (e: React.PointerEvent) => {
    if (!editOn) return;
    e.stopPropagation(); e.preventDefault();
    const r = ref.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const base = conf.rot ?? 0;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    document.body.classList.add('drag-move');
    const mv = (ev: PointerEvent) => {
      let deg = base + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI;
      deg = gridOn && !conf.freeMove ? Math.round(deg / 5) * 5 : Math.round(deg);
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      updateWidget(conf.id, { rot: deg === 0 ? undefined : deg });
    };
    const up = () => { document.body.classList.remove('drag-move'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  // 리사이즈 — 절대배치라 흐름 재배치가 없어 실시간 적용해도 다른 위젯이 밀리지 않음 (v1.9)
  const onResizeDown = (e: React.PointerEvent) => {
    if (!editOn) return;
    e.stopPropagation(); e.preventDefault();
    document.body.classList.add('drag-rs');   // 리사이즈 중 전역 커서 고정 (v1.9)
    const r = ref.current!.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    // 절대 격자 스냅: 좌상단이 격자에서 벗어나 있어도 "우/하단 모서리"가 캔버스 격자 위에 놓이게
    const gr = ref.current!.closest('.main-grid')?.getBoundingClientRect();
    const absL = abs ? conf.ax! : (gr ? r.left - gr.left : 0);
    const absT = abs ? conf.ay! : (gr ? r.top - gr.top : 0);
    const mv = (ev: PointerEvent) => {
      const dw = ev.clientX - sx, dh = ev.clientY - sy;
      let w = r.width + dw, h = r.height + dh;
      if (gridOn && !conf.freeMove) {
        w = Math.round((absL + w) / 10) * 10 - absL;
        h = Math.round((absT + h) / 10) * 10 - absT;
      }
      updateWidget(conf.id, { w: Math.max(160, w), h: Math.max(80, h) });
    };
    const up = () => { document.body.classList.remove('drag-rs'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      data-wid={conf.id}
      className={`wgt ${useSize && conf.w != null ? 'sized' : ''} ${conf.mOff ? 'wgt-hide-m' : ''} ${className ?? ''}`}
      style={{
        ...style,
        order: mobileOrder,
        // 절대배치 (v1.9) — PC 캔버스에는 흐름 없음. 모바일 CSS가 static으로 되돌려 스택 렌더
        // 기울기(rot)는 transform에 합성 — 모바일 스택에서는 CSS가 해제 (v1.9)
        ...(abs
          ? {
            position: 'absolute' as const, left: conf.ax, top: conf.ay, margin: 0,
            transform: conf.rot ? `rotate(${conf.rot}deg)` : undefined,
          }
          : {
            transform: [
              conf.tx || conf.ty ? `translate(${conf.tx}px, ${conf.ty}px)` : '',
              conf.rot ? `rotate(${conf.rot}deg)` : '',
            ].join(' ').trim() || undefined,
          }),
        width: useSize && conf.w != null ? conf.w : undefined,
        height: useSize && conf.h != null ? conf.h : undefined,
        zIndex: conf.z,
      }}
      onPointerDown={onPointerDown}
      onContextMenu={e => {
        if (!editOn) return;
        if (!ref.current?.contains(e.target as Node)) return;   // 설정 모달 안 우클릭은 그대로
        e.preventDefault();
        onCtx(conf.id, e.clientX, e.clientY);
      }}
      // 편집모드 중 클릭 차단 (v1.8) — 단 body 포털(설정 모달 등)의 클릭은 통과 (v1.9)
      onClickCapture={e => {
        if (!editOn) return;
        const t = e.target as HTMLElement;
        if (!ref.current?.contains(t)) return;
        if (t.closest('.rs') || t.closest('.rr')) return;
        e.stopPropagation(); e.preventDefault();
      }}
    >
      {children}
      {/* Shift+드래그 중앙 정렬 — 폭이 안 맞아 5px 치우칠 때 가로를 어느 쪽으로 맞출지 (v1.9 사용자 요청) */}
      <ConfirmModal open={centerAsk !== null}
        title="가운데에 딱 맞추려면 가로 크기를 조정해야 합니다"
        body={centerAsk
          ? `그리드가 10px 단위라, 지금 가로(${centerAsk.w}px)로는 중앙에서 5px 치우칩니다. 가로를 어느 쪽으로 맞출까요?`
          : undefined}
        onClose={() => setCenterAsk(null)}
        buttons={[
          {
            label: `가로 +${centerAsk?.grow ?? 10}px`, kind: 'dark',
            onClick: () => {
              if (centerAsk) {
                const w = centerAsk.w + centerAsk.grow;
                updateWidget(conf.id, { w, ax: (centerAsk.canvasW - w) / 2 }, { persist: true });
              }
              setCenterAsk(null);
            },
          },
          {
            label: `가로 −${centerAsk?.shrink ?? 10}px`, kind: 'ghost',
            onClick: () => {
              if (centerAsk) {
                const w = Math.max(160, centerAsk.w - centerAsk.shrink);
                updateWidget(conf.id, { w, ax: (centerAsk.canvasW - w) / 2 }, { persist: true });
              }
              setCenterAsk(null);
            },
          },
          { label: '그대로 두기', kind: 'ghost', onClick: () => setCenterAsk(null) },
        ]} />
      <span className="rs" data-tip="드래그로 크기 조절" onPointerDown={onResizeDown} />
      {rotatable && (
        <span className="rr" data-tip="드래그로 기울기 · 더블클릭 = 초기화"
          onPointerDown={onRotDown}
          onDoubleClick={() => updateWidget(conf.id, { rot: undefined })} />
      )}
    </div>
  );
}
