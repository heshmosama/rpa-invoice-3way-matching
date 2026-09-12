# Security Guide

This repository intentionally distributes the UiPath automation by **template name**, not by committing a `.uis` export.

The main reason is to avoid publishing authenticated connection metadata and credentials that can be included in exported project/connection folders.

## Never commit

- OpenAI API keys.
- Gmail/Google OAuth access tokens.
- OAuth refresh tokens.
- Google client secrets.
- Google service-account private keys.
- UiPath Integration Service authenticated connection metadata.
- passwords.
- bearer tokens.
- session cookies.
- private keys or certificates.
- Apps Script secrets.
- exported `Connections`, `connections`, or `.connections` directories containing user-specific authentication information.

## UiPath distribution policy

GitHub should document the template:

```text
RPA - Invoice Intake & 3-Way Matching
```

A user creates their own project from the template and authenticates their own:

```text
Gmail
Google Drive
Google Sheets
OpenAI
```

The repository should not provide the original developer's connections.

## If a secret was previously committed

Deleting it from the latest files is not enough.

1. Revoke/rotate the exposed credential.
2. Remove the secret from the current working tree.
3. Check Git history for the same secret.
4. If it exists in history, purge it using an approved Git-history rewrite procedure such as `git filter-repo`.
5. Force-push only after reviewing the impact with repository collaborators.

## Recommended pre-push scan

Search tracked files for suspicious strings such as:

```text
sk-
api_key
apikey
api-key
client_secret
access_token
refresh_token
bearer
authorization
password
private_key
oauth
```

Placeholders such as `YOUR_OPENAI_API_KEY` are acceptable; real credentials are not.

## Google identifiers

Google Spreadsheet IDs and Drive folder IDs are resource identifiers, not passwords, but public repositories should preferably use placeholders so each deployment is configured for its own environment.
