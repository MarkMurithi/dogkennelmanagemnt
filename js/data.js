// ===== Data Layer =====
const KennelData = {
    _dogs: [],
    _puppies: [],
    _activities: [],
    _events: [],
    _finance: [],
    _dailyReports: [],
    _users: [],
    _pendingApprovals: [],
    _mySubmissions: [],
    _submissionStatusCache: {},
    _currentUser: null,
    _serverState: { status: 'online', message: '' },
    _listeners: [],
    _pendingWrites: [],
    _isFlushingPendingWrites: false,
    _DATA_VERSION: 13,
    apiBase: (function() {
        if (typeof window === 'undefined' || !window.location) {
            return 'http://127.0.0.1:8001/api';
        }

        const hostname = window.location.hostname || '';
        const protocol = window.location.protocol || '';
        const port = window.location.port || '';

        if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '') {
            return 'http://127.0.0.1:8001/api';
        }

        if (!port || port === '80' || port === '443' || port === '8001') {
            return window.location.origin + '/api';
        }

        return protocol + '//' + hostname + ':8001/api';
    })(),

    init() {
        this._loadPendingWrites();
        this._attachConnectivityHandlers();
        const stored = localStorage.getItem('kennelpro_data');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed._version === this._DATA_VERSION || parsed._version === 12 || parsed._version === 10 || parsed._version === 9) {
                    this._dogs = parsed.dogs || [];
                    this._puppies = parsed.puppies || [];
                    this._activities = parsed.activities || [];
                    this._events = parsed.events || [];
                    this._finance = parsed.finance || [];
                    this._dailyReports = Array.isArray(parsed.dailyReports) ? parsed.dailyReports : [];
                    this._users = Array.isArray(parsed.users) ? parsed.users : [];
                    this._pendingApprovals = Array.isArray(parsed.pendingApprovals) ? parsed.pendingApprovals : [];
                    this._mySubmissions = Array.isArray(parsed.mySubmissions) ? parsed.mySubmissions : [];
                    this._currentUser = parsed.currentUser || this._restoreAuthState();
                } else {
                    this._resetEmptyState();
                }
            } catch (e) {
                this._resetEmptyState();
            }
        } else {
            this._resetEmptyState();
        }
        this._notify();
        if (this._currentUser) {
            this._validateSession().then(function(isValid) {
                if (isValid) {
                    this._syncFromServer();
                    this._primeSubmissionStatusCache();
                    this._flushPendingWrites();
                }
            }.bind(this));
            return;
        }
        this._syncFromServer();
    },

    _buildRequestConfig(options) {
        const headers = { 'Content-Type': 'application/json' };
        const token = this._getStoredToken();
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }

        return Object.assign({
            headers: headers
        }, options || {});
    },

    _requestWithMeta(path, options) {
        const config = this._buildRequestConfig(options);
        return fetch(this.apiBase + path, config).then(function(response) {
            return response.json().catch(function() { return {}; }).then(function(data) {
                return {
                    ok: response.ok,
                    status: response.status,
                    data: data
                };
            });
        }).catch(function() {
            return {
                ok: false,
                status: 0,
                data: null,
                error: 'Unable to reach the server.'
            };
        });
    },

    _request(path, options) {
        const method = String((options && options.method) || 'GET').toUpperCase();
        const isWriteRequest = this._isQueueableWrite(path, method);
        const queuedWriteId = options && options.__queuedWriteId ? options.__queuedWriteId : null;

        return this._requestWithMeta(path, options).then(function(result) {
            if (result.ok && queuedWriteId) {
                this._removePendingWrite(queuedWriteId);
                if (this._pendingWrites.length === 0) {
                    this._setServerState('online', '');
                }
            }

            if (!result.ok && isWriteRequest && result.status === 0) {
                if (!queuedWriteId) {
                    this._enqueuePendingWrite(path, {
                        method: method,
                        body: options && options.body ? options.body : undefined
                    });
                }
                this._setServerState('offline', 'Server unreachable. ' + this._pendingWrites.length + ' change(s) queued and will sync automatically once connection is restored.');
                return Object.assign({}, result.data || {}, {
                    ok: false,
                    queued: true,
                    error: 'Saved locally. Will sync automatically when the server is reachable.'
                });
            }

            if (!result.ok && queuedWriteId && result.status >= 400 && result.status < 500) {
                this._removePendingWrite(queuedWriteId);
            }

            return result.data || {};
        }.bind(this));
    },

    _isQueueableWrite(path, method) {
        if (!method || ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            return false;
        }
        if (!path || path.indexOf('/auth/') === 0) {
            return false;
        }
        return true;
    },

    _attachConnectivityHandlers() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
            return;
        }
        if (this._connectivityHandlersAttached) {
            return;
        }
        this._connectivityHandlersAttached = true;
        window.addEventListener('online', function() {
            this._flushPendingWrites();
        }.bind(this));
    },

    _loadPendingWrites() {
        try {
            const raw = localStorage.getItem('kennelpro_pending_writes');
            if (!raw) {
                this._pendingWrites = [];
                return;
            }
            const parsed = JSON.parse(raw);
            this._pendingWrites = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            this._pendingWrites = [];
        }
    },

    _savePendingWrites() {
        try {
            localStorage.setItem('kennelpro_pending_writes', JSON.stringify(this._pendingWrites));
        } catch (e) {}
    },

    _enqueuePendingWrite(path, request) {
        const entry = {
            id: 'pw' + Date.now() + '-' + Math.floor(Math.random() * 1000000),
            path: path,
            method: request.method,
            body: request.body,
            createdAt: new Date().toISOString()
        };
        this._pendingWrites.push(entry);
        this._savePendingWrites();
        this._notify();
        return entry.id;
    },

    _removePendingWrite(id) {
        const before = this._pendingWrites.length;
        this._pendingWrites = this._pendingWrites.filter(function(entry) { return entry.id !== id; });
        if (this._pendingWrites.length !== before) {
            this._savePendingWrites();
            this._notify();
        }
    },

    _flushPendingWrites() {
        if (this._isFlushingPendingWrites || !this._pendingWrites.length) {
            return Promise.resolve();
        }

        if (!this._getStoredToken()) {
            return Promise.resolve();
        }

        this._isFlushingPendingWrites = true;
        const entries = this._pendingWrites.slice();

        let chain = Promise.resolve();
        entries.forEach(function(entry) {
            chain = chain.then(function() {
                return this._request(entry.path, {
                    method: entry.method,
                    body: entry.body,
                    __queuedWriteId: entry.id
                });
            }.bind(this));
        }.bind(this));

        return chain.then(function() {
            if (this._pendingWrites.length === 0) {
                this._setServerState('online', '');
                return this._syncFromServer();
            }
            this._setServerState('offline', this._pendingWrites.length + ' change(s) are still queued and will retry automatically.');
        }.bind(this)).finally(function() {
            this._isFlushingPendingWrites = false;
        }.bind(this));
    },

    _setServerState(status, message) {
        const nextStatus = status || 'online';
        const nextMessage = message || '';
        if (this._serverState.status === nextStatus && this._serverState.message === nextMessage) {
            return;
        }
        this._serverState = { status: nextStatus, message: nextMessage };
        this._notify();
    },

    _validateSession() {
        const token = this._getStoredToken();
        if (!this._currentUser) {
            return Promise.resolve(false);
        }
        if (!token) {
            this._currentUser = null;
            this._clearAuthState();
            this._save();
            this._setServerState('auth', 'Your session expired. Sign in again to load kennel data.');
            return Promise.resolve(false);
        }

        return this._requestWithMeta('/auth/me').then(function(result) {
            if (result.ok && result.data && result.data.user) {
                this._currentUser = result.data.user;
                this._save();
                this._setServerState('online', '');
                return true;
            }

            if (result.status === 401) {
                this._currentUser = null;
                this._clearAuthState();
                this._save();
                this._setServerState('auth', 'Your session expired. Sign in again to load kennel data.');
                return false;
            }

            this._setServerState('offline', 'Cannot reach the kennel server. Make sure your laptop server is running, then reopen the app from that laptop address.');
            return false;
        }.bind(this));
    },

    _syncCollection(path, targetKey, options) {
        const settings = Object.assign({ clearOnForbidden: false }, options || {});
        return this._requestWithMeta(path).then(function(result) {
            if (result.ok && Array.isArray(result.data)) {
                this[targetKey] = result.data;
                this._save();
                this._setServerState('online', '');
                return;
            }

            if (result.status === 401) {
                this._currentUser = null;
                this._clearAuthState();
                this._save();
                this._setServerState('auth', 'Your session expired. Sign in again to load kennel data.');
                return;
            }

            if (result.status === 403 && settings.clearOnForbidden) {
                this[targetKey] = [];
                this._save();
                return;
            }

            if (result.status === 0) {
                this._setServerState('offline', 'Cannot reach the kennel server. Make sure your laptop server is running, then reopen the app from that laptop address.');
            }
        }.bind(this));
    },

    _syncFromServer() {
        const requests = [
            this._syncCollection('/dogs', '_dogs'),
            this._syncCollection('/puppies', '_puppies'),
            this._syncCollection('/finance', '_finance', { clearOnForbidden: true }),
            this._syncCollection('/events', '_events'),
            this._syncCollection('/daily-reports', '_dailyReports'),
            this._syncCollection('/activities', '_activities'),
            this._syncCollection('/my-submissions', '_mySubmissions')
        ];
        return Promise.all(requests).then(function() {
            this._primeSubmissionStatusCache();
            this._notify();
        }.bind(this));
    },

    _resetEmptyState() {
        this._dogs = [];
        this._puppies = [];
        this._activities = [];
        this._events = [];
        this._finance = [];
        this._dailyReports = [];
        this._users = [];
        this._pendingApprovals = [];
        this._mySubmissions = [];
        this._submissionStatusCache = {};
        this._currentUser = null;
        this._save();
    },

    _save() {
        localStorage.setItem('kennelpro_data', JSON.stringify({
            _version: this._DATA_VERSION,
            dogs: this._dogs,
            puppies: this._puppies,
            activities: this._activities,
            events: this._events,
            finance: this._finance,
            dailyReports: this._dailyReports,
            users: this._users,
            pendingApprovals: this._pendingApprovals,
            mySubmissions: this._mySubmissions,
            currentUser: this._currentUser
        }));
    },

    _getStoredToken() {
        try {
            const sessionToken = sessionStorage.getItem('kennelpro_auth_token');
            if (sessionToken) {
                return sessionToken;
            }
            const localToken = localStorage.getItem('kennelpro_auth_token');
            if (localToken) {
                return localToken;
            }
        } catch (e) {
            return null;
        }
        return null;
    },

    _storeAuthToken(token, rememberMe) {
        try {
            sessionStorage.removeItem('kennelpro_auth_token');
            localStorage.removeItem('kennelpro_auth_token');
            if (!token) {
                return;
            }
            if (rememberMe) {
                localStorage.setItem('kennelpro_auth_token', token);
                return;
            }
            sessionStorage.setItem('kennelpro_auth_token', token);
        } catch (e) {}
    },

    _persistAuthState(rememberMe) {
        const payload = JSON.stringify(this._currentUser);
        try {
            sessionStorage.removeItem('kennelpro_auth');
            localStorage.removeItem('kennelpro_auth');
            if (rememberMe) {
                localStorage.setItem('kennelpro_auth', payload);
                return;
            }
            sessionStorage.setItem('kennelpro_auth', payload);
        } catch (e) {}
    },

    _clearAuthState() {
        sessionStorage.removeItem('kennelpro_auth');
        localStorage.removeItem('kennelpro_auth');
        sessionStorage.removeItem('kennelpro_auth_token');
        localStorage.removeItem('kennelpro_auth_token');
    },

    _restoreAuthState() {
        try {
            const sessionUser = sessionStorage.getItem('kennelpro_auth');
            if (sessionUser) {
                return JSON.parse(sessionUser);
            }
            const localUser = localStorage.getItem('kennelpro_auth');
            if (localUser) {
                return JSON.parse(localUser);
            }
        } catch (e) {
            return null;
        }
        return null;
    },

    _notify() { this._listeners.forEach(function(fn) { fn(); }); },

    subscribe(fn) {
        this._listeners.push(fn);
        var self = this;
        return function() {
            self._listeners = self._listeners.filter(function(f) { return f !== fn; });
        };
    },

    getDogs() { return this._dogs.slice(); },

    getPuppies() { return this._puppies.slice(); },

    addPuppy(puppy) {
        const tempId = 'p' + Date.now();
        puppy.id = tempId;
        return this._request('/puppies', {
            method: 'POST',
            body: JSON.stringify(puppy)
        }).then(function(result) {
            if (!result || !result.ok) {
                return result;
            }
            if (result.pending) {
                return result;
            }
            if (result.puppy) {
                const createdPuppy = Object.assign({}, puppy, result.puppy);
                createdPuppy.id = result.puppy.id || createdPuppy.id;
                this._puppies.push(createdPuppy);
                this._save();
                this._notify();
            }
            return result;
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to save puppy right now.' };
        }.bind(this));
    },

    updatePuppy(id, updates) {
        var idx = this._puppies.findIndex(function(p) { return p.id === id; });
        if (idx === -1) return Promise.resolve({ ok: false, error: 'Puppy not found.' });
        const previous = this._puppies[idx];
        this._puppies[idx] = Object.assign({}, this._puppies[idx], updates);
        this._save();
        this._notify();
        return this._request('/puppies/' + id, {
            method: 'PUT',
            body: JSON.stringify(this._puppies[idx])
        }).then(function(result) {
            if (!result || !result.ok) {
                this._puppies[idx] = previous;
                this._save();
                this._notify();
                return result;
            }
            if (result.pending) {
                this._puppies[idx] = previous;
                this._save();
                this._notify();
                return result;
            }
            if (result.puppy) {
                this._puppies[idx] = Object.assign({}, this._puppies[idx], result.puppy);
                this._save();
                this._notify();
            }
            return result;
        }.bind(this)).catch(function() {
            this._puppies[idx] = previous;
            this._save();
            this._notify();
            return { ok: false, error: 'Unable to update puppy right now.' };
        }.bind(this));
    },

    deletePuppy(id) {
        var idx = this._puppies.findIndex(function(p) { return p.id === id; });
        if (idx === -1) return Promise.resolve({ ok: false, error: 'Puppy not found.' });
        const existing = this._puppies[idx];
        return this._request('/puppies/' + id, { method: 'DELETE' }).then(function(result) {
            if (!result || !result.ok || result.pending) {
                return result || { ok: false, error: 'Unable to remove puppy right now.' };
            }
            this._puppies = this._puppies.filter(function(p) { return p.id !== id; });
            this._save();
            this._notify();
            return Object.assign({}, result, { puppy: existing });
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to remove puppy right now.' };
        });
    },

    getDog(id) { return this._dogs.find(function(d) { return d.id === id; }); },

    addDog(dog) {
        const tempId = 'd' + Date.now();
        dog.id = tempId;
        if (!dog.records) dog.records = { health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] };
        return this._request('/dogs', {
            method: 'POST',
            body: JSON.stringify(dog)
        }).then(function(result) {
            if (!result || !result.ok) {
                return result;
            }
            if (result.pending) {
                return result;
            }
            if (result.dog) {
                const createdDog = Object.assign({}, dog, result.dog);
                createdDog.id = result.dog.id || createdDog.id;
                this._dogs.push(createdDog);
                this._addActivity('added', '<strong>' + createdDog.name + '</strong> added to kennel', 'green');
                this._save();
                this._notify();
            }
            return result;
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to save dog right now.' };
        }.bind(this));
    },

    updateDog(id, updates) {
        var idx = this._dogs.findIndex(function(d) { return d.id === id; });
        if (idx === -1) return Promise.resolve({ ok: false, error: 'Dog not found.' });
        const previous = this._dogs[idx];
        this._dogs[idx] = Object.assign({}, this._dogs[idx], updates);
        this._save();
        this._notify();
        return this._request('/dogs/' + id, {
            method: 'PUT',
            body: JSON.stringify(this._dogs[idx])
        }).then(function(result) {
            if (!result || !result.ok) {
                this._dogs[idx] = previous;
                this._save();
                this._notify();
                return result;
            }
            if (result.pending) {
                this._dogs[idx] = previous;
                this._save();
                this._notify();
                return result;
            }
            if (result.dog) {
                this._dogs[idx] = Object.assign({}, this._dogs[idx], result.dog);
                this._save();
                this._notify();
            }
            return result;
        }.bind(this)).catch(function() {
            this._dogs[idx] = previous;
            this._save();
            this._notify();
            return { ok: false, error: 'Unable to update dog right now.' };
        }.bind(this));
    },

    deleteDog(id) {
        var dog = this.getDog(id);
        if (!dog) return Promise.resolve({ ok: false, error: 'Dog not found.' });
        return this._request('/dogs/' + id, { method: 'DELETE' }).then(function(result) {
            if (!result || !result.ok || result.pending) {
                return result || { ok: false, error: 'Unable to remove dog right now.' };
            }
            this._dogs = this._dogs.filter(function(d) { return d.id !== id; });
            this._addActivity('deleted', '<strong>' + dog.name + '</strong> removed from kennel', 'red');
            this._save();
            this._notify();
            return Object.assign({}, result, { dog: dog });
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to remove dog right now.' };
        });
    },

    resetAll() {
        this._dogs = [];
        this._puppies = [];
        this._activities = [];
        this._events = [];
        this._finance = [];
        localStorage.removeItem('kennelpro_data');
        this._save();
        this._notify();
        this._request('/dogs', { method: 'GET' }).catch(function() {});
    },

    exportData() {
        return JSON.stringify({
            _version: this._DATA_VERSION,
            dogs: this._dogs,
            puppies: this._puppies,
            activities: this._activities,
            events: this._events,
            finance: this._finance,
            dailyReports: this._dailyReports
        }, null, 2);
    },

    importData(payload) {
        var parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid backup data');
        }

        this._dogs = Array.isArray(parsed.dogs) ? parsed.dogs : [];
        this._puppies = Array.isArray(parsed.puppies) ? parsed.puppies : [];
        this._activities = Array.isArray(parsed.activities) ? parsed.activities : [];
        this._events = Array.isArray(parsed.events) ? parsed.events : [];
        this._finance = Array.isArray(parsed.finance) ? parsed.finance : [];
        this._dailyReports = Array.isArray(parsed.dailyReports) ? parsed.dailyReports : [];
        this._save();
        this._notify();
        return parsed;
    },

    getFinanceEntries() {
        return this._finance.slice().sort(function(a, b) {
            return new Date(b.date) - new Date(a.date);
        });
    },

    addFinanceEntry(entry) {
        const tempId = 'f' + Date.now();
        entry.id = tempId;
        entry.amount = Number(entry.amount) || 0;
        entry.date = entry.date || new Date().toISOString().slice(0, 10);
        return this._request('/finance', {
            method: 'POST',
            body: JSON.stringify(entry)
        }).then(function(result) {
            if (!result || !result.ok) {
                return result;
            }
            if (result.pending) {
                return result;
            }
            if (result.entry) {
                const createdEntry = Object.assign({}, entry, result.entry);
                createdEntry.id = result.entry.id || createdEntry.id;
                this._finance.push(createdEntry);
                this._save();
                this._notify();
            }
            return result;
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to save transaction right now.' };
        }.bind(this));
    },

    getFinanceEntry(id) {
        return this._finance.find(function(item) { return item.id === id; });
    },

    deleteFinanceEntry(id) {
        var entry = this.getFinanceEntry(id);
        if (!entry) return Promise.resolve({ ok: false, error: 'Finance entry not found.' });
        return this._request('/finance/' + id, { method: 'DELETE' }).then(function(result) {
            if (!result || !result.ok || result.pending) {
                return result || { ok: false, error: 'Unable to remove finance entry right now.' };
            }
            this._finance = this._finance.filter(function(item) { return item.id !== id; });
            this._save();
            this._notify();
            return Object.assign({}, result, { entry: entry });
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to remove finance entry right now.' };
        });
    },

    getFinanceSummary() {
        var entries = this.getFinanceEntries();
        var sales = entries.filter(function(item) { return item.type === 'sale'; });
        var expenses = entries.filter(function(item) { return item.type === 'expense'; });
        var totalSales = sales.reduce(function(sum, item) { return sum + (Number(item.amount) || 0); }, 0);
        var totalExpenses = expenses.reduce(function(sum, item) { return sum + (Number(item.amount) || 0); }, 0);
        var net = totalSales - totalExpenses;

        var monthlyBreakdown = [];
        var monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var now = new Date();
        for (var i = 5; i >= 0; i--) {
            var monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            var key = monthDate.getFullYear() + '-' + String(monthDate.getMonth() + 1).padStart(2, '0');
            var monthSales = 0;
            var monthExpenses = 0;
            entries.forEach(function(item) {
                if (!item.date) return;
                var itemKey = new Date(item.date).getFullYear() + '-' + String(new Date(item.date).getMonth() + 1).padStart(2, '0');
                if (itemKey !== key) return;
                if (item.type === 'sale') monthSales += Number(item.amount) || 0;
                else monthExpenses += Number(item.amount) || 0;
            });
            monthlyBreakdown.push({
                label: monthNames[monthDate.getMonth()] + ' ' + monthDate.getFullYear().toString().slice(-2),
                sales: monthSales,
                expenses: monthExpenses,
                net: monthSales - monthExpenses
            });
        }

        var expenseCategories = {};
        expenses.forEach(function(item) {
            var label = item.category || 'General';
            expenseCategories[label] = (expenseCategories[label] || 0) + (Number(item.amount) || 0);
        });

        return {
            totalSales: totalSales,
            totalExpenses: totalExpenses,
            net: net,
            profitMargin: totalSales > 0 ? (net / totalSales) * 100 : 0,
            salesCount: sales.length,
            expenseCount: expenses.length,
            monthlyBreakdown: monthlyBreakdown,
            expenseCategories: expenseCategories
        };
    },

    signupUser(details, rememberMe) {
        const name = String(details.name || '').trim();
        const email = String(details.email || '').trim().toLowerCase();
        const password = String(details.password || '');

        if (!name || !email || !password) {
            return Promise.resolve({ ok: false, error: 'Please complete all fields.' });
        }

        if (password.length < 4) {
            return Promise.resolve({ ok: false, error: 'Password must be at least 4 characters.' });
        }

        return this._request('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ name: name, email: email, password: password })
        }).then(function(result) {
            if (!result || !result.ok) {
                return result;
            }
            const user = result.user;
            const token = result.token;
            this._users = this._users.filter(function(item) { return item.id !== user.id; });
            this._users.push(user);
            this._currentUser = user;
            if (token) {
                this._storeAuthToken(token, Boolean(rememberMe));
            }
            this._persistAuthState(Boolean(rememberMe));
            this._save();
            this._notify();
            return this._syncFromServer().then(function() {
                return { ok: true, user: user };
            });
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to create account.' };
        });
    },

    loginUser(identifier, password, rememberMe) {
        const lookup = String(identifier || '').trim().toLowerCase();
        return this._request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier: lookup, password: password })
        }).then(function(result) {
            if (!result || !result.ok) {
                return result;
            }
            const user = result.user;
            const token = result.token;
            this._users = this._users.filter(function(item) { return item.id !== user.id; });
            this._users.push(user);
            this._currentUser = user;
            if (token) {
                this._storeAuthToken(token, Boolean(rememberMe));
            }
            this._persistAuthState(Boolean(rememberMe));
            this._save();
            this._notify();
            return this._syncFromServer().then(function() {
                return { ok: true, user: user };
            });
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to reach the server.' };
        });
    },

    logoutUser() {
        const token = this._getStoredToken();
        if (token) {
            this._request('/auth/logout', { method: 'POST' }).catch(function() {});
        }
        this._currentUser = null;
        this._clearAuthState();
        this._save();
        this._notify();
        return true;
    },

    getCurrentUser() {
        return this._currentUser;
    },

    getServerState() {
        return Object.assign({}, this._serverState);
    },

    getCurrentUserRole() {
        return this._currentUser && this._currentUser.role ? this._currentUser.role : 'staff';
    },

    getUsers() {
        return this._users.slice();
    },

    getPendingApprovals() {
        return this._pendingApprovals.slice();
    },

    getMySubmissions() {
        return this._mySubmissions.slice();
    },

    _primeSubmissionStatusCache() {
        this._submissionStatusCache = {};
        this._mySubmissions.forEach(function(item) {
            if (item && item.id) {
                this._submissionStatusCache[item.id] = item.status || 'pending';
            }
        }.bind(this));
    },

    _areSubmissionListsEqual(left, right) {
        if (!Array.isArray(left) || !Array.isArray(right)) {
            return false;
        }
        if (left.length !== right.length) {
            return false;
        }
        for (var index = 0; index < left.length; index++) {
            var a = left[index] || {};
            var b = right[index] || {};
            if ((a.id || '') !== (b.id || '')) return false;
            if ((a.status || '') !== (b.status || '')) return false;
            if ((a.reviewNotes || '') !== (b.reviewNotes || '')) return false;
            if ((a.reviewedAt || '') !== (b.reviewedAt || '')) return false;
            if ((a.label || '') !== (b.label || '')) return false;
        }
        return true;
    },

    loadMySubmissions(options) {
        const shouldPrime = Boolean(options && options.primeStatusCache);
        const silentIfUnchanged = options && options.silentIfUnchanged !== undefined
            ? Boolean(options.silentIfUnchanged)
            : false;
        return this._request('/my-submissions').then(function(result) {
            if (Array.isArray(result)) {
                const changed = !this._areSubmissionListsEqual(this._mySubmissions, result);
                this._mySubmissions = result;
                if (shouldPrime) {
                    this._primeSubmissionStatusCache();
                }
                if (changed || !silentIfUnchanged) {
                    this._save();
                    this._notify();
                }
                return result;
            }
            const hadItems = this._mySubmissions.length > 0;
            this._mySubmissions = [];
            if (shouldPrime) {
                this._primeSubmissionStatusCache();
            }
            if (hadItems || !silentIfUnchanged) {
                this._save();
                this._notify();
            }
            return [];
        }.bind(this)).catch(function() {
            return [];
        });
    },

    pollSubmissionUpdates() {
        const previous = Object.assign({}, this._submissionStatusCache || {});
        return this.loadMySubmissions({ silentIfUnchanged: true }).then(function(items) {
            const updates = [];
            (items || []).forEach(function(item) {
                if (!item || !item.id) {
                    return;
                }
                const current = item.status || 'pending';
                const prior = previous[item.id];
                if (prior && prior !== current && (current === 'approved' || current === 'rejected')) {
                    updates.push(item);
                }
            });
            this._primeSubmissionStatusCache();
            return updates;
        }.bind(this));
    },

    loadPendingApprovals() {
        return this._request('/pending-approvals').then(function(result) {
            if (result && Array.isArray(result.items)) {
                this._pendingApprovals = result.items;
                this._save();
                this._notify();
                return result.items;
            }
            this._pendingApprovals = [];
            this._save();
            this._notify();
            return [];
        }.bind(this)).catch(function() {
            this._pendingApprovals = [];
            this._save();
            this._notify();
            return [];
        }.bind(this));
    },

    approvePendingApproval(id, notes) {
        return this._request('/pending-approvals/' + id + '/approve', {
            method: 'POST',
            body: JSON.stringify({ notes: notes || '' })
        }).then(function(result) {
            if (result && result.ok) {
                this._pendingApprovals = this._pendingApprovals.filter(function(item) { return item.id !== id; });
                this._save();
                this._notify();
                this._syncFromServer();
            }
            return result;
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to approve the submission.' };
        }.bind(this));
    },

    rejectPendingApproval(id, notes) {
        return this._request('/pending-approvals/' + id + '/reject', {
            method: 'POST',
            body: JSON.stringify({ notes: notes || 'Rejected' })
        }).then(function(result) {
            if (result && result.ok) {
                this._pendingApprovals = this._pendingApprovals.filter(function(item) { return item.id !== id; });
                this._save();
                this._notify();
                this._syncFromServer();
            }
            return result;
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to reject the submission.' };
        }.bind(this));
    },

    loadUsers() {
        return this._request('/users').then(function(result) {
            if (Array.isArray(result)) {
                this._users = result;
                this._save();
                this._notify();
                return result;
            }
            return [];
        }.bind(this)).catch(function() {
            return [];
        });
    },

    createUser(details) {
        return this._request('/users', {
            method: 'POST',
            body: JSON.stringify(details)
        }).then(function(result) {
            if (result && result.ok) {
                this._users = this._users.filter(function(item) { return item.id !== result.user.id; });
                this._users.push(result.user);
                this._save();
                this._notify();
            }
            return result;
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to create user.' };
        });
    },

    updateUser(id, updates) {
        return this._request('/users/' + id, {
            method: 'PUT',
            body: JSON.stringify(updates)
        }).then(function(result) {
            if (result && result.ok) {
                this._users = this._users.filter(function(item) { return item.id !== result.user.id; });
                this._users.push(result.user);
                this._save();
                this._notify();
            }
            return result;
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to update user.' };
        });
    },

    resetPassword(email, newPassword, confirmPassword) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const password = String(newPassword || '');
        const confirm = String(confirmPassword || '');

        if (!normalizedEmail || !password || !confirm) {
            return Promise.resolve({ ok: false, error: 'Please complete all fields.' });
        }

        if (password.length < 4) {
            return Promise.resolve({ ok: false, error: 'Password must be at least 4 characters.' });
        }

        if (password !== confirm) {
            return Promise.resolve({ ok: false, error: 'Passwords do not match.' });
        }

        return Promise.resolve({ ok: false, error: 'Password reset is not available yet on the server version.' });
    },

    isAuthenticated() {
        return Boolean(this._currentUser);
    },

    exportReportCsv() {
        function escapeCsv(value) {
            var stringValue = value === null || value === undefined ? '' : String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return '"' + stringValue.replace(/"/g, '""') + '"';
            }
            return stringValue;
        }

        var rows = [];
        rows.push(['type', 'name', 'breed', 'gender', 'status', 'value', 'forSale', 'price', 'notes', 'date', 'category', 'amount', 'related', 'recordType', 'result'].join(','));

        this._dogs.forEach(function(dog) {
            rows.push([
                'dog',
                escapeCsv(dog.name || ''),
                escapeCsv(dog.breed || ''),
                escapeCsv(dog.gender || ''),
                escapeCsv(dog.status || ''),
                escapeCsv(dog.value || ''),
                escapeCsv(dog.forSale ? 'Yes' : 'No'),
                escapeCsv(dog.price || ''),
                escapeCsv(dog.notes || ''),
                '', '', '', '', '', ''
            ].join(','));
        });

        this._puppies.forEach(function(puppy) {
            rows.push([
                'puppy',
                escapeCsv(puppy.name || ''),
                '',
                escapeCsv(puppy.gender || ''),
                escapeCsv(puppy.saleStatus || ''),
                escapeCsv(puppy.saleTotalAmount || ''),
                escapeCsv(puppy.saleStatus === 'Booked' || puppy.saleStatus === 'Sold' ? 'Yes' : 'No'),
                escapeCsv(puppy.saleReceivedAmount || ''),
                escapeCsv(puppy.ownerName || ''),
                '', '', '', '', '', ''
            ].join(','));
        });

        this.getFinanceEntries().forEach(function(entry) {
            rows.push([
                'finance',
                escapeCsv(entry.title || ''),
                '',
                '',
                '',
                '',
                '',
                '',
                escapeCsv(entry.notes || ''),
                escapeCsv(entry.date || ''),
                escapeCsv(entry.category || ''),
                escapeCsv(entry.amount || ''),
                escapeCsv(entry.related || ''),
                escapeCsv(entry.type || ''),
                ''
            ].join(','));
        });

        return rows.join('\n');
    },

    exportPrintableReport() {
        var summary = this.getFinanceSummary();
        var entries = this.getFinanceEntries();
        var lines = [];
        lines.push('Bigpaw Kennel Monthly Financial Report');
        lines.push('Generated: ' + new Date().toLocaleString());
        lines.push('');
        lines.push('Summary');
        lines.push('Total Sales: ' + summary.totalSales.toFixed(2));
        lines.push('Total Expenses: ' + summary.totalExpenses.toFixed(2));
        lines.push('Net Result: ' + summary.net.toFixed(2));
        lines.push('Profit Margin: ' + Number(summary.profitMargin || 0).toFixed(1) + '%');
        lines.push('');
        lines.push('Monthly Breakdown');
        (summary.monthlyBreakdown || []).forEach(function(month) {
            lines.push(month.label + ' | Sales: ' + month.sales.toFixed(2) + ' | Expenses: ' + month.expenses.toFixed(2) + ' | Net: ' + month.net.toFixed(2));
        });
        lines.push('');
        lines.push('Transactions');
        entries.forEach(function(entry) {
            lines.push((entry.date || '') + ' | ' + (entry.type || '') + ' | ' + (entry.title || '') + ' | ' + (entry.category || '') + ' | ' + Number(entry.amount || 0).toFixed(2));
        });
        return lines.join('\n');
    },

    getRecords(dogId, recordType) {
        var dog = this.getDog(dogId);
        if (!dog || !dog.records) return [];
        return dog.records[recordType] || [];
    },

    addRecord(dogId, recordType, record) {
        var dog = this.getDog(dogId);
        if (!dog) return Promise.resolve({ ok: false, error: 'Dog not found.' });
        record.id = 'r' + Date.now();
        const nextDog = Object.assign({}, dog);
        const nextRecords = Object.assign({ health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] }, dog.records || {});
        if (!nextRecords[recordType]) nextRecords[recordType] = [];
        nextRecords[recordType] = nextRecords[recordType].slice();
        nextRecords[recordType].push(record);
        nextDog.records = nextRecords;
        return this._request('/dogs/' + dogId, {
            method: 'PUT',
            body: JSON.stringify(nextDog)
        }).then(function(result) {
            if (!result || !result.ok || result.pending) {
                return result || { ok: false, error: 'Unable to save record right now.' };
            }
            dog.records = nextRecords;
            var labels = { health: 'Health Record', vaccination: 'Vaccination', deworming: 'Deworming', breeding: 'Breeding Record', heatCycle: 'Heat Cycle', training: 'Training Record' };
            this._addActivity('record', '<strong>' + dog.name + '</strong> - ' + (labels[recordType] || recordType) + ' added', 'blue');
            this._save();
            this._notify();
            return { ok: true, record: record };
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to save record right now.' };
        });
    },

    updateRecord(dogId, recordType, recordId, updates) {
        var dog = this.getDog(dogId);
        if (!dog || !dog.records || !dog.records[recordType]) return Promise.resolve({ ok: false, error: 'Record not found.' });
        var idx = dog.records[recordType].findIndex(function(r) { return r.id === recordId; });
        if (idx === -1) return Promise.resolve({ ok: false, error: 'Record not found.' });
        const nextDog = Object.assign({}, dog);
        const nextRecords = Object.assign({ health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] }, dog.records || {});
        nextRecords[recordType] = (nextRecords[recordType] || []).slice();
        nextRecords[recordType][idx] = Object.assign({}, nextRecords[recordType][idx], updates);
        nextDog.records = nextRecords;
        return this._request('/dogs/' + dogId, {
            method: 'PUT',
            body: JSON.stringify(nextDog)
        }).then(function(result) {
            if (!result || !result.ok || result.pending) {
                return result || { ok: false, error: 'Unable to update record right now.' };
            }
            dog.records[recordType][idx] = nextRecords[recordType][idx];
            this._save();
            this._notify();
            return { ok: true, record: dog.records[recordType][idx] };
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to update record right now.' };
        });
    },

    deleteRecord(dogId, recordType, recordId) {
        var dog = this.getDog(dogId);
        if (!dog || !dog.records || !dog.records[recordType]) return Promise.resolve({ ok: false, error: 'Record not found.' });
        const nextDog = Object.assign({}, dog);
        const nextRecords = Object.assign({ health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] }, dog.records || {});
        nextRecords[recordType] = (nextRecords[recordType] || []).filter(function(r) { return r.id !== recordId; });
        nextDog.records = nextRecords;
        return this._request('/dogs/' + dogId, {
            method: 'PUT',
            body: JSON.stringify(nextDog)
        }).then(function(result) {
            if (!result || !result.ok || result.pending) {
                return result || { ok: false, error: 'Unable to delete record right now.' };
            }
            dog.records[recordType] = nextRecords[recordType];
            this._save();
            this._notify();
            return { ok: true };
        }.bind(this)).catch(function() {
            return { ok: false, error: 'Unable to delete record right now.' };
        });
    },

    markAlertAsDone(dogId, recordType, recordId, dueValue) {
        var dog = this.getDog(dogId);
        if (!dog || !dog.records || !dog.records[recordType]) {
            return Promise.resolve({ ok: false, error: 'Record not found.' });
        }
        var records = dog.records[recordType] || [];
        var index = records.findIndex(function(item) { return item.id === recordId; });
        if (index === -1) {
            return Promise.resolve({ ok: false, error: 'Record not found.' });
        }
        var effectiveDue = dueValue || records[index].nextDue || records[index].expectedDate || records[index].nextExpected;
        if (!effectiveDue) {
            return Promise.resolve({ ok: false, error: 'This item has no due date to dismiss.' });
        }
        return this.updateRecord(dogId, recordType, recordId, {
            alertDismissedFor: effectiveDue,
            alertDismissedAt: new Date().toISOString()
        });
    },

    getActivities(limit) {
        if (limit === undefined) limit = 10;
        var sorted = this._activities.slice().sort(function(a, b) { return new Date(b.time) - new Date(a.time); });
        return sorted.slice(0, limit);
    },

    _addActivity(type, text, color) {
        this._activities.unshift({ id: 'a' + Date.now(), type: type, text: text, time: new Date().toISOString(), color: color });
        if (this._activities.length > 50) this._activities = this._activities.slice(0, 50);
    },

    getStats() {
        var dogs = this._dogs;
        var total = dogs.length;
        var males = dogs.filter(function(d) { return d.gender === 'Male'; }).length;
        var females = dogs.filter(function(d) { return d.gender === 'Female'; }).length;
        var forSale = dogs.filter(function(d) { return d.forSale; }).length;
        var active = dogs.filter(function(d) { return d.status === 'Active'; }).length;
        var totalValue = dogs.reduce(function(sum, d) { return sum + (Number(d.value) || 0); }, 0);
        var breeds = {};
        dogs.forEach(function(d) { breeds[d.breed] = (breeds[d.breed] || 0) + 1; });
        var now = new Date();
        var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var ageGroups = { '<1 year': 0, '1-2 years': 0, '2-5 years': 0, '5+ years': 0 };
        dogs.forEach(function(d) {
            if (!d.dob) return;
            var age = (now - new Date(d.dob)) / (365.25 * 24 * 60 * 60 * 1000);
            if (age < 1) ageGroups['<1 year']++;
            else if (age < 2) ageGroups['1-2 years']++;
            else if (age < 5) ageGroups['2-5 years']++;
            else ageGroups['5+ years']++;
        });
        var upcomingEvents = [];
        dogs.forEach(function(d) {
            if (!d.records) return;
            Object.keys(d.records).forEach(function(type) {
                d.records[type].forEach(function(r) {
                    var dueDate = r.nextDue || r.expectedDate || r.nextExpected;
                    if (!dueDate) return;
                    var due = new Date(dueDate);
                    var dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
                    if (dueStart >= todayStart) {
                        upcomingEvents.push({ dogName: d.name, dogId: d.id, type: type, record: r, nextDue: dueDate });
                    }
                });
            });
        });
        upcomingEvents.sort(function(a, b) { return new Date(a.nextDue) - new Date(b.nextDue); });
        return { total: total, males: males, females: females, forSale: forSale, active: active, totalValue: totalValue, breeds: breeds, ageGroups: ageGroups, upcomingEvents: upcomingEvents };
    },

    toggleForSale(dogId) {
        var dog = this.getDog(dogId);
        if (!dog) return null;
        dog.forSale = !dog.forSale;
        if (!dog.forSale) dog.price = null;
        var action = dog.forSale ? 'listed for sale' : 'removed from sale';
        this._addActivity('sale', '<strong>' + dog.name + '</strong> ' + action, 'green');
        this._save();
        this._notify();
        return dog;
    },

    setForSale(dogId, forSale, price) {
        var dog = this.getDog(dogId);
        if (!dog) return null;
        dog.forSale = forSale;
        dog.price = forSale ? price : null;
        this._save();
        this._notify();
        return dog;
    },

    // ===== Calendar Events =====
    getEvents() {
        return this._events.slice().sort(function(a, b) { return new Date(a.date) - new Date(b.date); });
    },

    getDailyReports() {
        return this._dailyReports.slice().sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    },

    getDogDailyHealthStatuses(dogId, dogName) {
        var reports = this.getDailyReports();
        var normalizedName = (dogName || '').toLowerCase().trim();
        var entries = [];

        for (var i = 0; i < reports.length; i++) {
            var report = reports[i] || {};
            var statuses = Array.isArray(report.dogStatuses) ? report.dogStatuses : [];
            for (var j = 0; j < statuses.length; j++) {
                var status = statuses[j] || {};
                var statusName = (status.dogName || '').toLowerCase().trim();
                var matchesId = status.dogId && dogId && status.dogId === dogId;
                var matchesName = normalizedName && statusName && statusName === normalizedName;

                if (!matchesId && !matchesName) {
                    continue;
                }

                entries.push({
                    reportId: report.id || '',
                    reportDate: report.date || '',
                    createdAt: report.createdAt || '',
                    personInCharge: report.personInCharge || '',
                    healthStatus: status.healthStatus || '',
                    groomingStatus: status.groomingStatus || '',
                    medication: status.medication || '',
                    notes: report.notes || ''
                });
            }
        }

        entries.sort(function(a, b) {
            var aDate = new Date(a.reportDate || a.createdAt || 0);
            var bDate = new Date(b.reportDate || b.createdAt || 0);
            return bDate - aDate;
        });

        return entries;
    },

    addDailyReport(report) {
        const entry = Object.assign({ id: 'dr' + Date.now(), createdAt: new Date().toISOString() }, report);
        return this._request('/daily-reports', {
            method: 'POST',
            body: JSON.stringify(entry)
        }).then(function(result) {
            if (!result || !result.ok) {
                return result || { ok: false, error: 'Unable to save report right now.' };
            }
            if (result.pending) {
                return result;
            }
            if (result && result.report) {
                KennelData._dailyReports.unshift(result.report);
                KennelData._save();
                KennelData._notify();
            }
            return result;
        }).catch(function() {
            return { ok: false, error: 'Unable to save report right now.' };
        });
    },

    getEventsForDate(dateStr) {
        return this._events.filter(function(e) { return e.date === dateStr; });
    },

    getEventsForMonth(year, month) {
        var m = (month + 1) < 10 ? '0' + (month + 1) : '' + (month + 1);
        var prefix = year + '-' + m;
        return this._events.filter(function(e) { return e.date.indexOf(prefix) === 0; });
    },

    addCalendarEvent(event) {
        event.id = 'ev' + Date.now();
        this._events.push(event);
        this._addActivity('event', '<strong>Event:</strong> ' + event.title, 'blue');
        this._save();
        this._notify();
        this._request('/events', {
            method: 'POST',
            body: JSON.stringify(event)
        }).catch(function() {});
        return event;
    },

    deleteCalendarEvent(id) {
        this._events = this._events.filter(function(e) { return e.id !== id; });
        this._save();
        this._notify();
        this._request('/events/' + id, { method: 'DELETE' }).catch(function() {});
    },

    getAlerts() {
        var alerts = [];
        var now = new Date();
        var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var dogs = this._dogs;
        var typeLabels = { health: 'Health Check', vaccination: 'Vaccination', deworming: 'Deworming', breeding: 'Breeding', heatCycle: 'Heat Cycle', training: 'Training' };

        dogs.forEach(function(d) {
            if (!d.records) return;
            Object.keys(d.records).forEach(function(type) {
                d.records[type].forEach(function(r) {
                    var dueValue = r.nextDue || r.expectedDate || r.nextExpected;
                    if (dueValue) {
                        if (r.alertDismissedFor && r.alertDismissedFor === dueValue) {
                            return;
                        }
                        var dueDate = new Date(dueValue);
                        var dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
                        var days = Math.round((dueStart - todayStart) / (1000 * 60 * 60 * 24));
                        if (days <= 30 && days >= 0) {
                            alerts.push({
                                id: 'alert-' + r.id, type: 'warning',
                                severity: days <= 7 ? 'danger' : 'warning',
                                dogId: d.id, dogName: d.name, recordType: type,
                                recordTypeLabel: typeLabels[type] || type, record: r,
                                daysUntilDue: days,
                                message: days === 0
                                    ? d.name + "'s " + (typeLabels[type] || type) + ' is due today'
                                    : d.name + "'s " + (typeLabels[type] || type) + ' is due in ' + days + ' days'
                            });
                        }
                    }
                });
            });
        });
        alerts.sort(function(a, b) { return a.daysUntilDue - b.daysUntilDue; });
        return alerts;
    }
};

window.KennelData = KennelData;
KennelData.init();
