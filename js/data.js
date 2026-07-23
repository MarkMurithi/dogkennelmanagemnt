// ===== Data Layer =====
const KennelData = {
    _dogs: [],
    _puppies: [],
    _activities: [],
    _events: [],
    _finance: [],
    _users: [],
    _currentUser: null,
    _listeners: [],
    _DATA_VERSION: 11,
    apiBase: (function() {
        if (typeof window === 'undefined' || !window.location) {
            return 'http://127.0.0.1:8001/api';
        }

        const hostname = window.location.hostname || '';
        const protocol = window.location.protocol || '';

        if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '') {
            return 'http://127.0.0.1:8001/api';
        }

        return '/api';
    })(),

    init() {
        const stored = localStorage.getItem('kennelpro_data');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed._version === this._DATA_VERSION || parsed._version === 10 || parsed._version === 9) {
                    this._dogs = parsed.dogs || [];
                    this._puppies = parsed.puppies || [];
                    this._activities = parsed.activities || [];
                    this._events = parsed.events || [];
                    this._finance = parsed.finance || [];
                    this._users = Array.isArray(parsed.users) ? parsed.users : [];
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
        this._syncFromServer();
    },

    _request(path, options) {
        const headers = { 'Content-Type': 'application/json' };
        const token = this._getStoredToken();
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }

        const config = Object.assign({
            headers: headers
        }, options || {});
        return fetch(this.apiBase + path, config).then(function(response) {
            return response.json().catch(function() { return {}; });
        });
    },

    _syncFromServer() {
        const self = this;
        this._request('/dogs').then(function(data) {
            self._dogs = Array.isArray(data) ? data : [];
            self._save();
            self._notify();
        }).catch(function() {});
        this._request('/puppies').then(function(data) {
            self._puppies = Array.isArray(data) ? data : [];
            self._save();
            self._notify();
        }).catch(function() {});
        this._request('/finance').then(function(data) {
            self._finance = Array.isArray(data) ? data : [];
            self._save();
            self._notify();
        }).catch(function() {});
        this._request('/events').then(function(data) {
            self._events = Array.isArray(data) ? data : [];
            self._save();
            self._notify();
        }).catch(function() {});
        this._request('/activities').then(function(data) {
            self._activities = Array.isArray(data) ? data : [];
            self._save();
            self._notify();
        }).catch(function() {});
    },

    _resetEmptyState() {
        this._dogs = [];
        this._puppies = [];
        this._activities = [];
        this._events = [];
        this._finance = [];
        this._users = [];
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
            users: this._users,
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
            if (token) {
                localStorage.setItem('kennelpro_auth_token', token);
                sessionStorage.setItem('kennelpro_auth_token', token);
                if (rememberMe) {
                    localStorage.setItem('kennelpro_auth_token', token);
                } else {
                    sessionStorage.setItem('kennelpro_auth_token', token);
                }
            }
        } catch (e) {}
    },

    _persistAuthState(rememberMe) {
        const payload = JSON.stringify(this._currentUser);
        try {
            if (rememberMe) {
                localStorage.setItem('kennelpro_auth', payload);
                sessionStorage.setItem('kennelpro_auth', payload);
            } else {
                sessionStorage.setItem('kennelpro_auth', payload);
                localStorage.setItem('kennelpro_auth', payload);
            }
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
        this._puppies.push(puppy);
        this._save();
        this._notify();
        return this._request('/puppies', {
            method: 'POST',
            body: JSON.stringify(puppy)
        }).then(function(result) {
            if (!result || !result.ok) {
                this._puppies = this._puppies.filter(function(item) { return item.id !== tempId; });
                this._save();
                this._notify();
                return result;
            }
            if (result.puppy) {
                const idx = this._puppies.findIndex(function(item) { return item.id === tempId; });
                if (idx !== -1) {
                    this._puppies[idx] = Object.assign({}, puppy, result.puppy);
                    this._save();
                    this._notify();
                }
            }
            return result;
        }.bind(this)).catch(function() {
            this._puppies = this._puppies.filter(function(item) { return item.id !== tempId; });
            this._save();
            this._notify();
            return { ok: false, error: 'Unable to save puppy right now.' };
        }.bind(this));
    },

    updatePuppy(id, updates) {
        var idx = this._puppies.findIndex(function(p) { return p.id === id; });
        if (idx === -1) return null;
        this._puppies[idx] = Object.assign({}, this._puppies[idx], updates);
        this._save();
        this._notify();
        return this._puppies[idx];
    },

    deletePuppy(id) {
        this._puppies = this._puppies.filter(function(p) { return p.id !== id; });
        this._save();
        this._notify();
        this._request('/puppies/' + id, { method: 'DELETE' }).catch(function() {});
    },

    getDog(id) { return this._dogs.find(function(d) { return d.id === id; }); },

    addDog(dog) {
        const tempId = 'd' + Date.now();
        dog.id = tempId;
        if (!dog.records) dog.records = { health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] };
        this._dogs.push(dog);
        this._addActivity('added', '<strong>' + dog.name + '</strong> added to kennel', 'green');
        this._save();
        this._notify();
        return this._request('/dogs', {
            method: 'POST',
            body: JSON.stringify(dog)
        }).then(function(result) {
            if (!result || !result.ok) {
                this._dogs = this._dogs.filter(function(item) { return item.id !== tempId; });
                this._save();
                this._notify();
                return result;
            }
            if (result.dog) {
                const idx = this._dogs.findIndex(function(item) { return item.id === tempId; });
                if (idx !== -1) {
                    this._dogs[idx] = Object.assign({}, dog, result.dog);
                    this._save();
                    this._notify();
                }
            }
            return result;
        }.bind(this)).catch(function() {
            this._dogs = this._dogs.filter(function(item) { return item.id !== tempId; });
            this._save();
            this._notify();
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
        this._dogs = this._dogs.filter(function(d) { return d.id !== id; });
        this._addActivity('deleted', '<strong>' + dog.name + '</strong> removed from kennel', 'red');
        this._save();
        this._notify();
        this._request('/dogs/' + id, { method: 'DELETE' }).catch(function() {});
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
            finance: this._finance
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
        this._finance.push(entry);
        this._save();
        this._notify();
        return this._request('/finance', {
            method: 'POST',
            body: JSON.stringify(entry)
        }).then(function(result) {
            if (!result || !result.ok) {
                this._finance = this._finance.filter(function(item) { return item.id !== tempId; });
                this._save();
                this._notify();
                return result;
            }
            if (result.entry) {
                const idx = this._finance.findIndex(function(item) { return item.id === tempId; });
                if (idx !== -1) {
                    this._finance[idx] = Object.assign({}, entry, result.entry);
                    this._save();
                    this._notify();
                }
            }
            return result;
        }.bind(this)).catch(function() {
            this._finance = this._finance.filter(function(item) { return item.id !== tempId; });
            this._save();
            this._notify();
            return { ok: false, error: 'Unable to save transaction right now.' };
        }.bind(this));
    },

    getFinanceEntry(id) {
        return this._finance.find(function(item) { return item.id === id; });
    },

    deleteFinanceEntry(id) {
        this._finance = this._finance.filter(function(item) { return item.id !== id; });
        this._save();
        this._notify();
        this._request('/finance/' + id, { method: 'DELETE' }).catch(function() {});
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
            return { ok: true, user: user };
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
            return { ok: true, user: user };
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

    getCurrentUserRole() {
        return this._currentUser && this._currentUser.role ? this._currentUser.role : 'staff';
    },

    getUsers() {
        return this._users.slice();
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
        if (!dog) return null;
        record.id = 'r' + Date.now();
        if (!dog.records) dog.records = { health: [], vaccination: [], deworming: [], breeding: [], heatCycle: [], training: [] };
        if (!dog.records[recordType]) dog.records[recordType] = [];
        dog.records[recordType].push(record);
        var labels = { health: 'Health Record', vaccination: 'Vaccination', deworming: 'Deworming', breeding: 'Breeding Record', heatCycle: 'Heat Cycle', training: 'Training Record' };
        this._addActivity('record', '<strong>' + dog.name + '</strong> - ' + (labels[recordType] || recordType) + ' added', 'blue');
        this._save();
        this._notify();
        this._request('/dogs/' + dogId, {
            method: 'PUT',
            body: JSON.stringify(dog)
        }).catch(function() {});
        return record;
    },

    updateRecord(dogId, recordType, recordId, updates) {
        var dog = this.getDog(dogId);
        if (!dog || !dog.records || !dog.records[recordType]) return null;
        var idx = dog.records[recordType].findIndex(function(r) { return r.id === recordId; });
        if (idx === -1) return null;
        dog.records[recordType][idx] = Object.assign({}, dog.records[recordType][idx], updates);
        this._save();
        this._notify();
        this._request('/dogs/' + dogId, {
            method: 'PUT',
            body: JSON.stringify(dog)
        }).catch(function() {});
        return dog.records[recordType][idx];
    },

    deleteRecord(dogId, recordType, recordId) {
        var dog = this.getDog(dogId);
        if (!dog || !dog.records || !dog.records[recordType]) return;
        dog.records[recordType] = dog.records[recordType].filter(function(r) { return r.id !== recordId; });
        this._save();
        this._notify();
        this._request('/dogs/' + dogId, {
            method: 'PUT',
            body: JSON.stringify(dog)
        }).catch(function() {});
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
                    if (dueDate) upcomingEvents.push({ dogName: d.name, dogId: d.id, type: type, record: r, nextDue: dueDate });
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
        var dogs = this._dogs;
        var typeLabels = { health: 'Health Check', vaccination: 'Vaccination', deworming: 'Deworming', breeding: 'Breeding', heatCycle: 'Heat Cycle', training: 'Training' };

        dogs.forEach(function(d) {
            if (!d.records) return;
            Object.keys(d.records).forEach(function(type) {
                d.records[type].forEach(function(r) {
                    var dueValue = r.nextDue || r.expectedDate || r.nextExpected;
                    if (dueValue) {
                        var dueDate = new Date(dueValue);
                        var days = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
                        if (days <= 30 && days >= 0) {
                            alerts.push({
                                id: 'alert-' + r.id, type: 'warning',
                                severity: days <= 7 ? 'danger' : 'warning',
                                dogId: d.id, dogName: d.name, recordType: type,
                                recordTypeLabel: typeLabels[type] || type, record: r,
                                daysUntilDue: days,
                                message: d.name + "'s " + (typeLabels[type] || type) + ' is due in ' + days + ' days'
                            });
                        }
                        if (days < 0 && days > -30) {
                            alerts.push({
                                id: 'alert-overdue-' + r.id, type: 'danger', severity: 'danger',
                                dogId: d.id, dogName: d.name, recordType: type,
                                recordTypeLabel: typeLabels[type] || type, record: r,
                                daysUntilDue: days,
                                message: d.name + "'s " + (typeLabels[type] || type) + ' is OVERDUE by ' + Math.abs(days) + ' days'
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
