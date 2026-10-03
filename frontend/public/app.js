const status = document.getElementById('status');
const GUEST_CODE_KEY = 'eventlyGuestCode';
let guestToken = localStorage.getItem('eventlyGuestToken');
let adminToken = localStorage.getItem('eventlyAdminToken');
let operatorRole = localStorage.getItem('eventlyOperatorRole');
let guestPage = 1;
let currentGuest = null;
const portalPath = window.location.pathname.replace(/\/+$/, '') || '/';
const isOperatorPortal = portalPath === '/staff' || portalPath === '/admin';
const allowedOperatorRoles = portalPath === '/admin' ? ['admin'] : ['staff', 'admin'];

const $ = (id) => document.getElementById(id);
const setVisible = (id, visible) => $(id).classList.toggle('hidden', !visible);
const showStatus = (message) => { status.textContent = message; };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const formatDate = (value) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
const adminRequest = (url, options = {}) => fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' } });

const copyText = async (button, text, label) => {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = label; }, 1400);
};

/* ---------- Guest experience ---------- */

let rsvpChoice = null;
let weddingDetails = null;
let countdownTimer = null;

const setMsg = (id, text = '', kind = '') => { $(id).textContent = text; $(id).className = `inline-msg ${kind}`; };
const firstNameOf = (fullName) => String(fullName || '').trim().split(/\s+/)[0] || '';

const clearGuestSession = (message = 'Please enter your invite code again.') => {
  guestToken = null;
  currentGuest = null;
  localStorage.removeItem('eventlyGuestToken');
  localStorage.removeItem(GUEST_CODE_KEY);
  setVisible('guest-panel', false);
  setVisible('lookup-panel', true);
  setVisible('hero-copy', true);
  setMsg('lookup-msg', message, 'error');
};

async function signInGuest(code) {
  const response = await fetch('/api/guests/access/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to verify invitation.');
  guestToken = data.data.sessionToken;
  localStorage.setItem('eventlyGuestToken', guestToken);
  localStorage.setItem(GUEST_CODE_KEY, code);
  return data.data;
}

// Guest sessions are short-lived; the remembered invite code quietly renews them
async function guestRequest(url, options = {}, retry = true) {
  const response = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${guestToken}`, 'Content-Type': 'application/json' } });
  if (response.status !== 401) return response;
  const savedCode = localStorage.getItem(GUEST_CODE_KEY);
  if (retry && savedCode) {
    try { await signInGuest(savedCode); return guestRequest(url, options, false); } catch { /* fall through */ }
  }
  clearGuestSession('Your session expired. Please enter your invite code again.');
  return response;
}

async function openInvitation(code, { quiet = false } = {}) {
  const cleaned = String(code || '').replace(/\D/g, '');
  if (!cleaned) { setMsg('lookup-msg', 'Please enter the 6-digit code from your invitation.', 'error'); return; }
  if (!quiet) setMsg('lookup-msg', 'Opening your invitation...');
  try {
    const data = await signInGuest(cleaned);
    renderGuest(data.guest);
    await loadGuestWedding();
    setMsg('lookup-msg');
  } catch (error) {
    clearGuestSession(quiet ? '' : error.message);
  }
}

const initialsOf = (names) => String(names || '').split(/\s*(?:&|\band\b)\s*/i)
  .map((part) => part.match(/\p{L}/u)?.[0]?.toUpperCase()).filter(Boolean).slice(0, 2);

// Monogram seal in the couple's fabric colours: indigo centre, double gold rings, a string of wedding beads and the aso-oke stripe
const monogramBeads = () => Array.from({ length: 9 }, (_, index) => {
  const angle = ((215 + index * 13.75) * Math.PI) / 180;
  const x = (50 + 41.5 * Math.cos(angle)).toFixed(2);
  const y = (50 + 41.5 * Math.sin(angle)).toFixed(2);
  return index === 4
    ? `<circle cx="${x}" cy="${y}" r="3" fill="#2f6fe0" stroke="#e8b54a" stroke-width="1"/>`
    : `<circle cx="${x}" cy="${y}" r="2.2" fill="#e8b54a"/>`;
}).join('');

const monogramSvg = (names) => {
  const [first = '', second = ''] = initialsOf(names);
  const letter = (x, value) => `<text x="${x}" y="63" text-anchor="middle" font-family="'Cormorant Garamond', Georgia, serif" font-size="40" font-weight="600" fill="#f7f4ec">${escapeHtml(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="monogram-fill" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#2a3685"/><stop offset="1" stop-color="#121842"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#monogram-fill)" stroke="#d09a26" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="44.5" fill="none" stroke="#d09a26" stroke-width=".7" opacity=".75"/>
    <circle cx="50" cy="50" r="41.5" fill="none" stroke="#2f6fe0" stroke-width="1.2"/>
    ${monogramBeads()}
    ${second ? `${letter(32, first)}<rect x="46.8" y="46.8" width="6.4" height="6.4" transform="rotate(45 50 50)" fill="#e8b54a"/>${letter(68, second)}` : letter(50, first)}
    <rect x="32" y="71" width="36" height="1.6" fill="#2f6fe0"/><rect x="32" y="72.6" width="36" height="3.8" fill="#d09a26"/><rect x="32" y="76.4" width="36" height="1.6" fill="#2f6fe0"/>
  </svg>`;
};

const applyLogo = (names) => {
  const svg = monogramSvg(names);
  $('brand-logo').innerHTML = svg;
  $('brand-logo').setAttribute('aria-label', names);
  $('footer-logo').innerHTML = svg;
  $('favicon').href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

async function loadPublicWedding({ updateHero = true } = {}) {
  const response = await fetch('/api/guests/wedding');
  if (!response.ok) return;
  const { data } = await response.json();
  const names = data.couple_names || data.name;
  if (!names) return;
  applyLogo(data.couple_names || names);
  $('footer-names').textContent = names;
  $('footer-hashtag').textContent = data.hashtag || '';
  document.title = `${names} · Traditional Wedding`;
  if (!updateHero) return;
  const parts = String(data.couple_names || '').split(/\s*&\s*/).filter(Boolean);
  $('hero-title').innerHTML = parts.length === 2
    ? `<span class="name">${escapeHtml(parts[0])}</span><span class="amp">&amp;</span><span class="name">${escapeHtml(parts[1])}</span>`
    : escapeHtml(names);
  const dateLine = [formatDate(data.wedding_date), data.ceremony_time].filter(Boolean);
  if (dateLine.length) {
    $('hero-date').innerHTML = dateLine.map(escapeHtml).join('<span class="dot">·</span>');
    setVisible('hero-date', true);
  }
  startCountdown(data.wedding_date, data.ceremony_time);
}

const weddingStart = (date, time) => {
  if (!date) return null;
  const match = String(time || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hours = match ? Number(match[1]) : 12;
  const minutes = match?.[2] ? Number(match[2]) : 0;
  if (match?.[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
  if (match?.[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
  // The ceremony is in Nigeria (West Africa Time, UTC+1) wherever the guest is reading from
  return new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00+01:00`);
};

function startCountdown(date, time) {
  const start = weddingStart(date, time);
  if (!start) return;
  const render = () => {
    const remaining = start.getTime() - Date.now();
    const box = $('countdown');
    if (remaining <= 0) {
      const sameDay = remaining > -12 * 60 * 60 * 1000;
      box.innerHTML = sameDay ? '<div class="today">Today is the day!</div>' : '';
      setVisible('countdown', sameDay);
      if (!sameDay) clearInterval(countdownTimer);
      return;
    }
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    box.innerHTML = [[days, days === 1 ? 'day' : 'days'], [hours, 'hours'], [minutes, 'mins']]
      .map(([value, label]) => `<div><b>${value}</b><small>${label}</small></div>`).join('');
    setVisible('countdown', true);
  };
  render();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(render, 30000);
}

const ICONS = {
  table: '<path d="M4 10h16M6 10v8M18 10v8M8 6h8"/>',
  when: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  where: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  dress: '<path d="M9 3l3 3 3-3 5 3-2 5-3-1v11H9V10l-3 1-2-5z"/>',
  programme: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>',
  note: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const infoBlock = (title, bodyHtml, iconName) => `<div class="info-block"><h3>${iconName ? icon(iconName) : ''}${escapeHtml(title)}</h3>${bodyHtml}</div>`;

const icsText = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function downloadCalendar() {
  const start = weddingStart(weddingDetails?.wedding_date, weddingDetails?.settings?.ceremony_time);
  if (!start) return;
  const s = weddingDetails.settings || {};
  const location = [weddingDetails.venue, s.venue_address].filter(Boolean).join(', ');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Traditional Wedding//EN', 'BEGIN:VEVENT',
    `UID:${weddingDetails.wedding_date}-${currentGuest?.id || 'guest'}@wedding`,
    `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(new Date(start.getTime() + 6 * 3600000))}`,
    `SUMMARY:${icsText(weddingDetails.name)}`, `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText(`Your invitation and entry pass: ${window.location.origin}`)}`,
    'END:VEVENT', 'END:VCALENDAR', ''
  ].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  link.download = 'traditional-wedding.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Fabric colour names that CSS does not know, or knows as a different shade
const FABRIC_COLOURS = { mustard: '#e1ad01', gold: '#d4a017', 'chocolate brown': '#5c3317', 'royal blue': '#2a52be', navy: '#1b2a5c', indigo: '#3f2d76', 'wine': '#722f37', 'peach': '#ffcba4' };

const colourChip = (colour) => {
  const hex = colour.match(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/i)?.[0];
  const label = colour.replace(hex || '', '').trim() || colour;
  const name = label.toLowerCase().replace(/\s+/g, ' ');
  const cssColour = hex || FABRIC_COLOURS[name] || (CSS.supports('color', name.replace(/ /g, '')) ? name.replace(/ /g, '') : null);
  return `<span class="chip">${cssColour ? `<span class="swatch" style="background:${escapeHtml(cssColour)}"></span>` : ''}${escapeHtml(label)}</span>`;
};

async function loadGuestWedding() {
  const response = await guestRequest('/api/guests/access/wedding');
  if (!response.ok) return;
  const { data } = await response.json();
  weddingDetails = data;
  const s = data.settings || {};
  const blocks = [];
  if (data.your_table) blocks.push(infoBlock('Your table', `<div class="your-table"><b>${escapeHtml(data.your_table)}</b></div>`, 'table'));
  const when = [formatDate(data.wedding_date), s.ceremony_time].filter(Boolean).join(' · ');
  if (when) blocks.push(infoBlock('When', `<p>${escapeHtml(when)}</p>`, 'when'));
  if (data.venue || s.venue_address) {
    const venue = data.venue ? `<p><b>${escapeHtml(data.venue)}</b></p>` : '<p><b>Venue to be announced</b></p>';
    blocks.push(infoBlock('Where', `${venue}${s.venue_address ? `<p>${escapeHtml(s.venue_address)}</p>` : ''}`, 'where'));
  }
  const quick = [];
  if (data.wedding_date) quick.push('<button class="secondary quick" id="add-calendar">Add to calendar</button>');
  if (s.map_url) quick.push(`<a class="button secondary" href="${escapeHtml(s.map_url)}" target="_blank" rel="noopener">Get directions</a>`);
  if (s.gifts_enabled && (data.gifts_online || s.bank_account_number)) quick.push('<button class="secondary quick" id="go-gift">Send a gift</button>');
  $('quick-actions').innerHTML = quick.join('');
  $('add-calendar')?.addEventListener('click', downloadCalendar);
  $('go-gift')?.addEventListener('click', () => $('gift-card').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const groups = s.dress_code_groups || [];
  if (s.dress_code || s.colours?.length || groups.length || s.fabric_image_url) {
    const colours = s.colours?.length ? `<p style="margin-top:8px">Colours of the day</p><div class="chips">${s.colours.map(colourChip).join('')}</div>` : '';
    const groupList = groups.length ? `<div class="dress-groups">${groups.map((item) => `<div class="dress-group"><b>${escapeHtml(item.group)}</b><div class="chips">${item.colours.map(colourChip).join('')}</div></div>`).join('')}</div>` : '';
    const fabric = s.fabric_image_url ? `<p style="margin-top:12px">The couple's fabric</p>${s.fabric_description ? `<p class="hint">${escapeHtml(s.fabric_description)}</p>` : ''}<img class="fabric-photo" src="${escapeHtml(s.fabric_image_url)}" alt="The couple's aso-oke fabric" loading="lazy">` : '';
    blocks.push(infoBlock('Dress code', `${s.dress_code ? `<p>${escapeHtml(s.dress_code)}</p>` : ''}${colours}${groupList}${fabric}`, 'dress'));
  }
  if (s.programme?.length) {
    const timed = s.programme.some((item) => item.time);
    const items = s.programme.map((item) => `<li>${timed ? `<b>${escapeHtml(item.time)}</b>` : ''}${escapeHtml(item.title)}</li>`).join('');
    const long = !timed && s.programme.length > 5;
    const list = timed ? `<ul class="programme">${items}</ul>` : `<ol class="programme${long ? ' collapsed' : ''}" id="programme-list">${items}</ol>`;
    const toggle = long ? `<button class="show-more" id="programme-toggle">Show all ${s.programme.length} steps</button>` : '';
    blocks.push(infoBlock('Order of events', list + toggle, 'programme'));
  }
  if (s.welcome_message) blocks.push(infoBlock('A note from us', `<p class="note">${escapeHtml(s.welcome_message)}</p>${s.hashtag ? `<div class="hashtag">${escapeHtml(s.hashtag)}</div>` : ''}`, 'note'));
  if (s.contact_phone) blocks.push(infoBlock('Enquiries', `<p><a href="tel:${escapeHtml(s.contact_phone.replace(/[^\d+]/g, ''))}">${escapeHtml(s.contact_phone)}</a></p>`, 'phone'));
  $('wedding-info').innerHTML = blocks.join('');
  $('programme-toggle')?.addEventListener('click', (event) => {
    const collapsed = $('programme-list').classList.toggle('collapsed');
    event.currentTarget.textContent = collapsed ? `Show all ${s.programme.length} steps` : 'Show fewer';
  });
  renderGiftCard(data);
}

const setRsvpChoice = (value) => {
  rsvpChoice = value;
  document.querySelectorAll('.choice').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === value)));
  setVisible('plus-ones-field', Boolean(currentGuest?.plus_one_cap) && value === 'attending');
};

