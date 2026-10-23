import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, q, q1 } from './db.js';
import { STAGES, OPEN_STAGES, stageIndex, SOURCES, PRODUCTS, LOST_REASONS, ACTIVITY_TYPES } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SESSION_DAYS = 30;
const SECURE_COOKIES = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- helpers ----------

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const hash = t => crypto.createHash('sha256').update(t).digest('hex');
const fail = (status, error) => Object.assign(new Error(error), { status });
const id = req => {
  const n = parseInt(req.params.id, 10);
  if (!Number.isInteger(n)) throw fail(400, 'Invalid id');
  return n;
};

// Copy whitelisted fields from the body; empty strings become NULL.
function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (!(f in body)) continue;
    let v = body[f];
    if (typeof v === 'string') v = v.trim();
    out[f] = v === '' || v === undefined ? null : v;
  }
  return out;
}

function requireFields(data, ...fields) {
  for (const f of fields) if (data[f] == null) throw fail(400, `${f.replace('_', ' ')} is required`);
}

async function insert(table, data) {
  const keys = Object.keys(data);
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`;
  return q1(sql, Object.values(data));
}

async function update(table, rowId, data, extraSet = '') {
  const keys = Object.keys(data);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  if (extraSet) sets.push(extraSet);
  if (!sets.length) return q1(`SELECT * FROM ${table} WHERE id = $1`, [rowId]);
  const row = await q1(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${keys.length + 1} RETURNING *`, [...Object.values(data), rowId]);
  if (!row) throw fail(404, 'Not found');
  return row;
}

async function remove(table, rowId) {
  const row = await q1(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [rowId]);
  if (!row) throw fail(404, 'Not found');
}

const stageLabel = key => STAGES.find(s => s.key === key)?.label || key;

// ---------- auth ----------

async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await q(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [hash(token), userId]);
  await q('DELETE FROM sessions WHERE expires_at < now()');
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: SECURE_COOKIES, maxAge: SESSION_DAYS * 864e5 });
}

const loginAttempts = new Map(); // ip -> { n, until }

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/setup', wrap(async (req, res) => {
  const { n } = await q1('SELECT count(*)::int AS n FROM users');
  res.json({ needed: n === 0 });
}));

// First-run: create the initial admin account (only possible while there are no users).
app.post('/api/setup', wrap(async (req, res) => {
  const { n } = await q1('SELECT count(*)::int AS n FROM users');
  if (n > 0) throw fail(403, 'Setup already completed');
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8) throw fail(400, 'Name, email and a password of at least 8 characters are required');
  const user = await insert('users', { name: name.trim(), email: email.trim().toLowerCase(), password_hash: await bcrypt.hash(password, 10), role: 'admin' });
  await startSession(res, user.id);
  res.json({ ok: true });
}));

app.post('/api/login', wrap(async (req, res) => {
  const ip = req.ip;
  const a = loginAttempts.get(ip);
  if (a && a.n >= 10 && a.until > Date.now()) throw fail(429, 'Too many attempts, try again in a few minutes');
  const { email = '', password = '' } = req.body;
  const user = await q1('SELECT * FROM users WHERE email = $1 AND active', [email.trim().toLowerCase()]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    loginAttempts.set(ip, { n: (a?.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60e3 });
    throw fail(401, 'Invalid email or password');
  }
  loginAttempts.delete(ip);
  await startSession(res, user.id);
  res.json({ ok: true });
}));

app.post('/api/logout', wrap(async (req, res) => {
  if (req.cookies.sid) await q('DELETE FROM sessions WHERE token = $1', [hash(req.cookies.sid)]);
  res.clearCookie('sid');
  res.json({ ok: true });
}));

app.use('/api', wrap(async (req, res, next) => {
  const token = req.cookies.sid;
  if (token) {
    req.user = await q1(
      `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now() AND u.active`, [hash(token)]);
  }
  if (!req.user) throw fail(401, 'Not logged in');
  next();
}));

const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : next(fail(403, 'Only admins can do this')));

