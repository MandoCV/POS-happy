import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createServer as createViteServer } from 'vite';

const root = process.cwd();
const databasePath = resolve(root, 'data/pos-happy.json');
const supabaseUrl = process.env.SUPABASE_URL || 'https://ogkyirjagdcqnwwamaif.supabase.co';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseStateTable = process.env.SUPABASE_STATE_TABLE || 'pos_happy_state';
const useSupabase = Boolean(supabaseSecretKey);
const sessionCookie = 'pos_happy_session';
const sessionLifetimeMs = 24 * 60 * 60 * 1000;
const sessions = new Map();
const initialState = { menu: [], orders: [], expenses: [] };

// Passwords are stored as scrypt hashes and are never returned by an API endpoint.
const users = {
  admin: {
    role: 'admin',
    name: 'Administrador',
    salt: '588b96e15dd0a6794a04fcd6821d5767',
    passwordHash: '0d48c73e17382afdcc21ba721c2e742edc5ab6fcdedf8f7753e3fd802a64164e2c3a94f17a63a3dc2b3565d0bcba7381131af60dcf6b8ee68ac4ef3e1662d28c',
  },
  mesero: {
    role: 'mesero',
    name: 'Mesero',
    salt: 'd5ab01d5d1b3946a2896485f292b4221',
    passwordHash: 'c44c3d69cfc25d681e11223404dbd18ba0842b217f2a4e780386df380f7572db03819ad868859016b6e6702d31f0f3ede68d05fdb76338e7f0cb2405b7b0918a',
  },
  cocinero: {
    role: 'cocinero',
    name: 'Cocinero',
    salt: '7ba54af84bb7896bec7311ad53072bf4',
    passwordHash: '538a8388f8fafbb0ed91c9ee57124fa8885d5c1076ae6e8c314113a9826d59e741a67378617153a5afdb5f5ef2cc73d69ef0a3491d388d8f262628cbe4e4afb6',
  },
};

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

function readLocalDatabase() {
  if (!existsSync(databasePath)) return initialState;
  try {
    return normalizeState(JSON.parse(readFileSync(databasePath, 'utf8')));
  } catch {
    return initialState;
  }
}

function saveLocalDatabase(state) {
  mkdirSync(dirname(databasePath), { recursive: true });
  writeFileSync(databasePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function readDatabase() {
  if (!useSupabase) return { state: readLocalDatabase(), exists: existsSync(databasePath) };
  const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseStateTable}?id=eq.1&select=menu,orders,expenses`, {
    headers: {
      apikey: supabaseSecretKey,
      Authorization: `Bearer ${supabaseSecretKey}`,
    },
  });
  if (!response.ok) throw new Error(`Supabase read failed: ${response.status}`);
  const rows = await response.json();
  return { state: normalizeState(rows[0]), exists: rows.length > 0 };
}

async function saveDatabase(state) {
  if (!useSupabase) {
    saveLocalDatabase(state);
    return;
  }
  const response = await fetch(`${supabaseUrl}/rest/v1/${supabaseStateTable}`, {
    method: 'POST',
    headers: {
      apikey: supabaseSecretKey,
      Authorization: `Bearer ${supabaseSecretKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: 1, menu: state.menu, orders: state.orders, expenses: state.expenses }),
  });
  if (!response.ok) throw new Error(`Supabase write failed: ${response.status}`);
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || '').split(';').filter(Boolean).map((part) => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }));
}

