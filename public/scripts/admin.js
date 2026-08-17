let usersData = [];
let collapsedRoleGroups = {};
let currentAdminEmail = '';
let dashboardCharts = {
    machinesStatus: null,
    usersRoles: null,
    locationsStatus: null
};
const ROLE_METADATA = {
    admin: {
        order: 1,
        singularLabel: 'مدير',
        pluralLabel: 'المديرون'
    },
    supervisor: {
        order: 2,
        singularLabel: 'مشرف',
        pluralLabel: 'المشرفون'
    },
    dockmanager: {
        order: 3,
        singularLabel: 'مدير رصيف',
        pluralLabel: 'مدراء الأرصفة'
    },
    mechanic: {
        order: 4,
        singularLabel: 'فني',
        pluralLabel: 'الفنيون'
    },
    driver: {
        order: 5,
        singularLabel: 'سائق',
        pluralLabel: 'السائقون'
    }
};
const ROLE_ALIASES = {
    admin: 'admin',
    supervisor: 'supervisor',
    mechanic: 'mechanic',
    driver: 'driver',
    dockmanager: 'dockmanager',
    'dock manager': 'dockmanager',
    'dock_manager': 'dockmanager',
    'مدير رصيف': 'dockmanager'
};

function openModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function verifyAdminSession() {
    try {
        const response = await fetch('/api/session-status', {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            window.location.replace('/login.html');
            return false;
        }

        const data = await response.json();
        if (!data?.success || data?.session?.role !== 'admin') {
            window.location.replace('/login.html');
            return false;
        }

        currentAdminEmail = String(data.session.email || '').trim().toLowerCase();
        return true;
    } catch (error) {
        window.location.replace('/login.html');
        return false;
    }
}

function showAlert(message, type = 'error', targetElementId = 'user-alert') {
    const alertBox = document.getElementById(targetElementId);
    if (!alertBox) {
        return;
    }

    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove('hidden');

    if (type === 'success' && targetElementId !== 'user-alert') {
        setTimeout(() => alertBox.classList.add('hidden'), 3000);
    }
}

function hideAlert(targetElementId) {
    const alertBox = document.getElementById(targetElementId);
    if (alertBox) {
        alertBox.classList.add('hidden');
    }
}

function updateActiveTab(targetId) {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.remove('active');
    });

    const clickedButton = document.querySelector(`.tab-btn[data-target="${targetId}"]`);
    if (clickedButton) {
        clickedButton.classList.add('active');
    }
}

function showTabContent(targetId) {
    const iframe = document.getElementById('content-iframe');

    document.querySelectorAll('.tab-content').forEach((div) => {
        div.classList.add('hidden');
    });

    iframe.classList.add('hidden');
    iframe.src = '';

    document.getElementById(targetId).classList.remove('hidden');
    updateActiveTab(targetId);

    if (targetId === 'dashboard') {
        loadDashboard();
    }

    if (targetId === 'users') {
        collapsedRoleGroups = {};
        fetchUsers();
    }
}

function loadIframe(targetId, url) {
    const iframe = document.getElementById('content-iframe');

    document.querySelectorAll('.tab-content').forEach((div) => {
        div.classList.add('hidden');
    });

    iframe.classList.remove('hidden');
    iframe.src = url;
    updateActiveTab(targetId);
}

function normalizeRole(role) {
    const normalizedValue = String(role || '').trim().toLowerCase();
    return ROLE_ALIASES[normalizedValue] || normalizedValue;
}

function getRoleLabel(role, type = 'singularLabel') {
    const roleKey = normalizeRole(role);
    return ROLE_METADATA[roleKey]?.[type] || String(role || 'غير محددة').trim() || 'غير محددة';
}

function getAccountStatusLabel(accountStatus) {
    return String(accountStatus || 'active').trim().toLowerCase() === 'disabled' ? 'معطل' : 'نشط';
}

function getAccountStatusClass(accountStatus) {
    return String(accountStatus || 'active').trim().toLowerCase() === 'disabled'
        ? 'account-status-badge disabled'
        : 'account-status-badge active';
}

function renderUsersTable(users) {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (!users.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: #aaa;">لا توجد مستخدمين حاليًا لعرضهم.</td>
            </tr>
        `;
        return;
    }

    const sortedUsers = [...users].sort((a, b) => {
        const roleA = normalizeRole(a.role);
        const roleB = normalizeRole(b.role);
        const orderA = ROLE_METADATA[roleA]?.order || 99;
        const orderB = ROLE_METADATA[roleB]?.order || 99;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        const nameA = String(a.full_name || a.username || '').trim();
        const nameB = String(b.full_name || b.username || '').trim();
        return nameA.localeCompare(nameB, 'ar');
    });

    const groupedUsers = sortedUsers.reduce((groups, user) => {
        const roleKey = normalizeRole(user.role) || 'default';
        if (!groups[roleKey]) {
            groups[roleKey] = [];
        }
        groups[roleKey].push(user);
        return groups;
    }, {});

    Object.entries(groupedUsers).forEach(([roleKey, groupUsers]) => {
        if (typeof collapsedRoleGroups[roleKey] === 'undefined') {
            collapsedRoleGroups[roleKey] = true;
        }

        const isCollapsed = Boolean(collapsedRoleGroups[roleKey]);
        const groupRow = document.createElement('tr');
        groupRow.className = 'role-group-row';
        groupRow.innerHTML = `
            <td colspan="5">
                <button type="button" class="toggle-role-group" data-role="${roleKey}" aria-expanded="${!isCollapsed}">
                    <span>${getRoleLabel(roleKey, 'pluralLabel') || `صلاحية: ${getRoleLabel(groupUsers[0].role)}`}</span>
                    <span class="role-group-meta">
                        <span class="role-group-arrow ${isCollapsed ? '' : 'expanded'}">&#9662;</span>
                    </span>
                </button>
            </td>
        `;
        tableBody.appendChild(groupRow);

        groupUsers.forEach((user) => {
            const row = document.createElement('tr');
            if (isCollapsed) {
                row.classList.add('collapsed-user-row');
            }

            const roleClass = `role-${roleKey || 'default'}`;
            row.innerHTML = `
                <td>${user.user_id}</td>
                <td>${user.full_name || user.username || 'غير محدد'}</td>
                <td>${user.email || 'لا يوجد'}</td>
                <td><span class="role-badge ${roleClass}">${getRoleLabel(user.role)}</span></td>
                <td>
                    <button class="btn btn-danger delete-user">حذف</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    });
}

