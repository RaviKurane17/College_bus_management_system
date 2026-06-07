// --- Common helpers (Production-Level with JWT Auth) ---
function getAuthToken() {
  return localStorage.getItem('authToken');
}

async function apiFetch(path, options = {}) {
  // Auto-include JWT token in all requests
  const token = getAuthToken();
  if (token) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(path, options);

    // Handle 401 Unauthorized - token expired or invalid
    if (res.status === 401) {
      // Don't redirect if we're on login page or reset pages
      const currentPage = window.location.pathname;
      if (!currentPage.includes('login') && !currentPage.includes('reset') && !currentPage.includes('forgot')) {
        localStorage.clear();
        window.location.href = '/login.html';
        return { success: false, message: 'Session expired. Please login again.' };
      }
    }

    // Handle 429 Too Many Requests (rate limited)
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || 'Too many requests. Please wait and try again.');
      return { success: false, message: 'Rate limited' };
    }

    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return res.json();
    } else {
      return res.text();
    }
  } catch (error) {
    console.error('API request failed:', error);
    return { success: false, message: 'Network error. Please check your connection.' };
  }
}

function requireLogin() {
  const token = localStorage.getItem('authToken');
  const role = localStorage.getItem('loggedIn');
  if (!token || !role) {
    localStorage.clear();
    window.location.href = '/login.html';
  }
}

// --- MAIN APP LOGIC ---
document.addEventListener('DOMContentLoaded', async () => {
  // Show/hide forgot password links based on role selection (student vs admin)
  const roleSelect = document.getElementById('role');
  const forgotLink = document.getElementById('forgotLink');
  const adminForgotLink = document.getElementById('adminForgotLink');
  if (roleSelect) {
    const updateForgotLinks = () => {
      const role = roleSelect.value;
      if (forgotLink) forgotLink.style.display = role === 'student' ? 'block' : 'none';
      if (adminForgotLink) adminForgotLink.style.display = role === 'admin' ? 'block' : 'none';
    };
    roleSelect.addEventListener('change', updateForgotLinks);
    // Set initial state
    updateForgotLinks();
  }

  // Password Reset Form
  const resetForm = document.getElementById('resetForm');
  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resetMsg = document.getElementById('resetMsg');
      resetMsg.textContent = '⏳ Processing...';

      try {
        const roll_no = document.getElementById('roll_no').value.trim();
        const department = document.getElementById('department').value.trim();

        const res = await apiFetch('/api/students/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roll_no, department })
        });

        if (res.success) {
          resetMsg.innerHTML = `
            ✅ Password reset successful!<br>
            Your username: <strong>${res.data.username}</strong><br>
            Your new password: <strong>${res.data.newPassword}</strong><br>
            <small>Please save these credentials and <a href="/">login</a> with them.</small>
          `;
          resetForm.reset();
        } else {
          resetMsg.textContent = `❌ ${res.message || 'Failed to reset password'}`;
        }
      } catch (error) {
        console.error('Password reset error:', error);
        resetMsg.textContent = '❌ Failed to process request. Please try again.';
      }
    });
  }

  // Admin Password Reset Form (Step 1)
  const adminResetForm = document.getElementById('adminResetForm');
  if (adminResetForm) {
    adminResetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('adminResetMsg');
      const email = document.getElementById('admin_email').value.trim();

      msgEl.textContent = '⏳ Sending reset code...';

      try {
        const res = await apiFetch('/api/admin/request-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        if (res.success) {
          msgEl.textContent = '✅ ' + (res.message || 'Reset code sent to your email.');
          adminResetForm.style.display = 'none';
          document.getElementById('adminResetTokenForm').style.display = 'block';
          window.adminResetEmail = email; // Store for step 2
        } else {
          msgEl.textContent = '❌ ' + (res.message || 'Error processing request.');
        }
      } catch (error) {
        msgEl.textContent = '❌ Network error. Please try again.';
      }
    });
  }

  // Admin Password Reset Form (Step 2)
  const adminResetTokenForm = document.getElementById('adminResetTokenForm');
  if (adminResetTokenForm) {
    adminResetTokenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById('adminResetMsg');
      const token = document.getElementById('reset_token').value.trim();
      const newPassword = document.getElementById('new_password').value.trim();
      const confirmPassword = document.getElementById('confirm_password').value.trim();
      const email = window.adminResetEmail || document.getElementById('admin_email').value.trim();

      if (newPassword !== confirmPassword) {
        msgEl.textContent = '❌ Passwords do not match.';
        return;
      }

      msgEl.textContent = '⏳ Resetting password...';

      try {
        const res = await apiFetch('/api/admin/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token, newPassword })
        });

        if (res.success) {
          msgEl.innerHTML = '✅ Password reset successfully! <br><a href="/" style="display:inline-block; margin-top:10px; padding:8px 16px; background:var(--primary-color, #ffb703); color:#fff; text-decoration:none; border-radius:8px;">Click here to login</a>';
          adminResetTokenForm.reset();
        } else {
          msgEl.textContent = '❌ ' + (res.message || 'Error resetting password.');
        }
      } catch (error) {
        msgEl.textContent = '❌ Network error. Please try again.';
      }
    });
  }

  // LOGIN PAGE (Admin + Student)
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();
      const roleSelect = document.getElementById('role');
      const role = roleSelect ? roleSelect.value : 'admin'; // fallback

      try {
        console.log('Attempting login with:', { username, role });
        const res = await apiFetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role })
        });
        console.log('Login response:', res);

        if (res.success) {
          // Store JWT token for authenticated requests
          if (res.token) {
            localStorage.setItem('authToken', res.token);
          }

          if (role === 'admin' || res.role === 'admin' || res.role === 'super_admin') {
            localStorage.setItem('loggedIn', res.role || 'admin');
            localStorage.setItem('adminRole', res.role || 'admin');
            window.location.href = '/dashboard.html';
          } else if (role === 'student') {
            localStorage.setItem('loggedIn', 'student');
            localStorage.setItem('studentUser', res.student.email || res.student.username);
            window.location.href = '/student_dashboard.html';
          }
        } else {
          alert(res.message || 'Invalid credentials');
        }
      } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
      }
    });
  }

  // LOGOUT
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      // Clear all auth data on logout
      localStorage.removeItem('authToken');
      localStorage.removeItem('loggedIn');
      localStorage.removeItem('studentUser');
      localStorage.clear();
      window.location.href = '/login.html';
    });
  }

  // --- ADMIN SIDE ---
  // Add Bus
  const busForm = document.getElementById('busForm');
  if (busForm) {
    requireLogin();
    populateDriverSelect();
    busForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bus_number = document.getElementById('bus_number').value.trim();
      const short_name = document.getElementById('short_name') ? document.getElementById('short_name').value.trim() : '';
      const driver_id = document.getElementById('driver_id').value;
      const capacity = parseInt(document.getElementById('capacity').value) || 0;
      const route = document.getElementById('route').value.trim();

      try {
        const msgEl = document.getElementById('msg');
        msgEl.textContent = '⏳ Adding bus...';

        if (!bus_number) {
          msgEl.textContent = '❌ Bus number is required';
          return;
        }

        const res = await apiFetch('/api/buses/add-bus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bus_number,
            short_name,
            driver_id: driver_id ? parseInt(driver_id) : null,
            capacity,
            route
          })
        });

        if (res.success) {
          msgEl.textContent = '✅ Bus added successfully!';
          busForm.reset();
        } else {
          msgEl.textContent = `❌ ${res.message || 'Error adding bus'}`;
        }
      } catch (error) {
        console.error('Error adding bus:', error);
        const msgEl = document.getElementById('msg');
        msgEl.textContent = '❌ Failed to add bus. Please try again.';
      }
    });
  }

  // Add Driver
  const driverForm = document.getElementById('driverForm');
  if (driverForm) {
    requireLogin();
    driverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('driver_name').value.trim();
      const phone = document.getElementById('driver_phone').value.trim();
      const license_number = document.getElementById('driver_license').value.trim();
      const address = document.getElementById('driver_address').value.trim();

      try {
        const msgEl = document.getElementById('dmsg');
        msgEl.textContent = '⏳ Adding driver...';

        const res = await apiFetch('/api/drivers/add-driver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, license_number, address })
        });

        if (res.success) {
          msgEl.textContent = '✅ Driver added successfully!';
          driverForm.reset();
        } else {
          msgEl.textContent = `❌ ${res.message || 'Error adding driver'}`;
        }
      } catch (error) {
        console.error('Error adding driver:', error);
        document.getElementById('dmsg').textContent = '❌ Failed to add driver. Please try again.';
      }
    });
  }

  // View Drivers
  const driversTable = document.getElementById('driversTable');
  if (driversTable) {
    requireLogin();
    loadDrivers();
  }

  // View Buses
  const busesTable = document.getElementById('busesTable');
  if (busesTable) {
    requireLogin();
    loadBuses();
  }

  // Add Student
  const studentForm = document.getElementById('studentForm');
  if (studentForm) {
    requireLogin();
    populateBusSelect();
    studentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const smsg = document.getElementById('smsg');
      smsg.textContent = '⏳ Adding student...';

      const email = document.getElementById('email').value.trim();
      const username = email; // Use email as username internally
      const password = document.getElementById('password').value.trim();
      const name = document.getElementById('name').value.trim();
      const roll_no = document.getElementById('roll_no').value.trim();
      const department = document.getElementById('department').value.trim();
      const course_year = document.getElementById('course_year')?.value.trim();
      const section = document.getElementById('section')?.value.trim();
      const bus_id = document.getElementById('bus_select').value || null;
      const concession = parseFloat(document.getElementById('concession')?.value) || 0;
      const concession_reason = document.getElementById('concession_reason')?.value.trim() || '';
      const fees_paid = parseFloat(document.getElementById('fees_paid').value) || 0;
      const remaining_fees = parseFloat(document.getElementById('remaining_fees').value) || 0;

      try {
        // Basic validation
        if (!name) {
          smsg.textContent = '❌ Please fill in Name';
          return;
        }

        // Email check (only if provided)
        if (email && !email.includes('@')) {
          smsg.textContent = '❌ Please enter a valid email address';
          return;
        }

        // Validate password length (only if provided)
        if (password && password.length < 6) {
          smsg.textContent = '❌ Password must be at least 6 characters long';
          return;
        }

        // Validate name format
        if (!/^[A-Za-z\s]+$/.test(name)) {
          smsg.textContent = '❌ Name can only contain letters and spaces';
          return;
        }

        // Validate roll number format (only if provided)
        if (roll_no && !/^[A-Za-z0-9-]+$/.test(roll_no)) {
          smsg.textContent = '❌ Roll number can only contain letters, numbers, and hyphens';
          return;
        }

        // Upload photo first if selected
        let photo_url = document.getElementById('photo_url')?.value || '';
        if (document.getElementById('photo')?.files?.length > 0) {
          smsg.textContent = '📸 Uploading photo...';
          photo_url = await uploadPhoto() || '';
        }

        // Fetch active payment cycle
        let payment_cycle = '';
        try {
          const sRes = await apiFetch('/api/settings');
          if (sRes.success && sRes.settings && sRes.settings.payment_cycle) {
            payment_cycle = sRes.settings.payment_cycle;
          }
        } catch (e) { console.warn('Could not fetch payment cycle', e); }

        const res = await apiFetch('/api/students/add-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password,
            name,
            roll_no,
            department: department || '',
            course_year: course_year || '',
            section: section || '',
            address: document.getElementById('address')?.value.trim() || '',
            phone: document.getElementById('phone')?.value.trim() || '',
            email: document.getElementById('email')?.value.trim() || '',
            photo_url: photo_url,
            pass_valid_from: document.getElementById('pass_valid_from')?.value || null,
            pass_valid_to: document.getElementById('pass_valid_to')?.value || null,
            bus_id: bus_id === '' ? null : parseInt(bus_id),
            total_fees: parseFloat(document.getElementById('total_fees')?.value) || 0,
            concession,
            concession_reason,
            payment_cycle,
            fees_paid: fees_paid || 0,
            remaining_fees: parseFloat(document.getElementById('remaining_fees')?.value) || 0
          })
        });

        if (res.success) {
          smsg.textContent = '✅ Student added successfully!';
          studentForm.reset();
          await populateBusSelect(); // Refresh bus list
        } else {
          smsg.textContent = `❌ ${res.message || 'Error adding student'}`;
        }
      } catch (error) {
        console.error('Error adding student:', error);
        const smsg = document.getElementById('smsg');
        smsg.textContent = '❌ Failed to add student. Please try again.';
      }
    });
  }

  // View Students
  const studentsTable = document.getElementById('studentsTable');
  if (studentsTable) {
    requireLogin();
    loadStudents();
  }

  // --- STUDENT SIDE ---
  const studentPage = document.getElementById('studentInfo');
  if (studentPage) {
    const username = localStorage.getItem('studentUser');
    if (!username) {
      window.location.href = '/login.html';
      return;
    }

    try {
      const res = await apiFetch(`/api/students/profile/${username}`);
      if (res && res.success) {
        const s = res.student || {};
        studentPage.innerHTML = `
          <div class="content-card" style="margin-bottom: 20px;">
            <h2 style="margin-top: 0;">Welcome, ${escapeHtml(s.name) || 'Student'} 👋</h2>
            <div class="info-grid">
              <div class="info-item">
                <p><b>Roll No:</b> ${escapeHtml(s.roll_no) || 'N/A'}</p>
                <p><b>Department:</b> ${escapeHtml(s.department) || 'N/A'}</p>
                <p><b>Year/Sec:</b> ${escapeHtml(s.course_year || '')} ${s.section ? 'Sec ' + escapeHtml(s.section) : ''}</p>
                <p><b>Joining Date:</b> ${formatDate(s.joining_date) || 'N/A'}</p>
              </div>
              <div class="info-item">
                <p><b>Bus No:</b> ${escapeHtml(s.bus_number) || 'Not Assigned'}</p>
                <p><b>Route:</b> ${escapeHtml(s.route) || 'N/A'}</p>
              </div>
              <div class="info-item fees">
                <p><b>Fees Paid:</b> ₹${parseFloat(s.fees_paid || 0).toFixed(2)}</p>
                <p><b>Remaining Fees:</b> ₹${parseFloat(s.remaining_fees || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        `;

        // Load payments
        const paymentsRes = await apiFetch(`/api/students/username/${username}/payments`);
        const paymentsTbody = document.querySelector('#paymentsTable tbody');
        if (paymentsTbody) {
          if (paymentsRes.success && paymentsRes.payments.length > 0) {
            paymentsTbody.innerHTML = paymentsRes.payments.map(p => `
              <tr>
                <td>${new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td style="color: var(--success); font-weight: bold;">₹${parseFloat(p.amount).toFixed(2)}</td>
                <td>${escapeHtml(p.payment_mode)}</td>
                <td>${escapeHtml(p.utr_number || '-')}</td>
              </tr>
            `).join('');
          } else {
            paymentsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--gray);">No payment history found.</td></tr>';
          }
        }
      } else {
        studentPage.innerHTML = '<div class="content-card"><p class="error-message">❌ Failed to load student data. Please try logging in again.</p></div>';
      }
    } catch (error) {
      console.error('Error loading student profile:', error);
      studentPage.innerHTML = '<p class="error-message">❌ Failed to load student data. Please try again later.</p>';
    }
  }
});

