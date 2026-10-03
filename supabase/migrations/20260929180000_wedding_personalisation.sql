-- Door staff (ushers) sign in with the "staff" role.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'organizer', 'attendee', 'staff'));

-- Six-digit codes are too small a space for hashing to protect them, and the admin
-- needs to re-share a guest's code (e.g. over WhatsApp) after it has been issued.
ALTER TABLE guests ADD COLUMN IF NOT EXISTS invite_code VARCHAR(6);
