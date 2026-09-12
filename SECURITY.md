# Security

This repository is designed for safe sharing.

## Never Commit

- OpenAI API keys
- Gmail OAuth tokens
- Google OAuth access/refresh tokens
- Google client secrets
- UiPath authenticated connection exports
- bearer tokens
- passwords
- private keys
- service-account credential JSON
- `.env` files containing real secrets

## UiPath Connections

The repository may contain reusable UiPath project/source metadata, but must not contain the owner's authenticated connection credentials.

If generated folders such as the following contain credentials, they must not be committed:

```text
Connections/
connections/
.connections/
```

## Template Users

Users of the UiPath template must configure their own connections.

## GitHub Users

Users outside the UiPath organization should clone/download the repository, open the project in Studio Web Local Workspace, and configure their own connections.

## Credential Rotation

If a real API key, OAuth token, client secret, or credential was ever committed or pushed to GitHub, remove it from the current tree **and rotate/revoke it**. Deleting a secret from the latest commit does not make an exposed credential safe.