app.get('/api/me', (req, res) => res.json(req.user));

app.get('/api/meta', (req, res) => res.json({ stages: STAGES, sources: SOURCES, products: PRODUCTS, lostReasons: LOST_REASONS, activityTypes: ACTIVITY_TYPES }));

// ---------- users ----------

app.get('/api/users', wrap(async (req, res) => {
  res.json(await q('SELECT id, name, email, role, active, created_at FROM users ORDER BY active DESC, name'));
}));

app.post('/api/users', adminOnly, wrap(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || password.length < 8) throw fail(400, 'Name, email and a password of at least 8 characters are required');
  const user = await insert('users', {
    name: name.trim(), email: email.trim().toLowerCase(),
    password_hash: await bcrypt.hash(password, 10), role: role === 'admin' ? 'admin' : 'member',
  });
  delete user.password_hash;
  res.json(user);
}));

app.put('/api/users/:id', wrap(async (req, res) => {
  const userId = id(req);
  const isSelf = userId === req.user.id;
  if (!isSelf && req.user.role !== 'admin') throw fail(403, 'Only admins can edit other users');
  const data = pick(req.body, ['name', 'email']);
  if (data.email) data.email = data.email.toLowerCase();
  if (req.user.role === 'admin' && !isSelf) Object.assign(data, pick(req.body, ['role', 'active']));
  if (req.body.password) {
    if (req.body.password.length < 8) throw fail(400, 'Password must be at least 8 characters');
    data.password_hash = await bcrypt.hash(req.body.password, 10);
  }
  const user = await update('users', userId, data);
  if (data.active === false || data.password_hash) await q('DELETE FROM sessions WHERE user_id = $1 AND $1 <> $2', [userId, req.user.id]);
  delete user.password_hash;
  res.json(user);
}));

// ---------- organizations ----------

const ORG_FIELDS = ['name', 'sector', 'website', 'city', 'country', 'notes'];

app.get('/api/organizations', wrap(async (req, res) => {
  const search = `%${req.query.q || ''}%`;
  res.json(await q(`
    SELECT o.*,
      (SELECT count(*)::int FROM contacts c WHERE c.organization_id = o.id) AS contact_count,
      (SELECT count(*)::int FROM deals d WHERE d.organization_id = o.id AND d.stage = ANY($2)) AS open_deals,
      (SELECT coalesce(sum(value), 0)::float8 FROM deals d WHERE d.organization_id = o.id AND d.stage = 'won') AS won_value
    FROM organizations o
    WHERE o.name ILIKE $1 OR coalesce(o.sector, '') ILIKE $1 OR coalesce(o.city, '') ILIKE $1
    ORDER BY o.name`, [search, OPEN_STAGES]));
}));

app.get('/api/organizations/:id', wrap(async (req, res) => {
  const orgId = id(req);
  const org = await q1('SELECT * FROM organizations WHERE id = $1', [orgId]);
  if (!org) throw fail(404, 'Organization not found');
  org.contacts = await q('SELECT * FROM contacts WHERE organization_id = $1 ORDER BY first_name', [orgId]);
  org.deals = await q(`${DEAL_SELECT} WHERE d.organization_id = $1 ORDER BY d.created_at DESC`, [orgId]);
  org.activities = await q(`${ACTIVITY_SELECT} WHERE a.organization_id = $1 ORDER BY a.created_at DESC LIMIT 100`, [orgId]);
  res.json(org);
}));

app.post('/api/organizations', wrap(async (req, res) => {
  const data = pick(req.body, ORG_FIELDS);
  requireFields(data, 'name');
  res.json(await insert('organizations', data));
}));

app.put('/api/organizations/:id', wrap(async (req, res) => {
  const data = pick(req.body, ORG_FIELDS);
  if ('name' in data) requireFields(data, 'name');
  res.json(await update('organizations', id(req), data));
}));

