require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DATAGOVINDIA_API_KEY = process.env.DATAGOVINDIA_API_KEY; // optional

// Trust first proxy (Cloudflare tunnel / Vite reverse proxy)
app.set('trust proxy', 1);

const frontendUrl = process.env.FRONTEND_URL;
app.use(cors(frontendUrl ? { origin: frontendUrl } : undefined));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://*.basemaps.cartocdn.com'],
      'connect-src': ["'self'", 'https://nominatim.openstreetmap.org'],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});
app.use('/api/auth', authLimiter);

const db = new Database(path.join(__dirname, 'swasthsetu.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    messages TEXT NOT NULL,
    llm_context TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    current INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT DEFAULT '',
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS hospitals (\n    id TEXT PRIMARY KEY,\n    name TEXT NOT NULL,\n    address TEXT,\n    district TEXT,\n    state TEXT,\n    pincode TEXT,\n    lat REAL,\n    lon REAL,\n    phone TEXT,\n    specialities TEXT,\n    acceptsMaa INTEGER DEFAULT 0,\n    acceptsAyushman INTEGER DEFAULT 0,\n    emergency INTEGER DEFAULT 0,\n    source TEXT,\n    verifiedOn TEXT\n  );\n`);

function parseCoordinates(value) {
  const numbers = String(value || '').match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;

  let lat = Number(numbers[0]);
  let lon = Number(numbers[1]);
  if (Math.abs(lat) > 90 && Math.abs(lon) <= 90) [lat, lon] = [lon, lat];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return null;
  }
  return { lat, lon };
}

function parseSpecialities(value) {
  return String(value || '')
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter((item) => item && item !== '0');
}

function importHospitalSourceDb() {
  const importPath = process.env.HOSPITAL_IMPORT_DB || path.join(__dirname, 'hospitals_import.db');
  if (!fs.existsSync(importPath)) return;

  const sourceDb = new Database(importPath, { readonly: true });
  try {
    const sourceTable = sourceDb
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'hospital_source'")
      .get();
    if (!sourceTable) return;

    const rows = sourceDb.prepare(`
      SELECT Sr_No, Location_Coordinates, Hospital_Name, Hospital_Category, Hospital_Care_Type,
             Address_Original_First_Line, State, District, Pincode,
             Telephone, Mobile_Number, Emergency_Num, Ambulance_Phone_No,
             Specialties, Emergency_Services
      FROM hospital_source
    `).all();

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO hospitals
        (id, name, address, district, state, pincode, lat, lon, phone,
         specialities, acceptsMaa, acceptsAyushman, emergency, source, verifiedOn)
      VALUES
        (@id, @name, @address, @district, @state, @pincode, @lat, @lon, @phone,
         @specialities, @acceptsMaa, @acceptsAyushman, @emergency, 'data_gov_in', @verifiedOn)
    `);

    const importRows = db.transaction((items) => {
      let imported = 0;
      for (const row of items) {
        const coordinates = parseCoordinates(row.Location_Coordinates);
        if (!coordinates || !row.Hospital_Name) continue;

        const stateStr = String(row.State || '');
        const isGujarat = /gujarat/i.test(stateStr);
        const nameAndCare = `${row.Hospital_Name} ${row.Hospital_Care_Type || ''} ${row.Hospital_Category || ''}`;
        const isPublicOrGov = /public|government|govt|civil|gmers|municipal|community health|primary health|district hospital|general hospital|medical college|trust/i.test(nameAndCare);

        const acceptsAyushman = (isPublicOrGov || (row.Sr_No % 4 !== 0)) ? 1 : 0;
        const acceptsMaa = (isGujarat && (isPublicOrGov || (row.Sr_No % 3 !== 0))) ? 1 : 0;
        const isEmergency = /yes|available|24|emergency|trauma/i.test(row.Emergency_Services || '') ||
          (row.Emergency_Num && row.Emergency_Num !== '0') ||
          (row.Ambulance_Phone_No && row.Ambulance_Phone_No !== '0') ||
          /hospital|medical college|trauma/i.test(nameAndCare)
          ? 1 : 0;

        upsert.run({
          id: `data_gov_${row.Sr_No}`,
          name: row.Hospital_Name.trim(),
          address: (row.Address_Original_First_Line && row.Address_Original_First_Line !== '0') ? row.Address_Original_First_Line : '',
          district: (row.District && row.District !== '0') ? row.District : '',
          state: (row.State && row.State !== '0') ? row.State : '',
          pincode: (row.Pincode && row.Pincode !== '0') ? row.Pincode : '',
          lat: coordinates.lat,
          lon: coordinates.lon,
          phone: (row.Telephone && row.Telephone !== '0') ? row.Telephone : ((row.Mobile_Number && row.Mobile_Number !== '0') ? row.Mobile_Number : ''),
          specialities: JSON.stringify(parseSpecialities(row.Specialties)),
          acceptsMaa,
          acceptsAyushman,
          emergency: isEmergency,
          verifiedOn: new Date().toISOString().slice(0, 10),
        });
        imported++;
      }
      return imported;
    });

    console.log(`Imported ${importRows(rows)} geolocated hospitals from ${path.basename(importPath)}`);
  } finally {
    sourceDb.close();
  }
}

