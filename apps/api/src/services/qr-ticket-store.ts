import type { OtpStore } from "@infra/redis";
import type { QrTicketRecord, QrTicketStore } from "../routes/qr.routes.js";

/** QR login tickets live under their own namespace, never colliding with OTP keys. */
const key = (ticketId: string): string => `qr:ticket:${ticketId}`;

/**
 * Adapt the generic Redis KV port ({@link OtpStore}) to the {@link QrTicketStore}
 * the QR routes consume: the ticket record is stored as a JSON string with a TTL, so
 * an abandoned or approved-but-never-consumed ticket expires on its own.
 */
export function createRedisQrTicketStore(store: OtpStore): QrTicketStore {
  return {
    async set(ticketId, record, ttlSeconds) {
      await store.set(key(ticketId), JSON.stringify(record), { ttlSeconds });
    },
    async get(ticketId) {
      const raw = await store.get(key(ticketId));
      if (raw === null) return null;
      return JSON.parse(raw) as QrTicketRecord;
    },
    async del(ticketId) {
      await store.del(key(ticketId));
    },
  };
}
