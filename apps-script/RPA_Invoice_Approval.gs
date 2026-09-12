/**
 * PORTABLE GITHUB TEMPLATE
 * Replace YOUR_* values in CONFIG before deployment.
 * Do not commit API keys, OAuth tokens, service-account credentials, or other secrets.
 */

/**
 * RPA 3-Way Invoice Matching - External PM Approval
 *
 * UiPath responsibility:
 *   - Write MATCHED invoices with Approval_Status = "Pending PM Approval"
 *   - Copy the PDF to the Pending-Approval Google Drive folder
 *
 * Apps Script responsibility:
 *   - Own Pending_File_Map and capture immutable Drive File IDs automatically
 *     using the unique RPA_Live_Output Process_ID for each processing run.
 *   - Self-heal missing Pending_File_Map rows by resolving the PDF in
 *     Pending-Approval and registering its immutable Drive File ID
 *
 *   - Send approval email to the PM
 *   - Handle Approve / Reject links
 *   - Update RPA_Live_Output
 *   - Move the pending PDF to Processed-Invoices or Rejected-Invoices
 *
 * IMPORTANT:
 *   - Deploy this project ONCE as a Web App.
 *   - After code changes, use:
 *       Deploy -> Manage deployments -> Edit -> New version -> Deploy
 *   - Do NOT hardcode the Web App URL in code.
 *   - Store the production /exec URL once in Script Properties as WEB_APP_URL.
 *   - Updating the same deployment to a new version keeps the /exec URL stable.
 *   - Business settings are read dynamically from the existing Config sheet:
 *       OCR threshold, reminder/escalation hours, PM/Finance/CFO emails, currency.
 *   - Changing Config values requires no UiPath change and no redeployment.
 */

const CONFIG = Object.freeze({
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
  SHEET_NAME: 'RPA_Live_Output',
  CONFIG_SHEET_NAME: 'Config',
  PENDING_FILE_MAP_SHEET_NAME: 'Pending_File_Map',

  OCR_CONFIDENCE_THRESHOLD_KEY: 'OCR_Confidence_Threshold',
  APPROVAL_REMINDER_HOURS_KEY: 'Approval_Reminder_Hours',
  FINANCE_ESCALATION_HOURS_KEY: 'Finance_Escalation_Hours',
  URGENT_ESCALATION_HOURS_KEY: 'Urgent_Escalation_Hours',
  PM_EMAIL_KEY: 'PM_Email',
  FINANCE_MANAGER_EMAIL_KEY: 'Finance_Manager_Email',
  CFO_EMAIL_KEY: 'CFO_Email',
  CURRENCY_KEY: 'Currency',

  PENDING_FOLDER_ID: 'YOUR_PENDING_APPROVAL_FOLDER_ID',
  PROCESSED_FOLDER_ID: 'YOUR_PROCESSED_INVOICES_FOLDER_ID',
  REJECTED_FOLDER_ID: 'YOUR_REJECTED_INVOICES_FOLDER_ID',

  PENDING_STATUS: 'Pending PM Approval',
  APPROVED_STATUS: 'Approved',
  REJECTED_STATUS: 'Rejected'
});

/**
 * Reads all business settings dynamically from the existing Config sheet.
 *
 * Expected Config sheet:
 *   OCR_Confidence_Threshold | 0.85
 *   Approval_Reminder_Hours  | 24
 *   Finance_Escalation_Hours | 48
 *   Urgent_Escalation_Hours  | 72
 *   PM_Email                 | pm@company.com
 *   Finance_Manager_Email    | finance@company.com
 *   CFO_Email                | cfo@company.com
 *   Currency                 | EGP
 *
 * Changing values in this sheet does NOT require redeployment.
 */
function getBusinessConfig_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.CONFIG_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Config sheet not found: ' + CONFIG.CONFIG_SHEET_NAME
    );
  }

  const values = sheet.getDataRange().getValues();
  const map = {};

  for (let i = 0; i < values.length; i++) {
    const key = stringValue_(values[i][0]);
    if (!key) continue;
    map[key.toLowerCase()] = stringValue_(values[i][1]);
  }

  const get = key => {
    const value = map[String(key).toLowerCase()];
    return value === undefined ? '' : value;
  };

  const numberValue = (key, fallback) => {
    const raw = get(key);
    if (raw === '') return fallback;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        'Config value must be numeric: ' + key + ' = ' + raw
      );
    }
    return parsed;
  };

  const emailValue = (key, required) => {
    const value = get(key);

    if (!value) {
      if (required) {
        throw new Error('Config email is blank: ' + key);
      }
      return '';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error(
        'Invalid email in Config: ' + key + ' = ' + value
      );
    }

    return value;
  };

  const cfg = {
    ocrConfidenceThreshold: numberValue(
      CONFIG.OCR_CONFIDENCE_THRESHOLD_KEY,
      0.85
    ),
    approvalReminderHours: numberValue(
      CONFIG.APPROVAL_REMINDER_HOURS_KEY,
      24
    ),
    financeEscalationHours: numberValue(
      CONFIG.FINANCE_ESCALATION_HOURS_KEY,
      48
    ),
    urgentEscalationHours: numberValue(
      CONFIG.URGENT_ESCALATION_HOURS_KEY,
      72
    ),
    pmEmail: emailValue(CONFIG.PM_EMAIL_KEY, true),
    financeManagerEmail: emailValue(
      CONFIG.FINANCE_MANAGER_EMAIL_KEY,
      false
    ),
    cfoEmail: emailValue(CONFIG.CFO_EMAIL_KEY, false),
    currency: get(CONFIG.CURRENCY_KEY) || 'EGP'
  };

  if (
    cfg.approvalReminderHours < 0 ||
    cfg.financeEscalationHours < cfg.approvalReminderHours ||
    cfg.urgentEscalationHours < cfg.financeEscalationHours
  ) {
    throw new Error(
      'Invalid escalation timing. Expected Reminder <= Finance <= Urgent.'
    );
  }

  if (
    cfg.ocrConfidenceThreshold < 0 ||
    cfg.ocrConfidenceThreshold > 1
  ) {
    throw new Error(
      'OCR_Confidence_Threshold must be between 0 and 1.'
    );
  }

  return cfg;
}

/**
 * Optional helper. Run manually to confirm Config is being read correctly.
 */
function testBusinessConfig() {
  const cfg = getBusinessConfig_();
  Logger.log(JSON.stringify(cfg, null, 2));
  return cfg;
}

