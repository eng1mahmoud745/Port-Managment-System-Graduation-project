const LEVEL_META = {
    upper: { arrow: '↑', arrowClass: 'up' },
    middle: { arrow: '↑', arrowClass: 'up' },
    lower: { arrow: '↓', arrowClass: 'down' }
};
const DOCK_BERTHS = [
    { key: 'A', label: 'رصيف A' },
    { key: 'B', label: 'رصيف B' },
    { key: 'C', label: 'رصيف C' }
];

const REQUEST_STATUS_MAP = {
    pending: { label: 'بانتظار رد السائق', className: 'request-badge pending' },
    approved: { label: 'السائق موافق', className: 'request-badge approved' },
    unavailable: { label: 'السائق غير متاح', className: 'request-badge unavailable' },
    completed: { label: 'تم تنفيذ المهمة', className: 'request-badge approved' },
    failed: { label: 'تعذر الاكتمال', className: 'request-badge unavailable' }
};

const PRIORITY_LABELS = {
    urgent: 'عاجلة جداً',
    high: 'عالية',
    normal: 'متوسطة',
    low: 'منخفضة'
};

const VESSEL_STATUS_MAP = {
    arriving: 'قيد الوصول',
    containers_added: 'تمت إضافة الحاويات',
    discharge_planned: 'الخطة جاهزة',
    discharging: 'قيد التفريغ',
    completed: 'مكتملة',
    cancelled: 'ملغاة',
    archived: 'مؤرشفة'
};

const PLAN_STATUS_LABELS = {
    draft: 'خطة جاهزة للمراجعة',
    active: 'التنزيل جارٍ',
    completed: 'الخطة مكتملة',
    cancelled: 'الخطة ملغاة'
};

const CARGO_TYPE_OPTIONS = [
    'حمولة جافة',
    'حمولة سائلة',
    'حمولة مبردة',
    'حمولة مجمدة',
    'حمولة سائبة جافة',
    'حمولة خطرة',
    'حمولة ذات أبعاد غير قياسية',
    'حمولة تتطلب تهوية',
    'حمولة سيارات ومعدات متحركة',
    'أخرى'
];

const TASK_STATUS_LABELS = {
    planned: 'مجدولة',
    in_progress: 'قيد التنزيل',
    completed: 'تم التنزيل',
    cancelled: 'ملغاة'
};

const DESTINATION_LABELS = {
    yard: 'ساحة',
    truck: 'شاحنة',
    warehouse: 'مستودع',
    truck_berth: 'رصيف الشاحنات',
    train_berth: 'رصيف القطار',
    berth_a: 'رصيف A',
    berth_b: 'رصيف B',
    berth_c: 'رصيف C'
};

const dashboardState = {
    drivers: [],
    completedContainers: [],
    vessels: [],
    berths: [],
    selectedBerthKey: 'A',
    selectedCompletedVesselId: null,
    selectedArrivalReasonVesselId: null
};

LEVEL_META.truck = { arrow: '↔', arrowClass: 'neutral' };
LEVEL_META.rail = { arrow: '↔', arrowClass: 'neutral' };
DOCK_BERTHS.push(
    { key: 'TRUCK', label: 'رصيف الشاحنات' },
    { key: 'TRAIN', label: 'رصيف القطار' }
);

let vesselContainerRowId = 0;

function createSyntheticBerthSlot(berthKey, order) {
    const normalizedBerthKey = String(berthKey || '').trim().toUpperCase();
    return {
        id: `synthetic-${normalizedBerthKey}-${order}`,
        code: `${normalizedBerthKey}-LOW-${String(order).padStart(2, '0')}`,
        order,
        berthKey: normalizedBerthKey,
        containerNumber: '',
        ownerName: '',
        containerType: '',
        notes: '',
        occupied: false,
        updatedAt: null,
        request: null
    };
}

function getRenderableBerthLevels(selectedBerth) {
    const levels = Array.isArray(selectedBerth?.levels) ? selectedBerth.levels : [];
    const berthKey = String(selectedBerth?.key || '').trim().toUpperCase();
    if (!['TRUCK', 'TRAIN'].includes(berthKey) || levels.length !== 1) {
        return levels;
    }

    return levels.map((level) => {
        const slots = Array.isArray(level.slots) ? [...level.slots] : [];
        const slotsByOrder = new Map(
            slots
                .map((slot) => [Number(slot?.order) || 0, slot])
                .filter(([order]) => order > 0)
        );

        return {
            ...level,
            slots: Array.from({ length: 9 }, (_, index) => {
                const order = index + 1;
                return slotsByOrder.get(order) || createSyntheticBerthSlot(berthKey, order);
            })
        };
    });
}

function normalizeContainerCodeUi(value) {
    const normalizedValue = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    const match = normalizedValue.match(/^([A-Z]+)-?(\d+)$/);

    if (match) {
        return `${match[1]}-${String(Number.parseInt(match[2], 10) || 0).padStart(2, '0')}`;
    }

    return normalizedValue;
}

function formatSequentialContainerCode(prefix, sequence) {
    const normalizedPrefix = String(prefix || 'CNT').trim().toUpperCase().replace(/[^A-Z]/g, '') || 'CNT';
    const normalizedSequence = Math.max(Number.parseInt(sequence, 10) || 1, 1);
    return `${normalizedPrefix}-${String(normalizedSequence).padStart(2, '0')}`;
}

function getContainerCodeInputs() {
    return Array.from(document.querySelectorAll('#vessel-containers-body [name="containerNumber"]'));
}

function getUsedContainerCodes(excludeInput = null) {
    return new Set(
        getContainerCodeInputs()
            .filter((input) => input && input !== excludeInput)
            .map((input) => normalizeContainerCodeUi(input.value))
            .filter(Boolean)
    );
}

function getNextUniqueContainerCode(baseCode, usedCodes) {
    const normalizedBase = normalizeContainerCodeUi(baseCode);
    const baseMatch = normalizedBase.match(/^([A-Z]+)-(\d+)$/);
    const prefix = baseMatch?.[1] || 'CNT';
    let nextSequence = Number.parseInt(baseMatch?.[2] || '1', 10) || 1;

    usedCodes.forEach((code) => {
        const currentMatch = String(code || '').match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
        if (!currentMatch) {
            return;
        }

        nextSequence = Math.max(nextSequence, Number.parseInt(currentMatch[1], 10) + 1);
    });

    let candidate = formatSequentialContainerCode(prefix, nextSequence);
    while (usedCodes.has(candidate)) {
        nextSequence += 1;
        candidate = formatSequentialContainerCode(prefix, nextSequence);
    }

    return candidate;
}

function validateContainerCodeUniqueness(changedInput) {
    const normalizedValue = normalizeContainerCodeUi(changedInput?.value || '');
    if (!changedInput) {
        return;
    }

    changedInput.value = normalizedValue;
    changedInput.setCustomValidity('');

    if (!normalizedValue) {
        return;
    }

    const duplicateInForm = getContainerCodeInputs().some((input) => (
        input !== changedInput && normalizeContainerCodeUi(input.value) === normalizedValue
    ));

    if (duplicateInForm) {
        changedInput.setCustomValidity('رقم الحاوية مكرر داخل النموذج.');
        changedInput.reportValidity();
    }
}

function getLevelHint(levelKey, fallbackHint = '') {
    const hintsElement = document.getElementById('dock-level-hints');
    if (!hintsElement) {
        return fallbackHint;
    }

    const hintMap = {
        upper: hintsElement.dataset.upperHint || '',
        middle: hintsElement.dataset.middleHint || '',
        lower: hintsElement.dataset.lowerHint || ''
    };

    return hintMap[levelKey] || fallbackHint;
}

function getSessionIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return (params.get('sid') || '').trim();
}

async function fetchWithSession(url, options = {}) {
    const sessionId = getSessionIdFromQuery();
    const headers = new Headers(options.headers || {});

    if (sessionId) {
        headers.set('X-Session-Id', sessionId);
    }

    return fetch(url, {
        ...options,
        credentials: 'include',
        headers
    });
}