let purchaseRequests = [];
let dockReleaseRequests = [];
let pendingPurchaseRequestsCount = 0;
let pendingDockReleaseRequestsCount = 0;

function escapeAdminHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatAdminDate(value) {
    if (!value) {
        return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getDockReleaseStatusMarkup(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus === 'approved') {
        return '<span class="account-status-badge active">تمت الموافقة</span>';
    }

    if (normalizedStatus === 'rejected') {
        return '<span class="account-status-badge disabled">مرفوض</span>';
    }

    return '<span class="request-status-badge pending">بانتظار المراجعة</span>';
}

function getPurchaseRequestStatusMarkup(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus === 'approved') {
        return '<span class="account-status-badge active">تمت الموافقة</span>';
    }

    if (normalizedStatus === 'rejected') {
        return '<span class="account-status-badge disabled">مرفوض</span>';
    }

    return '<span class="request-status-badge pending">بانتظار المراجعة</span>';
}

function formatPurchaseOrderNumber(request) {
    const createdAt = new Date(request.created_at || Date.now());
    if (Number.isNaN(createdAt.getTime())) {
        return `PO-${request.request_id}`;
    }

    const yyyy = createdAt.getFullYear();
    const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
    const dd = String(createdAt.getDate()).padStart(2, '0');
    return `PO-${yyyy}${mm}${dd}-${request.request_id}`;
}

function normalizePurchaseRequestStatus(status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (normalizedStatus === 'pending') {
        return 'new';
    }

    return normalizedStatus;
}

function buildPurchaseRequestStatusMarkup(status) {
    const normalizedStatus = normalizePurchaseRequestStatus(status);
    if (normalizedStatus === 'new') {
        if (isPrinted) {
            actionMarkup = `
                <div class="requests-actions">
                    <button class="btn btn-secondary purchase-request-print" data-request-id="${request.request_id}">إعادة الطباعة</button>
                    <button class="btn btn-success purchase-request-progress" data-request-id="${request.request_id}" data-status="purchased">تم الشراء</button>
                </div>
            `;
        }

        if (isPurchased) {
            actionMarkup = `
                <div class="requests-actions">
                    <button class="btn btn-secondary purchase-request-print" data-request-id="${request.request_id}">إعادة الطباعة</button>
                    <button class="btn btn-success purchase-request-progress" data-request-id="${request.request_id}" data-status="received">تم الاستلام</button>
                </div>
            `;
        }

        if (!isPending && !isApproved && !isPrinted && !isPurchased && canReprint) {
            actionMarkup = `
                <div class="requests-actions">
                    <button class="btn btn-secondary purchase-request-print" data-request-id="${request.request_id}">إعادة الطباعة</button>
                </div>
            `;
        }

        return `
            <div class="decision-summary">
                <span class="request-status-badge pending">جديد</span>
                <small>بانتظار مراجعة الأدمن</small>
            </div>
        `;
    }

    if (normalizedStatus === 'approved') {
        return '<span class="account-status-badge active">مقبول</span>';
    }

    if (normalizedStatus === 'rejected') {
        return '<span class="account-status-badge disabled">مرفوض</span>';
    }

    if (normalizedStatus === 'printed') {
        return '<span class="account-status-badge active">تمت الطباعة</span>';
    }

    if (normalizedStatus === 'purchased') {
        return '<span class="account-status-badge active">تم الشراء</span>';
    }

    if (normalizedStatus === 'received') {
        return '<span class="account-status-badge active">تم الاستلام</span>';
    }

    return '<span class="request-status-badge pending">بانتظار المراجعة</span>';
}

function buildPurchaseRequestStatusMarkupSafe(status) {
    const normalizedStatus = normalizePurchaseRequestStatus(status);

    if (normalizedStatus === 'new') {
        return `
            <div class="decision-summary">
                <span class="request-status-badge pending">جديد</span>
                <small>بانتظار مراجعة الأدمن</small>
            </div>
        `;
    }

    if (normalizedStatus === 'approved') {
        return '<span class="account-status-badge active">مقبول</span>';
    }

    if (normalizedStatus === 'rejected') {
        return '<span class="account-status-badge disabled">مرفوض</span>';
    }

    if (normalizedStatus === 'printed') {
        return '<span class="account-status-badge active">تمت الطباعة</span>';
    }

    if (normalizedStatus === 'purchased') {
        return '<span class="account-status-badge active">تم الشراء</span>';
    }

    if (normalizedStatus === 'received') {
        return '<span class="account-status-badge active">تم الاستلام</span>';
    }

    return '<span class="request-status-badge pending">بانتظار المراجعة</span>';
}

function renderPurchaseRequestsTable(requests) {
    const tbody = document.getElementById('purchase-requests-body');
    if (!tbody) {
        return;
    }

    if (!requests.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center;">لا توجد طلبات شراء حالياً.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = requests.map((request) => {
        const normalizedStatus = normalizePurchaseRequestStatus(request.status);
        const isPending = normalizedStatus === 'new';
        const isApproved = normalizedStatus === 'approved';
        const isPrinted = normalizedStatus === 'printed';
        const isPurchased = normalizedStatus === 'purchased';
        const canReprint = ['approved', 'printed', 'purchased', 'received'].includes(normalizedStatus);
        const reviewSummary = request.reviewed_by
            ? `
                <div class="decision-summary">
                    <div>${escapeAdminHtml(request.reviewed_by)}</div>
                    <small>${escapeAdminHtml(request.review_note || formatAdminDate(request.reviewed_at))}</small>
                </div>
            `
            : '<span class="panel-note">لم تتم المراجعة بعد</span>';

        let actionMarkup = isPending
            ? `
                <div class="requests-actions">
                    <button class="btn btn-success purchase-request-decision" data-request-id="${request.request_id}" data-decision="approve">موافق</button>
                    <button class="btn btn-danger purchase-request-decision" data-request-id="${request.request_id}" data-decision="reject">رفض</button>
                </div>
            `
            : isApproved
                ? `
                    <div class="requests-actions">
                        <button class="btn btn-secondary purchase-request-print" data-request-id="${request.request_id}">طباعة الطلب</button>
                    </div>
                `
                : '<span class="panel-note">تم إغلاق الطلب</span>';

        return `
            <tr>
                <td>${buildPurchaseRequestStatusMarkupSafe(request.status)}</td>
                <td>${escapeAdminHtml(request.item_name || '-')}</td>
                <td>${escapeAdminHtml(String(request.quantity || '-'))}</td>
                <td>${escapeAdminHtml(request.supplier_name || '-')}</td>
                <td>${escapeAdminHtml(request.requested_by || '-')}</td>
                <td>${escapeAdminHtml(formatAdminDate(request.created_at))}</td>
                <td>${reviewSummary}</td>
                <td>${actionMarkup}</td>
            </tr>
        `;
    }).join('');
}

