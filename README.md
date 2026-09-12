# RPA 3-Way Invoice Matching & Approval

Reusable RPA solution for invoice intake, AI-based invoice extraction, PO/GRN validation, duplicate detection, 3-way matching, exception routing, PM approval, escalation, and Google Drive routing.

## Get Started

There are two supported ways to use the UiPath automation.

### Option 1 — Same UiPath Organization

If you are a member of the same UiPath organization as the template owner:

1. Sign in to **UiPath Automation Cloud**.
2. Open **Studio Web**.
3. Go to **Templates**.
4. Search for:

   **RPA 3-Way Invoice Matching & Approval**

5. Select **Use template**.
6. Create your own project.
7. Configure your own connections:
   - Gmail
   - Google Drive
   - Google Sheets
   - OpenAI
8. Configure the Google resources described in this repository.
9. Test and deploy the automation.

> The template does not provide the owner's credentials. Each user must authenticate their own connections.

### Option 2 — Different UiPath Organization

If you are **not** part of the same UiPath organization, the organization-level template will not appear in your Templates page.

Use the GitHub repository instead:

1. Clone or download this repository.
2. Sign in to your own UiPath Automation Cloud account.
3. Open **Studio Web**.
4. Go to **Local Workspace**.
5. Open the UiPath solution/project folder from the cloned repository.
6. Configure your own:
   - Gmail connection
   - Google Drive connection
   - Google Sheets connection
   - OpenAI connection
7. Configure the Google Drive folders and Google Sheets resources described in this repository.
8. Deploy the Google Apps Script.
9. Test the workflow.
10. Deploy the UiPath process and configure/enable your Gmail event trigger.

> The GitHub repository intentionally excludes authenticated connection credentials, API keys, OAuth tokens, and personal account secrets.

## Distribution Summary

| User | Recommended method |
|---|---|
| Same UiPath organization | Use the Studio Web template |
| Different UiPath organization | Clone/download the repository and open it in Studio Web Local Workspace |
| Public user after Marketplace publication | Use the Marketplace template |

## UiPath Template

**Template name:**  
`RPA 3-Way Invoice Matching & Approval`

See [docs/UIPATH_TEMPLATE.md](docs/UIPATH_TEMPLATE.md).

## High-Level Architecture

```text
Supplier Gmail
      ↓
UiPath Studio Web
      ↓
AI invoice extraction
      ↓
ERP / RPA duplicate checks
      ↓
PO lookup
      ↓
GRN lookup
      ↓
3-way matching
      ↓
┌─────────────────────┬─────────────────────┐
│ Exception           │ Matched             │
│ → Exceptions folder │ → Pending Approval  │
└─────────────────────┴─────────────────────┘
                              ↓
                        Apps Script
                              ↓
                    PM Approve / Reject
                         ↓          ↓
                   Processed     Rejected
```

## Main Components

- **UiPath Studio Web** — Gmail intake, PDF handling, AI extraction, validation, 3-way match, duplicate checks, Google Drive routing, and output writing.
- **Google Apps Script** — PM approval email, approval links, reminders, escalations, final Drive routing, and Process_ID-based file correlation.
- **Google Sheets** — mock ERP/master data and live RPA output.
- **Google Drive** — invoice document routing.
- **OpenAI** — invoice field extraction from PDF text.

## Required Google Drive Structure

```text
RPA-Invoice-Matching/
├── Incoming-Invoices/
├── Pending-Approval/
├── Exceptions/
├── Processed-Invoices/
└── Rejected-Invoices/
```

See [docs/GOOGLE_DRIVE_STRUCTURE.md](docs/GOOGLE_DRIVE_STRUCTURE.md).

## Required Google Sheets

```text
PO_Data
GRN_Data
Existing_Invoices
RPA_Live_Output
Pending_File_Map
Config
Test_Cases
```

`Existing_Invoices` represents invoices that already exist in the simulated ERP/accounting system. It must not automatically receive every incoming invoice.

`Pending_File_Map` should contain:

```text
Invoice_Reference
Drive_File_ID
Source_File_Name
Registered_At
Process_ID
```

## Approval and Escalation Rules

- MATCHED invoice → PM approval
- Approve → Ready for Payment + Processed-Invoices
- Reject → Rejected-Invoices
- 24h → PM reminder
- 48h → Finance Manager escalation
- 72h → Finance Manager + CFO urgent escalation

## Repository Contents

```text
.
├── README.md
├── SETUP.md
├── SECURITY.md
├── .gitignore
├── apps-script/
├── config/
├── docs/
└── tests/
```

The repository may also contain the UiPath Local Workspace solution source required to open the solution in Studio Web. It must **not** contain exported authenticated connection credentials.

## Security

Never commit:

- OpenAI API keys
- Gmail/Google OAuth tokens
- UiPath authenticated connection data
- Google client secrets
- service-account private keys
- access or refresh tokens
- passwords
- `.env` files with real secrets

See [SECURITY.md](SECURITY.md).

## Setup

For full installation steps, see [SETUP.md](SETUP.md).
