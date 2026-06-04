// Global state for survey records
let surveyRecords = [];
let alertRecords = [];
let charts = {};

// Colors aligned with the Obelisco design system
const chartColors = {
  primary: '#009de0',
  primaryTint: '#e6f5fc',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  muted: '#64748b',
  accent1: '#4f46e5',
  accent2: '#06b6d4',
  accent3: '#ec4899',
  accent4: '#8b5cf6',
  palette: ['#009de0', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#4f46e5']
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadData();

  document.getElementById('refresh-btn').addEventListener('click', loadData);
  document.getElementById('barrio-filter').addEventListener('change', renderDashboard);

  // Eventos para buscador de reportes
  const searchInput = document.getElementById('reportes-search');
  if (searchInput) {
    searchInput.addEventListener('input', renderReportesTable);
  }

  // Evento de exportación a CSV
  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportToCSV);
  }

  // Eventos de cierre de modal
  const closeBtn = document.getElementById('close-modal-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSurveyModal);
  }
  const modal = document.getElementById('survey-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeSurveyModal();
    });
  }
});

// Wizard style tabs navigation
function initNavigation() {
  const steps = document.querySelectorAll('.wizard-step');
  const sections = document.querySelectorAll('.dashboard-section');

  steps.forEach(step => {
    step.addEventListener('click', () => {
      const targetId = step.getAttribute('data-target');
      
      // Update active tab styling
      steps.forEach(s => s.classList.remove('active'));
      step.classList.add('active');

      // Update active section visibility
      sections.forEach(sec => sec.classList.remove('active'));
      const activeSection = document.getElementById(targetId);
      if (activeSection) {
        activeSection.classList.add('active');
      }
    });
  });
}

// Fetch all surveys and alerts from the ununified backend API
async function loadData() {
  const loader = document.getElementById('loader');
  const content = document.getElementById('dashboard-data');

  loader.classList.remove('hidden');
  content.classList.add('hidden');

  try {
    const [surveyResponse, alertResponse] = await Promise.all([
      fetch('/api/encuestas'),
      fetch('/api/alertas')
    ]);
    if (!surveyResponse.ok) throw new Error(`Error en API Encuestas: ${surveyResponse.status}`);
    if (!alertResponse.ok) throw new Error(`Error en API Alertas: ${alertResponse.status}`);
    
    surveyRecords = await surveyResponse.json();
    alertRecords = await alertResponse.json();
    console.log('Encuestas cargadas:', surveyRecords);
    console.log('Alertas cargadas:', alertRecords);

    populateBarrioFilter();
    renderDashboard();

    loader.classList.add('hidden');
    content.classList.remove('hidden');
  } catch (error) {
    console.error('Error al cargar datos del relevamiento:', error);
    loader.innerHTML = `
      <div class="glass" style="padding: 2rem; border-color: var(--danger); text-align: center;">
        <span class="material-symbols-outlined" style="font-size: 3rem; color: var(--danger);">error</span>
        <h3 style="margin-top: 1rem; color: var(--text);">Error al conectar</h3>
        <p style="margin-top: 0.5rem; color: var(--text-muted);">${error.message}</p>
        <button onclick="loadData()" class="btn primary-btn" style="margin-top: 1.5rem;">Reintentar</button>
      </div>
    `;
  }
}

// Extract unique neighborhoods from loaded surveys and populate selector
function populateBarrioFilter() {
  const select = document.getElementById('barrio-filter');
  
  // Keep the "Todos" option
  select.innerHTML = '<option value="todos">Todos los Barrios</option>';

  const barrios = new Set();
  surveyRecords.forEach(r => {
    if (r.barrio) barrios.add(r.barrio);
    // Fallback: search inside datos object
    else if (r.datos && r.datos['Barrio Seleccionado']) barrios.add(r.datos['Barrio Seleccionado']);
  });

  Array.from(barrios).sort().forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  });
}

// Destroy existing chart helper to avoid overlaps when rendering again
function safeCreateChart(canvasId, config) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }
  const ctx = document.getElementById(canvasId);
  if (ctx) {
    charts[canvasId] = new Chart(ctx, config);
  }
}

// Helper to count frequencies of answers in a dataset
function countFrequencies(items, transformFn = x => x) {
  const counts = {};
  items.forEach(item => {
    const val = transformFn(item);
    if (val !== undefined && val !== null && val !== '') {
      counts[val] = (counts[val] || 0) + 1;
    }
  });
  return counts;
}

