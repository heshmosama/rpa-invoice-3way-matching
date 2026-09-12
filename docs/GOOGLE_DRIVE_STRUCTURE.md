# Required Google Drive Structure

Create the following folders under one root folder:

```text
RPA-Invoice-Matching/
├── Data/
│   └── RPA_3Way_Data (Google Sheet)
├── Incoming-Invoices/
├── Pending-Approval/
├── Exceptions/
├── Processed-Invoices/
└── Rejected-Invoices/
```

## Folder responsibilities

- **Incoming-Invoices**: every PDF received by the Gmail-triggered UiPath workflow is copied here for intake/audit.
- **Pending-Approval**: only invoices that pass the 3-way match and require PM approval.
- **Exceptions**: invoices with Missing PO, Missing GRN, duplicate, quantity mismatch, price mismatch, calculation error, or other exceptions.
- **Processed-Invoices**: approved invoices after the Apps Script approval decision.
- **Rejected-Invoices**: rejected invoices after the Apps Script approval decision.
- **Data**: recommended location for the `RPA_3Way_Data` Google Sheet.

After creating the folders, copy each folder ID from its Google Drive URL and configure UiPath/Apps Script as described in `SETUP.md`.
