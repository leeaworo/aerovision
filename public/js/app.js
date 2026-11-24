let currentSupplier = null;
let cart = [];
let allDrones = [];

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  fetchMarketplaceDrones();
});

// View Navigation Switcher
function switchTab(tab) {
  document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));

  if (tab === 'store') {
    document.getElementById('view-store').classList.add('active');
    document.getElementById('nav-store').classList.add('active');
  } else {
    document.getElementById('view-supplier').classList.add('active');
    document.getElementById('nav-supplier').classList.add('active');
  }
}

// Fetch Approved Drones from Backend
async function fetchMarketplaceDrones() {
  try {
    const res = await fetch('/api/drones');
    const data = await res.json();
    if (data.success) {
      allDrones = data.drones;
      renderDroneGrid(allDrones);
    }
  } catch (err) {
    logConsole('Failed to load drones: ' + err.message);
  }
}

// Render Drone Grid
function renderDroneGrid(drones) {
  const grid = document.getElementById('droneGrid');
  grid.innerHTML = '';

  if (drones.length === 0) {
    grid.innerHTML = '<p class="empty-msg">No drones available in marketplace.</p>';
    return;
  }

  drones.forEach(drone => {
    const card = document.createElement('div');
    card.className = 'drone-card';
    card.innerHTML = `
      <img src="${drone.image_url}" alt="${drone.model_name}" onerror="this.src='https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=500'">
      <div class="card-body">
        <h3 class="card-title">${drone.model_name}</h3>
        <div class="card-specs">
          <p>⚡ Range: ${drone.max_range_km} km | ⏱️ ${drone.max_flight_time_min} mins</p>
          <p>🔑 RID: ${drone.remote_id}</p>
          ${drone.drone_mac_address ? `<p>📡 MAC: ${drone.drone_mac_address}</p>` : ''}
        </div>
        <div class="card-footer">
          <span class="price">$${Number(drone.price).toFixed(2)}</span>
          <button class="btn btn-primary" onclick="addToCart(${drone.id})">Add To Cart</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Filter Drones
function filterCategory(category, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (category === 'ALL') {
    renderDroneGrid(allDrones);
  } else {
    const filtered = allDrones.filter(d => d.category === category);
    renderDroneGrid(filtered);
  }
}

// Authentication Handlers
function toggleAuthMode(mode) {
  if (mode === 'login') {
    document.getElementById('form-login').style.display = 'block';
    document.getElementById('form-register').style.display = 'none';
    document.getElementById('tab-btn-login').classList.add('active');
    document.getElementById('tab-btn-register').classList.remove('active');
  } else {
    document.getElementById('form-login').style.display = 'none';
    document.getElementById('form-register').style.display = 'block';
    document.getElementById('tab-btn-login').classList.remove('active');
    document.getElementById('tab-btn-register').classList.add('active');
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/supplier/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success) {
      currentSupplier = data.supplier;
      document.getElementById('supplier-auth-card').style.display = 'none';
      document.getElementById('supplier-dashboard').style.display = 'block';
      document.getElementById('session-company-name').innerText = currentSupplier.company_name;
      document.getElementById('session-caa-no').innerText = currentSupplier.caa_license_no;
      logConsole(`Supplier logged in: ${currentSupplier.company_name}`);
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Login error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const body = {
    company_name: document.getElementById('reg-company').value,
    email: document.getElementById('reg-email').value,
    caa_license_no: document.getElementById('reg-caa-license').value,
    country_code: document.getElementById('reg-country').value,
    password: document.getElementById('reg-password').value
  };

  try {
    const res = await fetch('/api/supplier/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (data.success) {
      alert('Registration successful! Please login.');
      toggleAuthMode('login');
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Registration failed');
  }
}

function handleLogout() {
  currentSupplier = null;
  document.getElementById('supplier-auth-card').style.display = 'block';
  document.getElementById('supplier-dashboard').style.display = 'none';
}

// Image File Preview Handler
function previewSelectedImage(event) {
  const file = event.target.files[0];
  const container = document.getElementById('image-preview-container');
  const preview = document.getElementById('img-preview');

  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.src = e.target.result;
      container.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    container.style.display = 'none';
  }
}

// Drone Registration Handler (Includes Mandatory MAC Address)
async function handleDroneRegistration(e) {
  e.preventDefault();

  const macAddress = document.getElementById('drone-mac-address').value.trim();
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  if (!macRegex.test(macAddress)) {
    alert('Please enter a valid Drone MAC Address (e.g., AA:BB:CC:DD:EE:FF).');
    return;
  }

  const formData = new FormData();
  formData.append('supplier_id', currentSupplier ? currentSupplier.id : 1);
  formData.append('model_name', document.getElementById('drone-name').value);
  formData.append('category', document.getElementById('drone-category').value);
  formData.append('price', document.getElementById('drone-price').value);
  formData.append('remote_id', document.getElementById('drone-remote-id').value);
  formData.append('drone_mac_address', macAddress.toUpperCase().replace(/-/g, ':'));
  formData.append('caa_registration_id', document.getElementById('drone-caa-id').value);
  formData.append('country_of_origin', document.getElementById('drone-country').value);
  formData.append('max_takeoff_mass', document.getElementById('drone-mtom').value);
  formData.append('firmware_version', document.getElementById('drone-firmware').value);
  formData.append('max_range_km', document.getElementById('drone-range').value);
  formData.append('max_flight_time_min', document.getElementById('drone-flight-time').value);
  formData.append('image_url_input', document.getElementById('drone-image-url').value);

  const fileInput = document.getElementById('drone-image-file');
  if (fileInput.files[0]) {
    formData.append('drone_image', fileInput.files[0]);
  }

  try {
    const res = await fetch('/api/drones/register', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (data.success) {
      logConsole(`VERIFIED: MAC ${macAddress.toUpperCase()} | Telemetry Hash: ${data.verification_hash}`);
      alert('Drone verified & listed on marketplace!');
      document.getElementById('form-drone-reg').reset();
      document.getElementById('image-preview-container').style.display = 'none';
      fetchMarketplaceDrones();
      switchTab('store');
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Failed to register drone');
  }
}

// Shopping Cart Functions
function addToCart(droneId) {
  const drone = allDrones.find(d => d.id === droneId);
  if (drone) {
    cart.push(drone);
    updateCartUI();
    toggleCartDrawer(true);
  }
}

function updateCartUI() {
  document.getElementById('cartCount').innerText = cart.length;
  const cartItems = document.getElementById('cartItems');
  const buyerForm = document.getElementById('buyer-checkout-form');

  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="empty-msg">Your cart is empty.</p>';
    document.getElementById('cartTotal').innerText = '$0.00';
    if (buyerForm) buyerForm.style.display = 'none';
    return;
  }

  if (buyerForm) buyerForm.style.display = 'block';
  cartItems.innerHTML = '';
  let total = 0;

  cart.forEach((item, index) => {
    total += Number(item.price);
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px solid #222; padding-bottom:5px;';
    div.innerHTML = `
      <div>
        <strong>${item.model_name}</strong>
        <p style="font-size:0.8rem; color:#aaa;">$${Number(item.price).toFixed(2)}</p>
      </div>
      <button onclick="removeFromCart(${index})" style="background:none; border:none; color:red; cursor:pointer; font-size:1.1rem;">&times;</button>
    `;
    cartItems.appendChild(div);
  });

  document.getElementById('cartTotal').innerText = `$${total.toFixed(2)}`;
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartUI();
}

function toggleCartDrawer(forceOpen) {
  const drawer = document.getElementById('cart-drawer');
  if (forceOpen === true) {
    drawer.classList.add('open');
  } else {
    drawer.classList.toggle('open');
  }
}

// Checkout Handler: Captures & Saves Buyer Details to Cloud DB
async function checkout() {
  if (cart.length === 0) return alert('Cart is empty!');

  const buyer_name = document.getElementById('buyer-name').value.trim();
  const buyer_email = document.getElementById('buyer-email').value.trim();
  const buyer_phone = document.getElementById('buyer-phone').value.trim();
  const buyer_address = document.getElementById('buyer-address').value.trim();

  if (!buyer_name || !buyer_email || !buyer_phone || !buyer_address) {
    alert('Please fill in your Full Name, Email, Phone Number, and Delivery Address before checking out.');
    return;
  }

  const checkoutBtn = document.getElementById('checkout-btn');
  checkoutBtn.disabled = true;
  checkoutBtn.innerText = 'Processing Checkout...';

  const total_amount = cart.reduce((sum, item) => sum + Number(item.price), 0);
  const drone_id = cart[0].id;
  const drone_model = cart.map(item => `${item.model_name} (MAC: ${item.drone_mac_address || 'N/A'})`).join(', ');

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        drone_id,
        drone_model,
        total_amount,
        buyer_name,
        buyer_email,
        buyer_phone,
        buyer_address
      })
    });

    const data = await res.json();

    if (data.success) {
      logConsole(`ORDER #${data.order_id} CAPTURED: Buyer ${buyer_name} (${buyer_phone})`);
      alert(`Order #${data.order_id} placed successfully! Buyer details saved and telemetry certificates sent to ${buyer_email}.`);

      // Clear buyer inputs and cart
      document.getElementById('buyer-name').value = '';
      document.getElementById('buyer-email').value = '';
      document.getElementById('buyer-phone').value = '';
      document.getElementById('buyer-address').value = '';
      cart = [];
      updateCartUI();
      toggleCartDrawer();
    } else {
      alert(data.message || 'Could not complete checkout.');
    }
  } catch (err) {
    alert('Network error while saving checkout details.');
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.innerText = 'Proceed to Secure Checkout';
  }
}

// Dev Console
function toggleDevConsole() {
  const el = document.getElementById('dev-console');
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

function logConsole(msg) {
  const output = document.getElementById('console-output');
  output.innerText += `
> ${msg}`;
}

function scrollToCatalog() {
  document.getElementById('catalog').scrollIntoView({ behavior: 'smooth' });
}
