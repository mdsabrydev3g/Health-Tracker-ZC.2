// ============================================================
// core/schema — أنواع البيانات والمخطط. طبقة نقية تماماً:
// بلا React، بلا Dexie، بلا Capacitor، بلا أي اعتماد خارجي.
// ============================================================

export type Role = 'owner' | 'mother' | 'member';

export type MedForm =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'drops'
  | 'injection'
  | 'inhaler'
  | 'other';

export type DoseUnit = 'tablet' | 'ml' | 'unit' | 'drop' | 'puff';

export interface Person {
  id: string;
  familyId: string;
  name: string;
  role: Role;
  birthYear?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  serverSeq?: number;
}

export interface PackPresentation {
  /** عدد الأقراص في الشريط الواحد (blister) */
  tabletsPerBlister?: number;
  /** عدد الشرائط في العلبة الواحدة */
  blistersPerBox?: number;
  /** حجم القارورة بالمللي للسوائل */
  mlPerBottle?: number;
}

export interface Med {
  id: string;
  familyId: string;
  personId: string;
  nameAr: string;
  nameEn?: string;
  activeIngredient?: string;
  /** مثل "500 mg" */
  strength?: string;
  form: MedForm;
  doseUnit: DoseUnit;
  /** دواء هام — يستحق تنبيهاً عاجلاً عند اقتراب نفاده */
  isImportant: boolean;
  /** دواء مزمن */
  isChronic: boolean;
  /** دواء عند اللزوم (PRN) — لا يُجدول، يُؤخذ حسب الحاجة */
  prn: boolean;
  prnMaxPerDay?: number;
  prnReasonHint?: string;
  /** لملء تفصيل العبوات: أشرطة × أقراص بالشريط + علب */
  presentation?: PackPresentation;
  barcode?: string;
  gtin?: string;
  /** انتهاء العلبة الحالية (من الباركود GS1 أو يدوياً) */
  packExpiry?: number;
  /** تشغيلة العلبة الحالية */
  packBatch?: string;
  /** عتبات النفاد المتدرجة الخاصة بهذا الدواء (أيام)؛ افتراضياً من الإعدادات */
  lowStockDays?: number[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  serverSeq?: number;
}

export interface Schedule {
  id: string;
  familyId: string;
  personId: string;
  medId: string;
  /** أوقات محلية بصيغة HH:mm */
  times: string[];
  /** حجم الجرعة بوحدات doseUnit (0.5 = نصف قرص) */
  doseSize: number;
  /** أيام الأسبوع 0=الأحد..6=السبت؛ undefined = يومياً */
  daysOfWeek?: number[];
  startDate: number;
  endDate?: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  serverSeq?: number;
}

export type DoseStatus = 'taken' | 'skipped' | 'missed';

/** حدث جرعة — append-only: لا يُعدَّل ولا يُحذف أبداً بعد الإنشاء */
export interface DoseEvent {
  id: string;
  familyId: string;
  personId: string;
  medId: string;
  scheduleId?: string;
  /** وقت الخطة (epoch ms) — لجرعات PRN يساوي وقت التسجيل */
  plannedFor: number;
  /** مفتاح اليوم المحلي YYYY-MM-DD */
  dayKey: string;
  status: DoseStatus;
  takenAt?: number;
  /** المقدار المستهلك فعلياً بوحدات الدواء */
  amount: number;
  note?: string;
  createdAt: number;
  serverSeq?: number;
}

export type InventoryReason = 'refill' | 'manual' | 'dose' | 'expiry';

/** حدث مخزون — append-only: الرصيد يُشتق من مجموع هذه الأحداث */
export interface InventoryEvent {
  id: string;
  familyId: string;
  medId: string;
  /** +إضافة / −خصم بوحدات الدواء */
  delta: number;
  reason: InventoryReason;
  at: number;
  note?: string;
  createdAt: number;
  serverSeq?: number;
}

export interface LabValue {
  name: string;
  value: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  flagged?: boolean;
}

export interface LabResult {
  id: string;
  familyId: string;
  personId: string;
  title: string;
  kind: 'lab' | 'imaging';
  date: number;
  fileName?: string;
  fileType?: string;
  fileDataUrl?: string; // dataURL للملف الصغير المحلي
  values?: LabValue[];
  aiSummary?: string;
  aiProvider?: string;
  aiAt?: number;
  consentAt?: number; // لحظة الموافقة على الإرسال لمزود خارجي
  notes?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  serverSeq?: number;
}

export interface Symptom {
  id: string;
  familyId: string;
  personId: string;
  at: number;
  text: string;
  severity?: 1 | 2 | 3;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  serverSeq?: number;
}

export interface FoodLog {
  id: string;
  familyId: string;
  personId: string;
  at: number;
  text: string;
  kind?: 'meal' | 'drink' | 'note';
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  serverSeq?: number;
}

/** جدول تعلّم الباركود: gtin ← بيانات الدواء */
export interface GtinEntry {
  gtin: string;
  nameAr: string;
  nameEn?: string;
  activeIngredient?: string;
  strength?: string;
  form?: MedForm;
  source: 'manual' | 'scan' | 'vision' | 'official';
  confirmedAt: number;
}

export interface Family {
  id: string;
  name: string;
  tz: string;
  inviteCode: string;
  createdAt: number;
}

export interface SessionUser {
  id: string;
  familyId: string;
  login: string;
  name: string;
  role: Role;
  personId?: string;
}

/** صحة المنبّه على هذا الجهاز */
export interface AlarmHealth {
  deviceId: string;
  platform: 'web' | 'android' | 'ios' | 'desktop';
  lastScheduledAt?: number;
  exactAlarmPermission?: boolean;
  notificationsPermission?: 'granted' | 'denied' | 'default';
  batteryOptimized?: boolean;
  lastAlarmFiredAt?: number;
  pushToken?: string;
  updatedAt: number;
}

// ---------- سياسات وإعدادات ----------

/** وضع الجهاز: من يستخدم هذا الجهاز؟ */
export type DeviceMode = 'mother' | 'owner';

export interface NotifyPolicy {
  mode: DeviceMode;
  /** منبّه صوتي كامل لكل جرعة (وضع الوالدة فقط) */
  alarmPerDose: boolean;
  /** إشعارات صامتة لكل جرعة (أخذت/فاتت) */
  notifyPerDose: boolean;
  /** إشعار عند النفاد لكل دواء */
  notifyStock: boolean;
  /** منبّه/تنبيه عاجل عند نفاد دواء هام فقط (وضع المالك) */
  urgentAlarmForImportantOnly: boolean;
  /** عتبات النفاد المتدرجة بالأيام — قابلة للتعديل */
  lowStockThresholdDays: number[];
}

export const DEFAULT_OWNER_POLICY: NotifyPolicy = {
  mode: 'owner',
  alarmPerDose: false,
  notifyPerDose: true,
  notifyStock: true,
  urgentAlarmForImportantOnly: true,
  lowStockThresholdDays: [7, 3, 1],
};

export const DEFAULT_MOTHER_POLICY: NotifyPolicy = {
  mode: 'mother',
  alarmPerDose: true,
  notifyPerDose: true,
  notifyStock: true,
  urgentAlarmForImportantOnly: false,
  lowStockThresholdDays: [7, 3, 1],
};

// ---------- أسماء الكيانات المتزامنة ----------

export type EntityName =
  | 'persons'
  | 'meds'
  | 'schedules'
  | 'doseEvents'
  | 'inventoryEvents'
  | 'labResults'
  | 'symptoms'
  | 'foodLogs';

/** الكيانات append-only: تُضاف فقط ولا تُعدَّل ولا تُحذف */
export const APPEND_ONLY: ReadonlySet<EntityName> = new Set([
  'doseEvents',
  'inventoryEvents',
]);

export interface SyncOp {
  seq: number;
  entity: EntityName;
  entityId: string;
  op: 'upsert' | 'delete';
  payload: unknown;
  at: number;
  tries: number;
  lastError?: string;
}
