const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(customFetch, options = {}) {
  const storage = {};
  const localStorage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem(key, value) { storage[key] = String(value); },
    removeItem(key) { delete storage[key]; },
  };
  const sessionStorage = {
    getItem(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem(key, value) { storage[key] = String(value); },
    removeItem(key) { delete storage[key]; },
  };

  const fetchCalls = [];
  const fetch = (url, options = {}) => {
    fetchCalls.push({ url, options });
    if (typeof customFetch === 'function') {
      return customFetch(url, options, fetchCalls);
    }
    const pathName = new URL(url, 'http://localhost').pathname;

    if (pathName === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, user: { id: 'u1', name: 'Staff', email: 'staff@example.com', role: 'staff' } }),
      });
    }

    if (pathName === '/api/auth/login') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ok: true, token: 'token-123', user: { id: 'u1', name: 'Staff', email: 'staff@example.com', role: 'staff' } }),
      });
    }

    if (pathName === '/api/dogs') {
      const authHeader = options.headers && options.headers.Authorization;
      const dogs = authHeader ? [{ id: 'd1', name: 'Buddy', breed: 'Labrador' }] : [];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(dogs),
      });
    }

    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
  };

  const context = {
    window: { location: Object.assign({ hostname: 'localhost', protocol: 'http:', port: '', origin: 'http://localhost' }, options.location || {}) },
    localStorage,
    sessionStorage,
    fetch,
    console,
    setTimeout,
    clearTimeout,
    URL,
  };
  context.global = context;
  context.globalThis = context;

  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'data.js' });
  context.KennelData = vm.runInContext('KennelData', context);

  return { context, fetchCalls, localStorage, sessionStorage };
}

test('login refreshes dog data from the server after initial unauthenticated sync', async () => {
  const { context } = createHarness();
  context.KennelData.init();
  await Promise.resolve();
  await Promise.resolve();

  const result = await context.KennelData.loginUser('staff@example.com', 'secret', false);
  assert.equal(result.ok, true);
  assert.equal(context.KennelData.getDogs().length, 1);
  assert.equal(context.KennelData.getDogs()[0].name, 'Buddy');
});

test('init clears stale signed-in state when no auth token is available', async () => {
  const { context, localStorage } = createHarness();
  localStorage.setItem('kennelpro_data', JSON.stringify({
    _version: 12,
    dogs: [],
    puppies: [],
    activities: [],
    events: [],
    finance: [],
    dailyReports: [],
    users: [],
    pendingApprovals: [],
    currentUser: { id: 'u1', name: 'Staff', email: 'staff@example.com', role: 'staff' }
  }));

  context.KennelData.init();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(context.KennelData.isAuthenticated(), false);
  assert.equal(context.KennelData.getServerState().status, 'auth');
});

test('api base uses the current host on port 8001 for non-backend page ports', async () => {
  const { context } = createHarness(null, {
    location: {
      hostname: '192.168.100.32',
      protocol: 'http:',
      port: '5500',
      origin: 'http://192.168.100.32:5500'
    }
  });

  assert.equal(context.KennelData.apiBase, 'http://192.168.100.32:8001/api');
});

test('api base uses the current origin for hosted deployments without an explicit port', async () => {
  const { context } = createHarness(null, {
    location: {
      hostname: 'bigpaw-kennel.onrender.com',
      protocol: 'https:',
      port: '',
      origin: 'https://bigpaw-kennel.onrender.com'
    }
  });

  assert.equal(context.KennelData.apiBase, 'https://bigpaw-kennel.onrender.com/api');
});
