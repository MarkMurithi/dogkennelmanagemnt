// ===== Application Controller =====
const App = {
    currentPage: 'overview',
    currentDogId: null,
    editingDogId: null,
    editingPuppyId: null,
    editingRecord: null,
    currentDogViewFilters: { gender: '', search: '', sale: '' },
    selectedDogImageFiles: [],
    selectedDogPedigreeCertificate: null,
    existingDogAttachments: [],
    currentInvoiceEntryId: null,
    pendingDailyReportDogId: null,
    navigationHistory: [],
    submissionStatusPollId: null,
    sessionWatchdogId: null,
    dataSyncPollId: null,
    chatPollId: null,
    chatMessages: [],
    chatLastTimestamp: '',
    chatUnreadCount: 0,
    calendarViewYear: null,
    calendarViewMonth: null,
    calendarSelectedDate: null,
    lastFinanceSnapshot: null,
    _settingsDataLoaded: false,
    editingUserId: null,

    // ===== Initialize =====
    init() {
        KennelData.init();
        this.setupNavigation();
        this.setupBrowserNavigation();
        
        this.setupDogForm();
        this.setupRecordForm();
        this.setupDeleteModal();
        this.setupInvoiceModal();
        this.setupDailyReportDetailModal();
        this.render();

        // Subscribe to data changes. Renders are scheduled (coalesced) rather than
        // run synchronously so several near-simultaneous data updates (e.g. a sync
        // that touches multiple collections) only trigger a single page rebuild.
        KennelData.subscribe(() => this._scheduleRender());

        if (KennelData.isAuthenticated()) {
            this.startSubmissionStatusPolling();
            this.startSessionWatchdog();
        }
    },

    startSessionWatchdog() {
        if (this.sessionWatchdogId) {
            clearInterval(this.sessionWatchdogId);
            this.sessionWatchdogId = null;
        }
        if (!KennelData.isAuthenticated()) return;
        this.sessionWatchdogId = window.setInterval(() => {
            if (!KennelData.isAuthenticated()) {
                clearInterval(this.sessionWatchdogId);
                this.sessionWatchdogId = null;
                return;
            }
            KennelData.checkSessionActive().then((active) => {
                if (!active) {
                    clearInterval(this.sessionWatchdogId);
                    this.sessionWatchdogId = null;
                    if (this.submissionStatusPollId) {
                        clearInterval(this.submissionStatusPollId);
                        this.submissionStatusPollId = null;
                    }
                    Components.toast('Your account has been disabled. Please contact the administrator.', 'error');
                    this.render();
                }
            });
        }, 15000);
    },

    startChatPoll() {
        // chatPollId doubles as a generation token: bump it so any in-flight
        // long-poll loop from a previous call recognizes it's been superseded and stops.
        const token = (this.chatPollId || 0) + 1;
        this.chatPollId = token;
        if (!KennelData.isAuthenticated()) { this.chatPollId = null; return; }

        // Initial load (returns immediately, no long-poll wait since there's no "since")
        KennelData.getChatMessages().then((msgs) => {
            if (token !== this.chatPollId) return;
            this.chatMessages = msgs || [];
            if (msgs.length) this.chatLastTimestamp = msgs[msgs.length - 1].createdAt;
            if (this.currentPage === 'chat') this._renderChatMessages();
            this._updateChatNavBadge();
            this._pollChatLoop(token);
        });
    },

    // Long-polls for new chat messages so they arrive the instant they're sent,
    // instead of waiting for a fixed interval. The server holds the request open
    // (up to ~25s) until a new message shows up, then this immediately re-issues
    // the request to keep listening.
    _pollChatLoop(token) {
        if (token !== this.chatPollId) return;
        if (!KennelData.isAuthenticated()) { this.chatPollId = null; return; }

        const startedAt = Date.now();
        KennelData.getChatMessages(this.chatLastTimestamp).then((newMsgs) => {
            if (token !== this.chatPollId) return;

            if (newMsgs && newMsgs.length) {
                this.chatMessages = this.chatMessages.concat(newMsgs);
                this.chatLastTimestamp = this.chatMessages[this.chatMessages.length - 1].createdAt;
                if (this.currentPage === 'chat') {
                    this._appendChatMessages(newMsgs);
                } else {
                    this.chatUnreadCount += newMsgs.length;
                    this._updateChatNavBadge();
                }
            }

            // A genuine long-poll timeout takes several seconds server-side. If the
            // response came back almost instantly with nothing, the request likely
            // failed (offline/unreachable) rather than timed out - back off briefly
            // so we don't hammer the network in a tight loop.
            const elapsed = Date.now() - startedAt;
            const wasLikelyFailure = (!newMsgs || !newMsgs.length) && elapsed < 2000;
            if (wasLikelyFailure) {
                window.setTimeout(() => this._pollChatLoop(token), 3000);
            } else {
                this._pollChatLoop(token);
            }
        });
    },

    _renderChatMessages() {
        const container = document.getElementById('chatMessagesContainer');
        if (!container) return;
        const currentUser = KennelData.getCurrentUser();
        const currentUserId = currentUser ? currentUser.id : '';
        container.innerHTML = '';
        if (!this.chatMessages.length) {
            container.innerHTML = '<div class="chat-empty"><i class="fas fa-comments"></i><p>No messages yet. Send the first one!</p></div>';
            return;
        }
        this.chatMessages.forEach((msg) => {
            container.appendChild(this._buildChatBubble(msg, msg.userId === currentUserId));
        });
        container.scrollTop = container.scrollHeight;
    },

    _appendChatMessages(newMsgs) {
        const container = document.getElementById('chatMessagesContainer');
        if (!container) { this._renderChatMessages(); return; }
        const empty = container.querySelector('.chat-empty');
        if (empty) empty.remove();
        const currentUser = KennelData.getCurrentUser();
        const currentUserId = currentUser ? currentUser.id : '';
        const wasAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
        newMsgs.forEach((msg) => {
            container.appendChild(this._buildChatBubble(msg, msg.userId === currentUserId));
        });
        if (wasAtBottom) container.scrollTop = container.scrollHeight;
    },

    _buildChatBubble(msg, isMine) {
        const row = document.createElement('div');
        row.className = 'chat-message-row ' + (isMine ? 'mine' : 'theirs');
        const roleLabel = msg.userRole === 'admin' ? '<span class="chat-role-badge admin">Admin</span>' :
                          msg.userRole === 'reviewer' ? '<span class="chat-role-badge reviewer">Reviewer</span>' :
                          '<span class="chat-role-badge staff">Staff</span>';
        const timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const dateStr = msg.createdAt ? new Date(msg.createdAt).toLocaleDateString() : '';
        row.innerHTML =
            '<div class="chat-bubble">' +
            '<div class="chat-meta">' + (isMine ? '' : '<strong>' + Components.escapeHtml(msg.userName) + '</strong> ' + roleLabel + ' · ') + '<span class="chat-time">' + dateStr + ' ' + timeStr + '</span></div>' +
            '<div class="chat-text">' + Components.escapeHtml(msg.content) + '</div>' +
            '</div>';
        return row;
    },

    _updateChatNavBadge() {
        const navItem = document.querySelector('.nav-item[data-page="chat"]');
        if (!navItem) return;
        let badge = navItem.querySelector('.chat-nav-badge');
        if (this.chatUnreadCount > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-nav-badge';
                navItem.appendChild(badge);
            }
            badge.textContent = this.chatUnreadCount > 9 ? '9+' : String(this.chatUnreadCount);
        } else {
            if (badge) badge.remove();
        }
    },

    sendChatMessage() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const content = input.value.trim();
        if (!content) return;
        input.value = '';
        input.disabled = true;
        KennelData.sendChatMessage(content).then((result) => {
            input.disabled = false;
            input.focus();
            if (!result || !result.ok) {
                Components.toast(result && result.error ? result.error : 'Unable to send message.', 'error');
                input.value = content;
                return;
            }
            const newMsg = result.message;
            this.chatMessages.push(newMsg);
            this.chatLastTimestamp = newMsg.createdAt;
            this._appendChatMessages([newMsg]);
        });
    },

    _setupChatInput() {
        const input = document.getElementById('chatInput');
        const sendBtn = document.getElementById('chatSendBtn');
        if (!input || !sendBtn) return;
        sendBtn.addEventListener('click', () => this.sendChatMessage());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChatMessage();
            }
        });
        input.focus();
    },

    startSubmissionStatusPolling() {
        if (this.submissionStatusPollId) {
            clearInterval(this.submissionStatusPollId);
            this.submissionStatusPollId = null;
        }
        if (!KennelData.isAuthenticated()) {
            return;
        }
        KennelData.loadMySubmissions({ primeStatusCache: true }).catch(function() {});
        this.submissionStatusPollId = window.setInterval(() => {
            if (!KennelData.isAuthenticated()) {
                return;
            }
            KennelData.pollSubmissionUpdates().then((updates) => {
                if (!Array.isArray(updates) || updates.length === 0) {
                    return;
                }
                updates.forEach((item) => {
                    const label = item.label || item.entityType || 'submission';
                    if (item.status === 'approved') {
                        Components.toast('Approved: ' + label);
                    } else if (item.status === 'rejected') {
                        const reason = item.reviewNotes ? (' - ' + item.reviewNotes) : '';
                        Components.toast('Rejected: ' + label + reason, 'error');
                    }
                });
            }).catch(function() {});
        }, 20000);
    },

    // Periodically pulls fresh dogs/puppies/finance/events/reports/activities from
    // the server so changes made by other users/devices show up automatically,
    // instead of requiring a manual page reload. Uses refreshFromServer (silent),
    // which only triggers a re-render if something actually changed.
    startDataSyncPolling() {
        if (this.dataSyncPollId) {
            clearInterval(this.dataSyncPollId);
            this.dataSyncPollId = null;
        }
        if (!KennelData.isAuthenticated()) {
            return;
        }
        this.dataSyncPollId = window.setInterval(() => {
            if (!KennelData.isAuthenticated()) {
                clearInterval(this.dataSyncPollId);
                this.dataSyncPollId = null;
                return;
            }
            KennelData.refreshFromServer().catch(function() {});
        }, 20000);
    },

    // ===== Navigation =====
    setupBrowserNavigation() {
        const initialState = window.history.state && window.history.state.page ? window.history.state.page : this.currentPage;
        this.currentPage = initialState;
        window.history.replaceState({ page: this.currentPage }, '', window.location.pathname + window.location.search);

        window.addEventListener('popstate', () => {
            // 1. Close any open modal first (highest priority)
            const modalsToCheck = ['dogModal', 'recordModal', 'deleteModal', 'invoiceModal', 'dailyReportDetailModal'];
            for (const id of modalsToCheck) {
                const el = document.getElementById(id);
                if (el && el.classList.contains('open')) {
                    el.classList.remove('open');
                    window.history.pushState({ page: this.currentPage }, '', window.location.pathname + window.location.search);
                    return;
                }
            }

            // 2. Close dog detail panel if open
            if (document.getElementById('dogDetailOverlay')) {
                this.closeDogDetail();
                window.history.pushState({ page: this.currentPage }, '', window.location.pathname + window.location.search);
                return;
            }

            // 3. Navigate back to previous page
            if (this.navigationHistory.length === 0) {
                window.history.replaceState({ page: this.currentPage }, '', window.location.pathname + window.location.search);
                return;
            }

            const previousPage = this.navigationHistory.pop() || this.currentPage;
            if (previousPage && previousPage !== this.currentPage) {
                this.navigate(previousPage, { fromHistory: true });
            } else {
                window.history.replaceState({ page: this.currentPage }, '', window.location.pathname + window.location.search);
            }
        });
    },
    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.navigate(page);
                // Close sidebar on mobile
                document.getElementById('sidebar').classList.remove('open');
            });
        });

        document.getElementById('menuToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        document.getElementById('closeSidebar').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
        });

        document.getElementById('addBtnMobile').addEventListener('click', () => {
            this.showAddDog();
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                KennelData.logoutUser();
                this.render();
            });
        }
    },

    navigate(page, options) {
        const fromHistory = Boolean(options && options.fromHistory);

        if (page !== this.currentPage && document.getElementById('dogDetailOverlay')) {
            this.closeDogDetail();
        }

        if (!this.canAccessPage(page)) {
            Components.toast('You do not have access to that page.', 'error');
            page = 'overview';
        }

        if (page === this.currentPage && !fromHistory) {
            return;
        }

        if (!fromHistory && page !== this.currentPage) {
            if (this.currentPage && this.currentPage !== page) {
                this.navigationHistory.push(this.currentPage);
            }
            window.history.pushState({ page }, '', window.location.pathname + window.location.search);
        }

        this.currentPage = page;

        // Reset settings data load flag when navigating to/from settings
        if (page !== 'settings') {
            this._settingsDataLoaded = false;
            this.editingUserId = null;
        }

        if (page === 'mydogs') {
            const filterOptions = options || {};
            this.currentDogViewFilters = {
                gender: filterOptions.gender || '',
                search: filterOptions.search || '',
                sale: filterOptions.sale || ''
            };
        } else {
            this.currentDogViewFilters = { gender: '', search: '', sale: '' };
        }

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });
        this.render();
        window.scrollTo(0, 0);
    },

    setupPageInteractions() {
        if (this.currentPage === 'settings') {
            if (KennelData.getCurrentUserRole() === 'admin' && !this._settingsDataLoaded) {
                this._settingsDataLoaded = true;
                KennelData.loadUsers().catch(function() {});
                KennelData.loadPendingApprovals().catch(function() {});
            }
        }

        if (this.currentPage === 'dailyreport') {
            const form = document.getElementById('dailyReportForm');
            const saveBtn = document.getElementById('dailyReportSave');
            const addDogStatusBtn = document.getElementById('dailyReportAddDogStatus');
            const addPuppyStatusBtn = document.getElementById('dailyReportAddPuppyStatus');
            const statusList = document.getElementById('dailyReportStatusList');
            const puppyStatusList = document.getElementById('dailyReportPuppyStatusList');
            const dogSelect = document.getElementById('dailyReportDogSelect');
            const dogHealth = document.getElementById('dailyReportDogHealth');
            const dogGrooming = document.getElementById('dailyReportDogGrooming');
            let dogMedication = document.getElementById('dailyReportDogMedication');

            // Show/hide kennels washed times
            const kennelsWashedCheckbox = document.getElementById('dailyReportKennelsWashed');
            const kennelsWashedTimesGroup = document.getElementById('kennelsWashedTimesGroup');
            if (kennelsWashedCheckbox && kennelsWashedTimesGroup) {
                kennelsWashedCheckbox.addEventListener('change', () => {
                    kennelsWashedTimesGroup.style.display = kennelsWashedCheckbox.checked ? '' : 'none';
                });
            }
            const legacyMedicationNotes = document.getElementById('dailyReportMedicationNotes');
            if (legacyMedicationNotes) {
                const legacyMedicationGroup = legacyMedicationNotes.closest('.form-group');
                if (legacyMedicationGroup) legacyMedicationGroup.remove();
            }
            document.querySelectorAll('#pageDailyReport .detail-info-item label').forEach((label) => {
                if (label.textContent.trim().toLowerCase() === 'medication notes') {
                    const legacyMedicationItem = label.closest('.detail-info-item');
                    if (legacyMedicationItem) legacyMedicationItem.remove();
                }
            });
            if (!dogMedication && dogGrooming) {
                const groomingGroup = dogGrooming.closest('.form-group');
                if (groomingGroup) {
                    groomingGroup.insertAdjacentHTML('afterend', '<div class="form-group"><label for="dailyReportDogMedication">Medication</label><input type="text" id="dailyReportDogMedication" placeholder="Medication and dose given"></div>');
                    dogMedication = document.getElementById('dailyReportDogMedication');
                }
            }
            const puppySelect = document.getElementById('dailyReportPuppySelect');
            const puppyHealth = document.getElementById('dailyReportPuppyHealth');
            let dogStatuses = [];
            let puppyStatuses = [];

            if (dogSelect && this.pendingDailyReportDogId) {
                dogSelect.value = this.pendingDailyReportDogId;
                this.pendingDailyReportDogId = null;
                if (dogHealth) {
                    setTimeout(function() { dogHealth.focus(); }, 0);
                }
            }

            const renderStatusList = () => {
                if (!statusList) return;
                statusList.innerHTML = '';
                if (dogStatuses.length === 0) {
                    statusList.innerHTML = '<p style="color:var(--gray-500)">No dog statuses added yet.</p>';
                    return;
                }
                dogStatuses.forEach((entry, index) => {
                    const item = document.createElement('div');
                    item.className = 'detail-info-item';
                    const dogName = Components.escapeHtml(entry.dogName || 'Dog');
                    const healthStatus = Components.escapeHtml(entry.healthStatus || 'N/A');
                    const groomingStatus = Components.escapeHtml(entry.groomingStatus || 'N/A');
                    const medication = entry.medication ? (' • Medication: ' + Components.escapeHtml(entry.medication)) : '';
                    item.innerHTML = '<label>' + dogName + '</label><p>Health: ' + healthStatus + ' • Grooming: ' + groomingStatus + medication + ' <button type="button" class="btn-text-danger" data-index="' + index + '"><i class="fas fa-times"></i></button></p>';
                    statusList.appendChild(item);
                });
                statusList.querySelectorAll('button[data-index]').forEach((button) => {
                    button.addEventListener('click', () => {
                        dogStatuses.splice(Number(button.dataset.index), 1);
                        renderStatusList();
                    });
                });
            };

            const renderPuppyStatusList = () => {
                if (!puppyStatusList) return;
                puppyStatusList.innerHTML = '';
                if (puppyStatuses.length === 0) {
                    puppyStatusList.innerHTML = '<p style="color:var(--gray-500)">No puppy statuses added yet.</p>';
                    return;
                }
                puppyStatuses.forEach((entry, index) => {
                    const item = document.createElement('div');
                    item.className = 'detail-info-item';
                    const puppyName = Components.escapeHtml(entry.puppyName || 'Puppy');
                    const puppyHealth = Components.escapeHtml(entry.healthStatus || 'N/A');
                    const puppyMedNote = entry.medication ? (' • Medication: ' + Components.escapeHtml(entry.medication)) : '';
                    item.innerHTML = '<label>' + puppyName + '</label><p>Health: ' + puppyHealth + puppyMedNote + ' <button type="button" class="btn-text-danger" data-puppy-index="' + index + '"><i class="fas fa-times"></i></button></p>';
                    puppyStatusList.appendChild(item);
                });
                puppyStatusList.querySelectorAll('button[data-puppy-index]').forEach((button) => {
                    button.addEventListener('click', () => {
                        puppyStatuses.splice(Number(button.dataset.puppyIndex), 1);
                        renderPuppyStatusList();
                    });
                });
            };

            if (addDogStatusBtn) {
                addDogStatusBtn.addEventListener('click', () => {
                    if (!dogSelect || !dogSelect.value) {
                        Components.toast('Please select a dog first.', 'error');
                        return;
                    }
                    const label = dogSelect.options[dogSelect.selectedIndex]?.text || 'Dog';
                    const healthValue = dogHealth ? dogHealth.value : '';
                    const groomingValue = dogGrooming ? dogGrooming.value : '';
                    const medicationValue = dogMedication ? dogMedication.value.trim() : '';
                    if (!healthValue && !groomingValue && !medicationValue) {
                        Components.toast('Please add at least one status detail.', 'error');
                        return;
                    }
                    const dogIdValue = dogSelect.value;
                    const personInChargeEl = document.getElementById('dailyReportPersonInCharge');
                    const personInChargeValue = personInChargeEl ? personInChargeEl.value.trim() : '';
                    dogStatuses.push({ dogId: dogIdValue, dogName: label, healthStatus: healthValue, groomingStatus: groomingValue, medication: medicationValue });
                    dogHealth.value = '';
                    dogGrooming.value = '';
                    if (dogMedication) dogMedication.value = '';
                    renderStatusList();

                    // Save this status update immediately so it shows up right away on
                    // the Health Records page and this dog's profile, instead of waiting
                    // for the full Daily Report below to be saved. If a Daily Report is
                    // later submitted with an entry for this dog, its later timestamp
                    // naturally takes over as the current status.
                    KennelData.addDogStatusUpdate({
                        dogId: dogIdValue,
                        dogName: label,
                        healthStatus: healthValue,
                        groomingStatus: groomingValue,
                        medication: medicationValue,
                        personInCharge: personInChargeValue
                    }).then((result) => {
                        if (!result || !result.ok) {
                            Components.toast((result && result.error) || 'Added to report, but the live health status update failed to save.', 'error');
                            return;
                        }
                        Components.toast(label + '\u2019s health status updated');
                    });
                });
            }

            if (addPuppyStatusBtn) {
                addPuppyStatusBtn.addEventListener('click', () => {
                    if (!puppySelect || !puppySelect.value) {
                        Components.toast('Please select a puppy first.', 'error');
                        return;
                    }
                    const label = puppySelect.options[puppySelect.selectedIndex]?.text || 'Puppy';
                    const healthValue = puppyHealth ? puppyHealth.value : '';
                    const puppyMedEl = document.getElementById('dailyReportPuppyMedication');
                    const puppyMedValue = puppyMedEl ? puppyMedEl.value.trim() : '';
                    if (!healthValue) {
                        Components.toast('Please select puppy health status.', 'error');
                        return;
                    }
                    puppyStatuses.push({ puppyId: puppySelect.value, puppyName: label, healthStatus: healthValue, medication: puppyMedValue });
                    puppyHealth.value = '';
                    if (puppyMedEl) puppyMedEl.value = '';
                    renderPuppyStatusList();
                });
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    if (!this._requireEditAccess()) return;
                    if (!form) return;
                    const dateValue = document.getElementById('dailyReportDate').value;
                    const foodRemainingValue = document.getElementById('dailyReportFoodRemaining').value;
                    const foodTodayValue = document.getElementById('dailyReportFoodToday').value.trim();
                    const puppiesFeedingMorningEl = document.getElementById('dailyReportPuppiesFeedingMorning');
                    const puppiesFeedingAfternoonEl = document.getElementById('dailyReportPuppiesFeedingAfternoon');
                    const puppiesFeedingEveningEl = document.getElementById('dailyReportPuppiesFeedingEvening');
                    const puppiesFeedingNightEl = document.getElementById('dailyReportPuppiesFeedingNight');
                    const puppiesFeedingValue = {
                        morning: puppiesFeedingMorningEl ? puppiesFeedingMorningEl.value.trim() : '',
                        afternoon: puppiesFeedingAfternoonEl ? puppiesFeedingAfternoonEl.value.trim() : '',
                        evening: puppiesFeedingEveningEl ? puppiesFeedingEveningEl.value.trim() : '',
                        night: puppiesFeedingNightEl ? puppiesFeedingNightEl.value.trim() : ''
                    };
                    const kennelsWashedValue = document.getElementById('dailyReportKennelsWashed').checked;
                    const kennelsWashedTimesEl = document.getElementById('dailyReportKennelsWashedTimes');
                    const kennelsWashedTimesValue = kennelsWashedValue && kennelsWashedTimesEl ? kennelsWashedTimesEl.value : '';
                    const visitorsValue = document.getElementById('dailyReportVisitors').value.trim();
                    const personInChargeValue = document.getElementById('dailyReportPersonInCharge').value.trim();
                    const staffCommentsValue = document.getElementById('dailyReportStaffComments').value.trim();
                    if (!dateValue) {
                        Components.toast('Please choose a report date.', 'error');
                        return;
                    }
                    const payload = {
                        date: dateValue,
                        foodRemaining: foodRemainingValue,
                        foodToday: foodTodayValue,
                        puppiesFeeding: puppiesFeedingValue,
                        kennelsWashed: kennelsWashedValue,
                        kennelsWashedTimes: kennelsWashedTimesValue,
                        dogStatuses: dogStatuses,
                        puppyStatuses: puppyStatuses,
                        visitors: visitorsValue,
                        personInCharge: personInChargeValue,
                        staffComments: staffCommentsValue
                    };
                    KennelData.addDailyReport(payload).then((result) => {
                        if (!result || !result.ok) {
                            Components.toast(result && result.error ? result.error : 'Unable to save report', 'error');
                            return;
                        }
                        if (result.pending) {
                            Components.toast('Your daily report is pending admin approval.');
                        } else {
                            Components.toast('Daily report saved');
                        }
                        form.reset();
                        dogStatuses = [];
                        puppyStatuses = [];
                        renderStatusList();
                        renderPuppyStatusList();
                        this.render();
                    });
                });
            }

            renderStatusList();
            renderPuppyStatusList();
        }

        if (this.currentPage === 'puppies') {
            const form = document.getElementById('puppyForm');
            if (form) {
                const puppyIdInput = document.getElementById('puppyId');
                const puppyFormTitle = document.getElementById('puppyFormTitle');
                const puppySubmitBtn = document.getElementById('puppySubmitBtn');
                const puppyCancelEditBtn = document.getElementById('puppyCancelEditBtn');
                const saleStatus = document.getElementById('puppySaleStatus');
                const saleAmountFields = document.getElementById('puppySaleAmountFields');
                const togglePuppySaleFields = () => {
                    const showFields = saleStatus && ['Booked', 'Sold'].includes(saleStatus.value);
                    if (saleAmountFields) {
                        saleAmountFields.style.display = showFields ? 'flex' : 'none';
                    }
                };
                saleStatus.addEventListener('change', togglePuppySaleFields);
                togglePuppySaleFields();

                const setPuppyFormMode = (editing) => {
                    if (puppyFormTitle) {
                        puppyFormTitle.innerHTML = editing ? '<i class="fas fa-edit"></i> Edit Puppy' : '<i class="fas fa-plus"></i> Add Puppy';
                    }
                    if (puppySubmitBtn) {
                        puppySubmitBtn.innerHTML = editing ? '<i class="fas fa-save"></i> Save Changes' : '<i class="fas fa-plus"></i> Add Puppy';
                    }
                    if (puppyCancelEditBtn) {
                        puppyCancelEditBtn.style.display = editing ? '' : 'none';
                    }
                };

                const resetPuppyForm = () => {
                    this.editingPuppyId = null;
                    if (puppyIdInput) puppyIdInput.value = '';
                    form.reset();
                    if (saleStatus) saleStatus.value = 'Available';
                    togglePuppySaleFields();
                    setPuppyFormMode(false);
                };

                if (puppyCancelEditBtn) {
                    puppyCancelEditBtn.onclick = () => resetPuppyForm();
                }

                if (this.editingPuppyId && puppyIdInput) {
                    const existingPuppy = KennelData.getPuppies().find(function(item) { return item.id === this.editingPuppyId; }.bind(this));
                    if (existingPuppy) {
                        puppyIdInput.value = existingPuppy.id;
                    }
                    setPuppyFormMode(Boolean(existingPuppy));
                } else {
                    setPuppyFormMode(false);
                }

                form.onsubmit = (e) => {
                    e.preventDefault();
                    const saleStatusValue = document.getElementById('puppySaleStatus').value;
                    const editingPuppyId = (puppyIdInput && puppyIdInput.value) ? puppyIdInput.value : this.editingPuppyId;
                    const puppyData = {
                        name: document.getElementById('puppyName').value.trim(),
                        dob: document.getElementById('puppyDob').value || null,
                        gender: document.getElementById('puppyGender').value,
                        collarColor: document.getElementById('puppyCollarColor').value.trim(),
                        saleStatus: saleStatusValue,
                        saleTotalAmount: ['Booked', 'Sold'].includes(saleStatusValue) ? parseFloat(document.getElementById('puppyTotalSaleAmount').value) || null : null,
                        saleReceivedAmount: ['Booked', 'Sold'].includes(saleStatusValue) ? parseFloat(document.getElementById('puppyReceivedAmount').value) || null : null,
                        saleUnpaidAmount: ['Booked', 'Sold'].includes(saleStatusValue) ? parseFloat(document.getElementById('puppyUnpaidAmount').value) || null : null,
                        vaccinations: [{
                            date: document.getElementById('puppyVaccinationDate').value || null,
                            nextDue: document.getElementById('puppyNextVaccination').value || null
                        }],
                        deworming: [{
                            date: document.getElementById('puppyDewormingDate').value || null,
                            nextDue: document.getElementById('puppyNextDeworming').value || null
                        }],
                        father: document.getElementById('puppyFather').value.trim(),
                        mother: document.getElementById('puppyMother').value.trim(),
                        sireGrandfather: document.getElementById('puppySireGrandfather').value.trim(),
                        sireGrandmother: document.getElementById('puppySireGrandmother').value.trim(),
                        damGrandfather: document.getElementById('puppyDamGrandfather').value.trim(),
                        damGrandmother: document.getElementById('puppyDamGrandmother').value.trim(),
                        ownerName: document.getElementById('puppyOwnerName').value.trim(),
                        ownerPhone: document.getElementById('puppyOwnerPhone').value.trim(),
                        ownerAddress: document.getElementById('puppyOwnerAddress').value.trim()
                    };

                    if (!puppyData.name || !puppyData.gender) {
                        Components.toast('Please enter a puppy name and gender', 'error');
                        return;
                    }

                    const savePromise = editingPuppyId ? KennelData.updatePuppy(editingPuppyId, puppyData) : KennelData.addPuppy(puppyData);
                    savePromise.then((result) => {
                        if (!result || !result.ok) {
                            Components.toast(result && result.error ? result.error : 'Unable to save puppy', 'error');
                            return;
                        }

                        if (result.pending) {
                            Components.toast('Your puppy submission is pending admin approval.');
                            resetPuppyForm();
                            this.render();
                            return;
                        }

                        const savedPuppy = result.puppy || puppyData;
                        const puppyRefId = savedPuppy.id || editingPuppyId || '';
                        const puppySaleTag = puppyRefId ? ('auto-puppy-sale:' + puppyRefId) : '';
                        const existingPuppySaleEntry = KennelData.getFinanceEntries().find(function(item) {
                            if (!item || item.category !== 'Puppy Sale') {
                                return false;
                            }
                            if (puppySaleTag && String(item.notes || '').indexOf(puppySaleTag) !== -1) {
                                return true;
                            }
                            return item.title === ('Puppy sale - ' + savedPuppy.name) && item.related === savedPuppy.name;
                        });

                        if (savedPuppy && savedPuppy.saleStatus === 'Sold' && (savedPuppy.saleTotalAmount || savedPuppy.saleReceivedAmount || savedPuppy.saleUnpaidAmount)) {
                            const financeNotes = [];
                            financeNotes.push('Sale status: ' + savedPuppy.saleStatus);
                            if (savedPuppy.saleReceivedAmount !== null && savedPuppy.saleReceivedAmount !== undefined) {
                                financeNotes.push('Received: KSh ' + Number(savedPuppy.saleReceivedAmount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            }
                            if (savedPuppy.saleUnpaidAmount !== null && savedPuppy.saleUnpaidAmount !== undefined) {
                                financeNotes.push('Unpaid: KSh ' + Number(savedPuppy.saleUnpaidAmount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            }
                            if (puppySaleTag) {
                                financeNotes.push(puppySaleTag);
                            }

                            const financeEntry = {
                                type: 'sale',
                                title: 'Puppy sale - ' + savedPuppy.name,
                                category: 'Puppy Sale',
                                amount: Number(savedPuppy.saleTotalAmount) || 0,
                                date: new Date().toISOString().slice(0, 10),
                                related: savedPuppy.name,
                                notes: financeNotes.join(' • ')
                            };

                            const addSaleEntry = function() {
                                KennelData.addFinanceEntry(financeEntry).then(function(financeResult) {
                                    if (financeResult && !financeResult.ok) {
                                        Components.toast(financeResult.error || 'Unable to save puppy sale entry', 'error');
                                    }
                                });
                            };

                            if (existingPuppySaleEntry) {
                                KennelData.deleteFinanceEntry(existingPuppySaleEntry.id).then(function(deleteResult) {
                                    if (deleteResult && !deleteResult.ok) {
                                        Components.toast(deleteResult.error || 'Unable to update puppy sale entry', 'error');
                                        return;
                                    }
                                    addSaleEntry();
                                });
                            } else {
                                addSaleEntry();
                            }
                        } else if (existingPuppySaleEntry) {
                            KennelData.deleteFinanceEntry(existingPuppySaleEntry.id).then(function(deleteResult) {
                                if (deleteResult && !deleteResult.ok) {
                                    Components.toast(deleteResult.error || 'Unable to remove puppy sale entry', 'error');
                                }
                            });
                        }

                        Components.toast(editingPuppyId ? (savedPuppy.name + ' updated successfully') : (savedPuppy.name + ' added to the puppy list'));
                        resetPuppyForm();
                        this.render();
                    });
                };
            }
        }

        if (this.currentPage === 'calendar') {
            const eventForm = document.getElementById('calDayEventForm');
            if (eventForm) {
                eventForm.onsubmit = (e) => {
                    e.preventDefault();
                    this.handleAddCalendarEvent();
                };
            }
        }

        if (this.currentPage === 'finance') {
            const form = document.getElementById('financeForm');
            if (form) {
                form.onsubmit = (e) => {
                    e.preventDefault();
                    if (!this._requireEditAccess()) return;
                    const entry = {
                        type: document.getElementById('financeType').value,
                        title: document.getElementById('financeTitle').value.trim(),
                        category: document.getElementById('financeCategory').value.trim(),
                        amount: parseFloat(document.getElementById('financeAmount').value),
                        date: document.getElementById('financeDate').value || new Date().toISOString().slice(0, 10),
                        related: document.getElementById('financeRelated').value,
                        notes: document.getElementById('financeNotes').value.trim()
                    };

                    if (!entry.title || !entry.amount || !entry.date) {
                        Components.toast('Please complete the title, amount, and date fields', 'error');
                        return;
                    }

                    KennelData.addFinanceEntry(entry).then((result) => {
                        if (!result || !result.ok) {
                            Components.toast(result && result.error ? result.error : 'Unable to save transaction', 'error');
                            return;
                        }
                        if (result.pending) {
                            Components.toast('Your transaction is pending admin approval.');
                        } else {
                            Components.toast(entry.type === 'sale' ? 'Sale recorded successfully' : 'Expense recorded successfully');
                        }
                        form.reset();
                        this.render();
                    });
                };
            }
        }
    },

    canAccessPage(page) {
        const role = KennelData.getCurrentUserRole();
        if (page === 'settings' && role !== 'admin') {
            return false;
        }
        if (page === 'finance' && role !== 'admin' && role !== 'reviewer') {
            return false;
        }
        return true;
    },

    updateNavigationVisibility() {
        const role = KennelData.getCurrentUserRole();
        const canAccessFinance = role === 'admin' || role === 'reviewer';
        const canAccessSettings = role === 'admin';

        document.querySelectorAll('.nav-item').forEach((item) => {
            const page = item.dataset.page;
            const shouldShow = page === 'finance' ? canAccessFinance : page === 'settings' ? canAccessSettings : true;
            item.style.display = shouldShow ? '' : 'none';
        });
    },

    // ===== Role Access Guard =====
    _requireEditAccess() {
        if (KennelData.getCurrentUserRole() === 'reviewer') {
            Components.toast('Access denied — reviewers can only view data.', 'error');
            return false;
        }
        return true;
    },

    editUser(userId) {
        if (!this._requireEditAccess()) return;
        this.editingUserId = userId;
        this.render();
    },

    cancelUserEdit() {
        this.editingUserId = null;
        this.render();
    },

    saveUserEdit(userId) {
        if (!this._requireEditAccess()) return;
        const name = document.getElementById('editUserName');
        const email = document.getElementById('editUserEmail');
        const role = document.getElementById('editUserRole');
        const active = document.getElementById('editUserActive');
        if (!name || !email || !role) return;
        if (!name.value.trim() || !email.value.trim()) {
            Components.toast('Name and email are required.', 'error');
            return;
        }
        KennelData.updateUser(userId, {
            name: name.value.trim(),
            email: email.value.trim().toLowerCase(),
            role: role.value,
            active: active ? active.checked : true
        }).then(function(result) {
            if (result.ok) {
                Components.toast('User updated successfully');
                this.editingUserId = null;
                this.render();
            } else {
                Components.toast(result.error || 'Unable to update user', 'error');
            }
        }.bind(this));
    },

    deleteUser(userId) {
        if (!this._requireEditAccess()) return;
        const user = KennelData.getUsers().find(function(item) { return item.id === userId; });
        if (!user) return;
        if (!window.confirm('Delete user ' + (user.name || user.email) + '? This cannot be undone.')) return;
        KennelData.deleteUser(userId).then(function(result) {
            if (result && result.ok) {
                Components.toast('User deleted');
                this.render();
            } else {
                Components.toast((result && result.error) || 'Unable to delete user', 'error');
            }
        }.bind(this));
    },

    toggleUserActive(userId) {
        if (!this._requireEditAccess()) return;
        const user = KennelData.getUsers().find(function(item) { return item.id === userId; });
        if (!user) return;
        KennelData.updateUser(userId, { active: !Boolean(user.active) }).then(function(result) {
            if (result.ok) {
                Components.toast('User status updated');
                this.render();
            } else {
                Components.toast(result.error || 'Unable to update user', 'error');
            }
        }.bind(this));
    },

    approvePendingApproval(approvalId) {
        if (!this._requireEditAccess()) return;
        if (!window.confirm('Approve this pending submission?')) {
            return;
        }
        KennelData.approvePendingApproval(approvalId).then(function(result) {
            if (result.ok) {
                Components.toast('Submission approved');
                this.render();
            } else {
                Components.toast(result.error || 'Unable to approve submission', 'error');
            }
        }.bind(this));
    },

    rejectPendingApproval(approvalId) {
        if (!this._requireEditAccess()) return;
        const notes = window.prompt('Add a rejection note', 'Rejected');
        if (notes === null) {
            return;
        }
        KennelData.rejectPendingApproval(approvalId, notes).then(function(result) {
            if (result.ok) {
                Components.toast('Submission rejected');
                this.render();
            } else {
                Components.toast(result.error || 'Unable to reject submission', 'error');
            }
        }.bind(this));
    },

    handleCreateUser(event) {
        event.preventDefault();
        if (!this._requireEditAccess()) return;
        const nameInput = document.getElementById('newUserName');
        const emailInput = document.getElementById('newUserEmail');
        const passwordInput = document.getElementById('newUserPassword');
        const roleInput = document.getElementById('newUserRole');

        const payload = {
            name: nameInput.value.trim(),
            email: emailInput.value.trim().toLowerCase(),
            password: passwordInput.value,
            role: roleInput.value,
            active: true
        };
        if (!payload.name || !payload.email || !payload.password) {
            Components.toast('Please complete all user fields', 'error');
            return;
        }
        KennelData.createUser(payload).then(function(result) {
            if (result.ok) {
                Components.toast('User created successfully');
                document.getElementById('createUserForm').reset();
                nameInput.value = '';
                emailInput.value = '';
                passwordInput.value = '';
                roleInput.value = 'staff';
                this.render();
            } else {
                Components.toast(result.error || 'Unable to create user', 'error');
            }
        }.bind(this));
    },

    setupAuthForm() {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const authMessage = document.getElementById('authMessage');

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                KennelData.loginUser(document.getElementById('loginIdentifier').value, document.getElementById('loginPassword').value, document.getElementById('rememberMe').checked).then((result) => {
                    if (result.ok) {
                        authMessage.textContent = 'Signed in successfully.';
                        authMessage.className = 'auth-message success';
                        this.currentPage = 'overview';
                        this.render();
                    } else {
                        authMessage.textContent = result.error;
                        authMessage.className = 'auth-message error';
                    }
                });
            });
        }

        if (signupForm) {
            signupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const password = document.getElementById('signupPassword').value;
                const confirm = document.getElementById('signupConfirm').value;
                if (password !== confirm) {
                    authMessage.textContent = 'Passwords do not match.';
                    authMessage.className = 'auth-message error';
                    return;
                }
                KennelData.signupUser({
                    name: document.getElementById('signupName').value,
                    email: document.getElementById('signupEmail').value,
                    password: password
                }, document.getElementById('signupRememberMe').checked).then((result) => {
                    if (result.ok) {
                        authMessage.textContent = 'Account created. Welcome to Bigpaw Kennel.';
                        authMessage.className = 'auth-message success';
                        this.currentPage = 'overview';
                        this.render();
                    } else {
                        authMessage.textContent = result.error;
                        authMessage.className = 'auth-message error';
                    }
                });
            });
        }

        const showLogin = document.getElementById('showLogin');
        const showSignup = document.getElementById('showSignup');
        const loginPanel = document.getElementById('loginForm');
        const signupPanel = document.getElementById('signupForm');
        if (showLogin && showSignup && loginPanel && signupPanel) {
            showLogin.addEventListener('click', () => this.showLoginView());
            showSignup.addEventListener('click', () => {
                showSignup.classList.add('active');
                showLogin.classList.remove('active');
                signupPanel.classList.add('active');
                loginPanel.classList.remove('active');
                authMessage.textContent = '';
                authMessage.className = 'auth-message';
            });
        }
    },

    showLoginView() {
        const showLogin = document.getElementById('showLogin');
        const showSignup = document.getElementById('showSignup');
        const loginPanel = document.getElementById('loginForm');
        const signupPanel = document.getElementById('signupForm');
        const authMessage = document.getElementById('authMessage');
        if (showLogin && showSignup && loginPanel && signupPanel) {
            showLogin.classList.add('active');
            showSignup.classList.remove('active');
            loginPanel.classList.add('active');
            signupPanel.classList.remove('active');
            authMessage.textContent = '';
            authMessage.className = 'auth-message';
        }
    },

    animateOverviewCounters() {
        if (this.currentPage !== 'overview') return;
        const counters = document.querySelectorAll('.overview-counter-value');
        counters.forEach((counter, index) => {
            const target = Number(counter.dataset.target || 0);
            const duration = 800 + index * 120;
            let startTime = null;

            const step = (timestamp) => {
                if (!startTime) startTime = timestamp;
                const progress = Math.min(1, (timestamp - startTime) / duration);
                const eased = 1 - Math.pow(1 - progress, 3);
                counter.textContent = Math.round(target * eased);
                if (progress < 1) {
                    window.requestAnimationFrame(step);
                }
            };

            window.requestAnimationFrame(step);
        });
    },

    initKennelCarousel() {
        if (this.currentPage !== 'overview') return;
        const carousel = document.getElementById('kennelCarousel');
        if (!carousel) return;

        const slides = carousel.querySelectorAll('.kc-slide');
        const dots = carousel.querySelectorAll('.kc-dot');
        if (!slides.length) return;

        let current = 0;
        let autoId = null;

        const goTo = (idx) => {
            slides[current].classList.remove('active');
            dots[current] && dots[current].classList.remove('active');
            current = (idx + slides.length) % slides.length;
            slides[current].classList.add('active');
            dots[current] && dots[current].classList.add('active');
        };

        const next = () => goTo(current + 1);
        const prev = () => goTo(current - 1);

        const startAuto = () => {
            stopAuto();
            autoId = window.setInterval(next, 5000);
        };

        const stopAuto = () => {
            if (autoId) { clearInterval(autoId); autoId = null; }
        };

        const kcNext = document.getElementById('kcNext');
        const kcPrev = document.getElementById('kcPrev');
        if (kcNext) kcNext.addEventListener('click', () => { next(); startAuto(); });
        if (kcPrev) kcPrev.addEventListener('click', () => { prev(); startAuto(); });

        dots.forEach((dot) => {
            dot.addEventListener('click', () => { goTo(Number(dot.dataset.dot)); startAuto(); });
        });

        // Touch/swipe support
        let touchStartX = 0;
        carousel.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
        carousel.addEventListener('touchend', (e) => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) { diff > 0 ? next() : prev(); startAuto(); }
        }, { passive: true });

        // Pause on hover
        carousel.addEventListener('mouseenter', stopAuto);
        carousel.addEventListener('mouseleave', startAuto);

        startAuto();
    },

    getFinancePulseState() {
        const summary = KennelData.getFinanceSummary() || {};
        const snapshot = {
            sales: Number(summary.totalSales || 0),
            expenses: Number(summary.totalExpenses || 0),
            net: Number(summary.net || 0),
            margin: Number(summary.profitMargin || 0)
        };

        const previous = this.lastFinanceSnapshot;
        this.lastFinanceSnapshot = snapshot;

        if (!previous) {
            return { sales: false, expenses: false, net: false, margin: false };
        }

        return {
            sales: previous.sales !== snapshot.sales,
            expenses: previous.expenses !== snapshot.expenses,
            net: previous.net !== snapshot.net,
            margin: previous.margin !== snapshot.margin
        };
    },

    // ===== Render =====
    render() {
        const main = document.getElementById('mainContent');
        const authScreen = document.getElementById('authScreen');
        const serverState = KennelData.getServerState();
        if (!document.getElementById('dogDetailOverlay')) {
            document.body.classList.remove('modal-open');
        }
        document.body.classList.toggle('auth-active', !KennelData.isAuthenticated());

        if (!KennelData.isAuthenticated()) {
            if (this.submissionStatusPollId) {
                clearInterval(this.submissionStatusPollId);
                this.submissionStatusPollId = null;
            }
            if (this.sessionWatchdogId) {
                clearInterval(this.sessionWatchdogId);
                this.sessionWatchdogId = null;
            }
            if (this.dataSyncPollId) {
                clearInterval(this.dataSyncPollId);
                this.dataSyncPollId = null;
            }
            if (this.chatPollId) {
                // Setting this to null causes the in-flight long-poll loop (which checks
                // this token before recursing) to stop itself on its next iteration.
                this.chatPollId = null;
            }
            if (authScreen) {
                authScreen.innerHTML = Components.authPage();
            }
            if (main) {
                main.innerHTML = '';
            }
            this.setupAuthForm();
            if (serverState && serverState.message) {
                const authMessage = document.getElementById('authMessage');
                if (authMessage) {
                    authMessage.textContent = serverState.message;
                    authMessage.className = 'auth-message ' + (serverState.status === 'auth' ? 'error' : 'warning');
                }
            }
            return;
        }

        if (authScreen) {
            authScreen.innerHTML = '';
        }

        if (!this.submissionStatusPollId) {
            this.startSubmissionStatusPolling();
        }

        if (!this.sessionWatchdogId) {
            this.startSessionWatchdog();
        }

        if (!this.dataSyncPollId) {
            this.startDataSyncPolling();
        }

        if (!this.chatPollId) {
            this.startChatPoll();
        }

        if (!this.canAccessPage(this.currentPage)) {
            this.currentPage = 'overview';
        }
        this.updateNavigationVisibility();

        // Preserve scroll position when re-rendering the same page (e.g. after a
        // background data sync or polling tick), instead of jumping back to the top.
        const preservedScrollTop = (main && this._lastRenderedPage === this.currentPage) ? main.scrollTop : 0;

        switch(this.currentPage) {
            case 'overview':
                main.innerHTML = Components.overviewPage();
                break;
            case 'mydogs':
                main.innerHTML = Components.myDogsPage(this.currentDogViewFilters.gender, this.currentDogViewFilters.search, this.currentDogViewFilters.sale);
                break;
            case 'puppies':
                main.innerHTML = Components.puppiesPage();
                break;
            case 'finance':
                main.innerHTML = Components.financePage({ pulse: this.getFinancePulseState() });
                break;
            case 'health':
                main.innerHTML = Components.healthRecordsPage();
                break;
            case 'breeding':
                main.innerHTML = Components.breedingPage();
                break;
            case 'calendar':
                main.innerHTML = Components.calendarPage();
                break;
            case 'dailyreport':
                main.innerHTML = Components.dailyReportPage();
                break;
            case 'alerts':
                main.innerHTML = Components.alertsPage();
                break;
            case 'chat':
                this.chatUnreadCount = 0;
                this._updateChatNavBadge();
                main.innerHTML = Components.chatPage(this.chatMessages);
                this._renderChatMessages();
                this._setupChatInput();
                break;
            case 'settings':
                main.innerHTML = Components.settingsPage();
                break;
            default:
                main.innerHTML = Components.overviewPage();
        }
        if (serverState && serverState.status !== 'online') {
            main.innerHTML = Components.serverStatusBanner(serverState) + main.innerHTML;
        }
        this.setupPageInteractions();
        this.animateOverviewCounters();
        this.initKennelCarousel();

        if (preservedScrollTop) {
            main.scrollTop = preservedScrollTop;
        }
        this._lastRenderedPage = this.currentPage;

        // Update badge
        const badge = document.getElementById('totalDogsBadge');
        if (badge) {
            badge.textContent = KennelData.getDogs().length + ' dogs';
        }
    },

    // Coalesces multiple render() triggers that happen close together (e.g. several
    // data-change notifications firing in the same tick) into a single rebuild on
    // the next animation frame, avoiding redundant full-page rebuilds.
    _scheduleRender() {
        if (this._renderScheduled) return;
        this._renderScheduled = true;
        const raf = window.requestAnimationFrame || function(cb) { return window.setTimeout(cb, 16); };
        raf(() => {
            this._renderScheduled = false;
            this.render();
        });
    },

    // ===== Dog CRUD =====
    showAddDog() {
        if (!this._requireEditAccess()) return;
        this.editingDogId = null;
        document.getElementById('dogModalTitle').textContent = 'Add New Dog';
        document.getElementById('dogForm').reset();
        document.getElementById('dogId').value = '';
        document.getElementById('forSalePriceRow').style.display = 'none';
        this.selectedDogImageFiles = [];
        this.selectedDogPedigreeCertificate = null;
        this.existingDogAttachments = [];
        const uploadLabel = document.getElementById('dogImageUploadLabel');
        if (uploadLabel) uploadLabel.textContent = 'Choose image files';
        const certificateLabel = document.getElementById('dogPedigreeCertificateLabel');
        if (certificateLabel) certificateLabel.textContent = 'Choose a certificate file';
        const certificateInput = document.getElementById('dogPedigreeCertificate');
        if (certificateInput) certificateInput.value = '';
        const certificateData = document.getElementById('dogPedigreeCertificateData');
        if (certificateData) certificateData.value = '';
        const certificateName = document.getElementById('dogPedigreeCertificateName');
        if (certificateName) certificateName.value = '';
        document.getElementById('dogModal').classList.add('open');
        window.history.pushState({ page: this.currentPage, modal: 'dogModal' }, '', window.location.pathname + window.location.search);
    },

    editDog(dogId) {
        if (!this._requireEditAccess()) return;
        this.editingDogId = dogId;
        const dog = KennelData.getDog(dogId);
        if (!dog) return;

        document.getElementById('dogModalTitle').textContent = 'Edit Dog';
        document.getElementById('dogId').value = dog.id;
        document.getElementById('dogName').value = dog.name;
        document.getElementById('dogBreed').value = dog.breed;
        document.getElementById('dogGender').value = dog.gender;
        document.getElementById('dogDob').value = dog.dob || '';
        document.getElementById('dogWeight').value = dog.weight || '';
        document.getElementById('dogColor').value = dog.color || '';
        document.getElementById('dogMicrochip').value = dog.microchip || '';
        document.getElementById('dogRegistration').value = dog.registration || '';
        document.getElementById('dogOwnerName').value = dog.ownerName || '';
        document.getElementById('dogOwnerPhone').value = dog.ownerPhone || '';
        document.getElementById('dogOwnerAddress').value = dog.ownerAddress || '';
        document.getElementById('dogPedigreeNotes').value = dog.pedigreeNotes || '';
        this.selectedDogImageFiles = [];
        this.selectedDogPedigreeCertificate = null;
        this.existingDogAttachments = dog.attachments || [];
        const uploadLabel = document.getElementById('dogImageUploadLabel');
        if (uploadLabel) {
            uploadLabel.textContent = this.existingDogAttachments.length > 0
                ? `${this.existingDogAttachments.length} existing image${this.existingDogAttachments.length > 1 ? 's' : ''} on file — choose files to replace them`
                : 'Choose image files';
        }
        const certificateInput = document.getElementById('dogPedigreeCertificate');
        if (certificateInput) certificateInput.value = '';
        document.getElementById('dogPedigreeCertificateData').value = dog.pedigreeCertificate || '';
        document.getElementById('dogPedigreeCertificateName').value = dog.pedigreeCertificateName || '';
        const certificateLabel = document.getElementById('dogPedigreeCertificateLabel');
        if (certificateLabel) {
            certificateLabel.textContent = dog.pedigreeCertificateName ? ('Existing certificate: ' + dog.pedigreeCertificateName) : 'Choose a certificate file';
        }
        document.getElementById('dogStatus').value = dog.status || 'Active';
        document.getElementById('dogForSale').checked = dog.forSale || false;
        document.getElementById('dogValue').value = dog.value || '';
        document.getElementById('dogPrice').value = dog.price || '';
        document.getElementById('dogNotes').value = dog.notes || '';
        document.getElementById('dogImage').value = dog.image || '';
        
        document.getElementById('forSalePriceRow').style.display = dog.forSale ? 'block' : 'none';
        document.getElementById('dogModal').classList.add('open');
        window.history.pushState({ page: this.currentPage, modal: 'dogModal' }, '', window.location.pathname + window.location.search);
    },

    setupDogForm() {
        document.getElementById('dogForSale').addEventListener('change', function() {
            document.getElementById('forSalePriceRow').style.display = this.checked ? 'block' : 'none';
        });

        document.getElementById('dogImageUpload').addEventListener('change', (event) => {
            this.selectedDogImageFiles = Array.from(event.target.files || []);
            const label = document.getElementById('dogImageUploadLabel');
            if (label) {
                label.textContent = this.selectedDogImageFiles.length > 0 ? `${this.selectedDogImageFiles.length} image${this.selectedDogImageFiles.length > 1 ? 's' : ''} selected` : 'Choose image files';
            }
        });

        document.getElementById('dogPedigreeCertificate').addEventListener('change', (event) => {
            this.selectedDogPedigreeCertificate = (event.target.files && event.target.files[0]) ? event.target.files[0] : null;
            const label = document.getElementById('dogPedigreeCertificateLabel');
            if (label) {
                label.textContent = this.selectedDogPedigreeCertificate ? this.selectedDogPedigreeCertificate.name : 'Choose a certificate file';
            }
        });

        document.getElementById('dogModalSave').addEventListener('click', () => {
            const form = document.getElementById('dogForm');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024; // sanity cap on the original file, before compression
            const oversizedFile = this.selectedDogImageFiles.find((file) => file.size > MAX_SOURCE_IMAGE_BYTES);
            if (oversizedFile) {
                Components.toast(`"${oversizedFile.name}" is too large. Please choose a smaller photo.`, 'error');
                return;
            }

            // Photos straight from a phone camera are often 8-20MB, which can make
            // saving slow or get rejected. Resize/re-encode to a reasonable max
            // dimension and JPEG quality client-side so any photo can be saved.
            const compressImageFile = (file, maxDimension, quality) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = () => reject(new Error('read-failed'));
                    reader.onload = () => {
                        const img = new Image();
                        // Some formats the file picker allows (e.g. HEIC/HEIF from iPhones,
                        // certain camera RAW/TIFF variants) can be read as raw bytes by
                        // FileReader but not decoded by <img>/canvas in every browser. Rather
                        // than failing the whole save, fall back to uploading the original,
                        // uncompressed file in that case.
                        img.onerror = () => resolve(reader.result);
                        img.onload = () => {
                            let width = img.naturalWidth || img.width;
                            let height = img.naturalHeight || img.height;
                            if (!width || !height) {
                                resolve(reader.result);
                                return;
                            }
                            if (width > maxDimension || height > maxDimension) {
                                if (width >= height) {
                                    height = Math.round(height * (maxDimension / width));
                                    width = maxDimension;
                                } else {
                                    width = Math.round(width * (maxDimension / height));
                                    height = maxDimension;
                                }
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            try {
                                resolve(canvas.toDataURL('image/jpeg', quality));
                            } catch (err) {
                                resolve(reader.result);
                            }
                        };
                        img.src = reader.result;
                    };
                    reader.readAsDataURL(file);
                });
            };

            const saveBtn = document.getElementById('dogModalSave');
            const saveBtnOriginalHtml = saveBtn ? saveBtn.innerHTML : '';
            const setSaving = (isSaving) => {
                if (!saveBtn) return;
                saveBtn.disabled = isSaving;
                saveBtn.innerHTML = isSaving ? '<i class="fas fa-spinner fa-spin"></i> Saving...' : saveBtnOriginalHtml;
            };
            setSaving(true);

            const saveDog = (imageValue, attachments, pedigreeCertificateValue, pedigreeCertificateNameValue) => {
                const dogData = {
                    name: document.getElementById('dogName').value.trim(),
                    breed: document.getElementById('dogBreed').value.trim(),
                    gender: document.getElementById('dogGender').value,
                    dob: document.getElementById('dogDob').value || null,
                    weight: parseFloat(document.getElementById('dogWeight').value) || null,
                    color: document.getElementById('dogColor').value.trim(),
                    microchip: document.getElementById('dogMicrochip').value.trim(),
                    registration: document.getElementById('dogRegistration').value.trim(),
                    ownerName: document.getElementById('dogOwnerName').value.trim(),
                    ownerPhone: document.getElementById('dogOwnerPhone').value.trim(),
                    ownerAddress: document.getElementById('dogOwnerAddress').value.trim(),
                    pedigreeNotes: document.getElementById('dogPedigreeNotes').value.trim(),
                    pedigreeCertificate: pedigreeCertificateValue || document.getElementById('dogPedigreeCertificateData').value || '',
                    pedigreeCertificateName: pedigreeCertificateNameValue || document.getElementById('dogPedigreeCertificateName').value || '',
                    status: document.getElementById('dogStatus').value,
                    forSale: document.getElementById('dogForSale').checked,
                    value: parseFloat(document.getElementById('dogValue').value) || null,
                    price: document.getElementById('dogForSale').checked ? (parseFloat(document.getElementById('dogPrice').value) || null) : null,
                    notes: document.getElementById('dogNotes').value.trim(),
                    image: imageValue || document.getElementById('dogImage').value.trim(),
                    attachments: attachments || []
                };

                const dogId = document.getElementById('dogId').value;
                const savePromise = dogId ? KennelData.updateDog(dogId, dogData) : KennelData.addDog(dogData);
                savePromise.then((result) => {
                    setSaving(false);
                    if (!result || !result.ok) {
                        Components.toast(result && result.error ? result.error : 'Unable to save dog', 'error');
                        return;
                    }
                    if (result.pending) {
                        Components.toast(dogId ? `${dogData.name} update submitted for admin approval.` : `${dogData.name} submitted for admin approval.`);
                    } else {
                        Components.toast(dogId ? `${dogData.name} updated successfully!` : `${dogData.name} added to kennel!`);
                    }
                    document.getElementById('dogModal').classList.remove('open');
                    this.closeDogDetail();
                    this.render();
                }).catch(() => {
                    setSaving(false);
                    Components.toast('Unable to save dog right now.', 'error');
                });
            };

                const finalizeSave = (imageValue, attachments, pedigreeCertificateValue, pedigreeCertificateNameValue) => {
                    saveDog(imageValue, attachments, pedigreeCertificateValue, pedigreeCertificateNameValue);
                };

            const onFileReadError = (fileName) => {
                setSaving(false);
                Components.toast(`Unable to read "${fileName}". Please try a different file.`, 'error');
            };

            if (this.selectedDogImageFiles.length > 0) {
                const attachments = new Array(this.selectedDogImageFiles.length);
                let done = 0;
                let failed = false;
                this.selectedDogImageFiles.forEach((file, index) => {
                    compressImageFile(file, 1600, 0.82).then((dataUrl) => {
                        if (failed) return;
                        attachments[index] = dataUrl;
                        done += 1;
                        if (done === this.selectedDogImageFiles.length) {
                            const pedigreeFile = this.selectedDogPedigreeCertificate;
                            if (pedigreeFile) {
                                const certificateReader = new FileReader();
                                certificateReader.onerror = () => onFileReadError(pedigreeFile.name);
                                certificateReader.onload = () => finalizeSave(attachments[0], attachments, certificateReader.result, pedigreeFile.name);
                                certificateReader.readAsDataURL(pedigreeFile);
                            } else {
                                finalizeSave(attachments[0], attachments);
                            }
                        }
                    }).catch(() => {
                        if (failed) return;
                        failed = true;
                        onFileReadError(file.name);
                    });
                });
            } else {
                const pedigreeFile = this.selectedDogPedigreeCertificate;
                if (pedigreeFile) {
                    const certificateReader = new FileReader();
                    certificateReader.onerror = () => onFileReadError(pedigreeFile.name);
                    certificateReader.onload = () => saveDog(document.getElementById('dogImage').value.trim(), this.existingDogAttachments, certificateReader.result, pedigreeFile.name);
                    certificateReader.readAsDataURL(pedigreeFile);
                } else {
                    saveDog(document.getElementById('dogImage').value.trim(), this.existingDogAttachments);
                }
            }
        });

        document.getElementById('dogModalCancel').addEventListener('click', () => {
            document.getElementById('dogModal').classList.remove('open');
        });

        document.getElementById('dogModalClose').addEventListener('click', () => {
            document.getElementById('dogModal').classList.remove('open');
        });

        // Close modal on overlay click
        document.getElementById('dogModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('dogModal')) {
                document.getElementById('dogModal').classList.remove('open');
            }
        });
    },

    // ===== Dog Detail =====
    openDogDetail(dogId) {
        this.currentDogId = dogId;
        const dog = KennelData.getDog(dogId);
        if (!dog) return;

        // Remove existing detail overlay if any
        const existing = document.getElementById('dogDetailOverlay');
        if (existing) existing.remove();

        document.body.insertAdjacentHTML('beforeend', Components.dogDetailPanel(dog));
        document.body.classList.add('modal-open');

        // Push a history entry so the back button closes the panel
        window.history.pushState({ page: this.currentPage, panel: 'dogDetail' }, '', window.location.pathname + window.location.search);

        this.setupDetailTabs();
    },

    closeDogDetail() {
        const overlay = document.getElementById('dogDetailOverlay');
        if (overlay) overlay.remove();
        document.body.classList.remove('modal-open');
        this.currentDogId = null;
    },

    setupDetailTabs() {
        document.querySelectorAll('.records-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabKey = tab.dataset.tab;
                document.querySelectorAll('.records-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.records-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.querySelector(`[data-tab-content="${tabKey}"]`).classList.add('active');
            });
        });
    },

    // ===== Toggle For Sale =====
    toggleForSale(dogId) {
        const dog = KennelData.toggleForSale(dogId);
        if (dog) {
            Components.toast(dog.forSale ? `${dog.name} listed for sale!` : `${dog.name} removed from sale`);
            this.openDogDetail(dogId);
            this.render();
        }
    },

    deletePuppy(puppyId) {
        if (!this._requireEditAccess()) return;
        KennelData.deletePuppy(puppyId).then((result) => {
            if (!result || !result.ok) {
                Components.toast(result && result.error ? result.error : 'Unable to remove puppy', 'error');
                return;
            }
            if (result.pending) {
                Components.toast('Puppy removal is pending admin approval.');
                return;
            }
            Components.toast('Puppy removed from the list');
            this.render();
        });
    },

    openDailyReportForDog(dogId) {
        this.pendingDailyReportDogId = dogId;
        this.closeDogDetail();
        this.navigate('dailyreport');
        Components.toast('Add health status in Daily Report for this dog.');
    },

    editPuppy(puppyId) {
        if (!this._requireEditAccess()) return;
        const puppy = KennelData.getPuppies().find(function(item) { return item.id === puppyId; });
        if (!puppy) {
            Components.toast('Unable to find this puppy record.', 'error');
            return;
        }

        this.editingPuppyId = puppyId;
        this.currentPage = 'puppies';
        this.render();

        const vaccinations = (puppy.vaccinations && puppy.vaccinations[0]) ? puppy.vaccinations[0] : {};
        const deworming = (puppy.deworming && puppy.deworming[0]) ? puppy.deworming[0] : {};

        const puppyIdInput = document.getElementById('puppyId');
        if (puppyIdInput) puppyIdInput.value = puppy.id || '';
        const puppyName = document.getElementById('puppyName');
        if (puppyName) puppyName.value = puppy.name || '';
        const puppyDob = document.getElementById('puppyDob');
        if (puppyDob) puppyDob.value = puppy.dob || '';
        const puppyGender = document.getElementById('puppyGender');
        if (puppyGender) puppyGender.value = puppy.gender || '';
        const puppyCollarColor = document.getElementById('puppyCollarColor');
        if (puppyCollarColor) puppyCollarColor.value = puppy.collarColor || '';
        const puppySaleStatus = document.getElementById('puppySaleStatus');
        if (puppySaleStatus) puppySaleStatus.value = puppy.saleStatus || 'Available';
        const puppyTotalSaleAmount = document.getElementById('puppyTotalSaleAmount');
        if (puppyTotalSaleAmount) puppyTotalSaleAmount.value = (puppy.saleTotalAmount !== null && puppy.saleTotalAmount !== undefined) ? puppy.saleTotalAmount : '';
        const puppyReceivedAmount = document.getElementById('puppyReceivedAmount');
        if (puppyReceivedAmount) puppyReceivedAmount.value = (puppy.saleReceivedAmount !== null && puppy.saleReceivedAmount !== undefined) ? puppy.saleReceivedAmount : '';
        const puppyUnpaidAmount = document.getElementById('puppyUnpaidAmount');
        if (puppyUnpaidAmount) puppyUnpaidAmount.value = (puppy.saleUnpaidAmount !== null && puppy.saleUnpaidAmount !== undefined) ? puppy.saleUnpaidAmount : '';
        const puppyVaccinationDate = document.getElementById('puppyVaccinationDate');
        if (puppyVaccinationDate) puppyVaccinationDate.value = vaccinations.date || '';
        const puppyNextVaccination = document.getElementById('puppyNextVaccination');
        if (puppyNextVaccination) puppyNextVaccination.value = vaccinations.nextDue || '';
        const puppyDewormingDate = document.getElementById('puppyDewormingDate');
        if (puppyDewormingDate) puppyDewormingDate.value = deworming.date || '';
        const puppyNextDeworming = document.getElementById('puppyNextDeworming');
        if (puppyNextDeworming) puppyNextDeworming.value = deworming.nextDue || '';
        const puppyFather = document.getElementById('puppyFather');
        if (puppyFather) puppyFather.value = puppy.father || '';
        const puppyMother = document.getElementById('puppyMother');
        if (puppyMother) puppyMother.value = puppy.mother || '';
        const puppySireGrandfather = document.getElementById('puppySireGrandfather');
        if (puppySireGrandfather) puppySireGrandfather.value = puppy.sireGrandfather || '';
        const puppySireGrandmother = document.getElementById('puppySireGrandmother');
        if (puppySireGrandmother) puppySireGrandmother.value = puppy.sireGrandmother || '';
        const puppyDamGrandfather = document.getElementById('puppyDamGrandfather');
        if (puppyDamGrandfather) puppyDamGrandfather.value = puppy.damGrandfather || '';
        const puppyDamGrandmother = document.getElementById('puppyDamGrandmother');
        if (puppyDamGrandmother) puppyDamGrandmother.value = puppy.damGrandmother || '';
        const puppyOwnerName = document.getElementById('puppyOwnerName');
        if (puppyOwnerName) puppyOwnerName.value = puppy.ownerName || '';
        const puppyOwnerPhone = document.getElementById('puppyOwnerPhone');
        if (puppyOwnerPhone) puppyOwnerPhone.value = puppy.ownerPhone || '';
        const puppyOwnerAddress = document.getElementById('puppyOwnerAddress');
        if (puppyOwnerAddress) puppyOwnerAddress.value = puppy.ownerAddress || '';

        if (puppySaleStatus) {
            puppySaleStatus.dispatchEvent(new Event('change'));
        }

        const puppyFormTitle = document.getElementById('puppyFormTitle');
        if (puppyFormTitle) puppyFormTitle.innerHTML = '<i class="fas fa-edit"></i> Edit Puppy';
        const puppySubmitBtn = document.getElementById('puppySubmitBtn');
        if (puppySubmitBtn) puppySubmitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
        const puppyCancelEditBtn = document.getElementById('puppyCancelEditBtn');
        if (puppyCancelEditBtn) puppyCancelEditBtn.style.display = '';

        const form = document.getElementById('puppyForm');
        if (form) {
            form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    deleteFinanceEntry(entryId) {
        if (!this._requireEditAccess()) return;
        KennelData.deleteFinanceEntry(entryId).then((result) => {
            if (!result || !result.ok) {
                Components.toast(result && result.error ? result.error : 'Unable to remove finance entry', 'error');
                return;
            }
            if (result.pending) {
                Components.toast('Finance deletion is pending admin approval.');
                return;
            }
            Components.toast('Finance entry removed');
            this.render();
        });
    },

    resetAppData() {
        if (!this._requireEditAccess()) return;
        if (!window.confirm('This will clear all dogs, puppies, records, and alerts. Continue?')) {
            return;
        }
        KennelData.resetAll();
        this.currentPage = 'overview';
        this.currentDogId = null;
        this.editingDogId = null;
        this.editingRecord = null;
        this.currentDogViewFilters = { gender: '', search: '', sale: '' };
        this.render();
        Components.toast('All kennel data cleared');
    },

    toggleDataVisibility() {
        if (KennelData.getCurrentUserRole() !== 'admin') return;
        const nextHidden = !KennelData.getDataHidden();
        const confirmMessage = nextHidden
            ? 'Hide dogs, puppies, finance, health records, calendar, daily reports and chat from staff and reviewers? Entry forms will remain usable for input.'
            : 'Unhide all data so staff and reviewers can see it again?';
        if (!window.confirm(confirmMessage)) {
            return;
        }
        KennelData.setDataVisibility(nextHidden).then((result) => {
            if (!result || !result.ok) {
                Components.toast((result && result.error) || 'Unable to update data visibility right now.', 'error');
                return;
            }
            Components.toast(nextHidden ? 'Data is now hidden from staff and reviewers' : 'Data is now visible to everyone');
            this.render();
        });
    },

    exportData() {
        const payload = KennelData.exportData();
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bigpaw-kennel-backup.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        Components.toast('Backup exported successfully');
        return payload;
    },

    exportDailyReports() {
        const reports = KennelData.getDailyReports();
        const lines = ['date,foodRemaining,foodToday,puppiesFeedingMorning,puppiesFeedingAfternoon,puppiesFeedingEvening,puppiesFeedingNight,kennelsWashed,visitors,personInCharge,cleaningChecklist,staffComments,notes,dogStatuses,puppyStatuses'];
        reports.forEach((report) => {
            const dogStatuses = (report.dogStatuses || []).map(function(item) {
                return (item.dogName || 'Dog') + ': Health=' + (item.healthStatus || 'N/A') + '; Grooming=' + (item.groomingStatus || 'N/A') + '; Medication=' + (item.medication || 'N/A');
            }).join(' | ');
            const puppyStatuses = (report.puppyStatuses || []).map(function(item) {
                return (item.puppyName || 'Puppy') + ': Health=' + (item.healthStatus || 'N/A');
            }).join(' | ');
            const row = [
                (report.date || ''),
                (report.foodRemaining || ''),
                (report.foodToday || ''),
                (report.puppiesFeeding && report.puppiesFeeding.morning) || '',
                (report.puppiesFeeding && report.puppiesFeeding.afternoon) || '',
                (report.puppiesFeeding && report.puppiesFeeding.evening) || '',
                (report.puppiesFeeding && report.puppiesFeeding.night) || '',
                report.kennelsWashed ? 'Yes' : 'No',
                (report.visitors || ''),
                (report.personInCharge || ''),
                (report.cleaningChecklist || ''),
                (report.staffComments || ''),
                (report.notes || ''),
                dogStatuses,
                puppyStatuses
            ].map(function(value) {
                return '"' + String(value).replace(/"/g, '""') + '"';
            }).join(',');
            lines.push(row);
        });
        const payload = lines.join('\n');
        const blob = new Blob([payload], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bigpaw-daily-reports.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        Components.toast('Daily reports exported successfully');
        return payload;
    },

    exportReport() {
        const payload = KennelData.exportReportCsv();
        const blob = new Blob([payload], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'bigpaw-kennel-report.csv';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        Components.toast('Report exported successfully');
        return payload;
    },

    printFinanceReport() {
        const payload = KennelData.exportPrintableReport();
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) {
            Components.toast('Please allow pop-ups to print the report', 'error');
            return;
        }
        printWindow.document.write('<pre style="font-family:Arial,sans-serif;padding:24px;white-space:pre-wrap">' + payload.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>');
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    },

    openInvoiceModal(entryId) {
        const entry = KennelData.getFinanceEntry(entryId);
        if (!entry) return;

        this.currentInvoiceEntryId = entryId;
        const invoiceContent = document.getElementById('invoiceContent');

        document.getElementById('invoiceModal').classList.add('open');
        window.history.pushState({ page: this.currentPage, modal: 'invoiceModal' }, '', window.location.pathname + window.location.search);
        invoiceContent.innerHTML = '<div class="invoice-paper"><div class="invoice-header"><div><h3>Bigpaw Kennel</h3><p>Invoice</p></div><div><strong>#INV-' + entry.id + '</strong><p>' + new Date(entry.date).toLocaleDateString() + '</p></div></div><div class="invoice-body"><div><strong>Billed to</strong><p>' + (entry.related || 'Customer') + '</p></div><div><strong>Service</strong><p>' + (entry.category || 'Transaction') + '</p></div><div><strong>Amount</strong><p>' + 'KSh ' + Number(entry.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</p></div></div><div class="invoice-footer"><p>' + (entry.notes || 'Thank you for your business.') + '</p></div></div>';
    },

    printInvoice() {
        window.print();
    },

    closeInvoiceModal() {
        document.getElementById('invoiceModal').classList.remove('open');
        this.currentInvoiceEntryId = null;
    },

    // ===== Daily Report Detail Modal =====
    openDailyReportDetail(reportId) {
        const report = KennelData.getDailyReports().find(function(r) { return r.id === reportId; });
        if (!report) {
            Components.toast('Unable to find this report.', 'error');
            return;
        }
        const body = document.getElementById('dailyReportDetailBody');
        if (body) body.innerHTML = Components.dailyReportDetailHtml(report);
        document.getElementById('dailyReportDetailModal').classList.add('open');
        window.history.pushState({ page: this.currentPage, modal: 'dailyReportDetailModal' }, '', window.location.pathname + window.location.search);
    },

    closeDailyReportDetailModal() {
        document.getElementById('dailyReportDetailModal').classList.remove('open');
    },

    setupDailyReportDetailModal() {
        document.getElementById('dailyReportDetailModalCancel').addEventListener('click', () => {
            this.closeDailyReportDetailModal();
        });
        document.getElementById('dailyReportDetailModalClose').addEventListener('click', () => {
            this.closeDailyReportDetailModal();
        });
        document.getElementById('dailyReportDetailModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('dailyReportDetailModal')) {
                this.closeDailyReportDetailModal();
            }
        });
    },

    importData() {
        if (!this._requireEditAccess()) return;
        document.getElementById('importDataInput')?.click();
    },

    handleImportData(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                KennelData.importData(reader.result);
                this.currentPage = 'overview';
                this.currentDogId = null;
                this.editingDogId = null;
                this.editingRecord = null;
                this.currentDogViewFilters = { gender: '', search: '', sale: '' };
                this.render();
                Components.toast('Backup imported successfully');
            } catch (error) {
                Components.toast('Unable to import backup file', 'error');
            }
        };
        reader.readAsText(file);
    },

    // ===== Delete Dog =====
    deleteDogPrompt(dogId) {
        if (!this._requireEditAccess()) return;
        const dog = KennelData.getDog(dogId);
        document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete ${dog.name}? This action cannot be undone.`;
        document.getElementById('deleteModal').classList.add('open');
        window.history.pushState({ page: this.currentPage, modal: 'deleteModal' }, '', window.location.pathname + window.location.search);
        document.getElementById('deleteModalConfirm').onclick = () => {
            KennelData.deleteDog(dogId).then((result) => {
                document.getElementById('deleteModal').classList.remove('open');
                if (!result || !result.ok) {
                    Components.toast(result && result.error ? result.error : 'Unable to remove dog', 'error');
                    return;
                }
                if (result.pending) {
                    Components.toast(`${dog.name} removal is pending admin approval.`);
                    this.closeDogDetail();
                    return;
                }
                Components.toast(`${dog.name} deleted from kennel`);
                this.closeDogDetail();
                this.navigate('mydogs');
            });
        };
    },

    // ===== Records Management =====
    addRecord(dogId, recordType) {
        if (!this._requireEditAccess()) return;
        this.editingRecord = null;
        const recordDogId = document.getElementById('recordDogId');
        const recordTypeInput = document.getElementById('recordType');
        const recordId = document.getElementById('recordId');
        const recordModalTitle = document.getElementById('recordModalTitle');
        const recordFormFields = document.getElementById('recordFormFields');
        const recordModal = document.getElementById('recordModal');

        if (!recordDogId || !recordTypeInput || !recordId || !recordModalTitle || !recordFormFields || !recordModal) {
            Components.toast('Record form is unavailable. Please refresh the page.', 'error');
            return;
        }

        recordDogId.value = dogId;
        recordTypeInput.value = recordType;
        recordId.value = '';
        
        const labels = {
            health: 'Health Record', vaccination: 'Vaccination', deworming: 'Deworming',
            breeding: 'Breeding Record', heatCycle: 'Heat Cycle', training: 'Training Record'
        };
        recordModalTitle.textContent = `Add ${labels[recordType] || 'Record'}`;
        recordFormFields.innerHTML = Components.getRecordFormFields(recordType);
        recordModal.classList.add('open');
        window.history.pushState({ page: this.currentPage, modal: 'recordModal' }, '', window.location.pathname + window.location.search);
    },

    editRecord(dogId, recordType, recordId) {
        if (!this._requireEditAccess()) return;
        const records = KennelData.getRecords(dogId, recordType);
        const record = records.find(r => r.id === recordId);
        if (!record) return;

        const recordDogId = document.getElementById('recordDogId');
        const recordTypeInput = document.getElementById('recordType');
        const recordIdInput = document.getElementById('recordId');
        const recordModalTitle = document.getElementById('recordModalTitle');
        const recordFormFields = document.getElementById('recordFormFields');
        const recordModal = document.getElementById('recordModal');

        if (!recordDogId || !recordTypeInput || !recordIdInput || !recordModalTitle || !recordFormFields || !recordModal) {
            Components.toast('Record form is unavailable. Please refresh the page.', 'error');
            return;
        }

        this.editingRecord = { dogId, recordType, recordId };
        recordDogId.value = dogId;
        recordTypeInput.value = recordType;
        recordIdInput.value = recordId;

        const labels = {
            health: 'Health Record', vaccination: 'Vaccination', deworming: 'Deworming',
            breeding: 'Breeding Record', heatCycle: 'Heat Cycle', training: 'Training Record'
        };
        recordModalTitle.textContent = `Edit ${labels[recordType] || 'Record'}`;
        recordFormFields.innerHTML = Components.getRecordFormFields(recordType, record);
        recordModal.classList.add('open');
        window.history.pushState({ page: this.currentPage, modal: 'recordModal' }, '', window.location.pathname + window.location.search);
    },

    setupRecordForm() {
        document.getElementById('recordModalSave').addEventListener('click', () => {
            const dogId = document.getElementById('recordDogId').value;
            const recordType = document.getElementById('recordType').value;
            const recordId = document.getElementById('recordId').value;

            const formData = {};
            const inputs = document.querySelectorAll('#recordFormFields input, #recordFormFields textarea, #recordFormFields select');

            const fieldMap = {};
            inputs.forEach(input => {
                const id = input.id;
                const value = input.value;
                if (id === 'recDate') fieldMap.date = value;
                else if (id === 'recType') fieldMap.type = value;
                else if (id === 'recVet') fieldMap.vet = value;
                else if (id === 'recBatch') fieldMap.batch = value;
                else if (id === 'recNotes') fieldMap.notes = value;
                else if (id === 'recNextDue') fieldMap.nextDue = value;
                else if (id === 'recExpectedDate') fieldMap.expectedDate = value;
                else if (id === 'recLitterSize') fieldMap.litterSize = value;
                else if (id === 'recPuppiesBorn') fieldMap.puppiesBorn = value;
                else if (id === 'recMate') fieldMap.mate = value;
                else if (id === 'recDam') fieldMap.dam = value;
                else if (id === 'recResult') fieldMap.result = value;
                else if (id === 'recStartDate') fieldMap.startDate = value;
                else if (id === 'recEndDate') fieldMap.endDate = value;
                else if (id === 'recIntensity') fieldMap.intensity = value;
                else if (id === 'recNextExpected') fieldMap.nextExpected = value;
                else if (id === 'recTrainer') fieldMap.trainer = value;
            });

            // Remove empty values
            Object.keys(fieldMap).forEach(key => {
                if (fieldMap[key] === '' || fieldMap[key] === undefined) delete fieldMap[key];
            });

            if (recordType === 'breeding' && fieldMap.expectedDate) {
                fieldMap.nextDue = fieldMap.expectedDate;
            }

            // Validate required date
            const dateField = recordType === 'heatCycle' ? 'startDate' : 'date';
            if (!fieldMap[dateField]) {
                Components.toast('Please fill in the required date field', 'error');
                return;
            }

            if (recordId) {
                KennelData.updateRecord(dogId, recordType, recordId, fieldMap).then((result) => {
                    if (!result || !result.ok) {
                        Components.toast(result && result.error ? result.error : 'Unable to update record', 'error');
                        return;
                    }
                    if (result.pending) {
                        Components.toast('Record update is pending admin approval.');
                    } else {
                        Components.toast('Record updated!');
                    }
                    document.getElementById('recordModal').classList.remove('open');
                    this.openDogDetail(dogId);
                });
            } else {
                KennelData.addRecord(dogId, recordType, fieldMap).then((result) => {
                    if (!result || !result.ok) {
                        Components.toast(result && result.error ? result.error : 'Unable to add record', 'error');
                        return;
                    }
                    if (result.pending) {
                        Components.toast('Record submission is pending admin approval.');
                    } else {
                        Components.toast('Record added!');
                    }
                    document.getElementById('recordModal').classList.remove('open');
                    this.openDogDetail(dogId);
                });
            }
        });

        document.getElementById('recordModalCancel').addEventListener('click', () => {
            document.getElementById('recordModal').classList.remove('open');
        });

        document.getElementById('recordModalClose').addEventListener('click', () => {
            document.getElementById('recordModal').classList.remove('open');
        });

        document.getElementById('recordModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('recordModal')) {
                document.getElementById('recordModal').classList.remove('open');
            }
        });
    },

    deleteRecord(dogId, recordType, recordId) {
        if (!this._requireEditAccess()) return;
        const dog = KennelData.getDog(dogId);
        document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete this record for ${dog.name}?`;
        document.getElementById('deleteModal').classList.add('open');
        window.history.pushState({ page: this.currentPage, modal: 'deleteModal' }, '', window.location.pathname + window.location.search);
        document.getElementById('deleteModalConfirm').onclick = () => {
            KennelData.deleteRecord(dogId, recordType, recordId).then((result) => {
                document.getElementById('deleteModal').classList.remove('open');
                if (!result || !result.ok) {
                    Components.toast(result && result.error ? result.error : 'Unable to delete record', 'error');
                    return;
                }
                if (result.pending) {
                    Components.toast('Record deletion is pending admin approval.');
                } else {
                    Components.toast('Record deleted');
                }
                this.openDogDetail(dogId);
            });
        };
    },

    markAlertDone(dogId, recordType, recordId, dueValue) {
        if (!this._requireEditAccess()) return;
        if (!dogId || !recordType || !recordId) {
            Components.toast('Unable to mark this reminder as done.', 'error');
            return;
        }
        KennelData.markAlertAsDone(dogId, recordType, recordId, dueValue).then((result) => {
            if (!result || !result.ok) {
                Components.toast(result && result.error ? result.error : 'Unable to mark reminder as done', 'error');
                return;
            }
            if (result.pending) {
                Components.toast('Done update submitted for admin approval.');
                return;
            }
            Components.toast('Reminder marked as done.');
            if (this.currentPage === 'alerts' || this.currentPage === 'calendar') {
                this.render();
            }
        });
    },

    markCalendarUpcomingDone(dogId, recordType, recordId, dueValue) {
        this.markAlertDone(dogId, recordType, recordId, dueValue);
    },

    // ===== Calendar (month grid) navigation & custom events =====
    calendarPrevMonth() {
        var now = new Date();
        var year = (typeof this.calendarViewYear === 'number') ? this.calendarViewYear : now.getFullYear();
        var month = (typeof this.calendarViewMonth === 'number') ? this.calendarViewMonth : now.getMonth();
        month -= 1;
        if (month < 0) { month = 11; year -= 1; }
        this.calendarViewYear = year;
        this.calendarViewMonth = month;
        this.render();
    },

    calendarNextMonth() {
        var now = new Date();
        var year = (typeof this.calendarViewYear === 'number') ? this.calendarViewYear : now.getFullYear();
        var month = (typeof this.calendarViewMonth === 'number') ? this.calendarViewMonth : now.getMonth();
        month += 1;
        if (month > 11) { month = 0; year += 1; }
        this.calendarViewYear = year;
        this.calendarViewMonth = month;
        this.render();
    },

    calendarGoToday() {
        var now = new Date();
        this.calendarViewYear = now.getFullYear();
        this.calendarViewMonth = now.getMonth();
        this.calendarSelectedDate = Components.formatDateYMD(now);
        this.render();
    },

    calendarSelectDate(dateStr) {
        if (!dateStr) return;
        this.calendarSelectedDate = dateStr;
        var parts = dateStr.split('-');
        if (parts.length === 3) {
            this.calendarViewYear = parseInt(parts[0], 10);
            this.calendarViewMonth = parseInt(parts[1], 10) - 1;
        }
        this.render();
    },

    handleAddCalendarEvent() {
        if (!this._requireEditAccess()) return;
        const dateInput = document.getElementById('calDayEventDate');
        const titleInput = document.getElementById('calDayEventTitle');
        const notesInput = document.getElementById('calDayEventNotes');
        const dateVal = dateInput ? dateInput.value : this.calendarSelectedDate;
        const titleVal = titleInput ? titleInput.value.trim() : '';

        if (!dateVal || !titleVal) {
            Components.toast('Please enter a title for this event.', 'error');
            return;
        }

        KennelData.addCalendarEvent({
            date: dateVal,
            title: titleVal,
            notes: notesInput ? notesInput.value.trim() : ''
        }).then((result) => {
            if (!result || !result.ok) {
                Components.toast(result && result.error ? result.error : 'Unable to save event right now.', 'error');
                return;
            }
            if (result.pending) {
                Components.toast('Event submitted for admin approval.');
                return;
            }
            Components.toast('Event added to calendar.');
            this.render();
        });
    },

    deleteCalendarEventEntry(id) {
        if (!this._requireEditAccess()) return;
        if (!id || !window.confirm('Delete this event?')) return;
        KennelData.deleteCalendarEvent(id).then((result) => {
            if (!result || !result.ok) {
                Components.toast(result && result.error ? result.error : 'Unable to delete event right now.', 'error');
                return;
            }
            if (result.pending) {
                Components.toast('Event removal submitted for admin approval.');
                return;
            }
            Components.toast('Event removed.');
            this.render();
        });
    },

    postponeCalendarUpcoming(dogId, recordType, recordId, dueField, currentDueValue) {
        if (!this._requireEditAccess()) return;
        if (!dogId || !recordType || !recordId) {
            Components.toast('Unable to postpone this item.', 'error');
            return;
        }

        var baseDate = currentDueValue ? new Date(currentDueValue) : new Date();
        if (Number.isNaN(baseDate.getTime())) {
            baseDate = new Date();
        }
        baseDate.setDate(baseDate.getDate() + 1);
        var defaultDate = baseDate.toISOString().slice(0, 10);
        var newDateValue = window.prompt('Enter new due date (YYYY-MM-DD)', defaultDate);
        if (newDateValue === null) {
            return;
        }
        newDateValue = String(newDateValue).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateValue)) {
            Components.toast('Please enter a valid date in YYYY-MM-DD format.', 'error');
            return;
        }

        var updates = {
            alertDismissedFor: null,
            alertDismissedAt: null
        };
        var dueKey = dueField || 'nextDue';
        updates[dueKey] = newDateValue;

        KennelData.updateRecord(dogId, recordType, recordId, updates).then((result) => {
            if (!result || !result.ok) {
                Components.toast(result && result.error ? result.error : 'Unable to postpone reminder', 'error');
                return;
            }
            if (result.pending) {
                Components.toast('Postpone update submitted for admin approval.');
                return;
            }
            Components.toast('Reminder postponed to ' + newDateValue + '.');
            if (this.currentPage === 'calendar') {
                this.render();
            }
        });
    },

    // ===== Invoice Modal =====
    setupInvoiceModal() {
        document.getElementById('invoiceModalCancel').addEventListener('click', () => {
            this.closeInvoiceModal();
        });
        document.getElementById('invoiceModalClose').addEventListener('click', () => {
            this.closeInvoiceModal();
        });
        document.getElementById('invoiceModalPrint').addEventListener('click', () => {
            this.printInvoice();
        });
        document.getElementById('invoiceModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('invoiceModal')) {
                this.closeInvoiceModal();
            }
        });
    },

    // ===== Delete Modal =====
    setupDeleteModal() {
        document.getElementById('deleteModalCancel').addEventListener('click', () => {
            document.getElementById('deleteModal').classList.remove('open');
        });
        document.getElementById('deleteModalClose').addEventListener('click', () => {
            document.getElementById('deleteModal').classList.remove('open');
        });
        document.getElementById('deleteModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('deleteModal')) {
                document.getElementById('deleteModal').classList.remove('open');
            }
        });
    },

    // ===== Search & Filter =====
    // Updates only the dog-grid contents (not the whole page), so the search input
    // never loses focus/cursor position and typing doesn't feel laggy on large lists.
    _applyDogFilters(genderFilter, searchQuery, saleFilter) {
        const results = Components._buildDogResults(genderFilter, searchQuery, saleFilter);
        const grid = document.querySelector('#pageMyDogs .dog-grid');
        if (grid) grid.innerHTML = results.dogCardsHtml;
        const countBadge = document.querySelector('#pageMyDogs .dog-count-badge');
        if (countBadge) countBadge.textContent = '(' + results.dogs.length + ')';
        const pageEl = document.getElementById('pageMyDogs');
        let emptyEl = pageEl ? pageEl.querySelector('.dog-empty-state') : null;
        if (results.dogs.length === 0) {
            if (!emptyEl && pageEl) {
                pageEl.insertAdjacentHTML('beforeend', results.emptyHtml);
            }
        } else if (emptyEl) {
            emptyEl.remove();
        }
    },

    searchDogs(query) {
        this.currentDogViewFilters.search = query || '';
        // Debounce the (potentially expensive) grid rebuild so it only runs once
        // the user pauses typing, instead of on every single keystroke.
        if (this._dogSearchDebounceId) {
            clearTimeout(this._dogSearchDebounceId);
        }
        this._dogSearchDebounceId = setTimeout(() => {
            this._dogSearchDebounceId = null;
            const genderFilter = document.getElementById('genderFilter')?.value || '';
            const saleFilter = document.getElementById('saleFilter')?.value || '';
            this._applyDogFilters(genderFilter, this.currentDogViewFilters.search, saleFilter);
        }, 150);
    },

    filterDogs() {
        const searchQuery = document.getElementById('dogSearch')?.value || '';
        this.currentDogViewFilters.search = searchQuery;
        this.currentDogViewFilters.gender = document.getElementById('genderFilter')?.value || '';
        this.currentDogViewFilters.sale = document.getElementById('saleFilter')?.value || '';
        this._applyDogFilters(this.currentDogViewFilters.gender, searchQuery, this.currentDogViewFilters.sale);
    }
};

// ===== Initialize App =====
window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