function renderPurchaseRequestsTableEnhanced(requests) {
    const tbody = document.getElementById('purchase-requests-body');
    if (!tbody) {
        return;
    }

    if (!requests.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center;">لا توجد طلبات شراء حالياً.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = requests.map((request) => {
        const normalizedStatus = normalizePurchaseRequestStatus(request.status);
        const reviewSummary = request.reviewed_by
            ? `
                <div class="decision-summary">
                    <div>${escapeAdminHtml(request.reviewed_by)}</div>
                    <small>${escapeAdminHtml(request.review_note || formatAdminDate(request.reviewed_at))}</small>
                </div>
            `
            : '<span class="panel-note">لم تتم المراجعة بعد</span>';

        let actionMarkup = '<span class="panel-note">تم إغلاق الطلب</span>';

        if (normalizedStatus === 'new') {
            actionMarkup = `
                <div class="requests-actions">
                    <button class="btn btn-success purchase-request-decision" data-request-id="${request.request_id}" data-decision="approve">موافق</button>
                    <button class="btn btn-danger purchase-request-decision" data-request-id="${request.request_id}" data-decision="reject">رفض</button>
                </div>
            `;
        } else if (normalizedStatus === 'approved') {
            actionMarkup = `
                <div class="requests-actions">
                    <button class="btn btn-secondary purchase-request-print" data-request-id="${request.request_id}">طباعة الطلب</button>
                </div>
            `;
        } else if (normalizedStatus === 'printed') {
            actionMarkup = `
                <div class="requests-actions">
                    <button class="btn btn-secondary purchase-request-print" data-request-id="${request.request_id}">إعادة الطباعة</button>
                    <button class="btn btn-success purchase-request-progress" data-request-id="${request.request_id}" data-status="purchased">تم الشراء</button>
                </div>
            `;
        } else if (normalizedStatus === 'purchased') {
            actionMarkup = `
                <div class="requests-actions">
                    <button class="btn btn-secondary purchase-request-print" data-request-id="${request.request_id}">إعادة الطباعة</button>
                    <button class="btn btn-success purchase-request-progress" data-request-id="${request.request_id}" data-status="received">تم الاستلام</button>
                </div>
            `;
        } else if (normalizedStatus === 'received') {
            actionMarkup = `
                <div class="requests-actions">
                    <button class="btn btn-secondary purchase-request-print" data-request-id="${request.request_id}">إعادة الطباعة</button>
                </div>
            `;
        }

        return `
            <tr>
                <td>${buildPurchaseRequestStatusMarkupSafe(request.status)}</td>
                <td>${escapeAdminHtml(request.item_name || '-')}</td>
                <td>${escapeAdminHtml(String(request.quantity || '-'))}</td>
                <td>${escapeAdminHtml(request.supplier_name || '-')}</td>
                <td>${escapeAdminHtml(request.requested_by || '-')}</td>
                <td>${escapeAdminHtml(formatAdminDate(request.created_at))}</td>
                <td>${reviewSummary}</td>
                <td>${actionMarkup}</td>
            </tr>
        `;
    }).join('');
}