/**
 * Run this once after deploying this version.
 * It creates the technical Pending_File_Map sheet (if missing)
 * and refreshes the 5-minute approval trigger.
 */
function setupApprovalInfrastructure() {
  ensurePendingFileMapSheet_();
  setupApprovalTrigger();
  Logger.log('Approval infrastructure is ready.');
}

function ensurePendingFileMapSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.PENDING_FILE_MAP_SHEET_NAME);

  // Keep the existing four columns in the same order so old rows remain valid.
  // Process_ID is appended as a fifth column and becomes the primary
  // correlation key for all new runs.
  const headers = [
    'Invoice_Reference',
    'Drive_File_ID',
    'Source_File_Name',
    'Registered_At',
    'Process_ID'
  ];

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.PENDING_FILE_MAP_SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  const lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const currentHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(v => String(v || '').trim());

  headers.forEach((header, index) => {
    if (currentHeaders[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });

  return sheet;
}

/**
 * Run this ONCE after deploying the script as a Web App.
 * Creates a 5-minute trigger that scans for new pending approvals.
 */
function setupApprovalTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendPendingApprovals')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('sendPendingApprovals')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('Approval trigger created. New pending invoices will be checked every 5 minutes.');
}

/**
 * Returns the active deployed Web App URL.
 * No hardcoded deployment URL is required.
 */
function getWebAppUrl_() {
  const url = PropertiesService
    .getScriptProperties()
    .getProperty('WEB_APP_URL');

  if (!url) {
    throw new Error(
      'Missing Script Property WEB_APP_URL. ' +
      'In Apps Script go to Project Settings -> Script Properties and add ' +
      'WEB_APP_URL with the deployed /exec Web App URL.'
    );
  }

  if (!/\/exec$/.test(url)) {
    throw new Error(
      'WEB_APP_URL must be the deployed production URL ending in /exec, not /dev. ' +
      'Current value: ' + url
    );
  }

  return url;
}

/**
 * Optional test helper.
 * Reads the production /exec URL from Script Properties.
 */
function testApprovalWebAppUrl() {
  const url = getWebAppUrl_();
  Logger.log('Production Web App URL: ' + url);
  return url;
}

/**
 * Scans RPA_Live_Output and sends one approval email for each new MATCHED invoice.
 *
 * A row is considered new when:
 *   Match_Result = MATCHED
 *   Approval_Status = Pending PM Approval
 *   Approval_ID is blank
 */
