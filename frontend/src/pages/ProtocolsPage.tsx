import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertTriangle,
  BookOpenCheck,
  ClipboardCheck,
  FileText,
  FlaskConical,
  GitBranch,
  Pill,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Workflow,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchProtocols, fetchProtocolStats, deleteProtocol } from '../api';
import type { Protocol, ProtocolStats, ProtocolCategory, ProtocolStatus } from '../types/protocol';
import { EmptyState } from '../components/ui/EmptyState';
import { ProtocolDetailsModal } from '../components/protocols/ProtocolDetailsModal';
import { CreateProtocolModal } from '../components/protocols/CreateProtocolModal';

type CategoryFilter = ProtocolCategory | 'all';
type StatusFilter = ProtocolStatus | 'all';

interface CategoryMeta {
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
  background: string;
  icon: LucideIcon;
}

interface ProtocolSignal {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

const CATEGORY_OPTIONS: CategoryFilter[] = ['all', 'medical', 'procedure', 'cosmetic', 'administrative'];
const STATUS_OPTIONS: StatusFilter[] = ['active', 'draft', 'archived', 'all'];
const EMPTY_CATEGORY_COUNTS: Record<ProtocolCategory, number> = {
  medical: 0,
  procedure: 0,
  cosmetic: 0,
  administrative: 0,
};

const CATEGORY_META: Record<ProtocolCategory, CategoryMeta> = {
  medical: {
    label: 'Medical Dermatology',
    shortLabel: 'Medical',
    description: 'Acne, biologics, eczema, psoriasis, chronic therapy, and surveillance pathways.',
    accent: '#0369a1',
    background: '#eff6ff',
    icon: Stethoscope,
  },
  procedure: {
    label: 'Procedures',
    shortLabel: 'Procedures',
    description: 'Biopsy, cryotherapy, injections, wound care, excisions, and postop pathways.',
    accent: '#7c3aed',
    background: '#f5f3ff',
    icon: ClipboardCheck,
  },
  cosmetic: {
    label: 'Cosmetic',
    shortLabel: 'Cosmetic',
    description: 'Cosmetic consults, injectables, lasers, skincare plans, and package follow-up.',
    accent: '#be185d',
    background: '#fdf2f8',
    icon: Sparkles,
  },
  administrative: {
    label: 'Administrative',
    shortLabel: 'Admin',
    description: 'Internal workflows, intake rules, staff scripts, approvals, and governance.',
    accent: '#475569',
    background: '#f8fafc',
    icon: ShieldCheck,
  },
};

const STATUS_LABELS: Record<StatusFilter, string> = {
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
  all: 'All statuses',
};

const SIGNALS: Record<string, ProtocolSignal> = {
  notes: { id: 'notes', label: 'Notes', path: '/notes', icon: FileText },
  rx: { id: 'rx', label: 'Rx / ePA', path: '/rx', icon: Pill },
  labs: { id: 'labs', label: 'Labs / Path', path: '/labs', icon: FlaskConical },
  handouts: { id: 'handouts', label: 'Handouts', path: '/handouts', icon: BookOpenCheck },
  recalls: { id: 'recalls', label: 'Recalls', path: '/reminders?tab=due', icon: Activity },
  registry: { id: 'registry', label: 'Registry', path: '/reminders?tab=registry', icon: GitBranch },
};

const CARE_PATHWAY_STAGES = [
  {
    label: 'Trigger',
    detail: 'Encounter, diagnosis, registry gap, or lab-risk signal',
    icon: Activity,
  },
  {
    label: 'Pathway',
    detail: 'Evidence-based steps with review and override tracking',
    icon: GitBranch,
  },
  {
    label: 'Orders',
    detail: 'Medication, lab, procedure, referral, and task outputs',
    icon: ClipboardCheck,
  },
  {
    label: 'Education',
    detail: 'Patient handouts and after-visit instructions',
    icon: BookOpenCheck,
  },
  {
    label: 'Follow-up',
    detail: 'Recall, registry, and monitoring cadence',
    icon: Workflow,
  },
];

const GOVERNANCE_ITEMS = [
  'Published source or internal owner',
  'Last reviewed and versioned',
  'Contraindications and stop conditions',
  'Required clinician confirmation',
  'Override reason when skipped',
];

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function formatPercent(numerator: number, denominator: number): string {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function isCategoryFilter(value: string | null): value is CategoryFilter {
  return Boolean(value && CATEGORY_OPTIONS.includes(value as CategoryFilter));
}

function isStatusFilter(value: string | null): value is StatusFilter {
  return Boolean(value && STATUS_OPTIONS.includes(value as StatusFilter));
}

function getInitialCategory(searchParams: URLSearchParams): CategoryFilter {
  const category = searchParams.get('category');
  if (isCategoryFilter(category)) return category;

  const legacyType = searchParams.get('type');
  if (legacyType === 'clinical') return 'medical';
  if (legacyType === 'admin') return 'administrative';

  return 'all';
}

function getInitialStatus(searchParams: URLSearchParams): StatusFilter {
  const status = searchParams.get('status');
  return isStatusFilter(status) ? status : 'active';
}

function getProtocolText(protocol: Protocol): string {
  return `${protocol.name} ${protocol.type} ${protocol.description || ''} ${protocol.indication || ''}`.toLowerCase();
}

function getProtocolSignals(protocol: Protocol): ProtocolSignal[] {
  const text = getProtocolText(protocol);
  const signalIds = new Set<string>(['notes']);

  if (/acne|isotretinoin|biologic|psoriasis|eczema|atopic|methotrexate|treatment|medication|therapy|pre-biologic/.test(text)) {
    signalIds.add('rx');
  }
  if (/lab|path|biopsy|biologic|isotretinoin|methotrexate|monitor|quantiferon|hepatitis|pregnancy/.test(text)) {
    signalIds.add('labs');
  }
  if (/handout|instruction|wound|post|education|aftercare|consent|patient/.test(text) || protocol.category !== 'administrative') {
    signalIds.add('handouts');
  }
  if (/follow|surveillance|monitor|recall|melanoma|annual|monthly|post-procedure/.test(text)) {
    signalIds.add('recalls');
  }
  if (/melanoma|psoriasis|isotretinoin|chronic|biologic|registry/.test(text)) {
    signalIds.add('registry');
  }

  return Array.from(signalIds).map((id) => SIGNALS[id]);
}

function getProtocolRiskLabel(protocol: Protocol): string {
  const text = getProtocolText(protocol);
  if (/isotretinoin|biologic|methotrexate|melanoma|contraindication|pregnancy|tb|hepatitis/.test(text)) {
    return 'High-control';
  }
  if (/procedure|biopsy|cryotherapy|injection|excision|laser/.test(text)) {
    return 'Procedure';
  }
  return 'Standard';
}

function getProtocolReadiness(protocol: Protocol): string {
  const steps = toNumber(protocol.step_count);
  const apps = toNumber(protocol.active_applications);
  if (apps > 0) return 'In use';
  if (steps >= 4) return 'Ready';
  return 'Needs buildout';
}

function countProtocolsByCategory(protocols: Protocol[]): Record<ProtocolCategory, number> {
  return protocols.reduce<Record<ProtocolCategory, number>>(
    (acc, protocol) => {
      acc[protocol.category] += 1;
      return acc;
    },
    { ...EMPTY_CATEGORY_COUNTS }
  );
}

function normalizeCategoryCounts(
  counts?: Partial<Record<ProtocolCategory, number | string>>
): Record<ProtocolCategory, number> {
  return CATEGORY_OPTIONS.reduce<Record<ProtocolCategory, number>>(
    (acc, category) => {
      if (category !== 'all') {
        acc[category] = toNumber(counts?.[category]);
      }
      return acc;
    },
    { ...EMPTY_CATEGORY_COUNTS }
  );
}

function updateUrlFilter(
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  updates: Partial<{ category: CategoryFilter; status: StatusFilter; search: string }>
) {
  const params = new URLSearchParams(searchParams);

  if (updates.category !== undefined) {
    if (updates.category === 'all') {
      params.delete('category');
      params.delete('type');
    } else {
      params.set('category', updates.category);
      params.delete('type');
    }
  }

  if (updates.status !== undefined) {
    if (updates.status === 'active') {
      params.delete('status');
    } else {
      params.set('status', updates.status);
    }
  }

  if (updates.search !== undefined) {
    if (updates.search.trim()) {
      params.set('search', updates.search.trim());
    } else {
      params.delete('search');
    }
  }

  setSearchParams(params, { replace: true });
}

export function ProtocolsPage() {
  const { session } = useAuth();
  const tenantId = session?.tenantId;
  const accessToken = session?.accessToken;
  const [searchParams, setSearchParams] = useSearchParams();
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>(() => getInitialCategory(searchParams));
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>(() => getInitialStatus(searchParams));
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    const category = getInitialCategory(searchParams);
    const status = getInitialStatus(searchParams);
    const search = searchParams.get('search') || '';

    if (category !== selectedCategory) setSelectedCategory(category);
    if (status !== selectedStatus) setSelectedStatus(status);
    if (search !== searchQuery) setSearchQuery(search);
  }, [searchParams, searchQuery, selectedCategory, selectedStatus]);