async function loadPurchaseRequests(silent = false) {
    try {
        const response = await fetch('/api/purchase-requests', {
            credentials: 'include',
            cache: 'no-store'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحميل طلبات الشراء.');
        }

        purchaseRequests = Array.isArray(data.requests) ? data.requests : [];
        pendingPurchaseRequestsCount = purchaseRequests.filter((request) => normalizePurchaseRequestStatus(request.status) === 'new').length;
        updateRequestsBadge();
        renderPurchaseRequestsTableEnhanced(purchaseRequests);
        hideAlert('purchase-requests-alert');
    } catch (error) {
        if (!silent) {
            showAlert(error.message || 'تعذر تحميل طلبات الشراء.', 'error', 'purchase-requests-alert');
        }

        const tbody = document.getElementById('purchase-requests-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center;">${escapeAdminHtml(error.message || 'تعذر تحميل طلبات الشراء.')}</td>
                </tr>
            `;
        }
    }
}

async function updatePurchaseRequestProgress(requestId, status) {
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (!requestId || !['printed', 'purchased', 'received'].includes(normalizedStatus)) {
        return false;
    }

    try {
        const response = await fetch(`/api/purchase-requests/${requestId}/status`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: normalizedStatus })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحديث حالة طلب الشراء.');
        }

        await loadPurchaseRequests(true);
        return true;
    } catch (error) {
        showAlert(error.message || 'تعذر تحديث حالة طلب الشراء.', 'error', 'purchase-requests-alert');
        return false;
    }
}

async function handlePurchaseRequestDecision(requestId, decision) {
    const normalizedDecision = String(decision || '').trim().toLowerCase();
    if (!requestId || !['approve', 'reject'].includes(normalizedDecision)) {
        return;
    }

    const confirmationMessage = normalizedDecision === 'approve'
        ? 'هل تريد الموافقة على طلب الشراء؟'
        : 'هل تريد رفض طلب الشراء؟';

    if (!window.confirm(confirmationMessage)) {
        return;
    }

    const note = normalizedDecision === 'reject'
        ? String(window.prompt('اكتب سبب الرفض إذا رغبت بذلك:', '') || '').trim()
        : '';

    try {
        const response = await fetch(`/api/purchase-requests/${requestId}/decision`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                decision: normalizedDecision,
                note,
                user: currentAdminEmail || 'admin'
            })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تنفيذ القرار على طلب الشراء.');
        }

        showAlert(data.message, 'success', 'purchase-requests-alert');
        await loadPurchaseRequests(true);
    } catch (error) {
        showAlert(error.message || 'تعذر تنفيذ القرار على طلب الشراء.', 'error', 'purchase-requests-alert');
    }
}

async function printPurchaseRequest(requestId) {
    const request = purchaseRequests.find((entry) => Number(entry.request_id) === Number(requestId));
    const requestStatus = normalizePurchaseRequestStatus(request?.status);
    if (!request || !['approved', 'printed', 'purchased', 'received'].includes(requestStatus)) {
        showAlert('لا يمكن طباعة الطلب قبل الموافقة عليه.', 'error', 'purchase-requests-alert');
        return;
    }

    if (requestStatus === 'approved') {
        const updated = await updatePurchaseRequestProgress(requestId, 'printed');
        if (!updated) {
            return;
        }
    }

    const printWindow = window.open('', '_blank', 'width=980,height=720');
    if (!printWindow) {
        showAlert('تعذر فتح نافذة الطباعة. تحقق من السماح بالنوافذ المنبثقة.', 'error', 'purchase-requests-alert');
        return;
    }

    const orderNumber = formatPurchaseOrderNumber(request);
    const reviewedAt = formatAdminDate(request.reviewed_at);
    const createdAt = formatAdminDate(request.created_at);

    printWindow.document.write(`
        <html lang="ar" dir="rtl">
        <head>
            <meta charset="utf-8">
            <title>أمر شراء ${escapeAdminHtml(orderNumber)}</title>
            <style>
                body { font-family: Tahoma, Arial, sans-serif; padding: 32px; color: #0f172a; }
                h1, h2, p { margin: 0; }
                .header { margin-bottom: 24px; }
                .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px; }
                .meta-box, .table-wrap { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: right; }
                th { background: #e2e8f0; }
                .footer { margin-top: 28px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
                .signature { border-top: 1px solid #94a3b8; padding-top: 10px; min-height: 56px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>أمر شراء</h1>
                <p>رقم الطلب: ${escapeAdminHtml(orderNumber)}</p>
            </div>

            <div class="meta">
                <div class="meta-box"><strong>تاريخ الإنشاء:</strong> ${escapeAdminHtml(createdAt)}</div>
                <div class="meta-box"><strong>تاريخ الموافقة:</strong> ${escapeAdminHtml(reviewedAt)}</div>
                <div class="meta-box"><strong>مقدم الطلب:</strong> ${escapeAdminHtml(request.requested_by || '-')}</div>
                <div class="meta-box"><strong>الموافق:</strong> ${escapeAdminHtml(request.reviewed_by || '-')}</div>
                <div class="meta-box"><strong>المورد المقترح:</strong> ${escapeAdminHtml(request.supplier_name || '-')}</div>
                <div class="meta-box"><strong>الحالة:</strong> تمت الموافقة</div>
            </div>

            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>اسم القطعة</th>
                            <th>الكمية</th>
                            <th>المورد</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${escapeAdminHtml(request.item_name || '-')}</td>
                            <td>${escapeAdminHtml(String(request.quantity || '-'))}</td>
                            <td>${escapeAdminHtml(request.supplier_name || '-')}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="footer">
                <div class="signature">توقيع الأدمن</div>
                <div class="signature">ختم الجهة</div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
}

function updateRequestsBadge() {
    const badge = document.getElementById('dock-release-requests-badge');
    if (!badge) {
        return;
    }

    const pendingCount = Math.max(
        (Number(pendingPurchaseRequestsCount) || 0) + (Number(pendingDockReleaseRequestsCount) || 0),
        0
    );
    badge.textContent = String(pendingCount);
    badge.classList.toggle('hidden', pendingCount === 0);
}

function renderDockReleaseRequestsTable(requests) {
    const tbody = document.getElementById('dock-release-requests-body');
    if (!tbody) {
        return;
    }

    if (!requests.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" style="text-align: center;">لا توجد طلبات تسليم حالياً.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = requests.map((request) => {
        const isPending = String(request.status || '').trim().toLowerCase() === 'pending';
        const note = String(request.decision_note || '').trim();
        const actionMarkup = isPending
            ? `
                <div class="requests-actions">
                    <button class="btn btn-success dock-release-decision" data-request-id="${request.request_id}" data-decision="approve">موافق</button>
                    <button class="btn btn-danger dock-release-decision" data-request-id="${request.request_id}" data-decision="reject">رفض</button>
                </div>
            `
            : `
                <div class="decision-summary">
                    <div>${escapeAdminHtml(request.reviewed_by_email || 'تمت المراجعة')}</div>
                    <small>${escapeAdminHtml(note || formatAdminDate(request.reviewed_at))}</small>
                </div>
            `;

        return `
            <tr>
                <td>${getDockReleaseStatusMarkup(request.status)}</td>
                <td>${escapeAdminHtml(request.slot_code || '-')}</td>
                <td>${escapeAdminHtml(request.customer_name || request.owner_name || '-')}</td>
                <td>${escapeAdminHtml(request.customs_broker_name || '-')}</td>
                <td>${escapeAdminHtml([request.vessel_name, request.voyage_reference].filter(Boolean).join(' / ') || '-')}</td>
                <td>${escapeAdminHtml(request.bill_of_lading_number || '-')}</td>
                <td>${escapeAdminHtml(request.customs_statement_number || '-')}</td>
                <td class="wrap-cell">${escapeAdminHtml(request.container_numbers || request.container_number || '-')}</td>
                <td>${escapeAdminHtml(String(request.container_count || '-'))}</td>
                <td>${escapeAdminHtml(formatAdminDate(request.arrival_date))}</td>
                <td>${escapeAdminHtml(formatAdminDate(request.clearance_delivery_date))}</td>
                <td>${escapeAdminHtml(request.created_by_email || '-')}</td>
                <td>${actionMarkup}</td>
            </tr>
        `;
    }).join('');
}

async function loadDockReleaseRequests(silent = false) {
    try {
        const response = await fetch('/api/admin/dock-release-requests', {
            credentials: 'include',
            cache: 'no-store'
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحميل طلبات تسليم الحاويات.');
        }

        dockReleaseRequests = Array.isArray(data.requests) ? data.requests : [];
        pendingDockReleaseRequestsCount = Math.max(Number(data.pendingCount) || 0, 0);
        updateRequestsBadge();
        renderDockReleaseRequestsTable(dockReleaseRequests);
        hideAlert('dock-release-requests-alert');
    } catch (error) {
        if (!silent) {
            showAlert(error.message || 'تعذر تحميل طلبات تسليم الحاويات.', 'error', 'dock-release-requests-alert');
        }

        const tbody = document.getElementById('dock-release-requests-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" style="text-align: center;">${escapeAdminHtml(error.message || 'تعذر تحميل الطلبات.')}</td>
                </tr>
            `;
        }
    }
}

async function handleDockReleaseDecision(requestId, decision) {
    const normalizedDecision = String(decision || '').trim().toLowerCase();
    if (!requestId || !['approve', 'reject'].includes(normalizedDecision)) {
        return;
    }

    const confirmationMessage = normalizedDecision === 'approve'
        ? 'هل تريد الموافقة على طلب تسليم الحاوية وتحرير موقعها؟'
        : 'هل تريد رفض طلب تسليم الحاوية؟';

    if (!window.confirm(confirmationMessage)) {
        return;
    }

    const note = normalizedDecision === 'reject'
        ? String(window.prompt('اكتب سبب الرفض إذا رغبت بذلك:', '') || '').trim()
        : '';

    try {
        const response = await fetch(`/api/admin/dock-release-requests/${requestId}/${normalizedDecision}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ note })
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تنفيذ القرار على الطلب.');
        }

        showAlert(data.message, 'success', 'dock-release-requests-alert');
        await loadDockReleaseRequests(true);
    } catch (error) {
        showAlert(error.message || 'تعذر تنفيذ القرار على الطلب.', 'error', 'dock-release-requests-alert');
    }
}

const originalShowTabContent = showTabContent;
showTabContent = function(targetId) {
    originalShowTabContent(targetId);

    if (targetId === 'dock-release-requests') {
        loadPurchaseRequests();
        loadDockReleaseRequests();
    }
};

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('refresh-purchase-requests-btn')?.addEventListener('click', () => {
        loadPurchaseRequests();
    });

    document.getElementById('refresh-dock-release-requests-btn')?.addEventListener('click', () => {
        loadDockReleaseRequests();
    });

    document.getElementById('purchase-requests-body')?.addEventListener('click', (event) => {
        const decisionButton = event.target.closest('.purchase-request-decision');
        if (decisionButton) {
            handlePurchaseRequestDecision(
                Number(decisionButton.getAttribute('data-request-id')),
                decisionButton.getAttribute('data-decision')
            );
            return;
        }

        const progressButton = event.target.closest('.purchase-request-progress');
        if (progressButton) {
            updatePurchaseRequestProgress(
                Number(progressButton.getAttribute('data-request-id')),
                progressButton.getAttribute('data-status')
            );
            return;
        }

        const printButton = event.target.closest('.purchase-request-print');
        if (printButton) {
            printPurchaseRequest(Number(printButton.getAttribute('data-request-id')));
        }
    });

    document.getElementById('dock-release-requests-body')?.addEventListener('click', (event) => {
        const actionButton = event.target.closest('.dock-release-decision');
        if (!actionButton) {
            return;
        }

        handleDockReleaseDecision(
            Number(actionButton.getAttribute('data-request-id')),
            actionButton.getAttribute('data-decision')
        );
    });

    window.addEventListener('storage', (event) => {
        if (event.key === 'dockmanager-refresh' && event.newValue) {
            loadDockReleaseRequests(true);
        }
    });

    loadPurchaseRequests(true);
    loadDockReleaseRequests(true);
    window.setInterval(() => {
        loadPurchaseRequests(true);
        loadDockReleaseRequests(true);
    }, 15000);
});

function fetchUsers() {
    fetch('/api/users', {
        credentials: 'include',
        cache: 'no-store'
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.success) {
                usersData = data.users || [];
                renderUsersTable(usersData);
            } else {
                showAlert(data.message || 'فشل في جلب البيانات', 'error', 'users-table-body-alert');
            }
        })
        .catch(() => {
            showAlert('خطأ في الاتصال بالواجهة الخلفية لجلب المستخدمين.', 'error', 'users-table-body-alert');
        });
}

async function submitAddUser(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const user = Object.fromEntries(formData.entries());

    document.getElementById('user-alert').classList.add('hidden');

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(user)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showAlert('تم إضافة المستخدم بنجاح!', 'success', 'users-table-body-alert');
            closeModal('addUserModal');
            form.reset();
            fetchUsers();
        } else {
            showAlert(data.message || 'فشل في إضافة المستخدم.', 'error', 'user-alert');
        }
    } catch (error) {
        showAlert('خطأ في الاتصال بالسيرفر لإضافة المستخدم.', 'error', 'user-alert');
    }
}

