const initialState = { menu: [], orders: [], expenses: [] };
const sessionCookie = 'pos_happy_access_token';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const stateTable = process.env.SUPABASE_STATE_TABLE || 'pos_happy_state';

const permissions = {
  admin: { orders: true, preparation: true, preparationEdit: true, menu: true, sales: true, expenses: true },
  mesero: { orders: true, preparation: true, preparationEdit: false, menu: false, sales: false, expenses: false },
  cocinero: { orders: true, preparation: true, preparationEdit: true, menu: false, sales: false, expenses: false },
};

function normalizeState(state) {
  return {
    ...initialState,
    ...state,
    menu: Array.isArray(state?.menu) ? state.menu : [],
    orders: Array.isArray(state?.orders) ? state.orders : [],
    expenses: Array.isArray(state?.expenses) ? state.expenses : [],
  };
}

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  };
}

function cookies(event) {
  return Object.fromEntries((event.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }));
}

function publicUser(username, metadata) {
  const role = metadata.role;
  return { username, name: metadata.name || username, role, permissions: permissions[role] };
}

async function supabase(path, options = {}) {
  const result = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: supabaseSecretKey,
      Authorization: `Bearer ${supabaseSecretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await result.text();
  if (!result.ok) throw new Error(`Supabase request failed: ${result.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function authenticate(email, password) {
  const result = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!result.ok) return null;
  return result.json();
}

async function currentUser(event) {
  const token = cookies(event)[sessionCookie];
  if (!token) return null;
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return null;
  const user = await result.json();
  const username = user.user_metadata?.username || user.email?.split('@')[0];
  const role = user.user_metadata?.role;
  return username && permissions[role] ? { username, metadata: user.user_metadata } : null;
}

function requireUser(user) {
  return user && permissions[user.metadata.role];
}

function preservePreparationProgress(nextOrders, currentOrders) {
  const currentById = new Map(currentOrders.map((order) => [order.id, order]));
  return nextOrders.map((order) => {
    const currentOrder = currentById.get(order.id);
    const currentProducts = new Map((currentOrder?.products || []).map((item) => [item.productId, item.delivered || 0]));
    return {
      ...order,
      products: Array.isArray(order.products) ? order.products.map((item) => currentProducts.has(item.productId)
        ? { ...item, delivered: currentProducts.get(item.productId) }
        : { ...item, delivered: 0 }) : order.products,
    };
  });
}

async function getState() {
  const rows = await supabase(`/rest/v1/${stateTable}?id=eq.1&select=menu,orders,expenses`);
  return { state: normalizeState(rows[0]), exists: rows.length > 0 };
}

async function putState(state) {
  await supabase(`/rest/v1/${stateTable}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: 1, ...state }),
  });
}

exports.handler = async (event) => {
  const path = event.path.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
  try {
    if (path === '/login' && event.httpMethod === 'POST') {
      const { username, password } = JSON.parse(event.body || '{}');
      const normalizedUsername = String(username || '').trim().toLowerCase();
      const auth = await authenticate(`${normalizedUsername}@pos-happy.local`, password);
      const metadata = auth?.user?.user_metadata;
      if (!auth?.access_token || !permissions[metadata?.role]) return response(401, { error: 'Usuario o contraseña incorrectos' });
      const expiresAt = Date.now() + (Number(auth.expires_in) || 3600) * 1000;
      return response(200, { user: { ...publicUser(normalizedUsername, metadata), expiresAt } }, {
        'Set-Cookie': `${sessionCookie}=${encodeURIComponent(auth.access_token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${auth.expires_in || 3600}`,
      });
    }

    if (path === '/logout' && event.httpMethod === 'POST') {
      return response(200, { ok: true }, { 'Set-Cookie': `${sessionCookie}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0` });
    }

    const user = await currentUser(event);
    if (!requireUser(user)) return response(401, { error: 'Sesión requerida' });

    if (path === '/session' && event.httpMethod === 'GET') {
      return response(200, { user: { ...publicUser(user.username, user.metadata), expiresAt: Date.now() + 3600000 } });
    }

    if (path === '/state' && event.httpMethod === 'GET') {
      const database = await getState();
      const state = user.metadata.role === 'admin'
        ? database.state
        : { menu: database.state.menu, orders: database.state.orders, expenses: [] };
      return response(200, { ...state, databaseExists: database.exists });
    }

    if (path === '/state' && event.httpMethod === 'PUT') {
      const state = JSON.parse(event.body || '{}');
      if (!Array.isArray(state.orders) || (state.menu !== undefined && !Array.isArray(state.menu))) {
        return response(400, { error: 'Invalid database state' });
      }
      const current = await getState();
      const nextOrders = user.metadata.role === 'mesero'
        ? preservePreparationProgress(state.orders, current.state.orders)
        : state.orders;
      await putState({
        menu: user.metadata.role === 'admin' && Array.isArray(state.menu) ? state.menu : current.state.menu,
        orders: nextOrders,
        expenses: user.metadata.role === 'admin' && Array.isArray(state.expenses) ? state.expenses : current.state.expenses,
      });
      return { statusCode: 204, body: '' };
    }

    return response(404, { error: 'Ruta no encontrada' });
  } catch (error) {
    return response(500, { error: error.message });
  }
};
