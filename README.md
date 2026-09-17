# POS-happy
# POS-happy

## Supabase

The Node server can persist the shared POS state in Supabase instead of the local
`data/pos-happy.json` file.

1. Run [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL editor.
2. Copy [`.env.example`](./.env.example) to `.env`.
3. Set `SUPABASE_ANON_KEY` to the publishable/anon key and
   `SUPABASE_SECRET_KEY` to a server-only Supabase secret key.
4. Run `npm run migrate:supabase` once to upload the local state and create the
   `admin`, `mesero`, and `cocinero` Supabase Auth users.
5. Start the app with `npm run dev`.

The secret key is read only by `server.js`; it is never sent to the browser.
The publishable/anon key is used only by the server to authenticate the login
request against Supabase Auth.
If the Supabase variables are omitted, the app continues using the local JSON
file as a development fallback.

The initial Auth passwords are the same as the usernames. Change them after
the first login.
