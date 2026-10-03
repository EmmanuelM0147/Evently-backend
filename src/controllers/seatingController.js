import { pool } from '../config/database.js';
import { getActiveWedding } from './guestController.js';

// Pending guests hold their full allowance until they answer; declined guests free their seats
export const seatsNeeded = (guest) => {
  if (guest.rsvp_status === 'declined') return 0;
  if (guest.rsvp_status === 'attending') return 1 + guest.plus_one_count;
  return 1 + guest.plus_one_cap;
};

const cleanName = (value) => String(value ?? '').trim().slice(0, 80);
const cleanCapacity = (value) => {
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity >= 1 && capacity <= 100 ? capacity : null;
};

const requireWedding = async (res) => {
  const wedding = await getActiveWedding();
  if (!wedding) res.status(404).json({ success: false, error: 'No active wedding configured' });
  return wedding;
};

export const getSeating = async (req, res) => {
  const wedding = await requireWedding(res);
  if (!wedding) return undefined;
  const [tables, guests] = await Promise.all([
    pool.query('SELECT id, name, capacity FROM wedding_tables WHERE wedding_id = $1 ORDER BY sort_order, created_at', [wedding.id]),
    pool.query(
      `SELECT id, full_name, side, rsvp_status, plus_one_count, plus_one_cap, table_id
       FROM guests WHERE wedding_id = $1 AND archived_at IS NULL ORDER BY full_name`,
      [wedding.id]
    )
  ]);
  const seatedGuests = guests.rows.map((guest) => ({ ...guest, seats: seatsNeeded(guest) }));
  const data = tables.rows.map((table) => {
    const tableGuests = seatedGuests.filter((guest) => guest.table_id === table.id);
    return { ...table, guests: tableGuests, seats_used: tableGuests.reduce((sum, guest) => sum + guest.seats, 0) };
  });
  return res.json({
    success: true,
    data: {
      tables: data,
      unseated: seatedGuests.filter((guest) => !guest.table_id && guest.rsvp_status !== 'declined'),
      show_tables: Boolean(wedding.settings?.show_tables)
    }
  });
};

export const createTable = async (req, res) => {
  const wedding = await requireWedding(res);
  if (!wedding) return undefined;
  const name = cleanName(req.body.name);
  const capacity = cleanCapacity(req.body.capacity ?? 10);
  if (!name || !capacity) return res.status(400).json({ success: false, error: 'A table name and a capacity between 1 and 100 are required' });
  try {
    const result = await pool.query(
      `INSERT INTO wedding_tables (wedding_id, name, capacity, sort_order)
       VALUES ($1, $2, $3, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM wedding_tables WHERE wedding_id = $1))
       RETURNING id, name, capacity`,
      [wedding.id, name, capacity]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: `There is already a table called "${name}"` });
    throw error;
  }
};

export const updateTable = async (req, res) => {
  const name = cleanName(req.body.name);
  const capacity = cleanCapacity(req.body.capacity);
  if (!name || !capacity) return res.status(400).json({ success: false, error: 'A table name and a capacity between 1 and 100 are required' });
  try {
    const result = await pool.query(
      `UPDATE wedding_tables SET name = $1, capacity = $2
       WHERE id = $3 AND wedding_id = (SELECT id FROM weddings WHERE is_active) RETURNING id, name, capacity`,
      [name, capacity, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Table not found' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: `There is already a table called "${name}"` });
    throw error;
  }
};

export const deleteTable = async (req, res) => {
  const result = await pool.query(
    'DELETE FROM wedding_tables WHERE id = $1 AND wedding_id = (SELECT id FROM weddings WHERE is_active) RETURNING id',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Table not found' });
  return res.json({ success: true, data: result.rows[0] });
};

export const assignGuestTable = async (req, res) => {
  const tableId = req.body.table_id || null;
  const result = await pool.query(
    `UPDATE guests SET table_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND archived_at IS NULL
       AND ($1::uuid IS NULL OR EXISTS (SELECT 1 FROM wedding_tables t WHERE t.id = $1 AND t.wedding_id = guests.wedding_id))
     RETURNING id, full_name, table_id`,
    [tableId, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Guest or table not found' });
  return res.json({ success: true, data: result.rows[0] });
};

export const setTableVisibility = async (req, res) => {
  const result = await pool.query(
    `UPDATE weddings SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('show_tables', $1::boolean)
     WHERE is_active RETURNING settings`,
    [Boolean(req.body.show_tables)]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'No active wedding configured' });
  return res.json({ success: true, data: { show_tables: Boolean(result.rows[0].settings.show_tables) } });
};
