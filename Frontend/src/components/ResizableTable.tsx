import { ReactNode } from 'react';
import { useColumnWidths, useRowHeight } from '../hooks/useResizable';

interface Column {
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

interface ResizableTableProps {
  tableId: string;
  columns: Column[];
  rows: any[];
  renderRow: (row: any, index: number, rowHeight: number) => ReactNode;
  emptyMessage?: string;
}

export default function ResizableTable({
  tableId, columns, rows, renderRow, emptyMessage = 'No data'
}: ResizableTableProps) {
  const defaults = columns.map(c => c.width);
  const { widths, startResize } = useColumnWidths(tableId, defaults);
  const { rowHeight, startRowResize } = useRowHeight(tableId);

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: widths.reduce((a, b) => a + b, 0) + 'px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {columns.map((col, i) => (
              <th key={i} style={{ width: widths[i], minWidth: widths[i], maxWidth: widths[i], padding: '8px 12px', textAlign: col.align ?? (i === 0 ? 'left' : 'right'), fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', position: 'relative', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {col.label}
                {/* Column resize handle */}
                <div
                  onMouseDown={e => startResize(i, e)}
                  style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                  title="Drag to resize column"
                >
                  <div style={{ width: 2, height: 14, background: 'var(--border-strong)', borderRadius: 1, opacity: 0.6 }} />
                </div>
              </th>
            ))}
            {/* Row height resize handle in header corner */}
            <th style={{ width: 16, padding: 0, position: 'relative' }}>
              <div
                onMouseDown={startRowResize}
                title="Drag to resize row height"
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <div style={{ width: 14, height: 2, background: 'var(--border-strong)', borderRadius: 1, opacity: 0.6 }} />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => renderRow(row, i, rowHeight))
          )}
        </tbody>
      </table>
    </div>
  );
}
