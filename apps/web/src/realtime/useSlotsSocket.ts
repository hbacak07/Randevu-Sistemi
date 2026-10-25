import { useEffect, useRef, useState } from 'react';

/**
 * WebSocket ile bir hizmet verenin takvimini izler.
 * Biri slot alınca/iptal edince `onChange(date)` çağrılır.
 * Bağlantı koparsa artan bekleme süresiyle (1s, 2s, 4s... en fazla 15s) yeniden bağlanır.
 */
export function useSlotsSocket(providerId: string | undefined, onChange: (date: string) => void) {
  const [connected, setConnected] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!providerId) return;

    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ws!.send(JSON.stringify({ type: 'subscribe', providerId }));
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'slots-changed' && msg.providerId === providerId) onChangeRef.current(msg.date);
        } catch {
          /* yok say */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (stopped) return;
        timer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** retry++));
      };
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [providerId]);

  return { connected };
}
