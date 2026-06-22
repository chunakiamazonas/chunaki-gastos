const { google } = require('googleapis');

const SPREADSHEET_ID = '1TZRX2KjoH7igdMEuW1Yb8LxESILrhVhfUdiwXOf4K9w';
const DRIVE_FOLDER_ID = '1f2YRsYSQHBx6wddHcaxw5m3_hLstAnwE';
const MAX_ACTIVITIES = 6;

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
}

async function getOrCreateMonthFolder(drive, date) {
  const month = date.slice(0, 7);
  const res = await drive.files.list({
    q: `name='${month}' and mimeType='application/vnd.google-apps.folder' and '${DRIVE_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;
  const folder = await drive.files.create({
    supportsAllDrives: true,
    requestBody: { name: month, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_FOLDER_ID] },
    fields: 'id',
  });
  return folder.data.id;
}

// Ensures a sheet tab with the given title exists. Returns its sheetId.
async function ensureSheet(sheets, title, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existing = meta.data.sheets.find(s => s.properties.title === title);
  if (existing) return existing.properties.sheetId;

  // Create the tab
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests: [{ addSheet: { properties: { title } } }] },
  });
  const newSheetId = res.data.replies[0].addSheet.properties.sheetId;

  // Write headers
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });

  return newSheetId;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth });

    // Ensure both tabs exist with correct headers
    await ensureSheet(sheets, 'Facturas', [
      'Fecha', 'Guía', 'Grupo', 'Actividad',
      'Proveedor', 'Monto', 'Moneda', 'Descripción', 'Fecha Factura',
      'Link Foto', 'Hora Registro',
    ]);

    const resumenHeaders = [
      'Fecha', 'Guía', 'Grupo',
      ...Array.from({ length: MAX_ACTIVITIES }, (_, i) => `Actividad ${i + 1}`),
      'Galones Estimados', 'Galones Reales', 'Discrepancia', 'Hora Registro',
    ];
    await ensureSheet(sheets, 'Resumen', resumenHeaders);

    const {
      guide, groupName, date, activities,
      fuelEstimated, fuelActual, fuelConfirmed, invoices,
    } = req.body;

    const monthFolderId = await getOrCreateMonthFolder(drive, date);
    const timestamp = new Date().toLocaleTimeString('es-CO');
    const actualGallons = fuelConfirmed ? fuelEstimated : (fuelActual || fuelEstimated);
    const discrepancy = fuelConfirmed ? 'No' : 'Sí';

    // ── Upload photos and build Facturas rows ──────────────────────────────
    const facturasRows = [];

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      const invoice = (invoices && invoices[i]) ? invoices[i] : {};
      let photoLink = '';

      if (invoice.base64 && invoice.mimeType) {
        try {
          const { PassThrough } = require('stream');
          const buffer = Buffer.from(invoice.base64, 'base64');
          const ext = invoice.mimeType.split('/')[1] || 'jpg';
          const fileName = `${date}_${guide}_act${i + 1}.${ext}`;
          const stream = new PassThrough();
          stream.end(buffer);

          const uploaded = await drive.files.create({
            supportsAllDrives: true,
            requestBody: { name: fileName, parents: [monthFolderId] },
            media: { mimeType: invoice.mimeType, body: stream },
            fields: 'id, webViewLink',
          });
          await drive.permissions.create({
            fileId: uploaded.data.id,
            supportsAllDrives: true,
            requestBody: { role: 'reader', type: 'anyone' },
          });
          photoLink = uploaded.data.webViewLink || '';
        } catch (photoErr) {
          console.error('Photo upload error:', photoErr.message);
          photoLink = 'ERROR: ' + photoErr.message;
        }
      }

      facturasRows.push([
        date || '',
        guide || '',
        groupName || '',
        activity.name || '',
        (invoice.scanned && invoice.scanned.proveedor) || '',
        (invoice.scanned && invoice.scanned.monto_total) || '',
        (invoice.scanned && invoice.scanned.moneda) || '',
        (invoice.scanned && invoice.scanned.descripcion) || '',
        (invoice.scanned && invoice.scanned.fecha) || '',
        photoLink,
        timestamp,
      ]);
    }

    // ── Build Resumen row (one row for the whole submission) ───────────────
    const activityNames = activities.map(a => a.name || '');
    // Pad to MAX_ACTIVITIES columns
    while (activityNames.length < MAX_ACTIVITIES) activityNames.push('');

    const resumenRow = [
      date || '',
      guide || '',
      groupName || '',
      ...activityNames,
      fuelEstimated || 0,
      actualGallons || 0,
      discrepancy,
      timestamp,
    ];

    // ── Write to both tabs ─────────────────────────────────────────────────
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Facturas!A1',
      valueInputOption: 'RAW',
      requestBody: { values: facturasRows },
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Resumen!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [resumenRow] },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Submit error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
