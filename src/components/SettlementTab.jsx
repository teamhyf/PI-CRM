import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import AttorneyReferralPanel from './AttorneyReferralPanel';
import { LoadingInline } from './LoadingSpinner';

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  return '';
};

const DEMAND_STATUS_OPTIONS = [
  { value: 'not_started', label: 'not_started' },
  { value: 'demand_sent', label: 'demand_sent' },
  { value: 'negotiating', label: 'negotiating' },
  { value: 'settled', label: 'settled' },
  { value: 'litigation', label: 'litigation' },
  { value: 'closed', label: 'closed' },
];

const StatusCheck = ({ ok }) => (
  <span className={ok ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
    {ok ? '✓' : '✗'}
  </span>
);

function parseMaybeJson(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch (_) {
      return null;
    }
  }
  return val;
}

export default function SettlementTab({
  caseId,
  onChanged,
  apiPrefix = '/api',
  token: tokenOverride,
  readOnly = false,
}) {
  const { token } = useAuth();
  const authToken = tokenOverride || token;
  const { success, error } = useToast();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [tracker, setTracker] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [medicalCosts, setMedicalCosts] = useState(0);
  const [treatmentDays, setTreatmentDays] = useState(0);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [patchingStatus, setPatchingStatus] = useState(false);
  const [generatingDemandPacket, setGeneratingDemandPacket] = useState(false);
  const [demandPacketBlockers, setDemandPacketBlockers] = useState([]);
  const [demandPacketMeta, setDemandPacketMeta] = useState(null);
  const [demandPacketGuidance, setDemandPacketGuidance] = useState(null);
  const [demandReadiness, setDemandReadiness] = useState(null);
  const [demandReadinessLoading, setDemandReadinessLoading] = useState(false);
  const [ackWorking, setAckWorking] = useState('');

  const [form, setForm] = useState({
    demand_status: 'not_started',
    demand_amount: '',
    claimed_medicals: '',
    negotiated_medicals: '',
    final_settlement: '',
    notes: '',
  });

  const offerHistory = useMemo(() => {
    if (!tracker?.offer_history_json) return [];
    const parsed = parseMaybeJson(tracker.offer_history_json);
    if (Array.isArray(parsed)) return parsed;
    return [];
  }, [tracker?.offer_history_json]);

  const negotiation = useMemo(() => {
    const raw = tracker?.negotiation_summary_json;
    if (!raw) return null;
    const parsed = parseMaybeJson(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.negotiationSummary === 'string') return parsed;
    return null;
  }, [tracker?.negotiation_summary_json]);

  const netToClient = useMemo(() => {
    const finalN = form.final_settlement !== '' ? Number(form.final_settlement) : null;
    const negN = form.negotiated_medicals !== '' ? Number(form.negotiated_medicals) : null;
    if (finalN != null && Number.isFinite(finalN) && negN != null && Number.isFinite(negN)) {
      return finalN - negN;
    }
    const backendNet = tracker?.net_to_client != null ? Number(tracker.net_to_client) : null;
    if (backendNet != null && Number.isFinite(backendNet)) return backendNet;
    return null;
  }, [form.final_settlement, form.negotiated_medicals, tracker?.net_to_client]);

  const fetchSettlement = async () => {
    if (!authToken || !caseId) return;
    setLoading(true);
    setLoadError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}${apiPrefix}/cases/${caseId}/settlement`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load settlement');

      setTracker(data.tracker || null);
      setReadiness(data.readiness || null);
      setMedicalCosts(Number(data.medicalCosts || 0));
      setTreatmentDays(Number(data.treatmentDays || 0));

      // Sync form with tracker once loaded.
      if (data.tracker) {
        setForm({
          demand_status: data.tracker.demand_status || 'not_started',
          demand_amount: data.tracker.demand_amount != null ? String(data.tracker.demand_amount) : '',
          claimed_medicals: data.tracker.claimed_medicals != null ? String(data.tracker.claimed_medicals) : '',
          negotiated_medicals: data.tracker.negotiated_medicals != null ? String(data.tracker.negotiated_medicals) : '',
          final_settlement: data.tracker.final_settlement != null ? String(data.tracker.final_settlement) : '',
          notes: data.tracker.notes || '',
        });
      }
    } catch (e) {
      setLoadError(e.message || 'Failed to load settlement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, authToken, apiPrefix]);

  const fetchDemandReadiness = async () => {
    if (!authToken || !caseId || apiPrefix !== '/api') return;
    setDemandReadinessLoading(true);
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/cases/${caseId}/demand-readiness`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDemandReadiness(data);
      else setDemandReadiness(null);
    } catch {
      setDemandReadiness(null);
    } finally {
      setDemandReadinessLoading(false);
    }
  };

  useEffect(() => {
    fetchDemandReadiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, authToken, apiPrefix]);

  const ackDemandSection = async (section) => {
    if (!authToken || !caseId || readOnly) return;
    setAckWorking(section);
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/cases/${caseId}/demand-readiness/ack`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ section }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ack failed');
      setDemandReadiness(data);
      success('Acknowledged', `Section “${section}” marked reviewed for demand.`);
    } catch (e) {
      error(e.message || 'Ack failed');
    } finally {
      setAckWorking('');
    }
  };

  const createTracker = async () => {
    if (readOnly) return;
    if (!authToken || !caseId || creating) return;
    setCreating(true);
    try {
      const base = getBaseUrl();
      if (apiPrefix !== '/api') throw new Error('Settlement tracker creation is not enabled for this portal.');
      const res = await fetch(`${base}${apiPrefix}/cases/${caseId}/settlement`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create settlement tracker');

      success('Settlement tracker created', 'You can now record settlement status and amounts.');
      await fetchSettlement();
      if (onChanged) await onChanged();
    } catch (e) {
      error(e.message || 'Failed to create settlement tracker');
    } finally {
      setCreating(false);
    }
  };

  const saveSettlement = async () => {
    if (!tracker?.id) return;
    if (readOnly) return;
    if (saving) return;
    setSaving(true);
    try {
      const base = getBaseUrl();
      if (apiPrefix !== '/api') throw new Error('Settlement editing is not enabled for this portal.');
      const payload = {
        demand_status: form.demand_status,
        demand_amount: form.demand_amount === '' ? null : Number(form.demand_amount),
        claimed_medicals: form.claimed_medicals === '' ? null : Number(form.claimed_medicals),
        negotiated_medicals: form.negotiated_medicals === '' ? null : Number(form.negotiated_medicals),
        final_settlement: form.final_settlement === '' ? null : Number(form.final_settlement),
        notes: form.notes || null,
      };

      const res = await fetch(`${base}${apiPrefix}/settlement/${tracker.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save settlement');

      success('Settlement saved', 'Settlement information updated successfully.');
      await fetchSettlement();
      if (onChanged) await onChanged();
    } catch (e) {
      error(e.message || 'Failed to save settlement');
    } finally {
      setSaving(false);
    }
  };

  const patchDemandStatus = async (nextStatus) => {
    if (!tracker?.id) return;
    if (readOnly) return;
    if (patchingStatus) return;
    setPatchingStatus(true);
    setForm((f) => ({ ...f, demand_status: nextStatus }));
    try {
      const base = getBaseUrl();
      if (apiPrefix !== '/api') throw new Error('Settlement editing is not enabled for this portal.');
      const res = await fetch(`${base}${apiPrefix}/settlement/${tracker.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ demand_status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update demand status');

      success('Status updated', `Demand status set to ${nextStatus}.`);
      await fetchSettlement();
      if (onChanged) await onChanged();
    } catch (e) {
      error(e.message || 'Failed to update demand status');
    } finally {
      setPatchingStatus(false);
    }
  };

  const handleGenerateDemandPacket = async (force = false) => {
    if (readOnly) return;
    if (!authToken || !caseId) return;
    if (apiPrefix !== '/api') {
      error('Demand packet generation is only available for staff.');
      return;
    }
    if (generatingDemandPacket) return;

    setGeneratingDemandPacket(true);
    setDemandPacketBlockers([]);
    try {
      const base = getBaseUrl();
      const query = force ? '?force=1' : '';
      let forceReason;
      if (force) {
        forceReason = window.prompt('Optional audit note for forced generation (shown in compliance log):', '') || '';
      }
      const res = await fetch(`${base}${apiPrefix}/cases/${caseId}/demand-packet/generate${query}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          ...(force ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(force ? { body: JSON.stringify({ forceReason: forceReason || undefined }) } : {}),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        const blockers = Array.isArray(data.blockers) ? data.blockers : [];
        setDemandPacketBlockers(blockers);
        setDemandPacketGuidance(data.manualGuidance || null);
        error('Demand packet generation blocked. Resolve blockers and try again.');
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to generate demand packet');

      setDemandPacketMeta(data.document || null);
      setDemandPacketGuidance(data.manualGuidance || null);
      if (data.duplicate) {
        success('Demand packet already up to date', 'No significant case updates since the latest packet.');
      } else if (data.generated) {
        const additionalCount = Array.isArray(data.additionalDocuments) ? data.additionalDocuments.length : 0;
        const details =
          additionalCount > 0
            ? `A new PDF demand document and ${additionalCount} additional editable copy were added to Documents.`
            : 'A new PDF demand document was added to Documents.';
        success('Demand document generated', details);
      } else {
        success('Demand packet request completed');
      }

      await fetchSettlement();
      await fetchDemandReadiness();
      if (onChanged) await onChanged();
    } catch (e) {
      error(e.message || 'Failed to generate demand packet');
    } finally {
      setGeneratingDemandPacket(false);
    }
  };

  const checklist = readiness?.checklist || {};

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Settlement</h2>
          <p className="text-sm text-gray-600 mt-1">Track resolution progress and attorney referral readiness.</p>
        </div>
        {tracker?.id ? (
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Tracker #{tracker.id}
          </span>
        ) : (
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            No tracker yet
          </span>
        )}
      </div>

      {loading ? (
        <div className="rounded-lg bg-slate-50/85 px-4 py-3">
          <LoadingInline message="Loading settlement…" />
        </div>
      ) : null}
      {loadError ? <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 ring-1 ring-red-200/70">{loadError}</div> : null}

      {!loading && !tracker ? (
        <div className="rounded-xl p-4 bg-white shadow-sm ring-1 ring-slate-100/90">
          <p className="text-sm font-semibold text-gray-900">Settlement tracker not created</p>
          <p className="text-sm text-gray-600 mt-1">
            {readOnly
              ? 'A settlement tracker has not been created yet.'
              : 'Create it to start recording settlement and readiness.'}
          </p>
          {!readOnly ? (
            <button
              onClick={createTracker}
              disabled={creating}
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating…' : 'Create Settlement Tracker'}
            </button>
          ) : null}
        </div>
      ) : null}

      {readiness ? (
        <div className="rounded-xl p-4 bg-white space-y-4 shadow-sm ring-1 ring-slate-100/90">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Resolution Readiness Checklist</p>
              <p className="text-xs text-gray-500 mt-1">Gate checks required before settlement / referral transitions.</p>
            </div>
            <div
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                readiness.ready ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'
              }`}
            >
              {readiness.ready ? 'Case Ready for Settlement' : 'Blockers Remain'}
            </div>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleGenerateDemandPacket(false)}
                disabled={generatingDemandPacket}
                className="inline-flex items-center gap-2 rounded-full bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/20 hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingDemandPacket ? 'Generating…' : 'Generate Demand Document'}
              </button>
              <button
                type="button"
                onClick={() => handleGenerateDemandPacket(true)}
                disabled={generatingDemandPacket}
                className="inline-flex items-center rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Force Regenerate
              </button>
              <span className="text-xs text-gray-500">
                Manual action only. Generates a draft `demand_packet` document and saves it under this case.
              </span>
            </div>
          )}

          {Array.isArray(demandPacketGuidance?.advisories) && demandPacketGuidance.advisories.length > 0 ? (
            <div className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3 ring-1 ring-amber-200/70">
              <p className="font-semibold text-amber-900 mb-1">Demand Timing Guidance</p>
              <ul className="list-disc ml-5 space-y-1">
                {demandPacketGuidance.advisories.map((a, idx) => (
                  <li key={`${a.code || 'advisory'}-${idx}`}>{a.message || 'Advisory for manual review.'}</li>
                ))}
              </ul>
              <p className="text-xs text-amber-700 mt-2">
                Treatment finalized: {demandPacketGuidance.treatmentFinalized ? 'Yes' : 'No'} ·
                Billed: ${Number(demandPacketGuidance.totalBilled || 0).toLocaleString()} ·
                BI Limit: {demandPacketGuidance.maxBiLimit != null ? `$${Number(demandPacketGuidance.maxBiLimit).toLocaleString()}` : '—'} ·
                Target (40%): {demandPacketGuidance.targetMedicalThreshold != null ? `$${Number(demandPacketGuidance.targetMedicalThreshold).toLocaleString()}` : '—'}
              </p>
            </div>
          ) : null}

          {Array.isArray(readiness.blockers) && readiness.blockers.length ? (
            <div className="text-sm text-red-800 bg-red-50 rounded-lg p-3 ring-1 ring-red-200/70">
              <p className="font-semibold text-red-900 mb-1">Blockers</p>
              <ul className="list-disc ml-5">
                {readiness.blockers.map((b, idx) => (
                  <li key={`${b}-${idx}`}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {Array.isArray(demandPacketBlockers) && demandPacketBlockers.length > 0 ? (
            <div className="text-sm text-red-800 bg-red-50 rounded-lg p-3 ring-1 ring-red-200/70">
              <p className="font-semibold text-red-900 mb-1">Demand Packet Generation Blockers</p>
              <ul className="list-disc ml-5 space-y-1">
                {demandPacketBlockers.map((b, idx) => (
                  <li key={`${b.code || 'blocker'}-${idx}`}>{b.message || 'Readiness blocker detected.'}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {demandReadiness && apiPrefix === '/api' ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">Pre-demand staff checklist</p>
                  {demandReadinessLoading ? <span className="text-xs text-gray-500">Loading…</span> : null}
                </div>
                <p className="text-xs text-gray-600">
                  Gate mode: <span className="font-semibold">{demandReadiness.mode || 'soft'}</span>
                  {demandReadiness.mode === 'hard'
                    ? ' — all sections must be acknowledged before generate (unless you force).'
                    : ' — acknowledgments are tracked; set DEMAND_READINESS_GATE=hard on the server to enforce.'}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                {['injuries', 'specials', 'liability'].map((key) => {
                  const sec = demandReadiness.sections?.[key] || {};
                  return (
                    <div key={key} className="rounded-md bg-white p-2 ring-1 ring-slate-100">
                      <p className="font-medium text-gray-800 capitalize">{key}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        Data: {sec.satisfied ? 'looks complete' : 'incomplete'} · Ack: {sec.acked ? 'yes' : 'no'}
                      </p>
                      {!readOnly ? (
                        <button
                          type="button"
                          disabled={!!ackWorking}
                          onClick={() => ackDemandSection(key)}
                          className="mt-2 w-full rounded-md bg-slate-800 px-2 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                          {ackWorking === key ? 'Saving…' : 'I reviewed this section'}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {demandPacketMeta?.id ? (
            <div className="text-xs text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2 ring-1 ring-emerald-200/70">
              Latest generated packet: <span className="font-semibold">{demandPacketMeta.file_name}</span> (doc #{demandPacketMeta.id})
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl p-3 bg-slate-50/85 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Documents Complete</p>
                <p className="text-xs text-gray-600">Completeness: {checklist.documentCompleteness ?? '—'}%</p>
              </div>
              <StatusCheck ok={!!checklist.documentsComplete} />
            </div>
            <div className="rounded-xl p-3 bg-slate-50/85 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Red Flags Resolved</p>
                <p className="text-xs text-gray-600">Open high flags: {checklist.openHighFlags ?? '—'}</p>
              </div>
              <StatusCheck ok={!!checklist.redFlagsResolved} />
            </div>
            <div className="rounded-xl p-3 bg-slate-50/85 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Medical Visits Recorded</p>
                <p className="text-xs text-gray-600">Visits count: {checklist.medicalVisitsCount ?? '—'}</p>
              </div>
              <StatusCheck ok={!!checklist.medicalVisitsRecorded} />
            </div>
            <div className="rounded-xl p-3 bg-slate-50/85 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Settlement Tracker Created</p>
                <p className="text-xs text-gray-600">Setup status: {tracker ? 'Created' : 'Missing'}</p>
              </div>
              <StatusCheck ok={!!checklist.settlementTrackerCreated} />
            </div>
          </div>
        </div>
      ) : null}

      {tracker?.id ? (
        <>
          <div className="rounded-xl p-4 bg-white space-y-4 shadow-sm ring-1 ring-slate-100/90">
            <div>
              <p className="text-sm font-semibold text-gray-900">Settlement Status</p>
              <p className="text-xs text-gray-500 mt-1">
                {readOnly ? 'Current settlement status and amounts.' : 'Update demand status and financial records'}
              </p>
            </div>

            {readOnly ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl p-3 bg-slate-50/85">
                  <p className="text-xs font-semibold text-gray-600">Demand Status</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {String(form.demand_status || '—').replace(/_/g, ' ')}
                  </p>
                </div>
                <div className="rounded-xl p-3 bg-slate-50/85">
                  <p className="text-xs font-semibold text-gray-600">Treatment Days</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {Number.isFinite(treatmentDays) ? `${treatmentDays} days` : '—'}
                  </p>
                </div>

                <div className="rounded-xl p-3 bg-slate-50/85">
                  <p className="text-xs font-semibold text-gray-600">Demand Amount</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {form.demand_amount !== '' ? `$${Number(form.demand_amount).toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="rounded-xl p-3 bg-slate-50/85">
                  <p className="text-xs font-semibold text-gray-600">Claimed Medicals</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {form.claimed_medicals !== '' ? `$${Number(form.claimed_medicals).toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="rounded-xl p-3 bg-slate-50/85">
                  <p className="text-xs font-semibold text-gray-600">Negotiated Medicals</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {form.negotiated_medicals !== '' ? `$${Number(form.negotiated_medicals).toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="rounded-xl p-3 bg-slate-50/85">
                  <p className="text-xs font-semibold text-gray-600">Final Settlement</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {form.final_settlement !== '' ? `$${Number(form.final_settlement).toLocaleString()}` : '—'}
                  </p>
                </div>

                <div className="md:col-span-2 rounded-xl p-3 bg-slate-50/85">
                  <p className="text-xs font-semibold text-gray-600">Net to Client</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {netToClient != null && Number.isFinite(netToClient)
                      ? `$${Number(netToClient).toLocaleString()}`
                      : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">(final_settlement - negotiated_medicals)</p>
                </div>

                <div className="md:col-span-2">
                  <p className="text-xs font-semibold text-gray-600">Notes</p>
                  <div className="mt-1 rounded-xl bg-white px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap shadow-sm ring-1 ring-slate-100/90">
                    {form.notes ? form.notes : '—'}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Demand Status</label>
                    <select
                      className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/50"
                      value={form.demand_status}
                      disabled={patchingStatus}
                      onChange={(e) => patchDemandStatus(e.target.value)}
                    >
                      {DEMAND_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Treatment Days</label>
                    <div className="rounded-lg bg-slate-50/85 px-3 py-2 text-sm font-semibold text-gray-800">
                      {Number.isFinite(treatmentDays) ? treatmentDays : '—'} days
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Demand Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.demand_amount}
                      onChange={(e) => setForm((f) => ({ ...f, demand_amount: e.target.value }))}
                      className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Claimed Medicals</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.claimed_medicals}
                      onChange={(e) => setForm((f) => ({ ...f, claimed_medicals: e.target.value }))}
                      className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Negotiated Medicals</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.negotiated_medicals}
                      onChange={(e) => setForm((f) => ({ ...f, negotiated_medicals: e.target.value }))}
                      className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Final Settlement</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.final_settlement}
                      onChange={(e) => setForm((f) => ({ ...f, final_settlement: e.target.value }))}
                      className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/50"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Net to Client</label>
                    <div className="rounded-lg bg-slate-50/85 px-3 py-2 text-sm font-semibold text-gray-800">
                      {netToClient != null && Number.isFinite(netToClient)
                        ? `$${Number(netToClient).toLocaleString()}`
                        : '—'}
                      <span className="text-xs text-gray-500 font-normal ml-2">(final_settlement - negotiated_medicals)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/50"
                  />
                </div>
              </>
            )}

            {!readOnly ? (
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={saveSettlement}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save Settlement Info'}
                </button>
              </div>
            ) : null}
          </div>

          {negotiation?.negotiationSummary ? (
            <div className="rounded-xl p-4 bg-white space-y-2 shadow-sm ring-1 ring-slate-100/90">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Offer Negotiation Summary</p>
                  <p className="text-xs text-gray-500 mt-1">Staff-only narrative generated when settlement is finalized.</p>
                </div>
                {typeof negotiation.offerCount === 'number' ? (
                  <span className="text-xs font-semibold text-lime-900">
                    {negotiation.offerCount} offer round{negotiation.offerCount === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed rounded-lg bg-slate-50/85 p-3">
                {negotiation.negotiationSummary}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl p-4 bg-white space-y-3 shadow-sm ring-1 ring-slate-100/90">
            <div>
              <p className="text-sm font-semibold text-gray-900">Offer History</p>
              <p className="text-xs text-gray-500 mt-1">If present, shows prior settlement demand rounds.</p>
            </div>
            {offerHistory.length ? (
              <div className="space-y-3">
                {offerHistory.map((o, idx) => (
                  <div key={`${o.offer_number || 'offer'}-${idx}`} className="rounded-xl p-3 bg-slate-50/85">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Offer #{o.offer_number ?? idx + 1}
                      </p>
                      <p className="text-sm font-semibold text-lime-900">
                        {o.offer_amount != null ? `$${Number(o.offer_amount).toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Offered at: {o.offered_at ? String(o.offered_at).slice(0, 10) : '—'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Responded: {o.responded ? 'Yes' : 'No'}
                      {o.response_date ? ` · ${String(o.response_date).slice(0, 10)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600">No offer history recorded yet.</p>
            )}
          </div>
        </>
      ) : null}

      {!readOnly ? (
        <AttorneyReferralPanel
          caseId={caseId}
          onChanged={async () => {
            // Refresh settlement readiness and tracker values after referral updates.
            await fetchSettlement();
            if (onChanged) await onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

