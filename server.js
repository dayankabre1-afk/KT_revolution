require('dotenv').config();
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const express = require('express'), cookieParser = require('cookie-parser'), jwt = require('jsonwebtoken');
const db = require('./db');

const { JWT_SECRET, ADMIN_PASSWORD, TELEGRAM_BOT_TOKEN: TG } = process.env;
// 'Ma Boutique' = ancien texte d'exemple de .env : on l'ignore
const CONFIG = { store: (process.env.STORE_NAME && process.env.STORE_NAME !== 'Ma Boutique') ? process.env.STORE_NAME : 'KT REVOLUTION', currency: process.env.CURRENCY || 'FCFA', whatsapp: (process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '') };
if (!JWT_SECRET || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('Ouvre le fichier .env : JWT_SECRET et ADMIN_PASSWORD (8 caracteres minimum) doivent etre remplis.');
  process.exit(1);
}
// Photos : sur le disque persistant si DATA_DIR est défini, sinon dans public/uploads
const UP = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(UP, { recursive: true });

const app = express();
app.set('trust proxy', 1); // derrière l'hébergeur : vraie adresse IP des visiteurs
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(UP, { etag: false, setHeaders: (r) => r.setHeader('Cache-Control', 'no-store') }));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, setHeaders: (r) => r.setHeader('Cache-Control', 'no-store') }));
app.get('/admin', (q, r) => r.sendFile(path.join(__dirname, 'public', 'admin.html')));

const hits = new Map(); // limite de requêtes par IP
const limit = (key, max, ms) => (req, res, next) => {
  const k = key + req.ip, now = Date.now(), a = (hits.get(k) || []).filter((t) => now - t < ms);
  if (a.length >= max) return res.status(429).json({ error: 'Trop de tentatives, réessaie plus tard.' });
  a.push(now); hits.set(k, a); next();
};
const clean = (v, n) => String(v || '').trim().slice(0, n);
const digits = (p) => String(p || '').replace(/\D/g, '');
const cookie = (req, name, id, secret, ms) => [name, jwt.sign(id, secret, { expiresIn: Math.floor(ms / 1000) }), { httpOnly: true, sameSite: 'strict', maxAge: ms, secure: req.secure }];

// ---------- Alertes Telegram ----------
const setting = (k) => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value;
const chatId = () => process.env.TELEGRAM_CHAT_ID || setting('telegram_chat_id'); // la variable garde l'alerte même si la base est effacée
async function notifyOwner(text) {
  const chat = chatId();
  if (!TG || !chat) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text }) });
    return r.ok;
  } catch (e) { console.error('Telegram :', e.message); return false; }
}

// ---------- Comptes clients ----------
const scrypt = (pw, salt) => crypto.scryptSync(pw, salt, 64);
const hashPw = (pw) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + scrypt(pw, s).toString('hex'); };
const checkPw = (pw, h) => { const [s, x] = h.split(':'); return crypto.timingSafeEqual(scrypt(pw, s), Buffer.from(x, 'hex')); };
const me = (id) => { const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id); return u && { id: u.id, first_name: u.first_name, last_name: u.last_name, phone: u.phone_display, address: u.address, city: u.city }; };
const needUser = (req, res, next) => {
  try { req.uid = jwt.verify(req.cookies.session, JWT_SECRET).u; if (!me(req.uid)) throw 0; next(); }
  catch { res.status(401).json({ error: 'Connecte-toi pour continuer.' }); }
};

app.get('/api/config', (q, r) => r.json(CONFIG));

