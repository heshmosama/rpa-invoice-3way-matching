# Regression Testing

The repository includes `tests/RPA_Regression_Test_Pack.zip` and `tests/Regression_Test_Matrix.csv`.

Core scenarios:

1. Clean 3-way match → Pending PM Approval.
2. Quantity mismatch → Exception / PM.
3. Price mismatch → Exception / PM.
4. Missing GRN → Exception / Warehouse.
5. Missing PO → Exception / PM.
6. ERP duplicate → Exception / FC.
7. Calculation error → Exception / PM.
8. PM reject → Rejected-Invoices.
9. PM approve → Processed-Invoices / Ready for Payment.
10. RPA duplicate → second receipt is Duplicate.
11. Same invoice reference + different supplier → not incorrectly treated as RPA duplicate.
12. Reused filename / new Process_ID → Apps Script must resolve the current pending file and not a stale Drive mapping.

For the ERP duplicate scenario, seed `Existing_Invoices` using `tests/ERP_Duplicate_Seed.csv` before sending that test invoice.
