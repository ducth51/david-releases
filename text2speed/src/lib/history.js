/**
 * Lịch sử audio đã tạo, lưu trong IndexedDB (Blob không lưu được ở localStorage).
 */
const DB_NAME = 'nghitts'
const STORE = 'history'
const MAX_ITEMS = 50

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db, mode) {
  return db.transaction(STORE, mode).objectStore(STORE)
}

export async function addHistory(entry) {
  const db = await openDb()
  const record = { id: crypto.randomUUID(), createdAt: Date.now(), ...entry }
  await new Promise((resolve, reject) => {
    const r = tx(db, 'readwrite').put(record)
    r.onsuccess = resolve
    r.onerror = () => reject(r.error)
  })
  await trim(db)
  return record
}

export async function listHistory() {
  const db = await openDb()
  const items = await new Promise((resolve, reject) => {
    const r = tx(db, 'readonly').getAll()
    r.onsuccess = () => resolve(r.result || [])
    r.onerror = () => reject(r.error)
  })
  return items.sort((a, b) => b.createdAt - a.createdAt)
}

export async function removeHistory(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const r = tx(db, 'readwrite').delete(id)
    r.onsuccess = resolve
    r.onerror = () => reject(r.error)
  })
}

export async function clearHistory() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const r = tx(db, 'readwrite').clear()
    r.onsuccess = resolve
    r.onerror = () => reject(r.error)
  })
}

/** Giữ tối đa MAX_ITEMS bản ghi gần nhất. */
async function trim(db) {
  const items = await new Promise((resolve) => {
    const r = tx(db, 'readonly').getAll()
    r.onsuccess = () => resolve(r.result || [])
    r.onerror = () => resolve([])
  })
  if (items.length <= MAX_ITEMS) return
  const store = tx(db, 'readwrite')
  items
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(MAX_ITEMS)
    .forEach((item) => store.delete(item.id))
}
