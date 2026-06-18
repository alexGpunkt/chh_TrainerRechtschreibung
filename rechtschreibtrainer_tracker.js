/** KlassenMonitor – Tracker für Rechtschreibtrainer v1 */
const SUPABASE_URL  = 'https://sntbedutlztfsyzlxqfl.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_nWFLSFS56Pg6QLeCz1IC1Q_3P7KqD80';
const APP_NAME      = 'Rechtschreibtrainer';
const STUDENT_NAME_PROMPT = false;
const PING_INTERVAL_MS = 30000;
const LEAVE_DELAY_MS = 5000;

(function () {
  'use strict';

  const STORAGE_CLIENT_ID = 'km_client_id';
  const STORAGE_NAME = 'km_student_name';
  let leaveTimer = null;

  function authHeaders(extra = {}) {
    const h = {
      apikey: SUPABASE_KEY,
      Accept: 'application/json',
      ...extra
    };

    if (String(SUPABASE_KEY).startsWith('eyJ')) {
      h.Authorization = `Bearer ${SUPABASE_KEY}`;
    }

    return h;
  }

  function slugify(t) {
    return String(t)
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function createId() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'id_' + Math.random().toString(36).slice(2) + '_' + Date.now();
  }

  let CLIENT_ID = localStorage.getItem(STORAGE_CLIENT_ID);

  if (!CLIENT_ID) {
    CLIENT_ID = createId();
    localStorage.setItem(STORAGE_CLIENT_ID, CLIENT_ID);
  }

  const SESSION_ID = 'sess_' + slugify(APP_NAME) + '_' + CLIENT_ID;

  let studentName = (
    window.KM_STUDENT_NAME ||
    localStorage.getItem(STORAGE_NAME) ||
    ''
  ).trim();

  if ((!studentName || studentName.length < 2) && STUDENT_NAME_PROMPT) {
    while (!studentName || studentName.length < 2) {
      studentName = (prompt('Gib deinen Namen oder dein Kürzel ein:') || '').trim();
    }

    localStorage.setItem(STORAGE_NAME, studentName);
    window.KM_STUDENT_NAME = studentName;
  }

  async function sendPing(action = 'ping') {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }

    studentName = (
      window.KM_STUDENT_NAME ||
      studentName ||
      localStorage.getItem(STORAGE_NAME) ||
      ''
    ).trim();

    const url = `${SUPABASE_URL}/rest/v1/active_sessions?on_conflict=session_id`;

    const body = {
      session_id: SESSION_ID,
      client_id: CLIENT_ID,
      app_name: APP_NAME,
      student_name: studentName || null,
      last_seen: new Date().toISOString(),
      action: String(action).slice(0, 240)
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders({
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        }),
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        console.error(
          '[KlassenMonitor]',
          res.status,
          await res.text().catch(() => '')
        );
      }
    } catch (e) {
      console.error('[KlassenMonitor] Ping-Fehler:', e);
    }
  }

  async function sendLeave() {
    const url = `${SUPABASE_URL}/rest/v1/active_sessions?session_id=eq.${encodeURIComponent(SESSION_ID)}`;

    try {
      await fetch(url, {
        method: 'PATCH',
        headers: authHeaders({
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }),
        body: JSON.stringify({
          last_seen: '2000-01-01T00:00:00Z',
          action: 'leave'
        }),
        keepalive: true
      });
    } catch (e) {
      // bewusst still: Beim Schließen der Seite kann der Request abbrechen.
    }
  }

  window.KM_TRACK_EVENT = (action) => sendPing(action);

  window.KM_SET_STUDENT = (name) => {
    studentName = String(name || '').trim();
    window.KM_STUDENT_NAME = studentName;

    if (studentName) {
      localStorage.setItem(STORAGE_NAME, studentName);
    }

    sendPing('student|set');
  };

  sendPing('start');

  const intervalId = setInterval(() => {
    if (!document.hidden) {
      sendPing('ping');
    }
  }, PING_INTERVAL_MS);

  window.addEventListener('beforeunload', () => {
    if (leaveTimer) clearTimeout(leaveTimer);
    sendLeave();
    clearInterval(intervalId);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (leaveTimer) clearTimeout(leaveTimer);

      leaveTimer = setTimeout(() => {
        leaveTimer = null;
        sendLeave();
      }, LEAVE_DELAY_MS);
    } else {
      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }

      sendPing('ping');
    }
  });

  console.log(
    `[KlassenMonitor] Tracker aktiv → App: "${APP_NAME}" | Schüler: "${studentName || '—'}" | Client: ${CLIENT_ID}`
  );
})();