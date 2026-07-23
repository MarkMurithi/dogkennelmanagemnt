// ===== UI Components =====
const Components = {
    authPage() {
        return '<div class="auth-card">' +
            '<div class="auth-brand"><i class="fas fa-shield-alt"></i><span>Secure access to Bigpaw Kennel</span></div>' +
            '<div class="auth-toggle"><button class="auth-toggle-btn active" id="showLogin">Login</button><button class="auth-toggle-btn" id="showSignup">Sign up</button></div>' +
            '<div class="auth-message" id="authMessage"></div>' +
            '<form id="loginForm" class="auth-form active">' +
            '<div class="form-group"><label for="loginIdentifier">Email or username</label><input type="text" id="loginIdentifier" placeholder="Enter your email or name" required></div>' +
            '<div class="form-group"><label for="loginPassword">Password</label><input type="password" id="loginPassword" placeholder="Enter your password" required></div>' +
            '<div class="auth-inline-row"><label class="checkbox"><input type="checkbox" id="rememberMe"> Remember me</label><button class="auth-link-btn" type="button" id="showResetLink">Forgot password?</button></div>' +
            '<button class="btn btn-primary" style="width:100%" type="submit"><i class="fas fa-sign-in-alt"></i> Sign in</button>' +
            '</form>' +
            '<form id="signupForm" class="auth-form">' +
            '<div class="form-group"><label for="signupName">Full name</label><input type="text" id="signupName" placeholder="Your full name" required></div>' +
            '<div class="form-group"><label for="signupEmail">Email</label><input type="email" id="signupEmail" placeholder="you@example.com" required></div>' +
            '<div class="form-group"><label for="signupPassword">Password</label><input type="password" id="signupPassword" placeholder="Create a password" required></div>' +
            '<div class="form-group"><label for="signupConfirm">Confirm password</label><input type="password" id="signupConfirm" placeholder="Repeat password" required></div>' +
            '<div class="auth-inline-row"><label class="checkbox"><input type="checkbox" id="signupRememberMe"> Remember me</label></div>' +
            '<button class="btn btn-primary" style="width:100%" type="submit"><i class="fas fa-user-plus"></i> Create account</button>' +
            '</form>' +
            '<form id="resetForm" class="auth-form">' +
            '<div class="form-group"><label for="resetEmail">Email</label><input type="email" id="resetEmail" placeholder="you@example.com" required></div>' +
            '<div class="form-group"><label for="resetPassword">New password</label><input type="password" id="resetPassword" placeholder="Choose a new password" required></div>' +
            '<div class="form-group"><label for="resetConfirm">Confirm password</label><input type="password" id="resetConfirm" placeholder="Repeat new password" required></div>' +
            '<button class="btn btn-primary" style="width:100%" type="submit"><i class="fas fa-key"></i> Reset password</button>' +
            '</form>' +
            '</div>';
    },

    toast(message, type) {
        if (type === undefined) type = 'success';
        var container = document.getElementById('toastContainer');
        if (!container) {
            var div = document.createElement('div');
            div.id = 'toastContainer';
            div.className = 'toast-container';
            document.body.appendChild(div);
            container = div;
        }
        var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle' };

        var toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.innerHTML = '<i class="fas ' + (icons[type] || icons.success) + '"></i>' +
            '<span>' + message + '</span>' +
            '<button class="toast-close" onclick="this.parentElement.classList.add(\'removing\');setTimeout(function(){this.parentElement.remove()}.bind(this),300)"><i class="fas fa-times"></i></button>';
        container.appendChild(toast);
        setTimeout(function() {
            if (toast.parentElement) {
                toast.classList.add('removing');
                setTimeout(function() { toast.remove(); }, 300);
            }
        }, 4000);
    },

    statCard: function(icon, value, label, colorClass, clickAction) {
        var cardTag = 'div';
        var cardClass = 'stat-card';
        var clickAttr = '';

        if (clickAction) {
            cardTag = 'button';
            cardClass += ' stat-card-clickable';
            clickAttr = ' type="button" onclick="' + clickAction + '"';
        }

        return '<' + cardTag + ' class="' + cardClass + '"' + clickAttr + '>' +
            '<div class="stat-icon ' + colorClass + '"><i class="fas ' + icon + '"></i></div>' +
            '<div class="stat-info"><h4>' + value + '</h4><p>' + label + '</p></div>' +
            '</' + cardTag + '>';
    },

    calculateAge: function(dob) {
        var birth = new Date(dob);
        var now = new Date();
        var years = now.getFullYear() - birth.getFullYear();
        var months = now.getMonth() - birth.getMonth();
        if (months < 0) { years--; months += 12; }
        if (years === 0) return months + 'mo';
        if (months === 0) return years + 'y';
        return years + 'y ' + months + 'mo';
    },

    timeAgo: function(dateStr) {
        var now = new Date();
        var date = new Date(dateStr);
        var seconds = Math.floor((now - date) / 1000);
        if (seconds < 60) return 'just now';
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        var days = Math.floor(hours / 24);
        if (days < 30) return days + 'd ago';
        var months = Math.floor(days / 30);
        if (months < 12) return months + 'mo ago';
        return Math.floor(months / 12) + 'y ago';
    },

    dogCard: function(dog) {
        var hasImage = dog.image && dog.image.trim() !== '';
        var age = dog.dob ? this.calculateAge(dog.dob) : 'N/A';
        var genderClass = dog.gender === 'Male' ? 'tag-male' : 'tag-female';
        var genderIcon = dog.gender === 'Male' ? 'fa-mars' : 'fa-venus';
        var placeholder = '<div class="dog-card-image-placeholder"><i class="fas fa-dog"></i></div>';
        var imageHtml;
        if (hasImage) {
            imageHtml = '<img class="dog-card-image" src="' + dog.image + '" alt="' + dog.name + '">';
        } else {
            imageHtml = placeholder;
        }
        var saleBadge = dog.forSale ? '<div class="dog-card-sale-badge">For Sale</div>' : '';
        var priceTag = (dog.forSale && dog.price) ? '<span class="tag tag-for-sale">KSh ' + Number(dog.price).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span>' : '';
        var weightHtml = dog.weight ? dog.weight + ' kg' : 'N/A';
        var imageFrame = '<div class="dog-card-image-frame">' + imageHtml + '</div>';

        return '<div class="card dog-card" onclick="App.openDogDetail(\'' + dog.id + '\')">' +
            saleBadge +
            imageFrame +
            '<div class="dog-card-body">' +
            '<div class="dog-card-top">' +
            '<div class="dog-card-name">' + dog.name + '</div>' +
            '<span class="status-pill ' + dog.status.toLowerCase() + '">' + dog.status + '</span>' +
            '</div>' +
            '<div class="dog-card-breed">' + dog.breed + '</div>' +
            '<div class="dog-card-tags">' +
            '<span class="tag ' + genderClass + '"><i class="fas ' + genderIcon + '"></i> ' + dog.gender + '</span>' +
            '<span class="tag tag-' + dog.status.toLowerCase() + '">' + dog.status + '</span>' +
            priceTag +
            '</div></div>' +
            '<div class="dog-card-footer"><span>' + (dog.weight ? dog.weight + ' kg' : 'Weight N/A') + '</span><span>' + age + '</span></div>' +
            '</div>';
    },

    recordItem: function(dogId, recordType, record) {
        var details = '';
        switch(recordType) {
            case 'health':
                details = (record.vet || '') + (record.notes ? ' ' + record.notes : '');
                break;
            case 'vaccination':
                details = record.type + (record.vet ? ' ' + record.vet : '') + (record.batch ? ' Batch: ' + record.batch : '');
                break;
            case 'deworming':
                details = record.type + (record.vet ? ' ' + record.vet : '') + (record.notes ? ' ' + record.notes : '');
                break;
            case 'breeding':
                details = (record.mate ? 'Sire: ' + record.mate : '') + (record.dam ? ' • Dam: ' + record.dam : '') + (record.expectedDate ? ' • Expected: ' + new Date(record.expectedDate).toLocaleDateString() : '') + (record.litterSize ? ' • Litter size: ' + record.litterSize : '') + (record.puppiesBorn ? ' • Born: ' + record.puppiesBorn : '') + (record.result ? ' • Result: ' + record.result : '') + (record.notes ? ' ' + record.notes : '');
                break;
            case 'heatCycle':
                var start = record.startDate ? new Date(record.startDate).toLocaleDateString() : 'N/A';
                var end = record.endDate ? new Date(record.endDate).toLocaleDateString() : 'N/A';
                details = start + ' to ' + end + ' Intensity: ' + (record.intensity || 'N/A') + (record.notes ? ' ' + record.notes : '');
                break;
            case 'training':
                details = record.type + (record.trainer ? ' ' + record.trainer : '') + (record.notes ? ' ' + record.notes : '');
                break;
        }
        var nextDueHtml = '';
        if (record.nextDue) {
            nextDueHtml = '<span style="margin-left:8px;color:var(--warning)"><i class="far fa-calendar-check"></i> Next: ' + new Date(record.nextDue).toLocaleDateString() + '</span>';
        }
        var dateStr = '';
        if (record.date) dateStr = new Date(record.date).toLocaleDateString();
        else if (record.startDate) dateStr = new Date(record.startDate).toLocaleDateString();

        return '<div class="record-item ' + recordType + '">' +
            '<div class="record-info">' +
            '<h4>' + (record.type || 'Record') + ' ' + nextDueHtml + '</h4>' +
            '<p>' + dateStr + (details ? ' ' + details : '') + '</p>' +
            '</div>' +
            '<div class="record-actions">' +
            '<button class="btn-text" onclick="App.editRecord(\'' + dogId + '\',\'' + recordType + '\',\'' + record.id + '\')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn-text-danger" onclick="App.deleteRecord(\'' + dogId + '\',\'' + recordType + '\',\'' + record.id + '\')"><i class="fas fa-trash"></i></button>' +
            '</div>' +
            '</div>';
    },

    recordList: function(dogId, recordType, records, label) {
        if (records.length === 0) {
            return '<div class="record-empty">' +
                '<i class="fas fa-clipboard-list"></i>' +
                '<p>No ' + label.toLowerCase() + ' records yet</p>' +
                '<button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="App.addRecord(\'' + dogId + '\',\'' + recordType + '\')">' +
                '<i class="fas fa-plus"></i> Add ' + label +
                '</button></div>';
        }
        var sortedRecords = records.slice().sort(function(a, b) {
            var aDate = a.nextDue ? new Date(a.nextDue) : (a.date ? new Date(a.date) : (a.startDate ? new Date(a.startDate) : new Date(0)));
            var bDate = b.nextDue ? new Date(b.nextDue) : (b.date ? new Date(b.date) : (b.startDate ? new Date(b.startDate) : new Date(0)));
            return bDate - aDate;
        });
        var items = '';
        for (var i = 0; i < sortedRecords.length; i++) {
            items += this.recordItem(dogId, recordType, sortedRecords[i]);
        }
        return '<div style="margin-bottom:12px">' +
            '<button class="btn btn-primary btn-sm" onclick="App.addRecord(\'' + dogId + '\',\'' + recordType + '\')">' +
            '<i class="fas fa-plus"></i> Add ' + label +
            '</button></div>' +
            '<div class="records-list">' + items + '</div>';
    },

    dogDetailPanel: function(dog) {
        var hasImage = dog.image && dog.image.trim() !== '';
        var age = dog.dob ? this.calculateAge(dog.dob) : 'Unknown';
        var genderIcon = dog.gender === 'Male' ? 'fa-mars' : 'fa-venus';
        var avatarHtml;
        if (hasImage) {
            avatarHtml = '<img class="detail-avatar" src="' + dog.image + '" alt="' + dog.name + '">';
        } else {
            avatarHtml = '<div class="detail-avatar-placeholder"><i class="fas fa-dog"></i></div>';
        }

        var recordTypes = [
            { key: 'health', label: 'Health', icon: 'fa-heartbeat' },
            { key: 'vaccination', label: 'Vaccinations', icon: 'fa-syringe' },
            { key: 'deworming', label: 'Deworming', icon: 'fa-bug' },
            { key: 'breeding', label: 'Breeding', icon: 'fa-dna' },
            { key: 'heatCycle', label: 'Heat Cycles', icon: 'fa-thermometer-half' },
            { key: 'training', label: 'Training', icon: 'fa-graduation-cap' }
        ];
        var filteredRecordTypes = [];
        for (var i = 0; i < recordTypes.length; i++) {
            var rt = recordTypes[i];
            if (rt.key === 'heatCycle' && dog.gender !== 'Female') continue;
            filteredRecordTypes.push(rt);
        }

        var tabsHtml = '';
        var contentsHtml = '';
        for (var i = 0; i < filteredRecordTypes.length; i++) {
            var rt = filteredRecordTypes[i];
            var isActive = i === 0;
            var records = (dog.records && dog.records[rt.key]) || [];
            tabsHtml += '<button class="records-tab' + (isActive ? ' active' : '') + '" data-tab="' + rt.key + '">' +
                '<i class="fas ' + rt.icon + '"></i> ' + rt.label +
                '</button>';
            contentsHtml += '<div class="records-tab-content' + (isActive ? ' active' : '') + '" data-tab-content="' + rt.key + '">' +
                this.recordList(dog.id, rt.key, records, rt.label) +
                '</div>';
        }

        var notesHtml = '';
        if (dog.notes) {
            notesHtml = '<div style="margin-bottom:24px;padding:16px;background:var(--gray-50);border-radius:var(--radius);font-size:0.9rem;color:var(--gray-600)"><strong>Notes:</strong> ' + dog.notes + '</div>';
        }

        var attachmentsHtml = '';
        if (dog.attachments && dog.attachments.length > 0) {
            var thumbs = '';
            for (var a = 0; a < dog.attachments.length; a++) {
                thumbs += '<img class="dog-attachment-thumb" src="' + dog.attachments[a] + '" alt="Dog attachment">';
            }
            attachmentsHtml = '<div style="margin-bottom:24px"><div style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin-bottom:8px">Attachments</div><div class="dog-attachments-row">' + thumbs + '</div></div>';
        }

        var statusClass = 'tag-' + dog.status.toLowerCase();

        return '<div class="dog-detail-overlay open" id="dogDetailOverlay" onclick="if(event.target===this)App.closeDogDetail()">' +
            '<div class="dog-detail-panel">' +
            '<div class="detail-header">' +
            '<button class="detail-close" onclick="App.closeDogDetail()"><i class="fas fa-times"></i></button>' +
            '<div class="detail-header-content">' +
            avatarHtml +
            '<div class="detail-header-info">' +
            '<h2>' + dog.name + '</h2>' +
            '<p>' + dog.breed + ' &bull; ' + age + '</p>' +
            '<div class="detail-header-actions">' +
            '<button class="btn btn-sm" onclick="App.editDog(\'' + dog.id + '\')"><i class="fas fa-edit"></i> Edit</button>' +
            '<button class="btn btn-sm" onclick="App.toggleForSale(\'' + dog.id + '\')">' +
            '<i class="fas ' + (dog.forSale ? 'fa-times-circle' : 'fa-tag') + '"></i> ' +
            (dog.forSale ? 'Remove from Sale' : 'Mark for Sale') +
            '</button>' +
            '<button class="btn btn-sm" style="background:rgba(255,255,255,0.2);color:var(--white);border:1px solid rgba(255,255,255,0.3)" onclick="App.deleteDogPrompt(\'' + dog.id + '\')">' +
            '<i class="fas fa-trash"></i> Delete' +
            '</button></div></div>' +
            '<div class="detail-body">' +
            '<div class="detail-info-grid">' +
            '<div class="detail-info-item"><label>Gender</label><p><i class="fas ' + genderIcon + '"></i> ' + dog.gender + '</p></div>' +
            '<div class="detail-info-item"><label>Date of Birth</label><p>' + (dog.dob ? new Date(dog.dob).toLocaleDateString() : 'N/A') + '</p></div>' +
            '<div class="detail-info-item"><label>Weight</label><p>' + (dog.weight ? dog.weight + ' kg' : 'N/A') + '</p></div>' +
            '<div class="detail-info-item"><label>Color</label><p>' + (dog.color || 'N/A') + '</p></div>' +
            '<div class="detail-info-item"><label>Microchip</label><p>' + (dog.microchip || 'N/A') + '</p></div>' +
            '<div class="detail-info-item"><label>Registration</label><p>' + (dog.registration || 'N/A') + '</p></div>' +
            '<div class="detail-info-item"><label>Status</label><p><span class="tag ' + statusClass + '">' + dog.status + '</span></p></div>' +
            '<div class="detail-info-item"><label>For Sale</label><p>' + (dog.forSale ? (dog.price ? 'KSh ' + Number(dog.price).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Yes') : 'No') + '</p></div>' +
            '</div>' +
            notesHtml +
            attachmentsHtml +
            '<div class="records-section">' +
            '<div class="records-tabs">' + tabsHtml + '</div>' +
            contentsHtml +
            '</div></div></div></div></div></div>';
    },

    overviewPage: function() {
        function formatCurrency(value) {
            return 'KSh ' + Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        var stats = KennelData.getStats();
        var dogs = KennelData.getDogs();
        var activities = KennelData.getActivities(8);
        var alerts = KennelData.getAlerts().slice(0, 5);

        var alertsBadge = '';
        if (alerts.length > 0) {
            alertsBadge = '<span style="background:var(--danger);color:white;padding:2px 8px;border-radius:10px;font-size:0.75rem">' + alerts.length + '</span>';
        }

        var genderBarHtml;
        if (stats.total > 0) {
            var malePct = (stats.males/stats.total*100).toFixed(0);
            var femalePct = (stats.females/stats.total*100).toFixed(0);
            genderBarHtml = '<div class="gender-bar-male" style="width:' + malePct + '%">' + (stats.males > 0 ? stats.males : '') + '</div>' +
                '<div class="gender-bar-female" style="width:' + femalePct + '%">' + (stats.females > 0 ? stats.females : '') + '</div>';
        } else {
            genderBarHtml = '<div style="padding:4px 12px;color:var(--gray-400);font-size:0.8rem">No dogs</div>';
        }

        var ageBarsHtml = '';
        var ageKeys = Object.keys(stats.ageGroups);
        for (var i = 0; i < ageKeys.length; i++) {
            var group = ageKeys[i];
            var count = stats.ageGroups[group];
            var pct = stats.total > 0 ? (count / stats.total * 100) : 0;
            ageBarsHtml += '<div class="age-bar">' +
                '<div class="age-bar-label"><span>' + group + '</span><span>' + count + ' dogs</span></div>' +
                '<div class="age-bar-track"><div class="age-bar-fill" style="width:' + pct + '%"></div>' +
                '</div>';
        }

        var breedChipsHtml = '';
        var breedKeys = Object.keys(stats.breeds);
        for (var i = 0; i < breedKeys.length; i++) {
            var breed = breedKeys[i];
            var count = stats.breeds[breed];
            breedChipsHtml += '<span class="breed-chip">' + breed + ' <span class="count">(' + count + ')</span>';
        }
        if (breedChipsHtml === '') breedChipsHtml = '<p style="color:var(--gray-400)">No breeds registered</p>';

        var activityHtml = '';
        for (var i = 0; i < activities.length; i++) {
            var a = activities[i];
            activityHtml += '<div class="activity-item">' +
                '<div class="activity-dot ' + a.color + '"></div>' +
                '<div class="activity-text">' + a.text + '</div>' +
                '<div class="activity-time">' + this.timeAgo(a.time) + '</div>' +
                '</div>';
        }
        if (activityHtml === '') activityHtml = '<p style="text-align:center;color:var(--gray-400);padding:20px">No recent activity</p>';

        var eventRowsHtml = '';
        for (var i = 0; i < stats.upcomingEvents.length && i < 10; i++) {
            var e = stats.upcomingEvents[i];
            var daysUntil = Math.ceil((new Date(e.nextDue) - new Date()) / (1000*60*60*24));
            var color = daysUntil <= 0 ? 'var(--danger)' : daysUntil <= 7 ? 'var(--warning)' : 'var(--gray-600)';
            var statusText = daysUntil <= 0 ? '(Overdue!)' : daysUntil === 0 ? '(Today!)' : '(' + daysUntil + 'd)';
            eventRowsHtml += '<tr style="border-bottom:1px solid var(--gray-100)">' +
                '<td style="padding:10px 12px;font-weight:500"><a href="#" onclick="App.openDogDetail(\'' + e.dogId + '\');return false" style="color:var(--primary)">' + e.dogName + '</a></td>' +
                '<td style="padding:10px 12px;text-transform:capitalize">' + e.type + '</td>' +
                '<td style="padding:10px 12px">' + (e.record.type || 'Checkup') + '</td>' +
                '<td style="padding:10px 12px;color:' + color + ';font-weight:500">' + new Date(e.nextDue).toLocaleDateString() + ' ' + statusText + '</td>' +
                '</tr>';
        }

        var upcomingTableHtml;
        if (stats.upcomingEvents.length > 0) {
            upcomingTableHtml = '<div class="table-scroll"><table style="width:100%;border-collapse:collapse;font-size:0.9rem">' +
                '<thead><tr style="border-bottom:2px solid var(--gray-200);text-align:left">' +
                '<th style="padding:8px 12px">Dog</th><th style="padding:8px 12px">Type</th><th style="padding:8px 12px">Detail</th><th style="padding:8px 12px">Due Date</th>' +
                '</tr></thead><tbody>' + eventRowsHtml + '</tbody></table></div>';
        } else {
            upcomingTableHtml = '<p style="text-align:center;color:var(--gray-400);padding:20px">No upcoming events</p>';
        }

        var ageEmptyHtml = stats.total === 0 ? '<p style="text-align:center;color:var(--gray-400);padding:20px">No age data available</p>' : '';
        var emptyStateHtml = stats.total === 0 ? '<div class="card section-card full-width"><div class="card-body" style="text-align:center;padding:36px 20px;color:var(--gray-500)"><i class="fas fa-dog" style="font-size:2.2rem;margin-bottom:10px;display:block"></i><p style="margin-bottom:10px">Your kennel is empty. Start by adding your first dog and then build out health, breeding, and puppy records.</p><button class="btn btn-primary" onclick="App.showAddDog()"><i class="fas fa-plus"></i> Add First Dog</button></div></div>' : '';

        return '<div class="page-shell" id="pageOverview">' +
            '<section class="page-hero">' +
            '<div>' +
            '<div class="hero-badge"><i class="fas fa-shield-dog"></i> Kennel Management</div>' +
            '<h2>Welcome back to Bigpaw Kennel</h2>' +
            '<p>Track your dogs, health plans, breeding milestones, and sales activity in one refined command center.</p>' +
            '</div>' +
            '<div class="hero-actions">' +
            '<button class="btn btn-primary" onclick="App.showAddDog()"><i class="fas fa-plus"></i> Add Dog</button>' +
            '<button class="btn btn-secondary" onclick="App.navigate(\'mydogs\')"><i class="fas fa-dog"></i> View Dogs</button>' +
            '</div>' +
            '</section>' +
            '<div class="section-header">' +
            '<h2><i class="fas fa-chart-pie"></i> Kennel Overview</h2>' +
            '<div class="section-badge"><i class="fas fa-circle-notch"></i> Live operations</div>' +
            '</div>' +
            '<div class="stats-grid">' +
            this.statCard('fa-dog', stats.total, 'Total Dogs', 'purple', "App.navigate('mydogs')") +
            this.statCard('fa-mars', stats.males, 'Males', 'blue', "App.navigate('mydogs', { gender: 'Male' })") +
            this.statCard('fa-venus', stats.females, 'Females', 'red', "App.navigate('mydogs', { gender: 'Female' })") +
            this.statCard('fa-tag', stats.forSale, 'For Sale', 'green', "App.navigate('mydogs', { sale: 'sale' })") +
            this.statCard('fa-heart', stats.active, 'Active', 'yellow', "App.navigate('mydogs', { sale: 'active' })") +
            this.statCard('fa-coins', formatCurrency(stats.totalValue), 'Total Value', 'green') +
            '</div>' +
            '<div class="quick-actions">' +
            '<button class="quick-action-btn" onclick="App.showAddDog()"><i class="fas fa-plus-circle"></i> Add New Dog</button>' +
            '<button class="quick-action-btn" onclick="App.navigate(\'mydogs\')"><i class="fas fa-list"></i> View All Dogs</button>' +
            '<button class="quick-action-btn" onclick="App.navigate(\'puppies\')"><i class="fas fa-paw"></i> Manage Puppies</button>' +
            '<button class="quick-action-btn" onclick="App.navigate(\'alerts\')"><i class="fas fa-bell"></i> ' + alertsBadge + ' Alerts</button>' +
            '</div>' +
            '<div class="content-grid">' +
            '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-venus-mars"></i> Gender Distribution</h3></div>' +
            '<div class="card-body"><div class="gender-chart"><div class="gender-bar-track">' + genderBarHtml + '</div></div></div></div>' +
            '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-calendar-alt"></i> Age Distribution</h3></div>' +
            '<div class="card-body">' + ageBarsHtml + ageEmptyHtml + '</div></div>' +
            '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-dna"></i> Breeds</h3></div>' +
            '<div class="card-body"><div class="breed-list">' + breedChipsHtml + '</div></div></div>' +
            '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-clock"></i> Recent Activity</h3></div>' +
            '<div class="card-body"><div class="activity-list">' + activityHtml + '</div></div></div>' +
            emptyStateHtml +
            '<div class="card section-card full-width"><div class="card-header"><h3><i class="far fa-calendar-check"></i> Upcoming Events</h3></div>' +
            '<div class="card-body">' + upcomingTableHtml + '</div></div>' +
            '</div></div>';
    },

    myDogsPage: function(filterGender, searchQuery, saleFilter) {
        if (filterGender === undefined) filterGender = '';
        if (searchQuery === undefined) searchQuery = '';
        if (saleFilter === undefined) saleFilter = '';

        var dogs = KennelData.getDogs();
        if (searchQuery) {
            var q = searchQuery.toLowerCase();
            dogs = dogs.filter(function(d) { return d.name.toLowerCase().indexOf(q) !== -1 || d.breed.toLowerCase().indexOf(q) !== -1; });
        }
        if (filterGender) dogs = dogs.filter(function(d) { return d.gender === filterGender; });
        if (saleFilter === 'sale') dogs = dogs.filter(function(d) { return d.forSale; });
        else if (saleFilter === 'active') dogs = dogs.filter(function(d) { return d.status === 'Active'; });

        dogs.sort(function(a, b) {
            if (a.forSale && !b.forSale) return -1;
            if (!a.forSale && b.forSale) return 1;
            return a.name.localeCompare(b.name);
        });

        var emptyHtml = '';
        if (dogs.length === 0) {
            emptyHtml = '<div style="text-align:center;padding:60px 20px;color:var(--gray-400)">' +
                '<i class="fas fa-dog" style="font-size:3rem;margin-bottom:16px;display:block"></i>' +
                '<p style="font-size:1.1rem">No dogs found</p>' +
                '<button class="btn btn-primary" style="margin-top:16px" onclick="App.showAddDog()">Add Your First Dog</button>' +
                '</div>';
        }

        var dogCardsHtml = '';
        for (var i = 0; i < dogs.length; i++) {
            dogCardsHtml += this.dogCard(dogs[i]);
        }

        return '<div class="page-shell" id="pageMyDogs">' +
            '<section class="page-hero">' +
            '<div>' +
            '<div class="hero-badge"><i class="fas fa-dog"></i> Your kennel</div>' +
            '<h2>Manage your dog portfolio</h2>' +
            '<p>Browse every dog with filters for gender, sale status, and active listings.</p>' +
            '</div>' +
            '<div class="hero-actions"><button class="btn btn-primary" onclick="App.showAddDog()"><i class="fas fa-plus"></i> Add Dog</button></div>' +
            '</section>' +
            '<div class="section-header">' +
            '<h2><i class="fas fa-dog"></i> My Dogs <span style="font-size:0.9rem;font-weight:400;color:var(--gray-500)">(' + dogs.length + ')</span></h2>' +
            '<div class="section-badge"><i class="fas fa-filter"></i> Filtered view</div>' +
            '</div>' +
            '<div class="search-bar">' +
            '<div class="search-input-wrapper"><i class="fas fa-search"></i>' +
            '<input type="text" id="dogSearch" placeholder="Search by name or breed..." value="' + searchQuery + '" oninput="App.searchDogs(this.value)">' +
            '</div>' +
            '<select class="filter-select" id="genderFilter" onchange="App.filterDogs()">' +
            '<option value="">All Genders</option>' +
            '<option value="Male"' + (filterGender === 'Male' ? ' selected' : '') + '>Males Only</option>' +
            '<option value="Female"' + (filterGender === 'Female' ? ' selected' : '') + '>Females Only</option>' +
            '</select>' +
            '<select class="filter-select" id="saleFilter" onchange="App.filterDogs()">' +
            '<option value="">All Dogs</option>' +
            '<option value="active"' + (saleFilter === 'active' ? ' selected' : '') + '>Active Only</option>' +
            '<option value="sale"' + (saleFilter === 'sale' ? ' selected' : '') + '>For Sale</option>' +
            '</select></div>' +
            '<div class="dog-grid">' + dogCardsHtml + '</div>' +
            emptyHtml + '</div>';
    },

    healthRecordsPage: function() {
        var dogs = KennelData.getDogs();
        var cardsHtml = '';

        for (var i = 0; i < dogs.length; i++) {
            var dog = dogs[i];
            var healthRecords = (dog.records && dog.records.health) || [];
            var recordsHtml = '';

            if (healthRecords.length === 0) {
                recordsHtml = '<p style="color:var(--gray-400)">No health records yet.</p>';
            } else {
                for (var j = 0; j < healthRecords.length; j++) {
                    var record = healthRecords[j];
                    recordsHtml += '<div class="alert-item" style="padding:14px 0;border-bottom:1px solid var(--gray-100)">' +
                        '<div class="alert-content">' +
                        '<h4>' + (record.type || 'Checkup') + '</h4>' +
                        '<p>' + (record.vet ? 'Vet: ' + record.vet + ' • ' : '') + (record.notes || 'No notes') + '</p>' +
                        '<p style="font-size:0.8rem;color:var(--gray-400);margin-top:4px">' + (record.date ? new Date(record.date).toLocaleDateString() : 'Date pending') + '</p>' +
                        '</div></div>';
                }
            }

            cardsHtml += '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-heartbeat"></i> ' + dog.name + '</h3></div><div class="card-body">' + recordsHtml + '</div></div>';
        }

        return '<div class="page-shell" id="pageHealth">' +
            '<section class="page-hero">' +
            '<div><div class="hero-badge"><i class="fas fa-heartbeat"></i> Health tracking</div><h2>Monitor every medical milestone</h2><p>Review the latest health and vet visits for each dog in one place.</p></div>' +
            '</section>' +
            '<div class="section-header"><h2><i class="fas fa-heartbeat"></i> Health Records</h2><div class="section-badge"><i class="fas fa-notes-medical"></i> Vet history</div></div>' +
            '<div class="content-grid">' + cardsHtml + '</div></div>';
    },

    breedingPage: function() {
        var dogs = KennelData.getDogs();
        var cardsHtml = '';

        for (var i = 0; i < dogs.length; i++) {
            var dog = dogs[i];
            var breedingRecords = (dog.records && dog.records.breeding) || [];
            var recordsHtml = '';

            if (breedingRecords.length === 0) {
                recordsHtml = '<p style="color:var(--gray-400)">No breeding activity recorded.</p>';
            } else {
                for (var j = 0; j < breedingRecords.length; j++) {
                    var record = breedingRecords[j];
                    recordsHtml += '<div class="alert-item" style="padding:14px 0;border-bottom:1px solid var(--gray-100)">' +
                        '<div class="alert-content">' +
                        '<h4>' + (record.type || 'Breeding') + '</h4>' +
                        '<p>' + (record.mate ? 'Sire: ' + record.mate + ' • ' : '') + (record.dam ? 'Dam: ' + record.dam + ' • ' : '') + (record.expectedDate ? 'Expected: ' + new Date(record.expectedDate).toLocaleDateString() + ' • ' : '') + (record.result || 'Pending result') + '</p>' +
                        '<p style="font-size:0.8rem;color:var(--gray-400);margin-top:4px">' + (record.date ? new Date(record.date).toLocaleDateString() : 'Date pending') + '</p>' +
                        '</div></div>';
                }
            }

            cardsHtml += '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-dna"></i> ' + dog.name + '</h3></div><div class="card-body">' + recordsHtml + '</div></div>';
        }

        return '<div class="page-shell" id="pageBreeding">' +
            '<section class="page-hero">' +
            '<div><div class="hero-badge"><i class="fas fa-dna"></i> Breeding program</div><h2>Track matings, litters, and breeding history</h2><p>Keep breeding records organized for every dog in your kennel.</p></div>' +
            '</section>' +
            '<div class="section-header"><h2><i class="fas fa-dna"></i> Breeding</h2><div class="section-badge"><i class="fas fa-seedling"></i> Family planning</div></div>' +
            '<div class="content-grid">' + cardsHtml + '</div></div>';
    },

    calendarPage: function() {
        var stats = KennelData.getStats();
        var upcomingHtml = '';

        if (stats.upcomingEvents.length === 0) {
            upcomingHtml = '<p style="color:var(--gray-400)">No upcoming items right now.</p>';
        } else {
            for (var i = 0; i < stats.upcomingEvents.length && i < 8; i++) {
                var event = stats.upcomingEvents[i];
                upcomingHtml += '<div class="alert-item" style="padding:14px 0;border-bottom:1px solid var(--gray-100)">' +
                    '<div class="alert-content">' +
                    '<h4>' + event.dogName + '</h4>' +
                    '<p>' + event.type + ' • ' + (event.record.type || 'Upcoming task') + '</p>' +
                    '<p style="font-size:0.8rem;color:var(--gray-400);margin-top:4px">Due ' + new Date(event.nextDue).toLocaleDateString() + '</p>' +
                    '</div></div>';
            }
        }

        return '<div class="page-shell" id="pageCalendar">' +
            '<section class="page-hero">' +
            '<div><div class="hero-badge"><i class="fas fa-calendar-alt"></i> Calendar</div><h2>Stay ahead of health and breeding schedules</h2><p>Review the next care milestones and important dates at a glance.</p></div>' +
            '</section>' +
            '<div class="section-header"><h2><i class="fas fa-calendar-alt"></i> Upcoming Schedule</h2><div class="section-badge"><i class="fas fa-clock"></i> Due soon</div></div>' +
            '<div class="card section-card"><div class="card-body">' + upcomingHtml + '</div></div></div>';
    },

    settingsPage: function() {
        var user = KennelData.getCurrentUser();
        var role = KennelData.getCurrentUserRole();
        var stats = KennelData.getStats() || {};
        var alertsCount = Array.isArray(stats.alerts) ? stats.alerts.length : 0;
        var upcomingCount = Array.isArray(stats.upcomingEvents) ? stats.upcomingEvents.length : 0;
        var adminBadge = role === 'admin' ? '<span class="status-pill active">Admin</span>' : '<span class="status-pill">Staff</span>';
        var summaryCards = '';
        var users = KennelData.getUsers();
        var userRows = '';

        if (!users.length) {
            userRows = '<p style="color:var(--gray-400)">No users yet.</p>';
        } else {
            for (var i = 0; i < users.length; i++) {
                var item = users[i];
                userRows += '<div class="card section-card" style="margin-bottom:10px">' +
                    '<div class="card-body" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
                    '<div><strong>' + (item.name || 'Unnamed user') + '</strong><br><span style="color:var(--gray-500);font-size:0.9rem">' + (item.email || '') + ' • ' + (item.role || 'staff') + '</span></div>' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
                    (item.active === false ? '<span class="status-pill">Disabled</span>' : '<span class="status-pill active">Active</span>') +
                    '<button class="btn btn-sm btn-secondary" onclick="App.toggleUserActive(\'' + item.id + '\')">' + (item.active === false ? 'Enable' : 'Disable') + '</button>' +
                    '<button class="btn btn-sm btn-secondary" onclick="App.editUser(\'' + item.id + '\')">Edit</button>' +
                    '</div></div></div>';
            }
        }

        summaryCards += '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-dog"></i> Kennel overview</h3></div><div class="card-body"><div class="detail-info-grid">' +
            '<div class="detail-info-item"><label>Dogs</label><p>' + KennelData.getDogs().length + '</p></div>' +
            '<div class="detail-info-item"><label>Puppies</label><p>' + KennelData.getPuppies().length + '</p></div>' +
            '<div class="detail-info-item"><label>Alerts</label><p>' + alertsCount + '</p></div>' +
            '<div class="detail-info-item"><label>Upcoming tasks</label><p>' + upcomingCount + '</p></div>' +
            '</div></div></div>';

        summaryCards += '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-user-shield"></i> Account access</h3></div><div class="card-body"><p><strong>' + (user && user.name ? user.name : 'Current user') + '</strong> is signed in as ' + role + '.</p><div style="margin-top:10px">' + adminBadge + '</div><p style="margin-top:12px;color:var(--gray-500)">Admin users can manage full kennel data, while staff accounts have limited access to protected areas.</p></div></div>';

        summaryCards += '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-sync"></i> Data tools</h3></div><div class="card-body"><p>Your kennel data is saved locally and updates automatically as you work.</p>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">' +
            '<button class="btn btn-primary" onclick="App.exportData()"><i class="fas fa-download"></i> Export backup</button>' +
            '<button class="btn btn-secondary" onclick="App.exportReport()"><i class="fas fa-file-csv"></i> Export report</button>' +
            '<button class="btn btn-secondary" onclick="App.importData()"><i class="fas fa-upload"></i> Import backup</button>' +
            '</div>' +
            '<input type="file" id="importDataInput" accept="application/json" style="display:none" onchange="App.handleImportData(this.files[0])">' +
            '<button class="btn btn-secondary" style="margin-top:12px" onclick="App.resetAppData()"><i class="fas fa-trash"></i> Clear all data</button></div></div>';

        summaryCards += '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-users"></i> User management</h3></div><div class="card-body">' +
            '<form id="createUserForm" class="modern-form" onsubmit="App.handleCreateUser(event)">' +
            '<div class="form-row">' +
            '<div class="form-group half"><label>Name</label><input type="text" id="newUserName" required></div>' +
            '<div class="form-group half"><label>Email</label><input type="email" id="newUserEmail" required></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group half"><label>Password</label><input type="password" id="newUserPassword" required></div>' +
            '<div class="form-group half"><label>Role</label><select id="newUserRole"><option value="staff">Staff</option><option value="admin">Admin</option></select></div>' +
            '</div>' +
            '<button class="btn btn-primary" type="submit"><i class="fas fa-user-plus"></i> Create user</button>' +
            '</form>' +
            '<div style="margin-top:16px"><h4 style="margin-bottom:8px">Existing users</h4>' + userRows + '</div></div></div>';

        return '<div class="page-shell" id="pageSettings">' +
            '<section class="page-hero">' +
            '<div><div class="hero-badge"><i class="fas fa-cog"></i> Settings</div><h2>Admin dashboard and workspace controls</h2><p>Monitor kennel health, access permissions, and data operations from one place.</p></div>' +
            '</section>' +
            '<div class="section-header"><h2><i class="fas fa-cog"></i> Admin dashboard</h2><div class="section-badge"><i class="fas fa-sliders-h"></i> Your setup</div></div>' +
            '<div class="content-grid">' + summaryCards + '</div></div>';
    },

    puppiesPage: function() {
        var puppies = KennelData.getPuppies();
        var puppyCardsHtml = '';

        if (puppies.length === 0) {
            puppyCardsHtml = '<div style="text-align:center;padding:40px 20px;color:var(--gray-400)"><i class="fas fa-paw" style="font-size:2.5rem;margin-bottom:12px;display:block"></i><p>No puppies recorded yet.</p></div>';
        } else {
            for (var i = 0; i < puppies.length; i++) {
                var puppy = puppies[i];
                var vaccinationText = (puppy.vaccinations && puppy.vaccinations.length > 0 && puppy.vaccinations[0].date) ? puppy.vaccinations[0].date : 'Not recorded';
                var nextVaccinationText = (puppy.vaccinations && puppy.vaccinations.length > 0 && puppy.vaccinations[0].nextDue) ? puppy.vaccinations[0].nextDue : 'Not scheduled';
                var dewormingText = (puppy.deworming && puppy.deworming.length > 0 && puppy.deworming[0].date) ? puppy.deworming[0].date : 'Not recorded';
                var nextDewormingText = (puppy.deworming && puppy.deworming.length > 0 && puppy.deworming[0].nextDue) ? puppy.deworming[0].nextDue : 'Not scheduled';
                var saleAmountText = (puppy.saleStatus === 'Booked' || puppy.saleStatus === 'Sold') ? '<div class="detail-info-item"><label>Total Sale Amount</label><p>' + (puppy.saleTotalAmount !== undefined && puppy.saleTotalAmount !== null && puppy.saleTotalAmount !== '' ? 'KSh ' + Number(puppy.saleTotalAmount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A') + '</p></div>' + '<div class="detail-info-item"><label>Received Amount</label><p>' + (puppy.saleReceivedAmount !== undefined && puppy.saleReceivedAmount !== null && puppy.saleReceivedAmount !== '' ? 'KSh ' + Number(puppy.saleReceivedAmount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A') + '</p></div>' + '<div class="detail-info-item"><label>Unpaid Amount</label><p>' + (puppy.saleUnpaidAmount !== undefined && puppy.saleUnpaidAmount !== null && puppy.saleUnpaidAmount !== '' ? 'KSh ' + Number(puppy.saleUnpaidAmount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A') + '</p></div>' : '';

                puppyCardsHtml += '<div class="card section-card">' +
                    '<div class="card-header"><h3><i class="fas fa-paw"></i> ' + puppy.name + '</h3><button class="btn btn-sm btn-secondary" onclick="App.deletePuppy(\'' + puppy.id + '\')"><i class="fas fa-trash"></i></button></div>' +
                    '<div class="card-body">' +
                    '<div class="detail-info-grid">' +
                    '<div class="detail-info-item"><label>Date of Birth</label><p>' + (puppy.dob ? new Date(puppy.dob).toLocaleDateString() : 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Gender</label><p>' + (puppy.gender || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Sale Status</label><p>' + (puppy.saleStatus || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Father</label><p>' + (puppy.father || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Mother</label><p>' + (puppy.mother || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Sire\'s Father</label><p>' + (puppy.sireGrandfather || puppy.grandfather || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Sire\'s Mother</label><p>' + (puppy.sireGrandmother || puppy.grandmother || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Dam\'s Father</label><p>' + (puppy.damGrandfather || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Dam\'s Mother</label><p>' + (puppy.damGrandmother || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Owner Name</label><p>' + (puppy.ownerName || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Phone Number</label><p>' + (puppy.ownerPhone || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Address</label><p>' + (puppy.ownerAddress || 'N/A') + '</p></div>' +
                    '<div class="detail-info-item"><label>Vaccination</label><p>' + vaccinationText + '</p></div>' +
                    '<div class="detail-info-item"><label>Next Vaccination</label><p>' + nextVaccinationText + '</p></div>' +
                    '<div class="detail-info-item"><label>Deworming</label><p>' + dewormingText + '</p></div>' +
                    '<div class="detail-info-item"><label>Next Deworming</label><p>' + nextDewormingText + '</p></div>' +
                    saleAmountText +
                    '</div></div></div>';
            }
        }

        return '<div class="page-shell" id="pagePuppies">' +
            '<section class="page-hero">' +
            '<div><div class="hero-badge"><i class="fas fa-paw"></i> Puppy management</div><h2>Record every new puppy in your kennel</h2><p>Add new litters, track vaccination schedules, and keep sale status organized.</p></div>' +
            '</section>' +
            '<div class="section-header"><h2><i class="fas fa-paw"></i> Puppies</h2><div class="section-badge"><i class="fas fa-plus-circle"></i> Add new litter</div></div>' +
            '<div class="card section-card" style="margin-bottom:24px">' +
            '<div class="card-header"><h3><i class="fas fa-plus"></i> Add Puppy</h3></div>' +
            '<div class="card-body">' +
            '<form id="puppyForm" class="modern-form">' +
            '<div class="form-row">' +
            '<div class="form-group half"><label for="puppyName">Name *</label><input type="text" id="puppyName" required></div>' +
            '<div class="form-group half"><label for="puppyDob">Date of Birth</label><input type="date" id="puppyDob"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group half"><label for="puppyGender">Gender *</label><select id="puppyGender" required><option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option></select></div>' +
            '<div class="form-group half"><label for="puppySaleStatus">Sale Status</label><select id="puppySaleStatus"><option value="Available">Available</option><option value="Booked">Booked</option><option value="Sold">Sold</option></select></div>' +
            '</div>' +
            '<div class="form-row" id="puppySaleAmountFields" style="display:none">' +
            '<div class="form-group half"><label for="puppyTotalSaleAmount">Total Sale Amount (KSh)</label><input type="number" step="0.01" min="0" id="puppyTotalSaleAmount" placeholder="250000"></div>' +
            '<div class="form-group half"><label for="puppyReceivedAmount">Received Amount (KSh)</label><input type="number" step="0.01" min="0" id="puppyReceivedAmount" placeholder="100000"></div>' +
            '<div class="form-group half"><label for="puppyUnpaidAmount">Unpaid Amount (KSh)</label><input type="number" step="0.01" min="0" id="puppyUnpaidAmount" placeholder="150000"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group half"><label for="puppyVaccinationDate">Vaccination Date</label><input type="date" id="puppyVaccinationDate"></div>' +
            '<div class="form-group half"><label for="puppyNextVaccination">Next Vaccination</label><input type="date" id="puppyNextVaccination"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group half"><label for="puppyDewormingDate">Deworming Date</label><input type="date" id="puppyDewormingDate"></div>' +
            '<div class="form-group half"><label for="puppyNextDeworming">Next Deworming</label><input type="date" id="puppyNextDeworming"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group half"><label for="puppyFather">Father</label><input type="text" id="puppyFather" placeholder="Father"></div>' +
            '<div class="form-group half"><label for="puppyMother">Mother</label><input type="text" id="puppyMother" placeholder="Mother"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group half"><label for="puppySireGrandfather">Sire\'s Father</label><input type="text" id="puppySireGrandfather" placeholder="Sire\'s father"></div>' +
            '<div class="form-group half"><label for="puppySireGrandmother">Sire\'s Mother</label><input type="text" id="puppySireGrandmother" placeholder="Sire\'s mother"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group half"><label for="puppyDamGrandfather">Dam\'s Father</label><input type="text" id="puppyDamGrandfather" placeholder="Dam\'s father"></div>' +
            '<div class="form-group half"><label for="puppyDamGrandmother">Dam\'s Mother</label><input type="text" id="puppyDamGrandmother" placeholder="Dam\'s mother"></div>' +
            '</div>' +
            '<div class="form-row">' +
            '<div class="form-group half"><label for="puppyOwnerName">Owner Name</label><input type="text" id="puppyOwnerName" placeholder="Owner name"></div>' +
            '<div class="form-group half"><label for="puppyOwnerPhone">Phone Number</label><input type="tel" id="puppyOwnerPhone" placeholder="Phone number"></div>' +
            '</div>' +
            '<div class="form-group"><label for="puppyOwnerAddress">Address</label><input type="text" id="puppyOwnerAddress" placeholder="Owner address"></div>' +
            '<button class="btn btn-primary" type="submit"><i class="fas fa-plus"></i> Add Puppy</button>' +
            '</form></div></div>' +
            '<div class="section-header"><h2><i class="fas fa-list"></i> Puppy Records</h2></div>' +
            '<div class="content-grid">' + puppyCardsHtml + '</div></div>';
    },

    financePage: function() {
        function formatCurrency(value) {
            return 'KSh ' + Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        var entries = KennelData.getFinanceEntries();
        var summary = KennelData.getFinanceSummary();
        var rowsHtml = '';

        if (entries.length === 0) {
            rowsHtml = '<div style="text-align:center;padding:32px 12px;color:var(--gray-400)"><i class="fas fa-chart-line" style="font-size:2rem;margin-bottom:10px;display:block"></i><p>No finance activity recorded yet.</p></div>';
        } else {
            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                var amountClass = entry.type === 'sale' ? 'finance-amount sale' : 'finance-amount expense';
                var sign = entry.type === 'sale' ? '+' : '-';
                rowsHtml += '<div class="finance-list-item">' +
                    '<div class="finance-list-meta">' +
                    '<strong>' + (entry.title || 'Transaction') + '</strong>' +
                    '<span>' + (entry.category || 'General') + ' • ' + new Date(entry.date).toLocaleDateString() + (entry.related ? ' • ' + entry.related : '') + '</span>' +
                    '</div>' +
                    '<div class="finance-list-actions">' +
                    '<div class="' + amountClass + '">' + sign + ' ' + formatCurrency(entry.amount) + '</div>' +
                    (entry.type === 'sale' ? '<button class="btn btn-sm btn-secondary" onclick="App.openInvoiceModal(\'' + entry.id + '\')"><i class="fas fa-file-invoice"></i> Invoice</button>' : '') +
                    '<button class="btn btn-sm btn-secondary" onclick="App.deleteFinanceEntry(\'' + entry.id + '\')"><i class="fas fa-trash"></i></button>' +
                    '</div></div>';
            }
        }

        var maxBarHeight = 1;
        var monthlyBreakdown = summary.monthlyBreakdown || [];
        for (var j = 0; j < monthlyBreakdown.length; j++) {
            var barValue = Math.max(monthlyBreakdown[j].sales, monthlyBreakdown[j].expenses, monthlyBreakdown[j].net);
            if (barValue > maxBarHeight) maxBarHeight = barValue;
        }

        var barsHtml = '';
        for (var k = 0; k < monthlyBreakdown.length; k++) {
            var month = monthlyBreakdown[k];
            var salesHeight = maxBarHeight > 0 ? (month.sales / maxBarHeight) * 100 : 0;
            var expenseHeight = maxBarHeight > 0 ? (month.expenses / maxBarHeight) * 100 : 0;
            barsHtml += '<div style="flex:1;text-align:center">' +
                '<div class="finance-bar-group">' +
                '<div class="finance-bar sales" style="height:' + salesHeight + '%"><span>' + month.label + '</span></div>' +
                '<div class="finance-bar expenses" style="height:' + expenseHeight + '%"></div>' +
                '</div></div>';
        }

        var categoryHtml = '';
        var categories = Object.keys(summary.expenseCategories || {});
        if (categories.length === 0) {
            categoryHtml = '<p style="color:var(--gray-400)">No expense categories yet.</p>';
        } else {
            for (var l = 0; l < categories.length; l++) {
                var categoryName = categories[l];
                var categoryAmount = summary.expenseCategories[categoryName];
                categoryHtml += '<div class="finance-chip">' + categoryName + ' — ' + formatCurrency(categoryAmount) + '</div>';
            }
        }

        var monthlyReportHtml = '';
        if (monthlyBreakdown.length > 0) {
            monthlyReportHtml = '<div class="table-scroll"><table class="finance-report-table"><thead><tr><th>Month</th><th>Sales</th><th>Expenses</th><th>Net</th></tr></thead><tbody>';
            for (var m = 0; m < monthlyBreakdown.length; m++) {
                var monthEntry = monthlyBreakdown[m];
                monthlyReportHtml += '<tr><td>' + monthEntry.label + '</td><td>' + formatCurrency(monthEntry.sales) + '</td><td>' + formatCurrency(monthEntry.expenses) + '</td><td class="' + (monthEntry.net >= 0 ? 'positive' : 'negative') + '">' + formatCurrency(monthEntry.net) + '</td></tr>';
            }
            monthlyReportHtml += '</tbody></table></div>';
        } else {
            monthlyReportHtml = '<p style="color:var(--gray-400)">No monthly activity yet.</p>';
        }

        var latestMonth = monthlyBreakdown[monthlyBreakdown.length - 1] || null;
        var previousMonth = monthlyBreakdown[monthlyBreakdown.length - 2] || null;
        var trendDelta = latestMonth && previousMonth ? latestMonth.net - previousMonth.net : 0;
        var trendText = latestMonth && previousMonth ? (trendDelta >= 0 ? 'Improved vs previous month' : 'Below previous month') : 'Add more transactions to see trend';
        var trendClass = trendDelta >= 0 ? 'positive' : 'negative';
        var bestMonth = monthlyBreakdown.slice().sort(function(a, b) { return b.net - a.net; })[0] || null;
        var trendHtml = '<div class="finance-insight-grid">' +
            '<div class="finance-insight-card"><div class="finance-insight-label">Current month</div><div class="finance-insight-value">' + formatCurrency(latestMonth ? latestMonth.net : 0) + '</div><div class="finance-insight-caption">' + (latestMonth ? latestMonth.label : 'No data') + '</div></div>' +
            '<div class="finance-insight-card"><div class="finance-insight-label">Trend</div><div class="finance-insight-value ' + trendClass + '">' + (trendDelta >= 0 ? '+' : '') + formatCurrency(trendDelta) + '</div><div class="finance-insight-caption">' + trendText + '</div></div>' +
            '<div class="finance-insight-card"><div class="finance-insight-label">Best month</div><div class="finance-insight-value">' + (bestMonth ? formatCurrency(bestMonth.net) : formatCurrency(0)) + '</div><div class="finance-insight-caption">' + (bestMonth ? bestMonth.label : 'No data') + '</div></div>' +
            '</div>';

        return '<div class="page-shell" id="pageFinance">' +
            '<section class="page-hero">' +
            '<div><div class="hero-badge"><i class="fas fa-chart-line"></i> Financial overview</div><h2>Track kennel sales, expenses, and profitability</h2><p>Keep a close eye on every sale and expense so your kennel remains financially healthy.</p></div>' +
            '</section>' +
            '<div class="finance-shell">' +
            '<div class="finance-summary-grid">' +
            '<div class="finance-summary-card positive"><div class="label">Total sales</div><div class="value">' + formatCurrency(summary.totalSales) + '</div></div>' +
            '<div class="finance-summary-card negative"><div class="label">Total expenses</div><div class="value">' + formatCurrency(summary.totalExpenses) + '</div></div>' +
            '<div class="finance-summary-card ' + (summary.net >= 0 ? 'positive' : 'negative') + '"><div class="label">Net result</div><div class="value">' + formatCurrency(summary.net) + '</div></div>' +
            '<div class="finance-summary-card"><div class="label">Profit margin</div><div class="value">' + Number(summary.profitMargin || 0).toFixed(1) + '%</div></div>' +
            '</div>' +
            '<div class="finance-form-grid">' +
            '<div class="card finance-form-card"><div class="card-header"><h3><i class="fas fa-plus"></i> Add transaction</h3></div><div class="card-body"><form id="financeForm" class="modern-form">' +
            '<div class="finance-form-row"><div class="finance-form-field"><label for="financeType">Type</label><select id="financeType"><option value="sale">Sale</option><option value="expense">Expense</option></select></div>' +
            '<div class="finance-form-field"><label for="financeDate">Date</label><input type="date" id="financeDate" value="' + new Date().toISOString().slice(0, 10) + '"></div></div>' +
            '<div class="finance-form-row"><div class="finance-form-field full"><label for="financeTitle">Title</label><input type="text" id="financeTitle" placeholder="Puppy sale, food, transport..."></div></div>' +
            '<div class="finance-form-row"><div class="finance-form-field"><label for="financeCategory">Category</label><input type="text" id="financeCategory" placeholder="Food, Grooming, Sale..."></div>' +
            '<div class="finance-form-field"><label for="financeAmount">Amount</label><input type="number" id="financeAmount" min="0" step="0.01" placeholder="0.00"></div></div>' +
            '<div class="finance-form-row"><div class="finance-form-field"><label for="financeRelated">Related dog/puppy</label><input type="text" id="financeRelated" placeholder="Name or reference"></div>' +
            '<div class="finance-form-field"><label for="financeNotes">Notes</label><textarea id="financeNotes" rows="3" placeholder="Extra details"></textarea></div></div>' +
            '<button class="btn btn-primary" type="submit"><i class="fas fa-save"></i> Save transaction</button>' +
            '</form></div></div>' +
            '<div class="card finance-list-card"><div class="card-header"><h3><i class="fas fa-list"></i> Recent transactions</h3></div><div class="card-body">' + rowsHtml + '</div></div>' +
            '</div>' +
            '<div class="card section-card"><div class="card-header"><div><h3><i class="fas fa-chart-pie"></i> Monthly summaries</h3><p style="margin:4px 0 0;color:var(--gray-500)">Track profit and loss trends with printable reporting.</p></div><div class="finance-report-actions"><button class="btn btn-secondary" onclick="App.exportReport()"><i class="fas fa-file-csv"></i> Export CSV</button><button class="btn btn-primary" onclick="App.printFinanceReport()"><i class="fas fa-print"></i> Print report</button></div></div><div class="card-body">' + trendHtml + '</div></div>' +
            '<div class="finance-chart-row">' +
            '<div class="card finance-chart-card"><div class="card-header"><h3><i class="fas fa-chart-bar"></i> Monthly performance</h3></div><div class="card-body">' + barsHtml + '</div></div>' +
            '<div class="card finance-chart-card"><div class="card-header"><h3><i class="fas fa-tags"></i> Expense categories</h3></div><div class="card-body">' + categoryHtml + '</div></div>' +
            '</div>' +
            '<div class="card section-card"><div class="card-header"><h3><i class="fas fa-file-invoice-dollar"></i> Monthly finance report</h3></div><div class="card-body">' + monthlyReportHtml + '</div></div>' +
            '</div></div>';
    },

    alertsPage: function() {
        var alerts = KennelData.getAlerts();
        var contentHtml;

        if (alerts.length === 0) {
            contentHtml = '<div style="text-align:center;padding:60px 20px;color:var(--gray-400)">' +
                '<i class="fas fa-check-circle" style="font-size:3rem;margin-bottom:16px;display:block;color:var(--success)"></i>' +
                '<p style="font-size:1.1rem">All caught up! No pending alerts.</p></div>';
        } else {
            var itemsHtml = '';
            for (var i = 0; i < alerts.length; i++) {
                var a = alerts[i];
                var icon = a.severity === 'danger' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
                itemsHtml += '<div class="alert-item ' + a.severity + '">' +
                    '<div class="alert-icon ' + a.severity + '"><i class="fas ' + icon + '"></i></div>' +
                    '<div class="alert-content">' +
                    '<h4>' + a.dogName + ' - ' + a.recordTypeLabel + '</h4>' +
                    '<p>' + a.message + '</p>' +
                    '<p style="font-size:0.75rem;color:var(--gray-400);margin-top:4px">' +
                    (a.record.type || '') + (a.record.vet ? ' ' + a.record.vet : '') + (a.record.trainer ? ' ' + a.record.trainer : '') +
                    '</p></div>' +
                    '<button class="btn btn-sm btn-primary" onclick="App.openDogDetail(\'' + a.dogId + '\')">View</button>' +
                    '</div>';
            }
            contentHtml = '<div class="alerts-list">' + itemsHtml + '</div>';
        }

        return '<div class="page-shell" id="pageAlerts">' +
            '<section class="page-hero">' +
            '<div>' +
            '<div class="hero-badge"><i class="fas fa-bell"></i> Care reminders</div>' +
            '<h2>Stay ahead of every upcoming task</h2>' +
            '<p>Review health, training, and sales reminders with a clean, organized schedule.</p>' +
            '</div>' +
            '</section>' +
            '<div class="section-header">' +
            '<h2><i class="fas fa-bell"></i> Alerts & Reminders <span style="font-size:0.9rem;font-weight:400;color:var(--gray-500)">(' + alerts.length + ')</span></h2>' +
            '<div class="section-badge"><i class="fas fa-check-circle"></i> Prioritized</div>' +
            '</div>' + contentHtml + '</div>';
    },

    getRecordFormFields: function(recordType, record) {
        if (record === undefined) record = null;
        var fields = '';
        var isEdit = !!record;

        function sel(v, cmp) { return record && record[v] === cmp ? 'selected' : ''; }

        if (recordType === 'health') {
            fields = '<div class="form-group"><label for="recDate">Date *</label><input type="date" id="recDate" required value="' + (record ? record.date : '') + '"></div>' +
                '<div class="form-group"><label for="recType">Checkup Type *</label><input type="text" id="recType" placeholder="e.g. Annual Checkup" required value="' + (record ? record.type : '') + '"></div>' +
                '<div class="form-group"><label for="recVet">Veterinarian</label><input type="text" id="recVet" placeholder="Dr. Smith" value="' + (record ? record.vet || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recNotes">Notes</label><textarea id="recNotes" rows="3" placeholder="Health notes...">' + (record ? record.notes || '' : '') + '</textarea></div>' +
                '<div class="form-group"><label for="recNextDue">Next Due Date</label><input type="date" id="recNextDue" value="' + (record ? record.nextDue || '' : '') + '"></div>';
        } else if (recordType === 'vaccination') {
            fields = '<div class="form-group"><label for="recDate">Date *</label><input type="date" id="recDate" required value="' + (record ? record.date : '') + '"></div>' +
                '<div class="form-group"><label for="recType">Vaccine *</label><input type="text" id="recType" placeholder="e.g. DHPP, Rabies" required value="' + (record ? record.type : '') + '"></div>' +
                '<div class="form-group"><label for="recVet">Administered By</label><input type="text" id="recVet" placeholder="Dr. Smith" value="' + (record ? record.vet || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recBatch">Batch/Lot #</label><input type="text" id="recBatch" placeholder="BATCH-2024-01" value="' + (record ? record.batch || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recNextDue">Next Due Date</label><input type="date" id="recNextDue" value="' + (record ? record.nextDue || '' : '') + '"></div>';
        } else if (recordType === 'deworming') {
            fields = '<div class="form-group"><label for="recDate">Date *</label><input type="date" id="recDate" required value="' + (record ? record.date : '') + '"></div>' +
                '<div class="form-group"><label for="recType">Treatment *</label><input type="text" id="recType" placeholder="e.g. Drontal Plus" required value="' + (record ? record.type : '') + '"></div>' +
                '<div class="form-group"><label for="recVet">Veterinarian</label><input type="text" id="recVet" placeholder="Dr. Smith" value="' + (record ? record.vet || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recNotes">Notes</label><textarea id="recNotes" rows="3" placeholder="Dosage, reactions...">' + (record ? record.notes || '' : '') + '</textarea></div>' +
                '<div class="form-group"><label for="recNextDue">Next Due Date</label><input type="date" id="recNextDue" value="' + (record ? record.nextDue || '' : '') + '"></div>';
        } else if (recordType === 'breeding') {
            fields = '<div class="form-group"><label for="recDate">Date *</label><input type="date" id="recDate" required value="' + (record ? record.date : '') + '"></div>' +
                '<div class="form-group"><label for="recType">Breeding Type *</label>' +
                '<select id="recType" required><option value="">Select...</option>' +
                '<option value="Natural Breeding"' + sel('type', 'Natural Breeding') + '>Natural Breeding</option>' +
                '<option value="AI Breeding"' + sel('type', 'AI Breeding') + '>AI Breeding</option></select></div>' +
                '<div class="form-group"><label for="recMate">Sire / Mate</label><input type="text" id="recMate" placeholder="e.g. Rocky" value="' + (record ? record.mate || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recDam">Dam</label><input type="text" id="recDam" placeholder="e.g. Luna" value="' + (record ? record.dam || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recExpectedDate">Expected Whelping Date</label><input type="date" id="recExpectedDate" value="' + (record ? record.expectedDate || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recLitterSize">Expected Litter Size</label><input type="number" id="recLitterSize" min="0" placeholder="4" value="' + (record ? record.litterSize || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recPuppiesBorn">Puppies Born</label><input type="number" id="recPuppiesBorn" min="0" placeholder="3" value="' + (record ? record.puppiesBorn || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recResult">Result</label>' +
                '<select id="recResult"><option value="">Select...</option>' +
                '<option value="Pending"' + sel('result', 'Pending') + '>Pending</option>' +
                '<option value="Successful"' + sel('result', 'Successful') + '>Successful</option>' +
                '<option value="Unsuccessful"' + sel('result', 'Unsuccessful') + '>Unsuccessful</option>' +
                '<option value="Successful - 1 puppy"' + sel('result', 'Successful - 1 puppy') + '>Successful - 1 puppy</option>' +
                '<option value="Successful - 2 puppies"' + sel('result', 'Successful - 2 puppies') + '>Successful - 2 puppies</option>' +
                '<option value="Successful - 3 puppies"' + sel('result', 'Successful - 3 puppies') + '>Successful - 3 puppies</option>' +
                '<option value="Successful - 4 puppies"' + sel('result', 'Successful - 4 puppies') + '>Successful - 4 puppies</option>' +
                '<option value="Successful - 5 puppies"' + sel('result', 'Successful - 5 puppies') + '>Successful - 5 puppies</option>' +
                '<option value="Successful - 6+ puppies"' + sel('result', 'Successful - 6+ puppies') + '>Successful - 6+ puppies</option></select></div>' +
                '<div class="form-group"><label for="recNotes">Notes</label><textarea id="recNotes" rows="3" placeholder="Breeding details...">' + (record ? record.notes || '' : '') + '</textarea></div>';
        } else if (recordType === 'heatCycle') {
            fields = '<div class="form-row">' +
                '<div class="form-group half"><label for="recStartDate">Start Date *</label><input type="date" id="recStartDate" required value="' + (record ? record.startDate : '') + '"></div>' +
                '<div class="form-group half"><label for="recEndDate">End Date</label><input type="date" id="recEndDate" value="' + (record ? record.endDate || '' : '') + '"></div>' +
                '</div>' +


                '<div class="form-group"><label for="recIntensity">Intensity</label>' +
                '<select id="recIntensity"><option value="">Select...</option>' +
                '<option value="Mild"' + sel('intensity', 'Mild') + '>Mild</option>' +
                '<option value="Normal"' + sel('intensity', 'Normal') + '>Normal</option>' +
                '<option value="Strong"' + sel('intensity', 'Strong') + '>Strong</option></select></div>' +
                '<div class="form-group"><label for="recNotes">Notes</label><textarea id="recNotes" rows="3" placeholder="Cycle observations...">' + (record ? record.notes || '' : '') + '</textarea></div>' +
                '<div class="form-group"><label for="recNextExpected">Next Expected Date</label><input type="date" id="recNextExpected" value="' + (record ? record.nextExpected || '' : '') + '"></div>';
        } else if (recordType === 'training') {
            fields = '<div class="form-group"><label for="recDate">Date *</label><input type="date" id="recDate" required value="' + (record ? record.date : '') + '"></div>' +
                '<div class="form-group"><label for="recType">Training Type *</label><input type="text" id="recType" placeholder="e.g. Obedience, Agility" required value="' + (record ? record.type : '') + '"></div>' +
                '<div class="form-group"><label for="recTrainer">Trainer</label><input type="text" id="recTrainer" placeholder="John K." value="' + (record ? record.trainer || '' : '') + '"></div>' +
                '<div class="form-group"><label for="recNotes">Notes</label><textarea id="recNotes" rows="3" placeholder="Progress, achievements...">' + (record ? record.notes || '' : '') + '</textarea></div>' +
                '<div class="form-group"><label for="recNextDue">Next Session Date</label><input type="date" id="recNextDue" value="' + (record ? record.nextDue || '' : '') + '"></div>';
        }

        return fields;
    }
}

window.Components = Components;
