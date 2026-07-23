// ===== UI Components =====
const Components = {
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

    statCard: function(icon, value, label, colorClass) {
        return '<div class="stat-card">' +
            '<div class="stat-icon ' + colorClass + '"><i class="fas ' + icon + '"></i></div>' +
            '<div class="stat-info"><h4>' + value + '</h4><p>' + label + '</p></div>' +
            '</div>';
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
            imageHtml = '<img class="dog-card-image" src="' + dog.image + '" alt="' + dog.name + '" onerror="this.outerHTML=\'' + placeholder + '\'">';
        } else {
            imageHtml = placeholder;
        }
        var saleBadge = dog.forSale ? '<div class="dog-card-sale-badge">For Sale</div>' : '';
        var priceTag = (dog.forSale && dog.price) ? '<span class="tag tag-for-sale">$' + Number(dog.price).toLocaleString() + '</span>' : '';
        var weightHtml = dog.weight ? dog.weight + ' kg' : 'N/A';

        return '<div class="card dog-card" onclick="App.openDogDetail(\'' + dog.id + '\')">' +
            saleBadge +
            imageHtml +
            '<div class="dog-card-body">' +
            '<div class="dog-card-name">' + dog.name + '</div>' +
            '<div class="dog-card-breed">' + dog.breed + '</div>' +
            '<div class="dog-card-tags">' +
            '<span class="tag ' + genderClass + '"><i class="fas ' + genderIcon + '"></i> ' + dog.gender + '</span>' +
            '<span class="tag tag-' + dog.status.toLowerCase() + '">' + dog.status + '</span>' +
            priceTag +
            '</div>' +

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
                details = (record.mate ? 'Mate: ' + record.mate : '') + (record.result ? ' Result: ' + record.result : '') + (record.notes ? ' ' + record.notes : '');
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
        var items = '';
        for (var i = 0; i < records.length; i++) {
            items += this.recordItem(dogId, recordType, records[i]);
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
            '<div class="detail-info-item"><label>For Sale</label><p>' + (dog.forSale ? (dog.price ? '$' + Number(dog.price).toLocaleString() : 'Yes') : 'No') + '</p></div>' +
            '</div>' +
            notesHtml +
            '<div class="records-section">' +
            '<div class="records-tabs">' + tabsHtml + '</div>' +
            contentsHtml +
            '</div></div>';
    },

    overviewPage: function() {
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
            upcomingTableHtml = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.9rem">' +
                '<thead><tr style="border-bottom:2px solid var(--gray-200);text-align:left">' +
                '<th style="padding:8px 12px">Dog</th><th style="padding:8px 12px">Type</th><th style="padding:8px 12px">Detail</th><th style="padding:8px 12px">Due Date</th>' +
                '</tr></thead><tbody>' + eventRowsHtml + '</tbody></table></div>';
        } else {
            upcomingTableHtml = '<p style="text-align:center;color:var(--gray-400);padding:20px">No upcoming events</p>';
        }

        var ageEmptyHtml = stats.total === 0 ? '<p style="text-align:center;color:var(--gray-400);padding:20px">No age data available</p>' : '';

        return '<div class="page" id="pageOverview">' +
            '<div class="section-header">' +
            '<h2><i class="fas fa-chart-pie"></i> Kennel Overview</h2>' +
            '<button class="btn btn-primary" onclick="App.showAddDog()"><i class="fas fa-plus"></i> Add Dog</button>' +
            '</div>' +
            '<div class="stats-grid">' +
            this.statCard('fa-dog', stats.total, 'Total Dogs', 'purple') +
            this.statCard('fa-mars', stats.males, 'Males', 'blue') +
            this.statCard('fa-venus', stats.females, 'Females', 'red') +
            this.statCard('fa-tag', stats.forSale, 'For Sale', 'green') +
            this.statCard('fa-heart', stats.active, 'Active', 'yellow') +
            this.statCard('fa-dollar-sign', '$5,000', 'Total Value', 'green') +
            '</div>' +
            '<div class="quick-actions">' +
            '<button class="quick-action-btn" onclick="App.showAddDog()"><i class="fas fa-plus-circle"></i> Add New Dog</button>' +
            '<button class="quick-action-btn" onclick="App.navigate(\'mydogs\')"><i class="fas fa-list"></i> View All Dogs</button>' +
            '<button class="quick-action-btn" onclick="App.navigate(\'alerts\')"><i class="fas fa-bell"></i> ' + alertsBadge + ' Alerts</button>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">' +
            '<div class="card"><div class="card-header"><h3><i class="fas fa-venus-mars"></i> Gender Distribution</h3></div>' +
            '<div class="card-body"><div class="gender-chart"><div class="gender-bar-track">' + genderBarHtml + '</div>' +

            '<div class="card"><div class="card-header"><h3><i class="fas fa-calendar-alt"></i> Age Distribution</h3></div>' +
            '<div class="card-body">' + ageBarsHtml + ageEmptyHtml + '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">' +
            '<div class="card"><div class="card-header"><h3><i class="fas fa-dna"></i> Breeds</h3></div>' +
            '<div class="card-body"><div class="breed-list">' + breedChipsHtml + '</div></div>' +
            '<div class="card"><div class="card-header"><h3><i class="fas fa-clock"></i> Recent Activity</h3></div>' +
            '<div class="card-body"><div class="activity-list">' + activityHtml + '</div></div>' +
            '</div>' +
            '<div class="card"><div class="card-header"><h3><i class="far fa-calendar-check"></i> Upcoming Events</h3></div>' +
            '<div class="card-body">' + upcomingTableHtml + '</div>' +
            '</div>';
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

        return '<div class="page" id="pageMyDogs">' +
            '<div class="section-header">' +
            '<h2><i class="fas fa-dog"></i> My Dogs <span style="font-size:0.9rem;font-weight:400;color:var(--gray-500)">(' + dogs.length + ')</span></h2>' +
            '<button class="btn btn-primary" onclick="App.showAddDog()"><i class="fas fa-plus"></i> Add Dog</button>' +
            '</div>' +
            '<div class="search-bar" style="margin-bottom:20px">' +
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

        return '<div class="page" id="pageAlerts">' +
            '<div class="section-header">' +
            '<h2><i class="fas fa-bell"></i> Alerts & Reminders <span style="font-size:0.9rem;font-weight:400;color:var(--gray-500)">(' + alerts.length + ')</span></h2>' +
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
                '<div class="form-group"><label for="recMate">Mate / Sire</label><input type="text" id="recMate" placeholder="e.g. Rocky" value="' + (record ? record.mate || '' : '') + '"></div>' +
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
};\n\nwindow.Components = Components;