app.post('/api/register', limit('r', 10, 3600e3), (req, res) => {
  const b = req.body || {}, first = clean(b.first_name, 50), last = clean(b.last_name, 50), phone = clean(b.phone, 25),
    address = clean(b.address, 200), city = clean(b.city, 60), pw = String(b.password || ''), pn = digits(phone);
  if (!first || !last || !address || !city || pn.length < 8 || pn.length > 15) return res.status(400).json({ error: 'Remplis tous les champs avec un numéro de téléphone valide.' });
  if (pw.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(pn)) return res.status(409).json({ error: 'Un compte existe déjà avec ce numéro. Connecte-toi.' });
  const id = Number(db.prepare('INSERT INTO users (first_name, last_name, phone, phone_display, password_hash, address, city) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(first, last, pn, phone, hashPw(pw), address, city).lastInsertRowid);
  res.cookie(...cookie(req, 'session', { u: id }, JWT_SECRET, 30 * 864e5)); res.json(me(id));
});
app.post('/api/login', limit('li', 10, 900e3), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(digits(req.body?.phone));
  if (!u || !checkPw(String(req.body?.password || ''), u.password_hash)) return res.status(401).json({ error: 'Téléphone ou mot de passe incorrect.' });
  res.cookie(...cookie(req, 'session', { u: u.id }, JWT_SECRET, 30 * 864e5)); res.json(me(u.id));
});
app.post('/api/logout', (q, r) => { r.clearCookie('session'); r.json({ ok: true }); });
app.get('/api/me', needUser, (req, res) => res.json(me(req.uid)));
app.put('/api/me', needUser, (req, res) => {
  const b = req.body || {}, first = clean(b.first_name, 50), last = clean(b.last_name, 50), address = clean(b.address, 200), city = clean(b.city, 60);
  if (!first || !last || !address || !city) return res.status(400).json({ error: 'Remplis tous les champs.' });
  db.prepare('UPDATE users SET first_name = ?, last_name = ?, address = ?, city = ? WHERE id = ?').run(first, last, address, city, req.uid);
  res.json(me(req.uid));
});

// ---------- Articles et commandes ----------
app.get('/api/products', (q, r) => r.json(db.prepare('SELECT id, name, description, price, image FROM products ORDER BY id').all()));

const withItems = (rows) => { const it = db.prepare('SELECT name, unit_price, quantity FROM order_items WHERE order_id = ?'); return rows.map((o) => ({ ...o, items: it.all(o.id) })); };
app.get('/api/orders/mine', needUser, (req, res) =>
  res.json(withItems(db.prepare('SELECT id, total, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.uid))));

app.post('/api/orders', needUser, limit('o', 15, 3600e3), (req, res) => {
  const u = me(req.uid), b = req.body || {}, address = clean(b.address, 200), city = clean(b.city, 60), note = clean(b.note, 300);
  if (!address || !city) return res.status(400).json({ error: 'Indique ton adresse et ta ville.' });
  const lines = [];
  for (const it of Array.isArray(b.items) ? b.items : []) {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(it.id)), qty = Math.floor(Number(it.qty));
    if (!p || p.price <= 0 || !(qty >= 1 && qty <= 99)) return res.status(400).json({ error: 'Panier invalide.' });
    lines.push({ p, qty });
  }
  if (!lines.length) return res.status(400).json({ error: 'Ton panier est vide.' });
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0), name = `${u.first_name} ${u.last_name}`;
  let id;
  try {
    db.exec('BEGIN');
    id = Number(db.prepare('INSERT INTO orders (user_id, customer_name, phone, city, address, note, total) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(u.id, name, u.phone, city, address, note, total).lastInsertRowid);
    const add = db.prepare('INSERT INTO order_items (order_id, product_id, name, unit_price, quantity) VALUES (?, ?, ?, ?, ?)');
    lines.forEach((l) => add.run(id, l.p.id, l.p.name, l.p.price, l.qty));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK'); console.error('Commande :', e.message);
    return res.status(500).json({ error: 'Commande impossible pour le moment.' });
  }
  notifyOwner(`🛒 Nouvelle commande n°${id}\n${name} · ${u.phone}\n${city} — ${address}${note ? '\nNote : ' + note : ''}\n` +
    lines.map((l) => `• ${l.p.name} × ${l.qty}`).join('\n') + `\nTotal : ${total} ${CONFIG.currency} (paiement à la livraison)`);
  res.json({ orderId: id, total });
});

// ---------- Administrateur (toi seul) ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
app.post('/api/admin/login', limit('l', 8, 900e3), (req, res) => {
  if (!crypto.timingSafeEqual(sha(req.body?.password), sha(ADMIN_PASSWORD))) return res.status(401).json({ error: 'Mot de passe incorrect.' });
  res.cookie(...cookie(req, 'admin', { a: 1 }, JWT_SECRET, 12 * 3600e3)); res.json({ ok: true });
});
app.post('/api/admin/logout', (q, r) => { r.clearCookie('admin'); r.json({ ok: true }); });
const admin = (req, res, next) => { try { jwt.verify(req.cookies.admin, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Connexion requise.' }); } };
app.get('/api/admin/check', admin, (q, r) => r.json({ ok: true }));
app.get('/api/admin/status', admin, (q, r) => r.json({ telegram: Boolean(TG), linked: Boolean(chatId()) }));

app.post('/api/admin/telegram/link', admin, async (req, res) => {
  if (!TG) return res.status(400).json({ error: 'Ajoute TELEGRAM_BOT_TOKEN dans .env puis relance le site.' });
  try {
    const r = await (await fetch(`https://api.telegram.org/bot${TG}/getUpdates`)).json();
    const msg = (r.result || []).filter((u) => u.message?.chat?.type === 'private').pop();
    if (r.ok === false) return res.status(400).json({ error: 'Token Telegram refusé : vérifie TELEGRAM_BOT_TOKEN.' });
    if (msg) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('telegram_chat_id', String(msg.message.chat.id));
    else if (!chatId()) return res.status(400).json({ error: 'Ouvre ton bot dans Telegram, envoie-lui « bonjour », puis réessaie.' });
    const ok = await notifyOwner('✅ Alertes activées : tu recevras ici chaque nouvelle commande.');
    ok ? res.json({ ok: true, chat: chatId() }) : res.status(502).json({ error: 'Envoi impossible pour le moment.' });
  } catch (e) { res.status(502).json({ error: 'Telegram est injoignable (connexion Internet ?).' }); }
});

app.get('/api/admin/orders', admin, (q, r) => r.json(withItems(db.prepare('SELECT * FROM orders ORDER BY id DESC').all())));
app.patch('/api/admin/orders/:id', admin, (req, res) => {
  const s = req.body?.status;
  if (!['nouvelle', 'confirmée', 'livrée', 'annulée'].includes(s)) return res.status(400).json({ error: 'Statut invalide.' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(s, Number(req.params.id));
  res.json({ ok: true });
});
app.put('/api/admin/products/:id', admin, (req, res) => {
  const id = Number(req.params.id), b = req.body || {}, p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Article introuvable.' });
  const name = clean(b.name, 80), desc = clean(b.description, 300), price = Math.round(Number(b.price));
  if (!name || !(price >= 0 && price <= 1e7)) return res.status(400).json({ error: 'Nom ou prix invalide.' });
  let image = p.image;
  if (b.image) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.image);
    if (!m) return res.status(400).json({ error: 'Photo invalide (JPG, PNG ou WebP).' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 4e6) return res.status(400).json({ error: 'Photo trop lourde.' });
    const file = `article-${id}-${Date.now()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.writeFileSync(path.join(UP, file), buf);
    if (p.image.startsWith('/uploads/')) fs.rm(path.join(UP, path.basename(p.image)), () => {});
    image = '/uploads/' + file;
  }
  db.prepare('UPDATE products SET name = ?, description = ?, price = ?, image = ? WHERE id = ?').run(name, desc, price, image, id);
  res.json({ ok: true, image });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Boutique : http://localhost:${port}   |   Admin : http://localhost:${port}/admin`));
