import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useClaimantAuth } from '../../context/ClaimantAuthContext';
import { LoadingBlock, LoadingInline } from '../../components/LoadingSpinner';
import VisitsTimeline from '../../components/VisitsTimeline';
import CaseDocumentsTab from '../../components/CaseDocumentsTab';
import CaseRedFlagsTab from '../../components/CaseRedFlagsTab';
import ClaimDocumentBuilder from '../../components/ClaimDocumentBuilder';
import SettlementTab from '../../components/SettlementTab';
import { parseQuickInjuryInput } from '../../utils/injuryQuickCapture';

const getBaseUrl = () => {
  const url = import.meta.env.VITE_API_BASE_URL;
  if (url) return url.replace(/\/$/, '');
  return '';
};

function formatISODate(iso) {
  if (!iso) return '—';
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

const providerTypeLabel = (t) =>
  String(t || '')
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');

const referralStatusLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const policyTypeLabel = (value) =>
  String(value || '')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

const EMPTY_INJURY_FORM = () => ({
  bodyPart: 'neck',
  symptomType: 'pain',
  severityLevel: 'mild',
  firstReportedDate: '',
  ongoing: true,
  priorSimilarInjury: false,
  notes: '',
});

const statusBadgeClasses = (status) => {
  switch (status) {
    case 'suggested':
      return 'bg-gray-100 text-gray-800 ring-gray-200/90';
    case 'scheduled':
      return 'bg-blue-100 text-blue-800 ring-blue-200/90';
    case 'completed':
      return 'bg-green-100 text-green-800 ring-green-200/90';
    case 'declined':
      return 'bg-red-100 text-red-800 ring-red-200/90';
    case 'no_response':
      return 'bg-amber-100 text-amber-800 ring-amber-200/90';
    default:
      return 'bg-gray-100 text-gray-800 ring-gray-200/90';
  }
};

const DOC_TYPES = [
  { value: 'police_report', label: 'Police Report' },
  { value: 'vehicle_photos', label: 'Vehicle Photos' },
  { value: 'hospital_records', label: 'Hospital Records' },
  { value: 'declaration_page', label: 'Declaration Page' },
  { value: 'MRI_report', label: 'MRI Report' },
  { value: 'bill', label: 'Bill' },
  { value: 'treatment_note', label: 'Treatment Note' },
  { value: 'demand_packet', label: 'Demand Packet' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'other', label: 'Other' },
];

const STATUS_STYLES = {
  pending_review: 'bg-amber-100 text-amber-800 ring-amber-200/90',
  reviewed: 'bg-green-100 text-green-800 ring-green-200/90',
  incomplete: 'bg-red-100 text-red-800 ring-red-200/90',
};

const STATUS_LABELS = {
  pending_review: 'Pending Review',
  reviewed: 'Reviewed',
  incomplete: 'Incomplete',
};

const EMPTY_PORTAL_PARTICIPANT_DRAFT = () => ({
  fullName: '',
  phone: '',
  email: '',
  insuranceCarrier: '',
  policyNumber: '',
  vehicleInfo: '',
  notes: '',
});

/** Roles used by portal Participants subsections (each has its own add form). */
const PORTAL_PARTICIPANT_SECTIONS = [
  {
    id: 'adverse_driver',
    role: 'adverse_driver',
    title: 'The Other Driver',
    subtitle: 'Person who hit you',
    nameLabel: 'Full name',
    showInsurance: true,
  },
  {
    id: 'passenger',
    role: 'passenger',
    title: 'People in Your Car',
    subtitle: 'Passengers riding with you',
    nameLabel: 'Full name',
    showInsurance: false,
  },
  {
    id: 'witness',
    role: 'witness',
    title: 'Witnesses',
    subtitle: 'People who saw what happened',
    nameLabel: 'Full name',
    showInsurance: false,
  },
  {
    id: 'police_emergency',
    role: 'police_emergency',
    title: 'Police / Emergency Response',
    subtitle: 'If applicable — officer, agency, fire, or EMS',
    nameLabel: 'Name or unit / badge #',
    showInsurance: false,
  },
  {
    id: 'other_vehicle',
    role: 'other_vehicle',
    title: 'Other Vehicles Involved',
    subtitle: 'Additional vehicles or parties (description, plate if known)',
    nameLabel: 'Vehicle or party description',
    showInsurance: false,
  },
];

const PORTAL_SECTION_ROLE_SET = new Set(PORTAL_PARTICIPANT_SECTIONS.map((s) => s.role));

function getPortalParticipantSectionConfig(role) {
  return (
    PORTAL_PARTICIPANT_SECTIONS.find((s) => s.role === role) || {
      id: String(role),
      role,
      title: 'Participant',
      subtitle: '',
      nameLabel: 'Full name',
      showInsurance: false,
    }
  );
}

function participantRowToDraft(p) {
  return {
    fullName: p.full_name || '',
    phone: p.phone != null ? String(p.phone) : '',
    email: p.email != null ? String(p.email) : '',
    insuranceCarrier: p.insurance_carrier != null ? String(p.insurance_carrier) : '',
    policyNumber: p.policy_number != null ? String(p.policy_number) : '',
    vehicleInfo: p.vehicle_info != null ? String(p.vehicle_info) : '',
    notes: p.notes != null ? String(p.notes) : '',
  };
}

const CASE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'participants', label: 'Participants' },
  { id: 'injuries', label: 'Injuries' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'treatment', label: 'Treatment Routing' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'documents', label: 'Documents' },
  { id: 'red_flags', label: 'Red Flags' },
  { id: 'documentation_summary', label: 'Documentation Summary' },
  { id: 'settlement', label: 'Settlement' },
];

