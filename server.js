const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// When this file is packaged into a standalone .exe (via `pkg`), __dirname
// points inside the read-only snapshot. Keep the database next to the real
// executable on disk instead, so it can be read and written normally.
const isPackaged = typeof process.pkg !== 'undefined';
const BASE_DIR = isPackaged ? path.dirname(process.execPath) : __dirname;
const DB_DIR = path.join(BASE_DIR, 'db');
const DB_FILE = path.join(DB_DIR, 'data.json');

function loadDB() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      nextClientId: 1,
      nextReportId: 1,
      nextPackageId: 4,
      nextEmployeeId: 4,
      nextPaymentAccountId: 3,
      clients: [],
      reports: [],
      packages: [
        { id: 1, name: 'Basic', price: 500, duration: 1, features: ['Gym access', 'Standard equipment'] },
        { id: 2, name: 'Standard', price: 800, duration: 1, features: ['Gym access', 'Trainer guidance', 'Fitness consultation'] },
        { id: 3, name: 'Premium', price: 1200, duration: 1, features: ['Full access', 'Priority trainer support', 'Fitness consultation'] }
      ],
      employees: [
        { id: 1, employee_id: 'BJ-EMP-001', name: 'Gym Administrator', phone: '', position: 'Admin', username: 'admin', status: 'Active' },
        { id: 2, employee_id: 'BJ-EMP-002', name: 'Registration Officer', phone: '', position: 'Registrar', username: 'registrar', status: 'Active' },
        { id: 3, employee_id: 'BJ-EMP-003', name: 'Maintenance Staff', phone: '', position: 'Maintenance', username: '', status: 'Active' }
      ],
      users: [
        { id: 1, username: 'admin', password: 'admin123', role: 'admin' },
        { id: 2, username: 'registrar', password: 'registrar123', role: 'registrar' }
      ],
      // Accounts customers can send mobile-money / bank payments to.
      // Edit these from Admin > Payment Accounts (or update here before first run).
      paymentAccounts: [
        { id: 1, provider: 'Telebirr', account_number: '09XXXXXXXX', account_name: 'BJ Gym', note: 'Send payment then upload your screenshot below.' },
        { id: 2, provider: 'CBE', account_number: '1000XXXXXXXXX', account_name: 'BJ Gym', note: 'Commercial Bank of Ethiopia' }
      ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
  }
  const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  // Backfill fields for DBs created by older versions of this app.
  if (!Array.isArray(data.paymentAccounts)) data.paymentAccounts = [];
  if (!data.nextPaymentAccountId) data.nextPaymentAccountId = data.paymentAccounts.length + 1;
  return data;
}

let db = loadDB();
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ---------- Staff/role guard ----------
// Matches this project's existing security model (see README): the admin
// pages are gated in the browser via localStorage, and here we add a
// lightweight server-side check so the sensitive endpoints (approving a
// payment, editing payment accounts, staff/package management) can't be
// called by just anyone who finds the URL. The staff UI sends the logged-in
// username/role on every request that needs it.
function requireStaff(roles) {
  return (req, res, next) => {
    const username = clean(req.get('x-bj-username'));
    const user = db.users.find(u => u.username === username);
    if (!user || (roles && !roles.includes(user.role))) {
      return res.status(401).json({ error: 'Staff login required for this action.' });
    }
    req.staffUser = user;
    next();
  };
}

app.get('/api/packages', (req, res) => res.json(db.packages));

app.post('/api/packages', requireStaff(['admin']), (req, res) => {
  const { name, price, duration, features } = req.body;
  if (!clean(name) || !price || !duration) return res.status(400).json({ error: 'Package name, price and duration are required.' });
  const pkg = { id: db.nextPackageId++, name: clean(name), price: Number(price), duration: Number(duration), features: Array.isArray(features) ? features.map(clean).filter(Boolean) : clean(features).split(',').map(x => x.trim()).filter(Boolean) };
  db.packages.push(pkg);
  saveDB();
  res.json({ success: true, package: pkg });
});

app.patch('/api/packages/:id', requireStaff(['admin']), (req, res) => {
  const pkg = db.packages.find(p => p.id === Number(req.params.id));
  if (!pkg) return res.status(404).json({ error: 'Package not found.' });
  if (req.body.name !== undefined) pkg.name = clean(req.body.name);
  if (req.body.price !== undefined) pkg.price = Number(req.body.price);
  if (req.body.duration !== undefined) pkg.duration = Number(req.body.duration);
  if (req.body.features !== undefined) pkg.features = Array.isArray(req.body.features) ? req.body.features.map(clean).filter(Boolean) : clean(req.body.features).split(',').map(x => x.trim()).filter(Boolean);
  saveDB();
  res.json({ success: true, package: pkg });
});

