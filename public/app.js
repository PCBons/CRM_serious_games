'use strict';

// Formatting preferences
const LOCALE = 'nl-NL';
const CURRENCY = 'EUR';

const state = { me: null, meta: null, users: [] };
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const main = () => $('#main');

// ---------- utilities ----------

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(v || 0);
const moneyShort = v => new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);
const pct = v => (v == null ? '—' : Math.round(v * 100) + '%');
const toDate = d => (typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00') : new Date(d));
const fmtDate = d => (d ? toDate(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtDateTime = d => (d ? new Date(d).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, local
const daysSince = d => Math.floor((Date.now() - new Date(d)) / 864e5);
const initials = name => (name || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const fullName = c => [c.first_name, c.last_name].filter(Boolean).join(' ');

function relTime(d) {
  const diff = (new Date(d) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, s] of units) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), unit);
  return 'just now';
}

function dueHtml(d) {
  if (!d) return '';
  const t = today();
  const cls = d < t ? 'overdue' : d === t ? 'today' : '';
  const label = d === t ? 'Today' : fmtDate(d);
  return `<span class="${cls}">${label}</span>`;
}

const stageOf = key => state.meta.stages.find(s => s.key === key) || { label: key };
const stageBadge = key => `<span class="badge ${key === 'won' ? 'won' : key === 'lost' ? 'lost' : 'open'}">${esc(stageOf(key).label)}</span>`;
const userOptions = () => state.users.filter(u => u.active).map(u => ({ value: u.id, label: u.name }));

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !['/login', '/setup'].includes(path)) {
    showLogin();
    throw new Error('Please log in');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
const post = (p, body) => api(p, { method: 'POST', body });
const put = (p, body) => api(p, { method: 'PUT', body });
const patch = (p, body) => api(p, { method: 'PATCH', body });
const del = p => api(p, { method: 'DELETE' });

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

// ---------- icons (Lucide-style strokes) ----------

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  columns: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  call: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  meeting: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  stage: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
};
const icon = name => `<i data-icon="${name}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg></i>`;
function hydrateIcons(root = document) {
  $$('i[data-icon]:empty', root).forEach(el => { el.outerHTML = icon(el.dataset.icon); });
}

// ---------- tooltip ----------

document.addEventListener('mousemove', e => {
  const tip = $('#tip');
  const target = e.target.closest?.('[data-tip]');
  if (!target) { tip.hidden = true; return; }
  tip.textContent = target.dataset.tip;
  tip.hidden = false;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  const y = e.clientY + 16 + tip.offsetHeight > window.innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 16;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
});

// ---------- forms & modals ----------

function fieldHtml(f, values = {}) {
  if (f.section) return `<div class="form-section">${esc(f.section)}</div>`;
  const val = values[f.name] ?? f.default ?? '';
  const req = f.required ? 'required' : '';
  const label = `<span>${esc(f.label)}${f.required ? ' *' : ''}</span>`;
  if (f.type === 'checkbox') {
    return `<label class="field check ${f.wide ? 'wide' : ''}"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}>${label}</label>`;
  }
  let input;
  if (f.type === 'textarea') {
    input = `<textarea name="${f.name}" rows="${f.rows || 3}" ${req} placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`;
  } else if (f.type === 'select') {
    const opts = f.options.map(o => {
      const [v, l] = typeof o === 'object' ? [o.value, o.label] : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
    input = `<select name="${f.name}" ${req}>${f.blank === false ? '' : `<option value="">${esc(f.blank || '—')}</option>`}${opts}</select>`;
  } else {
    const list = f.list ? `list="dl-${f.name}"` : '';
    const extra = f.type === 'number' ? 'step="any" min="0" inputmode="decimal"' : '';
    input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(val)}" ${list} ${req} ${extra} placeholder="${esc(f.placeholder || '')}" ${f.autofocus ? 'autofocus' : ''} autocomplete="off">`;
    if (f.list) input += `<datalist id="dl-${f.name}">${f.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
  }
  return `<label class="field ${f.wide || f.type === 'textarea' ? 'wide' : ''}">${label}${input}</label>`;
}

function formData(form, fields) {
  const out = {};
  for (const f of fields) {
    if (!f.name) continue;
    const el = form.elements[f.name];
    out[f.name] = f.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}

// Opens a modal form. Resolves with the onSubmit result, or null when cancelled.
function openForm({ title, fields, values = {}, submitLabel = 'Save', onSubmit, danger }) {
  const dlg = $('#modal');
  dlg.innerHTML = `
    <form method="dialog" novalidate>
      <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="modal-body"><div class="form-grid">${fields.map(f => fieldHtml(f, values)).join('')}</div></div>
      <div class="modal-foot">
        <span class="error"></span>
        ${danger ? `<button type="button" class="btn bad" data-danger>${esc(danger.label)}</button>` : ''}
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </div>
    </form>`;
  return new Promise(resolve => {
    const form = $('form', dlg);
    const close = result => { dlg.close(); resolve(result); };
    $$('[data-close]', dlg).forEach(b => (b.onclick = () => close(null)));
    dlg.oncancel = () => resolve(null);
    // The confirmation reuses the same dialog, so close the form first.
    if (danger) $('[data-danger]', dlg).onclick = () => { close(null); danger.onClick().catch(e => toast(e.message, 'error')); };
    form.onsubmit = async e => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      try {
        close(await onSubmit(formData(form, fields), form));
      } catch (err) {
        $('.error', dlg).textContent = err.message;
        btn.disabled = false;
      }
    };
    dlg.showModal();
    ($('[autofocus]', dlg) || $('input, select, textarea', dlg))?.focus();
  });
}

function confirmBox(message, okLabel = 'Delete') {
  const dlg = $('#modal');
  dlg.innerHTML = `
    <form method="dialog">
      <div class="modal-head"><h2>Are you sure?</h2></div>
      <div class="modal-body">${esc(message)}</div>
      <div class="modal-foot"><button value="no" class="btn">Cancel</button><button value="yes" class="btn primary">${esc(okLabel)}</button></div>
    </form>`;
  return new Promise(resolve => {
    dlg.onclose = () => { dlg.onclose = null; resolve(dlg.returnValue === 'yes'); };
    dlg.returnValue = '';
    dlg.showModal();
  });
}

// ---------- entity forms ----------

async function orgNames() {
  return (await api('/organizations')).map(o => o.name);
}

async function newLeadForm(preset = {}) {
  const orgs = await orgNames();
  const m = state.meta;
  const fields = [
    { section: 'Organization & contact' },
    { name: 'organization_name', label: 'Organization', list: orgs, autofocus: true, placeholder: 'Existing or new organization' },
    { name: 'sector', label: 'Sector', placeholder: 'e.g. Healthcare, Education' },
    { name: 'first_name', label: 'First name' },
    { name: 'last_name', label: 'Last name' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'job_title', label: 'Job title', wide: true },
    { section: 'Opportunity' },
    { name: 'product', label: 'Interested in', list: m.products },
    { name: 'value', label: `Estimated value (${CURRENCY})`, type: 'number' },
    { name: 'source', label: 'Lead source', type: 'select', options: m.sources },
    { name: 'expected_close', label: 'Expected close', type: 'date' },
    { name: 'owner_id', label: 'Owner', type: 'select', options: userOptions(), blank: false, default: state.me.id },
    { name: 'title', label: 'Deal name', placeholder: 'Optional — generated from organization + product' },
    { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'What are they interested in? Where did you meet?' },
  ];
  const deal = await openForm({
    title: 'Register new lead', fields, values: preset, submitLabel: 'Create lead',
    onSubmit: data => {
      if (!data.organization_name && !data.first_name && !data.title) throw new Error('Enter at least an organization, a contact name or a deal name');
      return post('/leads', data);
    },
  });
  if (deal) { toast('Lead created'); location.hash = `#/deals/${deal.id}`; }
}

async function dealForm(deal = {}, { contacts, orgs } = {}) {
  orgs ||= await api('/organizations');
  contacts ||= await api('/contacts');
  const m = state.meta;
  const fields = [
    { name: 'title', label: 'Deal name', required: true, wide: true, autofocus: !deal.id },
    { name: 'organization_id', label: 'Organization', type: 'select', options: orgs.map(o => ({ value: o.id, label: o.name })) },
    { name: 'contact_id', label: 'Contact person', type: 'select', options: contacts.map(c => ({ value: c.id, label: fullName(c) + (c.organization_name ? ` (${c.organization_name})` : '') })) },
    { name: 'value', label: `Value (${CURRENCY})`, type: 'number' },
    { name: 'product', label: 'Product / service', list: m.products },
    { name: 'source', label: 'Lead source', type: 'select', options: m.sources },
    { name: 'expected_close', label: 'Expected close', type: 'date' },
    { name: 'owner_id', label: 'Owner', type: 'select', options: userOptions(), blank: 'Unassigned' },
    ...(deal.id ? [] : [{ name: 'stage', label: 'Stage', type: 'select', options: m.stages.map(s => ({ value: s.key, label: s.label })), blank: false }]),
    { name: 'notes', label: 'Description', type: 'textarea' },
  ];
  return openForm({
    title: deal.id ? 'Edit deal' : 'New deal', fields, values: { owner_id: state.me.id, ...deal },
    onSubmit: data => (deal.id ? put(`/deals/${deal.id}`, data) : post('/deals', data)),
    danger: deal.id && { label: 'Delete', onClick: async () => {
      if (!(await confirmBox(`Delete deal "${deal.title}" including its activity history and tasks?`))) return;
      await del(`/deals/${deal.id}`); toast('Deal deleted'); location.hash = '#/deals';
    } },
  });
}

async function contactForm(contact = {}) {
  const orgs = await api('/organizations');
  const fields = [
    { name: 'first_name', label: 'First name', required: true, autofocus: true },
    { name: 'last_name', label: 'Last name' },
    { name: 'organization_id', label: 'Organization', type: 'select', options: orgs.map(o => ({ value: o.id, label: o.name })) },
    { name: 'job_title', label: 'Job title' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'linkedin', label: 'LinkedIn URL', type: 'url', wide: true },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  return openForm({
    title: contact.id ? 'Edit contact' : 'New contact', fields, values: contact,
    onSubmit: data => (contact.id ? put(`/contacts/${contact.id}`, data) : post('/contacts', data)),
    danger: contact.id && { label: 'Delete', onClick: async () => {
      if (!(await confirmBox(`Delete ${fullName(contact)}? Their deals are kept but unlinked.`))) return;
      await del(`/contacts/${contact.id}`); toast('Contact deleted'); location.hash = '#/contacts';
    } },
  });
}

async function orgForm(org = {}) {
  const fields = [
    { name: 'name', label: 'Name', required: true, autofocus: true, wide: true },
    { name: 'sector', label: 'Sector' },
    { name: 'website', label: 'Website', type: 'url', placeholder: 'https://' },
    { name: 'city', label: 'City' },
    { name: 'country', label: 'Country' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  return openForm({
    title: org.id ? 'Edit organization' : 'New organization', fields, values: org,
    onSubmit: data => (org.id ? put(`/organizations/${org.id}`, data) : post('/organizations', data)),
    danger: org.id && { label: 'Delete', onClick: async () => {
      if (!(await confirmBox(`Delete ${org.name}? Contacts and deals are kept but unlinked.`))) return;
      await del(`/organizations/${org.id}`); toast('Organization deleted'); location.hash = '#/organizations';
    } },
  });
}

async function taskForm(task = {}) {
  const deals = await api('/deals?status=open');
  const fields = [
    { name: 'title', label: 'Task', required: true, wide: true, autofocus: true, placeholder: 'e.g. Send proposal, follow-up call' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'assigned_to', label: 'Assigned to', type: 'select', options: userOptions(), blank: false, default: state.me.id },
    { name: 'deal_id', label: 'Related deal', type: 'select', options: deals.map(d => ({ value: d.id, label: d.title })), wide: true },
  ];
  return openForm({
    title: task.id ? 'Edit task' : 'New task', fields, values: task,
    onSubmit: data => (task.id ? put(`/tasks/${task.id}`, data) : post('/tasks', data)),
  });
}

function lostReasonForm() {
  return openForm({
    title: 'Mark deal as lost', submitLabel: 'Mark as lost',
    fields: [
      { name: 'lost_reason', label: 'Why was it lost?', type: 'select', options: state.meta.lostReasons, required: true, wide: true },
      { name: 'detail', label: 'Details (optional)', type: 'textarea', rows: 2 },
    ],
    onSubmit: d => ({ lost_reason: d.lost_reason, detail: d.detail }),
  });
}

// Moves a deal to a stage, asking for a reason when it is lost.
async function moveDeal(deal, stage) {
  if (stage === deal.stage) return null;
  let body = { stage };
  if (stage === 'lost') {
    const r = await lostReasonForm();
    if (!r) return null;
    body.lost_reason = r.lost_reason;
    if (r.detail) await post('/activities', { type: 'note', body: `Lost: ${r.detail}`, deal_id: deal.id });
  }
  const updated = await patch(`/deals/${deal.id}/stage`, body);
  toast(stage === 'won' ? '🎉 Deal won — congratulations!' : `Moved to ${stageOf(stage).label}`);
  return updated;
}

// ---------- shared blocks: activities & tasks ----------

function composerHtml() {
  const labels = { note: 'Note', call: 'Call', email: 'Email', meeting: 'Meeting' };
  return `
    <div class="composer">
      <div class="tabs">${state.meta.activityTypes.map((t, i) => `<button type="button" class="tab ${i ? '' : 'active'}" data-type="${t}">${icon(t)}${labels[t]}</button>`).join('')}</div>
      <textarea rows="3" placeholder="Log a note, call summary, email or meeting outcome…"></textarea>
      <div class="row"><button class="btn primary small" data-log>Log activity</button></div>
    </div>`;
}

function timelineHtml(acts, { showDeal = false } = {}) {
  if (!acts.length) return '<div class="empty">No activity yet</div>';
  const verbs = { note: 'added a note', call: 'logged a call', email: 'logged an email', meeting: 'logged a meeting', stage: '' };
  return `<ul class="timeline">${acts.map(a => `
    <li>
      <span class="tl-icon ${a.type === 'stage' ? 'stage' : ''}">${icon(a.type === 'stage' ? 'stage' : a.type)}</span>
      <div>
        <div class="tl-head">
          <b>${esc(a.user_name || 'System')}</b> ${verbs[a.type] ?? ''}
          ${showDeal && a.deal_title ? `· <a href="#/deals/${a.deal_id}">${esc(a.deal_title)}</a>` : ''}
          · <span data-tip="${esc(fmtDateTime(a.created_at))}">${relTime(a.created_at)}</span>
          ${a.type !== 'stage' && (a.user_id === state.me.id || state.me.role === 'admin') ? `<button class="icon-btn" data-del-activity="${a.id}" aria-label="Delete">${icon('trash')}</button>` : ''}
        </div>
        <div class="tl-body ${a.type === 'stage' ? 'system' : ''}">${esc(a.body)}</div>
      </div>
    </li>`).join('')}</ul>`;
}

function bindActivities(root, link, reload) {
  let type = state.meta.activityTypes[0];
  $$('.tab', root).forEach(t => (t.onclick = () => {
    $$('.tab', root).forEach(x => x.classList.toggle('active', x === t));
    type = t.dataset.type;
  }));
  const ta = $('.composer textarea', root);
  const submit = async () => {
    if (!ta.value.trim()) return ta.focus();
    try {
      await post('/activities', { type, body: ta.value, ...link });
      toast('Activity logged');
      reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  $('[data-log]', root).onclick = submit;
  ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); };
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-del-activity]');
    if (!b) return;
    if (!(await confirmBox('Delete this activity entry?'))) return;
    await del(`/activities/${b.dataset.delActivity}`);
    reload();
  });
}

function taskRow(t, { showLinks = true } = {}) {
  return `
    <div class="task ${t.done ? 'done' : ''}">
      <input type="checkbox" data-toggle-task="${t.id}" ${t.done ? 'checked' : ''} aria-label="Mark done">
      <div class="body">
        <div class="t">${esc(t.title)}</div>
        <div class="sub">
          ${t.due_date ? `<span>Due ${dueHtml(t.due_date)}</span>` : ''}
          ${showLinks && t.deal_title ? `<a href="#/deals/${t.deal_id}">${esc(t.deal_title)}</a>` : ''}
          ${showLinks && !t.deal_title && t.contact_name ? `<a href="#/contacts/${t.contact_id}">${esc(t.contact_name)}</a>` : ''}
          ${t.assigned_name && t.assigned_to !== state.me.id ? `<span>${esc(t.assigned_name)}</span>` : ''}
        </div>
      </div>
      <button class="icon-btn" data-edit-task="${t.id}" aria-label="Edit">${icon('edit')}</button>
      <button class="icon-btn" data-del-task="${t.id}" aria-label="Delete">${icon('trash')}</button>
    </div>`;
}

function tasksBlock(tasks, opts) {
  return `
    <div data-tasks>${tasks.length ? tasks.map(t => taskRow(t, opts)).join('') : '<div class="empty">No tasks</div>'}</div>
    <form class="add-inline" data-add-task>
      <input name="title" placeholder="Add a follow-up task…" required>
      <input name="due_date" type="date" value="">
      <button class="btn small">Add</button>
    </form>`;
}

function bindTasks(root, tasks, link, reload) {
  root.addEventListener('change', async e => {
    const id = e.target.dataset.toggleTask;
    if (!id) return;
    await put(`/tasks/${id}`, { done: e.target.checked });
    if (e.target.checked) toast('Task completed');
    refreshTaskBadge();
    reload();
  });
  root.addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit-task]');
    const rm = e.target.closest('[data-del-task]');
    if (edit) {
      const task = tasks.find(t => t.id == edit.dataset.editTask);
      if (await taskForm(task)) reload();
    } else if (rm) {
      if (!(await confirmBox('Delete this task?'))) return;
      await del(`/tasks/${rm.dataset.delTask}`);
      refreshTaskBadge();
      reload();
    }
  });
  const form = $('[data-add-task]', root);
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    await post('/tasks', { title: form.title.value, due_date: form.due_date.value, ...link });
    toast('Task added');
    refreshTaskBadge();
    reload();
  };
}

