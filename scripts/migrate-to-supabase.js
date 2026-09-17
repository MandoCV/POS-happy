import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ogkyirjagdcqnwwamaif.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY;
const stateTable = process.env.SUPABASE_STATE_TABLE || 'pos_happy_state';
const dataPath = resolve(process.cwd(), 'data/pos-happy.json');

if (!secretKey) throw new Error('Falta SUPABASE_SECRET_KEY en .env');
if (!existsSync(dataPath)) throw new Error(`No existe ${dataPath}`);

const localState = JSON.parse(readFileSync(dataPath, 'utf8'));
const headers = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} fallo: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

await request(`/rest/v1/${stateTable}`, {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({
    id: 1,
    menu: Array.isArray(localState.menu) ? localState.menu : [],
    orders: Array.isArray(localState.orders) ? localState.orders : [],
    expenses: Array.isArray(localState.expenses) ? localState.expenses : [],
  }),
});
console.log('Menu, comandas y gastos migrados.');

const migrationUsers = [
  ['admin', 'Administrador', 'admin', 'admin123'],
  ['mesero', 'Mesero', 'mesero', 'mesero123'],
  ['cocinero', 'Cocinero', 'cocinero', 'cocinero123'],
];
const existingUsers = (await request('/auth/v1/admin/users?per_page=100')).users || [];

for (const [username, name, role, password] of migrationUsers) {
  const email = `${username}@pos-happy.local`;
  const existing = existingUsers.find((user) => user.email === email);
  const body = {
    email,
    password,
    email_confirm: true,
    user_metadata: { username, name, role },
  };
  if (existing) {
    await request(`/auth/v1/admin/users/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
  } else {
    await request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify(body) });
  }
  console.log(`Usuario ${username} configurado en Supabase Auth.`);
}

console.log('Migración terminada. Cambia estas contraseñas después del primer acceso.');
