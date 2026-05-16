/* ════════════════════════════════════════════════════════════════════════════
   SPCD SHARE — Envío por email/WhatsApp post-exportación de Excel
   Fase 1: zero-cost · libreta de contactos · plantillas por rol · audit log
   Autor: Lumen by Pyralis · Hospital Italiano de Mendoza
   ════════════════════════════════════════════════════════════════════════════ */
(function() {
  if (window.SpcdShare) return; // idempotente

  const LS_CONTACTS = 'spcd_share_contacts';
  const LS_AUDIT    = 'spcd_share_audit';
  const LS_SETTINGS = 'spcd_share_settings';
  const AUDIT_MAX   = 200;

  /* ───────── STORAGE ───────── */
  function uuid() { return 'c' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
  function loadContacts() {
    try { return JSON.parse(localStorage.getItem(LS_CONTACTS) || '[]'); }
    catch { return []; }
  }
  function saveContacts(list) { localStorage.setItem(LS_CONTACTS, JSON.stringify(list)); }
  function loadAudit() {
    try { return JSON.parse(localStorage.getItem(LS_AUDIT) || '[]'); }
    catch { return []; }
  }
  function addAudit(entry) {
    const list = loadAudit();
    list.unshift({ ts: Date.now(), ...entry });
    while (list.length > AUDIT_MAX) list.pop();
    localStorage.setItem(LS_AUDIT, JSON.stringify(list));
  }
  function clearAudit() { localStorage.removeItem(LS_AUDIT); }

  /* ───────── PLANTILLAS POR ROL ───────── */
  const ROL_LABELS = {
    direccion:  'Dirección / Gerencia',
    supervisor: 'Jefe de Servicio / Supervisor',
    operador:   'Operador / Técnico',
    auditoria:  'Auditoría / Externo'
  };
  const ROL_COLORS = {
    direccion:  '#3B82F6',
    supervisor: '#22DBAE',
    operador:   '#F59E0B',
    auditoria:  '#A78BFA'
  };

  function getRemitente() {
    try {
      const u = JSON.parse(localStorage.getItem('spcd_session'));
      return (u && u.user && (u.user.nombre || u.user.username)) || 'Equipo SPCD';
    } catch { return 'Equipo SPCD'; }
  }
  function getSedeActual() { return localStorage.getItem('spcd_sede') || 'Hospital Italiano de Mendoza'; }
  function fmtFecha() { return new Date().toLocaleDateString('es-AR'); }

  function buildMessage(contact, meta, channel) {
    const sede = getSedeActual();
    const remitente = getRemitente();
    const fecha = fmtFecha();
    const tipo = meta.titulo || 'Informe';
    const periodo = meta.periodo || fecha;
    const cantidad = meta.cantidad ? `El archivo contiene ${meta.cantidad.toLocaleString('es-AR')} registros.` : '';
    const nombre = (contact && contact.nombre) ? contact.nombre.split(' ')[0] : '';

    const T = {
      direccion: {
        subject: `Informe SPCD — ${tipo} — ${sede} — ${fecha}`,
        body: `Estimado/a ${nombre || '[Destinatario]'}:\n\n`
            + `Adjunto el informe "${tipo}" correspondiente a ${periodo} de la sede ${sede}.\n\n`
            + (cantidad ? cantidad + '\n\n' : '')
            + `El archivo contiene información institucional confidencial para uso interno exclusivo.\n\n`
            + `Quedo a disposición para consultas.\n\n`
            + `Saludos cordiales,\n${remitente}`,
        wa: `Buenos días ${nombre || ''}.\n\n`
          + `Le comparto el informe SPCD de "${tipo}" (${periodo}). El archivo se adjunta a continuación.\n\n`
          + `Saludos cordiales, ${remitente}.`
      },
      supervisor: {
        subject: `[SPCD] ${tipo} — ${sede} — ${fecha}`,
        body: `Hola ${nombre || ''},\n\n`
            + `Te paso el informe de "${tipo}" de ${periodo}.\n\n`
            + (cantidad ? cantidad + '\n\n' : '')
            + `Cualquier duda me avisás.\n\n`
            + `Saludos,\n${remitente}`,
        wa: `Hola ${nombre || ''}, te paso el informe de ${tipo} (${periodo}). Lo adjunto acá. Avisame si necesitás algo más.`
      },
      operador: {
        subject: `SPCD: ${tipo}`,
        body: `Hola ${nombre || ''},\n\n`
            + `Te paso el ${tipo} para tu revisión.\n\n`
            + (cantidad ? cantidad + '\n\n' : '')
            + `Saludos,\n${remitente}`,
        wa: `Hola ${nombre || ''}, te paso el ${tipo}. Revisalo cuando puedas 👍`
      },
      auditoria: {
        subject: `Informe institucional SPCD — ${tipo} — ${fecha}`,
        body: `Estimados Sres.,\n\n`
            + `Por medio de la presente se adjunta el informe "${tipo}" del Hospital Italiano de Mendoza, sede ${sede}, correspondiente a ${periodo}.\n\n`
            + (cantidad ? cantidad + '\n\n' : '')
            + `El archivo contiene información institucional confidencial. Quedamos a disposición.\n\n`
            + `Atentamente,\n${remitente}\nSede: ${sede}`,
        wa: `Informe institucional SPCD — ${tipo} (${periodo}). Se adjunta archivo. ${remitente}.`
      }
    };

    const tpl = T[contact ? contact.rol : 'supervisor'] || T.supervisor;
    if (channel === 'email') return { subject: tpl.subject, body: tpl.body };
    if (channel === 'whatsapp') return { text: tpl.wa };
    return tpl;
  }

  /* ───────── TOAST ───────── */
  function showToast(msg, type, durationMs) {
    const t = document.createElement('div');
    t.className = 'ss-toast' + (type ? ' ' + type : '');
    t.innerHTML = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, durationMs || 8000);
  }

  /* ───────── CANALES ─────────
     LIMITACIÓN: los protocolos mailto: y wa.me NO aceptan adjuntos en la URL,
     y el Clipboard API del browser no puede inyectar archivos que Gmail/WhatsApp Web
     lean como adjunto. La única vía de auto-adjunto en desktop es navigator.share()
     (botón "📱 Compartir archivo") que abre el panel nativo del SO.
     Para Email/WhatsApp se abre el cliente con mensaje pre-cargado, el usuario
     adjunta el archivo desde Descargas (1 clic con el ícono 📎).
  */
  async function openEmail(contact, meta, file) {
    if (!contact || !contact.email) { alert('Este contacto no tiene email.'); return false; }
    const { subject, body } = buildMessage(contact, meta, 'email');
    const href = 'mailto:' + encodeURIComponent(contact.email)
               + '?subject=' + encodeURIComponent(subject)
               + '&body=' + encodeURIComponent(body);
    window.location.href = href;
    addAudit({ kind: 'email', contactId: contact.id, contactName: contact.nombre, meta });
    const fname = (meta && meta.fileName) || 'el archivo';
    showToast(
      `📧 Cliente de email abierto.<br/>` +
      `<span style="color:#94A3B8;">El mensaje ya trae destinatario, asunto y cuerpo listos.</span><br/>` +
      `<b style="color:#22DBAE;">Adjuntar:</b> cl&iacute;ck en 📎 y eleg&iacute; <b>${fname}</b> desde la carpeta <b>Descargas</b>.`,
      'info', 10000
    );
    return true;
  }
  async function openWhatsApp(contact, meta, file) {
    if (!contact || !contact.whatsapp) { alert('Este contacto no tiene WhatsApp.'); return false; }
    const phone = contact.whatsapp.replace(/[^\d]/g,''); // solo dígitos
    const { text } = buildMessage(contact, meta, 'whatsapp');
    const href = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
    window.open(href, '_blank', 'noopener');
    addAudit({ kind: 'whatsapp', contactId: contact.id, contactName: contact.nombre, meta });
    const fname = (meta && meta.fileName) || 'el archivo';
    showToast(
      `💬 WhatsApp abierto con el mensaje listo.<br/>` +
      `<b style="color:#22DBAE;">Adjuntar:</b> cl&iacute;ck en 📎 dentro del chat y eleg&iacute; <b>${fname}</b> desde <b>Descargas</b>.<br/>` +
      `<span style="color:#FBBF24;">Tip:</span> si us&aacute;s Chrome/Edge desktop, el bot&oacute;n <b>📱 Compartir archivo</b> lo adjunta autom&aacute;ticamente.`,
      'info', 12000
    );
    return true;
  }
  async function shareNative(file, contact, meta) {
    if (!navigator.canShare) {
      showToast('Tu navegador no soporta compartir archivos. Us&aacute; Email/WhatsApp y adjunt&aacute; desde Descargas.', 'warn', 9000);
      return false;
    }
    const tplEmail = buildMessage(contact, meta, 'email');
    const tplWa    = buildMessage(contact, meta, 'whatsapp');
    const shareData = {
      files: [file],
      title: tplEmail.subject,
      text: tplWa.text
    };
    if (!navigator.canShare(shareData)) {
      showToast('Este tipo de archivo no se puede compartir desde este navegador. Us&aacute; Email/WhatsApp y adjunt&aacute; desde Descargas.', 'warn', 9000);
      return false;
    }
    // Detectar contexto seguro ANTES de intentar
    if (!window.isSecureContext) {
      showToast(
        `🔒 <b>El navegador bloque&oacute; compartir archivos.</b><br/>` +
        `Causa: la p&aacute;gina no se sirve sobre <b>HTTPS</b> (ni localhost). Chrome/Edge requieren contexto seguro.<br/><br/>` +
        `<b>Alternativas inmediatas:</b><br/>` +
        `• Us&aacute; <b>📧 Email</b> o <b>💬 WhatsApp</b> y adjunt&aacute; manual desde <b>Descargas</b> (1 clic con 📎).<br/>` +
        `• Hablalo con tu &aacute;rea de IT para servir la app por HTTPS o localhost.`,
        'warn', 15000
      );
      return false;
    }
    try {
      await navigator.share(shareData);
      addAudit({ kind: 'native-share', contactId: contact ? contact.id : null, contactName: contact ? contact.nombre : '(sin contacto)', meta });
      showToast('✓ Archivo enviado al panel del sistema. Eleg&iacute; la app y se adjunta autom&aacute;ticamente.', 'success', 5000);
      return true;
    } catch(e) {
      if (e && e.name === 'AbortError') return false; // usuario cerró el panel
      // Permission denied u otro error — dar diagnóstico útil
      const msg = (e && e.message) || String(e);
      let helpText = '';
      if (/permission/i.test(msg) || /denied/i.test(msg)) {
        helpText =
          `🚫 <b>Compartir bloqueado por el navegador.</b><br/>` +
          `Causas posibles:<br/>` +
          `1. La app no corre sobre <b>HTTPS</b> (necesario). URL actual: <code style="font-size:10px">${location.protocol}//${location.host||'(local)'}</code><br/>` +
          `2. Hay una pol&iacute;tica de permisos que bloquea <code>web-share</code>.<br/>` +
          `3. El tipo de archivo .xlsx no est&aacute; permitido por el navegador.<br/><br/>` +
          `<b>Alternativa:</b> us&aacute; Email/WhatsApp y adjunt&aacute; desde Descargas (ya est&aacute; ah&iacute;).`;
      } else {
        helpText = `⚠ Error al compartir: ${msg}. Pod&eacute;s enviar por Email/WhatsApp y adjuntar desde Descargas.`;
      }
      showToast(helpText, 'warn', 15000);
      return false;
    }
  }

  /* ───────── CSS INYECTADO ───────── */
  const CSS = `
  .ss-overlay { position:fixed; inset:0; background:rgba(10,15,20,.8); backdrop-filter:blur(6px); z-index:10001; display:none; align-items:center; justify-content:center; padding:20px; font-family:'Inter',sans-serif; }
  .ss-overlay.open { display:flex; }
  .ss-modal { background:#0F172A; border:1px solid rgba(34,219,174,.3); border-radius:14px; padding:22px; width:100%; max-width:560px; max-height:88vh; overflow:auto; color:#E2E8F0; box-shadow:0 30px 80px rgba(0,0,0,.6); }
  .ss-modal.large { max-width:780px; }
  .ss-h { margin:0 0 4px; font-family:'Rajdhani',sans-serif; font-size:18px; letter-spacing:2px; color:#22DBAE; }
  .ss-sub { font-size:12px; color:#94A3B8; margin-bottom:16px; word-break:break-all; }
  .ss-label { display:block; font-size:10px; letter-spacing:1.5px; color:#64748B; text-transform:uppercase; margin:14px 0 6px; font-weight:600; }
  .ss-input, .ss-select, .ss-textarea { width:100%; box-sizing:border-box; background:rgba(10,15,20,.7); border:1px solid rgba(30,58,138,.5); border-radius:8px; padding:9px 11px; color:#E2E8F0; font-size:12.5px; font-family:inherit; }
  .ss-textarea { min-height:80px; resize:vertical; font-family:'Roboto Mono',monospace; font-size:11px; }
  .ss-input:focus, .ss-select:focus, .ss-textarea:focus { outline:none; border-color:#22DBAE; }

  .ss-preview { background:rgba(30,58,138,.18); border-left:3px solid #22DBAE; border-radius:6px; padding:10px 14px; margin-top:10px; font-size:11.5px; white-space:pre-wrap; max-height:180px; overflow:auto; color:#CBD5E1; font-family:'Roboto Mono',monospace; }
  .ss-preview-tabs { display:flex; gap:4px; margin-top:8px; }
  .ss-preview-tab { font-size:10px; letter-spacing:1px; padding:5px 10px; border-radius:6px; background:transparent; border:1px solid rgba(30,58,138,.5); color:#94A3B8; cursor:pointer; font-weight:600; }
  .ss-preview-tab.active { background:#22DBAE; color:#0F172A; border-color:#22DBAE; }

  .ss-actions { display:flex; gap:8px; margin-top:18px; justify-content:flex-end; flex-wrap:wrap; }
  .ss-btn { padding:9px 16px; border-radius:8px; font-size:12px; font-weight:600; letter-spacing:1px; cursor:pointer; transition:all .15s; font-family:inherit; border:none; display:inline-flex; align-items:center; gap:6px; }
  .ss-btn[disabled] { opacity:.35; cursor:not-allowed; }
  .ss-btn-primary   { background:linear-gradient(135deg,#22DBAE,#3B82F6); color:#0F172A; }
  .ss-btn-email     { background:#3B82F6; color:#fff; }
  .ss-btn-wa        { background:#25D366; color:#fff; }
  .ss-btn-share     { background:#A78BFA; color:#fff; }
  .ss-btn-secondary { background:transparent; color:#94A3B8; border:1px solid rgba(30,58,138,.5); }
  .ss-btn-danger    { background:transparent; color:#f87171; border:1px solid rgba(248,113,113,.5); }
  .ss-btn:not([disabled]):hover { opacity:.92; transform:translateY(-1px); }

  .ss-contact-row { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid rgba(30,58,138,.25); gap:12px; }
  .ss-contact-row:last-child { border-bottom:none; }
  .ss-contact-info { flex:1; min-width:0; }
  .ss-contact-name { font-weight:700; color:#E2E8F0; font-size:13px; }
  .ss-contact-tag { display:inline-block; padding:2px 8px; border-radius:10px; font-size:9px; letter-spacing:1px; font-weight:700; margin-left:6px; }
  .ss-contact-meta { font-size:10.5px; color:#64748B; margin-top:2px; word-break:break-all; }
  .ss-contact-actions { display:flex; gap:4px; }
  .ss-icon-btn { background:transparent; border:none; cursor:pointer; padding:6px 8px; border-radius:6px; color:#94A3B8; font-size:14px; }
  .ss-icon-btn:hover { background:rgba(34,219,174,.15); color:#22DBAE; }

  .ss-empty { text-align:center; padding:30px 20px; color:#64748B; font-size:12px; }

  .ss-chip { display:inline-block; padding:4px 10px; border-radius:14px; font-size:10px; letter-spacing:1px; font-weight:700; background:rgba(34,219,174,.15); color:#22DBAE; }

  .ss-warn { background:rgba(251,191,36,.12); border-left:3px solid #FBBF24; padding:9px 12px; border-radius:6px; font-size:11px; color:#FCD34D; margin-top:10px; line-height:1.55; }
  .ss-ok-box { background:rgba(34,219,174,.12); border-left:3px solid #22DBAE; padding:10px 13px; border-radius:6px; font-size:11.5px; color:#A7F3D0; margin-top:10px; line-height:1.55; }
  .ss-btn.ss-btn-primary-action { box-shadow:0 0 0 2px rgba(167,139,250,.4), 0 6px 18px rgba(167,139,250,.35); font-size:13px; padding:11px 18px; }
  .ss-badge-rec { display:inline-block; background:#22DBAE; color:#0F172A; font-size:9px; letter-spacing:1px; padding:2px 7px; border-radius:8px; margin-left:6px; font-weight:800; }

  .ss-audit-row { border-bottom:1px solid rgba(30,58,138,.2); padding:8px 0; font-size:11.5px; display:flex; justify-content:space-between; gap:8px; }
  .ss-audit-row .ts { color:#64748B; font-family:monospace; font-size:10px; }
  .ss-audit-row .info { color:#E2E8F0; flex:1; }
  .ss-audit-ch { display:inline-block; padding:2px 7px; border-radius:8px; font-size:9px; font-weight:700; letter-spacing:1px; }
  .ss-audit-ch.email    { background:rgba(59,130,246,.2);  color:#60A5FA; }
  .ss-audit-ch.whatsapp { background:rgba(37,211,102,.2);  color:#22C55E; }
  .ss-audit-ch.native-share { background:rgba(167,139,250,.2); color:#A78BFA; }

  .ss-checkbox { display:flex; align-items:center; gap:8px; font-size:12px; color:#94A3B8; margin-top:10px; cursor:pointer; }
  .ss-checkbox input { accent-color:#22DBAE; }

  .ss-field-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }

  .ss-toast {
    position:fixed; bottom:20px; left:50%; transform:translate(-50%, 20px);
    background:#0F172A; color:#E2E8F0;
    border:1px solid rgba(34,219,174,.4);
    border-radius:10px; padding:13px 18px;
    font-size:12.5px; line-height:1.5;
    box-shadow:0 10px 30px rgba(0,0,0,.5);
    max-width:480px; z-index:10050;
    opacity:0; transition:opacity .3s, transform .3s;
    pointer-events:none;
  }
  .ss-toast.show { opacity:1; transform:translate(-50%, 0); }
  .ss-toast.success { border-color:#22DBAE; box-shadow:0 10px 30px rgba(34,219,174,.25); }
  .ss-toast.info    { border-color:#3B82F6; box-shadow:0 10px 30px rgba(59,130,246,.25); }
  .ss-toast.warn    { border-color:#FBBF24; box-shadow:0 10px 30px rgba(251,191,36,.3); max-width:560px; }
  .ss-toast b { color:#22DBAE; }
  .ss-toast.warn b { color:#FBBF24; }
  .ss-toast code { background:rgba(10,15,20,.8); padding:1px 6px; border-radius:4px; font-size:10px; color:#93C5FD; }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ───────── CONTENEDORES MODALES (se crean on demand) ───────── */
  function makeOverlay() {
    const ov = document.createElement('div');
    ov.className = 'ss-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
    document.body.appendChild(ov);
    return ov;
  }

  /* ═════════════════════════════════════════
     MODAL 1: SHARE DIALOG (post-export)
     ═════════════════════════════════════════ */
  let _overlayShare = null, _currentFile = null, _currentMeta = null, _currentChannel = 'email';
  function showShareDialog(blob, fileName, meta) {
    _currentFile = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
    _currentMeta = { ...meta, fileName };

    if (!_overlayShare) _overlayShare = makeOverlay();
    const contacts = loadContacts();
    const canNativeShare = !!(navigator.canShare && navigator.canShare({ files: [_currentFile] }));

    const contactOptsHtml = contacts.length
      ? contacts.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)} — ${ROL_LABELS[c.rol]||'(sin rol)'}${c.interno?' · interno':''}</option>`).join('')
      : '';

    _overlayShare.innerHTML = `
      <div class="ss-modal">
        <h3 class="ss-h">📤 COMPARTIR INFORME</h3>
        <div class="ss-sub">📄 ${escapeHtml(fileName)}</div>

        ${canNativeShare ? `
          <div class="ss-ok-box">
            <b>✨ Auto-adjunto disponible:</b> tu navegador soporta <b>Compartir archivo</b>. Ese bot&oacute;n abre el panel nativo del sistema y eleg&iacute;s WhatsApp, Outlook, Gmail o Mail — el Excel se adjunta <b>autom&aacute;ticamente</b>, sin pasos manuales.
          </div>` : `
          <div class="ss-warn">
            Tu navegador no soporta compartir archivos directo. Los botones de <b>Email</b> y <b>WhatsApp</b> abren el cliente con el mensaje prearmado; adjunt&aacute; el archivo desde la carpeta <b>Descargas</b> usando el &iacute;cono 📎 (1 clic).
          </div>`}

        <label class="ss-label">Destinatario</label>
        <select id="ss-contact-sel" class="ss-select">
          <option value="">— Elegir contacto —</option>
          ${contactOptsHtml}
          <option value="__new__">+ Crear contacto nuevo…</option>
          <option value="__none__">Enviar sin contacto guardado (escribir manualmente)</option>
        </select>

        <div id="ss-contact-detail" style="margin-top:10px; display:none;"></div>

        <label class="ss-label">Previsualización del mensaje</label>
        <div class="ss-preview-tabs">
          <button class="ss-preview-tab active" data-ch="email">📧 Email</button>
          <button class="ss-preview-tab" data-ch="whatsapp">💬 WhatsApp</button>
        </div>
        <div class="ss-preview" id="ss-preview">Elegí un contacto para ver el mensaje…</div>

        <div class="ss-actions">
          <button class="ss-btn ss-btn-secondary" id="ss-cancel">Solo descargar (cerrar)</button>
          <button class="ss-btn ss-btn-email" id="ss-email" disabled>📧 Email</button>
          <button class="ss-btn ss-btn-wa" id="ss-wa" disabled>💬 WhatsApp</button>
          ${canNativeShare ? '<button class="ss-btn ss-btn-share ss-btn-primary-action" id="ss-native">📱 Compartir archivo <span class="ss-badge-rec">Recomendado</span></button>' : ''}
        </div>

        <div style="margin-top:18px; padding-top:12px; border-top:1px solid rgba(30,58,138,.3); display:flex; justify-content:space-between; align-items:center;">
          <button class="ss-btn ss-btn-secondary" id="ss-manage">⚙️ Gestionar libreta</button>
          <button class="ss-btn ss-btn-secondary" id="ss-view-audit">🔍 Historial de envíos</button>
        </div>
      </div>`;

    _overlayShare.classList.add('open');

    const sel = _overlayShare.querySelector('#ss-contact-sel');
    const detail = _overlayShare.querySelector('#ss-contact-detail');
    const preview = _overlayShare.querySelector('#ss-preview');
    const btnEmail = _overlayShare.querySelector('#ss-email');
    const btnWa = _overlayShare.querySelector('#ss-wa');
    const btnNative = _overlayShare.querySelector('#ss-native');

    let currentContact = null;
    function refreshPreview() {
      if (!currentContact) { preview.textContent = 'Elegí un contacto para ver el mensaje…'; return; }
      if (_currentChannel === 'email') {
        const { subject, body } = buildMessage(currentContact, _currentMeta, 'email');
        preview.textContent = 'Asunto: ' + subject + '\n\n' + body;
      } else {
        const { text } = buildMessage(currentContact, _currentMeta, 'whatsapp');
        preview.textContent = text;
      }
    }
    function refreshButtons() {
      btnEmail.disabled = !(currentContact && currentContact.email);
      btnWa.disabled    = !(currentContact && currentContact.whatsapp);
    }
    function refreshDetail() {
      if (!currentContact) { detail.style.display = 'none'; return; }
      detail.style.display = 'block';
      const color = ROL_COLORS[currentContact.rol] || '#94A3B8';
      detail.innerHTML = `<div style="background:rgba(10,15,20,.5); border-left:3px solid ${color}; border-radius:6px; padding:9px 12px; font-size:11px; color:#CBD5E1;">
        <b style="color:${color}; letter-spacing:1px;">${ROL_LABELS[currentContact.rol]||''}</b><br/>
        ${currentContact.email ? '📧 '+escapeHtml(currentContact.email)+'<br/>' : ''}
        ${currentContact.whatsapp ? '💬 '+escapeHtml(currentContact.whatsapp)+'<br/>' : ''}
        ${currentContact.interno ? '<span class="ss-chip">Interno autorizado</span>' : '<span class="ss-chip" style="background:rgba(248,113,113,.18); color:#f87171;">No interno — evitar PII</span>'}
      </div>`;
      // Auto-seleccionar canal preferido
      if (currentContact.canal && currentContact.canal !== 'ambos') {
        _currentChannel = currentContact.canal;
        _overlayShare.querySelectorAll('.ss-preview-tab').forEach(t => t.classList.toggle('active', t.dataset.ch === _currentChannel));
      }
    }

    sel.addEventListener('change', () => {
      const v = sel.value;
      if (v === '__new__') {
        _overlayShare.classList.remove('open');
        showContactsManager(() => { showShareDialog(blob, fileName, meta); });
        return;
      }
      if (v === '__none__') {
        // manual: usar contacto genérico vacío
        currentContact = { nombre:'', rol:'supervisor', email:'', whatsapp:'', interno:false };
      } else if (v) {
        currentContact = loadContacts().find(c => c.id === v) || null;
      } else {
        currentContact = null;
      }
      refreshDetail(); refreshPreview(); refreshButtons();
    });

    _overlayShare.querySelectorAll('.ss-preview-tab').forEach(t => {
      t.addEventListener('click', () => {
        _overlayShare.querySelectorAll('.ss-preview-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        _currentChannel = t.dataset.ch;
        refreshPreview();
      });
    });

    btnEmail.addEventListener('click', async () => {
      if (!currentContact) return;
      if (!currentContact.email) {
        const em = prompt('Email del destinatario:');
        if (!em) return;
        currentContact = { ...currentContact, email: em };
      }
      await openEmail(currentContact, _currentMeta, _currentFile);
      _overlayShare.classList.remove('open');
    });
    btnWa.addEventListener('click', async () => {
      if (!currentContact) return;
      if (!currentContact.whatsapp) {
        const wa = prompt('WhatsApp del destinatario (con código país, ej: 5492616123456):');
        if (!wa) return;
        currentContact = { ...currentContact, whatsapp: wa };
      }
      await openWhatsApp(currentContact, _currentMeta, _currentFile);
      _overlayShare.classList.remove('open');
    });
    if (btnNative) btnNative.addEventListener('click', async () => {
      const ok = await shareNative(_currentFile, currentContact, _currentMeta);
      if (ok) _overlayShare.classList.remove('open');
    });
    _overlayShare.querySelector('#ss-cancel').addEventListener('click', () => _overlayShare.classList.remove('open'));
    _overlayShare.querySelector('#ss-manage').addEventListener('click', () => {
      _overlayShare.classList.remove('open');
      showContactsManager(() => showShareDialog(blob, fileName, meta));
    });
    _overlayShare.querySelector('#ss-view-audit').addEventListener('click', () => {
      _overlayShare.classList.remove('open');
      showAuditLog(() => showShareDialog(blob, fileName, meta));
    });
  }

  /* ═════════════════════════════════════════
     MODAL 2: GESTIÓN DE LIBRETA
     ═════════════════════════════════════════ */
  let _overlayContacts = null;
  function showContactsManager(onClose) {
    if (!_overlayContacts) _overlayContacts = makeOverlay();
    renderContactsList(onClose);
    _overlayContacts.classList.add('open');
  }
  function renderContactsList(onClose) {
    const contacts = loadContacts();
    const rowsHtml = contacts.length
      ? contacts.map(c => {
          const color = ROL_COLORS[c.rol] || '#94A3B8';
          return `<div class="ss-contact-row">
            <div class="ss-contact-info">
              <div class="ss-contact-name">${escapeHtml(c.nombre)}
                <span class="ss-contact-tag" style="background:${color}22; color:${color};">${ROL_LABELS[c.rol]||''}</span>
                ${c.interno ? '<span class="ss-contact-tag" style="background:rgba(34,219,174,.18); color:#22DBAE;">Interno</span>' : ''}
              </div>
              <div class="ss-contact-meta">
                ${c.cargo ? escapeHtml(c.cargo)+' · ' : ''}
                ${c.email ? '📧 '+escapeHtml(c.email)+' · ' : ''}
                ${c.whatsapp ? '💬 '+escapeHtml(c.whatsapp) : ''}
              </div>
            </div>
            <div class="ss-contact-actions">
              <button class="ss-icon-btn" data-id="${c.id}" data-act="edit" title="Editar">✏️</button>
              <button class="ss-icon-btn" data-id="${c.id}" data-act="delete" title="Eliminar">🗑</button>
            </div>
          </div>`;
        }).join('')
      : '<div class="ss-empty">No tenés contactos guardados todavía.<br/>Agregá el primero con el botón de abajo.</div>';

    _overlayContacts.innerHTML = `
      <div class="ss-modal large">
        <h3 class="ss-h">📇 LIBRETA DE CONTACTOS</h3>
        <div class="ss-sub">Gestioná destinatarios para distribución de informes por email o WhatsApp.</div>
        <div style="background:rgba(10,15,20,.5); border:1px solid rgba(30,58,138,.3); border-radius:8px; max-height:360px; overflow:auto;">
          ${rowsHtml}
        </div>
        <div class="ss-actions">
          <button class="ss-btn ss-btn-secondary" id="sc-close">Cerrar</button>
          <button class="ss-btn ss-btn-primary" id="sc-new">+ Nuevo contacto</button>
        </div>
      </div>`;

    _overlayContacts.querySelectorAll('.ss-icon-btn').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.id, act = b.dataset.act;
      if (act === 'edit')   renderContactForm(id, onClose);
      else if (act === 'delete' && confirm('¿Eliminar este contacto?')) {
        saveContacts(loadContacts().filter(x => x.id !== id));
        renderContactsList(onClose);
      }
    }));
    _overlayContacts.querySelector('#sc-new').addEventListener('click', () => renderContactForm(null, onClose));
    _overlayContacts.querySelector('#sc-close').addEventListener('click', () => {
      _overlayContacts.classList.remove('open');
      if (typeof onClose === 'function') onClose();
    });
  }
  function renderContactForm(id, onClose) {
    const contacts = loadContacts();
    const c = id ? contacts.find(x => x.id === id) : { id: uuid(), nombre:'', cargo:'', rol:'supervisor', email:'', whatsapp:'', canal:'ambos', sede:'', interno:true };
    _overlayContacts.innerHTML = `
      <div class="ss-modal">
        <h3 class="ss-h">${id ? '✏️ EDITAR CONTACTO' : '➕ NUEVO CONTACTO'}</h3>
        <div class="ss-sub">Completá los datos del destinatario.</div>

        <label class="ss-label">Nombre completo</label>
        <input class="ss-input" id="cf-nombre" placeholder="Ej: Dr. Juan García" value="${escapeAttr(c.nombre)}"/>

        <div class="ss-field-row">
          <div>
            <label class="ss-label">Cargo / Función</label>
            <input class="ss-input" id="cf-cargo" placeholder="Ej: Director Médico" value="${escapeAttr(c.cargo)}"/>
          </div>
          <div>
            <label class="ss-label">Rol</label>
            <select class="ss-select" id="cf-rol">
              ${Object.entries(ROL_LABELS).map(([k,v]) => `<option value="${k}"${c.rol===k?' selected':''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>

        <label class="ss-label">Email</label>
        <input class="ss-input" id="cf-email" type="email" placeholder="correo@hospital.com" value="${escapeAttr(c.email)}"/>

        <label class="ss-label">WhatsApp (con código país, sin +)</label>
        <input class="ss-input" id="cf-wa" type="tel" placeholder="Ej: 5492616123456" value="${escapeAttr(c.whatsapp)}"/>

        <div class="ss-field-row">
          <div>
            <label class="ss-label">Canal preferido</label>
            <select class="ss-select" id="cf-canal">
              <option value="ambos"${c.canal==='ambos'?' selected':''}>Ambos</option>
              <option value="email"${c.canal==='email'?' selected':''}>Email</option>
              <option value="whatsapp"${c.canal==='whatsapp'?' selected':''}>WhatsApp</option>
            </select>
          </div>
          <div>
            <label class="ss-label">Sede (opcional)</label>
            <input class="ss-input" id="cf-sede" placeholder="Ej: Italiano · COIR · Todas" value="${escapeAttr(c.sede)}"/>
          </div>
        </div>

        <label class="ss-checkbox">
          <input type="checkbox" id="cf-interno" ${c.interno?'checked':''}/>
          <span>Personal interno del hospital autorizado para recibir información confidencial</span>
        </label>

        <div class="ss-warn" style="margin-top:12px;">
          <b>Privacidad:</b> marcá "Interno autorizado" únicamente si la persona tiene un rol institucional formal y está habilitada para recibir información con datos de pacientes. Destinatarios externos solo deberían recibir agregados anónimos.
        </div>

        <div class="ss-actions">
          <button class="ss-btn ss-btn-secondary" id="cf-cancel">Cancelar</button>
          <button class="ss-btn ss-btn-primary" id="cf-save">${id?'Guardar cambios':'Crear contacto'}</button>
        </div>
      </div>`;

    _overlayContacts.querySelector('#cf-cancel').addEventListener('click', () => renderContactsList(onClose));
    _overlayContacts.querySelector('#cf-save').addEventListener('click', () => {
      const nombre = _overlayContacts.querySelector('#cf-nombre').value.trim();
      if (!nombre) { alert('El nombre es obligatorio.'); return; }
      const upd = {
        id: c.id,
        nombre,
        cargo:    _overlayContacts.querySelector('#cf-cargo').value.trim(),
        rol:      _overlayContacts.querySelector('#cf-rol').value,
        email:    _overlayContacts.querySelector('#cf-email').value.trim(),
        whatsapp: _overlayContacts.querySelector('#cf-wa').value.trim(),
        canal:    _overlayContacts.querySelector('#cf-canal').value,
        sede:     _overlayContacts.querySelector('#cf-sede').value.trim(),
        interno:  _overlayContacts.querySelector('#cf-interno').checked,
        updatedAt: Date.now()
      };
      if (!upd.email && !upd.whatsapp) { alert('Ingresá al menos un email o un WhatsApp.'); return; }
      const list = loadContacts();
      const idx = list.findIndex(x => x.id === c.id);
      if (idx >= 0) list[idx] = upd; else list.push({ ...upd, createdAt: Date.now() });
      saveContacts(list);
      renderContactsList(onClose);
    });
  }

  /* ═════════════════════════════════════════
     MODAL 3: AUDIT LOG
     ═════════════════════════════════════════ */
  let _overlayAudit = null;
  function showAuditLog(onClose) {
    if (!_overlayAudit) _overlayAudit = makeOverlay();
    const entries = loadAudit();
    const rowsHtml = entries.length
      ? entries.map(e => {
          const d = new Date(e.ts).toLocaleString('es-AR');
          return `<div class="ss-audit-row">
            <div class="info">
              <div><b>${escapeHtml(e.contactName||'(sin contacto)')}</b> <span class="ss-audit-ch ${e.kind}">${e.kind}</span></div>
              <div style="color:#94A3B8; font-size:11px; margin-top:2px;">${escapeHtml((e.meta&&e.meta.titulo)||e.meta&&e.meta.fileName||'—')}</div>
              <div class="ts">${d}</div>
            </div>
          </div>`;
        }).join('')
      : '<div class="ss-empty">Todavía no enviaste nada.</div>';

    _overlayAudit.innerHTML = `
      <div class="ss-modal large">
        <h3 class="ss-h">🔍 HISTORIAL DE ENVÍOS</h3>
        <div class="ss-sub">Últimos ${AUDIT_MAX} envíos. Guardado localmente — no viaja a ningún servidor.</div>
        <div style="background:rgba(10,15,20,.5); border:1px solid rgba(30,58,138,.3); border-radius:8px; max-height:380px; overflow:auto; padding:4px 12px;">
          ${rowsHtml}
        </div>
        <div class="ss-actions">
          <button class="ss-btn ss-btn-danger" id="sa-clear">Limpiar historial</button>
          <button class="ss-btn ss-btn-secondary" id="sa-close">Cerrar</button>
        </div>
      </div>`;
    _overlayAudit.querySelector('#sa-close').addEventListener('click', () => {
      _overlayAudit.classList.remove('open');
      if (typeof onClose === 'function') onClose();
    });
    _overlayAudit.querySelector('#sa-clear').addEventListener('click', () => {
      if (confirm('¿Eliminar todo el historial local de envíos?')) {
        clearAudit(); showAuditLog(onClose);
      }
    });
    _overlayAudit.classList.add('open');
  }

  /* ───────── HELPERS ───────── */
  function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
  function escapeAttr(s) { return escapeHtml(s); }

  /* ───────── BOTÓN FLOTANTE DE ACCESO RÁPIDO ───────── */
  // Solo se muestra si hay sesión activa (igual que chatbot).
  function hasActiveSession() {
    try {
      const s = JSON.parse(localStorage.getItem('spcd_session') || 'null');
      if (!s || !s.user || !s.ts) return false;
      if (Date.now() - s.ts >= 8*60*60*1000) return false;
      return true;
    } catch { return false; }
  }

  const fabCss = `
    #ss-fab { position:fixed; bottom:20px; left:20px; z-index:9997; display:none; align-items:center; gap:8px; }
    #ss-fab.visible { display:inline-flex; }
    #ss-fab-btn { width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg,#1E3A8A,#22DBAE); border:none; color:#0F172A; font-size:18px; cursor:pointer; box-shadow:0 6px 20px rgba(34,219,174,.35); transition:transform .2s, box-shadow .2s; }
    #ss-fab-btn:hover { transform:translateY(-2px) scale(1.06); box-shadow:0 10px 30px rgba(34,219,174,.55); }
    #ss-fab-menu { display:none; flex-direction:column; background:#0F172A; border:1px solid rgba(34,219,174,.3); border-radius:10px; padding:6px; box-shadow:0 10px 30px rgba(0,0,0,.5); }
    #ss-fab.open #ss-fab-menu { display:flex; }
    #ss-fab-menu button { background:transparent; border:none; color:#E2E8F0; padding:9px 14px; text-align:left; font-size:12px; cursor:pointer; border-radius:6px; font-family:inherit; letter-spacing:.5px; }
    #ss-fab-menu button:hover { background:rgba(34,219,174,.12); color:#22DBAE; }
  `;
  const fabStyle = document.createElement('style');
  fabStyle.textContent = fabCss;
  document.head.appendChild(fabStyle);

  const fab = document.createElement('div');
  fab.id = 'ss-fab';
  fab.innerHTML = `
    <button id="ss-fab-btn" title="Distribución y contactos">📇</button>
    <div id="ss-fab-menu">
      <button data-act="contacts">📇 Libreta de contactos</button>
      <button data-act="audit">🔍 Historial de env&iacute;os</button>
    </div>`;
  document.body.appendChild(fab);

  const fabBtn = document.getElementById('ss-fab-btn');
  fabBtn.addEventListener('click', () => fab.classList.toggle('open'));
  fab.querySelectorAll('#ss-fab-menu button').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    fab.classList.remove('open');
    if (act === 'contacts') showContactsManager();
    else if (act === 'audit') showAuditLog();
  }));
  document.addEventListener('click', e => {
    if (!fab.contains(e.target)) fab.classList.remove('open');
  });

  function updateFabVisibility() {
    fab.classList.toggle('visible', hasActiveSession());
  }
  updateFabVisibility();
  setInterval(updateFabVisibility, 2000);
  window.addEventListener('storage', e => {
    if (e.key === 'spcd_session' || e.key === null) updateFabVisibility();
  });

  /* ───────── API PÚBLICA ───────── */
  window.SpcdShare = {
    showShareDialog,
    showContactsManager,
    showAuditLog,
    getContacts: loadContacts,
    getAuditLog: loadAudit,
    openEmail,
    openWhatsApp,
    shareNative
  };
})();