app.delete('/api/organizations/:id', wrap(async (req, res) => {
  await remove('organizations', id(req));
  res.json({ ok: true });
}));

// ---------- contacts ----------

const CONTACT_FIELDS = ['organization_id', 'first_name', 'last_name', 'email', 'phone', 'job_title', 'linkedin', 'notes'];
const CONTACT_SELECT = `
  SELECT c.*, o.name AS organization_name,
    (SELECT count(*)::int FROM deals d WHERE d.contact_id = c.id) AS deal_count
  FROM contacts c LEFT JOIN organizations o ON o.id = c.organization_id`;

async function checkDuplicateEmail(email, exceptId = 0) {
  if (!email) return;
  const dup = await q1('SELECT id FROM contacts WHERE lower(email) = lower($1) AND id <> $2', [email, exceptId]);
  if (dup) throw fail(409, `A contact with email ${email} already exists`);
}

app.get('/api/contacts', wrap(async (req, res) => {
  const search = `%${req.query.q || ''}%`;
  res.json(await q(`${CONTACT_SELECT}
    WHERE (c.first_name || ' ' || coalesce(c.last_name, '')) ILIKE $1 OR coalesce(c.email, '') ILIKE $1
       OR coalesce(o.name, '') ILIKE $1 OR coalesce(c.job_title, '') ILIKE $1
    ORDER BY c.first_name, c.last_name`, [search]));
}));

app.get('/api/contacts/:id', wrap(async (req, res) => {
  const contactId = id(req);
  const contact = await q1(`${CONTACT_SELECT} WHERE c.id = $1`, [contactId]);
  if (!contact) throw fail(404, 'Contact not found');
  contact.deals = await q(`${DEAL_SELECT} WHERE d.contact_id = $1 ORDER BY d.created_at DESC`, [contactId]);
  contact.activities = await q(`${ACTIVITY_SELECT} WHERE a.contact_id = $1 ORDER BY a.created_at DESC LIMIT 100`, [contactId]);
  contact.tasks = await q(`${TASK_SELECT} WHERE t.contact_id = $1 ORDER BY t.done, t.due_date NULLS LAST`, [contactId]);
  res.json(contact);
}));

app.post('/api/contacts', wrap(async (req, res) => {
  const data = pick(req.body, CONTACT_FIELDS);
  requireFields(data, 'first_name');
  await checkDuplicateEmail(data.email);
  res.json(await insert('contacts', data));
}));

app.put('/api/contacts/:id', wrap(async (req, res) => {
  const data = pick(req.body, CONTACT_FIELDS);
  if ('first_name' in data) requireFields(data, 'first_name');
  await checkDuplicateEmail(data.email, id(req));
  res.json(await update('contacts', id(req), data));
}));

app.delete('/api/contacts/:id', wrap(async (req, res) => {
  await remove('contacts', id(req));
  res.json({ ok: true });
}));

// ---------- deals ----------

const DEAL_FIELDS = ['title', 'organization_id', 'contact_id', 'owner_id', 'value', 'product', 'source', 'expected_close', 'lost_reason', 'notes'];
const DEAL_SELECT = `
  SELECT d.*, o.name AS organization_name, u.name AS owner_name,
    nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') AS contact_name,
    c.email AS contact_email, c.phone AS contact_phone,
    (SELECT min(t.due_date) FROM tasks t WHERE t.deal_id = d.id AND NOT t.done) AS next_task_due,
    (SELECT max(a.created_at) FROM activities a WHERE a.deal_id = d.id) AS last_activity_at
  FROM deals d
  LEFT JOIN organizations o ON o.id = d.organization_id
  LEFT JOIN contacts c ON c.id = d.contact_id
  LEFT JOIN users u ON u.id = d.owner_id`;

function cleanDeal(data) {
  if ('value' in data) data.value = Number(data.value) || 0;
  return data;
}

