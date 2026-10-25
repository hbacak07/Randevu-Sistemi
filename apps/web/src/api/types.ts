export type Role = 'CUSTOMER' | 'PROVIDER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  timezone: string;
}

export interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
}

export interface Provider {
  id: string;
  name: string;
  timezone: string;
  services: Service[];
  workingHours?: { weekday: number; startTime: string; endTime: string }[];
}

export interface Slot {
  startsAt: string;
  endsAt: string;
  label: string;
  available: boolean;
}

export interface Availability {
  providerId: string;
  serviceId: string;
  date: string;
  timezone: string;
  slots: Slot[];
}

export interface Booking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'CONFIRMED' | 'CANCELLED';
  service: Service;
  provider: { id: string; name: string; timezone: string };
  customer: { id: string; name: string; email: string };
}

export interface AppNotification {
  id: string;
  type: 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'NEW_BOOKING' | 'REMINDER';
  title: string;
  message: string;
  bookingId?: string;
  createdAt: string;
}
