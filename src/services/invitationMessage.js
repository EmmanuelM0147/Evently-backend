const baseUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const coupleNames = (wedding) => wedding?.settings?.couple_names || wedding?.name || 'our wedding';

export const formatWeddingDate = (value) => {
  if (!value) return null;
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  });
};

export const inviteLink = (code) => `${baseUrl()}/?code=${encodeURIComponent(code)}`;

const firstName = (fullName) => String(fullName || '').trim().split(/\s+/)[0] || 'there';

export const inviteMessage = ({ guestName, wedding, code }) => {
  const date = formatWeddingDate(wedding?.wedding_date);
  const address = wedding?.settings?.venue_address;
  const place = wedding?.venue ? `at ${wedding.venue}` : address && `in ${address}`;
  const when = [date && `on ${date}`, place].filter(Boolean).join(' ');
  return [
    `Dear ${firstName(guestName)},`,
    '',
    `With joy, ${coupleNames(wedding)} invite you to our traditional wedding${when ? ` ${when}` : ''}.`,
    '',
    `Please confirm your attendance here: ${inviteLink(code)}`,
    `Your invite code: ${code}`,
    '',
    'Kindly keep this message. Your code is your entry pass on the day.'
  ].join('\n');
};

export const smsInviteMessage = ({ guestName, wedding, code }) =>
  `Dear ${firstName(guestName)}, you're invited to the traditional wedding of ${coupleNames(wedding)}. RSVP: ${inviteLink(code)} Code: ${code}`;

// wa.me needs the number in international format without "+" (Nigerian 080... becomes 23480...)
export const whatsappNumber = (phone) => {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = `234${digits.slice(1)}`;
  return digits;
};

export const whatsappUrl = ({ phone, text }) => `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;

export const shareDetails = ({ guest, wedding, code }) => {
  if (!code) return { invite_link: null, whatsapp_url: null };
  return {
    invite_link: inviteLink(code),
    whatsapp_url: whatsappUrl({ phone: guest.phone, text: inviteMessage({ guestName: guest.full_name, wedding, code }) })
  };
};
