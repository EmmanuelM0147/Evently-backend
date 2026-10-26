const $ = (id) => document.getElementById(id);
const setVisible = (id, visible) => $(id)?.classList.toggle('hidden', !visible);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatDate = (value) => value
  ? new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  : '';

let weddingDetails = null;
let rsvpChoice = null;
let countdownTimer = null;

const THEME_KEY = 'wedding-theme';
const themeColorMeta = () => document.getElementById('theme-color');

const getTheme = () => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

const applyTheme = (theme) => {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* private mode */ }
  const meta = themeColorMeta();
  if (meta) meta.content = next === 'dark' ? '#041c18' : '#0b3d34';
  document.querySelectorAll('[data-theme-label]').forEach((el) => {
    el.textContent = next === 'dark' ? 'Light' : 'Dark';
  });
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  });
};

const initTheme = () => {
  applyTheme(getTheme());
  const toggle = () => applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  ['theme-toggle-hero', 'theme-toggle-nav', 'theme-toggle-sheet'].forEach((id) => {
    $(id)?.addEventListener('click', toggle);
  });
};

const initHeroMotion = () => {
  const media = $('hero-media');
  const hero = $('hero');
  if (!media || !hero) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    const rect = hero.getBoundingClientRect();
    if (rect.bottom <= 0) return;
    const progress = Math.min(1, Math.max(0, -rect.top / Math.max(rect.height, 1)));
    media.style.setProperty('--hero-shift', `${(progress * 48).toFixed(1)}px`);
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
};

const copyText = async (button, text, label) => {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  button.textContent = 'Copied';
  button.classList.add('copied');
  setTimeout(() => { button.textContent = label; button.classList.remove('copied'); }, 1600);
};

const initialsOf = (names) => String(names || '').split(/\s*(?:&|\band\b)\s*/i)
  .map((part) => part.match(/\p{L}/u)?.[0]?.toUpperCase()).filter(Boolean).slice(0, 2);

const monogramBeads = () => Array.from({ length: 9 }, (_, index) => {
  const angle = ((215 + index * 13.75) * Math.PI) / 180;
  const x = (50 + 41.5 * Math.cos(angle)).toFixed(2);
  const y = (50 + 41.5 * Math.sin(angle)).toFixed(2);
  return index === 4
    ? `<circle cx="${x}" cy="${y}" r="3" fill="#e85a32" stroke="#ffd5c4" stroke-width="1"/>`
    : `<circle cx="${x}" cy="${y}" r="2.2" fill="#ff8f6a"/>`;
}).join('');

const monogramSvg = (names) => {
  const [first = '', second = ''] = initialsOf(names);
  const letter = (x, value) => `<text x="${x}" y="63" text-anchor="middle" font-family="'Cormorant Garamond', Georgia, serif" font-size="40" font-weight="600" fill="#f7f4ec">${escapeHtml(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="monogram-fill" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#147a62"/><stop offset="1" stop-color="#062821"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#monogram-fill)" stroke="#e85a32" stroke-width="2.5"/>
    <circle cx="50" cy="50" r="44.5" fill="none" stroke="#ff8f6a" stroke-width=".7" opacity=".8"/>
    <circle cx="50" cy="50" r="41.5" fill="none" stroke="#6ec9ae" stroke-width="1.2"/>
    ${monogramBeads()}
    ${second ? `${letter(32, first)}<rect x="46.8" y="46.8" width="6.4" height="6.4" transform="rotate(45 50 50)" fill="#e85a32"/>${letter(68, second)}` : letter(50, first)}
    <rect x="32" y="71" width="36" height="1.6" fill="#6ec9ae"/><rect x="32" y="72.6" width="36" height="3.8" fill="#e85a32"/><rect x="32" y="76.4" width="36" height="1.6" fill="#6ec9ae"/>
  </svg>`;
};

