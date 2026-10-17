import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { pool } from '../config/database.js';
import { sendInvitation } from '../services/invitationService.js';
import { shareDetails } from '../services/invitationMessage.js';
import { normalizeEmail, sendRsvpEmails } from '../services/rsvpEmail.js';

const normalizeCode = (value) => String(value || '').replace(/[-\s]/g, '').toUpperCase();
const hashCode = (code) => crypto.createHash('sha256').update(normalizeCode(code)).digest('hex');
const normalizePhone = (value) => {
  const normalized = String(value || '').replace(/[^\d+]/g, '');
  return normalized || null;
};
const createInviteCode = () => String(crypto.randomInt(100000, 1000000));
export const getActiveWedding = async () => {
  const result = await pool.query('SELECT id, name, wedding_date, venue, settings FROM weddings WHERE is_active = true LIMIT 1');
  return result.rows[0];
};
const issueGuestToken = (guestId, weddingId) => jwt.sign(
  { guestId, weddingId, type: 'guest' },
  process.env.JWT_SECRET,
  { expiresIn: process.env.GUEST_SESSION_TTL || '30m', audience: 'evently-guest' }
);
const guestResponse = (guest) => ({
  id: guest.id,
  full_name: guest.full_name,
  phone: guest.phone,
  side: guest.side,
  plus_one_cap: guest.plus_one_cap,
  rsvp_status: guest.rsvp_status,
  plus_one_count: guest.plus_one_count,
  checked_in: Boolean(guest.checked_in_at)
});
const doorGuestResponse = async (guest, db = pool) => {
  const table = guest.table_id
    ? await db.query('SELECT name FROM wedding_tables WHERE id = $1', [guest.table_id])
    : { rows: [] };
  const { phone, ...visible } = guestResponse(guest);
  return { ...visible, checked_in_at: guest.checked_in_at, table_name: table.rows[0]?.name || null };
};
const audit = (client, values) => client.query(
  `INSERT INTO guest_audit_events (wedding_id, guest_id, actor_user_id, action, outcome, request_id, metadata)
   VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  values
);

export const lookupGuest = async (req, res) => {
  const code = normalizeCode(req.body.code);
  if (!/^\d{6}$/.test(code) && code.length < 20) {
    return res.status(400).json({ success: false, error: 'Invalid invite code' });
  }

  const wedding = await getActiveWedding();
  const result = wedding
    ? await pool.query(
      `SELECT * FROM guests
       WHERE wedding_id = $1 AND invite_code_revoked_at IS NULL AND archived_at IS NULL
         AND invite_code_hash = $2`,
      [wedding.id, hashCode(code)]
    )
    : { rows: [] };

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Invite code not recognized' });
  }

  const guest = result.rows[0];
  return res.json({
    success: true,
    data: {
      guest: guestResponse(guest),
      wedding,
      sessionToken: issueGuestToken(guest.id, guest.wedding_id),
      qrPayload: code
    }
  });
};

export const getGuestSession = async (req, res) => {
  const result = await pool.query('SELECT * FROM guests WHERE id = $1 AND archived_at IS NULL', [req.guest.id]);
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Guest not found' });
  return res.json({ success: true, data: guestResponse(result.rows[0]) });
};

export const getGuestRsvp = getGuestSession;

// Open invitation RSVP: name + response, no invite code required
export const submitPublicRsvp = async (req, res) => {
  const fullName = String(req.body.full_name || '').trim().slice(0, 255);
  const status = String(req.body.status || '').toLowerCase();
  const plusOneCount = Number(req.body.plus_one_count || 0);
  const phone = normalizePhone(req.body.phone);
  const rawEmail = String(req.body.email || '').trim();
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (!fullName || fullName.length < 2) {
    return res.status(400).json({ success: false, error: 'Please enter your full name.' });
  }
  if (rawEmail && !email) {
    return res.status(400).json({ success: false, error: 'Please enter a valid email address, or leave it blank.' });
  }
  if (!['attending', 'declined'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Please choose whether you can attend.' });
  }
  if (!Number.isInteger(plusOneCount) || plusOneCount < 0 || plusOneCount > 5) {
    return res.status(400).json({ success: false, error: 'Please enter how many guests are coming with you (0–5).' });
  }
  const wedding = await getActiveWedding();
  if (!wedding) return res.status(503).json({ success: false, error: 'No active wedding configured' });

  const guestsComing = status === 'attending' ? plusOneCount : 0;
  const code = createInviteCode();
  const client = await pool.connect();
  let guest = null;
  try {
    await client.query('BEGIN');
    if (phone) {
      const existing = await client.query(
        `SELECT * FROM guests WHERE wedding_id = $1 AND normalized_phone = $2 AND archived_at IS NULL FOR UPDATE`,
        [wedding.id, phone]
      );
      if (existing.rows[0]) {
        const updated = await client.query(
          `UPDATE guests SET full_name = $1, rsvp_status = $2, plus_one_cap = GREATEST(plus_one_cap, $3),
           plus_one_count = $3, rsvp_submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4 RETURNING *`,
          [fullName, status, guestsComing, existing.rows[0].id]
        );
        guest = updated.rows[0];
      }
    }
    if (!guest) {
      const inserted = await client.query(
        `INSERT INTO guests (wedding_id, full_name, phone, normalized_phone, side, plus_one_cap, plus_one_count,
          rsvp_status, rsvp_submitted_at, invite_code_hash, invite_code_suffix, invite_code)
         VALUES ($1, $2, $3, $4, 'mutual', $5, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9) RETURNING *`,
        [wedding.id, fullName, phone, phone, guestsComing, status, hashCode(code), code.slice(-6), code]
      );
      guest = inserted.rows[0];
    }
    await audit(client, [wedding.id, guest.id, null, 'public_rsvp', 'success', req.requestId, {
      status,
      plusOneCount: guestsComing,
      email: email || null
    }]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  // Must await on Vercel — background work after res.json() is frozen and never runs
  let mail = { sent: false, guest: null, alert: null, reason: null, errors: [] };
  try {
    mail = await sendRsvpEmails({
      fullName,
      status,
      plusOneCount: guestsComing,
      phone,
      email,
      wedding
    });
    console.log('RSVP email result', {
      guest: Boolean(mail.guest),
      alert: Boolean(mail.alert),
      reason: mail.reason || null,
      errors: mail.errors || []
    });
  } catch (error) {
    console.error('RSVP email pipeline failed:', error.message);
    mail = { sent: false, guest: null, alert: null, errors: [error.message] };
  }

  return res.status(201).json({
    success: true,
    data: guestResponse(guest),
    email_confirmation: Boolean(mail.guest),
    email_alert: Boolean(mail.alert)
  });
};

export const updateGuestRsvp = async (req, res) => {
  const status = String(req.body.status || '').toLowerCase();
  const plusOneCount = Number(req.body.plus_one_count || 0);
  if (!['attending', 'declined'].includes(status) || !Number.isInteger(plusOneCount) || plusOneCount < 0) {
    return res.status(400).json({ success: false, error: 'Valid status and plus-one count are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT * FROM guests WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [req.guest.id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }
    const guest = result.rows[0];
    if (plusOneCount > guest.plus_one_cap) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Plus-one count exceeds your invitation allowance' });
    }

    const updated = await client.query(
      `UPDATE guests SET rsvp_status = $1, plus_one_count = $2, rsvp_submitted_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`,
      [status, plusOneCount, guest.id]
    );
    await audit(client, [guest.wedding_id, guest.id, null, 'rsvp_updated', 'success', req.requestId, { status, plusOneCount }]);
    await client.query('COMMIT');
    return res.json({ success: true, data: guestResponse(updated.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const getGuestQr = async (req, res) => {
  const result = await pool.query(
    'SELECT id, wedding_id, invite_code_suffix FROM guests WHERE id = $1 AND archived_at IS NULL',
    [req.guest.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Guest not found' });
  const qrToken = jwt.sign(
    { guestId: result.rows[0].id, weddingId: result.rows[0].wedding_id, type: 'check-in-qr' },
    process.env.JWT_SECRET,
    // Guests often save their pass days or weeks ahead, so it must outlive the wedding day
    { expiresIn: process.env.QR_TTL || '180d', audience: 'evently-check-in' }
  );
  const qrImage = await QRCode.toDataURL(qrToken, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
  return res.json({ success: true, data: { qrToken, qrImage, codeSuffix: result.rows[0].invite_code_suffix } });
};

export const lookupDoorCode = async (req, res) => {
  const code = String(req.body.code || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, outcome: 'invalid_code', error: 'Enter the six-digit guest code' });
  }
  const wedding = await getActiveWedding();
  const result = wedding ? await pool.query(
    `SELECT id, wedding_id, full_name, phone, side, plus_one_cap, plus_one_count, rsvp_status, checked_in_at, table_id
     FROM guests WHERE wedding_id = $1 AND invite_code_revoked_at IS NULL AND archived_at IS NULL
       AND invite_code_hash = $2`,
    [wedding.id, hashCode(code)]
  ) : { rows: [] };
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, outcome: 'invalid_code', error: 'Guest code not recognized' });
  }
  return res.json({ success: true, outcome: 'guest_found', data: await doorGuestResponse(result.rows[0]) });
};

export const searchDoorGuests = async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 60);
  if (query.length < 2) return res.json({ success: true, data: [] });
  const wedding = await getActiveWedding();
  if (!wedding) return res.json({ success: true, data: [] });
  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  const result = await pool.query(
    `SELECT g.id, g.full_name, g.side, g.plus_one_cap, g.plus_one_count, g.rsvp_status, g.checked_in_at, t.name AS table_name
     FROM guests g LEFT JOIN wedding_tables t ON t.id = g.table_id
     WHERE g.wedding_id = $1 AND g.archived_at IS NULL AND g.full_name ILIKE $2
     ORDER BY g.full_name LIMIT 8`,
    [wedding.id, `%${escaped}%`]
  );
  return res.json({ success: true, data: result.rows.map((guest) => ({ ...guest, checked_in: Boolean(guest.checked_in_at) })) });
};

export const recentCheckIns = async (req, res) => {
  const wedding = await getActiveWedding();
  if (!wedding) return res.json({ success: true, data: [] });
  const result = await pool.query(
    `SELECT g.id, g.full_name, g.plus_one_count, g.checked_in_at, t.name AS table_name, u.username AS checked_in_by_name
     FROM guests g
     LEFT JOIN wedding_tables t ON t.id = g.table_id
     LEFT JOIN users u ON u.id = g.checked_in_by
     WHERE g.wedding_id = $1 AND g.archived_at IS NULL AND g.checked_in_at IS NOT NULL
     ORDER BY g.checked_in_at DESC LIMIT 12`,
    [wedding.id]
  );
  return res.json({ success: true, data: result.rows });
};

export const confirmCheckIn = async (req, res) => {
  const method = req.body.method === 'name_search' ? 'name_search' : 'numeric_code';
  const wedding = await getActiveWedding();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT * FROM guests WHERE id = $1 AND wedding_id = $2 AND archived_at IS NULL FOR UPDATE',
      [req.body.guestId, wedding?.id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, outcome: 'invalid_code', error: 'Guest not found' });
    }
    const guest = result.rows[0];
    if (guest.checked_in_at) {
      await audit(client, [guest.wedding_id, guest.id, req.user.id, 'check_in', 'already_checked_in', req.requestId, { method }]);
      await client.query('COMMIT');
      return res.json({ success: true, outcome: 'already_checked_in', data: await doorGuestResponse(guest) });
    }
    const updated = await client.query(
      'UPDATE guests SET checked_in_at = CURRENT_TIMESTAMP, checked_in_by = $1 WHERE id = $2 RETURNING *',
      [req.user.id, guest.id]
    );
    await audit(client, [guest.wedding_id, guest.id, req.user.id, 'check_in', 'success', req.requestId, { method }]);
    await client.query('COMMIT');
    return res.json({ success: true, outcome: 'checked_in', data: await doorGuestResponse(updated.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listGuests = async (req, res) => {
  const wedding = await getActiveWedding();
  if (!wedding) return res.json({ success: true, data: [], pagination: { total: 0 } });
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10));
  const pageSize = Math.min(50, Math.max(5, Number.parseInt(req.query.page_size || '10', 10)));
  const values = [wedding.id];
  const filters = ['wedding_id = $1', 'archived_at IS NULL'];
  if (req.query.side) { values.push(req.query.side); filters.push(`side = $${values.length}`); }
  if (req.query.rsvp_status) { values.push(req.query.rsvp_status); filters.push(`rsvp_status = $${values.length}`); }
  if (req.query.search) { values.push(`%${req.query.search}%`); filters.push(`full_name ILIKE $${values.length}`); }
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM guests WHERE ${filters.join(' AND ')}`, values
  );
  const total = countResult.rows[0].total;
  const offset = (page - 1) * pageSize;
  const result = await pool.query(
    `SELECT id, full_name, phone, side, plus_one_cap, rsvp_status, plus_one_count, checked_in_at, created_at, invite_code
     FROM guests WHERE ${filters.join(' AND ')} ORDER BY full_name LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );
  const guests = result.rows.map((guest) => ({ ...guest, ...shareDetails({ guest, wedding, code: guest.invite_code }) }));
  return res.json({ success: true, data: guests, pagination: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), hasNextPage: page * pageSize < total, hasPrevPage: page > 1 } });
};

export const listInvitationDeliveries = async (req, res) => {
  const result = await pool.query(
    `SELECT id, channel, provider, recipient_last4, status, error_message, attempted_at, delivered_at
     FROM guest_invitation_deliveries WHERE guest_id = $1 ORDER BY attempted_at DESC LIMIT 20`,
    [req.params.id]
  );
  return res.json({ success: true, data: result.rows });
};

export const createGuest = async (req, res) => {
  const { full_name: fullName, phone, side, plus_one_cap: plusOneCap = 0 } = req.body;
  if (!fullName || !['bride', 'groom', 'mutual'].includes(side) || !Number.isInteger(Number(plusOneCap)) || Number(plusOneCap) < 0) {
    return res.status(400).json({ success: false, error: 'full_name, side, and valid plus_one_cap are required' });
  }
  const wedding = await getActiveWedding();
  if (!wedding) return res.status(503).json({ success: false, error: 'No active wedding configured' });
  const code = createInviteCode();
  const result = await pool.query(
    `INSERT INTO guests (wedding_id, full_name, phone, normalized_phone, side, plus_one_cap, invite_code_hash, invite_code_suffix, invite_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, full_name, phone, side, plus_one_cap, rsvp_status`,
    [wedding.id, fullName.trim(), phone || null, normalizePhone(phone), side, Number(plusOneCap), hashCode(code), code.slice(-6), code]
  );
  const guest = result.rows[0];
  const delivery = await sendInvitation({ guest, wedding, code });
  return res.status(201).json({ success: true, data: { guest, inviteCode: code, delivery, ...shareDetails({ guest, wedding, code }) } });
};

export const updateGuest = async (req, res) => {
  const { full_name: fullName, phone, side, plus_one_cap: plusOneCap } = req.body;
  if (!fullName || !['bride', 'groom', 'mutual'].includes(side) || !Number.isInteger(Number(plusOneCap)) || Number(plusOneCap) < 0) {
    return res.status(400).json({ success: false, error: 'full_name, side, and valid plus_one_cap are required' });
  }
  const result = await pool.query(
    `UPDATE guests SET full_name = $1, phone = $2, normalized_phone = $3, side = $4,
      plus_one_cap = $5, updated_at = CURRENT_TIMESTAMP
     WHERE id = $6 AND archived_at IS NULL AND plus_one_count <= $5
     RETURNING id, full_name, phone, side, plus_one_cap, rsvp_status, plus_one_count, checked_in_at`,
    [fullName.trim(), phone || null, normalizePhone(phone), side, Number(plusOneCap), req.params.id]
  );
  if (result.rows.length === 0) return res.status(409).json({ success: false, error: 'Guest not found or plus-one cap is below the confirmed count' });
  return res.json({ success: true, data: result.rows[0] });
};

export const rotateGuestCode = async (req, res) => {
  const code = createInviteCode();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE guests SET invite_code_hash = $1, invite_code_suffix = $2, invite_code = $4,
        invite_code_issued_at = CURRENT_TIMESTAMP, invite_code_revoked_at = NULL,
        updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND archived_at IS NULL
       RETURNING id, full_name, phone, invite_code_suffix`,
      [hashCode(code), code.slice(-6), req.params.id, code]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }
    const guest = await client.query('SELECT wedding_id, full_name, phone FROM guests WHERE id = $1', [req.params.id]);
    await audit(client, [guest.rows[0].wedding_id, req.params.id, req.user.id, 'invite_code_rotated', 'success', req.requestId, {}]);
    await client.query('COMMIT');
    const wedding = await getActiveWedding();
    const delivery = await sendInvitation({ guest: { id: req.params.id, full_name: guest.rows[0].full_name, phone: guest.rows[0].phone }, wedding, code });
    return res.json({ success: true, data: { guest: result.rows[0], inviteCode: code, delivery, ...shareDetails({ guest: result.rows[0], wedding, code }) } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const archiveGuest = async (req, res) => {
  const result = await pool.query(
    `UPDATE guests SET archived_at = CURRENT_TIMESTAMP, invite_code_revoked_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND archived_at IS NULL RETURNING id, full_name`,
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Guest not found' });
  return res.json({ success: true, data: result.rows[0] });
};

export const undoCheckIn = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE guests SET checked_in_at = NULL, checked_in_by = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND archived_at IS NULL AND checked_in_at IS NOT NULL RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Checked-in guest not found' });
    }
    const guest = result.rows[0];
    await audit(client, [guest.wedding_id, guest.id, req.user.id, 'check_in_undone', 'success', req.requestId, { reason: String(req.body.reason || 'operator correction').slice(0, 200) }]);
    await client.query('COMMIT');
    return res.json({ success: true, data: await doorGuestResponse(guest) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const importGuests = async (req, res) => {
  if (!Array.isArray(req.body.guests) || req.body.guests.length === 0 || req.body.guests.length > 1000) {
    return res.status(400).json({ success: false, error: 'guests must be a non-empty array of at most 1000 rows' });
  }
  const wedding = await getActiveWedding();
  const client = await pool.connect();
  const imported = [];
  const rejected = [];
  try {
    await client.query('BEGIN');
    for (const [index, row] of req.body.guests.entries()) {
      if (!row.full_name || !['bride', 'groom', 'mutual'].includes(row.side)) {
        rejected.push({ row: index + 1, error: 'full_name and valid side are required' });
        continue;
      }
      const code = createInviteCode();
      try {
        const result = await client.query(
          `INSERT INTO guests (wedding_id, full_name, phone, normalized_phone, side, plus_one_cap, invite_code_hash, invite_code_suffix, invite_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, full_name, phone, side, plus_one_cap`,
          [wedding.id, String(row.full_name).trim(), row.phone || null, normalizePhone(row.phone), row.side, Number(row.plus_one_cap || 0), hashCode(code), code.slice(-6), code]
        );
        imported.push({ ...result.rows[0], inviteCode: code, ...shareDetails({ guest: result.rows[0], wedding, code }) });
      } catch (error) {
        rejected.push({ row: index + 1, error: error.code === '23505' ? 'Duplicate phone' : 'Invalid guest row' });
      }
    }
    await client.query('COMMIT');
    const deliveries = await Promise.all(imported.map((guest) => sendInvitation({
      guest: { id: guest.id, full_name: guest.full_name, phone: guest.phone },
      wedding,
      code: guest.inviteCode
    })));
    imported.forEach((guest, index) => { guest.delivery = deliveries[index]; });
    return res.status(201).json({ success: true, data: { imported, rejected, importedCount: imported.length, rejectedCount: rejected.length } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const scanCheckIn = async (req, res) => {
  const qrToken = req.body.qrToken;
  let guestId;
  let weddingId;
  try {
    const decoded = jwt.verify(qrToken, process.env.JWT_SECRET, { audience: 'evently-check-in' });
    guestId = decoded.guestId;
    weddingId = decoded.weddingId;
  } catch {
    return res.status(400).json({ success: false, outcome: 'invalid_code', error: 'Invalid check-in code' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT * FROM guests WHERE id = $1 AND wedding_id = $2 AND archived_at IS NULL FOR UPDATE',
      [guestId, weddingId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, outcome: 'invalid_code', error: 'Guest not found' });
    }
    const guest = result.rows[0];
    if (guest.checked_in_at) {
      await audit(client, [weddingId, guest.id, req.user.id, 'check_in', 'already_checked_in', req.requestId, {}]);
      await client.query('COMMIT');
      return res.json({ success: true, outcome: 'already_checked_in', data: await doorGuestResponse(guest) });
    }
    const updated = await client.query(
      'UPDATE guests SET checked_in_at = CURRENT_TIMESTAMP, checked_in_by = $1 WHERE id = $2 RETURNING *',
      [req.user.id, guest.id]
    );
    await audit(client, [weddingId, guest.id, req.user.id, 'check_in', 'success', req.requestId, {}]);
    await client.query('COMMIT');
    return res.json({ success: true, outcome: 'checked_in', data: await doorGuestResponse(updated.rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const checkInSummary = async (req, res) => {
  const wedding = await getActiveWedding();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE rsvp_status = 'attending')::int AS attending,
      COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS checked_in,
      COALESCE(SUM(1 + plus_one_count) FILTER (WHERE rsvp_status = 'attending'), 0)::int AS people_expected,
      COALESCE(SUM(1 + plus_one_count) FILTER (WHERE checked_in_at IS NOT NULL), 0)::int AS people_arrived
     FROM guests WHERE wedding_id = $1 AND archived_at IS NULL`, [wedding?.id]
  );
  return res.json({ success: true, data: result.rows[0] });
};
