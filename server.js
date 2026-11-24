const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./config/database'); // Matches config/database.js

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.VERCEL === '1';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for Drone Image Uploads
// Note: Vercel's filesystem is read-only outside /tmp, so use /tmp in production
const uploadDir = isProduction
  ? '/tmp'
  : path.join(__dirname, 'public/uploads');

if (!isProduction && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'drone-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Helper: Compute SHA-256 Telemetry Verification Hash (now includes MAC address)
function generateTelemetryHash(spec) {
  const payload = `${spec.remote_id}|${spec.caa_registration_id}|${spec.drone_mac_address}|${spec.country_of_origin}|${spec.max_takeoff_mass}|${spec.firmware_version}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// Helper: Validate standard MAC Address format (e.g. AA:BB:CC:DD:EE:FF or AA-BB-CC-DD-EE-FF)
function isValidMacAddress(mac) {
  return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac.trim());
}

// ---------------- API ENDPOINTS ----------------

// 1. Supplier Registration (Hashes password with bcryptjs)
app.post('/api/supplier/register', async (req, res) => {
  const { company_name, email, password, caa_license_no, country_code } = req.body;

  if (!company_name || !email || !password || !caa_license_no || !country_code) {
    return res.status(400).json({ success: false, message: 'All registration fields are required.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO suppliers (company_name, email, password_hash, caa_license_no, country_code) VALUES (?, ?, ?, ?, ?)`;

    const result = await db.execute({
      sql,
      args: [company_name, email, hashedPassword, caa_license_no, country_code]
    });

    res.json({
      success: true,
      supplier_id: Number(result.lastInsertRowid),
      message: 'Supplier registered successfully.'
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({ success: false, message: 'Email or CAA License Number already registered.' });
    }
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

// 2. Supplier Login
app.post('/api/supplier/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await db.execute({
      sql: `SELECT * FROM suppliers WHERE email = ?`,
      args: [email]
    });

    const supplier = result.rows[0];
    if (!supplier) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const match = await bcrypt.compare(password, supplier.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    res.json({
      success: true,
      supplier: {
        id: supplier.id,
        company_name: supplier.company_name,
        email: supplier.email,
        caa_license_no: supplier.caa_license_no
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

// 3. Register & Verify Drone (Strict Telemetry Validation + Mandatory MAC Address)
app.post('/api/drones/register', upload.single('drone_image'), async (req, res) => {
  const {
    supplier_id, model_name, category, price,
    remote_id, caa_registration_id, country_of_origin,
    max_takeoff_mass, firmware_version, max_range_km, max_flight_time_min,
    drone_mac_address, image_url_input
  } = req.body;

  // Enforce mandatory strict telemetry tracking specs + MAC Address
  if (!remote_id || !caa_registration_id || !country_of_origin || !max_takeoff_mass || !firmware_version || !drone_mac_address) {
    return res.status(400).json({
      success: false,
      message: 'Strict regulatory specs missing (Remote ID, CAA ID, Drone MAC Address, Country of Origin, MTOM, Firmware).'
    });
  }

  // Validate MAC Address format
  if (!isValidMacAddress(drone_mac_address)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Drone MAC Address format. Use AA:BB:CC:DD:EE:FF.'
    });
  }

  const normalizedMac = drone_mac_address.trim().toUpperCase().replace(/-/g, ':');

  // Resolve Image Path
  let image_url = '/uploads/default-drone.png';
  if (image_url_input) {
    image_url = image_url_input;
  } else if (req.file && !isProduction) {
    image_url = `/uploads/${req.file.filename}`;
  }

  // Generate SHA-256 Telemetry Hash
  const verification_hash = generateTelemetryHash({
    remote_id,
    caa_registration_id,
    drone_mac_address: normalizedMac,
    country_of_origin,
    max_takeoff_mass,
    firmware_version
  });

  const sql = `
    INSERT INTO drones (
      supplier_id, model_name, category, price, remote_id, caa_registration_id,
      country_of_origin, max_takeoff_mass, firmware_version, max_range_km,
      max_flight_time_min, drone_mac_address, image_url, verification_hash, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED')
  `;

  const args = [
    supplier_id || 1, model_name, category || 'Pro Cinema', parseFloat(price),
    remote_id, caa_registration_id, country_of_origin, parseFloat(max_takeoff_mass),
    firmware_version, parseFloat(max_range_km), parseInt(max_flight_time_min),
    normalizedMac, image_url, verification_hash
  ];

  try {
    const result = await db.execute({ sql, args });

    res.json({
      success: true,
      drone_id: Number(result.lastInsertRowid),
      verification_hash,
      message: 'Drone verified against aviation telemetry specs and listed on marketplace.'
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(400).json({
        success: false,
        message: 'Drone Remote ID, CAA Registration ID, or MAC Address already exists in system.'
      });
    }
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

// 4. Get Marketplace Approved Drones
app.get('/api/drones', async (req, res) => {
  try {
    const result = await db.execute(`SELECT * FROM drones WHERE status = 'APPROVED' ORDER BY id DESC`);
    res.json({ success: true, drones: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Capture Buyer Details on Checkout Click
app.post('/api/checkout', async (req, res) => {
  const {
    drone_id,
    drone_model,
    total_amount,
    buyer_name,
    buyer_email,
    buyer_phone,
    buyer_address
  } = req.body;

  if (!buyer_name || !buyer_email || !buyer_phone || !buyer_address) {
    return res.status(400).json({
      success: false,
      message: 'Please provide your full name, email, phone number, and delivery address.'
    });
  }

  try {
    const sql = `
      INSERT INTO buyer_orders (
        drone_id, drone_model, total_amount, buyer_name, buyer_email, buyer_phone, buyer_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await db.execute({
      sql,
      args: [
        drone_id || null,
        drone_model || 'Marketplace Order',
        parseFloat(total_amount) || 0,
        buyer_name.trim(),
        buyer_email.trim(),
        buyer_phone.trim(),
        buyer_address.trim()
      ]
    });

    res.json({
      success: true,
      order_id: Number(result.lastInsertRowid),
      message: 'Buyer details saved and checkout recorded successfully!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save checkout details.' });
  }
});

// Fallback to index.html for frontend routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server locally; Vercel uses module.exports
if (!isProduction) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