// Main processing logic
function renderDashboard() {
  const selectedBarrio = document.getElementById('barrio-filter').value;
  
  // Filter records based on selected neighborhood
  const records = surveyRecords.filter(r => {
    if (selectedBarrio === 'todos') return true;
    const b = r.barrio || (r.datos && r.datos['Barrio Seleccionado']);
    return b === selectedBarrio;
  });

  const totalHogares = records.length;
  
  // Safe helper to extract properties from flattened questions
  const getVal = (r, keyWord) => {
    if (!r.datos) return undefined;
    if (r.datos.hasOwnProperty(keyWord)) return r.datos[keyWord];
    // Find key containing the keyword (for fuzzy column names)
    const matchKey = Object.keys(r.datos).find(k => k.toLowerCase().includes(keyWord.toLowerCase()));
    return matchKey ? r.datos[matchKey] : undefined;
  };

  // ----------------------------------------
  // SECTION 1: HOGAR
  // ----------------------------------------
  let totalPersonas = 0;
  let totalMenores = 0;
  let menoresAsistenciaSi = 0;
  let menoresAsistenciaTotal = 0;

  records.forEach(r => {
    // Habitantes (q2)
    const q2Val = getVal(r, 'person') || getVal(r, 'q2') || '0';
    const numPers = parseInt(q2Val) || (q2Val.includes('10') ? 10 : 0);
    totalPersonas += numPers;

    // Menores (q3)
    const q3Val = getVal(r, 'menor') || getVal(r, 'q3') || '0';
    const numMen = parseInt(q3Val) || (q3Val.includes('5') ? 5 : 0);
    totalMenores += numMen;

    // Asistencia escolar (q5)
    const q5Val = getVal(r, 'escuela') || getVal(r, 'q5');
    if (numMen > 0 && q5Val) {
      menoresAsistenciaTotal++;
      if (q5Val.toLowerCase().includes('sí') || q5Val.toLowerCase() === 'si') {
        menoresAsistenciaSi++;
      }
    }
  });

  const promedioPersonas = totalHogares > 0 ? (totalPersonas / totalHogares).toFixed(1) : 0;
  const pctEscuela = menoresAsistenciaTotal > 0 ? Math.round((menoresAsistenciaSi / menoresAsistenciaTotal) * 100) : 0;

  document.getElementById('kpi-hogar-total').textContent = totalHogares;
  document.getElementById('kpi-hogar-personas').textContent = totalPersonas;
  document.getElementById('kpi-hogar-promedio').textContent = promedioPersonas;
  document.getElementById('kpi-hogar-escuela').textContent = `${pctEscuela}%`;

  // Chart: Etaria distribution
  const totalAdults = Math.max(0, totalPersonas - totalMenores);
  safeCreateChart('chart-hogar-etaria', {
    type: 'doughnut',
    data: {
      labels: ['Adultos (>=18)', 'Menores (<18)'],
      datasets: [{
        data: [totalAdults, totalMenores],
        backgroundColor: [chartColors.primary, chartColors.warning],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // ----------------------------------------
  // SECTION 2: IDENTIDAD
  // ----------------------------------------
  let hogaresDniCompleto = 0;
  let totalSinDni = 0;

  records.forEach(r => {
    const q6Val = getVal(r, 'q6') || getVal(r, 'dni todos');
    if (q6Val && (q6Val.toLowerCase().includes('sí') || q6Val.toLowerCase() === 'si')) {
      hogaresDniCompleto++;
    }
    const q7Val = getVal(r, 'q7') || getVal(r, 'no cuentan');
    if (q7Val) {
      const numSin = parseInt(q7Val) || 0;
      totalSinDni += numSin;
    }
  });

  const pctDni = totalHogares > 0 ? Math.round((hogaresDniCompleto / totalHogares) * 100) : 0;
  document.getElementById('kpi-identidad-completa').textContent = `${pctDni}%`;
  document.getElementById('kpi-identidad-falta').textContent = totalSinDni;

  // Chart DNI por Hogar
  const hogaresDniIncompleto = totalHogares - hogaresDniCompleto;
  safeCreateChart('chart-identidad-dni', {
    type: 'pie',
    data: {
      labels: ['Documentación Completa', 'Falta DNI a algún miembro'],
      datasets: [{
        data: [hogaresDniCompleto, hogaresDniIncompleto],
        backgroundColor: [chartColors.success, chartColors.danger],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // ----------------------------------------
  // SECTION 3: EDUCACIÓN
  // ----------------------------------------
  let hogaresAnalfabetos = 0;
  records.forEach(r => {
    const q8Val = getVal(r, 'q8') || getVal(r, 'saber leer');
    if (q8Val && (q8Val.toLowerCase().includes('sí') || q8Val.toLowerCase() === 'si')) {
      hogaresAnalfabetos++;
    }
  });
  const pctAnalf = totalHogares > 0 ? Math.round((hogaresAnalfabetos / totalHogares) * 100) : 0;
  
  document.getElementById('kpi-educacion-escuela').textContent = `${pctEscuela}%`;
  document.getElementById('kpi-educacion-leer').textContent = `${pctAnalf}%`;

  // Chart Asistencia escolar
  const menoresNoEscuela = menoresAsistenciaTotal - menoresAsistenciaSi;
  safeCreateChart('chart-educacion-asistencia', {
    type: 'doughnut',
    data: {
      labels: ['Asisten a la escuela', 'No asisten / Deserción'],
      datasets: [{
        data: [menoresAsistenciaSi, menoresNoEscuela],
        backgroundColor: [chartColors.success, chartColors.danger],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // Chart Analfabetismo
  const hogaresAlfabetizados = totalHogares - hogaresAnalfabetos;
  safeCreateChart('chart-educacion-leer', {
    type: 'pie',
    data: {
      labels: ['Todos saben leer/escribir', 'Hay miembros analfabetos (>10 años)'],
      datasets: [{
        data: [hogaresAlfabetizados, hogaresAnalfabetos],
        backgroundColor: [chartColors.primary, chartColors.warning],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // ----------------------------------------
  // SECTION 4: DESARROLLO SOCIAL
  // ----------------------------------------
  let hogaresAsistencia = 0;
  let hogaresMerendero = 0;
  let hogaresCuatroComidas = 0;
  const programasFrec = {};

  records.forEach(r => {
    // Asistencia Social (q24_bool y q24)
    const q24Bool = getVal(r, 'q24_bool') || getVal(r, 'asistencia social');
    if (q24Bool && (q24Bool.toLowerCase().includes('sí') || q24Bool.toLowerCase() === 'si')) {
      hogaresAsistencia++;
      const prog = getVal(r, 'q24') || getVal(r, 'programa');
      if (prog && prog !== 'Seleccioná una opción...') {
        programasFrec[prog] = (programasFrec[prog] || 0) + 1;
      }
    }

    // Merenderos (q25)
    const q25Val = getVal(r, 'q25') || getVal(r, 'merendero');
    if (q25Val && (q25Val.toLowerCase().includes('sí') || q25Val.toLowerCase() === 'si')) {
      hogaresMerendero++;
    }

    // Comidas diarias (meals)
    const mealsVal = getVal(r, 'meals') || '';
    if (mealsVal) {
      const items = mealsVal.toLowerCase();
      // Si come Desayuno, Almuerzo, Merienda y Cena
      if (items.includes('desayuno') && items.includes('almuerzo') && items.includes('merienda') && items.includes('cena')) {
        hogaresCuatroComidas++;
      }
    }
  });

  const pctAsist = totalHogares > 0 ? Math.round((hogaresAsistencia / totalHogares) * 100) : 0;
  const pctMeren = totalHogares > 0 ? Math.round((hogaresMerendero / totalHogares) * 100) : 0;
  const pctComidas = totalHogares > 0 ? Math.round((hogaresCuatroComidas / totalHogares) * 100) : 0;

  document.getElementById('kpi-social-asistencia').textContent = `${pctAsist}%`;
  document.getElementById('kpi-social-merenderos').textContent = `${pctMeren}%`;
  document.getElementById('kpi-social-comidas').textContent = `${pctComidas}%`;

  // Chart: Programas Sociales
  const progLabels = Object.keys(programasFrec);
  const progValues = Object.values(programasFrec);
  safeCreateChart('chart-social-programas', {
    type: 'bar',
    data: {
      labels: progLabels.length ? progLabels : ['Ninguno'],
      datasets: [{
        label: 'Hogares Beneficiarios',
        data: progValues.length ? progValues : [0],
        backgroundColor: chartColors.primary,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } }
    }
  });

  // Chart Comedores
  const hogaresNoMerendero = totalHogares - hogaresMerendero;
  safeCreateChart('chart-social-comedores', {
    type: 'doughnut',
    data: {
      labels: ['No asisten', 'Asisten a comedor/merendero'],
      datasets: [{
        data: [hogaresNoMerendero, hogaresMerendero],
        backgroundColor: [chartColors.primaryTint, chartColors.primary],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // ----------------------------------------
  // SECTION 5: CONECTIVIDAD
  // ----------------------------------------
  let hogaresWifi = 0;
  let hogaresDispositivos = 0;

  records.forEach(r => {
    const q16Val = getVal(r, 'q16') || getVal(r, 'dispositivo');
    if (q16Val && (q16Val.toLowerCase().includes('sí') || q16Val.toLowerCase() === 'si')) {
      hogaresDispositivos++;
    }
    const q17Val = getVal(r, 'q17') || getVal(r, 'wifi');
    if (q17Val && (q17Val.toLowerCase().includes('sí') || q17Val.toLowerCase() === 'si')) {
      hogaresWifi++;
    }
  });

  const pctWifi = totalHogares > 0 ? Math.round((hogaresWifi / totalHogares) * 100) : 0;
  const pctDisp = totalHogares > 0 ? Math.round((hogaresDispositivos / totalHogares) * 100) : 0;

  document.getElementById('kpi-conectividad-wifi').textContent = `${pctWifi}%`;
  document.getElementById('kpi-conectividad-dispositivos').textContent = `${pctDisp}%`;

  // Chart: Brecha digital
  let wifiYDispY = 0;
  let wifiYDispN = 0;
  let wifiNDispY = 0;
  let wifiNDispN = 0;

  records.forEach(r => {
    const hasD = (getVal(r, 'q16') || '').toLowerCase().includes('sí');
    const hasW = (getVal(r, 'q17') || '').toLowerCase().includes('sí');
    if (hasW && hasD) wifiYDispY++;
    else if (hasW && !hasD) wifiYDispN++;
    else if (!hasW && hasD) wifiNDispY++;
    else wifiNDispN++;
  });

  safeCreateChart('chart-conectividad-brecha', {
    type: 'bar',
    data: {
      labels: ['Conectividad Total (Wi-Fi + PC/Cel)', 'Solo Wi-Fi (Sin Dispositivos)', 'Solo Dispositivos (Sin Wi-Fi)', 'Sin Conectividad (Ninguno)'],
      datasets: [{
        label: 'Hogares',
        data: [wifiYDispY, wifiYDispN, wifiNDispY, wifiNDispN],
        backgroundColor: [chartColors.success, chartColors.warning, chartColors.primary, chartColors.danger],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  // ----------------------------------------
  // SECTION 6: DISCAPACIDAD
  // ----------------------------------------
  let hogaresDiscapacidad = 0;
  let hogaresConCud = 0;
  let hogaresDiscapacidadTalleres = 0;
  const discapacidadTipos = {};

  records.forEach(r => {
    const q27Val = getVal(r, 'q27') || getVal(r, 'discapacidad');
    if (q27Val && (q27Val.toLowerCase().includes('sí') || q27Val.toLowerCase() === 'si')) {
      hogaresDiscapacidad++;

      // CUD (q28)
      const q28Val = getVal(r, 'q28') || getVal(r, 'cud');
      if (q28Val && (q28Val.toLowerCase().includes('sí') || q28Val.toLowerCase() === 'si')) {
        hogaresConCud++;
      }

      // Talleres Municipales (q30)
      const q30Val = getVal(r, 'q30') || getVal(r, 'talleres');
      if (q30Val && (q30Val.toLowerCase().includes('sí') || q30Val.toLowerCase() === 'si')) {
        hogaresDiscapacidadTalleres++;
      }

      // Tipo de discapacidad (q29)
      const q29Val = getVal(r, 'q29') || getVal(r, 'tipo_discapacidad');
      if (q29Val) {
        q29Val.split(',').forEach(tipo => {
          const t = tipo.trim();
          if (t) discapacidadTipos[t] = (discapacidadTipos[t] || 0) + 1;
        });
      }
    }
  });

  const pctDisc = totalHogares > 0 ? Math.round((hogaresDiscapacidad / totalHogares) * 100) : 0;
  const pctCud = hogaresDiscapacidad > 0 ? Math.round((hogaresConCud / hogaresDiscapacidad) * 100) : 0;
  const pctDiscTalleres = hogaresDiscapacidad > 0 ? Math.round((hogaresDiscapacidadTalleres / hogaresDiscapacidad) * 100) : 0;

  document.getElementById('kpi-discapacidad-reside').textContent = `${pctDisc}%`;
  document.getElementById('kpi-discapacidad-cud').textContent = `${pctCud}%`;
  document.getElementById('kpi-discapacidad-municipal').textContent = `${pctDiscTalleres}%`;

  // Chart: Tipos de discapacidad
  const discLabels = Object.keys(discapacidadTipos);
  const discValues = Object.values(discapacidadTipos);
  safeCreateChart('chart-discapacidad-tipos', {
    type: 'bar',
    data: {
      labels: discLabels.length ? discLabels : ['Ninguno'],
      datasets: [{
        label: 'Casos registrados',
        data: discValues.length ? discValues : [0],
        backgroundColor: chartColors.warning,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  // Chart: Participacion en programas de discapacidad
  const discNoTalleres = hogaresDiscapacidad - hogaresDiscapacidadTalleres;
  safeCreateChart('chart-discapacidad-participacion', {
    type: 'doughnut',
    data: {
      labels: ['No participan', 'Participan de talleres municipales'],
      datasets: [{
        data: [discNoTalleres, hogaresDiscapacidadTalleres],
        backgroundColor: [chartColors.primaryTint, chartColors.primary],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // ----------------------------------------
  // SECTION 7: ADULTOS MAYORES
  // ----------------------------------------
  let hogaresAdultos = 0;
  let hogaresAdultosJubilados = 0;
  let hogaresAdultosCentro = 0;
  const centrosMayorFrec = {};

  records.forEach(r => {
    const q36Val = getVal(r, 'q36') || getVal(r, 'adulto mayor') || getVal(r, '60 años');
    if (q36Val && (q36Val.toLowerCase().includes('sí') || q36Val.toLowerCase() === 'si')) {
      hogaresAdultos++;

      // Jubilacion (q37)
      const q37Val = getVal(r, 'q37') || getVal(r, 'jubilaci');
      if (q37Val && (q37Val.toLowerCase().includes('sí') || q37Val.toLowerCase() === 'si')) {
        hogaresAdultosJubilados++;
      }

      // Centro de jubilados (q38)
      const q38Val = getVal(r, 'q38') || getVal(r, 'centro');
      if (q38Val && (q38Val.toLowerCase().includes('sí') || q38Val.toLowerCase() === 'si')) {
        hogaresAdultosCentro++;
        const centro = getVal(r, 'q39');
        if (centro && centro !== 'Seleccioná una opción...') {
          centrosMayorFrec[centro] = (centrosMayorFrec[centro] || 0) + 1;
        }
      }
    }
  });

  const pctAdultos = totalHogares > 0 ? Math.round((hogaresAdultos / totalHogares) * 100) : 0;
  const pctJubilados = hogaresAdultos > 0 ? Math.round((hogaresAdultosJubilados / hogaresAdultos) * 100) : 0;
  const pctCentro = hogaresAdultos > 0 ? Math.round((hogaresAdultosCentro / hogaresAdultos) * 100) : 0;

  document.getElementById('kpi-mayores-reside').textContent = `${pctAdultos}%`;
  document.getElementById('kpi-mayores-jubilacion').textContent = `${pctJubilados}%`;
  document.getElementById('kpi-mayores-centro').textContent = `${pctCentro}%`;

  // Chart Cobertura previsional
  const adultosNoJubilados = hogaresAdultos - hogaresAdultosJubilados;
  safeCreateChart('chart-mayores-jubilacion', {
    type: 'pie',
    data: {
      labels: ['Con Cobertura (Jubilación/Pensión)', 'Sin Cobertura'],
      datasets: [{
        data: [hogaresAdultosJubilados, adultosNoJubilados],
        backgroundColor: [chartColors.success, chartColors.danger],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // Chart Centros de Jubilados asistencia
  const adultosNoCentro = hogaresAdultos - hogaresAdultosCentro;
  safeCreateChart('chart-mayores-centros', {
    type: 'doughnut',
    data: {
      labels: ['No asisten', 'Asisten a centro de jubilados'],
      datasets: [{
        data: [adultosNoCentro, hogaresAdultosCentro],
        backgroundColor: [chartColors.primaryTint, chartColors.primary],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // Chart Nombres de centros
  const centroLabels = Object.keys(centrosMayorFrec);
  const centroValues = Object.values(centrosMayorFrec);
  safeCreateChart('chart-mayores-nombres', {
    type: 'bar',
    data: {
      labels: centroLabels.length ? centroLabels : ['Ninguno'],
      datasets: [{
        label: 'Adultos mayores',
        data: centroValues.length ? centroValues : [0],
        backgroundColor: chartColors.primary,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });

  // ----------------------------------------
  // SECTION 8: SALUD
  // ----------------------------------------
  let hogaresCaps = 0;
  let niñosVacunacionTotal = 0;
  let niñosVacunacionCompleta = 0;
  let embarazadasSi = 0;
  let totalEnfCronicas = 0;

  records.forEach(r => {
    // Embarazo (q46)
    const q46Val = getVal(r, 'q46') || getVal(r, 'embarazada');
    if (q46Val && (q46Val.toLowerCase().includes('sí') || q46Val.toLowerCase() === 'si')) {
      embarazadasSi++;
    }

    // Vacunación menores (q42)
    const q42Val = getVal(r, 'q42') || getVal(r, 'vacunaci');
    if (q42Val) {
      niñosVacunacionTotal++;
      if (q42Val.toLowerCase().includes('sí') || q42Val.toLowerCase() === 'si') {
        niñosVacunacionCompleta++;
      }
    }

    // CAPS / Salud municipal (q43)
    const q43Val = getVal(r, 'q43') || getVal(r, 'caps');
    if (q43Val && (q43Val.toLowerCase().includes('sí') || q43Val.toLowerCase() === 'si')) {
      hogaresCaps++;
    }

    // Enfermedades crónicas (q47)
    const q47Val = getVal(r, 'q47') || getVal(r, 'crónica');
    if (q47Val && (q47Val.toLowerCase().includes('sí') || q47Val.toLowerCase() === 'si')) {
      totalEnfCronicas++;
    }
  });

  const pctCaps = totalHogares > 0 ? Math.round((hogaresCaps / totalHogares) * 100) : 0;
  const pctVacunas = niñosVacunacionTotal > 0 ? Math.round((niñosVacunacionCompleta / niñosVacunacionTotal) * 100) : 0;
  const pctCronicas = totalHogares > 0 ? Math.round((totalEnfCronicas / totalHogares) * 100) : 0;

  document.getElementById('kpi-salud-caps').textContent = `${pctCaps}%`;
  document.getElementById('kpi-salud-vacunas').textContent = `${pctVacunas}%`;
  document.getElementById('kpi-salud-cronicas').textContent = `${pctCronicas}%`;

  // Chart: Atención en centros municipales
  const hogaresNoCaps = totalHogares - hogaresCaps;
  safeCreateChart('chart-salud-centros', {
    type: 'pie',
    data: {
      labels: ['Asisten a CAPS/S24/Salud Municipal', 'Asisten a Hospital/Privados/Otros'],
      datasets: [{
        data: [hogaresCaps, hogaresNoCaps],
        backgroundColor: [chartColors.success, chartColors.primary],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // Chart Vacunación en niños
  const niñosVacunasIncompletas = niñosVacunacionTotal - niñosVacunacionCompleta;
  safeCreateChart('chart-salud-vacunacion', {
    type: 'doughnut',
    data: {
      labels: ['Vacunación al día', 'Esquema incompleto/NsNc'],
      datasets: [{
        data: [niñosVacunacionCompleta, niñosVacunasIncompletas],
        backgroundColor: [chartColors.success, chartColors.danger],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // Chart Embarazadas
  const hogaresNoEmbarazo = totalHogares - embarazadasSi;
  safeCreateChart('chart-salud-embarazo', {
    type: 'pie',
    data: {
      labels: ['Sin embarazadas', 'Embarazadas registradas'],
      datasets: [{
        data: [hogaresNoEmbarazo, embarazadasSi],
        backgroundColor: [chartColors.primaryTint, chartColors.accent3],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });

  // ----------------------------------------
  // SECTION 9: ZOONOSIS Y MASCOTAS
  // ----------------------------------------
  let hogaresMascotas = 0;
  let mascotasVacunaSi = 0;
  let mascotasVacunaTotal = 0;
  let mascotasCastradosSi = 0;
  let mascotasCastradosTotal = 0;

  records.forEach(r => {
    const q48Val = getVal(r, 'q48') || getVal(r, 'mascota');
    if (q48Val && (q48Val.toLowerCase().includes('sí') || q48Val.toLowerCase() === 'si')) {
      hogaresMascotas++;

      // Vacuna antirrábica (q49)
      const q49Val = getVal(r, 'q49') || getVal(r, 'antirrábica');
      if (q49Val) {
        mascotasVacunaTotal++;
        if (q49Val.toLowerCase().includes('sí, todos') || q49Val.toLowerCase() === 'sí, todos') {
          mascotasVacunaSi++;
        }
      }

      // Castrado (q50)
      const q50Val = getVal(r, 'q50') || getVal(r, 'castrado');
      if (q50Val) {
        mascotasCastradosTotal++;
        if (q50Val.toLowerCase().includes('sí, todos') || q50Val.toLowerCase() === 'sí, todos') {
          mascotasCastradosSi++;
        }
      }
    }
  });

  const pctMasco = totalHogares > 0 ? Math.round((hogaresMascotas / totalHogares) * 100) : 0;
  const pctRabia = mascotasVacunaTotal > 0 ? Math.round((mascotasVacunaSi / mascotasVacunaTotal) * 100) : 0;
  const pctCastr = mascotasCastradosTotal > 0 ? Math.round((mascotasCastradosSi / mascotasCastradosTotal) * 100) : 0;

  document.getElementById('kpi-zoonosis-mascotas').textContent = `${pctMasco}%`;
  document.getElementById('kpi-zoonosis-rabia').textContent = `${pctRabia}%`;
  document.getElementById('kpi-zoonosis-castrados').textContent = `${pctCastr}%`;

  // Chart Tenencia Responsable
  safeCreateChart('chart-zoonosis-tenencia', {
    type: 'bar',
    data: {
      labels: ['Tienen Mascotas', 'Tienen Vacunación Antirrábica al día', 'Están todos castrados/esterilizados'],
      datasets: [{
        label: 'Porcentaje de hogares (%)',
        data: [pctMasco, pctRabia, pctCastr],
        backgroundColor: [chartColors.primary, chartColors.success, chartColors.accent4],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { max: 100, min: 0 } },
      plugins: { legend: { display: false } }
    }
  });

  // ----------------------------------------
  // SECTION 10: SERVICIOS
  // ----------------------------------------
  // Evaluation scales: Muy bien, Bien, Mal, Muy mal, Ns/Nc
  const evalMapping = {
    'muy bien': 4,
    'bien': 3,
    'mal': 2,
    'muy mal': 1,
    'ns/nc': 0
  };

  const servicesCounts = {
    alumbrado: { sum: 0, count: 0 },
    basura: { sum: 0, count: 0 },
    desmalezado: { sum: 0, count: 0 },
    calles: { sum: 0, count: 0 },
    riego: { sum: 0, count: 0 }
  };

  records.forEach(r => {
    // Alumbrado (q52_1)
    const s1 = getVal(r, 'q52_1') || getVal(r, 'alumbrado') || getVal(r, 'luz');
    if (s1 && evalMapping.hasOwnProperty(s1.toLowerCase())) {
      const score = evalMapping[s1.toLowerCase()];
      if (score > 0) { servicesCounts.alumbrado.sum += score; servicesCounts.alumbrado.count++; }
    }
    // Basura (q52_2)
    const s2 = getVal(r, 'q52_2') || getVal(r, 'basura') || getVal(r, 'recolección');
    if (s2 && evalMapping.hasOwnProperty(s2.toLowerCase())) {
      const score = evalMapping[s2.toLowerCase()];
      if (score > 0) { servicesCounts.basura.sum += score; servicesCounts.basura.count++; }
    }
    // Yuyos (q52_3)
    const s3 = getVal(r, 'q52_3') || getVal(r, 'yuyos') || getVal(r, 'desmalezado') || getVal(r, 'corte');
    if (s3 && evalMapping.hasOwnProperty(s3.toLowerCase())) {
      const score = evalMapping[s3.toLowerCase()];
      if (score > 0) { servicesCounts.desmalezado.sum += score; servicesCounts.desmalezado.count++; }
    }
    // Baches (q52_4)
    const s4 = getVal(r, 'q52_4') || getVal(r, 'baches') || getVal(r, 'calle');
    if (s4 && evalMapping.hasOwnProperty(s4.toLowerCase())) {
      const score = evalMapping[s4.toLowerCase()];
      if (score > 0) { servicesCounts.calles.sum += score; servicesCounts.calles.count++; }
    }
    // Riego (q52_5)
    const s5 = getVal(r, 'q52_5') || getVal(r, 'riego');
    if (s5 && evalMapping.hasOwnProperty(s5.toLowerCase())) {
      const score = evalMapping[s5.toLowerCase()];
      if (score > 0) { servicesCounts.riego.sum += score; servicesCounts.riego.count++; }
    }
  });

  const getAverageScore = (serviceKey) => {
    const s = servicesCounts[serviceKey];
    return s.count > 0 ? (s.sum / s.count).toFixed(2) : 0;
  };

  const avgAlumbrado = getAverageScore('alumbrado');
  const avgBasura = getAverageScore('basura');
  const avgDesmalezado = getAverageScore('desmalezado');
  const avgCalles = getAverageScore('calles');
  const avgRiego = getAverageScore('riego');

  safeCreateChart('chart-servicios-evaluacion', {
    type: 'bar',
    data: {
      labels: ['Alumbrado público', 'Recolección de residuos', 'Desmalezado / Limpieza', 'Estado de calles (Baches)', 'Riego de calles de tierra'],
      datasets: [{
        label: 'Promedio de Satisfacción (Escala 1 a 4)',
        data: [avgAlumbrado, avgBasura, avgDesmalezado, avgCalles, avgRiego],
        backgroundColor: [
          chartColors.primary,
          chartColors.success,
          chartColors.accent4,
          chartColors.danger,
          chartColors.warning
        ],
        borderRadius: 6,
        barPercentage: 0.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 1,
          max: 4,
          ticks: {
            stepSize: 1,
            callback: function(value) {
              const ticksLabels = { 1: 'Muy Mal (1)', 2: 'Mal (2)', 3: 'Bien (3)', 4: 'Muy Bien (4)' };
              return ticksLabels[value] || value;
            }
          }
        }
      },
      plugins: { legend: { display: false } }
    }
  });

  // ----------------------------------------
  // SECTION 11: ALERTAS CRÍTICAS
  // ----------------------------------------
  const alerts = alertRecords.filter(a => {
    if (selectedBarrio === 'todos') return true;
    const b = a.barrio || (a.encuestado && a.encuestado.barrio);
    return b === selectedBarrio;
  });

  const totalAlerts = alerts.length;
  const highUrgencyAlerts = alerts.filter(a => a.urgencia === 'Alta').length;
  const alertsWithGps = alerts.filter(a => a.ubicacion).length;

  document.getElementById('kpi-alertas-total').textContent = totalAlerts;
  document.getElementById('kpi-alertas-alta').textContent = highUrgencyAlerts;
  document.getElementById('kpi-alertas-gps').textContent = alertsWithGps;

  const tbody = document.getElementById('alertas-table-body');
  if (tbody) {
    tbody.innerHTML = '';
    if (alerts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No se registraron alertas críticas para este barrio.
          </td>
        </tr>
      `;
    } else {
      alerts.forEach(a => {
        const tr = document.createElement('tr');
        
        const dateStr = a.created_at ? new Date(a.created_at).toLocaleString('es-AR') : 'Sin fecha';
        const badgeClass = a.urgencia === 'Alta' ? 'badge badge-danger' : 'badge badge-warning';
        const badgeHtml = `<span class="${badgeClass}">${a.urgencia || 'Alta'}</span>`;
        
        let gpsHtml = '<span class="text-gray-400">-</span>';
        if (a.ubicacion) {
          gpsHtml = `
            <a href="https://maps.google.com/?q=${a.ubicacion}" target="_blank" class="primary-btn btn" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; text-decoration: none; border-radius: 4px; display: inline-flex; align-items: center; gap: 2px;">
              <span class="material-symbols-outlined" style="font-size: 14px;">map</span> Mapa
            </a>
          `;
        }
        
        let contactHtml = 'Sin datos';
        if (a.encuestado) {
          const e = a.encuestado;
          const fullName = [e.nombre, e.apellido].filter(Boolean).join(' ') || 'Anónimo';
          const details = [];
          if (e.dni) details.push(`DNI: ${e.dni}`);
          if (e.telefono) details.push(`Tel: ${e.telefono}`);
          if (e.direccion) details.push(`Dir: ${e.direccion}`);
          contactHtml = `
            <strong>${fullName}</strong>
            ${details.length ? '<br><span style="font-size: 0.75rem; color: var(--text-muted);">' + details.join(' | ') + '</span>' : ''}
          `;
        }
        
        tr.innerHTML = `
          <td style="padding: 1rem 0.75rem;">${dateStr}</td>
          <td style="padding: 1rem 0.75rem;"><strong>${a.barrio || '-'}</strong></td>
          <td style="padding: 1rem 0.75rem;">${a.encuestador || '-'}</td>
          <td style="padding: 1rem 0.75rem; font-weight: 500;">${a.tipo || '-'}</td>
          <td style="padding: 1rem 0.75rem; text-align: center;">${badgeHtml}</td>
          <td style="padding: 1rem 0.75rem; font-style: italic; max-width: 250px; overflow: hidden; text-overflow: ellipsis;" title="${a.nota || ''}">${a.nota || '-'}</td>
          <td style="padding: 1rem 0.75rem;">${contactHtml}</td>
          <td style="padding: 1rem 0.75rem; text-align: center;">${gpsHtml}</td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  // ----------------------------------------
  // SECCIÓN 12: REPORTES DETALLADOS
  // ----------------------------------------
  renderReportesTable();
}

// Renderiza la tabla de reportes individuales con soporte de búsqueda
function renderReportesTable() {
  const selectedBarrio = document.getElementById('barrio-filter').value;
  const searchVal = (document.getElementById('reportes-search')?.value || '').toLowerCase().trim();

  // Filtrar registros por barrio
  const filteredByBarrio = surveyRecords.filter(r => {
    if (selectedBarrio === 'todos') return true;
    const b = r.barrio || (r.datos && r.datos['Barrio Seleccionado']);
    return b === selectedBarrio;
  });

  // Filtrar registros por buscador
  const records = filteredByBarrio.filter(r => {
    if (!searchVal) return true;
    const barrio = (r.barrio || '').toLowerCase();
    const encuestador = (r.encuestador || '').toLowerCase();
    const answersText = r.datos ? Object.values(r.datos).join(' ').toLowerCase() : '';
    return barrio.includes(searchVal) || encuestador.includes(searchVal) || answersText.includes(searchVal);
  });

  // Actualizar KPI total de reportes
  const kpiTotal = document.getElementById('kpi-reportes-total');
  if (kpiTotal) {
    kpiTotal.textContent = records.length;
  }

  const tbody = document.getElementById('reportes-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          No se encontraron encuestas para esta búsqueda.
        </td>
      </tr>
    `;
    return;
  }

  records.forEach(r => {
    const tr = document.createElement('tr');
    const dateStr = r.created_at ? new Date(r.created_at).toLocaleString('es-AR') : 'Sin fecha';
    
    // Obtener cantidad de habitantes
    const getVal = (rec, keyWord) => {
      if (!rec.datos) return undefined;
      if (rec.datos.hasOwnProperty(keyWord)) return rec.datos[keyWord];
      const matchKey = Object.keys(rec.datos).find(k => k.toLowerCase().includes(keyWord.toLowerCase()));
      return matchKey ? rec.datos[matchKey] : undefined;
    };
    const q2Val = getVal(r, 'person') || getVal(r, 'q2') || '0';
    const numPers = parseInt(q2Val) || (q2Val.includes('10') ? 10 : 0) || '-';

    tr.innerHTML = `
      <td style="padding: 1rem 0.75rem;">${dateStr}</td>
      <td style="padding: 1rem 0.75rem;"><strong>${r.barrio || '-'}</strong></td>
      <td style="padding: 1rem 0.75rem;">${r.encuestador || '-'}</td>
      <td style="padding: 1rem 0.75rem; text-align: center; font-weight: 600;">${numPers}</td>
      <td style="padding: 1rem 0.75rem; text-align: center;">
        <button class="btn primary-btn btn-view-detail" style="padding: 0.25rem 0.75rem; font-size: 0.75rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
          <span class="material-symbols-outlined" style="font-size: 14px;">visibility</span> Ver Detalle
        </button>
      </td>
    `;

    // Manejador del modal de detalle
    tr.querySelector('.btn-view-detail').addEventListener('click', () => {
      openSurveyModal(r);
    });

    tbody.appendChild(tr);
  });
}

// Abre el modal detallado y agrupa las preguntas de forma inteligente
function openSurveyModal(survey) {
  const modal = document.getElementById('survey-modal');
  const modalBody = document.getElementById('survey-modal-body');
  if (!modal || !modalBody) return;

  modalBody.innerHTML = '';

  const dateStr = survey.created_at ? new Date(survey.created_at).toLocaleString('es-AR') : 'Sin fecha';
  
  // Encabezado con metadatos principales de la encuesta
  const metaHtml = `
    <div class="glass" style="margin-bottom: 1.5rem; background: rgba(0, 157, 224, 0.05); border-color: rgba(0, 157, 224, 0.2); display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; padding: 1rem; box-shadow: none;">
      <div><span style="color: var(--text-muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Fecha de Carga</span><br><strong>${dateStr}</strong></div>
      <div><span style="color: var(--text-muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Barrio</span><br><strong>${survey.barrio || '-'}</strong></div>
      <div><span style="color: var(--text-muted); font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">Encuestador</span><br><strong>${survey.encuestador || '-'}</strong></div>
    </div>
  `;
  modalBody.insertAdjacentHTML('beforeend', metaHtml);

  // Categorías de agrupación
  const groups = {
    "Estructura del Hogar": [],
    "Identidad": [],
    "Educación": [],
    "Desarrollo Social": [],
    "Conectividad y Tecnología": [],
    "Discapacidad": [],
    "Adultos Mayores": [],
    "Salud y CAPS": [],
    "Zoonosis y Mascotas": [],
    "Servicios Públicos": [],
    "Otros Datos": []
  };

  const getGroup = (key) => {
    const k = key.toLowerCase();
    if (k.includes('persona') || k.includes('menor') || k.includes('hogar') || k.includes('q2') || k.includes('q3')) return "Estructura del Hogar";
    if (k.includes('dni') || k.includes('document') || k.includes('q6') || k.includes('q7')) return "Identidad";
    if (k.includes('escuela') || k.includes('leer') || k.includes('estudi') || k.includes('q8') || k.includes('q9') || k.includes('q5')) return "Educación";
    if (k.includes('programa') || k.includes('merendero') || k.includes('comida') || k.includes('meals') || k.includes('vianda')) return "Desarrollo Social";
    if (k.includes('wifi') || k.includes('dispositi') || k.includes('pc') || k.includes('celular') || k.includes('conectividad') || k.includes('q16') || k.includes('q17')) return "Conectividad y Tecnología";
    if (k.includes('discapacidad') || k.includes('cud') || k.includes('taller') || k.includes('q27') || k.includes('q28') || k.includes('q29') || k.includes('q30')) return "Discapacidad";
    if (k.includes('jubila') || k.includes('pension') || k.includes('centro') || k.includes('mayor') || k.includes('60 años') || k.includes('q36') || k.includes('q37') || k.includes('q38') || k.includes('q39')) return "Adultos Mayores";
    if (k.includes('caps') || k.includes('salud') || k.includes('vacuna') || k.includes('embaraz') || k.includes('crónic') || k.includes('enfermedad') || k.includes('q42') || k.includes('q43') || k.includes('q44') || k.includes('q46') || k.includes('q47')) return "Salud y CAPS";
    if (k.includes('mascota') || k.includes('perro') || k.includes('gato') || k.includes('antirráb') || k.includes('castra') || k.includes('q48') || k.includes('q49') || k.includes('q50')) return "Zoonosis y Mascotas";
    if (k.includes('alumbrado') || k.includes('basura') || k.includes('riego') || k.includes('bache') || k.includes('calle') || k.includes('yuyos') || k.includes('desmalez') || k.includes('q52')) return "Servicios Públicos";
    return "Otros Datos";
  };

  if (survey.datos) {
    Object.entries(survey.datos).forEach(([pregunta, respuesta]) => {
      const cleanPregunta = pregunta.trim();
      const cleanRespuesta = (respuesta !== undefined && respuesta !== null) ? String(respuesta).trim() : '';

      // Omitir respuestas vacías para evitar clutter
      if (cleanRespuesta === '' || cleanRespuesta.toLowerCase() === 'seleccioná una opción...') return;

      const groupName = getGroup(cleanPregunta);
      groups[groupName].push({ q: cleanPregunta, a: cleanRespuesta });
    });
  }

  // Crear la grilla de tarjetas del detalle
  const gridDiv = document.createElement('div');
  gridDiv.className = 'survey-details-grid';

  Object.entries(groups).forEach(([groupName, items]) => {
    if (items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'details-section';
    section.innerHTML = `<h3>${groupName}</h3>`;

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'details-item';
      
      let valClass = '';
      const lowerA = item.a.toLowerCase();
      if (lowerA === 'sí' || lowerA === 'si') valClass = 'val-si';
      else if (lowerA === 'no') valClass = 'val-no';

      row.innerHTML = `
        <span class="details-label">${item.q}</span>
        <span class="details-value ${valClass}">${item.a}</span>
      `;
      section.appendChild(row);
    });

    gridDiv.appendChild(section);
  });

  modalBody.appendChild(gridDiv);
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Detiene el scroll del fondo
}

// Cierra el modal de detalle
function closeSurveyModal() {
  const modal = document.getElementById('survey-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  document.body.style.overflow = ''; // Restaura el scroll
}

// Exporta las encuestas cargadas (según barrio seleccionado) a CSV con BOM UTF-8
function exportToCSV() {
  const selectedBarrio = document.getElementById('barrio-filter').value;
  
  const records = surveyRecords.filter(r => {
    if (selectedBarrio === 'todos') return true;
    const b = r.barrio || (r.datos && r.datos['Barrio Seleccionado']);
    return b === selectedBarrio;
  });

  if (records.length === 0) {
    alert('No hay datos para exportar.');
    return;
  }

  try {
    const csvData = records.map(r => {
      const flattened = {
        'ID Encuesta': r.id,
        'Fecha Registro': r.created_at ? new Date(r.created_at).toLocaleString('es-AR') : '',
        'Barrio': r.barrio || '',
        'Encuestador': r.encuestador || ''
      };

      if (r.datos) {
        Object.entries(r.datos).forEach(([q, a]) => {
          flattened[q] = a;
        });
      }

      return flattened;
    });

    const csvString = Papa.unparse(csvData);
    
    // Agrega el BOM UTF-8 (\uFEFF) para compatibilidad con Excel en español
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    const barrioSuffix = selectedBarrio === 'todos' ? 'todos_barrios' : selectedBarrio.replace(/\s+/g, '_').toLowerCase();
    const dateStr = new Date().toISOString().slice(0, 10);
    
    link.href = URL.createObjectURL(blob);
    link.download = `relevamiento_social_${barrioSuffix}_${dateStr}.csv`;
    link.click();
  } catch (error) {
    console.error('Error al exportar CSV:', error);
    alert('Ocurrió un error al exportar los datos: ' + error.message);
  }
}