// --- Utility Functions ---
async function loadBuses() {
  try {
    const res = await apiFetch('/api/buses');
    const tbody = document.querySelector('#busesTable tbody');
    const cardsContainer = document.getElementById('busesCards');
    if (tbody) tbody.innerHTML = '';
    if (cardsContainer) cardsContainer.innerHTML = '';

    if (Array.isArray(res)) {
      const searchInput = document.getElementById('searchBus');
      const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

      const filteredBuses = res.filter(bus => {
        return (bus.bus_number && bus.bus_number.toLowerCase().includes(searchTerm)) ||
          (bus.driver_name && bus.driver_name.toLowerCase().includes(searchTerm)) ||
          (bus.route && bus.route.toLowerCase().includes(searchTerm));
      });

      let cardsHtml = '';

      filteredBuses.forEach(bus => {
        if (tbody) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${bus.id}</td>
            <td><a href="#" onclick="viewBusDetails(${bus.id}); return false;" style="color: var(--primary); font-weight: bold; text-decoration: none;">${escapeHtml(bus.bus_number)}</a></td>
            <td><span style="background:rgba(255,255,255,0.1);padding:4px 8px;border-radius:4px;font-weight:600;font-size:0.8rem;">${escapeHtml(bus.short_name || 'N/A')}</span></td>
            <td>${escapeHtml(bus.driver_name || 'N/A')}</td>
            <td>${bus.capacity || 0}</td>
            <td>${escapeHtml(bus.route || 'N/A')}</td>
            <td>
              <button onclick="editBus(${bus.id})" class="btn-table btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>
              <button onclick="deleteBus(${bus.id})" class="btn-table btn-del"><i class="fa-solid fa-trash"></i> Delete</button>
            </td>
          `;
          tbody.appendChild(tr);
        }

        cardsHtml += `
          <div class="bus-card">
            <div class="bc-header">
              <div class="bc-name">
                <i class="fa-solid fa-bus"></i>
                <a href="#" onclick="viewBusDetails(${bus.id}); return false;" style="color:inherit;text-decoration:none;">${escapeHtml(bus.bus_number)}</a>
              </div>
              <div class="bc-id">#${bus.id}</div>
            </div>
            <div class="bc-info-grid">
              <div class="bc-info-item">
                <span class="lbl">Short Name</span>
                <span class="val"><span style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-weight:600;">${escapeHtml(bus.short_name || 'N/A')}</span></span>
              </div>
              <div class="bc-info-item">
                <span class="lbl">Driver</span>
                <span class="val">${escapeHtml(bus.driver_name || 'N/A')}</span>
              </div>
              <div class="bc-info-item">
                <span class="lbl">Capacity</span>
                <span class="val">${bus.capacity || 0}</span>
              </div>
              <div class="bc-info-item">
                <span class="lbl">Route</span>
                <span class="val" style="grid-column: 1 / -1;">${escapeHtml(bus.route || 'N/A')}</span>
              </div>
            </div>
            <div class="bc-actions">
              <button onclick="editBus(${bus.id})" class="btn-table btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>
              <button onclick="deleteBus(${bus.id})" class="btn-table btn-del"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
          </div>
        `;
      });

      if (cardsContainer) cardsContainer.innerHTML = cardsHtml;

      if (filteredBuses.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="no-data" style="text-align:center;padding:20px;">No buses found</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center;padding:30px;color:var(--clr-muted);">No buses found</div>';
      }
    } else {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="error" style="text-align:center;padding:20px;">Error loading buses</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;">Error loading buses</div>';
    }
  } catch (error) {
    console.error('Error loading buses:', error);
    const tbody = document.querySelector('#busesTable tbody');
    const cardsContainer = document.getElementById('busesCards');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="error" style="text-align:center;padding:20px;">Failed to load buses. Please try again.</td></tr>';
    if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;">Failed to load buses.</div>';
  }
}

async function importDriversCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const text = e.target.result;
    const lines = text.split('\\n');
    if (lines.length < 2) {
      alert('File is empty or missing headers');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name');
    const phoneIdx = headers.findIndex(h => h.toLowerCase() === 'phone');
    const licenseIdx = headers.findIndex(h => h.toLowerCase().includes('license'));
    const addressIdx = headers.findIndex(h => h.toLowerCase() === 'address');

    if (nameIdx === -1 || phoneIdx === -1) {
      alert('CSV must contain at least "Name" and "Phone" columns.');
      return;
    }

    const drivers = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      drivers.push({
        name: cols[nameIdx] || '',
        phone: cols[phoneIdx] || '',
        license_number: licenseIdx !== -1 ? cols[licenseIdx] : '',
        address: addressIdx !== -1 ? cols[addressIdx] : ''
      });
    }

    if (drivers.length === 0) {
      alert('No data found to import');
      return;
    }

    try {
      const res = await apiFetch('/api/drivers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drivers })
      });

      if (res.success) {
        alert(res.message);
        loadDrivers();
      } else {
        alert(res.message || 'Error importing drivers');
      }
      if (res.errors && res.errors.length > 0) {
        console.error('Import Errors:', res.errors);
        alert('Some drivers failed to import. Check console for details.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to import drivers.');
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset input
}

async function importBusesCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const text = e.target.result;
    const lines = text.split('\n');
    if (lines.length < 2) {
      alert('File is empty or missing headers');
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const busNumberIdx = headers.findIndex(h => h.toLowerCase() === 'bus number');
    const shortNameIdx = headers.findIndex(h => h.toLowerCase() === 'short name');
    const driverNameIdx = headers.findIndex(h => h.toLowerCase() === 'driver name');
    const capacityIdx = headers.findIndex(h => h.toLowerCase() === 'capacity');
    const routeIdx = headers.findIndex(h => h.toLowerCase() === 'route');

    if (busNumberIdx === -1) {
      alert('CSV must contain at least "Bus Number" column.');
      return;
    }

    const buses = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      buses.push({
        bus_number: cols[busNumberIdx] || '',
        short_name: shortNameIdx !== -1 ? cols[shortNameIdx] : '',
        driver_name: driverNameIdx !== -1 ? cols[driverNameIdx] : '',
        capacity: capacityIdx !== -1 ? cols[capacityIdx] : '',
        route: routeIdx !== -1 ? cols[routeIdx] : ''
      });
    }

    if (buses.length === 0) {
      alert('No data found to import');
      return;
    }

    try {
      const res = await apiFetch('/api/buses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buses })
      });

      if (res.success) {
        alert(res.message);
        loadBuses();
      } else {
        alert(res.message || 'Error importing buses');
      }
      if (res.errors && res.errors.length > 0) {
        console.error('Import Errors:', res.errors);
        alert('Some buses failed to import. Check console for details.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to import buses.');
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset input
}

async function loadDrivers() {
  try {
    const res = await apiFetch('/api/drivers');
    const tbody = document.querySelector('#driversTable tbody');
    const cardsContainer = document.getElementById('driverCards');
    if (tbody) tbody.innerHTML = '';
    if (cardsContainer) cardsContainer.innerHTML = '';

    if (Array.isArray(res)) {
      const searchInput = document.getElementById('searchDriver');
      const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

      const filteredDrivers = res.filter(driver => {
        return (driver.name && driver.name.toLowerCase().includes(searchTerm)) ||
          (driver.phone && driver.phone.toLowerCase().includes(searchTerm)) ||
          (driver.license_number && driver.license_number.toLowerCase().includes(searchTerm));
      });

      let cardsHtml = '';

      filteredDrivers.forEach(d => {
        if (tbody) {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="color: var(--clr-text, inherit);">${d.id}</td>
            <td style="color: var(--clr-text, inherit); font-weight: 500;">${escapeHtml(d.name)}</td>
            <td style="color: var(--clr-muted, inherit);">${escapeHtml(d.phone)} ${d.phone ? `<a href="https://wa.me/91${d.phone.replace(/\D/g, '')}" target="_blank" title="WhatsApp" style="color: #25d366; margin-left: 5px;"><i class="fa-brands fa-whatsapp"></i></a>` : ''}</td>
            <td style="color: var(--clr-text, inherit);">${escapeHtml(d.license_number || 'N/A')}</td>
            <td style="color: var(--clr-muted, inherit); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(d.address || 'N/A')}</td>
            <td>
              <button onclick="editDriver(${d.id})" class="btn-table btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>
              <button onclick="deleteDriver(${d.id})" class="btn-table btn-del"><i class="fa-solid fa-trash"></i> Delete</button>
            </td>
          `;
          tbody.appendChild(tr);
        }

        cardsHtml += `
          <div class="driver-card">
            <div class="dc-header">
              <div class="dc-name">
                <i class="fa-solid fa-id-card"></i>
                <span>${escapeHtml(d.name)}</span>
              </div>
              <div class="dc-id">#${d.id}</div>
            </div>
            <div class="dc-info-grid">
              <div class="dc-info-item">
                <span class="lbl">Phone</span>
                <span class="val">${escapeHtml(d.phone)} ${d.phone ? `<a href="https://wa.me/91${d.phone.replace(/\D/g, '')}" target="_blank" title="WhatsApp" class="wa-link"><i class="fa-brands fa-whatsapp"></i></a>` : ''}</span>
              </div>
              <div class="dc-info-item">
                <span class="lbl">License</span>
                <span class="val">${escapeHtml(d.license_number || 'N/A')}</span>
              </div>
              <div class="dc-info-item">
                <span class="lbl">Address</span>
                <span class="val" style="grid-column: 1 / -1;">${escapeHtml(d.address || 'N/A')}</span>
              </div>
            </div>
            <div class="dc-actions">
              <button onclick="editDriver(${d.id})" class="btn-table btn-edit"><i class="fa-solid fa-pen"></i> Edit</button>
              <button onclick="deleteDriver(${d.id})" class="btn-table btn-del"><i class="fa-solid fa-trash"></i> Delete</button>
            </div>
          </div>
        `;
      });

      if (cardsContainer) cardsContainer.innerHTML = cardsHtml;

      if (filteredDrivers.length === 0) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="no-data" style="text-align:center;padding:20px;">No drivers found</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center;padding:30px;color:var(--clr-muted);">No drivers found</div>';
      }
    } else {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="error" style="text-align:center;padding:20px;">Error loading drivers</td></tr>';
      if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;">Error loading drivers</div>';
    }
  } catch (error) {
    console.error('Error loading drivers:', error);
    const tbody = document.querySelector('#driversTable tbody');
    const cardsContainer = document.getElementById('driverCards');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="error" style="text-align:center;padding:20px;">Failed to load drivers. Please try again.</td></tr>';
    if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center;padding:30px;color:#ef4444;">Failed to load drivers.</div>';
  }
}

async function exportDriversCSV() {
  try {
    const res = await apiFetch('/api/drivers');
    if (!Array.isArray(res)) {
      alert('Failed to fetch drivers data');
      return;
    }

    const headers = ['ID', 'Name', 'Phone', 'License Number', 'Address'];
    const csvRows = [headers.join(',')];

    res.forEach(d => {
      const row = [
        d.id,
        `"${(d.name || '').replace(/"/g, '""')}"`,
        `"${(d.phone || '').replace(/"/g, '""')}"`,
        `"${(d.license_number || '').replace(/"/g, '""')}"`,
        `"${(d.address || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "drivers_list.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error('Export error:', e);
    alert('Error exporting drivers list');
  }
}

async function deleteDriver(id) {
  if (confirm('Are you sure you want to delete this driver?')) {
    try {
      const res = await apiFetch(`/api/drivers/${id}`, { method: 'DELETE' });
      if (res.success) {
        alert('Driver deleted successfully');
        loadDrivers();
      } else {
        alert(res.message || 'Error deleting driver');
      }
    } catch (e) {
      alert('Error deleting driver');
    }
  }
}

async function editDriver(id) {
  try {
    const res = await apiFetch(`/api/drivers/get/${id}`);
    if (!res || !res.success) {
      alert('Failed to load driver data');
      return;
    }

    const d = res.driver;
    const content = `
      <div style="margin-bottom: 15px;">
        <label class="modal-label">Name</label>
        <input type="text" id="edit_d_name" value="${escapeHtml(d.name)}" class="modal-input">
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label">Phone</label>
        <input type="text" id="edit_d_phone" value="${escapeHtml(d.phone)}" class="modal-input">
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label">License No</label>
        <input type="text" id="edit_d_license" value="${escapeHtml(d.license_number || '')}" class="modal-input">
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label">Address</label>
        <textarea id="edit_d_address" rows="3" class="modal-input">${escapeHtml(d.address || '')}</textarea>
      </div>
    `;

    showModal(`Edit Driver: ${escapeHtml(d.name)}`, content, async () => {
      try {
        const updateRes = await apiFetch(`/api/drivers/update/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('edit_d_name').value.trim(),
            phone: document.getElementById('edit_d_phone').value.trim(),
            license_number: document.getElementById('edit_d_license').value.trim(),
            address: document.getElementById('edit_d_address').value.trim()
          })
        });

        if (updateRes.success) {
          alert('Driver updated successfully!');
          closeModal();
          loadDrivers();
        } else {
          alert(updateRes.message || 'Error updating driver');
        }
      } catch (e) {
        alert('Error updating driver.');
      }
    });

  } catch (error) {
    console.error('Error updating driver:', error);
    alert('Failed to load driver data. Please try again.');
  }
}

async function populateDriverSelect() {
  try {
    const res = await apiFetch('/api/drivers');
    const select = document.getElementById('driver_id');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Driver (optional) --</option>';
    if (Array.isArray(res)) {
      res.forEach(d => {
        const option = document.createElement('option');
        option.value = d.id;

        option.textContent = `${d.name} (${d.phone})`;
        select.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading drivers:', error);
  }
}

async function populateBusSelect() {
  try {
    const res = await apiFetch('/api/buses');
    const sel = document.getElementById('bus_select');
    sel.innerHTML = '<option value="">-- Select Bus (optional) --</option>';
    if (Array.isArray(res)) {
      res.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.text = `${b.bus_number}${b.short_name ? ' (' + b.short_name + ')' : ''} - ${b.route || 'No route'}`;
        sel.appendChild(opt);
      });
    }
  } catch (error) {
    console.error('Error loading buses for select:', error);
    const sel = document.getElementById('bus_select');
    sel.innerHTML = '<option value="">Error loading buses</option>';
  }
}

let studentSortCol = 'id';
let studentSortAsc = true;

window.setStudentSort = function (col) {
  if (studentSortCol === col) {
    studentSortAsc = !studentSortAsc;
  } else {
    studentSortCol = col;
    studentSortAsc = true;
  }

  // Update UI icons
  const headers = document.querySelectorAll('#studentsTable th');
  headers.forEach(th => {
    const icon = th.querySelector('i');
    if (icon) {
      if (th.getAttribute('onclick') && th.getAttribute('onclick').includes(`'${col}'`)) {
        icon.className = studentSortAsc ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
        icon.style.color = 'var(--primary, var(--clr-accent))';
      } else {
        icon.className = 'fa-solid fa-sort';
        icon.style.color = 'var(--clr-muted)';
      }
    }
  });

  loadStudents();
};

async function loadStudents() {
  try {
    const res = await apiFetch('/api/students');
    const tbody = document.querySelector('#studentsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    // Also clear mobile cards
    const cardsContainer = document.getElementById('studentCards');
    if (cardsContainer) cardsContainer.innerHTML = '';

    if (Array.isArray(res)) {
      const searchInput = document.getElementById('searchStudent');
      const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

      const filterClass = document.getElementById('filterClass');
      const filterBus = document.getElementById('filterBus');
      const filterPickup = document.getElementById('filterPickup');
      const filterStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : 'active';

      if (filterClass && filterClass.options.length <= 1) {
        const uniqueClasses = [...new Set(res.map(s => s.class_name).filter(Boolean))].sort();
        uniqueClasses.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c; opt.text = c;
          filterClass.appendChild(opt);
        });
      }

      if (filterBus && filterBus.options.length <= 1) {
        const uniqueBuses = [...new Set(res.map(s => s.bus_number).filter(Boolean))].sort();
        uniqueBuses.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b; opt.text = b;
          filterBus.appendChild(opt);
        });
      }

      if (filterPickup && filterPickup.options.length <= 1) {
        const uniquePickups = [...new Set(res.map(s => s.pick_up_point).filter(Boolean))].sort();
        uniquePickups.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p; opt.text = p;
          filterPickup.appendChild(opt);
        });
      }

      const classValue = filterClass ? filterClass.value : '';
      const busValue = filterBus ? filterBus.value : '';
      const pickupValue = filterPickup ? filterPickup.value : '';

      const filteredStudents = res.filter(s => {
        const name = s.name || '';
        const cls = s.class_name || '';
        const bus = s.bus_number || '';
        const pickup = s.pick_up_point || '';
        const stat = s.student_status || 'active';

        const matchesSearch = name.toLowerCase().includes(searchTerm) || cls.toLowerCase().includes(searchTerm);
        const matchesClass = classValue === '' || cls === classValue;
        const matchesBus = busValue === '' || bus === busValue;
        const matchesPickup = pickupValue === '' || pickup === pickupValue;

        let matchesStatus = true;
        if (filterStatus === 'active') matchesStatus = (stat === 'active');
        if (filterStatus === 'passout') matchesStatus = (stat === 'passout' || stat === 'school_left');

        return matchesSearch && matchesClass && matchesBus && matchesPickup && matchesStatus;
      });

      // Sort students dynamically based on selected column
      filteredStudents.sort((a, b) => {
        let valA = a[studentSortCol] !== undefined && a[studentSortCol] !== null ? a[studentSortCol] : '';
        let valB = b[studentSortCol] !== undefined && b[studentSortCol] !== null ? b[studentSortCol] : '';

        // Handle numeric fields
        const numericFields = ['old_bus_fees', 'current_fees', 'total_fees', 'discount_amount', 'fees_paid', 'remaining_fees', 'id'];
        if (numericFields.includes(studentSortCol)) {
          valA = parseFloat(valA) || 0;
          valB = parseFloat(valB) || 0;
          return studentSortAsc ? valA - valB : valB - valA;
        }

        // String fields (including bus_number which might have mix of numbers/letters)
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();

        if (studentSortAsc) {
          return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        } else {
          return valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
        }
      });

      window.currentFilteredStudents = filteredStudents;

      // Calculate aggregate totals
      let aggTotalFees = 0;
      let aggPaidFees = 0;
      let aggRemainingFees = 0;

      filteredStudents.forEach((s, index) => {
        const total = parseFloat(s.total_fees || 0);
        const paid = parseFloat(s.fees_paid || 0);
        const rem = parseFloat(s.remaining_fees || 0);

        aggTotalFees += total;
        aggPaidFees += paid;
        aggRemainingFees += rem;

        const isOverdue = rem > 0;

        // ── Desktop table row ──
        const tr = document.createElement('tr');
        if (isOverdue) tr.style.borderLeft = '3px solid var(--error)';
        tr.innerHTML = `
          <td>${index + 1}</td>
          <td>
            <a href="#" onclick="viewStudentDetails(${s.id}); return false;" style="color: var(--primary, var(--clr-accent)); font-weight: 700; text-decoration: none; display: flex; align-items: center; gap: 10px;">
              <i class="fa-solid fa-user-graduate" style="color:var(--clr-muted,var(--gray));font-size:0.9rem;"></i>
              <div>
                ${escapeHtml(s.name)}
              </div>
            </a>
          </td>
          <td><span style="padding: 4px 10px; background: var(--clr-border, rgba(255,255,255,0.08)); border-radius: 6px; font-size: 0.8rem; color: var(--clr-text, #e2e8f0); border: 1px solid var(--clr-border-strong, rgba(255,255,255,0.05));">${escapeHtml(s.class_name || 'N/A')}</span></td>
          <td><i class="fa-solid fa-bus-simple" style="font-size: 0.85rem; color: var(--primary, var(--clr-accent)); opacity: 0.7;"></i> <span style="color: var(--clr-text, inherit);">${escapeHtml(s.bus_number || 'None')} ${s.short_name ? '<span style="font-size:0.75rem;opacity:0.8;">(' + escapeHtml(s.short_name) + ')</span>' : ''}</span></td>
          <td style="font-size: 0.85rem; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--clr-muted, var(--gray));">${escapeHtml(s.pick_up_point || 'N/A')}</td>
          <td style="font-weight: 600; color: var(--clr-muted, var(--gray));">₹${parseFloat(s.old_bus_fees || 0).toLocaleString()}</td>
          <td style="font-weight: 600; color: var(--clr-muted, var(--gray));">₹${parseFloat(s.current_fees || 0).toLocaleString()}</td>
          <td style="font-weight: 600; color: var(--clr-text, #f8fafc);">₹${parseFloat(s.total_fees || 0).toLocaleString()}</td>
          <td style="font-weight: 600; color: var(--clr-muted, var(--gray));">₹${parseFloat(s.discount_amount || 0).toLocaleString()}</td>
          <td style="font-weight: 600; color: var(--clr-text, #f8fafc);">₹${parseFloat(s.fees_paid || 0).toLocaleString()}</td>
          <td style="color: ${isOverdue ? 'var(--clr-red, var(--error))' : 'var(--clr-green, var(--success))'}; font-weight: ${isOverdue ? '700' : '600'};">
            ₹${parseFloat(s.remaining_fees || 0).toLocaleString()}
            ${isOverdue ? ' <i class="fa-solid fa-triangle-exclamation" style="font-size: 0.8rem; margin-left: 4px;"></i>' : ''}
          </td>
          <td style="white-space: nowrap;">
            <button onclick="payFees(${s.id})" class="btn-pay" style="display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:6px;border:none;background:linear-gradient(135deg,var(--clr-green, var(--success)),#059669);color:#fff;font-weight:700;font-size:0.78rem;cursor:pointer;"><i class="fa-solid fa-indian-rupee-sign"></i> Pay</button>
            <button onclick="deleteStudent(${s.id})" style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#ef4444;cursor:pointer;margin-left:5px;" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </td>
        `;
        tbody.appendChild(tr);

        // ── Mobile card ──
        const cardsContainer = document.getElementById('studentCards');
        if (cardsContainer) {
          const card = document.createElement('div');
          card.className = 'student-card' + (isOverdue ? ' overdue' : '');
          card.innerHTML = `
            <a href="#" onclick="viewStudentDetails(${s.id}); return false;" style="text-decoration:none;">
              <div class="sc-name">${escapeHtml(s.name)}</div>
              <div class="sc-roll">Sr No. ${index + 1}</div>
            </a>
            <div class="sc-dept">${escapeHtml(s.class_name || 'N/A')}</div>
            <div class="sc-row">
              <div>
                <div class="sc-label">Bus No</div>
                <div class="sc-val"><i class="fa-solid fa-bus-simple" style="font-size:0.8rem;opacity:0.7;margin-right:4px;"></i>${escapeHtml(s.bus_number || 'None')}</div>
              </div>
              <div>
                <div class="sc-label">Pick-up</div>
                <div class="sc-val" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(s.pick_up_point || 'N/A')}</div>
              </div>
            </div>
            <div class="sc-fees-row">
              <div class="sc-fee-box">
                <div class="sc-fee-label">Total</div>
                <div class="sc-fee-val" style="color:#cbd5e1;">₹${parseFloat(s.total_fees || 0).toLocaleString()}</div>
              </div>
              <div class="sc-fee-box">
                <div class="sc-fee-label">Discount</div>
                <div class="sc-fee-val" style="color:var(--clr-muted);">₹${parseFloat(s.discount_amount || 0).toLocaleString()}</div>
              </div>
              <div class="sc-fee-box">
                <div class="sc-fee-label">Paid</div>
                <div class="sc-fee-val" style="color:#34d399;">₹${parseFloat(s.fees_paid || 0).toLocaleString()}</div>
              </div>
              <div class="sc-fee-box">
                <div class="sc-fee-label">Due</div>
                <div class="sc-fee-val" style="color:${isOverdue ? '#f87171' : '#34d399'};">
                  ₹${parseFloat(s.remaining_fees || 0).toLocaleString()}
                  ${isOverdue ? '<i class="fa-solid fa-triangle-exclamation" style="font-size:0.7rem;margin-left:3px;"></i>' : ''}
                </div>
              </div>
            </div>
            <div class="sc-actions">
              <button onclick="payFees(${s.id})" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;"><i class="fa-solid fa-indian-rupee-sign"></i> Pay</button>
              <button onclick="deleteStudent(${s.id})" style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);flex:0 0 45px;display:flex;justify-content:center;align-items:center;"><i class="fa-solid fa-trash"></i></button>
            </div>
          `;
          if (cardsContainer) cardsContainer.appendChild(card);
        }
      });

      // Update and show footer
      const tfoot = document.getElementById('tableFooter');
      if (tfoot) {
        if (filteredStudents.length > 0) {
          tfoot.style.display = 'table-footer-group';
          document.getElementById('footTotalFees').innerText = '₹' + aggTotalFees.toLocaleString('en-IN');
          document.getElementById('footPaidFees').innerText = '₹' + aggPaidFees.toLocaleString('en-IN');
          document.getElementById('footRemainingFees').innerText = '₹' + aggRemainingFees.toLocaleString('en-IN');
        } else {
          tfoot.style.display = 'none';
        }
      }

      if (filteredStudents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="no-data">No students found</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<p style="text-align:center;padding:20px;color:var(--clr-muted);">No students found</p>';
      }
    } else {
      tbody.innerHTML = '<tr><td colspan="8" class="error">Error loading students</td></tr>';
    }
  } catch (error) {
    console.error('Error loading students:', error);
    const tbody = document.querySelector('#studentsTable tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="error">Failed to load students. Please try again.</td></tr>';
  }
}

