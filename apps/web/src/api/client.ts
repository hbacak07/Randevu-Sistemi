import type { Availability, Booking, Provider, User } from './types';

const TOKEN_KEY = 'randevu.token';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* özel pencere vb. — yok say */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });

  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('auth:unauthorized'));
    throw new ApiError(res.status, body?.error ?? 'Bir hata oluştu', body?.details);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined });

/** Tüm REST çağrıları tek yerde — bileşenler fetch detaylarını bilmez */
export const api = {
  login: (data: { email: string; password: string }) => post<{ token: string; user: User }>('/auth/login', data),
  register: (data: { email: string; password: string; name: string; role: string; timezone: string }) =>
    post<{ token: string; user: User }>('/auth/register', data),
  me: () => request<User>('/auth/me'),

  providers: () => request<Provider[]>('/providers'),
  provider: (id: string) => request<Provider>(`/providers/${id}`),
  availability: (providerId: string, serviceId: string, date: string) =>
    request<Availability>(
      `/providers/${providerId}/availability?${new URLSearchParams({ serviceId, date })}`,
    ),

  myBookings: (scope: 'upcoming' | 'past') => request<Booking[]>(`/bookings/me?scope=${scope}`),
  createBooking: (data: { serviceId: string; startsAt: string }) => post<Booking>('/bookings', data),
  cancelBooking: (id: string) => post<Booking>(`/bookings/${id}/cancel`),
};
