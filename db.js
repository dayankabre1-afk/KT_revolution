const { DatabaseSync } = require('node:sqlite'); // SQLite intégré à Node 22.13+
const path = require('path'), fs = require('fs');
const DATA = process.env.DATA_DIR || __dirname;  // chez un hébergeur : dossier du disque persistant (ex. /data)
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'commandes.db')); // ce fichier n'est jamais servi sur le web
db.exec(`
PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0, image TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE, phone_display TEXT NOT NULL, password_hash TEXT NOT NULL,
  address TEXT NOT NULL, city TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, phone TEXT NOT NULL,
  city TEXT NOT NULL, address TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'nouvelle',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL, name TEXT NOT NULL, unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL);
`);
if (!db.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === 'user_id'))
  db.exec('ALTER TABLE orders ADD COLUMN user_id INTEGER'); // anciennes bases
db.exec('DELETE FROM products WHERE id > 2'); // la boutique n'affiche que 2 articles
// Articles de départ (modifiables ensuite dans /admin)
const START = [
  [1, 'Interrupteur télécommandé', 'Module à fixer sur ton interrupteur mural, avec télécommande', '/uploads/article-1-depart.jpg'],
  [2, 'Grips de musculation', 'Protège-paumes en silicone, noir ou gris', '/uploads/article-2-depart.jpg'],
];
if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n === 0) {
  const add = db.prepare('INSERT INTO products (id, name, description, price, image) VALUES (?, ?, ?, 2000, ?)');
  START.forEach(([id, n, d, img]) => add.run(id, n, d, img));
}
// Bases existantes : on remplit seulement les articles encore vides (jamais ceux que tu as modifiés)
const fill = db.prepare("UPDATE products SET name = ?, description = ?, price = 2000, image = ? WHERE id = ? AND name LIKE 'Article %' AND price = 0 AND image = ''");
START.forEach(([id, n, d, img]) => fill.run(n, d, img, id));
module.exports = db;