async function deleteUser(email) {
    if (!confirm(`هل أنت متأكد من حذف المستخدم: ${email} ؟`)) {
        return;
    }

    try {
        const response = await fetch('/api/users/delete-by-email', {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showAlert(data.message, 'success', 'users-table-body-alert');
            fetchUsers();
        } else {
            showAlert(data.message || 'فشل في حذف المستخدم.', 'error', 'users-table-body-alert');
        }
    } catch (error) {
        showAlert('خطأ في الاتصال بالسيرفر لإجراء عملية الحذف.', 'error', 'users-table-body-alert');
    }
}

async function fetchDashboardResource(url, fallbackKey) {
    const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`Request failed for ${url}`);
    }

    const data = await response.json();

    if (Array.isArray(data)) {
        return data;
    }

    if (fallbackKey && Array.isArray(data[fallbackKey])) {
        return data[fallbackKey];
    }

    return [];
}

function countBy(items, selector) {
    return items.reduce((accumulator, item) => {
        const key = selector(item);
        accumulator[key] = (accumulator[key] || 0) + 1;
        return accumulator;
    }, {});
}

function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function createOrUpdateChart(key, canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') {
        return;
    }

    if (dashboardCharts[key]) {
        dashboardCharts[key].destroy();
    }

    dashboardCharts[key] = new Chart(canvas, config);
}

