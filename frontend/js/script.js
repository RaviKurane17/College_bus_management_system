// --- Common helpers ---
async function apiFetch(path, options = {}) {
  const res = await fetch(path, options);
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  } else {
    return res.text();
  }
}

function requireLogin() {
  if (!localStorage.getItem('loggedIn')) {
    window.location.href = '/';
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
          if (role === 'admin') {
            localStorage.setItem('loggedIn', 'admin');
            window.location.href = '/dashboard.html';
          } else if (role === 'student') {
            localStorage.setItem('studentUser', username);
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
      localStorage.clear();
      window.location.href = '/';
    });
  }

  // --- ADMIN SIDE ---
  // Add Bus
  const busForm = document.getElementById('busForm');
  if (busForm) {
    requireLogin();
    busForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const bus_number = document.getElementById('bus_number').value.trim();
      const driver_name = document.getElementById('driver_name').value.trim();
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
            driver_name, 
            capacity, 
            route,
            driver_phone: '' // Add this field as it's in the schema
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

      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value.trim();
      const name = document.getElementById('name').value.trim();
      const roll_no = document.getElementById('roll_no').value.trim();
      const department = document.getElementById('department').value.trim();
      const bus_id = document.getElementById('bus_select').value || null;
      const fees_paid = parseFloat(document.getElementById('fees_paid').value) || 0;
      const remaining_fees = parseFloat(document.getElementById('remaining_fees').value) || 0;

      try {
        // Basic validation
        if (!username || !password || !name || !roll_no) {
          smsg.textContent = '❌ Please fill in all required fields';
          return;
        }

        // Validate username format
        if (!/^[A-Za-z0-9_]+$/.test(username)) {
          smsg.textContent = '❌ Username can only contain letters, numbers, and underscore';
          return;
        }

        // Validate password length
        if (password.length < 6) {
          smsg.textContent = '❌ Password must be at least 6 characters long';
          return;
        }

        // Validate name format
        if (!/^[A-Za-z\s]+$/.test(name)) {
          smsg.textContent = '❌ Name can only contain letters and spaces';
          return;
        }

        // Validate roll number format
        if (!/^[A-Za-z0-9-]+$/.test(roll_no)) {
          smsg.textContent = '❌ Roll number can only contain letters, numbers, and hyphens';
          return;
        }

        const res = await apiFetch('/api/students/add-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            username, 
            password, 
            name, 
            roll_no, 
            department: department || '', 
            bus_id: bus_id === '' ? null : parseInt(bus_id),
            fees_paid: fees_paid || 0,
            remaining_fees: remaining_fees || 0
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
      window.location.href = '/';
      return;
    }
    
    try {
      const res = await apiFetch(`/api/students/profile/${username}`);
      if (res && res.success) {
        const s = res.student || {};
        studentPage.innerHTML = `
          <h2>Welcome, ${escapeHtml(s.name) || 'Student'} 👋</h2>
          <div class="info-grid">
            <div class="info-item">
              <p><b>Roll No:</b> ${escapeHtml(s.roll_no) || 'N/A'}</p>
              <p><b>Department:</b> ${escapeHtml(s.department) || 'N/A'}</p>
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
        `;
      } else {
        studentPage.innerHTML = '<p class="error-message">❌ Failed to load student data. Please try logging in again.</p>';
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
    tbody.innerHTML = '';
    if (Array.isArray(res)) {
      res.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${b.id}</td>
          <td>${escapeHtml(b.bus_number)}</td>
          <td>${escapeHtml(b.driver_name || '')}</td>
          <td>${b.capacity || 0}</td>
          <td>${escapeHtml(b.route || '')}</td>
          <td>
            <button onclick="deleteBus(${b.id})" class="delete-btn">Delete</button>
            <button onclick="editBus(${b.id})" class="edit-btn">Edit</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = '<tr><td colspan="6">No buses found</td></tr>';
    }
  } catch (error) {
    console.error('Error loading buses:', error);
    document.querySelector('#busesTable tbody').innerHTML = 
      '<tr><td colspan="6">Error loading buses. Please try again.</td></tr>';
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
        opt.text = `${b.bus_number} - ${b.route || 'No route'} (Capacity: ${b.capacity || 0})`;
        sel.appendChild(opt);
      });
    }
  } catch (error) {
    console.error('Error loading buses for select:', error);
    const sel = document.getElementById('bus_select');
    sel.innerHTML = '<option value="">Error loading buses</option>';
  }
}

