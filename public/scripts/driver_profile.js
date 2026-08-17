const missionsBody = document.getElementById("missions-body");
const profileGrid = document.getElementById("profile-grid");
const metricGrid = document.getElementById("metric-grid");
const maintenanceRequestsBody = document.getElementById("maintenance-requests-body");
const inspectionSummary = document.getElementById("inspection-summary");
const inspectionCaption = document.getElementById("inspection-caption");
const vehicleAssignmentNotice = document.getElementById("vehicle-assignment-notice");
const inspectionSection = document.getElementById("inspection-section");
const maintenanceSection = document.getElementById("maintenance-section");
const maintenanceRequestModal = document.getElementById("maintenanceRequestModal");
const maintenanceRequestForm = document.getElementById("maintenanceRequestForm");
const maintenanceItemIdInput = document.getElementById("maintenanceItemId");
const maintenanceQuantityInput = document.getElementById("maintenanceQuantity");
const maintenanceRequestedDateInput = document.getElementById("maintenanceRequestedDate");
const maintenanceJustificationInput = document.getElementById("maintenanceJustification");
const inspectionModal = document.getElementById("inspectionModal");
const inspectionForm = document.getElementById("inspectionForm");
const inspectionChecklist = document.getElementById("inspectionChecklist");
const inspectionAlert = document.getElementById("inspectionAlert");
const inspectionModalTitle = document.getElementById("inspectionModalTitle");
const inspectionModalSubtitle = document.getElementById("inspectionModalSubtitle");
const inspectionChecklistHead = document.querySelector(".inspection-checklist-head");
const closeInspectionModalButton = document.getElementById("closeInspectionModal");
const inspectionHasIssueInput = document.getElementById("inspectionHasIssue");
const inspectionNeedsPeriodicServiceInput = document.getElementById("inspectionNeedsPeriodicService");
const inspectionNotesInput = document.getElementById("inspectionNotes");
const inspectionMileageInput = document.getElementById("inspectionMileage");
const inspectionMileageCard = document.getElementById("inspectionMileageCard");
const inspectionNeedsPeriodicServiceCard = document.getElementById("inspectionNeedsPeriodicServiceCard");
const saveInspectionButton = document.getElementById("saveInspectionBtn");

const DAILY_INSPECTION_ITEMS = [
  { key: "oil_checked", label: "تم فحص الزيت" },
  { key: "water_checked", label: "تم فحص الماء" },
  { key: "brakes_checked", label: "تم فحص الفرامل" },
  { key: "tires_checked", label: "تم فحص الإطارات" },
  { key: "fuel_checked", label: "تم فحص الوقود" },
  { key: "battery_checked", label: "تم فحص البطارية" },
  { key: "lights_checked", label: "تم فحص الأضواء" },
  { key: "leaks_checked", label: "لا يوجد تسريب ظاهر" },
];

const MONTHLY_INSPECTION_ITEMS = [
  { key: "engine_condition", label: "حالة المحرك" },
  { key: "transmission_condition", label: "حالة ناقل الحركة" },
  { key: "cooling_system_condition", label: "حالة نظام التبريد" },
  { key: "oil_filters_condition", label: "حالة الزيوت والفلاتر" },
  { key: "brakes_condition", label: "حالة الفرامل" },
  { key: "tires_wear_condition", label: "حالة الإطارات والتآكل" },
  { key: "battery_condition", label: "حالة البطارية" },
  { key: "electrical_system_condition", label: "حالة النظام الكهربائي" },
  { key: "hydraulic_system_condition", label: "حالة النظام الهيدروليكي" },
  { key: "safety_tools_condition", label: "حالة أدوات السلامة" },
  { key: "body_condition", label: "حالة الهيكل الخارجي" },
  { key: "lights_signals_condition", label: "حالة الإضاءة والإشارات" },
];

const MONTHLY_STATUS_OPTIONS = [
  { value: "ok", label: "سليم" },
  { value: "follow_up", label: "يحتاج متابعة" },
  { value: "needs_service", label: "يحتاج صيانة" },
  { value: "unfit", label: "غير صالح" },
];

