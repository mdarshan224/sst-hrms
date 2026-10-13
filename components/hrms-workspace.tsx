"use client";
import {
  workspaceLinks,
  workspacePath,
  slugFromName,
  workspaceSlug,
} from "@/lib/hrms/workspace-links";
import BrandImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  Building2,
  ShieldCheck,
  Settings2,
  ScrollText,
  ChevronDown,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  X,
  Download,
  LogOut,
  Check,
  Clock3,
  Layers3,
  CheckCircle2,
  Copy,
  RefreshCw,
  Menu,
  CircleHelp,
  Sparkles,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import EmployeePicker from "./hrms-employee-picker";
import RoleDashboard, { modeLabels } from "./hrms-role-dashboard";
import WorkflowAdmin from "./hrms-workflow-admin";
import Notifications from "./hrms-notifications";
import Operations from "./hrms-operations";
import RecruitmentOperations from "./hrms-recruitment-operations";
import ProfileTabs from "./hrms-profile-tabs";
import Documents from "./hrms-documents";
import Verification from "./hrms-verification";
import DomainSettings from "./hrms-domains";
import BrandingSettings from "./hrms-branding";
import { platformBrand, accentText } from "@/lib/hrms/branding";
import AccountSecurity from "./hrms-account-security";
import { csvCell } from "@/lib/hrms/domain";