// Helper function to format dates
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'N/A';
  }
}

// Helper function to escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Delete bus function
async function deleteBus(id) {
  if (!confirm('Are you sure you want to delete this bus?')) return;

  try {
    const res = await apiFetch(`/api/buses/${id}`, { method: 'DELETE' });
    if (res.success) {
      alert('Bus deleted successfully');
      loadBuses();
    } else {
      alert(res.message || 'Failed to delete bus');
    }
  } catch (error) {
    console.error('Error deleting bus:', error);
    alert('Failed to delete bus. Please try again.');
  }
}

// Delete student function
async function deleteStudent(id) {
  if (!confirm('Are you sure you want to delete this student?')) return;

  try {
    const res = await apiFetch(`/api/students/${id}`, { method: 'DELETE' });
    if (res.success) {
      alert('Student deleted successfully');
      loadStudents();
    } else {
      alert(res.message || 'Failed to delete student');
    }
  } catch (error) {
    console.error('Error deleting student:', error);
    alert('Failed to delete student. Please try again.');
  }
}

// Modal Helper
function showModal(title, htmlContent, onSave) {
  // Remove existing if any
  const existing = document.getElementById('dynamicModal');
  if (existing) existing.remove();

  const modalHtml = `
    <div class="modal-overlay" id="dynamicModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">
          ${htmlContent}
        </div>
        <div class="modal-footer" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
          <button class="secondary" onclick="closeModal()">Cancel</button>
          <button id="modalSaveBtn">Save Changes</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  const modal = document.getElementById('dynamicModal');
  setTimeout(() => modal.classList.add('active'), 10);

  document.getElementById('modalSaveBtn').onclick = () => {
    onSave();
  };
}

function closeModal() {
  const modal = document.getElementById('dynamicModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
}

// Edit bus function
async function editBus(id) {
  try {
    const res = await apiFetch(`/api/buses/get/${id}`);
    if (!res || !res.success) {
      alert('Failed to load bus data');
      return;
    }

    const b = res.bus;

    // Fetch drivers for the dropdown
    const driversRes = await apiFetch('/api/drivers');
    let driverOptions = '';
    if (Array.isArray(driversRes)) {
      driverOptions = driversRes.map(d =>
        `<option value="${d.id}" ${b.driver_id === d.id ? 'selected' : ''}>${escapeHtml(d.name)} (${escapeHtml(d.phone)})</option>`
      ).join('');
    }

    const content = `
      <div style="margin-bottom: 15px;">
        <label class="modal-label">Bus Number</label>
        <input type="text" id="edit_bus_number" value="${escapeHtml(b.bus_number)}" class="modal-input">
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label">Short Bus Name</label>
        <input type="text" id="edit_short_name" value="${escapeHtml(b.short_name || '')}" class="modal-input">
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label">Assign Driver</label>
        <select id="edit_driver_id" class="modal-input">
          <option value="">-- No Driver Assigned --</option>
          ${driverOptions}
        </select>
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label">Capacity</label>
        <input type="number" id="edit_capacity" value="${b.capacity || 0}" class="modal-input">
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label">Route</label>
        <input type="text" id="edit_route" value="${escapeHtml(b.route || '')}" class="modal-input">
      </div>
    `;

    showModal('Edit Bus Data', content, async () => {
      const updateData = {
        bus_number: document.getElementById('edit_bus_number').value.trim(),
        short_name: document.getElementById('edit_short_name').value.trim(),
        driver_id: document.getElementById('edit_driver_id').value || null,
        capacity: parseInt(document.getElementById('edit_capacity').value) || 0,
        route: document.getElementById('edit_route').value.trim()
      };

      if (!updateData.bus_number) {
        alert('Bus number is required');
        return;
      }

      try {
        const res2 = await apiFetch(`/api/buses/update/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });

        if (res2.success) {
          alert('Bus updated successfully');
          closeModal();
          loadBuses();
        } else {
          alert(res2.message || 'Failed to update bus');
        }
      } catch (e) {
        alert('Error updating bus.');
      }
    });

  } catch (error) {
    console.error('Error loading bus:', error);
    alert('Failed to load bus. Please try again.');
  }
}

// Helper function for edit student modal
window.calcEditRemaining = function () {
  const t = parseFloat(document.getElementById('edit_total_fees').value) || 0;
  const c = parseFloat(document.getElementById('edit_concession').value) || 0;
  const p = parseFloat(document.getElementById('edit_fees_paid').value) || 0;
  const r = t - c - p;
  document.getElementById('edit_remaining_fees').value = r > 0 ? r : 0;
};

// Edit student function
async function editStudent(id) {
  try {
    const res = await apiFetch(`/api/students/get/${id}`);
    if (!res || !res.success) {
      alert('Failed to load student data');
      return;
    }

    const s = res.student;

    // Fetch buses for the dropdown
    const busesRes = await apiFetch('/api/buses');
    let busOptions = '<option value="">-- No Bus --</option>';
    if (Array.isArray(busesRes)) {
      busesRes.forEach(b => {
        const selected = (s.bus_id === b.id) ? 'selected' : '';
        busOptions += `<option value="${b.id}" ${selected}>${b.bus_number}${b.short_name ? ' (' + b.short_name + ')' : ''} - ${b.route || ''}</option>`;
      });
    }

    const content = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
        <div>
          <label class="modal-label">Name</label>
          <input type="text" id="edit_name" value="${escapeHtml(s.name)}" class="modal-input">
        </div>
        <div>
          <label class="modal-label">Roll No</label>
          <input type="text" id="edit_roll_no" value="${escapeHtml(s.roll_no)}" class="modal-input">
        </div>
      </div>
      <div style="margin-top: 15px;">
        <label class="modal-label">Department</label>
        <select id="edit_department" class="modal-input">
          <option value="">-- Select Dept --</option>
          <optgroup label="College Degree">
            <option value="Degree - CSE" ${s.department === 'Degree - CSE' || s.department === 'CSE' ? 'selected' : ''}>Computer Science (CSE)</option>
            <option value="Degree - IT" ${s.department === 'Degree - IT' || s.department === 'IT' ? 'selected' : ''}>Information Technology (IT)</option>
            <option value="Degree - ECE" ${s.department === 'Degree - ECE' || s.department === 'ECE' ? 'selected' : ''}>Electronics (ECE)</option>
            <option value="Degree - MECH" ${s.department === 'Degree - MECH' || s.department === 'MECH' ? 'selected' : ''}>Mechanical (MECH)</option>
            <option value="Degree - CIVIL" ${s.department === 'Degree - CIVIL' || s.department === 'CIVIL' ? 'selected' : ''}>Civil (CIVIL)</option>
            <option value="Degree - AIML" ${s.department === 'Degree - AIML' ? 'selected' : ''}>AI & ML (AIML)</option>
            <option value="Degree - ELECTRICAL" ${s.department === 'Degree - ELECTRICAL' ? 'selected' : ''}>Electrical</option>
            <option value="Degree - MBA" ${s.department === 'Degree - MBA' ? 'selected' : ''}>MBA</option>
            <option value="Degree - BFA" ${s.department === 'Degree - BFA' ? 'selected' : ''}>BFA</option>
          </optgroup>
          <optgroup label="Polytechnic">
            <option value="Poly - CSE" ${s.department === 'Poly - CSE' ? 'selected' : ''}>Computer Science</option>
            <option value="Poly - CIVIL" ${s.department === 'Poly - CIVIL' ? 'selected' : ''}>Civil</option>
            <option value="Poly - MECH" ${s.department === 'Poly - MECH' ? 'selected' : ''}>Mechanical</option>
            <option value="Poly - ELECTRICAL" ${s.department === 'Poly - ELECTRICAL' ? 'selected' : ''}>Electrical</option>
          </optgroup>
          <optgroup label="Junior College (PUC)">
            <option value="PUC - Science" ${s.department === 'PUC - Science' ? 'selected' : ''}>Science</option>
            <option value="PUC - Commerce" ${s.department === 'PUC - Commerce' ? 'selected' : ''}>Commerce</option>
            <option value="PUC - Arts" ${s.department === 'PUC - Arts' ? 'selected' : ''}>Arts</option>
          </optgroup>
          <optgroup label="School">
            <option value="School - Primary" ${s.department === 'School - Primary' || s.department === 'LKG-UKG' ? 'selected' : ''}>Primary (LKG-UKG)</option>
            <option value="School - Secondary" ${s.department === 'School - Secondary' || s.department === '1-10th' ? 'selected' : ''}>Secondary (1st-10th)</option>
            <option value="School - High School" ${s.department === 'School - High School' || s.department === '11th-12th' ? 'selected' : ''}>High School (11th-12th)</option>
          </optgroup>
          ${!['', 'CSE', 'IT', 'ECE', 'MECH', 'CIVIL', 'Degree - CSE', 'Degree - IT', 'Degree - ECE', 'Degree - MECH', 'Degree - CIVIL', 'Degree - AIML', 'Degree - ELECTRICAL', 'Degree - MBA', 'Degree - BFA', 'Poly - CSE', 'Poly - CIVIL', 'Poly - MECH', 'Poly - ELECTRICAL', 'PUC - Science', 'PUC - Commerce', 'PUC - Arts', 'School - Primary', 'School - Secondary', 'School - High School', 'LKG-UKG', '1-10th', '11th-12th'].includes(s.department) ? `<option value="${escapeHtml(s.department)}" selected>${escapeHtml(s.department)}</option>` : ''}
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
        <div>
          <label class="modal-label">Course / Year</label>
          <select id="edit_course_year" class="modal-input">
            <option value="">-- Select Year --</option>
            <optgroup label="Degree / Poly">
              <option value="1st Year" ${s.course_year === '1st Year' ? 'selected' : ''}>1st Year</option>
              <option value="2nd Year" ${s.course_year === '2nd Year' ? 'selected' : ''}>2nd Year</option>
              <option value="3rd Year" ${s.course_year === '3rd Year' ? 'selected' : ''}>3rd Year</option>
              <option value="4th Year" ${s.course_year === '4th Year' ? 'selected' : ''}>4th Year</option>
            </optgroup>
            <optgroup label="PUC">
              <option value="11th Std" ${s.course_year === '11th Std' || s.course_year === '11th Std (PUC 1)' ? 'selected' : ''}>11th Std (PUC 1)</option>
              <option value="12th Std" ${s.course_year === '12th Std' || s.course_year === '12th Std (PUC 2)' ? 'selected' : ''}>12th Std (PUC 2)</option>
            </optgroup>
            <optgroup label="School">
              <option value="LKG" ${s.course_year === 'LKG' ? 'selected' : ''}>LKG</option>
              <option value="UKG" ${s.course_year === 'UKG' ? 'selected' : ''}>UKG</option>
              <option value="1st Std" ${s.course_year === '1st Std' ? 'selected' : ''}>1st Std</option>
              <option value="2nd Std" ${s.course_year === '2nd Std' ? 'selected' : ''}>2nd Std</option>
              <option value="3rd Std" ${s.course_year === '3rd Std' ? 'selected' : ''}>3rd Std</option>
              <option value="4th Std" ${s.course_year === '4th Std' ? 'selected' : ''}>4th Std</option>
              <option value="5th Std" ${s.course_year === '5th Std' ? 'selected' : ''}>5th Std</option>
              <option value="6th Std" ${s.course_year === '6th Std' ? 'selected' : ''}>6th Std</option>
              <option value="7th Std" ${s.course_year === '7th Std' ? 'selected' : ''}>7th Std</option>
              <option value="8th Std" ${s.course_year === '8th Std' ? 'selected' : ''}>8th Std</option>
              <option value="9th Std" ${s.course_year === '9th Std' ? 'selected' : ''}>9th Std</option>
              <option value="10th Std" ${s.course_year === '10th Std' ? 'selected' : ''}>10th Std</option>
            </optgroup>
            ${!['', '1st Year', '2nd Year', '3rd Year', '4th Year', '11th Std', '11th Std (PUC 1)', '12th Std', '12th Std (PUC 2)', 'LKG', 'UKG', '1st Std', '2nd Std', '3rd Std', '4th Std', '5th Std', '6th Std', '7th Std', '8th Std', '9th Std', '10th Std'].includes(s.course_year) ? `<option value="${escapeHtml(s.course_year)}" selected>${escapeHtml(s.course_year)}</option>` : ''}
          </select>
        </div>
        <div>
          <label class="modal-label">Section</label>
          <select id="edit_section" class="modal-input">
            <option value="">-- Select Section --</option>
            <option value="A" ${s.section === 'A' ? 'selected' : ''}>Section A</option>
            <option value="B" ${s.section === 'B' ? 'selected' : ''}>Section B</option>
            <option value="C" ${s.section === 'C' ? 'selected' : ''}>Section C</option>
          </select>
        </div>
      </div>
      <div style="margin-top: 15px;">
        <label class="modal-label">Address</label>
        <textarea id="edit_address" placeholder="Student Address" rows="3" class="modal-input">${escapeHtml(s.address || '')}</textarea>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
        <div>
          <label class="modal-label">Mobile / WhatsApp</label>
          <input type="tel" id="edit_phone" value="${escapeHtml(s.phone || '')}" placeholder="10 digit number" class="modal-input">
        </div>
        <div>
          <label class="modal-label">Email</label>
          <input type="email" id="edit_email" value="${escapeHtml(s.email || '')}" placeholder="student@email.com" class="modal-input">
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
        <div>
          <label class="modal-label">Pass Valid From</label>
          <input type="date" id="edit_pass_valid_from" value="${s.pass_valid_from ? new Date(s.pass_valid_from).toISOString().split('T')[0] : ''}" class="modal-input">
        </div>
        <div>
          <label class="modal-label">Pass Valid To</label>
          <input type="date" id="edit_pass_valid_to" value="${s.pass_valid_to ? new Date(s.pass_valid_to).toISOString().split('T')[0] : ''}" class="modal-input">
        </div>
      </div>
      <input type="hidden" id="edit_photo_url" value="${s.photo_url || ''}">
      <div style="margin-top: 15px;">
        <label class="modal-label">Payment Cycle</label>
        <input type="text" id="edit_payment_cycle" value="${escapeHtml(s.payment_cycle || '')}" class="modal-input">
      </div>
      <div style="margin-top: 15px;">
        <label class="modal-label">Assign Bus</label>
        <select id="edit_bus_id" class="modal-input">
          ${busOptions}
        </select>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
        <div>
          <label class="modal-label">Concession (₹)</label>
          <input type="number" id="edit_concession" value="${s.concession || 0}" class="modal-input" oninput="calcEditRemaining()">
        </div>
        <div>
          <label class="modal-label">Concession Reason</label>
          <input type="text" id="edit_concession_reason" value="${escapeHtml(s.concession_reason || '')}" class="modal-input">
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-top: 15px;">
        <div>
          <label class="modal-label">Total Fees</label>
          <input type="number" id="edit_total_fees" value="${s.total_fees || 0}" class="modal-input" oninput="calcEditRemaining()">
        </div>
        <div>
          <label class="modal-label">Fees Paid</label>
          <input type="number" id="edit_fees_paid" value="${s.fees_paid || 0}" class="modal-input" oninput="calcEditRemaining()">
        </div>
        <div>
          <label class="modal-label">Remaining</label>
          <input type="number" id="edit_remaining_fees" value="${s.remaining_fees || 0}" readonly class="modal-input">
        </div>
      </div>
    `;

    showModal('Edit Student Data', content, async () => {
      const updateData = {
        name: document.getElementById('edit_name').value.trim(),
        roll_no: document.getElementById('edit_roll_no').value.trim(),
        department: document.getElementById('edit_department').value.trim(),
        course_year: document.getElementById('edit_course_year').value.trim(),
        section: document.getElementById('edit_section').value.trim(),
        address: document.getElementById('edit_address').value.trim(),
        phone: document.getElementById('edit_phone').value.trim(),
        email: document.getElementById('edit_email').value.trim(),
        photo_url: document.getElementById('edit_photo_url').value || null,
        pass_valid_from: document.getElementById('edit_pass_valid_from').value || null,
        pass_valid_to: document.getElementById('edit_pass_valid_to').value || null,
        bus_id: document.getElementById('edit_bus_id').value || null,
        total_fees: parseFloat(document.getElementById('edit_total_fees').value) || 0,
        concession: parseFloat(document.getElementById('edit_concession').value) || 0,
        concession_reason: document.getElementById('edit_concession_reason').value.trim(),
        payment_cycle: document.getElementById('edit_payment_cycle').value.trim(),
        fees_paid: parseFloat(document.getElementById('edit_fees_paid').value) || 0,
        remaining_fees: parseFloat(document.getElementById('edit_remaining_fees').value) || 0
      };

      if (!updateData.name || !updateData.roll_no) {
        alert('Name and Roll No are required');
        return;
      }

      try {
        const res2 = await apiFetch(`/api/students/update/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });

        if (res2.success) {
          alert('Student updated successfully');
          closeModal();
          loadStudents();
        } else {
          alert(res2.message || 'Failed to update student');
        }
      } catch (e) {
        alert('Error updating student.');
      }
    });

  } catch (error) {
    console.error('Error updating student:', error);
    alert('Failed to load student data. Please try again.');
  }
}