function getSession(request) {
  const sessionId = parseCookies(request)[sessionCookie];
  const session = sessionId ? sessions.get(sessionId) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function publicUser(username, user) {
  return { username, name: user.name, role: user.role, permissions: permissions[user.role] };
}

async function authenticateWithSupabase(username, password) {
  if (!useSupabase || !supabaseAnonKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${username}@pos-happy.local`, password }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const metadata = data.user?.user_metadata || {};
  const role = metadata.role;
  if (!permissions[role]) return null;
  return { role, name: metadata.name || username };
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

function requireSession(request, response) {
  const session = getSession(request);
  if (!session || !users[session.username]) {
    sendJson(response, 401, { error: 'Sesión requerida' });
    return null;
  }
  return session;
}

function readBody(request) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy(new Error('Request body too large'));
    });
    request.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    request.on('error', reject);
  });
}

function validPassword(password, user) {
  const candidate = scryptSync(password, user.salt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function preservePreparationProgress(nextOrders, currentOrders) {
  const currentById = new Map(currentOrders.map((order) => [order.id, order]));
  return nextOrders.map((order) => {
    const currentOrder = currentById.get(order.id);
    if (!Array.isArray(order.products)) return order;
    const currentProducts = new Map((currentOrder?.products || []).map((item) => [item.productId, item.delivered || 0]));
    return {
      ...order,
      products: order.products.map((item) => currentProducts.has(item.productId)
        ? { ...item, delivered: currentProducts.get(item.productId) }
        : { ...item, delivered: 0 }),
    };
  });
}

const vite = await createViteServer({
  root,
  server: { middlewareMode: true },
  appType: 'spa',
});

const server = createHttpServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (url.pathname === '/api/login' && request.method === 'POST') {
    try {
      const { username, password, rememberMe } = await readBody(request);
      const normalizedUsername = String(username || '').trim().toLowerCase();
      const localUser = users[normalizedUsername];
      const supabaseUser = typeof password === 'string'
        ? await authenticateWithSupabase(normalizedUsername, password)
        : null;
      const user = supabaseUser || localUser;
      const validLocalLogin = localUser && typeof password === 'string' && validPassword(password, localUser);
      if (!user || (!supabaseUser && !validLocalLogin)) {
        sendJson(response, 401, { error: 'Usuario o contraseña incorrectos' });
        return;
      }
      const sessionId = randomUUID();
      const expiresAt = Date.now() + sessionLifetimeMs;
      sessions.set(sessionId, { username: normalizedUsername, createdAt: Date.now(), expiresAt });
      const maxAge = rememberMe === true ? `; Max-Age=${sessionLifetimeMs / 1000}` : '';
      sendJson(response, 200, { user: { ...publicUser(normalizedUsername, user), expiresAt } }, {
        'Set-Cookie': `${sessionCookie}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/${maxAge}`,
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/logout' && request.method === 'POST') {
    const sessionId = parseCookies(request)[sessionCookie];
    if (sessionId) sessions.delete(sessionId);
    sendJson(response, 200, { ok: true }, {
      'Set-Cookie': `${sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
    });
    return;
  }

  if (url.pathname === '/api/session' && request.method === 'GET') {
    const session = requireSession(request, response);
    if (session) sendJson(response, 200, { user: { ...publicUser(session.username, users[session.username]), expiresAt: session.expiresAt } });
    return;
  }

  if (url.pathname === '/api/state' && request.method === 'GET') {
    const session = requireSession(request, response);
    if (!session) return;
    const database = await readDatabase();
    const state = database.state;
    const databaseExists = database.exists;
    // Menu is included because it is needed to create an order, but expenses stay private.
    const visibleState = session.username === 'admin'
      ? state
      : { menu: state.menu, orders: state.orders, expenses: [] };
    sendJson(response, 200, { ...visibleState, databaseExists });
    return;
  }

  if (url.pathname === '/api/state' && request.method === 'PUT') {
    const session = requireSession(request, response);
    if (!session) return;
    try {
      const state = await readBody(request);
      if (!Array.isArray(state.orders) || (state.menu !== undefined && !Array.isArray(state.menu))) {
        throw new Error('Invalid database state');
      }
      const currentDatabase = await readDatabase();
      const currentState = currentDatabase.state;
      const isNewDatabase = !currentDatabase.exists;
      const ordersForRole = session.username === 'mesero'
        ? preservePreparationProgress(state.orders, currentState.orders)
        : state.orders;
      const nextState = session.username === 'admin'
        ? {
          menu: Array.isArray(state.menu) ? state.menu : currentState.menu,
          orders: ordersForRole,
          expenses: Array.isArray(state.expenses) ? state.expenses : currentState.expenses,
        }
        : {
          menu: isNewDatabase && Array.isArray(state.menu) ? state.menu : currentState.menu,
          orders: ordersForRole,
          expenses: isNewDatabase && Array.isArray(state.expenses) ? state.expenses : currentState.expenses,
        };
      await saveDatabase(nextState);
      response.writeHead(204);
      response.end();
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  vite.middlewares(request, response);
});

server.listen(5173, '0.0.0.0', () => {
  console.log('POS-Happy disponible en http://localhost:5173');
  console.log('Para la red local: http://TU-IP:5173');
});
