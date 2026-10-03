import crypto from 'crypto';
import { pool } from '../config/database.js';
import { paystackConfig, paystackConfigured, paystackRequest } from '../config/paystack.js';
import { chargeToCoverFee, MAX_GIFT_NAIRA, MIN_GIFT_NAIRA } from '../utils/giftFees.js';
import { getActiveWedding } from './guestController.js';

const VISIBLE_STATUSES = ['success', 'reported', 'received'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const cleanMessage = (value) => String(value ?? '').trim().slice(0, 500) || null;

const giftResponse = (gift) => ({
  id: gift.id,
  guest_id: gift.guest_id,
  guest_name: gift.guest_name,
  method: gift.method,
  amount: Number(gift.amount_kobo) / 100,
  fee: Number(gift.fee_kobo) / 100,
  charged: Number(gift.charged_kobo) / 100,
  status: gift.status,
  message: gift.message,
  reference: gift.paystack_reference,
  created_at: gift.created_at,
  paid_at: gift.paid_at,
  received_at: gift.received_at
});

const parseAmount = (value) => {
  const naira = Number(value);
  if (!Number.isInteger(naira) || naira < MIN_GIFT_NAIRA || naira > MAX_GIFT_NAIRA) return null;
  return naira * 100;
};

// Gifts can only be sent into the wedding the guest's invitation belongs to, and only while the couple has gifts switched on
const loadGiftContext = async (req, res) => {
  const wedding = await getActiveWedding();
  if (!wedding || wedding.id !== req.guest.weddingId) {
    res.status(404).json({ success: false, error: 'Wedding not found' });
    return null;
  }
  if (!wedding.settings?.gifts_enabled) {
    res.status(403).json({ success: false, error: 'Gifts are not open at the moment.' });
    return null;
  }
  const guest = await pool.query(
    'SELECT id, full_name FROM guests WHERE id = $1 AND wedding_id = $2 AND archived_at IS NULL',
    [req.guest.id, wedding.id]
  );
  if (guest.rows.length === 0) {
    res.status(404).json({ success: false, error: 'Invitation not found' });
    return null;
  }
  return { wedding, guest: guest.rows[0] };
};

const findGiftByReference = async (reference) => {
  const result = await pool.query('SELECT * FROM wedding_gifts WHERE paystack_reference = $1', [reference]);
  return result.rows[0] || null;
};

// Applies a Paystack transaction (from verification or a signed webhook) to a pending gift. Only an exact amount match counts as paid.
const settleGift = async (gift, transaction) => {
  if (!gift || gift.status !== 'pending' || !transaction) return gift;
  const paid = transaction.status === 'success';
  const amountMatches = Number(transaction.amount) === Number(gift.charged_kobo) && (transaction.currency || 'NGN') === gift.currency;
  let status = null;
  if (paid && amountMatches) status = 'success';
  else if (paid || ['failed', 'reversed'].includes(transaction.status)) status = 'failed';
  if (!status) return gift;
  if (paid && !amountMatches) {
    console.warn(`Gift ${gift.id}: Paystack reported ${transaction.amount} ${transaction.currency}, expected ${gift.charged_kobo} ${gift.currency}`);
  }

  const summary = {
    id: transaction.id,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    channel: transaction.channel,
    fees: transaction.fees,
    gateway_response: transaction.gateway_response,
    paid_at: transaction.paid_at || transaction.paidAt
  };
  const result = await pool.query(
    `UPDATE wedding_gifts
     SET status = $2::varchar, paid_at = CASE WHEN $2::varchar = 'success' THEN CURRENT_TIMESTAMP END, gateway_response = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [gift.id, status, summary]
  );
  return result.rows[0] || findGiftByReference(gift.paystack_reference);
};

const verifyGift = async (gift) => {
  if (!gift || gift.status !== 'pending' || !paystackConfigured()) return gift;
  try {
    const result = await paystackRequest(`/transaction/verify/${encodeURIComponent(gift.paystack_reference)}`);
    return await settleGift(gift, result.data);
  } catch {
    // Paystack answers 400 until the guest has actually tried to pay; leave the gift pending
    return gift;
  }
};

export const startOnlineGift = async (req, res) => {
  if (!paystackConfigured()) {
    return res.status(503).json({ success: false, error: 'Online gifts are not available yet. Please use bank transfer.' });
  }
  const context = await loadGiftContext(req, res);
  if (!context) return undefined;

  const amountKobo = parseAmount(req.body.amount);
  if (!amountKobo) {
    return res.status(400).json({ success: false, error: `Please enter an amount between ₦${MIN_GIFT_NAIRA.toLocaleString('en-NG')} and ₦${MAX_GIFT_NAIRA.toLocaleString('en-NG')}.` });
  }
  const email = String(req.body.email ?? '').trim().toLowerCase() || process.env.GIFT_RECEIPT_EMAIL || '';
  if (!EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ success: false, error: 'Please add an email address for your receipt.' });
  }

  const chargedKobo = req.body.cover_fee ? chargeToCoverFee(amountKobo) : amountKobo;
  const reference = `gift_${crypto.randomBytes(12).toString('hex')}`;
  const inserted = await pool.query(
    `INSERT INTO wedding_gifts (wedding_id, guest_id, guest_name, method, amount_kobo, fee_kobo, charged_kobo, message, status, paystack_reference)
     VALUES ($1, $2, $3, 'online', $4, $5, $6, $7, 'pending', $8) RETURNING *`,
    [context.wedding.id, context.guest.id, context.guest.full_name, amountKobo, chargedKobo - amountKobo, chargedKobo, cleanMessage(req.body.message), reference]
  );
  const gift = inserted.rows[0];

  const siteUrl = (process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  try {
    const result = await paystackRequest('/transaction/initialize', 'POST', {
      email,
      amount: chargedKobo,
      currency: 'NGN',
      reference,
      callback_url: `${siteUrl}/?gift=${reference}`,
      metadata: {
        gift_id: gift.id,
        cancel_action: `${siteUrl}/?gift=${reference}`,
        custom_fields: [
          { display_name: 'Guest', variable_name: 'guest', value: context.guest.full_name },
          { display_name: 'Gift', variable_name: 'gift_amount', value: `₦${(amountKobo / 100).toLocaleString('en-NG')}` }
        ]
      }
    });
    await pool.query('UPDATE wedding_gifts SET authorization_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [gift.id, result.data.authorization_url]);
    return res.status(201).json({
      success: true,
      data: { authorization_url: result.data.authorization_url, reference, amount: amountKobo / 100, fee: (chargedKobo - amountKobo) / 100, charged: chargedKobo / 100 }
    });
  } catch {
    await pool.query("UPDATE wedding_gifts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [gift.id]);
    return res.status(502).json({ success: false, error: 'We could not reach the payment page. Please try again, or use bank transfer.' });
  }
};

export const getGiftStatus = async (req, res) => {
  const gift = await findGiftByReference(String(req.params.reference || ''));
  if (!gift || gift.guest_id !== req.guest.id) return res.status(404).json({ success: false, error: 'Gift not found' });
  const latest = await verifyGift(gift);
  return res.json({ success: true, data: giftResponse(latest) });
};

export const reportTransferGift = async (req, res) => {
  const context = await loadGiftContext(req, res);
  if (!context) return undefined;
  if (!context.wedding.settings?.bank_account_number) {
    return res.status(400).json({ success: false, error: 'Bank details have not been added yet.' });
  }
  const amountKobo = parseAmount(req.body.amount);
  if (!amountKobo) {
    return res.status(400).json({ success: false, error: `Please enter the amount you sent, between ₦${MIN_GIFT_NAIRA.toLocaleString('en-NG')} and ₦${MAX_GIFT_NAIRA.toLocaleString('en-NG')}.` });
  }
  const result = await pool.query(
    `INSERT INTO wedding_gifts (wedding_id, guest_id, guest_name, method, amount_kobo, charged_kobo, message, status)
     VALUES ($1, $2, $3, 'transfer', $4, $4, $5, 'reported') RETURNING *`,
    [context.wedding.id, context.guest.id, context.guest.full_name, amountKobo, cleanMessage(req.body.message)]
  );
  return res.status(201).json({ success: true, data: giftResponse(result.rows[0]) });
};

export const listMyGifts = async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM wedding_gifts WHERE guest_id = $1 AND wedding_id = $2 AND status = ANY($3) ORDER BY created_at DESC`,
    [req.guest.id, req.guest.weddingId, VISIBLE_STATUSES]
  );
  return res.json({ success: true, data: result.rows.map(giftResponse) });
};

// Paystack signs the raw request body with the secret key; anything unsigned or altered is rejected
export const handleGiftWebhook = async (req, res) => {
  const secret = paystackConfig.secretKey;
  const signature = String(req.headers['x-paystack-signature'] || '');
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!secret || !signature) return res.sendStatus(401);
  const expected = crypto.createHmac('sha512', secret).update(body).digest('hex');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.sendStatus(401);
  }

  let event;
  try {
    event = JSON.parse(body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  const reference = String(event?.data?.reference || '');
  if (event?.event === 'charge.success' && reference.startsWith('gift_')) {
    await settleGift(await findGiftByReference(reference), event.data);
  }
  return res.sendStatus(200);
};

export const listGifts = async (req, res) => {
  const wedding = await getActiveWedding();
  if (!wedding) return res.status(404).json({ success: false, error: 'No active wedding configured' });

  // Catch payments whose guest closed the page before returning and whose webhook has not arrived
  const pending = await pool.query(
    `SELECT * FROM wedding_gifts WHERE wedding_id = $1 AND status = 'pending'
     AND created_at BETWEEN CURRENT_TIMESTAMP - INTERVAL '3 days' AND CURRENT_TIMESTAMP - INTERVAL '1 minute'
     ORDER BY created_at DESC LIMIT 10`,
    [wedding.id]
  );
  await Promise.allSettled(pending.rows.map(verifyGift));

  const [gifts, totals] = await Promise.all([
    pool.query('SELECT * FROM wedding_gifts WHERE wedding_id = $1 AND status = ANY($2) ORDER BY created_at DESC', [wedding.id, VISIBLE_STATUSES]),
    pool.query(
      `SELECT
         COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'success'), 0) AS online_kobo,
         COUNT(*) FILTER (WHERE status = 'success') AS online_count,
         COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'received'), 0) AS transfer_received_kobo,
         COUNT(*) FILTER (WHERE status = 'received') AS transfer_received_count,
         COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'reported'), 0) AS transfer_reported_kobo,
         COUNT(*) FILTER (WHERE status = 'reported') AS transfer_reported_count,
         COUNT(DISTINCT guest_id) FILTER (WHERE status IN ('success', 'received', 'reported')) AS guests
       FROM wedding_gifts WHERE wedding_id = $1`,
      [wedding.id]
    )
  ]);
  const t = totals.rows[0];
  return res.json({
    success: true,
    data: {
      gifts: gifts.rows.map(giftResponse),
      totals: {
        online: Number(t.online_kobo) / 100,
        online_count: Number(t.online_count),
        transfer_received: Number(t.transfer_received_kobo) / 100,
        transfer_received_count: Number(t.transfer_received_count),
        transfer_reported: Number(t.transfer_reported_kobo) / 100,
        transfer_reported_count: Number(t.transfer_reported_count),
        guests: Number(t.guests)
      },
      online_enabled: paystackConfigured()
    }
  });
};

export const setTransferReceived = async (req, res) => {
  const wedding = await getActiveWedding();
  if (!wedding) return res.status(404).json({ success: false, error: 'No active wedding configured' });
  const received = req.body.received !== false;
  const result = await pool.query(
    `UPDATE wedding_gifts
     SET status = $3::varchar, received_at = CASE WHEN $3::varchar = 'received' THEN CURRENT_TIMESTAMP END, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND wedding_id = $2 AND method = 'transfer' AND status IN ('reported', 'received') RETURNING *`,
    [req.params.id, wedding.id, received ? 'received' : 'reported']
  );
  if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Transfer not found' });
  return res.json({ success: true, data: giftResponse(result.rows[0]) });
};
