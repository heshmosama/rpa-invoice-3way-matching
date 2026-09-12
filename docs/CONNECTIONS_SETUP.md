# Connection Setup

Each user must configure their own connections.

## Gmail

Used for:

- invoice email intake
- Gmail event trigger

Create a Gmail connection in UiPath Integration Service using your own Google account.

The Gmail event trigger must be created/configured for the Gmail account that should receive invoices.

## Google Drive

Used for:

- Incoming-Invoices
- Pending-Approval
- Exceptions
- Processed-Invoices
- Rejected-Invoices

Authenticate your own Google account and bind the project activities to your connection.

## Google Sheets

Used for:

- PO_Data
- GRN_Data
- Existing_Invoices
- RPA_Live_Output
- Config
- Test_Cases
- Pending_File_Map

Authenticate your own Google account and point the project to your own spreadsheet.

## OpenAI

Used for invoice data extraction.

Create your own OpenAI connection and provide your own API key through UiPath's connection configuration.

Never commit the API key to GitHub.

## Same-Organization Template User

When using the organization template, configure/rebind your own connections after creating the project.

## Different-Organization GitHub User

When using the GitHub repository:

```text
Clone repository
→ Studio Web
→ Local Workspace
→ Open project
→ Rebind Gmail
→ Rebind Google Drive
→ Rebind Google Sheets
→ Rebind OpenAI
```

The repository must not contain the original owner's authenticated connection data.