function sendPendingApprovals() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    const webAppUrl = getWebAppUrl_();
    const businessConfig = getBusinessConfig_();
    const ctx = getSheetContext_();

    // Make sure the technical map exists. Apps Script owns this table now.
    ensurePendingFileMapSheet_();

    const values = ctx.sheet.getDataRange().getValues();

    if (values.length < 2) {
      console.log('No RPA_Live_Output rows found.');
      return;
    }

    let pendingRows = 0;
    let emailsSent = 0;

    for (let i = 1; i < values.length; i++) {
      const rowNumber = i + 1;
      const row = values[i];

      const processId = stringValue_(
        row[ctx.col.Process_ID]
      );

      const invoiceReference = stringValue_(
        row[ctx.col.Invoice_Reference]
      );

      const matchResult = stringValue_(
        row[ctx.col.Match_Result]
      );

      const approvalStatus = stringValue_(
        row[ctx.col.Approval_Status]
      );

      const existingApprovalId = stringValue_(
        row[ctx.col.Approval_ID]
      );

      const emailSentAt =
        ctx.col.Approval_Email_Sent_At !== undefined
          ? row[ctx.col.Approval_Email_Sent_At]
          : '';

      console.log(
        'SCAN | Row=' +
          rowNumber +
          ' | Process_ID=' +
          processId +
          ' | Invoice=' +
          invoiceReference +
          ' | Match=' +
          matchResult +
          ' | Approval=' +
          approvalStatus +
          ' | Approval_ID=' +
          existingApprovalId +
          ' | EmailSent=' +
          stringValue_(emailSentAt)
      );

      // Only MATCHED invoices pending PM approval belong in this workflow.
      if (
        matchResult !== 'MATCHED' ||
        approvalStatus !== CONFIG.PENDING_STATUS
      ) {
        continue;
      }

      pendingRows++;

      // If the approval email was already sent, only update age/escalations.
      if (emailSentAt) {
        const ageHours = updateApprovalAgeForRow_(
          ctx,
          rowNumber,
          row
        );

        processApprovalEscalation_(
          ctx,
          rowNumber,
          row,
          ageHours,
          businessConfig,
          webAppUrl
        );

        continue;
      }

      // Optional OCR quality guard.
      if (
        !isOcrConfidenceAcceptable_(
          row,
          ctx.col,
          businessConfig.ocrConfidenceThreshold
        )
      ) {
        setCell_(ctx, rowNumber, 'Match_Result', 'EXCEPTION');
        setCell_(ctx, rowNumber, 'Exception_Type', 'Data Quality/OCR');
        setCell_(ctx, rowNumber, 'Owner', 'FC');
        setCell_(ctx, rowNumber, 'Action', 'Review Data Quality');
        setCell_(ctx, rowNumber, 'Invoice_Status', 'Exception');
        setCell_(ctx, rowNumber, 'Approval_Status', 'Not Required');
        setCell_(ctx, rowNumber, 'Payment_Status', 'Not Ready');

        appendApprovalComment_(
          ctx,
          rowNumber,
          'OCR confidence is below configured threshold ' +
            businessConfig.ocrConfidenceThreshold
        );

        console.log(
          'SKIP | Invoice=' +
            invoiceReference +
            ' | Reason=OCR threshold'
        );

        continue;
      }

      const sourceFileName = stringValue_(
        row[ctx.col.Source_File_Name]
      );

      // Apps Script resolves and registers the immutable Drive File ID.
      // UiPath no longer needs to write Pending_File_Map.
      const pendingRecord = resolveOrRegisterPendingDriveRecord_(
        processId,
        invoiceReference,
        sourceFileName,
        row,
        ctx.col
      );

      if (!pendingRecord || !pendingRecord.driveFileId) {
        const message =
          'Pending PDF was not found in Pending-Approval. ' +
          'Expected source file: ' +
          sourceFileName;

        setCell_(
          ctx,
          rowNumber,
          'Approval_Comments',
          message
        );

        console.log(
          'WAIT | Invoice=' +
            invoiceReference +
            ' | ' +
            message
        );

        continue;
      }

      let pendingDriveFile;

      try {
        pendingDriveFile = DriveApp.getFileById(
          pendingRecord.driveFileId
        );
      } catch (err) {
        const message =
          'Pending Drive File ID cannot be accessed: ' +
          pendingRecord.driveFileId +
          ' | ' +
          err.message;

        setCell_(
          ctx,
          rowNumber,
          'Approval_Comments',
          message
        );

        console.log(
          'WAIT | Invoice=' +
            invoiceReference +
            ' | ' +
            message
        );

        continue;
      }

      // Persist exact Drive identity in RPA_Live_Output.
      setCell_(
        ctx,
        rowNumber,
        'Pending_Drive_File_ID',
        pendingRecord.driveFileId
      );

      setCell_(
        ctx,
        rowNumber,
        'Pending_Drive_File_Name',
        pendingDriveFile.getName()
      );

      setCell_(
        ctx,
        rowNumber,
        'File_Path',
        'RPA-Invoice-Matching/Pending-Approval/' +
          pendingDriveFile.getName()
      );

      const approverEmail = businessConfig.pmEmail;

      // Reuse an existing token if a previous attempt created one but did not
      // successfully send the email. Otherwise generate a new token.
      const token =
        existingApprovalId || Utilities.getUuid();

      const now = new Date();

      setCell_(ctx, rowNumber, 'Approval_ID', token);

      if (!row[ctx.col.Approval_Created_At]) {
        setCell_(ctx, rowNumber, 'Approval_Created_At', now);
      }

      setCell_(ctx, rowNumber, 'Approval_Age_Hours', 0);
      setCell_(ctx, rowNumber, 'Approval_Response', '');
      setCell_(ctx, rowNumber, 'Approver_Email', approverEmail);
      setCell_(ctx, rowNumber, 'Owner', 'PM');
      setCell_(ctx, rowNumber, 'Action', 'Awaiting PM Approval');

      setCell_(
        ctx,
        rowNumber,
        'Approval_Comments',
        'Approval email queued for ' + approverEmail
      );

      SpreadsheetApp.flush();

      const approveUrl =
        webAppUrl +
        '?action=approve&token=' +
        encodeURIComponent(token);

      const rejectUrl =
        webAppUrl +
        '?action=reject&token=' +
        encodeURIComponent(token);

      const invoiceFileUrl = pendingDriveFile.getUrl();

      try {
        sendApprovalEmail_(
          row,
          ctx.col,
          approveUrl,
          rejectUrl,
          invoiceFileUrl,
          approverEmail,
          businessConfig
        );

        setCell_(
          ctx,
          rowNumber,
          'Approval_Email_Sent_At',
          new Date()
        );

        setCell_(
          ctx,
          rowNumber,
          'Approval_Comments',
          'Approval email sent to ' + approverEmail
        );

        SpreadsheetApp.flush();

        emailsSent++;

        console.log(
          'EMAIL SENT | Invoice=' +
            invoiceReference +
            ' | To=' +
            approverEmail +
            ' | DriveFileId=' +
            pendingRecord.driveFileId
        );
      } catch (err) {
        setCell_(
          ctx,
          rowNumber,
          'Approval_Comments',
          'Approval email failed: ' + err.message
        );

        console.error(
          'EMAIL FAILED | Invoice=' +
            invoiceReference +
            ' | ' +
            err.message
        );
      }
    }

    console.log(
      'SUMMARY | PendingRows=' +
        pendingRows +
        ' | EmailsSent=' +
        emailsSent
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * Diagnostic helper for current pending approvals.
 * Run manually if an approval email is not sent.
 */
function debugPendingApprovals() {
  const ctx = getSheetContext_();
  const values = ctx.sheet.getDataRange().getValues();

  if (values.length < 2) {
    console.log('RPA_Live_Output has no data rows.');
    return;
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    console.log(
      'ROW=' +
        (i + 1) +
        ' | Process_ID=' +
        stringValue_(row[ctx.col.Process_ID]) +
        ' | Invoice=' +
        stringValue_(row[ctx.col.Invoice_Reference]) +
        ' | Match=' +
        stringValue_(row[ctx.col.Match_Result]) +
        ' | Approval=' +
        stringValue_(row[ctx.col.Approval_Status]) +
        ' | Approval_ID=' +
        stringValue_(row[ctx.col.Approval_ID]) +
        ' | File=' +
        stringValue_(row[ctx.col.Source_File_Name]) +
        ' | DriveID=' +
        (
          ctx.col.Pending_Drive_File_ID !== undefined
            ? stringValue_(row[ctx.col.Pending_Drive_File_ID])
            : ''
        )
    );
  }
}

/**
 * Web App endpoint used by Approve / Reject links.
 */
function doGet(e) {
  const action = String(
    (e && e.parameter && e.parameter.action) || ''
  ).toLowerCase();

  const token = String(
    (e && e.parameter && e.parameter.token) || ''
  ).trim();

  if (!['approve', 'reject'].includes(action) || !token) {
    return renderResultPage_(
      'Invalid approval link',
      'The approval link is missing or invalid.',
      false
    );
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    return renderResultPage_(
      'Please try again',
      'Another approval is being processed. Please retry in a few seconds.',
      false
    );
  }

  try {
    const ctx = getSheetContext_();
    const values = ctx.sheet.getDataRange().getValues();

    let rowIndex = -1;
    let row = null;

    for (let i = 1; i < values.length; i++) {
      if (stringValue_(values[i][ctx.col.Approval_ID]) === token) {
        rowIndex = i + 1;
        row = values[i];
        break;
      }
    }

    if (rowIndex === -1) {
      return renderResultPage_(
        'Approval not found',
        'This approval request does not exist or the token is invalid.',
        false
      );
    }

    const invoiceReference = stringValue_(
      row[ctx.col.Invoice_Reference]
    );

    const currentStatus = stringValue_(
      row[ctx.col.Approval_Status]
    );

    // Use the approver originally assigned when the email was sent.
    // If this is an older row without Approver_Email, fall back to current Config.
    const approverEmail =
      stringValue_(row[ctx.col.Approver_Email]) ||
      getBusinessConfig_().pmEmail;

    // Prevent duplicate processing.
    if (currentStatus !== CONFIG.PENDING_STATUS) {
      return renderResultPage_(
        'Already processed',
        'Invoice ' +
          invoiceReference +
          ' is already ' +
          currentStatus +
          '.',
        true
      );
    }

    const approved = action === 'approve';
    const now = new Date();
    const createdAt = row[ctx.col.Approval_Created_At];

    const ageHours =
      createdAt instanceof Date
        ? Math.round(
            ((now.getTime() - createdAt.getTime()) / 3600000) * 100
          ) / 100
        : '';

    const routeResult = movePendingInvoice_(row, ctx.col, approved);

    // Do not finalize Approve/Reject if the PDF could not be routed.
    // Keep the request pending so the PM can retry after the Drive issue is fixed.
    if (!routeResult.success) {
      setCell_(
        ctx,
        rowIndex,
        'Approval_Comments',
        (approved ? 'Approve' : 'Reject') +
          ' decision NOT completed. Drive routing failed: ' +
          routeResult.message
      );

      SpreadsheetApp.flush();

      return renderResultPage_(
        'Drive routing failed',
        'Invoice ' +
          invoiceReference +
          ' remains Pending PM Approval because the PDF could not be moved. ' +
          routeResult.message,
        false
      );
    }

    if (approved) {
      setCell_(
        ctx,
        rowIndex,
        'Approval_Status',
        CONFIG.APPROVED_STATUS
      );
      setCell_(ctx, rowIndex, 'Approval_Response', 'Approved');
      setCell_(ctx, rowIndex, 'Invoice_Status', 'Approved');
      setCell_(ctx, rowIndex, 'Action', 'Ready for Payment');
      setCell_(
        ctx,
        rowIndex,
        'Payment_Status',
        'Ready for Payment'
      );
      if (routeResult.success) {
        setCell_(
          ctx,
          rowIndex,
          'File_Path',
          'RPA-Invoice-Matching/Processed-Invoices/' + routeResult.fileName
        );
      }
    } else {
      setCell_(
        ctx,
        rowIndex,
        'Approval_Status',
        CONFIG.REJECTED_STATUS
      );
      setCell_(ctx, rowIndex, 'Approval_Response', 'Rejected');
      setCell_(ctx, rowIndex, 'Invoice_Status', 'Rejected');
      setCell_(ctx, rowIndex, 'Action', 'Review Rejection');
      setCell_(ctx, rowIndex, 'Payment_Status', 'Not Ready');
      if (routeResult.success) {
        setCell_(
          ctx,
          rowIndex,
          'File_Path',
          'RPA-Invoice-Matching/Rejected-Invoices/' + routeResult.fileName
        );
      }
    }

    setCell_(ctx, rowIndex, 'Approval_Completed_At', now);
    setCell_(ctx, rowIndex, 'Approval_Age_Hours', ageHours);

    setCell_(
      ctx,
      rowIndex,
      'Approval_Comments',
      (approved ? 'Approved' : 'Rejected') +
        ' via email by ' +
        approverEmail +
        '. Drive routing: ' +
        routeResult.message
    );

    SpreadsheetApp.flush();

    sendDecisionConfirmation_(
      invoiceReference,
      approved,
      routeResult.message,
      approverEmail
    );

    return renderResultPage_(
      approved ? 'Invoice approved' : 'Invoice rejected',
      'Invoice ' +
        invoiceReference +
        ' has been ' +
        (approved
          ? 'approved and marked Ready for Payment.'
          : 'rejected.'),
      true
    );
  } catch (err) {
    console.error(err);

    return renderResultPage_(
      'Approval failed',
      err.message || String(err),
      false
    );
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sends the approval email.
 */
function sendApprovalEmail_(
  row,
  col,
  approveUrl,
  rejectUrl,
  invoiceFileUrl,
  approverEmail,
  businessConfig
) {
  const invoice = stringValue_(row[col.Invoice_Reference]);
  const supplier = stringValue_(row[col.Supplier_Name]);
  const po = stringValue_(row[col.PO_Number]);
  const amount = row[col.Invoice_Amount];
  const qty = row[col.Invoice_Qty];
  const grnQty = row[col.GRN_Qty];
  const unitPrice = row[col.Invoice_Unit_Price];
  const currency = businessConfig.currency;

  const formattedAmount = formatMoney_(amount, currency);
  const formattedUnitPrice = formatMoney_(unitPrice, currency);

  const subject = 'Invoice Approval Required - ' + invoice;

  const fileSection = invoiceFileUrl
    ? '<p><a href="' +
      htmlEscape_(invoiceFileUrl) +
      '" target="_blank">Open invoice PDF in Google Drive</a></p>'
    : '';

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto">' +
    '<h2>Invoice Approval Required</h2>' +
    '<p>A 3-way matched invoice is waiting for your decision.</p>' +
    '<table style="border-collapse:collapse;width:100%">' +
    htmlRow_('Invoice', invoice) +
    htmlRow_('Supplier', supplier) +
    htmlRow_('PO Number', po) +
    htmlRow_('Invoice Amount', formattedAmount) +
    htmlRow_('Invoice Qty', qty) +
    htmlRow_('GRN Qty', grnQty) +
    htmlRow_('Unit Price', formattedUnitPrice) +
    '</table>' +
    fileSection +
    '<div style="margin-top:28px">' +
    '<a href="' +
    htmlEscape_(approveUrl) +
    '" style="display:inline-block;padding:12px 22px;margin-right:12px;background:#188038;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Approve</a>' +
    '<a href="' +
    htmlEscape_(rejectUrl) +
    '" style="display:inline-block;padding:12px 22px;background:#d93025;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Reject</a>' +
    '</div>' +
    '<p style="margin-top:28px;color:#666;font-size:12px">Each request can be processed only once. These links are unique to this approval request.</p>' +
    '</div>';

  const plainBody =
    'Invoice Approval Required\n\n' +
    'Invoice: ' +
    invoice +
    '\n' +
    'Supplier: ' +
    supplier +
    '\n' +
    'PO Number: ' +
    po +
    '\n' +
    'Invoice Amount: ' +
    formattedAmount +
    '\n' +
    'Invoice Qty: ' +
    qty +
    '\n' +
    'GRN Qty: ' +
    grnQty +
    '\n' +
    'Unit Price: ' +
    formattedUnitPrice +
    '\n\n' +
    'Approve: ' +
    approveUrl +
    '\n' +
    'Reject: ' +
    rejectUrl +
    '\n' +
    (invoiceFileUrl
      ? 'Invoice PDF: ' + invoiceFileUrl + '\n'
      : '');

  GmailApp.sendEmail(
    approverEmail,
    subject,
    plainBody,
    {
      htmlBody: htmlBody,
      name: 'RPA Invoice Approval'
    }
  );
}

/**
 * Sends a confirmation after approval/rejection.
 */
function sendDecisionConfirmation_(
  invoiceReference,
  approved,
  routeResult,
  approverEmail
) {
  const decision = approved ? 'APPROVED' : 'REJECTED';

  GmailApp.sendEmail(
    approverEmail,
    'Invoice ' + decision + ' - ' + invoiceReference,
    'Invoice ' +
      invoiceReference +
      ' was ' +
      decision +
      '.\nDrive routing: ' +
      routeResult
  );
}

/**
 * Gets the sheet and maps column names to indexes.
 */
function getSheetContext_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Sheet not found: ' + CONFIG.SHEET_NAME
    );
  }

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  const col = {};

  headers.forEach((h, i) => {
    col[String(h).trim()] = i;
  });

  const required = [
    'Process_ID',
    'Invoice_Reference',
    'Supplier_Name',
    'PO_Number',
    'Invoice_Amount',
    'Invoice_Qty',
    'Invoice_Unit_Price',
    'GRN_Qty',
    'Match_Result',
    'Action',
    'Owner',
    'Invoice_Status',
    'Approval_Status',
    'Approval_ID',
    'Approval_Created_At',
    'Approval_Completed_At',
    'Approval_Response',
    'Approval_Comments',
    'Approval_Age_Hours',
    'Payment_Status',
    'Source_File_Name',
    'File_Path'
  ];

  const missing = required.filter(
    name => col[name] === undefined
  );

  if (missing.length) {
    throw new Error(
      'Missing required RPA_Live_Output columns: ' +
      missing.join(', ')
    );
  }

  // Add approval audit/escalation columns automatically when missing.
  const optionalColumns = [
    'Approver_Email',
    'Approval_Email_Sent_At',
    'Reminder_Sent_At',
    'Finance_Escalated_At',
    'Urgent_Escalated_At',
    'Pending_Drive_File_ID',
    'Pending_Drive_File_Name'
  ];

  optionalColumns.forEach(name => {
    if (col[name] !== undefined) return;

    const newColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, newColumn).setValue(name);
    col[name] = newColumn - 1;
  });

  return { ss, sheet, col };
}

