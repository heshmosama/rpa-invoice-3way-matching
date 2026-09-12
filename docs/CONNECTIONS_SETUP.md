# UiPath Connection Setup

After creating a project from the UiPath template, configure your own Integration Service connections.

No authenticated connection is supplied by this repository.

## 1. Gmail

Used for:

- `Email Received` event trigger.
- downloading invoice PDF attachments.

Create a Gmail connection using the mailbox that will receive invoices.

Then:

1. Open the project created from the template.
2. Re-select your Gmail connection in Gmail activities.
3. Configure the Gmail event trigger to use your connection.
4. Deploy the project.
5. Verify the trigger is enabled in Orchestrator.

A different user who wants emails from their own mailbox must create/use their own Gmail trigger and Gmail connection.

## 2. Google Drive

Used for invoice routing:

```text
Incoming-Invoices
Pending-Approval
Exceptions
```

Apps Script later moves approved/rejected files to:

```text
Processed-Invoices
Rejected-Invoices
```

Create a Google Drive connection with read/write access to the project folder structure.

Rebind the UiPath Drive activities to the correct folders in your environment.

## 3. Google Sheets

Used for:

- `PO_Data` lookup.
- `GRN_Data` lookup.
- `Existing_Invoices` ERP duplicate check.
- `RPA_Live_Output` RPA duplicate check.
- writing processing results to `RPA_Live_Output`.

Create a Google Sheets connection and select your own `RPA_3Way_Data` spreadsheet in all relevant read/write activities.

Required tabs:

```text
PO_Data
GRN_Data
Existing_Invoices
RPA_Live_Output
Config
Pending_File_Map
```

## 4. OpenAI

Used to convert extracted invoice PDF text into structured invoice data.

Create your own OpenAI connection in UiPath Integration Service using your own API key.

Never store the API key in:

- GitHub;
- README files;
- JSON committed to the repository;
- UiPath variables as plain text;
- screenshots.

## After rebinding

Verify:

```text
Gmail trigger → your Gmail connection
Google Drive activities → your Drive connection + folders
Google Sheets activities → your Sheets connection + RPA_3Way_Data
OpenAI activity → your OpenAI connection
```

Then deploy and run a clean matched invoice smoke test.