const applyLogo = (names) => {
  const svg = monogramSvg(names);
  ['brand-logo', 'nav-logo', 'footer-logo'].forEach((id) => { if ($(id)) $(id).innerHTML = svg; });
  $('brand-logo')?.setAttribute('aria-label', names);
  $('favicon').href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const weddingStart = (date, time) => {
  if (!date) return null;
  const match = String(time || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hours = match ? Number(match[1]) : 12;
  const minutes = match?.[2] ? Number(match[2]) : 0;
  if (match?.[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
  if (match?.[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
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

const icsText = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const icsDate = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function downloadCalendar() {
  const start = weddingStart(weddingDetails?.wedding_date, weddingDetails?.settings?.ceremony_time);
  if (!start) return;
  const s = weddingDetails.settings || {};
  const location = [weddingDetails.venue, s.venue_address].filter(Boolean).join(', ');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Traditional Wedding//EN', 'BEGIN:VEVENT',
    `UID:${weddingDetails.wedding_date}-guest@wedding`,
    `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(new Date(start.getTime() + 6 * 3600000))}`,
    `SUMMARY:${icsText(weddingDetails.name)}`, `LOCATION:${icsText(location)}`,
    `DESCRIPTION:${icsText('Traditional wedding invitation')}`,
    'END:VEVENT', 'END:VCALENDAR', ''
  ].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  link.download = 'traditional-wedding.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function renderInvitation(data) {
  weddingDetails = data;
  const s = data.settings || {};
  const names = data.couple_names || data.name || 'Our Traditional Wedding';
  applyLogo(names);
  $('footer-names').textContent = names;
  $('footer-hashtag').textContent = s.hashtag || data.hashtag || '';
  $('details-hashtag').textContent = s.hashtag || data.hashtag || '';
  document.title = `${names} · Traditional Wedding`;

  const parts = String(data.couple_names || '').split(/\s*&\s*/).filter(Boolean);
  $('hero-title').innerHTML = parts.length === 2
    ? `<span class="name">${escapeHtml(parts[0])}</span><span class="amp">&amp;</span><span class="name">${escapeHtml(parts[1])}</span>`
    : `<span class="name">${escapeHtml(names)}</span>`;

  const heroEyebrow = document.querySelector('.hero-eyebrow');
  if (heroEyebrow) heroEyebrow.textContent = 'We are honoured to invite you';
  if ($('hero-copy')) {
    $('hero-copy').textContent = parts.length === 2
      ? `to the traditional wedding of ${parts[0]} & ${parts[1]} — venue details are shared only here.`
      : (s.welcome_message || '').split(/\n+/).filter(Boolean)[0]
        || 'This link is your invitation — venue details are shared only here.';
  }

  const when = [formatDate(data.wedding_date), s.ceremony_time || data.ceremony_time].filter(Boolean).join(' · ');
  $('when-line').textContent = when;
  if ($('hero-date')) {
    $('hero-date').textContent = formatDate(data.wedding_date);
  }
  $('venue-name').textContent = data.venue || 'Venue to be announced';
  $('venue-address').textContent = s.venue_address || '';

  if (s.welcome_message && $('note-lead')) {
    $('note-lead').textContent = s.welcome_message.split(/\n+/).filter(Boolean)[0] || '';
  }

  // Guest-facing attire only — no parents/siblings colour lists (couple agreed: Touch of gold)
  const colourNote = s.colour_note || (Array.isArray(s.colours) && s.colours.length === 1 ? s.colours[0] : '');
  const dressCode = s.dress_code || 'Traditional attire';
  const groups = (s.dress_code_groups || []).filter((item) => {
    const label = String(item.group || '');
    return !/parent|sibling/i.test(label);
  });

  if ($('dress-lead')) {
    $('dress-lead').textContent = colourNote
      ? `${dressCode} · ${colourNote}`
      : dressCode;
  }

  if (groups.length > 0) {
    $('dress-list').innerHTML = groups.map((item) => `
      <div class="dress-item">
        <b>${escapeHtml(item.group)}</b>
        <span>${escapeHtml((item.colours || []).join(' · '))}</span>
      </div>`).join('');
  } else if (colourNote) {
    $('dress-list').innerHTML = `
      <div class="dress-item">
        <b>${escapeHtml(dressCode)}</b>
        <span>${escapeHtml(colourNote)}</span>
      </div>`;
  } else {
    $('dress-list').innerHTML = '';
  }
  setVisible('dress', Boolean(dressCode || colourNote || groups.length));

  const programme = s.programme || [];
  const list = $('programme-list');
  list.innerHTML = programme.map((item) => `<li>${escapeHtml(item.title)}</li>`).join('');
  const long = programme.length > 6;
  list.classList.toggle('collapsed', long);
  setVisible('programme-toggle', long);
  $('programme-toggle').textContent = `Show all ${programme.length} steps`;
  setVisible('programme', programme.length > 0);
  programme.forEach((_, index) => {
    const li = list.children[index];
    if (li) li.style.animationDelay = `${Math.min(index, 10) * 0.05}s`;
  });

  const note = data.gift_note || s.gift_note;
  const bankName = data.bank_name || s.bank_name;
  const accountNumber = data.bank_account_number || s.bank_account_number;
  const accountName = data.bank_account_name || s.bank_account_name;
  const giftsOn = Boolean(data.gifts_enabled ?? s.gifts_enabled) && Boolean(accountNumber);
  setVisible('gift', giftsOn);
  if (giftsOn) {
    $('gift-note').textContent = note || '';
    $('gift-bank').innerHTML = [['Bank', bankName], ['Account number', accountNumber, true], ['Account name', accountName]]
      .filter(([, value]) => value)
      .map(([label, value, copy]) => `<div class="bank-row"><div><small>${label}</small><b>${escapeHtml(value)}</b></div>${copy ? `<button type="button" class="copy-bank" data-value="${escapeHtml(value)}">Copy</button>` : ''}</div>`)
      .join('');
  }

  startCountdown(data.wedding_date, s.ceremony_time || data.ceremony_time);
}

function revealSection(node) {
  if (node) node.classList.add('in');
}

function observeReveals() {
  const nodes = [...document.querySelectorAll('[data-reveal]')];
  if (!('IntersectionObserver' in window)) {
    nodes.forEach(revealSection);
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      revealSection(entry.target);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
  nodes.forEach((node) => observer.observe(node));
  // Hash / in-page jumps can land past the observer threshold before it fires
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => {
      const target = document.querySelector(link.getAttribute('href'));
      revealSection(target);
    });
  });
}

function bindNav() {
  const nav = $('page-nav');
  const hero = $('hero');
  const links = [...document.querySelectorAll('.nav-links a, .nav-sheet-links a')];
  const rsvpBtn = document.querySelector('.nav-rsvp-btn');
  const nowLabel = $('nav-now-label');
  const menuBtn = $('nav-menu-btn');
  const sheet = $('nav-sheet');
  const sectionIds = ['details', 'dress', 'programme', 'gift', 'rsvp'];
  const labels = {
    details: 'When & where',
    dress: 'Dress code',
    programme: 'Programme',
    gift: 'Gifts',
    rsvp: 'RSVP'
  };
  const sections = sectionIds.map((id) => $(id)).filter(Boolean);
  let lastActive = '';

  const setSheetOpen = (open) => {
    if (!sheet || !menuBtn) return;
    sheet.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };

  menuBtn?.addEventListener('click', () => setSheetOpen(Boolean(sheet?.hidden)));
  $('nav-sheet-close')?.addEventListener('click', () => setSheetOpen(false));
  $('nav-sheet-backdrop')?.addEventListener('click', () => setSheetOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSheetOpen(false);
  });
  sheet?.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', () => setSheetOpen(false));
  });

  const cue = document.querySelector('.scroll-cue');
  const onScroll = () => {
    const pastHero = window.scrollY > hero.offsetHeight * 0.55;
    nav.classList.toggle('visible', pastHero);
    if (cue) cue.classList.toggle('hidden', window.scrollY > 48);
    let current = sections[0];
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top < window.innerHeight * 0.4) current = section;
    });
    const href = `#${current.id}`;
    links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === href));
    if (rsvpBtn) rsvpBtn.classList.toggle('active', current.id === 'rsvp');
    if (href !== lastActive) {
      lastActive = href;
      if (nowLabel) nowLabel.textContent = labels[current.id] || current.id;
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

const setMsg = (text = '', kind = '') => {
  $('rsvp-msg').textContent = text;
  $('rsvp-msg').className = `inline-msg ${kind}`;
};

const setRsvpChoice = (value) => {
  rsvpChoice = value;
  document.querySelectorAll('#rsvp-shell .choice').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.value === value));
  });
  setVisible('plus-ones-field', value === 'attending');
};