type Row = Record<string, string | number | null>;
type Boot = {
  user: { userId: string; email: string; mobile: string; displayName: string };
  platform: boolean;
  permissions: string[];
  workspaces: Row[];
};
type Page = {
  requestKey?: string;
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
type Stats = {
  employeeTotal: number | null;
  employeeActive: number | null;
  candidateTotal: number | null;
  candidateActive: number | null;
  openJobs: number | null;
  stageCounts: Record<string, number>;
  departmentCounts: Record<string, number>;
  branchCounts: Record<string, number>;
};
type Data = {
  dashboardModes: string[];
  stats: Stats;
  tenant: Row;
  employees: Row[];
  jobs: Row[];
  candidates: Row[];
  branches: Row[];
  departments: Row[];
  roles: Row[];
  memberships: Row[];
  invitations: Row[];
  audit: Row[];
};
type Platform = { tenants: Row[]; plans: Row[]; audit: Row[] };
type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string;
  options?: { value: string; label: string }[];
  hint?: string;
};
type Dialog = {
  title: string;
  description: string;
  action: string;
  fields: Field[];
  extra?: Record<string, unknown>;
};
type Stage = { id: string; label: string; next: string[] };
const nav: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "people", label: "People directory", icon: Users },
  { id: "recruitment", label: "Recruitment", icon: BriefcaseBusiness },
  { id: "onboarding", label: "Onboarding", icon: CheckCircle2 },
  { id: "organization", label: "Organization", icon: Building2 },
  { id: "access", label: "Roles & access", icon: ShieldCheck },
  { id: "audit", label: "Activity log", icon: ScrollText },
  { id: "settings", label: "Workspace settings", icon: Settings2 },
  { id: "security", label: "Account security", icon: ShieldCheck },
];
const initials = (n: unknown) =>
  String(n ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const formatDate = (v: unknown, locale: string, timezone: string) =>
  new Date(String(v)).toLocaleDateString(locale, {
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? "UTC" : timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const opts = (rows: Row[]) =>
  rows.map((r) => ({ value: String(r.id), label: String(r.name ?? r.title) }));
async function api<T = Row>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data;
}
function Pager({
  result,
  onPage,
  busy,
}: {
  result: Page | null;
  onPage: (p: number) => void;
  busy: boolean;
}) {
  if (!result) return null;
  return (
    <div className="pagination">
      <span>
        {result.total
          ? `Showing ${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.total)} of ${result.total}`
          : "No matching records"}
      </span>
      <div>
        <button
          disabled={busy || result.page <= 1}
          onClick={() => onPage(result.page - 1)}
        >
          Previous
        </button>
        <span>
          Page {result.page} of {result.totalPages}
        </span>
        <button
          disabled={busy || result.page >= result.totalPages}
          onClick={() => onPage(result.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`badge ${["active", "open", "selected", "Verified"].includes(String(children)) ? "good" : ["suspended", "rejected", "archived", "closed"].includes(String(children)) ? "muted" : "blue"}`}
    >
      {children}
    </span>
  );
}
function Empty({
  icon: Icon = Users,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Metric({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <article className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{description}</small>
    </article>
  );
}
export default function Workspace({
  initialSlug = "",
  initialView = "overview",
  initialMode = "",
  tenantBound = false,
}: {
  initialSlug?: string;
  initialView?: string;
  initialMode?: string;
  tenantBound?: boolean;
}) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [boot, setBoot] = useState<Boot | null>(null),
    [tenant, setTenant] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [platform, setPlatform] = useState<Platform | null>(null),
    [view, setView] = useState(initialView),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [dialog, setDialog] = useState<Dialog | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [inviteLink, setInviteLink] = useState(""),
    [history, setHistory] = useState<Row[] | null>(null),
    [mobile, setMobile] = useState(false);
  const [employeeResult, setEmployeeResult] = useState<Page | null>(null);
  const [candidateResult, setCandidateResult] = useState<Page | null>(null);
  const [jobResult, setJobResult] = useState<Page | null>(null);
  const [selectedMode, setSelectedMode] = useState(initialMode);
  const [jobPage, setJobPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [stageFilter, setStageFilter] = useState("");
  const [historyTitle, setHistoryTitle] = useState(
    "Candidate decision history",
  );
  const chooseTenant = useCallback(
    (value: string) => {
      setTenant(value);
      setSelectedMode(initialMode);
      setData(null);
      setEmployeeResult(null);
      setCandidateResult(null);
      setJobResult(null);
      setPage(1);
      setJobPage(1);
      setSearch("");
      setStatusFilter("all");
      setBranchFilter("");
      setDepartmentFilter("");
      setStageFilter("");
    },
    [initialMode],
  );
  const requestKey = JSON.stringify([
    tenant,
    view,
    page,
    jobPage,
    search,
    statusFilter,
    branchFilter,
    departmentFilter,
    sort,
    stageFilter,
    reload,
  ]);
  useEffect(() => {
    if (!tenant || !["people", "recruitment"].includes(view)) return;
    let active = true;
    const timer = setTimeout(async () => {
      setListLoading(true);
      try {
        if (view === "people") {
          const params = new URLSearchParams({
            view: "employees",
            tenant,
            page: String(page),
            pageSize: "25",
            q: search,
            status: statusFilter,
            sort,
          });
          if (branchFilter) params.set("branchId", branchFilter);
          if (departmentFilter) params.set("departmentId", departmentFilter);
          const result = await api<Page>(`/api/hrms?${params}`);
          if (active) setEmployeeResult({ ...result, requestKey });
        } else {
          const workspace = await api<Data>(
            `/api/hrms?view=workspace&tenant=${encodeURIComponent(tenant)}`,
          );
          const grants = JSON.parse(
            String(workspace.tenant.permissions),
          ) as string[];
          const params = new URLSearchParams({
            view: "candidates",
            tenant,
            page: String(page),
            pageSize: "25",
            q: search,
          });
          if (stageFilter) params.set("stage", stageFilter);
          const [c, j] = await Promise.all([
            grants.includes("candidate.view")
              ? api<Page>(`/api/hrms?${params}`)
              : Promise.resolve(null),
            grants.includes("job.view")
              ? api<Page>(
                  `/api/hrms?view=jobs&tenant=${encodeURIComponent(tenant)}&page=${jobPage}&pageSize=25`,
                )
              : Promise.resolve(null),
          ]);
          if (active) {
            setCandidateResult(c ? { ...c, requestKey } : null);
            setJobResult(j ? { ...j, requestKey } : null);
          }
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Could not load records.");
      } finally {
        if (active) setListLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    tenant,
    view,
    page,
    jobPage,
    search,
    statusFilter,
    branchFilter,
    departmentFilter,
    sort,
    stageFilter,
    reload,
    requestKey,
  ]);
  const [widgetOrder, setWidgetOrder] = useState([
    "metrics",
    "recruitment",
    "actions",
    "people",
  ]);
  const refresh = useCallback(async () => {
    const b = await api<Boot>("/api/hrms");
    setBoot(b);
    if (b.platform) setPlatform(await api<Platform>("/api/hrms?view=platform"));
    return b;
  }, []);
  useEffect(() => {
    let active = true;
    api<Boot>("/api/hrms")
      .then(async (b: Boot) => {
        if (!active) return;
        setBoot(b);
        if (initialSlug) {
          const selected = b.workspaces.find((w) => w.slug === initialSlug);
          if (selected) chooseTenant(String(selected.id));
          else
            setError(
              "You do not have active access to this company dashboard.",
            );
        } else if (b.workspaces.length)
          chooseTenant(String(b.workspaces[0].id));
        else if (b.platform) setView("platform");
        if (b.platform) {
          const p = await api<Platform>("/api/hrms?view=platform");
          if (active) setPlatform(p);
        }
        const token = new URLSearchParams(window.location.search).get("invite");
        if (token)
          setDialog({
            title: "Accept workspace invitation",
            description:
              "Your verified mobile number must match the invitation. This link expires after 48 hours.",
            action: "invite.accept",
            fields: [],
            extra: { token },
          });
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [initialSlug, chooseTenant]);
  useEffect(() => {
    if (!tenant) return;
    let active = true;
    api<Data>(`/api/hrms?view=workspace&tenant=${encodeURIComponent(tenant)}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [tenant]);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  useEffect(() => {
    if (!dialog && !inviteLink && !history) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".modal");
    const selector =
      "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]";
    modal?.querySelector<HTMLElement>(selector)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        setDialog(null);
        setInviteLink("");
        setHistory(null);
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          modal?.querySelectorAll<HTMLElement>(selector) ?? [],
        );
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [dialog, inviteLink, history]);
  useEffect(() => {
    if (!mobile && !dialog && !inviteLink && !history) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobile, dialog, inviteLink, history]);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.getElementById("workspace-navigation");
    const selector = "button:not([disabled]),a[href],select:not([disabled])";
    sidebar?.querySelector<HTMLElement>(selector)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
      if (event.key !== "Tab") return;
      const controls = Array.from(
        sidebar?.querySelectorAll<HTMLElement>(selector) ?? [],
      ).filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const wide = window.matchMedia("(min-width: 721px)");
    const onResize = () => {
      if (wide.matches) setMobile(false);
    };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onResize);
      previous?.focus();
    };
  }, [mobile]);
  const current = data?.tenant.id === tenant ? data : null;
  const date = (v: unknown) =>
    formatDate(
      v,
      String(current?.tenant.locale ?? "en-IN"),
      String(current?.tenant.timezone ?? "Asia/Kolkata"),
    );
  const mode = current?.dashboardModes.includes(selectedMode)
    ? selectedMode
    : (current?.dashboardModes[0] ?? "workspace");
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon)
      icon.href =
        view === "platform"
          ? platformBrand.logo
          : String(current?.tenant.logo_url ?? platformBrand.logo);
  }, [current?.tenant.logo_url, view]);
  const grants: string[] = current
    ? JSON.parse(String(current.tenant.permissions))
    : [];
  const sensitive = JSON.parse(
    String(current?.tenant.privacy_grants ?? "{}"),
  ) as Record<string, number>;
  const [profile, setProfile] = useState<{
    tenant: string;
    id: string;
    full_name: string;
    employee_code: string;
    designation: string;
    email: string;
  } | null>(null);
  const can = (p: string) => grants.includes(p);
  const stages: Stage[] = current
    ? JSON.parse(String(current.tenant.stages))
    : [];
  const dashboard = current
    ? (JSON.parse(String(current.tenant.dashboard_config)) as {
        title: string;
        subtitle: string;
        widgets: string[];
        density: string;
        hero: string;
      })
    : {
        title: "Your people. Your workspace.",
        subtitle: "Everything you need to move your team forward.",
        widgets: ["metrics", "recruitment", "actions", "people"],
        density: "comfortable",
        hero: "gradient",
      };
  const widgetStyle = (id: string, wide = false) => ({
    display: dashboard.widgets.includes(id) ? undefined : "none",
    order: dashboard.widgets.indexOf(id),
    gridColumn: wide ? "1 / -1" : undefined,
  });
  const dashboardDialog = () => {
    setWidgetOrder([
      ...dashboard.widgets,
      ...["metrics", "recruitment", "actions", "people"].filter(
        (w) => !dashboard.widgets.includes(w),
      ),
    ]);
    open({
      title: "Customize company dashboard",
      description:
        "Choose the content, order and density for this company. Changes are saved for everyone in the workspace.",
      action: "dashboard.update",
      fields: [
        {
          key: "title",
          label: "Welcome headline",
          required: true,
          value: dashboard.title,
        },
        {
          key: "subtitle",
          label: "Welcome message",
          value: dashboard.subtitle,
        },
        {
          key: "density",
          label: "Display density",
          value: dashboard.density,
          options: [
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ],
        },
        {
          key: "hero",
          label: "Hero style",
          value: dashboard.hero,
          options: [
            { value: "gradient", label: "Soft forest" },
            { value: "minimal", label: "Light minimal" },
          ],
        },
      ],
    });
  };
  const changeView = (id: string) => {
    if (id === "platform")
      window.history.replaceState(null, "", "/super-admin");
    else if (current)
      window.history.replaceState(
        null,
        "",
        workspacePath(String(current.tenant.slug), mode, tenantBound),
      );
    setView(id);
    setSearch("");
    setPage(1);
    setJobPage(1);
    setMobile(false);
    setError("");
  };
  const [workspacePreview, setWorkspacePreview] = useState("");
  function open(d: Dialog) {
    setError("");
    setNotice("");
    setWorkspacePreview("");
    setDialog(d);
  }
  const companyDialog = () =>
    open({
      title: "Create a company workspace",
      description:
        "A 14-day foundation trial includes up to 50 active employees and recruitment. Company access is assigned to the mobile number you enter.",
      action: "tenant.create",
      fields: [
        { key: "name", label: "Company name", required: true },
        {
          key: "slug",
          label: "Workspace identifier (optional)",
          hint: "Leave blank to generate from the company name. Duplicate names receive a unique suffix.",
        },
        {
          key: "adminMobile",
          label: "Company administrator mobile",
          type: "tel",
          required: true,
          value: boot?.user.mobile,
        },
        {
          key: "adminEmail",
          label: "Company administrator email (optional)",
          type: "email",
          value: boot?.user.email,
        },
      ],
    });
  const employeeDialog = () =>
    open({
      title: "Add an employee",
      description:
        "Create an existing employee record. This does not bypass onboarding or issue an account activation invitation.",
      action: "employee.create",
      fields: [
        { key: "fullName", label: "Full name", required: true },
        { key: "email", label: "Email address", type: "email", required: true },
        { key: "designation", label: "Designation", required: true },
        {
          key: "joiningDate",
          label: "Date of joining",
          type: "date",
          required: true,
        },
        {
          key: "departmentId",
          label: "Department",
          options: [
            { value: "", label: "Unassigned" },
            ...opts(current?.departments ?? []),
          ],
        },
        {
          key: "branchId",
          label: "Branch",
          options: [
            { value: "", label: "Unassigned" },
            ...opts(current?.branches ?? []),
          ],
        },
      ],
    });
  const jobDialog = () =>
    open({
      title: "Create a vacancy",
      description:
        "Track an approved vacancy in your internal recruitment workspace. Public careers and requisition approvals are scheduled for the next milestone.",
      action: "job.create",
      fields: [
        {
          key: "departmentId",
          label: "Department",
          options: [
            { value: "", label: "Unassigned" },
            ...opts(current?.departments ?? []),
          ],
        },
        {
          key: "branchId",
          label: "Branch",
          options: [
            { value: "", label: "Unassigned" },
            ...opts(current?.branches ?? []),
          ],
        },
        { key: "title", label: "Job title", required: true },
        { key: "location", label: "Location", required: true },
        {
          key: "description",
          label: "Job description",
          type: "textarea",
          required: true,
          hint: "At least 20 characters.",
        },
        {
          key: "status",
          label: "Status",
          options: [
            { value: "draft", label: "Draft" },
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
          ],
        },
      ],
    });
  const candidateDialog = () =>
    open({
      title: "Add a candidate",
      description:
        "Candidates can be added to open vacancies. Duplicate applications to the same vacancy are prevented.",
      action: "candidate.create",
      fields: [
        { key: "fullName", label: "Full name", required: true },
        { key: "email", label: "Email address", type: "email", required: true },
        { key: "phone", label: "Phone number", type: "tel", required: true },
        {
          key: "jobId",
          label: "Vacancy",
          required: true,
          options: opts(
            (current?.jobs ?? []).filter((j) => j.status === "open"),
          ),
        },
        {
          key: "source",
          label: "Recruitment source",
          required: true,
          value: "Direct",
        },
      ],
    });
  const organizationFields = (): Field[] => [
    {
      key: "departmentId",
      label: "Department",
      options: [
        { value: "", label: "Unassigned" },
        ...opts(current?.departments ?? []),
      ],
    },
    {
      key: "branchId",
      label: "Branch",
      options: [
        { value: "", label: "Unassigned" },
        ...opts(current?.branches ?? []),
      ],
    },
  ];
  const editEmployee = (e: Row) =>
    open({
      title: "Edit employee",
      description: "A versioned history entry preserves each approved change.",
      action: "employee.edit",
      extra: { id: e.id, version: e.version },
      fields: [
        {
          key: "fullName",
          label: "Full name",
          required: true,
          value: String(e.full_name),
        },
        {
          key: "email",
          label: "Email",
          type: "email",
          required: true,
          value: String(e.email),
        },
        {
          key: "designation",
          label: "Designation",
          required: true,
          value: String(e.designation),
        },
        {
          key: "joiningDate",
          label: "Joining date",
          type: "date",
          required: true,
          value: String(e.joining_date),
        },
        ...organizationFields().map((f) => ({
          ...f,
          value: String(
            e[f.key === "branchId" ? "branch_id" : "department_id"] ?? "",
          ),
        })),
        { key: "reason", label: "Reason for change", required: true },
      ],
    });
  const editJob = (j: Row) =>
    open({
      title: "Edit vacancy",
      description:
        "Changes are audited. Closed vacancies no longer accept candidates.",
      action: "job.edit",
      extra: { id: j.id, version: j.version },
      fields: [
        {
          key: "title",
          label: "Job title",
          required: true,
          value: String(j.title),
        },
        {
          key: "location",
          label: "Location",
          required: true,
          value: String(j.location),
        },
        {
          key: "description",
          label: "Description",
          type: "textarea",
          required: true,
          value: String(j.description),
        },
        {
          key: "status",
          label: "Status",
          value: String(j.status),
          options: [
            { value: "draft", label: "Draft" },
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
          ],
        },
        ...organizationFields().map((f) => ({
          ...f,
          value: String(
            j[f.key === "branchId" ? "branch_id" : "department_id"] ?? "",
          ),
        })),
      ],
    });
  const loadEmployeeHistory = async (e: Row) => {
    try {
      setHistoryTitle(`Employment history · ${e.full_name}`);
      setHistory(
        await api<Row[]>(
          `/api/hrms?view=employee_history&tenant=${encodeURIComponent(tenant)}&id=${e.id}`,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
    }
  };
  const inviteDialog = () =>
    open({
      title: "Invite a teammate",
      description:
        "Create an expiring invitation bound to the recipient’s OTP-verified mobile number. Share the generated link securely; the recipient signs in using their mobile number.",
      action: "member.invite",
      fields: [
        { key: "mobile", label: "Mobile number", type: "tel", required: true },
        { key: "email", label: "Email address (optional)", type: "email" },
        {
          key: "roleId",
          label: "Role",
          required: true,
          options: opts(current?.roles ?? []),
        },
      ],
    });
  async function execute(
    action: string,
    values: Record<string, unknown>,
    propagate = false,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/hrms", { action, tenant, data: values });
      setDialog(null);
      const b = await refresh();
      if (action === "support.open") {
        chooseTenant(String(result.id));
        setView("overview");
        window.history.replaceState(
          null,
          "",
          workspacePath(String(result.slug), "", tenantBound),
        );
        setData(
          await api<Data>(`/api/hrms?view=workspace&tenant=${result.id}`),
        );
      } else if (action === "support.close") {
        chooseTenant("");
        setData(null);
        setView("platform");
        window.history.replaceState(null, "", "/super-admin");
      } else if (action === "invite.accept") {
        window.history.replaceState(null, "", "/");
        chooseTenant(String(result.id));
        changeView("overview");
      } else if (
        action === "tenant.create" &&
        b.workspaces.some((w) => w.id === result.id)
      ) {
        chooseTenant(String(result.id));
        changeView("overview");
        window.history.replaceState(
          null,
          "",
          workspacePath(String(result.slug), "", tenantBound),
        );
      } else if (tenant)
        setData(
          await api<Data>(
            `/api/hrms?view=workspace&tenant=${encodeURIComponent(tenant)}`,
          ),
        );
      if (result.inviteToken)
        setInviteLink(
          `${window.location.origin}/?invite=${encodeURIComponent(String(result.inviteToken))}`,
        );
      setReload((v) => v + 1);
      setNotice(
        action === "tenant.create"
          ? `Company created. Workspace: ${workspaceLinks(String(result.slug)).workspace}`
          : "Your changes have been saved.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      if (propagate) throw e;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog || busy) return;
    const fd = new FormData(e.currentTarget);
    const values: Record<string, unknown> = { ...dialog.extra };
    dialog.fields.forEach((f) => {
      const v = String(fd.get(f.key) ?? "");
      values[f.key] = ["departmentId", "branchId", "managerId"].includes(f.key)
        ? v || null
        : f.type === "number"
          ? Number(v)
          : v;
    });
    if (dialog.action === "dashboard.update")
      values.widgets = fd.getAll("widgets");
    if (dialog.action === "role.create")
      values.permissions = fd.getAll("permissions");
    if (dialog.action === "plan.create") values.modules = fd.getAll("modules");
    if (dialog.action === "pipeline.update") {
      try {
        values.stages = JSON.parse(String(values.stages));
      } catch {
        setError("Pipeline must be valid JSON.");
        return;
      }
    }
    await execute(dialog.action, values);
  }
  async function exportPeople() {
    setError("");
    try {
      const result = await api<{ rows: Row[] }>(
        `/api/hrms?view=export&tenant=${encodeURIComponent(tenant)}`,
      );
      const keys = [
        "employee_code",
        "full_name",
        "email",
        "designation",
        "joining_date",
        "status",
      ];
      const csv = [
        keys.join(","),
        ...result.rows.map((r: Row) =>
          keys.map((k) => csvCell(r[k])).join(","),
        ),
      ].join("\r\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "employee-directory.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    }
  }
  const employeePageData =
    employeeResult?.requestKey === requestKey ? employeeResult : null;
  const candidatePageData =
    candidateResult?.requestKey === requestKey ? candidateResult : null;
  const jobPageData = jobResult?.requestKey === requestKey ? jobResult : null;
  const people =
    view === "people"
      ? (employeePageData?.rows ?? [])
      : (current?.employees ?? []);
  const candidates =
    view === "recruitment"
      ? (candidatePageData?.rows ?? [])
      : (current?.candidates ?? []);
  const jobs =
    view === "recruitment" ? (jobPageData?.rows ?? []) : (current?.jobs ?? []);
  const activeEmployees = (current?.employees ?? []).filter(
    (e) => e.status === "active",
  );
  const sidebarNav = nav
    .filter((n) =>
      mode === "employee" || mode === "manager"
        ? ["overview", "security"].includes(n.id)
        : mode === "recruiter"
          ? ["overview", "recruitment", "security", "audit"].includes(n.id)
          : true,
    )
    .filter(
      (n) =>
        n.id === "overview" ||
        n.id === "security" ||
        (n.id === "onboarding" &&
          Boolean(sensitive.can_manage_onboarding) &&
          JSON.parse(String(current?.tenant.modules ?? "[]")).includes(
            "onboarding",
          )) ||
        (n.id === "people" && can("employee.view")) ||
        (n.id === "recruitment" &&
          (can("candidate.view") || can("job.view"))) ||
        (n.id === "organization" &&
          can("company.settings.manage") &&
          !current?.tenant.access_branch_id &&
          !current?.tenant.access_department_id) ||
        (n.id === "access" && can("role.manage")) ||
        (n.id === "audit" && can("audit.view")) ||
        (n.id === "settings" &&
          can("company.settings.manage") &&
          !current?.tenant.access_branch_id &&
          !current?.tenant.access_department_id),
    );
  const title =
    view === "platform"
      ? "Platform administration"
      : (nav.find((n) => n.id === view)?.label ?? "Overview");
  return (
    <div
      className={`app ${dashboard.density === "compact" ? "compact" : ""}`}
      style={
        {
          "--brand":
            view === "platform"
              ? platformBrand.primary
              : (current?.tenant.brand_color ?? platformBrand.primary),
          "--accent-ink": accentText(
            String(current?.tenant.accent_color ?? platformBrand.accent),
          ),
          "--accent":
            view === "platform"
              ? platformBrand.accent
              : (current?.tenant.accent_color ?? platformBrand.accent),
        } as React.CSSProperties
      }
    >
      <a className="skip-link" href="#workspace-content">
        Skip to main content
      </a>
      {mobile && (
        <button
          type="button"
          className="sidebar-backdrop"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${mobile ? "visible" : ""}`}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile || undefined}
        aria-label="Workspace navigation"
        inert={!!(dialog || inviteLink || history)}
      >
        <button
          type="button"
          className="sidebar-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={20} />
        </button>
        <Link className="wordmark" href="/">
          {view !== "platform" && current && !current.tenant.logo_url ? (
            <span className="tenant-monogram small">
              {String(current.tenant.name).slice(0, 1)}
            </span>
          ) : (
            <BrandImage
              unoptimized
              className="approved-logo"
              src={
                view === "platform"
                  ? platformBrand.logo
                  : String(current?.tenant.logo_url ?? platformBrand.logo)
              }
              alt=""
              width={42}
              height={42}
            />
          )}
          <span>
            {view === "platform"
              ? "Sohan Soft Tech"
              : (current?.tenant.name ?? "Sohan Soft Tech")}{" "}
            <b>HRMS · WORKFORCE</b>
          </span>
        </Link>
        <div className="workspace-selector">
          <span className="company-icon">
            <Building2 size={19} />
          </span>
          <div>
            <small>COMPANY WORKSPACE</small>
            <select
              aria-label="Choose company workspace"
              value={tenant}
              onChange={(e) => {
                chooseTenant(e.target.value);
                setView("overview");
                setMobile(false);
                setError("");
                const w = boot?.workspaces.find((w) => w.id === e.target.value);
                if (w)
                  window.history.replaceState(
                    null,
                    "",
                    workspacePath(String(w.slug), "", tenantBound),
                  );
              }}
            >
              {!boot?.workspaces.length && (
                <option value="">No workspace yet</option>
              )}
              {boot?.workspaces.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {sidebarNav.map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "selected" : ""}
              aria-current={view === n.id ? "page" : undefined}
              onClick={() => changeView(n.id)}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "recruitment" &&
                Boolean(current?.stats.candidateTotal) && (
                  <span className="count">{current?.stats.candidateTotal}</span>
                )}
            </button>
          ))}
        </nav>
        {boot?.platform && (
          <>
            <span className="nav-label">SOHANSOFT PLATFORM</span>
            <nav>
              <button
                className={view === "platform" ? "selected" : ""}
                aria-current={view === "platform" ? "page" : undefined}
                onClick={() => changeView("platform")}
              >
                <Layers3 size={19} />
                Super Admin
              </button>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="foundation">
            <ShieldCheck size={21} />
            <h4>A secure foundation</h4>
            <p>Company access is protected by membership and permissions.</p>
            <span>
              Role-based access <span className="tiny-dot" />
            </span>
          </div>
          <div className="account">
            <span className="avatar">{initials(boot?.user.displayName)}</span>
            <div>
              <b>{boot?.user.displayName ?? "Signing in…"}</b>
              <small>
                {view === "platform"
                  ? "Platform owner"
                  : (current?.tenant.role_name ?? "Authenticated account")}
              </small>
            </div>
            <button
              title="Sign out"
              aria-label="Sign out"
              className="icon-button"
              onClick={async () => {
                try {
                  await api("/api/auth", { action: "logout" });
                  router.replace("/login");
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Sign out failed.");
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div
        className="main"
        inert={mobile || !!(dialog || inviteLink || history)}
      >
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              aria-expanded={mobile}
              aria-controls="workspace-navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>
              {view === "platform"
                ? "SohanSoft"
                : (current?.tenant.name ?? "Workspace")}
            </span>
            <span className="slash">/</span>
            <b>{title}</b>
          </div>
          <div className="topbar-right">
            <span className="today">
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="avatar small">
              {initials(boot?.user.displayName)}
            </span>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "platform"
                  ? "PLATFORM OPERATIONS"
                  : "PEOPLE OPERATIONS, SIMPLIFIED"}
              </div>
              <h1>
                {view === "overview"
                  ? mode === "admin" || mode === "workspace"
                    ? dashboard.title
                    : modeLabels[mode]
                  : title}
              </h1>
              <p>
                {view === "overview"
                  ? dashboard.subtitle
                  : view === "platform"
                    ? "Manage independent company workspaces, subscriptions and access."
                    : view === "people"
                      ? "One connected record for every person in your organization."
                      : view === "recruitment"
                        ? "From first conversation to your next great hire."
                        : "Keep your workspace organized, secure and unmistakably yours."}
              </p>
            </div>
            <div className="heading-actions">
              {view !== "platform" && current && (
                <label className="dashboard-mode">
                  Workspace view
                  <select
                    aria-label="Choose dashboard experience"
                    value={mode}
                    onChange={(e) => {
                      setSelectedMode(e.target.value);
                      setView("overview");
                      setSearch("");
                      setPage(1);
                      window.history.replaceState(
                        null,
                        "",
                        workspacePath(
                          String(current.tenant.slug),
                          e.target.value,
                          tenantBound,
                        ),
                      );
                    }}
                  >
                    {current.dashboardModes.map((m) => (
                      <option key={m} value={m}>
                        {modeLabels[m]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setError("");
                  try {
                    await refresh();
                    if (tenant)
                      setData(
                        await api<Data>(
                          `/api/hrms?view=workspace&tenant=${encodeURIComponent(tenant)}`,
                        ),
                      );
                    setReload((v) => v + 1);
                  } catch (e) {
                    setData(null);
                    setError(
                      e instanceof Error ? e.message : "Could not refresh.",
                    );
                  }
                }}
              >
                <RefreshCw size={16} />
                Refresh
              </button>
              {view === "overview" &&
                can("company.settings.manage") &&
                !current?.tenant.access_branch_id &&
                !current?.tenant.access_department_id && (
                  <button className="secondary" onClick={dashboardDialog}>
                    <SlidersHorizontal size={16} />
                    Customize
                  </button>
                )}
              {view === "people" && can("employee.export") && (
                <button className="secondary" onClick={exportPeople}>
                  <Download size={16} />
                  Export CSV
                </button>
              )}
              {view === "people" && can("employee.create") && (
                <button className="primary" onClick={employeeDialog}>
                  <Plus size={17} />
                  Add employee
                </button>
              )}
              {view === "recruitment" && can("candidate.create") && (
                <button className="primary" onClick={candidateDialog}>
                  <Plus size={17} />
                  Add candidate
                </button>
              )}
              {view === "platform" && boot?.platform && (
                <button className="primary" onClick={companyDialog}>
                  <Plus size={17} />
                  Create company
                </button>
              )}
              {view === "access" && can("role.manage") && (
                <button className="primary" onClick={inviteDialog}>
                  <Plus size={17} />
                  Invite teammate
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={17} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <CheckCircle2 size={18} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {current?.tenant.support_expires_at && (
            <div className="support-banner">
              <ShieldCheck size={18} />
              <span>
                Super Admin access · expires{" "}
                {new Date(
                  String(current.tenant.support_expires_at),
                ).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · actions are audited
              </span>
              <button
                disabled={busy}
                onClick={() => void execute("support.close", {})}
              >
                End admin access
              </button>
            </div>
          )}
          {!boot && !error && (
            <div className="loading">
              <RefreshCw className="spin" size={20} />
              Loading your workspace…
            </div>
          )}
          {view !== "platform" && boot && !tenant && (
            <section className="panel">
              <Empty
                icon={Building2}
                title="Your workspace starts here"
                text={
                  boot.platform
                    ? "Create your first company and explicitly assign a company administrator."
                    : "Ask your company administrator for an invitation to join a workspace."
                }
                action={
                  boot.platform ? (
                    <button className="primary" onClick={companyDialog}>
                      <Plus size={17} />
                      Create company
                    </button>
                  ) : undefined
                }
              />
            </section>
          )}
          {view !== "platform" && tenant && !current && !error && (
            <div className="loading">
              <RefreshCw className="spin" size={20} />
              Loading company records…
            </div>
          )}
          {view === "security" && <AccountSecurity />}
          {view === "overview" && current && (
            <Notifications key={tenant} tenant={tenant} />
          )}
          {view === "overview" &&
            current &&
            JSON.parse(String(current.tenant.modules)).includes(
              "onboarding",
            ) && (
              <Link className="secondary" href="/onboarding">
                My joining tasks and onboarding
              </Link>
            )}
          {view === "onboarding" && current && (
            <WorkflowAdmin
              key={tenant}
              tenant={tenant}
              canReviewDocuments={Boolean(sensitive.can_review_documents)}
            />
          )}
          {view === "recruitment" && current && (
            <RecruitmentOperations key={tenant} tenant={tenant} />
          )}
          {view === "people" && profile?.tenant === tenant && (
            <ProfileTabs
              tenant={tenant}
              employee={profile}
              onClose={() => setProfile(null)}
              canReviewDocuments={Boolean(sensitive.can_review_documents)}
            />
          )}
          {view === "overview" &&
            current &&
            mode === "employee" &&
            JSON.parse(String(current.tenant.modules)).includes(
              "private_documents",
            ) && <Documents key={tenant} tenant={tenant} />}
          {view === "overview" &&
            current &&
            mode === "employee" &&
            JSON.parse(String(current.tenant.modules)).includes(
              "employee_verification",
            ) && <Verification key={tenant} view="self" tenant={tenant} />}
          {view === "people" && current && (
            <Verification key={tenant} view="queue" tenant={tenant} />
          )}
          {view === "overview" &&
            current &&
            !["admin", "workspace"].includes(mode) && (
              <RoleDashboard
                key={`${tenant}:${mode}`}
                tenant={tenant}
                mode={mode}
                revision={reload}
                onAction={(action, values) => execute(action, values, true)}
                onNavigate={changeView}
              />
            )}
          {view === "overview" &&
            current &&
            ["admin", "workspace"].includes(mode) && (
              <div className="dashboard-board">
                <section
                  className={`hero ${dashboard.hero}`}
                  style={{ gridColumn: "1 / -1", order: -1 }}
                >
                  <div>
                    <span className="hero-label">
                      <span className="tiny-dot" /> YOUR PEOPLE. YOUR WORKSPACE.
                    </span>
                    <h2>{dashboard.title}</h2>
                    <p>{dashboard.subtitle}</p>
                    {can("employee.create") && (
                      <button onClick={employeeDialog}>
                        Build your people directory <ArrowRight size={17} />
                      </button>
                    )}
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="art-avatar a1">HR</div>
                    <div className="art-avatar a2">
                      <Users size={26} />
                    </div>
                    <div className="art-avatar a3">
                      <BriefcaseBusiness size={25} />
                    </div>
                    <div className="art-center">
                      <span className="brand-mark">s.</span>
                      <small>
                        connected
                        <br />
                        by design
                      </small>
                    </div>
                    <span className="art-label">
                      <CheckCircle2 size={14} /> One team. One place.
                    </span>
                    <Sparkles className="spark" size={24} />
                  </div>
                </section>
                <div className="metrics" style={widgetStyle("metrics", true)}>
                  <Metric
                    label="Active employees"
                    value={current.stats.employeeActive ?? "—"}
                    description={
                      can("employee.view")
                        ? `Of ${current.tenant.employee_limit} available seats`
                        : "Employee view permission required"
                    }
                    icon={Users}
                  />
                  <Metric
                    label="Open vacancies"
                    value={current.stats.openJobs ?? "—"}
                    description="Your next chapter is hiring"
                    icon={BriefcaseBusiness}
                  />
                  <Metric
                    label="Candidates in pipeline"
                    value={current.stats.candidateActive ?? "—"}
                    description="Across all active stages"
                    icon={Layers3}
                  />
                  <Metric
                    label="Departments"
                    value={current.departments.length}
                    description={`${current.branches.length} company locations`}
                    icon={Building2}
                  />
                </div>
                <div className="overview-grid">
                  <section className="panel" style={widgetStyle("recruitment")}>
                    <div className="panel-head">
                      <div>
                        <h2>Recruitment at a glance</h2>
                        <p>A clear view of your candidate journey.</p>
                      </div>
                      {can("candidate.view") && (
                        <button
                          className="text-button"
                          onClick={() => changeView("recruitment")}
                        >
                          View pipeline <ArrowUpRight size={16} />
                        </button>
                      )}
                    </div>
                    <div className="funnel">
                      {stages
                        .filter((s) => s.id !== "rejected")
                        .map((s, i) => {
                          const total = current.stats.stageCounts[s.id] ?? 0;
                          return (
                            <div className="funnel-row" key={s.id}>
                              <span>
                                <i
                                  style={{
                                    background: [
                                      "#2563eb",
                                      "#658df6",
                                      "#96aff7",
                                      "#a7b4ce",
                                      "#6557cc",
                                    ][i % 5],
                                  }}
                                />
                                {s.label}
                              </span>
                              <div className="funnel-track">
                                <div
                                  style={{
                                    width: total
                                      ? `${Math.max(6, (total / Math.max(current.stats.candidateTotal ?? 0, 1)) * 100)}%`
                                      : "0%",
                                    background: [
                                      "#2563eb",
                                      "#658df6",
                                      "#96aff7",
                                      "#a7b4ce",
                                      "#6557cc",
                                    ][i % 5],
                                  }}
                                />
                              </div>
                              <b>{can("candidate.view") ? total : "—"}</b>
                            </div>
                          );
                        })}
                    </div>
                    {!current.candidates.length && (
                      <p className="footnote">
                        Candidate counts will appear as applications are added.
                      </p>
                    )}
                  </section>
                  <section className="panel" style={widgetStyle("actions")}>
                    <div className="panel-head">
                      <div>
                        <h2>Make your next move</h2>
                        <p>Start with the essentials.</p>
                      </div>
                      <span className="icon-soft">
                        <ArrowUpRight size={19} />
                      </span>
                    </div>
                    <div className="quick-actions">
                      {[
                        {
                          p: "employee.create",
                          title: "Welcome someone new",
                          text: "Create an employee record",
                          icon: Users,
                          onClick: employeeDialog,
                        },
                        {
                          p: "job.create",
                          title: "Find your next great hire",
                          text: "Create a recruitment vacancy",
                          icon: BriefcaseBusiness,
                          onClick: jobDialog,
                        },
                        {
                          p: "role.manage",
                          title: "Bring your team together",
                          text: "Invite a workspace administrator",
                          icon: ShieldCheck,
                          onClick: inviteDialog,
                        },
                      ]
                        .filter((a) => can(a.p))
                        .map((a) => (
                          <button key={a.p} onClick={a.onClick}>
                            <span className="action-icon">
                              <a.icon size={19} />
                            </span>
                            <span>
                              <b>{a.title}</b>
                              <small>{a.text}</small>
                            </span>
                            <ArrowRight size={17} />
                          </button>
                        ))}
                    </div>
                  </section>
                </div>
                <section className="panel" style={widgetStyle("people", true)}>
                  <div className="panel-head">
                    <div>
                      <h2>People, at the center</h2>
                      <p>Recently added to your company directory.</p>
                    </div>
                    {can("employee.view") && (
                      <button
                        className="text-button"
                        onClick={() => changeView("people")}
                      >
                        All employees <ArrowUpRight size={16} />
                      </button>
                    )}
                  </div>
                  {activeEmployees.length ? (
                    <div className="people-strip">
                      {activeEmployees.slice(0, 4).map((e) => (
                        <div key={e.id}>
                          <span className="avatar large">
                            {initials(e.full_name)}
                          </span>
                          <b>{e.full_name}</b>
                          <small>{e.designation}</small>
                          <Badge>{e.status}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="Make room for your people"
                      text="Add your first employee to begin building a connected company directory."
                      action={
                        can("employee.create") ? (
                          <button
                            className="secondary"
                            onClick={employeeDialog}
                          >
                            <Plus size={16} />
                            Add your first employee
                          </button>
                        ) : undefined
                      }
                    />
                  )}
                </section>
              </div>
            )}
          {view === "people" && current && (
            <section className="panel">
              <div className="table-toolbar">
                <div className="search">
                  <Search size={17} />
                  <input
                    aria-label="Search employees"
                    placeholder="Search name, ID, email or designation…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <span className="record-count">
                  {employeePageData?.total ?? "…"} employees
                </span>
              </div>
              <div className="directory-filters">
                <label>
                  Status
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label>
                  Branch
                  <select
                    value={branchFilter}
                    onChange={(e) => {
                      setBranchFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All permitted branches</option>
                    {opts(current.branches).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Department
                  <select
                    value={departmentFilter}
                    onChange={(e) => {
                      setDepartmentFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All permitted departments</option>
                    {opts(current.departments).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Sort
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="newest">Newest first</option>
                    <option value="name">Name</option>
                    <option value="code">Employee ID</option>
                    <option value="joining">Joining date</option>
                  </select>
                </label>
              </div>
              {listLoading || (!employeePageData && !error) ? (
                <div className="loading" role="status">
                  Loading employee records…
                </div>
              ) : people.length ? (
                <>
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Records table, scroll for all columns"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Employee</th>
                          <th scope="col">Employee ID</th>
                          <th scope="col">Department / Role</th>
                          <th scope="col">Joining date</th>
                          <th scope="col">Status</th>
                          <th scope="col">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.map((e) => (
                          <tr key={e.id}>
                            <td>
                              <div className="person-cell">
                                <span className="avatar">
                                  {initials(e.full_name)}
                                </span>
                                <span>
                                  <b>{e.full_name}</b>
                                  <small>{e.email}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              <code>{e.employee_code}</code>{" "}
                              <button
                                className="text-button"
                                onClick={() =>
                                  setProfile({
                                    tenant,
                                    id: String(e.id),
                                    full_name: String(e.full_name),
                                    employee_code: String(e.employee_code),
                                    designation: String(e.designation),
                                    email: String(e.email),
                                  })
                                }
                              >
                                Open profile
                              </button>
                            </td>
                            <td>
                              <b>{e.department ?? "Unassigned"}</b>
                              <small>{e.designation}</small>
                            </td>
                            <td>{date(e.joining_date)}</td>
                            <td>
                              <Badge>{e.status}</Badge>
                            </td>
                            <td>
                              <div className="table-actions">
                                <button
                                  className="text-button"
                                  onClick={() => loadEmployeeHistory(e)}
                                >
                                  History
                                </button>
                                {can("employee.activate") && (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      open(
                                        e.account_status === "active"
                                          ? {
                                              title: "Unlink employee account",
                                              description:
                                                "Personal and manager portal access ends. Administrative membership permissions are managed separately.",
                                              action: "employee.unlink",
                                              fields: [
                                                {
                                                  key: "reason",
                                                  label: "Reason",
                                                  required: true,
                                                },
                                              ],
                                              extra: { id: e.id },
                                            }
                                          : {
                                              title: "Activate employee access",
                                              description:
                                                "Invite the correct mobile number. The recipient must verify that number with OTP before this employee record is linked.",
                                              action: "employee.invite",
                                              fields: [
                                                {
                                                  key: "mobile",
                                                  label: "Employee mobile",
                                                  type: "tel",
                                                  required: true,
                                                },
                                              ],
                                              extra: { id: e.id },
                                            },
                                      )
                                    }
                                  >
                                    {e.account_status === "active"
                                      ? "Unlink account"
                                      : "Activate account"}
                                  </button>
                                )}
                                {can("employee.edit") && (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      open({
                                        title: "Assign reporting manager",
                                        description:
                                          "Select an active employee in this company. Cyclic reporting relationships are rejected.",
                                        action: "employee.manager",
                                        fields: [
                                          {
                                            key: "managerId",
                                            label: "Reporting manager",
                                            type: "employee-picker",
                                            value: String(e.manager_id ?? ""),
                                            hint: "Search active employees by name or employee ID.",
                                          },
                                          {
                                            key: "reason",
                                            label: "Reason",
                                            required: true,
                                          },
                                        ],
                                        extra: { id: e.id },
                                      })
                                    }
                                  >
                                    Manager
                                  </button>
                                )}
                                {can("employee.edit") && (
                                  <button
                                    className="text-button"
                                    onClick={() => editEmployee(e)}
                                  >
                                    Edit
                                  </button>
                                )}
                                {can("employee.archive") && (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      open({
                                        title:
                                          e.status === "active"
                                            ? "Archive employee?"
                                            : "Restore employee?",
                                        description:
                                          "The employment record and history are preserved. Restoring requires an available employee seat.",
                                        action:
                                          e.status === "active"
                                            ? "employee.archive"
                                            : "employee.restore",
                                        fields: [
                                          {
                                            key: "reason",
                                            label: "Reason",
                                            required: true,
                                          },
                                        ],
                                        extra: { id: e.id, version: e.version },
                                      })
                                    }
                                  >
                                    {e.status === "active"
                                      ? "Archive"
                                      : "Restore"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <Empty
                  title={
                    search ? "No matching employees" : "Your directory is ready"
                  }
                  text={
                    search
                      ? "Try another name, email or employee ID."
                      : "Add employees and organize your workforce across departments and branches."
                  }
                  action={
                    can("employee.create") ? (
                      <button className="primary" onClick={employeeDialog}>
                        <Plus size={17} />
                        Add employee
                      </button>
                    ) : undefined
                  }
                />
              )}
              <Pager
                result={employeePageData}
                onPage={setPage}
                busy={listLoading}
              />
            </section>
          )}
          {view === "recruitment" && current && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Your hiring pipeline</h2>
                    <p>Authorized stage changes are validated and recorded.</p>
                  </div>
                  <div className="search compact">
                    <Search size={17} />
                    <input
                      aria-label="Search candidates"
                      placeholder="Search candidates…"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
                <div className="directory-filters">
                  <label>
                    Pipeline stage
                    <select
                      value={stageFilter}
                      onChange={(e) => {
                        setStageFilter(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All stages</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>
                    Showing one page of candidates. Dashboard totals include all
                    permitted records.
                  </span>
                </div>
                {listLoading && (
                  <div className="loading" role="status">
                    Loading recruitment records…
                  </div>
                )}
                <div className="kanban">
                  {stages.map((s) => (
                    <div className="kanban-column" key={s.id}>
                      <h3>
                        <span className="stage-dot" />
                        {s.label}
                        <span>
                          {candidates.filter((c) => c.stage === s.id).length}
                        </span>
                      </h3>
                      <div className="kanban-cards">
                        {candidates
                          .filter((c) => c.stage === s.id)
                          .map((c) => (
                            <article className="candidate" key={c.id}>
                              <div className="candidate-person">
                                <span className="avatar">
                                  {initials(c.full_name)}
                                </span>
                                <div>
                                  <b>{c.full_name}</b>
                                  <small>{c.source}</small>
                                </div>
                              </div>
                              <p>{c.job_title}</p>
                              <small className="candidate-date">
                                <Clock3 size={13} />
                                {date(c.created_at)}
                              </small>
                              <div className="candidate-actions">
                                <button
                                  className="text-button"
                                  onClick={async () => {
                                    try {
                                      setHistoryTitle(
                                        "Candidate decision history",
                                      );
                                      setHistory(
                                        await api<Row[]>(
                                          `/api/hrms?view=history&tenant=${encodeURIComponent(tenant)}&id=${c.id}`,
                                        ),
                                      );
                                    } catch (e) {
                                      setError(
                                        e instanceof Error
                                          ? e.message
                                          : "Could not load history.",
                                      );
                                    }
                                  }}
                                >
                                  History
                                </button>
                                {can("candidate.transition") &&
                                  Boolean(s.next.length) && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        open({
                                          title: "Move candidate",
                                          description: `Update ${c.full_name} from ${s.label}. Rejection or hold requires a reason.`,
                                          action: "candidate.transition",
                                          fields: [
                                            {
                                              key: "stage",
                                              label: "Move to",
                                              required: true,
                                              options: s.next.map((n) => ({
                                                value: n,
                                                label:
                                                  stages.find((s) => s.id === n)
                                                    ?.label ?? n,
                                              })),
                                            },
                                            {
                                              key: "reason",
                                              label: "Decision note",
                                              type: "textarea",
                                            },
                                          ],
                                          extra: {
                                            id: c.id,
                                            version: c.version,
                                          },
                                        })
                                      }
                                    >
                                      Move <ArrowRight size={13} />
                                    </button>
                                  )}
                              </div>
                            </article>
                          ))}
                        {!candidates.some((c) => c.stage === s.id) && (
                          <span className="stage-empty">
                            No candidates on this page
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {can("candidate.view") && (
                  <Pager
                    result={candidatePageData}
                    onPage={setPage}
                    busy={listLoading}
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Vacancies</h2>
                    <p>Internal job records for your recruitment team.</p>
                  </div>
                  {can("job.create") && (
                    <button className="secondary" onClick={jobDialog}>
                      <Plus size={16} />
                      Create vacancy
                    </button>
                  )}
                </div>
                {jobs.length ? (
                  <>
                    <div
                      className="table-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="Records table, scroll for all columns"
                    >
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Position</th>
                            <th scope="col">Location</th>
                            <th scope="col">Applicants</th>
                            <th scope="col">Status</th>
                            <th scope="col">Created</th>
                            <th scope="col">Manage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {jobs.map((j) => (
                            <tr key={j.id}>
                              <td>
                                <b>{j.title}</b>
                                <small className="description-preview">
                                  {j.description}
                                </small>
                              </td>
                              <td>{j.location}</td>
                              <td>{j.applicant_count ?? "—"}</td>
                              <td>
                                <Badge>{j.status}</Badge>
                              </td>
                              <td>{date(j.created_at)}</td>
                              <td>
                                {can("job.edit") && (
                                  <button
                                    className="text-button"
                                    onClick={() => editJob(j)}
                                  >
                                    Edit vacancy
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <Empty
                    icon={BriefcaseBusiness}
                    title="Good teams start with great hiring"
                    text="Create an open vacancy, then add candidates to your pipeline."
                    action={
                      can("job.create") ? (
                        <button className="primary" onClick={jobDialog}>
                          <Plus size={16} />
                          Create vacancy
                        </button>
                      ) : undefined
                    }
                  />
                )}
                <Pager
                  result={jobPageData}
                  onPage={setJobPage}
                  busy={listLoading}
                />
              </section>
            </>
          )}
          {view === "organization" && current && (
            <div className="two-columns">
              {[
                {
                  key: "departments",
                  title: "Departments",
                  description: "Give every team a home.",
                  rows: current.departments,
                },
                {
                  key: "branches",
                  title: "Branches & locations",
                  description: "Connect your company locations.",
                  rows: current.branches,
                },
              ].map((group) => (
                <section className="panel" key={group.key}>
                  <div className="panel-head">
                    <div>
                      <h2>{group.title}</h2>
                      <p>{group.description}</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        open({
                          title: `Add ${group.key === "departments" ? "department" : "branch"}`,
                          description: group.description,
                          action: "organization.create",
                          fields: [
                            { key: "name", label: "Name", required: true },
                          ],
                          extra: { kind: group.key },
                        })
                      }
                    >
                      <Plus size={15} />
                      Add
                    </button>
                  </div>
                  {group.rows.length ? (
                    <div className="item-list">
                      {group.rows.map((d) => (
                        <div key={d.id}>
                          <span className="icon-soft">
                            <Building2 size={18} />
                          </span>
                          <b>{d.name}</b>
                          <span>
                            {(group.key === "departments"
                              ? current.stats.departmentCounts[String(d.id)]
                              : current.stats.branchCounts[String(d.id)]) ??
                              0}{" "}
                            employees
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={Building2}
                      title={`No ${group.key} yet`}
                      text="Create your organizational structure before assigning employees."
                    />
                  )}
                </section>
              ))}
            </div>
          )}
          {view === "access" && current && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Roles & permissions</h2>
                    <p>
                      Permissions and organizational scopes are enforced by the
                      backend.
                    </p>
                    {can("role.manage") &&
                      !current.tenant.access_branch_id &&
                      !current.tenant.access_department_id && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            open({
                              title: "Install role presets",
                              description:
                                "Add Company Admin, HR Manager, Recruiter and Auditor if absent. Existing roles remain unchanged.",
                              action: "roles.presets",
                              fields: [],
                            })
                          }
                        >
                          Install role presets
                        </button>
                      )}
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      open({
                        title: "Create a custom role",
                        description:
                          "Grant permissions within your authority and restrict access to a branch or department.",
                        action: "role.create",
                        fields: [
                          { key: "name", label: "Role name", required: true },
                          {
                            key: "branchId",
                            label: "Branch scope",
                            options: [
                              { value: "", label: "Company-wide" },
                              ...opts(current.branches),
                            ],
                          },
                          {
                            key: "departmentId",
                            label: "Department scope",
                            options: [
                              { value: "", label: "Company-wide" },
                              ...opts(current.departments),
                            ],
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={16} />
                    Create role
                  </button>
                </div>
                <div className="role-grid">
                  {current.roles.map((r) => (
                    <article key={r.id}>
                      <ShieldCheck size={22} />
                      <h3>{r.name}</h3>
                      <small>
                        {r.branch ?? "All branches"} ·{" "}
                        {r.department ?? "All departments"}
                      </small>
                      <p>
                        {JSON.parse(String(r.permissions)).length} permissions
                      </p>
                      <div className="permission-tags">
                        {(JSON.parse(String(r.permissions)) as string[]).map(
                          (p) => (
                            <span key={p}>{p}</span>
                          ),
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Workspace members</h2>
                    <p>
                      Invitations require verified mobile matching before access
                      is granted.
                    </p>
                  </div>
                </div>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Records table, scroll for all columns"
                >
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Member</th>
                        <th scope="col">Role</th>
                        <th scope="col">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.memberships.map((m) => (
                        <tr key={m.id}>
                          <td>
                            {m.mobile ?? "Legacy account"}
                            <small>{m.email}</small>
                          </td>
                          <td>
                            <Badge>{m.role_name}</Badge>
                          </td>
                          <td>
                            {!current.tenant.access_branch_id &&
                              !current.tenant.access_department_id && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    open({
                                      title:
                                        m.revoked_at && !m.restored_at
                                          ? "Restore member access"
                                          : "Revoke member access",
                                      description:
                                        "Only this company membership changes. Other company memberships remain available.",
                                      action:
                                        m.revoked_at && !m.restored_at
                                          ? "member.restore"
                                          : "member.revoke",
                                      fields: [
                                        {
                                          key: "reason",
                                          label: "Reason",
                                          required: true,
                                        },
                                      ],
                                      extra: { id: m.id },
                                    })
                                  }
                                >
                                  {m.revoked_at && !m.restored_at
                                    ? "Restore access"
                                    : "Revoke access"}
                                </button>
                              )}
                            <button
                              className="text-button"
                              onClick={() =>
                                open({
                                  title: "Change member role",
                                  description:
                                    "The updated role takes effect on the next API request. You cannot change your own role here.",
                                  action: "member.role",
                                  fields: [
                                    {
                                      key: "roleId",
                                      label: "New role",
                                      required: true,
                                      options: opts(current.roles),
                                    },
                                  ],
                                  extra: { id: m.id },
                                })
                              }
                            >
                              Change role
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Invitations</h2>
                    <p>Expiring links can be revoked before acceptance.</p>
                  </div>
                </div>
                {current.invitations.length ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Records table, scroll for all columns"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Mobile / Email</th>
                          <th scope="col">Expires</th>
                          <th scope="col">Status</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {current.invitations.map((i) => (
                          <tr key={i.id}>
                            <td>
                              {i.mobile ?? "Legacy email invitation"}
                              <small>{i.email}</small>
                            </td>
                            <td>{date(i.expires_at)}</td>
                            <td>
                              <Badge>
                                {i.used_at
                                  ? "Accepted"
                                  : i.revoked_at
                                    ? "Revoked"
                                    : new Date(String(i.expires_at)) <=
                                        new Date()
                                      ? "Expired"
                                      : "Pending"}
                              </Badge>
                            </td>
                            <td>
                              {!i.used_at &&
                                !i.revoked_at &&
                                new Date(String(i.expires_at)) > new Date() && (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      open({
                                        title: "Revoke invitation?",
                                        description:
                                          "This invitation link will no longer grant access.",
                                        action: "invite.revoke",
                                        fields: [],
                                        extra: { id: i.id },
                                      })
                                    }
                                  >
                                    Revoke
                                  </button>
                                )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="footnote">No invitations have been created.</p>
                )}
              </section>
            </>
          )}
          {view === "settings" && current && (
            <>
              <>
                <Verification key={tenant} view="policy" tenant={tenant} />
                <WorkflowAdmin
                  key={"templates-" + tenant}
                  tenant={tenant}
                  settings
                />
              </>
              <BrandingSettings
                key={`${tenant}:${current.tenant.branding_version}`}
                tenant={current.tenant}
                onSave={(values) => execute("branding.update", values, true)}
              />
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Recruitment lifecycle</h2>
                    <p>
                      Configure stages and valid transitions. Stages containing
                      candidates cannot be removed.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      open({
                        title: "Configure recruitment pipeline",
                        description:
                          "Provide an array of stages with id, label and allowed next-stage IDs. The first stage is used for new applications.",
                        action: "pipeline.update",
                        fields: [
                          {
                            key: "stages",
                            label: "Pipeline definition",
                            type: "textarea",
                            required: true,
                            value: JSON.stringify(stages, null, 2),
                          },
                        ],
                      })
                    }
                  >
                    Configure
                  </button>
                </div>
                <div className="pipeline-flow">
                  {stages.map((s) => (
                    <span key={s.id}>
                      {s.label}
                      <small>
                        {s.next
                          .map((n) => stages.find((x) => x.id === n)?.label)
                          .join(", ") || "End of journey"}
                      </small>
                    </span>
                  ))}
                </div>
              </section>
              <div className="implementation-note">
                <CircleHelp size={19} />
                <p>
                  Branding is saved for this company. Customer domains are
                  managed by the platform owner. Custom email templates and
                  workweek rules remain unavailable.
                </p>
              </div>
            </>
          )}
          {view === "audit" && current && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Workspace activity</h2>
                  <p>
                    Recent authorized changes to this company. Audit records
                    cannot be edited through the application.
                  </p>
                </div>
                <span className="icon-soft">
                  <ScrollText size={20} />
                </span>
              </div>
              {current.audit.length ? (
                <div className="activity-list">
                  {current.audit.map((a) => (
                    <div key={a.id}>
                      <span className="activity-dot" />
                      <div>
                        <b>
                          {String(a.action)
                            .replaceAll(".", " ")
                            .replaceAll("_", " ")}
                        </b>
                        <small>
                          Record {String(a.resource_id).slice(0, 8)}
                        </small>
                      </div>
                      <time>
                        {new Date(String(a.created_at)).toLocaleString("en-IN")}
                      </time>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  icon={ScrollText}
                  title="A clear record of every change"
                  text="Workspace activity will be recorded as your team starts working."
                />
              )}
            </section>
          )}
          {view === "platform" && boot?.platform && platform && (
            <>
              <nav className="platform-sections" aria-label="Platform sections">
                <a href="#platform-companies">Companies</a>
                <a href="#platform-cashfree">Integrations</a>
                <a href="#platform-operations">Workflow operations</a>
                <a href="#platform-domains">Customer domains</a>
                <a href="#platform-plans">Plans</a>
              </nav>
              <div className="metrics">
                <Metric
                  label="Company workspaces"
                  value={platform.tenants.length}
                  description="Independent tenant accounts"
                  icon={Building2}
                />
                <Metric
                  label="Active companies"
                  value={
                    platform.tenants.filter((t) => t.status === "active").length
                  }
                  description="Currently enabled on the platform"
                  icon={CheckCircle2}
                />
                <Metric
                  label="Employee usage"
                  value={platform.tenants.reduce(
                    (n, t) => n + Number(t.employee_count),
                    0,
                  )}
                  description="Aggregate counts, no personal records"
                  icon={Users}
                />
                <Metric
                  label="Subscription plans"
                  value={platform.plans.length}
                  description="Configurable limits and modules"
                  icon={Layers3}
                />
              </div>
              <section className="panel" id="platform-companies">
                <div className="panel-head">
                  <div>
                    <h2>Company workspaces</h2>
                    <p>
                      Use audited, time-limited admin access to open a company
                      workspace.
                    </p>
                  </div>
                  <ShieldCheck size={21} />
                </div>
                {platform.tenants.length ? (
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Records table, scroll for all columns"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Company</th>
                          <th scope="col">Plan</th>
                          <th scope="col">Employees</th>
                          <th scope="col">Account status</th>
                          <th scope="col">Expiry</th>
                          <th scope="col">Manage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {platform.tenants.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <div className="person-cell">
                                <span className="company-icon">
                                  <Building2 size={18} />
                                </span>
                                <span>
                                  <b>{t.name}</b>
                                  <small>{t.slug}</small>
                                </span>
                              </div>
                            </td>
                            <td>
                              {t.plan_name}
                              <small>{t.subscription_status}</small>
                            </td>
                            <td>{t.employee_count}</td>
                            <td>
                              <Badge>{t.status}</Badge>
                            </td>
                            <td>{date(t.expires_at)}</td>
                            <td>
                              <div className="table-actions">
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    open({
                                      title: "Open company dashboard",
                                      description: `Access ${t.name} as Super Admin for up to one hour. Every change is recorded against your account.`,
                                      action: "support.open",
                                      fields: [
                                        {
                                          key: "reason",
                                          label: "Reason for admin access",
                                          required: true,
                                          value: "Company administration",
                                        },
                                      ],
                                      extra: { id: t.id },
                                    })
                                  }
                                >
                                  Open dashboard <ArrowUpRight size={13} />
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    open({
                                      title: "Change workspace identifier",
                                      description:
                                        "Old workspace links remain reserved and redirect to the new identifier. Employee records and company ID are preserved.",
                                      action: "tenant.slug",
                                      fields: [
                                        {
                                          key: "slug",
                                          label: "New identifier",
                                          required: true,
                                          value: String(t.slug),
                                        },
                                      ],
                                      extra: { id: t.id },
                                    })
                                  }
                                >
                                  Workspace identifier
                                </button>
                                <details>
                                  <summary>Workspace & sign-in links</summary>
                                  <a
                                    href={
                                      workspaceLinks(String(t.slug)).workspace
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Open company workspace
                                  </a>
                                  <button
                                    className="text-button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(
                                          workspaceLinks(String(t.slug))
                                            .workspace,
                                        );
                                        setNotice("Workspace link copied.");
                                      } catch {
                                        setError(
                                          "Copy failed. Select the workspace link and copy it manually.",
                                        );
                                      }
                                    }}
                                  >
                                    Copy workspace link
                                  </button>
                                  {workspaceLinks(String(t.slug)).roles.map(
                                    (link) => (
                                      <div key={link.role}>
                                        {link.url ? (
                                          <a
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            {link.label} sign in
                                          </a>
                                        ) : (
                                          <span>{link.label}: unavailable</span>
                                        )}
                                      </div>
                                    ),
                                  )}
                                </details>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    open({
                                      title: "Change company status",
                                      description:
                                        "Suspended or archived workspaces reject all company API operations.",
                                      action: "tenant.status",
                                      fields: [
                                        {
                                          key: "status",
                                          label: "Account status",
                                          value: String(t.status),
                                          options: [
                                            {
                                              value: "active",
                                              label: "Active",
                                            },
                                            {
                                              value: "suspended",
                                              label: "Suspended",
                                            },
                                            {
                                              value: "archived",
                                              label: "Archived",
                                            },
                                          ],
                                        },
                                      ],
                                      extra: { id: t.id },
                                    })
                                  }
                                >
                                  Status
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    open({
                                      title: "Assign a subscription",
                                      description:
                                        "This records a manual subscription assignment. No payment transaction is implied.",
                                      action: "subscription.assign",
                                      fields: [
                                        {
                                          key: "planId",
                                          label: "Plan",
                                          required: true,
                                          options: opts(platform.plans),
                                        },
                                        {
                                          key: "expiresAt",
                                          label: "Valid until",
                                          type: "date",
                                          required: true,
                                        },
                                      ],
                                      extra: { id: t.id },
                                    })
                                  }
                                >
                                  Plan
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    icon={Building2}
                    title="Ready for your first company"
                    text="Create a tenant, assign its administrator and start a company workspace."
                    action={
                      <button className="primary" onClick={companyDialog}>
                        <Plus size={17} />
                        Create company
                      </button>
                    }
                  />
                )}
              </section>
              <div id="platform-cashfree">
                <Verification view="platform" />
              </div>
              <div id="platform-operations">
                <Operations />
              </div>
              <div id="platform-domains">
                <DomainSettings
                  tenants={platform.tenants.map((t) => ({
                    id: String(t.id),
                    name: String(t.name),
                  }))}
                />
              </div>
              <section className="panel" id="platform-plans">
                <div className="panel-head">
                  <div>
                    <h2>Plans & entitlements</h2>
                    <p>
                      Enforced by company APIs. Billing and payments are not
                      connected yet.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      open({
                        title: "Create a plan",
                        description:
                          "Set an employee limit, monthly price and enabled modules. Pricing is recorded in paise; this does not collect payment.",
                        action: "plan.create",
                        fields: [
                          { key: "name", label: "Plan name", required: true },
                          {
                            key: "employeeLimit",
                            label: "Active employee limit",
                            type: "number",
                            required: true,
                            value: "100",
                          },
                          {
                            key: "pricePaise",
                            label: "Monthly price (paise)",
                            type: "number",
                            required: true,
                            value: "0",
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={16} />
                    Create plan
                  </button>
                </div>
                {platform.plans.length ? (
                  <div className="role-grid">
                    {platform.plans.map((p) => (
                      <article key={p.id}>
                        <Layers3 size={22} />
                        <h3>{p.name}</h3>
                        <p>{p.employee_limit} active employee seats</p>
                        <b>
                          {new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: "INR",
                          }).format(Number(p.price_paise) / 100)}{" "}
                          / month
                        </b>
                        <div className="permission-tags">
                          {JSON.parse(String(p.modules)).map((m: string) => (
                            <span key={m}>{m}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="footnote">
                    The first company creates a foundation trial plan. You can
                    create custom plans at any time.
                  </p>
                )}
              </section>
              <div className="implementation-note">
                <ShieldCheck size={20} />
                <p>
                  Mobile OTP sign-in and company dashboards are active.
                  Onboarding and private documents require configured services.
                  Attendance, leave, payroll and additional modules remain
                  unavailable.
                </p>
              </div>
            </>
          )}
          <footer>
            <span>
              Sohan Soft Tech HRMS <i /> People, thoughtfully managed.
            </span>
            <span>Built for teams. Designed for trust.</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setDialog(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby="dialog-description"
          >
            <button
              className="modal-close icon-button"
              disabled={busy}
              aria-label="Close dialog"
              onClick={() => setDialog(null)}
            >
              <X size={21} />
            </button>
            <span className="modal-symbol">
              <Layers3 size={24} />
            </span>
            <h2 id="dialog-title">{dialog.title}</h2>
            <p id="dialog-description">{dialog.description}</p>
            <form
              onSubmit={submit}
              onChange={(e) => {
                if (dialog.action !== "tenant.create") return;
                const fields = new FormData(e.currentTarget);
                const name = String(fields.get("name") ?? "").trim();
                const explicit = String(fields.get("slug") ?? "").trim();
                const slug = explicit || (name ? slugFromName(name) : "");
                setWorkspacePreview(
                  workspaceSlug.safeParse(slug).success
                    ? workspaceLinks(slug).workspace
                    : "",
                );
              }}
            >
              {dialog.action === "tenant.create" && (
                <p role="status">
                  {workspacePreview
                    ? `Workspace preview: ${workspacePreview}. The server may add a suffix if this name is already reserved.`
                    : "Enter a company name to preview its workspace URL."}
                </p>
              )}
              {dialog.fields.map((f) => (
                <label className="form-field" key={`${dialog.action}-${f.key}`}>
                  <span>
                    {f.label}
                    {f.required && <b> *</b>}
                  </span>
                  {f.type === "employee-picker" ? (
                    <EmployeePicker
                      tenant={tenant}
                      defaultId={f.value ?? ""}
                      name={f.key}
                    />
                  ) : f.options ? (
                    <select
                      name={f.key}
                      required={f.required}
                      defaultValue={f.value ?? f.options[0]?.value}
                    >
                      {!f.options.length && (
                        <option value="">No records available</option>
                      )}
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      name={f.key}
                      required={f.required}
                      rows={f.key === "stages" ? 14 : 4}
                      maxLength={f.key === "stages" ? 20000 : 10000}
                      defaultValue={f.value}
                    />
                  ) : (
                    <input
                      name={f.key}
                      type={f.type ?? "text"}
                      required={f.required}
                      defaultValue={f.value}
                      maxLength={254}
                      min={f.type === "number" ? 0 : undefined}
                    />
                  )}
                  <small>{f.hint}</small>
                </label>
              ))}
              {dialog.action === "dashboard.update" && (
                <fieldset className="permission-picker">
                  <legend>Dashboard widgets · use arrows to reorder</legend>
                  {widgetOrder.map((w, i) => (
                    <label className="widget-choice" key={w}>
                      <input
                        name="widgets"
                        type="checkbox"
                        value={w}
                        defaultChecked={dashboard.widgets.includes(w)}
                      />
                      <span>
                        {
                          (
                            {
                              metrics: "Overview metrics",
                              recruitment: "Hiring pipeline",
                              actions: "Quick actions",
                              people: "Recent employees",
                            } as Record<string, string>
                          )[w]
                        }
                      </span>
                      <button
                        type="button"
                        aria-label={`Move ${w} up`}
                        disabled={i === 0}
                        onClick={() =>
                          setWidgetOrder((order) => {
                            const next = [...order];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            return next;
                          })
                        }
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${w} down`}
                        disabled={i === widgetOrder.length - 1}
                        onClick={() =>
                          setWidgetOrder((order) => {
                            const next = [...order];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            return next;
                          })
                        }
                      >
                        <ArrowDown size={12} />
                      </button>
                    </label>
                  ))}
                </fieldset>
              )}
              {dialog.action === "role.create" && (
                <fieldset className="permission-picker">
                  <legend>Permissions</legend>
                  {boot?.permissions
                    .filter((p) => can(p))
                    .map((p) => (
                      <label key={p}>
                        <input name="permissions" type="checkbox" value={p} />
                        {p}
                      </label>
                    ))}
                </fieldset>
              )}
              {dialog.action === "plan.create" && (
                <fieldset className="permission-picker">
                  <legend>Modules</legend>
                  {[
                    "core",
                    "recruitment",
                    "employee_verification",
                    "private_documents",
                    "onboarding",
                  ].map((p) => (
                    <label key={p}>
                      <input
                        name="modules"
                        type="checkbox"
                        value={p}
                        defaultChecked={["core", "recruitment"].includes(p)}
                      />
                      {p}
                    </label>
                  ))}
                </fieldset>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setDialog(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      {dialog.action === "invite.accept"
                        ? "Accept invitation"
                        : "Save changes"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {inviteLink && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close invitation"
              onClick={() => setInviteLink("")}
            >
              <X size={20} />
            </button>
            <span className="modal-symbol">
              <ShieldCheck size={24} />
            </span>
            <h2 id="invite-title">Invitation created</h2>
            <p>
              Share this link securely with the assigned administrator. It
              expires in 48 hours and requires OTP verification of the invited
              mobile number. No notification has been sent.
            </p>
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
            )}
            <input
              className="invite-input"
              readOnly
              value={inviteLink}
              aria-label="Invitation URL"
            />
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(inviteLink);
                  setNotice("Invitation link copied.");
                  setInviteLink("");
                } catch {
                  setError(
                    "Clipboard access failed. Copy the link from the field.",
                  );
                }
              }}
            >
              <Copy size={16} />
              Copy invitation link
            </button>
          </section>
        </div>
      )}
      {history && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
          >
            <button
              className="modal-close icon-button"
              aria-label="Close history"
              onClick={() => setHistory(null)}
            >
              <X size={20} />
            </button>
            <h2 id="history-title">{historyTitle}</h2>
            {history.length ? (
              <div className="activity-list">
                {history.map((h, i) => (
                  <div key={i}>
                    <span className="activity-dot" />
                    <div>
                      <b>
                        {h.kind ? h.kind : `${h.from_stage} → ${h.to_stage}`}
                      </b>
                      <small>{h.reason || "No decision note"}</small>
                      <small>
                        {new Date(String(h.created_at)).toLocaleString("en-IN")}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No history has been recorded.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