/**
 * Writes one value into the named column.
 */
function setCell_(
  ctx,
  rowNumber,
  columnName,
  value
) {
  const index = ctx.col[columnName];

  if (index === undefined) return;

  ctx.sheet
    .getRange(rowNumber, index + 1)
    .setValue(value);
}

/**
 * Updates how long an approval has been pending.
 */
function updateApprovalAgeForRow_(
  ctx,
  rowNumber,
  row
) {
  const created = row[ctx.col.Approval_Created_At];

  if (!(created instanceof Date)) return null;

  const hours =
    Math.round(
      ((Date.now() - created.getTime()) / 3600000) * 100
    ) / 100;

  setCell_(
    ctx,
    rowNumber,
    'Approval_Age_Hours',
    hours
  );

  return hours;
}

/**
 * Uses OCR_Confidence_Threshold when RPA_Live_Output contains a real
 * numeric OCR_Confidence value. Blank / "N/A" means confidence is not
 * available and does not block approval.
 */
function isOcrConfidenceAcceptable_(
  row,
  col,
  threshold
) {
  if (col.OCR_Confidence === undefined) return true;

  const raw = stringValue_(row[col.OCR_Confidence]);
  if (!raw || raw.toUpperCase() === 'N/A') return true;

  let confidence = Number(raw.replace('%', ''));

  if (!Number.isFinite(confidence)) return true;

  if (raw.includes('%') || confidence > 1) {
    confidence = confidence / 100;
  }

  return confidence >= threshold;
}