function renderGuest(guest) {
  currentGuest = guest;
  setVisible('lookup-panel', false);
  setVisible('hero-copy', false);
  setVisible('guest-panel', true);
  $('guest-name').textContent = `Welcome, ${firstNameOf(guest.full_name)}`;
  const responseText = {
    attending: `You're coming${guest.plus_one_count ? ` with ${guest.plus_one_count} guest${guest.plus_one_count === 1 ? '' : 's'}` : ''}. We can't wait to celebrate with you!`,
    declined: "You've told us you can't make it. You will be missed.",
    pending: "We'd love to know if you can join us."
  };
  $('guest-details').textContent = responseText[guest.rsvp_status] || responseText.pending;
  $('plus-ones').max = guest.plus_one_cap;
  $('plus-ones').value = guest.plus_one_count;
  if (guest.plus_one_cap > 0) $('plus-ones-field').querySelector('label').textContent = `Guests coming with you (up to ${guest.plus_one_cap})`;
  setRsvpChoice(guest.rsvp_status === 'pending' ? null : guest.rsvp_status);
  $('save-rsvp').textContent = guest.rsvp_status === 'pending' ? 'Send my response' : 'Update my response';
  setVisible('pass-cta', guest.rsvp_status === 'attending');
}

$('lookup').addEventListener('click', () => openInvitation($('invite-code').value));
$('invite-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') openInvitation($('invite-code').value); });
document.querySelectorAll('.choice').forEach((button) => button.addEventListener('click', () => { setRsvpChoice(button.dataset.value); setMsg('rsvp-msg'); }));
const stepPlusOnes = (delta) => {
  const input = $('plus-ones');
  input.value = Math.min(Number(input.max) || 0, Math.max(0, Number(input.value || 0) + delta));
};
$('plus-minus').addEventListener('click', () => stepPlusOnes(-1));
$('plus-plus').addEventListener('click', () => stepPlusOnes(1));

$('save-rsvp').addEventListener('click', async () => {
  if (!rsvpChoice) { setMsg('rsvp-msg', 'Please choose "Joyfully attending" or "Regretfully decline" first.', 'error'); return; }
  const attending = rsvpChoice === 'attending';
  const button = $('save-rsvp');
  button.disabled = true;
  try {
    const response = await guestRequest('/api/guests/rsvp', { method: 'PUT', body: JSON.stringify({ status: rsvpChoice, plus_one_count: attending ? Number($('plus-ones').value) : 0 }) });
    const data = await response.json();
    if (!response.ok) { setMsg('rsvp-msg', data.error || 'Unable to save your response. Please try again.', 'error'); return; }
    renderGuest({ ...currentGuest, ...data.data });
    setMsg('rsvp-msg', attending ? 'Thank you! Your response is saved.' : 'Thank you for letting us know.', 'success');
  } finally {
    button.disabled = false;
  }
});

$('show-qr').addEventListener('click', async () => {
  const response = await guestRequest('/api/guests/access/qr');
  const data = await response.json();
  const qrBox = $('qr-box');
  if (!response.ok) { qrBox.classList.remove('hidden'); qrBox.textContent = data.error; return; }
  $('qr-modal-note').textContent = `Take a screenshot of this pass. At the entrance a protocol officer will scan it, or you can give them your code: ${data.data.codeSuffix}.`;
  $('qr-modal-image').src = data.data.qrImage;
  $('qr-modal-backdrop').classList.remove('hidden');
});

