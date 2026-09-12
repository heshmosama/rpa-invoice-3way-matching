# Google Sheets Schema

Create one Google spreadsheet named `RPA_3Way_Data` with these tabs.

## PO_Data

Columns:

```text
PO_Number | Supplier_Number | Supplier_Name | PO_Qty | PO_Unit_Price | PO_Total | PO_Status
```

A sample is provided at `config/PO_Data_Sample.csv`.

## GRN_Data

Columns:

```text
GRN_Number | PO_Number | GRN_Qty
```

A sample is provided at `config/GRN_Data_Sample.csv`.

## Existing_Invoices

Represents invoices that already exist in the ERP/accounting system. It is not the list of every invoice merely received by the RPA.

Columns:

```text
Invoice_Reference | Existing_ERP_Record | Reason
```

## RPA_Live_Output

The UiPath process appends every processed invoice here. Use the header template in `config/RPA_Live_Output_Headers.csv`.

`Process_ID` is unique per processing run and is the primary correlation key used by the fixed Apps Script for file mapping.

## Config

Use `config/Config_Template.csv`.

Supported keys:
- `OCR_Confidence_Threshold`
- `Approval_Reminder_Hours`
- `Finance_Escalation_Hours`
- `Urgent_Escalation_Hours`
- `PM_Email`
- `Finance_Manager_Email`
- `CFO_Email`
- `Currency`

## Pending_File_Map

Owned by Apps Script. Recommended columns:

```text
Invoice_Reference | Drive_File_ID | Source_File_Name | Registered_At | Process_ID
```

Apps Script uses `Process_ID` to prevent stale filename/file-ID mappings when the same invoice filename is reused.

## Test_Cases (optional)

You may add a tab containing the regression matrix from `tests/Regression_Test_Matrix.csv` for demo/audit purposes.
