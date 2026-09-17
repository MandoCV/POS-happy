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

## Deploy on Render

Create a **Web Service** from this repository. Render can use
[`render.yaml`](./render.yaml) automatically. Add the values for
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEY` as environment
variables in Render; do not commit `.env`.

The service uses `npm install && npm run build` to build and `npm start` to
start. The server listens on Render's `PORT` environment variable.

## Deploy on Netlify

Netlify uses [`netlify.toml`](./netlify.toml) and the function
[`netlify/functions/api.js`](./netlify/functions/api.js) for the `/api/*`
routes. Configure these variables in Netlify, with the secret key marked
private:

```env
SUPABASE_URL=https://ogkyirjagdcqnwwamaif.supabase.co
SUPABASE_STATE_TABLE=pos_happy_state
SUPABASE_ANON_KEY=...
SUPABASE_SECRET_KEY=...
```

Use `npm run build` as the build command and `dist` as the publish directory.