/* ---------- Gifts ---------- */

const gift = { online: false, bank: false };
const naira = (amount) => `₦${Number(amount || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
const parseNaira = (value) => Number(String(value || '').replace(/\D/g, '')) || 0;
const shortDate = (value) => (value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

// Same rules as src/utils/giftFees.js; this is only the preview, the server works out the real charge
const paystackFee = (kobo) => Math.min(Math.ceil(kobo * 0.015) + (kobo >= 250000 ? 10000 : 0), 200000);
const chargeToCoverFee = (giftKobo) => {
  let charge = Math.ceil(giftKobo / 0.985);
  if (charge >= 250000) charge = Math.ceil((giftKobo + 10000) / 0.985);
  if (paystackFee(charge) >= 200000) charge = giftKobo + 200000;
  charge = Math.ceil(charge / 100) * 100;
  while (charge - paystackFee(charge) < giftKobo) charge += 100;
  return charge;
};

function setGiftMode(mode) {
  document.querySelectorAll('.seg-tab[data-gift-mode]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.giftMode === mode);
    tab.setAttribute('aria-selected', String(tab.dataset.giftMode === mode));
  });
  setVisible('gift-online', mode === 'online');
  setVisible('gift-transfer', mode === 'transfer');
  setMsg('gift-msg');
}

function updateGiftTotal() {
  const amount = parseNaira($('gift-amount').value);
  document.querySelectorAll('#gift-amounts .choice').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.amount) === amount)));
  const fee = amount ? (chargeToCoverFee(amount * 100) - amount * 100) / 100 : 0;
  $('gift-cover-label').textContent = amount
    ? `Add ${naira(fee)} for the payment fee so the couple receives the full ${naira(amount)}`
    : 'Cover the payment fee so the couple receives the full amount';
  const total = amount + ($('gift-cover').checked ? fee : 0);
  $('gift-pay').textContent = total ? `Continue to payment · ${naira(total)}` : 'Continue to payment';
}

function renderGiftCard(data) {
  const s = data.settings || {};
  gift.online = Boolean(data.gifts_online);
  gift.bank = Boolean(s.bank_account_number);
  const show = Boolean(s.gifts_enabled) && (gift.online || gift.bank);
  setVisible('gift-card', show);
  if (!show) return;
  $('gift-note').textContent = s.gift_note || '';
  setVisible('gift-note', Boolean(s.gift_note));
  setVisible('gift-tabs', gift.online && gift.bank);
  $('gift-amounts').innerHTML = (s.gift_amounts || []).map((amount) => `<button type="button" class="choice" data-amount="${amount}" aria-pressed="false">${naira(amount)}</button>`).join('');
  $('gift-email-optional').textContent = data.gift_email_optional ? '(optional)' : '';
  $('gift-bank').innerHTML = [['Bank', s.bank_name], ['Account number', s.bank_account_number, true], ['Account name', s.bank_account_name]]
    .filter(([, value]) => value)
    .map(([label, value, copy]) => `<div class="bank-row"><div><small>${label}</small><b>${escapeHtml(value)}</b></div>${copy ? `<button type="button" class="secondary small copy-bank" data-value="${escapeHtml(value)}">Copy</button>` : ''}</div>`)
    .join('');
  setGiftMode(gift.online ? 'online' : 'transfer');
  updateGiftTotal();
  loadMyGifts();
}

async function loadMyGifts() {
  const response = await guestRequest('/api/guests/access/gifts');
  if (!response.ok) return;
  const { data } = await response.json();
  $('my-gifts').innerHTML = data.length ? `<li><b>Your gifts</b></li>${data.map((item) => {
    const confirmed = item.status !== 'reported';
    return `<li><span>${naira(item.amount)} <small class="hint">· ${item.method === 'online' ? 'online' : 'bank transfer'} · ${shortDate(item.created_at)}</small></span><span class="tag ${confirmed ? 'in' : 'warn'}">${confirmed ? 'Received, thank you' : 'Waiting for the couple to confirm'}</span></li>`;
  }).join('')}` : '';
}

const showGiftThanks = (html, kind = '') => {
  $('gift-thanks').innerHTML = html;
  $('gift-thanks').className = `gift-thanks ${kind}`;
  setVisible('gift-card', true);
  $('gift-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Paystack sends the guest back with ?gift=<reference>; the server confirms the payment with Paystack before we say thank you
async function checkGiftReturn(reference) {
  if (!currentGuest) return;
  showGiftThanks('<b>Confirming your gift…</b>One moment while we check with Paystack.', 'warn');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await guestRequest(`/api/guests/access/gifts/${encodeURIComponent(reference)}`);
    if (!response.ok) break;
    const { data } = await response.json();
    if (data.status === 'success') {
      const couple = weddingDetails?.settings?.couple_names || 'The couple';
      showGiftThanks(`<b>Thank you!</b>Your gift of ${naira(data.amount)} has been received. ${escapeHtml(couple)} are so grateful.`);
      loadMyGifts();
      return;
    }
    if (data.status === 'failed') {
      showGiftThanks("<b>The payment didn't go through</b>You have not been charged. You can try again below.", 'warn');
      return;
    }
    await new Promise((resolve) => { setTimeout(resolve, 2000); });
  }
  showGiftThanks("<b>Payment not completed</b>If you were charged, your gift will show here shortly. Otherwise you can try again below.", 'warn');
}

document.querySelectorAll('.seg-tab[data-gift-mode]').forEach((tab) => tab.addEventListener('click', () => setGiftMode(tab.dataset.giftMode)));
$('gift-amounts').addEventListener('click', (event) => {
  const button = event.target.closest('.choice');
  if (!button) return;
  $('gift-amount').value = Number(button.dataset.amount).toLocaleString('en-NG');
  updateGiftTotal();
  setMsg('gift-msg');
});
['gift-amount', 'gift-transfer-amount'].forEach((id) => $(id).addEventListener('input', () => {
  const amount = parseNaira($(id).value);
  $(id).value = amount ? amount.toLocaleString('en-NG') : '';
  if (id === 'gift-amount') updateGiftTotal();
}));
$('gift-cover').addEventListener('change', updateGiftTotal);
$('gift-bank').addEventListener('click', (event) => {
  const button = event.target.closest('.copy-bank');
  if (button) copyText(button, button.dataset.value, 'Copy');
});

$('gift-pay').addEventListener('click', async () => {
  const amount = parseNaira($('gift-amount').value);
  const email = $('gift-email').value.trim();
  if (amount < 100) { setMsg('gift-msg', 'Please choose or type an amount of at least ₦100.', 'error'); return; }
  if (email && !$('gift-email').checkValidity()) { setMsg('gift-msg', 'Please check your email address.', 'error'); return; }
  const button = $('gift-pay');
  button.disabled = true;
  setMsg('gift-msg', 'Opening the secure payment page...');
  try {
    const response = await guestRequest('/api/guests/access/gifts/online', {
      method: 'POST',
      body: JSON.stringify({ amount, cover_fee: $('gift-cover').checked, message: $('gift-message').value, email })
    });
    const data = await response.json();
    if (!response.ok) { setMsg('gift-msg', data.error || 'Unable to start the payment. Please try again.', 'error'); button.disabled = false; return; }
    window.location.href = data.data.authorization_url;
  } catch {
    setMsg('gift-msg', 'Unable to start the payment. Please check your connection and try again.', 'error');
    button.disabled = false;
  }
});

$('gift-report').addEventListener('click', async () => {
  const amount = parseNaira($('gift-transfer-amount').value);
  if (amount < 100) { setMsg('gift-msg', 'Please enter the amount you sent.', 'error'); return; }
  const button = $('gift-report');
  button.disabled = true;
  try {
    const response = await guestRequest('/api/guests/access/gifts/transfer', { method: 'POST', body: JSON.stringify({ amount, message: $('gift-transfer-message').value }) });
    const data = await response.json();
    if (!response.ok) { setMsg('gift-msg', data.error || 'Unable to send. Please try again.', 'error'); return; }
    $('gift-transfer-amount').value = '';
    $('gift-transfer-message').value = '';
    setMsg('gift-msg', 'Thank you! The couple will confirm once it arrives.', 'success');
    loadMyGifts();
  } finally {
    button.disabled = false;
  }
});

/* ---------- Operator sign-in ---------- */

$('admin-login').addEventListener('click', async () => {
  const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('admin-email').value, password: $('admin-password').value }) });
  const data = await response.json();
  if (!response.ok) { showStatus(data.message || data.error || 'Unable to sign in.'); return; }
  if (!allowedOperatorRoles.includes(data.data.user.role)) {
    showStatus('This account cannot access this page.');
    return;
  }
  adminToken = data.data.token;
  operatorRole = data.data.user.role;
  localStorage.setItem('eventlyAdminToken', adminToken);
  localStorage.setItem('eventlyOperatorRole', operatorRole);
  localStorage.setItem('eventlyOperatorName', data.data.user.username || '');
  $('admin-password').value = '';
  setVisible('admin-login-panel', false);
  showStatus('');
  showWorkspace();
});
$('admin-password').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('admin-login').click(); });

function signOutOperator() {
  adminToken = null;
  operatorRole = null;
  localStorage.removeItem('eventlyAdminToken');
  localStorage.removeItem('eventlyOperatorRole');
  localStorage.removeItem('eventlyOperatorName');
  stopDoor();
  setVisible('admin-panel', false);
  setVisible('admin-login-panel', true);
  setHeroVisible(true);
  $('role-label').textContent = 'WEDDING TEAM';
}

const setHeroVisible = (visible) => ['hero-eyebrow', 'hero-title', 'hero-copy'].forEach((heroId) => setVisible(heroId, visible));

function showWorkspace() {
  const showDesk = Boolean(adminToken && operatorRole === 'admin' && portalPath === '/admin');
  setHeroVisible(false);
  setVisible('admin-panel', showDesk);
  $('role-label').textContent = showDesk ? 'ADMIN COMMAND CENTER' : 'PROTOCOL';
  if (showDesk) { loadGuests(); loadWeddingForm(); loadUshers(); loadSeating(); }
  else if (adminToken && operatorRole) startDoor();
}

$('admin-logout').addEventListener('click', signOutOperator);
$('staff-logout').addEventListener('click', signOutOperator);

document.querySelectorAll('.tabs button').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((other) => other.classList.toggle('active', other === tab));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== tab.dataset.tab));
  if (tab.dataset.tab === 'tab-seating') loadSeating();
  if (tab.dataset.tab === 'tab-gifts') loadGifts();
}));

/* ---------- Invitations ---------- */

const showInviteModal = ({ guestName = '', code = '', link = '', whatsappUrl = '', delivery = null, imported = [] }) => {
  const list = $('invite-modal-list');
  $('invite-modal-title').textContent = imported.length ? 'Invitations ready' : 'Send this invitation';
  $('invite-modal-guest').textContent = guestName ? `Guest: ${guestName}` : `${imported.length} guest invitations created. Send each one on WhatsApp below.`;
  $('invite-modal-code').textContent = code || (imported.length ? `${imported.length} codes` : '');
  const smsNote = delivery ? (delivery.status === 'sent' ? 'SMS sent too.' : 'SMS is not set up, so send it on WhatsApp.') : '';
  $('invite-modal-delivery').textContent = smsNote;
  list.innerHTML = '';
  if (imported.length) {
    list.classList.remove('hidden');
    imported.forEach((guest) => {
      const item = document.createElement('li');
      item.innerHTML = `<span>${escapeHtml(guest.full_name)} <code>${escapeHtml(guest.inviteCode)}</code></span>${guest.whatsapp_url ? `<a class="button whatsapp small" href="${escapeHtml(guest.whatsapp_url)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}`;
      list.appendChild(item);
    });
  } else list.classList.add('hidden');
  const whatsapp = $('invite-modal-whatsapp');
  whatsapp.classList.toggle('hidden', !whatsappUrl);
  whatsapp.href = whatsappUrl || '#';
  const copyButton = $('copy-invite-code');
  copyButton.classList.toggle('hidden', !link);
  copyButton.dataset.link = link;
  $('invite-modal-backdrop').classList.remove('hidden');
};
const closeInviteModal = () => $('invite-modal-backdrop').classList.add('hidden');
const closeQrModal = () => $('qr-modal-backdrop').classList.add('hidden');

