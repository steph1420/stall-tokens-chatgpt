// Offline QR (F-15): qrcode-generator draws the upi:// link as SVG rects. No network.
import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

export function Qr({ text, label }: { text: string; label: string }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const size = q.getModuleCount();
    let path = '';
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (q.isDark(r, c)) path += `M${String(c)} ${String(r)}h1v1h-1z`;
    return { n: size, d: path };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${String(n)} ${String(n)}`} role="img" aria-label={label} shapeRendering="crispEdges" data-qr={text}>
      <path d={d} fill="currentColor" />
    </svg>
  );
}
