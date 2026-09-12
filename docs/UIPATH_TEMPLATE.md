# UiPath Template and Repository Usage

## Template Name

`RPA 3-Way Invoice Matching & Approval`

## If You Are in the Same UiPath Organization

Use the organization template:

```text
UiPath Automation Cloud
→ Studio Web
→ Templates
→ Search "RPA 3-Way Invoice Matching & Approval"
→ Use template
```

Then configure your own:

- Gmail
- Google Drive
- Google Sheets
- OpenAI

The template should reference required connection types, but it must not provide the owner's authenticated credentials.

## If You Are in a Different UiPath Organization

An organization-level template is not discoverable across separate UiPath organizations.

Use the GitHub repository instead:

```text
Clone/download repository
→ UiPath Automation Cloud
→ Studio Web
→ Local Workspace
→ Open the solution/project folder
→ Configure your own connections
→ Test
→ Deploy
```

This repository intentionally excludes:

- authenticated UiPath connection exports
- Gmail OAuth tokens
- Google OAuth tokens
- OpenAI API keys
- personal credentials
- private secrets

## Important

The GitHub method only works if the repository contains the UiPath Local Workspace solution source required by Studio Web.

Do not replace that source with exported authenticated connection folders.

## Public Distribution

If the solution is later published to UiPath Marketplace, users in other organizations can use the Marketplace listing instead of cloning the repository.
