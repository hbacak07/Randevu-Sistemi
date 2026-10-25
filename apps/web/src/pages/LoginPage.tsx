import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Card, CardContent, Link, Stack, TextField, Typography } from '@mui/material';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface FormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { email: '', password: '' } });

  const login = useMutation({
    mutationFn: api.login,
    onSuccess: ({ token, user }) => {
      signIn(token, user);
      navigate(from, { replace: true });
    },
  });

  if (user) return <Navigate to={from} replace />;

  const fillDemo = (email: string) => {
    setValue('email', email);
    setValue('password', 'sifre123');
  };

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto' }}>
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>
            Giriş yap
          </Typography>

          <Stack component="form" spacing={2} onSubmit={handleSubmit((v) => login.mutate(v))} noValidate>
            {login.error && <Alert severity="error">{login.error.message}</Alert>}

            <TextField
              label="E-posta"
              type="email"
              autoComplete="email"
              error={!!errors.email}
              helperText={errors.email?.message}
              {...register('email', {
                required: 'E-posta gerekli',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Geçerli bir e-posta girin' },
              })}
            />
            <TextField
              label="Şifre"
              type="password"
              autoComplete="current-password"
              error={!!errors.password}
              helperText={errors.password?.message}
              {...register('password', { required: 'Şifre gerekli' })}
            />
            <Button type="submit" variant="contained" size="large" disabled={login.isPending}>
              {login.isPending ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </Button>

            <Typography variant="body2" color="text.secondary">
              Hesabın yok mu?{' '}
              <Link component={RouterLink} to="/kayit">
                Kayıt ol
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mt: 2, bgcolor: 'transparent' }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Demo hesaplar (seed sonrası)
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button size="small" variant="outlined" onClick={() => fillDemo('musteri@ornek.com')}>
              Müşteri
            </Button>
            <Button size="small" variant="outlined" onClick={() => fillDemo('doktor@ornek.com')}>
              Doktor
            </Button>
            <Button size="small" variant="outlined" onClick={() => fillDemo('berber@ornek.com')}>
              Berber
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
