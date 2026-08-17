/**
 * مسؤولية الملف: تجميع الثوابت المشتركة والثابتة المستخدمة في الصلاحيات والأرصفة والمخازن ومسارات الصفحات.
 * ملاحظات: هذا الملف لا يحتوي على منطق تنفيذي، وإنما يوفّر قيمًا ثابتة لإعادة استخدامها من دون تكرار.
 */

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

const STORED_ROLE_NAMES = {
    admin: 'Admin',
    supervisor: 'Supervisor',
    mechanic: 'Mechanic',
    driver: 'Driver',
    dockmanager: 'DockManager'
};

const DOCK_LEVELS = [
    { key: 'upper', label: 'المستوى العلوي', prefix: 'UP' },
    { key: 'middle', label: 'المستوى المتوسط', prefix: 'MID' },
    { key: 'lower', label: 'المستوى السفلي', prefix: 'LOW' }
];

const TRUCK_BERTH_LEVELS = [
    { key: 'lower', label: 'المستوى السفلي', prefix: 'LOW', hint: 'رافعة شوكية فقط' }
];

const TRAIN_BERTH_LEVELS = [
    { key: 'lower', label: 'المستوى السفلي', prefix: 'LOW', hint: 'رافعة شوكية فقط' }
];

const DOCK_BERTHS = [
    { key: 'A', label: 'رصيف A', levels: DOCK_LEVELS },
    { key: 'B', label: 'رصيف B', levels: DOCK_LEVELS },
    { key: 'C', label: 'رصيف C', levels: DOCK_LEVELS },
    { key: 'TRUCK', label: 'رصيف الشاحنات', levels: TRUCK_BERTH_LEVELS },
    { key: 'TRAIN', label: 'رصيف القطار', levels: TRAIN_BERTH_LEVELS }
];

const ALL_DOCK_LEVELS = DOCK_LEVELS;

const BERTH_DESTINATION_TYPES = {
    berth_a: 'A',
    berth_b: 'B',
    berth_c: 'C',
    truck_berth: 'TRUCK',
    train_berth: 'TRAIN'
};

const AUTO_ASSIGNABLE_BERTH_KEYS = ['A', 'B', 'C'];

const WAREHOUSE_TYPES = [
    'مستودع للزيوت والشحوم',
    'مستودع للاطارات',
    'مستودع للقطع الكهربائية',
    'مستودع للقطع الميكانيكية'
];

const PAGE_ROLE_ACCESS = {
    '/admin.html': ['admin'],
    '/warehouse.html': ['admin'],
    '/mechanic.html': ['mechanic'],
    '/supervisor.html': ['supervisor'],
    '/dockmanager.html': ['dockmanager'],
    '/driver_profile.html': ['driver']
};

module.exports = {
    ROLE_ALIASES,
    STORED_ROLE_NAMES,
    DOCK_LEVELS,
    TRUCK_BERTH_LEVELS,
    TRAIN_BERTH_LEVELS,
    DOCK_BERTHS,
    ALL_DOCK_LEVELS,
    BERTH_DESTINATION_TYPES,
    AUTO_ASSIGNABLE_BERTH_KEYS,
    WAREHOUSE_TYPES,
    PAGE_ROLE_ACCESS
};