const dashboardState = {
  profile: null,
  vehicle: null,
  tasks: [],
  maintenanceRequests: [],
  inspectionStatus: null,
  actionInProgress: false,
  inspectionModalState: {
    type: null,
    locked: false,
  },
};

function hasAssignedVehicle() {
  return Boolean(dashboardState.vehicle?.id);
}

function getEmailFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("email") || "").trim();
}

function getSessionIdFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("sid") || "").trim();
}

async function fetchWithSession(url, options = {}) {
  const sessionId = getSessionIdFromQuery();
  const headers = new Headers(options.headers || {});

  if (sessionId) {
    headers.set("X-Session-Id", sessionId);
  }

  return fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });
}

function escapeHTML(value) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ar-SA");
}

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function getMaintenanceStatusClass(status) {
  const normalizedStatus = String(status || "").trim();
  if (normalizedStatus === "مرفوض من مدير الآليات" || normalizedStatus === "مرفوض") {
    return "status-alert";
  }

  if (normalizedStatus === "تم الصرف") {
    return "status-ready";
  }

  return "status-waiting";
}

function notifyDockManagerUpdate(reason) {
  try {
    localStorage.setItem("dockmanager-refresh", JSON.stringify({ reason, timestamp: Date.now() }));
    localStorage.setItem("mechanic-refresh", JSON.stringify({ reason, timestamp: Date.now() }));
  } catch (error) {
    console.warn("Failed to notify dock manager tab:", error);
  }
}

function notifyMaintenanceRequestUpdate(reason) {
  try {
    localStorage.setItem("maintenance-request-refresh", JSON.stringify({ reason, timestamp: Date.now() }));
  } catch (error) {
    console.warn("Failed to notify maintenance request update:", error);
  }
}

function renderProfile(profile, vehicle, tasks) {
  document.getElementById("driver-avatar").textContent = profile.initials || "س";
  document.getElementById("driver-name").textContent = profile.name || "السائق";
  document.getElementById("driver-role").textContent = `${profile.role} • ${profile.email}`;
  document.getElementById("driver-note").textContent = profile.note || "لا توجد ملاحظات.";
  document.getElementById("current-shift-label").textContent = profile.shift || "غير محددة";
  document.getElementById("last-updated").textContent = new Date().toLocaleString("ar-EG");
  document.getElementById("active-missions-count").textContent = String(tasks.length);
  document.getElementById("vehicle-status-card").textContent = vehicle ? (vehicle.status || "غير محددة") : "غير مرتبطة";

  const statusBadge = document.getElementById("driver-status");
  statusBadge.textContent = profile.status || "غير محدد";
  statusBadge.className = `status-badge ${profile.statusClass || "status-waiting"}`;

  profileGrid.innerHTML = [
    { label: "البريد الإلكتروني", value: profile.email },
    { label: "رقم الهاتف", value: profile.phone },
    { label: "المناوبة", value: profile.shift },
    { label: "المركبة", value: vehicle ? `${vehicle.name} - ${vehicle.code}` : "لا توجد مركبة مرتبطة" },
    { label: "حالة المركبة", value: vehicle ? vehicle.status : "غير محدد" },
  ].map((item) => `
    <div class="info-card">
      <span>${escapeHTML(item.label)}</span>
      <strong>${escapeHTML(item.value || "غير محدد")}</strong>
    </div>
  `).join("");

  metricGrid.innerHTML = [
    { value: String(tasks.length), label: "إجمالي المهام" },
    { value: vehicle ? (vehicle.status || "غير محدد") : "غير مرتبطة", label: "حالة المركبة" },
    { value: profile.shift || "غير محددة", label: "المناوبة" },
  ].map((metric) => `
    <div class="metric-card">
      <strong>${escapeHTML(metric.value)}</strong>
      <span>${escapeHTML(metric.label)}</span>
    </div>
  `).join("");

  document.getElementById("table-caption").textContent = `المهام الحالية للسائق ${profile.name || profile.email}.`;
}