  useEffect(() => {
    loadProtocols();
    loadStats();
  }, [selectedCategory, selectedStatus, searchQuery]);

  async function loadProtocols() {
    if (!tenantId || !accessToken) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (selectedStatus !== 'all') params.status = selectedStatus;
      if (selectedCategory !== 'all') params.category = selectedCategory;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const response = await fetchProtocols(tenantId, accessToken, params);
      setProtocols(response.data || []);
    } catch (error) {
      console.error('Failed to load protocols:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    if (!tenantId || !accessToken) return;
    try {
      const response = await fetchProtocolStats(tenantId, accessToken);
      setStats(response);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async function handleDelete(protocolId: string) {
    if (!tenantId || !accessToken) return;
    if (!confirm('Are you sure you want to delete this protocol?')) return;

    try {
      await deleteProtocol(tenantId, accessToken, protocolId);
      loadProtocols();
      loadStats();
    } catch (error) {
      console.error('Failed to delete protocol:', error);
      alert('Failed to delete protocol');
    }
  }

  function handleCategoryChange(category: CategoryFilter) {
    setSelectedCategory(category);
    updateUrlFilter(searchParams, setSearchParams, { category });
  }

  function handleStatusChange(status: StatusFilter) {
    setSelectedStatus(status);
    updateUrlFilter(searchParams, setSearchParams, { status });
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    updateUrlFilter(searchParams, setSearchParams, { search: value });
  }

  const visibleCategoryCounts = useMemo(() => countProtocolsByCategory(protocols), [protocols]);
  const categoryCounts = useMemo(() => {
    const summaryCounts = stats?.category_counts?.[selectedStatus];
    return summaryCounts ? normalizeCategoryCounts(summaryCounts) : visibleCategoryCounts;
  }, [selectedStatus, stats, visibleCategoryCounts]);

  const librarySignals = useMemo(() => {
    const counts = new Map<string, { signal: ProtocolSignal; count: number }>();
    protocols.forEach((protocol) => {
      getProtocolSignals(protocol).forEach((signal) => {
        const existing = counts.get(signal.id);
        counts.set(signal.id, {
          signal,
          count: existing ? existing.count + 1 : 1,
        });
      });
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [protocols]);

  const featuredProtocols = useMemo(() => {
    return [...protocols]
      .sort((a, b) => {
        const appDelta = toNumber(b.active_applications) - toNumber(a.active_applications);
        if (appDelta !== 0) return appDelta;
        return toNumber(b.step_count) - toNumber(a.step_count);
      })
      .slice(0, 4);
  }, [protocols]);

  const totalProtocols = toNumber(stats?.total_protocols ?? protocols.length);
  const activeProtocols = toNumber(stats?.active_protocols ?? protocols.filter((p) => p.status === 'active').length);
  const totalApplications = toNumber(stats?.total_applications);
  const activeApplications = toNumber(stats?.active_applications);
  const completedApplications = toNumber(stats?.completed_applications);
  const totalSteps = protocols.reduce((sum, protocol) => sum + toNumber(protocol.step_count), 0);
  const completionRate = formatPercent(completedApplications, totalApplications);

  return (
    <div className="protocols-workspace">
      <section className="protocols-command-band">
        <div>
          <div className="eyebrow">Clinical Decision Support</div>
          <h1>Care Pathways & Protocols</h1>
          <p className="muted">
            Standardize repeatable dermatology workflows while keeping clinician review, exceptions, and follow-up visible.
          </p>
        </div>
        <div className="protocols-header-actions">
          <Link className="btn-secondary" to="/patients">
            <ClipboardCheck size={16} />
            Apply from Chart
          </Link>
          <button type="button" className="ghost" onClick={() => setShowCreateModal(true)}>
            Import / Build
          </button>
          <button type="button" onClick={() => setShowCreateModal(true)}>
            New Pathway
          </button>
        </div>
      </section>

      <section className="protocols-kpi-grid" aria-label="Protocol performance">
        <MetricCard icon={GitBranch} label="Total pathways" value={totalProtocols} detail={`${activeProtocols} active`} tone="blue" />
        <MetricCard icon={Workflow} label="Active patient pathways" value={activeApplications} detail={`${totalApplications} total applications`} tone="violet" />
        <MetricCard icon={ClipboardCheck} label="Completed pathways" value={completedApplications} detail={`${completionRate} completion rate`} tone="green" />
        <MetricCard icon={FileText} label="Visible steps" value={totalSteps} detail={`${protocols.length} pathways in current view`} tone="amber" />
      </section>

      <section className="protocol-flow-strip" aria-label="Care pathway flow">
        {CARE_PATHWAY_STAGES.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <div className="protocol-flow-step" key={stage.label}>
              <div className="protocol-flow-index">{index + 1}</div>
              <Icon size={18} />
              <div>
                <strong>{stage.label}</strong>
                <span>{stage.detail}</span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="protocols-filter-bar">
        <label className="protocol-search-field">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search pathways, indications, medications, or monitoring..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </label>
        <div className="protocol-filter-group" aria-label="Category filter">
          {CATEGORY_OPTIONS.map((category) => {
            const active = selectedCategory === category;
            const label = category === 'all' ? 'All' : CATEGORY_META[category].shortLabel;
            return (
              <button
                type="button"
                key={category}
                className={active ? 'protocol-filter-pill active' : 'protocol-filter-pill'}
                onClick={() => handleCategoryChange(category)}
              >
                {label}
                {category !== 'all' && <span>{categoryCounts[category]}</span>}
              </button>
            );
          })}
        </div>
        <select
          value={selectedStatus}
          onChange={(e) => handleStatusChange(e.target.value as StatusFilter)}
          aria-label="Protocol status"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </section>

      <section className="protocols-workspace-grid">
        <div className="protocols-main-column">
          <div className="protocols-section-heading">
            <div>
              <h2>Pathway Library</h2>
              <p className="muted">Active clinical pathways with connected notes, orders, handouts, recalls, and registry touchpoints.</p>
            </div>
            <span className="protocol-count">{protocols.length} shown</span>
          </div>

          {loading ? (
            <div className="protocol-loading">Loading care pathways...</div>
          ) : protocols.length === 0 ? (
            <EmptyState
              title="No protocols found"
              description={
                searchQuery || selectedCategory !== 'all' || selectedStatus !== 'active'
                  ? 'Try adjusting the category, status, or search filters.'
                  : 'Create care pathways to standardize orders, patient education, recalls, and monitoring.'
              }
            />
          ) : (
            <div className="care-pathway-list">
              {protocols.map((protocol) => (
                <ProtocolCard
                  key={protocol.id}
                  protocol={protocol}
                  onView={() => setSelectedProtocol(protocol)}
                  onDelete={() => handleDelete(protocol.id)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="protocols-side-column">
          <section className="protocol-side-panel">
            <div className="protocols-section-heading compact">
              <div>
                <h2>Connected Outputs</h2>
                <p className="muted">Where the selected pathways naturally feed.</p>
              </div>
            </div>
            <div className="protocol-signal-list">
              {librarySignals.length === 0 ? (
                <div className="muted">No connected outputs in the current view.</div>
              ) : (
                librarySignals.map(({ signal, count }) => {
                  const Icon = signal.icon;
                  return (
                    <Link className="protocol-signal-row" to={signal.path} key={signal.id}>
                      <Icon size={17} />
                      <span>{signal.label}</span>
                      <strong>{count}</strong>
                    </Link>
                  );
                })
              )}
            </div>
          </section>

          <section className="protocol-side-panel">
            <div className="protocols-section-heading compact">
              <div>
                <h2>Priority Pathways</h2>
                <p className="muted">The high-value protocols to keep polished first.</p>
              </div>
            </div>
            <div className="priority-pathway-stack">
              {(featuredProtocols.length > 0 ? featuredProtocols : []).map((protocol) => (
                <button
                  type="button"
                  className="priority-pathway"
                  key={protocol.id}
                  onClick={() => setSelectedProtocol(protocol)}
                >
                  <span>{protocol.name}</span>
                  <small>{getProtocolRiskLabel(protocol)} · {toNumber(protocol.step_count)} steps</small>
                </button>
              ))}
              {featuredProtocols.length === 0 && (
                <div className="priority-pathway placeholder">
                  <span>Isotretinoin, biologics, biopsy, melanoma surveillance, phototherapy</span>
                  <small>Create or import these first.</small>
                </div>
              )}
            </div>
          </section>

          <section className="protocol-side-panel">
            <div className="protocols-section-heading compact">
              <div>
                <h2>Governance</h2>
                <p className="muted">Keep protocols clinically defensible and auditable.</p>
              </div>
              <ShieldCheck size={20} />
            </div>
            <ul className="protocol-governance-list">
              {GOVERNANCE_ITEMS.map((item) => (
                <li key={item}>
                  <ClipboardCheck size={15} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </section>

      {selectedProtocol && (
        <ProtocolDetailsModal
          protocolId={selectedProtocol.id}
          onClose={() => {
            setSelectedProtocol(null);
            loadProtocols();
            loadStats();
          }}
        />
      )}

      {showCreateModal && (
        <CreateProtocolModal
          onClose={() => {
            setShowCreateModal(false);
            loadProtocols();
            loadStats();
          }}
        />
      )}
    </div>
  );
}

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  detail: string;
  tone: 'blue' | 'violet' | 'green' | 'amber';
}

function MetricCard({ icon: Icon, label, value, detail, tone }: MetricCardProps) {
  return (
    <div className={`protocol-metric-card ${tone}`}>
      <div className="protocol-metric-icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

interface ProtocolCardProps {
  protocol: Protocol;
  onView: () => void;
  onDelete: () => void;
}

function ProtocolCard({ protocol, onView, onDelete }: ProtocolCardProps) {
  const meta = CATEGORY_META[protocol.category];
  const Icon = meta.icon;
  const signals = getProtocolSignals(protocol);
  const readiness = getProtocolReadiness(protocol);
  const riskLabel = getProtocolRiskLabel(protocol);

  return (
    <article
      className="care-pathway-card"
      style={
        {
          '--pathway-accent': meta.accent,
          '--pathway-bg': meta.background,
        } as CSSProperties
      }
    >
      <div className="care-pathway-main">
        <div className="care-pathway-icon">
          <Icon size={20} />
        </div>
        <div>
          <div className="care-pathway-title-row">
            <h3>{protocol.name}</h3>
            <span className="pathway-category-pill">{meta.shortLabel}</span>
            <span className={`pathway-status-pill ${protocol.status}`}>{STATUS_LABELS[protocol.status]}</span>
          </div>
          {protocol.description && <p>{protocol.description}</p>}
          <div className="care-pathway-meta">
            <span>{toNumber(protocol.step_count)} steps</span>
            <span>{toNumber(protocol.active_applications)} active patients</span>
            <span>v{protocol.version}</span>
            <span>{readiness}</span>
            <span>{riskLabel}</span>
          </div>
          {protocol.indication && (
            <div className="care-pathway-indication">
              <strong>Indication</strong>
              <span>{protocol.indication}</span>
            </div>
          )}
          {protocol.contraindications && (
            <div className="care-pathway-warning">
              <AlertTriangle size={15} />
              <span>{protocol.contraindications}</span>
            </div>
          )}
        </div>
      </div>
      <div className="care-pathway-actions">
        <div className="pathway-signal-chips">
          {signals.map((signal) => {
            const SignalIcon = signal.icon;
            return (
              <Link to={signal.path} className="pathway-signal-chip" key={signal.id}>
                <SignalIcon size={14} />
                {signal.label}
              </Link>
            );
          })}
        </div>
        <div className="pathway-button-row">
          <button type="button" className="btn-sm btn-primary" onClick={onView}>
            Open Pathway
          </button>
          <button type="button" className="btn-sm btn-secondary" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
