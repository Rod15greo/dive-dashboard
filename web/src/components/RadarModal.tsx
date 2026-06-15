import { useEffect, useRef } from 'react';
import { Chart, RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip } from 'chart.js';
import { DashboardMember } from '../types';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip);

interface Props {
  member: DashboardMember | null;
  onClose: () => void;
}

export default function RadarModal({ member, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef  = useRef<Chart | null>(null);

  useEffect(() => {
    if (!member || !canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();
    const bd = member.breakdown;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'radar',
      data: {
        labels: ['Entrega', 'Atividade', 'Presença', 'Colaboração'],
        datasets: [{
          data: [Math.round(bd.deliveryPts), Math.round(bd.activityPts), Math.round(bd.presencePts), Math.round(bd.collabPts)],
          backgroundColor: 'rgba(56,189,248,.15)',
          borderColor: '#38bdf8',
          pointBackgroundColor: '#38bdf8',
          borderWidth: 2,
        }],
      },
      options: {
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { color: '#475569', stepSize: 25 },
            grid: { color: '#334155' },
            pointLabels: { color: '#94a3b8', font: { size: 12 } },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
    return () => chartRef.current?.destroy();
  }, [member]);

  if (!member) return null;

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.box} onClick={e => e.stopPropagation()}>
        <button style={s.close} onClick={onClose}>✕</button>
        <h3 style={s.title}>{member.name}</h3>
        <p style={s.sub}>{member.role} · Score v2: <strong style={{ color: '#38bdf8' }}>{member.breakdown.score}</strong></p>

        <div style={s.dims}>
          {[
            { label: 'Entrega',       val: member.breakdown.deliveryPts, color: '#4ade80' },
            { label: 'Atividade',     val: member.breakdown.activityPts, color: '#38bdf8' },
            { label: 'Presença',      val: member.breakdown.presencePts, color: '#a78bfa' },
            { label: 'Colaboração',   val: member.breakdown.collabPts,   color: '#fb923c' },
          ].map(d => (
            <div key={d.label} style={s.dim}>
              <span style={{ color: d.color, fontWeight: 700 }}>{Math.round(d.val)}</span>
              <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{d.label}</span>
            </div>
          ))}
        </div>

        <canvas ref={canvasRef} style={{ maxWidth: 300, margin: '0 auto', display: 'block' }} />

      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { background: '#1e293b', borderRadius: 16, padding: 28, maxWidth: 400, width: '100%', position: 'relative', border: '1px solid #334155' },
  close: { position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' },
  title: { color: '#e2e8f0', marginBottom: 4, fontSize: '1.1rem', fontWeight: 700 },
  sub: { color: '#64748b', fontSize: '0.85rem', marginBottom: 20 },
  dims: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 },
  dim: { background: '#0f172a', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2, fontSize: '1.1rem' },
};