function renderTaskActions(task) {
  const isBlockedByInspection = Boolean(dashboardState.inspectionStatus?.dailyRequired);
  if (!Array.isArray(task.actions) || !task.actions.length) {
    return `<span class="task-actions-empty">--</span>`;
  }

  return `
    <div class="task-actions">
      ${task.actions.map((action) => `
        <button
          type="button"
          class="${escapeHTML(action.className)}"
          data-request-id="${escapeHTML(task.requestId)}"
          data-task-kind="${escapeHTML(task.taskKind || "dock")}"
          data-decision="${escapeHTML(action.decision)}"
          data-stage="${escapeHTML(action.stage || "respond")}"
          ${(dashboardState.actionInProgress || isBlockedByInspection) ? "disabled" : ""}
        >
          ${escapeHTML(action.label)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderTasks(tasks) {
  missionsBody.innerHTML = tasks.length ? tasks.map((task) => `
    <tr>
      <td class="mission-id">${escapeHTML(task.id)}</td>
      <td>${escapeHTML(task.cargo)}</td>
      <td>${escapeHTML(task.pickup)}</td>
      <td>${escapeHTML(task.destination)}</td>
      <td>${escapeHTML(task.time)}</td>
      <td><span class="priority ${escapeHTML(task.priorityClass)}">${escapeHTML(task.priority)}</span></td>
      <td><span class="table-status ${escapeHTML(task.statusClass)}">${escapeHTML(task.status)}</span></td>
      <td>${renderTaskActions(task)}</td>
    </tr>
  `).join("") : `<tr><td colspan="8" style="text-align:center;">لا توجد مهام لهذا السائق.</td></tr>`;
}

function renderMaintenanceRequests(requests) {
  if (!maintenanceRequestsBody) return;

  if (!hasAssignedVehicle()) {
    maintenanceRequestsBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">يجب ربط مركبة بهذا السائق أولًا لعرض الصيانة.</td></tr>`;
    return;
  }

  maintenanceRequestsBody.innerHTML = requests.length ? requests.map((request) => `
    <tr>
      <td>${escapeHTML(request.id)}</td>
      <td>${escapeHTML(`${request.itemName || "-"} (${request.itemCode || "-"})`)}</td>
      <td>${escapeHTML(request.qty)}</td>
      <td>${escapeHTML(request.justification || "-")}</td>
      <td>${escapeHTML(formatShortDate(request.requested_for_date || request.date))}</td>
      <td><span class="table-status ${escapeHTML(getMaintenanceStatusClass(request.status))}">${escapeHTML(request.status || "-")}</span></td>
    </tr>
  `).join("") : `<tr><td colspan="6" style="text-align:center;">لا توجد طلبات صيانة لهذا السائق.</td></tr>`;
}

function renderInspectionSummary() {
  const status = dashboardState.inspectionStatus;
  if (!inspectionSummary) return;
  if (!hasAssignedVehicle()) {
    inspectionCaption.textContent = "لا يتم عرض الفحص أو الصيانة قبل ربط مركبة بهذا السائق.";
    inspectionSummary.innerHTML = `<div class="info-card"><strong>يجب ربط مركبة أولًا لإظهار بيانات الفحص والصيانة.</strong></div>`;
    return;
  }

  if (!status) {
    inspectionCaption.textContent = "تعذر تحميل حالة الفحص الحالية.";
    inspectionSummary.innerHTML = `<div class="info-card"><strong>تعذر تحميل حالة الفحص الحالية.</strong></div>`;
    return;
  }

  const maintenanceContext = status.maintenanceRequestContext;
  const historyMarkup = Array.isArray(status.history) && status.history.length
    ? `
      <div class="inspection-history">
        ${status.history.slice(0, 4).map((item) => `
          <div class="inspection-history-item">
            <strong>${item.type === "monthly" ? "فحص شهري" : "فحص يومي"}</strong>
            <span>${escapeHTML(formatShortDate(item.date))}</span>
            <small>${item.mileage != null ? `ممشى ${escapeHTML(item.mileage)}` : (item.maintenanceActionRequired ? "به ملاحظة" : "مكتمل")}</small>
          </div>
        `).join("")}
      </div>
    `
    : "";

  inspectionCaption.textContent = status.dailyRequired
    ? "الفحص اليومي إلزامي قبل متابعة العمل."
    : status.monthlyRequired
      ? "الفحص الشهري مطلوب خلال الشهر الحالي."
      : "جميع الفحوصات المطلوبة مكتملة حاليًا.";

  inspectionSummary.innerHTML = `
    <div class="inspection-grid">
      <div class="info-card inspection-state-card ${status.dailyRequired ? "inspection-required" : "inspection-complete"}">
        <span>الفحص اليومي</span>
        <strong>${status.dailyRequired ? "مطلوب الآن" : "مكتمل اليوم"}</strong>
        <small>${status.dailyInspection ? `آخر حفظ: ${escapeHTML(formatShortDate(status.dailyInspection.date))}` : "لم يتم تسجيل فحص يومي اليوم."}</small>
      </div>

      <div class="info-card inspection-state-card ${status.monthlyRequired ? "inspection-required" : "inspection-complete"}">
        <span>الفحص الشهري</span>
        <strong>${status.monthlyRequired ? "مطلوب هذا الشهر" : "مكتمل هذا الشهر"}</strong>
        <small>${status.lastMonthlyMileage != null ? `آخر ممشى شهري: ${escapeHTML(status.lastMonthlyMileage)}` : "لا يوجد ممشى شهري سابق."}</small>
      </div>
    </div>

    <div class="inspection-actions-row">
      ${status.dailyRequired ? `<button type="button" class="btn-save" data-open-inspection="daily">ابدأ الفحص اليومي</button>` : ""}
      ${!status.dailyRequired && status.monthlyRequired ? `<button type="button" class="btn-edit" data-open-inspection="monthly">ابدأ الفحص الشهري</button>` : ""}
      ${maintenanceContext?.showButton ? `<button type="button" class="btn-save inspection-maintenance-btn" data-open-maintenance="inspection">إنشاء طلب صيانة</button>` : ""}
    </div>

    ${maintenanceContext?.showButton ? `
      <div class="inspection-note-box">
        <strong>${escapeHTML(maintenanceContext.title || "توجد ملاحظة تحتاج متابعة")}</strong>
        <p>${escapeHTML(maintenanceContext.prefilledJustification || "")}</p>
      </div>
    ` : ""}

    ${historyMarkup}
  `;
}

function renderUnassignedVehicleState() {
  if (!dashboardState.profile || hasAssignedVehicle()) {
    return;
  }

  profileGrid.innerHTML = [
    { label: "البريد الإلكتروني", value: dashboardState.profile.email },
    { label: "رقم الهاتف", value: dashboardState.profile.phone },
    { label: "المناوبة", value: dashboardState.profile.shift },
    { label: "ربط المركبة", value: "لم يتم ربط مركبة بهذا السائق حتى الآن." },
  ].map((item) => `
    <div class="info-card">
      <span>${escapeHTML(item.label)}</span>
      <strong>${escapeHTML(item.value || "غير محدد")}</strong>
    </div>
  `).join("");

  metricGrid.innerHTML = [
    { value: String(dashboardState.tasks.length), label: "إجمالي المهام" },
    { value: dashboardState.profile.shift || "غير محددة", label: "المناوبة" },
  ].map((metric) => `
    <div class="metric-card">
      <strong>${escapeHTML(metric.value)}</strong>
      <span>${escapeHTML(metric.label)}</span>
    </div>
  `).join("");

  document.getElementById("vehicle-status-card").textContent = "لا توجد مركبة مرتبطة";
}

function updateVehicleLinkedSectionsVisibility() {
  const isVehicleAssigned = hasAssignedVehicle();

  if (vehicleAssignmentNotice) {
    vehicleAssignmentNotice.hidden = isVehicleAssigned;
  }

  if (inspectionSection) {
    inspectionSection.hidden = !isVehicleAssigned;
  }

  if (maintenanceSection) {
    maintenanceSection.hidden = !isVehicleAssigned;
  }

  if (!isVehicleAssigned) {
    closeInspectionModal(true);
    closeMaintenanceRequestModal();
  }
}

function renderDashboard() {
  if (!dashboardState.profile) return;
  renderProfile(dashboardState.profile, dashboardState.vehicle, dashboardState.tasks);
  renderUnassignedVehicleState();
  updateVehicleLinkedSectionsVisibility();
  renderTasks(dashboardState.tasks);
  renderMaintenanceRequests(dashboardState.maintenanceRequests);
  renderInspectionSummary();
}

function renderError(message) {
  document.getElementById("driver-name").textContent = "تعذر تحميل الصفحة";
  document.getElementById("driver-role").textContent = message;
  document.getElementById("driver-note").textContent = message;
  profileGrid.innerHTML = "";
  metricGrid.innerHTML = "";
  missionsBody.innerHTML = `<tr><td colspan="8" style="text-align:center;">${escapeHTML(message)}</td></tr>`;
  if (maintenanceRequestsBody) {
    maintenanceRequestsBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">${escapeHTML(message)}</td></tr>`;
  }
  if (inspectionSummary) {
    inspectionSummary.innerHTML = `<div class="info-card"><strong>${escapeHTML(message)}</strong></div>`;
  }
}

async function loadMaintenanceItems() {
  const response = await fetchWithSession("/api/inventory/items", { cache: "no-store" });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "تعذر تحميل المواد.");
  }

  const items = Array.isArray(data.items) ? data.items : [];
  maintenanceItemIdInput.innerHTML = `
    <option value="">اختر المادة</option>
    ${items.map((item) => `<option value="${escapeHTML(item.item_id)}">${escapeHTML(item.item_name || "-")} (${escapeHTML(item.item_code || "-")})</option>`).join("")}
  `;
}