$('close-invite-modal').addEventListener('click', closeInviteModal);
$('close-invite-action').addEventListener('click', closeInviteModal);
$('invite-modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'invite-modal-backdrop') closeInviteModal(); });
$('close-qr-modal').addEventListener('click', closeQrModal);
$('close-qr-action').addEventListener('click', closeQrModal);
$('qr-modal-backdrop').addEventListener('click', (event) => { if (event.target.id === 'qr-modal-backdrop') closeQrModal(); });
$('copy-invite-code').addEventListener('click', (event) => copyText(event.currentTarget, event.currentTarget.dataset.link, 'Copy invite link'));

async function createGuest() {
  const result = $('create-result');
  result.textContent = 'Creating invitation...';
  const response = await adminRequest('/api/guests/admin/guests', { method: 'POST', body: JSON.stringify({ full_name: $('new-name').value, phone: $('new-phone').value, side: $('new-side').value, plus_one_cap: Number($('new-cap').value) }) });
  const data = await response.json();
  if (!response.ok) { result.className = 'status error'; result.textContent = data.error || 'Unable to create guest.'; return; }
  result.className = 'status success'; result.textContent = 'Invitation created.';
  showInviteModal({ guestName: data.data.guest.full_name, code: data.data.inviteCode, link: data.data.invite_link, whatsappUrl: data.data.whatsapp_url, delivery: data.data.delivery });
  $('new-name').value = '';
  $('new-phone').value = '';
  loadGuests();
}

async function importGuests() {
  const result = $('import-result');
  try {
    const guests = await readImportRows();
    if (!guests.length) throw new Error('Choose a CSV/JSON file or paste guest data first.');
    result.textContent = 'Importing guests...';
    const response = await adminRequest('/api/guests/admin/guests/import', { method: 'POST', body: JSON.stringify({ guests }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    result.className = 'status success';
    result.textContent = `${data.data.importedCount} imported, ${data.data.rejectedCount} rejected.`;
    showInviteModal({ imported: data.data.imported });
    loadGuests();
  } catch (error) { result.className = 'status error'; result.textContent = error.message || 'Use a valid JSON array.'; }
}

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') { value += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && next === '\n') index += 1; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ''; }
    else value += character;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headerMap = {
    'full_name': 'full_name', 'full name': 'full_name', 'name': 'full_name',
    'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone',
    'side': 'side', 'wedding side': 'side',
    'plus_one_cap': 'plus_one_cap', 'plus one cap': 'plus_one_cap', 'plus-one allowance': 'plus_one_cap', 'plus ones': 'plus_one_cap'
  };
  const headers = rows.shift().map((header) => header.toLowerCase().trim().replace(/\s+/g, ' '));
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [headerMap[header] || header, cells[index] || ''])))
    .map((guest) => ({ ...guest, plus_one_cap: Number(guest.plus_one_cap || guest.plusOnes || 0) }));
};

const readImportRows = async () => {
  const file = $('import-file').files[0];
  if (file) {
    const text = await file.text();
    return file.name.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCsv(text);
  }
  const pasted = $('import-json').value.trim();
  if (!pasted) return [];
  const rows = JSON.parse(pasted);
  return rows.map((guest) => ({ ...guest, full_name: guest.full_name || guest.name, plus_one_cap: Number(guest.plus_one_cap ?? guest.plusOnes ?? 0) }));
};

async function previewImportFile() {
  const preview = $('import-preview');
  try {
    const rows = await readImportRows();
    preview.classList.remove('hidden');
    preview.textContent = rows.length ? `${rows.length} guest${rows.length === 1 ? '' : 's'} ready to import. First guest: ${rows[0].full_name || 'Unnamed'}.` : 'No guest rows found.';
  } catch { preview.classList.remove('hidden'); preview.textContent = 'Could not read this file. Use a CSV exported from Excel or a JSON array.'; }
}

$('refresh-guests').addEventListener('click', () => loadGuests());
$('previous-page').addEventListener('click', () => { if (guestPage > 1) loadGuests(guestPage - 1); });
$('next-page').addEventListener('click', () => loadGuests(guestPage + 1));
$('create-guest').addEventListener('click', createGuest);
$('import-guests').addEventListener('click', importGuests);
$('import-file').addEventListener('change', previewImportFile);

/* ---------- Guest list ---------- */

const inviteButtons = (guest) => guest.invite_link
  ? `<a class="button whatsapp small" href="${escapeHtml(guest.whatsapp_url)}" target="_blank" rel="noopener">WhatsApp</a><button class="secondary small copy-link" data-link="${escapeHtml(guest.invite_link)}">Copy link</button>`
  : '<span class="hint">Code hidden. Use "New code" to re-share.</span>';

const guestActions = (guest) => guest.checked_in_at
  ? `<button class="secondary small undo-checkin" data-id="${guest.id}">Undo check-in</button>`
  : `<button class="secondary small rotate-code" data-id="${guest.id}" data-name="${escapeHtml(guest.full_name)}">New code</button><button class="danger small archive-guest" data-id="${guest.id}" data-name="${escapeHtml(guest.full_name)}">Remove</button>`;

