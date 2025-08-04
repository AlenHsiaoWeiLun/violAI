// src/App.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';
import './App.css';

/**
 * 模擬後端：根據播放時間生成演奏表現數據
 */
function generatePerformanceData({ playSec, notes, baseYs, baseX, pxPerSec, expectedStart, actualStart, actualEnd }) {
  const performanceData = {};
  // 三次貝塞爾輔助
  const getBezierPt = (tNorm, idx) => {
    const x0 = baseX + actualStart[idx] * pxPerSec;
    const x1 = baseX + actualEnd[idx] * pxPerSec;
    const y0 = baseYs[idx];
    const cp1x = x0 + (x1 - x0) * 0.3;
    const cp1y = y0 - 30;
    const cp2x = x0 + (x1 - x0) * 0.6;
    const cp2y = y0 - 15;
    const u = 1 - tNorm;
    const uu = u * u;
    const uuu = uu * u;
    const tt = tNorm * tNorm;
    const ttt = tt * tNorm;
    const x = uuu * x0 + 3 * uu * tNorm * cp1x + 3 * u * tt * cp2x + ttt * x1;
    const y = uuu * y0 + 3 * uu * tNorm * cp1y + 3 * u * tt * cp2y + ttt * y0;
    return { x, y };
  };

  notes.forEach((_, idx) => {
    const y0 = baseYs[idx];
    const nodes = [];
    switch (idx) {
      case 0:
        if (playSec >= actualStart[0] && playSec <= actualEnd[0]) {
          nodes.push({ t: playSec, offsetPx: 0, error: 'none' });
        }
        break;
      case 1:
        if (playSec >= actualStart[1] && playSec < expectedStart[1]) {
          nodes.push({ t: playSec, offsetPx: 0, error: 'early' });
        } else if (playSec >= expectedStart[1] && playSec <= actualEnd[1]) {
          nodes.push({ t: playSec, offsetPx: 0, error: 'none' });
        }
        break;
      case 2:
        // 音高曲線：累積每個段點
        const t0 = actualStart[2];
        const t1 = actualEnd[2];
        if (playSec >= t0) {
          const duration = t1 - t0;
          const elapsed = Math.min(playSec - t0, duration);
          const segments = 30;
          const currentSeg = Math.floor((elapsed / duration) * segments);
          for (let i = 0; i <= currentSeg; i++) {
            const tNorm = i / segments;
            const t = t0 + duration * tNorm;
            const pt = getBezierPt(tNorm, 2);
            const offsetPx = y0 - pt.y;
            const error = offsetPx > 5 ? 'curve' : 'none';
            nodes.push({ t, offsetPx, error });
          }
        }
        break;
      case 3:
        if (playSec >= actualEnd[3]) {
          nodes.push({ t: playSec, offsetPx: 0, error: 'miss' });
        } else if (playSec >= actualStart[3]) {
          nodes.push({ t: playSec, offsetPx: 0, error: 'none' });
        }
        break;
      default:
        break;
    }
    performanceData[idx] = nodes;
  });
  return performanceData;
}

