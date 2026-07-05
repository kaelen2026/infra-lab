# Deploying `@infra/h5`

h5 builds to a **static single-page app** (`dist/`) that talks to the auth/todo
API and authenticates with the HttpOnly `infra.session` **cookie** — the same
session the web app uses. That cookie is the one thing that shapes the whole
deployment, so read [The cookie constraint](#the-cookie-constraint-read-this-first)
before picking a host.

---

## 1. Build

The API base URL is **baked in at build time** from `VITE_API_URL` (Vite inlines
`import.meta.env.*` — there is no runtime config). Build from the monorepo root so
the `@infra/*` workspace packages resolve:

```bash
# same-origin topology (recommended) — empty base ⇒ relative /auth, /todos calls
VITE_API_URL="" pnpm --filter @infra/h5 build

# cross-origin topology — absolute API origin
VITE_API_URL="https://api.example.com" pnpm --filter @infra/h5 build
```

Output is written to `apps/h5/dist/`:

```
dist/
  index.html                 # no-cache; the SPA entry + history fallback target
  assets/index-*.js          # content-hashed ⇒ immutable, cache forever
  assets/index-*.css
```

Two properties drive the host config below:

- **Content-hashed assets** → cache `assets/*` immutably; never cache `index.html`.
- **Client-side routing** (`/`, `/auth`, `/todos` via React Router `BrowserRouter`)
  → the host must serve `index.html` for any unmatched path (history fallback), or
  a deep-link/refresh returns 404.

---

## 2. The cookie constraint (read this first)

h5 sends `credentials: "include"` and the API replies with an HttpOnly cookie. Two
facts about **this** API (see `apps/api/src/server.ts` and `session-service.ts`)
decide your topology:

- CORS reflects a **single** origin: `cors({ origin: baseURL, credentials: true })`
  where `baseURL = BETTER_AUTH_URL`.
- The session cookie is **`SameSite=Lax`**, `Secure` only when `COOKIE_SECURE=true`.

### Topology A — same-origin (recommended)

Serve the h5 static files and proxy the API under **one** host, e.g.
`https://app.example.com` serves the SPA and forwards API paths (`/auth`, `/todos`,
`/timeline`, `/uploads`, `/admin`, `/notifications`, `/api/auth`) to the API. Then:

- The cookie is first-party → `SameSite=Lax` works, no cookie changes needed.
- **No CORS** involved (requests are same-origin).
- Build with `VITE_API_URL=""` so the SDK issues **relative** requests
  (`/auth/otp/request`, …) that the proxy routes to the API.

This is the least-surprise option and needs no API-side changes. Use it unless you
have a reason not to.

### Topology B — separate origin (h5 on its own host)

If h5 lives on a different origin than the API (e.g. a static CDN calling
`api.example.com`), the browser treats the cookie as **third-party**. That requires,
on the **API side**:

- CORS to allow the h5 origin. Today the API reflects a single origin from
  `BETTER_AUTH_URL`; serving both web and h5 cross-origin means widening that
  allow-list (an API change) — a single value can't cover two origins.
- The session cookie set to **`SameSite=None; Secure`** (Lax is not sent on
  cross-site `fetch`). That is an API/Better-Auth cookie change, and both ends must
  be **HTTPS**.

> In short: cross-origin h5 needs coordinated changes in `apps/api`. If you don't
> control those, use Topology A.

---

## 3. Nginx (Topology A: static + API proxy)

```nginx
server {
  listen 443 ssl http2;
  server_name app.example.com;
  # ssl_certificate ... ; ssl_certificate_key ... ;

  root /srv/h5;              # contents of apps/h5/dist
  index index.html;

  # Hashed assets are immutable.
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  # API + Better Auth endpoints → upstream API (keeps everything same-origin).
  location ~ ^/(auth|todos|timeline|uploads|admin|notifications|api/auth)(/|$) {
    proxy_pass         http://127.0.0.1:3001;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }

  # SPA history fallback: any other path serves the app shell.
  location / {
    add_header Cache-Control "no-cache";
    try_files $uri /index.html;
  }
}
```

Build for this with `VITE_API_URL=""`. Because the API is reached same-origin, set
`COOKIE_SECURE=true` on the API (you are on HTTPS) and leave its cookie `SameSite=Lax`.

---

## 4. Docker (multi-stage: build → nginx)

Build context is the **monorepo root** (pnpm workspace), not `apps/h5`:

```dockerfile
# ---- build ----
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
# same-origin build; override for a cross-origin API
ARG VITE_API_URL=""
RUN VITE_API_URL="$VITE_API_URL" pnpm --filter @infra/h5 build

# ---- serve ----
FROM nginx:1.27-alpine
COPY --from=build /repo/apps/h5/dist /usr/share/nginx/html
COPY apps/h5/docs/nginx.conf /etc/nginx/conf.d/default.conf   # static + SPA fallback
EXPOSE 80
```

```bash
docker build -f apps/h5/Dockerfile --build-arg VITE_API_URL="" -t infra-h5 .
docker run -p 8080:80 infra-h5
```

Terminate TLS and route API paths (`/auth`, `/todos`, `/timeline`, `/uploads`, `/admin`,
`/notifications`, `/api/auth`) to the API at the ingress/edge in front of this container
(so the browser still sees one origin).

---

## 5. Static hosts (Vercel / Netlify / Cloudflare Pages / S3+CloudFront)

A pure static host serves the SPA but **cannot** proxy the API on the same origin,
so this is **Topology B** — the API must be configured for cross-origin cookies
(§2). Build with an absolute `VITE_API_URL`, and configure the SPA history
fallback:

- **Netlify** — `_redirects`: `/*  /index.html  200`
- **Vercel** — `vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
- **Cloudflare Pages** — SPA fallback is on by default (serves `index.html` for unmatched routes).
- **S3 + CloudFront** — set the "error document" / a 404→`/index.html` (200) function so deep links resolve.

In all cases keep `index.html` uncached and let the hashed `assets/*` cache long.

---

## 6. Checklist

- [ ] Chose a topology and built with the matching `VITE_API_URL`
      (`""` for same-origin, absolute URL for cross-origin).
- [ ] History fallback serves `index.html` for browser routes; API paths are routed to the API.
- [ ] `assets/*` cached immutably; `index.html` `no-cache`.
- [ ] HTTPS end-to-end; API `COOKIE_SECURE=true` in production.
- [ ] Topology B only: API CORS allows the h5 origin **and** the session cookie is
      `SameSite=None; Secure` (coordinated `apps/api` change).
- [ ] Smoke test on a real phone: request code → verify → land on 账户, reload a
      deep link, toggle a todo, log out.
```
