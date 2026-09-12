# Security

## Protect glucose data and credentials

- Use a read-only Nightscout access token.
- Store the Nightscout token in Google Secret Manager, never in source code.
- Configure a long random `DISPLAY_ACCESS_KEY` and treat the resulting display
  URL like a password: anyone with that URL can view the current glucose.
- Never commit `config.json`, `.env`, a private display URL, or service-account
  key files.
- Prefer a dedicated Cloud Run service account with access only to the one
  Nightscout secret.

If a token or display key is committed, removing it from the latest commit is
not sufficient. Revoke or rotate the exposed value, then remove it from Git
history before making the repository public.

## Reporting a vulnerability

Open a GitHub security advisory for the repository rather than posting secrets
or sensitive glucose information in a public issue.