function openMaintenanceRequestModal(prefilledJustification = "") {
  if (!hasAssignedVehicle()) {
    alert("يجب ربط مركبة بهذا السائق أولًا قبل إنشاء طلب صيانة.");
    return;
  }

  maintenanceRequestModal?.classList.add("open");
  maintenanceRequestedDateInput.value = getTodayKey();
  maintenanceQuantityInput.value = maintenanceQuantityInput.value || "1";
  maintenanceJustificationInput.value = prefilledJustification || "";

  loadMaintenanceItems().catch((error) => {
    alert(error.message || "تعذر تحميل المواد.");
  });
}

function closeMaintenanceRequestModal() {
  maintenanceRequestModal?.classList.remove("open");
  maintenanceRequestForm?.reset();
}

function setInspectionAlert(message, isError = false) {
  if (!inspectionAlert) return;
  inspectionAlert.textContent = message || "";
  inspectionAlert.style.color = isError ? "#ff9b9b" : "#a9c0cd";
}

function renderInspectionChecklist() {
  if (!inspectionChecklist) return;

  if (dashboardState.inspectionModalState.type === "monthly") {
    inspectionChecklist.innerHTML = MONTHLY_INSPECTION_ITEMS.map((item) => `
      <label class="inspection-item inspection-item--monthly">
        <span>${escapeHTML(item.label)}</span>
        <select data-monthly-field="${escapeHTML(item.key)}" required>
          <option value="">اختر الحالة</option>
          ${MONTHLY_STATUS_OPTIONS.map((option) => `<option value="${escapeHTML(option.value)}">${escapeHTML(option.label)}</option>`).join("")}
        </select>
      </label>
    `).join("");
    return;
  }

  inspectionChecklist.innerHTML = DAILY_INSPECTION_ITEMS.map((item) => `
    <label class="inspection-item">
      <input type="checkbox" data-inspection-field="${escapeHTML(item.key)}" />
      <span>${escapeHTML(item.label)}</span>
    </label>
  `).join("");
}