/**
 * Runs the 24h / 48h / 72h rules from Config.
 *
 * 24h -> PM reminder
 * 48h -> Finance Manager escalation
 * 72h -> urgent Finance Manager + CFO escalation
 *
 * Only the highest overdue unsent level is sent in one execution, avoiding
 * several emails at once if the script was temporarily not running.
 */
function processApprovalEscalation_(
  ctx,
  rowNumber,
  row,
  ageHours,
  businessConfig,
  webAppUrl
) {
  if (ageHours === null || ageHours === undefined) return;

  const token = stringValue_(row[ctx.col.Approval_ID]);
  if (!token) return;

  const invoice = stringValue_(row[ctx.col.Invoice_Reference]);
  const assignedPm =
    stringValue_(row[ctx.col.Approver_Email]) ||
    businessConfig.pmEmail;

  const approveUrl =
    webAppUrl +
    '?action=approve&token=' +
    encodeURIComponent(token);

  const rejectUrl =
    webAppUrl +
    '?action=reject&token=' +
    encodeURIComponent(token);

  const invoiceFileUrl = getPendingInvoiceUrl_(row, ctx.col);

  const reminderSent = row[ctx.col.Reminder_Sent_At];
  const financeSent = row[ctx.col.Finance_Escalated_At];
  const urgentSent = row[ctx.col.Urgent_Escalated_At];

  // 72h: Finance Manager + CFO
  if (
    ageHours >= businessConfig.urgentEscalationHours &&
    !urgentSent
  ) {
    const recipients = uniqueNonBlank_([
      businessConfig.financeManagerEmail,
      businessConfig.cfoEmail
    ]);

    if (recipients.length) {
      sendEscalationEmail_(
        recipients.join(','),
        'URGENT Invoice Approval Escalation - ' + invoice,
        'Urgent escalation',
        row,
        ctx.col,
        ageHours,
        approveUrl,
        rejectUrl,
        invoiceFileUrl,
        businessConfig
      );

      const now = new Date();
      setCell_(ctx, rowNumber, 'Urgent_Escalated_At', now);

      // Avoid sending missed lower-level notices afterwards.
      if (!reminderSent) {
        setCell_(ctx, rowNumber, 'Reminder_Sent_At', now);
      }
      if (!financeSent) {
        setCell_(ctx, rowNumber, 'Finance_Escalated_At', now);
      }

      appendApprovalComment_(
        ctx,
        rowNumber,
        'Urgent escalation sent to ' + recipients.join(', ')
      );
      return;
    }
  }

  // 48h: Finance Manager
  if (
    ageHours >= businessConfig.financeEscalationHours &&
    !financeSent &&
    businessConfig.financeManagerEmail
  ) {
    sendEscalationEmail_(
      businessConfig.financeManagerEmail,
      'Invoice Approval Escalation - ' + invoice,
      'Finance escalation',
      row,
      ctx.col,
      ageHours,
      approveUrl,
      rejectUrl,
      invoiceFileUrl,
      businessConfig
    );

    const now = new Date();
    setCell_(ctx, rowNumber, 'Finance_Escalated_At', now);

    if (!reminderSent) {
      setCell_(ctx, rowNumber, 'Reminder_Sent_At', now);
    }

    appendApprovalComment_(
      ctx,
      rowNumber,
      'Finance escalation sent to ' +
        businessConfig.financeManagerEmail
    );
    return;
  }

  // 24h: original assigned PM reminder
  if (
    ageHours >= businessConfig.approvalReminderHours &&
    !reminderSent
  ) {
    sendEscalationEmail_(
      assignedPm,
      'Reminder: Invoice Approval Required - ' + invoice,
      'PM approval reminder',
      row,
      ctx.col,
      ageHours,
      approveUrl,
      rejectUrl,
      invoiceFileUrl,
      businessConfig
    );

    setCell_(
      ctx,
      rowNumber,
      'Reminder_Sent_At',
      new Date()
    );

    appendApprovalComment_(
      ctx,
      rowNumber,
      'PM reminder sent to ' + assignedPm
    );
  }
}