function getMachineStatusLabel(status) {
    const normalized = String(status || '').trim();
    return normalized || 'غير محددة';
}

function renderInsights(summary) {
    const insightsElement = document.getElementById('dashboard-insights');
    if (!insightsElement) return;

    const insights = [];

    if (summary.lowStockCount > 0) {
        insights.push(`يوجد ${summary.lowStockCount} مادة تحت الحد الأدنى في المخزون.`);
    }

    if (summary.maintenanceCount > 0) {
        insights.push(`هناك ${summary.maintenanceCount} آلية تحت الصيانة حاليًا.`);
    }

    if (summary.stoppedMachinesCount > 0) {
        insights.push(`يوجد ${summary.stoppedMachinesCount} آلية متوقفة وتحتاج متابعة.`);
    }

    if (summary.freeLocationsCount > 0) {
        insights.push(`عدد المواقع الحرة المتاحة حاليًا هو ${summary.freeLocationsCount}.`);
    }

    if (summary.driversCount > 0) {
        insights.push(`عدد السائقين المسجلين في النظام هو ${summary.driversCount}.`);
    }

    if (!insights.length) {
        insights.push('لا توجد تنبيهات حرجة حاليًا. البيانات ضمن الحدود الطبيعية.');
    }

    insightsElement.innerHTML = insights.map((item) => `<li>${item}</li>`).join('');
}

function getDashboardResourceValue(result, label, failures) {
    if (result.status === 'fulfilled') {
        return result.value;
    }

    failures.push(label);
    return [];
}

async function loadDashboard() {
    hideAlert('dashboard-alert');

    const dashboardAlert = document.getElementById('dashboard-alert');
    const insightsElement = document.getElementById('dashboard-insights');
    if (insightsElement) {
        insightsElement.innerHTML = '<li>جاري تحميل المؤشرات...</li>';
    }

    try {
        const resourceDefinitions = [
            { label: 'الآليات', request: fetchDashboardResource('/api/machines') },
            { label: 'المستخدمون', request: fetchDashboardResource('/api/users', 'users') },
            { label: 'المستودعات', request: fetchDashboardResource('/api/warehouses', 'warehouses') },
            { label: 'المواقع', request: fetchDashboardResource('/api/locations', 'locations') },
            { label: 'الموردون', request: fetchDashboardResource('/api/suppliers', 'suppliers') },
            { label: 'المخزون', request: fetchDashboardResource('/api/inventory/items', 'items') }
        ];

        const settledResources = await Promise.allSettled(
            resourceDefinitions.map((resource) => resource.request)
        );

        const failedSections = [];
        const [machines, users, warehouses, locations, suppliers, inventoryItems] = settledResources.map((result, index) =>
            getDashboardResourceValue(result, resourceDefinitions[index].label, failedSections)
        );

        if (failedSections.length && dashboardAlert) {
            const allSectionsFailed = failedSections.length === resourceDefinitions.length;
            dashboardAlert.textContent = allSectionsFailed
                ? 'تعذر تحميل بيانات الرئيسية حاليًا. تحقق من اتصال قاعدة البيانات ثم أعد المحاولة.'
                : `تعذر تحميل بعض الأقسام: ${failedSections.join('، ')}.`;
            dashboardAlert.className = 'alert alert-error';
            dashboardAlert.classList.remove('hidden');
        } else if (dashboardAlert) {
            dashboardAlert.classList.add('hidden');
        }

        const readyMachinesCount = machines.filter((machine) => {
            const status = getMachineStatusLabel(machine.status);
            return status === 'جاهزة' || status === 'في الخدمة';
        }).length;

        const maintenanceCount = machines.filter((machine) => getMachineStatusLabel(machine.status) === 'تحت الصيانة').length;
        const stoppedMachinesCount = machines.filter((machine) => getMachineStatusLabel(machine.status) === 'متوقفة').length;
        const readinessPercent = machines.length ? Math.round((readyMachinesCount / machines.length) * 100) : 0;

        const normalizedUsers = users.map((user) => ({
            ...user,
            normalizedRole: normalizeRole(user.role)
        }));

        const driversCount = normalizedUsers.filter((user) => user.normalizedRole === 'driver').length;
        const lowStockCount = inventoryItems.filter((item) => numberValue(item.current_qty) <= numberValue(item.min_stock)).length;
        const freeLocationsCount = locations.filter((location) => String(location.status || '').trim() === 'حر').length;

        setText('kpi-machines-total', machines.length);
        setText('kpi-machines-ready-note', `جاهزية ${readinessPercent}%`);
        setText('kpi-users-total', users.length);
        setText('kpi-drivers-note', `السائقون ${driversCount}`);
        setText('kpi-warehouses-total', warehouses.length);
        setText('kpi-locations-note', `المواقع ${locations.length}`);
        setText('kpi-low-stock', lowStockCount);
        setText('kpi-suppliers-note', `الموردون ${suppliers.length}`);

        const machineStatusCounts = countBy(machines, (machine) => getMachineStatusLabel(machine.status));
        const userRoleCounts = countBy(normalizedUsers, (user) => getRoleLabel(user.normalizedRole));
        const locationStatusCounts = countBy(locations, (location) => String(location.status || 'غير محددة').trim() || 'غير محددة');

        createOrUpdateChart('machinesStatus', 'machinesStatusChart', {
            type: 'doughnut',
            data: {
                labels: Object.keys(machineStatusCounts),
                datasets: [{
                    data: Object.values(machineStatusCounts),
                    backgroundColor: ['#23d2b5', '#7cd1ff', '#f7bc62', '#ff7a7a', '#8b5cf6', '#94a3b8']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#dceef6' }
                    }
                }
            }
        });

        createOrUpdateChart('usersRoles', 'usersRolesChart', {
            type: 'bar',
            data: {
                labels: Object.keys(userRoleCounts),
                datasets: [{
                    label: 'عدد المستخدمين',
                    data: Object.values(userRoleCounts),
                    backgroundColor: '#23d2b5',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        ticks: { color: '#dceef6' },
                        grid: { color: 'rgba(220, 238, 246, 0.08)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#dceef6', precision: 0 },
                        grid: { color: 'rgba(220, 238, 246, 0.08)' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        createOrUpdateChart('locationsStatus', 'locationsStatusChart', {
            type: 'pie',
            data: {
                labels: Object.keys(locationStatusCounts),
                datasets: [{
                    data: Object.values(locationStatusCounts),
                    backgroundColor: ['#35d6a9', '#f7bc62', '#ff7a7a', '#7cd1ff', '#94a3b8']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#dceef6' }
                    }
                }
            }
        });

        setText('machines-status-summary', `الجاهزة أو العاملة: ${readyMachinesCount} من ${machines.length}`);
        setText('users-role-summary', `إجمالي المستخدمين: ${users.length}`);
        setText('locations-status-summary', `المواقع الحرة: ${freeLocationsCount} من ${locations.length}`);

        renderInsights({
            lowStockCount,
            maintenanceCount,
            stoppedMachinesCount,
            freeLocationsCount,
            driversCount
        });
    } catch (error) {
        if (dashboardAlert) {
            dashboardAlert.textContent = 'تعذر تحميل بيانات الرئيسية حاليًا. يرجى المحاولة مرة أخرى.';
            dashboardAlert.className = 'alert alert-error';
            dashboardAlert.classList.remove('hidden');
        }

        if (insightsElement) {
            insightsElement.innerHTML = '<li>تعذر تحميل التنبيهات حاليًا.</li>';
        }
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    const hasValidSession = await verifyAdminSession();
    if (!hasValidSession) {
        return;
    }

    window.addEventListener('pageshow', function(event) {
        verifyAdminSession();
        if (event.persisted) {
            window.location.reload();
        }
    });

    window.addEventListener('popstate', function() {
        verifyAdminSession();
    });

    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            verifyAdminSession();
        }
    });

    showTabContent('dashboard');

    document.querySelector('.sidebar').addEventListener('click', function(e) {
        if (!e.target.classList.contains('tab-btn')) {
            return;
        }

        const targetId = e.target.getAttribute('data-target');
        const url = e.target.getAttribute('data-url');

        if (url) {
            loadIframe(targetId, url);
        } else {
            showTabContent(targetId);
        }
    });

    document.getElementById('open-add-user-modal')?.addEventListener('click', () => {
        document.getElementById('add-user-form').reset();
        hideAlert('user-alert');
        openModal('addUserModal');
    });

    const closeAddUserModalButton = document.getElementById('close-add-user-modal');
    closeAddUserModalButton?.addEventListener('click', () => closeModal('addUserModal'));
    closeAddUserModalButton?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            closeModal('addUserModal');
        }
    });

    document.getElementById('add-user-form')?.addEventListener('submit', submitAddUser);

    document.getElementById('refresh-dashboard-btn')?.addEventListener('click', () => {
        loadDashboard();
    });

    document.getElementById('logout-admin-btn')?.addEventListener('click', () => {
        fetch('/api/logout', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Cache-Control': 'no-cache'
            }
        })
            .catch(() => null)
            .finally(() => {
                window.location.replace('/login.html');
            });
    });

    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('delete-user')) {
            const row = e.target.closest('tr');
            const emailCell = row?.cells?.[2];
            const email = emailCell ? emailCell.textContent.trim() : null;

            if (email) {
                deleteUser(email);
            } else {
                showAlert('فشل في العثور على البريد الإلكتروني للمستخدم.', 'error', 'users-table-body-alert');
            }
            return;
        }

        const toggleButton = e.target.closest('.toggle-role-group');
        if (toggleButton) {
            const roleKey = toggleButton.getAttribute('data-role');
            collapsedRoleGroups[roleKey] = !collapsedRoleGroups[roleKey];
            renderUsersTable(usersData);
        }
    });
});

