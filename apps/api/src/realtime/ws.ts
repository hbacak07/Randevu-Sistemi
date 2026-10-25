import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { bus, SlotsChangedEvent } from './events';

/**
 * WebSocket: ÇİFT YÖNLÜ kalıcı bağlantı.
 * Burada istemci hangi hizmet verenin takvimini izlediğini sunucuya bildirir
 * (subscribe/unsubscribe), sunucu da o takvim değiştiğinde haber verir.
 * Böylece iki kişi aynı sayfadayken biri slotu alınca diğerinin ekranı anında güncellenir.
 *
 * İstemci → sunucu:  { "type": "subscribe", "providerId": "..." }
 *                    { "type": "unsubscribe", "providerId": "..." }
 * Sunucu → istemci:  { "type": "slots-changed", "providerId": "...", "date": "2026-10-26" }
 */

interface Client extends WebSocket {
  isAlive?: boolean;
  subscriptions?: Set<string>;
}

const rooms = new Map<string, Set<Client>>();

function join(ws: Client, providerId: string) {
  if (!rooms.has(providerId)) rooms.set(providerId, new Set());
  rooms.get(providerId)!.add(ws);
  ws.subscriptions!.add(providerId);
}

function leave(ws: Client, providerId: string) {
  const room = rooms.get(providerId);
  room?.delete(ws);
  if (room && room.size === 0) rooms.delete(providerId);
  ws.subscriptions!.delete(providerId);
}

bus.on('slots', (e: SlotsChangedEvent) => {
  const room = rooms.get(e.providerId);
  if (!room) return;
  const msg = JSON.stringify({ type: 'slots-changed', ...e });
  for (const ws of room) if (ws.readyState === WebSocket.OPEN) ws.send(msg);
});

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: Client) => {
    ws.isAlive = true;
    ws.subscriptions = new Set();

    ws.on('pong', () => (ws.isAlive = true));

    ws.on('message', (raw) => {
      let msg: { type?: string; providerId?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof msg.providerId !== 'string' || msg.providerId.length > 64) return;

      if (msg.type === 'subscribe') join(ws, msg.providerId);
      if (msg.type === 'unsubscribe') leave(ws, msg.providerId);
    });

    ws.on('close', () => {
      for (const id of [...ws.subscriptions!]) leave(ws, id);
    });
  });

  // Kopmuş bağlantıları temizlemek için 30 sn'de bir ping
  const interval = setInterval(() => {
    for (const ws of wss.clients as Set<Client>) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on('close', () => clearInterval(interval));
  return wss;
}