export default function App() {
  const staticRef  = useRef(null);
  const overlayRef = useRef(null);
  const [playTime, setPlayTime] = useState(0);

  const actualStart   = [0, 0.8, 2, 3];
  const actualEnd     = [0.8, 2, 3, 3.6];
  const expectedStart = [0, 1, 2, 3];

  // 靜態渲染譜表與音符
  useEffect(() => {
    const staveWidth  = 600;
    const layoutWidth = 400;
    const renderer = new Renderer(staticRef.current, Renderer.Backends.SVG);
    renderer.resize(staveWidth, 200);
    const ctx = renderer.getContext();
    const stave = new Stave(10, 40, staveWidth);
    stave.addClef('treble').addTimeSignature('4/4').setContext(ctx).draw();

    const notes = [
      new StaveNote({ keys: ['e/4/x'], duration: 'q' })  // X 頭音符
        .setStyle({ fillStyle: 'red', strokeStyle: 'red' }),  // 紅框空心
      new StaveNote({ keys: ['d/4'], duration: 'q' }),
      new StaveNote({ keys: ['c/4'], duration: 'q' }),
      new StaveNote({ keys: ['b/3'], duration: 'q' }),
    ];
    

    const voice = new Voice({ num_beats: 4, beat_value: 4 }).addTickables(notes);
    new Formatter().joinVoices([voice]).format([voice], layoutWidth);
    voice.draw(ctx, stave);
    staticRef.current.vfNotes = notes;
    staticRef.current.stave   = stave;
  }, []);

  // 播放循環
  useEffect(() => {
    let start = null;
    const loop = 4000;
    const step = t => {
      if (!start) start = t;
      setPlayTime((t - start) % loop);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  // Overlay 動態繪製
  useEffect(() => {
    const notes = staticRef.current?.vfNotes;
    const stave = staticRef.current?.stave;
    if (!notes || !stave) return;

    const ctx = overlayRef.current.getContext('2d');
    ctx.clearRect(0, 0, 600, 200);

    const playSec = playTime / 1000;
    const pxPerSec = 400 / 4;
    const bb0 = notes[0].getBoundingBox();
    const baseX = bb0.getX();
    const baseYs = notes.map(n => n.getYs()[0]);
    const playX = baseX + playSec * pxPerSec;

    // 獲取性能數據
    const perf = generatePerformanceData({
      playSec, notes, baseYs, baseX, pxPerSec,
      expectedStart, actualStart, actualEnd
    });

    // 橘色曲線 (曲線誤差)
    const curvePts = perf[2].filter(n => n.error === 'curve')
                            .map(n => ({ x: baseX + n.t * pxPerSec, y: baseYs[2] - n.offsetPx }));
    if (curvePts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(curvePts[0].x, baseYs[2]);
      curvePts.forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.lineTo(curvePts[curvePts.length - 1].x, baseYs[2]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,165,0,0.3)';
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = 'orange';
      ctx.lineWidth = 2;
      curvePts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
    }

    // 紅色高亮 (提前)
    const i1 = 1;
    if (playSec >= actualStart[i1]) {
      const sx = baseX + actualStart[i1] * pxPerSec;
      const ex = baseX + expectedStart[i1] * pxPerSec;
      const w = Math.min(playX, ex) - sx;
      if (w > 0) {
        const y = baseYs[i1] - 3;
        ctx.fillStyle = 'rgba(255,0,0,0.3)';
        ctx.fillRect(sx, y, w, 6);
      }
    }

    // 紅點 (漏唱)
    const i3 = 3;
    if (playSec >= actualEnd[i3]) {
      const msx = baseX + actualEnd[i3] * pxPerSec;
      const y = baseYs[i3];
      ctx.fillStyle = 'rgba(255,0,0,0.8)';
      for (let x = msx; x < playX; x += 10) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // 播放頭
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playX, 40);
    ctx.lineTo(playX, 40 + stave.getHeight());
    ctx.stroke();

    // 藍點 (playhead)，第三個音符跟曲線同步
    const idx = actualStart.findIndex((s, i) => playSec >= s && playSec <= actualEnd[i]);
    if (idx !== -1) {
      ctx.fillStyle = 'blue';
      let dotX = playX;
      let dotY = baseYs[idx];

      if (idx === 2) {
        const nodes = perf[2];
        if (nodes && nodes.length) {
          const last = nodes[nodes.length - 1];
          dotX = baseX + last.t * pxPerSec;
          dotY = baseYs[2] - last.offsetPx;
        }
      }

      ctx.beginPath();
      ctx.arc(dotX, dotY, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }, [playTime]);

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>Violin Practice (Dynamic Feedback)</h2>
      <div style={{ position: 'relative', width: 600, height: 200 }}>
        <div ref={staticRef} style={{ position: 'absolute', top: 0, left: 0 }} />
        <canvas
          ref={overlayRef}
          width={600}
          height={200}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />
      </div>
    </div>
  );
}