app.delete('/api/packages/:id', requireStaff(['admin']), (req, res) => {
  const id = Number(req.params.id);
  const used = db.clients.some(c => c.package_name === db.packages.find(p => p.id === id)?.name);
  if (used) return res.status(400).json({ error: 'This package is already used by a client. Edit it instead of deleting it.' });
  const before = db.packages.length;
  db.packages = db.packages.filter(p => p.id !== id);
  if (db.packages.length === before) return res.status(404).json({ error: 'Package not found.' });
  saveDB();
  res.json({ success: true });
});

app.get('/api/employees', requireStaff(['admin']), (req, res) => res.json(db.employees));

app.post('/api/employees', requireStaff(['admin']), (req, res) => {
  const { name, phone, position, username, status } = req.body;
  if (!clean(name) || !clean(position)) return res.status(400).json({ error: 'Name and position are required.' });
  if (username && db.users.some(u => u.username === clean(username))) return res.status(400).json({ error: 'Username already exists.' });
  const employee = { id: db.nextEmployeeId++, employee_id: `BJ-EMP-${String(db.nextEmployeeId - 1).padStart(3, '0')}`, name: clean(name), phone: clean(phone), position: clean(position), username: clean(username), status: clean(status) || 'Active' };
  db.employees.push(employee);
  if (employee.username && req.body.password) db.users.push({ id: Date.now(), username: employee.username, password: clean(req.body.password), role: employee.position.toLowerCase() === 'admin' ? 'admin' : 'registrar' });
  saveDB();
  res.json({ success: true, employee });
});

app.patch('/api/employees/:id', requireStaff(['admin']), (req, res) => {
  const employee = db.employees.find(e => e.id === Number(req.params.id));
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  ['name','phone','position','status'].forEach(k => { if (req.body[k] !== undefined) employee[k] = clean(req.body[k]); });
  saveDB();
  res.json({ success: true, employee });
});

app.delete('/api/employees/:id', requireStaff(['admin']), (req, res) => {
  const id = Number(req.params.id);
  const employee = db.employees.find(e => e.id === id);
  if (!employee) return res.status(404).json({ error: 'Employee not found.' });
  if (employee.username === 'admin') return res.status(400).json({ error: 'The main admin account cannot be deleted.' });
  db.employees = db.employees.filter(e => e.id !== id);
  if (employee.username) db.users = db.users.filter(u => u.username !== employee.username);
  saveDB();
  res.json({ success: true });
});

// ---------- Payment accounts (Telebirr / CBE / bank / etc.) ----------
// Shown to customers on the Join page so they know where to send money.
app.get('/api/payment-accounts', (req, res) => res.json(db.paymentAccounts));

app.post('/api/payment-accounts', requireStaff(['admin']), (req, res) => {
  const { provider, account_number, account_name, note } = req.body;
  if (!clean(provider) || !clean(account_number)) return res.status(400).json({ error: 'Provider and account number are required.' });
  const account = { id: db.nextPaymentAccountId++, provider: clean(provider), account_number: clean(account_number), account_name: clean(account_name), note: clean(note) };
  db.paymentAccounts.push(account);
  saveDB();
  res.json({ success: true, account });
});

app.patch('/api/payment-accounts/:id', requireStaff(['admin']), (req, res) => {
  const account = db.paymentAccounts.find(a => a.id === Number(req.params.id));
  if (!account) return res.status(404).json({ error: 'Payment account not found.' });
  ['provider','account_number','account_name','note'].forEach(k => { if (req.body[k] !== undefined) account[k] = clean(req.body[k]); });
  saveDB();
  res.json({ success: true, account });
});

app.delete('/api/payment-accounts/:id', requireStaff(['admin']), (req, res) => {
  const id = Number(req.params.id);
  const before = db.paymentAccounts.length;
  db.paymentAccounts = db.paymentAccounts.filter(a => a.id !== id);
  if (db.paymentAccounts.length === before) return res.status(404).json({ error: 'Payment account not found.' });
  saveDB();
  res.json({ success: true });
});

