# Hosting on Vercel (everything in one place)

The site (`public/`) and the login/data API (`api/`) both run on Vercel. No Firebase.

## One-time setup
1. Vercel project > Storage > Create Database > Upstash Redis (free plan). Connect it to this project
   for Production and Preview. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
2. Project > Settings > Environment Variables > add `ALLOWED_EMAILS` = comma separated lowercase emails
   allowed to sign up and use the app (e.g. `a@x.com,b@y.com`). If unset, anyone with the link can sign up.
3. Redeploy (Deployments > ... > Redeploy) so the variables apply.

## How it works
- `api/signup`, `api/login`, `api/logout`, `api/me`: accounts. Passwords are hashed with scrypt; the session is an
  httpOnly cookie backed by a random token stored (hashed) in Redis for 30 days.
- `api/data`: the user's `tasks` and `log-YYYY-MM` documents. `api/prefs`: reminder times.
- There is no password reset (no email service). Anyone locked out needs the owner to delete their `email:<address>`
  and `user:<id>` keys in the Redis console so they can sign up again.

Every `git push` to `main` redeploys.