async function loadGuests(page = guestPage) {
  const response = await adminRequest(`/api/guests/admin/guests?page=${page}&page_size=10`);
  if (response.status === 401 || response.status === 403) { signOutOperator(); return; }
  const data = await response.json();
  guestPage = data.pagination.page;
  const rows = $('guest-list');
  const cards = $('guest-cards');
  rows.innerHTML = '';
  cards.innerHTML = '';
  (data.data || []).forEach((guest) => {
    const rsvp = `${escapeHtml(guest.rsvp_status)}${guest.plus_one_count ? ` +${guest.plus_one_count}` : ''}`;
    const row = document.createElement('tr');
    row.innerHTML = `<td>${escapeHtml(guest.full_name)}</td><td>${escapeHtml(guest.phone || '—')}</td><td>${escapeHtml(guest.side)}</td><td><span class="pill">${rsvp}</span></td><td>${guest.checked_in_at ? '<span class="success">Checked in</span>' : 'Not yet'}</td><td><div class="row-actions">${inviteButtons(guest)}</div></td><td><div class="row-actions">${guestActions(guest)}</div></td>`;
    rows.appendChild(row);
    const card = document.createElement('article');
    card.className = 'guest-card-item';
    card.innerHTML = `<h4>${escapeHtml(guest.full_name)}</h4><div class="guest-card-meta"><span>${escapeHtml(guest.phone || 'No phone')}</span><span>${escapeHtml(guest.side)} side</span><span>RSVP: ${rsvp}</span><span>Plus-ones: ${guest.plus_one_count}/${guest.plus_one_cap}</span><span>${guest.checked_in_at ? 'Checked in' : 'Not checked in'}</span><span>Code: ${escapeHtml(guest.invite_code || 'hidden')}</span></div><div class="actions row-actions">${inviteButtons(guest)}${guestActions(guest)}</div>`;
    cards.appendChild(card);
  });
  const summary = await adminRequest('/api/guests/admin/check-ins/summary');
  const summaryData = await summary.json();
  $('metric-total').textContent = summary.ok ? summaryData.data.total : data.pagination.total;
  $('metric-attending').textContent = summary.ok ? summaryData.data.attending : '—';
  $('metric-checked').textContent = summary.ok ? summaryData.data.checked_in : '—';
  $('page-status').textContent = `Page ${data.pagination.page} of ${data.pagination.totalPages || 1} · ${data.pagination.total} guests`;
  $('previous-page').disabled = !data.pagination.hasPrevPage;
  $('next-page').disabled = !data.pagination.hasNextPage;
}

$('admin-panel').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.classList.contains('copy-link')) { copyText(button, button.dataset.link, 'Copy link'); return; }
  if (button.classList.contains('undo-checkin')) {
    const reason = window.prompt('Reason for undoing this check-in:', 'Operator correction');
    if (!reason) return;
    const undoResponse = await adminRequest(`/api/guests/admin/check-ins/${button.dataset.id}/undo`, { method: 'POST', body: JSON.stringify({ reason }) });
    showStatus(undoResponse.ok ? 'Check-in undone.' : 'Unable to undo check-in.');
    if (undoResponse.ok) loadGuests();
  }
  if (button.classList.contains('rotate-code')) {
    if (!window.confirm(`Give ${button.dataset.name} a new code? Their old code and link will stop working.`)) return;
    const response = await adminRequest(`/api/guests/admin/guests/${button.dataset.id}/rotate-code`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) { showStatus(data.error || 'Unable to create a new code.'); return; }
    showInviteModal({ guestName: data.data.guest.full_name, code: data.data.inviteCode, link: data.data.invite_link, whatsappUrl: data.data.whatsapp_url, delivery: data.data.delivery });
    loadGuests();
  }
  if (button.classList.contains('archive-guest')) {
    if (!window.confirm(`Remove ${button.dataset.name} from the guest list? Their code will stop working.`)) return;
    const response = await adminRequest(`/api/guests/admin/guests/${button.dataset.id}/archive`, { method: 'POST', body: JSON.stringify({ reason: 'Removed by admin' }) });
    showStatus(response.ok ? 'Guest removed.' : 'Unable to remove guest.');
    if (response.ok) loadGuests();
  }
});

/* ---------- Wedding details ---------- */

const parseProgramme = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
  const match = line.match(/^(.{1,20}?)\s+[-–|]\s+(.+)$/);
  return match ? { time: match[1].trim(), title: match[2].trim() } : { time: '', title: line };
});

async function loadWeddingForm() {
  const response = await adminRequest('/api/guests/admin/wedding');
  if (!response.ok) return;
  const { data } = await response.json();
  const s = data.settings || {};
  $('wd-name').value = data.name || '';
  $('wd-date').value = data.wedding_date || '';
  $('wd-venue').value = data.venue || '';
  $('wd-couple').value = s.couple_names || '';
  $('wd-time').value = s.ceremony_time || '';
  $('wd-address').value = s.venue_address || '';
  $('wd-map').value = s.map_url || '';
  $('wd-dress').value = s.dress_code || '';
  $('wd-colours').value = (s.colours || []).join(', ');
  $('wd-dress-groups').value = (s.dress_code_groups || []).map((item) => `${item.group} - ${item.colours.join(', ')}`).join('\n');
  $('wd-fabric').value = s.fabric_image_url || '';
  $('wd-fabric-description').value = s.fabric_description || '';
  $('wd-hashtag').value = s.hashtag || '';
  $('wd-programme').value = (s.programme || []).map((item) => (item.time ? `${item.time} - ${item.title}` : item.title)).join('\n');
  $('wd-welcome').value = s.welcome_message || '';
  $('wd-contact').value = s.contact_phone || '';
  $('wd-gifts-enabled').checked = Boolean(s.gifts_enabled);
  $('wd-gift-note').value = s.gift_note || '';
  $('wd-bank-name').value = s.bank_name || '';
  $('wd-bank-number').value = s.bank_account_number || '';
  $('wd-bank-account-name').value = s.bank_account_name || '';
  $('wd-gift-amounts').value = (s.gift_amounts || []).join(', ');
  $('wd-gifts-online').textContent = data.gifts_online
    ? 'Online payments are on: guests can pay by card, transfer or USSD through Paystack.'
    : 'Online payments are off until the Paystack keys are added. Guests can still use bank transfer.';
}

$('save-wedding').addEventListener('click', async () => {
  const result = $('wedding-result');
  const body = {
    name: $('wd-name').value || $('wd-couple').value,
    wedding_date: $('wd-date').value || null,
    venue: $('wd-venue').value,
    settings: {
      couple_names: $('wd-couple').value,
      ceremony_time: $('wd-time').value,
      venue_address: $('wd-address').value,
      map_url: $('wd-map').value,
      dress_code: $('wd-dress').value,
      colours: $('wd-colours').value.split(',').map((colour) => colour.trim()).filter(Boolean),
      dress_code_groups: $('wd-dress-groups').value.split('\n').map((line) => line.match(/^(.+?)\s+[-–]\s+(.+)$/)).filter(Boolean)
        .map(([, group, colours]) => ({ group: group.trim(), colours: colours.split(/[,/]/).map((colour) => colour.trim()).filter(Boolean) })),
      fabric_image_url: $('wd-fabric').value,
      fabric_description: $('wd-fabric-description').value,
      hashtag: $('wd-hashtag').value,
      programme: parseProgramme($('wd-programme').value),
      welcome_message: $('wd-welcome').value,
      contact_phone: $('wd-contact').value,
      gifts_enabled: $('wd-gifts-enabled').checked,
      gift_note: $('wd-gift-note').value,
      bank_name: $('wd-bank-name').value,
      bank_account_number: $('wd-bank-number').value,
      bank_account_name: $('wd-bank-account-name').value,
      gift_amounts: $('wd-gift-amounts').value.split(/[,\s]+/).map(parseNaira).filter(Boolean)
    }
  };
  const response = await adminRequest('/api/guests/admin/wedding', { method: 'PUT', body: JSON.stringify(body) });
  const data = await response.json();
  result.className = response.ok ? 'status success' : 'status error';
  result.textContent = response.ok ? 'Saved. Guests will see these details, and new invitations will use them.' : data.error || 'Unable to save.';
  if (response.ok) { loadWeddingForm(); loadGuests(); loadPublicWedding({ updateHero: false }); }
});

/* ---------- Gifts (admin) ---------- */

