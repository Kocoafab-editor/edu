(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.RobodogFaceStorage = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const MATRIX_SIZE = 8;
  const STORAGE_KEY = 'robodog-face.examples.v1';
  const DB_NAME = 'robodogFaceDb';
  const STORE_NAME = 'examples';
  const RECORD_KEY = 'examples';

  function createEmptyMatrix() {
    return Array.from({ length: MATRIX_SIZE }, function () {
      return Array(MATRIX_SIZE).fill(0);
    });
  }

  function normalizeName(name) {
    return String(name == null ? '' : name).trim();
  }

  function normalizeCell(value) {
    return value ? 1 : 0;
  }

  function normalizeMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    return Array.from({ length: MATRIX_SIZE }, function (_, rowIndex) {
      const sourceRow = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      return Array.from({ length: MATRIX_SIZE }, function (_, columnIndex) {
        return normalizeCell(sourceRow[columnIndex]);
      });
    });
  }

  function cloneMatrix(matrix) {
    return normalizeMatrix(matrix).map(function (row) {
      return row.slice();
    });
  }

  function normalizeTimestamp(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function createExampleId(name, nowValue) {
    const safe = normalizeName(name).toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-+|-+$/g, '');
    return (safe || 'example') + '-' + String(nowValue);
  }

  function normalizeExample(example, fallback) {
    const base = fallback || {};
    const time = Date.now();
    const createdAt = normalizeTimestamp(example && example.createdAt, normalizeTimestamp(base.createdAt, time));
    const updatedAt = normalizeTimestamp(example && example.updatedAt, normalizeTimestamp(base.updatedAt, createdAt));
    return {
      id: (example && example.id) || base.id || createExampleId((example && example.name) || base.name || 'example', updatedAt),
      name: normalizeName((example && example.name) || base.name || ''),
      left: cloneMatrix((example && example.left) || base.left || createEmptyMatrix()),
      right: cloneMatrix((example && example.right) || base.right || createEmptyMatrix()),
      createdAt: createdAt,
      updatedAt: updatedAt,
      builtin: Boolean((example && example.builtin) || base.builtin),
      stored: Boolean((example && example.stored) || base.stored),
      overridden: Boolean((example && example.overridden) || base.overridden),
    };
  }

  function sortExamples(examples) {
    return examples.slice().sort(function (left, right) {
      if (left.updatedAt !== right.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return left.name.localeCompare(right.name, 'ko');
    });
  }

  function mergeBuiltInExamples(builtInExamples, storedExamples) {
    const builtIns = Array.isArray(builtInExamples) ? builtInExamples : [];
    const stored = Array.isArray(storedExamples) ? storedExamples : [];
    const storedByName = new Map();

    stored.forEach(function (example) {
      const normalized = normalizeExample(example, { stored: true });
      if (!normalized.name) {
        return;
      }
      storedByName.set(normalized.name, normalized);
    });

    const merged = builtIns.map(function (example) {
      const builtIn = normalizeExample(example, { builtin: true, stored: false, overridden: false });
      const storedMatch = storedByName.get(builtIn.name);
      if (!storedMatch) {
        return Object.assign({}, builtIn, {
          builtin: true,
          stored: false,
          overridden: false,
        });
      }
      storedByName.delete(builtIn.name);
      return Object.assign({}, builtIn, storedMatch, {
        builtin: true,
        stored: true,
        overridden: true,
      });
    });

    storedByName.forEach(function (example) {
      merged.push(Object.assign({}, example, {
        builtin: false,
        stored: true,
        overridden: false,
      }));
    });

    return sortExamples(merged);
  }

  function createMemoryAdapter() {
    let value = null;
    return {
      init: async function () {},
      get: async function () {
        return value;
      },
      set: async function (nextValue) {
        value = String(nextValue);
      },
      remove: async function () {
        value = null;
      },
      getMode: function () {
        return 'memory';
      },
    };
  }

  function createLocalStorageAdapter(localStorageRef, key) {
    if (!localStorageRef) {
      return null;
    }
    return {
      init: async function () {},
      get: async function () {
        try {
          return localStorageRef.getItem(key);
        } catch (error) {
          return null;
        }
      },
      set: async function (nextValue) {
        localStorageRef.setItem(key, String(nextValue));
      },
      remove: async function () {
        localStorageRef.removeItem(key);
      },
      getMode: function () {
        return 'localStorage';
      },
    };
  }

  function openIndexedDb(indexedDbRef) {
    return new Promise(function (resolve, reject) {
      const request = indexedDbRef.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  function createIndexedDbAdapter(indexedDbRef) {
    if (!indexedDbRef) {
      return null;
    }

    let dbPromise = null;

    function getDb() {
      if (!dbPromise) {
        dbPromise = openIndexedDb(indexedDbRef);
      }
      return dbPromise;
    }

    return {
      init: async function () {
        await getDb();
      },
      get: async function () {
        const db = await getDb();
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(RECORD_KEY);
          request.onsuccess = function () {
            resolve(request.result == null ? null : request.result);
          };
          request.onerror = function () {
            reject(request.error || new Error('Failed to read IndexedDB data'));
          };
        });
      },
      set: async function (nextValue) {
        const db = await getDb();
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(String(nextValue), RECORD_KEY);
          request.onsuccess = function () {
            resolve();
          };
          request.onerror = function () {
            reject(request.error || new Error('Failed to write IndexedDB data'));
          };
        });
      },
      remove: async function () {
        const db = await getDb();
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(RECORD_KEY);
          request.onsuccess = function () {
            resolve();
          };
          request.onerror = function () {
            reject(request.error || new Error('Failed to remove IndexedDB data'));
          };
        });
      },
      getMode: function () {
        return 'indexedDB';
      },
    };
  }

  function createStorageAdapter(options) {
    const indexedDbRef = Object.prototype.hasOwnProperty.call(options, 'indexedDB') ? options.indexedDB : root.indexedDB;
    const localStorageRef = Object.prototype.hasOwnProperty.call(options, 'localStorage') ? options.localStorage : root.localStorage;
    const memoryAdapter = createMemoryAdapter();
    const localAdapter = createLocalStorageAdapter(localStorageRef, options.storageKey || STORAGE_KEY);
    const indexedAdapter = createIndexedDbAdapter(indexedDbRef);

    let activeAdapter = localAdapter || memoryAdapter;
    let initialized = false;

    async function ensureReady() {
      if (initialized) {
        return activeAdapter;
      }
      initialized = true;

      if (indexedAdapter) {
        try {
          await indexedAdapter.init();
          activeAdapter = indexedAdapter;
          return activeAdapter;
        } catch (error) {
          activeAdapter = localAdapter || memoryAdapter;
        }
      }

      if (activeAdapter && activeAdapter.init) {
        await activeAdapter.init();
      }
      return activeAdapter;
    }

    return {
      async get() {
        const adapter = await ensureReady();
        return adapter.get();
      },
      async set(value) {
        const adapter = await ensureReady();
        return adapter.set(value);
      },
      async remove() {
        const adapter = await ensureReady();
        return adapter.remove();
      },
      getMode() {
        return activeAdapter.getMode();
      },
      async ready() {
        return ensureReady();
      },
    };
  }

  function parseStoredPayload(rawValue) {
    if (!rawValue) {
      return [];
    }
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function createExampleStorage(options) {
    const builtInExamples = Array.isArray(options && options.builtInExamples) ? options.builtInExamples.slice() : [];
    const now = options && typeof options.now === 'function' ? options.now : function () { return Date.now(); };
    const adapter = createStorageAdapter(options || {});

    async function readStoredExamples() {
      const rawValue = await adapter.get();
      return parseStoredPayload(rawValue).map(function (example) {
        return normalizeExample(example, { stored: true });
      }).filter(function (example) {
        return Boolean(example.name);
      });
    }

    async function writeStoredExamples(examples) {
      const sanitized = examples.map(function (example) {
        const normalized = normalizeExample(example, { stored: true });
        return {
          id: normalized.id,
          name: normalized.name,
          left: normalized.left,
          right: normalized.right,
          createdAt: normalized.createdAt,
          updatedAt: normalized.updatedAt,
        };
      });
      await adapter.set(JSON.stringify(sanitized));
    }

    return {
      async listExamples() {
        const storedExamples = await readStoredExamples();
        return mergeBuiltInExamples(builtInExamples, storedExamples);
      },
      async saveExample(example) {
        const name = normalizeName(example && example.name);
        if (!name) {
          throw new Error('Example name is required');
        }
        const storedExamples = await readStoredExamples();
        const timestamp = now();
        const index = storedExamples.findIndex(function (item) {
          return normalizeName(item.name) === name;
        });
        const previous = index >= 0 ? storedExamples[index] : null;
        const nextRecord = normalizeExample(example, {
          id: previous && previous.id,
          name: name,
          left: example && example.left,
          right: example && example.right,
          createdAt: previous ? previous.createdAt : timestamp,
          updatedAt: timestamp,
          stored: true,
        });
        nextRecord.id = nextRecord.id || createExampleId(name, timestamp);
        nextRecord.createdAt = previous ? previous.createdAt : timestamp;
        nextRecord.updatedAt = timestamp;

        if (index >= 0) {
          storedExamples[index] = nextRecord;
        } else {
          storedExamples.push(nextRecord);
        }

        await writeStoredExamples(storedExamples);
        const merged = mergeBuiltInExamples(builtInExamples, storedExamples);
        return merged.find(function (item) {
          return normalizeName(item.name) === name;
        }) || nextRecord;
      },
      async deleteExample(identifier) {
        const storedExamples = await readStoredExamples();
        const targetId = identifier && typeof identifier === 'object' ? identifier.id : null;
        const targetName = normalizeName(identifier && typeof identifier === 'object' ? identifier.name : identifier);
        const filtered = storedExamples.filter(function (item) {
          if (targetId && item.id === targetId) {
            return false;
          }
          if (targetName && normalizeName(item.name) === targetName) {
            return false;
          }
          return true;
        });
        await writeStoredExamples(filtered);
        return mergeBuiltInExamples(builtInExamples, filtered);
      },
      async resetAll() {
        await adapter.remove();
        return mergeBuiltInExamples(builtInExamples, []);
      },
      getMode() {
        return adapter.getMode();
      },
      ready() {
        return adapter.ready();
      },
    };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    createEmptyMatrix: createEmptyMatrix,
    cloneMatrix: cloneMatrix,
    normalizeMatrix: normalizeMatrix,
    mergeBuiltInExamples: mergeBuiltInExamples,
    createExampleStorage: createExampleStorage,
  };
}));
