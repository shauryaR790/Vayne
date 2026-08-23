# Deploy VAYNE API on Render

If the Render service shows **"Exited with status 3"**, the API failed during startup. The most common cause is missing production secrets.

## Fix an existing Render web service

If the service shows **"Exited with status 3"**, check **Logs** first. Common causes:

1. **Wrong start command** — must run the FastAPI app, not the `vayne` CLI.
2. **Invalid `DATABASE_URL`** — Postgres must be reachable from the service.
3. **Explicitly weak secrets** — if you set `VAYNE_JWT_SECRET`, it must be 32+ chars.

JWT secrets are **optional** for legacy deploys (missing secrets use dev defaults with a log warning). Set strong secrets when you require production auth.

1. Open your service on Render → **Environment**.
2. Confirm these variables (you likely already have most):

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Your Postgres connection string |
| `VAYNE_STORAGE` | `/opt/render/project/src/product/storage/investigations` |
| `VAYNE_LLM_API_KEY` | Your OpenAI key (for Ask VAYNE) |
| `CORS_ORIGINS` | Your Vercel frontend URL, e.g. `https://vayne-alpha.vercel.app` |

Optional but recommended for production auth:

| Variable | Value |
|----------|--------|
| `VAYNE_JWT_SECRET` | Random string, **at least 32 characters** |
| `VAYNE_API_KEY_PEPPER` | Different random string, **at least 32 characters** |

3. Under **Settings** → **Start Command**, set:

```bash
bash scripts/start_api.sh
```

4. **Manual Deploy** → Deploy latest commit.

## Vercel frontend

Set on the Vercel project:

```
NEXT_PUBLIC_API_URL=https://vayne-716n.onrender.com
```

(Replace with your Render service URL.)

## Verify

After deploy, open:

```
https://YOUR-SERVICE.onrender.com/api/health
```

You should see: `{"status":"ok","service":"vayne-product-api"}`

## Logs

If startup still fails, open **Logs** on Render. Look for messages like:

- `VAYNE_JWT_SECRET must be set to a random string of at least 32 characters in production.`
- `VAYNE_API_KEY_PEPPER must differ from VAYNE_JWT_SECRET in production.`

Generate secrets locally:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Run that twice — use one value for `VAYNE_JWT_SECRET` and the other for `VAYNE_API_KEY_PEPPER`.