let adminGifts = [];
const GIFT_STATUS = { success: ['Paid online', 'in'], received: ['Received', 'in'], reported: ['To check', 'warn'] };
const giftWhen = (item) => new Date(item.paid_at || item.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const countText = (count) => (count ? `${count} gift${count === 1 ? '' : 's'}` : '');

const giftRow = (item) => {
  const [label, tone] = GIFT_STATUS[item.status] || [item.status, ''];
  const action = item.method === 'transfer'
    ? `<button class="secondary small gift-received" data-id="${item.id}" data-received="${item.status === 'reported'}">${item.status === 'reported' ? 'Mark as received' : 'Undo'}</button>`
    : '';
  return `<tr>
    <td>${escapeHtml(item.guest_name)}</td>
    <td><b>${naira(item.amount)}</b>${item.fee ? `<br><small class="hint">+ ${naira(item.fee)} fee paid by guest</small>` : ''}</td>
    <td>${item.method === 'online' ? 'Online' : 'Bank transfer'}</td>
    <td class="gift-message">${escapeHtml(item.message || '')}</td>
    <td>${giftWhen(item)}</td>
    <td><span class="tag ${tone}">${label}</span></td>
    <td>${action}</td>
  </tr>`;
};

async function loadGifts() {
  const response = await adminRequest('/api/guests/admin/gifts');
  if (!response.ok) return;
  const { data } = await response.json();
  const { totals } = data;
  adminGifts = data.gifts;
  $('gift-total-online').textContent = naira(totals.online);
  $('gift-count-online').textContent = countText(totals.online_count);
  $('gift-total-received').textContent = naira(totals.transfer_received);
  $('gift-count-received').textContent = countText(totals.transfer_received_count);
  $('gift-total-reported').textContent = naira(totals.transfer_reported);
  $('gift-count-reported').textContent = countText(totals.transfer_reported_count);
  $('gifts-setup-hint').textContent = data.online_enabled ? '' : 'Online payments are off until the Paystack keys are added. Guests can still report bank transfers.';
  $('gift-list').innerHTML = adminGifts.length ? adminGifts.map(giftRow).join('') : '<tr><td colspan="7" class="hint">No gifts yet.</td></tr>';
}

// Prefix cells Excel would treat as formulas, since messages are typed by guests
const csvCell = (value) => {
  const text = String(value ?? '');
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

$('export-gifts').addEventListener('click', () => {
  const header = ['Guest', 'Amount (NGN)', 'Fee paid by guest (NGN)', 'Method', 'Status', 'Message', 'Date', 'Paystack reference'];
  const rows = adminGifts.map((item) => [
    item.guest_name, item.amount, item.fee, item.method === 'online' ? 'Online' : 'Bank transfer',
    (GIFT_STATUS[item.status] || [item.status])[0], item.message, new Date(item.paid_at || item.created_at).toISOString(), item.reference
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv' }));
  link.download = `wedding-gifts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
$('refresh-gifts').addEventListener('click', loadGifts);
$('gift-list').addEventListener('click', async (event) => {
  const button = event.target.closest('.gift-received');
  if (!button) return;
  button.disabled = true;
  const response = await adminRequest(`/api/guests/admin/gifts/${button.dataset.id}/received`, { method: 'PUT', body: JSON.stringify({ received: button.dataset.received === 'true' }) });
  if (!response.ok) showStatus('Unable to update this gift.');
  loadGifts();
});

/* ---------- Seating ---------- */

let seatingTables = [];

const tableSelect = (guest) => `<select class="assign-table" data-id="${guest.id}" aria-label="Table for ${escapeHtml(guest.full_name)}">
  <option value="">Not seated</option>
  ${seatingTables.map((table) => `<option value="${table.id}"${table.id === guest.table_id ? ' selected' : ''}>${escapeHtml(table.name)}</option>`).join('')}
</select>`;

const seatRow = (guest) => `<div class="seat-row${guest.rsvp_status === 'declined' ? ' declined' : ''}">
  <span>${escapeHtml(guest.full_name)} <small>${guest.seats > 1 ? `· ${guest.seats} seats` : ''}${guest.rsvp_status === 'pending' ? ' · no reply yet' : ''}${guest.rsvp_status === 'declined' ? ' · declined' : ''}</small></span>
  ${tableSelect(guest)}
</div>`;

async function loadSeating() {
  const response = await adminRequest('/api/guests/admin/seating');
  if (!response.ok) return;
  const { data } = await response.json();
  seatingTables = data.tables;
  $('show-tables').checked = data.show_tables;
  const capacity = data.tables.reduce((sum, table) => sum + table.capacity, 0);
  const seated = data.tables.reduce((sum, table) => sum + table.seats_used, 0);
  const waiting = data.unseated.reduce((sum, guest) => sum + guest.seats, 0);
  $('seating-summary').textContent = data.tables.length
    ? `${data.tables.length} tables · ${capacity} seats · ${seated} seats taken · ${waiting} seats still needed for unseated guests.`
    : 'No tables yet. Add some below, then seat each guest.';
  $('table-grid').innerHTML = data.tables.map((table) => `<article class="table-card">
      <header><h4>${escapeHtml(table.name)}</h4><span class="seat-count${table.seats_used > table.capacity ? ' over' : ''}">${table.seats_used}/${table.capacity}</span></header>
      ${table.guests.map(seatRow).join('') || '<p class="hint">Empty</p>'}
      <div class="row-actions no-print" style="margin-top:8px"><button class="secondary small edit-table" data-id="${table.id}" data-name="${escapeHtml(table.name)}" data-capacity="${table.capacity}">Rename / seats</button><button class="danger small delete-table" data-id="${table.id}" data-name="${escapeHtml(table.name)}">Delete</button></div>
    </article>`).join('');
  $('unseated-list').innerHTML = data.unseated.map(seatRow).join('') || '<p class="hint">Everyone who is coming has a seat.</p>';
}

$('tab-seating').addEventListener('change', async (event) => {
  if (event.target.classList.contains('assign-table')) {
    const response = await adminRequest(`/api/guests/admin/seating/guests/${event.target.dataset.id}`, { method: 'PUT', body: JSON.stringify({ table_id: event.target.value || null }) });
    if (!response.ok) showStatus('Unable to move this guest.');
    loadSeating();
  }
  if (event.target.id === 'show-tables') {
    const response = await adminRequest('/api/guests/admin/seating/visibility', { method: 'PUT', body: JSON.stringify({ show_tables: event.target.checked }) });
    $('seating-result').className = response.ok ? 'status success' : 'status error';
    $('seating-result').textContent = !response.ok ? 'Unable to change this setting.' : event.target.checked ? 'Guests can now see their table on their invitation page.' : 'Table numbers are hidden from guests.';
  }
});

$('tab-seating').addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'add-tables') {
    const count = Number($('table-count').value);
    const capacity = Number($('table-capacity').value);
    const taken = new Set(seatingTables.map((table) => table.name));
    let number = 1;
    for (let created = 0; created < count; created += 1) {
      while (taken.has(`Table ${number}`)) number += 1;
      taken.add(`Table ${number}`);
      await adminRequest('/api/guests/admin/seating/tables', { method: 'POST', body: JSON.stringify({ name: `Table ${number}`, capacity }) });
    }
    loadSeating();
  }
  if (button.id === 'print-seating') {
    const names = $('footer-names').textContent;
    $('seating-print-title').textContent = `${names} · Seating plan`;
    window.print();
  }
  if (button.classList.contains('edit-table')) {
    const name = window.prompt('Table name (e.g. "Table 1" or "Bride\'s family")', button.dataset.name);
    if (!name) return;
    const capacity = Number(window.prompt('Number of seats', button.dataset.capacity));
    if (!capacity) return;
    const response = await adminRequest(`/api/guests/admin/seating/tables/${button.dataset.id}`, { method: 'PUT', body: JSON.stringify({ name, capacity }) });
    const data = await response.json();
    if (!response.ok) showStatus(data.error || 'Unable to update table.');
    loadSeating();
  }
  if (button.classList.contains('delete-table')) {
    if (!window.confirm(`Delete ${button.dataset.name}? Its guests will move back to "Not yet seated".`)) return;
    await adminRequest(`/api/guests/admin/seating/tables/${button.dataset.id}`, { method: 'DELETE' });
    loadSeating();
  }
});

/* ---------- Ushers ---------- */

async function loadUshers() {
  const response = await adminRequest('/api/guests/admin/staff');
  if (!response.ok) return;
  const { data } = await response.json();
  $('usher-list').innerHTML = data.length ? data.map((usher) => `<tr><td>${escapeHtml(usher.username)}${usher.is_active ? '' : ' <span class="pill">disabled</span>'}</td><td>${escapeHtml(usher.email)}</td><td>${usher.last_login_at ? new Date(usher.last_login_at).toLocaleString('en-GB') : 'Never'}</td><td><div class="row-actions"><button class="secondary small reset-usher" data-id="${usher.id}" data-name="${escapeHtml(usher.username)}" data-email="${escapeHtml(usher.email)}">Reset password</button><button class="secondary small toggle-usher" data-id="${usher.id}" data-active="${usher.is_active}">${usher.is_active ? 'Disable' : 'Enable'}</button></div></td></tr>`).join('') : '<tr><td colspan="4">No protocol officers yet.</td></tr>';
}

const generateUsherPassword = () => {
  const words = ['Gold', 'Coral', 'Palm', 'Drum', 'Gele', 'Agbada', 'Beads', 'Kola'];
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${words[random[0] % words.length]}-${100000 + (random[1] % 900000)}`;
};

const usherLoginMessage = ({ name, email, password }) => `Hi ${firstNameOf(name)}, thank you for joining the protocol team for the wedding!\n\nOpen: ${window.location.origin}/staff\nEmail: ${email}\nPassword: ${password}\n\nAt the door: scan each guest's entry pass, or type their 6-digit code, or search their name.`;

function showUsherCredentials(credentials, heading) {
  const result = $('usher-result');
  const message = usherLoginMessage(credentials);
  result.className = 'status success';
  result.innerHTML = `<p style="margin:12px 0 6px"><b>${escapeHtml(heading)}</b> Send these details to ${escapeHtml(credentials.name)}. The password won't be shown again.</p><pre class="credentials">${escapeHtml(message)}</pre><div class="row-actions"><button class="small" id="copy-usher-login">Copy login details</button></div>`;
  $('copy-usher-login').addEventListener('click', (event) => copyText(event.currentTarget, message, 'Copy login details'));
}

$('usher-list').addEventListener('click', async (event) => {
  const toggle = event.target.closest('.toggle-usher');
  if (toggle) {
    const response = await adminRequest(`/api/guests/admin/staff/${toggle.dataset.id}`, { method: 'PUT', body: JSON.stringify({ is_active: toggle.dataset.active !== 'true' }) });
    if (response.ok) loadUshers();
    return;
  }
  const reset = event.target.closest('.reset-usher');
  if (!reset || !window.confirm(`Give ${reset.dataset.name} a new password? Their old password will stop working.`)) return;
  const password = generateUsherPassword();
  const response = await adminRequest(`/api/guests/admin/staff/${reset.dataset.id}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
  const data = await response.json();
  if (!response.ok) { $('usher-result').className = 'status error'; $('usher-result').textContent = data.error || 'Unable to reset the password.'; return; }
  showUsherCredentials({ name: reset.dataset.name, email: reset.dataset.email, password }, 'New password set.');
});

$('usher-generate').addEventListener('click', () => { $('usher-password').value = generateUsherPassword(); });

$('create-usher').addEventListener('click', async () => {
  const result = $('usher-result');
  const credentials = { username: $('usher-name').value.trim(), email: $('usher-email').value.trim(), password: $('usher-password').value || generateUsherPassword() };
  const response = await adminRequest('/api/guests/admin/staff', { method: 'POST', body: JSON.stringify(credentials) });
  const data = await response.json();
  if (!response.ok) { result.className = 'status error'; result.textContent = data.error || 'Unable to add this protocol officer.'; return; }
  showUsherCredentials({ name: credentials.username, email: data.data.email, password: credentials.password }, 'Protocol officer added.');
  ['usher-name', 'usher-email', 'usher-password'].forEach((id) => { $(id).value = ''; });
  loadUshers();
});

/* ---------- Door check-in ---------- */

const door = { mode: 'scan', stream: null, scanning: false, busy: false, lastToken: '', lastTokenAt: 0, detector: null, canvas: null, poll: null, searchTimer: null };

const timeOf = (value) => new Date(value).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
const buzz = (pattern) => { if (navigator.vibrate) navigator.vibrate(pattern); };
const partyText = (guest) => (guest.plus_one_count
  ? `Party of ${1 + guest.plus_one_count}: ${firstNameOf(guest.full_name)} + ${guest.plus_one_count} guest${guest.plus_one_count === 1 ? '' : 's'}`
  : 'Coming alone');
const rsvpWarning = (guest) => {
  if (guest.rsvp_status === 'declined') return "They told us they couldn't come. Check with the couple's team before seating them.";
  if (guest.rsvp_status === 'pending') return `They never replied to the invitation${guest.plus_one_cap ? ` (allowed up to ${guest.plus_one_cap} extra guest${guest.plus_one_cap === 1 ? '' : 's'})` : ''}. Check with the couple's team if seats are tight.`;
  return '';
};

async function doorRequest(url, options) {
  const response = await adminRequest(url, options);
  if (response.status === 401) { stopDoor(); signOutOperator(); showStatus('Your session ended. Please sign in again.'); return null; }
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function showDoorResult(kind, html) {
  const box = $('door-result');
  box.className = `door-result ${kind}`;
  box.innerHTML = html;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const guestSummaryHtml = (guest, label) => {
  const table = guest.table_name
    ? `<div class="result-table">${escapeHtml(guest.table_name)}</div>`
    : '<div class="result-table none">No table assigned</div>';
  const warning = rsvpWarning(guest);
  return `<div class="result-label">${label}</div><div class="result-name">${escapeHtml(guest.full_name)}</div><div class="result-party">${escapeHtml(partyText(guest))}</div><div>${table}</div>${warning ? `<p class="result-warning">${escapeHtml(warning)}</p>` : ''}`;
};

function showCheckInOutcome(outcome, guest) {
  if (outcome === 'already_checked_in') {
    buzz([80, 60, 80]);
    showDoorResult('warn', guestSummaryHtml(guest, `Already arrived${guest.checked_in_at ? ` at ${timeOf(guest.checked_in_at)}` : ''}`));
    return;
  }
  buzz(120);
  showDoorResult('ok', `${guestSummaryHtml(guest, '✓ Checked in. Welcome!')}<div class="actions"><button type="button" class="secondary small door-undo" data-id="${guest.id}" data-name="${escapeHtml(guest.full_name)}">Undo this check-in</button></div>`);
}

function showDoorGuest(guest, method) {
  if (guest.checked_in) { showCheckInOutcome('already_checked_in', guest); return; }
  showDoorResult('found', `${guestSummaryHtml(guest, 'Is this the guest?')}<div class="result-actions"><button type="button" class="go door-confirm" data-id="${guest.id}" data-method="${method}">Check in</button><button type="button" class="secondary door-cancel">Cancel</button></div>`);
}

const showDoorError = (message) => { buzz([200, 80, 200]); showDoorResult('bad', `<div class="result-label">Not checked in</div><p class="result-party">${escapeHtml(message)}</p>`); };

async function refreshDoor() {
  const [summary, recent] = await Promise.all([
    doorRequest('/api/guests/admin/check-ins/summary'),
    doorRequest('/api/guests/admin/check-ins/recent')
  ]);
  if (summary?.ok) {
    const s = summary.data.data;
    $('door-arrived').textContent = s.people_arrived;
    $('door-expected').textContent = s.people_expected;
    $('door-progress').style.width = `${s.people_expected ? Math.min(100, Math.round((s.people_arrived / s.people_expected) * 100)) : 0}%`;
    $('door-invites').textContent = `${s.checked_in} of ${s.total} invitations checked in`;
  }
  if (recent?.ok) {
    const rows = recent.data.data;
    $('recent-list').innerHTML = rows.length
      ? rows.map((guest) => `<li><div><b>${escapeHtml(guest.full_name)}</b>${guest.plus_one_count ? ` +${guest.plus_one_count}` : ''}<small>${timeOf(guest.checked_in_at)}${guest.table_name ? ` · ${escapeHtml(guest.table_name)}` : ''}${guest.checked_in_by_name ? ` · by ${escapeHtml(guest.checked_in_by_name)}` : ''}</small></div><button type="button" class="secondary small door-undo" data-id="${guest.id}" data-name="${escapeHtml(guest.full_name)}">Undo</button></li>`).join('')
      : '<li class="empty">No one has arrived yet.</li>';
  }
}

async function confirmDoorCheckIn(guestId, method) {
  const result = await doorRequest('/api/guests/admin/check-ins/confirm', { method: 'POST', body: JSON.stringify({ guestId, method }) });
  if (!result) return;
  if (!result.ok) { showDoorError(result.data.error || 'Check-in failed. Please try again.'); return; }
  showCheckInOutcome(result.data.outcome, result.data.data);
  $('door-code').value = '';
  refreshDoor();
  if (door.mode === 'name') searchDoorGuests();
}

async function undoDoorCheckIn(guestId, name) {
  if (!window.confirm(`Undo the check-in for ${name}?`)) return;
  const result = await doorRequest(`/api/guests/admin/check-ins/${guestId}/undo`, { method: 'POST', body: JSON.stringify({ reason: 'Corrected at the door' }) });
  if (!result) return;
  if (result.ok) showDoorResult('warn', `<div class="result-label">Check-in undone</div><div class="result-name">${escapeHtml(name)}</div><p class="result-party">They can be checked in again when they arrive.</p>`);
  else showDoorError(result.data.error || 'Unable to undo that check-in.');
  refreshDoor();
  if (door.mode === 'name') searchDoorGuests();
}

async function lookupDoorCode() {
  const code = $('door-code').value.replace(/\D/g, '');
  if (code.length !== 6) return;
  const result = await doorRequest('/api/guests/admin/check-ins/lookup', { method: 'POST', body: JSON.stringify({ code }) });
  if (!result) return;
  if (!result.ok) { showDoorError(result.status === 429 ? result.data.error : 'That code was not recognised. Check the digits, or use "Find by name".'); return; }
  showDoorGuest(result.data.data, 'numeric_code');
}

async function searchDoorGuests() {
  const query = $('door-search').value.trim();
  const list = $('door-search-results');
  if (query.length < 2) { list.innerHTML = ''; return; }
  const result = await doorRequest(`/api/guests/admin/check-ins/search?q=${encodeURIComponent(query)}`);
  if (!result?.ok || $('door-search').value.trim() !== query) return;
  const guests = result.data.data;
  door.searchResults = guests;
  const tag = (guest) => {
    if (guest.checked_in) return '<span class="tag in">Arrived</span>';
    if (guest.rsvp_status === 'declined') return '<span class="tag warn">Declined</span>';
    if (guest.rsvp_status === 'pending') return '<span class="tag warn">No reply</span>';
    return '<span class="tag">Expected</span>';
  };
  list.innerHTML = guests.length
    ? guests.map((guest, index) => `<button type="button" class="search-result" data-index="${index}"><span><b>${escapeHtml(guest.full_name)}</b><small>${guest.table_name ? escapeHtml(guest.table_name) : 'No table'} · ${escapeHtml(partyText(guest))}</small></span>${tag(guest)}</button>`).join('')
    : `<p class="hint">No guest named "${escapeHtml(query)}". Try part of their first or last name.</p>`;
}

async function scanToken(qrToken) {
  const result = await doorRequest('/api/guests/admin/check-ins/scan', { method: 'POST', body: JSON.stringify({ qrToken }) });
  if (!result) return;
  if (!result.ok) { showDoorError(result.status === 429 ? result.data.error : "This QR code isn't a valid entry pass for this wedding. Ask for their 6-digit code."); return; }
  showCheckInOutcome(result.data.outcome, result.data.data);
  refreshDoor();
}

function loadJsQr() {
  if (window.jsQR) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/jsQR.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function readQr(video) {
  if (door.detector) return (await door.detector.detect(video))[0]?.rawValue || null;
  const canvas = door.canvas || (door.canvas = document.createElement('canvas'));
  const scale = Math.min(1, 640 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || null;
}

async function scanFrame() {
  if (!door.scanning) return;
  const video = $('camera');
  if (!door.busy && video.readyState >= 2 && video.videoWidth) {
    const token = await readQr(video).catch(() => null);
    const repeat = token === door.lastToken && Date.now() - door.lastTokenAt < 8000;
    if (token && !repeat) {
      door.busy = true;
      door.lastToken = token;
      door.lastTokenAt = Date.now();
      $('scanner-hint').textContent = 'Checking pass...';
      await scanToken(token);
      setTimeout(() => { door.busy = false; if (door.scanning) $('scanner-hint').textContent = 'Ready for the next guest'; }, 1500);
    }
  }
  setTimeout(scanFrame, 180);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { showDoorError('The camera is not available in this browser. Use "Enter code" or "Find by name" instead.'); return; }
  $('toggle-camera').disabled = true;
  try {
    door.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const video = $('camera');
    video.srcObject = door.stream;
    await video.play().catch(() => {});
    const nativeQr = 'BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats().catch(() => [])).includes('qr_code');
    if (nativeQr) door.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    else await loadJsQr();
    door.scanning = true;
    $('toggle-camera').textContent = 'Stop camera';
    $('scanner-hint').textContent = "Point the camera at the guest's entry pass";
    scanFrame();
  } catch {
    stopCamera();
    showDoorError('Camera access was blocked. Allow the camera for this site in your browser settings, or use "Enter code".');
  } finally {
    $('toggle-camera').disabled = false;
  }
}

function stopCamera() {
  door.scanning = false;
  door.busy = false;
  if (door.stream) door.stream.getTracks().forEach((track) => track.stop());
  door.stream = null;
  $('camera').srcObject = null;
  $('toggle-camera').textContent = 'Start camera';
  $('scanner-hint').textContent = "Point the camera at the guest's entry pass";
}

function setDoorMode(mode) {
  door.mode = mode;
  document.querySelectorAll('.door-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
    tab.setAttribute('aria-selected', String(tab.dataset.mode === mode));
  });
  ['scan', 'code', 'name'].forEach((name) => setVisible(`mode-${name}`, name === mode));
  if (mode !== 'scan') stopCamera();
  if (mode === 'code') $('door-code').focus();
  if (mode === 'name') $('door-search').focus();
}

function startDoor() {
  const isAdmin = operatorRole === 'admin' && portalPath === '/admin';
  setVisible('admin-panel', false);
  setVisible('door-panel', true);
  setVisible('door-back', isAdmin);
  setVisible('staff-logout', !isAdmin);
  const name = localStorage.getItem('eventlyOperatorName');
  $('door-greeting').textContent = name ? `Hello, ${firstNameOf(name)}` : 'Welcome guests';
  $('role-label').textContent = 'PROTOCOL';
  refreshDoor();
  clearInterval(door.poll);
  door.poll = setInterval(() => { if (!document.hidden) refreshDoor(); }, 15000);
}

function stopDoor() {
  stopCamera();
  clearInterval(door.poll);
  door.poll = null;
  setVisible('door-panel', false);
}

document.querySelectorAll('.door-tab').forEach((tab) => tab.addEventListener('click', () => setDoorMode(tab.dataset.mode)));
$('toggle-camera').addEventListener('click', () => (door.scanning ? stopCamera() : startCamera()));
$('door-code').addEventListener('input', () => {
  const input = $('door-code');
  input.value = input.value.replace(/\D/g, '').slice(0, 6);
  if (input.value.length === 6) lookupDoorCode();
});
$('door-search').addEventListener('input', () => { clearTimeout(door.searchTimer); door.searchTimer = setTimeout(searchDoorGuests, 250); });
$('door-search-results').addEventListener('click', (event) => {
  const item = event.target.closest('.search-result');
  if (item) showDoorGuest(door.searchResults[Number(item.dataset.index)], 'name_search');
});
$('door-panel').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.classList.contains('door-confirm')) { button.disabled = true; confirmDoorCheckIn(button.dataset.id, button.dataset.method); }
  if (button.classList.contains('door-cancel')) { setVisible('door-result', false); $('door-code').value = ''; }
  if (button.classList.contains('door-undo')) undoDoorCheckIn(button.dataset.id, button.dataset.name);
});
$('refresh-door').addEventListener('click', refreshDoor);
$('admin-open-scanner').addEventListener('click', startDoor);
$('door-back').addEventListener('click', () => { stopDoor(); setVisible('admin-panel', true); $('role-label').textContent = 'ADMIN COMMAND CENTER'; loadGuests(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });

/* ---------- Start-up ---------- */

function startGuestPortal() {
  document.body.classList.add('guest-mode');
  setVisible('admin-login-panel', false);
  loadPublicWedding();
  const params = new URLSearchParams(window.location.search);
  const linkCode = params.get('code');
  const giftReference = params.get('gift') || params.get('reference') || '';
  // Remove the code from the address bar so it is not left in history or shared screenshots
  if (linkCode || giftReference) window.history.replaceState({}, '', window.location.pathname);
  if (linkCode) $('invite-code').value = linkCode;
  const code = linkCode || localStorage.getItem(GUEST_CODE_KEY);
  if (!code) return;
  openInvitation(code, { quiet: !linkCode }).then(() => {
    if (giftReference.startsWith('gift_')) checkGiftReturn(giftReference);
  });
}

function startOperatorPortal() {
  loadPublicWedding({ updateHero: false });
  $('hero-eyebrow').textContent = 'Wedding team';
  $('hero-title').textContent = portalPath === '/staff' ? 'Welcome guests with confidence.' : 'Run the wedding from one desk.';
  $('hero-copy').textContent = portalPath === '/staff' ? 'Sign in to check guests in at the entrance.' : 'Sign in to manage guests, invitations, wedding details and the protocol team.';
  document.querySelectorAll('.staff-url').forEach((element) => { element.textContent = `${window.location.origin}/staff`; });
  if (operatorRole && !allowedOperatorRoles.includes(operatorRole)) signOutOperator();
  setVisible('lookup-panel', false);
  setVisible('guest-panel', false);
  setVisible('admin-login-panel', !adminToken || !operatorRole);
  if (adminToken && operatorRole) showWorkspace();
}

if (isOperatorPortal) startOperatorPortal(); else startGuestPortal();
