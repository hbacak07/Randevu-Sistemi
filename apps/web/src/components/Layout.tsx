import { useState } from 'react';
import { Link as RouterLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import EventAvailable from '@mui/icons-material/EventAvailable';
import { DateTime } from 'luxon';
import { useAuth } from '../auth/AuthContext';
import { useNotifications } from '../realtime/NotificationsContext';

export function Layout() {
  const { user, signOut } = useAuth();
  const { items, unread, connected, markAllRead } = useNotifications();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <EventAvailable color="primary" />
          <Typography
            component={RouterLink}
            to="/"
            variant="h6"
            sx={{ color: 'text.primary', textDecoration: 'none', flexGrow: 1 }}
          >
            Randevu
          </Typography>

          {user ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Button component={RouterLink} to="/">
                Hizmet verenler
              </Button>
              <Button component={RouterLink} to="/randevularim">
                {user.role === 'PROVIDER' ? 'Takvimim' : 'Randevularım'}
              </Button>

              <Tooltip title={connected ? 'Canlı bildirimler açık' : 'Bildirim bağlantısı yok'}>
                <IconButton
                  aria-label="Bildirimler"
                  onClick={(e) => {
                    setAnchor(e.currentTarget);
                    markAllRead();
                  }}
                >
                  <Badge badgeContent={unread} color="secondary">
                    <NotificationsOutlined color={connected ? 'inherit' : 'disabled'} />
                  </Badge>
                </IconButton>
              </Tooltip>

              <Button
                color="inherit"
                onClick={() => {
                  signOut();
                  navigate('/giris');
                }}
              >
                Çıkış
              </Button>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1}>
              <Button component={RouterLink} to="/giris">
                Giriş
              </Button>
              <Button component={RouterLink} to="/kayit" variant="contained">
                Kayıt ol
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 360, maxHeight: 420 } } }}
      >
        <Typography variant="subtitle2" sx={{ px: 2, py: 1 }}>
          Bildirimler
        </Typography>
        <Divider />
        {items.length === 0 && (
          <MenuItem disabled>
            <Typography variant="body2">Henüz bildirim yok</Typography>
          </MenuItem>
        )}
        {items.map((n) => (
          <MenuItem key={n.id} sx={{ whiteSpace: 'normal', display: 'block' }} onClick={() => setAnchor(null)}>
            <Typography variant="body2" fontWeight={600}>
              {n.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {n.message}
            </Typography>
            <Typography variant="caption" color="text.disabled">
              {DateTime.fromISO(n.createdAt).setLocale('tr').toRelative()}
            </Typography>
          </MenuItem>
        ))}
      </Menu>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
