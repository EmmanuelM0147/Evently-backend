import { pool } from '../config/database.js';
import { smsInviteMessage } from './invitationMessage.js';

const recordDelivery = async ({ weddingId, guestId, recipient, status, provider, errorMessage = null }) => {
  const result = await pool.query(
    `INSERT INTO guest_invitation_deliveries
      (wedding_id, guest_id, channel, provider, recipient_last4, status, error_message, attempted_at, delivered_at)
     VALUES ($1, $2, 'sms', $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
     RETURNING id, status, provider, recipient_last4, attempted_at, delivered_at`,
    [weddingId, guestId, 'termii', String(recipient || '').slice(-4), status, errorMessage, status === 'sent' ? new Date() : null]
  );
  return result.rows[0];
};

export const sendInvitation = async ({ guest, wedding, code }) => {
  if (!guest.phone) {
    return recordDelivery({
      weddingId: wedding.id,
      guestId: guest.id,
      recipient: '',
      status: 'skipped',
      provider: 'termii',
      errorMessage: 'Guest has no phone number'
    });
  }

  if (!process.env.TERMII_API_KEY || !process.env.TERMII_SENDER_ID) {
    return recordDelivery({
      weddingId: wedding.id,
      guestId: guest.id,
      recipient: guest.phone,
      status: 'skipped',
      provider: 'termii',
      errorMessage: 'Termii is not configured'
    });
  }

  try {
    const response = await fetch(process.env.TERMII_BASE_URL || 'https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TERMII_API_KEY,
        to: guest.phone,
        from: process.env.TERMII_SENDER_ID,
        sms: smsInviteMessage({ guestName: guest.full_name, wedding, code }),
        type: 'plain',
        channel: process.env.TERMII_CHANNEL || 'generic'
      }),
      signal: AbortSignal.timeout(Number(process.env.TERMII_TIMEOUT_MS || 10000))
    });

    if (!response.ok) {
      return recordDelivery({
        weddingId: wedding.id,
        guestId: guest.id,
        recipient: guest.phone,
        status: 'failed',
        provider: 'termii',
        errorMessage: `Termii returned HTTP ${response.status}`
      });
    }

    return recordDelivery({
      weddingId: wedding.id,
      guestId: guest.id,
      recipient: guest.phone,
      status: 'sent',
      provider: 'termii'
    });
  } catch (error) {
    return recordDelivery({
      weddingId: wedding.id,
      guestId: guest.id,
      recipient: guest.phone,
      status: 'failed',
      provider: 'termii',
      errorMessage: error.name === 'TimeoutError' ? 'Termii request timed out' : 'Termii request failed'
    });
  }
};