async function refreshTaskBadge() {
  try {
    const tasks = await api('/tasks');
    const n = tasks.filter(t => t.due_date && t.due_date <= today()).length;
    const b = $('#task-badge');
    b.hidden = !n;
    b.textContent = n;
    b.title = `${n} task(s) due today or overdue`;
  } catch { /* ignore */ }
}

// ---------- views ----------

function emptyState(title, text) {
  return `<div class="empty"><b>${esc(title)}</b>${esc(text)}</div>`;
}

async function viewDashboard() {
  const period = sessionStorage.getItem('period') || 'year';
  const s = await api('/stats?period=' + period);
  const k = s.kpis;
  const periods = [['30d', '30 days'], ['90d', '90 days'], ['quarter', 'Quarter'], ['year', 'This year'], ['all', 'All time']];
  const maxFunnel = Math.max(1, ...s.funnel.map(f => f.n));

  main().innerHTML = `
    <div class="page-head">
      <div><h1>Hi ${esc(state.me.name.split(' ')[0])} 👋</h1><div class="subtitle">Here's how your serious game pipeline is doing.</div></div>
      <div class="actions"><div class="seg" id="period">${periods.map(([v, l]) => `<button data-p="${v}" class="${v === period ? 'active' : ''}">${l}</button>`).join('')}</div></div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="label">Open pipeline</div><div class="value">${money(k.pipelineValue)}</div><div class="sub">${k.openDeals} open deals</div></div>
      <div class="kpi"><div class="label">Weighted forecast</div><div class="value">${money(k.weightedValue)}</div><div class="sub">by stage probability</div></div>
      <div class="kpi"><div class="label">Won</div><div class="value">${money(k.wonValue)}</div><div class="sub">${k.wonCount} deals · ${k.lostCount} lost</div></div>
      <div class="kpi"><div class="label">Win rate</div><div class="value">${pct(k.winRate)}</div><div class="sub">of closed deals</div></div>
      <div class="kpi"><div class="label">Avg deal size</div><div class="value">${k.avgDealSize == null ? '—' : money(k.avgDealSize)}</div><div class="sub">won deals</div></div>
      <div class="kpi"><div class="label">Avg sales cycle</div><div class="value">${k.avgCycleDays == null ? '—' : Math.round(k.avgCycleDays) + ' d'}</div><div class="sub">lead → won</div></div>
    </div>

    <div class="grid side">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Conversion funnel</h2><span class="muted small">${k.newLeads} leads ${period === 'all' ? 'in total' : 'created in period'} · % = conversion from previous stage</span></div>
          ${k.newLeads ? `<div class="funnel">${s.funnel.map((f, i) => {
            const w = (f.n / maxFunnel) * 100;
            const prev = i ? s.funnel[i - 1].n : null;
            const conv = prev ? f.n / prev : null;
            const inside = w > 18;
            return `<div class="funnel-row" data-tip="${esc(`${f.label}: ${f.n} deals reached this stage${i ? `\n${pct(conv)} of previous stage\n${pct(f.n / s.funnel[0].n)} of all leads` : ''}`)}">
              <span class="name">${esc(f.label)}</span>
              <div class="funnel-track"><div class="funnel-bar" style="width:${w}%">${inside ? `<span>${f.n}</span>` : ''}</div>${inside ? '' : `<span class="outside" style="left:${w}%">${f.n}</span>`}</div>
              <span class="conv">${i ? pct(conv) : ''}</span>
            </div>`;
          }).join('')}</div>` : emptyState('No leads yet', 'Register your first lead with the “New lead” button.')}
        </div>

        <div class="card">
          <div class="card-head"><h2>Leads & wins per month</h2>
            <div class="legend"><span style="--c:var(--series-1)">New leads</span><span style="--c:var(--series-2)">Won deals</span></div>
          </div>
          <div class="chart">${monthlyChart(s.monthly)}</div>
        </div>

        <div class="grid cols-2">
          <div class="card">
            <div class="card-head"><h2>Lead sources</h2></div>
            ${s.sources.length ? `<div class="table-wrap"><table>
              <thead><tr><th>Source</th><th class="right">Leads</th><th class="right">Won</th><th class="right">Conv.</th></tr></thead>
              <tbody>${s.sources.map(r => `<tr><td>${esc(r.source)}</td><td class="right num">${r.n}</td><td class="right num">${r.won}</td><td class="right num">${pct(r.won / r.n)}</td></tr>`).join('')}</tbody>
            </table></div>` : emptyState('No data', 'Sources appear once leads are registered.')}
          </div>
          <div class="card">
            <div class="card-head"><h2>Why deals are lost</h2></div>
            ${s.lostReasons.length ? `<ul class="list-plain">${s.lostReasons.map(r => `<li><span>${esc(r.reason)}</span><span class="badge" style="margin-left:auto">${r.n}</span></li>`).join('')}</ul>`
              : emptyState('Nothing lost', 'Lost reasons show up here.')}
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card" id="dash-tasks">
          <div class="card-head"><h2>My tasks</h2>
            <div class="actions">${s.taskCounts.overdue ? `<span class="badge lost">${s.taskCounts.overdue} overdue</span>` : ''}${s.taskCounts.today ? `<span class="badge warn">${s.taskCounts.today} today</span>` : ''}</div>
          </div>
          <div data-tasks>${s.myTasks.length ? s.myTasks.map(t => taskRow(t)).join('') : emptyState('All clear', 'No open tasks assigned to you.')}</div>
          <div style="margin-top:8px"><a href="#/tasks">All tasks →</a></div>
        </div>
        ${s.stale.length ? `<div class="card">
          <div class="card-head"><h2>Needs attention</h2><span class="muted small">no update in 14+ days</span></div>
          <ul class="list-plain">${s.stale.map(d => `<li><div style="min-width:0"><a href="#/deals/${d.id}">${esc(d.title)}</a><div class="muted small">${esc(stageOf(d.stage).label)} · ${relTime(d.updated_at)}</div></div><span class="num small" style="margin-left:auto">${moneyShort(d.value)}</span></li>`).join('')}</ul>
        </div>` : ''}
        <div class="card">
          <div class="card-head"><h2>Recent activity</h2></div>
          ${timelineHtml(s.recent, { showDeal: true })}
        </div>
      </div>
    </div>`;

  $$('#period button').forEach(b => (b.onclick = () => { sessionStorage.setItem('period', b.dataset.p); viewDashboard(); }));
  bindTasks($('#dash-tasks'), s.myTasks, {}, viewDashboard);
}