/**
 * Sends reminder/escalation emails using the same approval token.
 */
function sendEscalationEmail_(
  recipients,
  subject,
  heading,
  row,
  col,
  ageHours,
  approveUrl,
  rejectUrl,
  invoiceFileUrl,
  businessConfig
) {
  const invoice = stringValue_(row[col.Invoice_Reference]);
  const supplier = stringValue_(row[col.Supplier_Name]);
  const po = stringValue_(row[col.PO_Number]);
  const amount = formatMoney_(
    row[col.Invoice_Amount],
    businessConfig.currency
  );

  const fileSection = invoiceFileUrl
    ? '<p><a href="' +
      htmlEscape_(invoiceFileUrl) +
      '" target="_blank">Open invoice PDF in Google Drive</a></p>'
    : '';

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto">' +
    '<h2>' + htmlEscape_(heading) + '</h2>' +
    '<p>This invoice has been waiting for approval for ' +
    htmlEscape_(ageHours) +
    ' hours.</p>' +
    '<table style="border-collapse:collapse;width:100%">' +
    htmlRow_('Invoice', invoice) +
    htmlRow_('Supplier', supplier) +
    htmlRow_('PO Number', po) +
    htmlRow_('Invoice Amount', amount) +
    '</table>' +
    fileSection +
    '<div style="margin-top:28px">' +
    '<a href="' +
    htmlEscape_(approveUrl) +
    '" style="display:inline-block;padding:12px 22px;margin-right:12px;background:#188038;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Approve</a>' +
    '<a href="' +
    htmlEscape_(rejectUrl) +
    '" style="display:inline-block;padding:12px 22px;background:#d93025;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Reject</a>' +
    '</div>' +
    '</div>';

  const plainBody =
    heading + '\n\n' +
    'Invoice: ' + invoice + '\n' +
    'Supplier: ' + supplier + '\n' +
    'PO Number: ' + po + '\n' +
    'Invoice Amount: ' + amount + '\n' +
    'Pending Age: ' + ageHours + ' hours\n\n' +
    'Approve: ' + approveUrl + '\n' +
    'Reject: ' + rejectUrl + '\n' +
    (invoiceFileUrl
      ? 'Invoice PDF: ' + invoiceFileUrl + '\n'
      : '');

  GmailApp.sendEmail(
    recipients,
    subject,
    plainBody,
    {
      htmlBody: htmlBody,
      name: 'RPA Invoice Approval'
    }
  );
}

/**
 * Appends audit text without destroying the previous approval comment.
 */
function appendApprovalComment_(
  ctx,
  rowNumber,
  message
) {
  const index = ctx.col.Approval_Comments;
  if (index === undefined) return;

  const cell = ctx.sheet.getRange(rowNumber, index + 1);
  const current = stringValue_(cell.getValue());

  cell.setValue(
    current
      ? current + ' | ' + message
      : message
  );
}

function uniqueNonBlank_(values) {
  const result = [];
  const seen = {};

  values.forEach(value => {
    const email = stringValue_(value);
    if (!email) return;

    const key = email.toLowerCase();
    if (seen[key]) return;

    seen[key] = true;
    result.push(email);
  });

  return result;
}

function formatMoney_(value, currency) {
  const raw = stringValue_(value);
  const numeric = Number(raw);

  if (Number.isFinite(numeric)) {
    return (
      stringValue_(currency) +
      ' ' +
      numeric.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      })
    );
  }

  return stringValue_(currency) + ' ' + raw;
}

/**
 * Resolves the immutable Drive File ID for a pending invoice.
 *
 * Preferred path:
 *   Pending_File_Map -> Drive File ID
 *
 * Self-healing fallback:
 *   If UiPath has not populated Pending_File_Map yet, locate the PDF in the
 *   Pending-Approval folder by its source filename, capture the actual Drive
 *   File ID, append the mapping automatically, and continue sending approval.
 */
function resolveOrRegisterPendingDriveRecord_(
  processId,
  invoiceReference,
  sourceFileName,
  outputRow,
  outputCol
) {
  const wantedProcessId = stringValue_(processId);

  // 1) Preferred: exact mapping for THIS processing run.
  // Never reuse another run merely because it has the same invoice reference.
  let record = getPendingDriveRecord_(
    wantedProcessId,
    invoiceReference,
    sourceFileName
  );

  if (record && record.driveFileId) {
    const mappedFile = getFileIfInsideFolder_(
      record.driveFileId,
      CONFIG.PENDING_FOLDER_ID
    );

    if (mappedFile) {
      return {
        driveFileId: mappedFile.getId(),
        sourceFileName: mappedFile.getName(),
        registeredAt: record.registeredAt,
        processId: wantedProcessId
      };
    }

    console.log(
      'STALE MAP IGNORED | Process_ID=' +
        wantedProcessId +
        ' | Invoice=' +
        invoiceReference +
        ' | DriveFileId=' +
        record.driveFileId +
        ' | Reason=File is no longer in Pending-Approval'
    );
  }

  // 2) Resolve the PDF that is CURRENTLY in Pending-Approval.
  let expectedFileName = stringValue_(sourceFileName);

  if (!expectedFileName && outputRow && outputCol) {
    expectedFileName = getInvoiceFileName_(
      outputRow,
      outputCol
    );
  }

  if (!expectedFileName) return null;

  const file = findNewestFileByName_(
    CONFIG.PENDING_FOLDER_ID,
    expectedFileName
  );

  if (!file) return null;

  // 3) Register immutable Drive identity against the unique Process_ID.
  const mapSheet = ensurePendingFileMapSheet_();

  mapSheet.appendRow([
    stringValue_(invoiceReference),
    file.getId(),
    file.getName(),
    new Date(),
    wantedProcessId
  ]);

  SpreadsheetApp.flush();

  console.log(
    'AUTO-REGISTERED Pending Drive File ID | Process_ID=' +
      wantedProcessId +
      ' | Invoice=' +
      invoiceReference +
      ' | File=' +
      file.getName() +
      ' | DriveFileId=' +
      file.getId()
  );

  return {
    driveFileId: file.getId(),
    sourceFileName: file.getName(),
    registeredAt: new Date(),
    processId: wantedProcessId
  };
}

