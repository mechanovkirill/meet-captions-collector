// idb.js — tiny IndexedDB wrapper (extension origin). Shared by the service
// worker and the side panel; both run on the chrome-extension:// origin, so
// they see the same database.

const DB_NAME = 'meet-captions';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('lines')) {
        const s = db.createObjectStore('lines', { keyPath: ['meetingId', 'lineId'] });
        s.createIndex('byMeeting', 'meetingId', { unique: false });
      }
      if (!db.objectStoreNames.contains('meetings')) {
        db.createObjectStore('meetings', { keyPath: 'meetingId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqP(request) {
  return new Promise((res, rej) => {
    request.onsuccess = () => res(request.result);
    request.onerror = () => rej(request.error);
  });
}

function store(db, name, mode) {
  return db.transaction(name, mode).objectStore(name);
}

export async function upsertLine(line) {
  const db = await openDb();
  try {
    await reqP(store(db, 'lines', 'readwrite').put({
      meetingId: line.meetingId,
      lineId: line.lineId,
      order: line.order,
      speaker: line.speaker || '',
      text: line.text || '',
      ts: line.ts,
    }));
  } finally {
    db.close();
  }
}

export async function upsertMeeting(m) {
  const db = await openDb();
  try {
    const s = store(db, 'meetings', 'readwrite');
    const existing = await reqP(s.get(m.meetingId));
    await reqP(s.put({
      meetingId: m.meetingId,
      title: m.title || (existing && existing.title) || m.meetingId,
      startedAt: (existing && existing.startedAt) || m.updatedAt,
      updatedAt: m.updatedAt,
    }));
  } finally {
    db.close();
  }
}

export async function getLines(meetingId) {
  const db = await openDb();
  try {
    const idx = store(db, 'lines', 'readonly').index('byMeeting');
    const rows = await reqP(idx.getAll(meetingId));
    return rows.sort((a, b) => a.order - b.order);
  } finally {
    db.close();
  }
}

export async function listMeetings() {
  const db = await openDb();
  try {
    const rows = await reqP(store(db, 'meetings', 'readonly').getAll());
    return rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } finally {
    db.close();
  }
}

export async function clearMeeting(meetingId) {
  const db = await openDb();
  try {
    const t = db.transaction(['lines', 'meetings'], 'readwrite');
    const idx = t.objectStore('lines').index('byMeeting');
    await new Promise((res, rej) => {
      const cur = idx.openCursor(IDBKeyRange.only(meetingId));
      cur.onsuccess = () => {
        const c = cur.result;
        if (c) { c.delete(); c.continue(); } else res();
      };
      cur.onerror = () => rej(cur.error);
    });
    await reqP(t.objectStore('meetings').delete(meetingId));
  } finally {
    db.close();
  }
}