async function resetStudentPassword(id) {
  if (!confirm("Are you sure you want to reset this student's password to '123456'?")) return;
  try {
    const res = await apiFetch(`/api/students/reset-password/${id}`, { method: 'PUT' });
    if (res.success) {
      alert(res.message);
    } else {
      alert(res.message || 'Failed to reset password');
    }
  } catch (err) {
    console.error(err);
    alert('Error resetting password');
  }
}

async function bulkResetPasswords() {
  if (!confirm("WARNING: This will reset ALL students' passwords to '123456'. Are you sure you want to proceed?")) return;
  try {
    const res = await apiFetch(`/api/students/bulk-reset-passwords`, { method: 'PUT' });
    if (res.success) {
      alert(res.message);
    } else {
      alert(res.message || 'Failed to reset passwords');
    }
  } catch (err) {
    console.error(err);
    alert('Error resetting passwords');
  }
}

// View Student Details Function
async function viewStudentDetails(id) {
  try {
    const res = await apiFetch(`/api/students/get/${id}`);
    const paymentsRes = await apiFetch(`/api/students/${id}/payments`);

    if (!res || !res.success) {
      alert('Failed to load student data');
      return;
    }

    const s = res.student;
    const payments = paymentsRes.success ? paymentsRes.payments : [];

    let paymentsHtml = '';
    if (payments.length > 0) {
      paymentsHtml = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.2); text-align: left;">
              <th style="padding: 8px;">Date</th>
              <th style="padding: 8px;">Amount</th>
              <th style="padding: 8px;">Mode</th>
              <th style="padding: 8px;">UTR</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map(p => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <td style="padding: 8px;">${new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
                <td style="padding: 8px; color: var(--success);">₹${p.amount}</td>
                <td style="padding: 8px;">${escapeHtml(p.payment_mode)}</td>
                <td style="padding: 8px;">${escapeHtml(p.utr_number || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      paymentsHtml = '<p class="modal-label">No payments recorded yet.</p>';
    }

    const content = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
          <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
            ${s.photo_url ? `<img src="${s.photo_url}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary);">` : `<div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center;"><i class='fa-solid fa-user' style='font-size: 1.5rem; color: var(--gray);'></i></div>`}
            <div>
              <h4 style="margin: 0; color: var(--primary);">${escapeHtml(s.name)}</h4>
              <p style="margin: 2px 0; font-size: 0.85rem; color: var(--gray);">${escapeHtml(s.roll_no)} | ${escapeHtml(s.department || 'N/A')}</p>
            </div>
          </div>
          <p style="margin: 5px 0;"><strong>Username:</strong> ${escapeHtml(s.username || 'N/A')}</p>
          <p style="margin: 5px 0;"><strong>Year/Sec:</strong> ${escapeHtml(s.course_year || '')} ${s.section ? 'Sec ' + escapeHtml(s.section) : ''}</p>
          <p style="margin: 5px 0;"><strong>Address:</strong> ${escapeHtml(s.address || 'N/A')}</p>
          <p style="margin: 5px 0;"><strong>Phone:</strong> ${escapeHtml(s.phone || 'N/A')} ${s.phone ? `<a href="https://wa.me/91${s.phone}?text=Dear%20${encodeURIComponent(s.name)},%20your%20pending%20bus%20fee%20is%20₹${s.remaining_fees}.%20Please%20pay%20at%20the%20earliest.%20-%20SGI%20Bus%20Transport" target="_blank" style="color: #25D366; margin-left: 8px;" title="Send WhatsApp Reminder"><i class="fa-brands fa-whatsapp"></i></a>` : ''}</p>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${escapeHtml(s.email || 'N/A')} ${s.email && parseFloat(s.remaining_fees || 0) > 0 ? `<button onclick="sendEmailReminder(${s.id})" style="background: #ef4444; color: white; border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; margin-left: 8px;">📧 Send Reminder</button>` : ''}</p>
          <p style="margin: 5px 0;"><strong>Joined:</strong> ${formatDate(s.joining_date)}</p>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
          <h4 style="margin-top: 0; color: var(--primary);"><i class="fa-solid fa-indian-rupee-sign"></i> Financials</h4>
          <p style="margin: 5px 0;"><strong>Total Fees:</strong> ₹${parseFloat(s.total_fees || 0).toLocaleString('en-IN')}</p>
          <p style="margin: 5px 0;"><strong>Fees Paid:</strong> <span style="color: var(--success);">₹${parseFloat(s.fees_paid || 0).toLocaleString('en-IN')}</span></p>
          <p style="margin: 5px 0;"><strong>Remaining:</strong> <span style="color: ${parseFloat(s.remaining_fees || 0) > 0 ? 'var(--error)' : 'var(--success)'};">₹${parseFloat(s.remaining_fees || 0).toLocaleString('en-IN')}</span></p>
          <hr style="border-color: rgba(255,255,255,0.1); margin: 15px 0;">
          <h4 style="margin: 0 0 10px 0; color: var(--primary);"><i class="fa-solid fa-bus"></i> Bus Info</h4>
          <p style="margin: 5px 0;"><strong>Bus No:</strong> ${escapeHtml(s.bus_number || 'Not Assigned')} ${s.short_name ? ' (' + escapeHtml(s.short_name) + ')' : ''}</p>
          <p style="margin: 5px 0;"><strong>Route:</strong> ${escapeHtml(s.route || 'N/A')}</p>
          <p style="margin: 5px 0;"><strong>Driver:</strong> ${escapeHtml(s.driver_name || 'N/A')} ${s.driver_phone ? ' (' + escapeHtml(s.driver_phone) + ')' : ''}</p>
          <p style="margin: 5px 0;"><strong>Pass Valid:</strong> ${s.pass_valid_from ? formatDate(s.pass_valid_from) + ' to ' + formatDate(s.pass_valid_to) : 'Not Set'}</p>
          <button onclick="generateBusPass(${s.id})" style="width: 100%; margin-top: 10px; background: var(--accent); color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-weight: 600;"><i class="fa-solid fa-id-card"></i> Generate Bus Pass</button>
        </div>
      </div>
      
      <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
        <h4 style="margin: 0 0 10px 0; color: var(--primary); display: flex; justify-content: space-between;">
          Payment History
          <div>
            ${parseFloat(s.remaining_fees || 0) <= 0 ? `<button onclick="printNoDuesReceipt(${s.id})" class="edit-btn" style="background: #3b82f6; color: white; padding: 2px 10px; font-size: 0.8rem; margin-right: 5px;"><i class="fa-solid fa-print"></i> No Dues</button>` : ''}
            <button onclick="closeModal(); setTimeout(()=>payFees(${s.id}), 300)" class="edit-btn" style="background: var(--success); color: white; padding: 2px 10px; font-size: 0.8rem;">Pay Fees</button>
          </div>
        </h4>
        <div style="max-height: 200px; overflow-y: auto;">
          ${paymentsHtml}
        </div>
      </div>
    `;

    showModal(`Student Details: ${escapeHtml(s.roll_no)}`, content, () => {
      closeModal();
      setTimeout(() => editStudent(s.id), 300); // Save Changes button will trigger Edit modal
    });

    // Change Save button text to "Edit Student"
    document.getElementById('modalSaveBtn').textContent = 'Edit Student';

  } catch (error) {
    console.error('Error viewing student details:', error);
    alert('Failed to load student details.');
  }
}

// View Bus Details Function
async function viewBusDetails(id) {
  try {
    const res = await apiFetch(`/api/buses/get/${id}`);
    const studentsRes = await apiFetch(`/api/buses/${id}/students`);

    if (!res || !res.success) {
      alert('Failed to load bus data');
      return;
    }

    const bus = res.bus;
    const students = studentsRes.success ? studentsRes.students : [];

    let studentsHtml = '';
    if (students.length > 0) {
      studentsHtml = `
      <div class="table-responsive">
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.2); text-align: left;">
              <th style="padding: 8px;">Name</th>
              <th style="padding: 8px;">Roll No</th>
              <th style="padding: 8px;">Dept</th>
              <th style="padding: 8px;">Pending Fee</th>
            </tr>
          </thead>
          <tbody>
            ${students.map(s => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                <td style="padding: 8px;"><a href="#" onclick="closeModal(); setTimeout(()=>viewStudentDetails(${s.id}),300); return false;" style="color: var(--primary);">${escapeHtml(s.name)}</a></td>
                <td style="padding: 8px;">${escapeHtml(s.roll_no)}</td>
                <td style="padding: 8px;">${escapeHtml(s.department || '-')}</td>
                <td style="padding: 8px; color: ${s.remaining_fees > 0 ? 'var(--danger)' : 'var(--success)'};">₹${s.remaining_fees}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      studentsHtml = '<p class="modal-label">No students assigned to this bus yet.</p>';
    }

    const content = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; color: var(--primary);">Bus Info</h4>
          <p style="margin: 5px 0;"><strong>Bus Number:</strong> ${escapeHtml(bus.bus_number)}</p>
          <p style="margin: 5px 0;"><strong>Route:</strong> ${escapeHtml(bus.route || 'N/A')}</p>
          <p style="margin: 5px 0;"><strong>Capacity:</strong> ${bus.capacity || 0} seats</p>
          <p style="margin: 5px 0;"><strong>Assigned:</strong> ${students.length} students</p>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
          <h4 style="margin: 0 0 10px 0; color: var(--primary);">Driver Info</h4>
          <p style="margin: 5px 0;"><strong>Name:</strong> ${escapeHtml(bus.driver_name || 'N/A')}</p>
          <p style="margin: 5px 0;"><strong>Phone:</strong> ${escapeHtml(bus.driver_phone || 'N/A')}</p>
        </div>
      </div>
      
      <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;">
        <h4 style="margin: 0 0 10px 0; color: var(--primary);">Assigned Students</h4>
        <div style="max-height: 200px; overflow-y: auto;">
          ${studentsHtml}
        </div>
      </div>
    `;

    showModal(`Bus Details: ${escapeHtml(bus.bus_number)}`, content, () => {
      closeModal();
      setTimeout(() => editBus(bus.id), 300);
    });

    document.getElementById('modalSaveBtn').textContent = 'Edit Bus';

  } catch (error) {
    console.error('Error viewing bus details:', error);
    alert('Failed to load bus details.');
  }
}

// Pay fees function
async function payFees(id) {
  try {
    const res = await apiFetch(`/api/students/get/${id}`);
    if (!res || !res.success) {
      alert('Failed to load student data');
      return;
    }

    const s = res.student;

    const content = `
      <div style="margin-bottom: 20px; padding: 15px; background: rgba(255,183,3,0.05); border: 1px solid rgba(255,183,3,0.1); border-radius: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <p style="margin: 0; color: var(--gray); font-size: 0.85rem; text-transform: uppercase;">Student</p>
          <p style="margin: 2px 0 0; font-weight: 700; color: #fff; font-size: 1.1rem;">${escapeHtml(s.name)}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; color: var(--gray); font-size: 0.85rem; text-transform: uppercase;">Outstanding</p>
          <p style="margin: 2px 0 0; font-weight: 800; color: #f87171; font-size: 1.2rem;">₹${parseFloat(s.remaining_fees || 0).toLocaleString()}</p>
        </div>
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label"><i class="fa-solid fa-coins" style="margin-right: 5px; color: var(--primary);"></i> Payment Amount (₹) *</label>
        <input type="number" id="pay_amount" placeholder="Enter amount..." min="1" step="0.01" class="modal-input" style="font-size: 1.1rem; font-weight: 600;">
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label"><i class="fa-solid fa-wallet" style="margin-right: 5px; color: var(--primary);"></i> Payment Mode *</label>
        <select id="pay_mode" onchange="document.getElementById('utr_container').style.display = this.value === 'Online' ? 'block' : 'none';" class="modal-select">
          <option value="Cash">Cash</option>
          <option value="Online">Online (UPI/Bank Transfer)</option>
          <option value="Cheque">Cheque</option>
        </select>
      </div>
      <div id="utr_container" style="margin-bottom: 15px; display: none; animation: fadeIn 0.3s ease;">
        <label class="modal-label"><i class="fa-solid fa-barcode" style="margin-right: 5px; color: var(--primary);"></i> UTR / Transaction Number *</label>
        <input type="text" id="pay_utr" placeholder="Enter Transaction ID" class="modal-input">
      </div>
      <div style="margin-bottom: 15px;">
        <label class="modal-label"><i class="fa-solid fa-file-invoice" style="margin-right: 5px; color: var(--primary);"></i> Receipt/Screenshot (Optional)</label>
        <input type="file" id="pay_receipt" class="modal-input" accept=".jpg,.jpeg,.png,.pdf" style="padding: 8px;">
      </div>
    `;

    showModal('Pay Fees & Generate Receipt', content, async () => {
      const amount = parseFloat(document.getElementById('pay_amount').value);
      const payment_mode = document.getElementById('pay_mode').value;
      const utr_number = document.getElementById('pay_utr').value.trim();

      if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
      }

      if (payment_mode === 'Online' && !utr_number) {
        alert('UTR Number is required for online payments');
        return;
      }

      const saveBtn = document.getElementById('modalSaveBtn');
      const originalText = saveBtn.innerHTML;
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

      let receipt_url = null;
      const receiptInput = document.getElementById('pay_receipt');
      if (receiptInput.files && receiptInput.files[0]) {
        const formData = new FormData();
        formData.append('receipt', receiptInput.files[0]);
        try {
          saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
          const uploadRes = await apiFetch('/api/upload/receipt', {
            method: 'POST',
            body: formData,
          }, false);
          if (uploadRes.success) {
            receipt_url = uploadRes.receipt_url;
          } else {
            alert('Failed to upload receipt: ' + uploadRes.message);
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
            return;
          }
        } catch (e) {
          alert('Error uploading receipt.');
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalText;
          return;
        }
      }

      saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Payment...';
      try {
        const payRes = await apiFetch(`/api/students/pay/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, payment_mode, utr_number, receipt_url })
        });

        if (payRes.success) {
          alert('Payment successful!');
          closeModal();
          loadStudents();
          // Fetch global payment cycle if needed
          if (!payRes.student.payment_cycle) {
            try {
              const sRes = await apiFetch('/api/settings');
              if (sRes.success && sRes.settings && sRes.settings.payment_cycle) {
                payRes.student.payment_cycle = sRes.settings.payment_cycle;
              }
            } catch (e) { console.warn(e); }
          }
          generateReceipt(payRes.student, payRes.payment, payRes.payment_id);
        } else {
          alert(payRes.message || 'Payment failed');
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalText;
        }
      } catch (e) {
        alert('Error processing payment.');
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
      }
    });

  } catch (error) {
    console.error('Error preparing payment:', error);
    alert('Failed to load student data for payment.');
  }
}

