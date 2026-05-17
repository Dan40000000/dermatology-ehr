import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Inbox,
  Mail,
  MessageSquare,
  Pill,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Skeleton } from '../components/ui';
import {
  approveRefillRequest,
  createTask,
  fetchBiopsyCommandCenter,
  fetchFaxInbox,
  fetchMessageThread,
  fetchMessageThreads,
  fetchOrders,
  fetchPARequests,
  fetchRefillRequestsNew,
  fetchSMSConversations,
  fetchStaffPatientMessageThread,
  fetchStaffPatientMessageThreads,
  markSMSConversationRead,
  markStaffPatientMessageThreadRead,
  markThreadAsRead,
  sendStaffPatientMessageThreadMessage,
  sendThreadMessage,
  updateFax,
  updateOrderStatus,
  updateStaffPatientMessageThread,
  updateTaskStatus,
  fetchTasks,
  type BiopsySafetyItem,
  type StaffPatientMessage,
  type StaffPatientMessageThreadDetail,
} from '../api';
import { canAccessModule } from '../config/moduleAccess';
import { getEffectiveRoles } from '../utils/roles';
import type { Order, Task } from '../types';

type InboxSource =
  | 'portal'
  | 'sms'
  | 'mail'
  | 'task'
  | 'refill'
  | 'epa'
  | 'order'
  | 'pathology'
  | 'fax';

type InboxQueue = 'all' | 'messages' | 'clinical' | 'rx' | 'results' | 'admin';
type InboxPriority = 'critical' | 'urgent' | 'high' | 'normal' | 'low';

interface ClinicalInboxItem {
  id: string;
  source: InboxSource;
  sourceId: string;
  queue: Exclude<InboxQueue, 'all'>;
  title: string;
  summary: string;
  patientId?: string;
  patientName?: string;
  patientMrn?: string;
  priority: InboxPriority;
  status: string;
  ownerName?: string;
  dueAt?: string;
  updatedAt?: string;
  unread?: boolean;
  route: string;
  actionLabel: string;
  raw: any;
}

interface LoadedInboxData {
  items: ClinicalInboxItem[];
  warnings: string[];
}

const QUEUE_LABELS: Record<InboxQueue, string> = {
  all: 'All Work',
  messages: 'Messages',
  clinical: 'Clinical',
  rx: 'Rx / ePA',
  results: 'Results',
  admin: 'Admin',
};

const SOURCE_LABELS: Record<InboxSource, string> = {
  portal: 'Portal',
  sms: 'Text',
  mail: 'Mail',
  task: 'Task',
  refill: 'Refill',
  epa: 'ePA',
  order: 'Order',
  pathology: 'Pathology',
  fax: 'Fax',
};

const SOURCE_ICONS: Record<InboxSource, LucideIcon> = {
  portal: MessageSquare,
  sms: MessageSquare,
  mail: Mail,
  task: ClipboardCheck,
  refill: Pill,
  epa: ShieldAlert,
  order: FileText,
  pathology: Stethoscope,
  fax: FileText,
};

