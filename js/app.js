// ===== Application Controller =====
const App = {
    currentPage: 'overview',
    currentDogId: null,
    editingDogId: null,
    editingPuppyId: null,
    editingRecord: null,
    currentDogViewFilters: { gender: '', search: '', sale: '' },
    selectedDogImageFiles: [],
    currentInvoiceEntryId: null,
    pendingDailyReportDogId: null,
    navigationHistory: [],

    // ===== Initialize =====
    init() {
        KennelData.init();
        this.setupNavigation();
        this.setupBrowserNavigation();
        
        this.setupDogForm();
        this.setupRecordForm();
        this.setupDeleteModal();
        this.setupInvoiceModal();
        this.render();

        // Subscribe to data changes
        KennelData.subscribe(() => this.render());
    },

    // ===== Navigation =====
    setupBrowserNavigation() {
        const initialState = window.history.state && window.history.state.page ? window.history.state.page : this.currentPage;
        this.currentPage = initialState;
        window.history.replaceState({ page: this.currentPage }, '', window.location.pathname + window.location.search);

        window.addEventListener('popstate', () => {
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
            if (KennelData.getCurrentUserRole() === 'admin') {
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
                    item.innerHTML = '<label>' + (entry.dogName || 'Dog') + '</label><p>Health: ' + (entry.healthStatus || 'N/A') + ' • Grooming: ' + (entry.groomingStatus || 'N/A') + ' <button type="button" class="btn-text-danger" data-index="' + index + '"><i class="fas fa-times"></i></button></p>';
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
                    item.innerHTML = '<label>' + (entry.puppyName || 'Puppy') + '</label><p>Health: ' + (entry.healthStatus || 'N/A') + ' <button type="button" class="btn-text-danger" data-puppy-index="' + index + '"><i class="fas fa-times"></i></button></p>';
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
                    const healthValue = dogHealth ? dogHealth.value.trim() : '';
                    const groomingValue = dogGrooming ? dogGrooming.value.trim() : '';
                    if (!healthValue && !groomingValue) {
                        Components.toast('Please add at least one status detail.', 'error');
                        return;
                    }
                    dogStatuses.push({ dogId: dogSelect.value, dogName: label, healthStatus: healthValue, groomingStatus: groomingValue });
                    dogHealth.value = '';
                    dogGrooming.value = '';
                    renderStatusList();
                });
            }

            if (addPuppyStatusBtn) {
                addPuppyStatusBtn.addEventListener('click', () => {
                    if (!puppySelect || !puppySelect.value) {
                        Components.toast('Please select a puppy first.', 'error');
                        return;
                    }
                    const label = puppySelect.options[puppySelect.selectedIndex]?.text || 'Puppy';
                    const healthValue = puppyHealth ? puppyHealth.value.trim() : '';
                    if (!healthValue) {
                        Components.toast('Please enter puppy health status.', 'error');
                        return;
                    }
                    puppyStatuses.push({ puppyId: puppySelect.value, puppyName: label, healthStatus: healthValue });
                    puppyHealth.value = '';
                    renderPuppyStatusList();
                });
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    if (!form) return;
                    const dateValue = document.getElementById('dailyReportDate').value;
                    const foodRemainingValue = document.getElementById('dailyReportFoodRemaining').value;
                    const foodTodayValue = document.getElementById('dailyReportFoodToday').value.trim();
                    const kennelsWashedValue = document.getElementById('dailyReportKennelsWashed').checked;
                    const visitorsValue = document.getElementById('dailyReportVisitors').value.trim();
                    const personInChargeValue = document.getElementById('dailyReportPersonInCharge').value.trim();
                    const medicationNotesValue = document.getElementById('dailyReportMedicationNotes').value.trim();
                    const cleaningChecklistValue = document.getElementById('dailyReportCleaningChecklist').value.trim();
                    const staffCommentsValue = document.getElementById('dailyReportStaffComments').value.trim();
                    const notesValue = document.getElementById('dailyReportNotes').value.trim();
                    if (!dateValue) {
                        Components.toast('Please choose a report date.', 'error');
                        return;
                    }
                    const payload = {
                        date: dateValue,
                        foodRemaining: foodRemainingValue,
                        foodToday: foodTodayValue,
                        kennelsWashed: kennelsWashedValue,
                        dogStatuses: dogStatuses,
                        puppyStatuses: puppyStatuses,
                        visitors: visitorsValue,
                        personInCharge: personInChargeValue,
                        medicationNotes: medicationNotesValue,
                        cleaningChecklist: cleaningChecklistValue,
                        staffComments: staffCommentsValue,
                        notes: notesValue
                    };
                    KennelData.addDailyReport(payload).then((result) => {
                        if (!result || !result.ok) {
                            Components.toast(result && result.error ? result.error : 'Unable to save report', 'error');
                            return;
                        }
                        Components.toast('Daily report saved');
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
                        if (!editingPuppyId && savedPuppy && ['Booked', 'Sold'].includes(savedPuppy.saleStatus) && (savedPuppy.saleTotalAmount || savedPuppy.saleReceivedAmount || savedPuppy.saleUnpaidAmount)) {
                            const financeNotes = [];
                            financeNotes.push('Sale status: ' + savedPuppy.saleStatus);
                            if (savedPuppy.saleReceivedAmount !== null && savedPuppy.saleReceivedAmount !== undefined) {
                                financeNotes.push('Received: KSh ' + Number(savedPuppy.saleReceivedAmount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            }
                            if (savedPuppy.saleUnpaidAmount !== null && savedPuppy.saleUnpaidAmount !== undefined) {
                                financeNotes.push('Unpaid: KSh ' + Number(savedPuppy.saleUnpaidAmount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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
                            KennelData.addFinanceEntry(financeEntry).then(function(financeResult) {
                                if (financeResult && !financeResult.ok) {
                                    Components.toast(financeResult.error || 'Unable to save puppy sale entry', 'error');
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

        if (this.currentPage === 'finance') {
            const form = document.getElementById('financeForm');
            if (form) {
                form.onsubmit = (e) => {
                    e.preventDefault();
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

    editUser(userId) {
        const user = KennelData.getUsers().find(function(item) { return item.id === userId; });
        if (!user) return;
        const name = window.prompt('User name', user.name || '');
        if (name === null) return;
        const email = window.prompt('Email', user.email || '');
        if (email === null) return;
        const role = window.prompt('Role (admin, reviewer, or staff)', user.role || 'staff');
        if (role === null) return;
        const active = window.confirm('Enable this account?');
        KennelData.updateUser(userId, {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role: role.trim().toLowerCase(),
            active: active
        }).then(function(result) {
            if (result.ok) {
                Components.toast('User updated successfully');
                this.render();
            } else {
                Components.toast(result.error || 'Unable to update user', 'error');
            }
        }.bind(this));
    },

    toggleUserActive(userId) {
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
        const resetForm = document.getElementById('resetForm');
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

        if (resetForm) {
            resetForm.addEventListener('submit', (e) => {
                e.preventDefault();
                KennelData.resetPassword(document.getElementById('resetEmail').value, document.getElementById('resetPassword').value, document.getElementById('resetConfirm').value).then((result) => {
                    if (result.ok) {
                        authMessage.textContent = result.message;
                        authMessage.className = 'auth-message success';
                        this.showLoginView();
                    } else {
                        authMessage.textContent = result.error;
                        authMessage.className = 'auth-message error';
                    }
                });
            });
        }

        const showLogin = document.getElementById('showLogin');
        const showSignup = document.getElementById('showSignup');
        const showResetLink = document.getElementById('showResetLink');
        const loginPanel = document.getElementById('loginForm');
        const signupPanel = document.getElementById('signupForm');
        const resetPanel = document.getElementById('resetForm');
        if (showLogin && showSignup && loginPanel && signupPanel && resetPanel) {
            showLogin.addEventListener('click', () => this.showLoginView());
            showSignup.addEventListener('click', () => {
                showSignup.classList.add('active');
                showLogin.classList.remove('active');
                signupPanel.classList.add('active');
                loginPanel.classList.remove('active');
                resetPanel.classList.remove('active');
                authMessage.textContent = '';
                authMessage.className = 'auth-message';
            });
            if (showResetLink) {
                showResetLink.addEventListener('click', () => {
                    showLogin.classList.remove('active');
                    showSignup.classList.remove('active');
                    resetPanel.classList.add('active');
                    loginPanel.classList.remove('active');
                    signupPanel.classList.remove('active');
                    authMessage.textContent = '';
                    authMessage.className = 'auth-message';
                });
            }
        }
    },

    showLoginView() {
        const showLogin = document.getElementById('showLogin');
        const showSignup = document.getElementById('showSignup');
        const loginPanel = document.getElementById('loginForm');
        const signupPanel = document.getElementById('signupForm');
        const resetPanel = document.getElementById('resetForm');
        const authMessage = document.getElementById('authMessage');
        if (showLogin && showSignup && loginPanel && signupPanel && resetPanel) {
            showLogin.classList.add('active');
            showSignup.classList.remove('active');
            loginPanel.classList.add('active');
            signupPanel.classList.remove('active');
            resetPanel.classList.remove('active');
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

    // ===== Render =====
    render() {
        const main = document.getElementById('mainContent');
        const authScreen = document.getElementById('authScreen');
        const serverState = KennelData.getServerState();
        document.body.classList.toggle('auth-active', !KennelData.isAuthenticated());

        if (!KennelData.isAuthenticated()) {
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

        if (!this.canAccessPage(this.currentPage)) {
            this.currentPage = 'overview';
        }
        this.updateNavigationVisibility();

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
                main.innerHTML = Components.financePage();
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

        // Update badge
        const badge = document.getElementById('totalDogsBadge');
        if (badge) {
            badge.textContent = KennelData.getDogs().length + ' dogs';
        }
    },

    // ===== Dog CRUD =====
    showAddDog() {
        this.editingDogId = null;
        document.getElementById('dogModalTitle').textContent = 'Add New Dog';
        document.getElementById('dogForm').reset();
        document.getElementById('dogId').value = '';
        document.getElementById('forSalePriceRow').style.display = 'none';
        this.selectedDogImageFiles = [];
        const uploadLabel = document.getElementById('dogImageUploadLabel');
        if (uploadLabel) uploadLabel.textContent = 'Choose image files';
        document.getElementById('dogModal').classList.add('open');
    },

    editDog(dogId) {
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
        document.getElementById('dogStatus').value = dog.status || 'Active';
        document.getElementById('dogForSale').checked = dog.forSale || false;
        document.getElementById('dogValue').value = dog.value || '';
        document.getElementById('dogPrice').value = dog.price || '';
        document.getElementById('dogNotes').value = dog.notes || '';
        document.getElementById('dogImage').value = dog.image || '';
        
        document.getElementById('forSalePriceRow').style.display = dog.forSale ? 'block' : 'none';
        document.getElementById('dogModal').classList.add('open');
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

        document.getElementById('dogModalSave').addEventListener('click', () => {
            const form = document.getElementById('dogForm');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const saveDog = (imageValue, attachments) => {
                const dogData = {
                    name: document.getElementById('dogName').value.trim(),
                    breed: document.getElementById('dogBreed').value.trim(),
                    gender: document.getElementById('dogGender').value,
                    dob: document.getElementById('dogDob').value || null,
                    weight: parseFloat(document.getElementById('dogWeight').value) || null,
                    color: document.getElementById('dogColor').value.trim(),
                    microchip: document.getElementById('dogMicrochip').value.trim(),
                    registration: document.getElementById('dogRegistration').value.trim(),
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
                });
            };

            if (this.selectedDogImageFiles.length > 0) {
                const attachments = [];
                let done = 0;
                this.selectedDogImageFiles.forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        attachments.push(reader.result);
                        done += 1;
                        if (done === this.selectedDogImageFiles.length) {
                            saveDog(attachments[0], attachments);
                        }
                    };
                    reader.readAsDataURL(file);
                });
            } else {
                saveDog(document.getElementById('dogImage').value.trim(), []);
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

        const main = document.getElementById('mainContent');
        main.insertAdjacentHTML('beforeend', Components.dogDetailPanel(dog));
        document.body.classList.add('modal-open');

        const overlay = document.getElementById('dogDetailOverlay');
        if (overlay) {
            overlay.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
            overlay.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
        }

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
        KennelData.deletePuppy(puppyId);
        Components.toast('Puppy removed from the list');
        this.render();
    },

    openDailyReportForDog(dogId) {
        this.pendingDailyReportDogId = dogId;
        this.closeDogDetail();
        this.navigate('dailyreport');
        Components.toast('Add health status in Daily Report for this dog.');
    },

    editPuppy(puppyId) {
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
        KennelData.deleteFinanceEntry(entryId);
        Components.toast('Finance entry removed');
        this.render();
    },

    resetAppData() {
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
        const lines = ['date,foodRemaining,foodToday,kennelsWashed,visitors,personInCharge,medicationNotes,cleaningChecklist,staffComments,notes,dogStatuses,puppyStatuses'];
        reports.forEach((report) => {
            const dogStatuses = (report.dogStatuses || []).map(function(item) {
                return (item.dogName || 'Dog') + ': Health=' + (item.healthStatus || 'N/A') + '; Grooming=' + (item.groomingStatus || 'N/A');
            }).join(' | ');
            const puppyStatuses = (report.puppyStatuses || []).map(function(item) {
                return (item.puppyName || 'Puppy') + ': Health=' + (item.healthStatus || 'N/A');
            }).join(' | ');
            const row = [
                (report.date || ''),
                (report.foodRemaining || ''),
                (report.foodToday || ''),
                report.kennelsWashed ? 'Yes' : 'No',
                (report.visitors || ''),
                (report.personInCharge || ''),
                (report.medicationNotes || ''),
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
        invoiceContent.innerHTML = '<div class="invoice-paper"><div class="invoice-header"><div><h3>Bigpaw Kennel</h3><p>Invoice</p></div><div><strong>#INV-' + entry.id + '</strong><p>' + new Date(entry.date).toLocaleDateString() + '</p></div></div><div class="invoice-body"><div><strong>Billed to</strong><p>' + (entry.related || 'Customer') + '</p></div><div><strong>Service</strong><p>' + (entry.category || 'Transaction') + '</p></div><div><strong>Amount</strong><p>' + 'KSh ' + Number(entry.amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</p></div></div><div class="invoice-footer"><p>' + (entry.notes || 'Thank you for your business.') + '</p></div></div>';
    },

    printInvoice() {
        window.print();
    },

    closeInvoiceModal() {
        document.getElementById('invoiceModal').classList.remove('open');
        this.currentInvoiceEntryId = null;
    },

    importData() {
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
        const dog = KennelData.getDog(dogId);
        document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete ${dog.name}? This action cannot be undone.`;
        document.getElementById('deleteModal').classList.add('open');
        document.getElementById('deleteModalConfirm').onclick = () => {
            KennelData.deleteDog(dogId);
            document.getElementById('deleteModal').classList.remove('open');
            Components.toast(`${dog.name} deleted from kennel`);
            this.closeDogDetail();
            this.navigate('mydogs');
        };
    },

    // ===== Records Management =====
    addRecord(dogId, recordType) {
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
    },

    editRecord(dogId, recordType, recordId) {
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
                KennelData.updateRecord(dogId, recordType, recordId, fieldMap);
                Components.toast('Record updated!');
            } else {
                KennelData.addRecord(dogId, recordType, fieldMap);
                Components.toast('Record added!');
            }

            document.getElementById('recordModal').classList.remove('open');
            this.openDogDetail(dogId);
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
        const dog = KennelData.getDog(dogId);
        document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete this record for ${dog.name}?`;
        document.getElementById('deleteModal').classList.add('open');
        document.getElementById('deleteModalConfirm').onclick = () => {
            KennelData.deleteRecord(dogId, recordType, recordId);
            document.getElementById('deleteModal').classList.remove('open');
            Components.toast('Record deleted');
            this.openDogDetail(dogId);
        };
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
    searchDogs(query) {
        this.currentDogViewFilters.search = query || '';
        const genderFilter = document.getElementById('genderFilter')?.value || '';
        const saleFilter = document.getElementById('saleFilter')?.value || '';
        const main = document.getElementById('mainContent');
        main.innerHTML = Components.myDogsPage(genderFilter, this.currentDogViewFilters.search, saleFilter);
    },

    filterDogs() {
        const searchQuery = document.getElementById('dogSearch')?.value || '';
        this.currentDogViewFilters.search = searchQuery;
        this.currentDogViewFilters.gender = document.getElementById('genderFilter')?.value || '';
        this.currentDogViewFilters.sale = document.getElementById('saleFilter')?.value || '';
        const main = document.getElementById('mainContent');
        main.innerHTML = Components.myDogsPage(this.currentDogViewFilters.gender, this.currentDogViewFilters.search, this.currentDogViewFilters.sale);
    }
};

// ===== Initialize App =====
window.App = App;

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