async function logActivity(user, type, body, deal) {
  return insert('activities', {
    type, body, user_id: user.id, deal_id: deal.id,
    contact_id: deal.contact_id, organization_id: deal.organization_id,
  });
}

async function changeStage(deal, stage, lostReason, user) {
  if (!STAGES.some(s => s.key === stage)) throw fail(400, 'Unknown stage');
  if (stage === deal.stage) return deal;
  const closed = stage === 'won' || stage === 'lost';
  const updated = await q1(`
    UPDATE deals SET stage = $1, stage_changed_at = now(), updated_at = now(),
      max_stage_index = GREATEST(max_stage_index, $2),
      closed_at = ${closed ? 'now()' : 'NULL'},
      lost_reason = $3
    WHERE id = $4 RETURNING *`,
  [stage, stageIndex(stage), stage === 'lost' ? lostReason || deal.lost_reason : null, deal.id]);
  let msg = `Moved from ${stageLabel(deal.stage)} to ${stageLabel(stage)}`;
  if (stage === 'lost' && updated.lost_reason) msg += ` — reason: ${updated.lost_reason}`;
  await logActivity(user, 'stage', msg, updated);
  return updated;
}

app.get('/api/deals', wrap(async (req, res) => {
  const where = [];
  const params = [];
  const add = (cond, val) => { params.push(val); where.push(cond.replaceAll('?', '$' + params.length)); };
  if (req.query.q) add(`(d.title ILIKE ? OR coalesce(o.name, '') ILIKE ? OR (coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ILIKE ?)`, `%${req.query.q}%`);
  if (req.query.stage) add('d.stage = ?', req.query.stage);
  if (req.query.status === 'open') add('d.stage = ANY(?)', OPEN_STAGES);
  if (req.query.status === 'closed') add('d.stage = ANY(?)', ['won', 'lost']);
  if (req.query.owner_id) add('d.owner_id = ?', parseInt(req.query.owner_id, 10));
  if (req.query.source) add('d.source = ?', req.query.source);
  res.json(await q(`${DEAL_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.updated_at DESC`, params));
}));

app.get('/api/deals/:id', wrap(async (req, res) => {
  const dealId = id(req);
  const deal = await q1(`${DEAL_SELECT} WHERE d.id = $1`, [dealId]);
  if (!deal) throw fail(404, 'Deal not found');
  deal.activities = await q(`${ACTIVITY_SELECT} WHERE a.deal_id = $1 ORDER BY a.created_at DESC`, [dealId]);
  deal.tasks = await q(`${TASK_SELECT} WHERE t.deal_id = $1 ORDER BY t.done, t.due_date NULLS LAST`, [dealId]);
  res.json(deal);
}));

app.post('/api/deals', wrap(async (req, res) => {
  const data = cleanDeal(pick(req.body, DEAL_FIELDS));
  requireFields(data, 'title');
  data.owner_id ??= req.user.id;
  const stage = req.body.stage || 'lead';
  const deal = await insert('deals', { ...data, stage: 'lead' });
  await logActivity(req.user, 'stage', 'Lead created', deal);
  res.json(stage === 'lead' ? deal : await changeStage(deal, stage, data.lost_reason, req.user));
}));

