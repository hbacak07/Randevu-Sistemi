import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Box,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { api } from '../api/client';
import { formatPrice } from '../lib/format';

export function ProvidersPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['providers'], queryFn: api.providers });

  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="h4">Hizmet verenler</Typography>
        <Typography color="text.secondary">Birini seç, boş saatleri canlı gör ve randevunu al.</Typography>
      </div>

      {error && <Alert severity="error">{error.message}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        {isLoading &&
          [0, 1].map((i) => (
            <Skeleton key={i} variant="rounded" height={140} />
          ))}

        {data?.map((p) => (
            <Card key={p.id} sx={{ height: '100%' }}>
              <CardActionArea component={RouterLink} to={`/hizmet-veren/${p.id}`} sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>{p.name.charAt(0)}</Avatar>
                    <div>
                      <Typography variant="h6">{p.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {p.timezone}
                      </Typography>
                    </div>
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {p.services.map((s) => (
                      <Chip
                        key={s.id}
                        size="small"
                        variant="outlined"
                        label={`${s.name} · ${s.durationMin} dk · ${formatPrice(s.priceCents)}`}
                      />
                    ))}
                    {p.services.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Henüz hizmet eklenmemiş
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
        ))}
      </Box>

      {data?.length === 0 && <Alert severity="info">Henüz hizmet veren yok. `npm run db:seed` ile demo verisi ekleyebilirsin.</Alert>}
    </Stack>
  );
}