function getInspectionPayload() {
  const payload = {};
  payload.notes = inspectionNotesInput.value.trim();
  payload.has_issue = inspectionHasIssueInput.value === "true";
  if (dashboardState.inspectionModalState.type === "monthly") {
    inspectionChecklist.querySelectorAll("[data-monthly-field]").forEach((input) => {
      payload[input.dataset.monthlyField] = input.value;
    });
    payload.mileage = inspectionMileageInput.value.trim();
    payload.needs_periodic_service = inspectionNeedsPeriodicServiceInput.value === "true";
    return payload;
  }

  inspectionChecklist.querySelectorAll("[data-inspection-field]").forEach((input) => {
    payload[input.dataset.inspectionField] = Boolean(input.checked);
  });

  return payload;
}

function validateInspectionPayload(type, payload) {
  if (type !== "monthly") {
    return null;
  }

  if (!payload.mileage) {
    return "ممشى المركبة مطلوب في الفحص الشهري.";
  }

  if (!/^\d+$/.test(payload.mileage)) {
    return "ممشى المركبة يجب أن يكون رقمًا صحيحًا فقط.";
  }

  const mileageValue = Number(payload.mileage);
  if (!Number.isInteger(mileageValue) || mileageValue < 0) {
    return "ممشى المركبة يجب أن يكون رقمًا صحيحًا غير سالب.";
  }

  const lastMonthlyMileage = Number(dashboardState.inspectionStatus?.lastMonthlyMileage);
  if (Number.isFinite(lastMonthlyMileage) && mileageValue < lastMonthlyMileage) {
    return `ممشى المركبة لا يمكن أن يكون أقل من آخر ممشى شهري محفوظ (${lastMonthlyMileage}).`;
  }

  for (const item of MONTHLY_INSPECTION_ITEMS) {
    if (!payload[item.key]) {
      return `حقل "${item.label}" مطلوب في الفحص الشهري.`;
    }
  }

  return null;
}