// Number to words helper for receipt
function numberToWords(num) {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  if ((num = num.toString()).length > 9) return 'overflow';
  let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return;
  let str = '';
  str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
  str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
  str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
  str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
  str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
  return str.trim() ? str.trim() + ' Only' : 'Zero Only';
}

function generateReceipt(student, payment, receiptNo) {
  const dateStr = new Date(payment.date).toLocaleDateString('en-GB'); // DD/MM/YYYY
  const receiptWindow = window.open('', '_blank', 'width=650,height=850');
  receiptWindow.document.write(`
    <html>
      <head>
        <title>Fee Receipt - ${student.name}</title>
        <style>
          * { box-sizing: border-box; }
          body { 
            font-family: 'Arial', sans-serif; 
            background: #f0f2f5; 
            padding: 10px; 
            margin: 0; 
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
            min-height: 100vh;
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            color-adjust: exact !important;
          }
          .print-area { 
            background: #fff; 
            width: 148mm; 
            height: 210mm; 
            padding: 6px; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.1); 
            display: flex;
            flex-direction: column;
          }
          .receipt-wrapper { 
            border: 2px solid #7d3c43; 
            border-radius: 12px; 
            padding: 3px; 
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          .inner-border { 
            border: 1.5px solid #7d3c43; 
            border-radius: 9px; 
            padding: 10px 14px; 
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative; 
          }
          
          .header-section { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: #7d3c43; }
          .logo-area { width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; text-align: center; }
          .logo-area img { max-height: 100%; max-width: 100%; object-fit: contain; }
          
          .titles { text-align: center; flex: 1; margin: 0 10px; }
          .small-text { font-size: 10px; font-weight: bold; margin-bottom: 1px; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
          .main-title { font-size: 24px; font-weight: bold; letter-spacing: 1.5px; font-family: 'Times New Roman', serif; margin-bottom: 1px; line-height: 1.1; }
          .sub-title { font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 6px; color: #7d3c43; }
          .sub-title::before, .sub-title::after { content: ""; height: 3px; width: 15px; background: #7d3c43; }
          
          .right-info { font-size: 8.5px; font-weight: bold; line-height: 1.3; border-left: 1.5px solid #7d3c43; padding-left: 10px; color: #555; min-width: 140px; }
          .right-info .red-text { color: #7d3c43; font-size: 9px; margin-top: 3px; font-weight: 800; }
          
          .address-bar { background-color: #9c7b7e; color: #fff; text-align: center; font-size: 9px; padding: 3px 5px; margin: 0 -14px 10px -14px; border-top: 1.5px solid #7d3c43; border-bottom: 1.5px solid #7d3c43; }
          
          .receipt-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-weight: bold; font-size: 11.5px; color: #444; }
          .fee-receipt-badge { background: #7d3c43; color: white; padding: 3px 12px; border-radius: 4px; font-size: 12.5px; font-weight: 700; letter-spacing: 0.5px; }
          
          .field-row { display: flex; align-items: flex-end; margin-bottom: 7px; font-weight: bold; font-size: 11.5px; color: #444; }
          .field-row.multi { gap: 12px; }
          .field-row.multi > div { display: flex; align-items: flex-end; flex: 1; }
          .underline { border-bottom: 1px dashed #999; display: inline-block; margin-left: 4px; flex: 1; min-height: 15px; padding-bottom: 1px; }
          .flex-1 { flex: 1; }
          
          .receipt-value { font-family: 'Arial', sans-serif; color: #000; font-weight: bold; font-size: 12px; padding-left: 4px; }
          
          .particulars-table { width: 100%; border-collapse: collapse; margin: 10px 0; border: 1.5px solid #7d3c43; }
          .particulars-table th, .particulars-table td { border: 1px solid #7d3c43; padding: 5px 8px; }
          .particulars-table th { color: #7d3c43; font-size: 12px; text-align: left; background: #fcf8f8; }
          .particulars-table td { color: #444; font-weight: bold; font-size: 11px; }
          .particulars-table td:nth-child(2), .particulars-table th:nth-child(2) { text-align: center; width: 120px; }
          .particulars-table tfoot th, .particulars-table tfoot td { color: #7d3c43; font-size: 12px; font-weight: bold; background: #fcf8f8; }
          
          .footer-sigs { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 15px; }
          .note { font-size: 9px; font-weight: bold; color: #7d3c43; font-style: italic; }
          .sig-box { text-align: center; }
          .sig-line { border-top: 1px solid #7d3c43; padding-top: 3px; font-weight: bold; font-size: 10.5px; color: #7d3c43; margin-top: 2px; width: 150px; }
          .sig-fake { display: block; font-size: 16px; color: #000; font-style: italic; margin-bottom: -3px; font-family: 'Georgia', serif; }
          
          @media print {
            body { padding: 0; background: white; min-height: auto; display: flex; flex-direction: row; gap: 10px; align-items: flex-start; justify-content: center; }
            .print-area { box-shadow: none; padding: 0; width: 148mm; height: 210mm; margin: 0; page-break-inside: avoid; }
            @page { size: A4 landscape; margin: 10mm; }
          }
        </style>
      </head>
      <body>
        <!-- First Copy -->
        <div class="print-area">
          <div class="receipt-wrapper">
            <div class="inner-border">
              ${student.remaining_fees <= 0 ? '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:60px;color:rgba(34,197,94,0.15);font-weight:900;border:5px solid rgba(34,197,94,0.15);padding:10px 20px;border-radius:10px;pointer-events:none;z-index:10;">NO DUES</div>' : ''}
              <div class="header-section">
                <div class="logo-area" style="display: flex; align-items: center; justify-content: center;">
                  <img src="/images/sgilogo.png" alt="SGI Logo">
                </div>
                <div class="titles">
                  <div class="small-text">Holy-Wood Academy's</div>
                  <div class="main-title">SANJEEVAN</div>
                  <div class="sub-title">PUBLIC SCHOOL, PANHALA.</div>
                </div>
                <div class="right-info">
                  <div>Affiliation No. : 1130172</div>
                  <div>UDISE No. : 27340202704</div>
                  <div>School Code : 30128</div>
                  <div class="red-text">DAY SECTION - CBSE CURRICULUM</div>
                </div>
              </div>
              
              <div class="address-bar">
                At. Sanjeevan Group of Schools, Somwar Peth-Injole, Post. & Tal. Panhala, Dist. Kolhapur - 416201.
              </div>

              <div class="receipt-info">
                <div style="color: #7d3c43;">Rec. No. <span class="receipt-value" style="margin-left: 10px;">${receiptNo}</span></div>
                <div class="fee-receipt-badge">FEE RECEIPT</div>
                <div style="color: #7d3c43;">Date: <span class="receipt-value" style="margin-left: 10px;">${dateStr}</span></div>
              </div>
              
              <div class="field-row">
                Name: <span class="underline flex-1 receipt-value" style="text-align: center;">${student.name}</span>
              </div>
              
              <div class="field-row multi">
                <div>Branch/Standard: <span class="underline receipt-value">${student.course_year || student.department || ''}</span></div>
                <div>Class: <span class="underline receipt-value">${student.section || ''}</span></div>
              </div>
              
              <div class="field-row multi">
                <div>Payment Cycle: <span class="underline receipt-value">${student.payment_cycle || ''}</span></div>
                <div>Bus No.: <span class="underline receipt-value">${student.bus_number || ''}</span></div>
              </div>
              
              <div class="field-row multi">
                <div style="flex: 1.5;">Bus Route: <span class="underline receipt-value">${student.route || ''}</span></div>
                <div style="flex: 1;">Pickup Point: <span class="underline receipt-value"></span></div>
              </div>

              <table class="particulars-table">
                <thead>
                  <tr>
                    <th>Particulars</th>
                    <th>Amount Rs. (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Registration Fee</td>
                    <td class="receipt-value">-</td>
                  </tr>
                  <tr>
                    <td>Tuition Fee</td>
                    <td class="receipt-value">-</td>
                  </tr>
                  <tr>
                    <td>Bus Fee</td>
                    <td class="receipt-value">${payment.amount} /-</td>
                  </tr>
                  <tr>
                    <td>Concession / Discount</td>
                    <td class="receipt-value">${parseFloat(student.concession || 0) > 0 ? parseFloat(student.concession).toLocaleString() + ' /-' : '-'}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td style="text-align: right; padding-right: 15px;">Total Amount ₹</td>
                    <td class="receipt-value">${payment.amount} /-</td>
                  </tr>
                </tfoot>
              </table>

              <div class="field-row" style="margin-top: 10px;">
                In Words: <span class="underline flex-1 receipt-value">${numberToWords(payment.amount)}</span>
              </div>
              
              <div class="field-row">
                Payment Mode: 
                <span style="font-family: Arial; font-weight: normal; margin-left: 10px; color: #444; font-size: 12px;">
                  Cash ${payment.payment_mode === 'Cash' ? '<span style="color:#000;font-weight:bold;">✓</span>' : ''} / 
                  D.D. / Cheque ${payment.payment_mode === 'Cheque' ? '<span style="color:#000;font-weight:bold;">✓</span>' : ''} / 
                  NEFT / UTR ${payment.payment_mode === 'Online' ? '<span style="color:#000;font-weight:bold;">✓</span>' : ''}
                </span>
              </div>
              
              <div class="field-row multi">
                <div>Bank Name : <span class="underline receipt-value"></span></div>
              </div>
              
              <div class="field-row multi">
                <div>Branch Name : <span class="underline receipt-value"></span></div>
                <div>D.D./Cheque No.: <span class="underline receipt-value"></span></div>
              </div>
              
              <div class="field-row multi">
                <div>Date of DD or Cheque: <span class="underline receipt-value"></span></div>
                <div>Dues Fees ₹: <span class="underline receipt-value">${student.remaining_fees > 0 ? student.remaining_fees + ' /-' : 'Nil'}</span></div>
              </div>
              
              <div class="field-row multi">
                <div style="max-width: 60%;">UTR No. : <span class="underline receipt-value">${payment.utr_number || ''}</span></div>
              </div>
              
              <div class="footer-sigs">
                <div class="note">Note:- Fees Once Paid Will Not Be Refunded.</div>
                <div class="sig-box">
                  <span class="receipt-value sig-fake" style="visibility:hidden;">SGI</span>
                  <div class="sig-line">Signature of the Accountant</div>
                </div>
              </div>
              
            </div>
          </div>
        </div>

        <!-- Second Copy (Office Copy) -->
        <div class="print-area">
          <div class="receipt-wrapper">
            <div class="inner-border">
              ${student.remaining_fees <= 0 ? '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:60px;color:rgba(34,197,94,0.15);font-weight:900;border:5px solid rgba(34,197,94,0.15);padding:10px 20px;border-radius:10px;pointer-events:none;z-index:10;">NO DUES</div>' : ''}
              <div class="header-section">
                <div class="logo-area" style="display: flex; align-items: center; justify-content: center;">
                  <img src="/images/sgilogo.png" alt="SGI Logo">
                </div>
                <div class="titles">
                  <div class="small-text">Holy-Wood Academy's</div>
                  <div class="main-title">SANJEEVAN</div>
                  <div class="sub-title">PUBLIC SCHOOL, PANHALA.</div>
                </div>
                <div class="right-info">
                  <div>Affiliation No. : 1130172</div>
                  <div>UDISE No. : 27340202704</div>
                  <div>School Code : 30128</div>
                  <div class="red-text">DAY SECTION - CBSE CURRICULUM</div>
                </div>
              </div>
              
              <div class="address-bar">
                At. Sanjeevan Group of Schools, Somwar Peth-Injole, Post. & Tal. Panhala, Dist. Kolhapur - 416201.
              </div>

              <div class="receipt-info">
                <div style="color: #7d3c43;">Rec. No. <span class="receipt-value" style="margin-left: 10px;">${receiptNo}</span></div>
                <div class="fee-receipt-badge">OFFICE COPY</div>
                <div style="color: #7d3c43;">Date: <span class="receipt-value" style="margin-left: 10px;">${dateStr}</span></div>
              </div>
              
              <div class="field-row">
                Name: <span class="underline flex-1 receipt-value" style="text-align: center;">${student.name}</span>
              </div>
              
              <div class="field-row multi">
                <div>Branch/Standard: <span class="underline receipt-value">${student.course_year || student.department || ''}</span></div>
                <div>Class: <span class="underline receipt-value">${student.section || ''}</span></div>
              </div>
              
              <div class="field-row multi">
                <div>Payment Cycle: <span class="underline receipt-value">${student.payment_cycle || ''}</span></div>
                <div>Bus No.: <span class="underline receipt-value">${student.bus_number || ''}</span></div>
              </div>
              
              <div class="field-row multi">
                <div style="flex: 1.5;">Bus Route: <span class="underline receipt-value">${student.route || ''}</span></div>
                <div style="flex: 1;">Pickup Point: <span class="underline receipt-value"></span></div>
              </div>

              <table class="particulars-table">
                <thead>
                  <tr>
                    <th>Particulars</th>
                    <th>Amount Rs. (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Registration Fee</td>
                    <td class="receipt-value">-</td>
                  </tr>
                  <tr>
                    <td>Tuition Fee</td>
                    <td class="receipt-value">-</td>
                  </tr>
                  <tr>
                    <td>Bus Fee</td>
                    <td class="receipt-value">${payment.amount > 0 ? payment.amount + ' /-' : '-'}</td>
                  </tr>
                  <tr>
                    <td>Concession / Discount</td>
                    <td class="receipt-value">${parseFloat(student.concession || 0) > 0 ? parseFloat(student.concession).toLocaleString() + ' /-' : '-'}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td style="text-align: right; padding-right: 15px;">Total Amount ₹</td>
                    <td class="receipt-value">${payment.amount > 0 ? payment.amount + ' /-' : '0 /-'}</td>
                  </tr>
                </tfoot>
              </table>

              <div class="field-row" style="margin-top: 10px;">
                In Words: <span class="underline flex-1 receipt-value">${numberToWords(payment.amount)}</span>
              </div>
              
              <div class="field-row">
                Payment Mode: 
                <span style="font-family: Arial; font-weight: normal; margin-left: 10px; color: #444; font-size: 12px;">
                  Cash ${payment.payment_mode === 'Cash' ? '<span style="color:#000;font-weight:bold;">✓</span>' : ''} / 
                  D.D. / Cheque ${payment.payment_mode === 'Cheque' ? '<span style="color:#000;font-weight:bold;">✓</span>' : ''} / 
                  NEFT / UTR ${payment.payment_mode === 'Online' ? '<span style="color:#000;font-weight:bold;">✓</span>' : ''}
                </span>
              </div>
              
              <div class="field-row multi">
                <div>Bank Name : <span class="underline receipt-value"></span></div>
              </div>
              
              <div class="field-row multi">
                <div>Branch Name : <span class="underline receipt-value"></span></div>
                <div>D.D./Cheque No.: <span class="underline receipt-value"></span></div>
              </div>
              
              <div class="field-row multi">
                <div>Date of DD or Cheque: <span class="underline receipt-value"></span></div>
                <div>Dues Fees ₹: <span class="underline receipt-value">${student.remaining_fees > 0 ? student.remaining_fees + ' /-' : 'Nil'}</span></div>
              </div>
              
              <div class="field-row multi">
                <div style="max-width: 60%;">UTR No. : <span class="underline receipt-value">${payment.utr_number || ''}</span></div>
              </div>
              
              <div class="footer-sigs">
                <div class="note">Note:- Fees Once Paid Will Not Be Refunded.</div>
                <div class="sig-box">
                  <span class="receipt-value sig-fake" style="visibility:hidden;">SGI</span>
                  <div class="sig-line">Signature of the Accountant</div>
                </div>
              </div>
              
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(() => {
              window.print();
            }, 800);
          }
        </script>
      </body>
    </html>
  `);
  receiptWindow.document.close();
}

