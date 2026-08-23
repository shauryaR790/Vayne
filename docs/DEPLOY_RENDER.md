# Deploy VAYNE API on Render

If the Render service shows **"Exited with status 3"**, the API failed during startup. Check **Logs** for the exact error.

## Most common error: Postgres hostname not found

```
psycopg2.OperationalError: could not translate host name "dpg-..." to address
```

This means `DATABASE_URL` points at a Postgres host that no longer exists or was never linked to your web service.

### Fix

1. Render dashboard → your **Postgres** database (create one if it was deleted).
2. Copy **Internal Database URL** (use Internal, not External, when both services are on Render).
3. Web service **Vayne** → **Environment** → set `DATABASE_URL` to that full URL.
4. Or: Postgres → **Connect** → select your web service to inject the URL automatically.
5. **Manual Deploy** the web service again.

The URL must look like:

```
postgresql://USER:PASSWORD@dpg-XXXXXXXX-a/DATABASE_NAME
```

Do not truncate it. The hostname must end with `-a` (internal) or `.render.com` (external).

## Other startup issues

| Log message | Fix |
|-------------|-----|
| Wrong start command | Use `uvicorn product.backend.main:app --host 0.0.0.0 --port $PORT` |
| Weak `VAYNE_JWT_SECRET` | Only if you explicitly set it — use 32+ random chars, or remove it |
| `Using default JWT secret` | Warning only — server still starts |

JWT secrets are **optional** for legacy deploys. Postgres **must** be reachable.

## Required environment variables

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Internal Postgres URL from Render |
| `VAYNE_STORAGE` | `/opt/render/project/src/product/storage/investigations` |
| `VAYNE_LLM_API_KEY` | Your OpenAI key |
| `CORS_ORIGINS` | `https://vayne-alpha.vercel.app` (your Vercel URL) |

## Vercel frontend

```
NEXT_PUBLIC_API_URL=https://vayne-716n.onrender.com
```

## Verify

```
https://vayne-7l6n.onrender.com/api/health
```

Expected: `{"status":"ok","service":"vayne-product-api"}`
