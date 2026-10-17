import { createTransport } from 'nodemailer';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const parseList = (value) => String(value || '')
  .split(/[,;\s]+/)
  .map((part) => part.trim().toLowerCase())
  .filter((part) => EMAIL_PATTERN.test(part));

export const normalizeEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
};

const smtpReady = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransporter = () => createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const fromAddress = () => {
  const user = process.env.SMTP_USER;
  const name = process.env.SMTP_FROM_NAME || 'Kofoworola & Adeyinka';
  return `"${name}" <${user}>`;
};

const alertRecipients = () => {
  const configured = parseList(process.env.RSVP_ALERT_EMAILS);
  if (configured.length) return [...new Set(configured)];
  // Default: sender inbox + couple alerts
  return parseList([
    process.env.SMTP_USER,
    'kaever771@gmail.com',
    'okeowoemmanuelm@icloud.com',
    'okeowoemmanuelm@gmail.com',
    'jumaikofoworola@gmail.com'
  ].filter(Boolean).join(','));
};

const shell = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4faf6;font-family:Georgia,'Times New Roman',serif;color:#12352c;">
  <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
    <div style="background:#fcfffd;border-radius:12px;overflow:hidden;border:1px solid #c5e0d4;box-shadow:0 12px 32px rgba(6,40,33,.08);">
      <div style="background:linear-gradient(135deg,#0b3d34 0%,#147a62 60%,#e85a32 160%);padding:28px 24px;color:#f7f4ec;">
        <p style="margin:0 0 6px;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;opacity:.9;">#KA4EVER</p>
        <h1 style="margin:0;font:600 28px/1.15 Georgia,serif;">${escapeHtml(title)}</h1>
      </div>
      <div style="padding:28px 24px;font:400 16px/1.65 system-ui,-apple-system,sans-serif;color:#3d5c52;">
        ${bodyHtml}
      </div>
      <div style="padding:18px 24px 24px;border-top:1px solid #c5e0d4;font:400 13px/1.5 system-ui,sans-serif;color:#5a7a6f;">
        With love,<br><strong style="color:#0b3d34;">Kofoworola &amp; Adeyinka</strong>
      </div>
    </div>
  </div>
</body>
</html>`;

const statusLabel = (status) => (status === 'attending' ? 'Joyfully attending' : 'Regretfully declined');

export const buildGuestConfirmation = ({ fullName, status, plusOneCount, wedding }) => {
  const attending = status === 'attending';
  const venue = wedding?.venue ? escapeHtml(wedding.venue) : 'the celebration';
  const date = wedding?.wedding_date ? escapeHtml(String(wedding.wedding_date)) : '14 December 2026';
  const extras = attending && plusOneCount > 0
    ? `<p>Guests coming with you: <strong>${plusOneCount}</strong></p>`
    : '';
  const body = attending
    ? `<p>Dear ${escapeHtml(fullName)},</p>
       <p>Thank you — your RSVP is confirmed. We are so glad you will celebrate with us.</p>
       <p><strong>When:</strong> ${date}<br><strong>Where:</strong> ${venue}</p>
       ${extras}
       <p>Please keep this invitation link private. We cannot wait to see you.</p>`
    : `<p>Dear ${escapeHtml(fullName)},</p>
       <p>Thank you for letting us know. You will be missed, and we appreciate your kind reply.</p>
       <p>With gratitude for your love and prayers.</p>`;

  return {
    subject: attending
      ? 'RSVP confirmed — Kofoworola & Adeyinka'
      : 'Thank you for your RSVP — Kofoworola & Adeyinka',
    html: shell(attending ? 'Your RSVP is confirmed' : 'Thank you for your reply', body),
    text: attending
      ? `Dear ${fullName},\n\nYour RSVP is confirmed. We look forward to celebrating with you on ${date} at ${wedding?.venue || 'the celebration'}.\n\nKofoworola & Adeyinka`
      : `Dear ${fullName},\n\nThank you for letting us know. You will be missed.\n\nKofoworola & Adeyinka`
  };
};

export const buildCoupleAlert = ({ fullName, status, plusOneCount, phone, email, wedding }) => {
  const body = `
    <p>A new RSVP just arrived for <strong>${escapeHtml(wedding?.name || 'your wedding')}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;font:500 15px/1.5 system-ui,sans-serif;">
      <tr><td style="padding:8px 0;color:#5a7a6f;">Name</td><td style="padding:8px 0;color:#12352c;"><strong>${escapeHtml(fullName)}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#5a7a6f;">Response</td><td style="padding:8px 0;color:#12352c;"><strong>${escapeHtml(statusLabel(status))}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#5a7a6f;">Guests with them</td><td style="padding:8px 0;color:#12352c;"><strong>${status === 'attending' ? plusOneCount : 0}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#5a7a6f;">Phone</td><td style="padding:8px 0;color:#12352c;">${escapeHtml(phone || '—')}</td></tr>
      <tr><td style="padding:8px 0;color:#5a7a6f;">Email</td><td style="padding:8px 0;color:#12352c;">${escapeHtml(email || '—')}</td></tr>
    </table>`;

  return {
    subject: `New RSVP: ${fullName} — ${statusLabel(status)}`,
    html: shell('New RSVP received', body),
    text: `New RSVP\nName: ${fullName}\nStatus: ${statusLabel(status)}\nPlus-ones: ${status === 'attending' ? plusOneCount : 0}\nPhone: ${phone || '—'}\nEmail: ${email || '—'}`
  };
};

const sendMail = async ({ to, subject, html, text }) => {
  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: fromAddress(),
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    html,
    text
  });
  return info.messageId;
};

/**
 * Sends guest confirmation (if email provided) and couple alerts.
 * Never throws — RSVP must succeed even when mail fails.
 */
export const sendRsvpEmails = async ({ fullName, status, plusOneCount, phone, email, wedding }) => {
  if (!smtpReady()) {
    console.warn('RSVP email skipped: SMTP_USER / SMTP_PASS not configured');
    return { sent: false, reason: 'smtp_not_configured' };
  }

  const results = { guest: null, alert: null, errors: [] };
  const guestEmail = normalizeEmail(email);

  try {
    if (guestEmail) {
      const template = buildGuestConfirmation({ fullName, status, plusOneCount, wedding });
      results.guest = await sendMail({ to: guestEmail, ...template });
    }
  } catch (error) {
    console.error('Guest confirmation email failed:', error.message);
    results.errors.push(`guest:${error.message}`);
  }

  try {
    const recipients = alertRecipients();
    if (recipients.length) {
      const template = buildCoupleAlert({ fullName, status, plusOneCount, phone, email: guestEmail, wedding });
      results.alert = await sendMail({ to: recipients, ...template });
    }
  } catch (error) {
    console.error('Couple alert email failed:', error.message);
    results.errors.push(`alert:${error.message}`);
  }

  return { sent: Boolean(results.guest || results.alert), ...results };
};
