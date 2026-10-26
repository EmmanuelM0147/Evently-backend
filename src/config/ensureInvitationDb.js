import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let readyPromise = null;

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS weddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  wedding_date DATE NOT NULL,
  venue VARCHAR(500),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  normalized_phone VARCHAR(50),
  side VARCHAR(20) NOT NULL DEFAULT 'mutual',
  plus_one_cap INTEGER NOT NULL DEFAULT 0,
  invite_code_hash CHAR(64) NOT NULL,
  invite_code_suffix VARCHAR(6) NOT NULL,
  invite_code_issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  invite_code_revoked_at TIMESTAMP,
  invite_code VARCHAR(6),
  rsvp_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  plus_one_count INTEGER NOT NULL DEFAULT 0,
  rsvp_submitted_at TIMESTAMP,
  checked_in_at TIMESTAMP,
  checked_in_by UUID,
  archived_at TIMESTAMP,
  table_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guest_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id UUID NOT NULL,
  guest_id UUID,
  actor_user_id UUID,
  action VARCHAR(50) NOT NULL,
  outcome VARCHAR(50) NOT NULL,
  request_id VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wedding_gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wedding_id UUID NOT NULL REFERENCES weddings(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES guests(id) ON DELETE SET NULL,
  guest_name VARCHAR(255) NOT NULL,
  method VARCHAR(20) NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  fee_kobo BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  charged_kobo BIGINT NOT NULL CHECK (charged_kobo > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  message TEXT,
  status VARCHAR(20) NOT NULL,
  paystack_reference VARCHAR(100) UNIQUE,
  authorization_url TEXT,
  gateway_response JSONB,
  paid_at TIMESTAMP,
  received_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guests_wedding ON guests(wedding_id);
CREATE INDEX IF NOT EXISTS idx_weddings_active ON weddings(is_active);
`;

const loadSeed = () => {
  try {
    const raw = readFileSync(path.join(__dirname, 'wedding-seed.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export async function ensureInvitationDb() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await pool.query(SCHEMA_SQL);

      const seed = loadSeed();
      if (!seed) {
        const existing = await pool.query('SELECT id FROM weddings WHERE is_active = true LIMIT 1');
        if (existing.rows.length === 0) {
          console.warn('⚠️  No active wedding and no wedding-seed.json found');
        }
        return { seeded: false };
      }

      // Keep the guest UI in sync with wedding-seed.json (names, hashtag, attire, etc.)
      await pool.query(
        `INSERT INTO weddings (id, name, wedding_date, venue, settings, is_active)
         VALUES ($1::uuid, $2, $3::date, $4, $5::jsonb, true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           wedding_date = EXCLUDED.wedding_date,
           venue = EXCLUDED.venue,
           settings = EXCLUDED.settings,
           is_active = true,
           updated_at = CURRENT_TIMESTAMP`,
        [
          seed.id,
          seed.name,
          seed.wedding_date,
          seed.venue,
          JSON.stringify(seed.settings || {})
        ]
      );
      // Ensure only this wedding is active
      await pool.query('UPDATE weddings SET is_active = (id = $1::uuid)', [seed.id]);
      console.log('💍 Synced active wedding from wedding-seed.json');
      return { seeded: true };
    })().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

export function withInvitationDb(handler) {
  return async (req, res, next) => {
    try {
      await ensureInvitationDb();
      return await handler(req, res, next);
    } catch (error) {
      return next(error);
    }
  };
}
