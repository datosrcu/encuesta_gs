const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(compression());

// Configuración de conexión MySQL (VPS)
const dbConfig = {
  host: process.env.DB_HOST || 'bases-de-datosmysql-encuestas-r7v7gg',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'mysql',
  password: process.env.DB_PASSWORD || 'unnhdwnhq1w7tfvu',
  database: process.env.DB_NAME || 'mysql',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;
let useMock = false;

// Mock data structures
let mockEncuestas = [
  {
    id: 1,
    barrio: "Banda Norte",
    encuestador: "Juan Pérez",
    datos: {
      "Fecha y Hora": "10/6/2026 12:00:00",
      "Barrio Seleccionado": "Banda Norte",
      "Ubicación": "-33.1150, -64.3450",
      "Duración (seg)": 120,
      "1. Nombre y apellido del encuestador": "Juan Pérez",
      "person": "3",
      "q2": "3",
      "q3": "1"
    },
    created_at: new Date().toISOString()
  },
  {
    id: 2,
    barrio: "Alberdi",
    encuestador: "María Gómez",
    datos: {
      "Fecha y Hora": "10/6/2026 12:15:00",
      "Barrio Seleccionado": "Alberdi",
      "Ubicación": "-33.1300, -64.3350",
      "Duración (seg)": 150,
      "1. Nombre y apellido del encuestador": "María Gómez",
      "person": "4",
      "q2": "4",
      "q3": "2"
    },
    created_at: new Date().toISOString()
  },
  {
    id: 3,
    barrio: "Centro",
    encuestador: "Carlos López",
    datos: {
      "Fecha y Hora": "10/6/2026 12:30:00",
      "Barrio Seleccionado": "Centro",
      "Ubicación": "-33.1236, -64.3493",
      "Duración (seg)": 180,
      "1. Nombre y apellido del encuestador": "Carlos López",
      "person": "2",
      "q2": "2",
      "q3": "0"
    },
    created_at: new Date().toISOString()
  }
];

let mockAlertas = [
  {
    id: 1,
    tipo: "Riesgo de vida / urgencia médica",
    urgencia: "Alta",
    nota: "Vecino con fiebre alta y sin movilidad",
    encuestador: "Juan Pérez",
    barrio: "Banda Norte",
    ubicacion: "-33.1150, -64.3450",
    encuestado: {
      nombre: "Carlos",
      apellido: "Rodríguez",
      dni: "12345678",
      direccion: "Calle Falsa 123",
      telefono: "3584112233"
    },
    estado: "nueva",
    created_at: new Date().toISOString()
  }
];

async function initDb() {
  const maxRetries = 2; // Reducido para desarrollo local rápido
  let delay = 1000;

  for (let i = 1; i <= maxRetries; i++) {
    try {
      console.log(`Intentando conectar a MySQL (Intento ${i}/${maxRetries})...`);
      pool = mysql.createPool(dbConfig);
      
      // Validar conexión
      const connection = await pool.getConnection();
      console.log('Conexión exitosa a MySQL.');
      connection.release();

      // Crear tablas si no existen
      await createTables();
      return;
    } catch (err) {
      console.error(`Error al conectar a MySQL en el intento ${i}:`, err.message);
      if (i === maxRetries) {
        console.warn('No se pudo conectar a la base de datos MySQL. Se usará el modo MOCK con datos en memoria.');
        useMock = true;
        pool = null;
        return;
      }
      console.log(`Esperando ${delay / 1000} segundos antes del siguiente intento...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

async function createTables() {
  if (useMock) return;
  try {
    const conn = await pool.getConnection();
    
    // Tabla de Encuestas
    await conn.query(`
      CREATE TABLE IF NOT EXISTS encuestas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        barrio VARCHAR(255),
        encuestador VARCHAR(255),
        datos JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Tabla "encuestas" lista.');

    // Tabla de Alertas
    await conn.query(`
      CREATE TABLE IF NOT EXISTS alertas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(255),
        urgencia VARCHAR(50),
        nota TEXT,
        encuestador VARCHAR(255),
        barrio VARCHAR(255),
        ubicacion VARCHAR(255),
        encuestado JSON,
        estado VARCHAR(50) DEFAULT 'nueva',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('Tabla "alertas" lista.');

    conn.release();
  } catch (err) {
    console.error('Error al inicializar las tablas en la base de datos:', err);
    process.exit(1);
  }
}

// --- Endpoints de API ---

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: useMock ? 'mocked' : (pool ? 'connected' : 'disconnected') });
});

// Obtener todas las encuestas
app.get('/api/encuestas', async (req, res) => {
  if (useMock) {
    return res.json(mockEncuestas);
  }
  try {
    const [rows] = await pool.query('SELECT id, barrio, encuestador, datos, created_at FROM encuestas ORDER BY id DESC');
    const encuestas = rows.map(r => {
      let datosParsed = r.datos;
      if (typeof datosParsed === 'string') {
        try { datosParsed = JSON.parse(datosParsed); } catch (e) { datosParsed = {}; }
      }
      return {
        id: r.id,
        barrio: r.barrio,
        encuestador: r.encuestador,
        datos: datosParsed,
        created_at: r.created_at
      };
    });
    res.json(encuestas);
  } catch (err) {
    console.error('Error al obtener encuestas:', err);
    res.status(500).json({ error: 'Error interno del servidor al obtener las encuestas' });
  }
});

// Obtener todas las alertas
app.get('/api/alertas', async (req, res) => {
  if (useMock) {
    return res.json(mockAlertas);
  }
  try {
    const [rows] = await pool.query('SELECT id, tipo, urgencia, nota, encuestador, barrio, ubicacion, encuestado, estado, created_at FROM alertas ORDER BY id DESC');
    const alertas = rows.map(r => {
      let encuestadoParsed = r.encuestado;
      if (typeof encuestadoParsed === 'string') {
        try { encuestadoParsed = JSON.parse(encuestadoParsed); } catch (e) { encuestadoParsed = {}; }
      }
      return {
        id: r.id,
        tipo: r.tipo,
        urgencia: r.urgencia,
        nota: r.nota,
        encuestador: r.encuestador,
        barrio: r.barrio,
        ubicacion: r.ubicacion,
        encuestado: encuestadoParsed,
        estado: r.estado,
        created_at: r.created_at
      };
    });
    res.json(alertas);
  } catch (err) {
    console.error('Error al obtener alertas:', err);
    res.status(500).json({ error: 'Error interno del servidor al obtener las alertas' });
  }
});

// --- Integración con Google Sheets Webhook ---
function mapRecordToSheetRow(r) {
  const d = (typeof r.datos === 'string') ? JSON.parse(r.datos) : (r.datos || {});

  const getVal = (keyWord) => {
    if (d.hasOwnProperty(keyWord)) return d[keyWord];
    const matchKey = Object.keys(d).find(k => k.toLowerCase().includes(keyWord.toLowerCase()));
    return matchKey ? d[matchKey] : '';
  };

  let lat = '', lng = '', coor = getVal('ubicacion') || getVal('ubicación') || '';
  if (coor && typeof coor === 'string') {
    const parts = coor.split(',');
    if (parts.length === 2) {
      lat = parts[0].trim();
      lng = parts[1].trim();
    }
  }

  const barrio = r.barrio || getVal('Barrio Seleccionado') || getVal('barrio') || '';
  const metaId = 'GS-B-' + String(r.id).padStart(5, '0');
  const fecha = r.created_at ? new Date(r.created_at).toLocaleString('es-AR') : (getVal('Fecha y Hora') || '');
  const duracion = getVal('Duración (seg)') || getVal('duracion_seg') || '';
  const encuestador = r.encuestador || getVal('1. Nombre y apellido del encuestador') || getVal('q1') || '';
  const direccion = getVal('6. Dirección y altura') || getVal('encuestado_direccion') || '';
  const nombre = getVal('2. Nombre') || getVal('encuestado_nombre') || '';
  const apellido = getVal('3. Apellido') || getVal('encuestado_apellido') || '';
  const dni = getVal('4. DNI') || getVal('encuestado_dni') || '';
  const telefono = getVal('5. Número de teléfono') || getVal('encuestado_telefono') || '';
  const email = getVal('PII_EMAIL') || '';

  const vivPersonas = getVal('8. ¿Cuántas personas') || getVal('q2') || '';
  const vivMenores = getVal('9. De las personas') || getVal('q3') || '';
  const escolaridadMenor = getVal('9.b. Los menores') || getVal('q5') || '';
  const dniCompleto = getVal('10. ¿Cuentan con DNI') || getVal('q6') || '';
  const dniFaltanteCant = getVal('10.a. Especifique') || getVal('q7') || '';
  const analfabetismo = getVal('11. ¿Hay personas mayores') || getVal('q8') || '';
  const analfabetismoCant = getVal('11.a. Indique cuántas') || getVal('q9') || '';

  const progBeneficiario = getVal('12. ¿Algún integrante') || getVal('q24_bool') || '';
  const progNombre = getVal('12.a. ¿Qué programa?') || getVal('q24') || '';
  const alimComedor = getVal('13. ¿Asiste algún integrante') || getVal('q25') || '';
  const alimComedorNombre = getVal('13.a. Indique el nombre del merendero') || getVal('q26') || '';

  const conectDispositivo = getVal('15. ¿Actualmente') || getVal('q16') || '';
  const conectWifi = getVal('16. ¿Su hogar') || getVal('q17') || '';

  const discReside = getVal('17. ¿Reside alguna') || getVal('q27') || '';
  const discTipo = getVal('17.a. ¿Qué tipo') || getVal('q29') || '';
  const discCud = getVal('17.b. ¿Tiene Certificado') || getVal('q33') || '';
  const discPrograma = getVal('17.c. ¿Participa de alguna') || getVal('q30') || '';
  const discProgramaNombre = getVal('17.d. Indique el nombre de la actividad') || getVal('q31') || '';
  const discNoParticipaRazon = getVal('17.e. Por favor explique') || getVal('q32') || '';

  const amReside = getVal('18. ¿En el hogar') || getVal('q36') || '';
  const amJubilacion = getVal('18.a. ¿Reciben alguna') || getVal('q37') || '';
  const amCentroJubilados = getVal('18.b. ¿Asisten a algún') || getVal('q38') || '';
  const amCentroNombre = getVal('18.c. Indique el nombre del Centro') || getVal('q39') || '';

  const ninEmbarazo = getVal('19. ¿Hay alguna persona') || getVal('q46') || '';
  const ninVacunas = getVal('20. Los niños residentes') || getVal('q42') || '';

  const salCaps = getVal('21. ¿Asisten a algún') || getVal('q43') || '';
  const salCapsNombre = getVal('21.a. Indique a qué') || getVal('q44') || '';
  const salEnfCronica = getVal('22. ¿Alguien posee') || getVal('q45') || '';
  const salConsumos = getVal('23. ¿Hay alguna persona con consumos') || getVal('q47') || '';

  const alimComidasCant = getVal('14. ¿Qué comidas') || getVal('meals') || '';

  const mascTiene = getVal('24. ¿Tienen mascotas') || getVal('q48') || '';
  const mascVacuna = getVal('24.a. ¿Tienen colocada') || getVal('q49') || '';
  const mascCastracion = getVal('24.b. ¿Están castrados') || getVal('q50') || '';

  const servAlumbrado = getVal('7.1.') || getVal('q52_1') || '';
  const servBasura = getVal('7.2.') || getVal('q52_2') || '';
  const servYuyos = getVal('7.3.') || getVal('q52_3') || '';
  const servCalle = getVal('7.4.') || getVal('q52_4') || '';
  const servRiego = getVal('7.5.') || getVal('q52_5') || '';

  return [
    barrio, metaId, fecha, duracion, encuestador, direccion, lat, lng, coor,
    nombre, apellido, dni, telefono, email,
    vivPersonas, vivMenores, escolaridadMenor, dniCompleto, dniFaltanteCant, analfabetismo, analfabetismoCant,
    progBeneficiario, progNombre, alimComedor, alimComedorNombre,
    conectDispositivo, conectWifi,
    discReside, discTipo, discCud, discPrograma, discProgramaNombre, discNoParticipaRazon,
    amReside, amJubilacion, amCentroJubilados, amCentroNombre,
    ninEmbarazo, ninVacunas,
    salCaps, salCapsNombre, salEnfCronica, salConsumos,
    alimComidasCant,
    mascTiene, mascVacuna, mascCastracion,
    servAlumbrado, servBasura, servYuyos, servCalle, servRiego
  ];
}

async function sendToGoogleSheets(rows) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[Google Sheets] Webhook URL no configurada en .env. Omitiendo sync directo.');
    return false;
  }
  try {
    const payload = Array.isArray(rows[0]) ? rows : [rows];
    console.log(`[Google Sheets] Enviando ${payload.length} registro(s) a Google Sheets...`);
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      console.log('[Google Sheets] Sync exitoso.');
      return true;
    } else {
      console.error('[Google Sheets] Error en respuesta de Webhook:', res.status);
      return false;
    }
  } catch (err) {
    console.error('[Google Sheets] Excepción al conectar con Webhook:', err.message);
    return false;
  }
}

// Guardar Encuesta
app.post('/api/encuestas', async (req, res) => {
  const { barrio, encuestador, datos } = req.body;

  if (!datos) {
    return res.status(400).json({ error: 'Faltan los datos de la encuesta' });
  }

  if (useMock) {
    const newSurvey = {
      id: mockEncuestas.length + 1,
      barrio: barrio || null,
      encuestador: encuestador || null,
      datos,
      created_at: new Date().toISOString()
    };
    mockEncuestas.unshift(newSurvey);
    console.log(`[Mock] Encuesta guardada con ID: ${newSurvey.id}`);
    sendToGoogleSheets(mapRecordToSheetRow(newSurvey)).catch(() => {});
    return res.status(201).json({ success: true, id: newSurvey.id });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO encuestas (barrio, encuestador, datos) VALUES (?, ?, ?)',
      [barrio || null, encuestador || null, JSON.stringify(datos)]
    );
    
    console.log(`Encuesta guardada con ID: ${result.insertId}`);
    
    const newSurveyRecord = {
      id: result.insertId,
      barrio: barrio || null,
      encuestador: encuestador || null,
      datos,
      created_at: new Date().toISOString()
    };
    
    // Impacto automático en Google Sheets en segundo plano
    sendToGoogleSheets(mapRecordToSheetRow(newSurveyRecord)).catch(() => {});

    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Error al guardar encuesta:', err);
    res.status(500).json({ error: 'Error interno del servidor al guardar la encuesta' });
  }
});

// Endpoint para sincronización masiva a Google Sheets
app.post('/api/sync-sheets', async (req, res) => {
  try {
    let records = [];
    if (useMock) {
      records = mockEncuestas;
    } else {
      const [rows] = await pool.query('SELECT id, barrio, encuestador, datos, created_at FROM encuestas ORDER BY id ASC');
      records = rows;
    }
    
    if (records.length === 0) {
      return res.json({ success: true, message: 'No hay encuestas para sincronizar.', synced: 0 });
    }

    const mappedRows = records.map(r => mapRecordToSheetRow(r));
    const ok = await sendToGoogleSheets(mappedRows);
    
    if (ok) {
      res.json({ success: true, message: `Sincronizados ${mappedRows.length} registros exitosamente con Google Sheets.`, synced: mappedRows.length });
    } else {
      res.status(500).json({ error: 'No se pudo sincronizar con Google Sheets. Verificá la variable GOOGLE_SHEETS_WEBHOOK_URL en tu .env' });
    }
  } catch (err) {
    console.error('Error en sync-sheets:', err);
    res.status(500).json({ error: err.message });
  }
});


// Guardar Alerta
app.post('/api/alertas', async (req, res) => {
  const { tipo, urgencia, nota, encuestador, barrio, ubicacion, encuestado, estado } = req.body;

  if (!tipo) {
    return res.status(400).json({ error: 'Falta el tipo de alerta' });
  }

  if (useMock) {
    const newAlert = {
      id: mockAlertas.length + 1,
      tipo,
      urgencia: urgencia || 'Alta',
      nota: nota || null,
      encuestador: encuestador || null,
      barrio: barrio || null,
      ubicacion: ubicacion || null,
      encuestado: encuestado || {},
      estado: estado || 'nueva',
      created_at: new Date().toISOString()
    };
    mockAlertas.unshift(newAlert);
    console.log(`[Mock] Alerta guardada con ID: ${newAlert.id}`);
    return res.status(201).json({ success: true, id: newAlert.id });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO alertas (tipo, urgencia, nota, encuestador, barrio, ubicacion, encuestado, estado) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tipo,
        urgencia || 'Alta',
        nota || null,
        encuestador || null,
        barrio || null,
        ubicacion || null,
        encuestado ? JSON.stringify(encuestado) : null,
        estado || 'nueva'
      ]
    );

    console.log(`Alerta guardada con ID: ${result.insertId}`);
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Error al guardar alerta:', err);
    res.status(500).json({ error: 'Error interno del servidor al guardar la alerta' });
  }
});

// --- Servir Estáticos del Frontend con Cabeceras Especiales PWA ---

// Cabeceras anti-caché para el Service Worker
app.get('/sw.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Cabeceras anti-caché para el Manifiesto
app.get('/manifest.json', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

// Servir archivos estáticos por defecto (imágenes, fuentes, etc.)
app.use(express.static(__dirname, {
  maxAge: '1y',
  setHeaders: (res, path) => {
    // Si es el index.html o dashboard.html, no cachear de forma agresiva
    if (path.endsWith('index.html') || path.endsWith('dashboard.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=31536000, no-transform');
    }
  }
}));

// Fallback para cualquier otra ruta (Redirigir a index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicializar DB y Arrancar Servidor
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor unificado de Encuesta corriendo en el puerto ${PORT}`);
  });
});