async function loadStudents() {
  try {
    const res = await apiFetch('/api/students');
    const tbody = document.querySelector('#studentsTable tbody');
    tbody.innerHTML = '';
    
    if (Array.isArray(res)) {
      res.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.roll_no)}</td>
          <td>${escapeHtml(s.department || '')}</td>
          <td>${escapeHtml(s.bus_number || 'Not Assigned')}</td>
          <td>${escapeHtml(s.route || 'N/A')}</td>
          <td>₹${parseFloat(s.fees_paid || 0).toFixed(2)}</td>
          <td>₹${parseFloat(s.remaining_fees || 0).toFixed(2)}</td>
          <td>${formatDate(s.joining_date)}</td>
          <td>
            <button onclick="editStudent('${s.username}')" class="edit-btn">Edit</button>
            <button onclick="deleteStudent(${s.id})" class="delete-btn">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      
      if (res.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="no-data">No students found</td></tr>';
      }
    } else {
      tbody.innerHTML = '<tr><td colspan="9" class="error">Error loading students</td></tr>';
    }
  } catch (error) {
    console.error('Error loading students:', error);
    document.querySelector('#studentsTable tbody').innerHTML = 
      '<tr><td colspan="9" class="error">Failed to load students. Please try again.</td></tr>';
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

// Edit bus function
async function editBus(id) {
  try {
    // First get the current bus data
    const res = await apiFetch(`/api/buses/get/${id}`);
    if (!res || !res.success) {
      alert('Failed to load bus data. Please try again.');
      return;
    }
    
    const bus = res.bus;
    const newBusNumber = prompt('Enter new bus number:', bus.bus_number);
    if (newBusNumber === null) return; // User clicked cancel
    
    const updateData = {
      bus_number: newBusNumber.trim(),
      driver_name: prompt('Enter driver name:', bus.driver_name || '')?.trim() || '',
      driver_phone: prompt('Enter driver phone:', bus.driver_phone || '')?.trim() || '',
      capacity: parseInt(prompt('Enter capacity:', bus.capacity || 0)) || 0,
      route: prompt('Enter route:', bus.route || '')?.trim() || ''
    };
    
    // Validate bus number
    if (!updateData.bus_number) {
      alert('Bus number is required');
      return;
    }
    
    const res2 = await apiFetch(`/api/buses/update/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });
    
    if (res2.success) {
      alert('Bus updated successfully');
      loadBuses();
    } else {
      alert(res2.message || 'Failed to update bus');
    }
  } catch (error) {
    console.error('Error updating bus:', error);
    alert('Failed to update bus. Please try again.');
  }
}

// Edit student function
async function editStudent(id) {
  try {
    const res = await apiFetch(`/api/students/${id}`);
    if (!res || !res.success) {
      alert('Failed to load student data');
      return;
    }
    
    const s = res.student;
    const newName = prompt('Enter new name:', s.name);
    if (!newName) return;
    
    const newRollNo = prompt('Enter new roll no:', s.roll_no);
    if (!newRollNo) return;
    
    const updateData = {
      name: newName,
      roll_no: newRollNo,
      department: prompt('Enter new department:', s.department) || '',
      bus_id: s.bus_id, // Preserve existing bus assignment
      fees_paid: parseFloat(prompt('Enter fees paid:', s.fees_paid)) || 0,
      remaining_fees: parseFloat(prompt('Enter remaining fees:', s.remaining_fees)) || 0,
      joining_date: s.joining_date // Preserve joining date
    };
    
    const res2 = await apiFetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });
    
    if (res2.success) {
      alert('Student updated successfully');
      loadStudents();
    } else {
      alert(res2.message || 'Failed to update student');
    }
  } catch (error) {
    console.error('Error updating student:', error);
    alert('Failed to update student. Please try again.');
  }
}