// One-step lead registration: finds or creates the organization and contact, then creates the deal.
app.post('/api/leads', wrap(async (req, res) => {
  const b = req.body;
  let orgId = b.organization_id || null;
  let orgName = (b.organization_name || '').trim();
  if (!orgId && orgName) {
    const org = await q1('SELECT id, name FROM organizations WHERE lower(name) = lower($1)', [orgName])
      || await insert('organizations', { name: orgName, sector: b.sector || null });
    orgId = org.id;
    orgName = org.name;
  }
  let contactId = b.contact_id || null;
  const first = (b.first_name || '').trim();
  if (!contactId && first) {
    const email = (b.email || '').trim() || null;
    const existing = email && await q1('SELECT id FROM contacts WHERE lower(email) = lower($1)', [email]);
    contactId = existing?.id || (await insert('contacts', pick({
      organization_id: orgId, first_name: first, last_name: b.last_name, email, phone: b.phone, job_title: b.job_title,
    }, CONTACT_FIELDS))).id;
  }
  const title = (b.title || '').trim() || [orgName || first, b.product].filter(Boolean).join(' — ') || 'New lead';
  const deal = await insert('deals', cleanDeal(pick({
    title, organization_id: orgId, contact_id: contactId, owner_id: b.owner_id || req.user.id,
    value: b.value, product: b.product, source: b.source, expected_close: b.expected_close, notes: b.notes,
  }, DEAL_FIELDS)));
  await logActivity(req.user, 'stage', 'Lead created', deal);
  if (b.notes) await logActivity(req.user, 'note', b.notes, deal);
  res.json(deal);
}));

app.put('/api/deals/:id', wrap(async (req, res) => {
  const dealId = id(req);
  const data = cleanDeal(pick(req.body, DEAL_FIELDS));
  if ('title' in data) requireFields(data, 'title');
  let deal = await update('deals', dealId, data, 'updated_at = now()');
  if (req.body.stage) deal = await changeStage(deal, req.body.stage, req.body.lost_reason, req.user);
  res.json(deal);
}));

app.patch('/api/deals/:id/stage', wrap(async (req, res) => {
  const deal = await q1('SELECT * FROM deals WHERE id = $1', [id(req)]);
  if (!deal) throw fail(404, 'Deal not found');
  res.json(await changeStage(deal, req.body.stage, req.body.lost_reason, req.user));
}));

app.delete('/api/deals/:id', wrap(async (req, res) => {
  await remove('deals', id(req));
  res.json({ ok: true });
}));

// ---------- activities ----------

const ACTIVITY_SELECT = `
  SELECT a.*, u.name AS user_name, d.title AS deal_title,
    nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') AS contact_name
  FROM activities a
  LEFT JOIN users u ON u.id = a.user_id
  LEFT JOIN deals d ON d.id = a.deal_id
  LEFT JOIN contacts c ON c.id = a.contact_id`;

app.post('/api/activities', wrap(async (req, res) => {
  const data = pick(req.body, ['type', 'body', 'deal_id', 'contact_id', 'organization_id']);
  if (!ACTIVITY_TYPES.includes(data.type)) throw fail(400, 'Unknown activity type');
  requireFields(data, 'body');
  // Link the activity to everything the deal/contact belongs to so it shows on every timeline.
  if (data.deal_id) {
    const deal = await q1('SELECT contact_id, organization_id FROM deals WHERE id = $1', [data.deal_id]);
    if (!deal) throw fail(404, 'Deal not found');
    data.contact_id ??= deal.contact_id;
    data.organization_id ??= deal.organization_id;
    await q('UPDATE deals SET updated_at = now() WHERE id = $1', [data.deal_id]);
  }
  if (data.contact_id && !data.organization_id) {
    data.organization_id = (await q1('SELECT organization_id FROM contacts WHERE id = $1', [data.contact_id]))?.organization_id ?? null;
  }
  res.json(await insert('activities', { ...data, user_id: req.user.id }));
}));

app.delete('/api/activities/:id', wrap(async (req, res) => {
  const act = await q1('SELECT * FROM activities WHERE id = $1', [id(req)]);
  if (!act) throw fail(404, 'Not found');
  if (act.user_id !== req.user.id && req.user.role !== 'admin') throw fail(403, 'You can only delete your own entries');
  await remove('activities', act.id);
  res.json({ ok: true });
}));

// ---------- tasks ----------

const TASK_FIELDS = ['title', 'due_date', 'done', 'deal_id', 'contact_id', 'assigned_to'];
const TASK_SELECT = `
  SELECT t.*, u.name AS assigned_name, d.title AS deal_title,
    nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') AS contact_name
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assigned_to
  LEFT JOIN deals d ON d.id = t.deal_id
  LEFT JOIN contacts c ON c.id = t.contact_id`;