function statutePlanningReference(dateOfLoss) {
  if (!dateOfLoss) return null;
  const d = new Date(dateOfLoss);
  if (Number.isNaN(d.getTime())) return null;
  const ref = new Date(d);
  ref.setFullYear(ref.getFullYear() + 2);
  return ref;
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
        i.first_reported_date ? `first reported ${String(i.first_reported_date).slice(0, 10)}` : null,
        i.ongoing === 1 || i.ongoing === true ? 'ongoing' : null,
      ].filter(Boolean);
      const line = parts.join(' · ');
      const note = i.notes
        ? ` — ${String(i.notes).trim().slice(0, 160)}${String(i.notes).length > 160 ? '…' : ''}`
        : '';
      return line ? `• ${line}${note}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

function getBandColor(band) {
  if (band === '100k_plus') return 'bg-green-100 text-green-800 ring-green-200/90';
  if (band === '50k' || band === '25k') return 'bg-amber-100 text-amber-800 ring-amber-200/90';
  if (band === 'under_25k') return 'bg-red-100 text-red-800 ring-red-200/90';
  return 'bg-gray-100 text-gray-700 ring-gray-200/90';
}

function formatCurrency(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `$${num.toLocaleString()}`;
}

const metaIconCls = 'h-4 w-4 shrink-0 text-slate-400';

function IconCaseIncident({ className = metaIconCls }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

function IconCalendar({ className = metaIconCls }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  );
}

function IconUser({ className = metaIconCls }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function IconEnvelope({ className = metaIconCls }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  );
}

function ParticipantSectionIcon({ role }) {
  const iconClass = 'h-5 w-5 shrink-0 text-lime-700';
  if (role === 'adverse_driver' || role === 'other_vehicle') {
    return (
      <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={2.1} stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l1.2-3.6A2.25 2.25 0 017.08 8.25h9.84a2.25 2.25 0 012.13 1.65l1.2 3.6M4.5 16.5h15m-13.5 0V18a.75.75 0 00.75.75h.75A.75.75 0 008.25 18v-1.5m7.5 0V18a.75.75 0 00.75.75h.75A.75.75 0 0018 18v-1.5M6.75 12h.008v.008H6.75V12zm10.5 0h.008v.008h-.008V12z"
        />
      </svg>
    );
  }
  if (role === 'passenger') {
    return (
      <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={2.1} stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM3.75 19.5a8.25 8.25 0 0116.5 0"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12.75a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    );
  }
  if (role === 'witness') {
    return (
      <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={2.1} stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12s3.75-6 9.75-6 9.75 6 9.75 6-3.75 6-9.75 6-9.75-6-9.75-6z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 14.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" />
      </svg>
    );
  }
  if (role === 'police_emergency') {
    return (
      <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={2.1} stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l6.75 3v5.25c0 4.07-2.75 7.73-6.75 8.75-4-1.02-6.75-4.68-6.75-8.75V6L12 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v6m-3-3h6" />
      </svg>
    );
  }
  return (
    <svg className={iconClass} fill="none" viewBox="0 0 24 24" strokeWidth={2.1} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275"
      />
    </svg>
  );
}

export function PortalCaseDetail() {
  const { claimantId: claimantIdParam } = useParams();
  const targetClaimantId = Number(claimantIdParam);

  const { token, claimant, switchCase, loading: authLoading, cases } = useClaimantAuth();
  const [syncError, setSyncError] = useState('');
  const [syncing, setSyncing] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [caseData, setCaseData] = useState(null);

  const [pathwayLoading, setPathwayLoading] = useState(false);
  const [pathwayError, setPathwayError] = useState('');
  const [pathway, setPathway] = useState(null);

  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDocType, setUploadDocType] = useState('other');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const fileInputRef = useRef(null);

  const [fullDetail, setFullDetail] = useState(null);
  const [fullDetailLoading, setFullDetailLoading] = useState(false);
  const [fullDetailError, setFullDetailError] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editInjury, setEditInjury] = useState('');
  const [editLiability, setEditLiability] = useState('');
  const [savingCase, setSavingCase] = useState(false);
  const [saveCaseError, setSaveCaseError] = useState('');
  const [saveCaseOk, setSaveCaseOk] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const [claimSummaryLoading, setClaimSummaryLoading] = useState(false);
  const [claimSummaryError, setClaimSummaryError] = useState('');
  const [claimSummary, setClaimSummary] = useState(null);

  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementError, setSettlementError] = useState('');
  const [settlement, setSettlement] = useState(null);

  const [insuranceSummary, setInsuranceSummary] = useState(null);
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [insuranceError, setInsuranceError] = useState('');

  const [referralsLoading, setReferralsLoading] = useState(false);
  const [referralsError, setReferralsError] = useState('');
  const [referrals, setReferrals] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  const [participantsList, setParticipantsList] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState('');
  const [participantModal, setParticipantModal] = useState(null);
  const [participantModalDraft, setParticipantModalDraft] = useState(EMPTY_PORTAL_PARTICIPANT_DRAFT());
  const [participantModalSaving, setParticipantModalSaving] = useState(false);

  const [injuriesList, setInjuriesList] = useState([]);
  const [injuriesLoading, setInjuriesLoading] = useState(false);
  const [injuriesError, setInjuriesError] = useState('');
  const [injuryForm, setInjuryForm] = useState(EMPTY_INJURY_FORM());
  const [injurySaving, setInjurySaving] = useState(false);
  const [editingInjuryId, setEditingInjuryId] = useState(null);
  const [injuryModalOpen, setInjuryModalOpen] = useState(false);
  const [injuryQuickInput, setInjuryQuickInput] = useState('');
  const [injuryQuickListening, setInjuryQuickListening] = useState(false);
  const injuryRecognitionRef = useRef(null);

  const [policiesList, setPoliciesList] = useState([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [policiesError, setPoliciesError] = useState('');
  const [policyForm, setPolicyForm] = useState({
    policyType: 'bodily_injury',
    carrierName: '',
    policyNumber: '',
    claimNumber: '',
    adjusterName: '',
    adjusterEmail: '',
    adjusterPhone: '',
    policyLimitPerPerson: '',
    policyLimitPerOccurrence: '',
  });
  const [policySaving, setPolicySaving] = useState(false);

  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [policyModalMode, setPolicyModalMode] = useState('create'); // create | edit
  const [editingPolicyId, setEditingPolicyId] = useState(null);
  const [policyModalError, setPolicyModalError] = useState('');

  const caseIdNum =
    fullDetail?.id ||
    (caseData?.caseId ? Number(String(caseData.caseId).replace(/^CASE-/, '')) : null);

  useEffect(() => {
    setCaseData(null);
    setPathway(null);
    setPathwayError('');
    setError('');
    setDocs([]);
    setActiveTab('overview');
  }, [targetClaimantId]);

  useEffect(() => {
    let cancelled = false;
    setSyncError('');

    if (!Number.isFinite(targetClaimantId) || targetClaimantId <= 0) {
      setSyncing(false);
      setSyncError('Invalid case link.');
      return undefined;
    }

    if (!token) {
      setSyncing(false);
      return undefined;
    }

    const allowed = new Set((cases || []).map((c) => c.claimantId));
    if (cases.length > 0 && !allowed.has(targetClaimantId)) {
      setSyncing(false);
      setSyncError('You do not have access to this case.');
      return undefined;
    }

    (async () => {
      if (claimant?.id === targetClaimantId) {
        if (!cancelled) setSyncing(false);
        return;
      }
      try {
        setSyncing(true);
        await switchCase(targetClaimantId);
      } catch (e) {
        if (!cancelled) setSyncError(e.message || 'Unable to open this case.');
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // switchCase is stable enough for effect; omit from deps to avoid identity churn loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, targetClaimantId, claimant?.id, cases]);

  const normalizedCaseStatus =
    typeof caseData?.status === 'string' && caseData.status.trim()
      ? caseData.status
      : 'new';

  const closureAvailable = ['settled', 'referred_out', 'closed'].includes(normalizedCaseStatus);

  const canLoadCase =
    token &&
    !syncError &&
    !syncing &&
    !authLoading &&
    claimant?.id === targetClaimantId &&
    Number.isFinite(targetClaimantId);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!canLoadCase) return;
      setLoading(true);
      setError('');
      try {
        const base = getBaseUrl();
        const res = await fetch(`${base}/api/portal/case`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load case');
        if (!cancelled) setCaseData(data);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load case');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token, canLoadCase]);

  useEffect(() => {
    let cancelled = false;
    if (!canLoadCase) return undefined;
    (async () => {
      setFullDetailLoading(true);
      setFullDetailError('');
      try {
        const base = getBaseUrl();
        const res = await fetch(`${base}/api/portal/full-detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load full case');
        if (!cancelled) {
          setFullDetail(data);
          setEditNotes(data.notes ?? '');
          setEditInjury(data.injury_summary ?? '');
          setEditLiability(data.liability_summary ?? '');
        }
      } catch (e) {
        if (!cancelled) setFullDetailError(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setFullDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, canLoadCase]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!canLoadCase || !caseData?.caseId) return;

      const caseIdNum = String(caseData.caseId).replace(/^CASE-/, '');
      if (!caseIdNum) return;

      setPathwayLoading(true);
      setPathwayError('');
      try {
        const base = getBaseUrl();
        const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/treatment-pathway`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load treatment pathway');
        if (!cancelled) setPathway(data);
      } catch (e) {
        if (!cancelled) setPathwayError(e.message || 'Failed to load treatment pathway');
      } finally {
        if (!cancelled) setPathwayLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [token, canLoadCase, caseData]);

  const fetchDocs = async () => {
    if (!token || !canLoadCase) return;
    setDocsLoading(true);
    setDocsError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load documents');
      setDocs(Array.isArray(data.documents) ? data.documents : []);
    } catch (e) {
      setDocsError(e.message || 'Failed to load documents');
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (canLoadCase) fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canLoadCase]);

  // Additional tab data loads (must stay above any early returns to keep hook order stable)

  const loadInsuranceSummary = async () => {
    if (!token || !caseIdNum) return;
    setInsuranceLoading(true);
    setInsuranceError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/insurance-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || data?.message || `Failed to load insurance summary (${res.status})`;
        throw new Error(msg);
      }
      setInsuranceSummary(data || null);
    } catch (e) {
      setInsuranceError(e.message || 'Failed to load insurance summary');
    } finally {
      setInsuranceLoading(false);
    }
  };

  useEffect(() => {
    loadInsuranceSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, caseIdNum]);

  const loadReferrals = async () => {
    if (!token || !caseIdNum) return;
    setReferralsLoading(true);
    setReferralsError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/referrals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load referrals');
      setReferrals(Array.isArray(data.referrals) ? data.referrals : []);
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (e) {
      setReferralsError(e.message || 'Failed to load referrals');
    } finally {
      setReferralsLoading(false);
    }
  };

  useEffect(() => {
    loadReferrals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, caseIdNum]);

  const patchReferralStatus = async (referralId, nextStatus) => {
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/portal/referrals/${referralId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ referral_status: nextStatus }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update referral');
    return data;
  };

  const loadParticipants = async () => {
    if (!token || !caseIdNum) return;
    setParticipantsLoading(true);
    setParticipantsError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/participants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load participants');
      setParticipantsList(Array.isArray(data) ? data : []);
    } catch (e) {
      setParticipantsError(e.message || 'Failed to load participants');
    } finally {
      setParticipantsLoading(false);
    }
  };

  const loadInjuries = async () => {
    if (!token || !caseIdNum) return;
    setInjuriesLoading(true);
    setInjuriesError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/injuries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load injuries');
      setInjuriesList(Array.isArray(data) ? data : []);
    } catch (e) {
      setInjuriesError(e.message || 'Failed to load injuries');
    } finally {
      setInjuriesLoading(false);
    }
  };

  const loadPolicies = async () => {
    if (!token || !caseIdNum) return;
    setPoliciesLoading(true);
    setPoliciesError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/insurance-policies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load insurance policies');
      setPoliciesList(Array.isArray(data) ? data : []);
    } catch (e) {
      setPoliciesError(e.message || 'Failed to load insurance policies');
    } finally {
      setPoliciesLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !caseIdNum) return;
    loadParticipants();
    loadInjuries();
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, caseIdNum]);

  useEffect(() => {
    if (activeTab !== 'participants') {
      setParticipantModal(null);
      setParticipantModalDraft(EMPTY_PORTAL_PARTICIPANT_DRAFT());
      setParticipantModalSaving(false);
    }
  }, [activeTab]);

  const openParticipantModal = (mode, role, id) => {
    setParticipantsError('');
    if (mode === 'create') {
      setParticipantModal({ mode: 'create', role });
      setParticipantModalDraft(EMPTY_PORTAL_PARTICIPANT_DRAFT());
      return;
    }
    const p = participantsList.find((x) => Number(x.id) === Number(id));
    if (!p) return;
    setParticipantModal({ mode: 'edit', role: String(p.role), id: p.id });
    setParticipantModalDraft(participantRowToDraft(p));
  };

  const closeParticipantModal = () => {
    setParticipantModal(null);
    setParticipantModalDraft(EMPTY_PORTAL_PARTICIPANT_DRAFT());
    setParticipantModalSaving(false);
  };

  const submitParticipantModal = async (e) => {
    e.preventDefault();
    if (!participantModal || !token || !caseIdNum) return;
    const draft = participantModalDraft;
    if (!String(draft.fullName || '').trim()) {
      setParticipantsError('Please enter a name or description.');
      return;
    }
    setParticipantModalSaving(true);
    setParticipantsError('');
    try {
      const base = getBaseUrl();
      const body = {
        fullName: String(draft.fullName).trim(),
        phone: String(draft.phone || '').trim(),
        email: String(draft.email || '').trim(),
        insuranceCarrier: String(draft.insuranceCarrier || '').trim(),
        policyNumber: String(draft.policyNumber || '').trim(),
        vehicleInfo: String(draft.vehicleInfo || '').trim(),
        notes: String(draft.notes || '').trim(),
      };
      if (participantModal.mode === 'create') {
        const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/participants`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: participantModal.role, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to create participant');
      } else {
        const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/participants/${participantModal.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to update participant');
      }
      closeParticipantModal();
      await loadParticipants();
      await loadPolicies();
      await loadInjuries();
      fetch(`${getBaseUrl()}/api/portal/full-detail`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((j) => setFullDetail(j))
        .catch(() => {});
    } catch (err) {
      setParticipantsError(err.message || 'Something went wrong');
    } finally {
      setParticipantModalSaving(false);
    }
  };

  const deleteParticipant = async (id) => {
    if (!token || !caseIdNum) return;
    if (!window.confirm('Delete this participant?')) return;
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/participants/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete participant');
      if (participantModal?.mode === 'edit' && Number(participantModal.id) === Number(id)) {
        closeParticipantModal();
      }
      await loadParticipants();
    } catch (e) {
      alert(e.message || 'Failed to delete');
    }
  };

  const createInjury = async (e) => {
    e.preventDefault();
    if (!token || !caseIdNum) return;
    setInjurySaving(true);
    setInjuriesError('');
    try {
      const base = getBaseUrl();
      const parsedEditingId = Number(editingInjuryId);
      const isEditing = Number.isFinite(parsedEditingId) && parsedEditingId > 0;
      const endpoint = isEditing
        ? `${base}/api/portal/cases/${caseIdNum}/injuries/${parsedEditingId}`
        : `${base}/api/portal/cases/${caseIdNum}/injuries`;
      const res = await fetch(endpoint, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(injuryForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (isEditing ? 'Failed to update injury' : 'Failed to create injury'));
      setInjuryForm(EMPTY_INJURY_FORM());
      setEditingInjuryId(null);
      setInjuryModalOpen(false);
      await loadInjuries();
    } catch (e) {
      setInjuriesError(e.message || (editingInjuryId ? 'Failed to update injury' : 'Failed to create injury'));
    } finally {
      setInjurySaving(false);
    }
  };

  const openCreateInjuryModal = () => {
    setInjuriesError('');
    setEditingInjuryId(null);
    setInjuryForm(EMPTY_INJURY_FORM());
    setInjuryModalOpen(true);
  };

  const beginEditInjury = (injury) => {
    setInjuriesError('');
    setEditingInjuryId(injury.id);
    setInjuryForm({
      bodyPart: injury.body_part || 'neck',
      symptomType: injury.symptom_type || 'pain',
      severityLevel: injury.severity_level || 'mild',
      firstReportedDate: injury.first_reported_date ? String(injury.first_reported_date).slice(0, 10) : '',
      ongoing: injury.ongoing === 1 || injury.ongoing === true,
      priorSimilarInjury: injury.prior_similar_injury === 1 || injury.prior_similar_injury === true,
      notes: injury.notes || '',
    });
    setInjuryModalOpen(true);
  };

  const cancelEditInjury = () => {
    setEditingInjuryId(null);
    setInjuryForm(EMPTY_INJURY_FORM());
    setInjuryModalOpen(false);
    setInjuriesError('');
    setInjuryQuickInput('');
    if (injuryRecognitionRef.current) {
      try {
        injuryRecognitionRef.current.stop();
      } catch (_) {
        // no-op
      }
      injuryRecognitionRef.current = null;
    }
    setInjuryQuickListening(false);
  };

  const applyQuickInjuryInput = () => {
    const parsed = parseQuickInjuryInput(injuryQuickInput, injuryForm);
    if (!parsed) return;
    setInjuryForm(parsed);
  };

  const toggleInjuryMic = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setInjuriesError('Voice input is not supported in this browser.');
      return;
    }

    if (injuryRecognitionRef.current) {
      try {
        injuryRecognitionRef.current.stop();
      } catch (_) {
        // no-op
      }
      injuryRecognitionRef.current = null;
      setInjuryQuickListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    injuryRecognitionRef.current = recognition;
    setInjuryQuickListening(true);

    recognition.onresult = (event) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || '').trim();
      if (!transcript) return;
      setInjuryQuickInput(transcript);
      const parsed = parseQuickInjuryInput(transcript, injuryForm);
      if (parsed) setInjuryForm(parsed);
    };
    recognition.onerror = () => {
      setInjuriesError('Voice capture failed. Please type your injury note instead.');
    };
    recognition.onend = () => {
      injuryRecognitionRef.current = null;
      setInjuryQuickListening(false);
    };

    recognition.start();
  };

  const deleteInjury = async (id) => {
    if (!token || !caseIdNum) return;
    if (!window.confirm('Delete this injury?')) return;
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/injuries/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete injury');
      if (Number(editingInjuryId) === Number(id)) {
        cancelEditInjury();
      }
      await loadInjuries();
    } catch (e) {
      alert(e.message || 'Failed to delete');
    }
  };

  const createPolicy = async (e) => {
    e.preventDefault();
    if (!token || !caseIdNum) return;
    setPolicySaving(true);
    setPoliciesError('');
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/insurance-policies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(policyForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create policy');
      setPolicyForm({
        policyType: 'bodily_injury',
        carrierName: '',
        policyNumber: '',
        claimNumber: '',
        adjusterName: '',
        adjusterEmail: '',
        adjusterPhone: '',
        policyLimitPerPerson: '',
        policyLimitPerOccurrence: '',
      });
      await loadPolicies();
      await loadInsuranceSummary();
    } catch (e) {
      setPoliciesError(e.message || 'Failed to create policy');
    } finally {
      setPolicySaving(false);
    }
  };

  const deletePolicy = async (id) => {
    if (!token || !caseIdNum) return;
    if (!window.confirm('Delete this policy?')) return;
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/insurance-policies/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete policy');
      await loadPolicies();
      await loadInsuranceSummary();
    } catch (e) {
      alert(e.message || 'Failed to delete');
    }
  };

  const openCreatePolicyModal = () => {
    setPolicyModalMode('create');
    setEditingPolicyId(null);
    setPolicyModalError('');
    setPolicyForm({
      policyType: 'bodily_injury',
      carrierName: '',
      policyNumber: '',
      claimNumber: '',
      adjusterName: '',
      adjusterEmail: '',
      adjusterPhone: '',
      policyLimitPerPerson: '',
      policyLimitPerOccurrence: '',
    });
    setPolicyModalOpen(true);
  };

  const openEditPolicyModal = (p) => {
    setPolicyModalMode('edit');
    setEditingPolicyId(p.id);
    setPolicyModalError('');
    setPolicyForm({
      policyType: p.policy_type || 'bodily_injury',
      carrierName: p.carrier_name || '',
      policyNumber: p.policy_number || '',
      claimNumber: p.claim_number || '',
      adjusterName: p.adjuster_name || '',
      adjusterEmail: p.adjuster_email || '',
      adjusterPhone: p.adjuster_phone || '',
      policyLimitPerPerson: p.policy_limit_per_person != null ? String(p.policy_limit_per_person) : '',
      policyLimitPerOccurrence: p.policy_limit_per_occurrence != null ? String(p.policy_limit_per_occurrence) : '',
    });
    setPolicyModalOpen(true);
  };

  const savePolicyModal = async (e) => {
    e.preventDefault();
    if (!token || !caseIdNum) return;
    setPolicySaving(true);
    setPolicyModalError('');
    try {
      const base = getBaseUrl();
      const body = {
        policyType: policyForm.policyType,
        carrierName: policyForm.carrierName || null,
        policyNumber: policyForm.policyNumber || null,
        claimNumber: policyForm.claimNumber || null,
        adjusterName: policyForm.adjusterName || null,
        adjusterEmail: policyForm.adjusterEmail || null,
        adjusterPhone: policyForm.adjusterPhone || null,
        policyLimitPerPerson: policyForm.policyLimitPerPerson !== '' ? Number(policyForm.policyLimitPerPerson) : null,
        policyLimitPerOccurrence:
          policyForm.policyLimitPerOccurrence !== '' ? Number(policyForm.policyLimitPerOccurrence) : null,
      };

      if (policyModalMode === 'edit' && editingPolicyId) {
        const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/insurance-policies/${editingPolicyId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to update policy');
      } else {
        const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/insurance-policies`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to create policy');
      }

      setPolicyModalOpen(false);
      await loadPolicies();
      await loadInsuranceSummary();
    } catch (err) {
      setPolicyModalError(err.message || 'Failed to save policy');
    } finally {
      setPolicySaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (!token || !caseIdNum) return undefined;
    (async () => {
      setClaimSummaryLoading(true);
      setClaimSummaryError('');
      try {
        const base = getBaseUrl();
        const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/claim-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load documentation summary');
        if (!cancelled) setClaimSummary(data || null);
      } catch (e) {
        if (!cancelled) setClaimSummaryError(e.message || 'Failed to load documentation summary');
      } finally {
        if (!cancelled) setClaimSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, caseIdNum]);

  useEffect(() => {
    let cancelled = false;
    if (!token || !caseIdNum) return undefined;
    (async () => {
      setSettlementLoading(true);
      setSettlementError('');
      try {
        const base = getBaseUrl();
        const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/settlement`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load settlement');
        if (!cancelled) setSettlement(data || null);
      } catch (e) {
        if (!cancelled) setSettlementError(e.message || 'Failed to load settlement');
      } finally {
        if (!cancelled) setSettlementLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, caseIdNum]);

  const handleSaveCaseInfo = async (e) => {
    e.preventDefault();
    if (!fullDetail?.id) return;
    setSavingCase(true);
    setSaveCaseError('');
    setSaveCaseOk(false);
    try {
      const base = getBaseUrl();
      const res = await fetch(`${base}/api/portal/cases/${fullDetail.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notes: editNotes,
          injury_summary: editInjury,
          liability_summary: editLiability,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaveCaseOk(true);
      setFullDetail((prev) =>
        prev
          ? {
              ...prev,
              notes: editNotes,
              injury_summary: editInjury,
              liability_summary: editLiability,
            }
          : prev
      );
    } catch (err) {
      setSaveCaseError(err.message || 'Save failed');
    } finally {
      setSavingCase(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadError('');
    setUploadSuccess('');
    try {
      const base = getBaseUrl();
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('docType', uploadDocType);
      const res = await fetch(`${base}/api/portal/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setUploadSuccess(`"${data.file_name}" uploaded successfully.`);
      setUploadFile(null);
      setUploadDocType('other');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchDocs();
    } catch (e) {
      setUploadError(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (syncError) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm ring-1 ring-red-200/70">
          <p className="text-sm text-red-800 font-medium">{syncError}</p>
          <Link
            to="/portal/dashboard"
            className="inline-block mt-4 text-sm font-semibold text-lime-900 hover:underline"
          >
            ← Back to my cases
          </Link>
        </div>
      </div>
    );
  }

  if (syncing || authLoading || !claimant || claimant.id !== targetClaimantId) {
    return (
      <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-sm ring-1 ring-slate-200/60">
        <LoadingBlock message="Loading case…" />
      </div>
    );
  }

  const activeCaseRow = cases.find((c) => c.claimantId === targetClaimantId);
  const activeCaseLabel =
    activeCaseRow?.caseId != null ? `Case #${activeCaseRow.caseId}` : 'Case details';

  const statusUpper = String(normalizedCaseStatus).replace(/_/g, ' ').toUpperCase();

  return (
    <div className="pb-10">
      <header className="pb-1">
        <Link
          to="/portal/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-lime-800"
        >
          <span aria-hidden className="text-base leading-none">
            ←
          </span>
          My cases
        </Link>

        <div className="mt-2.5 rounded-2xl bg-gradient-to-br from-slate-50 via-slate-50/90 to-slate-100/60 px-4 py-3.5 shadow-sm ring-1 ring-slate-200/60 sm:px-5 sm:py-4 lg:mt-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-slate-200/70 pb-3 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5 lg:shrink-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {caseIdNum ? `Case #${caseIdNum}` : activeCaseLabel}
              </h1>
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:px-3 sm:py-1 sm:text-[11px] ${
                  normalizedCaseStatus === 'accepted'
                    ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/70'
                    : 'bg-white/80 text-slate-800 ring-1 ring-slate-200/80'
                }`}
              >
                {statusUpper}
              </span>
            </div>

            <div
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2 text-sm text-slate-700 sm:gap-x-3 sm:text-base lg:gap-x-4"
              title={
                caseData?.accidentType || caseData?.dateOfLoss || claimant?.fullName || claimant?.email
                  ? [
                      caseData?.accidentType,
                      caseData?.dateOfLoss ? formatISODate(caseData.dateOfLoss) : null,
                      claimant?.fullName,
                      claimant?.email,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : undefined
              }
            >
              <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 sm:max-w-[min(100%,20rem)] lg:max-w-[14rem] xl:max-w-xs">
                <IconCaseIncident />
                <span className="truncate font-medium text-slate-900">{caseData?.accidentType || '—'}</span>
              </span>
              <span className="hidden text-slate-300 sm:inline" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <IconCalendar />
                <span className="text-slate-800">
                  {caseData?.dateOfLoss ? formatISODate(caseData.dateOfLoss) : 'No date of loss'}
                </span>
              </span>
              <span className="hidden text-slate-300 sm:inline" aria-hidden>
                ·
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <IconUser />
                <span className="shrink-0 font-semibold text-slate-900">{claimant?.fullName || '—'}</span>
              </span>
              {claimant?.email ? (
                <>
                  <span className="hidden text-slate-300 lg:inline" aria-hidden>
                    ·
                  </span>
                  <span className="inline-flex min-w-0 max-w-full flex-1 items-center gap-1.5 lg:min-w-[8rem]">
                    <IconEnvelope />
                    <span className="min-w-0 break-all text-slate-700 lg:truncate">{claimant.email}</span>
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mt-5 flex flex-col gap-6 sm:mt-6 lg:flex-row lg:items-start lg:gap-8">
        <aside className="w-full shrink-0 lg:w-72 xl:w-80 lg:sticky lg:top-16 lg:z-10 lg:max-h-[calc(100vh-4.5rem)] lg:overflow-y-auto overflow-x-auto lg:overflow-x-hidden">
          <nav
            className="rounded-2xl border border-white/10 bg-[#174049] p-2.5 shadow-lg shadow-black/20"
            aria-label="Case sections"
          >
            <p className="px-3 pt-1.5 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Navigate
            </p>
            <ul className="space-y-0.5 pb-0.5">
              {CASE_TABS.map((tab, index) => {
                const isActive = activeTab === tab.id;
                const n = index + 1;
                return (
                  <li key={tab.id}>
                    <button
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full rounded-lg px-2.5 py-2.5 text-left text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-lime-400 text-slate-900 shadow-md'
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
          <div
            className={
              activeTab === 'participants'
                ? 'p-3 sm:p-4'
                : activeTab === 'overview'
                  ? 'p-6 sm:p-8'
                  : 'p-4 sm:p-5'
            }
          >
          {activeTab === 'overview' ? (
            <>
              {loading ? (
                <LoadingInline message="Loading case details…" />
              ) : error ? (
                <div className="text-sm text-red-700 bg-red-50 rounded-xl p-3 ring-1 ring-red-200/70">{error}</div>
              ) : caseData ? (
                (() => {
                  const statuteRefDate = !fullDetail?.statute_deadline
                    ? statutePlanningReference(fullDetail?.date_of_loss || caseData.dateOfLoss)
                    : null;
                  const fromRecords = summarizeInjuriesFromRecords(fullDetail?.injuries || []);
                  const injuryNarrative =
                    (fullDetail?.injury_summary && String(fullDetail.injury_summary).trim()) || fromRecords;
                  const showCompiledNote = !(fullDetail?.injury_summary && String(fullDetail.injury_summary).trim()) && !!fromRecords;

                  return (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Jurisdiction State</label>
                          <p className="text-gray-900 mt-1">{fullDetail?.jurisdiction_state || 'Not set'}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Statute Deadline</label>
                          {fullDetail?.statute_deadline ? (
                            <p className="text-gray-900 mt-1 font-medium">
                              {new Date(fullDetail.statute_deadline).toLocaleDateString()}
                            </p>
                          ) : (
                            <div className="mt-1">
                              <p className="text-gray-600">Not set on file</p>
                              {statuteRefDate ? (
                                <div className="mt-2 rounded-lg bg-amber-50/90 p-3 text-xs text-amber-950 ring-1 ring-amber-200/60">
                                  <span className="font-semibold">Planning reference only:</span>{' '}
                                  {statuteRefDate.toLocaleDateString()} (2 years after date of loss). Limitations law
                                  varies by state and claim type — confirm with counsel and save the official deadline on
                                  the case when known.
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Estimated Severity</label>
                          <p className="text-gray-900 mt-1">
                            {fullDetail?.estimated_severity_score != null ? `${fullDetail.estimated_severity_score}/100` : '—'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Risk Score</label>
                          <p className="text-gray-900 mt-1">{fullDetail?.risk_score != null ? `${fullDetail.risk_score}/100` : '—'}</p>
                        </div>

                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700">Insurance Coverage Note</label>
                          <div className="mt-2 rounded-xl bg-slate-50/90 p-4">
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
                        <p className="text-gray-900 mt-1 whitespace-pre-wrap">{fullDetail?.liability_summary || 'No summary'}</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">Injury Summary</label>
                        <p className="text-gray-900 mt-1 whitespace-pre-wrap">
                          {injuryNarrative || 'No summary — add injuries on the Injuries tab or enter a narrative.'}
                        </p>
                        {showCompiledNote ? (
                          <p className="text-xs text-gray-500 mt-2">
                            Compiled from structured injury records (the narrative field on the case is still empty).
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-sm text-gray-600">No case found.</p>
              )}
            </>
          ) : null}

          {activeTab === 'participants' ? (
            <div className="space-y-4">
              {participantsError ? (
                <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 ring-1 ring-red-200/70">
                  {participantsError}
                </p>
              ) : null}

              {participantsLoading ? (
                <LoadingInline message="Loading participants…" />
              ) : (
                <>
                  {participantsList.some((p) => String(p.role) === 'claimant') ? (
                    <div className="rounded-lg bg-emerald-50/90 px-3 py-2 text-sm text-emerald-950 ring-1 ring-emerald-200/60">
                      <span className="font-semibold">Claimant on record: </span>
                      {participantsList
                        .filter((p) => String(p.role) === 'claimant')
                        .map((p) => p.full_name)
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </div>
                  ) : null}

                  {PORTAL_PARTICIPANT_SECTIONS.map((section) => {
                    const inSection = participantsList.filter((p) => String(p.role) === section.role);

                    return (
                      <section
                        key={section.id}
                        className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 bg-gradient-to-r from-slate-50 to-slate-100/70 px-4 py-3">
                          <div className="min-w-0">
                            <h3 className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-lime-100 ring-1 ring-lime-200/80">
                                <ParticipantSectionIcon role={section.role} />
                              </span>
                              <span>{section.title}</span>
                            </h3>
                            <p className="text-xs text-slate-600 mt-0.5">{section.subtitle}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openParticipantModal('create', section.role)}
                            className="shrink-0 rounded-full bg-lime-400 px-3.5 py-1.5 text-xs font-bold text-slate-900 shadow-sm shadow-lime-400/35 transition hover:bg-lime-300 focus:outline-none focus:ring-2 focus:ring-lime-500/45"
                          >
                            + Add New
                          </button>
                        </div>

                        {inSection.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-slate-500">No entries yet.</p>
                        ) : (
                          <ul className="divide-y divide-slate-100 bg-white">
                            {inSection.map((p) => (
                              <li key={p.id} className="px-4 py-3 transition-colors hover:bg-slate-50/70">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">{p.full_name || '—'}</p>
                                    <p className="text-xs text-slate-600 mt-0.5">
                                      {[p.phone, p.email].filter(Boolean).join(' · ') || '—'}
                                    </p>
                                    {p.vehicle_info ? (
                                      <p className="text-xs text-slate-700 mt-1.5">
                                        <span className="font-semibold text-slate-600">Vehicle: </span>
                                        {p.vehicle_info}
                                      </p>
                                    ) : null}
                                    {p.insurance_carrier || p.policy_number ? (
                                      <p className="text-xs text-slate-700 mt-0.5">
                                        <span className="font-semibold text-slate-600">Insurance: </span>
                                        {[p.insurance_carrier, p.policy_number].filter(Boolean).join(' · ') || '—'}
                                      </p>
                                    ) : null}
                                    {p.notes ? (
                                      <p className="text-xs text-slate-700 mt-1.5 whitespace-pre-wrap">{p.notes}</p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openParticipantModal('edit', section.role, p.id)}
                                      className="rounded-full bg-lime-50 px-2.5 py-1 text-xs font-semibold text-lime-900 ring-1 ring-lime-200/70 hover:bg-lime-100"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteParticipant(p.id)}
                                      className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200/70 hover:bg-red-100"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    );
                  })}

                  {participantsList.some(
                    (p) => !PORTAL_SECTION_ROLE_SET.has(String(p.role)) && String(p.role) !== 'claimant'
                  ) ? (
                    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-amber-200/70">
                      <div className="border-b border-amber-200/60 bg-gradient-to-r from-amber-50/85 to-amber-100/60 px-4 py-3">
                        <h3 className="flex items-center gap-2.5 text-base font-bold tracking-tight text-slate-900">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 ring-1 ring-amber-200/80">
                            <ParticipantSectionIcon role="other" />
                          </span>
                          <span>Other contacts on file</span>
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          From your legal team or an older form. Edit or remove duplicates here.
                        </p>
                      </div>
                      <ul className="divide-y divide-amber-100/80 bg-white">
                        {participantsList
                          .filter(
                            (p) =>
                              !PORTAL_SECTION_ROLE_SET.has(String(p.role)) && String(p.role) !== 'claimant'
                          )
                          .map((p) => (
                            <li key={p.id} className="px-4 py-3 transition-colors hover:bg-amber-50/30">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900">
                                    {p.full_name || '—'}{' '}
                                    <span className="text-xs font-semibold text-slate-500">
                                      · {String(p.role || '').replace(/_/g, ' ')}
                                    </span>
                                  </p>
                                  <p className="text-xs text-slate-600 mt-0.5">
                                    {[p.phone, p.email].filter(Boolean).join(' · ') || '—'}
                                  </p>
                                  {p.notes ? (
                                    <p className="text-xs text-slate-700 mt-1.5 whitespace-pre-wrap">{p.notes}</p>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openParticipantModal('edit', String(p.role), p.id)}
                                    className="rounded-full bg-lime-50 px-2.5 py-1 text-xs font-semibold text-lime-900 ring-1 ring-lime-200/70 hover:bg-lime-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteParticipant(p.id)}
                                    className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200/70 hover:bg-red-100"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))}
                      </ul>
                    </section>
                  ) : null}

                  {participantModal && caseIdNum ? (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                      role="presentation"
                      onClick={(e) => {
                        if (e.target === e.currentTarget) closeParticipantModal();
                      }}
                    >
                      <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/70"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="participant-modal-title"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(() => {
                          const modalSection = getPortalParticipantSectionConfig(participantModal.role);
                          const fieldClass =
                            'w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45';
                          const draft = participantModalDraft;
                          return (
                            <>
                              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                <h2 id="participant-modal-title" className="text-lg font-bold text-slate-900">
                                  {participantModal.mode === 'create' ? 'Add' : 'Edit'} — {modalSection.title}
                                </h2>
                                <button
                                  type="button"
                                  onClick={closeParticipantModal}
                                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                  aria-label="Close"
                                >
                                  <span className="text-xl leading-none" aria-hidden>
                                    ×
                                  </span>
                                </button>
                              </div>
                              <form onSubmit={submitParticipantModal} className="space-y-3 p-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                  <div className="md:col-span-2">
                                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                                      {modalSection.nameLabel}
                                    </label>
                                    <input
                                      value={draft.fullName}
                                      onChange={(e) =>
                                        setParticipantModalDraft((d) => ({ ...d, fullName: e.target.value }))
                                      }
                                      className={fieldClass}
                                      required
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-600">Phone</label>
                                    <input
                                      value={draft.phone}
                                      onChange={(e) =>
                                        setParticipantModalDraft((d) => ({ ...d, phone: e.target.value }))
                                      }
                                      className={fieldClass}
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-600">Email</label>
                                    <input
                                      value={draft.email}
                                      onChange={(e) =>
                                        setParticipantModalDraft((d) => ({ ...d, email: e.target.value }))
                                      }
                                      className={fieldClass}
                                    />
                                  </div>
                                  {modalSection.showInsurance ? (
                                    <>
                                      <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">
                                          Insurance carrier
                                        </label>
                                        <input
                                          value={draft.insuranceCarrier}
                                          onChange={(e) =>
                                            setParticipantModalDraft((d) => ({
                                              ...d,
                                              insuranceCarrier: e.target.value,
                                            }))
                                          }
                                          className={fieldClass}
                                        />
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">
                                          Policy number
                                        </label>
                                        <input
                                          value={draft.policyNumber}
                                          onChange={(e) =>
                                            setParticipantModalDraft((d) => ({
                                              ...d,
                                              policyNumber: e.target.value,
                                            }))
                                          }
                                          className={fieldClass}
                                        />
                                      </div>
                                    </>
                                  ) : null}
                                  <div className="md:col-span-2">
                                    <label className="mb-1 block text-xs font-semibold text-slate-600">
                                      {modalSection.role === 'other_vehicle'
                                        ? 'Plate, color, or extra vehicle details'
                                        : 'Vehicle info'}
                                    </label>
                                    <input
                                      value={draft.vehicleInfo}
                                      onChange={(e) =>
                                        setParticipantModalDraft((d) => ({ ...d, vehicleInfo: e.target.value }))
                                      }
                                      className={fieldClass}
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <label className="mb-1 block text-xs font-semibold text-slate-600">Notes</label>
                                    <textarea
                                      value={draft.notes}
                                      onChange={(e) =>
                                        setParticipantModalDraft((d) => ({ ...d, notes: e.target.value }))
                                      }
                                      rows={2}
                                      className={fieldClass}
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                                  <button
                                    type="button"
                                    onClick={closeParticipantModal}
                                    className="rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200/80 hover:bg-slate-100"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={participantModalSaving}
                                    className="inline-flex items-center rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300 disabled:opacity-50"
                                  >
                                    {participantModalSaving
                                      ? 'Saving…'
                                      : participantModal.mode === 'create'
                                        ? 'Add'
                                        : 'Save changes'}
                                  </button>
                                </div>
                              </form>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {activeTab === 'injuries' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Injuries</h3>
                <button
                  type="button"
                  onClick={openCreateInjuryModal}
                  className="inline-flex items-center rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300"
                >
                  + Add New
                </button>
              </div>

              {injuriesError ? (
                <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 ring-1 ring-red-200/70">{injuriesError}</p>
              ) : null}

              {injuriesLoading ? (
                <LoadingInline message="Loading injuries…" />
              ) : injuriesList.length === 0 ? (
                <div className="rounded-xl bg-white px-4 py-8 text-center text-sm text-gray-600 shadow-sm ring-1 ring-slate-100/90">
                  No injuries found.
                </div>
              ) : (
                <div className="rounded-xl bg-white overflow-hidden shadow-sm">
                  <div className="px-3 py-2.5 border-b border-slate-100/90">
                    <h3 className="text-sm font-semibold text-gray-900">Injuries</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <th className="px-3 py-2.5">Body Part</th>
                          <th className="px-3 py-2.5">Symptom</th>
                          <th className="px-3 py-2.5">Severity</th>
                          <th className="px-3 py-2.5">First Reported</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {injuriesList.map((inj) => {
                          const status = inj.ongoing === 1 || inj.ongoing === true ? 'Ongoing' : 'Resolved';
                          const first = inj.first_reported_date ? String(inj.first_reported_date).slice(0, 10) : '';
                          return (
                            <tr key={inj.id} className="hover:bg-gray-50/60">
                              <td className="px-3 py-2.5 text-gray-900">{inj.body_part ? providerTypeLabel(inj.body_part) : '—'}</td>
                              <td className="px-3 py-2.5 text-gray-700">{inj.symptom_type ? providerTypeLabel(inj.symptom_type) : '—'}</td>
                              <td className="px-3 py-2.5 text-gray-700">{inj.severity_level ? providerTypeLabel(inj.severity_level) : '—'}</td>
                              <td className="px-3 py-2.5 text-gray-700">{first || '—'}</td>
                              <td className="px-3 py-2.5 text-gray-700">{status}</td>
                              <td className="px-3 py-2.5 text-right space-x-3">
                                <button
                                  type="button"
                                  onClick={() => beginEditInjury(inj)}
                                  className="text-xs font-semibold text-slate-700 hover:underline"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteInjury(inj.id)}
                                  className="text-xs font-semibold text-red-700 hover:underline"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {injuryModalOpen ? (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                  role="dialog"
                  aria-modal="true"
                >
                  <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/70">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                      <h3 className="text-base font-semibold text-slate-900">
                        {editingInjuryId ? 'Edit Injury' : 'Add Injury'}
                      </h3>
                      <button
                        type="button"
                        onClick={cancelEditInjury}
                        className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Close injury modal"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={createInjury} className="space-y-3 p-4 sm:p-5">
                      <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3">
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Quick injury capture</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={injuryQuickInput}
                            onChange={(e) => setInjuryQuickInput(e.target.value)}
                            placeholder='e.g. "Document C4-C5 herniation and flag as injury"'
                            className="flex-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          />
                          <button
                            type="button"
                            onClick={applyQuickInjuryInput}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={toggleInjuryMic}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                              injuryQuickListening
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                            }`}
                          >
                            {injuryQuickListening ? 'Stop Mic' : 'Use Mic'}
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">
                          Parses body part, symptom, severity and notes from your quick text/voice input.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Body Part</label>
                          <select
                            value={injuryForm.bodyPart}
                            onChange={(e) => setInjuryForm((p) => ({ ...p, bodyPart: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          >
                            <option value="neck">Neck</option>
                            <option value="low_back">Low Back</option>
                            <option value="mid_back">Mid Back</option>
                            <option value="shoulder">Shoulder</option>
                            <option value="knee">Knee</option>
                            <option value="head">Head</option>
                            <option value="wrist">Wrist</option>
                            <option value="ankle">Ankle</option>
                            <option value="hip">Hip</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Symptom</label>
                          <select
                            value={injuryForm.symptomType}
                            onChange={(e) => setInjuryForm((p) => ({ ...p, symptomType: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          >
                            <option value="pain">Pain</option>
                            <option value="numbness">Numbness</option>
                            <option value="tingling">Tingling</option>
                            <option value="headaches">Headaches</option>
                            <option value="weakness">Weakness</option>
                            <option value="limited_motion">Limited Motion</option>
                            <option value="loss_of_consciousness">Loss of Consciousness</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Severity</label>
                          <select
                            value={injuryForm.severityLevel}
                            onChange={(e) => setInjuryForm((p) => ({ ...p, severityLevel: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          >
                            <option value="mild">Mild</option>
                            <option value="moderate">Moderate</option>
                            <option value="severe">Severe</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">First Reported</label>
                          <input
                            type="date"
                            value={injuryForm.firstReportedDate}
                            onChange={(e) => setInjuryForm((p) => ({ ...p, firstReportedDate: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-6">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={!!injuryForm.ongoing}
                            onChange={(e) => setInjuryForm((p) => ({ ...p, ongoing: e.target.checked }))}
                          />
                          Ongoing
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={!!injuryForm.priorSimilarInjury}
                            onChange={(e) => setInjuryForm((p) => ({ ...p, priorSimilarInjury: e.target.checked }))}
                          />
                          Prior similar injury
                        </label>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
                        <textarea
                          value={injuryForm.notes}
                          onChange={(e) => setInjuryForm((p) => ({ ...p, notes: e.target.value }))}
                          rows={2}
                          className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          placeholder="Optional"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={cancelEditInjury}
                          className="rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-slate-200/80 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={injurySaving}
                          className="inline-flex items-center rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300 disabled:opacity-50"
                        >
                          {injurySaving ? (editingInjuryId ? 'Saving…' : 'Adding…') : editingInjuryId ? 'Save Changes' : 'Add Injury'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'insurance' ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50/85 p-3 sm:p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Primary BI Coverage</div>
                    <div className="text-xl font-bold text-gray-900 mt-1">
                      {formatCurrency(insuranceSummary?.primaryBodyilyInjury?.totalBiLimitPerPerson)}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      <span className="font-semibold">Med-Pay Available:</span>{' '}
                      {insuranceSummary?.medpayAvailable ? 'Yes' : 'No'}
                      {' · '}
                      <span className="font-semibold">Verification Status:</span>{' '}
                      {Number(insuranceSummary?.verifiedCount || 0)} of {Number(insuranceSummary?.totalPolicies || 0)} policies verified
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full ring-1 px-3 py-1 text-xs font-semibold ${getBandColor(
                      insuranceSummary?.primaryBodyilyInjury?.policy_band || 'unknown'
                    )}`}
                  >
                    {String(insuranceSummary?.primaryBodyilyInjury?.policy_band || 'unknown').replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>

                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  {(() => {
                    const total = Number(insuranceSummary?.totalPolicies || 0);
                    const verified = Number(insuranceSummary?.verifiedCount || 0);
                    const pct = total > 0 ? Math.round((verified / total) * 100) : 0;
                    return (
                      <div className="h-3 bg-lime-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                    );
                  })()}
                </div>

                {insuranceLoading ? (
                  <div className="pt-1">
                    <LoadingInline message="Loading coverage note…" />
                  </div>
                ) : insuranceError ? (
                  <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 ring-1 ring-red-200/70">
                    {insuranceError}
                  </div>
                ) : insuranceSummary?.coverageNote ? (
                  <div className="text-sm text-gray-800 whitespace-pre-wrap pt-1">{insuranceSummary.coverageNote}</div>
                ) : null}
              </div>

              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-gray-900">Policies</div>
                <button
                  type="button"
                  onClick={openCreatePolicyModal}
                  className="inline-flex items-center gap-2 rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300"
                >
                  + Add Policy
                </button>
              </div>

              {policiesError ? (
                <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 ring-1 ring-red-200/70">{policiesError}</p>
              ) : null}

              {policiesLoading ? (
                <LoadingInline message="Loading policies…" />
              ) : policiesList.length === 0 ? (
                <p className="text-sm text-gray-600">No insurance policies on file.</p>
              ) : (
                <div className="space-y-4">
                  {policiesList.map((p) => {
                    const band = p.policy_band || insuranceSummary?.primaryBodyilyInjury?.policy_band || 'unknown';
                    return (
                      <div key={p.id} className="rounded-xl bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-700 rounded-full px-2 py-0.5 bg-slate-100 ring-1 ring-slate-200/70">
                                {policyTypeLabel(p.policy_type || 'policy')}
                              </span>
                              <span className={`text-[10px] font-bold rounded-full ring-1 px-2 py-0.5 ${getBandColor(band)}`}>
                                {String(band).replace(/_/g, ' ').toUpperCase()}
                              </span>
                            </div>
                            <div className="text-sm font-bold text-gray-900">
                              {p.carrier_name || 'Policy'} {p.policy_number ? `(${p.policy_number})` : ''}
                            </div>
                            <div className="text-xs text-gray-600">
                              Limits: {p.policy_limit_per_person != null ? formatCurrency(p.policy_limit_per_person) : '—'} per person,{' '}
                              {p.policy_limit_per_occurrence != null ? formatCurrency(p.policy_limit_per_occurrence) : '—'} per occurrence
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                              <input
                                type="checkbox"
                                checked={!!p.coverage_verified}
                                onChange={async (e) => {
                                  try {
                                    const base = getBaseUrl();
                                    const res = await fetch(`${base}/api/portal/cases/${caseIdNum}/insurance-policies/${p.id}`, {
                                      method: 'PATCH',
                                      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ coverageVerified: e.target.checked }),
                                    });
                                    const data = await res.json().catch(() => ({}));
                                    if (!res.ok) throw new Error(data.error || 'Failed to update verification');
                                    await loadPolicies();
                                    await loadInsuranceSummary();
                                  } catch (err) {
                                    alert(err.message || 'Failed to update');
                                  }
                                }}
                              />
                              Verified
                            </label>
                            <div className="flex items-center gap-3 text-xs">
                              <button
                                type="button"
                                onClick={() => openEditPolicyModal(p)}
                                className="font-semibold text-lime-900 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => deletePolicy(p.id)}
                                className="font-semibold text-red-700 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {policyModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl ring-1 ring-slate-200/70">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="text-lg font-bold text-gray-900">
                        {policyModalMode === 'edit' ? 'Edit Policy' : 'Add Policy'}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPolicyModalOpen(false)}
                        className="text-sm font-semibold text-gray-600 hover:text-gray-900"
                      >
                        Close
                      </button>
                    </div>

                    <form onSubmit={savePolicyModal} className="p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Policy type</label>
                          <select
                            value={policyForm.policyType}
                            onChange={(e) => setPolicyForm((p) => ({ ...p, policyType: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          >
                            <option value="bodily_injury">Bodily Injury</option>
                            <option value="property_damage">Property Damage</option>
                            <option value="medpay">Med-Pay</option>
                            <option value="uim_um">UIM / UM</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Carrier</label>
                          <input
                            value={policyForm.carrierName}
                            onChange={(e) => setPolicyForm((p) => ({ ...p, carrierName: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Policy #</label>
                          <input
                            value={policyForm.policyNumber}
                            onChange={(e) => setPolicyForm((p) => ({ ...p, policyNumber: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Claim #</label>
                          <input
                            value={policyForm.claimNumber}
                            onChange={(e) => setPolicyForm((p) => ({ ...p, claimNumber: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Adjuster name</label>
                          <input
                            value={policyForm.adjusterName}
                            onChange={(e) => setPolicyForm((p) => ({ ...p, adjusterName: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Adjuster email</label>
                          <input
                            value={policyForm.adjusterEmail}
                            onChange={(e) => setPolicyForm((p) => ({ ...p, adjusterEmail: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Limit per person</label>
                          <input
                            value={policyForm.policyLimitPerPerson}
                            onChange={(e) => setPolicyForm((p) => ({ ...p, policyLimitPerPerson: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                            inputMode="numeric"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Limit per occurrence</label>
                          <input
                            value={policyForm.policyLimitPerOccurrence}
                            onChange={(e) => setPolicyForm((p) => ({ ...p, policyLimitPerOccurrence: e.target.value }))}
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                            inputMode="numeric"
                          />
                        </div>
                      </div>

                      {policyModalError ? (
                        <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 ring-1 ring-red-200/70">
                          {policyModalError}
                        </p>
                      ) : null}

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setPolicyModalOpen(false)}
                          className="rounded-lg bg-slate-50 px-4 py-2 text-sm font-semibold text-gray-800 ring-1 ring-slate-200/80 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={policySaving}
                          className="inline-flex items-center justify-center rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300 disabled:opacity-50"
                        >
                          {policySaving ? 'Saving…' : policyModalMode === 'edit' ? 'Save Changes' : 'Save Policy'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'treatment' ? (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50/85 p-3 sm:p-4">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Suggested Referrals</h2>
                <p className="text-sm text-gray-600">Auto-mapped based on documented injuries.</p>

                {referralsLoading ? (
                  <div className="mt-4 rounded-lg bg-white px-3 py-2.5 shadow-sm">
                    <LoadingInline message="Loading referral data…" />
                  </div>
                ) : referralsError ? (
                  <div className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2 ring-1 ring-red-200/60">
                    {referralsError}
                  </div>
                ) : suggestions.length === 0 ? (
                  <div className="mt-4 text-sm text-gray-600">No suggestions available yet.</div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {suggestions.map((s) => (
                      <div key={s.id} className="rounded-xl bg-white p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {s.provider_name}{' '}
                              <span className="text-gray-500 font-normal">
                                ({providerTypeLabel(s.provider_type)})
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              Injury mapping:{' '}
                              {(s.injury_ids || [])
                                .map((id) => (injuriesList || []).find((x) => Number(x.id) === Number(id)))
                                .filter(Boolean)
                                .map((inj) =>
                                  [providerTypeLabel(inj.body_part), inj.symptom_type, inj.severity_level]
                                    .filter(Boolean)
                                    .join(' • ')
                                )
                                .join(', ') || '—'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await patchReferralStatus(s.id, 'scheduled');
                                await loadReferrals();
                              } catch (e) {
                                alert(e.message || 'Failed to schedule');
                              }
                            }}
                            className="px-3 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                          >
                            Schedule
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-slate-50/85 p-3 sm:p-4">
                <h2 className="text-lg font-bold text-gray-900 mb-1">Referral Status Tracker</h2>
                <p className="text-sm text-gray-600">Track suggested → scheduled → completed referral outcomes.</p>

                {referralsLoading ? (
                  <div className="mt-4 rounded-lg bg-white px-3 py-2.5 shadow-sm">
                    <LoadingInline message="Loading referrals…" />
                  </div>
                ) : referrals.length === 0 ? (
                  <div className="mt-4 text-sm text-gray-600">No referrals yet.</div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {referrals.map((r) => (
                      <div key={r.id} className="rounded-xl bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {r.provider_name}{' '}
                              <span className="text-gray-500 font-normal">
                                ({providerTypeLabel(r.provider_type)})
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              Injury mapping:{' '}
                              {(r.injury_ids || [])
                                .map((id) => (injuriesList || []).find((x) => Number(x.id) === Number(id)))
                                .filter(Boolean)
                                .map((inj) =>
                                  [providerTypeLabel(inj.body_part), inj.symptom_type, inj.severity_level]
                                    .filter(Boolean)
                                    .join(' • ')
                                )
                                .join(', ') || '—'}
                            </div>
                            {r.notes ? (
                              <div className="text-xs text-gray-700 mt-2 whitespace-pre-wrap">{r.notes}</div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-flex items-center rounded-full ring-1 px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClasses(
                                r.referral_status
                              )}`}
                            >
                              {referralStatusLabel(r.referral_status || 'suggested')}
                            </span>
                            <select
                              value={r.referral_status || 'suggested'}
                              onChange={async (e) => {
                                try {
                                  await patchReferralStatus(r.id, e.target.value);
                                  await loadReferrals();
                                } catch (err) {
                                  alert(err.message || 'Failed to update');
                                }
                              }}
                              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold ring-1 ring-slate-200/90 focus:outline-none focus:ring-2 focus:ring-lime-400/45"
                            >
                              {['suggested', 'scheduled', 'completed', 'declined', 'no_response'].map((s) => (
                                <option key={s} value={s}>
                                  {referralStatusLabel(s)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeTab === 'timeline' ? (
            <VisitsTimeline caseId={caseIdNum} apiPrefix="/api/portal" token={token} />
          ) : null}

          {activeTab === 'documents' ? (
            <CaseDocumentsTab caseId={caseIdNum} apiPrefix="/api/portal" token={token} allowStatusChange={false} />
          ) : null}

          {activeTab === 'red_flags' ? (
            <CaseRedFlagsTab caseId={caseIdNum} apiPrefix="/api/portal" token={token} />
          ) : null}

          {activeTab === 'documentation_summary' ? (
            <ClaimDocumentBuilder caseId={caseIdNum} apiPrefix="/api/portal" token={token} />
          ) : null}

          {activeTab === 'settlement' ? (
            <SettlementTab caseId={caseIdNum} apiPrefix="/api/portal" token={token} readOnly />
          ) : null}
          </div>
        </div>
      </div>

      {/* Note: Case record, Treatment Pathway, and Documents are now shown only inside their tabs. */}

      {closureAvailable ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm ring-1 ring-slate-200/55">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Case Closure Summary</h2>
          <p className="text-sm text-gray-600 mb-4">Your final case organization record is available for review.</p>
          <Link
            to="/portal/case-closure"
            className="inline-flex items-center gap-2 rounded-full bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-lime-400/25 hover:bg-lime-300"
          >
            View Closure Summary
          </Link>
        </div>
      ) : null}
    </div>
  );
}