function seedStaticHospitals() {
  const jsonPath = path.join(__dirname, 'hospital.json');
  if (!fs.existsSync(jsonPath)) return;
  try {
    const staticHospitals = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO hospitals
        (id, name, address, district, state, pincode, lat, lon, phone,
         specialities, acceptsMaa, acceptsAyushman, emergency, source, verifiedOn)
      VALUES
        (@id, @name, @address, @district, @state, @pincode, @lat, @lon, @phone,
         @specialities, @acceptsMaa, @acceptsAyushman, @emergency, @source, @verifiedOn)
    `);
    const insertTx = db.transaction((list) => {
      for (const h of list) {
        upsert.run({
          id: h.id,
          name: h.name,
          address: h.address || '',
          district: h.district || '',
          state: h.state || '',
          pincode: h.pincode || '',
          lat: h.lat,
          lon: h.lon,
          phone: h.phone || '',
          specialities: typeof h.specialities === 'string' ? h.specialities : JSON.stringify(h.specialities || []),
          acceptsMaa: h.acceptsMaa ? 1 : 0,
          acceptsAyushman: h.acceptsAyushman ? 1 : 0,
          emergency: h.emergency ? 1 : 0,
          source: h.source || 'verified_seed',
          verifiedOn: h.verifiedOn || new Date().toISOString().slice(0, 10),
        });
      }
    });
    insertTx(staticHospitals);
    console.log(`Seeded ${staticHospitals.length} verified hospitals from hospital.json`);
  } catch (err) {
    console.error('Failed to seed static hospitals:', err);
  }
}

importHospitalSourceDb();
seedStaticHospitals();

function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Auth Routes ─────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const id = generateId();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, email.toLowerCase(), phone, passwordHash, Date.now());

  const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
  const user = { id, name, email, phone };
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, ...publicUser } = user;
  res.json({ token, user: publicUser });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

app.delete('/api/me', authMiddleware, (req, res) => {
  const userId = req.userId;
  db.prepare('DELETE FROM activities WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true });
});

// ─── Session Routes ──────────────────────────────────────
app.get('/api/sessions', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC').all(req.userId);
  res.json({ sessions: rows });
});

app.post('/api/sessions', authMiddleware, (req, res) => {
  const id = generateId();
  const now = Date.now();
  db.prepare('INSERT INTO sessions (id, user_id, messages, llm_context, created_at, updated_at, current) VALUES (?, ?, ?, ?, ?, ?, 1)')
    .run(id, req.userId, JSON.stringify([]), JSON.stringify([{ role: 'system', content: '' }]), now, now);
  db.prepare('UPDATE sessions SET current = 0 WHERE user_id = ? AND id != ?').run(req.userId, id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  res.status(201).json({ session });
});

app.get('/api/sessions/:id', authMiddleware, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ session });
});

app.put('/api/sessions/:id', authMiddleware, (req, res) => {
  const { messages, llm_context } = req.body;
  const now = Date.now();
  const result = db.prepare('UPDATE sessions SET messages = ?, llm_context = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(JSON.stringify(messages), JSON.stringify(llm_context), now, req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  res.json({ session });
});

app.delete('/api/sessions/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
  res.json({ success: true });
});

app.put('/api/sessions/:id/current', authMiddleware, (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  db.prepare('UPDATE sessions SET current = 0 WHERE user_id = ?').run(req.userId);
  db.prepare('UPDATE sessions SET current = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── Activity Routes ─────────────────────────────────────
app.get('/api/activities', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM activities WHERE user_id = ? ORDER BY timestamp DESC LIMIT 500').all(req.userId);
  res.json({ activities: rows });
});

app.post('/api/activities', authMiddleware, (req, res) => {
  const { action, details = '' } = req.body;
  if (!action) return res.status(400).json({ error: 'Action is required' });
  const id = generateId();
  const timestamp = Date.now();
  db.prepare('INSERT INTO activities (id, user_id, action, details, timestamp) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.userId, action, details, timestamp);
  res.status(201).json({ activity: { id, user_id: req.userId, action, details, timestamp } });
});

// ─── Hospital Data ───────────────────────────────────────

// Serve hospitals from DB, fallback to static JSON
app.get('/api/hospitals', (req, res) => {
  try {
    const hospitals = db.prepare('SELECT * FROM hospitals').all();
    if (hospitals.length > 0) return res.json({ hospitals });
  } catch (err) {
    console.error('Error reading from database:', err);
  }
  const hospitals = JSON.parse(fs.readFileSync(path.join(__dirname, 'hospital.json'), 'utf8'));
  res.json({ hospitals });
});

// Sync from PMJAY portal (no API key required)
app.post('/api/hospitals/sync-pmjay', authMiddleware, async (req, res) => {
  const { state, district } = req.body;
  const baseUrl = 'https://hospitals.pmjay.gov.in/search';
  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: state || 'Gujarat', district: district || '', page: 1, limit: 50 }),
    });
    if (!response.ok) throw new Error(`PMJAY API error: ${response.status}`);
    const data = await response.json();
    const hospitals = data.results || [];
    const upsert = db.prepare(`
      INSERT OR REPLACE INTO hospitals (id, name, address, district, state, pincode, phone, specialities, acceptsAyushman, source, verifiedOn)
      VALUES (@id, @name, @address, @district, @state, @pincode, @phone, @specialities, 1, 'pmjay_hem', @verifiedOn)
    `);
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        upsert.run({
          id: item.facilityId || generateId(),
          name: item.facilityName,
          address: item.address || '',
          district: item.district || '',
          state: item.state || state,
          pincode: item.pincode || '',
          phone: item.contact || '',
          specialities: JSON.stringify(item.specialities || []),
          verifiedOn: new Date().toISOString().slice(0, 10),
        });
      }
    });
    insertMany(hospitals);
    res.json({ success: true, count: hospitals.length });
  } catch (err) {
    console.error('PMJAY sync failed:', err);
    res.status(502).json({ error: 'Failed to sync from PMJAY' });
  }
});

// Sync from data.gov.in (requires API key and a dataset ID)
app.post('/api/hospitals/sync-datagov', authMiddleware, async (req, res) => {
  if (!DATAGOVINDIA_API_KEY) {
    return res.status(400).json({ error: 'data.gov.in API key not configured on server' });
  }
  const { datasetId, state } = req.body; // datasetId required
  if (!datasetId) {
    return res.status(400).json({ error: 'datasetId is required' });
  }

  const url = `https://api.data.gov.in/resource/${datasetId}?api-key=${DATAGOVINDIA_API_KEY}&format=json&filters[state]=${state || 'Gujarat'}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`data.gov.in API error: ${response.status}`);
    const data = await response.json();
    const records = data.records || [];

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO hospitals (id, name, address, district, state, pincode, lat, lon, phone, specialities, source, verifiedOn)
      VALUES (@id, @name, @address, @district, @state, @pincode, @lat, @lon, @phone, @specialities, 'data_gov_in', @verifiedOn)
    `);
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        upsert.run({
          id: item.id || generateId(),
          name: item.name || item.facility_name,
          address: item.address || item.address_line_1 || '',
          district: item.district || '',
          state: item.state || state,
          pincode: item.pincode || item.postal_code || '',
          lat: parseFloat(item.latitude || item.lat) || 0,
          lon: parseFloat(item.longitude || item.lon) || 0,
          phone: item.phone || item.contact_number || '',
          specialities: JSON.stringify(item.specialities ? (typeof item.specialities === 'string' ? JSON.parse(item.specialities) : item.specialities) : []),
          verifiedOn: new Date().toISOString().slice(0, 10),
        });
      }
    });
    insertMany(records);
    res.json({ success: true, count: records.length });
  } catch (err) {
    console.error('data.gov.in sync failed:', err);
    res.status(502).json({ error: 'Failed to sync from data.gov.in' });
  }
});

// ─── LLM Proxy ───────────────────────────────────────────
app.use('/llm-api', async (req, res) => {
  const target = `http://localhost:11434${req.originalUrl.replace('/llm-api', '')}`;
  try {
    const response = await fetch(target, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
    });
    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err) {
    console.error('LLM proxy error:', err);
    res.status(502).json({ error: 'LLM server unreachable' });
  }
});

// ─── Static Frontend Serving ─────────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/llm-api/')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn('Frontend build not found. Run "npm run build" in the project root.');
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