// Generate Bus Pass / ID Card - Professional Horizontal ID Card Design
async function generateBusPass(id) {
  try {
    const res = await apiFetch(`/api/students/get/${id}`);
    if (!res || !res.success) { alert('Failed to load student data'); return; }
    const s = res.student;
    const validFrom = s.pass_valid_from ? new Date(s.pass_valid_from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
    const validTo = s.pass_valid_to ? new Date(s.pass_valid_to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';

    const passWindow = window.open('', '_blank', 'width=750,height=600');
    passWindow.document.write(`
      <html>
        <head>
          <title>Bus Pass - ${s.name}</title>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
          <style>
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
            
            body { 
              font-family: 'Outfit', 'Segoe UI', sans-serif; 
              padding: 30px; 
              background: #e2e8f0; 
              margin: 0; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              min-height: 100vh; 
            }
            
            .id-card { 
              width: 580px; 
              height: 350px; 
              border-radius: 18px; 
              overflow: hidden; 
              box-shadow: 0 15px 40px rgba(0,0,0,0.2); 
              display: flex; 
              position: relative; 
              background-color: #ffffff !important;
            }
            
            /* LEFT PANEL */
            .card-left { 
              width: 60%; 
              background-color: #023047 !important;
              color: white; 
              padding: 25px 30px; 
              display: flex; 
              flex-direction: column; 
              justify-content: space-between; 
              position: relative; 
              overflow: hidden; 
            }
            
            /* Watermark photo - actual img tag so it prints in PDF */
            .watermark-img {
              position: absolute;
              top: 0; left: 0;
              width: 100%; height: 100%;
              object-fit: cover;
              opacity: 0.12;
              z-index: 0;
              pointer-events: none;
            }
            
            /* Dark overlay for text readability */
            .card-left::before { 
              content: ''; 
              position: absolute; 
              top: 0; left: 0; right: 0; bottom: 0;
              background-color: rgba(2, 48, 71, 0.55) !important; 
              z-index: 1;
            }
            
            .card-top { position: relative; z-index: 2; }
            
            .card-logo { 
              display: flex; 
              align-items: center; 
              gap: 12px; 
              margin-bottom: 12px; 
            }
            
            .logo-badge {
              display: inline-block;
              background-color: #ffb703 !important;
              color: #023047 !important;
              padding: 6px 18px;
              border-radius: 8px;
              font-size: 26px;
              font-weight: 900;
              letter-spacing: 2px;
              line-height: 1;
            }
            
            .college-name { 
              font-size: 11px; 
              font-weight: 600; 
              letter-spacing: 1.5px; 
              text-transform: uppercase; 
              color: rgba(255,255,255,0.75); 
              line-height: 1.5; 
            }
            
            .card-type-badge { 
              display: inline-block; 
              margin-top: 10px; 
              padding: 4px 14px; 
              background-color: rgba(255,183,3,0.25) !important; 
              border: 2px solid #ffb703 !important; 
              border-radius: 5px; 
              font-size: 10px; 
              font-weight: 800; 
              color: #ffb703 !important; 
              letter-spacing: 2.5px; 
              text-transform: uppercase; 
            }
            
            .card-info { position: relative; z-index: 2; }
            .info-row { margin-bottom: 7px; }
            .info-label { 
              font-size: 9px; 
              color: rgba(255,255,255,0.5); 
              text-transform: uppercase; 
              letter-spacing: 1.5px; 
              font-weight: 600; 
            }
            .info-value { 
              font-size: 15px; 
              font-weight: 700; 
              color: #ffffff !important; 
            }
            
            .card-validity { 
              position: relative; 
              z-index: 2; 
              display: flex; 
              gap: 25px; 
              padding-top: 10px; 
              border-top: 1px solid rgba(255,255,255,0.3); 
            }
            .v-label { 
              font-size: 8px; 
              color: rgba(255,255,255,0.5); 
              text-transform: uppercase; 
              letter-spacing: 1px; 
            }
            .v-date { 
              font-size: 13px; 
              font-weight: 800; 
              color: #ffb703 !important; 
            }
            
            /* RIGHT PANEL */
            .card-right { 
              width: 40%; 
              background-color: #f0f4f8 !important; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              padding: 20px; 
              position: relative; 
            }
            
            .card-right-accent {
              position: absolute;
              top: 0; left: 0; right: 0;
              height: 6px;
              background: linear-gradient(90deg, #ffb703, #fb8500) !important;
            }
            
            .photo-frame { 
              width: 130px; 
              height: 150px; 
              border-radius: 12px; 
              overflow: hidden; 
              border: 3px solid #219ebc !important; 
              box-shadow: 0 5px 15px rgba(0,0,0,0.15); 
              margin-bottom: 12px; 
              background-color: #ffffff !important; 
            }
            .photo-frame img { width: 100%; height: 100%; object-fit: cover; }
            .photo-frame .no-photo { 
              width: 100%; height: 100%; 
              display: flex; align-items: center; justify-content: center; 
              background-color: #e2e8f0 !important; 
              font-size: 50px; color: #94a3b8; 
            }
            
            .student-name { font-size: 16px; font-weight: 800; color: #023047 !important; text-align: center; margin-bottom: 3px; }
            .student-roll { font-size: 12px; color: #0f172a !important; font-weight: 700; letter-spacing: 1.5px; margin-bottom: 2px; text-align: center; }
            .student-dept { font-size: 11px; color: #334155 !important; font-weight: 600; margin-top: 2px; text-align: center; }
            
            /* BOTTOM STRIP */
            .card-strip { 
              position: absolute; 
              bottom: 0; left: 0; right: 0; 
              height: 28px; 
              background-color: #023047 !important; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
            }
            .card-strip p { 
              color: rgba(255,255,255,0.6) !important; 
              font-size: 8px; 
              letter-spacing: 1px; 
              text-transform: uppercase; 
              margin: 0; 
            }
            
            @media print { 
              body { padding: 0; background: white !important; } 
              .id-card { box-shadow: none; margin: 20px auto; } 
              .no-print { display: none !important; } 
              @page { margin: 10mm; size: landscape; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: center;">
            <div class="id-card">
              <!-- Left Panel with SGI Photo Watermark -->
              <div class="card-left">
                <img src="/images/sgiphoto.jpg" class="watermark-img" alt="">
                <div class="card-top">
                  <div class="card-logo">
                    <span class="logo-badge">SGI</span>
                  </div>
                  <div class="college-name">Sanjeevan Engineering &amp;<br>Technology Institute</div>
                  <div class="card-type-badge">Bus Transport Pass</div>
                </div>
                <div class="card-info">
                  <div class="info-row"><div class="info-label">Bus Number</div><div class="info-value">${s.bus_number || 'Not Assigned'}</div></div>
                  <div class="info-row"><div class="info-label">Route</div><div class="info-value">${s.route || 'N/A'}</div></div>
                  <div class="info-row"><div class="info-label">Phone</div><div class="info-value">${s.phone || 'N/A'}</div></div>
                </div>
                <div class="card-validity">
                  <div><div class="v-label">Valid From</div><div class="v-date">${validFrom}</div></div>
                  <div><div class="v-label">Valid To</div><div class="v-date">${validTo}</div></div>
                </div>
              </div>
              
              <!-- Right Panel with Photo -->
              <div class="card-right">
                <div class="card-right-accent"></div>
                <div class="photo-frame">${s.photo_url ? '<img src="' + s.photo_url + '" alt="Photo">' : '<div class="no-photo">&#128100;</div>'}</div>
                <div class="student-name">${s.name}</div>
                <div class="student-roll">${s.roll_no}</div>
                <div class="student-dept">${s.department || ''} ${s.course_year ? '| ' + s.course_year : ''} ${s.section ? '| Sec ' + s.section : ''}</div>
              </div>
              
              <!-- Bottom Strip -->
              <div class="card-strip"><p>Sanjeevan Knowledge City, Panhala &bull; Computer Generated Pass</p></div>
            </div>
            
            <div class="no-print" style="margin-top: 25px; display: flex; gap: 10px; justify-content: center;">
              <button onclick="window.print()" style="padding: 14px 40px; background: #023047; color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 15px; font-weight: 700; font-family: inherit; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">&#128424;</span> Print / Save as PDF
              </button>
            </div>
          </div>
          <script>window.onload = function() { setTimeout(function(){ window.print(); }, 1000); }<\/script>
        </body>
      </html>
    `);
    passWindow.document.close();
  } catch (error) {
    console.error('Error generating bus pass:', error);
    alert('Failed to generate bus pass.');
  }
}

let isSendingEmail = false;
// Send email fee reminder
async function sendEmailReminder(studentId) {
  if (isSendingEmail) return;
  if (!confirm('Send fee reminder email to this student?')) return;

  const originalBtn = event && event.target && event.target.closest ? event.target.closest('button') : null;
  const originalHtml = originalBtn ? originalBtn.innerHTML : '';
  if (originalBtn) {
    originalBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    originalBtn.style.opacity = '0.7';
  }

  isSendingEmail = true;
  try {
    const res = await apiFetch(`/api/reminders/send-email-reminder/${studentId}`, { method: 'POST' });
    if (res.success) {
      alert(res.message);
    } else {
      alert(res.message || 'Failed to send reminder');
    }
  } catch (error) {
    console.error('Error sending reminder:', error);
    alert('Failed to send email reminder. Check email configuration.');
  } finally {
    isSendingEmail = false;
    if (originalBtn) {
      originalBtn.innerHTML = originalHtml;
      originalBtn.style.opacity = '1';
    }
  }
}

// --- Bulk WhatsApp Messaging ---
async function bulkWhatsApp() {
  try {
    const res = await apiFetch('/api/students');
    if (!Array.isArray(res)) { alert('Failed to load students'); return; }
    const studentsWithPhone = res.filter(s => s.phone && s.phone.trim());
    if (studentsWithPhone.length === 0) { alert('No students have phone numbers saved.'); return; }

    const defaultMsg = 'Dear Student, this is a reminder from SGI Bus Transport regarding your bus fees. Please clear your pending dues at the earliest. Thank you.';
    const message = prompt('Enter message to send to ALL students via WhatsApp (' + studentsWithPhone.length + ' students):', defaultMsg);
    if (!message) return;

    // Build a modal with individual send buttons (avoids popup blockers)
    const rows = studentsWithPhone.map((s, i) => {
      const phone = '91' + s.phone.replace(/\D/g, '');
      const personalMsg = encodeURIComponent('Hi ' + s.name + ', ' + message);
      const waUrl = `https://wa.me/${phone}?text=${personalMsg}`;
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.07);">
          <td style="padding:8px 6px;font-weight:600;">${i + 1}</td>
          <td style="padding:8px 6px;">${s.name}</td>
          <td style="padding:8px 6px;color:#94a3b8;">${s.phone}</td>
          <td style="padding:8px 6px;">
            <a href="${waUrl}" target="_blank" rel="noopener" 
               style="display:inline-flex;align-items:center;gap:6px;background:#25d366;color:white;padding:6px 14px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">
              <i class="fa-brands fa-whatsapp"></i> Send
            </a>
          </td>
        </tr>`;
    }).join('');

    const modalHtml = `
      <div id="waModal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;">
        <div style="background:#1e293b;border-radius:16px;padding:28px;width:100%;max-width:600px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
            <h3 style="color:#ffb703;margin:0;display:flex;align-items:center;gap:10px;">
              <i class="fa-brands fa-whatsapp" style="color:#25d366;font-size:1.3rem;"></i>
              Bulk WhatsApp — ${studentsWithPhone.length} Students
            </h3>
            <button onclick="document.getElementById('waModal').remove()" 
              style="background:transparent;border:none;color:#94a3b8;font-size:1.6rem;cursor:pointer;line-height:1;">&times;</button>
          </div>
          <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:12px 14px;margin-bottom:16px;color:#e2e8f0;font-size:13px;word-break:break-word;">
            <span style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px;">Message Preview</span>
            Hi [Student Name], ${message}
          </div>
          <p style="color:#94a3b8;font-size:12px;margin:0 0 12px;">
            <i class="fa-solid fa-circle-info"></i>
            Click <strong style="color:#25d366;">Send</strong> next to each student. WhatsApp will open in a new tab with the message pre-filled.
          </p>
          <div style="overflow-y:auto;flex:1;">
            <table style="width:100%;border-collapse:collapse;color:#e2e8f0;font-size:14px;">
              <thead>
                <tr style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.15);">
                  <th style="padding:8px 6px;text-align:left;">#</th>
                  <th style="padding:8px 6px;text-align:left;">Name</th>
                  <th style="padding:8px 6px;text-align:left;">Phone</th>
                  <th style="padding:8px 6px;text-align:left;">Action</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div style="margin-top:16px;text-align:right;">
            <button onclick="document.getElementById('waModal').remove()" 
              style="padding:10px 24px;background:#334155;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">Close</button>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } catch (e) {
    console.error(e);
    alert('Error loading students for bulk WhatsApp.');
  }
}

// --- Bulk Email Reminder ---
async function bulkEmailReminder() {
  if (!confirm('Send fee reminder emails to ALL students with pending fees?')) return;
  try {
    const res = await apiFetch('/api/reminders/send-bulk-reminders', { method: 'POST' });
    if (res.success) {
      alert(res.message || 'Bulk reminders sent successfully!');
    } else {
      alert(res.message || 'Failed to send bulk reminders. Check email config.');
    }
  } catch (e) {
    console.error(e);
    alert('Error sending bulk email reminders. Make sure email is configured in server.');
  }
}

// --- Send WhatsApp to Driver ---
function sendDriverWhatsApp(id, name, phone) {
  const defaultMsg = 'Hello ' + name + ', this is a message from SGI Bus Transport Admin.';
  const message = prompt('Enter message to send to driver ' + name + ':', defaultMsg);
  if (!message) return;
  const url = 'https://wa.me/91' + phone + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank');
}

// --- Theme Toggle Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('sgiTheme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  }
  const userProfile = document.querySelector('.user-profile');
  if (userProfile) {
    userProfile.style.display = 'flex';
    userProfile.style.alignItems = 'center';
    userProfile.style.gap = '15px';
    const themeBtn = document.createElement('button');
    themeBtn.className = 'theme-toggle';
    themeBtn.style.cssText = 'background:transparent;border:none;cursor:pointer;font-size:1.2rem;color:var(--gray);';
    themeBtn.innerHTML = savedTheme === 'light' ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    userProfile.insertBefore(themeBtn, userProfile.firstChild);
    themeBtn.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      const isLight = document.body.classList.contains('light-theme');
      localStorage.setItem('sgiTheme', isLight ? 'light' : 'dark');
      themeBtn.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    });
  }
});

// --- Mobile Menu Drawer Logic ---
document.addEventListener('DOMContentLoaded', () => {
  const topHeader = document.querySelector('.top-header');
  const dashboardLayout = document.querySelector('.dashboard-layout');
  const sidebar = document.querySelector('.sidebar');

  if (topHeader && dashboardLayout && sidebar) {
    const mobileBtn = document.createElement('button');
    mobileBtn.className = 'mobile-menu-btn';
    mobileBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    topHeader.insertBefore(mobileBtn, topHeader.firstChild);

    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    dashboardLayout.appendChild(overlay);

    mobileBtn.addEventListener('click', () => {
      sidebar.classList.add('open');
      overlay.classList.add('active');
    });

    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    });

    sidebar.querySelectorAll('.sidebar-menu a').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    });
  }
});

// --- Password Reset Logic ---
document.addEventListener('DOMContentLoaded', () => {
  // Admin Request Reset
  const adminResetForm = document.getElementById('adminResetForm');
  if (adminResetForm) {
    adminResetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('admin_email').value;
      const msgEl = document.getElementById('adminResetMsg');
      try {
        const res = await apiFetch('/api/admin/request-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        if (res.success) {
          msgEl.innerHTML = '<span style="color:#4ade80;">? ' + res.message + '</span>';
          adminResetForm.style.display = 'none';
          document.getElementById('adminResetTokenForm').style.display = 'block';
        } else {
          msgEl.innerHTML = '<span style="color:#f87171;">? ' + res.message + '</span>';
        }
      } catch (err) {
        msgEl.innerHTML = '<span style="color:#f87171;">? Error sending request.</span>';
      }
    });
  }

  // Admin Submit Token
  const adminResetTokenForm = document.getElementById('adminResetTokenForm');
  if (adminResetTokenForm) {
    adminResetTokenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('admin_email').value;
      const token = document.getElementById('reset_token').value;
      const newPassword = document.getElementById('new_password').value;
      const confirmPassword = document.getElementById('confirm_password').value;
      const msgEl = document.getElementById('adminResetMsg');

      if (newPassword !== confirmPassword) {
        msgEl.innerHTML = '<span style="color:#f87171;">? Passwords do not match.</span>';
        return;
      }

      try {
        const res = await apiFetch('/api/admin/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token, newPassword })
        });
        if (res.success) {
          alert('✅ ' + res.message);
          window.location.href = 'admin_secure_login.html';
        } else {
          msgEl.innerHTML = '<span style="color:#f87171;">❌ ' + res.message + '</span>';
        }
      } catch (err) {
        msgEl.innerHTML = '<span style="color:#f87171;">? Error resetting password.</span>';
      }
    });
  }

  // Student Request Reset
  const studentResetForm = document.getElementById('studentResetForm');
  if (studentResetForm) {
    studentResetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('student_email').value;
      const msgEl = document.getElementById('studentResetMsg');
      try {
        const res = await apiFetch('/api/student-reset/request-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        if (res.success) {
          msgEl.innerHTML = '<span style="color:#4ade80;">? ' + res.message + '</span>';
          studentResetForm.style.display = 'none';
          document.getElementById('studentResetTokenForm').style.display = 'block';
        } else {
          msgEl.innerHTML = '<span style="color:#f87171;">? ' + res.message + '</span>';
        }
      } catch (err) {
        msgEl.innerHTML = '<span style="color:#f87171;">? Error sending request.</span>';
      }
    });
  }

  // Student Submit Token
  const studentResetTokenForm = document.getElementById('studentResetTokenForm');
  if (studentResetTokenForm) {
    studentResetTokenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('student_email').value;
      const token = document.getElementById('reset_token').value;
      const newPassword = document.getElementById('new_password').value;
      const confirmPassword = document.getElementById('confirm_password').value;
      const msgEl = document.getElementById('studentResetMsg');

      if (newPassword !== confirmPassword) {
        msgEl.innerHTML = '<span style="color:#f87171;">? Passwords do not match.</span>';
        return;
      }

      try {
        const res = await apiFetch('/api/student-reset/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token, newPassword })
        });
        if (res.success) {
          alert('✅ ' + res.message);
          window.location.href = 'login.html';
        } else {
          msgEl.innerHTML = '<span style="color:#f87171;">❌ ' + res.message + '</span>';
        }
      } catch (err) {
        msgEl.innerHTML = '<span style="color:#f87171;">? Error resetting password.</span>';
      }
    });
  }
});