function renderUsersTable(users) {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (!users.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #aaa;">لا توجد مستخدمين حالياً لعرضهم.</td>
            </tr>
        `;
        return;
    }

    const sortedUsers = [...users].sort((a, b) => {
        const roleA = normalizeRole(a.role);
        const roleB = normalizeRole(b.role);
        const orderA = ROLE_METADATA[roleA]?.order || 99;
        const orderB = ROLE_METADATA[roleB]?.order || 99;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        const nameA = String(a.full_name || a.username || '').trim();
        const nameB = String(b.full_name || b.username || '').trim();
        return nameA.localeCompare(nameB, 'ar');
    });

    const groupedUsers = sortedUsers.reduce((groups, user) => {
        const roleKey = normalizeRole(user.role) || 'default';
        if (!groups[roleKey]) {
            groups[roleKey] = [];
        }
        groups[roleKey].push(user);
        return groups;
    }, {});

    Object.entries(groupedUsers).forEach(([roleKey, groupUsers]) => {
        if (typeof collapsedRoleGroups[roleKey] === 'undefined') {
            collapsedRoleGroups[roleKey] = true;
        }

        const isCollapsed = Boolean(collapsedRoleGroups[roleKey]);
        const groupRow = document.createElement('tr');
        groupRow.className = 'role-group-row';
        groupRow.innerHTML = `
            <td colspan="6">
                <button type="button" class="toggle-role-group" data-role="${roleKey}" aria-expanded="${!isCollapsed}">
                    <span>${getRoleLabel(roleKey, 'pluralLabel') || `صلاحية: ${getRoleLabel(groupUsers[0].role)}`}</span>
                    <span class="role-group-meta">
                        <span class="role-group-arrow ${isCollapsed ? '' : 'expanded'}">&#9662;</span>
                    </span>
                </button>
            </td>
        `;
        tableBody.appendChild(groupRow);

        groupUsers.forEach((user) => {
            const row = document.createElement('tr');
            if (isCollapsed) {
                row.classList.add('collapsed-user-row');
            }

            const roleClass = `role-${roleKey || 'default'}`;
            const isCurrentAdmin = String(user.email || '').trim().toLowerCase() === currentAdminEmail;
            const isDisabled = String(user.account_status || 'active').trim().toLowerCase() === 'disabled';
            row.innerHTML = `
                <td>${user.user_id}</td>
                <td>${user.full_name || user.username || 'غير محدد'}</td>
                <td>${user.email || 'لا يوجد'}</td>
                <td><span class="role-badge ${roleClass}">${getRoleLabel(user.role)}</span></td>
                <td><span class="${getAccountStatusClass(user.account_status)}">${getAccountStatusLabel(user.account_status)}</span></td>
                <td>
                    <button
                        class="btn btn-warning toggle-account-status"
                        data-user-id="${user.user_id}"
                        data-next-status="${isDisabled ? 'active' : 'disabled'}"
                        ${isCurrentAdmin ? 'disabled title="لا يمكن تعطيل الأدمن الحالي"' : ''}
                    >${isDisabled ? 'تفعيل' : 'تعطيل'}</button>
                    <button class="btn btn-secondary print-user-report" data-user-id="${user.user_id}">طباعة تقرير</button>
                    <button class="btn btn-danger delete-user">حذف</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    });
}