app.get('/api/tasks', wrap(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.scope !== 'all') { params.push(req.user.id); where.push(`t.assigned_to = $${params.length}`); }
  if (req.query.status === 'done') where.push('t.done');
  else if (req.query.status !== 'all') where.push('NOT t.done');
  res.json(await q(`${TASK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.done, t.due_date NULLS LAST, t.created_at`, params));
}));

app.post('/api/tasks', wrap(async (req, res) => {
  const data = pick(req.body, TASK_FIELDS);
  requireFields(data, 'title');
  data.assigned_to ??= req.user.id;
  if (data.deal_id && !data.contact_id) data.contact_id = (await q1('SELECT contact_id FROM deals WHERE id = $1', [data.deal_id]))?.contact_id ?? null;
  res.json(await insert('tasks', { ...data, created_by: req.user.id }));
}));

app.put('/api/tasks/:id', wrap(async (req, res) => {
  const data = pick(req.body, TASK_FIELDS);
  if ('title' in data) requireFields(data, 'title');
  const extra = 'done' in data ? `completed_at = ${data.done ? 'now()' : 'NULL'}` : '';
  res.json(await update('tasks', id(req), data, extra));
}));

app.delete('/api/tasks/:id', wrap(async (req, res) => {
  await remove('tasks', id(req));
  res.json({ ok: true });
}));

// ---------- dashboard ----------

const PERIODS = {
  '30d': "now() - interval '30 days'",
  '90d': "now() - interval '90 days'",
  quarter: "date_trunc('quarter', now())",
  year: "date_trunc('year', now())",
};

app.get('/api/stats', wrap(async (req, res) => {
  const since = PERIODS[req.query.period];
  const created = since ? `created_at >= ${since}` : 'TRUE';
  const closed = since ? `closed_at >= ${since}` : 'TRUE';

  const byStage = await q(`
    SELECT stage, count(*)::int AS n, coalesce(sum(value), 0)::float8 AS value FROM deals
    WHERE stage = ANY($1) OR (stage IN ('won', 'lost') AND ${closed})
    GROUP BY stage`, [OPEN_STAGES]);
  const stages = STAGES.map(s => ({ ...s, ...(byStage.find(r => r.stage === s.key) || { n: 0, value: 0 }) }));
  const open = stages.filter(s => OPEN_STAGES.includes(s.key));
  const won = stages.find(s => s.key === 'won');
  const lost = stages.find(s => s.key === 'lost');

  // Funnel: how many deals (created in the period) ever reached each stage.
  const reached = await q(`SELECT max_stage_index AS i, count(*)::int AS n FROM deals WHERE ${created} GROUP BY 1`);
  const funnel = STAGES.filter(s => s.key !== 'lost').map((s, i) => ({
    key: s.key, label: s.label, n: reached.filter(r => r.i >= i).reduce((t, r) => t + r.n, 0),
  }));

  const cycle = await q1(`SELECT avg(extract(epoch FROM closed_at - created_at) / 86400)::float8 AS days FROM deals WHERE stage = 'won' AND ${closed}`);
  const sources = await q(`
    SELECT coalesce(source, 'Unknown') AS source, count(*)::int AS n,
      (count(*) FILTER (WHERE stage = 'won'))::int AS won,
      coalesce(sum(value) FILTER (WHERE stage = 'won'), 0)::float8 AS won_value
    FROM deals WHERE ${created} GROUP BY 1 ORDER BY n DESC`);
  const lostReasons = await q(`
    SELECT coalesce(lost_reason, 'Not specified') AS reason, count(*)::int AS n
    FROM deals WHERE stage = 'lost' AND ${closed} GROUP BY 1 ORDER BY n DESC`);
  const monthly = await q(`
    WITH months AS (
      SELECT generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') AS m
    )
    SELECT to_char(m, 'YYYY-MM') AS month,
      (SELECT count(*)::int FROM deals WHERE date_trunc('month', created_at) = m) AS leads,
      (SELECT count(*)::int FROM deals WHERE stage = 'won' AND date_trunc('month', closed_at) = m) AS won,
      (SELECT coalesce(sum(value), 0)::float8 FROM deals WHERE stage = 'won' AND date_trunc('month', closed_at) = m) AS won_value
    FROM months ORDER BY m`);
  const myTasks = await q(`${TASK_SELECT} WHERE t.assigned_to = $1 AND NOT t.done
    ORDER BY t.due_date NULLS LAST LIMIT 8`, [req.user.id]);
  const taskCounts = await q1(`
    SELECT (count(*) FILTER (WHERE due_date < current_date))::int AS overdue,
           (count(*) FILTER (WHERE due_date = current_date))::int AS today
    FROM tasks WHERE assigned_to = $1 AND NOT done`, [req.user.id]);
  const recent = await q(`${ACTIVITY_SELECT} ORDER BY a.created_at DESC LIMIT 12`);
  const stale = await q(`${DEAL_SELECT} WHERE d.stage = ANY($1) AND d.updated_at < now() - interval '14 days'
    ORDER BY d.updated_at LIMIT 6`, [OPEN_STAGES]);

  const closedCount = won.n + lost.n;
  res.json({
    kpis: {
      openDeals: open.reduce((t, s) => t + s.n, 0),
      pipelineValue: open.reduce((t, s) => t + s.value, 0),
      weightedValue: open.reduce((t, s) => t + (s.value * s.prob) / 100, 0),
      wonCount: won.n,
      wonValue: won.value,
      lostCount: lost.n,
      winRate: closedCount ? won.n / closedCount : null,
      avgDealSize: won.n ? won.value / won.n : null,
      avgCycleDays: cycle.days,
      newLeads: funnel[0].n,
    },
    stages, funnel, sources, lostReasons, monthly, myTasks, taskCounts, recent, stale,
  });
}));