document.addEventListener('DOMContentLoaded', () => {
    bindDockManagerEvents();
    initializeDockManagerPage();
});

function bindDockManagerEvents() {
    document.getElementById('add-container-form')?.addEventListener('submit', submitAddContainer);
    document.getElementById('request-driver-form')?.addEventListener('submit', submitDriverRequest);
    document.getElementById('incoming-vessel-form')?.addEventListener('submit', submitIncomingVessel);
    document.getElementById('vessel-containers-form')?.addEventListener('submit', submitVesselContainers);
    document.getElementById('arrival-reason-form')?.addEventListener('submit', submitArrivalReason);
    document.getElementById('logout-btn')?.addEventListener('click', logoutDockManager);
    document.getElementById('close-request-modal')?.addEventListener('click', closeRequestModal);
    document.getElementById('completed-containers-btn')?.addEventListener('click', openCompletedContainersModal);
    document.getElementById('close-completed-modal')?.addEventListener('click', closeCompletedContainersModal);
    document.getElementById('completed-vessels-btn')?.addEventListener('click', openCompletedVesselsModal);
    document.getElementById('close-completed-vessels-modal')?.addEventListener('click', closeCompletedVesselsModal);
    document.getElementById('close-completed-vessel-containers-modal')?.addEventListener('click', closeCompletedVesselContainersModal);
    document.getElementById('open-vessel-modal-btn')?.addEventListener('click', openVesselModal);
    document.getElementById('close-vessel-modal')?.addEventListener('click', closeVesselModal);
    document.getElementById('open-vessel-containers-modal-btn')?.addEventListener('click', openVesselContainersModal);
    document.getElementById('close-vessel-containers-modal')?.addEventListener('click', closeVesselContainersModal);
    document.getElementById('close-arrival-reason-modal')?.addEventListener('click', closeArrivalReasonModal);
    document.getElementById('add-vessel-container-row')?.addEventListener('click', () => addVesselContainerRow());
    document.getElementById('vessel-containers-body')?.addEventListener('click', handleVesselContainersTableClick);
    document.getElementById('vessel-containers-body')?.addEventListener('change', handleVesselContainersTableChange);
    document.getElementById('request-modal')?.addEventListener('click', handleModalBackdropClick);
    document.getElementById('completed-modal')?.addEventListener('click', handleModalBackdropClick);
    document.getElementById('completed-vessels-modal')?.addEventListener('click', handleModalBackdropClick);
    document.getElementById('completed-vessel-containers-modal')?.addEventListener('click', handleModalBackdropClick);
    document.getElementById('vessel-modal')?.addEventListener('click', handleModalBackdropClick);
    document.getElementById('vessel-containers-modal')?.addEventListener('click', handleModalBackdropClick);
    document.getElementById('arrival-reason-modal')?.addEventListener('click', handleModalBackdropClick);
    document.getElementById('levels-grid')?.addEventListener('click', handleLevelGridClick);
    document.getElementById('vessels-list')?.addEventListener('click', handleVesselsListClick);
    document.getElementById('berth-switcher')?.addEventListener('click', handleBerthSwitcherClick);
    document.getElementById('berth-map')?.addEventListener('click', handleBerthMapClick);
    document.getElementById('completed-vessels-body')?.addEventListener('click', handleCompletedVesselsTableClick);
    window.addEventListener('storage', handleDockManagerSync);
}

async function initializeDockManagerPage() {
    const session = await verifyDockManagerSession();
    if (!session) {
        return;
    }

    closeRequestModal();
    closeCompletedContainersModal();
    closeCompletedVesselsModal();
    closeCompletedVesselContainersModal();
    closeVesselModal();
    closeVesselContainersModal();
    closeArrivalReasonModal();
    await refreshDockManagerData();
    window.setInterval(refreshDockManagerData, 15000);
}

async function refreshDockManagerData() {
    await Promise.all([
        loadDockManagerDashboard(),
        loadCompletedContainers(),
        loadIncomingVessels()
    ]);
}

function handleModalBackdropClick(event) {
    if (event.target.id === 'request-modal') {
        closeRequestModal();
    }

    if (event.target.id === 'completed-modal') {
        closeCompletedContainersModal();
    }

    if (event.target.id === 'completed-vessels-modal') {
        closeCompletedVesselsModal();
    }

    if (event.target.id === 'completed-vessel-containers-modal') {
        closeCompletedVesselContainersModal();
    }

    if (event.target.id === 'vessel-modal') {
        closeVesselModal();
    }

    if (event.target.id === 'vessel-containers-modal') {
        closeVesselContainersModal();
    }

    if (event.target.id === 'arrival-reason-modal') {
        closeArrivalReasonModal();
    }
}

function handleDockManagerSync(event) {
    if (event.key !== 'dockmanager-refresh' || !event.newValue) {
        return;
    }

    refreshDockManagerData().catch((error) => {
        showPageAlert(error.message || 'تعذر تحديث بيانات الرصيف.', 'error');
    });
}

function broadcastDockManagerRefresh() {
    try {
        localStorage.setItem('dockmanager-refresh', String(Date.now()));
    } catch (error) {
        // Ignore storage synchronization failures.
    }
}

async function verifyDockManagerSession() {
    try {
        const response = await fetch('/api/session-status', {
            headers: getSessionIdFromQuery() ? { 'X-Session-Id': getSessionIdFromQuery() } : undefined,
            method: 'GET',
            cache: 'no-store'
        });

        if (!response.ok) {
            window.location.replace('/login.html');
            return null;
        }

        const data = await response.json();
        if (data?.session?.role !== 'dockmanager') {
            window.location.replace('/login.html');
            return null;
        }

        return data.session;
    } catch (error) {
        window.location.replace('/login.html');
        return null;
    }
}

