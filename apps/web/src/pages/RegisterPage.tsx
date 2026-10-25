import { Controller, useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Link as RouterLink, Navigate, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { userTimezone } from '../lib/format';
import type { Role } from '../api/types';

interface FormValues {
  name: string;
  email: string;
  password: string;
  role: Role;
}

export function RegisterPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { name: '', email: '', password: '', role: 'CUSTOMER' } });

  const signup = useMutation({
    mutationFn: (v: FormValues) => api.register({ ...v, timezone: userTimezone() }),
    onSuccess: ({ token, user }) => {
      signIn(token, user);
      navigate('/', { replace: true });
    },
    onError: (err) => {
      // Sunucudaki Joi doğrulama hatalarını ilgili alanın altında göster
      if (err instanceof ApiError && err.details) {
        for (const d of err.details) {
          if (['name', 'email', 'password'].includes(d.field)) {
            setError(d.field as keyof FormValues, { message: d.message });
          }
        }
      }
    },
  });

  if (user) return <Navigate to="/" replace />;

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto' }}>
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>
            Kayıt ol
          </Typography>

          <Stack component="form" spacing={2} onSubmit={handleSubmit((v) => signup.mutate(v))} noValidate>
            {signup.error && !(signup.error instanceof ApiError && signup.error.details) && (
              <Alert severity="error">{signup.error.message}</Alert>
            )}

            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  color="primary"
                  value={field.value}
                  onChange={(_, v) => v && field.onChange(v)}
                >
                  <ToggleButton value="CUSTOMER">Randevu almak istiyorum</ToggleButton>
                  <ToggleButton value="PROVIDER">Hizmet veriyorum</ToggleButton>
                </ToggleButtonGroup>
              )}
            />

            <TextField
              label="Ad soyad"
              error={!!errors.name}
              helperText={errors.name?.message}
              {...register('name', { required: 'Ad gerekli', minLength: { value: 2, message: 'En az 2 karakter' } })}
            />
            <TextField
              label="E-posta"
              type="email"
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
              autoComplete="new-password"
              error={!!errors.password}
              helperText={errors.password?.message ?? 'En az 6 karakter'}
              {...register('password', {
                required: 'Şifre gerekli',
                minLength: { value: 6, message: 'En az 6 karakter' },
              })}
            />
            <Button type="submit" variant="contained" size="large" disabled={signup.isPending}>
              {signup.isPending ? 'Kaydediliyor…' : 'Kayıt ol'}
            </Button>
            <Typography variant="body2" color="text.secondary">
              Zaten hesabın var mı?{' '}
              <Link component={RouterLink} to="/giris">
                Giriş yap
              </Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
