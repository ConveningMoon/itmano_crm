# Graph Report - .  (2026-07-09)

## Corpus Check
- 265 files · ~170,802 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1100 nodes · 2313 edges · 88 communities (67 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.72)
- Token cost: 613,212 input · 0 output

## Community Hubs (Navigation)
- Intake & CORS API Routes
- Login Form & Lead Charts
- Purchase Templates & Emails
- Resend Email Routes
- New Lead Import Form
- AI Property Extraction
- Scoring Rules Editor
- Lead Sources Admin
- Email Analytics & Lead Picker
- Database Schema Tests
- Tenant & Invitation Admin
- Tenant Context & Agent Actions
- Page Loading Skeletons
- shadcn UI Config
- Email Sequence Actions
- shadcn UI Primitives
- Lead Activity Timeline
- Activity Feed & Visibility
- TypeScript Config
- NPM Dependencies
- Resend Inbound Webhook
- Lead Magnets & Domain Types
- Motion/Animation Primitives
- NPM Dev Dependencies
- Super Admin Hub Feed
- Dashboard & Analytics Pages
- Leads Kanban Board
- Property CRUD Actions
- Channel & Lead Magnet Actions
- Sidebar Navigation
- Score Rules & Breakdown
- Lead Status Actions
- Lead Detail Page Data
- NPM Scripts
- Notifications Page
- Dashboard Layout & Switcher
- RLS Visibility Scoping
- Auth Session & Sign-out
- Bulk Lead Import
- Sequence Step Manager
- Edit Lead Modal
- Status History & Config
- Property Write Guards
- Intake.js Capture Flow
- Reduced-Motion System
- Lead Source Config
- Magic Link Auth Setup
- New Sequence Form
- Lead Submissions List
- Package Metadata
- Super Admin Tenant Switching
- Telegram Notifications
- Manual Lead Actions Panel
- Lead Email Replies List
- Root Layout & Motion Provider
- Resend Domain Setup
- Unsubscribe & Webhook Wiring
- Admin Hub Redirect & KPIs
- Intake.js Core Functions
- Auth Middleware/Proxy
- Notification Agent Routing Test
- A&J Logo Brand Assets
- Legacy Funnel Assets
- README Boilerplate Refs
- Middleware Matcher Test
- RLS Test CI Workflow
- ESLint Config
- ITMANO Brand Identity
- MCP Supabase Config
- Next.js Config
- Next.js Env Types
- PostCSS Config
- A&J Logo Variant
- Vercel Cron Config
- File Icon Asset
- Globe Icon Asset
- ITMANO Logo Banner
- Next.js Wordmark Asset
- Vercel Logo Asset
- Window Icon Asset
- CTA Button Style
- Skeleton Loading Component

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 146 edges
2. `getCurrentTenantContext` - 70 edges
3. `requireWriteAccess()` - 30 edges
4. `requireTenantContext()` - 30 edges
5. `scopeFor()` - 18 edges
6. `adminClient` - 17 edges
7. `createFixtures()` - 17 edges
8. `cleanupFixtures()` - 17 edges
9. `LeadPage()` - 16 edges
10. `cn()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `requireTenantContext() route guard` --references--> `getCurrentTenantContext`  [EXTRACTED]
  plan-superadmin-dashboard.md → src/lib/auth/tenant-context.ts
- `resolveTargetTenant() fallback update (guards.ts)` --references--> `getCurrentTenantContext`  [EXTRACTED]
  plan-superadmin-dashboard.md → src/lib/auth/tenant-context.ts
- `getCurrentTenantContext` --shares_data_with--> `acting_as_tenant tenant-context field`  [EXTRACTED]
  src/lib/auth/tenant-context.ts → plan-superadmin-dashboard.md
- `getCurrentTenantContext` --calls--> `getSelectedTenant() helper (src/lib/auth/admin-tenant.ts)`  [EXTRACTED]
  src/lib/auth/tenant-context.ts → plan-superadmin-dashboard.md
- `DashboardPage()` --indirect_call--> `tempColor()`  [INFERRED]
  src/app/(dashboard)/dashboard/page.tsx → src/app/(dashboard)/leads/leads-client.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **intake.js client-side capture flow (script, window.itmano API, channel ID, submit endpoint)** — docs_intake_js_integration_intakejs, docs_intake_js_integration_window_itmano_api, docs_intake_js_integration_intake_submit_endpoint, docs_intake_js_integration_channel_id [EXTRACTED 1.00]
- **Layered defense against Magic Link OTP abuse (UI cooldown, Supabase server limits, escalation options)** — docs_phase3_auth_setup_ui_cooldown, docs_phase3_auth_setup_supabase_rate_limits, docs_phase3_auth_setup_abuse_mitigation_options [EXTRACTED 1.00]
- **Super admin tenant selection flow (cookie set/read/clear + guard)** — plan_superadmin_dashboard_entertenant, plan_superadmin_dashboard_exittohub, plan_superadmin_dashboard_admin_tenant_cookie, plan_superadmin_dashboard_getselectedtenant, plan_superadmin_dashboard_requiretenantcontext [EXTRACTED 1.00]

## Communities (88 total, 21 thin omitted)

### Community 0 - "Intake & CORS API Routes"
Cohesion: 0.06
Nodes (44): err(), POST(), SubmitSchema, CORS_HEADERS, corsOptions(), countDistinctLeadMagnetSubmissions(), err(), FormAnswerSchema (+36 more)

### Community 1 - "Login Form & Lead Charts"
Cohesion: 0.06
Nodes (33): inputStyle, labelStyle, LoginForm(), messageForErrorParam(), AgentDataPoint, CustomTooltipProps, LeadsByAgentChart(), Props (+25 more)

### Community 2 - "Purchase Templates & Emails"
Cohesion: 0.07
Nodes (36): EmailsPage(), LANG_COLOR, LANG_LABEL, getAllPurchaseTemplatesByTenant(), getPurchaseTemplates(), PurchaseTemplateByTenant, PurchaseTemplateRow, isPlaceholder() (+28 more)

### Community 3 - "Resend Email Routes"
Cohesion: 0.08
Nodes (33): resend, DryRunDetail, POST(), bodySchema, buildHtml(), errorHtml(), executeUnsubscribe(), GET() (+25 more)

### Community 4 - "New Lead Import Form"
Cohesion: 0.06
Nodes (35): BulkLeadInput, LeadInput, CHANNEL_TYPE_LABELS, DIRECT_ENTRY_SOURCES, errorStyle, FileFormat, FormData, FormErrors (+27 more)

### Community 5 - "AI Property Extraction"
Cohesion: 0.07
Nodes (30): PropertyInput, AiExtractResult, AiPropertyDraft, EXTRACT_TOOL, PROMPT, PROPERTY_TYPES, PropertiesPage(), canWrite() (+22 more)

### Community 6 - "Scoring Rules Editor"
Cohesion: 0.06
Nodes (31): BTN_PRIMARY, buildDraft(), CARD, CARD_HEADER, DIM_HEADER, DIMENSION_LABELS, DraftEntry, DraftMap (+23 more)

### Community 7 - "Lead Sources Admin"
Cohesion: 0.07
Nodes (24): SourcesPage(), AgentOption, BTN_GHOST, BTN_PRIMARY, CHANNEL_TYPE_COLORS, CHANNEL_TYPE_LABELS, INPUT, LABEL (+16 more)

### Community 8 - "Email Analytics & Lead Picker"
Cohesion: 0.10
Nodes (29): CARD, EmailAnalyticsPage(), pctColor(), EmailMetricsCard(), Props, ManualLeadPicker(), PickerLead, Props (+21 more)

### Community 9 - "Database Schema Tests"
Cohesion: 0.25
Nodes (8): adminClient, asSuperAdmin(), asUser(), cleanupFixtures(), clientOptions, createFixtures(), _jwtCache, ws

### Community 10 - "Tenant & Invitation Admin"
Cohesion: 0.12
Nodes (19): GET(), markInvitationAccepted(), createTenant(), CreateTenantSchema, exitToHub(), provisionOwner(), ProvisionOwnerSchema, ROLE_LABELS (+11 more)

### Community 11 - "Tenant Context & Agent Actions"
Cohesion: 0.14
Nodes (21): acting_as_tenant tenant-context field, getSelectedTenant() helper (src/lib/auth/admin-tenant.ts), requireTenantContext() route guard, resolveTargetTenant() fallback update (guards.ts), enterTenant(), updatePurchaseTemplate(), createAgent(), CreateAgentSchema (+13 more)

### Community 13 - "shadcn UI Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 14 - "Email Sequence Actions"
Cohesion: 0.18
Nodes (19): addLeadsToSequence(), addStep(), BulkEnrollResult, createSequence(), deleteSequence(), deleteStep(), getTenantId(), moveStep() (+11 more)

### Community 15 - "shadcn UI Primitives"
Cohesion: 0.16
Nodes (13): Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage(), Badge(), badgeVariants (+5 more)

### Community 16 - "Lead Activity Timeline"
Cohesion: 0.12
Nodes (18): ActivityTimeline(), DEFAULT_EVENT, EVENT_ICON_MAP, formatDateTime(), ACTION_BTN_STYLE, CARD, CARD_TITLE, formatDateTime() (+10 more)

### Community 17 - "Activity Feed & Visibility"
Cohesion: 0.19
Nodes (13): ActivityRow(), EVENT_META, timeAgo(), ActivityPage(), ActivityViewer, isEventVisibleToViewer(), getAuthEmailsByIds(), ActivityItem (+5 more)

### Community 18 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 19 - "NPM Dependencies"
Cohesion: 0.11
Nodes (19): dependencies, @anthropic-ai/sdk, @base-ui/react, class-variance-authority, clsx, lucide-react, motion, next (+11 more)

### Community 20 - "Resend Inbound Webhook"
Cohesion: 0.17
Nodes (16): EVENT_DESCRIPTIONS, extractEmail(), handleInboundEvent(), handleOutboundEvent(), htmlToText(), log(), LogResult, OUTBOUND_TYPE_MAP (+8 more)

### Community 21 - "Lead Magnets & Domain Types"
Cohesion: 0.19
Nodes (13): LeadMagnetsPage(), EditLeadModalProps, AgentRow, LeadMagnetRow, mapLeadMagnet(), Agent, AgentSpecialty, Lead (+5 more)

### Community 22 - "Motion/Animation Primitives"
Cohesion: 0.13
Nodes (12): AnimatedNumber(), AnimatedNumberProps, GrowBar(), GrowBarProps, EASE_OUT_PREMIUM, FadeInProps, groupVariants, itemVariants (+4 more)

### Community 23 - "NPM Dev Dependencies"
Cohesion: 0.12
Nodes (17): devDependencies, dotenv, eslint, eslint-config-next, jsonwebtoken, tailwindcss, @tailwindcss/postcss, @types/jsonwebtoken (+9 more)

### Community 24 - "Super Admin Hub Feed"
Cohesion: 0.22
Nodes (12): HubFeed(), relativeTime(), AdminPage(), relativeTime(), TenantCard(), getNotifications(), NotificationRow, getHubData() (+4 more)

### Community 25 - "Dashboard & Analytics Pages"
Cohesion: 0.32
Nodes (14): AnalyticsPage(), AgentStat, DashboardPage(), getInitials(), getTempColor(), EmailSequenceDetailPage(), ChannelOption, NewLeadPage() (+6 more)

### Community 26 - "Leads Kanban Board"
Cohesion: 0.15
Nodes (13): CHANNEL_SOURCE_TYPES, CHANNEL_TYPE_LABELS, FILTER_LABEL, formatDate(), getInitials(), getKanbanLeads(), KANBAN_COLUMNS, LeadAvatar() (+5 more)

### Community 27 - "Property CRUD Actions"
Cohesion: 0.20
Nodes (16): createProperty(), deleteProperty(), deletePropertyMediaByUrls(), EXT_BY_TYPE, httpUrl, IMAGE_TYPES, objectPathFromPublicUrl(), ParsedProperty (+8 more)

### Community 28 - "Channel & Lead Magnet Actions"
Cohesion: 0.27
Nodes (16): archiveChannel(), createContactForm(), CreateContactFormResult, createEvent(), CreateEventResult, createLeadMagnet(), CreateLeadMagnetResult, deleteChannelPermanently() (+8 more)

### Community 29 - "Sidebar Navigation"
Cohesion: 0.27
Nodes (11): MobileNav(), ICONS, NavItem(), NavItemProps, initialsFromEmail(), NavItemDef, navItems, navItemsForRole() (+3 more)

### Community 30 - "Score Rules & Breakdown"
Cohesion: 0.21
Nodes (9): SettingsPage(), getGlobalScoreRules(), mapRule(), ScoreRule, ScoreRuleRow, buildScoreBreakdown(), FitLine, ScoreBreakdown (+1 more)

### Community 31 - "Lead Status Actions"
Cohesion: 0.30
Nodes (12): POST(), applyManualAction(), deleteLead(), FROZEN_STATUSES, LeadGuardRow, loadGuardedLead(), startPurchaseProcess(), updateLead() (+4 more)

### Community 32 - "Lead Detail Page Data"
Cohesion: 0.24
Nodes (10): FROZEN_STATUSES, LeadPage(), getSubmissionsForLead(), getLeadEmailReplies(), getLeadStatusHistory(), LeadEventRow, LeadRow, mapLeadEvent() (+2 more)

### Community 33 - "NPM Scripts"
Cohesion: 0.17
Nodes (12): scripts, build, dev, lint, start, test:auth, test:import, test:leads (+4 more)

### Community 34 - "Notifications Page"
Cohesion: 0.24
Nodes (8): markAllNotificationsRead(), MarkReadOnMount(), FILTER_TYPES, metaFor(), NotificationsPage(), relativeTime(), TYPE_CONFIG, TypeMeta

### Community 35 - "Dashboard Layout & Switcher"
Cohesion: 0.35
Nodes (7): DashboardLayout(), TenantSwitcher(), PAGE_TITLES, Topbar(), getUnreadCount(), getTenantsForSwitcher(), SwitcherTenant

### Community 36 - "RLS Visibility Scoping"
Cohesion: 0.24
Nodes (7): isAgentScoped(), isRowVisible(), ScopableQuery, VisibilityScope, AGENT, OWNER, SUPER

### Community 37 - "Auth Session & Sign-out"
Cohesion: 0.33
Nodes (5): GET(), getSelectedTenant(), SelectedTenant, signOut(), createClient()

### Community 38 - "Bulk Lead Import"
Cohesion: 0.38
Nodes (9): BulkImportResult, createLead(), createLeadsBulk(), genId(), getExistingLeadEmails(), MANUAL_TRAFFIC_SOURCES, normEmail(), generatePropertyFromPdf() (+1 more)

### Community 39 - "Sequence Step Manager"
Cohesion: 0.31
Nodes (8): delayLabel(), INPUT, LABEL, Props, StepFormState, StepManager(), SequenceStep, StepMetric

### Community 40 - "Edit Lead Modal"
Cohesion: 0.25
Nodes (7): CHANNEL_TYPE_LABELS, CHANNEL_TYPE_ORDER, EditLeadModal(), INPUT_STYLE, LABEL_STYLE, ModalShell(), ModalShellProps

### Community 41 - "Status History & Config"
Cohesion: 0.28
Nodes (6): formatDateTime(), SOURCE_LABELS, StatusHistoryTimeline(), LANGUAGE_CONFIG, STATUS_CONFIG, StatusChange

### Community 42 - "Property Write Guards"
Cohesion: 0.28
Nodes (7): assertCanWriteProperty(), AuthDenial, TenantContext, agentA1, ownerA, superActingAsA, superAdmin

### Community 43 - "Intake.js Capture Flow"
Cohesion: 0.29
Nodes (8): Channel Public ID (data-channel attribute), Honeypot anti-bot field (website input), POST /api/intake/[publicId]/submit, intake.js embed script, data-itmano-form automatic form wiring, quiz_answers -> leads.metadata.quiz_answers, UTM parameter tracking (sessionStorage persistence), window.itmano client API (submit/visitorId/utms/channel)

### Community 44 - "Reduced-Motion System"
Cohesion: 0.25
Nodes (8): AnimatedNumber component, .card-interactive / .row-hover CSS hover recipe, FadeIn primitive, GrowBar component, ModalShell component, MotionProvider (LazyMotion domMax + MotionConfig reducedMotion=user), prefers-reduced-motion handled across motion/react, CSS, and recharts, StaggerGroup / StaggerItem

### Community 45 - "Lead Source Config"
Cohesion: 0.32
Nodes (6): CHANNEL_SOURCES, DIRECT_ENTRY_SOURCES, getLeadSource(), LEAD_SOURCE_FILTER_OPTIONS, LeadSource, OTHER_TRAFFIC_LABELS

### Community 46 - "Magic Link Auth Setup"
Cohesion: 0.29
Nodes (7): Escalation options if abuse becomes real (Turnstile/hCaptcha, IP rate limiting, Supabase Pro), Magic Link Auth (Supabase signInWithOtp), Supabase Redirect URLs allowlist, Supabase Auth Site URL configuration, Supabase Auth server-side OTP rate limits (second line of defense), Login UI 60s resend cooldown (first line of defense), user_profiles seed re-run (migration 012_seed_user_profiles.sql)

### Community 47 - "New Sequence Form"
Cohesion: 0.33
Nodes (5): INPUT, LABEL, NewSequenceForm(), Props, NewSequencePage()

### Community 48 - "Lead Submissions List"
Cohesion: 0.38
Nodes (6): CHANNEL_TYPE_LABELS, LeadSubmissionsList(), relativeTime(), SubmissionItem(), usesRespondedState(), LeadSubmissionRow

### Community 49 - "Package Metadata"
Cohesion: 0.33
Nodes (5): name, overrides, postcss, private, version

### Community 50 - "Super Admin Tenant Switching"
Cohesion: 0.40
Nodes (6): itmano-admin-tenant httpOnly cookie mechanism, enterTenant() server action, exitToHub() server action, Super Admin Hub + Tenant Selection feature plan, Removal of hardcoded 'tenant-aj' fallback (resolves TODO admin-onboarding), TenantSwitcher topbar component

### Community 51 - "Telegram Notifications"
Cohesion: 0.60
Nodes (4): buildMessage(), POST(), resolveChatIds(), sendTelegramMessage()

### Community 52 - "Manual Lead Actions Panel"
Cohesion: 0.40
Nodes (5): FROZEN_STATUSES, ManualActionItem, ManualActionsPanel(), ManualActionsPanelProps, LeadStatus

### Community 53 - "Lead Email Replies List"
Cohesion: 0.50
Nodes (4): formatDateTime(), LeadEmailRepliesList(), ReplyItem(), LeadEmailReply

### Community 56 - "Resend Domain Setup"
Cohesion: 0.50
Nodes (4): CRON_SECRET env var (reused from Phase 2), Resend sending domain verification (mail.ajrealestateva.com), RESEND_API_KEY env var, /api/test/resend-send temporary smoke-test endpoint

### Community 57 - "Unsubscribe & Webhook Wiring"
Cohesion: 0.50
Nodes (4): email.unsubscribed lead_event, -50 scoring side effect, Custom HMAC unsubscribe endpoint (GET /api/unsubscribe), /api/webhooks/resend endpoint, RESEND_WEBHOOK_SECRET (signing secret)

### Community 58 - "Admin Hub Redirect & KPIs"
Cohesion: 0.50
Nodes (4): auth/callback role-based post-login redirect, getHubData() KPI + tenant aggregation function, Rewritten /admin 'Centro de control' hub page, navItemsForRole() hub mode

### Community 59 - "Intake.js Core Functions"
Cohesion: 0.83
Nodes (3): showElement(), wireAll(), wireForm()

### Community 61 - "Notification Agent Routing Test"
Cohesion: 0.67
Nodes (3): ADMIN_TYPES, LEAD_LINKED_TYPES, notificationAgentId()

### Community 63 - "A&J Logo Brand Assets"
Cohesion: 0.67
Nodes (3): A&J Real Estate Group (Tenant Brand), Dark-Theme Logo Variant Usage Context, A&J Real Estate Group Logo (White)

### Community 64 - "Legacy Funnel Assets"
Cohesion: 1.00
Nodes (3): A&J Real Estate Group (Pilot Tenant), Legacy (funnel) Lead-Magnet Experiment, Tu Primera Casa en Estados Unidos — Lead Magnet eBook Mockup

### Community 65 - "README Boilerplate Refs"
Cohesion: 0.67
Nodes (3): Next.js, ITMANO CRM README (create-next-app boilerplate), Vercel Platform

## Knowledge Gaps
- **404 isolated node(s):** `supabase`, `$schema`, `style`, `rsc`, `tsx` (+399 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Lead Status Actions` to `Intake & CORS API Routes`, `Login Form & Lead Charts`, `Purchase Templates & Emails`, `Resend Email Routes`, `AI Property Extraction`, `Lead Sources Admin`, `Email Analytics & Lead Picker`, `Tenant & Invitation Admin`, `Tenant Context & Agent Actions`, `Email Sequence Actions`, `Activity Feed & Visibility`, `Resend Inbound Webhook`, `Lead Magnets & Domain Types`, `Super Admin Hub Feed`, `Dashboard & Analytics Pages`, `Property CRUD Actions`, `Channel & Lead Magnet Actions`, `Score Rules & Breakdown`, `Lead Detail Page Data`, `Notifications Page`, `Dashboard Layout & Switcher`, `Auth Session & Sign-out`, `Bulk Lead Import`, `New Sequence Form`, `Telegram Notifications`?**
  _High betweenness centrality (0.255) - this node is a cross-community bridge._
- **Why does `dependencies` connect `NPM Dependencies` to `Package Metadata`, `Resend Email Routes`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `resend` connect `Resend Email Routes` to `NPM Dependencies`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **What connects `supabase`, `$schema`, `style` to the rest of the system?**
  _409 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Intake & CORS API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.06140350877192982 - nodes in this community are weakly interconnected._
- **Should `Login Form & Lead Charts` be split into smaller, more focused modules?**
  _Cohesion score 0.06376811594202898 - nodes in this community are weakly interconnected._
- **Should `Purchase Templates & Emails` be split into smaller, more focused modules?**
  _Cohesion score 0.06659619450317125 - nodes in this community are weakly interconnected._