/**
 * Returns the newest UiPath-captured Drive File ID for this invoice/file.
 * Matching by invoice + source file avoids stale mappings when test invoices
 * reuse the same invoice reference.
 */
function getPendingDriveRecord_(
  processId,
  invoiceReference,
  sourceFileName
) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.PENDING_FILE_MAP_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) return null;

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(v => String(v || '').trim());

  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  const required = [
    'Invoice_Reference',
    'Drive_File_ID',
    'Source_File_Name',
    'Registered_At'
  ];

  if (required.some(name => idx[name] === undefined)) {
    throw new Error(
      'Pending_File_Map is missing required columns: ' +
      required.filter(name => idx[name] === undefined).join(', ')
    );
  }

  const wantedProcessId = stringValue_(processId);
  const wantedInvoice = stringValue_(invoiceReference);
  const wantedFile = stringValue_(sourceFileName).toLowerCase();

  let best = null;

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const driveFileId = stringValue_(row[idx.Drive_File_ID]);
    if (!driveFileId) continue;

    const mappedProcessId =
      idx.Process_ID !== undefined
        ? stringValue_(row[idx.Process_ID])
        : '';

    const invoice = stringValue_(row[idx.Invoice_Reference]);
    const sourceName = stringValue_(row[idx.Source_File_Name]);
    const registeredAt = row[idx.Registered_At];

    // New/current rows: Process_ID is authoritative.
    if (wantedProcessId) {
      if (!mappedProcessId || mappedProcessId !== wantedProcessId) {
        continue;
      }
    } else {
      // Legacy rows only: require BOTH invoice and exact source filename.
      // Never fall back to invoice-only, because repeated test runs can reuse
      // the same Invoice_Reference.
      if (
        invoice !== wantedInvoice ||
        !wantedFile ||
        sourceName.toLowerCase() !== wantedFile
      ) {
        continue;
      }
    }

    const record = {
      driveFileId: driveFileId,
      sourceFileName: sourceName,
      registeredAt: registeredAt,
      processId: mappedProcessId
    };

    if (
      !best ||
      compareRegisteredAt_(record.registeredAt, best.registeredAt) > 0
    ) {
      best = record;
    }
  }

  return best;
}

function compareRegisteredAt_(a, b) {
  const ta =
    a instanceof Date
      ? a.getTime()
      : new Date(String(a || '')).getTime();

  const tb =
    b instanceof Date
      ? b.getTime()
      : new Date(String(b || '')).getTime();

  const safeA = Number.isFinite(ta) ? ta : 0;
  const safeB = Number.isFinite(tb) ? tb : 0;

  return safeA - safeB;
}


/**
 * Returns a Drive file only when the ID is accessible AND the file currently
 * belongs to the expected folder. This is the stale-mapping guard.
 */
function getFileIfInsideFolder_(fileId, folderId) {
  if (!fileId) return null;

  try {
    const file = DriveApp.getFileById(fileId);
    const parents = file.getParents();

    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) {
        return file;
      }
    }
  } catch (err) {
    console.log(
      'Drive file lookup failed | FileId=' +
        fileId +
        ' | ' +
        err.message
    );
  }

  return null;
}

function getDriveFileFromRow_(
  row,
  col
) {
  const directId =
    col.Pending_Drive_File_ID !== undefined
      ? stringValue_(row[col.Pending_Drive_File_ID])
      : '';

  // A stored ID is valid only while that exact file is in Pending-Approval.
  // This prevents an old approved/rejected file from being reused.
  if (directId) {
    const directFile = getFileIfInsideFolder_(
      directId,
      CONFIG.PENDING_FOLDER_ID
    );

    if (directFile) {
      return directFile;
    }

    console.log(
      'STALE Pending_Drive_File_ID IGNORED | DriveFileId=' +
        directId
    );
  }

  const processId =
    col.Process_ID !== undefined
      ? stringValue_(row[col.Process_ID])
      : '';

  const invoiceReference = stringValue_(
    row[col.Invoice_Reference]
  );

  const sourceFileName = stringValue_(
    row[col.Source_File_Name]
  );

  const record = getPendingDriveRecord_(
    processId,
    invoiceReference,
    sourceFileName
  );

  if (record && record.driveFileId) {
    const mappedFile = getFileIfInsideFolder_(
      record.driveFileId,
      CONFIG.PENDING_FOLDER_ID
    );

    if (mappedFile) {
      return mappedFile;
    }

    console.log(
      'STALE Pending_File_Map record IGNORED | Process_ID=' +
        processId +
        ' | DriveFileId=' +
        record.driveFileId
    );
  }

  // Final fallback: locate the actual current file in Pending-Approval.
  const fileName = getInvoiceFileName_(row, col);

  if (!fileName) return null;

  return findNewestFileByName_(
    CONFIG.PENDING_FOLDER_ID,
    fileName
  );
}

/**
 * Returns Google Drive URL for the pending invoice PDF.
 */
function getPendingInvoiceUrl_(row, col) {
  const file = getDriveFileFromRow_(row, col);
  return file ? file.getUrl() : '';
}

/**
 * Gets invoice filename from File_Path or Source_File_Name.
 */
function getInvoiceFileName_(row, col) {
  const filePath = stringValue_(row[col.File_Path]);

  if (filePath) {
    const parts = filePath.split('/');
    const last = parts[parts.length - 1];

    if (last) return last;
  }

  return stringValue_(row[col.Source_File_Name]);
}

