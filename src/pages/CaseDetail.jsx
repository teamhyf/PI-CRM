import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CaseParticipantsTab from '../components/CaseParticipantsTab';
import CaseInjuriesTab from '../components/CaseInjuriesTab';
import CaseInsuranceTab from '../components/CaseInsuranceTab';
import CaseDocumentsTab from '../components/CaseDocumentsTab';
import CaseRedFlagsTab from '../components/CaseRedFlagsTab';
import CaseTimelineTab from '../components/CaseTimelineTab';
import ReferralPanel from '../components/ReferralPanel';
import ClaimDocumentBuilder from '../components/ClaimDocumentBuilder';
import SettlementTab from '../components/SettlementTab';
import CaseExtractionsTab from '../components/CaseExtractionsTab';
import { LoadingBlock, LoadingInline } from '../components/LoadingSpinner';

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  return '';
};

/** When `pi_cases.injury_summary` is empty, show a readable rollup from `case_injuries` rows. */
/** Display-only planning hint when staff has not saved `statute_deadline` yet. Not legal advice. */
function statutePlanningReference(dateOfLoss) {
  if (!dateOfLoss) return null;
  const d = new Date(dateOfLoss);
  if (Number.isNaN(d.getTime())) return null;
  const ref = new Date(d);
  ref.setFullYear(ref.getFullYear() + 2);
  return ref;
}

/** Matches `pi_cases.status` ENUM in migration 007 */
const CASE_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'docs_pending', label: 'Docs pending' },
  { value: 'in_treatment', label: 'In treatment' },
  { value: 'under_review', label: 'Under review' },
  { value: 'demand_ready', label: 'Demand ready' },
  { value: 'settled', label: 'Settled' },
  { value: 'referred_out', label: 'Referred out' },
  { value: 'closed', label: 'Closed' },
];

function statusPillClass(status) {
  const s =
    typeof status === 'string' && status.trim() ? status.trim().toLowerCase() : 'new';
  if (s === 'qualified') return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (s === 'accepted') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'docs_pending') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (s === 'in_treatment') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s === 'under_review') return 'bg-slate-100 text-slate-800 border-slate-200';
  if (s === 'demand_ready') return 'bg-orange-100 text-orange-800 border-orange-200';
  if (s === 'settled') return 'bg-purple-100 text-purple-800 border-purple-200';
  if (s === 'referred_out') return 'bg-teal-100 text-teal-800 border-teal-200';
  if (s === 'closed') return 'bg-gray-200 text-gray-900 border-gray-300';
  return 'bg-gray-100 text-gray-800 border-gray-200';
}

