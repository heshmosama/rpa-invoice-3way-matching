# UiPath Template Guide

The UiPath automation is distributed through **UiPath Studio Web Templates** instead of a `.uis` file in GitHub.

## Template name

```text
RPA - Invoice Intake & 3-Way Matching
```

If the published template uses a different display name in your organization, replace the name above and in `README.md` / `SETUP.md` before publishing the repository.

## Create a project from the template

1. Sign in to UiPath Automation Cloud.
2. Open **Studio Web**.
3. Open **Templates**.
4. Search for:

   ```text
   RPA - Invoice Intake & 3-Way Matching
   ```

5. Open the template.
6. Select **Use template**.
7. Create your own project copy.
8. Open the new project.
9. Configure/rebind your own connections:
   - Gmail
   - Google Drive
   - Google Sheets
   - OpenAI
10. Rebind the Google spreadsheet and Drive folders described in this repository.
11. Test the workflow.
12. Deploy the project.
13. Verify the Gmail event trigger is enabled in Orchestrator.

## Credentials

The template/repository must not distribute the original developer's passwords, OAuth tokens, API keys, or authenticated Integration Service connections.

Each user/environment should authenticate independently.

## Organization-level template availability

If the template is published at **Organization level**, only users who belong to that UiPath organization can discover it by name in Studio Web.

For users outside the organization, the template name alone is not sufficient. The automation must first be distributed through a supported broader channel such as UiPath Marketplace or another approved sharing mechanism.

## Relationship to this GitHub repository

UiPath contains the reusable automation template.

GitHub contains the integration and deployment materials:

```text
Apps Script
configuration templates
Google Drive structure
data/schema documentation
connection setup guide
architecture diagrams
regression tests
security instructions
```

No `.uis` export is required in this repository.