async function loadDockManagerDashboard() {
    try {
        const response = await fetchWithSession('/api/dockmanager/dashboard', {
            method: 'GET',
            cache: 'no-store'
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحميل لوحة الرصيف.');
        }

        dashboardState.drivers = data.drivers || [];
        syncDriverSelectOptions();
        renderDockManagerDashboard(data);
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

async function loadCompletedContainers() {
    try {
        const response = await fetchWithSession('/api/dockmanager/completed-containers', {
            method: 'GET',
            cache: 'no-store'
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحميل الحاويات المسلمة.');
        }

        dashboardState.completedContainers = Array.isArray(data.containers) ? data.containers : [];
        renderCompletedContainers();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

async function loadIncomingVessels() {
    try {
        const response = await fetchWithSession('/api/dockmanager/reception/vessels', {
            method: 'GET',
            cache: 'no-store'
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحميل قائمة البواخر.');
        }

        dashboardState.vessels = Array.isArray(data.vessels) ? data.vessels : [];
        renderIncomingVessels();
        syncVesselSelectOptions();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

function renderDockManagerDashboard(data) {
    document.getElementById('manager-name').textContent = `مرحبا ${data.manager.name}`;
    dashboardState.berths = Array.isArray(data.berths) ? data.berths : [];

    if (!dashboardState.berths.find((berth) => berth.key === dashboardState.selectedBerthKey)) {
        dashboardState.selectedBerthKey = dashboardState.berths[0]?.key || 'A';
    }

    renderBerthSwitcher();
    renderBerthMap();
    renderSelectedBerthDashboard();
}

function handleBerthSwitcherClick(event) {
    const berthButton = event.target.closest('[data-berth-key]');
    if (!berthButton) {
        return;
    }

    setSelectedBerth(berthButton.dataset.berthKey);
}

function handleBerthMapClick(event) {
    const berthButton = event.target.closest('[data-berth-key]');
    if (!berthButton) {
        return;
    }

    setSelectedBerth(berthButton.dataset.berthKey, { scrollToLevels: true });
}

function setSelectedBerth(nextBerthKey, options = {}) {
    const normalizedBerthKey = String(nextBerthKey || '').trim().toUpperCase();
    if (!normalizedBerthKey) {
        return;
    }

    const berthExists = dashboardState.berths.find((berth) => berth.key === normalizedBerthKey)
        || DOCK_BERTHS.find((berth) => berth.key === normalizedBerthKey);
    if (!berthExists) {
        return;
    }

    const shouldScroll = Boolean(options.scrollToLevels);
    const berthChanged = normalizedBerthKey !== dashboardState.selectedBerthKey;

    if (berthChanged) {
        dashboardState.selectedBerthKey = normalizedBerthKey;
        renderBerthSwitcher();
        renderBerthMap();
        renderSelectedBerthDashboard();
    }

    if (shouldScroll) {
        document.getElementById('levels-grid')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

function renderBerthSwitcher() {
    const switcher = document.getElementById('berth-switcher');
    if (!switcher) {
        return;
    }

    const berthSource = dashboardState.berths.length
        ? dashboardState.berths
        : DOCK_BERTHS.map((berth) => ({ key: berth.key, label: berth.label }));

    switcher.innerHTML = berthSource.map((berth) => `
        <button
            type="button"
            class="berth-btn ${berth.key === dashboardState.selectedBerthKey ? 'active' : ''}"
            data-berth-key="${escapeHtml(berth.key)}"
            aria-pressed="${berth.key === dashboardState.selectedBerthKey ? 'true' : 'false'}"
        >${escapeHtml(berth.label || `رصيف ${berth.key}`)}</button>
    `).join('');
}

function renderBerthMap() {
    const mapElement = document.getElementById('berth-map');
    if (!mapElement) {
        return;
    }

    mapElement.querySelectorAll('[data-berth-key]').forEach((button) => {
        const berthKey = String(button.dataset.berthKey || '').trim().toUpperCase();
        const isActive = berthKey === dashboardState.selectedBerthKey;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function getSelectedBerth() {
    return dashboardState.berths.find((berth) => berth.key === dashboardState.selectedBerthKey) || null;
}

function renderSelectedBerthDashboard() {
    const selectedBerth = getSelectedBerth();
    const summary = selectedBerth?.summary || { occupiedCount: 0, totalSlots: 0, berthStatus: 'فارغ' };

    const renderableLevels = getRenderableBerthLevels(selectedBerth);
    const renderableSlotsCount = renderableLevels.reduce((total, level) => total + (Array.isArray(level.slots) ? level.slots.length : 0), 0);
    const totalSlots = Math.max(Number(summary.totalSlots || 0), renderableSlotsCount);

    document.getElementById('containers-count').textContent = `${summary.occupiedCount}/${totalSlots}`;
    document.getElementById('berth-status').textContent = summary.berthStatus;
    renderLevels(renderableLevels, selectedBerth);
}

function renderLevels(levels, selectedBerth = null) {
    const levelsGrid = document.getElementById('levels-grid');
    if (!levelsGrid) {
        return;
    }

    levelsGrid.classList.toggle('single-level-layout', levels.length === 1);

    levelsGrid.innerHTML = levels.map((level) => {
        const meta = LEVEL_META[level.key] || LEVEL_META.middle;
        const displayTitle = levels.length === 1 && selectedBerth
            ? (selectedBerth.label || level.label)
            : level.label;
        const slotsHtml = (level.slots || []).map((slot) => {
            const requestMarkup = slot.occupied && slot.request ? renderRequestBadge(slot.request) : '';
            const canSendRequest = slot.occupied && (!slot.request || ['unavailable', 'failed'].includes(slot.request.status));
            const actionMarkup = canSendRequest ? `
                <div class="slot-actions">
                    <button
                        type="button"
                        class="slot-action-btn request"
                        data-action="request"
                        data-slot-id="${slot.id}"
                        data-slot-code="${escapeHtml(slot.code)}"
                        data-container="${escapeHtml(slot.containerNumber)}"
                    >إرسال طلب</button>
                </div>
            ` : '';
            const ownerMarkup = slot.occupied && slot.ownerName
                ? `<p class="slot-owner">${escapeHtml(slot.ownerName)}</p>`
                : '';

            return `
                <article class="slot-card ${slot.occupied ? 'occupied' : ''}">
                    <div class="slot-code">${slot.code}</div>
                    <div class="slot-number">${slot.occupied ? escapeHtml(slot.containerNumber) : 'فارغ'}</div>
                    <p class="slot-status">${slot.occupied ? 'مشغول' : 'فارغ'}</p>
                    ${ownerMarkup}
                    ${requestMarkup}
                    ${actionMarkup}
                </article>
            `;
        }).join('');

        return `
            <section class="level-card">
                <div class="level-header">
                    <div>
                        <h2 class="level-title">${escapeHtml(displayTitle)}</h2>
                        <div class="level-hint">(${escapeHtml(getLevelHint(level.key, level.hint || ''))})</div>
                    </div>
                    <span class="level-arrow ${meta.arrowClass}">${meta.arrow}</span>
                </div>
                <div class="slots-grid">${slotsHtml}</div>
            </section>
        `;
    }).join('');
}

function renderRequestBadge(request) {
    const meta = REQUEST_STATUS_MAP[request.status];
    if (!meta) {
        return '';
    }

    const driverName = escapeHtml(request.driverName || 'سائق');
    const noteMarkup = request.responseNote ? `<small>${escapeHtml(request.responseNote)}</small>` : '';
    return `
        <div class="${meta.className}">
            <span>${meta.label}</span>
            <small>${driverName}</small>
            ${noteMarkup}
        </div>
    `;
}

function renderCompletedContainers() {
    const body = document.getElementById('completed-containers-body');
    if (!body) {
        return;
    }

    if (!dashboardState.completedContainers.length) {
        body.innerHTML = `
            <tr>
                <td colspan="4">لا توجد حاويات مكتملة حالياً.</td>
            </tr>
        `;
        return;
    }

    body.innerHTML = dashboardState.completedContainers.map((container) => `
        <tr>
            <td>${escapeHtml(container.containerNumber)}</td>
            <td>${escapeHtml(container.previousSlot)}</td>
            <td>${escapeHtml(container.driverName)}</td>
            <td>${escapeHtml(container.ownerName || 'غير محدد')}</td>
        </tr>
    `).join('');
}

function getCompletedVessels() {
    return dashboardState.vessels.filter((vessel) => vessel.status === 'completed');
}

function getActiveIncomingVessels() {
    return dashboardState.vessels.filter((vessel) => vessel.status !== 'completed');
}

function updateCompletedVesselsButton() {
    const button = document.getElementById('completed-vessels-btn');
    if (!button) {
        return;
    }

    const completedCount = getCompletedVessels().length;
    button.textContent = completedCount ? `البواخر المكتملة (${completedCount})` : 'البواخر المكتملة';
}

function renderCompletedVessels() {
    const body = document.getElementById('completed-vessels-body');
    if (!body) {
        return;
    }

    const completedVessels = getCompletedVessels();
    if (!completedVessels.length) {
        body.innerHTML = `
            <tr>
                <td colspan="8">لا توجد بواخر مكتملة حالياً.</td>
            </tr>
        `;
        return;
    }

    body.innerHTML = completedVessels.map((vessel) => `
        <tr>
            <td>${escapeHtml(String(vessel.id || '-'))}</td>
            <td>${escapeHtml(vessel.vesselName || '-')}</td>
            <td>${escapeHtml(vessel.voyageReference || '-')}</td>
            <td>${escapeHtml(buildCompletedVesselInfo(vessel))}</td>
            <td>${escapeHtml(getCompletedVesselBerthLabel(vessel))}</td>
            <td>${escapeHtml(formatDateTimeLabel(vessel.currentPlan?.generatedAt))}</td>
            <td>${escapeHtml(formatDateTimeLabel(vessel.currentPlan?.completedAt || vessel.updatedAt))}</td>
            <td>
                <button
                    type="button"
                    class="table-action info"
                    data-action="open-completed-vessel-containers"
                    data-vessel-id="${escapeHtml(String(vessel.id || ''))}"
                >عرض</button>
            </td>
        </tr>
    `).join('');
}

function buildCompletedVesselInfo(vessel) {
    const details = [
        vessel.arrivalSource ? `القدوم: ${vessel.arrivalSource}` : '',
        `الأولوية: ${translatePriority(vessel.dischargePriority)}`,
        `الحاويات: ${Number(vessel.receivedContainerCount || 0)} / ${Number(vessel.expectedContainerCount || 0)}`
    ].filter(Boolean);

    return details.join(' | ') || 'لا توجد معلومات إضافية';
}

function getCompletedVesselBerthLabel(vessel) {
    const proposedBerth = String(vessel.currentPlan?.proposedBerth || vessel.proposedBerth || '').trim().toUpperCase();
    if (!proposedBerth) {
        return 'غير محدد';
    }

    const berthMeta = DOCK_BERTHS.find((berth) => berth.key === proposedBerth);
    if (berthMeta?.label) {
        return berthMeta.label;
    }

    return proposedBerth.startsWith('BERTH_') ? translateDestination(proposedBerth.toLowerCase()) : `رصيف ${proposedBerth}`;
}

function getVesselDiscrepancyMeta(vessel) {
    const expectedCount = Math.max(Number(vessel?.expectedContainerCount || 0), 0);
    const receivedCount = Math.max(Number(vessel?.receivedContainerCount || 0), 0);
    const difference = receivedCount - expectedCount;
    const shortageCount = Math.max(expectedCount - receivedCount, 0);
    const extraCount = Math.max(receivedCount - expectedCount, 0);
    const discrepancyReason = String(vessel?.arrivalShortageReason || '').trim();

    return {
        expectedCount,
        receivedCount,
        difference,
        shortageCount,
        extraCount,
        discrepancyReason,
        hasShortage: shortageCount > 0,
        hasExtra: extraCount > 0,
        hasDiscrepancy: difference !== 0,
        canGeneratePlan: difference === 0 || Boolean(discrepancyReason)
    };
}

function getDiscrepancyTexts(discrepancy) {
    if (discrepancy?.hasShortage) {
        return {
            title: 'الحاويات التي لم تصل',
            countLabel: 'لم يصل',
            emptyReasonMessage: 'يرجى كتابة سبب الحاويات التي لم تصل.',
            blockedGenerateMessage: 'أضف سبب الحاويات التي لم تصل أولاً قبل توليد خطة التفريغ.'
        };
    }

    if (discrepancy?.hasExtra) {
        return {
            title: 'الحاويات الزائدة',
            countLabel: 'الزيادة',
            emptyReasonMessage: 'يرجى كتابة سبب الحاويات الزائدة.',
            blockedGenerateMessage: 'أضف سبب الحاويات الزائدة أولاً قبل توليد خطة التفريغ.'
        };
    }

    return {
        title: 'فرق الحاويات',
        countLabel: 'الفرق',
        emptyReasonMessage: 'يرجى كتابة سبب الفرق في عدد الحاويات.',
        blockedGenerateMessage: 'أضف سبب الفرق أولاً قبل توليد خطة التفريغ.'
    };
}

function renderVesselDiscrepancySection(vessel) {
    const discrepancy = getVesselDiscrepancyMeta(vessel);
    if (!discrepancy.hasDiscrepancy) {
        return '';
    }

    const texts = getDiscrepancyTexts(discrepancy);
    const title = texts.title;
    const count = discrepancy.hasShortage ? discrepancy.shortageCount : discrepancy.extraCount;
    const actions = `
        <div class="discrepancy-actions">
            <button
                type="button"
                class="secondary-btn compact-btn"
                data-action="open-arrival-reason"
                data-vessel-id="${vessel.id}"
            >${discrepancy.discrepancyReason ? 'تعديل السبب' : 'إضافة سبب'}</button>
            ${discrepancy.discrepancyReason
                ? `<button
                        type="button"
                        class="table-action info"
                        data-action="show-arrival-reason"
                        data-reason="${escapeHtml(discrepancy.discrepancyReason)}"
                    >عرض السبب</button>`
                : '<span class="discrepancy-note warning">يجب إضافة سبب قبل توليد الخطة</span>'}
        </div>
    `;

    return `
        <div class="vessel-discrepancy-row">
            <div class="vessel-list-item discrepancy-item">
                <span>${title}</span>
                <strong>${count}</strong>
            </div>
            ${actions}
        </div>
    `;
}

function getCompletedVesselById(vesselId) {
    return getCompletedVessels().find((vessel) => Number(vessel.id) === Number(vesselId)) || null;
}

function getCompletedTasksForVessel(vessel) {
    return Array.isArray(vessel?.tasks)
        ? vessel.tasks.filter((task) => task.status === 'completed')
        : [];
}

function handleCompletedVesselsTableClick(event) {
    const actionButton = event.target.closest('[data-action="open-completed-vessel-containers"]');
    if (!actionButton) {
        return;
    }

    openCompletedVesselContainersModal(Number(actionButton.dataset.vesselId));
}

function renderCompletedVesselContainersModal(vessel) {
    const meta = document.getElementById('completed-vessel-containers-meta');
    const body = document.getElementById('completed-vessel-containers-body');
    if (!meta || !body) {
        return;
    }

    if (!vessel) {
        meta.textContent = 'تفاصيل الحاويات التي تم تفريغها فعلياً.';
        body.innerHTML = `
            <tr>
                <td colspan="6">تعذر تحميل بيانات هذه الباخرة.</td>
            </tr>
        `;
        return;
    }

    const completedTasks = getCompletedTasksForVessel(vessel);
    meta.textContent = `الباخرة: ${vessel.vesselName || '-'} | الرحلة/IMO: ${vessel.voyageReference || '-'} | عدد الحاويات المفرغة: ${completedTasks.length}`;

    if (!completedTasks.length) {
        body.innerHTML = `
            <tr>
                <td colspan="6">لا توجد حاويات مفرغة لهذه الباخرة حالياً.</td>
            </tr>
        `;
        return;
    }

    body.innerHTML = completedTasks.map((task) => `
        <tr>
            <td>${escapeHtml(task.containerNumber || '-')}</td>
            <td>${escapeHtml(translateDestination(task.destinationType))}</td>
            <td>${escapeHtml(task.finalLocation || task.initialDropLocation || '-')}</td>
            <td>${escapeHtml(task.actualDriverName || task.driverName || '-')}</td>
            <td>${escapeHtml(task.actualMachineName || task.machineName || '-')}</td>
            <td>${escapeHtml(formatDateTimeLabel(task.actualUnloadedAt))}</td>
        </tr>
    `).join('');
}

function renderIncomingVessels() {
    const panel = document.getElementById('current-vessel-panel');
    const addContainersButton = document.getElementById('open-vessel-containers-modal-btn');
    const listElement = document.getElementById('vessels-list');
    const countElement = document.getElementById('vessels-count');
    const activeVessels = getActiveIncomingVessels();

    if (!panel || !addContainersButton || !listElement || !countElement) {
        return;
    }

    updateCompletedVesselsButton();

    if (!activeVessels.length) {
        panel.classList.add('hidden');
        addContainersButton.classList.add('hidden');
        listElement.innerHTML = '';
        countElement.textContent = '0 باخرة';
        return;
    }

    panel.classList.remove('hidden');
    addContainersButton.classList.remove('hidden');
    countElement.textContent = `${activeVessels.length} باخرة`;
    listElement.innerHTML = activeVessels.map((vessel) => `
        <article class="vessel-list-card">
            <div class="current-vessel-header">
                <div>
                    <h3>${escapeHtml(vessel.vesselName || '-')}</h3>
                    <div class="level-hint">${escapeHtml(vessel.voyageReference || '-')}</div>
                </div>
                <span class="vessel-status-badge">${escapeHtml(translateVesselStatus(vessel.status))}</span>
            </div>

            <div class="vessel-list-grid">
                <div class="vessel-list-item">
                    <span>الوصول المتوقع</span>
                    <strong>${escapeHtml(formatDateTimeLabel(vessel.expectedArrival))}</strong>
                </div>
                <div class="vessel-list-item">
                    <span>جهة القدوم</span>
                    <strong>${escapeHtml(vessel.arrivalSource || 'غير محدد')}</strong>
                </div>
                <div class="vessel-list-item">
                    <span>أولوية التفريغ</span>
                    <strong>${escapeHtml(translatePriority(vessel.dischargePriority))}</strong>
                </div>
                <div class="vessel-list-item">
                    <span>الحاويات المسجلة</span>
                    <strong>${Number(vessel.receivedContainerCount || 0)} / ${Number(vessel.expectedContainerCount || 0)}</strong>
                </div>
            </div>

            ${renderVesselDiscrepancySection(vessel)}

            <div class="vessel-plan-toolbar">
                <div class="plan-status-line">
                    <span>حالة الخطة:</span>
                    <strong>${escapeHtml(getPlanStatusLabel(vessel.currentPlan?.status))}</strong>
                </div>
                <div class="reception-actions">
                    ${!['discharging', 'completed', 'cancelled', 'archived'].includes(vessel.status)
                        ? renderGeneratePlanButton(vessel)
                        : ''}
                </div>
            </div>

            ${renderVesselTasksTable(vessel)}
            ${vessel.notes ? `<p class="vessel-list-notes">ملاحظات: ${escapeHtml(vessel.notes)}</p>` : ''}
        </article>
    `).join('');
}

function renderVesselTasksTable(vessel) {
    if (!Array.isArray(vessel.tasks) || !vessel.tasks.length) {
        return `
            <div class="plan-empty-state">
                لا توجد خطة تفريغ مولدة لهذه الباخرة حتى الآن.
            </div>
        `;
    }

    return `
        <div class="plan-table-wrap">
            <table class="plan-table">
                <thead>
                    <tr>
                        <th>الحاوية</th>
                        <th>الموقع الأولي</th>
                        <th>الوجهة</th>
                        <th>السائق</th>
                        <th>المعدة</th>
                        <th>الحالة</th>
                        <th>الموقع النهائي</th>
                        <th>إجراء</th>
                    </tr>
                </thead>
                <tbody>
                    ${vessel.tasks.map((task) => `
                        ${(() => {
                            const driverResponseStatus = String(task.driverResponseStatus || 'pending');
                            const canConfirmUnload = vessel.currentPlan?.status === 'active'
                                && task.status !== 'completed'
                                && driverResponseStatus === 'completed';
                            const showAssignmentDetails = Boolean(task.driverUserId)
                                && ['accepted', 'completed'].includes(driverResponseStatus);
                            const actionClass = canConfirmUnload ? 'table-action complete' : 'table-action disabled';
                            const actionDisabled = canConfirmUnload ? '' : ' disabled aria-disabled="true"';
                            return `
                        <tr>
                            <td>${escapeHtml(task.containerNumber)}</td>
                            <td>${escapeHtml(task.initialDropLocation || '-')}</td>
                            <td>${escapeHtml(translateDestination(task.destinationType))}</td>
                            <td>${escapeHtml(showAssignmentDetails ? (task.driverName || '-') : '-')}</td>
                            <td>${escapeHtml(showAssignmentDetails ? (task.machineName || '-') : '-')}</td>
                            <td>${escapeHtml(getDockManagerTaskStatusLabel(task))}</td>
                            <td>${escapeHtml(task.finalLocation || '-')}</td>
                            <td>
                                <button type="button" class="${actionClass}" data-action="complete-task" data-task-id="${task.id}" data-destination-type="${escapeHtml(task.destinationType || '')}" data-final-location="${escapeHtml(task.finalLocation || task.initialDropLocation || '')}"${actionDisabled}>اكتمل التنزيل</button>
                            </td>
                        </tr>
                            `;
                        })()}
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderGeneratePlanButton(vessel) {
    const discrepancy = getVesselDiscrepancyMeta(vessel);
    const texts = getDiscrepancyTexts(discrepancy);
    const disabledMarkup = discrepancy.canGeneratePlan ? '' : ' disabled aria-disabled="true"';
    const disabledClass = discrepancy.canGeneratePlan ? '' : ' disabled-btn';
    const title = discrepancy.canGeneratePlan ? '' : ` title="${escapeHtml(texts.blockedGenerateMessage)}"`;

    return `<button type="button" class="secondary-btn compact-btn${disabledClass}" data-action="generate-plan" data-vessel-id="${vessel.id}"${disabledMarkup}${title}>توليد خطة التفريغ</button>`;
}

function handleVesselsListClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
        return;
    }

    const action = actionButton.dataset.action;
    if (action === 'generate-plan') {
        if (actionButton.hasAttribute('disabled')) {
            const vessel = dashboardState.vessels.find((item) => Number(item.id) === Number(actionButton.dataset.vesselId));
            const discrepancy = getVesselDiscrepancyMeta(vessel);
            const texts = getDiscrepancyTexts(discrepancy);
            showPageAlert(texts.blockedGenerateMessage, 'error');
            return;
        }

        generateDischargePlan(Number(actionButton.dataset.vesselId));
        return;
    }

    if (action === 'open-arrival-reason') {
        openArrivalReasonModal(Number(actionButton.dataset.vesselId));
        return;
    }

    if (action === 'show-arrival-reason') {
        showPageAlert(decodeHtml(actionButton.dataset.reason || 'لا يوجد سبب مسجل حالياً.'), 'success');
        return;
    }

    if (action === 'complete-task') {
        const suggestedLocation = decodeHtml(actionButton.dataset.finalLocation || '');
        completeDischargeTask(
            Number(actionButton.dataset.taskId),
            suggestedLocation,
            String(actionButton.dataset.destinationType || '').trim().toLowerCase()
        );
    }
}

function handleLevelGridClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
        return;
    }

    const action = actionButton.dataset.action;
    if (action === 'request') {
        openRequestModal({
            slotId: actionButton.dataset.slotId,
            slotCode: actionButton.dataset.slotCode,
            containerNumber: actionButton.dataset.container
        });
    }
}

async function submitAddContainer(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = {
        containerNumber: form.containerNumber.value.trim(),
        ownerName: form.ownerName.value.trim(),
        level: form.level.value,
        berthKey: dashboardState.selectedBerthKey
    };

    try {
        const response = await fetchWithSession('/api/dockmanager/containers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تسجيل الحاوية.');
        }

        form.reset();
        showPageAlert(data.message, 'success');
        broadcastDockManagerRefresh();
        await loadDockManagerDashboard();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

function openRequestModal({ slotId, slotCode, containerNumber }) {
    if (!dashboardState.drivers.length) {
        showPageAlert('لا يوجد سائقون متاحون حالياً لإرسال الطلب.', 'error');
        return;
    }

    document.getElementById('request-slot-id').value = slotId;
    document.getElementById('request-container-number').value = containerNumber;
    document.getElementById('request-slot-meta').textContent = `الخانة ${slotCode} - الحاوية ${containerNumber}`;

    syncDriverSelectOptions();
    document.getElementById('request-modal').classList.remove('hidden');
}

function closeRequestModal() {
    document.getElementById('request-modal')?.classList.add('hidden');
    document.getElementById('request-driver-form')?.reset();
}

function openCompletedContainersModal() {
    loadCompletedContainers()
        .finally(() => {
            renderCompletedContainers();
            document.getElementById('completed-modal')?.classList.remove('hidden');
        });
}

function closeCompletedContainersModal() {
    document.getElementById('completed-modal')?.classList.add('hidden');
}

function openCompletedVesselsModal() {
    renderCompletedVessels();
    document.getElementById('completed-vessels-modal')?.classList.remove('hidden');
}

function closeCompletedVesselsModal() {
    document.getElementById('completed-vessels-modal')?.classList.add('hidden');
}

function openCompletedVesselContainersModal(vesselId) {
    dashboardState.selectedCompletedVesselId = Number(vesselId) || null;
    renderCompletedVesselContainersModal(getCompletedVesselById(dashboardState.selectedCompletedVesselId));
    document.getElementById('completed-vessel-containers-modal')?.classList.remove('hidden');
}

function closeCompletedVesselContainersModal() {
    dashboardState.selectedCompletedVesselId = null;
    document.getElementById('completed-vessel-containers-modal')?.classList.add('hidden');
}

function openVesselModal() {
    document.getElementById('vessel-modal')?.classList.remove('hidden');
}

function closeVesselModal() {
    document.getElementById('vessel-modal')?.classList.add('hidden');
    document.getElementById('incoming-vessel-form')?.reset();
}

function openVesselContainersModal() {
    const eligibleVessels = dashboardState.vessels.filter((vessel) => ['arriving', 'containers_added'].includes(vessel.status));
    if (!eligibleVessels.length) {
        showPageAlert('أضف باخرة واصلة أولاً قبل تسجيل الحاويات.', 'error');
        return;
    }

    resetVesselContainersTable(1);
    syncVesselSelectOptions();
    document.getElementById('vessel-containers-meta').textContent =
        'اختر الباخرة التي وصلت منها الحاويات ثم أدخل بياناتها.';
    document.getElementById('vessel-containers-modal')?.classList.remove('hidden');
}

function closeVesselContainersModal() {
    document.getElementById('vessel-containers-modal')?.classList.add('hidden');
    document.getElementById('vessel-containers-form')?.reset();
    resetVesselContainersTable(0);
}

function openArrivalReasonModal(vesselId) {
    const vessel = dashboardState.vessels.find((item) => Number(item.id) === Number(vesselId));
    const discrepancy = getVesselDiscrepancyMeta(vessel);
    const texts = getDiscrepancyTexts(discrepancy);

    if (!vessel || !discrepancy.hasDiscrepancy) {
        showPageAlert('إضافة السبب متاحة فقط عند وجود فرق في عدد الحاويات.', 'error');
        return;
    }

    dashboardState.selectedArrivalReasonVesselId = Number(vesselId);
    document.getElementById('arrival-reason-vessel-id').value = String(vessel.id);
    document.getElementById('arrival-reason-text').value = discrepancy.discrepancyReason || '';
    document.getElementById('arrival-reason-meta').textContent =
        `الباخرة ${vessel.vesselName || '-'} | المتوقع ${discrepancy.expectedCount} | المسجل ${discrepancy.receivedCount} | ${texts.countLabel} ${discrepancy.hasShortage ? discrepancy.shortageCount : discrepancy.extraCount}`;
    document.getElementById('arrival-reason-modal')?.classList.remove('hidden');
}

function closeArrivalReasonModal() {
    dashboardState.selectedArrivalReasonVesselId = null;
    document.getElementById('arrival-reason-modal')?.classList.add('hidden');
    document.getElementById('arrival-reason-form')?.reset();
}

function syncVesselSelectOptions() {
    const select = document.getElementById('vessel-select');
    if (!select) {
        return;
    }

    const eligibleVessels = dashboardState.vessels.filter((vessel) => ['arriving', 'containers_added'].includes(vessel.status));

    select.innerHTML = `
        <option value="">اختر الباخرة</option>
        ${eligibleVessels.map((vessel, index) => `
            <option value="${vessel.id}" ${index === 0 ? 'selected' : ''}>
                ${escapeHtml(vessel.vesselName || 'باخرة')} - ${escapeHtml(vessel.voyageReference || '-')}
            </option>
        `).join('')}
    `;
}

function syncDriverSelectOptions() {
    const select = document.getElementById('request-driver-select');
    if (!select) {
        return;
    }

    select.innerHTML = `
        <option value="">اختر السائق</option>
        ${dashboardState.drivers.map((driver) => `
            <option value="${driver.id}">${escapeHtml(driver.name || driver.email)}</option>
        `).join('')}
    `;
}

function handleVesselContainersTableClick(event) {
    const removeButton = event.target.closest('[data-remove-vessel-row]');
    if (!removeButton) {
        return;
    }

    const body = document.getElementById('vessel-containers-body');
    if (!body) {
        return;
    }

    const rows = body.querySelectorAll('tr');
    if (rows.length <= 1) {
        showPageAlert('يجب أن يبقى صف واحد على الأقل لإدخال الحاويات.', 'error');
        return;
    }

    removeButton.closest('tr')?.remove();
}

function handleVesselContainersTableChange(event) {
    const containerInput = event.target.closest('[name="containerNumber"]');
    if (!containerInput) {
        return;
    }

    validateContainerCodeUniqueness(containerInput);
    if (containerInput.validationMessage) {
        return;
    }

    verifyContainerCodeAgainstSystem(containerInput);
}

async function verifyContainerCodeAgainstSystem(containerInput) {
    const normalizedValue = normalizeContainerCodeUi(containerInput?.value || '');
    if (!containerInput || !normalizedValue) {
        return;
    }

    const requestToken = `${normalizedValue}-${Date.now()}`;
    containerInput.dataset.validationToken = requestToken;

    try {
        const response = await fetchWithSession(`/api/dockmanager/reception/container-code/check?code=${encodeURIComponent(normalizedValue)}`, {
            method: 'GET',
            cache: 'no-store'
        });

        const data = await response.json();
        if (containerInput.dataset.validationToken !== requestToken) {
            return;
        }

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر التحقق من رقم الحاوية.');
        }

        if (Boolean(data.exists)) {
            containerInput.setCustomValidity(`رقم الحاوية ${normalizedValue} مستخدم مسبقاً في النظام.`);
            containerInput.reportValidity();
            return;
        }

        containerInput.setCustomValidity('');
    } catch (error) {
        if (containerInput.dataset.validationToken !== requestToken) {
            return;
        }

        showPageAlert(error.message || 'تعذر التحقق من رقم الحاوية.', 'error');
    }
}

function resetVesselContainersTable(rowCount = 1) {
    const body = document.getElementById('vessel-containers-body');
    if (!body) {
        return;
    }

    body.innerHTML = '';
    for (let index = 0; index < rowCount; index += 1) {
        addVesselContainerRow();
    }
}

function addVesselContainerRow(values = {}) {
    const body = document.getElementById('vessel-containers-body');
    if (!body) {
        return;
    }

    vesselContainerRowId += 1;
    const rowId = vesselContainerRowId;
    body.insertAdjacentHTML('beforeend', createVesselContainerRowMarkup(rowId, values));

    if (!String(values.containerNumber || '').trim()) {
        autoFillGeneratedContainerCode(rowId);
    }
}

function renderCargoTypeOptions(selectedValue = '') {
    return [
        '<option value="">نوع الحمولة</option>',
        ...CARGO_TYPE_OPTIONS.map((option) => (
            `<option value="${escapeHtml(option)}" ${selectedValue === option ? 'selected' : ''}>${escapeHtml(option)}</option>`
        ))
    ].join('');
}

function createVesselContainerRowMarkup(rowId, values = {}) {
    return `
        <tr data-row-id="${rowId}">
            <td><input type="text" name="containerNumber" value="${escapeHtml(values.containerNumber || '')}" placeholder="رقم الحاوية" required></td>
            <td><input type="text" name="ownerName" value="${escapeHtml(values.ownerName || '')}" placeholder="اسم المالك" required></td>
            <td>
                <select name="containerSize" required>
                    <option value="">الحجم</option>
                    <option value="20" ${values.containerSize === '20' ? 'selected' : ''}>20 قدم</option>
                    <option value="40" ${values.containerSize === '40' ? 'selected' : ''}>40 قدم</option>
                </select>
            </td>
            <td>
                <select name="containerCondition" required>
                    <option value="">الحالة</option>
                    <option value="sound" ${values.containerCondition === 'sound' ? 'selected' : ''}>سليمة</option>
                    <option value="damaged" ${values.containerCondition === 'damaged' ? 'selected' : ''}>متضررة</option>
                    <option value="inspection" ${values.containerCondition === 'inspection' ? 'selected' : ''}>تحتاج فحص</option>
                </select>
            </td>
            <td><input type="number" name="containerWeight" value="${escapeHtml(values.containerWeight || '')}" min="0" step="0.01" placeholder="وزن الحاوية" required></td>
            <td>
                <select name="cargoType">
                    ${renderCargoTypeOptions(values.cargoType || '')}
                </select>
            </td>
            <td>
                <select name="destinationType">
                    <option value="">اختيار تلقائي حسب فراغ الرصيف</option>
                    <option value="truck_berth" ${values.destinationType === 'truck_berth' ? 'selected' : ''}>رصيف الشاحنات</option>
                    <option value="train_berth" ${values.destinationType === 'train_berth' ? 'selected' : ''}>رصيف القطار</option>
                    <option value="berth_a" ${values.destinationType === 'berth_a' ? 'selected' : ''}>رصيف A</option>
                    <option value="berth_b" ${values.destinationType === 'berth_b' ? 'selected' : ''}>رصيف B</option>
                    <option value="berth_c" ${values.destinationType === 'berth_c' ? 'selected' : ''}>رصيف C</option>
                </select>
            </td>
            <td>
                <button type="button" class="remove-row-btn" data-remove-vessel-row="true">حذف</button>
            </td>
        </tr>
    `;
}

async function autoFillGeneratedContainerCode(rowId) {
    const row = document.querySelector(`#vessel-containers-body tr[data-row-id="${rowId}"]`);
    const input = row?.querySelector('[name="containerNumber"]');
    if (!input || input.value.trim()) {
        return;
    }

    input.placeholder = 'جارٍ توليد الكود...';

    try {
        const response = await fetchWithSession('/api/dockmanager/reception/container-code', {
            method: 'GET',
            cache: 'no-store'
        });

        const data = await response.json();
        if (!response.ok || !data.success || !String(data.code || '').trim()) {
            throw new Error(data.message || 'تعذر توليد كود الحاوية.');
        }

        if (!input.value.trim()) {
            input.value = getNextUniqueContainerCode(String(data.code || '').trim().toUpperCase(), getUsedContainerCodes(input));
            validateContainerCodeUniqueness(input);
        }
    } catch (error) {
        input.placeholder = 'رقم الحاوية';
        showPageAlert(error.message || 'تعذر توليد كود الحاوية تلقائياً.', 'error');
        return;
    }

    input.placeholder = 'رقم الحاوية';
}

function collectVesselContainersPayload() {
    const rows = Array.from(document.querySelectorAll('#vessel-containers-body tr'));
    if (!rows.length) {
        throw new Error('أضف صفاً واحداً على الأقل قبل الحفظ.');
    }

    const seenContainerNumbers = new Set();

    return rows.map((row, index) => {
        const readValue = (selector) => row.querySelector(selector)?.value.trim() || '';
        const payload = {
            containerNumber: normalizeContainerCodeUi(readValue('[name="containerNumber"]')),
            containerSize: readValue('[name="containerSize"]'),
            containerCondition: readValue('[name="containerCondition"]'),
            ownerName: readValue('[name="ownerName"]'),
            containerWeight: readValue('[name="containerWeight"]'),
            cargoType: readValue('[name="cargoType"]'),
            destinationType: readValue('[name="destinationType"]')
        };

        if (!payload.containerNumber || !payload.containerSize || !payload.containerCondition || !payload.ownerName || !payload.containerWeight) {
            throw new Error(`يرجى إكمال بيانات الصف ${index + 1} قبل الحفظ.`);
        }

        if (seenContainerNumbers.has(payload.containerNumber)) {
            throw new Error(`رقم الحاوية ${payload.containerNumber} مكرر داخل النموذج.`);
        }

        seenContainerNumbers.add(payload.containerNumber);

        return payload;
    });
}

async function submitIncomingVessel(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = {
        vesselName: form.vesselName.value.trim(),
        voyageReference: form.voyageReference.value.trim(),
        expectedArrival: form.expectedArrival.value,
        arrivalSource: form.arrivalSource.value.trim(),
        expectedContainerCount: form.expectedContainerCount.value,
        dischargePriority: form.dischargePriority.value,
        notes: form.notes.value.trim()
    };

    try {
        const response = await fetchWithSession('/api/dockmanager/reception/vessels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر حفظ الباخرة الواصلة.');
        }

        closeVesselModal();
        showPageAlert(data.message, 'success');
        broadcastDockManagerRefresh();
        await loadIncomingVessels();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

async function submitVesselContainers(event) {
    event.preventDefault();
    const vesselId = Number(event.currentTarget.vesselId.value);

    let containers;
    try {
        containers = collectVesselContainersPayload();
    } catch (error) {
        showPageAlert(error.message, 'error');
        return;
    }

    if (!vesselId) {
        showPageAlert('اختر الباخرة أولاً قبل حفظ الحاويات.', 'error');
        return;
    }

    try {
        const response = await fetchWithSession(`/api/dockmanager/reception/vessels/${vesselId}/containers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ containers })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر حفظ حاويات الباخرة.');
        }

        closeVesselContainersModal();
        showPageAlert(data.message, 'success');
        broadcastDockManagerRefresh();
        await loadIncomingVessels();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

async function submitArrivalReason(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const vesselId = Number(form.vesselId.value);
    const reason = form.reason.value.trim();
    const vessel = dashboardState.vessels.find((item) => Number(item.id) === Number(vesselId));
    const discrepancy = getVesselDiscrepancyMeta(vessel);
    const texts = getDiscrepancyTexts(discrepancy);

    if (!vesselId) {
        showPageAlert('تعذر تحديد الباخرة المطلوبة.', 'error');
        return;
    }

    if (!reason) {
        showPageAlert(texts.emptyReasonMessage, 'error');
        return;
    }

    try {
        const response = await fetchWithSession(`/api/dockmanager/reception/vessels/${vesselId}/arrival-shortage-reason`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر حفظ سبب عدم الوصول.');
        }

        closeArrivalReasonModal();
        showPageAlert(data.message, 'success');
        broadcastDockManagerRefresh();
        await loadIncomingVessels();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

async function generateDischargePlan(vesselId) {
    if (!vesselId) {
        showPageAlert('تعذر تحديد الباخرة المطلوبة لتوليد الخطة.', 'error');
        return;
    }

    try {
        const response = await fetchWithSession(`/api/dockmanager/reception/vessels/${vesselId}/generate-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر توليد خطة التفريغ.');
        }

        showPageAlert(data.message, 'success');
        broadcastDockManagerRefresh();
        await loadIncomingVessels();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

async function completeDischargeTask(taskId, suggestedLocation = '', destinationType = '') {
    if (!taskId) {
        showPageAlert('تعذر تحديد مهمة التنزيل المطلوبة.', 'error');
        return;
    }

    const isBerthDestination = ['berth_a', 'berth_b', 'berth_c', 'truck_berth', 'train_berth'].includes(String(destinationType || '').trim().toLowerCase());
    let finalLocation = suggestedLocation || '';

    if (!isBerthDestination) {
        const promptedLocation = window.prompt('أدخل الموقع النهائي للحاوية:', suggestedLocation || '');
        if (promptedLocation === null) {
            return;
        }

        finalLocation = promptedLocation || '';
        if (!finalLocation.trim()) {
            showPageAlert('يجب إدخال الموقع النهائي قبل تأكيد التنزيل.', 'error');
            return;
        }
    }

    try {
        const response = await fetchWithSession(`/api/dockmanager/reception/tasks/${taskId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ finalLocation })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تأكيد تنزيل الحاوية.');
        }

        showPageAlert(data.message, 'success');
        broadcastDockManagerRefresh();
        await refreshDockManagerData();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

async function submitDriverRequest(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = {
        slotId: Number(form.slotId.value),
        driverUserId: Number(form.driverUserId.value)
    };

    try {
        const response = await fetchWithSession('/api/dockmanager/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر إرسال الطلب إلى السائق.');
        }

        closeRequestModal();
        showPageAlert(data.message, 'success');
        broadcastDockManagerRefresh();
        await loadDockManagerDashboard();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

function showPageAlert(message, type) {
    const alertBox = document.getElementById('page-alert');
    if (!alertBox) {
        return;
    }

    alertBox.textContent = message;
    alertBox.className = `page-alert ${type}`;

    window.clearTimeout(showPageAlert.timeoutId);
    showPageAlert.timeoutId = window.setTimeout(() => {
        alertBox.className = 'page-alert hidden';
    }, 4000);
}

async function logoutDockManager() {
    try {
        await fetchWithSession('/api/logout', {
            method: 'POST'
        });
    } catch (error) {
        // Ignore logout network failures and continue redirecting.
    } finally {
        window.location.replace('/login.html');
    }
}

function formatDateTimeLabel(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

function translatePriority(priority) {
    return PRIORITY_LABELS[priority] || 'غير محدد';
}

function translateVesselStatus(status) {
    return VESSEL_STATUS_MAP[status] || status || 'غير محدد';
}

function getPlanStatusLabel(status) {
    return PLAN_STATUS_LABELS[status] || 'لا توجد خطة';
}

function getTaskStatusLabel(status) {
    return TASK_STATUS_LABELS[status] || status || 'غير محدد';
}

function getDockManagerTaskStatusLabel(task) {
    if (!task) {
        return 'غير محدد';
    }

    if (task.status === 'completed') {
        return getTaskStatusLabel(task.status);
    }

    const driverResponseStatus = String(task.driverResponseStatus || 'pending');
    if (driverResponseStatus === 'completed') {
        return 'بانتظار التأكيد';
    }

    if (driverResponseStatus === 'accepted' || task.status === 'in_progress') {
        return 'قيد التنفيذ';
    }

    return 'انتظار';
}

function translateDestination(destinationType) {
    return DESTINATION_LABELS[destinationType] || destinationType || 'غير محدد';
}

function decodeHtml(value) {
    const textArea = document.createElement('textarea');
    textArea.innerHTML = String(value || '');
    return textArea.value;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

REQUEST_STATUS_MAP.pending = { label: 'بانتظار قرار الإدارة', className: 'request-badge pending' };
REQUEST_STATUS_MAP.approved = { label: 'تمت الموافقة', className: 'request-badge approved' };
REQUEST_STATUS_MAP.rejected = { label: 'مرفوض من الإدارة', className: 'request-badge unavailable' };

function renderLevels(levels, selectedBerth = null) {
    const levelsGrid = document.getElementById('levels-grid');
    if (!levelsGrid) {
        return;
    }

    levelsGrid.classList.toggle('single-level-layout', levels.length === 1);

    levelsGrid.innerHTML = levels.map((level) => {
        const meta = LEVEL_META[level.key] || LEVEL_META.middle;
        const displayTitle = levels.length === 1 && selectedBerth
            ? (selectedBerth.label || level.label)
            : level.label;
        const slotsHtml = (level.slots || []).map((slot) => {
            const requestMarkup = slot.occupied && slot.request ? renderRequestBadge(slot.request) : '';
            const canSendRequest = slot.occupied && (!slot.request || slot.request.status === 'rejected');
            const actionMarkup = canSendRequest ? `
                <div class="slot-actions">
                    <button
                        type="button"
                        class="slot-action-btn request"
                        data-action="request"
                        data-slot-id="${slot.id}"
                        data-slot-code="${escapeHtml(slot.code)}"
                        data-container="${escapeHtml(slot.containerNumber)}"
                        data-owner-name="${escapeHtml(slot.ownerName || '')}"
                    >طلب تسليم</button>
                </div>
            ` : '';
            const ownerMarkup = slot.occupied && slot.ownerName
                ? `<p class="slot-owner">${escapeHtml(slot.ownerName)}</p>`
                : '';

            return `
                <article class="slot-card ${slot.occupied ? 'occupied' : ''}">
                    <div class="slot-code">${slot.code}</div>
                    <div class="slot-number">${slot.occupied ? escapeHtml(slot.containerNumber) : 'فارغ'}</div>
                    <p class="slot-status">${slot.occupied ? 'مشغول' : 'فارغ'}</p>
                    ${ownerMarkup}
                    ${requestMarkup}
                    ${actionMarkup}
                </article>
            `;
        }).join('');

        return `
            <section class="level-card">
                <div class="level-header">
                    <div>
                        <h2 class="level-title">${escapeHtml(displayTitle)}</h2>
                        <div class="level-hint">(${escapeHtml(getLevelHint(level.key, level.hint || ''))})</div>
                    </div>
                    <span class="level-arrow ${meta.arrowClass}">${meta.arrow}</span>
                </div>
                <div class="slots-grid">${slotsHtml}</div>
            </section>
        `;
    }).join('');
}

function renderRequestBadge(request) {
    const meta = REQUEST_STATUS_MAP[request.status];
    if (!meta) {
        return '';
    }

    const reviewerLabel = request.reviewedByEmail
        ? escapeHtml(request.reviewedByEmail)
        : 'الإدارة';
    const noteMarkup = request.responseNote ? `<small>${escapeHtml(request.responseNote)}</small>` : '';
    return `
        <div class="${meta.className}">
            <span>${meta.label}</span>
            <small>${reviewerLabel}</small>
            ${noteMarkup}
        </div>
    `;
}

function handleLevelGridClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) {
        return;
    }

    const action = actionButton.dataset.action;
    if (action === 'request') {
        openRequestModal({
            slotId: actionButton.dataset.slotId,
            slotCode: actionButton.dataset.slotCode,
            containerNumber: actionButton.dataset.container,
            ownerName: decodeHtml(actionButton.dataset.ownerName || '')
        });
    }
}

async function openRequestModal({ slotId, slotCode, containerNumber, ownerName = '' }) {
    const form = document.getElementById('request-driver-form');
    if (!form) {
        return;
    }

    form.reset();
    document.getElementById('request-slot-id').value = slotId;
    document.getElementById('request-container-number').value = containerNumber;
    document.getElementById('request-slot-meta').textContent = `الخانة ${slotCode} - الحاوية ${containerNumber}`;
    document.getElementById('request-customer-name').value = ownerName || '';
    document.getElementById('request-container-numbers').value = containerNumber || '';
    document.getElementById('request-modal').classList.remove('hidden');

    try {
        const response = await fetchWithSession(`/api/dockmanager/release-requests/context/${encodeURIComponent(slotId)}`, {
            method: 'GET',
            cache: 'no-store'
        });

        const data = await response.json();
        if (!response.ok || !data.success || !data.context) {
            throw new Error(data.message || 'تعذر تحميل بيانات الحاوية.');
        }

        const context = data.context;
        document.getElementById('request-customer-name').value = String(context.ownerName || ownerName || '').trim();
        document.getElementById('request-vessel-name').value = String(context.vesselName || '').trim();
        document.getElementById('request-voyage-reference').value = String(context.voyageReference || '').trim();
        document.getElementById('request-arrival-date').value = formatRequestDateValue(context.arrivalDate);
        document.getElementById('request-container-numbers').value = String(context.containerNumber || containerNumber || '').trim();
    } catch (error) {
        document.getElementById('request-container-numbers').value = containerNumber || '';
    }
}

function closeRequestModal() {
    document.getElementById('request-modal')?.classList.add('hidden');
    document.getElementById('request-driver-form')?.reset();
}

async function submitDriverRequest(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const payload = {
        slotId: Number(form.slotId.value),
        containerNumber: form.containerNumber.value.trim(),
        customerName: form.customerName.value.trim(),
        customsBrokerName: form.customsBrokerName.value.trim(),
        vesselName: form.vesselName.value.trim(),
        voyageReference: form.voyageReference.value.trim(),
        billOfLadingNumber: form.billOfLadingNumber.value.trim(),
        customsStatementNumber: form.customsStatementNumber.value.trim(),
        containerNumbers: form.containerNumbers.value.trim(),
        containerCount: 1,
        arrivalDate: form.arrivalDate.value,
        clearanceDeliveryDate: form.clearanceDeliveryDate.value,
        notes: form.notes.value.trim()
    };

    try {
        const response = await fetchWithSession('/api/dockmanager/release-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر إرسال طلب التسليم إلى الإدارة.');
        }

        closeRequestModal();
        showPageAlert(data.message, 'success');
        broadcastDockManagerRefresh();
        await loadDockManagerDashboard();
    } catch (error) {
        showPageAlert(error.message, 'error');
    }
}

function formatRequestDateValue(value) {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