function monthlyChart(rows) {
  const W = 640, H = 200, padL = 28, padB = 22, padT = 8;
  const max = Math.max(4, ...rows.map(r => Math.max(r.leads, r.won)));
  const step = Math.ceil(max / 4);
  const top = step * 4;
  const plotH = H - padB - padT;
  const colW = (W - padL) / rows.length;
  const barW = Math.min(14, (colW - 10) / 2);
  const y = v => padT + plotH - (v / top) * plotH;
  const grid = [0, 1, 2, 3, 4].map(i => `<line class="grid-line" x1="${padL}" x2="${W}" y1="${y(i * step)}" y2="${y(i * step)}"/><text class="axis-label" x="${padL - 6}" y="${y(i * step) + 4}" text-anchor="end">${i * step}</text>`).join('');
  // Bars with rounded top only: a rounded rect clipped by a plain rect at the baseline.
  const bar = (x, v, cls) => {
    if (!v) return '';
    const h = Math.max(2, (v / top) * plotH);
    const r = Math.min(4, h / 2, barW / 2);
    const yt = padT + plotH - h, yb = padT + plotH;
    return `<path class="${cls}" d="M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + barW - r} Q${x + barW},${yt} ${x + barW},${yt + r} V${yb} Z"/>`;
  };
  const cols = rows.map((r, i) => {
    const cx = padL + i * colW + colW / 2;
    const label = new Date(r.month + '-01T00:00').toLocaleDateString('en', { month: 'short' });
    const tip = `${new Date(r.month + '-01T00:00').toLocaleDateString('en', { month: 'long', year: 'numeric' })}\nNew leads: ${r.leads}\nWon: ${r.won}${r.won ? ` (${money(r.won_value)})` : ''}`;
    return `${bar(cx - barW - 1, r.leads, 'bar-1')}${bar(cx + 1, r.won, 'bar-2')}
      <text class="axis-label" x="${cx}" y="${H - 6}" text-anchor="middle">${label}</text>
      <rect class="hit" x="${padL + i * colW}" y="${padT}" width="${colW}" height="${plotH}" data-tip="${esc(tip)}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="New leads and won deals per month for the last 12 months">${grid}${cols}</svg>`;
}

async function viewPipeline() {
  const owner = sessionStorage.getItem('pipeOwner') || '';
  const deals = await api('/deals' + (owner ? `?owner_id=${owner}` : ''));
  const recentClosed = d => d.closed_at && daysSince(d.closed_at) <= 30;
  const cols = state.meta.stages.map(s => ({ ...s, deals: deals.filter(d => d.stage === s.key && (['won', 'lost'].includes(s.key) ? recentClosed(d) : true)) }));

  main().innerHTML = `
    <div class="page-head">
      <div><h1>Pipeline</h1><div class="subtitle">Drag deals between stages. Won & Lost show the last 30 days.</div></div>
      <div class="actions">
        <select id="pipe-owner" style="width:auto"><option value="">All owners</option>${state.users.map(u => `<option value="${u.id}" ${owner == u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
        <button class="btn" id="add-deal">${icon('plus')}Deal</button>
      </div>
    </div>
    <div class="board">${cols.map(c => `
      <section class="col ${c.key}" data-stage="${c.key}">
        <div class="col-head">
          <div class="t">${esc(c.label)}<span class="n">${c.deals.length}</span></div>
          <div class="v">${money(c.deals.reduce((t, d) => t + d.value, 0))}${c.key !== 'won' && c.key !== 'lost' ? ` · ${c.prob}%` : ''}</div>
        </div>
        <div class="col-body">${c.deals.length ? c.deals.map(dealCard).join('') : '<div class="col-empty">Drop deals here</div>'}</div>
      </section>`).join('')}
    </div>`;

  $('#pipe-owner').onchange = e => { sessionStorage.setItem('pipeOwner', e.target.value); viewPipeline(); };
  $('#add-deal').onclick = async () => { const d = await dealForm(); if (d) viewPipeline(); };

  let dragId = null;
  $$('.deal-card').forEach(card => {
    card.ondragstart = e => { dragId = card.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); };
    card.ondragend = () => { card.classList.remove('dragging'); $$('.col.drop').forEach(c => c.classList.remove('drop')); };
    card.onclick = () => { location.hash = `#/deals/${card.dataset.id}`; };
  });
  $$('.col').forEach(col => {
    col.ondragover = e => { e.preventDefault(); col.classList.add('drop'); };
    col.ondragleave = e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); };
    col.ondrop = async e => {
      e.preventDefault();
      col.classList.remove('drop');
      const deal = deals.find(d => d.id == (dragId || e.dataTransfer.getData('text/plain')));
      if (!deal) return;
      try { if (await moveDeal(deal, col.dataset.stage)) viewPipeline(); } catch (err) { toast(err.message, 'error'); }
    };
  });
}