/**
 * Moves a file from Pending-Approval to the final folder.
 */
function movePendingInvoice_(
  row,
  col,
  approved
) {
  const file = getDriveFileFromRow_(row, col);

  if (!file) {
    return {
      success: false,
      fileName: getInvoiceFileName_(row, col),
      message:
        'Pending file could not be resolved by Drive File ID or legacy filename'
    };
  }

  const fileId = file.getId();
  const fileName = file.getName();

  const targetFolderId = approved
    ? CONFIG.PROCESSED_FOLDER_ID
    : CONFIG.REJECTED_FOLDER_ID;

  let targetFolder;

  try {
    targetFolder = DriveApp.getFolderById(targetFolderId);
  } catch (err) {
    return {
      success: false,
      fileId: fileId,
      fileName: fileName,
      message:
        'Cannot access target folder ID ' +
        targetFolderId +
        ': ' +
        err.message
    };
  }

  let targetFolderName = '';

  try {
    targetFolderName = targetFolder.getName();
  } catch (err) {
    return {
      success: false,
      fileId: fileId,
      fileName: fileName,
      message:
        'Target folder exists but cannot be read: ' +
        targetFolderId +
        ' | ' +
        err.message
    };
  }

  try {
    file.moveTo(targetFolder);
  } catch (err) {
    return {
      success: false,
      fileId: fileId,
      fileName: fileName,
      message:
        'Drive move failed. File ID=' +
        fileId +
        ', Target=' +
        targetFolderName +
        ' (' +
        targetFolderId +
        '): ' +
        err.message
    };
  }

  // Verify that Google Drive actually changed the file's parent.
  Utilities.sleep(500);

  let verified = false;

  try {
    const refreshed = DriveApp.getFileById(fileId);
    const parents = refreshed.getParents();

    while (parents.hasNext()) {
      if (parents.next().getId() === targetFolderId) {
        verified = true;
        break;
      }
    }
  } catch (err) {
    return {
      success: false,
      fileId: fileId,
      fileName: fileName,
      message:
        'Move command ran, but verification failed for File ID ' +
        fileId +
        ': ' +
        err.message
    };
  }

  if (!verified) {
    return {
      success: false,
      fileId: fileId,
      fileName: fileName,
      message:
        'Move command completed but the file is not inside target folder ' +
        targetFolderName +
        ' (' +
        targetFolderId +
        ')'
    };
  }

  return {
    success: true,
    fileId: fileId,
    fileName: fileName,
    message:
      'Moved to ' +
      targetFolderName +
      ' using Drive File ID ' +
      fileId
  };
}

/**
 * Manual diagnostic helper.
 * Run this in Apps Script to confirm the script account can access
 * Pending-Approval, Processed-Invoices, and Rejected-Invoices.
 */
function testDriveRoutingAccess() {
  const folders = [
    ['Pending-Approval', CONFIG.PENDING_FOLDER_ID],
    ['Processed-Invoices', CONFIG.PROCESSED_FOLDER_ID],
    ['Rejected-Invoices', CONFIG.REJECTED_FOLDER_ID]
  ];

  folders.forEach(item => {
    const label = item[0];
    const id = item[1];

    try {
      const folder = DriveApp.getFolderById(id);
      Logger.log(
        label +
          ' | ID=' +
          id +
          ' | Actual name=' +
          folder.getName() +
          ' | ACCESS=OK'
      );
    } catch (err) {
      Logger.log(
        label +
          ' | ID=' +
          id +
          ' | ACCESS=FAILED | ' +
          err.message
      );
    }
  });
}

/**
 * Finds the newest file by exact filename first.
 * If the sheet contains a legacy name without ".pdf", it also tries a
 * base-name match (for example "test" -> "test.pdf" / "test (1).pdf").
 */
function findNewestFileByName_(
  folderId,
  fileName
) {
  const folder = DriveApp.getFolderById(folderId);

  // 1) Exact filename
  const exactFiles = folder.getFilesByName(fileName);
  let newest = null;

  while (exactFiles.hasNext()) {
    const file = exactFiles.next();
    if (
      !newest ||
      file.getLastUpdated().getTime() >
        newest.getLastUpdated().getTime()
    ) {
      newest = file;
    }
  }

  if (newest) return newest;

  // 2) Legacy/fallback base-name search
  const requested = String(fileName || '').trim();
  const requestedBase = requested.replace(/\.pdf$/i, '').trim();

  if (!requestedBase) return null;

  const allFiles = folder.getFiles();
  while (allFiles.hasNext()) {
    const file = allFiles.next();
    const actualName = file.getName();
    const actualBase = actualName.replace(/\.pdf$/i, '').trim();

    const isSameBase =
      actualBase.toLowerCase() === requestedBase.toLowerCase();

    const isRenamedDuplicate =
      actualBase.toLowerCase().startsWith(
        requestedBase.toLowerCase() + ' ('
      );

    if (
      (isSameBase || isRenamedDuplicate) &&
      (
        !newest ||
        file.getLastUpdated().getTime() >
          newest.getLastUpdated().getTime()
      )
    ) {
      newest = file;
    }
  }

  return newest;
}

function htmlRow_(label, value) {
  return (
    '<tr>' +
    '<td style="padding:8px;border:1px solid #ddd;font-weight:bold;width:35%">' +
    htmlEscape_(label) +
    '</td>' +
    '<td style="padding:8px;border:1px solid #ddd">' +
    htmlEscape_(stringValue_(value)) +
    '</td>' +
    '</tr>'
  );
}

function renderResultPage_(
  title,
  message,
  success
) {
  const color = success
    ? '#188038'
    : '#d93025';

  return HtmlService
    .createHtmlOutput(
      '<!doctype html>' +
      '<html>' +
      '<head>' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '</head>' +
      '<body style="font-family:Arial,sans-serif;background:#f6f8fa;padding:40px">' +
      '<div style="max-width:620px;margin:auto;background:white;padding:32px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.08)">' +
      '<h2 style="color:' +
      color +
      '">' +
      htmlEscape_(title) +
      '</h2>' +
      '<p>' +
      htmlEscape_(message) +
      '</p>' +
      '<p style="color:#666">You can close this page.</p>' +
      '</div>' +
      '</body>' +
      '</html>'
    )
    .setTitle(title);
}

function stringValue_(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}

function htmlEscape_(value) {
  return String(
    value === null || value === undefined
      ? ''
      : value
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
