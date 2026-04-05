import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { DateFilter, DateRange, DATE_RANGE_LABELS } from '../utils/dateFilter';

interface DateFilterBarProps {
  filter: DateFilter;
  onChange: (f: DateFilter) => void;
}

const RANGES: DateRange[] = ['today','yesterday','this_week','last_7','last_week','this_month','last_month','ytd','custom'];

export default function DateFilterBar({ filter, onChange }: DateFilterBarProps) {
  const [showCustom, setShowCustom] = useState(false);

  const select = (range: DateRange) => {
    if (range === 'custom') { setShowCustom(true); onChange({ ...filter, range }); }
    else { setShowCustom(false); onChange({ range }); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Calendar size={13} color="var(--text-muted)" />
      <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: 8, padding: 3, gap: 2, flexWrap: 'wrap' }}>
        {RANGES.map(r => (
          <button key={r} onClick={() => select(r)}
            style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap',
              background: filter.range === r ? 'var(--accent)' : 'transparent',
              color: filter.range === r ? 'white' : 'var(--text-muted)',
            }}
          >{DATE_RANGE_LABELS[r]}</button>
        ))}
      </div>

      {filter.range === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="date" value={filter.customStart ?? ''}
            onChange={e => onChange({ ...filter, customStart: e.target.value })}
            style={{ fontSize: 12, padding: '5px 8px' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
          <input type="date" value={filter.customEnd ?? ''}
            onChange={e => onChange({ ...filter, customEnd: e.target.value })}
            style={{ fontSize: 12, padding: '5px 8px' }}
          />
        </div>
      )}
    </div>
  );
}
