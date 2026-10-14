# Brevo email

Email delivery stays disabled until BREVO_API_KEY and EMAIL_FROM are set.
No existing users are silently enrolled: add/verify email in Settings → Security.

## Provider setup

1. Create a Brevo account at https://app.brevo.com/account/register.
2. In Settings → Senders, Domains & Dedicated IPs add `vein.guru` (or a dedicated sending subdomain).
3. Copy the domain authentication records displayed by Brevo into the DNS panel.
   Use the actual supplied values, not guessed DKIM/DMARC records. Preserve existing mail MX records.
4. Add and verify a sender such as `notifications@vein.guru`.
5. Create an API key under SMTP & API → API Keys. Use the **API key**, not an SMTP password.
6. Set these only in the server's `deploy/.env` (never GitHub/source/browser/localStorage):

   ```dotenv
   BREVO_API_KEY=<secret>
   EMAIL_FROM=notifications@vein.guru
   EMAIL_REPLY_TO=<existing support mailbox, optional>
   ```

7. Recreate backend and worker services using the deployment's regular blue/green procedure.
   Both use the shared backend environment. `FRONTEND_URL` must be the real HTTPS site.
8. Confirm email in a real user's settings, test a new browser login, and password recovery.
   Admin → System → Letters shows queue status. "Sent" means **accepted by Brevo**, not confirmed inbox delivery.
   Check Brevo transactional logs for delivered/bounced status. Don't infer delivery from HTTP 201.

A cron job drains the encrypted SQL outbox every 30 seconds. PostgreSQL row locks
prevent concurrent workers claiming the same row. Each request has a stable Brevo
IdempotencyKey. Upstream 429/5xx/network errors retry with exponential backoff, up
to eight attempts; a pending message expires after 24 hours. Verification/reset
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
with a mail host and then set EMAIL_REPLY_TO to it. Brevo inbound parsing is an API
feature, not an inbox provisioned by this change.
