const driverList = document.getElementById('driver-list');
const missionsBody = document.getElementById('missions-body');
const profileGrid = document.getElementById('profile-grid');
const metricGrid = document.getElementById('metric-grid');
const editAlert = document.getElementById('driver-edit-alert');
const openEditDriverBtn = document.getElementById('open-edit-driver-btn');
const saveDriverBtn = document.getElementById('save-driver-btn');
const driverEditModal = document.getElementById('driver-edit-modal');
const closeEditDriverBtn = document.getElementById('close-edit-driver-btn');
const driverModalAlert = document.getElementById('driver-modal-alert');
const modalDriverName = document.getElementById('modal-driver-name');
const modalDriverEmail = document.getElementById('modal-driver-email');
const modalDriverPhone = document.getElementById('modal-driver-phone');
const modalDriverShift = document.getElementById('modal-driver-shift');
const modalVehicleStatus = document.getElementById('modal-vehicle-status');

const dashboardElements = {
    lastUpdated: document.getElementById('last-updated'),
    currentDriverLabel: document.getElementById('current-driver-label'),
    driversCount: document.getElementById('drivers-count'),
    activeMissionsCount: document.getElementById('active-missions-count'),
    driverAvatar: document.getElementById('driver-avatar'),
    driverName: document.getElementById('driver-name'),
    driverRole: document.getElementById('driver-role'),
    driverNote: document.getElementById('driver-note'),
    tableCaption: document.getElementById('table-caption'),
    driverStatus: document.getElementById('driver-status'),
    driversSummary: document.getElementById('drivers-summary')
};

let drivers = [];
let activeDriver = null;
let activeDashboardData = null;

function escapeHTML(value) {
    if (value == null) {
        return '';
    }

    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;'
    })[char]);
}

function getInitials(text) {
    const parts = String(text || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);

    return parts.length ? parts.map((part) => part.charAt(0).toUpperCase()).join(' ') : 'س';
}

function setEditAlert(message, isError = false) {
    editAlert.textContent = message || '';
    editAlert.style.color = isError ? '#ff7a7a' : '#a9c0cd';
}

function setModalAlert(message, isError = false) {
    driverModalAlert.textContent = message || '';
    driverModalAlert.style.color = isError ? '#ff7a7a' : '#a9c0cd';
}

async function requestJson(url, options, fallbackMessage) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok || !data.success) {
        throw new Error(data.message || fallbackMessage);
    }

    return data;
}

function openEditModal() {
    if (!activeDashboardData) {
        setEditAlert('اختر سائقًا أولًا.', true);
        return;
    }

    const { profile, vehicle } = activeDashboardData;
    modalDriverName.value = profile.name || '';
    modalDriverEmail.value = profile.email || '';
    modalDriverPhone.value = profile.phone === 'غير مضاف' ? '' : (profile.phone || '');
    modalDriverShift.value = profile.shift || '';
    modalVehicleStatus.value = vehicle ? (vehicle.status || 'جاهزة') : 'جاهزة';
    setModalAlert('');
    driverEditModal.classList.add('open');
}

function closeEditModal() {
    driverEditModal.classList.remove('open');
    setModalAlert('');
}

function renderDriverList() {
    if (!drivers.length) {
        driverList.innerHTML = '<div class="info-card"><strong>لا يوجد سائقون مضافون في قاعدة البيانات.</strong></div>';
        return;
    }

    driverList.innerHTML = drivers.map((driver) => `
        <button class="driver-card ${activeDriver && driver.user_id === activeDriver.user_id ? 'active' : ''}" data-user-id="${driver.user_id}" type="button">
            <div class="driver-card-header">
                <div>
                    <h3>${escapeHTML(driver.full_name || 'بدون اسم')}</h3>
                    <small>${escapeHTML(driver.email)}</small>
                </div>
                <span class="mini-avatar">${escapeHTML(getInitials(driver.full_name || driver.email))}</span>
            </div>
            <p>الدور: ${escapeHTML(driver.role || 'Driver')}</p>
            <div class="driver-card-meta">
                <span>${escapeHTML(driver.shift || 'غير محددة')}</span>
                <span>#${escapeHTML(driver.user_id)}</span>
            </div>
        </button>
    `).join('');

    driverList.querySelectorAll('[data-user-id]').forEach((button) => {
        button.addEventListener('click', async () => {
            const userId = Number(button.dataset.userId);
            const selectedDriver = drivers.find((driver) => driver.user_id === userId);

            if (!selectedDriver) {
                return;
            }

            activeDriver = selectedDriver;
            renderDriverList();
            await loadDriverProfile(selectedDriver.email);
        });
    });
}