function addMonths(date, months) {
  const d = new Date(date);
  const originalDay = d.getDate();
  d.setMonth(d.getMonth() + Number(months));
  if (d.getDate() !== originalDay) d.setDate(0);
  return d;
}

function membershipState(client) {
  // Locked = an online/cash signup that staff hasn't verified & unlocked yet.
  // Its membership clock has not started, so it never expires while locked.
  if (client.locked) {
    return { label: 'Locked - Pending Approval', color: 'gray', start_date: null, end_date: null };
  }
  const now = new Date();
  const start = new Date(client.start_date || client.registered_at);
  const end = new Date(client.end_date || addMonths(start, client.duration || 1));
  if (now >= end) return { label: 'Expired', color: 'red', start_date: start.toISOString(), end_date: end.toISOString() };
  const total = end - start;
  const elapsed = now - start;
  if (elapsed < total / 2) return { label: 'Active - First Half', color: 'green', start_date: start.toISOString(), end_date: end.toISOString() };
  return { label: 'Active - Second Half', color: 'yellow', start_date: start.toISOString(), end_date: end.toISOString() };
}

// ---------- Online / self-service registration ----------
// Every online signup starts LOCKED. Staff must verify the payment
// (screenshot for mobile-money/bank, or cash received in person) and hit
// Approve before the membership clock starts and the client counts as active.
app.post('/api/register', (req, res) => {
  const { full_name, phone, email, gender, age, address, fitness_goal, package_name, duration, client_photo, payment_receipt, payment_method, payment_provider } = req.body;
  if (!clean(full_name) || !clean(phone) || !clean(package_name) || !duration) return res.status(400).json({ error: 'Please complete the required fields.' });

  const method = clean(payment_method) === 'cash' ? 'cash' : 'online';
  if (method === 'online' && !clean(payment_receipt)) {
    return res.status(400).json({ error: 'A payment receipt screenshot is required for online payment.' });
  }

  const client = {
    id: db.nextClientId++,
    member_id: `BJ-${new Date().getFullYear()}-${String(db.nextClientId - 1).padStart(5, '0')}`,
    full_name: clean(full_name), phone: clean(phone), email: clean(email), gender: clean(gender), age: age ? Number(age) : null,
    address: clean(address), fitness_goal: clean(fitness_goal), package_name: clean(package_name), duration: Number(duration),
    source: 'online', registered_at: new Date().toISOString(),
    // start_date / end_date stay empty until an admin/registrar approves this client.
    start_date: '', end_date: '',
    client_photo: clean(client_photo),
    payment_method: method,
    payment_provider: clean(payment_provider),
    payment_receipt: clean(payment_receipt),
    payment_status: method === 'cash' ? 'Pending Cash Payment' : 'Receipt Submitted - Pending Verification',
    locked: true
  };
  db.clients.push(client); saveDB();
  const message = method === 'cash'
    ? 'Registration received. Please pay at the BJ Gym front desk to activate your membership.'
    : 'Registration submitted successfully. Your payment receipt is pending gym verification.';
  res.json({ success: true, id: client.id, member_id: client.member_id, message });
});

