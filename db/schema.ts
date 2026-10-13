import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  foreignKey,
  index,
} from "drizzle-orm/sqlite-core";
export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  employeeLimit: integer("employee_limit").notNull(),
  modules: text("modules").notNull(),
  pricePaise: integer("price_paise").notNull().default(0),
  createdAt: text("created_at").notNull(),
});
export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  brandColor: text("brand_color").notNull().default("#2563eb"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  currency: text("currency").notNull().default("INR"),
  locale: text("locale").notNull().default("en-IN"),
  employeePrefix: text("employee_prefix").notNull().default("EMP"),
  sequence: integer("sequence").notNull().default(0),
  stages: text("stages").notNull(),
  dashboardConfig: text("dashboard_config")
    .notNull()
    .default(
      '{"title":"Your people. Your workspace.","subtitle":"Everything you need to move your team forward.","widgets":["metrics","recruitment","actions","people"],"density":"comfortable","hero":"gradient"}',
    ),
  createdAt: text("created_at").notNull(),
});
export const subscriptions = sqliteTable("subscriptions", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  status: text("status").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    permissions: text("permissions").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("roles_scope").on(t.tenantId, t.id),
    uniqueIndex("roles_name").on(t.tenantId, t.name),
  ],
);
export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    roleId: text("role_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("membership_user").on(t.tenantId, t.userId),
    foreignKey({
      columns: [t.tenantId, t.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }),
  ],
);
export const branches = sqliteTable(
  "branches",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("branch_scope").on(t.tenantId, t.id),
    uniqueIndex("branch_name").on(t.tenantId, t.name),
  ],
);
export const departments = sqliteTable(
  "departments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("department_scope").on(t.tenantId, t.id),
    uniqueIndex("department_name").on(t.tenantId, t.name),
  ],
);
export const employees = sqliteTable(
  "employees",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeCode: text("employee_code").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    designation: text("designation").notNull(),
    departmentId: text("department_id"),
    branchId: text("branch_id"),
    joiningDate: text("joining_date").notNull(),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("employee_code").on(t.tenantId, t.employeeCode),
    uniqueIndex("employee_email").on(t.tenantId, t.email),
    index("employee_search").on(t.tenantId, t.status),
    uniqueIndex("employee_scope").on(t.tenantId, t.id),
    index("employee_org").on(t.tenantId, t.branchId, t.departmentId, t.status),
    foreignKey({
      columns: [t.tenantId, t.departmentId],
      foreignColumns: [departments.tenantId, departments.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
  ],
);
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    location: text("location").notNull(),
    status: text("status").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("job_scope").on(t.tenantId, t.id)],
);
export const candidates = sqliteTable(
  "candidates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: text("job_id").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    source: text("source").notNull(),
    stage: text("stage").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("candidate_scope").on(t.tenantId, t.id),
    uniqueIndex("candidate_application").on(t.tenantId, t.jobId, t.email),
    foreignKey({
      columns: [t.tenantId, t.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }),
    index("candidate_pipeline").on(t.tenantId, t.stage),
  ],
);
export const candidateHistory = sqliteTable(
  "candidate_history",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    candidateId: text("candidate_id").notNull(),
    fromStage: text("from_stage").notNull(),
    toStage: text("to_stage").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.candidateId],
      foreignColumns: [candidates.tenantId, candidates.id],
    }),
  ],
);
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    mobile: text("mobile"),
    roleId: text("role_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }),
  ],
);
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resourceId: text("resource_id").notNull(),
    details: text("details").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_scope").on(t.tenantId, t.createdAt)],
);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  window: integer("window").notNull(),
  count: integer("count").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  mobile: text("mobile").notNull().unique(),
  email: text("email").notNull().default(""),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("active"),
  verifiedAt: text("verified_at"),
  createdAt: text("created_at").notNull(),
});
export const sessions = sqliteTable(
  "sessions",
  {
    realm: text("realm").notNull().default("platform"),
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("session_user").on(t.userId)],
);
export const otpChallenges = sqliteTable("otp_challenges", {
  realm: text("realm").notNull().default("platform"),
  id: text("id").primaryKey(),
  mobile: text("mobile").notNull().unique(),
  tokenHash: text("token_hash").notNull().unique(),
  state: text("state").notNull(),
  attempts: integer("attempts").notNull().default(0),
  requestId: text("request_id"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});
export const supportAccess = sqliteTable(
  "support_access",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    reason: text("reason").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("support_session").on(t.sessionId, t.tenantId)],
);

