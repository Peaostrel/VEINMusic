# Email

Email delivery stays disabled until RESEND_API_KEY and EMAIL_FROM are set.
No existing users are silently enrolled: add/verify email in Settings → Security.

## Provider setup (Resend)

Resend's free plan (about 3,000 emails a month, 100 a day) is enough here. Sign-up
works with GitHub or email; no phone number is needed.

1. Sign up at https://resend.com/signup.
2. Domains → Add Domain: `music.vein.guru`. Region: any. `EMAIL_FROM` must use this exact
   domain: a sender on `vein.guru` or another subdomain is rejected with HTTP 403.
3. Copy the DNS records Resend shows (DKIM TXT, SPF MX + TXT on the `send` subdomain)
   into the DNS panel, then press Verify. Use the supplied values, not guessed ones.
   Preserve existing mail MX records. A DMARC record (`_dmarc` TXT `v=DMARC1; p=none;`)
   is recommended for Gmail.
4. API Keys → Create API Key, permission "Sending access", limited to that domain.
5. Set these only in the server's `deploy/.env` (never GitHub/source/browser/localStorage):

   ```dotenv
   RESEND_API_KEY=re_<secret>
   EMAIL_FROM=notifications@music.vein.guru
   EMAIL_REPLY_TO=<existing support mailbox, optional>
   ```

6. Redeploy (`./deploy/deploy.sh`). Backend and worker share this environment.
   `FRONTEND_URL` must be the real HTTPS site.
7. Confirm email in a real user's settings, test a new browser login, and password recovery.
   Admin → System → Letters shows queue status. "Sent" means **accepted by Resend**, not confirmed inbox delivery.
   Check the Resend Emails log for delivered/bounced status.

A cron job drains the encrypted SQL outbox every 30 seconds. PostgreSQL row locks
prevent concurrent workers claiming the same row. Each request has a stable Resend
Idempotency-Key. Upstream 429/5xx/network errors retry with exponential backoff, up
to eight attempts (a daily or monthly quota error waits until 00:00 UTC without
using an attempt); a pending message expires after 24 hours. Verification/reset
messages must still match their current single-use token and 30-minute expiry.
Bodies are cleared after send/cancel/failure; technical rows expire after 30 days.

## Account behavior

- Bind/change/remove email requires the current password and 2FA when enabled.
- Changing an address keeps the original verified address until the new one is confirmed.
- Link tokens live in URL fragments, not query strings or HTTP access logs. The frontend
  clears the fragment and requires a button press; link scanners don't consume a token on GET.
- Reset does not disable 2FA, revoke API keys, or unlock a banned user. Existing browser
  sessions are revoked through the account's session version/password change.
- Password changes invalidate outstanding reset/verification links.
- Up to five verification/reset/admin messages of each kind per user per day, plus IP limits.
- Forgotten-address responses do not reveal whether an account exists.
- Admin messages require a verified address and explicit recipient opt-in; no bulk campaign UI.
- Account export includes private email settings, never token hashes or queued email bodies.
  Account deletion removes email settings and outbox records.

This integration sends transactional email. It does **not** create a mailbox for
`support@vein.guru`. To read and answer support emails, separately provision a mailbox
with a mail host and then set EMAIL_REPLY_TO to it. This change does not provision an inbox.
