const { google } = require('googleapis');

const SPREADSHEET_ID = '1TZRX2KjoH7igdMEuW1Yb8LxESILrhVhfUdiwXOf4K9w';
const YOUR_EMAIL = 'juanestebanenciso94@gmail.com';
const DRIVE_FOLDER_NAME = 'Chunaki Facturas';

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

async function getOrCreateFolder(drive) {
  const res = await drive.files.list({
    q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }
  const folder = await drive.files.create({
    requestBody: {
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  // Share folder with your personal email
  await drive.permissions.create({
    fileId: folder.data.id,
    requestBody: { role: 'writer', type: 'user', emailAddress: YOUR_EMAIL },
  });
  return folder.data.id;
}

async function ensureHeaders(sheets) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1:N1',
    });
    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Fecha','Guía','Grupo','Actividad','Galones Estimados','Galones Reales','Discrepancia','Proveedor','Monto','Moneda','Descripción','Fecha Factura','Link Foto','Hora Registro']]
        }
      });
    }
  } catch(e) {}
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

    await ensureHeaders(sheets);
    const folderId = await getOrCreateFolder(drive);

    const { guide, groupName, date, activities, fuelEstimated, fuelActual, fuelConfirmed, invoices } = req.body;
    const rows = [];

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      const invoice = (invoices && invoices[i]) ? invoices[i] : {};
      let photoLink = '';

      if (invoice.base64 && invoice.mimeType) {
        try {
          const buffer = Buffer.from(invoice.base64, 'base64');
          const ext = invoice.mimeType.split('/')[1] || 'jpg';
          const fileName = `${date}_${guide}_act${i + 1}.${ext}`;

          // Use buffer directly as a readable stream
          const { PassThrough } = require('stream');
          const stream = new PassThrough();
          stream.end(buffer);

          const uploaded = await drive.files.create({
            requestBody: {
              name: fileName,
              parents: [folderId],
            },
            media: {
              mimeType: invoice.mimeType,
              body: stream,
            },
            fields: 'id, webViewLink',
          });

          // Make readable by anyone
          await drive.permissions.create({
            fileId: uploaded.data.id,
            requestBody: { role: 'reader', type: 'anyone' },
          });

          photoLink = uploaded.data.webViewLink || '';
          console.log('Photo uploaded:', photoLink);
        } catch(photoErr) {
          console.error('Photo upload error:', photoErr.message);
          photoLink = 'Error al subir foto';
        }
      }

      rows.push([
        date || '',
        guide || '',
        groupName || '',
        activity.name || '',
        fuelEstimated || 0,
        fuelConfirmed ? fuelEstimated : (fuelActual || ''),
        fuelConfirmed ? 'No' : 'Sí',
        (invoice.scanned && invoice.scanned.proveedor) || '',
        (invoice.scanned && invoice.scanned.monto_total) || '',
        (invoice.scanned && invoice.scanned.moneda) || '',
        (invoice.scanned && invoice.scanned.descripcion) || '',
        (invoice.scanned && invoice.scanned.fecha) || '',
        photoLink,
        new Date().toLocaleTimeString('es-CO'),
      ]);
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Submit error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};