function summarizeInjuriesFromRecords(injuries) {
  if (!Array.isArray(injuries) || injuries.length === 0) return '';
  const fmt = (s) => (s == null ? '' : String(s).replace(/_/g, ' '));
  return injuries
    .map((i) => {
      const parts = [
        fmt(i.body_part),
        fmt(i.symptom_type),
        i.severity_level ? `${fmt(i.severity_level)} severity` : null,
        i.first_reported_date ? `first reported ${i.first_reported_date}` : null,
        i.ongoing === 1 || i.ongoing === true ? 'ongoing' : null,
      ].filter(Boolean);
      const line = parts.join(' · ');
      const note = i.notes ? ` — ${String(i.notes).trim().slice(0, 160)}${String(i.notes).length > 160 ? '…' : ''}` : '';
      return line ? `• ${line}${note}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

function CaseOverviewTab({ data, token }) {
  const [insuranceSummary, setInsuranceSummary] = useState(null);
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [insuranceError, setInsuranceError] = useState('');
  const statuteRefDate = !data.statute_deadline ? statutePlanningReference(data.date_of_loss) : null;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!token || !data?.id) return;
      setInsuranceLoading(true);
      setInsuranceError('');
      try {
        const base = getBaseUrl();
        const res = await fetch(`${base}/api/cases/${data.id}/insurance-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Failed to load insurance summary');
        if (!cancelled) setInsuranceSummary(json || null);
      } catch (err) {
        if (!cancelled) setInsuranceError(err.message || 'Failed to load insurance summary');
      } finally {
        if (!cancelled) setInsuranceLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [token, data?.id]);

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Jurisdiction State</label>
          <p className="text-gray-900 mt-1">{data.jurisdiction_state || 'Not set'}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Statute Deadline</label>
          {data.statute_deadline ? (
            <p className="text-gray-900 mt-1 font-medium">
              {new Date(data.statute_deadline).toLocaleDateString()}
            </p>
          ) : (
            <div className="mt-1">
              <p className="text-gray-600">Not set on file</p>
              {statuteRefDate ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
                  <span className="font-semibold">Planning reference only:</span>{' '}
                  {statuteRefDate.toLocaleDateString()} (2 years after date of loss).{' '}
                  Limitations law varies by state and claim type — confirm with counsel and save the official deadline on
                  the case when known.
                </div>
              ) : (
                <p className="text-xs text-gray-500 mt-2">
                  Add a date of loss to see a simple reference, or set the deadline when your office has confirmed it.
                </p>
              )}
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Estimated Severity</label>
          <p className="text-gray-900 mt-1">{data.estimated_severity_score}/100</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Risk Score</label>
          <p className="text-gray-900 mt-1">{data.risk_score}/100</p>
        </div>

        {/* Phase 5: Insurance coverage narrative */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">
            Insurance Coverage Note
          </label>
          <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
            {insuranceLoading ? (
              <LoadingInline message="Loading coverage note…" className="py-2" />
            ) : insuranceError ? (
              <p className="text-sm text-red-700">{insuranceError}</p>
            ) : (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {insuranceSummary?.coverageNote || 'No insurance summary yet.'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Liability Summary</label>
        <p className="text-gray-900 mt-1 whitespace-pre-wrap">
          {data.liability_summary || 'No summary'}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Injury Summary</label>
        {(() => {
          const fromRecords = summarizeInjuriesFromRecords(data.injuries);
          const text = (data.injury_summary && String(data.injury_summary).trim()) || fromRecords;
          return (
            <>
              <p className="text-gray-900 mt-1 whitespace-pre-wrap">
                {text || 'No summary — add injuries on the Injuries tab or enter a narrative on the case record.'}
              </p>
              {!data.injury_summary?.trim() && fromRecords ? (
                <p className="text-xs text-gray-500 mt-2">
                  Compiled from structured injury records (the narrative field on the case is still empty).
                </p>
              ) : null}
            </>
          );
        })()}
      </div>
    </div>
  );
}

export default function CaseDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const [caseData, setCaseData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    fetchCaseDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchCaseDetail = async () => {
    try {
      setLoading(true);
      setError('');
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/cases/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load case');
      }
      setCaseData(data);
    } catch (err) {
      console.error('Error loading case detail:', err);
      setError(err.message || 'Failed to load case');
    } finally {
      setLoading(false);
    }
  };

  const normalizedCaseStatus =
    typeof caseData?.status === 'string' && caseData.status.trim()
      ? caseData.status.trim()
      : 'new';

  const handleCaseStatusChange = async (e) => {
    const nextStatus = e.target.value;
    if (!caseData?.id || !token || nextStatus === normalizedCaseStatus) return;
    setStatusSaving(true);
    setStatusError('');
    const base = getBaseUrl();
    try {
      const res = await fetch(`${base}/api/cases/${caseData.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update case status');
      }
      setCaseData((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    } catch (err) {
      setStatusError(err.message || 'Failed to update case status');
    } finally {
      setStatusSaving(false);
    }
  };

  if (loading && !caseData) {
    return <LoadingBlock message="Loading case…" minHeight className="p-6" />;
  }

  if (error && !caseData) {
    return (
      <div className="p-6 text-red-600">
        {error}
      </div>
    );
  }

  if (!caseData) return <div className="p-6">No case found.</div>;

  // Tab order follows typical PI workflow: intake summary → parties → injuries → coverage →
  // treatment planning → visit chronology → records → risk → demand package → resolution.
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'participants', label: 'Participants' },
    { id: 'injuries', label: 'Injuries' },
    { id: 'insurance', label: 'Insurance' },
    { id: 'treatment-routing', label: 'Treatment Routing' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'documents', label: 'Documents' },
    { id: 'extractions', label: 'Extractions & AI' },
    { id: 'red-flags', label: 'Red Flags' },
    { id: 'documentation-summary', label: 'Documentation Summary' },
    { id: 'settlement', label: 'Settlement' },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Case #{caseData.id}</h1>
            <p className="text-gray-600 mt-1">
              {caseData.accident_type} |{' '}
              {caseData.date_of_loss ? new Date(caseData.date_of_loss).toLocaleDateString() : 'No date'}
            </p>

            {/* Claimant info */}
            {(() => {
              const claimantsArr = Array.isArray(caseData.claimants)
                ? caseData.claimants
                : caseData.claimant
                  ? [caseData.claimant]
                  : [];
              const primary = claimantsArr[0] || null;
              const extraCount = Math.max(0, claimantsArr.length - 1);
              if (!primary) return null;

              return (
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-gray-700">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="font-medium">
                    {[primary.first_name, primary.last_name].filter(Boolean).join(' ') || '—'}
                    {extraCount > 0 ? ` (+${extraCount} more)` : ''}
                  </span>
                </div>
                {primary.phone && (
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {primary.phone}
                  </div>
                )}
                {primary.email && (
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {primary.email}
                  </div>
                )}
              </div>
              );
            })()}
          </div>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <label htmlFor="case-status-select" className="text-xs font-medium text-gray-500">
              Case status
            </label>
            <select
              id="case-status-select"
              value={normalizedCaseStatus}
              onChange={handleCaseStatusChange}
              disabled={statusSaving}
              className={`min-w-[12rem] rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 ${statusPillClass(
                normalizedCaseStatus
              )}`}
            >
              {CASE_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {!CASE_STATUS_OPTIONS.some((o) => o.value === normalizedCaseStatus) ? (
                <option value={normalizedCaseStatus}>
                  {String(normalizedCaseStatus).replace(/_/g, ' ')}
                </option>
              ) : null}
            </select>
            {statusSaving ? (
              <span className="text-xs text-gray-500">Saving…</span>
            ) : null}
            {statusError ? <span className="text-xs text-red-600 max-w-xs text-right">{statusError}</span> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <aside className="w-full shrink-0 lg:w-72 xl:w-80 lg:sticky lg:top-4 lg:z-10 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto overflow-x-auto lg:overflow-x-hidden">
          <nav
            className="rounded-lg border border-white/10 bg-[#174049] p-2.5 shadow-lg shadow-black/20"
            aria-label="Case sections"
          >
            <p className="px-3 pt-1.5 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Navigate
            </p>
            <ul className="space-y-0.5 pb-0.5">
              {tabs.map((tab, index) => {
                const isActive = activeTab === tab.id;
                const n = index + 1;
                return (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full rounded-lg px-2.5 py-2.5 text-left text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-sky-400 text-slate-900 shadow-md'
                          : 'text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span
                          className={`w-7 shrink-0 text-right font-semibold tabular-nums ${
                            isActive ? 'text-slate-900' : 'text-slate-500'
                          }`}
                          aria-hidden
                        >
                          {n}.
                        </span>
                        <span className="whitespace-nowrap">{tab.label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <div className="min-w-0 flex-1 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/55">
          {activeTab === 'overview' && <CaseOverviewTab data={caseData} token={token} />}
          {activeTab === 'participants' && (
            <CaseParticipantsTab
              caseId={caseData.id}
              participants={caseData.participants || []}
              onChanged={fetchCaseDetail}
            />
          )}
          {activeTab === 'injuries' && (
            <CaseInjuriesTab
              caseId={caseData.id}
              injuries={caseData.injuries || []}
              onChanged={fetchCaseDetail}
            />
          )}
          {activeTab === 'insurance' && (
            <CaseInsuranceTab
              caseId={caseData.id}
              policies={caseData.policies || []}
              onChanged={fetchCaseDetail}
            />
          )}
          {activeTab === 'treatment-routing' && (
            <ReferralPanel caseId={caseData.id} injuries={caseData.injuries || []} />
          )}
          {activeTab === 'timeline' && <CaseTimelineTab caseId={caseData.id} />}
          {activeTab === 'documents' && <CaseDocumentsTab caseId={caseData.id} />}
          {activeTab === 'extractions' && <CaseExtractionsTab caseId={caseData.id} />}
          {activeTab === 'red-flags' && (
            <CaseRedFlagsTab caseId={caseData.id} flags={caseData.redFlags || []} />
          )}
          {activeTab === 'documentation-summary' && <ClaimDocumentBuilder caseId={caseData.id} />}
          {activeTab === 'settlement' && <SettlementTab caseId={caseData.id} />}
        </div>
      </div>
    </div>
  );
}