function openInspectionModal(type, { locked = false } = {}) {
  dashboardState.inspectionModalState.type = type;
  dashboardState.inspectionModalState.locked = locked;
  inspectionModalTitle.textContent = type === "monthly" ? "الفحص الشهري للمركبة" : "الفحص اليومي للمركبة";
  inspectionModalSubtitle.textContent = type === "monthly"
    ? "أدخل ممشى المركبة وأكمل الفحص الشهري لحفظ السجل الحالي."
    : "أكمل الفحص اليومي قبل متابعة المهام داخل النظام.";
  if (inspectionChecklistHead) {
    inspectionChecklistHead.textContent = type === "monthly"
      ? "أكمل الفحص الفني الدوري وحدد حالة كل نظام في المركبة."
      : "ضع علامة على كل عنصر بعد فحصه، واترك أي عنصر به ملاحظة بدون علامة.";
  }
  inspectionMileageCard.hidden = type !== "monthly";
  inspectionMileageInput.required = type === "monthly";
  inspectionNeedsPeriodicServiceCard.hidden = type !== "monthly";
  inspectionMileageInput.value = "";
  inspectionNotesInput.value = "";
  inspectionHasIssueInput.value = "false";
  if (inspectionNeedsPeriodicServiceInput) {
    inspectionNeedsPeriodicServiceInput.value = "false";
  }
  closeInspectionModalButton.style.display = locked ? "none" : "inline-flex";
  renderInspectionChecklist();
  setInspectionAlert("");
  inspectionModal.classList.add("open");
}

function closeInspectionModal(force = false) {
  if (dashboardState.inspectionModalState.locked && !force) {
    return;
  }

  inspectionModal?.classList.remove("open");
  dashboardState.inspectionModalState.type = null;
  dashboardState.inspectionModalState.locked = false;
  inspectionForm?.reset();
  setInspectionAlert("");
}

function syncInspectionFlow() {
  const status = dashboardState.inspectionStatus;
  if (!status) return;

  if (!hasAssignedVehicle() || status.hasAssignedVehicle === false) {
    if (inspectionModal.classList.contains("open")) {
      closeInspectionModal(true);
    }
    return;
  }

  if (status.dailyRequired) {
    if (!inspectionModal.classList.contains("open") || dashboardState.inspectionModalState.type !== "daily") {
      openInspectionModal("daily", { locked: true });
    }
    return;
  }

  if (status.monthlyRequired) {
    if (!inspectionModal.classList.contains("open") || dashboardState.inspectionModalState.type !== "monthly") {
      openInspectionModal("monthly", { locked: true });
    }
    return;
  }

  if (inspectionModal.classList.contains("open")) {
    closeInspectionModal(true);
  }
}

