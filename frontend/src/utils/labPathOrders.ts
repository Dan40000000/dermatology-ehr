type LabPathOrderLike = {
  type?: string | null;
  status?: string | null;
};

const PATH_ORDER_TYPES = new Set(['path', 'pathology', 'dermpath', 'biopsy']);
const LAB_ORDER_TYPES = new Set(['lab', 'laboratory']);
const OPEN_LAB_PATH_STATUSES = new Set([
  'ordered',
  'pending',
  'sent',
  'received_by_lab',
  'processing',
  'in-progress',
  'in_progress',
]);

export function normalizeLabPathValue(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function isPathOrderType(type: unknown): boolean {
  return PATH_ORDER_TYPES.has(normalizeLabPathValue(type));
}

export function isLabOrderType(type: unknown): boolean {
  return LAB_ORDER_TYPES.has(normalizeLabPathValue(type));
}

export function isLabPathOrderType(type: unknown): boolean {
  return isPathOrderType(type) || isLabOrderType(type);
}

export function isOpenLabPathStatus(status: unknown): boolean {
  return OPEN_LAB_PATH_STATUSES.has(normalizeLabPathValue(status));
}

export function isOpenLabPathOrder(order: LabPathOrderLike): boolean {
  return isLabPathOrderType(order.type) && isOpenLabPathStatus(order.status);
}