document.querySelectorAll('#rsvp-shell .choice').forEach((button) => {
  button.addEventListener('click', () => { setRsvpChoice(button.dataset.value); setMsg(); });
});

const stepPlusOnes = (delta) => {
  const input = $('plus-ones');
  input.value = Math.min(5, Math.max(0, Number(input.value || 0) + delta));
};
$('plus-minus').addEventListener('click', () => stepPlusOnes(-1));
$('plus-plus').addEventListener('click', () => stepPlusOnes(1));
$('add-calendar').addEventListener('click', downloadCalendar);
$('programme-toggle').addEventListener('click', () => {
  const list = $('programme-list');
  const collapsed = list.classList.toggle('collapsed');
  const total = list.children.length;
  $('programme-toggle').textContent = collapsed ? `Show all ${total} steps` : 'Show fewer';
});
$('gift-bank').addEventListener('click', (event) => {
  const button = event.target.closest('.copy-bank');
  if (button) copyText(button, button.dataset.value, 'Copy');
});

$('save-rsvp').addEventListener('click', async () => {
  const fullName = $('rsvp-name').value.trim();
  const email = $('rsvp-email')?.value.trim() || '';
  if (!fullName) { setMsg('Please enter your full name.', 'error'); return; }
  if (!rsvpChoice) { setMsg('Please choose whether you can attend.', 'error'); return; }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setMsg('Please enter a valid email, or leave it blank.', 'error');
    return;
  }
  const attending = rsvpChoice === 'attending';
  const button = $('save-rsvp');
  button.disabled = true;
  try {
    const response = await fetch('/api/guests/rsvp/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        email: email || undefined,
        phone: $('rsvp-phone').value.trim() || undefined,
        status: rsvpChoice,
        plus_one_count: attending ? Number($('plus-ones').value) : 0
      })
    });
    const data = await response.json();
    if (!response.ok) { setMsg(data.error || 'Unable to save your response. Please try again.', 'error'); return; }
    const thanks = attending
      ? 'Thank you! We look forward to celebrating with you.'
      : 'Thank you for letting us know. You will be missed.';
    const mailNote = email
      ? (data.email_confirmation
        ? ' A confirmation is on its way to your email.'
        : ' Your reply is saved — if the confirmation email is delayed, check spam or try again shortly.')
      : '';
    setMsg(`${thanks}${mailNote}`, 'success');
    button.textContent = 'Response saved';
    $('rsvp-shell').classList.add('done');
  } finally {
    button.disabled = false;
  }
});

async function start() {
  initTheme();
  initHeroMotion();
  observeReveals();
  bindNav();
  try {
    const response = await fetch('/api/guests/wedding');
    if (!response.ok) return;
    const { data } = await response.json();
    renderInvitation(data);
  } catch {
    // Keep the static shell if the API is briefly unreachable
  }
}

start();