async function loadDriverMaintenanceRequests() {
  const response = await fetchWithSession("/api/driver/maintenance-requests", {
    method: "GET",
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "تعذر تحميل طلبات الصيانة.");
  }

  return Array.isArray(data.requests) ? data.requests : [];
}

async function loadInspectionStatus() {
  const response = await fetchWithSession("/api/driver/inspection/status", {
    method: "GET",
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.message || "تعذر تحميل حالة الفحص.");
  }

  return data;
}

async function loadDriverDashboard() {
  const email = getEmailFromQuery();
  if (!email) {
    renderError("لا يمكن تحديد السائق الحالي. يرجى تسجيل الدخول من جديد.");
    return;
  }

  try {
    const dashboardResponse = await fetchWithSession(`/api/driver-dashboard?email=${encodeURIComponent(email)}`, { cache: "no-store" });
    const dashboardData = await dashboardResponse.json();

    if (!dashboardResponse.ok || !dashboardData.success) {
      throw new Error(dashboardData.message || "فشل تحميل بيانات السائق.");
    }

    dashboardState.profile = dashboardData.profile;
    dashboardState.vehicle = dashboardData.vehicle;
    dashboardState.tasks = Array.isArray(dashboardData.tasks) ? dashboardData.tasks : [];

    if (dashboardState.vehicle) {
      const [maintenanceRequests, inspectionStatus] = await Promise.all([
        loadDriverMaintenanceRequests(),
        loadInspectionStatus(),
      ]);
      dashboardState.maintenanceRequests = maintenanceRequests;
      dashboardState.inspectionStatus = inspectionStatus;
    } else {
      dashboardState.maintenanceRequests = [];
      dashboardState.inspectionStatus = {
        hasAssignedVehicle: false,
        dailyRequired: false,
        monthlyRequired: false,
        maintenanceRequestContext: null,
        history: [],
      };
    }

    renderDashboard();
    syncInspectionFlow();
  } catch (error) {
    console.error("Failed to load driver dashboard:", error);
    renderError(error.message || "فشل تحميل بيانات السائق.");
  }
}

function getTaskRespondEndpoint(taskKind, requestId) {
  return taskKind === "discharge"
    ? `/api/driver/discharge-tasks/${requestId}/respond`
    : `/api/driver/dock-requests/${requestId}/respond`;
}

function getTaskFinishEndpoint(taskKind, requestId) {
  if (taskKind === "discharge") {
    return {
      completed: `/api/dockmanager/reception/tasks/${requestId}/complete`,
      failed: `/api/driver/discharge-tasks/${requestId}/fail`,
    };
  }

  return {
    completed: `/api/driver/dock-requests/${requestId}/finish`,
    failed: `/api/driver/dock-requests/${requestId}/finish`,
  };
}

async function respondToTask(taskKind, requestId, decision) {
  let note = "";
  if (decision === "busy") {
    note = window.prompt("اكتب سبب الانشغال الآن:", "") || "";
    if (!note.trim()) return;
  }

  dashboardState.actionInProgress = true;
  renderDashboard();

  try {
    const response = await fetchWithSession(getTaskRespondEndpoint(taskKind, requestId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "تعذر حفظ الرد.");
    }

    notifyDockManagerUpdate(decision);
    await loadDriverDashboard();
  } catch (error) {
    alert(error.message || "تعذر حفظ الرد.");
  } finally {
    dashboardState.actionInProgress = false;
    renderDashboard();
  }
}

async function finishTask(taskKind, requestId, outcome) {
  let note = "";
  if (outcome === "failed") {
    note = window.prompt("اكتب سبب تعذر اكتمال المهمة:", "") || "";
    if (!note.trim()) return;
  }

  dashboardState.actionInProgress = true;
  renderDashboard();

  try {
    const endpoints = getTaskFinishEndpoint(taskKind, requestId);
    const endpoint = outcome === "failed" ? endpoints.failed : endpoints.completed;
    const payload = taskKind === "discharge"
      ? (outcome === "failed" ? { note } : { finalLocation: "" })
      : { outcome, note };

    const response = await fetchWithSession(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "تعذر حفظ نتيجة المهمة.");
    }

    notifyDockManagerUpdate(outcome);
    await loadDriverDashboard();
  } catch (error) {
    alert(error.message || "تعذر حفظ نتيجة المهمة.");
  } finally {
    dashboardState.actionInProgress = false;
    renderDashboard();
  }
}

maintenanceRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!hasAssignedVehicle()) {
    alert("يجب ربط مركبة بهذا السائق أولًا قبل إنشاء طلب صيانة.");
    return;
  }

  try {
    const response = await fetchWithSession("/api/driver/maintenance-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: Number(maintenanceItemIdInput.value),
        quantity: Number(maintenanceQuantityInput.value),
        justification: maintenanceJustificationInput.value || "",
        requestedDate: maintenanceRequestedDateInput.value || "",
      }),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "تعذر إرسال طلب الصيانة.");
    }

    closeMaintenanceRequestModal();
    notifyMaintenanceRequestUpdate("created");
    await loadDriverDashboard();
  } catch (error) {
    alert(error.message || "تعذر إرسال طلب الصيانة.");
  }
});

inspectionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!hasAssignedVehicle()) {
    setInspectionAlert("يجب ربط مركبة بهذا السائق أولًا قبل تسجيل الفحص.", true);
    return;
  }

  const inspectionType = dashboardState.inspectionModalState.type;
  if (!inspectionType) return;
  const payload = getInspectionPayload();
  const validationMessage = validateInspectionPayload(inspectionType, payload);
  if (validationMessage) {
    setInspectionAlert(validationMessage, true);
    return;
  }

  saveInspectionButton.disabled = true;
  setInspectionAlert("جارٍ حفظ الفحص...");

  try {
    const response = await fetchWithSession(`/api/driver/inspection/${inspectionType}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "تعذر حفظ الفحص.");
    }

    closeInspectionModal(true);
    await loadDriverDashboard();
  } catch (error) {
    setInspectionAlert(error.message || "تعذر حفظ الفحص.", true);
  } finally {
    saveInspectionButton.disabled = false;
  }
});

missionsBody?.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-request-id][data-decision][data-stage]");
  if (!actionButton || dashboardState.actionInProgress || dashboardState.inspectionStatus?.dailyRequired) {
    return;
  }

  if (actionButton.dataset.stage === "finish") {
    finishTask(actionButton.dataset.taskKind || "dock", actionButton.dataset.requestId, actionButton.dataset.decision);
    return;
  }

  respondToTask(actionButton.dataset.taskKind || "dock", actionButton.dataset.requestId, actionButton.dataset.decision);
});

inspectionSummary?.addEventListener("click", (event) => {
  const inspectionButton = event.target.closest("[data-open-inspection]");
  if (inspectionButton) {
    openInspectionModal(inspectionButton.dataset.openInspection, {
      locked: inspectionButton.dataset.openInspection === "daily"
        ? Boolean(dashboardState.inspectionStatus?.dailyRequired)
        : Boolean(dashboardState.inspectionStatus?.monthlyRequired),
    });
    return;
  }

  const maintenanceButton = event.target.closest("[data-open-maintenance]");
  if (maintenanceButton) {
    openMaintenanceRequestModal(dashboardState.inspectionStatus?.maintenanceRequestContext?.prefilledJustification || "");
  }
});

document.getElementById("closeMaintenanceRequestModal")?.addEventListener("click", closeMaintenanceRequestModal);
maintenanceRequestModal?.addEventListener("click", (event) => {
  if (event.target === maintenanceRequestModal) {
    closeMaintenanceRequestModal();
  }
});

closeInspectionModalButton?.addEventListener("click", () => closeInspectionModal());
inspectionModal?.addEventListener("click", (event) => {
  if (event.target === inspectionModal) {
    closeInspectionModal();
  }
});

window.addEventListener("storage", (event) => {
  if (!event.newValue) return;
  if (!["machine-refresh", "maintenance-request-refresh"].includes(event.key)) return;
  loadDriverDashboard();
});

loadDriverDashboard();