const PRIORITY_WEIGHT: Record<InboxPriority, number> = {
  critical: 5,
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const isOpenStatus = (status?: string | null) => {
  const normalized = String(status || '').toLowerCase();
  return !['closed', 'completed', 'cancelled', 'canceled', 'done', 'resolved', 'approved', 'denied'].includes(normalized);
};

const normalizePriority = (value?: string | null): InboxPriority => {
  const normalized = String(value || '').toLowerCase();
  if (['critical', 'panic'].includes(normalized)) return 'critical';
  if (['urgent', 'stat'].includes(normalized)) return 'urgent';
  if (['high', 'abnormal', 'cancerous', 'malignant'].includes(normalized)) return 'high';
  if (['low', 'routine'].includes(normalized)) return 'low';
  return 'normal';
};

const normalizeName = (...parts: Array<string | null | undefined>) =>
  parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');

const formatDateTime = (value?: string) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatAge = (value?: string) => {
  if (!value) return 'No activity';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes || 1}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const getSortTime = (item: ClinicalInboxItem) => {
  const raw = item.dueAt || item.updatedAt;
  const parsed = raw ? Date.parse(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

const isOverdue = (item: ClinicalInboxItem) => {
  if (!item.dueAt || !isOpenStatus(item.status)) return false;
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return false;
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  return due.getTime() < endToday.getTime();
};

const itemMatchesSearch = (item: ClinicalInboxItem, search: string) => {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [
    item.title,
    item.summary,
    item.patientName,
    item.patientMrn,
    item.status,
    item.ownerName,
    SOURCE_LABELS[item.source],
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
};

const threadPatientName = (thread: any) =>
  thread.patientName || normalizeName(thread.patientFirstName, thread.patientLastName) || 'Patient not linked';

const taskPatientName = (task: Task) =>
  normalizeName((task as any).patientFirstName, (task as any).patientLastName) || undefined;

const orderSummary = (order: Order) =>
  [order.details, order.notes].map((part) => String(part || '').trim()).filter(Boolean).join(' | ') || `${order.type} order`;

const getBiopsyQueueItems = (biopsy: any): BiopsySafetyItem[] => {
  const queues = biopsy?.queues || {};
  const ordered = [
    ...(queues.critical || []),
    ...(queues.pendingReview || []),
    ...(queues.pendingNotification || []),
    ...(queues.treatmentFollowUp || []),
    ...(queues.pendingResults || []),
  ];
  const seen = new Set<string>();
  return ordered.filter((item) => {
    const key = item.id || item.specimen_id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const toPortalItem = (thread: any): ClinicalInboxItem => ({
  id: `portal-${thread.id}`,
  source: 'portal',
  sourceId: thread.id,
  queue: 'messages',
  title: thread.subject || 'Portal message',
  summary: thread.lastMessagePreview || `${thread.category || 'Portal'} patient message`,
  patientId: thread.patientId,
  patientName: threadPatientName(thread),
  patientMrn: thread.patientMrn,
  priority: normalizePriority(thread.priority),
  status: thread.status || 'open',
  ownerName: thread.assignedToName || (thread.assignedTo ? 'Assigned' : 'Unassigned'),
  updatedAt: thread.lastMessageAt || thread.updatedAt || thread.createdAt,
  unread: thread.isReadByStaff === false,
  route: `/patients/${thread.patientId}`,
  actionLabel: 'Move in progress',
  raw: thread,
});

const toSmsItem = (conversation: any): ClinicalInboxItem => ({
  id: `sms-${conversation.patientId}`,
  source: 'sms',
  sourceId: conversation.patientId,
  queue: 'messages',
  title: `Text from ${conversation.patientName || normalizeName(conversation.firstName, conversation.lastName) || 'patient'}`,
  summary: conversation.lastMessagePreview || conversation.lastMessage || 'Unread text conversation',
  patientId: conversation.patientId,
  patientName: conversation.patientName || normalizeName(conversation.firstName, conversation.lastName),
  patientMrn: conversation.patientMrn,
  priority: normalizePriority(conversation.category === 'medical' ? 'high' : conversation.category === 'prescription' ? 'high' : 'normal'),
  status: conversation.threadStatus || conversation.status || 'open',
  updatedAt: conversation.lastMessageAt || conversation.lastMessageTime,
  unread: Number(conversation.unreadCount || 0) > 0,
  route: `/text-messages?patientId=${encodeURIComponent(conversation.patientId || '')}`,
  actionLabel: 'Mark read',
  raw: conversation,
});

const toMailItem = (thread: any): ClinicalInboxItem => ({
  id: `mail-${thread.id}`,
  source: 'mail',
  sourceId: thread.id,
  queue: 'messages',
  title: thread.subject || 'Mail thread',
  summary: thread.lastMessage?.body || 'Unread intramail thread',
  patientId: thread.patientId,
  patientName: threadPatientName(thread),
  priority: normalizePriority(thread.priority),
  status: thread.isArchived ? 'archived' : 'open',
  ownerName: thread.createdByName,
  updatedAt: thread.updatedAt || thread.createdAt,
  unread: Number(thread.unreadCount || 0) > 0,
  route: '/mail?tab=inbox',
  actionLabel: 'Open mail',
  raw: thread,
});

const toTaskItem = (task: Task): ClinicalInboxItem => ({
  id: `task-${task.id}`,
  source: 'task',
  sourceId: task.id,
  queue: 'clinical',
  title: task.title || 'Task',
  summary: task.description || task.category || 'Open task',
  patientId: task.patientId,
  patientName: taskPatientName(task),
  priority: normalizePriority(task.priority),
  status: task.status || 'todo',
  ownerName: (task as any).assignedToName || (task.assignedTo ? 'Assigned' : 'Unassigned'),
  dueAt: task.dueDate || (task as any).dueAt,
  updatedAt: task.createdAt,
  route: '/tasks',
  actionLabel: 'Complete task',
  raw: task,
});

const toRefillItem = (refill: any): ClinicalInboxItem => ({
  id: `refill-${refill.id}`,
  source: 'refill',
  sourceId: refill.id,
  queue: 'rx',
  title: `Refill request: ${refill.medicationName || refill.medication_name || 'Medication'}`,
  summary: [
    refill.strength,
    refill.pharmacyName || refill.pharmacy_name,
    refill.notes,
  ].filter(Boolean).join(' | ') || 'Pending refill review',
  patientId: refill.patientId || refill.patient_id,
  patientName: refill.patientName || normalizeName(refill.patientFirstName, refill.patientLastName),
  priority: normalizePriority(refill.priority || 'high'),
  status: refill.status || 'pending',
  ownerName: refill.providerName,
  updatedAt: refill.requestedDate || refill.requested_date || refill.createdAt || refill.created_at,
  route: '/rx?tab=refills',
  actionLabel: 'Approve refill',
  raw: refill,
});

const toPAItem = (request: any): ClinicalInboxItem => ({
  id: `epa-${request.id}`,
  source: 'epa',
  sourceId: request.id,
  queue: 'rx',
  title: `ePA: ${request.medicationName || request.medication_name || request.procedureCode || 'Authorization'}`,
  summary: [request.payer, request.payerName, request.statusReason, request.status_reason]
    .filter(Boolean)
    .join(' | ') || 'Prior authorization needs review',
  patientId: request.patientId || request.patient_id,
  patientName: request.patientName || normalizeName(request.patientFirstName, request.patientLastName),
  priority: normalizePriority(request.urgency || request.priority || (request.status === 'error' ? 'high' : 'normal')),
  status: request.status || 'pending',
  updatedAt: request.updatedAt || request.updated_at || request.createdAt || request.created_at,
  route: '/prior-auth',
  actionLabel: 'Open ePA',
  raw: request,
});

const toOrderItem = (order: Order): ClinicalInboxItem => ({
  id: `order-${order.id}`,
  source: 'order',
  sourceId: order.id,
  queue: ['lab', 'pathology', 'biopsy', 'radiology'].includes(String(order.type || '').toLowerCase()) ? 'results' : 'clinical',
  title: `${String(order.type || 'Order').toUpperCase()} order`,
  summary: orderSummary(order),
  patientId: order.patientId,
  priority: normalizePriority(order.priority),
  status: order.status || 'pending',
  ownerName: order.providerName,
  updatedAt: order.createdAt,
  route: '/orders',
  actionLabel: 'Complete order',
  raw: order,
});

const toPathologyItem = (biopsy: BiopsySafetyItem): ClinicalInboxItem => ({
  id: `pathology-${biopsy.id || biopsy.specimen_id}`,
  source: 'pathology',
  sourceId: biopsy.id || biopsy.specimen_id,
  queue: 'results',
  title: `Biopsy follow-up: ${biopsy.specimen_id}`,
  summary: [
    biopsy.loop_status,
    biopsy.next_action,
    biopsy.pathology_diagnosis,
    biopsy.body_location,
  ].filter(Boolean).join(' | ') || 'Open biopsy safety loop',
  patientId: biopsy.patient_id || biopsy.patientId,
  patientName: biopsy.patient_name,
  patientMrn: biopsy.mrn,
  priority: normalizePriority(biopsy.highest_severity || biopsy.safety_flags?.[0]?.severity),
  status: biopsy.loop_status || biopsy.status || 'open',
  ownerName: biopsy.ordering_provider_name,
  dueAt: biopsy.highest_severity === 'critical' ? todayIsoDate() : undefined,
  updatedAt: biopsy.resulted_at || biopsy.sent_at || biopsy.ordered_at,
  route: '/biopsies',
  actionLabel: 'Create follow-up',
  raw: biopsy,
});

const toFaxItem = (fax: any): ClinicalInboxItem => ({
  id: `fax-${fax.id}`,
  source: 'fax',
  sourceId: fax.id,
  queue: 'admin',
  title: fax.subject || 'Inbound fax',
  summary: [fax.fromNumber ? `From ${fax.fromNumber}` : '', fax.pages ? `${fax.pages} page${fax.pages === 1 ? '' : 's'}` : '', fax.notes]
    .filter(Boolean)
    .join(' | ') || 'Unread inbound fax',
  patientId: fax.patientId,
  patientName: fax.patientName,
  priority: normalizePriority(fax.status === 'failed' ? 'high' : fax.patientId ? 'normal' : 'high'),
  status: fax.status || 'received',
  ownerName: fax.assignedToEmail,
  updatedAt: fax.receivedAt || fax.createdAt,
  unread: fax.read === false,
  route: '/fax',
  actionLabel: 'Mark read',
  raw: fax,
});

export function ClinicalInboxPage() {
  const { session, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ClinicalInboxItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(searchParams.get('item'));
  const [activeQueue, setActiveQueue] = useState<InboxQueue>((searchParams.get('queue') as InboxQueue) || 'all');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | InboxPriority>('all');
  const [portalThread, setPortalThread] = useState<StaffPatientMessageThreadDetail | null>(null);
  const [portalMessages, setPortalMessages] = useState<StaffPatientMessage[]>([]);
  const [mailMessages, setMailMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const effectiveRoles = useMemo(() => getEffectiveRoles(user || session?.user), [user, session]);

  const loadInbox = useCallback(async (): Promise<LoadedInboxData> => {
    if (!session) return { items: [], warnings: [] };
    const nextWarnings: string[] = [];
    const safe = async <T,>(label: string, promise: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await promise;
      } catch {
        nextWarnings.push(label);
        return fallback;
      }
    };

    const [
      portalRes,
      smsRes,
      mailRes,
      tasksRes,
      refillsRes,
      paRes,
      ordersRes,
      biopsyRes,
      faxRes,
    ] = await Promise.all([
      safe('Portal messages', fetchStaffPatientMessageThreads(session.tenantId, session.accessToken, { limit: 100 }), { threads: [] }),
      canAccessModule(effectiveRoles, 'text_messages')
        ? safe('Text messages', fetchSMSConversations(session.tenantId, session.accessToken), { conversations: [] })
        : Promise.resolve({ conversations: [] }),
      canAccessModule(effectiveRoles, 'mail')
        ? safe('Mail', fetchMessageThreads(session.tenantId, session.accessToken, 'inbox'), { threads: [] })
        : Promise.resolve({ threads: [] }),
      canAccessModule(effectiveRoles, 'tasks')
        ? safe('Tasks', fetchTasks(session.tenantId, session.accessToken, { sortBy: 'dueDate', sortOrder: 'asc' }), { tasks: [] })
        : Promise.resolve({ tasks: [] }),
      canAccessModule(effectiveRoles, 'rx')
        ? safe('Refills', fetchRefillRequestsNew(session.tenantId, session.accessToken, { status: 'pending' }), { refillRequests: [] })
        : Promise.resolve({ refillRequests: [] }),
      canAccessModule(effectiveRoles, 'epa')
        ? safe('ePA', fetchPARequests(session.tenantId, session.accessToken), [])
        : Promise.resolve([]),
      canAccessModule(effectiveRoles, 'orders')
        ? safe('Orders', fetchOrders(session.tenantId, session.accessToken, {
            statuses: ['pending', 'open', 'in-progress', 'ordered', 'sent'],
            limit: 100,
          }), { orders: [] })
        : Promise.resolve({ orders: [] }),
      canAccessModule(effectiveRoles, 'labs')
        ? safe('Biopsy safety', fetchBiopsyCommandCenter(session.tenantId, session.accessToken), null)
        : Promise.resolve(null),
      canAccessModule(effectiveRoles, 'fax')
        ? safe('Fax', fetchFaxInbox(session.tenantId, session.accessToken, { unreadOnly: true, limit: 50 }), { faxes: [] })
        : Promise.resolve({ faxes: [] }),
    ]);

    const portalItems = (portalRes.threads || [])
      .filter((thread: any) => isOpenStatus(thread.status) || thread.isReadByStaff === false)
      .map(toPortalItem);
    const smsItems = (smsRes.conversations || [])
      .filter((conversation: any) => Number(conversation.unreadCount || 0) > 0)
      .map(toSmsItem);
    const mailItems = (mailRes.threads || [])
      .filter((thread: any) => Number(thread.unreadCount || 0) > 0)
      .map(toMailItem);
    const taskItems = (tasksRes.tasks || [])
      .filter((task: Task) => isOpenStatus(task.status))
      .map(toTaskItem);
    const refillItems = (refillsRes.refillRequests || [])
      .filter((refill: any) => String(refill.status || '').toLowerCase() === 'pending')
      .map(toRefillItem);
    const paItems = (Array.isArray(paRes) ? paRes : [])
      .filter((request: any) => ['pending', 'submitted', 'needs_info', 'error'].includes(String(request.status || '').toLowerCase()))
      .map(toPAItem);
    const orderItems = (ordersRes.orders || [])
      .filter((order: Order) => isOpenStatus(order.status))
      .map(toOrderItem);
    const pathologyItems = biopsyRes ? getBiopsyQueueItems(biopsyRes).map(toPathologyItem) : [];
    const faxItems = (faxRes.faxes || [])
      .filter((fax: any) => fax.read === false || !fax.patientId)
      .map(toFaxItem);

    const merged = [
      ...portalItems,
      ...smsItems,
      ...mailItems,
      ...taskItems,
      ...refillItems,
      ...paItems,
      ...orderItems,
      ...pathologyItems,
      ...faxItems,
    ].sort((left, right) => {
      const priorityDiff = PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return getSortTime(right) - getSortTime(left);
    });

    return { items: merged, warnings: nextWarnings };
  }, [effectiveRoles, session]);

  const refreshInbox = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const result = await loadInbox();
      setItems(result.items);
      setWarnings(result.warnings);
      setSelectedItemId((current) => {
        if (current && result.items.some((item) => item.id === current)) return current;
        return result.items[0]?.id || null;
      });
    } finally {
      setLoading(false);
    }
  }, [loadInbox, session]);

  useEffect(() => {
    refreshInbox();
  }, [refreshInbox]);

  const filteredItems = useMemo(() => (
    items.filter((item) => {
      if (activeQueue !== 'all' && item.queue !== activeQueue) return false;
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
      return itemMatchesSearch(item, search);
    })
  ), [activeQueue, items, priorityFilter, search]);

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.id === selectedItemId) || filteredItems[0] || null,
    [filteredItems, selectedItemId]
  );

  const summary = useMemo(() => ({
    total: items.length,
    critical: items.filter((item) => item.priority === 'critical' || item.priority === 'urgent').length,
    unread: items.filter((item) => item.unread).length,
    overdue: items.filter(isOverdue).length,
    messages: items.filter((item) => item.queue === 'messages').length,
    results: items.filter((item) => item.queue === 'results').length,
    rx: items.filter((item) => item.queue === 'rx').length,
  }), [items]);

  const queueCounts = useMemo(() => ({
    all: items.length,
    messages: items.filter((item) => item.queue === 'messages').length,
    clinical: items.filter((item) => item.queue === 'clinical').length,
    rx: items.filter((item) => item.queue === 'rx').length,
    results: items.filter((item) => item.queue === 'results').length,
    admin: items.filter((item) => item.queue === 'admin').length,
  }), [items]);

  const selectItem = (item: ClinicalInboxItem) => {
    setSelectedItemId(item.id);
    const params = new URLSearchParams(searchParams);
    params.set('item', item.id);
    if (activeQueue !== 'all') params.set('queue', activeQueue);
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      if (!session || !selectedItem) return;
      setReplyText('');
      setInternalNote(false);
      setPortalThread(null);
      setPortalMessages([]);
      setMailMessages([]);

      try {
        if (selectedItem.source === 'portal') {
          const detail = await fetchStaffPatientMessageThread(session.tenantId, session.accessToken, selectedItem.sourceId);
          if (cancelled) return;
          setPortalThread(detail.thread);
          setPortalMessages(detail.messages || []);
          if (selectedItem.unread) {
            await markStaffPatientMessageThreadRead(session.tenantId, session.accessToken, selectedItem.sourceId);
          }
        } else if (selectedItem.source === 'mail') {
          const detail = await fetchMessageThread(session.tenantId, session.accessToken, selectedItem.sourceId);
          if (cancelled) return;
          setMailMessages(detail.messages || []);
          if (selectedItem.unread) {
            await markThreadAsRead(session.tenantId, session.accessToken, selectedItem.sourceId);
          }
        }
      } catch (err: any) {
        showError(err.message || 'Failed to load inbox item details');
      }
    }

    loadDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedItem, session, showError]);

  const reloadAfterAction = async () => {
    await refreshInbox();
  };

  const createFollowUpTaskForItem = async (item: ClinicalInboxItem) => {
    if (!session) return;
    await createTask(session.tenantId, session.accessToken, {
      title: `Follow up: ${item.title}`,
      description: `${SOURCE_LABELS[item.source]} item: ${item.summary}`,
      category: item.queue === 'results' ? 'lab-path-followup' : item.queue === 'rx' ? 'prescription' : 'patient-followup',
      priority: item.priority === 'critical' ? 'urgent' : item.priority,
      status: 'todo',
      patientId: item.patientId,
      dueDate: todayIsoDate(),
    });
  };

  const handleCreateTask = async () => {
    if (!session || !selectedItem) return;
    setActionBusy(true);
    try {
      await createFollowUpTaskForItem(selectedItem);
      showSuccess('Follow-up task created');
      await reloadAfterAction();
    } catch (err: any) {
      showError(err.message || 'Failed to create follow-up task');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePrimaryAction = async () => {
    if (!session || !selectedItem) return;
    setActionBusy(true);
    try {
      if (selectedItem.source === 'task') {
        await updateTaskStatus(session.tenantId, session.accessToken, selectedItem.sourceId, 'completed');
        showSuccess('Task completed');
      } else if (selectedItem.source === 'order') {
        await updateOrderStatus(session.tenantId, session.accessToken, selectedItem.sourceId, 'completed');
        showSuccess('Order completed');
      } else if (selectedItem.source === 'refill') {
        await approveRefillRequest(session.tenantId, session.accessToken, selectedItem.sourceId);
        showSuccess('Refill approved');
      } else if (selectedItem.source === 'fax') {
        await updateFax(session.tenantId, session.accessToken, selectedItem.sourceId, { read: true });
        showSuccess('Fax marked read');
      } else if (selectedItem.source === 'sms') {
        await markSMSConversationRead(session.tenantId, session.accessToken, selectedItem.sourceId);
        showSuccess('Text conversation marked read');
      } else if (selectedItem.source === 'portal') {
        await updateStaffPatientMessageThread(session.tenantId, session.accessToken, selectedItem.sourceId, { status: 'in-progress' });
        showSuccess('Portal thread moved to in progress');
      } else if (selectedItem.source === 'pathology') {
        await createFollowUpTaskForItem(selectedItem);
        showSuccess('Follow-up task created');
      } else {
        navigate(selectedItem.route);
      }
      await reloadAfterAction();
    } catch (err: any) {
      showError(err.message || 'Failed to update inbox item');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSendReply = async () => {
    if (!session || !selectedItem || !replyText.trim()) return;
    setActionBusy(true);
    try {
      if (selectedItem.source === 'portal') {
        await sendStaffPatientMessageThreadMessage(
          session.tenantId,
          session.accessToken,
          selectedItem.sourceId,
          replyText.trim(),
          internalNote
        );
      } else if (selectedItem.source === 'mail') {
        await sendThreadMessage(session.tenantId, session.accessToken, selectedItem.sourceId, replyText.trim());
      }
      setReplyText('');
      setInternalNote(false);
      showSuccess(internalNote ? 'Internal note added' : 'Reply sent');
      await reloadAfterAction();
    } catch (err: any) {
      showError(err.message || 'Failed to send reply');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePortalThreadUpdate = async (updates: { status?: string; priority?: string }) => {
    if (!session || !selectedItem || selectedItem.source !== 'portal') return;
    setActionBusy(true);
    try {
      await updateStaffPatientMessageThread(session.tenantId, session.accessToken, selectedItem.sourceId, updates);
      showSuccess('Thread updated');
      await reloadAfterAction();
    } catch (err: any) {
      showError(err.message || 'Failed to update thread');
    } finally {
      setActionBusy(false);
    }
  };

  if (!session) {
    return (
      <div className="clinical-inbox-page">
        <div className="clinical-inbox-empty">
          <Inbox size={36} />
          <h1>Clinical Inbox</h1>
          <p>Sign in to view clinical work.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="clinical-inbox-page">
      <section className="clinical-inbox-hero">
        <div>
          <span className="clinical-inbox-eyebrow">Patient-linked work queue</span>
          <h1>Clinical Inbox</h1>
          <p>Portal messages, texts, mail, refills, orders, tasks, faxes, and pathology safety items in one accountable queue.</p>
        </div>
        <button type="button" className="clinical-inbox-refresh" onClick={refreshInbox} disabled={loading}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </section>

      <section className="clinical-inbox-stats" aria-label="Clinical inbox summary">
        <div className="clinical-inbox-stat">
          <Inbox size={20} />
          <span>Total open</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="clinical-inbox-stat priority">
          <AlertTriangle size={20} />
          <span>Critical / urgent</span>
          <strong>{summary.critical}</strong>
        </div>
        <div className="clinical-inbox-stat">
          <MessageSquare size={20} />
          <span>Unread</span>
          <strong>{summary.unread}</strong>
        </div>
        <div className="clinical-inbox-stat">
          <Clock3 size={20} />
          <span>Due now</span>
          <strong>{summary.overdue}</strong>
        </div>
        <div className="clinical-inbox-stat">
          <Pill size={20} />
          <span>Rx / ePA</span>
          <strong>{summary.rx}</strong>
        </div>
        <div className="clinical-inbox-stat">
          <Stethoscope size={20} />
          <span>Results</span>
          <strong>{summary.results}</strong>
        </div>
      </section>

      {warnings.length > 0 && (
        <div className="clinical-inbox-warning" role="status">
          <AlertTriangle size={18} />
          Some sources could not be loaded: {warnings.join(', ')}.
        </div>
      )}

      <section className="clinical-inbox-shell">
        <aside className="clinical-inbox-list-panel" aria-label="Clinical inbox work list">
          <div className="clinical-inbox-toolbar">
            <div className="clinical-inbox-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient, MRN, item, status"
                aria-label="Search clinical inbox"
              />
            </div>
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as 'all' | InboxPriority)}
              aria-label="Filter by priority"
            >
              <option value="all">All priorities</option>
              <option value="critical">Critical</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="clinical-inbox-tabs" role="tablist" aria-label="Clinical inbox queues">
            {(Object.keys(QUEUE_LABELS) as InboxQueue[]).map((queue) => (
              <button
                key={queue}
                type="button"
                className={activeQueue === queue ? 'active' : ''}
                onClick={() => setActiveQueue(queue)}
                aria-pressed={activeQueue === queue}
              >
                {QUEUE_LABELS[queue]}
                <span>{queueCounts[queue]}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="clinical-inbox-loading">
              {[1, 2, 3, 4, 5].map((key) => <Skeleton key={key} height={92} />)}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="clinical-inbox-empty compact">
              <CheckCircle2 size={28} />
              <h2>No open work here</h2>
              <p>Try another queue or clear the filters.</p>
            </div>
          ) : (
            <div className="clinical-inbox-items">
              {filteredItems.map((item) => {
                const Icon = SOURCE_ICONS[item.source];
                const active = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`clinical-inbox-item ${active ? 'active' : ''} ${item.unread ? 'unread' : ''}`}
                    onClick={() => selectItem(item)}
                  >
                    <span className={`clinical-inbox-source ${item.source}`}>
                      <Icon size={16} />
                      {SOURCE_LABELS[item.source]}
                    </span>
                    <span className={`clinical-inbox-priority ${item.priority}`}>{item.priority}</span>
                    <strong>{item.title}</strong>
                    <span className="clinical-inbox-item-meta">
                      {item.patientName || 'No patient linked'}
                      {item.patientMrn ? ` | MRN ${item.patientMrn}` : ''}
                    </span>
                    <span className="clinical-inbox-item-summary">{item.summary}</span>
                    <span className="clinical-inbox-item-footer">
                      <span>{item.status}</span>
                      <span>{item.dueAt ? `Due ${formatDateTime(item.dueAt)}` : formatAge(item.updatedAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <main className="clinical-inbox-detail-panel" aria-label="Clinical inbox selected item">
          {!selectedItem ? (
            <div className="clinical-inbox-empty">
              <Inbox size={36} />
              <h2>No item selected</h2>
              <p>The selected work item will appear here.</p>
            </div>
          ) : (
            <>
              <div className="clinical-inbox-detail-header">
                <div>
                  <span className={`clinical-inbox-source ${selectedItem.source}`}>
                    {SOURCE_LABELS[selectedItem.source]}
                  </span>
                  <h2>{selectedItem.title}</h2>
                  <p>{selectedItem.patientName || 'No patient linked'}{selectedItem.patientMrn ? ` | MRN ${selectedItem.patientMrn}` : ''}</p>
                </div>
                <span className={`clinical-inbox-priority ${selectedItem.priority}`}>{selectedItem.priority}</span>
              </div>

              <div className="clinical-inbox-detail-grid">
                <div>
                  <span>Status</span>
                  <strong>{selectedItem.status}</strong>
                </div>
                <div>
                  <span>Owner</span>
                  <strong>{selectedItem.ownerName || 'Unassigned'}</strong>
                </div>
                <div>
                  <span>Activity</span>
                  <strong>{formatDateTime(selectedItem.updatedAt || selectedItem.dueAt)}</strong>
                </div>
              </div>

              <div className="clinical-inbox-detail-summary">
                <h3>What needs attention</h3>
                <p>{selectedItem.summary}</p>
              </div>

              {selectedItem.source === 'portal' && (
                <div className="clinical-inbox-thread">
                  <div className="clinical-inbox-inline-controls">
                    <label>
                      Status
                      <select
                        value={portalThread?.status || selectedItem.status}
                        onChange={(event) => handlePortalThreadUpdate({ status: event.target.value })}
                        disabled={actionBusy}
                      >
                        <option value="open">Open</option>
                        <option value="in-progress">In Progress</option>
                        <option value="waiting-patient">Waiting Patient</option>
                        <option value="waiting-provider">Waiting Provider</option>
                        <option value="closed">Closed</option>
                      </select>
                    </label>
                    <label>
                      Priority
                      <select
                        value={portalThread?.priority || selectedItem.priority}
                        onChange={(event) => handlePortalThreadUpdate({ priority: event.target.value })}
                        disabled={actionBusy}
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </label>
                  </div>
                  <MessageTimeline messages={portalMessages.map((message) => ({
                    id: message.id,
                    author: message.senderName || message.senderType,
                    text: message.messageText,
                    date: message.sentAt,
                    internal: message.isInternalNote,
                  }))} />
                  <ReplyBox
                    value={replyText}
                    onChange={setReplyText}
                    onSend={handleSendReply}
                    disabled={actionBusy}
                    allowInternalNote
                    internalNote={internalNote}
                    onInternalNoteChange={setInternalNote}
                  />
                </div>
              )}

              {selectedItem.source === 'mail' && (
                <div className="clinical-inbox-thread">
                  <MessageTimeline messages={mailMessages.map((message) => ({
                    id: message.id,
                    author: normalizeName(message.senderFirstName, message.senderLastName) || message.sender,
                    text: message.body,
                    date: message.createdAt,
                  }))} />
                  <ReplyBox
                    value={replyText}
                    onChange={setReplyText}
                    onSend={handleSendReply}
                    disabled={actionBusy}
                  />
                </div>
              )}

              <div className="clinical-inbox-actions">
                <button type="button" className="primary" onClick={handlePrimaryAction} disabled={actionBusy}>
                  {selectedItem.source === 'portal' || selectedItem.source === 'mail' ? <MessageSquare size={16} /> : <CheckCircle2 size={16} />}
                  {selectedItem.actionLabel}
                </button>
                <button type="button" onClick={handleCreateTask} disabled={actionBusy}>
                  <ClipboardCheck size={16} />
                  Create task
                </button>
                {selectedItem.patientId && (
                  <button type="button" onClick={() => navigate(`/patients/${selectedItem.patientId}`)}>
                    <Stethoscope size={16} />
                    Patient chart
                  </button>
                )}
                <button type="button" onClick={() => navigate(selectedItem.route)}>
                  <ArrowRight size={16} />
                  Open source
                </button>
              </div>
            </>
          )}
        </main>
      </section>
    </div>
  );
}

function MessageTimeline({
  messages,
}: {
  messages: Array<{ id: string; author?: string; text?: string; date?: string; internal?: boolean }>;
}) {
  if (messages.length === 0) {
    return (
      <div className="clinical-inbox-empty compact">
        <MessageSquare size={24} />
        <p>No messages loaded yet.</p>
      </div>
    );
  }

  return (
    <div className="clinical-inbox-message-list">
      {messages.map((message) => (
        <article key={message.id} className={message.internal ? 'internal' : ''}>
          <header>
            <strong>{message.author || 'Unknown'}</strong>
            <span>{formatDateTime(message.date)}</span>
          </header>
          <p>{message.text}</p>
        </article>
      ))}
    </div>
  );
}

function ReplyBox({
  value,
  onChange,
  onSend,
  disabled,
  allowInternalNote,
  internalNote,
  onInternalNoteChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  allowInternalNote?: boolean;
  internalNote?: boolean;
  onInternalNoteChange?: (value: boolean) => void;
}) {
  return (
    <div className="clinical-inbox-reply-box">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Write the reply or internal note..."
        rows={4}
      />
      <div>
        {allowInternalNote && (
          <label className="clinical-inbox-check">
            <input
              type="checkbox"
              checked={Boolean(internalNote)}
              onChange={(event) => onInternalNoteChange?.(event.target.checked)}
            />
            Internal note
          </label>
        )}
        <button type="button" className="primary" onClick={onSend} disabled={disabled || !value.trim()}>
          <Send size={16} />
          Send
        </button>
      </div>
    </div>
  );
}
