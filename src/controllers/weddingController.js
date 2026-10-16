import bcryptjs from 'bcryptjs';
import { pool } from '../config/database.js';
import { getActiveWedding } from './guestController.js';
import { paystackConfigured } from '../config/paystack.js';
import { MAX_GIFT_NAIRA, MIN_GIFT_NAIRA } from '../utils/giftFees.js';

const DEFAULT_GIFT_AMOUNTS = [5000, 10000, 20000, 50000];
const GIFT_SETTINGS = ['gift_note', 'bank_name', 'bank_account_name', 'bank_account_number', 'gift_amounts'];

const TEXT_SETTINGS = ['couple_names', 'ceremony_time', 'venue_address', 'map_url', 'dress_code', 'welcome_message', 'contact_phone', 'hashtag', 'fabric_image_url', 'fabric_description'];

const cleanText = (value, max = 500) => String(value ?? '').trim().slice(0, max);

const cleanSettings = (input = {}) => {
  const settings = {};
  TEXT_SETTINGS.forEach((key) => { settings[key] = cleanText(input[key], key === 'welcome_message' ? 1000 : 500); });
  settings.colours = (Array.isArray(input.colours) ? input.colours : [])
    .map((colour) => cleanText(colour, 40))
    .filter(Boolean)
    .slice(0, 6);
  settings.programme = (Array.isArray(input.programme) ? input.programme : [])
    .map((item) => ({ time: cleanText(item?.time, 20), title: cleanText(item?.title, 120) }))
    .filter((item) => item.title)
    .slice(0, 30);
  settings.dress_code_groups = (Array.isArray(input.dress_code_groups) ? input.dress_code_groups : [])
    .map((item) => ({
      group: cleanText(item?.group, 60),
      colours: (Array.isArray(item?.colours) ? item.colours : []).map((colour) => cleanText(colour, 40)).filter(Boolean).slice(0, 6)
    }))
    .filter((item) => item.group && item.colours.length)
    .slice(0, 8);
  settings.gifts_enabled = input.gifts_enabled === true;
  settings.gift_note = cleanText(input.gift_note, 1000);
  settings.bank_name = cleanText(input.bank_name, 120);
  settings.bank_account_name = cleanText(input.bank_account_name, 120);
  settings.bank_account_number = cleanText(input.bank_account_number, 40).replace(/\D/g, '');
  const amounts = (Array.isArray(input.gift_amounts) ? input.gift_amounts : [])
    .map(Number)
    .filter((amount) => Number.isInteger(amount) && amount >= MIN_GIFT_NAIRA && amount <= MAX_GIFT_NAIRA);
  settings.gift_amounts = amounts.length ? [...new Set(amounts)].slice(0, 6) : DEFAULT_GIFT_AMOUNTS;
  if (settings.map_url && !/^https?:\/\//i.test(settings.map_url)) settings.map_url = '';
  if (settings.fabric_image_url && !/^(https:\/\/|\/(?!\/))/i.test(settings.fabric_image_url)) settings.fabric_image_url = '';
  return settings;
};

const weddingResponse = (wedding) => ({
  name: wedding.name,
  wedding_date: wedding.wedding_date,
  venue: wedding.venue,
  settings: { ...cleanSettings(), ...(wedding.settings || {}) }
});

// Open invitation: anyone with the link sees the full details (no invite code)
export const getPublicWedding = async (req, res) => {
  const wedding = await getActiveWedding();
  if (!wedding) return res.status(404).json({ success: false, error: 'No active wedding configured' });
  const response = weddingResponse(wedding);
  const settings = response.settings;
  const gift = settings.gifts_enabled
    ? {
      gifts_enabled: true,
      gift_note: settings.gift_note,
      bank_name: settings.bank_name,
      bank_account_number: settings.bank_account_number,
      bank_account_name: settings.bank_account_name
    }
    : { gifts_enabled: false };
  return res.json({
    success: true,
    data: {
      ...response,
      ...gift,
      ceremony_time: settings.ceremony_time,
      couple_names: settings.couple_names,
      welcome_message: settings.welcome_message,
      hashtag: settings.hashtag
    }
  });
};

export const getWeddingForGuest = async (req, res) => {
  const wedding = await getActiveWedding();
  if (!wedding || wedding.id !== req.guest.weddingId) {
    return res.status(404).json({ success: false, error: 'Wedding not found' });
  }
  let yourTable = null;
  if (wedding.settings?.show_tables) {
    const table = await pool.query(
      'SELECT t.name FROM guests g JOIN wedding_tables t ON t.id = g.table_id WHERE g.id = $1',
      [req.guest.id]
    );
    yourTable = table.rows[0]?.name || null;
  }
  const response = weddingResponse(wedding);
  if (!response.settings.gifts_enabled) GIFT_SETTINGS.forEach((key) => { delete response.settings[key]; });
  return res.json({
    success: true,
    data: {
      ...response,
      your_table: yourTable,
      gifts_online: response.settings.gifts_enabled && paystackConfigured(),
      gift_email_optional: Boolean(process.env.GIFT_RECEIPT_EMAIL)
    }
  });
};

export const getWeddingDetails = async (req, res) => {
  const wedding = await getActiveWedding();
  if (!wedding) return res.status(404).json({ success: false, error: 'No active wedding configured' });
  return res.json({ success: true, data: { ...weddingResponse(wedding), gifts_online: paystackConfigured() } });
};

export const updateWeddingDetails = async (req, res) => {
  const name = cleanText(req.body.name, 255);
  const weddingDate = req.body.wedding_date ? String(req.body.wedding_date) : null;
  if (!name) return res.status(400).json({ success: false, error: 'A wedding name is required' });
  if (weddingDate && !/^\d{4}-\d{2}-\d{2}$/.test(weddingDate)) {
    return res.status(400).json({ success: false, error: 'Wedding date must be YYYY-MM-DD' });
  }
  const settings = cleanSettings(req.body.settings);
  if (settings.bank_account_number && settings.bank_account_number.length !== 10) {
    return res.status(400).json({ success: false, error: 'The account number should be the 10-digit NUBAN number.' });
  }
  if (settings.gifts_enabled && !settings.bank_account_number && !paystackConfigured()) {
    return res.status(400).json({ success: false, error: 'Add the bank details before turning gifts on.' });
  }

  const result = await pool.query(
    `UPDATE weddings SET name = $1, wedding_date = $2, venue = $3, settings = COALESCE(settings, '{}'::jsonb) || $4::jsonb
     WHERE is_active = true RETURNING name, wedding_date, venue, settings`,
    [name, weddingDate, cleanText(req.body.venue) || null, settings]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'No active wedding configured' });
  return res.json({ success: true, data: { ...weddingResponse(result.rows[0]), gifts_online: paystackConfigured() } });
};