// Enhanced View Student Details with Full Fee Management
async function viewStudentDetails(id) {
  try {
    const res = await apiFetch(`/api/students/get/${id}`);
    const paymentsRes = await apiFetch(`/api/students/${id}/payments`);

    if (!res || !res.success) {
      alert('Failed to load student data');
      return;
    }

    const s = res.student;
    const payments = paymentsRes.success ? paymentsRes.payments : [];

    // Store for receipt printing
    window.currentStudentData = s;
    window.currentPayments = payments;

    // Calculate fee progress
    const totalFees = parseFloat(s.total_fees || 0);
    const feesPaid = parseFloat(s.fees_paid || 0);
    const remainingFees = parseFloat(s.remaining_fees || 0);
    const feeProgress = totalFees > 0 ? Math.min(100, (feesPaid / totalFees) * 100) : 0;
    const progressColor = feeProgress >= 100 ? '#10b981' : feeProgress >= 50 ? '#f59e0b' : '#ef4444';

    let paymentsHtml = '';
    if (payments.length > 0) {
      paymentsHtml = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
          <thead>
            <tr style="border-bottom: 2px solid rgba(255,255,255,0.15); text-align: left;">
              <th style="padding: 8px 6px; color: var(--clr-muted, #94a3b8); font-size: 0.72rem; text-transform: uppercase;">Receipt</th>
              <th style="padding: 8px 6px; color: var(--clr-muted, #94a3b8); font-size: 0.72rem; text-transform: uppercase;">Date</th>
              <th style="padding: 8px 6px; color: var(--clr-muted, #94a3b8); font-size: 0.72rem; text-transform: uppercase;">Amount</th>
              <th style="padding: 8px 6px; color: var(--clr-muted, #94a3b8); font-size: 0.72rem; text-transform: uppercase;">Mode</th>
              <th style="padding: 8px 6px; color: var(--clr-muted, #94a3b8); font-size: 0.72rem; text-transform: uppercase;">UTR</th>
              <th style="padding: 8px 6px; color: var(--clr-muted, #94a3b8); font-size: 0.72rem; text-transform: uppercase;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${payments.map(p => {
        const receiptNo = p.receipt_number || 'REC-' + p.id.toString().padStart(5, '0');
        return `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                <td style="padding: 8px 6px; font-weight: 600; color: var(--clr-accent, #f59e0b);">${escapeHtml(receiptNo)}</td>
                <td style="padding: 8px 6px;">${new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                <td style="padding: 8px 6px; color: #34d399; font-weight: 700;">₹${parseFloat(p.amount).toLocaleString('en-IN')}</td>
                <td style="padding: 8px 6px;">${escapeHtml(p.payment_mode)}</td>
                <td style="padding: 8px 6px; color: var(--clr-muted, #94a3b8);">${escapeHtml(p.utr_number || '-')}</td>
                <td style="padding: 6px; display: flex; gap: 4px; flex-wrap: wrap;">
                  <button onclick="window.printStudentReceipt(${p.id})" style="padding:4px 8px;background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.3);border-radius:4px;cursor:pointer;font-size:0.72rem;font-weight:600;" title="Print Receipt"><i class="fa-solid fa-print"></i></button>
                  <button onclick="resendReceiptEmail(${p.id})" style="padding:4px 8px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);border-radius:4px;cursor:pointer;font-size:0.72rem;font-weight:600;" title="Email Receipt"><i class="fa-solid fa-envelope"></i></button>
                  <button onclick="sendReceiptWhatsApp(${p.id})" style="padding:4px 8px;background:rgba(37,211,102,0.15);color:#25d366;border:1px solid rgba(37,211,102,0.3);border-radius:4px;cursor:pointer;font-size:0.72rem;font-weight:600;" title="WhatsApp Receipt"><i class="fa-brands fa-whatsapp"></i></button>
                </td>
              </tr>`;
      }).join('')}
          </tbody>
        </table>
      `;
    } else {
      paymentsHtml = '<p style="text-align:center;color:var(--clr-muted,#94a3b8);padding:20px;"><i class="fa-solid fa-receipt" style="font-size:1.5rem;opacity:0.3;display:block;margin-bottom:8px;"></i>No payments recorded yet.</p>';
    }

    const content = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <!-- Student Info -->
        <div style="background: rgba(255,255,255,0.04); padding: 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
          <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
            ${s.photo_url ? '<img src="' + s.photo_url + '" style="width: 55px; height: 55px; border-radius: 50%; object-fit: cover; border: 2px solid var(--clr-accent, #f59e0b);">' : '<div style="width: 55px; height: 55px; border-radius: 50%; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user" style="font-size: 1.3rem; color: var(--clr-muted);"></i></div>'}
            <div>
              <h4 style="margin: 0; color: var(--clr-accent, #f59e0b); font-size: 1.05rem;">${escapeHtml(s.name)}</h4>
              <p style="margin: 2px 0; font-size: 0.82rem; color: var(--clr-muted, #94a3b8);">${escapeHtml(s.roll_no)} | ${escapeHtml(s.department || 'N/A')}</p>
              <p style="margin: 0; font-size: 0.78rem; color: var(--clr-muted, #94a3b8);">${escapeHtml(s.course_year || '')} ${s.section ? 'Sec ' + escapeHtml(s.section) : ''}</p>
            </div>
          </div>
          <div style="font-size: 0.85rem; line-height: 1.8;">
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-graduation-cap" style="width:16px;color:var(--clr-accent);"></i></strong> Class: ${escapeHtml(s.class_name || 'N/A')}</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-user-circle" style="width:16px;color:var(--clr-accent);"></i></strong> Username: ${escapeHtml(s.username || 'N/A')}</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-lock" style="width:16px;color:var(--clr-accent);"></i></strong> Password: (Encrypted)</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-phone" style="width:16px;color:var(--clr-accent);"></i> Mobile No:</strong> ${escapeHtml(s.phone || 'N/A')} ${s.phone ? '<a href="https://wa.me/91' + s.phone.replace(/\D/g, '') + '" target="_blank" style="color:#25d366;margin-left:6px;" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>' : ''}</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-envelope" style="width:16px;color:var(--clr-accent);"></i> Email:</strong> ${escapeHtml(s.email || 'N/A')}</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-location-dot" style="width:16px;color:var(--clr-accent);"></i></strong> Pick-up: ${escapeHtml(s.pick_up_point || 'N/A')}</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-bus" style="width:16px;color:var(--clr-accent);"></i></strong> Bus No: ${escapeHtml(s.bus_number || 'Not Assigned')} ${s.short_name ? '(' + escapeHtml(s.short_name) + ')' : ''}</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-id-badge" style="width:16px;color:var(--clr-accent);"></i></strong> Driver: ${escapeHtml(s.driver_name || 'N/A')} ${s.driver_phone ? '(' + escapeHtml(s.driver_phone) + ')' : ''}</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-calendar" style="width:16px;color:var(--clr-accent);"></i></strong> Joined: ${formatDate(s.joining_date)}</p>
            <p style="margin: 4px 0;"><strong><i class="fa-solid fa-id-card" style="width:16px;color:var(--clr-accent);"></i></strong> Pass: ${s.pass_valid_from ? formatDate(s.pass_valid_from) + ' → ' + formatDate(s.pass_valid_to) : 'Not Set'}</p>
          </div>
        </div>

        <!-- Fee Summary -->
        <div style="background: rgba(255,255,255,0.04); padding: 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
          <h4 style="margin: 0 0 14px 0; color: var(--clr-accent, #f59e0b); display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-indian-rupee-sign"></i> Fee Summary</h4>
          
          <!-- Progress Bar -->
          <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--clr-muted); margin-bottom: 6px;">
              <span>Payment Progress</span>
              <span style="font-weight: 700; color: ${progressColor};">${feeProgress.toFixed(0)}%</span>
            </div>
            <div style="height: 10px; background: rgba(255,255,255,0.08); border-radius: 5px; overflow: hidden;">
              <div style="height: 100%; width: ${feeProgress}%; background: ${progressColor}; border-radius: 5px; transition: width 0.5s ease;"></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px;">
            <div style="background: rgba(255,255,255,0.04); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid rgba(255,255,255,0.06);">
              <div style="font-size: 0.7rem; color: var(--clr-muted); text-transform: uppercase; letter-spacing: 0.5px;">Total Fees</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #f1f5f9; margin-top: 4px;">₹${totalFees.toLocaleString('en-IN')}</div>
            </div>
            <div style="background: rgba(16,185,129,0.08); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid rgba(16,185,129,0.15);">
              <div style="font-size: 0.7rem; color: #34d399; text-transform: uppercase; letter-spacing: 0.5px;">Paid</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #34d399; margin-top: 4px;">₹${feesPaid.toLocaleString('en-IN')}</div>
            </div>
            <div style="background: rgba(239,68,68,0.08); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid rgba(239,68,68,0.15);">
              <div style="font-size: 0.7rem; color: #f87171; text-transform: uppercase; letter-spacing: 0.5px;">Remaining</div>
              <div style="font-size: 1.15rem; font-weight: 800; color: #f87171; margin-top: 4px;">₹${remainingFees.toLocaleString('en-IN')}</div>
            </div>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button onclick="closeModal(); setTimeout(()=>payFees(${s.id}), 300)" style="flex:1;padding:10px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="fa-solid fa-indian-rupee-sign"></i> Pay Fees</button>
            ${remainingFees <= 0 ? `<button onclick="printNoDuesReceipt(${s.id})" style="flex:1;padding:10px;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="fa-solid fa-file-invoice"></i> No Dues</button>` : ''}
            <button onclick="generateBusPass(${s.id})" style="flex:1;padding:10px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="fa-solid fa-id-card"></i> Bus Pass</button>
            <button onclick="resetStudentPassword(${s.id})" style="flex:1;padding:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="fa-solid fa-key"></i> Reset Pass</button>
            <button onclick="closeModal(); setTimeout(()=>deleteStudent(${s.id}), 300)" style="flex:1;padding:10px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:6px;"><i class="fa-solid fa-trash"></i> Delete</button>
          </div>
        </div>
      </div>
      
      <!-- Payment History -->
      <div style="background: rgba(255,255,255,0.04); padding: 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);">
        <h4 style="margin: 0 0 12px 0; color: var(--clr-accent, #f59e0b); display: flex; align-items: center; justify-content: space-between;">
          <span><i class="fa-solid fa-clock-rotate-left"></i> Payment History (${payments.length})</span>
        </h4>
        <div style="max-height: 220px; overflow-y: auto;">
          ${paymentsHtml}
        </div>
      </div>
    `;

    showModal(`Student Details: ${escapeHtml(s.name)}`, content, () => {
      closeModal();
      setTimeout(() => editStudent(s.id), 300);
    });

    // Change Save button text to "Edit Student"
    document.getElementById('modalSaveBtn').textContent = 'Edit Student';

    // Make modal wider for student details
    const modalContent = document.querySelector('#dynamicModal .modal-content');
    if (modalContent) {
      modalContent.style.maxWidth = '850px';
      modalContent.style.width = '95%';
    }

  } catch (error) {
    console.error('Error viewing student details:', error);
    alert('Failed to load student details.');
  }
}

// Send receipt via WhatsApp
function sendReceiptWhatsApp(paymentId) {
  const s = window.currentStudentData;
  const p = window.currentPayments ? window.currentPayments.find(pay => pay.id === paymentId) : null;
  if (!s || !p) { alert('Payment data not found'); return; }
  if (!s.phone) { alert('Student does not have a phone number'); return; }

  const receiptNo = p.receipt_number || 'REC-' + p.id.toString().padStart(5, '0');
  const date = new Date(p.payment_date).toLocaleDateString('en-IN');
  const msg = `*🧾 FEE RECEIPT*\n` +
    `━━━━━━━━━━━━━━━\n` +
    `*Receipt No:* ${receiptNo}\n` +
    `*Date:* ${date}\n\n` +
    `*Student:* ${s.name}\n` +
    `*Roll No:* ${s.roll_no}\n` +
    `*Department:* ${s.department || 'N/A'}\n\n` +
    `*Amount Paid:* ₹${parseFloat(p.amount).toLocaleString('en-IN')}\n` +
    `*Payment Mode:* ${p.payment_mode}${p.utr_number ? ' (UTR: ' + p.utr_number + ')' : ''}\n\n` +
    `*Total Fees:* ₹${parseFloat(s.total_fees || 0).toLocaleString('en-IN')}\n` +
    `*Total Paid:* ₹${parseFloat(s.fees_paid || 0).toLocaleString('en-IN')}\n` +
    `*Remaining:* ₹${parseFloat(s.remaining_fees || 0).toLocaleString('en-IN')}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `_SGI Bus Transport System_`;

  const phone = '91' + s.phone.replace(/\D/g, '');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Resend receipt email
async function resendReceiptEmail(paymentId) {
  if (!confirm('Send receipt email to the student?')) return;
  try {
    const res = await apiFetch(`/api/students/resend-receipt/${paymentId}`, { method: 'POST' });
    if (res.success) {
      alert('✅ ' + res.message);
    } else {
      alert('❌ ' + (res.message || 'Failed to send email'));
    }
  } catch (e) {
    alert('Error sending receipt email');
  }
}

window.downloadStudentPDF = function () {
  if (!window.jspdf) {
    alert('PDF library not loaded yet.');
    return;
  }
  const students = window.currentFilteredStudents || [];
  if (students.length === 0) {
    alert('No students to download.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('landscape');

  doc.setFontSize(18);
  doc.text('Student Directory', 14, 22);

  let filtersText = '';
  const fClassEl = document.getElementById('filterClass');
  const fStatusEl = document.getElementById('filterStatus');

  const fClass = fClassEl && fClassEl.selectedIndex > 0 ? fClassEl.options[fClassEl.selectedIndex].text : 'All Classes';
  const fStatus = fStatusEl && fStatusEl.selectedIndex > 0 ? fStatusEl.options[fStatusEl.selectedIndex].text : 'All Students';

  filtersText = `Filters: ${fClass} | ${fStatus}`;

  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(filtersText, 14, 30);

  const tableColumn = ["Sr No", "Name", "Class", "Bus No", "Pick-up", "Old Fees (Pending fees till March 26)", "Fees Apr 26 - Mar 27", "Total Fees", "Concession", "Paid Fees", "Remaining Fees"];
  const tableRows = [];

  students.forEach((s, index) => {
    const studentData = [
      `${index + 1}`,
      s.name,
      s.class_name || 'N/A',
      s.bus_number || 'None',
      s.pick_up_point || 'N/A',
      `${parseFloat(s.old_bus_fees || 0)}`,
      `${parseFloat(s.current_fees || 0)}`,
      `${parseFloat(s.total_fees || 0)}`,
      `${parseFloat(s.discount_amount || 0)}`,
      `${parseFloat(s.fees_paid || 0)}`,
      `${parseFloat(s.remaining_fees || 0)}`
    ];
    tableRows.push(studentData);
  });

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: 35,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 }
  });

  doc.save('student_list.pdf');
}

window.printStudentReceipt = async function (paymentId) {
  if (!window.currentStudentData || !window.currentPayments) return;
  const p = window.currentPayments.find(pay => pay.id === paymentId);
  if (p) {
    const paymentObj = {
      amount: parseFloat(p.amount),
      payment_mode: p.payment_mode,
      utr_number: p.utr_number,
      date: p.payment_date
    };

    // Fetch global payment cycle
    let activeCycle = window.currentStudentData.payment_cycle || '';
    if (!activeCycle) {
      try {
        const sRes = await apiFetch('/api/settings');
        if (sRes.success && sRes.settings && sRes.settings.payment_cycle) {
          activeCycle = sRes.settings.payment_cycle;
        }
      } catch (e) { console.warn(e); }
    }

    const studentWithCycle = { ...window.currentStudentData, payment_cycle: activeCycle };
    generateReceipt(studentWithCycle, paymentObj, p.receipt_number || p.id);
  }
};

window.printNoDuesReceipt = async function (id) {
  try {
    const res = await apiFetch(`/api/students/get/${id}`);
    if (!res || !res.success) { alert('Failed to load student data'); return; }
    const student = res.student;
    if (parseFloat(student.remaining_fees || 0) > 0) { alert('Student still has dues pending!'); return; }

    // Fetch global payment cycle
    if (!student.payment_cycle) {
      try {
        const sRes = await apiFetch('/api/settings');
        if (sRes.success && sRes.settings && sRes.settings.payment_cycle) {
          student.payment_cycle = sRes.settings.payment_cycle;
        }
      } catch (e) { console.warn(e); }
    }

    generateNoDuesCertificate(student);
  } catch (error) {
    console.error('Error generating NO DUES certificate:', error);
    alert('Failed to generate NO DUES certificate.');
  }
};

