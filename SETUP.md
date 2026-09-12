# Setup Guide

This guide creates a new environment from the **UiPath Studio Web template** plus the files in this repository.

The repository intentionally does not distribute a `.uis` file.

## Prerequisites

- UiPath Automation Cloud / Studio Web.
- Access to the UiPath template `RPA - Invoice Intake & 3-Way Matching`.
- Gmail account for invoice intake.
- Google Drive and Google Sheets access.
- OpenAI API access for your own UiPath OpenAI connection.
- Google Apps Script access.

---

## 1. Create a project from the UiPath template

In UiPath:

```text
Automation Cloud
→ Studio Web
→ Templates
→ Search "RPA - Invoice Intake & 3-Way Matching"
→ Use template
→ Create project
```

The new project is your own copy. Credentials are not included.

If you cannot find the template, see `docs/UIPATH_TEMPLATE.md` for organization-level availability rules.

---

## 2. Create Google Drive folders

Create:

```text
RPA-Invoice-Matching/
├── Data/
├── Incoming-Invoices/
├── Pending-Approval/
├── Exceptions/
├── Processed-Invoices/
└── Rejected-Invoices/
```

Record the folder IDs. See `docs/GOOGLE_DRIVE_STRUCTURE.md`.

---

## 3. Create the Google Sheet

Create a Google Sheet named:

```text
RPA_3Way_Data
```

Recommended location:

```text
RPA-Invoice-Matching/Data/
```

Create these tabs:

```text
PO_Data
GRN_Data
Existing_Invoices
RPA_Live_Output
Config
Pending_File_Map
Test_Cases (optional)
```

Use the CSV templates under `config/` where provided.

Important: `Existing_Invoices` represents invoices already present in the simulated ERP/accounting system. Do not automatically add every newly emailed invoice to this sheet.

---

## 4. Configure your UiPath connections

Create your own connections in UiPath Integration Service:

```text
Gmail
Google Drive
Google Sheets
OpenAI
```

Then open the project created from the template and rebind the relevant activities to your connections.

See `docs/CONNECTIONS_SETUP.md`.

---

## 5. Rebind Google resources in UiPath

Update the UiPath activities to use your:

- `RPA_3Way_Data` spreadsheet.
- `Incoming-Invoices` folder.
- `Pending-Approval` folder.
- `Exceptions` folder.

Verify exact sheet names:

```text
PO_Data
GRN_Data
Existing_Invoices
RPA_Live_Output
```

The Gmail event trigger must use your own Gmail connection.

---

## 6. Configure Apps Script

Use:

```text
apps-script/RPA_Invoice_Approval.gs
```

Set your own environment values:

```javascript
SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
PENDING_FOLDER_ID: 'YOUR_PENDING_APPROVAL_FOLDER_ID',
PROCESSED_FOLDER_ID: 'YOUR_PROCESSED_INVOICES_FOLDER_ID',
REJECTED_FOLDER_ID: 'YOUR_REJECTED_INVOICES_FOLDER_ID'
```

Deploy the Apps Script project as a Web App.

Add Script Property:

```text
WEB_APP_URL = https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```

Then run once:

```javascript
setupApprovalInfrastructure()
```

This creates/updates the technical `Pending_File_Map` sheet structure and the recurring approval scan trigger.

---

## 7. Configure business settings

In `Config`:

```text
OCR_Confidence_Threshold = 0.85
Approval_Reminder_Hours = 24
Finance_Escalation_Hours = 48
Urgent_Escalation_Hours = 72
PM_Email = <PM email>
Finance_Manager_Email = <Finance Manager email>
CFO_Email = <CFO email>
Currency = EGP
```

Finance Manager and CFO emails may be blank for a simple demo, but their escalation emails will not be sent until configured.

---

## 8. Deploy UiPath

Deploy the project created from the template.

In Orchestrator verify:

- the process is deployed;
- the Gmail Event Trigger exists;
- the Gmail Event Trigger is enabled/connected.

For the normal invoice-intake test, send a new Gmail message with a PDF attachment instead of manually starting the job.

---

## 9. Smoke test

Expected successful path:

```text
Gmail
→ UiPath event trigger
→ Incoming-Invoices
→ PDF text extraction
→ OpenAI structured extraction
→ ERP duplicate check
→ RPA duplicate check
→ PO lookup
→ GRN lookup
→ 3-way match
→ RPA_Live_Output = MATCHED
→ Pending-Approval
→ Apps Script
→ PM approval email
→ Approve
→ Processed-Invoices
→ Payment_Status = Ready for Payment
```

---

## 10. Regression testing

Run the provided regression test matrix and invoice PDFs.

The suite should cover at least:

- clean match;
- quantity mismatch;
- price mismatch;
- missing GRN;
- missing PO;
- ERP duplicate;
- calculation error;
- approval reject;
- approval approve;
- RPA duplicate;
- same invoice reference with different supplier;
- reused filename with a new `Process_ID`.
