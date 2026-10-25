import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertTitle, Snackbar } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import type { AppNotification } from '../api/types';

/**
 * SSE ile kişisel bildirimleri dinler.
 * EventSource bağlantı koparsa kendiliğinden yeniden bağlanır — ekstra kod gerekmez.
 */

interface NotificationsState {
  items: AppNotification[];
  unread: number;
  connected: boolean;
  markAllRead: () => void;
}

const Ctx = createContext<NotificationsState | null>(null);

const severity: Record<AppNotification['type'], 'success' | 'info' | 'warning'> = {
  BOOKING_CONFIRMED: 'success',
  NEW_BOOKING: 'success',
  BOOKING_CANCELLED: 'warning',
  REMINDER: 'info',
};

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setItems([]);
      setUnread(0);
      return;
    }

    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('ready', () => setConnected(true));
    es.onerror = () => setConnected(false);

    es.addEventListener('notification', (e) => {
      const n: AppNotification = JSON.parse((e as MessageEvent).data);
      setItems((prev) => [n, ...prev].slice(0, 30));
      setUnread((u) => u + 1);
      setToast(n);
      // Randevu listesi ekrandaysa tazelensin
      qc.invalidateQueries({ queryKey: ['bookings'] });
    });

    return () => {
      es.close();
      setConnected(false);
    };
  }, [token, qc]);

  const markAllRead = useCallback(() => setUnread(0), []);

  return (
    <Ctx.Provider value={{ items, unread, connected, markAllRead }}>
      {children}
      <Snackbar
        open={!!toast}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={severity[toast.type]} variant="filled" onClose={() => setToast(null)} sx={{ maxWidth: 420 }}>
            <AlertTitle>{toast.title}</AlertTitle>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Ctx.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications, NotificationsProvider içinde kullanılmalı');
  return ctx;
}
