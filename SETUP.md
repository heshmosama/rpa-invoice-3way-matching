# Setup Guide

This solution supports two UiPath setup paths.

## Path A — Same UiPath Organization

Use this path if you belong to the same UiPath organization as the template owner.

1. Sign in to UiPath Automation Cloud.
2. Open Studio Web.
3. Open **Templates**.
4. Search for:

   `RPA 3-Way Invoice Matching & Approval`

5. Select **Use template**.
6. Create your project.
7. Configure your own Gmail, Google Drive, Google Sheets, and OpenAI connections.
8. Continue with the Google Drive, Google Sheets, and Apps Script setup below.
9. Test the workflow.
10. Deploy the automation.
11. Configure/enable your Gmail event trigger.

## Path B — Different UiPath Organization

Use this path if the organization-level template is not visible to you.

1. Clone or download this GitHub repository.
2. Sign in to your own UiPath Automation Cloud account.
3. Open Studio Web.
4. Go to **Local Workspace**.
5. Open the UiPath solution/project folder from the cloned repository.
6. Allow browser/local file access if prompted.
7. Configure your own connections:
   - Gmail
   - Google Drive
   - Google Sheets
   - OpenAI
8. Rebind any missing connection references inside the project.
9. Continue with the Google Drive, Google Sheets, and Apps Script setup below.
10. Test the automation.
11. Deploy it to your own UiPath environment.
12. Create/configure your own Gmail event trigger.

> Do not expect the owner's authenticated connections to work. The repository is intentionally sanitized.

## 1. Create Google Drive Folders

Create:

```text
RPA-Invoice-Matching/
├── Incoming-Invoices/
├── Pending-Approval/
├── Exceptions/
├── Processed-Invoices/
└── Rejected-Invoices/
```

Copy the folder IDs for the Apps Script configuration.

## 2. Create the Google Sheet

Create a spreadsheet named:

`RPA_3Way_Data`

Required sheets:

```text
PO_Data
GRN_Data
Existing_Invoices
RPA_Live_Output
Pending_File_Map
Config
Test_Cases
```

Use the CSV templates under `config/` where provided.

## 3. Configure the Config Sheet

Recommended keys:

```text
OCR_Confidence_Threshold    0.85
Approval_Reminder_Hours     24
Finance_Escalation_Hours    48
Urgent_Escalation_Hours     72
PM_Email
Finance_Manager_Email
CFO_Email
Currency                    EGP
```

## 4. Configure Apps Script

Open:

`apps-script/RPA_Invoice_Approval.gs`

Replace placeholders such as:

```text
YOUR_SPREADSHEET_ID
YOUR_PENDING_APPROVAL_FOLDER_ID
YOUR_PROCESSED_INVOICES_FOLDER_ID
YOUR_REJECTED_INVOICES_FOLDER_ID
```

Deploy the script as a Web App.

Store the deployed `/exec` URL in Script Properties:

```text
WEB_APP_URL
```

Run once:

```javascript
setupApprovalInfrastructure()
```

## 5. Configure UiPath Connections

Create/rebind your own:

- Gmail
- Google Drive
- Google Sheets
- OpenAI

See `docs/CONNECTIONS_SETUP.md`.

## 6. Verify Gmail Trigger

The Gmail trigger belongs to the account/environment that configures it.

A new user should create/configure a trigger using their own Gmail connection.

## 7. Smoke Test

Send one clean matched regression invoice.

Expected:

```text
Gmail
→ Incoming-Invoices
→ UiPath processing
→ RPA_Live_Output
→ Pending-Approval
→ Apps Script approval email
→ Approve
→ Processed-Invoices
```

## 8. Regression Test

Run the scenarios in `tests/Regression_Test_Matrix.csv`.