function renderProfile(data) {
    activeDashboardData = data;

    const { profile, vehicle, tasks } = data;
    const profileName = profile.name || profile.email || 'السائق';
    const vehicleLabel = vehicle ? `${vehicle.name} - ${vehicle.code}` : 'لا توجد مركبة مرتبطة';
    const vehicleStatus = vehicle ? vehicle.status : 'غير محدد';

    dashboardElements.lastUpdated.textContent = new Date().toLocaleString('ar-EG');
    dashboardElements.currentDriverLabel.textContent = profileName;
    dashboardElements.driversCount.textContent = String(drivers.length);
    dashboardElements.activeMissionsCount.textContent = String(tasks.length);
    dashboardElements.driverAvatar.textContent = profile.initials || getInitials(profileName);
    dashboardElements.driverName.textContent = profileName;
    dashboardElements.driverRole.textContent = `${profile.role} • ${profile.email}`;
    dashboardElements.driverNote.textContent = profile.note || 'لا توجد ملاحظات.';
    dashboardElements.tableCaption.textContent = `المهام الحالية للسائق ${profileName}.`;

    dashboardElements.driverStatus.textContent = profile.status || 'غير محدد';
    dashboardElements.driverStatus.className = `status-badge ${profile.statusClass || 'status-waiting'}`;

    profileGrid.innerHTML = [
        { label: 'الاسم', value: profile.name || 'غير محدد' },
        { label: 'الإيميل', value: profile.email || 'غير محدد' },
        { label: 'رقم الهاتف', value: profile.phone || 'غير مضاف' },
        { label: 'المناوبة', value: profile.shift || 'غير محددة' },
        { label: 'المركبة', value: vehicleLabel },
        { label: 'حالة المركبة', value: vehicleStatus }
    ].map((item) => `
        <div class="info-card">
            <span>${escapeHTML(item.label)}</span>
            <strong>${escapeHTML(item.value)}</strong>
        </div>
    `).join('');

    metricGrid.innerHTML = [
        { value: String(tasks.length), label: 'إجمالي المهام' },
        { value: vehicle ? (vehicle.status || 'غير محدد') : 'غير مرتبطة', label: 'حالة المركبة' },
        { value: profile.shift || 'غير محددة', label: 'المناوبة' }
    ].map((metric) => `
        <div class="metric-card">
            <strong>${escapeHTML(metric.value)}</strong>
            <span>${escapeHTML(metric.label)}</span>
        </div>
    `).join('');

    setEditAlert('');

    missionsBody.innerHTML = tasks.length ? tasks.map((task) => `
        <tr>
            <td class="mission-id">${escapeHTML(task.id)}</td>
            <td>${escapeHTML(task.cargo)}</td>
            <td>${escapeHTML(task.pickup)}</td>
            <td>${escapeHTML(task.destination)}</td>
            <td>${escapeHTML(task.time)}</td>
            <td><span class="priority ${escapeHTML(task.priorityClass)}">${escapeHTML(task.priority)}</span></td>
            <td><span class="table-status ${escapeHTML(task.statusClass)}">${escapeHTML(task.status)}</span></td>
        </tr>
    `).join('') : '<tr><td colspan="7" style="text-align:center;">لا توجد مهام لهذا السائق.</td></tr>';
}

function renderError(message) {
    activeDashboardData = null;
    dashboardElements.driverName.textContent = 'تعذر تحميل البيانات';
    dashboardElements.driverRole.textContent = message;
    dashboardElements.driverNote.textContent = message;
    dashboardElements.tableCaption.textContent = message;
    profileGrid.innerHTML = '';
    metricGrid.innerHTML = '';
    missionsBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${escapeHTML(message)}</td></tr>`;
    setEditAlert(message, true);
}

async function loadDriverProfile(email) {
    try {
        const data = await requestJson(
            `/api/driver-dashboard?email=${encodeURIComponent(email)}`,
            undefined,
            'فشل تحميل بيانات السائق.'
        );

        renderProfile(data);
    } catch (error) {
        console.error('Failed to load driver profile:', error);
        renderError(error.message || 'فشل تحميل بيانات السائق.');
    }
}

async function loadDrivers() {
    try {
        const previousActiveDriverId = activeDriver ? activeDriver.user_id : null;
        const data = await requestJson('/api/drivers', undefined, 'فشل جلب السائقين.');

        drivers = data.drivers || [];
        dashboardElements.driversSummary.textContent = drivers.length
            ? 'اختر سائقًا لعرض معلوماته أو تعديلها.'
            : 'لا يوجد سائقون مضافون حتى الآن.';

        if (drivers.length) {
            activeDriver = drivers.find((driver) => driver.user_id === previousActiveDriverId) || activeDriver || drivers[0];
        } else {
            activeDriver = null;
        }

        renderDriverList();

        if (activeDriver) {
            await loadDriverProfile(activeDriver.email);
            return;
        }

        renderError('لا يوجد سائقون لعرضهم.');
    } catch (error) {
        console.error('Failed to load drivers:', error);
        dashboardElements.driversSummary.textContent = error.message || 'فشل جلب السائقين.';
        renderError(error.message || 'فشل جلب السائقين.');
    }
}

openEditDriverBtn.addEventListener('click', openEditModal);
closeEditDriverBtn.addEventListener('click', closeEditModal);
driverEditModal.addEventListener('click', (event) => {
    if (event.target === driverEditModal) {
        closeEditModal();
    }
});

saveDriverBtn.addEventListener('click', async () => {
    if (!activeDriver) {
        setModalAlert('اختر سائقًا أولًا.', true);
        return;
    }

    saveDriverBtn.disabled = true;
    setModalAlert('جاري حفظ التعديلات...');

    try {
        const data = await requestJson(
            `/api/drivers/${activeDriver.user_id}`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    full_name: modalDriverName.value.trim(),
                    phone: modalDriverPhone.value.trim(),
                    shift: modalDriverShift.value.trim(),
                    vehicle_status: modalVehicleStatus.value.trim()
                })
            },
            'فشل حفظ التعديلات.'
        );

        localStorage.setItem('driver-dashboard-updated', String(Date.now()));
        setEditAlert(data.message || 'تم حفظ التعديلات بنجاح.');
        closeEditModal();
        await loadDrivers();
    } catch (error) {
        console.error('Failed to save driver changes:', error);
        setModalAlert(error.message || 'فشل حفظ التعديلات.', true);
    } finally {
        saveDriverBtn.disabled = false;
    }
});

loadDrivers();
