const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'data', 'kennel.db'));

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dogs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      breed TEXT,
      gender TEXT,
      dob TEXT,
      status TEXT,
      weight TEXT,
      notes TEXT,
      value TEXT,
      forSale INTEGER DEFAULT 0,
      price TEXT,
      image TEXT,
      records TEXT,
      attachments TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS puppies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      saleStatus TEXT,
      saleTotalAmount REAL,
      saleReceivedAmount REAL,
      saleUnpaidAmount REAL,
      vaccinations TEXT,
      deworming TEXT,
      father TEXT,
      mother TEXT,
      sireGrandfather TEXT,
      sireGrandmother TEXT,
      damGrandfather TEXT,
      damGrandmother TEXT,
      ownerName TEXT,
      ownerPhone TEXT,
      ownerAddress TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      related TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      color TEXT NOT NULL,
      time TEXT NOT NULL
    );
  `);

  const adminCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (adminCount === 0) {
    const insertAdmin = db.prepare(`
      INSERT INTO users (id, name, email, password, role, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertAdmin.run(
      'u-admin-1',
      'Admin User',
      'admin@bigpaw.com',
      'admin123',
      'admin',
      new Date().toISOString()
    );
  }
}

initDb();

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Bigpaw backend is running' });
});

app.post('/api/auth/login', (req, res) => {
  const { identifier, password } = req.body;
  const lookup = String(identifier || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email)=? OR LOWER(name)=?').get(lookup, lookup);
  if (!user || user.password !== String(password || '')) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
  }
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ ok: false, error: 'Please complete all fields.' });
  }
  try {
    const id = 'u' + Date.now();
    db.prepare('INSERT INTO users (id, name, email, password, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, name, email.toLowerCase(), password, 'staff', new Date().toISOString());
    res.json({ ok: true, user: { id, name, email: email.toLowerCase(), role: 'staff' } });
  } catch (error) {
    res.status(400).json({ ok: false, error: 'An account with this email already exists.' });
  }
});

app.get('/api/dogs', (req, res) => {
  const rows = db.prepare('SELECT * FROM dogs ORDER BY createdAt DESC').all();
  res.json(rows.map((row) => ({
    ...row,
    forSale: Boolean(row.forSale),
    records: row.records ? JSON.parse(row.records) : { health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] },
    attachments: row.attachments ? JSON.parse(row.attachments) : []
  })));
});

app.post('/api/dogs', (req, res) => {
  const dog = req.body;
  const id = dog.id || 'd' + Date.now();
  db.prepare(`
    INSERT INTO dogs (id, name, breed, gender, dob, status, weight, notes, value, forSale, price, image, records, attachments, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dog.name,
    dog.breed || '',
    dog.gender || 'Unknown',
    dog.dob || null,
    dog.status || 'Active',
    dog.weight || '',
    dog.notes || '',
    dog.value || '',
    dog.forSale ? 1 : 0,
    dog.price || '',
    dog.image || '',
    JSON.stringify(dog.records || { health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] }),
    JSON.stringify(dog.attachments || []),
    new Date().toISOString()
  );
  res.json({ ok: true, dog: { ...dog, id } });
});

app.put('/api/dogs/:id', (req, res) => {
  const dog = req.body;
  db.prepare(`
    UPDATE dogs SET
      name = ?, breed = ?, gender = ?, dob = ?, status = ?, weight = ?, notes = ?, value = ?, forSale = ?, price = ?, image = ?, records = ?, attachments = ?
    WHERE id = ?
  `).run(
    dog.name,
    dog.breed || '',
    dog.gender || 'Unknown',
    dog.dob || null,
    dog.status || 'Active',
    dog.weight || '',
    dog.notes || '',
    dog.value || '',
    dog.forSale ? 1 : 0,
    dog.price || '',
    dog.image || '',
    JSON.stringify(dog.records || { health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] }),
    JSON.stringify(dog.attachments || []),
    req.params.id
  );
  res.json({ ok: true, dog });
});

app.delete('/api/dogs/:id', (req, res) => {
  db.prepare('DELETE FROM dogs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/puppies', (req, res) => {
  const rows = db.prepare('SELECT * FROM puppies ORDER BY createdAt DESC').all();
  res.json(rows.map((row) => ({
    ...row,
    vaccinations: row.vaccinations ? JSON.parse(row.vaccinations) : [],
    deworming: row.deworming ? JSON.parse(row.deworming) : []
  })));
});

app.post('/api/puppies', (req, res) => {
  const puppy = req.body;
  const id = puppy.id || 'p' + Date.now();
  db.prepare(`
    INSERT INTO puppies (id, name, dob, gender, saleStatus, saleTotalAmount, saleReceivedAmount, saleUnpaidAmount, vaccinations, deworming, father, mother, sireGrandfather, sireGrandmother, damGrandfather, damGrandmother, ownerName, ownerPhone, ownerAddress, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    puppy.name,
    puppy.dob || null,
    puppy.gender || 'Unknown',
    puppy.saleStatus || 'Available',
    puppy.saleTotalAmount || null,
    puppy.saleReceivedAmount || null,
    puppy.saleUnpaidAmount || null,
    JSON.stringify(puppy.vaccinations || []),
    JSON.stringify(puppy.deworming || []),
    puppy.father || '',
    puppy.mother || '',
    puppy.sireGrandfather || '',
    puppy.sireGrandmother || '',
    puppy.damGrandfather || '',
    puppy.damGrandmother || '',
    puppy.ownerName || '',
    puppy.ownerPhone || '',
    puppy.ownerAddress || '',
    new Date().toISOString()
  );
  res.json({ ok: true, puppy: { ...puppy, id } });
});

app.delete('/api/puppies/:id', (req, res) => {
  db.prepare('DELETE FROM puppies WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/finance', (req, res) => {
  const rows = db.prepare('SELECT * FROM finance ORDER BY date DESC, createdAt DESC').all();
  res.json(rows);
});

app.post('/api/finance', (req, res) => {
  const entry = req.body;
  const id = entry.id || 'f' + Date.now();
  db.prepare(`
    INSERT INTO finance (id, type, title, category, amount, date, related, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, entry.type || 'expense', entry.title || '', entry.category || '', Number(entry.amount) || 0, entry.date || new Date().toISOString().slice(0, 10), entry.related || '', entry.notes || '', new Date().toISOString());
  res.json({ ok: true, entry: { ...entry, id } });
});

app.delete('/api/finance/:id', (req, res) => {
  db.prepare('DELETE FROM finance WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/events', (req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY date ASC').all());
});

app.post('/api/events', (req, res) => {
  const event = req.body;
  const id = event.id || 'ev' + Date.now();
  db.prepare('INSERT INTO events (id, title, date, notes, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(id, event.title || '', event.date || '', event.notes || '', new Date().toISOString());
  res.json({ ok: true, event: { ...event, id } });
});

app.get('/api/activities', (req, res) => {
  res.json(db.prepare('SELECT * FROM activities ORDER BY time DESC LIMIT 20').all());
});

app.post('/api/activities', (req, res) => {
  const activity = req.body;
  const id = activity.id || 'a' + Date.now();
  db.prepare('INSERT INTO activities (id, type, text, color, time) VALUES (?, ?, ?, ?, ?)')
    .run(id, activity.type || 'info', activity.text || '', activity.color || 'blue', activity.time || new Date().toISOString());
  res.json({ ok: true, activity: { ...activity, id } });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Bigpaw backend running at http://localhost:${port}`);
});
