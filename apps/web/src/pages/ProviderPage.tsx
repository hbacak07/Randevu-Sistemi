import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import FiberManualRecord from '@mui/icons-material/FiberManualRecord';
import { DateTime } from 'luxon';
import { api, ApiError } from '../api/client';
import type { Slot } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useSlotsSocket } from '../realtime/useSlotsSocket';
import { formatDateTime, formatPrice, todayIn } from '../lib/format';

export function ProviderPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const provider = useQuery({ queryKey: ['provider', id], queryFn: () => api.provider(id!), enabled: !!id });
  const tz = provider.data?.timezone ?? 'Europe/Istanbul';

  const [serviceId, setServiceId] = useState<string>();
  const [date, setDate] = useState(() => todayIn('Europe/Istanbul'));
  const [selected, setSelected] = useState<Slot | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // İlk hizmeti otomatik seç
  useEffect(() => {
    if (!serviceId && provider.data?.services[0]) setServiceId(provider.data.services[0].id);
  }, [provider.data, serviceId]);

  const availabilityKey = ['availability', id, serviceId, date];
  const availability = useQuery({
    queryKey: availabilityKey,
    queryFn: () => api.availability(id!, serviceId!, date),
    enabled: !!id && !!serviceId,
  });

  // WebSocket: başka biri bu takvimde değişiklik yaparsa slotları yeniden çek
  const { connected } = useSlotsSocket(id, (changedDate) => {
    qc.invalidateQueries({
      queryKey: ['availability', id],
      predicate: (q) => q.queryKey[3] === changedDate, // yalnızca değişen günün verisi
    });
  });

  const book = useMutation({
    mutationFn: (slot: Slot) => api.createBooking({ serviceId: serviceId!, startsAt: slot.startsAt }),
    onSuccess: () => {
      setSelected(null);
      qc.invalidateQueries({ queryKey: ['bookings'] });
      navigate('/randevularim');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setSelected(null);
        setFlash(err.message);
        qc.invalidateQueries({ queryKey: availabilityKey });
      }
    },
  });

  const today = todayIn(tz);
  const shiftDay = (n: number) => setDate(DateTime.fromISO(date).plus({ days: n }).toISODate()!);
  const service = provider.data?.services.find((s) => s.id === serviceId);

  if (provider.error) return <Alert severity="error">{provider.error.message}</Alert>;

  return (
    <Stack spacing={3}>
      <div>
        {provider.isLoading ? (
          <Skeleton width={240} height={48} />
        ) : (
          <Typography variant="h4">{provider.data?.name}</Typography>
        )}
        <Stack direction="row" spacing={1} alignItems="center">
          <FiberManualRecord sx={{ fontSize: 10, color: connected ? 'success.main' : 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary">
            {connected ? 'Canlı — boş saatler anlık güncelleniyor' : 'Canlı bağlantı kuruluyor…'} · Saatler {tz} saatine göre
          </Typography>
        </Stack>
      </div>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            1. Hizmet seç
          </Typography>
          <ToggleButtonGroup
            exclusive
            color="primary"
            value={serviceId ?? null}
            onChange={(_, v) => v && setServiceId(v)}
            sx={{ flexWrap: 'wrap' }}
          >
            {provider.data?.services.map((s) => (
              <ToggleButton key={s.id} value={s.id} sx={{ flexDirection: 'column', alignItems: 'flex-start', px: 2 }}>
                <span>{s.name}</span>
                <Typography variant="caption" color="text.secondary">
                  {s.durationMin} dk · {formatPrice(s.priceCents)}
                </Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            2. Gün ve saat seç
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <IconButton aria-label="Önceki gün" onClick={() => shiftDay(-1)} disabled={date <= today}>
              <ChevronLeft />
            </IconButton>
            <TextField
              type="date"
              size="small"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              slotProps={{ htmlInput: { min: today } }}
            />
            <IconButton aria-label="Sonraki gün" onClick={() => shiftDay(1)}>
              <ChevronRight />
            </IconButton>
            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              {DateTime.fromISO(date).setLocale('tr').toFormat('cccc')}
            </Typography>
          </Stack>

          {flash && (
            <Alert severity="warning" onClose={() => setFlash(null)} sx={{ mb: 2 }}>
              {flash}
            </Alert>
          )}

          {availability.isLoading && <Skeleton variant="rounded" height={120} />}

          {availability.data && availability.data.slots.length === 0 && (
            <Alert severity="info">Bu gün kapalı. Başka bir gün seçin.</Alert>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 1 }}>
            {availability.data?.slots.map((slot) => (
              <Button
                key={slot.startsAt}
                variant={slot.available ? 'outlined' : 'text'}
                disabled={!slot.available || user?.role !== 'CUSTOMER'}
                onClick={() => setSelected(slot)}
                sx={{ textDecoration: slot.available ? 'none' : 'line-through' }}
              >
                {slot.label}
              </Button>
            ))}
          </Box>

          {user?.role === 'PROVIDER' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Hizmet veren hesabıyla randevu alınamaz. Müşteri hesabıyla giriş yapın.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onClose={() => !book.isPending && setSelected(null)}>
        <DialogTitle>Randevuyu onayla</DialogTitle>
        <DialogContent>
          {selected && service && (
            <Stack spacing={1}>
              <Typography>
                <strong>{service.name}</strong> — {provider.data?.name}
              </Typography>
              <Typography>{formatDateTime(selected.startsAt, tz)}</Typography>
              <Stack direction="row" spacing={1}>
                <Chip size="small" label={`${service.durationMin} dakika`} />
                <Chip size="small" label={formatPrice(service.priceCents)} />
              </Stack>
              {book.error && !(book.error instanceof ApiError && book.error.status === 409) && (
                <Alert severity="error">{book.error.message}</Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)} disabled={book.isPending}>
            Vazgeç
          </Button>
          <Button variant="contained" onClick={() => selected && book.mutate(selected)} disabled={book.isPending}>
            {book.isPending ? 'Kaydediliyor…' : 'Onayla'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