function generateNoDuesCertificate(student) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const certNo = 'NDC/' + today.getFullYear() + '/' + String(student.id).padStart(4, '0');
  const photoHtml = student.photo_url
    ? `<img src="${student.photo_url}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid #7d3c43;display:block;margin:0 auto 8px;" alt="Photo">`
    : `<div style="width:90px;height:90px;border-radius:50%;border:2px dashed #7d3c43;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;color:#7d3c43;font-size:2rem;">👤</div>`;

  const certWin = window.open('', '_blank', 'width=800,height=1050');
  certWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>No Dues Certificate - ${student.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Georgia, serif;
      background: #e8e8e8;
      display: flex; justify-content: center; align-items: flex-start;
      padding: 20px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .page {
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      padding: 18mm 18mm 14mm 18mm;
      position: relative;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    }
    /* Decorative outer border */
    .outer-border {
      border: 5px double #7d3c43;
      padding: 14px;
      height: 100%;
      min-height: calc(297mm - 32mm);
      display: flex;
      flex-direction: column;
      position: relative;
    }
    .inner-border {
      border: 1.5px solid #7d3c43;
      padding: 16px 20px;
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    /* Corner ornaments */
    .corner { position: absolute; width: 30px; height: 30px; color: #7d3c43; font-size: 22px; line-height: 1; }
    .corner.tl { top: 4px; left: 4px; }
    .corner.tr { top: 4px; right: 4px; }
    .corner.bl { bottom: 4px; left: 4px; }
    .corner.br { bottom: 4px; right: 4px; }

    /* Header */
    .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #7d3c43; padding-bottom: 12px; margin-bottom: 10px; }
    .logo-wrap { width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; }
    .logo-wrap img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .college-info { text-align: center; flex: 1; }
    .col-small { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #555; margin-bottom: 2px; }
    .col-name { font-size: 26px; font-weight: bold; color: #7d3c43; letter-spacing: 2px; line-height: 1.1; }
    .col-sub { font-size: 11px; color: #7d3c43; font-weight: bold; margin-top: 3px; }
    .col-addr { font-size: 9px; color: #666; margin-top: 3px; }
    .right-box { font-size: 9px; color: #555; border-left: 1.5px solid #7d3c43; padding-left: 10px; min-width: 140px; line-height: 1.6; }
    .right-box b { color: #7d3c43; }

    /* Certificate Title */
    .cert-title-wrap { text-align: center; margin: 12px 0 10px; }
    .cert-title {
      display: inline-block;
      font-size: 19px;
      font-weight: bold;
      letter-spacing: 3px;
      color: #fff;
      background: #7d3c43;
      padding: 7px 30px;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .cert-no-row { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin: 8px 0; font-weight: bold; }

    /* Photo + Details Row */
    .main-row { display: flex; gap: 20px; align-items: flex-start; margin: 10px 0; }
    .photo-col { flex-shrink: 0; text-align: center; }
    .photo-label { font-size: 9px; color: #888; margin-top: 3px; }
    .details-col { flex: 1; }

    /* Details Table */
    .det-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .det-table td { padding: 6px 8px; border: 1px solid #d4a5a8; }
    .det-table td:first-child { color: #7d3c43; font-weight: bold; width: 38%; background: #fcf8f8; }
    .det-table td:last-child { color: #222; font-weight: 600; }

    /* Certificate Body Text */
    .cert-body { margin: 14px 0 10px; font-size: 13px; line-height: 1.8; color: #222; text-align: justify; }
    .cert-body b { color: #7d3c43; }
    .highlight { display: inline-block; background: #fcf8f8; border: 1px solid #d4a5a8; padding: 2px 8px; border-radius: 3px; font-weight: bold; color: #7d3c43; }

    /* Cleared Badge */
    .cleared-badge {
      display: block;
      margin: 8px auto;
      width: fit-content;
      background: #dcfce7;
      border: 2px solid #16a34a;
      color: #15803d;
      padding: 6px 24px;
      border-radius: 20px;
      font-weight: bold;
      font-size: 13px;
      letter-spacing: 1px;
    }

    /* Signature Row */
    .sig-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 18px; border-top: 1px dashed #c9a0a3; }
    .sig-box { text-align: center; }
    .sig-line { border-top: 1.5px solid #7d3c43; width: 160px; margin: 28px auto 4px; }
    .sig-label { font-size: 10.5px; color: #7d3c43; font-weight: bold; }
    .sig-sub { font-size: 9px; color: #888; }

    /* Stamp area */
    .stamp-area { width: 90px; height: 90px; border: 2px dashed #ccc; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #bbb; font-size: 9px; text-align: center; }

    /* Note */
    .note { font-size: 9px; color: #888; text-align: center; margin-top: 10px; font-style: italic; border-top: 1px solid #eee; padding-top: 6px; }

    @media print {
      body { padding: 0; background: white; }
      .page { box-shadow: none; width: 210mm; min-height: 297mm; }
      @page { size: A4 portrait; margin: 0; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="outer-border">
    <span class="corner tl">❧</span>
    <span class="corner tr" style="transform:scaleX(-1);">❧</span>
    <span class="corner bl" style="transform:scaleY(-1);">❧</span>
    <span class="corner br" style="transform:scale(-1);">❧</span>

    <div class="inner-border">
      <!-- HEADER -->
      <div class="header">
        <div class="logo-wrap">
          <img src="/images/sgilogo.png" alt="Logo" onerror="this.style.display='none'">
        </div>
        <div class="college-info">
          <div class="col-small">Holy-Wood Academy's</div>
          <div class="col-name">SANJEEVAN</div>
          <div class="col-sub">PUBLIC SCHOOL, PANHALA.</div>
          <div class="col-addr">At. Sanjeevan Group of Schools, Somwar Peth-Injole, Post. &amp; Tal. Panhala, Dist. Kolhapur - 416201.</div>
        </div>
        <div class="right-box">
          <div><b>Affiliation No.:</b> 1130172</div>
          <div><b>UDISE No.:</b> 27340202704</div>
          <div><b>School Code:</b> 30128</div>
          <div><b>Ph:</b> +91-XXXXXXXXXX</div>
        </div>
      </div>

      <!-- TITLE -->
      <div class="cert-title-wrap">
        <span class="cert-title">✦ No Dues Certificate ✦</span>
      </div>
      <div class="cert-no-row">
        <span>Certificate No: <b>${certNo}</b></span>
        <span>Date of Issue: <b>${dateStr}</b></span>
      </div>

      <!-- PHOTO + DETAILS -->
      <div class="main-row">
        <div class="photo-col">
          ${photoHtml}
          <div class="photo-label">Student Photo</div>
        </div>
        <div class="details-col">
          <table class="det-table">
            <tr><td>Student Name</td><td>${student.name || 'N/A'}</td></tr>
            <tr><td>Roll / Reg. No.</td><td>${student.roll_no || 'N/A'}</td></tr>
            <tr><td>Department</td><td>${student.department || 'N/A'}</td></tr>
            <tr><td>Course / Year</td><td>${student.course_year || 'N/A'}</td></tr>
            <tr><td>Section</td><td>${student.section || 'N/A'}</td></tr>
            <tr><td>Bus No.</td><td>${student.bus_number || 'N/A'}</td></tr>
            <tr><td>Route</td><td>${student.route || 'N/A'}</td></tr>
            <tr><td>Payment Cycle</td><td><span class="highlight">${student.payment_cycle || 'N/A'}</span></td></tr>
            <tr><td>Total Bus Fees</td><td>₹${parseFloat(student.total_fees || 0).toLocaleString('en-IN')}</td></tr>
            <tr><td>Fees Paid</td><td>₹${parseFloat(student.fees_paid || 0).toLocaleString('en-IN')}</td></tr>
            <tr><td>Remaining Dues</td><td style="color:#16a34a;font-weight:bold;">₹ NIL</td></tr>
          </table>
        </div>
      </div>

      <!-- BODY TEXT -->
      <div class="cert-body">
        This is to certify that the above named student <b>${student.name}</b>, bearing Roll/Reg. No. <b>${student.roll_no || 'N/A'}</b>,
        of <b>${student.department || 'N/A'}</b> — <b>${student.course_year || ''}</b>, has <b>cleared all bus transportation fees</b>
        for the current academic year. No dues are outstanding against this student as on the date of issue of this certificate.
      </div>

      <div style="text-align:center;">
        <span class="cleared-badge">✅ ALL BUS FEES CLEARED — NO DUES PENDING</span>
      </div>

      <!-- SIGNATURES -->
      <div class="sig-row">
        <div class="sig-box">
          <div class="stamp-area">Official<br>Stamp</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-label">Accountant / Cashier</div>
          <div class="sig-sub">Sanjeevan Public School</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-label">Principal</div>
          <div class="sig-sub">Sanjeevan Public School</div>
        </div>
      </div>

      <div class="note">* This certificate is issued on request and is valid for official purposes only. &nbsp;|&nbsp; Generated on: ${dateStr}</div>
    </div><!-- inner-border -->
  </div><!-- outer-border -->
</div><!-- page -->
<script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`);
  certWin.document.close();
}

// ===================== ADMIN MANAGEMENT (Super Admin) =====================
async function loadAdminList() {
  try {
    const res = await apiFetch('/api/admin/list');
    if (!res.success) { alert(res.message || 'Failed to load admins'); return; }

    const admins = res.admins || [];
    const rows = admins.map((a, i) => {
      const isSuperAdmin = a.role === 'super_admin';
      const roleLabel = isSuperAdmin ? '<span style="color:#f59e0b;font-weight:700;">Super Admin</span>' : '<span style="color:#60a5fa;">Admin</span>';
      return `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="padding:10px 8px;">${i + 1}</td>
          <td style="padding:10px 8px;font-weight:600;">${escapeHtml(a.username)}</td>
          <td style="padding:10px 8px;color:var(--clr-muted);">${escapeHtml(a.email)}</td>
          <td style="padding:10px 8px;">${roleLabel}</td>
          <td style="padding:10px 8px;color:var(--clr-muted);font-size:0.82rem;">${new Date(a.created_at).toLocaleDateString('en-IN')}</td>
          <td style="padding:10px 8px;">
            ${!isSuperAdmin ? `
              <button onclick="editAdminUser(${a.id}, '${escapeHtml(a.username)}', '${escapeHtml(a.email)}')" style="padding:5px 10px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;margin-right:4px;"><i class="fa-solid fa-pen"></i></button>
              <button onclick="deleteAdminUser(${a.id}, '${escapeHtml(a.username)}')" style="padding:5px 10px;background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;"><i class="fa-solid fa-trash"></i></button>
            ` : '<span style="color:var(--clr-muted);font-size:0.78rem;">Protected</span>'}
          </td>
        </tr>`;
    }).join('');

    const modalHtml = `
      <div id="adminMgmtModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;">
        <div style="background:var(--clr-surface,#111a2e);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;width:100%;max-width:750px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,0.45);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h3 style="color:#f59e0b;margin:0;display:flex;align-items:center;gap:10px;"><i class="fa-solid fa-users-gear"></i> Admin Management</h3>
            <div style="display:flex;gap:8px;">
              <button onclick="showCreateAdminForm()" style="padding:8px 16px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:600;display:flex;align-items:center;gap:6px;"><i class="fa-solid fa-plus"></i> New Admin</button>
              <button onclick="document.getElementById('adminMgmtModal').remove()" style="background:transparent;border:none;color:var(--clr-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
            </div>
          </div>
          <div class="table-responsive" style="overflow-y:auto;flex:1;">
            <table style="width:100%;border-collapse:collapse;color:var(--clr-text,#e2e8f0);font-size:0.85rem;">
              <thead><tr style="color:var(--clr-muted);font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid rgba(255,255,255,0.15);">
                <th style="padding:10px 8px;text-align:left;">#</th>
                <th style="padding:10px 8px;text-align:left;">Username</th>
                <th style="padding:10px 8px;text-align:left;">Email</th>
                <th style="padding:10px 8px;text-align:left;">Role</th>
                <th style="padding:10px 8px;text-align:left;">Created</th>
                <th style="padding:10px 8px;text-align:left;">Actions</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div style="margin-top:12px;text-align:right;">
            <button onclick="document.getElementById('adminMgmtModal').remove()" style="padding:8px 20px;background:rgba(255,255,255,0.06);color:var(--clr-text);border:1px solid rgba(255,255,255,0.1);border-radius:8px;cursor:pointer;">Close</button>
          </div>
        </div>
      </div>`;

    const existing = document.getElementById('adminMgmtModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } catch (e) {
    console.error(e);
    alert('Error loading admin list');
  }
}

function showCreateAdminForm() {
  const existing = document.getElementById('createAdminModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'createAdminModal';
  modal.className = 'modal-backdrop';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--clr-surface,#111a2e);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;width:100%;max-width:450px;box-shadow:0 8px 40px rgba(0,0,0,0.45);">
      <h3 style="color:#f59e0b;margin:0 0 20px;display:flex;align-items:center;gap:8px;"><i class="fa-solid fa-user-plus"></i> Create New Admin</h3>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:0.78rem;color:var(--clr-muted);margin-bottom:4px;font-weight:600;">Username</label>
        <input type="text" id="newAdminUsername" placeholder="e.g. admin2" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#e2e8f0;font-size:0.88rem;outline:none;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:0.78rem;color:var(--clr-muted);margin-bottom:4px;font-weight:600;">Email</label>
        <input type="email" id="newAdminEmail" placeholder="admin@example.com" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#e2e8f0;font-size:0.88rem;outline:none;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:0.78rem;color:var(--clr-muted);margin-bottom:4px;font-weight:600;">Password</label>
        <input type="password" id="newAdminPassword" placeholder="Min 6 characters" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#e2e8f0;font-size:0.88rem;outline:none;box-sizing:border-box;">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button onclick="document.getElementById('createAdminModal').remove()" style="padding:10px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#cbd5e1;cursor:pointer;font-weight:600;">Cancel</button>
        <button onclick="submitCreateAdmin()" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#f97316);color:#000;cursor:pointer;font-weight:700;">Create Admin</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function submitCreateAdmin() {
  const username = document.getElementById('newAdminUsername').value.trim();
  const email = document.getElementById('newAdminEmail').value.trim();
  const password = document.getElementById('newAdminPassword').value;

  if (!username || !email || !password) { alert('All fields are required'); return; }
  if (password.length < 6) { alert('Password must be at least 6 characters'); return; }

  try {
    const res = await apiFetch('/api/admin/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    if (res.success) {
      alert('✅ Admin created successfully!');
      document.getElementById('createAdminModal').remove();
      document.getElementById('adminMgmtModal')?.remove();
      loadAdminList();
    } else {
      alert('❌ ' + (res.message || 'Failed to create admin'));
    }
  } catch (e) {
    alert('Error creating admin');
  }
}

async function editAdminUser(id, username, email) {
  const newUsername = prompt('Username:', username);
  if (!newUsername) return;
  const newEmail = prompt('Email:', email);
  if (!newEmail) return;
  const newPassword = prompt('New Password (leave blank to keep current):');

  try {
    const body = { username: newUsername, email: newEmail };
    if (newPassword && newPassword.length >= 6) body.password = newPassword;

    const res = await apiFetch(`/api/admin/update/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.success) {
      alert('✅ Admin updated!');
      document.getElementById('adminMgmtModal')?.remove();
      loadAdminList();
    } else {
      alert('❌ ' + (res.message || 'Failed'));
    }
  } catch (e) { alert('Error updating admin'); }
}

async function deleteAdminUser(id, username) {
  if (!confirm(`Delete admin "${username}"? This cannot be undone.`)) return;
  try {
    const res = await apiFetch(`/api/admin/delete/${id}`, { method: 'DELETE' });
    if (res.success) {
      alert('✅ Admin deleted');
      document.getElementById('adminMgmtModal')?.remove();
      loadAdminList();
    } else {
      alert('❌ ' + (res.message || 'Failed'));
    }
  } catch (e) { alert('Error deleting admin'); }
}

// Helper: Check if current user is super admin
function isSuperAdmin() {
  return localStorage.getItem('adminRole') === 'super_admin';
}

function downloadStudentPDF() {
  if (typeof window.jspdf === 'undefined') { alert("PDF library not loaded."); return; }
  const doc = new window.jspdf.jsPDF();
  doc.text("Students List", 14, 15);
  const rows = (window.studentsData || []).map(s => [s.id, s.name, s.class_name, s.bus_number, s.fees_paid, s.remaining_fees]);
  doc.autoTable({ head: [['ID', 'Name', 'Class', 'Bus No', 'Paid', 'Rem. Fees']], body: rows, startY: 20 });
  doc.save("Students_List.pdf");
}

function downloadStudentExcel() {
  if (!window.studentsData || window.studentsData.length === 0) {
    alert("No student data available to download.");
    return;
  }
  let csv = "Sr No.,Name,Class,Phone,Bus No,Pick-up,Old Fees,Curr. Fees,Total,Conc.,Paid,Rem. Fees,Status\\n";
  window.studentsData.forEach(s => {
    csv += `"${s.id}","${s.name}","${s.class_name || ''}","${s.phone || ''}","${s.bus_number || ''}","${s.pick_up_point || ''}","${s.old_bus_fees || 0}","${s.current_fees || 0}","${s.total_fees || 0}","${s.discount_amount || 0}","${s.fees_paid || 0}","${s.remaining_fees || 0}","${s.student_status}"\\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "Students_List.csv";
  a.click();
}

function downloadBusPDF() {
  if (typeof window.jspdf === 'undefined') { alert("PDF library not loaded."); return; }
  const doc = new window.jspdf.jsPDF();
  doc.text("Buses List", 14, 15);
  const rows = (window.busesData || []).map(b => [b.id, b.bus_number, b.driver_name || '-', b.driver_phone || '-', b.route || '-', b.capacity || 50]);
  doc.autoTable({ head: [['ID', 'Bus Number', 'Driver', 'Phone', 'Route', 'Capacity']], body: rows, startY: 20 });
  doc.save("Buses_List.pdf");
}

function downloadBusExcel() {
  if (!window.busesData || window.busesData.length === 0) { alert("No data."); return; }
  let csv = "ID,Bus Number,Driver Name,Driver Phone,Route,Capacity\\n";
  window.busesData.forEach(b => {
    csv += `"${b.id}","${b.bus_number}","${b.driver_name || ''}","${b.driver_phone || ''}","${b.route || ''}","${b.capacity || 50}"\\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = window.URL.createObjectURL(blob);
  a.download = "Buses_List.csv";
  a.click();
}

function downloadDriverPDF() {
  if (typeof window.jspdf === 'undefined') { alert("PDF library not loaded."); return; }
  const doc = new window.jspdf.jsPDF();
  doc.text("Drivers List", 14, 15);
  const rows = (window.driversData || []).map(d => [d.id, d.name, d.phone, d.license_number, d.salary || 0]);
  doc.autoTable({ head: [['ID', 'Name', 'Phone', 'License', 'Salary']], body: rows, startY: 20 });
  doc.save("Drivers_List.pdf");
}

function downloadDriverExcel() {
  if (!window.driversData || window.driversData.length === 0) { alert("No data."); return; }
  let csv = "ID,Name,Phone,License Number,Salary\\n";
  window.driversData.forEach(d => {
    csv += `"${d.id}","${d.name}","${d.phone}","${d.license_number}","${d.salary || 0}"\\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = window.URL.createObjectURL(blob);
  a.download = "Drivers_List.csv";
  a.click();
}