async function toggleUserAccountStatus(userId, nextStatus) {
    const confirmationMessage = nextStatus === 'disabled'
        ? 'هل تريد تعطيل هذا المستخدم فعلًا؟ لن يتمكن من فتح صفحته أو المتابعة بالحساب حتى إعادة تفعيله.'
        : 'هل تريد إعادة تفعيل هذا المستخدم؟';

    if (!window.confirm(confirmationMessage)) {
        return;
    }

    try {
        const response = await fetch(`/api/users/${userId}/account-status`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ accountStatus: nextStatus })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || 'تعذر تحديث حالة المستخدم.');
        }

        showAlert(data.message, 'success', 'users-table-body-alert');
        fetchUsers();
    } catch (error) {
        showAlert(error.message || 'حدث خطأ أثناء تحديث حالة المستخدم.', 'error', 'users-table-body-alert');
    }
}

function openUserReport(userId) {
    window.open(`/api/admin/users/${userId}/report?autoprint=1`, '_blank', 'noopener');
}

document.addEventListener('click', function(event) {
    const toggleStatusButton = event.target.closest('.toggle-account-status');
    if (toggleStatusButton) {
        const userId = Number(toggleStatusButton.getAttribute('data-user-id'));
        const nextStatus = String(toggleStatusButton.getAttribute('data-next-status') || '').trim();
        if (userId && nextStatus) {
            toggleUserAccountStatus(userId, nextStatus);
        }
        return;
    }

    const printButton = event.target.closest('.print-user-report');
    if (printButton) {
        const userId = Number(printButton.getAttribute('data-user-id'));
        if (userId) {
            openUserReport(userId);
        }
    }
});

function renderUsersTable(users) {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (!users.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: #aaa;">لا توجد مستخدمين حاليًا لعرضهم.</td>
            </tr>
        `;
        return;
    }

    const sortedUsers = [...users].sort((a, b) => {
        const roleA = normalizeRole(a.role);
        const roleB = normalizeRole(b.role);
        const orderA = ROLE_METADATA[roleA]?.order || 99;
        const orderB = ROLE_METADATA[roleB]?.order || 99;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        const nameA = String(a.full_name || a.username || '').trim();
        const nameB = String(b.full_name || b.username || '').trim();
        return nameA.localeCompare(nameB, 'ar');
    });

    const groupedUsers = sortedUsers.reduce((groups, user) => {
        const roleKey = normalizeRole(user.role) || 'default';
        if (!groups[roleKey]) {
            groups[roleKey] = [];
        }
        groups[roleKey].push(user);
        return groups;
    }, {});

    Object.entries(groupedUsers).forEach(([roleKey, groupUsers]) => {
        if (typeof collapsedRoleGroups[roleKey] === 'undefined') {
            collapsedRoleGroups[roleKey] = true;
        }

        const isCollapsed = Boolean(collapsedRoleGroups[roleKey]);
        const groupRow = document.createElement('tr');
        groupRow.className = 'role-group-row';
        groupRow.innerHTML = `
            <td colspan="6">
                <button type="button" class="toggle-role-group" data-role="${roleKey}" aria-expanded="${!isCollapsed}">
                    <span>${getRoleLabel(roleKey, 'pluralLabel') || `صلاحية: ${getRoleLabel(groupUsers[0].role)}`}</span>
                    <span class="role-group-meta">
                        <span class="role-group-arrow ${isCollapsed ? '' : 'expanded'}">&#9662;</span>
                    </span>
                </button>
            </td>
        `;
        tableBody.appendChild(groupRow);

        groupUsers.forEach((user) => {
            const row = document.createElement('tr');
            if (isCollapsed) {
                row.classList.add('collapsed-user-row');
            }

            const roleClass = `role-${roleKey || 'default'}`;
            const isCurrentAdmin = String(user.email || '').trim().toLowerCase() === currentAdminEmail;
            const isDisabled = String(user.account_status || 'active').trim().toLowerCase() === 'disabled';
            const accountActionButton = isCurrentAdmin
                ? ''
                : `
                    <button
                        class="btn btn-warning toggle-account-status"
                        data-user-id="${user.user_id}"
                        data-next-status="${isDisabled ? 'active' : 'disabled'}"
                    >${isDisabled ? 'تفعيل' : 'تعطيل'}</button>
                `;

            row.innerHTML = `
                <td>${user.user_id}</td>
                <td>${user.full_name || user.username || 'غير محدد'}</td>
                <td>${user.email || 'لا يوجد'}</td>
                <td><span class="role-badge ${roleClass}">${getRoleLabel(user.role)}</span></td>
                <td><span class="${getAccountStatusClass(user.account_status)}">${getAccountStatusLabel(user.account_status)}</span></td>
                <td>
                    ${accountActionButton}
                    <button class="btn btn-secondary print-user-report" data-user-id="${user.user_id}">طباعة تقرير</button>
                    <button class="btn btn-danger delete-user">حذف</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    });
}
