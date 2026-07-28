# Graph Report - .  (2026-07-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2156 nodes · 4622 edges · 255 communities (139 shown, 116 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.74)
- Token cost: 174,480 input · 5,897 output

## Graph Freshness
- Built from commit: `d8f750f2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lead Magnet Intake Endpoint
- Analytics Charts
- Email Sequence Detail Pages
- Sequence Orchestrator & Resend Accounts
- New Lead Client Form
- Properties Client UI
- Dashboard Layout
- Sources Client UI
- Email Analytics Metrics
- Database RLS Test Suites
- Admin Tenant Actions
- Agent & Settings Actions
- Route Loading States
- AI Usage Panel
- Email Sequence Actions
- UI Primitives
- Lead Detail & AI Fit Card
- Sidebar Navigation
- Subscription Persistence & Degradation
- Runtime Dependencies
- Resend Webhook Handler
- Public Property Pages
- Analytics Page & Motion Primitives
- Dev Dependencies
- TypeScript Config
- Carousel Tabs & Brand Context
- Leads Kanban Client
- Lead Creation & Bulk Import
- Acquisition Channel Actions
- Hosted Page Editor
- Scoring Section Editor
- Lead Detail Actions
- Lead & Lead-Magnet Pages
- npm Scripts
- Notifications Inbox
- Topbar & Tenant Switcher
- Carousel Brand & Compositor
- Support & AI Capacity Requests
- shadcn Component Config
- Sequence Step Manager
- Activity & Dashboard UI
- Auth Callback & Provisioning
- Edit Lead Modal & Domain Types
- New Sequence & Activity Page
- Animated Number Component
- Carousel Engine & Costs
- Bot Abuse Escalation
- Pricing Comparison Page
- Form Submissions List
- Package Metadata
- Admin Tenant Cookie
- Telegram Dispatch & Contact Form
- Settings & Score Rules
- Carousel Generation Actions
- Root Layout & Motion
- Cron Secret Env
- Unsubscribe Scoring Effect
- Post-Login Redirect
- Hosted Form Intake
- Hosted Page Schema & Proxy
- Notification Agent Routing
- A&J Brand Logo (Dark)
- A&J Lead Magnet eBook
- Next.js Framework
- Proxy Middleware Matcher
- RLS Test CI
- ESLint Config
- ITMANO Brand
- Property Form Modal
- Next.js Config
- Next Env Types
- PostCSS Config
- A&J Logo
- Email AI Drafting
- AI Usage Data
- Billing Lifecycle & Subscription Banner
- File Icon Asset
- Globe Icon Asset
- ITMANO Logo Banner
- Next.js Wordmark Asset
- Vercel Logo Asset
- Window Icon Asset
- CTA Button Style
- Skeleton UI Component
- AI Briefing Outcomes
- Modal Shell & Bootstrap
- Contact Submission Handling
- Paddle Billing & Checkout
- Property Detail Pages
- AI Lead Fit Assessment
- Email Composer
- Purchase Templates Panel
- Hosted Page View
- Marketing Landing Page
- Email Unsubscribe Flow
- Carousel Copy Generation
- Gemini Image Generation
- Carousels Client UI
- Manual Lead Picker & Status History
- AI Usage Limit Enforcement
- Acquisition Channels Data
- Platform Requests Inbox
- Hosted Channel Contact Page
- Activity Visibility
- Auth Visibility Scope
- Legal Pages
- Email Rendering
- Initial Schema Migration
- Support Page & Auth Client
- Intake Fit Dimensions
- Carousel Cost Panel
- Hosted Page Options
- Hero Pipeline Demo
- Lead Fit Panel
- Scoring Trigger Migration
- Scoring Engine Migration
- Purchase Templates Actions
- Manual Actions Panel
- Lead Scoring Tables
- Login Page & Client
- AI Usage Chart
- Leads Donut Chart
- Activity Timeline
- Property AI Extraction
- Property Page Options
- Marketing Layout & Nav
- Lead Intake Endpoint
- Notification Hub Feed
- Paddle Catalog Script
- Channel Agent Routing
- Telegram Notifications
- Auth Schema Foundations
- In-CRM Email Content
- Resend Email Send
- Lead Events Scoring Points
- Email Sequences Schema
- Lead Status History Trigger
- Email Sequences Refactor
- Agent Languages Normalization
- Page Build Options
- Agent Languages & Specialty
- Carousel Engine
- Paddle Billing
- Acquisition Channels
- Sequence Orchestrator Columns
- Notification Types & Hot Lead
- Form Submissions
- Purchase Process Emails
- Email Blocking
- Notifications Agent ID
- Subscriptions Schema
- Agent Closing Emails
- AI Lead Fit
- dotenv Dependency
- Channel Public ID
- Form Intake Submit Endpoint
- Intake Embed Script
- Automatic Form Wiring
- Quiz Answers Metadata
- Client Intake API
- Magic Link Auth
- Supabase Redirect Allowlist
- Supabase Site URL Config
- Server-Side OTP Rate Limits
- Login Resend Cooldown
- User Profiles Seed
- Resend Domain Verification
- Resend API Key
- Resend Smoke-Test Endpoint
- HMAC Unsubscribe Endpoint
- Resend Webhook Endpoint
- Resend Webhook Secret
- Acting-As-Tenant Context
- Enter Tenant Action
- Exit To Hub Action
- Hub KPI Aggregation
- Selected Tenant Helper
- Super Admin Hub Plan
- Admin Control Center Page
- Role-Based Nav Items
- Tenant Context Guard
- Target Tenant Resolution
- Hardcoded Tenant Fallback Removal
- Tenant Switcher Component
- Project README
- Vercel Platform
- Card Hover CSS Recipe
- FadeIn Motion Primitive
- GrowBar Component
- Modal Shell Component
- Motion Provider
- Reduced Motion Handling
- Stagger Motion Group
- eslint-config-next
- Supabase MCP Config
- Tailwind CSS
- Tailwind PostCSS
- JWT Types
- OpenType.js Types
- Papaparse Types
- React Types
- Vitest
- ws WebSocket
- Leads Channel Attribution
- Lead Sources Unification
- Email Sends Table
- Leads Metadata
- Sequence Activation Type
- Contact Us Webhook
- Traffic Source Attribution
- Lead Events Actor
- Email Sequences Agent
- Acquisition Channels Agent
- Email Replied Notification
- Email Blocking Reasons
- Lead Email Replies
- Properties Table
- Properties Web Listing
- Property Year Built
- Agent Email Signature
- AI Usage Events
- AI Usage Limits
- Subscription Trial
- AI Usage Agent ID
- Platform Requests
- Hosted Pages
- Property i18n
- Carousel Style Prompt
- Carousel Logs
- AI Briefings
- Carousel Pillar
- Vercel Cron Config

## God Nodes (most connected - your core abstractions)
1. `createAdminClient()` - 258 edges
2. `getCurrentTenantContext` - 119 edges
3. `requireWriteAccess()` - 47 edges
4. `requireTenantContext()` - 32 edges
5. `getTenantAccessFor()` - 23 edges
6. `LeadPage()` - 18 edges
7. `resolveTargetTenant()` - 18 edges
8. `scopeFor()` - 18 edges
9. `usePrefersReducedMotion()` - 17 edges
10. `adminClient` - 17 edges

## Surprising Connections (you probably didn't know these)
- `wireForm()` --indirect_call--> `visitorId()`  [INFERRED]
  public/intake.js → src/app/(hosted)/hp/[tenantSlug]/[channelSlug]/hosted-form.tsx
- `handleLogoChange()` --calls--> `updateTenantLogo()`  [EXTRACTED]
  src/app/(dashboard)/admin/admin-client.tsx → src/app/(dashboard)/settings/actions.ts
- `handleLogoRemove()` --calls--> `removeTenantLogo()`  [EXTRACTED]
  src/app/(dashboard)/admin/admin-client.tsx → src/app/(dashboard)/settings/actions.ts
- `DashboardPage()` --indirect_call--> `tempColor()`  [INFERRED]
  src/app/(dashboard)/dashboard/page.tsx → src/app/(dashboard)/leads/leads-client.tsx
- `POST()` --indirect_call--> `err()`  [INFERRED]
  src/app/api/webhooks/paddle/route.ts → src/app/api/webhooks/webflow/[publicId]/route.ts

## Import Cycles
- None detected.

## Communities (255 total, 116 thin omitted)

### Community 0 - "Lead Magnet Intake Endpoint"
Cohesion: 0.16
Nodes (17): CORS_HEADERS, corsOptions(), countDistinctLeadMagnetSubmissions(), err(), FormAnswerSchema, LM_ENGAGEMENT, ok(), OPTIONS() (+9 more)

### Community 1 - "Analytics Charts"
Cohesion: 0.13
Nodes (16): AgentDataPoint, CustomTooltipProps, LeadsByAgentChart(), Props, tooltipStyle, LeadsOverTimeChart(), MonthDataPoint, Props (+8 more)

### Community 2 - "Email Sequence Detail Pages"
Cohesion: 0.13
Nodes (20): CANCEL_LABEL, EmailSequenceDetailPage(), formatDate(), LANG_COLOR, LANG_LABEL, RUN_STATUS_CFG, EmailsPage(), LANG_COLOR (+12 more)

### Community 3 - "Sequence Orchestrator & Resend Accounts"
Cohesion: 0.09
Nodes (40): DryRunDetail, POST(), EmailContent, parseEmailContent(), clients, resendForAccount(), resolveResendAccount(), CLOSING_MILESTONE_LABEL (+32 more)

### Community 4 - "New Lead Client Form"
Cohesion: 0.08
Nodes (29): CHANNEL_TYPE_LABELS, DIRECT_ENTRY_SOURCES, errorStyle, FileFormat, FormErrors, ImportStatus, INITIAL_FORM, inputErrorStyle (+21 more)

### Community 5 - "Properties Client UI"
Cohesion: 0.18
Nodes (13): FilterTab, fmtPrice(), ModalState, PropertiesClient(), Props, TABS, Props, STATUS_CONFIG (+5 more)

### Community 6 - "Dashboard Layout"
Cohesion: 0.52
Nodes (6): DashboardLayout(), getUnreadCount(), getSubscription(), getTenantBranding(), getTenantsForSwitcher(), planBadgeLabel()

### Community 7 - "Sources Client UI"
Cohesion: 0.10
Nodes (13): AgentOption, BTN_GHOST, BTN_PRIMARY, CHANNEL_TYPE_COLORS, CHANNEL_TYPE_LABELS, INPUT, LABEL, Props (+5 more)

### Community 8 - "Email Analytics Metrics"
Cohesion: 0.17
Nodes (20): CARD, EmailAnalyticsPage(), pctColor(), EmailMetricsCard(), Props, buildMetrics(), distinctLeadsWithEvent(), EMAIL_EVENT_TYPES (+12 more)

### Community 9 - "Database RLS Test Suites"
Cohesion: 0.25
Nodes (8): adminClient, asSuperAdmin(), asUser(), cleanupFixtures(), clientOptions, createFixtures(), _jwtCache, ws

### Community 10 - "Admin Tenant Actions"
Cohesion: 0.06
Nodes (41): AddDomainSchema, addTenantDomain(), createTenant(), CreateTenantSchema, deleteTenant(), enterTenant(), normalizeRecords(), refreshTenantDomain() (+33 more)

### Community 11 - "Agent & Settings Actions"
Cohesion: 0.06
Nodes (46): createAgent(), CreateAgentSchema, deleteAgent(), generateAgentId(), LANGUAGE_ENUM, linkAgentToMyAccount(), LOGO_EXT_BY_TYPE, logoPathFromPublicUrl() (+38 more)

### Community 13 - "AI Usage Panel"
Cohesion: 0.18
Nodes (15): AiUsageLimitView, AiUsagePanel(), CARD, FEATURE_LABELS, featureLabel(), fmtCost(), fmtDate(), fmtInt() (+7 more)

### Community 14 - "Email Sequence Actions"
Cohesion: 0.16
Nodes (25): addLeadsToSequence(), addStep(), BulkEnrollResult, createSequence(), deleteSequence(), deleteStep(), getTenantId(), moveStep() (+17 more)

### Community 15 - "UI Primitives"
Cohesion: 0.16
Nodes (13): Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup(), AvatarGroupCount(), AvatarImage(), Badge(), badgeVariants (+5 more)

### Community 16 - "Lead Detail & AI Fit Card"
Cohesion: 0.11
Nodes (20): AiFitBriefing, AiFitCard(), NextActionWhen, WHEN_META, ACTION_BTN_STYLE, CARD, CARD_TITLE, formatDateTime() (+12 more)

### Community 17 - "Sidebar Navigation"
Cohesion: 0.23
Nodes (13): BrandLogo(), MobileNav(), computeActive(), ICONS, NavItem(), NavItemProps, initialsFromEmail(), NavItemDef (+5 more)

### Community 18 - "Subscription Persistence & Degradation"
Cohesion: 0.11
Nodes (20): applySubscriptionEvent(), resolveTenantId(), escapeHtml(), notifyDegradation(), renderClientEmail(), ReactivationReport, restoreAfterReactivation(), activeSnapshotRow (+12 more)

### Community 19 - "Runtime Dependencies"
Cohesion: 0.04
Nodes (47): @anthropic-ai/sdk, @base-ui/react, class-variance-authority, clsx, lucide-react, motion, next, opentype.js (+39 more)

### Community 20 - "Resend Webhook Handler"
Cohesion: 0.17
Nodes (17): EVENT_DESCRIPTIONS, extractEmail(), handleInboundEvent(), handleOutboundEvent(), htmlToText(), log(), LogResult, OUTBOUND_TYPE_MAP (+9 more)

### Community 21 - "Public Property Pages"
Cohesion: 0.10
Nodes (29): generateMetadata(), Params, PublicPropertiesPage(), generateMetadata(), Params, PublicPropertyDetailPage(), DISPLAY, lightboxBtn() (+21 more)

### Community 22 - "Analytics Page & Motion Primitives"
Cohesion: 0.11
Nodes (20): AnalyticsPage(), CARD, CARD_HEADER, CARD_SUBTITLE, SourceTabs(), FadeIn(), FadeInProps, groupVariants (+12 more)

### Community 23 - "Dev Dependencies"
Cohesion: 0.13
Nodes (15): eslint, jsonwebtoken, devDependencies, eslint, jsonwebtoken, @types/node, @types/react-dom, @types/ws (+7 more)

### Community 24 - "TypeScript Config"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 25 - "Carousel Tabs & Brand Context"
Cohesion: 0.12
Nodes (19): CarouselsTabs(), BrandForm(), ContextPanel(), FIELD_LABEL, input(), ActionResult, CarouselBrandProfile, CarouselJob (+11 more)

### Community 26 - "Leads Kanban Client"
Cohesion: 0.10
Nodes (21): attentionRank(), CHANNEL_SOURCE_TYPES, CHANNEL_TYPE_LABELS, FILTER_LABEL, formatDate(), FROZEN_LEAD_STATUSES, getInitials(), getKanbanLeads() (+13 more)

### Community 27 - "Lead Creation & Bulk Import"
Cohesion: 0.11
Nodes (33): POST(), BulkImportResult, createLead(), createLeadsBulk(), genId(), getExistingLeadEmails(), MANUAL_TRAFFIC_SOURCES, normEmail() (+25 more)

### Community 28 - "Acquisition Channel Actions"
Cohesion: 0.10
Nodes (31): archiveChannel(), buildPageCopyTool(), createContactForm(), CreateContactFormResult, createEvent(), CreateEventResult, createLeadMagnet(), CreateLeadMagnetResult (+23 more)

### Community 29 - "Hosted Page Editor"
Cohesion: 0.10
Nodes (24): AI_IMAGE_TYPES, aiAttachmentKind(), BTN_GHOST, BTN_PRIMARY, buildTemplateJson(), collectImageUrls(), DEFAULT_LM_LABELS, DEFAULT_LM_QUESTIONS (+16 more)

### Community 30 - "Scoring Section Editor"
Cohesion: 0.16
Nodes (15): BTN_PRIMARY, buildDraft(), CARD, CARD_HEADER, DIM_HEADER, DIMENSION_LABELS, DraftEntry, DraftMap (+7 more)

### Community 31 - "Lead Detail Actions"
Cohesion: 0.24
Nodes (14): analyzeLeadFit(), applyManualAction(), deleteLead(), deleteLeads(), FROZEN_STATUSES, LeadGuardRow, loadGuardedLead(), sendLeadEmail() (+6 more)

### Community 32 - "Lead & Lead-Magnet Pages"
Cohesion: 0.16
Nodes (21): LeadMagnetsPage(), FROZEN_STATUSES, LeadPage(), NewLeadPage(), LeadsPage(), getSubmissionsForLead(), getLeadEmailReplies(), getLeadStatusHistory() (+13 more)

### Community 33 - "npm Scripts"
Cohesion: 0.13
Nodes (15): scripts, build, dev, lint, start, test:ai-limits, test:auth, test:billing (+7 more)

### Community 34 - "Notifications Inbox"
Cohesion: 0.23
Nodes (9): markAllNotificationsRead(), MarkReadOnMount(), FILTER_TYPES, metaFor(), NotificationsPage(), relativeTime(), TYPE_CONFIG, TypeMeta (+1 more)

### Community 35 - "Topbar & Tenant Switcher"
Cohesion: 0.18
Nodes (12): exitToHub(), TenantSwitcher(), PAGE_TITLES, Topbar(), getHubData(), PlatformKpis, TenantOverview, getTenantsWithOwners() (+4 more)

### Community 36 - "Carousel Brand & Compositor"
Cohesion: 0.14
Nodes (25): CANVAS, CAROUSEL_PILLARS, CarouselPillar, FONT_FILES, FontRole, ICONS, PALETTE, PILLAR_LABELS (+17 more)

### Community 37 - "Support & AI Capacity Requests"
Cohesion: 0.16
Nodes (14): AiCapacityInput, AiCapacitySchema, CATEGORIES, CATEGORY_LABELS, requestAiCapacityIncrease(), submitSupportRequest(), SupportInput, SupportSchema (+6 more)

### Community 38 - "shadcn Component Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 39 - "Sequence Step Manager"
Cohesion: 0.17
Nodes (16): StepInput, delayLabel(), INPUT, LABEL, Props, StepFormState, StepManager(), EmailSendingInfo (+8 more)

### Community 40 - "Activity & Dashboard UI"
Cohesion: 0.15
Nodes (12): ActivityRow(), EVENT_META, timeAgo(), AgentStat, DashboardPage(), getInitials(), getTempColor(), AnimatedNumber() (+4 more)

### Community 41 - "Auth Callback & Provisioning"
Cohesion: 0.24
Nodes (13): POST(), GET(), markInvitationAccepted(), provisionOwner(), ProvisionOwnerSchema, setTenantLeadScoring(), getAllPurchaseTemplatesByTenant(), getPurchaseTemplatesByAgent() (+5 more)

### Community 42 - "Edit Lead Modal & Domain Types"
Cohesion: 0.17
Nodes (14): CHANNEL_TYPE_LABELS, CHANNEL_TYPE_ORDER, EditLeadModal(), EditLeadModalProps, INPUT_STYLE, LABEL_STYLE, SuccessScreenProps, ChannelOption (+6 more)

### Community 43 - "New Sequence & Activity Page"
Cohesion: 0.19
Nodes (10): ActivityPage(), INPUT, LABEL, NewSequenceForm(), Props, NewSequencePage(), getSelectedTenant(), SelectedTenant (+2 more)

### Community 45 - "Carousel Engine & Costs"
Cohesion: 0.28
Nodes (14): CarouselsPage(), canAccessCarouselEngine(), assertAccess(), CarouselApiCost, CarouselCostRow, CostLogRow, getBrandProfiles(), getCarouselCosts() (+6 more)

### Community 47 - "Pricing Comparison Page"
Cohesion: 0.11
Nodes (17): CellValue, CompareGroup, CompareRow, COMPARISON, MARKET_COLUMNS, MARKET_ROWS, metadata, PricingTable() (+9 more)

### Community 48 - "Form Submissions List"
Cohesion: 0.16
Nodes (14): CHANNEL_TYPE_LABELS, LeadSubmissionsList(), relativeTime(), SubmissionItem(), usesRespondedState(), relativeTime(), SECTION_LABEL, SubmissionItem() (+6 more)

### Community 49 - "Package Metadata"
Cohesion: 0.33
Nodes (5): name, overrides, postcss, private, version

### Community 51 - "Telegram Dispatch & Contact Form"
Cohesion: 0.18
Nodes (14): buildMessage(), POST(), resolveChatIds(), ContactFormInput, contactSchema, submitContactForm(), ContactForm(), buildTelegramText() (+6 more)

### Community 52 - "Settings & Score Rules"
Cohesion: 0.23
Nodes (10): SettingsPage(), getEffectiveScoreRules(), getGlobalScoreRules(), mapRule(), ruleKey(), ScoreRule, ScoreRuleRow, FitLine (+2 more)

### Community 53 - "Carousel Generation Actions"
Cohesion: 0.15
Nodes (22): costFromUsage(), deleteCarousel(), gate(), loadCarouselJob(), loadCarouselLogs(), renderSlide(), startCarousel(), toBrand() (+14 more)

### Community 59 - "Hosted Form Intake"
Cohesion: 0.25
Nodes (9): showElement(), wireAll(), wireForm(), HostedForm(), palette(), Surface, visitorId(), HOSTED_UI_COPY (+1 more)

### Community 60 - "Hosted Page Schema & Proxy"
Cohesion: 0.17
Nodes (10): HOSTED_SUBDOMAIN_REWRITE, HostedBenefitSchema, HostedEvent, HostedEventSchema, HostedQuestionSchema, HostedTestimonial, HostedTestimonialSchema, SUBDOMAIN_BY_CHANNEL_TYPE (+2 more)

### Community 61 - "Notification Agent Routing"
Cohesion: 0.67
Nodes (3): ADMIN_TYPES, LEAD_LINKED_TYPES, notificationAgentId()

### Community 63 - "A&J Brand Logo (Dark)"
Cohesion: 0.67
Nodes (3): A&J Real Estate Group (Tenant Brand), Dark-Theme Logo Variant Usage Context, A&J Real Estate Group Logo (White)

### Community 64 - "A&J Lead Magnet eBook"
Cohesion: 1.00
Nodes (3): A&J Real Estate Group (Pilot Tenant), Legacy (funnel) Lead-Magnet Experiment, Tu Primera Casa en Estados Unidos — Lead Magnet eBook Mockup

### Community 70 - "Property Form Modal"
Cohesion: 0.12
Nodes (16): AiPropertyDraft, AiInit, EMPTY_FORM, formFromProperty(), inputStyle, labelStyle, labelTextStyle, mediaLinkStyle (+8 more)

### Community 75 - "Email AI Drafting"
Cohesion: 0.16
Nodes (18): bootstrapPrompt(), buildPrompt(), COMPOSE_TOOL, EmailAiDraft, EmailAiResult, generateEmailDraft(), generateSequenceSteps(), LANGUAGE_RULES_OVERRIDE (+10 more)

### Community 76 - "AI Usage Data"
Cohesion: 0.18
Nodes (14): accumulate(), AiDailyPoint, AiUsageByAgent, AiUsageByFeature, AiUsageByTenant, AiUsageRequestRow, AiUsageTotals, emptyTotals() (+6 more)

### Community 77 - "Billing Lifecycle & Subscription Banner"
Cohesion: 0.14
Nodes (22): daysAgoIso(), GET(), logError(), PaddleCheckoutButton(), Props, SubscriptionBanner(), SubscriptionBannerProps, isDegraded() (+14 more)

### Community 88 - "AI Briefing Outcomes"
Cohesion: 0.24
Nodes (11): BriefingOutcomesPanel(), STAT, AdminPage(), BriefingOutcomes, empty(), FOLLOW_EVENT_TYPES, getBriefingOutcomes(), STATUS_RANK (+3 more)

### Community 89 - "Modal Shell & Bootstrap"
Cohesion: 0.18
Nodes (9): INPUT, LABEL, SequenceBootstrapModal(), AiCapacityRequest(), INPUT, LABEL, ModalShell(), ModalShellProps (+1 more)

### Community 90 - "Contact Submission Handling"
Cohesion: 0.16
Nodes (14): err(), POST(), SubmitSchema, AdminClient, emitFormBaselineOnce(), AdminClient, emitLeadCreated(), VIA_LABELS (+6 more)

### Community 91 - "Paddle Billing & Checkout"
Cohesion: 0.14
Nodes (22): HANDLED, POST(), openBillingPortal(), PLAN_VALUES, Result, createCheckoutTransaction(), createPortalUrl(), BillingCycle (+14 more)

### Community 92 - "Property Detail Pages"
Cohesion: 0.20
Nodes (11): EditPropertyButton(), PropertyDetailPage(), STATUS_LABEL, TYPE_LABEL, PropertyDetailTabs(), PropertiesPage(), getProperties(), getPropertyById() (+3 more)

### Community 93 - "AI Lead Fit Assessment"
Cohesion: 0.15
Nodes (14): AnswerItem, assessLeadFit(), BUCKETS, buildTool(), BUY_DIMS, DIM_LABEL, Dimension, FitAssessResult (+6 more)

### Community 94 - "Email Composer"
Cohesion: 0.18
Nodes (13): EmailAiInput, EmailAiPurpose, BulkLeadInput, LeadInput, FormData, ComposerAiContext, INPUT, LABEL (+5 more)

### Community 95 - "Purchase Templates Panel"
Cohesion: 0.21
Nodes (13): ACCENT_CYCLE, cellState(), EditModal(), isPlaceholder(), LANG_COLOR, LANG_LABEL, MILESTONE_LABEL, MILESTONE_PURPOSE (+5 more)

### Community 96 - "Hosted Page View"
Cohesion: 0.15
Nodes (7): Channel, DISPLAY, HostedPageView(), pal(), rise, Tenant, WRAP

### Community 97 - "Marketing Landing Page"
Cohesion: 0.16
Nodes (10): AI_FEATURES, FEATURES, PLAN_CARDS, STATS, STEPS, AuroraBackground(), Blob, BLOBS (+2 more)

### Community 98 - "Email Unsubscribe Flow"
Cohesion: 0.29
Nodes (11): buildHtml(), errorHtml(), executeUnsubscribe(), GET(), POST(), shell(), successHtml(), RFC-8058 (+3 more)

### Community 99 - "Carousel Copy Generation"
Cohesion: 0.25
Nodes (13): ICON_KEYS, brandContext(), buildTool(), clean(), coerceCopy(), CopyResult, diversityBlock(), engineRules() (+5 more)

### Community 100 - "Gemini Image Generation"
Cohesion: 0.23
Nodes (12): apiKey(), callWithFallback(), dedupe(), extractJson(), friendlyError(), GeminiError, generateImage(), IMAGE_MODELS (+4 more)

### Community 101 - "Carousels Client UI"
Cohesion: 0.21
Nodes (9): badge(), card(), CarouselsClient(), dangerBtn(), Phase, secondaryBtn(), SLIDE_TYPE_LABEL, SlideCard() (+1 more)

### Community 102 - "Manual Lead Picker & Status History"
Cohesion: 0.18
Nodes (9): ManualLeadPicker(), PickerLead, Props, SELECT_STYLE, formatDateTime(), SOURCE_LABELS, StatusHistoryTimeline(), STATUS_CONFIG (+1 more)

### Community 103 - "AI Usage Limit Enforcement"
Cohesion: 0.19
Nodes (13): AgentAiShare, AiLimitStatus, assertAiWithinLimit(), getAgentAiShare(), getAiLimitIndicator(), getAiLimitIndicatorFor(), getAiLimitStatus(), getLinkedAgentId() (+5 more)

### Community 104 - "Acquisition Channels Data"
Cohesion: 0.23
Nodes (11): SourcesPage(), SourcesClient(), AcquisitionChannel, ChannelLead, ChannelMetrics, ChannelType, ChannelWithMetrics, fetchChannelsWithMetrics() (+3 more)

### Community 105 - "Platform Requests Inbox"
Cohesion: 0.29
Nodes (9): listPlatformRequests(), PlatformRequestRow, setRequestResponded(), SolicitudesPage(), CATEGORY_LABELS, formatDate(), RequestsClient(), Tab (+1 more)

### Community 106 - "Hosted Channel Contact Page"
Cohesion: 0.26
Nodes (10): HostedContactInput, HostedContactSchema, submitHostedContact(), generateMetadata(), HOSTED_TYPES, HostedChannelPage(), loadPage(), Params (+2 more)

### Community 107 - "Activity Visibility"
Cohesion: 0.33
Nodes (8): ActivityViewer, isEventVisibleToViewer(), getAuthEmailsByIds(), authorOf(), resolveActorNames(), fetchActivity(), getAllActivity(), getRecentActivity()

### Community 108 - "Auth Visibility Scope"
Cohesion: 0.24
Nodes (8): applyVisibilityScope(), isAgentScoped(), isRowVisible(), ScopableQuery, VisibilityScope, AGENT, OWNER, SUPER

### Community 109 - "Legal Pages"
Cohesion: 0.24
Nodes (4): metadata, metadata, metadata, LegalPage()

### Community 110 - "Email Rendering"
Cohesion: 0.44
Nodes (8): escapeHtml(), linkifyUrls(), MergeVars, renderEmail(), resolveMergeTags(), textToParagraphs(), UNSUBSCRIBE_LABEL, unsubscribeLabel()

### Community 111 - "Initial Schema Migration"
Cohesion: 0.36
Nodes (11): agents, get_my_tenant_id(), is_super_admin(), lead_events, lead_magnets, lead_sources, leads, leads_updated_at (+3 more)

### Community 112 - "Support Page & Auth Client"
Cohesion: 0.39
Nodes (5): GET(), SoportePage(), SupportForm(), signOut(), createClient()

### Community 113 - "Intake Fit Dimensions"
Cohesion: 0.28
Nodes (7): ALL_FIT_DIMENSIONS, extractFitDimensions(), FIT_DIMENSIONS, FitIntent, FormAnswerItem, INTENT_ALIASES, normalizeIntent()

### Community 114 - "Carousel Cost Panel"
Cohesion: 0.24
Nodes (8): CARD, CostPanel(), fmtCost(), fmtDate(), NUM, TD, TH, CarouselCostReport

### Community 115 - "Hosted Page Options"
Cohesion: 0.22
Nodes (8): BTN_GHOST, BTN_PRIMARY, CARD, Mode, MODES, PageOptions(), hostedChannelUrl(), HostedPageConfig

### Community 116 - "Hero Pipeline Demo"
Cohesion: 0.24
Nodes (9): bandFor(), ColumnKey, COLUMNS, DemoCard, HeroPipeline(), INITIAL, nameFor(), SCRIPT (+1 more)

### Community 117 - "Lead Fit Panel"
Cohesion: 0.38
Nodes (6): CELL, fmtDate(), HEAD, LeadFitPanel(), usd(), LeadFitUsageSummary

### Community 119 - "Scoring Trigger Migration"
Cohesion: 0.38
Nodes (4): apply_lead_event_scoring(), guard_lead_event_dedup(), trg_lead_event_dedup, trg_lead_event_scoring

### Community 120 - "Scoring Engine Migration"
Cohesion: 0.43
Nodes (4): lead_score_rules, leads, public.decay_lead_scores(), public.recompute_lead_score()

### Community 121 - "Purchase Templates Actions"
Cohesion: 0.29
Nodes (9): AgentPurchaseTemplates, assertCanEditRow(), clearPurchaseTemplateContent(), PurchaseContentSchema, PurchaseTemplateByTenant, PurchaseTemplateRow, updatePurchaseTemplate(), updatePurchaseTemplateContent() (+1 more)

### Community 122 - "Manual Actions Panel"
Cohesion: 0.40
Nodes (5): FROZEN_STATUSES, ManualActionItem, ManualActionsPanel(), ManualActionsPanelProps, LeadStatus

### Community 123 - "Lead Scoring Tables"
Cohesion: 0.47
Nodes (5): lead_events, lead_score_rules, lead_status_history, leads, notifications

### Community 124 - "Login Page & Client"
Cohesion: 0.32
Nodes (5): inputStyle, labelStyle, LoginForm(), messageForErrorParam(), createClient()

### Community 125 - "AI Usage Chart"
Cohesion: 0.32
Nodes (7): AiUsageDailyChart(), CustomTooltip(), fmtCost(), fmtDay(), SERIES_COLORS, TooltipEntry, AiDailySeries

### Community 126 - "Leads Donut Chart"
Cohesion: 0.25
Nodes (6): CenterLabelProps, DataPoint, DONUT_COLORS, LeadsDonutChart(), Props, tooltipStyle

### Community 127 - "Activity Timeline"
Cohesion: 0.29
Nodes (7): ActivityTimeline(), DEFAULT_META, EVENT_META, EventMeta, formatDateTime(), LINK_LABEL, LeadEvent

### Community 128 - "Property AI Extraction"
Cohesion: 0.24
Nodes (10): PropertyInput, AiExtractResult, buildExtractTool(), buildPrompt(), generatePropertyFromPdf(), langRule(), PROPERTY_TYPES, AiCreateModal() (+2 more)

### Community 129 - "Property Page Options"
Cohesion: 0.29
Nodes (6): BTN_GHOST, BTN_PRIMARY, CARD, Mode, PropertyPageOptions(), hostedPropertiesUrl()

### Community 130 - "Marketing Layout & Nav"
Cohesion: 0.32
Nodes (4): metadata, MarketingFooter(), LINKS, MarketingNav()

### Community 131 - "Lead Intake Endpoint"
Cohesion: 0.70
Nodes (4): err(), normalizeLanguage(), pick(), POST()

### Community 132 - "Notification Hub Feed"
Cohesion: 0.60
Nodes (3): HubFeed(), relativeTime(), NotificationRow

### Community 133 - "Paddle Catalog Script"
Cohesion: 0.48
Nodes (6): arg(), createPlan(), has(), main(), paddle, usd()

### Community 134 - "Channel Agent Routing"
Cohesion: 0.43
Nodes (4): AdminClient, resolveChannelAgent(), resolveRoutedAgent(), RoutingAgent

### Community 135 - "Telegram Notifications"
Cohesion: 0.50
Nodes (4): notifications, notify_telegram_on_insert(), trg_notify_telegram, user_profiles

### Community 136 - "Auth Schema Foundations"
Cohesion: 0.60
Nodes (4): agents, invitations, leads, user_profiles

### Community 137 - "In-CRM Email Content"
Cohesion: 0.40
Nodes (4): email_sends, email_sequence_steps, lead_sequence_runs, purchase_email_templates

### Community 139 - "Lead Events Scoring Points"
Cohesion: 0.67
Nodes (3): lead_events, leads, purchase_processes

### Community 140 - "Email Sequences Schema"
Cohesion: 0.83
Nodes (3): acquisition_channels, email_sequence_steps, email_sequences

### Community 142 - "Email Sequences Refactor"
Cohesion: 0.50
Nodes (3): email_sequence_steps, email_sequences, lead_sequence_runs

### Community 143 - "Agent Languages Normalization"
Cohesion: 0.67
Nodes (3): agents, normalize_agent_languages(), trg_agents_normalize_languages

### Community 147 - "Page Build Options"
Cohesion: 0.50
Nodes (3): acquisition_channels, platform_requests, properties

### Community 148 - "Agent Languages & Specialty"
Cohesion: 0.50
Nodes (3): agents, leads, purchase_email_templates

### Community 149 - "Carousel Engine"
Cohesion: 0.67
Nodes (3): carousel_brand_profiles, carousel_jobs, carousel_slides

### Community 150 - "Paddle Billing"
Cohesion: 0.50
Nodes (3): paddle_webhook_events, properties, subscriptions

## Knowledge Gaps
- **709 isolated node(s):** `supabase`, `$schema`, `style`, `rsc`, `tsx` (+704 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **116 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminClient()` connect `Auth Callback & Provisioning` to `Lead Magnet Intake Endpoint`, `Property AI Extraction`, `Email Sequence Detail Pages`, `Sequence Orchestrator & Resend Accounts`, `Lead Intake Endpoint`, `Notification Hub Feed`, `Dashboard Layout`, `Channel Agent Routing`, `Email Analytics Metrics`, `Admin Tenant Actions`, `Agent & Settings Actions`, `Email Sequence Actions`, `Lead Detail & AI Fit Card`, `Subscription Persistence & Degradation`, `Resend Webhook Handler`, `Public Property Pages`, `Analytics Page & Motion Primitives`, `Lead Creation & Bulk Import`, `Acquisition Channel Actions`, `Lead Detail Actions`, `Lead & Lead-Magnet Pages`, `Notifications Inbox`, `Topbar & Tenant Switcher`, `Support & AI Capacity Requests`, `Activity & Dashboard UI`, `New Sequence & Activity Page`, `Carousel Engine & Costs`, `Form Submissions List`, `Telegram Dispatch & Contact Form`, `Settings & Score Rules`, `Carousel Generation Actions`, `Email AI Drafting`, `AI Usage Data`, `Billing Lifecycle & Subscription Banner`, `AI Briefing Outcomes`, `Contact Submission Handling`, `Paddle Billing & Checkout`, `Property Detail Pages`, `AI Lead Fit Assessment`, `Email Unsubscribe Flow`, `Manual Lead Picker & Status History`, `AI Usage Limit Enforcement`, `Acquisition Channels Data`, `Platform Requests Inbox`, `Hosted Channel Contact Page`, `Activity Visibility`, `Purchase Templates Actions`?**
  _High betweenness centrality (0.259) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `Package Metadata`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `resend` connect `Runtime Dependencies` to `Sequence Orchestrator & Resend Accounts`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `supabase`, `$schema`, `style` to the rest of the system?**
  _709 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Analytics Charts` be split into smaller, more focused modules?**
  _Cohesion score 0.12554112554112554 - nodes in this community are weakly interconnected._
- **Should `Email Sequence Detail Pages` be split into smaller, more focused modules?**
  _Cohesion score 0.13405797101449277 - nodes in this community are weakly interconnected._
- **Should `Sequence Orchestrator & Resend Accounts` be split into smaller, more focused modules?**
  _Cohesion score 0.09387755102040816 - nodes in this community are weakly interconnected._