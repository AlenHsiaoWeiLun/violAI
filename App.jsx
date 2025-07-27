// src/App.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';
import './App.css';

function App() {
  const staticRef = useRef(null);
  const overlayRef = useRef(null);
  const [playTime, setPlayTime] = useState(0);

  // 1. 静态渲染：仅执行一次，绘制五线谱和音符
  useEffect(() => {
    const width = 400;
    const renderer = new Renderer(staticRef.current, Renderer.Backends.SVG);
    renderer.resize(500, 200);
    const ctx = renderer.getContext();

    // 五线谱
    const stave = new Stave(10, 40, width);
    stave.addClef('treble').addTimeSignature('4/4').setContext(ctx).draw();

    // 四个四分音符
    const notes = [
      new StaveNote({ keys: ['e/4'], duration: 'q' }),
      new StaveNote({ keys: ['d/4'], duration: 'q' }), // 目标高亮
      new StaveNote({ keys: ['c/4'], duration: 'q' }),
      new StaveNote({ keys: ['b/3'], duration: 'q' }),
    ];

    // 格式化并绘制音符
    const voice = new Voice({ num_beats: 4, beat_value: 4 }).addTickables(notes);
    new Formatter().joinVoices([voice]).format([voice], width);
    voice.draw(ctx, stave);

    // 缓存 notes 与 stave 以便 overlay 使用
    staticRef.current.vfNotes = notes;
    staticRef.current.stave = stave;
  }, []);

  // 2. 动画循环：4 秒一轮
  useEffect(() => {
    const loopTime = 4000;
    let start;
    let raf;
    const step = (t) => {
      if (!start) start = t;
      setPlayTime((t - start) % loopTime);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 3. Overlay 动态重绘
  useEffect(() => {
    const width = 400;
    const loopTime = 4000;
    const earlyMs = 250;     // 提前 250ms
    const highlightH = 6;    // 高亮条高度

    // 获取上下文和数据
    const notes = staticRef.current.vfNotes;
    const stave = staticRef.current.stave;
    const canvas = overlayRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 计算 play head X
    const playX = 10 + (playTime / loopTime) * width;

    // 红色高亮：仅第二个音符，水平延伸，尾端不越界，垂直对齐音符所在线
    const errIdx = 1;
    const bbErr = notes[errIdx].getBoundingBox();
    const onsetTime = 1000 - earlyMs;
    if (playTime >= onsetTime) {
      // 计算提前像素
      const earlyOffsetPx = (earlyMs / loopTime) * width;
      const startX = bbErr.getX() - earlyOffsetPx;
      const endX = Math.min(playX, bbErr.getX() + bbErr.getW());
      const w = Math.max(0, endX - startX);

      // 垂直位置 = note.getYs()[0]（音符头的 y），再向上 shift half highlight
      const dotYErr = notes[errIdx].getYs()[0];
      const y = dotYErr - highlightH / 2;

      ctx.fillStyle = 'rgba(255,0,0,0.3)';
      ctx.fillRect(startX, y, w, highlightH);
    }

    // 播放线
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playX, 40);
    ctx.lineTo(playX, 40 + stave.getHeight());
    ctx.stroke();

    // 蓝点：当前音符的 exact y
    const idx = Math.min(3, Math.floor(playTime / 1000));
    const dotY = notes[idx].getYs()[0];
    ctx.fillStyle = 'blue';
    ctx.beginPath();
    ctx.arc(playX, dotY, 4, 0, 2 * Math.PI);
    ctx.fill();
  }, [playTime]);

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h2>Violin Practice (Overlay Demo)</h2>
      <div style={{ position: 'relative', width: 500, height: 200 }}>
        {/* 静态 SVG 五线谱 */}
        <div ref={staticRef} style={{ position: 'absolute', top: 0, left: 0 }} />
        {/* 动态 Canvas Overlay */}
        <canvas
          ref={overlayRef}
          width={500}
          height={200}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />
      </div>
    </div>
  );
}

export default App;
