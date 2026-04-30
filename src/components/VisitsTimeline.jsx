import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoadingInline } from './LoadingSpinner';

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  return '';
};

const VISIT_TYPE_OPTIONS = [
  { value: 'chiropractic', label: 'Chiropractic' },
  { value: 'physical_therapy', label: 'Physical Therapy' },
  { value: 'orthopedic', label: 'Orthopedic' },
  { value: 'neurology', label: 'Neurology' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'pain_management', label: 'Pain Management' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'other', label: 'Other' },
];

function formatISODate(iso) {
  if (!iso) return '—';
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  return s;
}

function truncate(str, max = 120) {
  const s = String(str || '').trim();
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function toTitleCaseLabel(value) {
  const s = String(value || '').trim();
  if (!s) return '—';
  return s
    .replace(/_/g, ' ')
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function badgeForVisitType(type) {
  const t = String(type || '');
  if (!t) return 'bg-gray-100 text-gray-700 border-gray-200';
  if (t === 'imaging') return 'bg-lime-100 text-lime-900 border-lime-200';
  if (t === 'emergency') return 'bg-red-100 text-red-800 border-red-200';
  if (t === 'pain_management') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

export default function VisitsTimeline({
  caseId,
  redFlags,
  apiPrefix = '/api',
  token: tokenOverride,
}) {
  const { token } = useAuth();
  const base = getBaseUrl();
  const authToken = tokenOverride || token;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [visits, setVisits] = useState([]);
  const [totals, setTotals] = useState({ totalBilled: 0, totalReceived: 0 });

  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [timeline, setTimeline] = useState(null);

  const [providers, setProviders] = useState([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // create | edit
  const [editingVisitId, setEditingVisitId] = useState(null);
  const [autoDetectedBanner, setAutoDetectedBanner] = useState('');

  const [form, setForm] = useState({
    visit_date: '',
    visit_type: 'follow_up',
    provider_id: '',
    provider_name_override: '',
    diagnosis_summary: '',
    billed_amount: '',
    notes: '',
    record_received: false,
    bill_received: false,
  });

  const [billingDraftLines, setBillingDraftLines] = useState([]);

  const fileInputRef = useRef(null);

  const fetchProviders = useCallback(async () => {
    if (!authToken) return;
    setProvidersLoading(true);
    setProvidersError('');
    try {
      const res = await fetch(`${base}${apiPrefix}/providers`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load providers');
      setProviders(Array.isArray(data.providers) ? data.providers : []);
    } catch (e) {
      // Provider dropdown is optional; allow free-text override if this fails.
      setProviders([]);
      setProvidersError(e.message || 'Could not load providers');
    } finally {
      setProvidersLoading(false);
    }
  }, [authToken, base, apiPrefix]);

  const fetchVisits = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${base}${apiPrefix}/cases/${caseId}/medical-visits?status=all&sort=date`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load medical visits');
      setVisits(Array.isArray(data.visits) ? data.visits : []);
      setTotals({
        totalBilled: Number(data.totalBilled || 0),
        totalReceived: Number(data.totalReceived || 0),
      });
    } catch (e) {
      setError(e.message || 'Failed to load medical visits');
    } finally {
      setLoading(false);
    }
  }, [authToken, caseId, base, apiPrefix]);

  const fetchTimeline = useCallback(async () => {
    if (!authToken) return;
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const res = await fetch(`${base}${apiPrefix}/cases/${caseId}/treatment-timeline`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load treatment timeline');
      setTimeline(data || null);
    } catch (e) {
      setTimelineError(e.message || 'Failed to load treatment timeline');
      setTimeline(null);
    } finally {
      setTimelineLoading(false);
    }
  }, [authToken, caseId, base, apiPrefix]);

  const fetchBillingDraftLines = useCallback(async () => {
    if (!authToken || apiPrefix !== '/api') {
      setBillingDraftLines([]);
      return;
    }
    try {
      const res = await fetch(`${base}/api/cases/${caseId}/billing-lines?status=draft`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setBillingDraftLines(Array.isArray(data.billing_lines) ? data.billing_lines : []);
    } catch {
      setBillingDraftLines([]);
    }
  }, [authToken, base, caseId, apiPrefix]);

  useEffect(() => {
    fetchVisits();
    fetchTimeline();
    fetchBillingDraftLines();
  }, [fetchVisits, fetchTimeline, fetchBillingDraftLines]);

  const approveAndImportBilling = async (row) => {
    try {
      const patch = await fetch(`${base}/api/billing-lines/${row.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ case_id: caseId, status: 'approved' }),
      });
      const pData = await patch.json().catch(() => ({}));
      if (!patch.ok) throw new Error(pData.error || 'Approve failed');
      const imp = await fetch(`${base}/api/cases/${caseId}/billing-lines/${row.id}/import-to-visit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const iData = await imp.json().catch(() => ({}));
      if (!imp.ok) throw new Error(iData.error || iData.message || 'Import failed');
      await fetchVisits();
      await fetchTimeline();
      await fetchBillingDraftLines();
    } catch (e) {
      alert(e.message || 'Failed');
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingVisitId(null);
    setAutoDetectedBanner('');
    setForm({
      visit_date: '',
      visit_type: 'follow_up',
      provider_id: '',
      provider_name_override: '',
      diagnosis_summary: '',
      billed_amount: '',
      notes: '',
      record_received: false,
      bill_received: false,
    });
    setModalOpen(true);
    fetchProviders();
  };

  const openEditModal = (v) => {
    setModalMode('edit');
    setEditingVisitId(v.id);
    setAutoDetectedBanner('');
    setForm({
      visit_date: v.visit_date ? String(v.visit_date).slice(0, 10) : '',
      visit_type: v.visit_type || 'follow_up',
      provider_id: v.provider_id != null ? String(v.provider_id) : '',
      provider_name_override: v.provider_name_override || '',
      diagnosis_summary: v.diagnosis_summary || '',
      billed_amount: v.billed_amount != null ? String(v.billed_amount) : '',
      notes: v.notes || '',
      record_received: !!v.record_received,
      bill_received: !!v.bill_received,
    });
    setModalOpen(true);
    fetchProviders();
  };

  const openFromSuggestedValues = (suggestedValues) => {
    if (!suggestedValues) return;
    const visitType = suggestedValues.visitType || 'follow_up';
    setModalMode('create');
    setEditingVisitId(null);
    setAutoDetectedBanner(
      suggestedValues.confidence != null
        ? `Auto-detected from document (confidence ${suggestedValues.confidence}%). Review and adjust before saving.`
        : 'Auto-detected from document. Review and adjust before saving.'
    );
    setForm({
      visit_date: suggestedValues.visitDate ? String(suggestedValues.visitDate).slice(0, 10) : '',
      visit_type: visitType,
      provider_id: '',
      provider_name_override: '',
      diagnosis_summary: suggestedValues.diagnosisSummary || '',
      billed_amount:
        suggestedValues.billedAmount != null ? String(suggestedValues.billedAmount) : '',
      notes: suggestedValues.treatmentRendered || '',
      record_received: false,
      bill_received: false,
    });
    setModalOpen(true);
    fetchProviders();
  };

  useEffect(() => {
    const handler = (e) => {
      const detail = e?.detail;
      if (!detail || String(detail.caseId) !== String(caseId)) return;
      if (!detail.suggestedValues) return;
      const sv = detail.suggestedValues;
      const looksLikeVisit =
        sv.visitDate != null || sv.visitType != null || sv.diagnosisSummary != null;
      if (!looksLikeVisit) return;
      openFromSuggestedValues(sv);
    };
    window.addEventListener('medicalVisitSuggestedValues', handler);
    return () => window.removeEventListener('medicalVisitSuggestedValues', handler);
  }, [caseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRecordReceived = async (visitId, nextValue) => {
    const res = await fetch(`${base}${apiPrefix}/medical-visits/${visitId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ record_received: nextValue }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update record received');
    await fetchVisits();
    await fetchTimeline();
  };

  const updateBillReceived = async (visitId, nextValue) => {
    const res = await fetch(`${base}${apiPrefix}/medical-visits/${visitId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bill_received: nextValue }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update bill received');
    await fetchVisits();
    await fetchTimeline();
  };

  const handleDeleteVisit = async (visitId) => {
    if (!window.confirm('Delete this medical visit?')) return;
    const res = await fetch(`${base}${apiPrefix}/medical-visits/${visitId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Failed to delete visit');
      return;
    }
    await fetchVisits();
    await fetchTimeline();
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    try {
      if (!form.visit_date) throw new Error('visit_date is required');

      const payload = {
        visit_date: form.visit_date,
        visit_type: form.visit_type,
        provider_id: form.provider_id ? Number(form.provider_id) : null,
        provider_name_override: form.provider_name_override || null,
        diagnosis_summary: form.diagnosis_summary || null,
        billed_amount: form.billed_amount !== '' ? Number(form.billed_amount) : null,
        notes: form.notes || null,
        record_received: !!form.record_received,
        bill_received: !!form.bill_received,
      };

      if (modalMode === 'edit' && editingVisitId) {
        const res = await fetch(`${base}${apiPrefix}/medical-visits/${editingVisitId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to update visit');
      } else {
        const res = await fetch(`${base}${apiPrefix}/cases/${caseId}/medical-visits`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to create visit');
      }

      setModalOpen(false);
      await fetchVisits();
      await fetchTimeline();
    } catch (e2) {
      alert(e2.message || 'Failed to save visit');
    }
  };

  const gapEntry = useMemo(() => {
    if (!timeline?.timelineEntries) return null;
    const gaps = timeline.timelineEntries.filter((x) => x?.eventType === 'gap' || x?.isGap);
    return gaps[0] || null;
  }, [timeline]);

  const timelineEntriesSorted = useMemo(() => {
    if (!timeline?.timelineEntries) return [];
    return [...timeline.timelineEntries].sort((a, b) => {
      const ad = new Date(a.date).getTime();
      const bd = new Date(b.date).getTime();
      if (Number.isNaN(ad) || Number.isNaN(bd)) return 0;
      return ad - bd;
    });
  }, [timeline]);

  const providerTypesInvolved = timeline?.providerTypesInvolved || [];
  const openGaps = timeline?.openGaps || 0;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {(timelineLoading || loading) && (
        <div className="rounded-lg bg-slate-50/85 px-3 py-2.5">
          <LoadingInline message="Loading timeline…" />
        </div>
      )}
      {(error || timelineError) && (
        <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 ring-1 ring-red-200/70">
          {error || timelineError}
        </div>
      )}

      {/* Treatment summary */}
      {timeline?.treatmentSummary && (
        <div className="bg-slate-50/85 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-gray-900">Treatment Timeline Summary</div>
            {openGaps > 0 && (
              <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
                {openGaps} open gap{openGaps === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{timeline.treatmentSummary}</div>
          <div className="text-xs text-gray-500">
            Providers involved: {providerTypesInvolved.length ? providerTypesInvolved.join(', ') : '—'}
          </div>
        </div>
      )}

      {/* Gap alert */}
      {gapEntry?.description && openGaps > 0 && (
        <div className="bg-blue-50 rounded-lg p-3 ring-1 ring-blue-200/70">
          <div className="text-sm font-semibold text-blue-900">Treatment Gap Alert</div>
          <div className="text-sm text-blue-800 mt-1">{gapEntry.description}</div>
        </div>
      )}

      {/* Timeline entries */}
      {timelineEntriesSorted.length > 0 && (
        <div className="bg-white rounded-lg overflow-hidden shadow-sm ring-1 ring-slate-100/90">
          <div className="px-3 py-2.5 border-b border-gray-100">
            <div>
              <div className="text-sm font-semibold text-gray-900">Timeline</div>
              <div className="text-xs text-gray-500 mt-1">
                Total billed: ${Number(totals.totalBilled || 0).toLocaleString()} • Total received: $
                {Number(totals.totalReceived || 0).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {timelineEntriesSorted.map((entry, idx) => (
              <div key={`${entry.date}-${idx}`} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">{formatISODate(entry.date)}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          entry.isGap || entry.eventType === 'gap'
                            ? 'bg-red-50 border-red-200 text-red-800'
                            : entry.eventType === 'document_received'
                              ? 'bg-lime-50 border-lime-200 text-lime-950'
                              : 'bg-gray-50 border-gray-200 text-gray-800'
                        }`}
                      >
                        {toTitleCaseLabel(entry.eventType)}
                      </span>
                      {entry.providerType ? (
                        <span className="inline-flex items-center rounded-full border bg-gray-50 border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
                          {toTitleCaseLabel(entry.providerType)}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">{entry.description}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {apiPrefix === '/api' && billingDraftLines.length > 0 ? (
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 space-y-2">
          <div className="text-sm font-semibold text-indigo-950">Draft billing from document AI</div>
          <p className="text-xs text-indigo-900/90">
            Approve and import into a medical visit row (also available under Extractions & AI).
          </p>
          <ul className="space-y-2">
            {billingDraftLines.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-white rounded-md px-2 py-2 ring-1 ring-indigo-100">
                <span className="text-gray-800">
                  {row.line_total != null ? `$${Number(row.line_total).toLocaleString()}` : '—'} ·{' '}
                  {row.provider_name_raw || 'Provider'} · conf {row.confidence}%
                </span>
                <button
                  type="button"
                  onClick={() => approveAndImportBilling(row)}
                  className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  Approve & import to visit
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Visits table (always shown) */}
      <div className="bg-white rounded-lg overflow-hidden shadow-sm ring-1 ring-slate-100/90">
        <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-gray-900">Visits</div>
            <div className="text-xs text-gray-500 mt-1">Most recent first</div>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300"
          >
            + Add Visit
          </button>
        </div>
        {visits.length === 0 ? (
          <div className="px-3 py-6 text-sm text-gray-500">No visits recorded.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {visits.map((v) => (
              <div key={v.id} className="px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-gray-900">{formatISODate(v.visit_date)}</span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeForVisitType(
                          v.visit_type
                        )}`}
                      >
                        {(VISIT_TYPE_OPTIONS.find((t) => t.value === v.visit_type)?.label || v.visit_type || 'other').replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">Provider:</span> {v.provider_name || '—'}
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">Diagnosis:</span> {truncate(v.diagnosis_summary, 140)}
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">Billed:</span>{' '}
                      {v.billed_amount != null ? `$${Number(v.billed_amount).toLocaleString()}` : '—'}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                          v.record_received ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-700'
                        }`}
                        onClick={() => updateRecordReceived(v.id, !v.record_received).catch((e) => alert(e.message))}
                      >
                        {v.record_received ? 'Record received' : 'Record not received'}
                      </button>
                      <button
                        type="button"
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                          v.bill_received ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-700'
                        }`}
                        onClick={() => updateBillReceived(v.id, !v.bill_received).catch((e) => alert(e.message))}
                      >
                        {v.bill_received ? 'Bill received' : 'Bill not received'}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEditModal(v)}
                      className="text-lime-900 hover:underline text-sm font-semibold"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVisit(v.id)}
                      className="text-red-600 hover:underline text-sm font-semibold"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg ring-1 ring-slate-200/70 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {modalMode === 'edit' ? 'Edit Medical Visit' : 'Add Medical Visit'}
                </h3>
                {autoDetectedBanner ? (
                  <div className="mt-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 ring-1 ring-amber-200/70">
                    {autoDetectedBanner}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Visit Date</label>
                  <input
                    type="date"
                    value={form.visit_date}
                    onChange={(e) => setForm((p) => ({ ...p, visit_date: e.target.value }))}
                    className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Visit Type</label>
                  <select
                    value={form.visit_type}
                    onChange={(e) => setForm((p) => ({ ...p, visit_type: e.target.value }))}
                    className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                  >
                    {VISIT_TYPE_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Provider (optional)
                  </label>
                  <select
                    value={form.provider_id}
                    onChange={(e) => setForm((p) => ({ ...p, provider_id: e.target.value }))}
                    className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                    disabled={providersLoading}
                  >
                    <option value="">-- Select provider --</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.provider_type})
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-gray-500 mt-1">
                    If provider list is unavailable, use override below.
                  </div>
                  {providersError ? (
                    <p className="text-xs text-amber-700 mt-1">{providersError}</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Provider name override</label>
                  <input
                    value={form.provider_name_override}
                    onChange={(e) => setForm((p) => ({ ...p, provider_name_override: e.target.value }))}
                    className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                    placeholder="e.g. ABC Clinic"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Diagnosis Summary</label>
                <textarea
                  value={form.diagnosis_summary}
                  onChange={(e) => setForm((p) => ({ ...p, diagnosis_summary: e.target.value }))}
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Billed amount</label>
                  <input
                    type="number"
                    value={form.billed_amount}
                    onChange={(e) => setForm((p) => ({ ...p, billed_amount: e.target.value }))}
                    className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                    placeholder="e.g. 150.00"
                  />
                </div>
                <div className="flex items-center">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.record_received}
                      onChange={(e) => setForm((p) => ({ ...p, record_received: e.target.checked }))}
                    />
                    Record received
                  </label>
                </div>
                <div className="flex items-center">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.bill_received}
                      onChange={(e) => setForm((p) => ({ ...p, bill_received: e.target.checked }))}
                    />
                    Bill received
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="mt-1 block w-full rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-slate-200/80 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center px-5 py-2 bg-lime-400 text-slate-900 text-sm font-semibold rounded-full shadow-md shadow-lime-400/25 hover:bg-lime-300"
                >
                  {modalMode === 'edit' ? 'Save Changes' : 'Save Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