function dealCard(d) {
  const days = daysSince(d.stage_changed_at);
  const overdue = d.next_task_due && d.next_task_due < today();
  return `
    <article class="deal-card" draggable="true" data-id="${d.id}">
      <div class="title">${esc(d.title)}</div>
      <div class="org">${esc(d.organization_name || d.contact_name || '')}</div>
      <div class="meta">
        <span class="val">${money(d.value)}</span>
        ${d.next_task_due ? `<span class="${overdue ? 'overdue' : ''}" data-tip="Next task due ${esc(fmtDate(d.next_task_due))}">⏱ ${esc(toDate(d.next_task_due).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }))}</span>` : ''}
        <span data-tip="${days} days in this stage">${days}d</span>
        ${d.owner_name ? `<span class="avatar" data-tip="Owner: ${esc(d.owner_name)}">${esc(initials(d.owner_name))}</span>` : ''}
      </div>
    </article>`;
}

async function viewDeals() {
  const f = JSON.parse(sessionStorage.getItem('dealFilters') || '{"status":"open"}');
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const deals = await api('/deals?' + qs);
  const total = deals.reduce((t, d) => t + d.value, 0);

  main().innerHTML = `
    <div class="page-head">
      <div><h1>Deals</h1><div class="subtitle">${deals.length} deals · ${money(total)}</div></div>
      <div class="actions">
        <a class="btn" href="/api/export/deals.csv">${icon('download')}Export CSV</a>
        <button class="btn primary" id="add-deal">${icon('plus')}Deal</button>
      </div>
    </div>
    <div class="filters">
      <input type="search" name="q" placeholder="Search deals…" value="${esc(f.q || '')}">
      <select name="status"><option value="">All statuses</option>${[['open', 'Open'], ['closed', 'Closed']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select name="stage"><option value="">All stages</option>${state.meta.stages.map(s => `<option value="${s.key}" ${f.stage === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      <select name="owner_id"><option value="">All owners</option>${state.users.map(u => `<option value="${u.id}" ${f.owner_id == u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
      <select name="source"><option value="">All sources</option>${state.meta.sources.map(s => `<option ${f.source === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    </div>
    <div class="card table-card">${deals.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Deal</th><th>Organization</th><th class="hide-sm">Contact</th><th>Stage</th><th class="right">Value</th><th class="hide-sm">Owner</th><th class="hide-sm">Next task</th><th class="hide-sm">Updated</th></tr></thead>
      <tbody>${deals.map(d => `<tr class="link" data-href="#/deals/${d.id}">
        <td><b>${esc(d.title)}</b>${d.product ? `<div class="muted small">${esc(d.product)}</div>` : ''}</td>
        <td>${esc(d.organization_name || '')}</td>
        <td class="hide-sm">${esc(d.contact_name || '')}</td>
        <td>${stageBadge(d.stage)}</td>
        <td class="right num nowrap">${money(d.value)}</td>
        <td class="hide-sm">${esc(d.owner_name || '')}</td>
        <td class="hide-sm nowrap">${dueHtml(d.next_task_due)}</td>
        <td class="hide-sm nowrap muted">${relTime(d.updated_at)}</td>
      </tr>`).join('')}</tbody></table></div>` : emptyState('No deals found', 'Try other filters or register a new lead.')}</div>`;

  bindRowLinks();
  bindFilters('dealFilters', f, viewDeals);
  $('#add-deal').onclick = async () => { const d = await dealForm(); if (d) location.hash = `#/deals/${d.id}`; };
}

function bindRowLinks() {
  $$('tr[data-href]').forEach(tr => (tr.onclick = e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
}

function bindFilters(key, current, rerender) {
  let timer;
  $$('.filters [name]').forEach(el => {
    const apply = () => {
      const next = { ...current, [el.name]: el.value };
      sessionStorage.setItem(key, JSON.stringify(next));
      rerender().then(() => {
        const input = $(`.filters [name="${el.name}"]`);
        if (el.type === 'search') { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      });
    };
    if (el.type === 'search') el.oninput = () => { clearTimeout(timer); timer = setTimeout(apply, 250); };
    else el.onchange = apply;
  });
}

async function viewDeal(id) {
  const d = await api(`/deals/${id}`);
  const stages = state.meta.stages;
  const open = stages.filter(s => !['won', 'lost'].includes(s.key));
  const curIdx = open.findIndex(s => s.key === d.stage);
  const closed = d.stage === 'won' || d.stage === 'lost';
  const prob = stageOf(d.stage).prob;

  main().innerHTML = `
    <div class="crumb"><a href="#/pipeline">Pipeline</a> / Deal</div>
    <div class="page-head">
      <div>
        <h1>${esc(d.title)} ${stageBadge(d.stage)}</h1>
        <div class="subtitle">${d.organization_name ? `<a href="#/organizations/${d.organization_id}">${esc(d.organization_name)}</a>` : ''}${d.organization_name && d.contact_name ? ' · ' : ''}${d.contact_name ? `<a href="#/contacts/${d.contact_id}">${esc(d.contact_name)}</a>` : ''}</div>
      </div>
      <div class="actions">
        ${closed ? `<button class="btn" data-reopen>Reopen deal</button>` : `<div class="close-btns"><button class="btn good" data-move="won">Mark won</button><button class="btn bad" data-move="lost">Mark lost</button></div>`}
        <button class="btn" id="edit-deal">${icon('edit')}Edit</button>
      </div>
    </div>

    <div class="stepper ${d.stage}">${open.map((s, i) => `<button class="step ${!closed && i < curIdx ? 'done' : ''} ${s.key === d.stage ? 'current' : ''}" data-move="${s.key}" data-tip="Move to ${esc(s.label)} (${s.prob}% probability)">${esc(s.label)}</button>`).join('')}</div>

    <div class="grid side-l">
      <div class="stack">
        <div class="card">
          <div class="big-value">${money(d.value)}</div>
          <div class="muted small" style="margin-bottom:12px">${closed ? (d.stage === 'won' ? `Won on ${fmtDate(d.closed_at)}` : `Lost on ${fmtDate(d.closed_at)}`) : `${prob}% probability · weighted ${money(d.value * prob / 100)}`}</div>
          <dl class="kv">
            ${d.stage === 'lost' ? `<dt>Lost reason</dt><dd>${esc(d.lost_reason || '—')}</dd>` : ''}
            <dt>Product</dt><dd>${esc(d.product || '—')}</dd>
            <dt>Source</dt><dd>${esc(d.source || '—')}</dd>
            <dt>Expected close</dt><dd>${d.expected_close ? fmtDate(d.expected_close) : '—'}</dd>
            <dt>Owner</dt><dd>${esc(d.owner_name || 'Unassigned')}</dd>
            <dt>In stage</dt><dd>${daysSince(d.stage_changed_at)} days</dd>
            <dt>Created</dt><dd>${fmtDate(d.created_at)}</dd>
          </dl>
          ${d.notes ? `<h3 style="margin-top:16px">Description</h3><div class="notes">${esc(d.notes)}</div>` : ''}
        </div>
        ${d.contact_id ? `<div class="card">
          <h3>Contact person</h3>
          <div><a href="#/contacts/${d.contact_id}"><b>${esc(d.contact_name)}</b></a></div>
          ${d.contact_email ? `<div><a href="mailto:${esc(d.contact_email)}">${esc(d.contact_email)}</a></div>` : ''}
          ${d.contact_phone ? `<div><a href="tel:${esc(d.contact_phone)}">${esc(d.contact_phone)}</a></div>` : ''}
        </div>` : ''}
        <div class="card" id="deal-tasks"><div class="card-head"><h2>Tasks</h2></div>${tasksBlock(d.tasks, { showLinks: false })}</div>
      </div>
      <div class="card" id="deal-activity">
        <div class="card-head"><h2>Activity</h2></div>
        ${composerHtml()}
        ${timelineHtml(d.activities)}
      </div>
    </div>`;

  const reload = () => viewDeal(id);
  $$('[data-move]').forEach(b => (b.onclick = async () => {
    try { if (await moveDeal(d, b.dataset.move)) reload(); } catch (e) { toast(e.message, 'error'); }
  }));
  $('[data-reopen]')?.addEventListener('click', async () => {
    const back = open[Math.min(d.max_stage_index, open.length - 1)]?.key || 'lead';
    await moveDeal(d, back);
    reload();
  });
  $('#edit-deal').onclick = async () => { if (await dealForm(d)) reload(); };
  bindActivities($('#deal-activity'), { deal_id: d.id }, reload);
  bindTasks($('#deal-tasks'), d.tasks, { deal_id: d.id }, reload);
}

async function viewContacts() {
  const f = JSON.parse(sessionStorage.getItem('contactFilters') || '{}');
  const contacts = await api('/contacts?q=' + encodeURIComponent(f.q || ''));
  main().innerHTML = `
    <div class="page-head">
      <div><h1>Contacts</h1><div class="subtitle">${contacts.length} people</div></div>
      <div class="actions">
        <a class="btn" href="/api/export/contacts.csv">${icon('download')}Export CSV</a>
        <button class="btn primary" id="add">${icon('plus')}Contact</button>
      </div>
    </div>
    <div class="filters"><input type="search" name="q" placeholder="Search name, email, organization…" value="${esc(f.q || '')}"></div>
    <div class="card table-card">${contacts.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Organization</th><th class="hide-sm">Job title</th><th>Email</th><th class="hide-sm">Phone</th><th class="right">Deals</th></tr></thead>
      <tbody>${contacts.map(c => `<tr class="link" data-href="#/contacts/${c.id}">
        <td><span style="display:inline-flex;gap:8px;align-items:center"><span class="avatar">${esc(initials(fullName(c)))}</span><b>${esc(fullName(c))}</b></span></td>
        <td>${esc(c.organization_name || '')}</td>
        <td class="hide-sm">${esc(c.job_title || '')}</td>
        <td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}</td>
        <td class="hide-sm nowrap">${esc(c.phone || '')}</td>
        <td class="right num">${c.deal_count}</td>
      </tr>`).join('')}</tbody></table></div>` : emptyState('No contacts', 'Contacts are created when you register a lead, or add one directly.')}</div>`;
  bindRowLinks();
  bindFilters('contactFilters', f, viewContacts);
  $('#add').onclick = async () => { const c = await contactForm(); if (c) location.hash = `#/contacts/${c.id}`; };
}

async function viewContact(id) {
  const c = await api(`/contacts/${id}`);
  main().innerHTML = `
    <div class="crumb"><a href="#/contacts">Contacts</a> / Contact</div>
    <div class="page-head">
      <span class="avatar" style="width:44px;height:44px;font-size:16px">${esc(initials(fullName(c)))}</span>
      <div><h1>${esc(fullName(c))}</h1><div class="subtitle">${esc(c.job_title || '')}${c.job_title && c.organization_name ? ' at ' : ''}${c.organization_name ? `<a href="#/organizations/${c.organization_id}">${esc(c.organization_name)}</a>` : ''}</div></div>
      <div class="actions">
        <button class="btn" id="new-deal">${icon('plus')}Deal</button>
        <button class="btn" id="edit">${icon('edit')}Edit</button>
      </div>
    </div>
    <div class="grid side-l">
      <div class="stack">
        <div class="card"><dl class="kv">
          <dt>Email</dt><dd>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</dd>
          <dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '—'}</dd>
          <dt>LinkedIn</dt><dd>${c.linkedin ? `<a href="${esc(c.linkedin)}" target="_blank" rel="noopener">Profile</a>` : '—'}</dd>
          <dt>Added</dt><dd>${fmtDate(c.created_at)}</dd>
        </dl>${c.notes ? `<h3 style="margin-top:16px">Notes</h3><div class="notes">${esc(c.notes)}</div>` : ''}</div>
        <div class="card"><div class="card-head"><h2>Deals</h2></div>${dealList(c.deals)}</div>
        <div class="card" id="c-tasks"><div class="card-head"><h2>Tasks</h2></div>${tasksBlock(c.tasks)}</div>
      </div>
      <div class="card" id="c-activity"><div class="card-head"><h2>Activity</h2></div>${composerHtml()}${timelineHtml(c.activities, { showDeal: true })}</div>
    </div>`;
  const reload = () => viewContact(id);
  $('#edit').onclick = async () => { if (await contactForm(c)) reload(); };
  $('#new-deal').onclick = async () => {
    const d = await dealForm({ contact_id: c.id, organization_id: c.organization_id, title: c.organization_name || fullName(c) });
    if (d) location.hash = `#/deals/${d.id}`;
  };
  bindActivities($('#c-activity'), { contact_id: c.id }, reload);
  bindTasks($('#c-tasks'), c.tasks, { contact_id: c.id }, reload);
}

function dealList(deals) {
  if (!deals.length) return '<div class="empty">No deals yet</div>';
  return `<ul class="list-plain">${deals.map(d => `<li><div style="min-width:0"><a href="#/deals/${d.id}">${esc(d.title)}</a><div class="small">${stageBadge(d.stage)}</div></div><span class="num small" style="margin-left:auto">${money(d.value)}</span></li>`).join('')}</ul>`;
}

async function viewOrganizations() {
  const f = JSON.parse(sessionStorage.getItem('orgFilters') || '{}');
  const orgs = await api('/organizations?q=' + encodeURIComponent(f.q || ''));
  main().innerHTML = `
    <div class="page-head">
      <div><h1>Organizations</h1><div class="subtitle">${orgs.length} organizations</div></div>
      <div class="actions">
        <a class="btn" href="/api/export/organizations.csv">${icon('download')}Export CSV</a>
        <button class="btn primary" id="add">${icon('plus')}Organization</button>
      </div>
    </div>
    <div class="filters"><input type="search" name="q" placeholder="Search name, sector, city…" value="${esc(f.q || '')}"></div>
    <div class="card table-card">${orgs.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Sector</th><th class="hide-sm">City</th><th class="right">Contacts</th><th class="right">Open deals</th><th class="right">Won</th></tr></thead>
      <tbody>${orgs.map(o => `<tr class="link" data-href="#/organizations/${o.id}">
        <td><b>${esc(o.name)}</b></td><td>${esc(o.sector || '')}</td><td class="hide-sm">${esc(o.city || '')}</td>
        <td class="right num">${o.contact_count}</td><td class="right num">${o.open_deals}</td><td class="right num nowrap">${o.won_value ? money(o.won_value) : ''}</td>
      </tr>`).join('')}</tbody></table></div>` : emptyState('No organizations', 'Organizations are created when you register a lead, or add one directly.')}</div>`;
  bindRowLinks();
  bindFilters('orgFilters', f, viewOrganizations);
  $('#add').onclick = async () => { const o = await orgForm(); if (o) location.hash = `#/organizations/${o.id}`; };
}

async function viewOrganization(id) {
  const o = await api(`/organizations/${id}`);
  const won = o.deals.filter(d => d.stage === 'won').reduce((t, d) => t + d.value, 0);
  main().innerHTML = `
    <div class="crumb"><a href="#/organizations">Organizations</a> / Organization</div>
    <div class="page-head">
      <div><h1>${esc(o.name)}</h1><div class="subtitle">${[o.sector, o.city, o.country].filter(Boolean).map(esc).join(' · ')}</div></div>
      <div class="actions">
        <button class="btn" id="new-contact">${icon('plus')}Contact</button>
        <button class="btn" id="new-deal">${icon('plus')}Deal</button>
        <button class="btn" id="edit">${icon('edit')}Edit</button>
      </div>
    </div>
    <div class="grid side-l">
      <div class="stack">
        <div class="card"><dl class="kv">
          <dt>Website</dt><dd>${o.website ? `<a href="${esc(o.website)}" target="_blank" rel="noopener">${esc(o.website.replace(/^https?:\/\//, ''))}</a>` : '—'}</dd>
          <dt>Won revenue</dt><dd>${money(won)}</dd>
          <dt>Added</dt><dd>${fmtDate(o.created_at)}</dd>
        </dl>${o.notes ? `<h3 style="margin-top:16px">Notes</h3><div class="notes">${esc(o.notes)}</div>` : ''}</div>
        <div class="card"><div class="card-head"><h2>Contacts</h2></div>${o.contacts.length ? `<ul class="list-plain">${o.contacts.map(c => `<li><span class="avatar">${esc(initials(fullName(c)))}</span><div style="min-width:0"><a href="#/contacts/${c.id}">${esc(fullName(c))}</a><div class="muted small">${esc(c.job_title || c.email || '')}</div></div></li>`).join('')}</ul>` : '<div class="empty">No contacts yet</div>'}</div>
        <div class="card"><div class="card-head"><h2>Deals</h2></div>${dealList(o.deals)}</div>
      </div>
      <div class="card" id="o-activity"><div class="card-head"><h2>Activity</h2></div>${composerHtml()}${timelineHtml(o.activities, { showDeal: true })}</div>
    </div>`;
  const reload = () => viewOrganization(id);
  $('#edit').onclick = async () => { if (await orgForm(o)) reload(); };
  $('#new-contact').onclick = async () => { if (await contactForm({ organization_id: o.id })) reload(); };
  $('#new-deal').onclick = async () => {
    const d = await dealForm({ organization_id: o.id, contact_id: o.contacts[0]?.id, title: o.name });
    if (d) location.hash = `#/deals/${d.id}`;
  };
  bindActivities($('#o-activity'), { organization_id: o.id }, reload);
}

async function viewTasks() {
  const f = JSON.parse(sessionStorage.getItem('taskFilters') || '{"scope":"mine","status":"open"}');
  const tasks = await api(`/tasks?scope=${f.scope}&status=${f.status}`);
  const t = today();
  const groups = f.status === 'open' ? [
    ['Overdue', tasks.filter(x => x.due_date && x.due_date < t)],
    ['Today', tasks.filter(x => x.due_date === t)],
    ['Upcoming', tasks.filter(x => x.due_date && x.due_date > t)],
    ['No due date', tasks.filter(x => !x.due_date)],
  ].filter(([, list]) => list.length) : [['Completed', tasks]];

  main().innerHTML = `
    <div class="page-head">
      <div><h1>Tasks</h1><div class="subtitle">Follow-ups keep leads moving through the funnel.</div></div>
      <div class="actions">
        <div class="seg" data-f="scope"><button data-v="mine">Mine</button><button data-v="all">Everyone</button></div>
        <div class="seg" data-f="status"><button data-v="open">Open</button><button data-v="done">Completed</button></div>
        <button class="btn primary" id="add">${icon('plus')}Task</button>
      </div>
    </div>
    <div class="card" id="task-list" style="max-width:860px">
      ${tasks.length ? groups.map(([label, list]) => `<h3 style="margin-top:8px">${label} · ${list.length}</h3>${list.map(x => taskRow(x)).join('')}`).join('')
        : emptyState(f.status === 'open' ? 'Nothing to do' : 'Nothing completed yet', f.status === 'open' ? 'Add follow-up tasks from a deal to never miss a next step.' : '')}
    </div>`;
  $$('.seg[data-f]').forEach(seg => $$('button', seg).forEach(b => {
    b.classList.toggle('active', f[seg.dataset.f] === b.dataset.v);
    b.onclick = () => { sessionStorage.setItem('taskFilters', JSON.stringify({ ...f, [seg.dataset.f]: b.dataset.v })); viewTasks(); };
  }));
  $('#add').onclick = async () => { if (await taskForm()) { refreshTaskBadge(); viewTasks(); } };
  bindTasks($('#task-list'), tasks, {}, viewTasks);
}

async function viewSettings() {
  state.users = await api('/users');
  const isAdmin = state.me.role === 'admin';
  main().innerHTML = `
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <div class="grid cols-2" style="max-width:1100px">
      <div class="card">
        <div class="card-head"><h2>My profile</h2></div>
        <dl class="kv"><dt>Name</dt><dd>${esc(state.me.name)}</dd><dt>Email</dt><dd>${esc(state.me.email)}</dd><dt>Role</dt><dd>${esc(state.me.role)}</dd></dl>
        <div style="margin-top:14px;display:flex;gap:8px"><button class="btn" id="edit-me">Edit profile</button><button class="btn" id="pw">Change password</button></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Data export</h2></div>
        <p class="muted" style="margin-top:0">Download your CRM data as CSV (opens in Excel).</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn" href="/api/export/deals.csv">${icon('download')}Deals</a>
          <a class="btn" href="/api/export/contacts.csv">${icon('download')}Contacts</a>
          <a class="btn" href="/api/export/organizations.csv">${icon('download')}Organizations</a>
        </div>
      </div>
      <div class="card table-card" style="grid-column:1/-1">
        <div class="card-head" style="padding:16px 16px 0"><h2>Team members</h2>${isAdmin ? `<div class="actions"><button class="btn primary small" id="add-user">${icon('plus')}Add user</button></div>` : ''}</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody>${state.users.map(u => `<tr>
            <td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${esc(u.role)}</td>
            <td>${u.active ? '<span class="badge won">Active</span>' : '<span class="badge">Inactive</span>'}</td>
            ${isAdmin ? `<td class="right">${u.id !== state.me.id ? `<button class="btn small" data-edit-user="${u.id}">Edit</button>` : ''}</td>` : ''}
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>`;

  $('#edit-me').onclick = async () => {
    const r = await openForm({
      title: 'Edit profile', values: state.me,
      fields: [{ name: 'name', label: 'Name', required: true, wide: true }, { name: 'email', label: 'Email', type: 'email', required: true, wide: true }],
      onSubmit: data => put(`/users/${state.me.id}`, data),
    });
    if (r) { Object.assign(state.me, r); renderMe(); viewSettings(); toast('Profile updated'); }
  };
  $('#pw').onclick = async () => {
    const r = await openForm({
      title: 'Change password', submitLabel: 'Change password',
      fields: [{ name: 'password', label: 'New password (min. 8 characters)', type: 'password', required: true, wide: true }, { name: 'confirm', label: 'Repeat new password', type: 'password', required: true, wide: true }],
      onSubmit: data => {
        if (data.password !== data.confirm) throw new Error('Passwords do not match');
        return put(`/users/${state.me.id}`, { password: data.password });
      },
    });
    if (r) toast('Password changed');
  };
  $('#add-user')?.addEventListener('click', async () => {
    const r = await openForm({
      title: 'Add team member', submitLabel: 'Add user',
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'password', label: 'Initial password (min. 8)', type: 'text', required: true },
        { name: 'role', label: 'Role', type: 'select', options: [{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Admin' }], blank: false },
      ],
      onSubmit: data => post('/users', data),
    });
    if (r) { toast(`${r.name} added — share the password with them`); viewSettings(); }
  });
  $$('[data-edit-user]').forEach(b => (b.onclick = async () => {
    const u = state.users.find(x => x.id == b.dataset.editUser);
    const r = await openForm({
      title: `Edit ${u.name}`, values: { ...u, active: u.active },
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'role', label: 'Role', type: 'select', options: [{ value: 'member', label: 'Member' }, { value: 'admin', label: 'Admin' }], blank: false },
        { name: 'password', label: 'Reset password (optional)', type: 'text' },
        { name: 'active', label: 'Active (can log in)', type: 'checkbox', wide: true },
      ],
      onSubmit: data => { if (!data.password) delete data.password; return put(`/users/${u.id}`, data); },
    });
    if (r) { toast('User updated'); viewSettings(); }
  }));
}

// ---------- global search ----------

function setupSearch() {
  const input = $('#global-search');
  const box = $('#search-results');
  let timer, seq = 0;
  input.oninput = () => {
    clearTimeout(timer);
    const term = input.value.trim();
    if (term.length < 2) { box.hidden = true; return; }
    timer = setTimeout(async () => {
      const mine = ++seq;
      const enc = encodeURIComponent(term);
      const [deals, contacts, orgs] = await Promise.all([api('/deals?q=' + enc), api('/contacts?q=' + enc), api('/organizations?q=' + enc)]);
      if (mine !== seq) return;
      const items = [
        ...deals.slice(0, 6).map(d => ['Deal', `#/deals/${d.id}`, d.title, d.organization_name]),
        ...contacts.slice(0, 6).map(c => ['Contact', `#/contacts/${c.id}`, fullName(c), c.organization_name]),
        ...orgs.slice(0, 6).map(o => ['Organization', `#/organizations/${o.id}`, o.name, o.sector]),
      ];
      box.innerHTML = items.length
        ? items.map(([k, href, title, sub]) => `<a href="${href}"><span class="kind">${k}</span><span>${esc(title)} ${sub ? `<span class="muted small">· ${esc(sub)}</span>` : ''}</span></a>`).join('')
        : '<div class="empty">No results</div>';
      box.hidden = false;
    }, 200);
  };
  input.onkeydown = e => {
    const links = $$('a', box);
    if (!links.length) return;
    let i = links.findIndex(a => a.classList.contains('sel'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      i = e.key === 'ArrowDown' ? Math.min(i + 1, links.length - 1) : Math.max(i - 1, 0);
      links.forEach((a, j) => a.classList.toggle('sel', j === i));
    } else if (e.key === 'Enter') {
      (links[i] || links[0]).click();
    } else if (e.key === 'Escape') {
      box.hidden = true;
    }
  };
  box.onclick = () => { box.hidden = true; input.value = ''; };
  document.addEventListener('click', e => { if (!e.target.closest('.search')) box.hidden = true; });
}

// ---------- router & boot ----------

const ROUTES = [
  [/^#\/(dashboard)?$/, viewDashboard, 'dashboard'],
  [/^#\/pipeline$/, viewPipeline, 'pipeline'],
  [/^#\/deals$/, viewDeals, 'deals'],
  [/^#\/deals\/(\d+)$/, viewDeal, 'deals'],
  [/^#\/contacts$/, viewContacts, 'contacts'],
  [/^#\/contacts\/(\d+)$/, viewContact, 'contacts'],
  [/^#\/organizations$/, viewOrganizations, 'organizations'],
  [/^#\/organizations\/(\d+)$/, viewOrganization, 'organizations'],
  [/^#\/tasks$/, viewTasks, 'tasks'],
  [/^#\/settings$/, viewSettings, 'settings'],
];

async function router() {
  if (!state.me) return;
  const hash = location.hash || '#/dashboard';
  const route = ROUTES.find(([re]) => re.test(hash)) || ROUTES[0];
  const [re, view, nav] = route;
  const m = hash.match(re);
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
  main().innerHTML = '<div class="loading">Loading…</div>';
  try {
    await view(m && route !== ROUTES[0] ? m[1] : undefined);
  } catch (e) {
    main().innerHTML = `<div class="empty"><b>Something went wrong</b>${esc(e.message)}</div>`;
  }
  window.scrollTo(0, 0);
}

function renderMe() {
  $('#me').innerHTML = `<b>${esc(state.me.name)}</b><span class="muted small">${esc(state.me.email)}</span>`;
}

async function showLogin() {
  state.me = null;
  $('#app').hidden = true;
  const login = $('#login');
  login.hidden = false;
  const { needed } = await api('/setup').catch(() => ({ needed: false }));
  login.innerHTML = `
    <div class="login-card">
      <div class="brand"><span class="brand-mark"></span><span>Serious Games <b>CRM</b></span></div>
      <h1 style="margin-bottom:4px">${needed ? 'Welcome! Create your admin account' : 'Log in'}</h1>
      <p class="muted" style="margin-top:0">${needed ? 'This is the first start. The account you create here becomes the administrator.' : 'Track your serious game leads from first contact to signed deal.'}</p>
      <form>
        ${needed ? '<label class="field"><span>Your name</span><input name="name" required autocomplete="name"></label>' : ''}
        <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" autofocus></label>
        <label class="field"><span>Password${needed ? ' (min. 8 characters)' : ''}</span><input name="password" type="password" required minlength="${needed ? 8 : 1}" autocomplete="${needed ? 'new-password' : 'current-password'}"></label>
        <div class="error"></div>
        <button class="btn primary">${needed ? 'Create account' : 'Log in'}</button>
      </form>
    </div>`;
  const form = $('form', login);
  form.onsubmit = async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    try {
      await post(needed ? '/setup' : '/login', body);
      login.hidden = true;
      boot();
    } catch (err) {
      $('.error', form).textContent = err.message;
    }
  };
}

async function boot() {
  try {
    state.me = await api('/me');
  } catch { return; }
  [state.meta, state.users] = await Promise.all([api('/meta'), api('/users')]);
  $('#login').hidden = true;
  $('#app').hidden = false;
  renderMe();
  router();
  refreshTaskBadge();
}

hydrateIcons();
setupSearch();
$('#new-lead').onclick = () => newLeadForm().catch(e => toast(e.message, 'error'));
$('#logout').onclick = async () => { await post('/logout'); showLogin(); };
window.addEventListener('hashchange', router);
boot();