// ---------- CSV export ----------

const EXPORTS = {
  deals: `SELECT d.id, d.title, d.stage, d.value, d.product, d.source, o.name AS organization,
      trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) AS contact, c.email AS contact_email,
      u.name AS owner, d.expected_close, d.lost_reason, d.created_at, d.closed_at, d.notes
    FROM deals d LEFT JOIN organizations o ON o.id = d.organization_id LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN users u ON u.id = d.owner_id ORDER BY d.id`,
  contacts: `SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.job_title, o.name AS organization, c.linkedin, c.notes, c.created_at
    FROM contacts c LEFT JOIN organizations o ON o.id = c.organization_id ORDER BY c.id`,
  organizations: 'SELECT id, name, sector, website, city, country, notes, created_at FROM organizations ORDER BY id',
};

app.get('/api/export/:type.csv', wrap(async (req, res) => {
  const sql = EXPORTS[req.params.type];
  if (!sql) throw fail(404, 'Unknown export');
  const rows = await q(sql);
  const cell = v => {
    if (v == null) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
}));

// ---------- static frontend & errors ----------

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => {
  if (err.code === '23505') return res.status(409).json({ error: 'This record already exists' });
  if (err.code === '23503') return res.status(400).json({ error: 'Linked record does not exist' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' });
});

await initDb();

// Optional: create the first admin from environment variables instead of the setup screen.
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const { n } = await q1('SELECT count(*)::int AS n FROM users');
  if (n === 0) {
    await insert('users', {
      name: process.env.ADMIN_NAME || 'Admin', email: process.env.ADMIN_EMAIL.toLowerCase(),
      password_hash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10), role: 'admin',
    });
    console.log(`Created admin user ${process.env.ADMIN_EMAIL}`);
  }
}

app.listen(PORT, () => console.log(`CRM running on http://localhost:${PORT}`));
