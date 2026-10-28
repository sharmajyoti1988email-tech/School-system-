const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const router = express.Router();

// --- Middleware ---
const isAdmin = (req, res, next) => {
  if (req.session && req.session.admin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// --- Admin APIs ---
router.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminHash = process.env.ADMIN_PASSWORD_HASH;

  if (!adminHash) {
    return res.status(500).json({ error: 'System configuration error. ADMIN_PASSWORD_HASH missing.' });
  }

  if (username === adminUser) {
    const match = await bcrypt.compare(password, adminHash);
    if (match) {
      req.session.admin = true;
      return res.json({ success: true });
    }
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/api/stats', isAdmin, async (req, res) => {
  try {
    const [admissions, visits, contacts, notices] = await Promise.all([
      mongoose.model('Admission').countDocuments(),
      mongoose.model('Visit').countDocuments(),
      mongoose.model('Contact').countDocuments(),
      mongoose.model('Notice').countDocuments()
    ]);
    res.json({ admissions, visits, contacts, notices });
  } catch (err) { res.status(500).json({ error: 'Error fetching stats' }); }
});

router.get('/api/admissions', isAdmin, async (req, res) => {
  try {
    const data = await mongoose.model('Admission').find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

router.patch('/api/admissions/:id/status', isAdmin, async (req, res) => {
  try {
    await mongoose.model('Admission').findByIdAndUpdate(req.params.id, { status: req.body.status });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

router.get('/api/visits', isAdmin, async (req, res) => {
  try {
    const data = await mongoose.model('Visit').find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

router.patch('/api/visits/:id/status', isAdmin, async (req, res) => {
  try {
    await mongoose.model('Visit').findByIdAndUpdate(req.params.id, { status: req.body.status });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

router.get('/api/contacts', isAdmin, async (req, res) => {
  try {
    const data = await mongoose.model('Contact').find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

router.get('/api/notices', isAdmin, async (req, res) => {
  try {
    const data = await mongoose.model('Notice').find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

router.post('/api/notices', isAdmin, async (req, res) => {
  try {
    const Notice = mongoose.model('Notice');
    await new Notice(req.body).save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});

router.delete('/api/notices/:id', isAdmin, async (req, res) => {
  try {
    await mongoose.model('Notice').findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Error' }); }
});


// --- Admin UI Templates ---
const ADMIN_STYLES = `
  <style>
    :root {
      --bg: #f4f7f6; --text: #2d3748; --primary: #2c5e3b; --accent: #e76f51;
      --clay-bg: #ffffff;
      --clay-shadow: 8px 8px 16px rgba(44, 94, 59, 0.1), -8px -8px 16px rgba(255, 255, 255, 0.8);
      --clay-inset: inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.9);
    }
    * { box-sizing: border-box; font-family: 'Inter', 'Poppins', sans-serif; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); height: 100vh; display: flex; }
    .login-container { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
    .clay-card { background: var(--clay-bg); border-radius: 20px; box-shadow: var(--clay-shadow); padding: 30px; }
    .clay-input { width: 100%; padding: 12px; border: none; border-radius: 12px; box-shadow: var(--clay-inset); background: var(--bg); margin-bottom: 20px; outline: none; }
    .clay-btn { background: var(--primary); color: white; border: none; padding: 12px 24px; border-radius: 12px; cursor: pointer; width: 100%; box-shadow: 4px 4px 10px rgba(44,94,59,0.2); }
    .clay-btn:hover { opacity: 0.9; }
    
    /* Dashboard Layout */
    .sidebar { width: 250px; background: var(--primary); color: white; padding: 20px; display: flex; flex-direction: column; }
    .sidebar h2 { margin-bottom: 30px; font-size: 1.2rem; }
    .menu-item { padding: 12px 15px; margin-bottom: 10px; border-radius: 10px; cursor: pointer; transition: 0.3s; display: flex; align-items: center; gap: 10px; }
    .menu-item:hover, .menu-item.active { background: rgba(255,255,255,0.2); }
    .main-content { flex: 1; padding: 30px; overflow-y: auto; }
    
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { text-align: center; }
    .stat-card h3 { font-size: 2rem; color: var(--accent); }
    
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 15px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: rgba(0,0,0,0.02); }
    .badge { padding: 5px 10px; border-radius: 12px; font-size: 0.8rem; background: var(--bg); font-weight: bold; }
    .badge.submitted { color: #856404; background: #fff3cd; }
    .badge.approved { color: #155724; background: #d4edda; }
    .badge.rejected { color: #721c24; background: #f8d7da; }
    select.status-select { padding: 5px; border-radius: 5px; border: 1px solid #ccc; }
    .hidden { display: none; }
  </style>
`;

const LOGIN_HTML = `
<!DOCTYPE html>
<html>
<head><title>SKVN Admin Login</title>${ADMIN_STYLES}</head>
<body>
  <div class="login-container">
    <div class="clay-card" style="width: 400px; text-align: center;">
      <h2 style="color:var(--primary); margin-bottom: 20px;">SKVN Admin Area</h2>
      <form id="loginForm">
        <input type="text" id="username" class="clay-input" placeholder="Username" required>
        <input type="password" id="password" class="clay-input" placeholder="Password" required>
        <button type="submit" class="clay-btn">Secure Login</button>
        <p id="errorMsg" style="color:red; margin-top:15px; display:none;"></p>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await fetch('/admin/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.value, password: password.value })
      });
      if(res.ok) window.location.reload();
      else { document.getElementById('errorMsg').textContent = 'Invalid Credentials'; document.getElementById('errorMsg').style.display = 'block'; }
    });
  </script>
</body>
</html>
`;

const DASHBOARD_HTML = `
<!DOCTYPE html>
<html>
<head><title>SKVN Admin Dashboard</title>${ADMIN_STYLES}</head>
<body>
  <div class="sidebar">
    <h2>SKVN Admin</h2>
    <div class="menu-item active" onclick="showTab('dashboard')">📊 Dashboard</div>
    <div class="menu-item" onclick="showTab('admissions')">🎓 Admissions</div>
    <div class="menu-item" onclick="showTab('visits')">📅 Campus Visits</div>
    <div class="menu-item" onclick="showTab('contacts')">✉️ Enquiries</div>
    <div class="menu-item" onclick="showTab('notices')">📌 Notice Board</div>
    <div style="flex:1"></div>
    <div class="menu-item" onclick="logout()" style="background:#e76f51;">🚪 Logout</div>
  </div>

  <div class="main-content">
    <div id="tab-dashboard" class="tab-pane">
      <h2 style="margin-bottom:20px; color:var(--primary);">Dashboard Overview</h2>
      <div class="stats-grid">
        <div class="clay-card stat-card"><div id="stat-adm">0</div><p>Total Admissions</p></div>
        <div class="clay-card stat-card"><div id="stat-vis">0</div><p>Visit Requests</p></div>
        <div class="clay-card stat-card"><div id="stat-msg">0</div><p>Messages</p></div>
        <div class="clay-card stat-card"><div id="stat-not">0</div><p>Active Notices</p></div>
      </div>
    </div>

    <div id="tab-admissions" class="tab-pane hidden">
      <h2 style="color:var(--primary);">Admission Applications</h2>
      <div class="clay-card mt-4" style="overflow-x:auto;">
        <table>
          <thead><tr><th>Ref No</th><th>Date</th><th>Student</th><th>Class</th><th>Parent Mobile</th><th>Status</th><th>Action</th></tr></thead>
          <tbody id="tbl-admissions"></tbody>
        </table>
      </div>
    </div>

    <div id="tab-visits" class="tab-pane hidden">
      <h2 style="color:var(--primary);">Campus Visit Requests</h2>
      <div class="clay-card mt-4" style="overflow-x:auto;">
        <table>
          <thead><tr><th>Ref No</th><th>Visitor</th><th>Date</th><th>Count</th><th>Mobile</th><th>Status</th><th>Action</th></tr></thead>
          <tbody id="tbl-visits"></tbody>
        </table>
      </div>
    </div>

    <div id="tab-contacts" class="tab-pane hidden">
      <h2 style="color:var(--primary);">Contact Enquiries</h2>
      <div class="clay-card mt-4" style="overflow-x:auto;">
        <table>
          <thead><tr><th>Date</th><th>Name</th><th>Contact Info</th><th>Message</th></tr></thead>
          <tbody id="tbl-contacts"></tbody>
        </table>
      </div>
    </div>

    <div id="tab-notices" class="tab-pane hidden">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="color:var(--primary);">Notice Board Management</h2>
        <button class="clay-btn" style="width:auto;" onclick="document.getElementById('noticeFormCard').classList.toggle('hidden')">+ New Notice</button>
      </div>
      
      <div class="clay-card hidden" id="noticeFormCard" style="margin: 20px 0;">
        <form id="noticeForm" style="display:flex; flex-direction:column; gap:10px;">
          <input type="text" id="nTitle" class="clay-input" placeholder="Notice Title" required>
          <input type="text" id="nCat" class="clay-input" placeholder="Category (e.g. Events, Academic)">
          <textarea id="nDesc" class="clay-input" placeholder="Description" rows="3" required></textarea>
          <button type="submit" class="clay-btn" style="width:200px;">Publish Notice</button>
        </form>
      </div>

      <div class="clay-card mt-4" style="overflow-x:auto;">
        <table>
          <thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Action</th></tr></thead>
          <tbody id="tbl-notices"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    // Navigation
    function showTab(tabId) {
      document.querySelectorAll('.tab-pane').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + tabId).classList.remove('hidden');
      event.currentTarget.classList.add('active');
      if(tabId === 'dashboard') loadStats();
      else if(tabId === 'admissions') loadAdmissions();
      else if(tabId === 'visits') loadVisits();
      else if(tabId === 'contacts') loadContacts();
      else if(tabId === 'notices') loadNotices();
    }

    // Data Loaders
    async function loadStats() {
      const res = await fetch('/admin/api/stats');
      const data = await res.json();
      document.getElementById('stat-adm').textContent = data.admissions;
      document.getElementById('stat-vis').textContent = data.visits;
      document.getElementById('stat-msg').textContent = data.contacts;
      document.getElementById('stat-not').textContent = data.notices;
    }

    async function loadAdmissions() {
      const res = await fetch('/admin/api/admissions');
      const data = await res.json();
      document.getElementById('tbl-admissions').innerHTML = data.map(d => \`
        <tr>
          <td>\${d.refNo}</td>
          <td>\${new Date(d.createdAt).toLocaleDateString()}</td>
          <td>\${d.studentName}</td>
          <td>\${d.appliedClass}</td>
          <td>\${d.mobile}</td>
          <td><span class="badge \${d.status}">\${d.status.replace('_', ' ')}</span></td>
          <td>
            <select class="status-select" onchange="updateStatus('admissions', '\${d._id}', this.value)">
              <option disabled selected>Update</option>
              <option value="under_review">Review</option>
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
            </select>
          </td>
        </tr>
      \`).join('');
    }

    async function loadVisits() {
      const res = await fetch('/admin/api/visits');
      const data = await res.json();
      document.getElementById('tbl-visits').innerHTML = data.map(d => \`
        <tr>
          <td>\${d.refNo}</td>
          <td>\${d.visitorName}</td>
          <td>\${d.visitDate} \${d.visitTime ? d.visitTime : ''}</td>
          <td>\${d.visitorsCount}</td>
          <td>\${d.mobile}</td>
          <td><span class="badge \${d.status}">\${d.status}</span></td>
          <td>
             <select class="status-select" onchange="updateStatus('visits', '\${d._id}', this.value)">
              <option disabled selected>Update</option>
              <option value="approved">Approve</option>
              <option value="completed">Complete</option>
              <option value="declined">Decline</option>
            </select>
          </td>
        </tr>
      \`).join('');
    }

    async function loadContacts() {
      const res = await fetch('/admin/api/contacts');
      const data = await res.json();
      document.getElementById('tbl-contacts').innerHTML = data.map(d => \`
        <tr>
          <td>\${new Date(d.createdAt).toLocaleDateString()}</td>
          <td>\${d.name}</td>
          <td>\${d.contactDetails}</td>
          <td>\${d.message}</td>
        </tr>
      \`).join('');
    }

    async function loadNotices() {
      const res = await fetch('/admin/api/notices');
      const data = await res.json();
      document.getElementById('tbl-notices').innerHTML = data.map(d => \`
        <tr>
          <td>\${new Date(d.createdAt).toLocaleDateString()}</td>
          <td>\${d.title}</td>
          <td>\${d.category || '-'}</td>
          <td><button onclick="deleteNotice('\${d._id}')" style="color:red; background:none; border:none; cursor:pointer;">Delete</button></td>
        </tr>
      \`).join('');
    }

    // Actions
    async function updateStatus(entity, id, status) {
      if(!confirm('Change status?')) return;
      await fetch(\`/admin/api/\${entity}/\${id}/status\`, {
        method: 'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({status})
      });
      if(entity === 'admissions') loadAdmissions();
      else loadVisits();
    }

    document.getElementById('noticeForm').addEventListener('submit', async(e) => {
      e.preventDefault();
      await fetch('/admin/api/notices', {
        method: 'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ title: document.getElementById('nTitle').value, description: document.getElementById('nDesc').value, category: document.getElementById('nCat').value })
      });
      document.getElementById('noticeForm').reset();
      document.getElementById('noticeFormCard').classList.add('hidden');
      loadNotices();
    });

    async function deleteNotice(id) {
      if(!confirm('Delete this notice?')) return;
      await fetch('/admin/api/notices/'+id, { method: 'DELETE' });
      loadNotices();
    }

    async function logout() {
      await fetch('/admin/api/logout', { method: 'POST' });
      window.location.reload();
    }

    // Init
    loadStats();
  </script>
</body>
</html>
`;

router.get('/', (req, res) => {
  if (req.session && req.session.admin) {
    res.send(DASHBOARD_HTML);
  } else {
    res.send(LOGIN_HTML);
  }
});

module.exports = router;
