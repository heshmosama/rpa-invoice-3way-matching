# Google Apps Script Setup

The Apps Script handles human approval, escalation, and final file routing.

## 1. Create the script

Create a Google Apps Script project and copy the contents of:

`apps-script/RPA_Invoice_Approval.gs`

## 2. Configure environment IDs

At the top of the script replace:
- `YOUR_SPREADSHEET_ID`
- `YOUR_PENDING_APPROVAL_FOLDER_ID`
- `YOUR_PROCESSED_INVOICES_FOLDER_ID`
- `YOUR_REJECTED_INVOICES_FOLDER_ID`

## 3. Deploy once as a Web App

Use **Deploy → New deployment → Web app** for the first deployment. Choose an access policy appropriate for the intended approvers/organization.

Copy the production URL ending in `/exec`.

## 4. Add Script Property

Open **Project Settings → Script Properties** and add:

```text
WEB_APP_URL = https://script.google.com/macros/s/.../exec
```

Do not use a `/dev` URL.

## 5. Initialize infrastructure

Run once:

```javascript
setupApprovalInfrastructure()
```

This ensures `Pending_File_Map` exists with the Process_ID column and creates/refreshed the 5-minute trigger for `sendPendingApprovals()`.

## 6. Validate

Run:

```javascript
testBusinessConfig()
testDriveRoutingAccess()
```

Then process one clean matched invoice in UiPath and optionally run:

```javascript
sendPendingApprovals()
```

You should receive the PM approval email.

## Updating code later

Do not create a new deployment unless intentionally changing the public endpoint. Use:

**Deploy → Manage deployments → Edit → New version → Deploy**

This keeps the same `/exec` URL.