export const listStaff = async (req, res) => {
  const result = await pool.query(
    `SELECT id, username, email, is_active, last_login_at, created_at
     FROM users WHERE role = 'staff' ORDER BY created_at`
  );
  return res.json({ success: true, data: result.rows });
};

export const createStaff = async (req, res) => {
  const username = cleanText(req.body.username, 100);
  const email = cleanText(req.body.email, 255).toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return res.status(400).json({ success: false, error: 'Name, a valid email and a password of at least 8 characters are required' });
  }

  try {
    const passwordHash = await bcryptjs.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, is_active, email_verified)
       VALUES ($1, $2, $3, 'staff', TRUE, TRUE)
       RETURNING id, username, email, is_active, last_login_at, created_at`,
      [username, email, passwordHash]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'An account with this name or email already exists' });
    throw error;
  }
};

export const resetStaffPassword = async (req, res) => {
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ success: false, error: 'The new password must be at least 8 characters' });
  const passwordHash = await bcryptjs.hash(password, 12);
  const result = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND role = 'staff' RETURNING id, username, email, is_active, last_login_at, created_at`,
    [passwordHash, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Protocol officer not found' });
  return res.json({ success: true, data: result.rows[0] });
};

export const setStaffActive = async (req, res) => {
  const result = await pool.query(
    `UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND role = 'staff' RETURNING id, username, email, is_active, last_login_at, created_at`,
    [Boolean(req.body.is_active), req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Protocol officer not found' });
  return res.json({ success: true, data: result.rows[0] });
};
