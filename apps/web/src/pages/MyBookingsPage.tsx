import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime, formatPrice } from '../lib/format';

export function MyBookingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const isProvider = user?.role === 'PROVIDER';

  const bookings = useQuery({ queryKey: ['bookings', scope], queryFn: () => api.myBookings(scope) });

  const cancel = useMutation({
    mutationFn: api.cancelBooking,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h4">{isProvider ? 'Takvimim' : 'Randevularım'}</Typography>
        <Typography color="text.secondary">
          {isProvider ? 'Size alınan randevular. Yeni randevular anında bildirim olarak düşer.' : 'Randevudan önce hatırlatma bildirimi alırsınız.'}
        </Typography>
      </div>

      <Tabs value={scope} onChange={(_, v) => setScope(v)}>
        <Tab value="upcoming" label="Yaklaşan" />
        <Tab value="past" label="Geçmiş" />
      </Tabs>

      {bookings.error && <Alert severity="error">{bookings.error.message}</Alert>}
      {cancel.error && <Alert severity="error">{cancel.error.message}</Alert>}
      {bookings.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={96} />)}
      {bookings.data?.length === 0 && <Alert severity="info">Burada henüz randevu yok.</Alert>}

      {bookings.data?.map((b) => {
        const cancelled = b.status === 'CANCELLED';
        return (
          <Card key={b.id} sx={{ opacity: cancelled ? 0.6 : 1 }}>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
                <div>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h6">{b.service.name}</Typography>
                    {cancelled ? (
                      <Chip size="small" label="İptal" color="default" />
                    ) : (
                      <Chip size="small" label="Onaylı" color="success" variant="outlined" />
                    )}
                  </Stack>
                  <Typography color="text.secondary">
                    {isProvider ? `${b.customer.name} (${b.customer.email})` : b.provider.name}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {formatDateTime(b.startsAt, user?.timezone ?? b.provider.timezone)} · {b.service.durationMin} dk ·{' '}
                    {formatPrice(b.service.priceCents)}
                  </Typography>
                </div>

                {scope === 'upcoming' && !cancelled && (
                  <Button
                    color="secondary"
                    variant="outlined"
                    sx={{ alignSelf: { sm: 'center' } }}
                    disabled={cancel.isPending && cancel.variables === b.id}
                    onClick={() => {
                      if (confirm('Bu randevuyu iptal etmek istediğinize emin misiniz?')) cancel.mutate(b.id);
                    }}
                  >
                    İptal et
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