// Staff approves a pending online/cash registration: this unlocks the
// account and starts the membership clock from the moment of approval.
app.post('/api/clients/:id/approve', requireStaff(['admin', 'registrar']), (req, res) => {
  const client = db.clients.find(c => c.id === Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  if (!client.locked) return res.status(400).json({ error: 'This client is already active.' });
  const start = new Date();
  client.start_date = start.toISOString();
  client.end_date = addMonths(start, client.duration || 1).toISOString();
  client.locked = false;
  client.payment_status = client.payment_method === 'cash' ? 'Active - Cash Confirmed' : 'Active - Payment Verified';
  client.approved_by = req.staffUser.username;
  client.approved_at = start.toISOString();
  saveDB();
  res.json({ success: true, client: { ...client, membership: membershipState(client) } });
});

// Staff rejects a pending registration (e.g. fake/unclear screenshot).
// The client stays locked until they submit a new receipt or pay in person.
app.post('/api/clients/:id/reject', requireStaff(['admin', 'registrar']), (req, res) => {
  const client = db.clients.find(c => c.id === Number(req.params.id));
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  if (!client.locked) return res.status(400).json({ error: 'This client is already active.' });
  client.payment_status = 'Rejected - ' + (clean(req.body.reason) || 'Payment could not be verified');
  client.rejected_by = req.staffUser.username;
  client.rejected_at = new Date().toISOString();
  saveDB();
  res.json({ success: true, client: { ...client, membership: membershipState(client) } });
});

app.post('/api/reports', (req, res) => {
  const { client_name, phone, category, equipment, description } = req.body;
  if (!clean(category) || !clean(description)) return res.status(400).json({ error: 'Category and description are required.' });
  const report = {
    id: db.nextReportId++, client_name: clean(client_name), phone: clean(phone), category: clean(category),
    equipment: clean(equipment), description: clean(description), status: 'Pending', created_at: new Date().toISOString()
  };
  db.reports.push(report);
  saveDB();
  res.json({ success: true, id: report.id });
});

app.post('/api/login', (req, res) => {
  const username = clean(req.body.username);
  const password = clean(req.body.password);
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  res.json({ success: true, user: { username: user.username, role: user.role } });
});

app.get('/api/dashboard', (req, res) => {
  const total = db.clients.length;
  const active = db.clients.filter(c => membershipState(c).color !== 'red' && !c.locked).length;
  const pending = db.clients.filter(c => c.locked).length;
  const reports = db.reports.filter(r => r.status !== 'Resolved').length;
  const recent = [...db.clients].sort((a, b) => b.id - a.id).slice(0, 5);
  res.json({ total, active, pending, reports, recent });
});

app.get('/api/clients', (req, res) => {
  const q = clean(req.query.q).toLowerCase();
  let rows = [...db.clients].sort((a, b) => b.id - a.id);
  if (q) rows = rows.filter(c => [c.full_name, c.phone, c.package_name, c.member_id].some(v => clean(v).toLowerCase().includes(q)));
  res.json(rows.map(c => ({ ...c, membership: membershipState(c) })));
});

// Staff physical/cash-desk registration: the person is standing in front of
// staff and paying right now, so this creates an already-unlocked, active client.
app.post('/api/clients', requireStaff(['admin', 'registrar']), (req, res) => {
  const { full_name, phone, email, gender, age, address, fitness_goal, package_name, duration, client_photo } = req.body;
  if (!clean(full_name) || !clean(phone) || !clean(package_name) || !duration) return res.status(400).json({ error: 'Required information missing' });
  const months = Number(duration);
  if (!Number.isFinite(months) || months <= 0) return res.status(400).json({ error: 'Please enter a valid number of membership months.' });
  const start = new Date();
  const client = {
    id: db.nextClientId++, member_id: `BJ-${new Date().getFullYear()}-${String(db.nextClientId - 1).padStart(5, '0')}`,
    full_name: clean(full_name), phone: clean(phone), email: clean(email), gender: clean(gender), age: age ? Number(age) : null,
    address: clean(address), fitness_goal: clean(fitness_goal), package_name: clean(package_name), duration: months,
    source: 'physical', registered_at: start.toISOString(), start_date: start.toISOString(), end_date: addMonths(start, months).toISOString(),
    client_photo: clean(client_photo), payment_method: 'cash', payment_provider: '', payment_receipt: '',
    payment_status: 'Active - Paid at Front Desk', locked: false, approved_by: req.staffUser.username, approved_at: start.toISOString()
  };
  db.clients.push(client); saveDB(); res.json({ success: true, id: client.id, member_id: client.member_id });
});

app.get('/api/reports', requireStaff(['admin', 'registrar']), (req, res) => res.json([...db.reports].sort((a, b) => b.id - a.id)));

app.patch('/api/reports/:id', requireStaff(['admin', 'registrar']), (req, res) => {
  const report = db.reports.find(r => r.id === Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found' });
  const allowed = ['Pending', 'In Progress', 'Resolved'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
  report.status = req.body.status;
  saveDB();
  res.json({ success: true });
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`BJ Gym running at ${url}`);
  console.log(`Staff login: ${url}/admin/login.html`);
  // Double-click convenience: when running as the packaged desktop app,
  // open the site in the default browser automatically so nobody has to
  // type a URL or touch a command line. Skipped when hosted on a server
  // (set BJGYM_NO_BROWSER=1 to force this off, e.g. on Render/Railway).
  if (isPackaged && !process.env.BJGYM_NO_BROWSER) {
    const openCmd = process.platform === 'win32' ? `start ${url}`
      : process.platform === 'darwin' ? `open ${url}`
      : `xdg-open ${url}`;
    exec(openCmd, () => {});
  }
});