export const roleScopes = sqliteTable(
  "role_scopes",
  {
    roleId: text("role_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: text("branch_id"),
    departmentId: text("department_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.departmentId],
      foreignColumns: [departments.tenantId, departments.id],
    }),
  ],
);
export const jobOrganization = sqliteTable(
  "job_organization",
  {
    jobId: text("job_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: text("branch_id"),
    departmentId: text("department_id"),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.branchId],
      foreignColumns: [branches.tenantId, branches.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.departmentId],
      foreignColumns: [departments.tenantId, departments.id],
    }),
  ],
);
export const employeeHistory = sqliteTable(
  "employee_history",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeId: text("employee_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: text("kind").notNull(),
    reason: text("reason").notNull(),
    snapshot: text("snapshot").notNull(),
    effectiveDate: text("effective_date").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    index("employee_history_lookup").on(t.tenantId, t.employeeId, t.createdAt),
  ],
);
export const membershipRevocations = sqliteTable("membership_revocations", {
  membershipId: text("membership_id")
    .primaryKey()
    .references(() => memberships.id),
  revokedAt: text("revoked_at").notNull(),
  restoredAt: text("restored_at"),
  reason: text("reason").notNull(),
  actorId: text("actor_id").notNull(),
});

export const employeeAccounts = sqliteTable(
  "employee_accounts",
  {
    employeeId: text("employee_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: text("user_id").notNull(),
    version: integer("version").notNull().default(1),
    revokedAt: text("revoked_at"),
    actorId: text("actor_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.userId],
      foreignColumns: [memberships.tenantId, memberships.userId],
    }),
    uniqueIndex("employee_account_active_user")
      .on(t.tenantId, t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
export const employeeActivations = sqliteTable(
  "employee_activations",
  {
    invitationId: text("invitation_id")
      .primaryKey()
      .references(() => invitations.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeId: text("employee_id").notNull(),
    claimId: text("claim_id"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    index("activation_employee").on(t.tenantId, t.employeeId),
  ],
);
export const employeeReporting = sqliteTable(
  "employee_reporting",
  {
    employeeId: text("employee_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    managerId: text("manager_id"),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.managerId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    index("reporting_manager").on(t.tenantId, t.managerId),
  ],
);
export const profileRequests = sqliteTable(
  "profile_requests",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeId: text("employee_id").notNull(),
    actorId: text("actor_id").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    employeeVersion: integer("employee_version").notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("pending"),
    decisionId: text("decision_id"),
    reviewerId: text("reviewer_id"),
    reviewReason: text("review_reason"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    uniqueIndex("profile_request_pending")
      .on(t.tenantId, t.employeeId)
      .where(sql`${t.status}='pending'`),
    index("profile_request_queue").on(t.tenantId, t.status, t.createdAt),
  ],
);
export const tenantBranding = sqliteTable("tenant_branding", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  accentColor: text("accent_color").notNull().default("#D9A441"),
  logoData: text("logo_data"),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const tenantSlugAliases = sqliteTable(
  "tenant_slug_aliases",
  {
    slug: text("slug").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("tenant_slug_aliases_tenant").on(t.tenantId)],
);

export const tenantDomains = sqliteTable(
  "tenant_domains",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    hostname: text("hostname").notNull().unique(),
    status: text("status").notNull().default("pending"),
    ownershipStatus: text("ownership_status").notNull().default("pending"),
    challenge: text("challenge").notNull(),
    challengeExpiresAt: text("challenge_expires_at").notNull(),
    ownershipCheckedAt: text("ownership_checked_at"),
    providerId: text("provider_id"),
    providerStatus: text("provider_status").notNull().default("unconfigured"),
    tlsStatus: text("tls_status").notNull().default("unknown"),
    providerCheckedAt: text("provider_checked_at"),
    providerDeploymentVersion: text("provider_deployment_version"),
    cnameTarget: text("cname_target"),
    providerRecords: text("provider_records").notNull().default("[]"),
    routingStatus: text("routing_status").notNull().default("pending"),
    routingCheckedAt: text("routing_checked_at"),
    isPrimary: integer("is_primary").notNull().default(0),
    sessionEpoch: integer("session_epoch").notNull().default(1),
    version: integer("version").notNull().default(1),
    activatedAt: text("activated_at"),
    verifiedUntil: text("verified_until"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("tenant_domains_tenant").on(t.tenantId, t.status),
    uniqueIndex("tenant_domains_primary")
      .on(t.tenantId)
      .where(sql`${t.isPrimary}=1 AND ${t.status}='active'`),
  ],
);

// Credential values are runtime secrets, never stored in these tables.
export const secureIdPlatform = sqliteTable("secure_id_platform", {
  id: text("id").primaryKey(),
  enabled: integer("enabled").notNull().default(0),
  mode: text("mode").notNull().default("sandbox"),
  panEnabled: integer("pan_enabled").notNull().default(0),
  digilockerEnabled: integer("digilocker_enabled").notNull().default(0),
  lastTestAt: text("last_test_at"),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});
export const employeeVerificationPolicy = sqliteTable(
  "employee_verification_policy",
  {
    tenantId: text("tenant_id")
      .primaryKey()
      .references(() => tenants.id),
    enabled: integer("enabled").notNull().default(0),
    panRequired: integer("pan_required").notNull().default(0),
    digilockerEnabled: integer("digilocker_enabled").notNull().default(0),
    nameReviewThreshold: integer("name_review_threshold")
      .notNull()
      .default(100),
    hrReviewRequired: integer("hr_review_required").notNull().default(1),
    retentionDays: integer("retention_days").notNull().default(90),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
);
export const verificationRoleGrants = sqliteTable(
  "verification_role_grants",
  {
    roleId: text("role_id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    canView: integer("can_view").notNull().default(0),
    canReview: integer("can_review").notNull().default(0),
    canViewDocuments: integer("can_view_documents").notNull().default(0),
    canReviewDocuments: integer("can_review_documents").notNull().default(0),
    canManageOnboarding: integer("can_manage_onboarding").notNull().default(0),
    canApproveOnboarding: integer("can_approve_onboarding")
      .notNull()
      .default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }),
  ],
);
export const employeeVerificationChecks = sqliteTable(
  "employee_verification_checks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    employeeId: text("employee_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    requestId: text("request_id").notNull(),
    requestHash: text("request_hash").notNull(),
    mode: text("mode").notNull(),
    product: text("product").notNull().default("pan_lite"),
    status: text("status").notNull().default("pending"),
    maskedIdentifier: text("masked_identifier").notNull(),
    providerReference: text("provider_reference"),
    nameMatched: integer("name_matched"),
    dobMatched: integer("dob_matched"),
    panStatus: text("pan_status"),
    subjectNameHash: text("subject_name_hash"),
    nameScore: integer("name_score"),
    purpose: text("purpose").notNull().default("employment_identity"),
    transportStatus: text("transport_status"),
    consentVersion: text("consent_version").notNull(),
    consentAt: text("consent_at").notNull(),
    policyVersion: integer("policy_version").notNull(),
    reviewStatus: text("review_status").notNull().default("pending"),
    reviewerId: text("reviewer_id").references(() => users.id),
    reviewReason: text("review_reason"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
    retainUntil: text("retain_until").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    uniqueIndex("verification_check_scope").on(t.tenantId, t.employeeId, t.id),
    uniqueIndex("verification_request_unique").on(
      t.tenantId,
      t.employeeId,
      t.requestId,
    ),
    uniqueIndex("verification_inflight_unique")
      .on(t.tenantId, t.employeeId, t.product)
      .where(sql`${t.status} IN ('pending','needs_reconciliation')`),
    index("verification_queue").on(t.tenantId, t.status, t.createdAt),
  ],
);
export const secureIdWebhookReceipts = sqliteTable(
  "secure_id_webhook_receipts",
  {
    id: text("id").primaryKey(),
    mode: text("mode").notNull(),
    bodyHash: text("body_hash").notNull(),
    processingStatus: text("processing_status")
      .notNull()
      .default("unsupported"),
    checkId: text("check_id"),
    lastError: text("last_error"),
    receivedAt: text("received_at").notNull(),
  },
  (t) => [uniqueIndex("secure_id_webhook_unique").on(t.mode, t.bodyHash)],
);

export const privateEmployeeDocuments = sqliteTable(
  "private_employee_documents",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    employeeId: text("employee_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    requestId: text("request_id").notNull(),
    objectKey: text("object_key").notNull().unique(),
    digest: text("digest").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    category: text("category").notNull(),
    scanStatus: text("scan_status").notNull().default("quarantined"),
    uploadedAt: text("uploaded_at"),
    scanAt: text("scan_at"),
    scanReceiptHash: text("scan_receipt_hash"),
    scanRequestId: text("scan_request_id"),
    parentId: text("parent_id"),
    documentVersion: integer("document_version").notNull().default(1),
    reviewStatus: text("review_status").notNull().default("pending"),
    reviewerId: text("reviewer_id"),
    reviewedAt: text("reviewed_at"),
    reviewReason: text("review_reason"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    retainUntil: text("retain_until").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    uniqueIndex("private_document_scope").on(t.tenantId, t.employeeId, t.id),
    uniqueIndex("private_document_request").on(
      t.tenantId,
      t.employeeId,
      t.requestId,
    ),
    index("private_document_employee").on(
      t.tenantId,
      t.employeeId,
      t.createdAt,
    ),
  ],
);

export const onboardingTemplates = sqliteTable(
  "onboarding_templates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    definition: text("definition").notNull(),
    version: integer("version").notNull().default(1),
    archivedAt: text("archived_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("onboarding_template_scope").on(t.tenantId, t.id)],
);
export const recruitmentOffers = sqliteTable(
  "recruitment_offers",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    candidateId: text("candidate_id").notNull(),
    terms: text("terms").notNull(),
    joiningDate: text("joining_date").notNull(),
    expiresAt: text("expires_at").notNull(),
    status: text("status").notNull().default("draft"),
    makerId: text("maker_id")
      .notNull()
      .references(() => users.id),
    checkerId: text("checker_id").references(() => users.id),
    approvedAt: text("approved_at"),
    acceptedBy: text("accepted_by").references(() => users.id),
    acceptedAt: text("accepted_at"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("recruitment_offer_scope").on(t.tenantId, t.candidateId, t.id),
    foreignKey({
      columns: [t.tenantId, t.candidateId],
      foreignColumns: [candidates.tenantId, candidates.id],
    }),
  ],
);
export const onboardingCases = sqliteTable(
  "onboarding_cases",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    employeeId: text("employee_id").notNull(),
    candidateId: text("candidate_id"),
    offerId: text("offer_id"),
    invitationId: text("invitation_id")
      .notNull()
      .unique()
      .references(() => invitations.id),
    templateId: text("template_id").notNull(),
    templateSnapshot: text("template_snapshot").notNull(),
    userId: text("user_id").references(() => users.id),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("invited"),
    version: integer("version").notNull().default(1),
    formCiphertext: text("form_ciphertext"),
    formConsentAt: text("form_consent_at"),
    submittedAt: text("submitted_at"),
    reason: text("reason"),
    reviewerId: text("reviewer_id").references(() => users.id),
    approvedAt: text("approved_at"),
    approvalNonce: text("approval_nonce"),
    currentCheckId: text("current_check_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("onboarding_case_tenant_scope").on(t.tenantId, t.id),
    uniqueIndex("onboarding_case_scope").on(t.tenantId, t.employeeId, t.id),
    uniqueIndex("onboarding_candidate_once")
      .on(t.tenantId, t.candidateId)
      .where(sql`${t.candidateId} IS NOT NULL`),
    uniqueIndex("onboarding_employee_inflight")
      .on(t.tenantId, t.employeeId)
      .where(sql`${t.status} NOT IN ('approved','rejected','revoked')`),
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.candidateId],
      foreignColumns: [candidates.tenantId, candidates.id],
    }),
    foreignKey({
      columns: [t.tenantId, t.candidateId, t.offerId],
      foreignColumns: [
        recruitmentOffers.tenantId,
        recruitmentOffers.candidateId,
        recruitmentOffers.id,
      ],
    }),
    foreignKey({
      columns: [t.tenantId, t.templateId],
      foreignColumns: [onboardingTemplates.tenantId, onboardingTemplates.id],
    }),
    index("onboarding_queue").on(t.tenantId, t.status, t.updatedAt),
  ],
);
export const onboardingCaseChecks = sqliteTable(
  "onboarding_case_checks",
  {
    checkId: text("check_id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    employeeId: text("employee_id").notNull(),
    caseId: text("case_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId, t.caseId],
      foreignColumns: [
        onboardingCases.tenantId,
        onboardingCases.employeeId,
        onboardingCases.id,
      ],
    }),
    foreignKey({
      columns: [t.tenantId, t.employeeId, t.checkId],
      foreignColumns: [
        employeeVerificationChecks.tenantId,
        employeeVerificationChecks.employeeId,
        employeeVerificationChecks.id,
      ],
    }),
  ],
);
export const onboardingTaskCompletions = sqliteTable(
  "onboarding_task_completions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    caseId: text("case_id").notNull(),
    taskKey: text("task_key").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    completedAt: text("completed_at").notNull(),
  },
  (t) => [
    uniqueIndex("onboarding_task_once").on(t.caseId, t.taskKey),
    foreignKey({
      columns: [t.tenantId, t.caseId],
      foreignColumns: [onboardingCases.tenantId, onboardingCases.id],
    }),
  ],
);
export const documentSlots = sqliteTable(
  "document_slots",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    employeeId: text("employee_id").notNull(),
    category: text("category").notNull(),
    currentId: text("current_id").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("document_slot_unique").on(
      t.tenantId,
      t.employeeId,
      t.category,
    ),
    foreignKey({
      columns: [t.tenantId, t.employeeId, t.currentId],
      foreignColumns: [
        privateEmployeeDocuments.tenantId,
        privateEmployeeDocuments.employeeId,
        privateEmployeeDocuments.id,
      ],
    }),
  ],
);
export const verificationReconciliations = sqliteTable(
  "verification_reconciliations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    employeeId: text("employee_id").notNull(),
    checkId: text("check_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: text("kind").notNull(),
    outcome: text("outcome").notNull(),
    reason: text("reason").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId, t.checkId],
      foreignColumns: [
        employeeVerificationChecks.tenantId,
        employeeVerificationChecks.employeeId,
        employeeVerificationChecks.id,
      ],
    }),
    index("verification_reconciliation_history").on(t.checkId, t.createdAt),
  ],
);
export const hostedVerificationFlows = sqliteTable(
  "hosted_verification_flows",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    employeeId: text("employee_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    mode: text("mode").notNull(),
    requestId: text("request_id").notNull(),
    product: text("product").notNull().default("digilocker_consent"),
    providerReference: text("provider_reference"),
    status: text("status").notNull().default("pending"),
    urlCiphertext: text("url_ciphertext"),
    consentAt: text("consent_at").notNull(),
    consentVersion: text("consent_version").notNull(),
    consentValidUntil: text("consent_valid_until"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }),
    uniqueIndex("hosted_verification_request").on(
      t.tenantId,
      t.employeeId,
      t.requestId,
    ),
    index("hosted_verification_pending").on(t.status, t.updatedAt),
    uniqueIndex("hosted_verification_inflight")
      .on(t.tenantId, t.employeeId, t.product)
      .where(sql`${t.status} IN ('pending','needs_reconciliation')`),
  ],
);
export const workflowJobs = sqliteTable(
  "workflow_jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kind: text("kind").notNull(),
    resourceId: text("resource_id").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull(),
    leaseId: text("lease_id"),
    leaseUntil: text("lease_until"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("workflow_job_due").on(t.status, t.availableAt)],
);
export const inappNotifications = sqliteTable(
  "inapp_notifications",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    eventKey: text("event_key").notNull(),
    kind: text("kind").notNull(),
    resourceId: text("resource_id").notNull(),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("inapp_notification_once").on(t.userId, t.eventKey),
    index("inapp_notification_queue").on(t.userId, t.tenantId, t.createdAt),
  ],
);
export const recruitmentInterviews = sqliteTable(
  "recruitment_interviews",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    candidateId: text("candidate_id").notNull(),
    scheduledAt: text("scheduled_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    panel: text("panel").notNull(),
    status: text("status").notNull().default("scheduled"),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.candidateId],
      foreignColumns: [candidates.tenantId, candidates.id],
    }),
    uniqueIndex("recruitment_interview_scope").on(t.tenantId, t.id),
  ],
);
export const interviewFeedback = sqliteTable(
  "interview_feedback",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    interviewId: text("interview_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    score: integer("score").notNull(),
    decision: text("decision").notNull(),
    notes: text("notes").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.interviewId],
      foreignColumns: [
        recruitmentInterviews.tenantId,
        recruitmentInterviews.id,
      ],
    }),
    uniqueIndex("interview_feedback_once").on(t.interviewId, t.userId),
  ],
);
export const jobPublications = sqliteTable(
  "job_publications",
  {
    jobId: text("job_id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    enabled: integer("enabled").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.jobId],
      foreignColumns: [jobs.tenantId, jobs.id],
    }),
  ],
);
