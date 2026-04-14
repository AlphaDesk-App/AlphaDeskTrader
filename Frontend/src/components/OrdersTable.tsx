import { useEffect, useState } from 'react';
import { RefreshCw, XCircle } from 'lucide-react';
import { api } from '../services/api';

interface OrdersTableProps {
  accountHash: string;
}

const STATUS_COLORS: Record<string, string> = {
  WORKING: 'badge-blue',
  FILLED: 'badge-green',
  CANCELED: 'badge-amber',
  REJECTED: 'badge-red',
  PENDING_ACTIVATION: 'badge-amber',
};

export default function OrdersTable({ accountHash }: OrdersTableProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);

  const load = async () => {
    if (!accountHash) return;
    setLoading(true);
    try {
      const data = await api.getOrders(accountHash);
      setOrders(data ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [accountHash]);

  const cancel = async (orderId: number) => {
    setCancelling(orderId);
    try {
      await api.cancelOrder(accountHash, String(orderId));
      await load();
    } catch (e: any) {
      alert('Cancel failed: ' + e.message);
    } finally {
      setCancelling(null);
    }
  };

  if (loading) return (
    <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
      Loading orders...
    </div>
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
          ORDERS ({orders.length})
        </span>
        <button onClick={load} className="btn btn-secondary" style={{ padding: '5px 8px' }}>
          <RefreshCw size={12} />
        </button>
      </div>

      {orders.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No orders found</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Symbol', 'Side', 'Type', 'Qty', 'Filled', 'Price', 'Status', 'Time', ''].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Symbol' || h === '' ? 'left' : 'right', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order: any) => {
                const leg = order.orderLegCollection?.[0];
                const sym = leg?.instrument?.symbol ?? '--';
                const side = leg?.instruction ?? '--';
                const isWorking = order.status === 'WORKING' || order.status === 'PENDING_ACTIVATION';

                return (
                  <tr
                    key={order.orderId}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 14px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, fontSize: 13 }}>{sym}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: side === 'BUY' ? 'var(--green)' : 'var(--red)' }}>{side}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>{order.orderType}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{order.quantity}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>{order.filledQuantity}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}>
                      {order.price ? `$${order.price.toFixed(2)}` : 'MKT'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className={`badge ${STATUS_COLORS[order.status] ?? 'badge-amber'}`}>
                        {order.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {order.enteredTime ? new Date(order.enteredTime).toLocaleTimeString() : '--'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {isWorking && (
                        <button
                          onClick={() => cancel(order.orderId)}
                          disabled={cancelling === order.orderId}
                          style={{ background: 'var(--red-bg)', border: 'none', borderRadius: 5, padding: '4px 6px', cursor: 'pointer', color: 'var(--red)' }}
                        >
                          <XCircle size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
