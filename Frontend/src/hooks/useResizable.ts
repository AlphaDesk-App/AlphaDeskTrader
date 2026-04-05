import { useCallback, useEffect, useRef, useState } from 'react';

// Persists column widths and row heights to localStorage per table ID
const STORAGE_KEY = (id: string) => `alphaDesk_layout_${id}`;

export function useColumnWidths(tableId: string, defaults: number[]) {
  const [widths, setWidths] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(tableId));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === defaults.length) return parsed;
      }
    } catch {}
    return defaults;
  });

  const save = useCallback((w: number[]) => {
    setWidths(w);
    localStorage.setItem(STORAGE_KEY(tableId), JSON.stringify(w));
  }, [tableId]);

  const startResize = useCallback((colIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widths[colIndex];

    const onMove = (mv: MouseEvent) => {
      const delta = mv.clientX - startX;
      const newW  = Math.max(40, startW + delta);
      const next  = [...widths];
      next[colIndex] = newW;
      save(next);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [widths, save]);

  return { widths, startResize };
}

export function useRowHeight(tableId: string, defaultHeight = 38) {
  const [rowHeight, setRowHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(tableId) + '_rh');
      if (saved) return parseInt(saved);
    } catch {}
    return defaultHeight;
  });

  const save = useCallback((h: number) => {
    setRowHeight(h);
    localStorage.setItem(STORAGE_KEY(tableId) + '_rh', String(h));
  }, [tableId]);

  const startRowResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = rowHeight;

    const onMove = (mv: MouseEvent) => {
      const delta = mv.clientY - startY;
      save(Math.max(28, startH + delta));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [rowHeight, save]);

  return { rowHeight, startRowResize };
}

export function usePanelHeight(panelId: string, defaultHeight = 280) {
  const [height, setHeight] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY(panelId) + '_ph');
      if (saved) return parseInt(saved);
    } catch {}
    return defaultHeight;
  });

  const save = useCallback((h: number) => {
    setHeight(h);
    localStorage.setItem(STORAGE_KEY(panelId) + '_ph', String(h));
  }, [panelId]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;

    const onMove = (mv: MouseEvent) => {
      const delta = startY - mv.clientY; // dragging up = bigger panel
      save(Math.max(180, Math.min(600, startH + delta)));
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [height, save]);

  return { height, startDrag };
}
