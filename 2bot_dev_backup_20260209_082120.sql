--
-- PostgreSQL database dump
--

\restrict eiQt5RyXbfyXQpBU872n54CdVVMucEM5AMuQQAkRtwBe2yzP6eKbHOiq1uif4ec

-- Dumped from database version 15.15
-- Dumped by pg_dump version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AllocationMode; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AllocationMode" AS ENUM (
    'UNLIMITED',
    'SOFT_CAP',
    'HARD_CAP',
    'RESERVED'
);


ALTER TYPE public."AllocationMode" OWNER TO postgres;

--
-- Name: DatabaseType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."DatabaseType" AS ENUM (
    'SHARED',
    'DEDICATED'
);


ALTER TYPE public."DatabaseType" OWNER TO postgres;

--
-- Name: DepartmentRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."DepartmentRole" AS ENUM (
    'MANAGER',
    'MEMBER'
);


ALTER TYPE public."DepartmentRole" OWNER TO postgres;

--
-- Name: ExecutionMode; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ExecutionMode" AS ENUM (
    'SERVERLESS',
    'WORKSPACE'
);


ALTER TYPE public."ExecutionMode" OWNER TO postgres;

--
-- Name: GatewayStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."GatewayStatus" AS ENUM (
    'CONNECTED',
    'DISCONNECTED',
    'ERROR'
);


ALTER TYPE public."GatewayStatus" OWNER TO postgres;

--
-- Name: GatewayType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."GatewayType" AS ENUM (
    'TELEGRAM_BOT',
    'AI',
    'WEBHOOK'
);


ALTER TYPE public."GatewayType" OWNER TO postgres;

--
-- Name: InviteStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."InviteStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED'
);


ALTER TYPE public."InviteStatus" OWNER TO postgres;

--
-- Name: MembershipStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."MembershipStatus" AS ENUM (
    'INVITED',
    'ACTIVE',
    'SUSPENDED'
);


ALTER TYPE public."MembershipStatus" OWNER TO postgres;

--
-- Name: OrgPlan; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."OrgPlan" AS ENUM (
    'ORG_STARTER',
    'ORG_GROWTH',
    'ORG_PRO',
    'ORG_BUSINESS',
    'ORG_ENTERPRISE',
    'ORG_FREE'
);


ALTER TYPE public."OrgPlan" OWNER TO postgres;

--
-- Name: OrgRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."OrgRole" AS ENUM (
    'ORG_OWNER',
    'ORG_ADMIN',
    'DEPT_MANAGER',
    'ORG_MEMBER'
);


ALTER TYPE public."OrgRole" OWNER TO postgres;

--
-- Name: PeriodType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PeriodType" AS ENUM (
    'HOURLY',
    'DAILY',
    'WEEKLY',
    'MONTHLY'
);


ALTER TYPE public."PeriodType" OWNER TO postgres;

--
-- Name: PlanType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PlanType" AS ENUM (
    'FREE',
    'STARTER',
    'PRO',
    'BUSINESS',
    'ENTERPRISE'
);


ALTER TYPE public."PlanType" OWNER TO postgres;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserRole" AS ENUM (
    'SUPER_ADMIN',
    'ADMIN',
    'DEVELOPER',
    'SUPPORT',
    'MEMBER'
);


ALTER TYPE public."UserRole" OWNER TO postgres;

--
-- Name: WorkflowScope; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."WorkflowScope" AS ENUM (
    'USER',
    'DEPARTMENT',
    'ORGANIZATION'
);


ALTER TYPE public."WorkflowScope" OWNER TO postgres;

--
-- Name: WorkflowStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."WorkflowStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'ARCHIVED'
);


ALTER TYPE public."WorkflowStatus" OWNER TO postgres;

--
-- Name: WorkflowTriggerType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."WorkflowTriggerType" AS ENUM (
    'TELEGRAM_MESSAGE',
    'TELEGRAM_CALLBACK',
    'SCHEDULE',
    'WEBHOOK',
    'MANUAL'
);


ALTER TYPE public."WorkflowTriggerType" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_usage (
    id text NOT NULL,
    user_id text NOT NULL,
    organization_id text,
    gateway_id text,
    model text NOT NULL,
    source text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    total_tokens integer,
    image_count integer,
    character_count integer,
    audio_seconds integer,
    credits_used double precision DEFAULT 0 NOT NULL,
    billing_period text NOT NULL,
    request_id text,
    duration_ms integer,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    department_id text,
    capability text NOT NULL
);


ALTER TABLE public.ai_usage OWNER TO postgres;

--
-- Name: alert_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alert_configs (
    id text NOT NULL,
    organization_id text NOT NULL,
    quota_warning_threshold integer DEFAULT 80 NOT NULL,
    quota_critical_threshold integer DEFAULT 95 NOT NULL,
    error_rate_threshold integer DEFAULT 10 NOT NULL,
    consecutive_failures integer DEFAULT 3 NOT NULL,
    daily_cost_threshold integer,
    monthly_cost_threshold integer,
    channels jsonb DEFAULT '{"email": true}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.alert_configs OWNER TO postgres;

--
-- Name: alert_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.alert_history (
    id text NOT NULL,
    organization_id text NOT NULL,
    type text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    resource text,
    current_value integer,
    limit_value integer,
    percentage integer,
    metadata text,
    acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_by text,
    acknowledged_at timestamp(3) without time zone,
    resolved_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.alert_history OWNER TO postgres;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    user_id text,
    organization_id text,
    action text NOT NULL,
    resource text NOT NULL,
    resource_id text,
    metadata jsonb,
    ip_address text,
    user_agent text,
    status text DEFAULT 'success'::text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: credit_rates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credit_rates (
    id text NOT NULL,
    model text NOT NULL,
    credits_per_input_token double precision,
    credits_per_output_token double precision,
    credits_per_image double precision,
    credits_per_minute double precision,
    your_cost_per_1k_input numeric(10,6),
    your_cost_per_1k_output numeric(10,6),
    your_cost_per_unit numeric(10,6),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    capability text NOT NULL,
    credits_per_char double precision
);


ALTER TABLE public.credit_rates OWNER TO postgres;

--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credit_transactions (
    id text NOT NULL,
    type text NOT NULL,
    amount integer NOT NULL,
    balance_after integer NOT NULL,
    description text NOT NULL,
    metadata jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    credit_wallet_id text
);


ALTER TABLE public.credit_transactions OWNER TO postgres;

--
-- Name: credit_wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.credit_wallets (
    id text NOT NULL,
    user_id text,
    organization_id text,
    balance integer DEFAULT 0 NOT NULL,
    lifetime integer DEFAULT 0 NOT NULL,
    monthly_allocation integer DEFAULT 0 NOT NULL,
    monthly_used integer DEFAULT 0 NOT NULL,
    allocation_reset_at timestamp(3) without time zone,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    pending_credits double precision DEFAULT 0 NOT NULL
);


ALTER TABLE public.credit_wallets OWNER TO postgres;

--
-- Name: department_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.department_members (
    id text NOT NULL,
    user_id text NOT NULL,
    department_id text NOT NULL,
    membership_id text NOT NULL,
    role public."DepartmentRole" DEFAULT 'MEMBER'::public."DepartmentRole" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.department_members OWNER TO postgres;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.departments (
    id text NOT NULL,
    organization_id text NOT NULL,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.departments OWNER TO postgres;

--
-- Name: dept_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.dept_allocations (
    id text NOT NULL,
    department_id text NOT NULL,
    max_gateways integer,
    max_workflows integer,
    max_plugins integer,
    credit_budget integer,
    max_ram_mb integer,
    max_cpu_cores double precision,
    max_storage_mb integer,
    alloc_mode public."AllocationMode" DEFAULT 'SOFT_CAP'::public."AllocationMode" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    set_by_id text NOT NULL,
    credit_used integer DEFAULT 0 NOT NULL,
    credit_reset_at timestamp(3) without time zone
);


ALTER TABLE public.dept_allocations OWNER TO postgres;

--
-- Name: gateways; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.gateways (
    id text NOT NULL,
    user_id text NOT NULL,
    organization_id text,
    name text NOT NULL,
    type public."GatewayType" NOT NULL,
    status public."GatewayStatus" DEFAULT 'DISCONNECTED'::public."GatewayStatus" NOT NULL,
    credentials_enc text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_connected_at timestamp(3) without time zone,
    last_error_at timestamp(3) without time zone,
    last_error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.gateways OWNER TO postgres;

--
-- Name: member_allocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_allocations (
    id text NOT NULL,
    user_id text NOT NULL,
    department_id text NOT NULL,
    max_gateways integer,
    max_workflows integer,
    credit_budget integer,
    max_ram_mb integer,
    max_cpu_cores double precision,
    max_storage_mb integer,
    alloc_mode public."AllocationMode" DEFAULT 'SOFT_CAP'::public."AllocationMode" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    set_by_id text NOT NULL,
    credit_used integer DEFAULT 0 NOT NULL,
    credit_reset_at timestamp(3) without time zone
);


ALTER TABLE public.member_allocations OWNER TO postgres;

--
-- Name: memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.memberships (
    id text NOT NULL,
    user_id text NOT NULL,
    organization_id text NOT NULL,
    role public."OrgRole" DEFAULT 'ORG_MEMBER'::public."OrgRole" NOT NULL,
    status public."MembershipStatus" DEFAULT 'INVITED'::public."MembershipStatus" NOT NULL,
    invited_by text,
    invited_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    joined_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.memberships OWNER TO postgres;

--
-- Name: org_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.org_invites (
    id text NOT NULL,
    organization_id text NOT NULL,
    email text NOT NULL,
    role public."OrgRole" DEFAULT 'ORG_MEMBER'::public."OrgRole" NOT NULL,
    token text NOT NULL,
    invited_by text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    used_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_resent_at timestamp(3) without time zone,
    resend_count integer DEFAULT 0 NOT NULL,
    declined_at timestamp(3) without time zone,
    status public."InviteStatus" DEFAULT 'PENDING'::public."InviteStatus" NOT NULL
);


ALTER TABLE public.org_invites OWNER TO postgres;

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    org_plan public."OrgPlan" DEFAULT 'ORG_FREE'::public."OrgPlan" NOT NULL,
    stripe_customer_id text,
    max_seats integer DEFAULT 5 NOT NULL,
    used_seats integer DEFAULT 0 NOT NULL,
    pool_ram_mb integer DEFAULT 4096 NOT NULL,
    pool_cpu_cores double precision DEFAULT 2 NOT NULL,
    pool_storage_mb integer DEFAULT 20480 NOT NULL,
    "databaseType" public."DatabaseType" DEFAULT 'SHARED'::public."DatabaseType" NOT NULL,
    database_url text,
    database_region text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.organizations OWNER TO postgres;

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.password_reset_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    used_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.password_reset_tokens OWNER TO postgres;

--
-- Name: plugins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.plugins (
    id text NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    version text DEFAULT '1.0.0'::text NOT NULL,
    "requiredGateways" public."GatewayType"[],
    "configSchema" jsonb DEFAULT '{}'::jsonb NOT NULL,
    icon text,
    category text DEFAULT 'general'::text NOT NULL,
    tags text[] DEFAULT ARRAY[]::text[],
    "isBuiltin" boolean DEFAULT true NOT NULL,
    input_schema jsonb,
    output_schema jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.plugins OWNER TO postgres;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    user_agent text,
    ip_address text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subscriptions (
    id text NOT NULL,
    user_id text,
    organization_id text,
    stripe_subscription_id text,
    stripe_price_id text,
    stripe_status text,
    current_period_start timestamp(3) without time zone,
    current_period_end timestamp(3) without time zone,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    plan text DEFAULT 'FREE'::text NOT NULL
);


ALTER TABLE public.subscriptions OWNER TO postgres;

--
-- Name: usage_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usage_history (
    id text NOT NULL,
    organization_id text,
    department_id text,
    user_id text,
    period_start timestamp(3) without time zone NOT NULL,
    period_type public."PeriodType" DEFAULT 'DAILY'::public."PeriodType" NOT NULL,
    requests integer DEFAULT 0 NOT NULL,
    workflow_runs integer DEFAULT 0 NOT NULL,
    plugin_executions integer DEFAULT 0 NOT NULL,
    storage_used integer DEFAULT 0 NOT NULL,
    errors integer DEFAULT 0 NOT NULL,
    estimated_cost numeric(10,2),
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.usage_history OWNER TO postgres;

--
-- Name: user_plugins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_plugins (
    id text NOT NULL,
    user_id text NOT NULL,
    plugin_id text NOT NULL,
    organization_id text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    gateway_id text,
    is_enabled boolean DEFAULT true NOT NULL,
    execution_count integer DEFAULT 0 NOT NULL,
    last_executed_at timestamp(3) without time zone,
    last_error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.user_plugins OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text,
    email_verified timestamp(3) without time zone,
    image text,
    role public."UserRole" DEFAULT 'MEMBER'::public."UserRole" NOT NULL,
    failed_login_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp(3) without time zone,
    last_password_change timestamp(3) without time zone,
    deleted_at timestamp(3) without time zone,
    plan public."PlanType" DEFAULT 'FREE'::public."PlanType" NOT NULL,
    execution_mode public."ExecutionMode" DEFAULT 'SERVERLESS'::public."ExecutionMode" NOT NULL,
    stripe_customer_id text,
    workspace_addons text[] DEFAULT ARRAY[]::text[],
    workspace_ram_mb integer,
    workspace_cpu_cores double precision,
    workspace_storage_mb integer,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: workflow_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_runs (
    id text NOT NULL,
    workflow_id text NOT NULL,
    "triggeredBy" text NOT NULL,
    trigger_data jsonb,
    status text DEFAULT 'running'::text NOT NULL,
    output jsonb,
    error text,
    failed_step_order integer,
    started_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp(3) without time zone,
    duration_ms integer
);


ALTER TABLE public.workflow_runs OWNER TO postgres;

--
-- Name: workflow_step_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_step_runs (
    id text NOT NULL,
    run_id text NOT NULL,
    step_order integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    input jsonb,
    output jsonb,
    error text,
    started_at timestamp(3) without time zone,
    completed_at timestamp(3) without time zone,
    duration_ms integer
);


ALTER TABLE public.workflow_step_runs OWNER TO postgres;

--
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflow_steps (
    id text NOT NULL,
    workflow_id text NOT NULL,
    "order" integer NOT NULL,
    name text,
    plugin_id text NOT NULL,
    "inputMapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    gateway_id text,
    condition jsonb,
    "onError" text DEFAULT 'stop'::text NOT NULL,
    max_retries integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.workflow_steps OWNER TO postgres;

--
-- Name: workflows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.workflows (
    id text NOT NULL,
    user_id text NOT NULL,
    organization_id text,
    department_id text,
    scope public."WorkflowScope" DEFAULT 'USER'::public."WorkflowScope" NOT NULL,
    name text NOT NULL,
    description text,
    slug text NOT NULL,
    "triggerType" public."WorkflowTriggerType" NOT NULL,
    "triggerConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
    gateway_id text,
    status public."WorkflowStatus" DEFAULT 'DRAFT'::public."WorkflowStatus" NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    execution_count integer DEFAULT 0 NOT NULL,
    last_executed_at timestamp(3) without time zone,
    last_error text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.workflows OWNER TO postgres;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
657b2bdc-5af5-4dee-a7c2-c376e73e4be2	533be1f70dcefe8f0e4cac7a824a7a935f90f06a1743963153d6e77f64441c40	2026-01-22 14:18:07.454468+00	20260121000000_baseline	\N	\N	2026-01-22 14:18:04.372493+00	1
010544b8-498c-4c4d-b815-1451c175389d	d8e22366d33b55b80818da334f7718d5e740625d54ba539ff7a0caa5e5dc2693	2026-01-23 11:19:45.297052+00	20260123111944_add_org_invites	\N	\N	2026-01-23 11:19:45.05056+00	1
5c4b650e-6610-4064-adc3-50605126637a	e8f46b86b2522236a518155926593fd8e244f0e485f502516c5596b73111f568	\N	20260202120000_rename_ai_token_to_credit_budget	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260202120000_rename_ai_token_to_credit_budget\n\nDatabase error code: 42703\n\nDatabase error:\nERROR: column "ai_token_budget" does not exist\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42703), message: "column \\"ai_token_budget\\" does not exist", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("tablecmds.c"), line: Some(3556), routine: Some("renameatt_internal") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260202120000_rename_ai_token_to_credit_budget"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:113\n   1: schema_commands::commands::apply_migrations::Applying migration\n           with migration_name="20260202120000_rename_ai_token_to_credit_budget"\n             at schema-engine/commands/src/commands/apply_migrations.rs:95\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:246	2026-02-03 07:35:43.556721+00	2026-02-03 07:31:59.713828+00	0
5820c319-52e6-4f8e-a594-267e9ce69393	a2d9afc7bb6b44afd81e8c27086745e504e718e5a74bf65091ae5a4419f740e0	2026-01-23 11:38:32.633176+00	20260123113832_add_invite_resend_tracking	\N	\N	2026-01-23 11:38:32.591959+00	1
be61afbc-b942-48e3-b8ee-e54b7b562d8b	13df36bcf6f304aa81e7166c8eb4c167866b46a784bb0ead587d493671d89357	2026-01-23 11:53:50.092186+00	20260123115349_add_invite_status	\N	\N	2026-01-23 11:53:50.044573+00	1
9953b1de-9d30-4397-be22-e394de9ffb1f	4a95e1c847c456073a4ae430fe1f95e8a34a6d196dff6bc44afa652dedc817db	2026-01-27 08:26:29.250982+00	20260127000000_add_org_free_plan		\N	2026-01-27 08:26:29.250982+00	0
a953a55a-6350-42d2-b010-7e1f0de7dd8b	43a27fddfd9cc9296ae3f541c45f5e5cda432c0b7eb31db9c98bd90d1e7ddc2a	2026-01-28 12:41:13.929322+00	20260127000001_org_free_plan_default		\N	2026-01-28 12:41:13.929322+00	0
4c2d7bbb-b704-4874-9834-1e5de2b81537		2026-01-29 13:13:04.110188+00	20260129000000_add_credit_wallets	\N	\N	2026-01-29 13:13:04.110188+00	1
8ad5c408-481f-4ddb-851e-f721bea67452	496ad217dbf6358744282068e08c5404e55f0faa3c8df8bd4f0084b7f46f8c43	2026-02-02 10:27:55.331737+00	20260201000000_rename_api_calls_to_requests	\N	\N	2026-02-02 10:27:55.304119+00	1
8e2bd00b-c5a1-4d32-a3fd-1051e4e232a1	749ccd4cac6bd2d1421dd3abef7abb9ea53179004e189671a459d40f50a37069	2026-02-02 10:27:55.355968+00	20260202000000_remove_legacy_quota_fields	\N	\N	2026-02-02 10:27:55.333957+00	1
35de2b15-95ff-4928-9cf6-91b936371057	4d5880a886e858a8fc674057bf5151e99bbcbc73e7889c98825beac934b66a9c	2026-02-02 10:44:43.348822+00	20260202100000_drop_resource_quotas	\N	\N	2026-02-02 10:44:43.290035+00	1
64fa92d0-953a-4a50-8777-9a25658e8df3	e8f46b86b2522236a518155926593fd8e244f0e485f502516c5596b73111f568	\N	20260202120000_rename_ai_token_to_credit_budget	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260202120000_rename_ai_token_to_credit_budget\n\nDatabase error code: 42703\n\nDatabase error:\nERROR: column "ai_token_budget" does not exist\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42703), message: "column \\"ai_token_budget\\" does not exist", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("tablecmds.c"), line: Some(3556), routine: Some("renameatt_internal") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260202120000_rename_ai_token_to_credit_budget"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:113\n   1: schema_commands::commands::apply_migrations::Applying migration\n           with migration_name="20260202120000_rename_ai_token_to_credit_budget"\n             at schema-engine/commands/src/commands/apply_migrations.rs:95\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:246	2026-02-03 07:31:11.018796+00	2026-02-03 07:30:44.647679+00	0
44997384-5084-402d-a9b5-0a0874f9108e	1c8db742d158e7692a340773e8506e9bfbb675e552527cf9106517b487dd99dd	\N	20260202130000_add_credit_budget_tracking	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260202130000_add_credit_budget_tracking\n\nDatabase error code: 42701\n\nDatabase error:\nERROR: column "credit_used" of relation "dept_allocations" already exists\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42701), message: "column \\"credit_used\\" of relation \\"dept_allocations\\" already exists", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("tablecmds.c"), line: Some(7279), routine: Some("check_for_column_name_collision") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260202130000_add_credit_budget_tracking"\n             at schema-engine/connectors/sql-schema-connector/src/apply_migration.rs:113\n   1: schema_commands::commands::apply_migrations::Applying migration\n           with migration_name="20260202130000_add_credit_budget_tracking"\n             at schema-engine/commands/src/commands/apply_migrations.rs:95\n   2: schema_core::state::ApplyMigrations\n             at schema-engine/core/src/state.rs:246	2026-02-03 07:36:14.713004+00	2026-02-03 07:35:57.357719+00	0
d5151830-c26d-485d-8322-b349f6d99a5c	1c8db742d158e7692a340773e8506e9bfbb675e552527cf9106517b487dd99dd	2026-02-03 07:36:14.722739+00	20260202130000_add_credit_budget_tracking		\N	2026-02-03 07:36:14.722739+00	0
0ccaaadb-89e8-4f60-adc1-4d7753b4e867	2835808befcbfefb87b7e3b9a401310f32ada570e59d0b3c4a22e0976d1ccc70	2026-02-03 07:36:24.767641+00	20260203000000_add_capability_column	\N	\N	2026-02-03 07:36:24.59101+00	1
ab31f81c-2fea-4337-ac66-08e60bf2eaf3	7d54436b3522727e60d05d11baa13ce454a5269ae15aa046313cf0f08fbb3926	2026-02-04 06:46:49.373336+00	20260204000000_float_credits_with_pending	\N	\N	2026-02-04 06:46:49.185574+00	1
8a557539-e3fa-4b7a-ac9f-fdd554617881	4ca5f17bf934ecf16165197f0c7a252e0759aea93b5510776f79bce54d6c5413	2026-02-04 07:55:47.499851+00	20260204100000_remove_legacy_credit_balance	\N	\N	2026-02-04 07:55:47.407194+00	1
\.


--
-- Data for Name: ai_usage; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_usage (id, user_id, organization_id, gateway_id, model, source, input_tokens, output_tokens, total_tokens, image_count, character_count, audio_seconds, credits_used, billing_period, request_id, duration_ms, created_at, department_id, capability) FROM stdin;
cml0ik4mr0001v0kyoo6rrqmq	cmkpke0970000zvkyal5a8aep	\N	\N	claude-3-haiku-20240307	2bot	24	12	36	\N	\N	\N	1	2026-01	\N	\N	2026-01-30 06:40:11.379	\N	text-generation
cml0myuqk0003qjkyhncvbtbj	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	68	69	137	\N	\N	\N	5	2026-01	\N	\N	2026-01-30 08:43:36.86	\N	text-generation
cml0n0ec10001vmkyxqvqxgs3	cmkpke0970000zvkyal5a8aep	\N	\N	claude-3-haiku-20240307	2bot	24	12	36	\N	\N	\N	1	2026-01	\N	\N	2026-01-30 08:44:48.913	\N	text-generation
cml0p0xnl0001lykywmdd64w1	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	47	111	\N	\N	\N	4	2026-01	\N	\N	2026-01-30 09:41:13.185	\N	text-generation
cml0p135u0003lykyv9fwwkd4	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	115	40	155	\N	\N	\N	4	2026-01	\N	\N	2026-01-30 09:41:20.322	\N	text-generation
cml0pd4oa0005lykyms1ui0q5	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	159	46	205	\N	\N	\N	5	2026-01	\N	\N	2026-01-30 09:50:42.154	\N	text-generation
cml0pdd990007lykynzdbok6n	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	209	58	267	\N	\N	\N	7	2026-01	\N	\N	2026-01-30 09:50:53.277	\N	text-generation
cml0pgyne0009lyky2iywkxu8	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	50	114	\N	\N	\N	4	2026-01	\N	\N	2026-01-30 09:53:40.97	\N	text-generation
cml0pqepl0001aoky6d4hbddi	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	271	46	317	\N	\N	\N	8	2026-01	\N	\N	2026-01-30 10:01:01.689	\N	text-generation
cml0pxd9t0001r3ky5scvd9gy	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	64	53	117	\N	\N	\N	4	2026-01	\N	\N	2026-01-30 10:06:26.417	\N	text-generation
cml0py6180003r3kyjwd8tomn	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	64	49	113	\N	\N	\N	4	2026-01	\N	\N	2026-01-30 10:07:03.692	\N	text-generation
cml0thh740003m2kyz5lo2fxc	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	52	116	\N	\N	\N	4	2026-01	\N	\N	2026-01-30 11:46:03.472	\N	text-generation
cml0tty87000134ky3ltiqniq	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	125	74	199	\N	\N	\N	6	2026-01	\N	\N	2026-01-30 11:55:45.415	\N	text-generation
cml0twhnm000334ky7y6t1b84	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	215	80	295	\N	\N	\N	9	2026-01	\N	\N	2026-01-30 11:57:43.906	\N	text-generation
cml0txh5e000534kyk37lafkc	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	123	56	179	\N	\N	\N	5	2026-01	\N	\N	2026-01-30 11:58:29.906	\N	text-generation
cml0vxhog000934ky1ybm0zpc	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	49	113	\N	\N	\N	4	2026-01	\N	\N	2026-01-30 12:54:29.824	\N	text-generation
cml0vxvv9000b34kyfi04m7uc	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	121	252	373	\N	\N	\N	17	2026-01	\N	\N	2026-01-30 12:54:48.213	\N	text-generation
cml0w3jee000n34kyx833rw2c	cml0w2wim000f34kymqnw79n1	\N	\N	claude-3-5-haiku-20241022	2bot	120	68	188	\N	\N	\N	6	2026-01	\N	\N	2026-01-30 12:59:11.99	\N	text-generation
cml0wbfsc000p34kysm4ywkk6	cml0w2wim000f34kymqnw79n1	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	69	64	133	\N	\N	\N	5	2026-01	\N	\N	2026-01-30 13:05:20.556	\N	text-generation
cml3reo5r0003gvkyvyckx363	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	54	118	\N	\N	\N	4	2026-02	\N	\N	2026-02-01 13:11:11.823	\N	text-generation
cml58vwfc0001vekyztrihhey	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	55	119	\N	\N	\N	4	2026-02	\N	\N	2026-02-02 14:08:15.336	\N	text-generation
cml58w1yr0003vekymla2i2f6	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	65	45	110	\N	\N	\N	4	2026-02	\N	\N	2026-02-02 14:08:22.514	\N	text-generation
cml6j7qx30005hskylhdcy7f8	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	72	60	132	\N	\N	\N	0	2026-02	\N	\N	2026-02-03 11:45:10.407	\N	text-generation
cml6j8b5a0007hskymb2oikrq	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	151	202	353	\N	\N	\N	0	2026-02	\N	\N	2026-02-03 11:45:36.622	\N	text-generation
cml6p4vls00031rky08r0bk4f	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	133	141	274	\N	\N	\N	1	2026-02	\N	\N	2026-02-03 14:30:54.208	\N	text-generation
cml0im5u80001e1ky5z1m5d5a	cmkpke0970000zvkyal5a8aep	\N	\N	claude-3-haiku-20240307	2bot	24	12	36	\N	\N	\N	1	2026-01	\N	\N	2026-01-30 06:41:46.256	\N	text-generation
cml0iwufe0001nnkyx6x3qec4	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	8	97	105	\N	\N	\N	5	2026-01	\N	\N	2026-01-30 06:50:04.682	\N	text-generation
cml0ixbob0003nnkyr04cbyb9	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	112	15	127	\N	\N	\N	3	2026-01	\N	\N	2026-01-30 06:50:27.035	\N	text-generation
cml0j2w0p0005nnky6b86yrni	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	14	58	72	\N	\N	\N	3	2026-01	\N	\N	2026-01-30 06:54:46.681	\N	text-generation
cml0jn7mw0001faky8mnuyqty	cmkpke0970000zvkyal5a8aep	\N	\N	claude-3-haiku-20240307	2bot	24	12	36	\N	\N	\N	1	2026-01	\N	\N	2026-01-30 07:10:34.856	\N	text-generation
cml0jumjq00013dkyl993qg1n	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	9	21	30	\N	\N	\N	1	2026-01	\N	\N	2026-01-30 07:16:20.774	\N	text-generation
cml0jv3eu000154kywxrgofnp	cmkpke0970000zvkyal5a8aep	\N	\N	claude-3-haiku-20240307	2bot	24	12	36	\N	\N	\N	1	2026-01	\N	\N	2026-01-30 07:16:42.63	\N	text-generation
cml0k4skg00025akydfr6nbki	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	13	42	55	\N	\N	\N	2	2026-01	\N	\N	2026-01-30 07:24:15.136	\N	text-generation
cml0k56xc00045akyb9zgguxz	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	66	87	153	\N	\N	\N	6	2026-01	\N	\N	2026-01-30 07:24:33.744	\N	text-generation
cml0kpagr0001lvkybv0rb5jk	cmkpke0970000zvkyal5a8aep	\N	\N	claude-3-haiku-20240307	2bot	24	12	36	\N	\N	\N	1	2026-01	\N	\N	2026-01-30 07:40:11.451	\N	text-generation
cml0mx1cc0001qjkysd0f7hqf	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	11	63	74	\N	\N	\N	4	2026-01	\N	\N	2026-01-30 08:42:12.108	\N	text-generation
cml6p4c0u00011rkyz6c4pczj	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	56	120	\N	\N	\N	1	2026-02	\N	\N	2026-02-03 14:30:28.83	\N	text-generation
cml6pbjdi00051rky24fun6b9	cmkpke0970000zvkyal5a8aep	\N	\N	claude-3-5-haiku-20241022	2bot	14	10	24	\N	\N	\N	1	2026-02	\N	\N	2026-02-03 14:36:04.949	\N	text-generation
cml7p048u0000twky0y3gm633	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	53	117	\N	\N	\N	0.002632	2026-02	\N	\N	2026-02-04 07:14:58.301	\N	text-generation
cml7p0fu20001twkydbjog1q1	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	125	69	194	\N	\N	\N	0.00376	2026-02	\N	\N	2026-02-04 07:15:13.322	\N	text-generation
cml7p0wbk0002twky4ue8d1fi	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	206	232	438	\N	\N	\N	0.010928	2026-02	\N	\N	2026-02-04 07:15:34.688	\N	text-generation
cml7p1mdx0003twky503vc6yo	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	72	245	317	\N	\N	\N	0.010376	2026-02	\N	\N	2026-02-04 07:16:08.469	\N	text-generation
cml7p2xgj0004twkynwvn80im	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	329	247	576	\N	\N	\N	0.012512	2026-02	\N	\N	2026-02-04 07:17:09.475	\N	text-generation
cml819a8y0002f7kydx61seo7	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	66	58	124	\N	\N	\N	0.002848	2026-02	\N	\N	2026-02-04 12:58:01.378	\N	text-generation
cml81qea40000gmkyojjg1cb6	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	65	39	104	\N	\N	\N	0.00208	2026-02	\N	\N	2026-02-04 13:11:19.755	\N	text-generation
cml81qnxm0001gmkyvd02g62i	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	65	54	119	\N	\N	\N	0.00268	2026-02	\N	\N	2026-02-04 13:11:32.266	\N	text-generation
cml81qv340002gmkyy10uf9mu	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	123	65	188	\N	\N	\N	0.003584	2026-02	\N	\N	2026-02-04 13:11:41.535	\N	text-generation
cml81u4rh0003gmkywh65n6p7	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	60	124	\N	\N	\N	0.002912	2026-02	\N	\N	2026-02-04 13:14:14.045	\N	text-generation
cml90c9n9000er4ky12o2czzh	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	72	127	199	\N	\N	\N	0.005656	2026-02	\N	\N	2026-02-05 05:20:07.124	\N	text-generation
cml9k8yll0002y4kycy2l2zp6	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-sonnet-4-20250514	2bot	66	31	97	\N	\N	\N	0.00663	2026-02	\N	\N	2026-02-05 14:37:25.161	\N	text-generation
cml9kds0j0000t5ky6oiwyi04	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	64	38	102	\N	\N	\N	0.002032	2026-02	\N	\N	2026-02-05 14:41:09.907	\N	text-generation
cml9ke0wy0001t5kywcdryv8q	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-sonnet-4-20250514	2bot	106	36	142	\N	\N	\N	0.008579999999999999	2026-02	\N	\N	2026-02-05 14:41:21.441	\N	text-generation
cml9ke8m20002t5kynnz7dlay	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-opus-4-20250514	2bot	146	51	197	\N	\N	\N	0.06015	2026-02	\N	\N	2026-02-05 14:41:31.417	\N	text-generation
cml9l3oh50000iakyamt25kt9	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	66	31	97	\N	\N	\N	0.001768	2026-02	\N	\N	2026-02-05 15:01:18.377	\N	text-generation
cml9l414g0001iaky4h3m5xk2	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	110	73	183	\N	\N	\N	0.0038	2026-02	\N	\N	2026-02-05 15:01:34.768	\N	text-generation
cml9lb3600002iakyr8e517ji	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	65	55	120	\N	\N	\N	0.00272	2026-02	\N	\N	2026-02-05 15:07:04.008	\N	text-generation
cml9lbru00003iakywrjm0stn	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-3-5-haiku-20241022	2bot	127	56	183	\N	\N	\N	0.003256	2026-02	\N	\N	2026-02-05 15:07:35.976	\N	text-generation
cml9lj9yn0004iakyckdr73rp	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	65	39	104	\N	\N	\N	0.00208	2026-02	\N	\N	2026-02-05 15:13:26.063	\N	text-generation
cml9ljh6i0005iakyid3aeb38	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-sonnet-4-20250514	2bot	109	56	165	\N	\N	\N	0.01167	2026-02	\N	\N	2026-02-05 15:13:35.418	\N	text-generation
cml9ljszp0006iaky9iraljo3	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-opus-4-20250514	2bot	170	99	269	\N	\N	\N	0.09974999999999999	2026-02	\N	\N	2026-02-05 15:13:50.725	\N	text-generation
cml9os13d0007iakyltjnqw5b	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-sonnet-4-20250514	2bot	64	31	95	\N	\N	\N	0.006569999999999999	2026-02	\N	\N	2026-02-05 16:44:13.321	\N	text-generation
cml9pdz7e0008iakyfs4rbpwm	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-sonnet-4-20250514	2bot	99	44	143	\N	\N	\N	0.009569999999999999	2026-02	\N	\N	2026-02-05 17:01:17.305	\N	text-generation
cml9pezv00009iaky4dgpqoya	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	\N	claude-sonnet-4-20250514	2bot	150	60	210	\N	\N	\N	0.0135	2026-02	\N	\N	2026-02-05 17:02:04.812	\N	text-generation
cmlal1vvo000jiakyjzh4dp1v	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	72	47	119	\N	\N	\N	0.002456	2026-02	\N	\N	2026-02-06 07:47:40.836	\N	text-generation
cmlaqij4q0002lmkywzsl9muz	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-sonnet-4-20250514	2bot	401	67	468	\N	\N	\N	0.02208	2026-02	\N	\N	2026-02-06 10:20:35.546	\N	text-generation
cmlaqj0eu0003lmkyh02cdk6v	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-sonnet-4-20250514	2bot	466	227	693	\N	\N	\N	0.04803	2026-02	\N	\N	2026-02-06 10:20:57.941	\N	text-generation
cmlaqkk8x0004lmkykm73spn7	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	1284	145	1429	\N	\N	\N	0.016072	2026-02	\N	\N	2026-02-06 10:22:10.305	\N	text-generation
cmldgm1800001e8ky5xot7jis	cmkpke0a50001zvkysu49sjk5	\N	\N	black-forest-labs/FLUX.1-schnell	2bot	\N	\N	\N	1	\N	\N	3	2026-02	\N	\N	2026-02-08 08:06:41.328	\N	image-generation
cmldgnxvz0003e8kym38y9clb	cmkpke0a50001zvkysu49sjk5	\N	\N	black-forest-labs/FLUX.2-pro	2bot	\N	\N	\N	1	\N	\N	40	2026-02	\N	\N	2026-02-08 08:08:10.319	\N	image-generation
cmldiuh260001lfky1d0ph2j7	cmkpke0a50001zvkysu49sjk5	\N	\N	black-forest-labs/FLUX.2-pro	2bot	\N	\N	\N	1	\N	\N	40	2026-02	\N	\N	2026-02-08 09:09:14.334	\N	image-generation
cmldixv6m0003lfkydzzecjlm	cmkpke0a50001zvkysu49sjk5	\N	\N	black-forest-labs/FLUX.1-schnell	2bot	\N	\N	\N	1	\N	\N	3	2026-02	\N	\N	2026-02-08 09:11:52.606	\N	image-generation
cmldmmo510002j7ky17v3pd5i	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	66	54	120	\N	\N	\N	0.002688	2026-02	\N	\N	2026-02-08 10:55:08.725	\N	text-generation
cmldmng1n00004yky7eyqqwzk	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	65	39	104	\N	\N	\N	0.00208	2026-02	\N	\N	2026-02-08 10:55:44.89	\N	text-generation
cmldmor0m0003j7kyn6d7dbf3	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	67	55	122	\N	\N	\N	0.002736	2026-02	\N	\N	2026-02-08 10:56:45.766	\N	text-generation
cmldnb0d900014ykyno7fr4sf	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	71	37	108	\N	\N	\N	0.002048	2026-02	\N	\N	2026-02-08 11:14:04.317	\N	text-generation
cmldnba9600024ykyyz159gcq	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-sonnet-4-20250514	2bot	119	57	176	\N	\N	\N	0.01212	2026-02	\N	\N	2026-02-08 11:14:17.13	\N	text-generation
cmldnbh5b00034ykywjx61i2r	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-opus-4-20250514	2bot	187	69	256	\N	\N	\N	0.07980000000000001	2026-02	\N	\N	2026-02-08 11:14:26.062	\N	text-generation
cmles7onl000031ky6gs2av6u	cmkpke0a50001zvkysu49sjk5	\N	\N	claude-3-5-haiku-20241022	2bot	66	59	125	\N	\N	\N	0.08664	2026-02	\N	\N	2026-02-09 06:19:13.424	\N	text-generation
\.


--
-- Data for Name: alert_configs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alert_configs (id, organization_id, quota_warning_threshold, quota_critical_threshold, error_rate_threshold, consecutive_failures, daily_cost_threshold, monthly_cost_threshold, channels, enabled, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: alert_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.alert_history (id, organization_id, type, severity, title, message, resource, current_value, limit_value, percentage, metadata, acknowledged, acknowledged_by, acknowledged_at, resolved_at, created_at) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, organization_id, action, resource, resource_id, metadata, ip_address, user_agent, status, created_at) FROM stdin;
cmkqs46d30001lgkywyl6u9tw	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 11:10:01.526
cmkqs4ucl0005lgkyk4x5tik6	cmkpke0a50001zvkysu49sjk5	\N	organization.create	organization	cmkqs4ubc0003lgkym2p0dzeq	{"name": "ABC Developers", "slug": "abc-developers"}	127.0.0.1	node	success	2026-01-23 11:10:32.613
cmkqs7ni6000041kyro7mxqim	\N	\N	user.login.failed	user	\N	{"email": "test@example.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-23 11:12:43.709
cmkqs9tj0000241kyjz7u920y	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:14:24.828
cmkqsa5mn000441kylatzdtcc	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:14:40.511
cmkqsbcda00001bky2018gij7	\N	\N	user.login.failed	user	\N	{"email": "admin@2bot.org", "reason": "Invalid credentials"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	failure	2026-01-23 11:15:35.902
cmkqsbf6v00011bkywdg7euq3	\N	\N	user.login.failed	user	\N	{"email": "admin@2bot.org", "reason": "Invalid credentials"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	failure	2026-01-23 11:15:39.559
cmkqsbn9v00031bkymkomdazf	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 11:15:50.035
cmkqsc0j600051bkytn5xmcqo	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 11:16:07.218
cmkqsj2uz0001fdkykfd7tij8	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkqsj2ue0000fdkygjs7q3ae	{"role": "ORG_MEMBER", "invitedEmail": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 11:21:36.827
cmkqsv8d30001abkymg93dcfa	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:31:03.831
cmkqsx16m00013zky29dvwhf7	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 11:32:27.838
cmkqsxzff0001fakyumerfg1l	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:33:12.219
cmkqt67ly0001ubky1b1r8rod	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:39:36.07
cmkqt7tln0003ubkypsbzfg2p	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:40:51.227
cmkqt8qsx0005ubkys6z7nkrd	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:41:34.257
cmkqt919l0007ubkyfm5ujwsv	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:41:47.817
cmkqt99wg0009ubky3swe9987	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:41:59.007
cmkqt9p4d000bubkygijk6w83	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:42:18.733
cmkqtfm110001pikycy0snf0r	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 11:46:54.661
cmkqu2bsa0001s5kydev9aim3	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:04:34.474
cmkquaio70002s5ky9c3q8heo	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cmkqsj2ue0000fdkygjs7q3ae	{"email": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:10:56.646
cmkquakzu0004s5kyf9ekc56o	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkquakzd0003s5kyyhm2wkvr	{"role": "ORG_MEMBER", "invitedEmail": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:10:59.658
cmkquc1nx0005s5ky01sj7tjz	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cmkquakzd0003s5kyyhm2wkvr	{"email": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:12:07.916
cmkquc46y0007s5kycnza9kru	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkquc46k0006s5ky8s8umt9p	{"role": "ORG_MEMBER", "invitedEmail": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:12:11.194
cmkqucr7p0009s5ky9knro5cw	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 12:12:41.029
cmkqudhnn000bs5kyznnnyf3a	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 12:13:15.299
cmkqueed6000cs5kyvitgs04i	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cmkquc46k0006s5ky8s8umt9p	{"email": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:13:57.69
cmkqueglt000es5kyx69efyod	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkqueglc000ds5kyc8ln88ke	{"role": "ORG_MEMBER", "invitedEmail": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:14:00.592
cmkqumewc00008mkylyqv470z	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cmkqueglc000ds5kyc8ln88ke	{"email": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:20:11.628
cml7va1kz000dl9kyy6mum84c	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:10:39.107
cmkqumhzd00028mkysftj4uv3	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkqumhyr00018mkyts1wkyl0	{"role": "ORG_MEMBER", "invitedEmail": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:20:15.625
cmkqv17y500011ckylk14g35b	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkqv17xh00001cky138cimn2	{"role": "ORG_MEMBER", "invitedEmail": "hojiakbarbakhronoff@gmail.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:31:42.461
cmkqv86dx0000frkyzgag6hy2	\N	\N	user.login.failed	user	\N	{"email": "hojiakbarbakhronoff@gmail.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-23 12:37:07.029
cmkqv920l0002frkytw6sew6e	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 12:37:48.02
cmkqv925z0004frkyobzf8yl4	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.invite	membership	cmkqv925d0003frkyywzri5ie	{"role": "ORG_MEMBER", "invitedEmail": "test@example.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	curl/8.5.0	success	2026-01-23 12:37:48.215
cmkqv9m8x0006frkyx82pgmip	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-01-23 12:38:14.241
cmkqvja980000ohkyq86ns0sd	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cmkqv17xh00001cky138cimn2	{"email": "hojiakbarbakhronoff@gmail.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:45:45.259
cmkqvjgu00001ohkyo924fjqe	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cmkqumhyr00018mkyts1wkyl0	{"email": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:45:53.783
cmkqvjo9v0003ohkyy8fvk997	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkqvjo9h0002ohkymzyeq2lg	{"role": "ORG_MEMBER", "invitedEmail": "info@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:46:03.427
cmkqvqfdc0006ohkyenljx8ob	cmkqvqf5n0004ohky3j3fjg36	\N	user.register	user	cmkqvqf5n0004ohky3j3fjg36	{"email": "info@abclegacyllc.com"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-23 12:51:18.48
cmkqvqfn80008ohky6nnj9765	cmkqvqf5n0004ohky3j3fjg36	\N	membership.accept_pending_invite	membership	cmkqvqfla0007ohkygckd2tkl	{"inviteId": "cmkqvjo9h0002ohkymzyeq2lg", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-23 12:51:18.836
cmkqvqrlq000aohkyw8zmqok2	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-23 12:51:34.334
cmkqvs8k9000dohky2w6jcfes	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkqvs8js000cohkyw1spmhg3	{"role": "ORG_MEMBER", "invitedEmail": "hojiakbarbakhronoff@gmail.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:52:42.968
cmkqvv0z7000eohkyijvyl2j3	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cmkqvs8js000cohkyw1spmhg3	{"email": "hojiakbarbakhronoff@gmail.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:54:53.107
cmkqvvrka000gohkyqva31639	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkqvvrj9000fohkyi73efoby	{"role": "ORG_MEMBER", "invitedEmail": "hojiakbarbakhronoff@gmail.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 12:55:27.561
cmkqvzorr000johkyn58rodeg	cmkqvzoqm000hohkyccs6hjyq	\N	user.register	user	cmkqvzoqm000hohkyccs6hjyq	{"email": "hojiakbarbakhronoff@gmail.com"}	127.0.0.1	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1	success	2026-01-23 12:58:30.567
cmkqvzp0i000lohkygwis5xc0	cmkqvzoqm000hohkyccs6hjyq	\N	membership.accept_pending_invite	membership	cmkqvzoyh000kohkyxo3pa065	{"inviteId": "cmkqvvrj9000fohkyi73efoby", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1	success	2026-01-23 12:58:30.882
cmkqw09aq000nohky76bknk83	cmkqvzoqm000hohkyccs6hjyq	\N	user.login.success	user	cmkqvzoqm000hohkyccs6hjyq	\N	127.0.0.1	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1	success	2026-01-23 12:58:57.17
cmkqwvi780000j0kyjtm9bqhz	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.remove	membership	cmkqv925d0003frkyywzri5ie	{"orgId": "cmkqs4ubc0003lgkym2p0dzeq", "removedUserId": "cmkpke0970000zvkyal5a8aep"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 13:23:15.043
cmkqx8som0001ehkylb6zjcjg	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 13:33:35.158
cmkqysu7r0002ehky0zqv534y	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "ORG_ADMIN", "previousRole": "ORG_MEMBER"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 14:17:09.878
cmkqysvz70003ehky1y80d3s2	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "ORG_MEMBER", "previousRole": "ORG_ADMIN"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-23 14:17:12.163
cmktbkzsm0002mokya8mmvrkk	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-25 05:50:31.222
cml7vbdhx000fl9kybc49jap9	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:11:41.205
cmktinzuk00016akyzquv8rig	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-25 09:08:48.572
cmktmx2ll00012lkya2xglkzk	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-25 11:07:50.505
cmktr9o1b00022lky4hbz9bgo	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	node	success	2026-01-25 13:09:36.623
cmktr9reg00042lkyg1nluu7m	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-25 13:09:40.984
cmktrda4d00072lkyht2hf0yp	cmkqvqf5n0004ohky3j3fjg36	\N	organization.create	organization	cmktrda3c00052lky0ciq1syk	{"name": "ABC corp", "slug": "abc-corp"}	127.0.0.1	node	success	2026-01-25 13:12:25.213
cmkusq2hx00017eky2imwdmle	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-26 06:38:07.653
cmkuwobrg0001cdky4gvj98xi	cmkpke0a50001zvkysu49sjk5	\N	gateway.create	gateway	cmkuwobqb0000cdkyozgcj9xz	{"name": "@abc_control_copyright_bot", "type": "TELEGRAM_BOT"}	127.0.0.1	node	success	2026-01-26 08:28:44.812
cmkuwrwy00003cdkyftu6oe4r	cmkpke0a50001zvkysu49sjk5	\N	gateway.create	gateway	cmkuwrwxl0002cdkyx9egxvjp	{"name": "@main_analyticbot", "type": "TELEGRAM_BOT"}	127.0.0.1	node	success	2026-01-26 08:31:32.231
cmkuwsaos0005cdky9ue2nql3	cmkpke0a50001zvkysu49sjk5	\N	gateway.create	gateway	cmkuwsanj0004cdkyrggcp1ic	{"name": "@analytic_2bot", "type": "TELEGRAM_BOT"}	127.0.0.1	node	success	2026-01-26 08:31:50.044
cmkuz52yu0001onky5fjquvgy	cmkpke0a50001zvkysu49sjk5	\N	plugin.install	plugin	cmkuz52x20000onky5okewnia	{"slug": "analytics"}	127.0.0.1	node	success	2026-01-26 09:37:45.798
cmkv3b2qb0000d6kyfsz9rxm0	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	node	success	2026-01-26 11:34:23.89
cmkv3c7ih0001vnkyjuizk5jk	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-26 11:35:16.745
cmkv3ckcq0003vnky49tylfuc	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-26 11:35:33.385
cmkv3h8980005vnkyl8dherbb	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-26 11:39:10.988
cmkv52w280001zykyv84uf5nv	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cmkv52w1d0000zykyx8jnki7f	{"role": "ORG_ADMIN", "invitedEmail": "adam@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	node	success	2026-01-26 12:24:01.231
cmkv5eq060003zykytqdz3di0	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-26 12:33:13.254
cmkv9zehr0000ykky57ssi4fh	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 14:41:16.575
cmkva4vv30000vzkyivas0rxh	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 14:45:32.366
cmkva55cn0001vzkyz1nolrgl	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 14:45:44.662
cmkva5f7k0002vzkypvaxlbnt	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 14:45:57.44
cmkvagfwf0000ogkykdokls0g	\N	\N	user.login.failed	user	\N	{"email": "test@test.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 14:54:31.55
cmkvaigcz0000fjky4b47ngqn	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 14:56:05.459
cmkvakm3g00006iky51ob83gg	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 14:57:46.203
cmkvaq9uv00002lkyx5q75z1r	\N	\N	user.login.failed	user	\N	{"email": "test@test.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 15:02:10.279
cmkvar4mh00012lkyr7yebfvq	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 15:02:50.153
cmkvass1p00022lkypiqfsf06	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 15:04:07.165
cmkvat3mi00032lky45omjcty	\N	\N	user.login.failed	user	\N	{"email": "test@invalid.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-26 15:04:22.17
cmkvb7eoi0001ifky7mo3cb4f	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-26 15:15:29.682
cmkvb7uk90003ifkynh57hsvg	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-26 15:15:50.265
cmkvfgx3o0005ifky0uucg6qr	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (iPhone; CPU iPhone OS 26_2_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/144.0.7559.85 Mobile/15E148 Safari/604.1	success	2026-01-26 17:14:51.924
cmkvfhbxj0006ifky74c168hv	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (iPhone; CPU iPhone OS 26_2_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/144.0.7559.85 Mobile/15E148 Safari/604.1	success	2026-01-26 17:15:11.143
cmkvfi5xs0008ifkygw2gjxpr	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (iPhone; CPU iPhone OS 26_2_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/144.0.7559.85 Mobile/15E148 Safari/604.1	success	2026-01-26 17:15:50.032
cmkw508050001vakyxncq6g0c	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 05:09:42.917
cmkw50sji0003vaky3o8hpy2i	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 05:10:09.534
cmkw664mq000184ky41vbgdli	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 05:42:18.098
cmkw68lo4000384kyja61w13d	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	plugin.install	plugin	cmkw68lna000284kydinnfn6j	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 05:44:13.492
cmkw68my5000484ky5pjhtseq	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	plugin.uninstall	plugin	cmkw68lna000284kydinnfn6j	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 05:44:15.149
cmkw6jppk000584kyjvwfe2ib	\N	\N	user.login.failed	user	\N	{"email": "test@example.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-01-27 05:52:51.944
cmkw82rbc0001p7ky0r8idrrd	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 06:35:40.104
cmkw85gh00002p7kygbhs6adw	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 06:37:46.02
cmkw85iaw0004p7ky76b4s03y	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 06:37:48.392
cmkwakk720001bykye097cdxm	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 07:45:29.918
cmkwcj0hu0001r3kyavmmkcvc	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 08:40:16.962
cmkwco6wk0003r3kyavh5zqii	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 08:44:18.548
cmkwd8x6m00014wky5jvzowol	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 09:00:25.726
cmkwd9u9200024wky6qjqywry	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 09:01:08.581
cmkwd9x4h00044wkyfzdn4uq1	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 09:01:12.305
cmkwdg2gd000155ky6fmswv4o	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 09:05:59.149
cmkwg7i16000355ky9tgow9vw	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-27 10:23:18.282
cmkwgs3zk000196kyovl20955	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 10:39:19.856
cmkwh3jrl000396kyxhwx4lmq	cmkpke0a50001zvkysu49sjk5	\N	gateway.create	gateway	cmkwh3jr4000296kyhfa3umlk	{"name": "TESTER 2bot.org", "type": "TELEGRAM_BOT"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 10:48:13.521
cmkwi45oy0001ltky90l2sbis	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	department.create	department	cmkwi45nm0000ltkyas3190r0	{"name": "Fleet", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 11:16:41.554
cmkwie9na00005qkyf5lrme6j	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "ORG_ADMIN", "previousRole": "ORG_MEMBER"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 11:24:33.237
cmkwievr000015qky93mjmziy	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "ORG_MEMBER", "previousRole": "ORG_ADMIN"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 11:25:01.884
cmkwihiqz0001s2kyyoxdla63	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	gateway.create	gateway	cmkwihipw0000s2kybr37qi5v	{"name": "TESTER 2bot.org", "type": "TELEGRAM_BOT"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 11:27:05.003
cmkwin9sm000198ky4d29r0rg	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 11:31:33.334
cmkwivo3q00019qkyfmgbtf0y	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-27 11:38:05.126
cmkwivz6u00029qkyjbip34m0	cmkpke0a50001zvkysu49sjk5	\N	gateway.delete	gateway	cmkwh3jr4000296kyhfa3umlk	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 11:38:19.494
cmkwix0nz00049qkylnrb1h36	cmkpke0a50001zvkysu49sjk5	\N	gateway.create	gateway	cmkwix0ni00039qkyp25e78d7	{"name": "admin@2bot.org", "type": "AI"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 11:39:08.063
cmkwixdua00059qkyl2cija6i	cmkpke0a50001zvkysu49sjk5	\N	gateway.delete	gateway	cmkwix0ni00039qkyp25e78d7	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 11:39:25.138
cmkwjsa9d0001llkybpthh3fn	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-27 12:03:26.833
cml7vbly0000hl9kyaiy8m0qd	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:11:52.152
cmkxl8ywk0001jykyuppfz4qm	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 05:32:11.06
cmkxldoby0001vgkyp90r6bil	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 05:35:50.638
cmkxlvg4f0003vgkyim89602h	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	plugin.install	plugin	cmkxlvg3b0002vgkyg9dk8lxb	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 05:49:39.807
cmkxlzqcq00003rkymc3udz4z	cmkpke0a50001zvkysu49sjk5	\N	gateway.delete	gateway	cmkwihipw0000s2kybr37qi5v	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 05:52:59.69
cmkxm1gc400023rkydrcwfqug	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	gateway.create	gateway	cmkxm1gba00013rkyputsbvo2	{"name": "@Tester_2bot", "type": "TELEGRAM_BOT"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 05:54:20.02
cmkxm2arl00043rky1oiv49hr	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-28 05:54:59.456
cmkxm2vk100053rkyf3k3o3xt	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "ORG_ADMIN", "previousRole": "ORG_MEMBER"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 05:55:26.4
cmkxm33nz00063rkya6fxxm5u	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "ORG_MEMBER", "previousRole": "ORG_ADMIN"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 05:55:36.911
cmkxm3rnv00073rkyq11mqtxf	cmkqvqf5n0004ohky3j3fjg36	\N	gateway.delete	gateway	cmkxm1gba00013rkyputsbvo2	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-28 05:56:08.011
cmkxohsf10001nbkyeakpbdq8	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 07:03:01.405
cmkxqr3c30001lzkyu9oi82n8	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 08:06:14.691
cmkxqym9w0003lzky95s0j6sv	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 08:12:05.828
cmkxqyyvm0004lzkynzk967g5	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "DEPT_MANAGER", "previousRole": "ORG_MEMBER"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 08:12:22.162
cmkxrbweu0001i8kyg25sgic3	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 08:22:25.494
cmkxrdol80003i8kyg7eap7i1	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	quota.dept_allocation.set	department	cmkwi45nm0000ltkyas3190r0	{"allocation": {"maxPlugins": 2, "maxStorage": 500, "maxApiCalls": 20, "maxWorkflows": 5}}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 08:23:48.668
cmkxre2qz0004i8kyrh2qkrhj	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	quota.dept_allocation.set	department	cmkwi45nm0000ltkyas3190r0	{"allocation": {"maxPlugins": 5, "maxStorage": 500, "maxApiCalls": 55, "maxWorkflows": 5}}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 08:24:07.018
cmkxrnntw0001xwkysrlbn0zu	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 08:31:34.244
cmkxs1dz90000wukyk5q64q65	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	quota.dept_allocation.set	department	cmkwi45nm0000ltkyas3190r0	{"allocation": {"maxPlugins": 1, "maxStorage": 10, "maxApiCalls": 1, "maxWorkflows": 1}}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 08:42:14.66
cmkxtqxlv0001ztkyx151a387	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 09:30:06.114
cmkxv8ld10001ppkyyz7vo9f6	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	gateway.create	gateway	cmkxv8lbw0000ppkypeldf23d	{"name": "admin@2bot.org", "type": "TELEGRAM_BOT"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 10:11:49.669
cmkxvarff0003ppkyfo7ejmrc	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	gateway.create	gateway	cmkxvareu0002ppky7qnc35c4	{"name": "@way_2bot", "type": "TELEGRAM_BOT"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 10:13:30.842
cmkxvct320005ppkyv6pd0afl	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-28 10:15:06.302
cmkxvft920007ppky6j5ifgfl	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 10:17:26.486
cmkxvgjvt0008ppkygthfsi0o	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "ORG_MEMBER", "previousRole": "DEPT_MANAGER"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 10:18:01.001
cmkxvgprh000appkyexb51vmq	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-28 10:18:08.62
cmkxvi5bh000cppkyzy204v0c	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-28 10:19:15.437
cmkxvk525000dppkyetnmsedx	cmkqvqf5n0004ohky3j3fjg36	\N	gateway.delete	gateway	cmkxvareu0002ppky7qnc35c4	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-28 10:20:48.413
cmkxvkeqq000fppky5gjren0g	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 10:21:00.961
cmky0m4ty0001gbkylzr1tvzs	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 12:42:19.51
cmky1t4wh0001mckyv73hiqag	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-28 13:15:45.809
cmky3id3w000186kylsjzdo6e	cmkqvqf5n0004ohky3j3fjg36	\N	user.login.success	user	cmkqvqf5n0004ohky3j3fjg36	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	success	2026-01-28 14:03:22.46
cmkyy8tmb000386kyokr14fmd	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 04:23:45.395
cmkyz0n8t000162kyf113d478	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 04:45:23.501
cmkyzwn4000019xkyk6vhu1sa	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 05:10:16.32
cmkz08lcs0001dpkymq3d16wo	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 05:19:33.916
cmkz0zrme00014ykyv6qojmeo	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 05:40:41.75
cmkz118gi0001gfky90v4tx52	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 05:41:50.226
cmkz11f2d0001jokyi163rgm7	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 05:41:58.785
cmkz11pay0001kzky7db68atd	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 05:42:12.058
cmkz26k0l00016sky34czqj93	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 06:13:58.101
cmkz6stuu0001lnkyrsurcqka	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 08:23:15.75
cmkz84k7a0001cekyokx1too2	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 09:00:22.726
cmkz9psmq00010akyytmj199j	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 09:44:53.042
cmkzcf0p60001kpky8dxyhc7g	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 11:00:29.13
cmkzchr1v0001nzkyxqkzdd0x	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 11:02:36.595
cmkzd9cdp0001j1kyx4umxo3n	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 11:24:03.949
cmkzdc2ba000147kysydi59xx	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 11:26:10.869
cmkzfuydc0001rrkyh7p8k6hf	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 12:36:51.456
cmkzg4t2i00015sky64jclbp3	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 12:44:31.146
cmkzg9dnf0000v8kyx67kjxt7	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 12:48:04.443
cmkzg9h3o0002v8kyore3lqum	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 12:48:08.916
cmkzgbyy20001ebky5f4wcxxv	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 12:50:05.354
cmkzhi6vf0001arkyxj5hohuk	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-29 13:22:55.179
cml03v65r0002fkky1c5yd3rt	cml03v61p0000fkkydf95z4cd	\N	user.register	user	cml03v61p0000fkkydf95z4cd	{"email": "myd110092@gmail.com"}	127.0.0.1	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36	success	2026-01-29 23:48:52.335
cml0cw6ij0008fkkyrv6elpoh	cml0cw6fj0006fkkylo8egj97	\N	user.register	user	cml0cw6fj0006fkkylo8egj97	{"email": "jkknkk6@gmail.com"}	127.0.0.1	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36	success	2026-01-30 04:01:35.995
cml0k2igx00005akyhsmjt9wd	cmkpke0a50001zvkysu49sjk5	\N	plugin.uninstall	plugin	cmkuz52x20000onky5okewnia	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-30 07:22:28.737
cml0sajcx0001ybkykhwloy1m	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-30 11:12:40.065
cml0th7oz0001m2kylzmeblhv	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-30 11:45:51.155
cml0vwjmu000734kyz1bmdu22	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 12:53:45.702
cml0w04vc000c34kyzbt5vqxl	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.remove	membership	cmkqvzoyh000kohkyxo3pa065	{"orgId": "cmkqs4ubc0003lgkym2p0dzeq", "removedUserId": "cmkqvzoqm000hohkyccs6hjyq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 12:56:33.192
cml0w1sg9000e34kysjnsx41w	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cml0w1sem000d34kyb07vz4uy	{"role": "ORG_ADMIN", "invitedEmail": "bakhtinur.komilov@gmail.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 12:57:50.409
cml0w2wjr000h34ky71akxupd	cml0w2wim000f34kymqnw79n1	\N	user.register	user	cml0w2wim000f34kymqnw79n1	{"email": "bakhtinur.komilov@gmail.com"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 12:58:42.375
cml0w2woo000j34ky9875m703	cml0w2wim000f34kymqnw79n1	\N	membership.accept_pending_invite	membership	cml0w2wo7000i34ky6mjdma41	{"inviteId": "cml0w1sem000d34kyb07vz4uy", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 12:58:42.552
cml0wdryz000r34ky7qp7c78z	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 13:07:09.659
cml0wdu1q000t34kylq8j4k40	cml0w2wim000f34kymqnw79n1	\N	user.login.success	user	cml0w2wim000f34kymqnw79n1	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 13:07:12.35
cml0wjmg8000v34ky9l5xf97h	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	orginvite.create	orginvite	cml0wjmfz000u34kyb30oil2q	{"role": "ORG_MEMBER", "invitedEmail": "safety@premiertruckinggroup.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 13:11:42.44
cml0wjvsh000w34kypsvn776k	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cml0wjmfz000u34kyb30oil2q	{"email": "safety@premiertruckinggroup.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 13:11:54.545
cml0wlk8s000y34kyjw2c6oi7	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-30 13:13:12.892
cml0wn09h000z34kyjnjee6gu	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-01-30 13:14:20.309
cml0xsydj000109kyu8fl6mc3	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-01-30 13:46:57.415
cml3ax546000309ky086kisl3	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-01 05:29:40.134
cml3kxj1u0001rqkyi33qupdv	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-01 10:09:54.354
cml3m700f0001ofky1wozsfg1	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-01 10:45:15.855
cml3my5sc0001yoky9ekyfsni	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-01 11:06:23.052
cml3reb240001gvkyfn9o89zd	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-01 13:10:54.844
cml4sif1v0001s6ky8714ptj3	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 06:29:52.435
cml4stiho0003s6kyup95hfsa	cmkpke0a50001zvkysu49sjk5	\N	plugin.install	plugin	cml4stigw0002s6ky0gsuvghl	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 06:38:30.108
cml4swqz80005s6kyo3asrx0j	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 06:41:01.076
cml4szy9a0006s6kydyw7wq4a	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cml0w2wo7000i34ky6mjdma41	{"newRole": "ORG_MEMBER", "previousRole": "ORG_ADMIN"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 06:43:30.478
cml4t024w0007s6kyk9yw077h	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "DEPT_MANAGER", "previousRole": "ORG_MEMBER"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 06:43:35.504
cml4t03s30008s6kybrclfk7w	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.update_role	membership	cmkqvqfla0007ohkygckd2tkl	{"newRole": "ORG_MEMBER", "previousRole": "DEPT_MANAGER"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 06:43:37.635
cml4t0ab50009s6kyqi8gq9r4	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	org_invite.cancel	org_invite	cmkv52w1d0000zykyx8jnki7f	{"email": "adam@abclegacyllc.com", "organizationId": "cmkqs4ubc0003lgkym2p0dzeq"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 06:43:46.097
cml4v81v9000as6ky9ph4aqon	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	membership.remove	membership	cml0w2wo7000i34ky6mjdma41	{"orgId": "cmkqs4ubc0003lgkym2p0dzeq", "removedUserId": "cml0w2wim000f34kymqnw79n1"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 07:45:47.637
cml4x8pww000cs6kyyfanlg31	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 08:42:18.032
cml4ysriq0001w4kyc0kqg31h	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 09:25:52.85
cml4yt6t800012ykyw9arq7d7	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 09:26:12.668
cml50nufe0001wxkypw07z8ot	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 10:18:02.57
cml52hk940001uwkytb0ltyf6	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 11:09:08.68
cml5403k30001ydkyg707f6oh	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 11:51:33.123
cml555pkk00008ikyoe9uor7u	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	plugin.uninstall	plugin	cmkxlvg3b0002vgkyg9dk8lxb	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-02 12:23:54.548
cml5v9k2i0002v3ky2ykc7bpa	cml5v9jyp0000v3kye6yx4zqq	\N	user.register	user	cml5v9jyp0000v3kye6yx4zqq	{"email": "pradiprimal01997@gmail.com"}	127.0.0.1	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36	success	2026-02-03 00:34:44.058
cml5vc9i00006v3kycmjmmb8j	cml5v9jyp0000v3kye6yx4zqq	\N	plugin.install	plugin	cml5vc9hl0005v3kykvvnq32u	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	success	2026-02-03 00:36:50.328
cml64aq2h0008v3kyg0cv3jlo	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-03 04:47:35.033
cml6aa7zd0001bykyzslkwi0v	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-03 07:35:09.289
cml6j6qiw0001hskysaj48or2	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-03 11:44:23.24
cml6j6z9g0003hskyszruy8s4	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-03 11:44:34.564
cml6k673b0001bckyet5u01he	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-03 12:11:57.671
cml6kuz2u0001rpkydk392m7g	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-03 12:31:13.686
cml6nyejx0001lmkyietdj1ti	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-03 13:57:52.557
cml6o79sj0000qsky5fck8jmh	\N	\N	user.login.failed	user	\N	{"email": "test@test.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-03 14:04:46.291
cml6o7h0m0001qskyyr9vodwm	\N	\N	user.login.failed	user	\N	{"email": "test@test.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-03 14:04:55.654
cml6p03r70003qskyf3gik3d9	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-03 14:27:11.491
cml7o0xnq00013vkyqn31wcg8	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-04 06:47:36.806
cml7v6gti0001l9ky2uep0i92	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-04 10:07:52.23
cml7v89j10002l9kyi6uh7pxq	\N	\N	user.login.failed	user	\N	{"email": "test@example.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-04 10:09:16.092
cml7v8g3n0003l9kyvsdmi9vu	\N	\N	user.login.failed	user	\N	{"email": "test@example.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-04 10:09:24.611
cml7v8m3x0004l9ky46i0xln8	\N	\N	user.login.failed	user	\N	{"email": "developer@example.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-04 10:09:32.397
cml7v8sup0005l9kyzj9iywg8	\N	\N	user.login.failed	user	\N	{"email": "admin@2bot.org", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-04 10:09:41.137
cml7v9eaj0007l9kypqyn2u2l	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:10:08.923
cml7v9kr80009l9ky85s6lq26	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:10:17.3
cml7v9tyz000bl9ky4wej47pe	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:10:29.243
cml7vhld1000115kytbpo5wel	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:16:31.333
cml7vhzwg000315ky9858fneb	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:16:50.176
cml7vi7nh000515kyptjt32m6	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:17:00.221
cml7vih07000715kypwxkj4uc	cmkpke0970000zvkyal5a8aep	\N	user.login.success	user	cmkpke0970000zvkyal5a8aep	\N	127.0.0.1	curl/8.5.0	success	2026-02-04 10:17:12.343
cml818zgl0001f7kyn7st0bha	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-04 12:57:47.397
cml84vxg60001r4ky78yskfia	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-04 14:39:36.726
cml8lf9g20004r4ky5zcu30k1	cml8lf9ab0002r4kya220k23m	\N	user.register	user	cml8lf9ab0002r4kya220k23m	{"email": "araujoluizhenrique1@gmail.com"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	success	2026-02-04 22:22:32.594
cml8lfkwa0006r4kynl3u8te0	cml8lf9ab0002r4kya220k23m	\N	user.login.success	user	cml8lf9ab0002r4kya220k23m	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	success	2026-02-04 22:22:47.434
cml8lfxga000ar4kyrmipsuo6	cml8lf9ab0002r4kya220k23m	\N	user.logout	user	cml8lf9ab0002r4kya220k23m	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	success	2026-02-04 22:23:03.706
cml90bh48000br4kyzl2zd07l	\N	\N	user.login.failed	user	\N	{"email": "admin@2bot.org", "reason": "Invalid credentials"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	failure	2026-02-05 05:19:30.151
cml90bm6o000dr4kyo0cp4o2j	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-02-05 05:19:36.72
cml90fv6y000fr4kyft9qihac	cmkpke0a50001zvkysu49sjk5	\N	plugin.uninstall	plugin	cml4stigw0002s6ky0gsuvghl	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-02-05 05:22:55.018
cml90fyul000hr4kyekxwfueb	cmkpke0a50001zvkysu49sjk5	\N	plugin.install	plugin	cml90fytn000gr4kyi9e6wjii	{"slug": "analytics"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-02-05 05:22:59.757
cml90ms81000jr4kyh8vgk63h	cmkpke0a50001zvkysu49sjk5	\N	gateway.create	gateway	cml90ms58000ir4ky25ux44st	{"name": "bakhtinur.komilov@gmail.com", "type": "AI"}	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-02-05 05:28:17.761
cml98vp590001qlkyzot2ddj1	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-05 09:19:10.605
cml9du7er00017hkyumlunv3m	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-05 11:37:59.043
cml9if0b30001zokyamqy6lyj	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-05 13:46:08.079
cml9k7p1f0001y4kyp010bkyg	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-05 14:36:26.115
cmlaegho7000biakyxx00rhb9	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-06 04:43:04.951
cmlaehrk0000diakyf4xtyv5x	cml0w2wim000f34kymqnw79n1	\N	user.login.success	user	cml0w2wim000f34kymqnw79n1	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-02-06 04:44:04.416
cmlaej4l5000eiakytlyp707q	cml0w2wim000f34kymqnw79n1	\N	user.logout	user	cml0w2wim000f34kymqnw79n1	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-02-06 04:45:07.961
cmlaejfnb000giaky4p28nozv	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	success	2026-02-06 04:45:22.294
cmlaj6jy8000iiaky720trimx	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-06 06:55:19.424
cmlaqhd0o0001lmkyk88vivex	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-06 10:19:40.968
cmlaqlabm0005lmkypi4i4enu	\N	\N	user.login.failed	user	\N	{"email": "admin@2bot.org", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-06 10:22:44.098
cmlaru10n0000oikyigtodi9t	\N	\N	user.login.failed	user	\N	{"email": "admin@2bot.org", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-06 10:57:31.559
cmlauom1f0000hxkyfwqxd8f7	\N	\N	user.login.failed	user	\N	{"email": "test@test.com", "reason": "Invalid credentials"}	127.0.0.1	curl/8.5.0	failure	2026-02-06 12:17:17.712
cmlaurckx00013dkylks1n0mx	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-06 12:19:25.425
cmlazacpr0000kwkyl418q4bv	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-06 14:26:10.526
cmlazaga50002kwkyudlpx8fp	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-06 14:26:15.149
cmldg0r4i0001ytkym27j9t2q	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-08 07:50:08.466
cmldg0zqh0002ytkylg5u3wni	cmkpke0a50001zvkysu49sjk5	\N	gateway.delete	gateway	cml90ms58000ir4ky25ux44st	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-08 07:50:19.624
cmldics8c0001kmky5moqvii9	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-08 08:55:29.004
cmldip97v00013tkyc72hpcgd	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-08 09:05:10.891
cmldmmbt80001j7kyk4n1aiab	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-08 10:54:52.748
cmldmp5cn0004j7kyai6zy9a1	cmkpke0a50001zvkysu49sjk5	\N	user.logout	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-08 10:57:04.343
cmldmp6p20006j7kyr3stiqwj	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-08 10:57:06.086
cmlepka220008j7kydkzhykzv	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-09 05:05:02.186
cmlepo34v000aj7kyx7cd48t9	cmkpke0a50001zvkysu49sjk5	\N	user.login.success	user	cmkpke0a50001zvkysu49sjk5	\N	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	success	2026-02-09 05:07:59.839
\.


--
-- Data for Name: credit_rates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credit_rates (id, model, credits_per_input_token, credits_per_output_token, credits_per_image, credits_per_minute, your_cost_per_1k_input, your_cost_per_1k_output, your_cost_per_unit, is_active, created_at, updated_at, capability, credits_per_char) FROM stdin;
\.


--
-- Data for Name: credit_transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credit_transactions (id, type, amount, balance_after, description, metadata, created_at, credit_wallet_id) FROM stdin;
cmkz09ycw0001qdkynvxcg6ic	grant	5000	5000	Initial plan credits	\N	2026-01-29 05:20:37.424	cmkz09ybt0000qdky9z43wwfs
cmkz0g3df0001j5kygyz85vr2	grant	100	100	Initial plan credits	\N	2026-01-29 05:25:23.859	cmkz0g3cy0000j5kysd50idwb
cml0i5r8a0000d4kyg9ob7u2o	usage	0	99	2Bot AI: chat (claude-3-haiku-20240307)	{"model": "claude-3-haiku-20240307", "action": "chat", "category": "ai_usage", "gatewayId": "2bot-ai", "inputTokens": 18, "outputTokens": 6}	2026-01-30 06:29:00.826	cml0hy01h00007zky7ozf6xhy
cml0if8us0000p3kymyg2ig0e	usage	-1	98	2Bot AI: chat (claude-3-haiku-20240307)	{"model": "claude-3-haiku-20240307", "action": "chat", "category": "ai_usage", "inputTokens": 24, "outputTokens": 12}	2026-01-30 06:36:23.572	cml0hy01h00007zky7ozf6xhy
cml0ik4m80000v0kyyyfo77zf	usage	-1	96	2Bot AI: chat (claude-3-haiku-20240307)	{"model": "claude-3-haiku-20240307", "action": "chat", "category": "ai_usage", "inputTokens": 24, "outputTokens": 12}	2026-01-30 06:40:11.36	cml0hy01h00007zky7ozf6xhy
cml0im5ts0000e1ky8lrzme57	usage	-1	95	2Bot AI: chat (claude-3-haiku-20240307)	{"model": "claude-3-haiku-20240307", "action": "chat", "category": "ai_usage", "inputTokens": 24, "outputTokens": 12}	2026-01-30 06:41:46.24	cml0hy01h00007zky7ozf6xhy
cml0iwuet0000nnkyvw76sc95	usage	-5	494	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "userId": "cmkpke0a50001zvkysu49sjk5", "category": "ai_usage", "inputTokens": 8, "outputTokens": 97}	2026-01-30 06:50:04.66	cml0g4ftd0000d6kyjo45x0rf
cml0ixbnq0002nnkyqextbec1	usage	-3	490	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "userId": "cmkpke0a50001zvkysu49sjk5", "category": "ai_usage", "inputTokens": 112, "outputTokens": 15}	2026-01-30 06:50:27.014	cml0g4ftd0000d6kyjo45x0rf
cml0j2w0b0004nnkyn2mdev0j	usage	-3	4996	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 14, "outputTokens": 58}	2026-01-30 06:54:46.667	cmkz09ybt0000qdky9z43wwfs
cml0jn7md0000fakye6ngfwid	usage	-1	94	2Bot AI: chat (claude-3-haiku-20240307)	{"model": "claude-3-haiku-20240307", "action": "chat", "category": "ai_usage", "inputTokens": 24, "outputTokens": 12}	2026-01-30 07:10:34.836	cml0hy01h00007zky7ozf6xhy
cml0jumj400003dkyoc0hrxtl	usage	-1	4994	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 9, "outputTokens": 21}	2026-01-30 07:16:20.752	cmkz09ybt0000qdky9z43wwfs
cml0jv3ec000054ky7vlpt91u	usage	-1	93	2Bot AI: chat (claude-3-haiku-20240307)	{"model": "claude-3-haiku-20240307", "action": "chat", "category": "ai_usage", "inputTokens": 24, "outputTokens": 12}	2026-01-30 07:16:42.612	cml0hy01h00007zky7ozf6xhy
cml0k4sjx00015akyzao12v7t	usage	-2	4992	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 13, "outputTokens": 42}	2026-01-30 07:24:15.117	cmkz09ybt0000qdky9z43wwfs
cml0k56wy00035aky2uqtteu2	usage	-6	4985	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 66, "outputTokens": 87}	2026-01-30 07:24:33.73	cmkz09ybt0000qdky9z43wwfs
cml0kpag60000lvky3smol4kh	usage	-1	92	2Bot AI: chat (claude-3-haiku-20240307)	{"model": "claude-3-haiku-20240307", "action": "chat", "category": "ai_usage", "inputTokens": 24, "outputTokens": 12}	2026-01-30 07:40:11.43	cml0hy01h00007zky7ozf6xhy
cml0mx1bq0000qjkyeiltwqxe	usage	-4	4981	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 11, "outputTokens": 63}	2026-01-30 08:42:12.086	cmkz09ybt0000qdky9z43wwfs
cml0myuq60002qjky7csdd29n	usage	-5	4975	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 68, "outputTokens": 69}	2026-01-30 08:43:36.846	cmkz09ybt0000qdky9z43wwfs
cml0n0ebl0000vmkyn6zdnakr	usage	-1	90	2Bot AI: chat (claude-3-haiku-20240307)	{"model": "claude-3-haiku-20240307", "action": "chat", "category": "ai_usage", "inputTokens": 24, "outputTokens": 12}	2026-01-30 08:44:48.897	cml0hy01h00007zky7ozf6xhy
cml0p0xmb0000lykyxx9sgnbi	usage	-4	4971	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 64, "outputTokens": 47}	2026-01-30 09:41:13.138	cmkz09ybt0000qdky9z43wwfs
cml0p134r0002lykyt8ikdabr	usage	-4	4967	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 115, "outputTokens": 40}	2026-01-30 09:41:20.283	cmkz09ybt0000qdky9z43wwfs
cml0pd4nx0004lyky1pldha1n	usage	-5	484	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "userId": "cmkpke0a50001zvkysu49sjk5", "category": "ai_usage", "inputTokens": 159, "outputTokens": 46}	2026-01-30 09:50:42.141	cml0g4ftd0000d6kyjo45x0rf
cml0pdd8y0006lyky85i5swy0	usage	-7	477	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "userId": "cmkpke0a50001zvkysu49sjk5", "category": "ai_usage", "inputTokens": 209, "outputTokens": 58}	2026-01-30 09:50:53.266	cml0g4ftd0000d6kyjo45x0rf
cml0pgymz0008lyky8vkg8kfu	usage	-4	4962	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 64, "outputTokens": 50}	2026-01-30 09:53:40.955	cmkz09ybt0000qdky9z43wwfs
cml0pqeok0000aokypu881ehp	usage	-8	4954	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 271, "outputTokens": 46}	2026-01-30 10:01:01.652	cmkz09ybt0000qdky9z43wwfs
cml0pxd960000r3kyex2ne21u	usage	-4	472	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "userId": "cmkpke0a50001zvkysu49sjk5", "category": "ai_usage", "inputTokens": 64, "outputTokens": 53}	2026-01-30 10:06:26.393	cml0g4ftd0000d6kyjo45x0rf
cml0py60u0002r3ky3w3en7g2	usage	-4	468	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "userId": "cmkpke0a50001zvkysu49sjk5", "category": "ai_usage", "inputTokens": 64, "outputTokens": 49}	2026-01-30 10:07:03.678	cml0g4ftd0000d6kyjo45x0rf
cml0thh6l0002m2kyecm3j1hu	usage	-4	4950	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 64, "outputTokens": 52}	2026-01-30 11:46:03.453	cmkz09ybt0000qdky9z43wwfs
cml0tty7s000034kyt9qo1n4m	usage	-6	4943	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 125, "outputTokens": 74}	2026-01-30 11:55:45.4	cmkz09ybt0000qdky9z43wwfs
cml0twhn9000234kytv4kk3qm	usage	-9	4934	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 215, "outputTokens": 80}	2026-01-30 11:57:43.893	cmkz09ybt0000qdky9z43wwfs
cml0txh51000434kyirrlw2v4	usage	-5	462	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "userId": "cmkpke0a50001zvkysu49sjk5", "category": "ai_usage", "inputTokens": 123, "outputTokens": 56}	2026-01-30 11:58:29.893	cml0g4ftd0000d6kyjo45x0rf
cml0vxho4000834kydsco600t	usage	-4	4930	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 64, "outputTokens": 49}	2026-01-30 12:54:29.812	cmkz09ybt0000qdky9z43wwfs
cml0vxvuw000a34ky860bbehy	usage	-17	4912	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 121, "outputTokens": 252}	2026-01-30 12:54:48.2	cmkz09ybt0000qdky9z43wwfs
cml0w2xxb000l34kygkpwdvrm	grant	100	100	Initial plan credits	{"plan": "FREE", "walletType": "personal"}	2026-01-30 12:58:44.159	cml0w2xx3000k34kyvcdm2avw
cml0w3jdw000m34kyk3n5nw32	usage	-6	93	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 120, "outputTokens": 68}	2026-01-30 12:59:11.972	cml0w2xx3000k34kyvcdm2avw
cml0wbfry000o34kylyt5tr18	usage	-5	457	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "userId": "cml0w2wim000f34kymqnw79n1", "category": "ai_usage", "inputTokens": 69, "outputTokens": 64}	2026-01-30 13:05:20.542	cml0g4ftd0000d6kyjo45x0rf
cml3reo5a0002gvkybww3x3f6	usage	-4	4908	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 64, "outputTokens": 54}	2026-02-01 13:11:11.806	cmkz09ybt0000qdky9z43wwfs
cml58vwdr0000vekyes9rnilp	usage	-4	4903	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 64, "outputTokens": 55}	2026-02-02 14:08:15.278	cmkz09ybt0000qdky9z43wwfs
cml58w1yh0002vekyfb1c4v9t	usage	-4	4899	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 65, "outputTokens": 45}	2026-02-02 14:08:22.505	cmkz09ybt0000qdky9z43wwfs
cml5v9m210004v3kydns9x1tw	grant	100	100	Initial plan credits	{"plan": "FREE", "walletType": "personal"}	2026-02-03 00:34:46.633	cml5v9m1s0003v3kyribglluv
cml6j7qw40004hskyqlsn56dz	usage	0	4899	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 72, "outputTokens": 60}	2026-02-03 11:45:10.372	cmkz09ybt0000qdky9z43wwfs
cml6j8b480006hskym879wl05	usage	0	4899	2Bot AI: chat (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "action": "chat", "category": "ai_usage", "inputTokens": 151, "outputTokens": 202}	2026-02-03 11:45:36.584	cmkz09ybt0000qdky9z43wwfs
cml6p4c0400001rky6nkro1ou	usage	-1	4898	2Bot AI: text-generation (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "category": "ai_usage", "capability": "text-generation", "inputTokens": 64, "outputTokens": 56}	2026-02-03 14:30:28.804	cmkz09ybt0000qdky9z43wwfs
cml6p4vl600021rky2ajso823	usage	-1	4897	2Bot AI: text-generation (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "category": "ai_usage", "capability": "text-generation", "inputTokens": 133, "outputTokens": 141}	2026-02-03 14:30:54.186	cmkz09ybt0000qdky9z43wwfs
cml6pbjcj00041rkyiw5w0vgo	usage	-1	89	2Bot AI: text-generation (claude-3-5-haiku-20241022)	{"model": "claude-3-5-haiku-20241022", "category": "ai_usage", "capability": "text-generation", "inputTokens": 14, "outputTokens": 10}	2026-02-03 14:36:04.915	cml0hy01h00007zky7ozf6xhy
cml8lfo4v0009r4kym4tyngw5	grant	100	100	Initial plan credits	{"plan": "FREE", "walletType": "personal"}	2026-02-04 22:22:51.631	cml8lfo3x0007r4kyaeqha44i
cmldgm17j0000e8ky2ya0uzvf	usage	-3	4983	2Bot AI: image-generation (black-forest-labs/FLUX.1-schnell)	{"model": "black-forest-labs/FLUX.1-schnell", "category": "ai_usage", "capability": "image-generation", "imageCount": 1, "pendingAfter": 0.3450660000000001, "pendingBefore": 0.345066, "fractionalCredits": 3}	2026-02-08 08:06:41.31	cmkz09ybt0000qdky9z43wwfs
cmldgnxvm0002e8kyopwzspgv	usage	-40	4943	2Bot AI: image-generation (black-forest-labs/FLUX.2-pro)	{"model": "black-forest-labs/FLUX.2-pro", "category": "ai_usage", "capability": "image-generation", "imageCount": 1, "pendingAfter": 0.3450660000000028, "pendingBefore": 0.3450660000000001, "fractionalCredits": 40}	2026-02-08 08:08:10.306	cmkz09ybt0000qdky9z43wwfs
cmldiuh1n0000lfky3ooe6r5j	usage	-40	4903	2Bot AI: image-generation (black-forest-labs/FLUX.2-pro)	{"model": "black-forest-labs/FLUX.2-pro", "category": "ai_usage", "capability": "image-generation", "imageCount": 1, "pendingAfter": 0.3450660000000028, "pendingBefore": 0.3450660000000028, "fractionalCredits": 40}	2026-02-08 09:09:14.314	cmkz09ybt0000qdky9z43wwfs
cmldixv5w0002lfky5ht5eu0u	usage	-3	4900	2Bot AI: image-generation (black-forest-labs/FLUX.1-schnell)	{"model": "black-forest-labs/FLUX.1-schnell", "category": "ai_usage", "capability": "image-generation", "imageCount": 1, "pendingAfter": 0.3450660000000028, "pendingBefore": 0.3450660000000028, "fractionalCredits": 3}	2026-02-08 09:11:52.58	cmkz09ybt0000qdky9z43wwfs
\.


--
-- Data for Name: credit_wallets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.credit_wallets (id, user_id, organization_id, balance, lifetime, monthly_allocation, monthly_used, allocation_reset_at, settings, created_at, updated_at, pending_credits) FROM stdin;
cml0g4ftd0000d6kyjo45x0rf	\N	cmkqs4ubc0003lgkym2p0dzeq	457	500	500	0	\N	{}	2026-01-30 05:32:00.145	2026-02-05 17:02:04.801	0.035616
cmkz09ybt0000qdky9z43wwfs	cmkpke0a50001zvkysu49sjk5	\N	4900	5000	5000	100	\N	{}	2026-01-29 05:20:37.384	2026-02-09 06:19:13.397	0.5331780000000028
cmkz0g3cy0000j5kysd50idwb	cmkqvqf5n0004ohky3j3fjg36	\N	100	100	100	0	\N	{}	2026-01-29 05:25:23.842	2026-01-29 05:25:23.842	0
cml03vda10003fkky37kuwmhz	cml03v61p0000fkkydf95z4cd	\N	100	100	100	0	\N	{}	2026-01-29 23:49:01.561	2026-01-29 23:49:01.561	0
cml0cw7w70009fkkyhgiy5t0n	cml0cw6fj0006fkkylo8egj97	\N	100	100	100	0	\N	{}	2026-01-30 04:01:37.783	2026-01-30 04:01:37.783	0
cml5v9m1s0003v3kyribglluv	cml5v9jyp0000v3kye6yx4zqq	\N	100	100	100	0	\N	{}	2026-02-03 00:34:46.624	2026-02-03 00:34:46.624	0
cml0w2xx3000k34kyvcdm2avw	cml0w2wim000f34kymqnw79n1	\N	100	100	100	0	\N	{}	2026-01-30 12:58:44.151	2026-01-30 12:59:11.963	0
cml0hy01h00007zky7ozf6xhy	cmkpke0970000zvkyal5a8aep	\N	99	100	100	1	\N	{}	2026-01-30 06:22:58.996	2026-02-03 14:36:04.9	0
cml8lfo3x0007r4kyaeqha44i	cml8lf9ab0002r4kya220k23m	\N	100	100	100	0	\N	{}	2026-02-04 22:22:51.597	2026-02-04 22:22:51.597	0
\.


--
-- Data for Name: department_members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.department_members (id, user_id, department_id, membership_id, role, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.departments (id, organization_id, name, description, is_active, created_at, updated_at) FROM stdin;
cmkwi45nm0000ltkyas3190r0	cmkqs4ubc0003lgkym2p0dzeq	Fleet	\N	t	2026-01-27 11:16:41.501	2026-01-27 11:16:41.501
\.


--
-- Data for Name: dept_allocations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.dept_allocations (id, department_id, max_gateways, max_workflows, max_plugins, credit_budget, max_ram_mb, max_cpu_cores, max_storage_mb, alloc_mode, created_at, updated_at, set_by_id, credit_used, credit_reset_at) FROM stdin;
cmkxrdokd0002i8kyhsxxqwru	cmkwi45nm0000ltkyas3190r0	\N	1	1	\N	\N	\N	\N	SOFT_CAP	2026-01-28 08:23:48.632	2026-01-28 08:42:14.624	cmkpke0a50001zvkysu49sjk5	0	\N
\.


--
-- Data for Name: gateways; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.gateways (id, user_id, organization_id, name, type, status, credentials_enc, config, last_connected_at, last_error_at, last_error, created_at, updated_at) FROM stdin;
cmkuwsanj0004cdkyrggcp1ic	cmkpke0a50001zvkysu49sjk5	\N	@analytic_2bot	TELEGRAM_BOT	CONNECTED	v1:qHqbAe5TPsE7IYOtheAtA9rkL0uGMcO0MOyoNNAJqSFLjuUPQt7XodM8v75damhaVwxnjjwtXhIJdBTNjVXRFJpmd7cnCyDeVoZ7u67H0VeL9/48ZML0d2DCgMXg	{}	2026-02-09 07:03:52.664	\N	\N	2026-01-26 08:31:49.999	2026-02-09 07:03:52.682
cmkuwobqb0000cdkyozgcj9xz	cmkpke0a50001zvkysu49sjk5	\N	@abc_control_copyright_bot	TELEGRAM_BOT	CONNECTED	v1:nIfVMeimpkZz3HtF8IXXhfNBvhI72bm3wFIWa7eMZnA5PjTrVDJ8lFCMtLAPA38MiV4nIZQlBAezOb9QCIZqaJct5FMSk1phDbqNqWNijWqxhUaYI/K1SFmNCfPE	{}	2026-02-09 07:03:52.722	\N	\N	2026-01-26 08:28:44.77	2026-02-09 07:03:52.724
cmkxv8lbw0000ppkypeldf23d	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	admin@2bot.org	TELEGRAM_BOT	CONNECTED	v1:mN2tbSRQQBrdpIjlXRnuP+wnOaMb0vMoAUt9a735wt7Ghbrhs7nVH5jTb+9xtO1p3Dc3T9j5xty9pfa70CCdtVyEQ0jCs9hXN0EjukCKkfMkVanOu3BS6w+D6s3X	{}	2026-02-09 07:03:52.686	\N	\N	2026-01-28 10:11:49.628	2026-02-09 07:03:52.688
cmkuwrwxl0002cdkyx9egxvjp	cmkpke0a50001zvkysu49sjk5	\N	@main_analyticbot	TELEGRAM_BOT	CONNECTED	v1:aAPyFY49dvkTrYuGa9OOP0ZC4+u9yxkK7AcAWc47YDn2B2DtPjwTGqa/Ot/JiejHa7t8dYz4V9fGM8Yakulb859ciEi11XPe3sRhhWj6O2S7YJa/coxar53rDzhu	{}	2026-02-09 07:03:52.697	\N	\N	2026-01-26 08:31:32.217	2026-02-09 07:03:52.699
\.


--
-- Data for Name: member_allocations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_allocations (id, user_id, department_id, max_gateways, max_workflows, credit_budget, max_ram_mb, max_cpu_cores, max_storage_mb, alloc_mode, created_at, updated_at, set_by_id, credit_used, credit_reset_at) FROM stdin;
\.


--
-- Data for Name: memberships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.memberships (id, user_id, organization_id, role, status, invited_by, invited_at, joined_at, created_at, updated_at) FROM stdin;
cmkqs4ubl0004lgky3tnqhdm5	cmkpke0a50001zvkysu49sjk5	cmkqs4ubc0003lgkym2p0dzeq	ORG_OWNER	ACTIVE	\N	2026-01-23 11:10:32.565	2026-01-23 11:10:32.554	2026-01-23 11:10:32.565	2026-01-23 11:10:32.565
cmktrda3i00062lkyrk6enm2k	cmkqvqf5n0004ohky3j3fjg36	cmktrda3c00052lky0ciq1syk	ORG_OWNER	ACTIVE	\N	2026-01-25 13:12:25.172	2026-01-25 13:12:25.13	2026-01-25 13:12:25.172	2026-01-25 13:12:25.172
cmkqvqfla0007ohkygckd2tkl	cmkqvqf5n0004ohky3j3fjg36	cmkqs4ubc0003lgkym2p0dzeq	ORG_MEMBER	ACTIVE	cmkpke0a50001zvkysu49sjk5	2026-01-23 12:46:03.413	2026-01-23 12:51:18.755	2026-01-23 12:51:18.766	2026-02-02 06:43:37.619
\.


--
-- Data for Name: org_invites; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.org_invites (id, organization_id, email, role, token, invited_by, expires_at, used_at, created_at, last_resent_at, resend_count, declined_at, status) FROM stdin;
cmkqvjo9h0002ohkymzyeq2lg	cmkqs4ubc0003lgkym2p0dzeq	info@abclegacyllc.com	ORG_MEMBER	dc9ceef45eb8ac0a43d06a7b6213d0bc9784f18a6abc7b3c1417a5a30b74bfef	cmkpke0a50001zvkysu49sjk5	2026-01-30 12:46:03.407	2026-01-23 12:51:18.747	2026-01-23 12:46:03.413	\N	0	\N	ACCEPTED
cmkqvvrj9000fohkyi73efoby	cmkqs4ubc0003lgkym2p0dzeq	hojiakbarbakhronoff@gmail.com	ORG_MEMBER	90652bb56555989fc7ad99305d1231bf34d24945bc956b10b9f6c311f88a4ac6	cmkpke0a50001zvkysu49sjk5	2026-01-30 12:55:27.521	2026-01-23 12:58:30.793	2026-01-23 12:55:27.525	\N	0	\N	ACCEPTED
cml0w1sem000d34kyb07vz4uy	cmkqs4ubc0003lgkym2p0dzeq	bakhtinur.komilov@gmail.com	ORG_ADMIN	c890dca8bc2db8c9d1836248f8054141591f28d2b9af880dc2985281066b9262	cmkpke0a50001zvkysu49sjk5	2026-02-06 12:57:50.343	2026-01-30 12:58:42.525	2026-01-30 12:57:50.349	\N	0	\N	ACCEPTED
\.


--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.organizations (id, name, slug, org_plan, stripe_customer_id, max_seats, used_seats, pool_ram_mb, pool_cpu_cores, pool_storage_mb, "databaseType", database_url, database_region, is_active, created_at, updated_at) FROM stdin;
cmkqs4ubc0003lgkym2p0dzeq	ABC Developers	abc-developers	ORG_FREE	cus_Tr97IgMRg6zGMq	5	0	4096	2	20480	SHARED	\N	\N	t	2026-01-23 11:10:32.565	2026-01-25 10:45:40.945
cmktrda3c00052lky0ciq1syk	ABC corp	abc-corp	ORG_FREE	\N	5	0	4096	2	20480	SHARED	\N	\N	t	2026-01-25 13:12:25.172	2026-01-25 13:12:25.172
\.


--
-- Data for Name: password_reset_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.password_reset_tokens (id, user_id, token, expires_at, used_at, created_at) FROM stdin;
\.


--
-- Data for Name: plugins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.plugins (id, slug, name, description, version, "requiredGateways", "configSchema", icon, category, tags, "isBuiltin", input_schema, output_schema, is_active, created_at, updated_at) FROM stdin;
cmkpke0bd0002zvky9dm3bg8t	analytics	Channel Analytics	Track message and user statistics for your Telegram bots. View total messages, unique users, daily trends, and top active users/chats.	1.0.0	{TELEGRAM_BOT}	{"type": "object", "title": "Analytics Configuration", "properties": {"trackChats": {"type": "boolean", "title": "Track Chats", "default": true, "description": "Track individual chat/channel statistics"}, "trackUsers": {"type": "boolean", "title": "Track Users", "default": true, "description": "Track individual user statistics"}, "retentionDays": {"type": "number", "title": "Data Retention (days)", "default": 30, "maximum": 365, "minimum": 7, "description": "How long to keep detailed statistics"}, "topChatsLimit": {"type": "number", "title": "Top Chats Limit", "default": 10, "maximum": 100, "minimum": 5, "description": "Number of top chats to track"}, "topUsersLimit": {"type": "number", "title": "Top Users Limit", "default": 10, "maximum": 100, "minimum": 5, "description": "Number of top users to track"}, "enableHourlyStats": {"type": "boolean", "title": "Hourly Statistics", "default": true, "description": "Enable hourly granularity (uses more storage)"}}}	chart-bar	analytics	{analytics,statistics,telegram,tracking}	t	{"type": "object", "title": "Analytics Input", "properties": {"days": {"type": "number", "default": 7, "maximum": 90, "minimum": 1, "description": "Number of days for historical data"}, "limit": {"type": "number", "default": 10, "maximum": 100, "minimum": 1, "description": "Number of items to return for top lists"}, "action": {"enum": ["getSummary", "getDailyStats", "getTopUsers", "getTopChats"], "type": "string", "description": "Action to perform"}}, "description": "Input when used as a workflow step"}	{"type": "object", "title": "Analytics Output", "properties": {"today": {"type": "object", "properties": {"messages": {"type": "number"}, "uniqueUsers": {"type": "number"}}}, "totals": {"type": "object", "properties": {"uniqueChats": {"type": "number"}, "uniqueUsers": {"type": "number"}, "messagesSent": {"type": "number"}, "messagesReceived": {"type": "number"}}}}, "description": "Statistics output from the analytics plugin"}	t	2026-01-22 14:45:57.142	2026-01-22 14:45:57.142
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (id, user_id, token, expires_at, user_agent, ip_address, created_at) FROM stdin;
cmkqs46ao0000lgky7zf32cnd	cmkpke0a50001zvkysu49sjk5	346004226d47e225dba2a1c2c1e29a9aed7e1df5f4a9127c346717c1bef0a65d	2026-01-30 11:10:01.429	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-23 11:10:01.437
cmkqs9tgg000141ky8nl0puw9	cmkpke0970000zvkyal5a8aep	26b237a0041427fd66dc74e4b18ac9ec2c7d6214314aca4c4c3c53dfec82e81d	2026-01-30 11:14:24.711	curl/8.5.0	127.0.0.1	2026-01-23 11:14:24.736
cmkqsa5lr000341kyamumbpcf	cmkpke0a50001zvkysu49sjk5	242f3d7fc3ecfa2f4ad7ba13499925d3fa6cd4696550b8c1a3317802ddc2682d	2026-01-30 11:14:40.454	curl/8.5.0	127.0.0.1	2026-01-23 11:14:40.479
cmkqsbn9g00021bkyz6au7ka6	cmkpke0a50001zvkysu49sjk5	ee58ca45f5abc90786bdf2991f59121163929d7f03e7ee12175d966b323aa8d1	2026-01-30 11:15:50.014	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-23 11:15:50.02
cmkqsc0ig00041bky8v8jl665	cmkpke0a50001zvkysu49sjk5	d4c242f3b459337d54482dac44a1d9a419be124bbcbb3e33b81b6152f6aba3e5	2026-01-30 11:16:07.186	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-23 11:16:07.192
cmkqsv8cp0000abkyyqydx3x5	cmkpke0a50001zvkysu49sjk5	33df51e1128c1d4ea6603b389eb9f15b0f750229151cdef4afd95b1f72cb14c4	2026-01-30 11:31:03.806	curl/8.5.0	127.0.0.1	2026-01-23 11:31:03.816
cmkqsx16300003zkyzxn05vyj	cmkpke0a50001zvkysu49sjk5	4dcf9400b38d3fe213db63c31ea30b69c8afbd13fbf53a1a528caccb8874979b	2026-01-30 11:32:27.786	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-23 11:32:27.819
cmkqsxzer0000fakybxyzi8od	cmkpke0a50001zvkysu49sjk5	7cf9db6a7d7fa2c2af09b6dee203fcd985079add7240d186a91cb8739b09377a	2026-01-30 11:33:12.161	curl/8.5.0	127.0.0.1	2026-01-23 11:33:12.194
cmkqt67l70000ubkysold1yb1	cmkpke0a50001zvkysu49sjk5	8348a7c9eafd7a8167a425b6647dda9b0c47d98d3564160b79aa921391c96194	2026-01-30 11:39:36.031	curl/8.5.0	127.0.0.1	2026-01-23 11:39:36.043
cmkqt7tl60002ubkyiomh8cw7	cmkpke0a50001zvkysu49sjk5	d46bd8ebe3c4ce6c4ddd874bd5d9a6777ab055dd3b28dcc00b8f7fb8cc0682ec	2026-01-30 11:40:51.197	curl/8.5.0	127.0.0.1	2026-01-23 11:40:51.209
cmkqt8qse0004ubkyfap8vxw2	cmkpke0a50001zvkysu49sjk5	99de0c2f61c92a271eddc8e1c555570f0e5dc33e0cb49a839532edc92ad7215a	2026-01-30 11:41:34.235	curl/8.5.0	127.0.0.1	2026-01-23 11:41:34.238
cmkqt91920006ubkygj2bw4al	cmkpke0a50001zvkysu49sjk5	ab1080f11f26c1dbd7b7e2ab83b4b89c1b99f63a9f28cc0ad81c66ed4012897b	2026-01-30 11:41:47.794	curl/8.5.0	127.0.0.1	2026-01-23 11:41:47.798
cmkqt99w00008ubky1ae47ft7	cmkpke0a50001zvkysu49sjk5	3102650e080f2a11b7022b385d2e77589ff12f6f7a9184c60733622c03a2958b	2026-01-30 11:41:58.988	curl/8.5.0	127.0.0.1	2026-01-23 11:41:58.992
cmkqt9p3s000aubkyh724tuqh	cmkpke0a50001zvkysu49sjk5	33cd56bfd0bfa2d86a145577b98f54d9c817bac57e89bb89ff6d81303d9f8fff	2026-01-30 11:42:18.692	curl/8.5.0	127.0.0.1	2026-01-23 11:42:18.712
cmkqtfm0a0000pikyxk888vaq	cmkpke0a50001zvkysu49sjk5	f1fca49b16e4f5650cb4d7d1f33ad1982d82061f1f693b9ca5ee3d152002e219	2026-01-30 11:46:54.623	curl/8.5.0	127.0.0.1	2026-01-23 11:46:54.633
cmkqu2bob0000s5kyqi36rcp0	cmkpke0a50001zvkysu49sjk5	b49e5606b29447cb77b749809ff65bbea9cb1786f9b9f185cdc4848bd510b0be	2026-01-30 12:04:34.316	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-23 12:04:34.331
cmkqucr740008s5ky5uaxzfjh	cmkpke0a50001zvkysu49sjk5	d1abc43e1cc46fb95ea9bfb00a8812295d55451c4017f348b1a27ca15daab174	2026-01-30 12:12:40.997	curl/8.5.0	127.0.0.1	2026-01-23 12:12:41.008
cmkqudhmy000as5kyvwecn5dt	cmkpke0a50001zvkysu49sjk5	2df214ed83fa2385c38c185b13cae173926d14e4182658e0d1104f8f7bd8e449	2026-01-30 12:13:15.252	curl/8.5.0	127.0.0.1	2026-01-23 12:13:15.274
cmkqv91zx0001frky1lhfu886	cmkpke0a50001zvkysu49sjk5	6c358e2b0982c2eee0f98ff26db9a45921f284d3dd003cf7623d3b9e9109e693	2026-01-30 12:37:47.981	curl/8.5.0	127.0.0.1	2026-01-23 12:37:47.997
cmkqv9m8m0005frkyh03gb63s	cmkpke0970000zvkyal5a8aep	d821e794958fca64c3dbc17feccc12162dfa2bd3d7e6c0f56fe8145d3fef1d3f	2026-01-30 12:38:14.226	curl/8.5.0	127.0.0.1	2026-01-23 12:38:14.23
cmkqvqf710005ohkyh2fgr7hg	cmkqvqf5n0004ohky3j3fjg36	e9d2edeb1e48e9c2cdb671927fdde215fcfe4c79e388e9eca4c66b585b4c9f9b	2026-01-30 12:51:18.228	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-23 12:51:18.252
cmkqvqrk60009ohky4g5ofu4f	cmkqvqf5n0004ohky3j3fjg36	cc687a8a8b0f29586abb1edba87cc9df1085c9c5532992689c987ad914eb7edf	2026-01-30 12:51:34.272	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-23 12:51:34.278
cmkqvzorb000iohkytwvepad3	cmkqvzoqm000hohkyccs6hjyq	72ae70cd863a982918b2fcc2a40323b8c08f1e176bdb918d8353d8daf5883d7d	2026-01-30 12:58:30.534	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1	127.0.0.1	2026-01-23 12:58:30.551
cmkqw09a9000mohkykj2re6c8	cmkqvzoqm000hohkyccs6hjyq	3f1b7deacd7ee5dc8ceb062ac682bbc3b245eac0b1ca12c0102447984f4f0208	2026-01-30 12:58:57.143	Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Mobile/15E148 Safari/604.1	127.0.0.1	2026-01-23 12:58:57.153
cmkqx8snw0000ehky5dnpti1l	cmkpke0a50001zvkysu49sjk5	d0ae77ed51cb1aa4832f5c9940748e9b3eaa5c622e5e9dc36c76d79a5e30c799	2026-01-30 13:33:35.122	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-23 13:33:35.132
cmktbkzp60001mokychxqwj7z	cmkpke0a50001zvkysu49sjk5	1965ca4e244f15f0166243edb1bc2abb15db35b6e6017b8834a6c287ea48c773	2026-02-01 05:50:30.884	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-25 05:50:31.098
cmktinzsz00006akyaqcdsam9	cmkpke0a50001zvkysu49sjk5	792acd8a5041fc9fdae4464a12417ecf0830643ec1250999f7aa9cfc912d4b0c	2026-02-01 09:08:48.491	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-25 09:08:48.515
cmktr9rdr00032lkyjklq0w3x	cmkqvqf5n0004ohky3j3fjg36	7b605e4af6e3b1a9f0ca6c9ab8e73bfa2b794e61b49e7a653411c833a485217a	2026-02-01 13:09:40.94	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-25 13:09:40.958
cmkv3c7g90000vnky88qtweni	cmkpke0a50001zvkysu49sjk5	3fa3bfb24b3b0a88ee527bbec1a75d68c72f4ba1a152d96c97824fffbbc400cb	2026-02-02 11:35:16.574	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-26 11:35:16.665
cmkv3ckcc0002vnky2w7a3xwx	cmkpke0a50001zvkysu49sjk5	5b59692a76009e160cb37de948736d4f2b2526b600cdd82cad3243362fe815d3	2026-02-02 11:35:33.364	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-26 11:35:33.372
cmkv3h88r0004vnkyet1y6wcp	cmkpke0a50001zvkysu49sjk5	45ef1230a5122cb38ea3ef85430887c9abcbd3f889d8542dbebe60015c5d8766	2026-02-02 11:39:10.956	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-26 11:39:10.971
cmkv5epy70002zykyscd8ylc8	cmkpke0a50001zvkysu49sjk5	3a878e7ca5543292332c4b776254d220091e93d7b3cc25c9f4e5b69df7335294	2026-02-02 12:33:13.141	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-26 12:33:13.18
cmkvb7enq0000ifkyreka9h24	cmkpke0a50001zvkysu49sjk5	020be2de779c68468e0a2172fed3b7316688c0feae7c3b2bbcec273f00d78e7e	2026-02-02 15:15:29.639	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-26 15:15:29.653
cmkvb7uja0002ifky55kz6s5q	cmkpke0a50001zvkysu49sjk5	8a3eb3cd2d22a8abc543ba187cc353be6fb16d4453ff3ace5fa29942a63c4b34	2026-02-02 15:15:50.225	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-26 15:15:50.23
cmkvfi5xh0007ifkyoree8taj	cmkpke0a50001zvkysu49sjk5	7f3fdd73a13976bf8941e86e648a01fb95a9b053d7574b1c8345c061cb06749e	2026-02-02 17:15:50.014	Mozilla/5.0 (iPhone; CPU iPhone OS 26_2_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/144.0.7559.85 Mobile/15E148 Safari/604.1	127.0.0.1	2026-01-26 17:15:50.021
cmkw507zh0000vakyjaksdhr9	cmkpke0a50001zvkysu49sjk5	2bebab48f5021eccc21f8c47c571fe47723ddf8673d9228d26f3d0003d764b71	2026-02-03 05:09:42.882	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 05:09:42.893
cmkw50sj30002vakyq6nz12fi	cmkpke0a50001zvkysu49sjk5	3417a6d7dfa0a1928a5930452ce4b5ede17615191f513ad1d20c783fd1e227c9	2026-02-03 05:10:09.512	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 05:10:09.519
cmkw664lp000084ky17jjmbc1	cmkpke0a50001zvkysu49sjk5	9af27a4bfd029a2288cd6304b401c3dcca8ef0f57c774ed76a3d6e9a68e1848b	2026-02-03 05:42:18.049	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 05:42:18.061
cmkw85iaj0003p7ky7kvuqvnt	cmkpke0a50001zvkysu49sjk5	ec9a472298d89590fa5951343fba2106fce8f11bbfc3688b520bc3dd6366880f	2026-02-03 06:37:48.371	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 06:37:48.379
cmkwakk690000bykywp9j0u4x	cmkpke0a50001zvkysu49sjk5	172f84b17888d9b1cb53b4b860f6b295f2557807a1ecb60d3d78d03468a6f4f4	2026-02-03 07:45:29.865	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 07:45:29.887
cmkwcj0gm0000r3kykvabmd8i	cmkpke0a50001zvkysu49sjk5	6085ada3c14dce6d4f60c8ba9f23991a85a88ce176109de5a005a9b53add86fe	2026-02-03 08:40:16.897	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 08:40:16.918
cmkwco6vt0002r3kysp8w4lbw	cmkpke0a50001zvkysu49sjk5	f23b84930d8d62bab3e46f9c76a0a689f76a875926349dc836ca198d6e86bc88	2026-02-03 08:44:18.499	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 08:44:18.521
cmkwd9x3v00034wkyt6bidnit	cmkpke0a50001zvkysu49sjk5	5dfb645366a72dc4a8f7d9da1ec5f3540ca6b44db818e71fc9817848016b3f8b	2026-02-03 09:01:12.268	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 09:01:12.283
cmkwdg2fz000055ky1codd4pf	cmkpke0a50001zvkysu49sjk5	cbbc90192c58aa6c8c49ee28c75c89419a634730f7fef151dd9d627eda6b0995	2026-02-03 09:05:59.125	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 09:05:59.134
cmkwg7i0m000255kyokf0abfs	cmkqvqf5n0004ohky3j3fjg36	ea222690873ab89f745169b0264181f76322e2a262ced99c667cdb4d89cbc895	2026-02-03 10:23:18.227	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-27 10:23:18.261
cmkwgs3z8000096kyna7iqn0h	cmkpke0a50001zvkysu49sjk5	a0b45e3e586c106c758adacfb98d908af943fdee5ef32e52f4961769eacdc640	2026-02-03 10:39:19.809	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 10:39:19.844
cmkwin9s1000098ky9aztxb6d	cmkpke0a50001zvkysu49sjk5	81d580683347f2566531a7146034c4fcd1924237eeaa53f70b5e8372dd8db100	2026-02-03 11:31:33.3	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 11:31:33.313
cmkwivo2y00009qky4p8weexr	cmkqvqf5n0004ohky3j3fjg36	35ccf11b916cb107f4cfb3d650423c24a628ef94225128b7d5e8ff2df477bbe6	2026-02-03 11:38:05.085	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-27 11:38:05.097
cmkwjsa530000llky9j01rlzx	cmkpke0a50001zvkysu49sjk5	1e5d36cb8025aa689da09cd82dc5362532d75a2713b70d973a58dc184363a0ea	2026-02-03 12:03:26.617	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-27 12:03:26.678
cmkxl8yvw0000jyky01mqjf7n	cmkpke0a50001zvkysu49sjk5	b87cea63b0ab54b14ac48e4dd4eb61928a7d00f6e168b662ada31393730803ea	2026-02-04 05:32:11.021	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 05:32:11.036
cmkxldobd0000vgky9fg6xcq1	cmkpke0a50001zvkysu49sjk5	d5652be434d6c6f13755db124ec7e0e3853b80fb72bcd2ddd2e6cb08648bdcaa	2026-02-04 05:35:50.601	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 05:35:50.616
cmkxm2aqd00033rkyjasx46kh	cmkqvqf5n0004ohky3j3fjg36	c11638b57b48678834ea9e1615de9a56fa1d053a2a38b668cb706890bae0a918	2026-02-04 05:54:59.389	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-28 05:54:59.413
cmkxohse60000nbkylid37e4s	cmkpke0a50001zvkysu49sjk5	bca4c0bed4c1932f5c040eeab7e133a564a709f1f906117ca2c10bcee893698e	2026-02-04 07:03:01.347	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 07:03:01.374
cmkxqr3bo0000lzky75bag6i7	cmkpke0a50001zvkysu49sjk5	8c39889869a3d35473b0f2546235d54aa088ccfe42ef33a620dc27d43df605d0	2026-02-04 08:06:14.657	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 08:06:14.675
cmkxqym9b0002lzkye8ywavk2	cmkpke0a50001zvkysu49sjk5	42cfe91a93bfb64a3f9872c7a42f5b211d74b63bc5d9d53ace6a256764bb9c90	2026-02-04 08:12:05.79	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 08:12:05.807
cmkxrbwdj0000i8kyykejxalq	cmkpke0a50001zvkysu49sjk5	a4ef66f92435ff77b269a6c930bc1899fefdbbb1387781eb2aa55b5a30ed4938	2026-02-04 08:22:25.426	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 08:22:25.447
cmkxrnnry0000xwkyeds9u87h	cmkpke0a50001zvkysu49sjk5	3cc60bc08b0127d65a8956c3ce339e58798afe5de1e23c626869b0cd46a71ea7	2026-02-04 08:31:34.159	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 08:31:34.173
cmkxtqxkt0000ztkyj69ojcfj	cmkpke0a50001zvkysu49sjk5	118301af50d67309761087a085e6c6eca21e898826e2ebbca608de84458bf72b	2026-02-04 09:30:06.063	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 09:30:06.076
cmkxvct2m0004ppkyjrr02mv0	cmkqvqf5n0004ohky3j3fjg36	8d59d3132110a69695cb6e5920c5885ea878cf105ea41021a0b76ecb7ed0f310	2026-02-04 10:15:06.278	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-28 10:15:06.286
cmkxvft8i0006ppky37j3i6n7	cmkpke0a50001zvkysu49sjk5	4f5919623eb02851c4df3efa3bdb2b471760acd603e7fb420c3a707ce7659544	2026-02-04 10:17:26.451	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 10:17:26.466
cmkxvgpqu0009ppkypypuky5b	cmkqvqf5n0004ohky3j3fjg36	93a1dcf7816f65787de25d37b1760b3754d544a2067ff89f632272b74e9712bf	2026-02-04 10:18:08.589	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-28 10:18:08.598
cmkxvi5b3000bppkyharkcf8d	cmkqvqf5n0004ohky3j3fjg36	397cd1c9f7a4690baac694f5f08dbe61c93955295f5b0dcffc2bd7a764f1f0b8	2026-02-04 10:19:15.419	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-28 10:19:15.423
cmkxvkeqe000eppkymmd06vsr	cmkpke0a50001zvkysu49sjk5	68206cf93dec71faa0962aa2e96d99bc40fb6f72de63fdd8476079f998c944f6	2026-02-04 10:21:00.944	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 10:21:00.95
cmky0m4t50000gbkykx9gkko5	cmkpke0a50001zvkysu49sjk5	e588b76aa2d7ab883968638acec855069d71d92d68911f1ae2eacfc84a4e7747	2026-02-04 12:42:19.432	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 12:42:19.479
cmky1t4vl0000mcky9gj0ua5e	cmkpke0a50001zvkysu49sjk5	94e380cfc06d6553a29e0a7a08aa8407fce92f104d8c233ef82830be280921cc	2026-02-04 13:15:45.765	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-28 13:15:45.777
cmky3id33000086kypd635iw3	cmkqvqf5n0004ohky3j3fjg36	7e1935c9385613f47750f8627bdb12dd408dc09d1da4a79f4ecadecacd68af80	2026-02-04 14:03:22.414	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	127.0.0.1	2026-01-28 14:03:22.431
cmkyy8tkg000286kyldd57o46	cmkpke0a50001zvkysu49sjk5	848f7d8a43587ec6ff506e4312bac7805e58a275a144d36beac919b0abeb03ae	2026-02-05 04:23:45.212	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 04:23:45.327
cmkyz0n72000062kysyxj0q5u	cmkpke0a50001zvkysu49sjk5	fd98c316b50032d4eb65fe5869c1f2368953e11e0728d217d03e3bffe6d777a3	2026-02-05 04:45:23.419	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 04:45:23.438
cmkyzwn2y00009xkyr22djwr3	cmkpke0a50001zvkysu49sjk5	b1846ee7bd25c8e4670645970fac0b934288c0a2a1e72c1e0254842c2f578cc7	2026-02-05 05:10:16.095	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 05:10:16.281
cmkz08lc40000dpkyjmh3lxph	cmkpke0a50001zvkysu49sjk5	9442b00841db5f6730c16dfee0311fc6241675c5ded466582e07765a5bb6f357	2026-02-05 05:19:33.884	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 05:19:33.892
cmkz0zrln00004ykyysxj386f	cmkpke0a50001zvkysu49sjk5	9052654215730f4d72bea777a3e876eec852ddb93bccaeaf7f74841f38f38d99	2026-02-05 05:40:41.711	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 05:40:41.722
cmkz118fc0000gfky0cf3fa7n	cmkpke0a50001zvkysu49sjk5	b773d59728432ca0d96606a5d9ba95e7bab98f3b65ae309c18182f8b4b468a3c	2026-02-05 05:41:50.062	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 05:41:50.184
cmkz11ey80000jokyj8clpdqa	cmkpke0a50001zvkysu49sjk5	eae54898bff04b12dc2df063e7751e693bc1983a0963a94fbd3743c184ee6dbe	2026-02-05 05:41:58.609	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 05:41:58.64
cmkz11p240000kzkycf12wbyv	cmkpke0a50001zvkysu49sjk5	97bb259611ca2f760aad97dcf267cfd9483a51746198ad39e9a345ac30a9158a	2026-02-05 05:42:11.115	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 05:42:11.736
cmkz26jzx00006sky94iauis3	cmkpke0a50001zvkysu49sjk5	a2ae2e9b532f9c72d505d2ebdfc521eb53a5c53ba2b26c9aa03cbc8fc035850e	2026-02-05 06:13:58.068	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 06:13:58.077
cmkz6stu30000lnkyprtz7ei7	cmkpke0a50001zvkysu49sjk5	5e2d61e89639bd34cc4f1cf4eaa09414eb3b4527b5c9c1dfa755ba26257807a5	2026-02-05 08:23:15.704	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 08:23:15.723
cmkz84k620000ceky9fg3ogt0	cmkpke0a50001zvkysu49sjk5	5f0721fbaf92e29a3761c8516016c6852acceb23acf4dac9f7ff8f3a240e31af	2026-02-05 09:00:22.667	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 09:00:22.682
cmkz9psm200000akykw9y3kyr	cmkpke0a50001zvkysu49sjk5	7dccefc3a87e1097c7d7c0fe838b994bd646405cb2c95fafaeb53f1b2f8d3849	2026-02-05 09:44:53.007	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 09:44:53.018
cmkzcf0oe0000kpky2zmuqlga	cmkpke0a50001zvkysu49sjk5	4a9d8aa083a67d07ccf2bb5f0f756b3630a54b0574d942d08810521b4f6da414	2026-02-05 11:00:29.083	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 11:00:29.101
cmkzchr130000nzky3nqvg6qv	cmkpke0a50001zvkysu49sjk5	c1f64436e23fde536a98c0990d56fcc7c904fef8ea256c316fca484c11542da5	2026-02-05 11:02:36.557	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 11:02:36.567
cmkzd9cd10000j1kyaoy5uvmt	cmkpke0a50001zvkysu49sjk5	40b90ca081d82fc1da686fb50cff9192ad49be22eff87f08e71f94fb51f64c57	2026-02-05 11:24:03.913	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 11:24:03.924
cmkzdc2am000047kyauz7341b	cmkpke0a50001zvkysu49sjk5	44d5948ab4e331d8ba885f5720df9c62cc2b86457695ca1af91bc45c421a9584	2026-02-05 11:26:10.837	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 11:26:10.846
cmkzfuycx0000rrky1idu3bpx	cmkpke0a50001zvkysu49sjk5	885bbf471f22a37b13dc8c0b19fdb7a776ad40e8b8613d23e880e0e2a6c26c73	2026-02-05 12:36:51.433	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 12:36:51.441
cmkzg9h350001v8ky9ggmb2wl	cmkpke0a50001zvkysu49sjk5	8a920a8ec65515b469b1ecbc0bf413ca417e2d2a418b352ed0c49d69a0f460dc	2026-02-05 12:48:08.889	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 12:48:08.897
cmkzgbyxl0000ebkyqs3f4pq5	cmkpke0a50001zvkysu49sjk5	f3c36f2bb9152224c76b4c169de74418d92c026165d28995c17937c3a8ae1bec	2026-02-05 12:50:05.326	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 12:50:05.336
cmkzhi6tx0000arkyzj1e9nlm	cmkpke0a50001zvkysu49sjk5	104f39079132b9b54f8f56a44e6210bcb8f2c7345d0fde5931885b2dd790ae75	2026-02-05 13:22:55.107	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-29 13:22:55.124
cml03v64d0001fkkygi8g7gz4	cml03v61p0000fkkydf95z4cd	ecfced9d652978cd90d54aab9768b4d53ccd99d73b62cb9717c8e4386feadfdb	2026-02-05 23:48:52.214	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36	127.0.0.1	2026-01-29 23:48:52.285
cml0cw6hc0007fkkyey8nt73w	cml0cw6fj0006fkkylo8egj97	47070e15f037a7aad81bbef3f8906947e1124f53b3b1a00e7c8d53dd31051124	2026-02-06 04:01:35.91	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36	127.0.0.1	2026-01-30 04:01:35.952
cml0sajcf0000ybkyoia1wki3	cmkpke0a50001zvkysu49sjk5	3bf1a53865aa1a3ddfed4d642fa4a6329ada3a216ff66424ce3d10954561f7ce	2026-02-06 11:12:40.038	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-30 11:12:40.047
cml0th7oa0000m2ky3rzbcxi0	cmkpke0a50001zvkysu49sjk5	989c66495f287c4efc0e2226af8cfec4d006279c0954302d7e5204463da3f755	2026-02-06 11:45:51.112	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-30 11:45:51.13
cml0vwjmd000634kyg8w2lins	cmkpke0a50001zvkysu49sjk5	5d459b6da8437d0149c84a556ffed338c1fb796155de01d99566008e0cefe40c	2026-02-06 12:53:45.681	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	127.0.0.1	2026-01-30 12:53:45.685
cml0w2wj4000g34kyd9z9kor6	cml0w2wim000f34kymqnw79n1	25c32b6089daf1787442a2f9512e516b27c1046dc218cf788386226347f8b93c	2026-02-06 12:58:42.344	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	127.0.0.1	2026-01-30 12:58:42.352
cml0wdu1b000s34ky5idse5hi	cml0w2wim000f34kymqnw79n1	8302ad6d37abb15702780b0f8ddda81f11df8ffd64901f1c9882b14622d978e0	2026-02-06 13:07:12.332	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	127.0.0.1	2026-01-30 13:07:12.335
cml0wlk84000x34kyhdpiz5vz	cmkpke0a50001zvkysu49sjk5	c9f6df047026c99126860fc7094f89e4123b5648bf2dd9ba28c8079329ed3688	2026-02-06 13:13:12.863	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-30 13:13:12.868
cml0xsyd0000009kym6rd4oio	cmkpke0a50001zvkysu49sjk5	ece93fda8b1d4f788c49804614f905cc2ccdff4ae4decb3cc823255eb6828240	2026-02-06 13:46:57.387	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-01-30 13:46:57.396
cml3ax52o000209kyu117jfli	cmkpke0a50001zvkysu49sjk5	f124c9123c49a1d903af2175ddd65a236917512392de8ef882ec3e4ee71437c6	2026-02-08 05:29:39.96	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-01 05:29:40.079
cml3kxj1a0000rqky3oiovqo2	cmkpke0a50001zvkysu49sjk5	158c2359c806fb4291a3d7d0570130d68544f17bc589026cec010ac3409f9e17	2026-02-08 10:09:54.324	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-01 10:09:54.333
cml3m6zz80000ofky9b8s17b9	cmkpke0a50001zvkysu49sjk5	7eab892dd5d608e48318121fe73c00f638ef3effe10064575a82fd17b7395a08	2026-02-08 10:45:15.797	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-01 10:45:15.811
cml3my5ro0000yoky2cx9vkbt	cmkpke0a50001zvkysu49sjk5	15ba327101f2692eeabc38ec78292bc02516ed5f673b1b237f5094cb72bbc3f2	2026-02-08 11:06:23.019	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-01 11:06:23.028
cml3reb1l0000gvky7e4186i3	cmkpke0a50001zvkysu49sjk5	0d4afce0ee47751df057a2cf5402e2c6eb2dcb1fc233d80f45fa58f48182acc1	2026-02-08 13:10:54.818	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-01 13:10:54.825
cml4sif180000s6ky8d0d2o0e	cmkpke0a50001zvkysu49sjk5	9e0a9481786c5e96e3ad7ea50c68d8d78ddd18c33f4fc2bf40a475e60f7fa9a2	2026-02-09 06:29:52.363	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-02 06:29:52.411
cml4swqyu0004s6ky2ismuuat	cmkpke0a50001zvkysu49sjk5	4673410b9b8e95dca41aa4d1fac9a09a1b4b6b0fdb170882ef28d9c27efc0b55	2026-02-09 06:41:01.057	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-02 06:41:01.062
cml4x8pw0000bs6ky2hs97ty2	cmkpke0a50001zvkysu49sjk5	92a3836468d2805facfe66329afc771f4b55fe42f3d644b19e1b34d8187a63c8	2026-02-09 08:42:17.973	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-02 08:42:18
cml4ysri40000w4ky6dxufz9a	cmkpke0a50001zvkysu49sjk5	7ae6c5c62047e1ebcfc349fe63ce9a97b67c0c48efc19f7c330fc1208e8461fa	2026-02-09 09:25:52.817	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-02 09:25:52.828
cml4yt6sm00002ykyjdo2lsyn	cmkpke0a50001zvkysu49sjk5	bb5eeb9cb12711ee710af443dc642cc70a00bf9ba6b0a4dca96b7a723c6cc6a8	2026-02-09 09:26:12.634	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-02 09:26:12.646
cml50nue50000wxkyj1lj4yz9	cmkpke0a50001zvkysu49sjk5	fba767d412f2a0da136400b0eae7da3a1f8993046370b8c231c2eaa5e61adbf7	2026-02-09 10:18:02.494	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-02 10:18:02.524
cml52hk8m0000uwkylhcu5ma9	cmkpke0a50001zvkysu49sjk5	32ca194e6b740a5511dcebced88f30337768dc4bc5eaef1353e40b05a7eff760	2026-02-09 11:09:08.654	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-02 11:09:08.662
cml5403jg0000ydky4nmx7nyg	cmkpke0a50001zvkysu49sjk5	8ef87f2a34162cc28e63a0a4b08d88fe8e8c9f1e775dd19c5c6ef449592cdd5c	2026-02-09 11:51:33.088	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-02 11:51:33.1
cml5v9k1a0001v3kyzjsjkpjw	cml5v9jyp0000v3kye6yx4zqq	ab7246ca55bf99f44c0b48f4d7b05faa1046d1c46dd17c0f41dda560560ef33f	2026-02-10 00:34:43.943	Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36	127.0.0.1	2026-02-03 00:34:44.014
cml64aq1d0007v3ky191wszqh	cmkpke0a50001zvkysu49sjk5	cf259cae57ef1d4483dee9a6af43d7d36adb4ea38dc9ff5e464234990d6df8a8	2026-02-10 04:47:34.916	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-03 04:47:34.992
cml6aa7wg0000bykynap4kjhd	cmkpke0a50001zvkysu49sjk5	ec4376c55f213ef5fbe41914455d69e30ba9dd0aad8507d2ac9881481c2e731d	2026-02-10 07:35:09.167	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-03 07:35:09.183
cml6j6qhh0000hsky8fzn8j5k	cmkpke0a50001zvkysu49sjk5	077959a260bdd38ca3adea4ebf52945df34b2f1f2328eac7da997e5a0f2e1a37	2026-02-10 11:44:23.145	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-03 11:44:23.188
cml6j6z8y0002hskyaklf1p3y	cmkpke0a50001zvkysu49sjk5	c22eca7f29948074b8e2c303aba924cd931b216c2ad8787683ac0767f0ae88f9	2026-02-10 11:44:34.538	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-03 11:44:34.545
cml6k67000000bckyx7ap1sel	cmkpke0a50001zvkysu49sjk5	d071c409cc001b1dc9f0503a4a7520d545329fe6af31e628add28e17bf0afd7d	2026-02-10 12:11:57.482	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-03 12:11:57.552
cml6kuyyz0000rpkyck0v7jzd	cmkpke0a50001zvkysu49sjk5	5e1895bfa4989811591d95d3c4470431928d49d32f924dbea28f466f97764139	2026-02-10 12:31:13.52	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-03 12:31:13.547
cml6nyei40000lmky6ktrgv62	cmkpke0a50001zvkysu49sjk5	382ff2523d6207f67c0f5106ae5fd2440f5244ff466905f77fd4e3ead5d1e3d8	2026-02-10 13:57:52.461	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-03 13:57:52.491
cml6p03qf0002qskybg4ud9lz	cmkpke0970000zvkyal5a8aep	ad190f16aeea0d9052b41f3105995060b7ba9247a82331d635a6869512ed0a73	2026-02-10 14:27:11.451	curl/8.5.0	127.0.0.1	2026-02-03 14:27:11.462
cml7o0xn800003vkyoq9zb63h	cmkpke0a50001zvkysu49sjk5	a627de4cc1efbdc797702db55cf85b8ae81c29c62a34265f81ac5e3ed1d30072	2026-02-11 06:47:36.763	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-04 06:47:36.788
cml7v6gsx0000l9kywziaiw6u	cmkpke0a50001zvkysu49sjk5	353bc419bbc89c3d427cfe432399b50c059a428b8c9d571d5b5b6f12dda82265	2026-02-11 10:07:52.194	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-04 10:07:52.209
cml7v9e910006l9ky1yzaaxp6	cmkpke0970000zvkyal5a8aep	e76c545ad818f22f1ee53ae0d8f119b5fda946a7cd7bb5435d06231ce441536f	2026-02-11 10:10:08.853	curl/8.5.0	127.0.0.1	2026-02-04 10:10:08.869
cml7v9kqu0008l9kywr7t7zui	cmkpke0970000zvkyal5a8aep	ffdea9688c870da239baa818bb749522184b34703119955047b5931988bcd07c	2026-02-11 10:10:17.282	curl/8.5.0	127.0.0.1	2026-02-04 10:10:17.286
cml7v9tym000al9kylpuz1rl2	cmkpke0970000zvkyal5a8aep	c2d839f70c95495086d742ed3b75c608f8718694b9e3da64499eea3f0bf33db1	2026-02-11 10:10:29.223	curl/8.5.0	127.0.0.1	2026-02-04 10:10:29.23
cml7va1kq000cl9kyxfy8m0pl	cmkpke0970000zvkyal5a8aep	550c561261ebc67f2b03a790490c2824929e8fae2db57981f4cb07cc3d8fb43a	2026-02-11 10:10:39.095	curl/8.5.0	127.0.0.1	2026-02-04 10:10:39.098
cml7vbdhn000el9kya7698dp2	cmkpke0970000zvkyal5a8aep	ba5147f5f081e3a6ddd4dc05b0dee3e96d8520d89d9164cb528d4816670b7ee8	2026-02-11 10:11:41.19	curl/8.5.0	127.0.0.1	2026-02-04 10:11:41.195
cml7vblxp000gl9kybjoas0ng	cmkpke0970000zvkyal5a8aep	27eb9d5db5a684b9f8caf1cd6d0bdb633dc8fd8284751b5f2f0421daef8e5217	2026-02-11 10:11:52.137	curl/8.5.0	127.0.0.1	2026-02-04 10:11:52.141
cml7vhlc9000015ky9ohqxc2u	cmkpke0970000zvkyal5a8aep	d929242ba99da2ad08bfb3e9fa5acd95d7a89e23d76f1837212a9b63c0e1e1c8	2026-02-11 10:16:31.295	curl/8.5.0	127.0.0.1	2026-02-04 10:16:31.304
cml7vhzw4000215kygrolbm4a	cmkpke0970000zvkyal5a8aep	fca110cc44e4fbebf492fdcf280dff35595c871717fbbd808ba2cf49295d84a0	2026-02-11 10:16:50.159	curl/8.5.0	127.0.0.1	2026-02-04 10:16:50.164
cml7vi7n9000415ky41gvcibq	cmkpke0970000zvkyal5a8aep	e4b9f688fe774befa94d84479bd4df301b7c9c8668d029e8a5278681a925915a	2026-02-11 10:17:00.21	curl/8.5.0	127.0.0.1	2026-02-04 10:17:00.213
cml7vigzg000615kya1qemssj	cmkpke0970000zvkyal5a8aep	ac49683bcb07f99e196b1018cd8f01169db84fd71892157553d36dc9247658a1	2026-02-11 10:17:12.313	curl/8.5.0	127.0.0.1	2026-02-04 10:17:12.316
cml818zex0000f7kygxluu46q	cmkpke0a50001zvkysu49sjk5	1dd8f19174de73f37681ceb54cea89e669724f3b3a492b7d7152ee0b60b0d5ef	2026-02-11 12:57:47.324	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-04 12:57:47.337
cml84vxfm0000r4kypcwbyama	cmkpke0a50001zvkysu49sjk5	5a090f11aa61c916a11bdcec396fbec5bb644ef3a8f65e783e07136a63428233	2026-02-11 14:39:36.688	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-04 14:39:36.706
cml8lf9e50003r4kym0zvayso	cml8lf9ab0002r4kya220k23m	6b511d757eab8e53ad6ed38aaa0a0e98e99f87e0415d7b15e45fff4c5b1082ae	2026-02-11 22:22:32.43	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36	127.0.0.1	2026-02-04 22:22:32.525
cml90bm33000cr4ky2ied1y5f	cmkpke0a50001zvkysu49sjk5	f844ef5b03255a6bc4f1e830f847ee01551256c200995ae196b47d206d186725	2026-02-12 05:19:35.811	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	127.0.0.1	2026-02-05 05:19:36.591
cml98vp290000qlkylo55128p	cmkpke0a50001zvkysu49sjk5	ae8739154f32e3315cb60f11e6051862da0ccd2140832e95c0af4018bcfc7dfb	2026-02-12 09:19:10.464	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-05 09:19:10.497
cml9du7e500007hkyp0h0btf5	cmkpke0a50001zvkysu49sjk5	fe46297d434c7ee408073a69d7bf9ea00feed2d993ce980acc78046410f38f22	2026-02-12 11:37:59.011	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-05 11:37:59.021
cml9if08p0000zokygjfn0327	cmkpke0a50001zvkysu49sjk5	bdc376767a95f4daabbac554fb67e7ba1b931c2def83e23e21507ff069917ebc	2026-02-12 13:46:07.98	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-05 13:46:07.992
cml9k7p0r0000y4ky5kydhtl4	cmkpke0a50001zvkysu49sjk5	fdfa8e55bc3b23b65c78d2f606a6046d2d9d59f6b65552de7c95346d6da5c343	2026-02-12 14:36:26.082	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-05 14:36:26.09
cmlaeghne000aiakywtwfswzy	cmkpke0a50001zvkysu49sjk5	4889460aaaac329d5073c46ee5c567d0be6e092eeb819ff7bff9ea6ebc99ebf5	2026-02-13 04:43:04.824	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-06 04:43:04.922
cmlaejfn1000fiakye7rl8pp8	cmkpke0a50001zvkysu49sjk5	125641b56d351d33269d6aadee53b1bc1633e327f876940c15021c2c105e971c	2026-02-13 04:45:22.277	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36	127.0.0.1	2026-02-06 04:45:22.285
cmlaj6jxw000hiaky4xwksqwj	cmkpke0a50001zvkysu49sjk5	539b894a1e60276c2f8b7f404d2f5fc3f1ab88a533fa56e1e2f3b3e4756984f2	2026-02-13 06:55:19.406	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-06 06:55:19.412
cmlaqhd020000lmky2unoyboz	cmkpke0a50001zvkysu49sjk5	186a9ec5dc326f5f0f3729adb9689e077eece54dbb5f8722507af1d02cd69cb5	2026-02-13 10:19:40.936	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-06 10:19:40.945
cmlazag9c0001kwkysc86ofce	cmkpke0a50001zvkysu49sjk5	0dd4996e06174a8b55f522b2cfafc96411340e8954003f21a82875a5157350b7	2026-02-13 14:26:15.053	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-06 14:26:15.12
cmldg0r3m0000ytkypqf1rjkj	cmkpke0a50001zvkysu49sjk5	c8ab4d23a1c9160418ee7173e6cb2ded8184f795356b633cc1aaa2d581bfab79	2026-02-15 07:50:08.299	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-08 07:50:08.433
cmldics7t0000kmkyp6yreg6e	cmkpke0a50001zvkysu49sjk5	7cf5bb1a73766b2b9af2c00346f1cc7434f68aa02588a5f3ecae4d639907d2bd	2026-02-15 08:55:28.974	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-08 08:55:28.985
cmldip96z00003tkyoxvyc679	cmkpke0a50001zvkysu49sjk5	81f9bd9f3638af318aef6db1af42204143e95ddd3f140716c0785cd65b13cfce	2026-02-15 09:05:10.84	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-08 09:05:10.859
cmldmp6ok0005j7kyyxozebr3	cmkpke0a50001zvkysu49sjk5	5d26621bd143711d44f139e097b2d79215057e7f3a8c9d8dc62bc2f9b2389f1c	2026-02-15 10:57:06.063	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-08 10:57:06.067
cmlepka1c0007j7kyybma2e2t	cmkpke0a50001zvkysu49sjk5	405e99770a6aaddbaa1af8aa854e71ec182694e5041bc7c0273fa4f72ffa431d	2026-02-16 05:05:02.008	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-09 05:05:02.159
cmlepo34a0009j7kya8xlgdss	cmkpke0a50001zvkysu49sjk5	6e7e4f1b35b7eb4999a05ff1e36a8a94fa28ce6902e0417950a93d719a5e2c9a	2026-02-16 05:07:59.809	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36	127.0.0.1	2026-02-09 05:07:59.818
\.


--
-- Data for Name: subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.subscriptions (id, user_id, organization_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at, plan) FROM stdin;
\.


--
-- Data for Name: usage_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.usage_history (id, organization_id, department_id, user_id, period_start, period_type, requests, workflow_runs, plugin_executions, storage_used, errors, estimated_cost, created_at) FROM stdin;
\.


--
-- Data for Name: user_plugins; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_plugins (id, user_id, plugin_id, organization_id, config, gateway_id, is_enabled, execution_count, last_executed_at, last_error, created_at, updated_at) FROM stdin;
cml5vc9hl0005v3kykvvnq32u	cml5v9jyp0000v3kye6yx4zqq	cmkpke0bd0002zvky9dm3bg8t	\N	{}	\N	t	0	\N	\N	2026-02-03 00:36:50.31	2026-02-03 00:36:50.31
cml90fytn000gr4kyi9e6wjii	cmkpke0a50001zvkysu49sjk5	cmkpke0bd0002zvky9dm3bg8t	\N	{}	\N	t	0	\N	\N	2026-02-05 05:22:59.706	2026-02-05 05:22:59.706
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, name, email_verified, image, role, failed_login_count, locked_until, last_password_change, deleted_at, plan, execution_mode, stripe_customer_id, workspace_addons, workspace_ram_mb, workspace_cpu_cores, workspace_storage_mb, is_active, last_login_at, created_at, updated_at) FROM stdin;
cml5v9jyp0000v3kye6yx4zqq	pradiprimal01997@gmail.com	$2b$12$GhoK3a1w64jKr8JAIzxOOul94Tv09UNwW0XETVjNu2pFkGUXKMqFy	Pradip	\N	\N	MEMBER	0	\N	\N	\N	FREE	SERVERLESS	\N	{}	\N	\N	\N	t	\N	2026-02-03 00:34:43.92	2026-02-03 00:34:43.92
cml0w2wim000f34kymqnw79n1	bakhtinur.komilov@gmail.com	$2b$12$1GnBths25SeTPkQW7fm5G.9YQCKRfLA3DUTXiWoytn5Ls886YWlK2	BAXTINUR KOMILOV	\N	\N	MEMBER	0	\N	\N	\N	FREE	SERVERLESS	\N	{}	\N	\N	\N	t	2026-02-06 04:44:04.392	2026-01-30 12:58:42.334	2026-02-06 04:44:04.395
cml03v61p0000fkkydf95z4cd	myd110092@gmail.com	$2b$12$0bobzOmFmr/o8D7aByZrNu3oRjHHbsq3g6Xvna/9g0eHLh8W.0W66	KLx7	\N	\N	MEMBER	0	\N	\N	\N	FREE	SERVERLESS	\N	{}	\N	\N	\N	t	\N	2026-01-29 23:48:52.188	2026-01-29 23:48:52.188
cml0cw6fj0006fkkylo8egj97	jkknkk6@gmail.com	$2b$12$6JDuClRzzfyz04yoRwCPF.umzPfwAcwIL0vmSvWxNUchrBqkfRoxe	ISMAIL	\N	\N	MEMBER	0	\N	\N	\N	FREE	SERVERLESS	\N	{}	\N	\N	\N	t	\N	2026-01-30 04:01:35.887	2026-01-30 04:01:35.887
cmkqvqf5n0004ohky3j3fjg36	info@abclegacyllc.com	$2b$12$jMfGlr9TAAhEHvXdripSZeLZhxpdy8OgbEXISUuBUFLXoios/o/e.	info@abclegacyllc.com	\N	\N	MEMBER	0	\N	\N	\N	FREE	SERVERLESS	\N	{}	\N	\N	\N	t	2026-01-28 14:03:22.373	2026-01-23 12:51:18.203	2026-01-28 14:03:22.395
cmkqvzoqm000hohkyccs6hjyq	hojiakbarbakhronoff@gmail.com	$2b$12$JygJGcS56XLWad28VmeWo.NBP9kOsYmQeu2giAVcc4iFSCyJdZxm.	\N	\N	\N	MEMBER	0	\N	\N	\N	FREE	SERVERLESS	\N	{}	\N	\N	\N	t	2026-01-23 12:58:57.111	2026-01-23 12:58:30.525	2026-01-23 12:58:57.119
cmkpke0a50001zvkysu49sjk5	admin@2bot.org	$2b$12$SonTpvITIhFElswTvTcfoucnk1IkJPcpxG3anOOKRLDdp9acqRY.i	Admin User	\N	\N	ADMIN	0	\N	\N	\N	PRO	SERVERLESS	cus_TqT7xpSIqn1hbN	{}	\N	\N	\N	t	2026-02-09 05:07:59.792	2026-01-22 14:45:57.101	2026-02-09 05:07:59.799
cmkpke0970000zvkyal5a8aep	test@example.com	$2b$12$7hexynwslB1a.zcpERTCheMJd.MCzuFQOy8i39s0Olve34a4wDAW.	Test User	\N	\N	MEMBER	0	\N	\N	\N	FREE	SERVERLESS	\N	{}	\N	\N	\N	t	2026-02-04 10:17:12.304	2026-01-22 14:45:57.067	2026-02-04 10:17:12.306
cml8lf9ab0002r4kya220k23m	araujoluizhenrique1@gmail.com	$2b$12$bWkNN105Ultb32wNBXKJCurA2fuwJ2I5APvex84S3qq6Ij01S.W3.	Luiz Henrique da Silva Araujo	\N	\N	MEMBER	0	\N	\N	\N	FREE	SERVERLESS	\N	{}	\N	\N	\N	t	2026-02-04 22:22:47.382	2026-02-04 22:22:32.386	2026-02-04 22:22:47.39
\.


--
-- Data for Name: workflow_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workflow_runs (id, workflow_id, "triggeredBy", trigger_data, status, output, error, failed_step_order, started_at, completed_at, duration_ms) FROM stdin;
\.


--
-- Data for Name: workflow_step_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workflow_step_runs (id, run_id, step_order, status, input, output, error, started_at, completed_at, duration_ms) FROM stdin;
\.


--
-- Data for Name: workflow_steps; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workflow_steps (id, workflow_id, "order", name, plugin_id, "inputMapping", config, gateway_id, condition, "onError", max_retries, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: workflows; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.workflows (id, user_id, organization_id, department_id, scope, name, description, slug, "triggerType", "triggerConfig", gateway_id, status, is_enabled, execution_count, last_executed_at, last_error, created_at, updated_at) FROM stdin;
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: alert_configs alert_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alert_configs
    ADD CONSTRAINT alert_configs_pkey PRIMARY KEY (id);


--
-- Name: alert_history alert_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: credit_rates credit_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_rates
    ADD CONSTRAINT credit_rates_pkey PRIMARY KEY (id);


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_pkey PRIMARY KEY (id);


--
-- Name: credit_wallets credit_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_wallets
    ADD CONSTRAINT credit_wallets_pkey PRIMARY KEY (id);


--
-- Name: department_members department_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_members
    ADD CONSTRAINT department_members_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: dept_allocations dept_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dept_allocations
    ADD CONSTRAINT dept_allocations_pkey PRIMARY KEY (id);


--
-- Name: gateways gateways_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gateways
    ADD CONSTRAINT gateways_pkey PRIMARY KEY (id);


--
-- Name: member_allocations member_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_allocations
    ADD CONSTRAINT member_allocations_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: org_invites org_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: plugins plugins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.plugins
    ADD CONSTRAINT plugins_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: usage_history usage_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usage_history
    ADD CONSTRAINT usage_history_pkey PRIMARY KEY (id);


--
-- Name: user_plugins user_plugins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_plugins
    ADD CONSTRAINT user_plugins_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: workflow_runs workflow_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_pkey PRIMARY KEY (id);


--
-- Name: workflow_step_runs workflow_step_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_step_runs
    ADD CONSTRAINT workflow_step_runs_pkey PRIMARY KEY (id);


--
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_pkey PRIMARY KEY (id);


--
-- Name: workflows workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_capability_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_usage_capability_created_at_idx ON public.ai_usage USING btree (capability, created_at);


--
-- Name: ai_usage_department_id_billing_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_usage_department_id_billing_period_idx ON public.ai_usage USING btree (department_id, billing_period);


--
-- Name: ai_usage_gateway_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_usage_gateway_id_created_at_idx ON public.ai_usage USING btree (gateway_id, created_at);


--
-- Name: ai_usage_organization_id_billing_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_usage_organization_id_billing_period_idx ON public.ai_usage USING btree (organization_id, billing_period);


--
-- Name: ai_usage_source_billing_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_usage_source_billing_period_idx ON public.ai_usage USING btree (source, billing_period);


--
-- Name: ai_usage_user_id_billing_period_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_usage_user_id_billing_period_idx ON public.ai_usage USING btree (user_id, billing_period);


--
-- Name: alert_configs_organization_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX alert_configs_organization_id_key ON public.alert_configs USING btree (organization_id);


--
-- Name: alert_history_acknowledged_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX alert_history_acknowledged_idx ON public.alert_history USING btree (acknowledged);


--
-- Name: alert_history_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX alert_history_created_at_idx ON public.alert_history USING btree (created_at);


--
-- Name: alert_history_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX alert_history_organization_id_idx ON public.alert_history USING btree (organization_id);


--
-- Name: alert_history_severity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX alert_history_severity_idx ON public.alert_history USING btree (severity);


--
-- Name: alert_history_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX alert_history_type_idx ON public.alert_history USING btree (type);


--
-- Name: audit_logs_action_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at);


--
-- Name: audit_logs_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_organization_id_idx ON public.audit_logs USING btree (organization_id);


--
-- Name: audit_logs_resource_resource_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_resource_resource_id_idx ON public.audit_logs USING btree (resource, resource_id);


--
-- Name: audit_logs_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);


--
-- Name: credit_rates_capability_model_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX credit_rates_capability_model_key ON public.credit_rates USING btree (capability, model) WHERE (capability IS NOT NULL);


--
-- Name: credit_rates_is_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX credit_rates_is_active_idx ON public.credit_rates USING btree (is_active);


--
-- Name: credit_transactions_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX credit_transactions_created_at_idx ON public.credit_transactions USING btree (created_at);


--
-- Name: credit_transactions_credit_wallet_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX credit_transactions_credit_wallet_id_idx ON public.credit_transactions USING btree (credit_wallet_id);


--
-- Name: credit_transactions_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX credit_transactions_type_idx ON public.credit_transactions USING btree (type);


--
-- Name: credit_wallets_organization_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX credit_wallets_organization_id_key ON public.credit_wallets USING btree (organization_id);


--
-- Name: credit_wallets_user_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX credit_wallets_user_id_key ON public.credit_wallets USING btree (user_id);


--
-- Name: department_members_department_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX department_members_department_id_idx ON public.department_members USING btree (department_id);


--
-- Name: department_members_user_id_department_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX department_members_user_id_department_id_key ON public.department_members USING btree (user_id, department_id);


--
-- Name: department_members_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX department_members_user_id_idx ON public.department_members USING btree (user_id);


--
-- Name: departments_is_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX departments_is_active_idx ON public.departments USING btree (is_active);


--
-- Name: departments_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX departments_organization_id_idx ON public.departments USING btree (organization_id);


--
-- Name: departments_organization_id_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX departments_organization_id_name_key ON public.departments USING btree (organization_id, name);


--
-- Name: dept_allocations_department_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX dept_allocations_department_id_key ON public.dept_allocations USING btree (department_id);


--
-- Name: gateways_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX gateways_organization_id_idx ON public.gateways USING btree (organization_id);


--
-- Name: gateways_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX gateways_status_idx ON public.gateways USING btree (status);


--
-- Name: gateways_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX gateways_type_idx ON public.gateways USING btree (type);


--
-- Name: gateways_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX gateways_user_id_idx ON public.gateways USING btree (user_id);


--
-- Name: member_allocations_department_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX member_allocations_department_id_idx ON public.member_allocations USING btree (department_id);


--
-- Name: member_allocations_user_id_department_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX member_allocations_user_id_department_id_key ON public.member_allocations USING btree (user_id, department_id);


--
-- Name: memberships_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX memberships_organization_id_idx ON public.memberships USING btree (organization_id);


--
-- Name: memberships_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX memberships_status_idx ON public.memberships USING btree (status);


--
-- Name: memberships_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX memberships_user_id_idx ON public.memberships USING btree (user_id);


--
-- Name: memberships_user_id_organization_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX memberships_user_id_organization_id_key ON public.memberships USING btree (user_id, organization_id);


--
-- Name: org_invites_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX org_invites_email_idx ON public.org_invites USING btree (email);


--
-- Name: org_invites_expires_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX org_invites_expires_at_idx ON public.org_invites USING btree (expires_at);


--
-- Name: org_invites_organization_id_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX org_invites_organization_id_email_key ON public.org_invites USING btree (organization_id, email);


--
-- Name: org_invites_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX org_invites_token_idx ON public.org_invites USING btree (token);


--
-- Name: org_invites_token_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX org_invites_token_key ON public.org_invites USING btree (token);


--
-- Name: organizations_databaseType_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "organizations_databaseType_idx" ON public.organizations USING btree ("databaseType");


--
-- Name: organizations_is_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organizations_is_active_idx ON public.organizations USING btree (is_active);


--
-- Name: organizations_slug_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX organizations_slug_idx ON public.organizations USING btree (slug);


--
-- Name: organizations_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX organizations_slug_key ON public.organizations USING btree (slug);


--
-- Name: organizations_stripe_customer_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX organizations_stripe_customer_id_key ON public.organizations USING btree (stripe_customer_id);


--
-- Name: password_reset_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX password_reset_tokens_expires_at_idx ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: password_reset_tokens_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX password_reset_tokens_token_idx ON public.password_reset_tokens USING btree (token);


--
-- Name: password_reset_tokens_token_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX password_reset_tokens_token_key ON public.password_reset_tokens USING btree (token);


--
-- Name: password_reset_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id);


--
-- Name: plugins_category_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plugins_category_idx ON public.plugins USING btree (category);


--
-- Name: plugins_is_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plugins_is_active_idx ON public.plugins USING btree (is_active);


--
-- Name: plugins_slug_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX plugins_slug_idx ON public.plugins USING btree (slug);


--
-- Name: plugins_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX plugins_slug_key ON public.plugins USING btree (slug);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_token_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sessions_token_idx ON public.sessions USING btree (token);


--
-- Name: sessions_token_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX sessions_token_key ON public.sessions USING btree (token);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: subscriptions_organization_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX subscriptions_organization_id_key ON public.subscriptions USING btree (organization_id);


--
-- Name: subscriptions_stripe_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX subscriptions_stripe_status_idx ON public.subscriptions USING btree (stripe_status);


--
-- Name: subscriptions_stripe_subscription_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX subscriptions_stripe_subscription_id_idx ON public.subscriptions USING btree (stripe_subscription_id);


--
-- Name: subscriptions_stripe_subscription_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX subscriptions_stripe_subscription_id_key ON public.subscriptions USING btree (stripe_subscription_id);


--
-- Name: subscriptions_user_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX subscriptions_user_id_key ON public.subscriptions USING btree (user_id);


--
-- Name: usage_history_department_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX usage_history_department_id_idx ON public.usage_history USING btree (department_id);


--
-- Name: usage_history_department_id_period_start_period_type_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX usage_history_department_id_period_start_period_type_key ON public.usage_history USING btree (department_id, period_start, period_type);


--
-- Name: usage_history_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX usage_history_organization_id_idx ON public.usage_history USING btree (organization_id);


--
-- Name: usage_history_organization_id_period_start_period_type_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX usage_history_organization_id_period_start_period_type_key ON public.usage_history USING btree (organization_id, period_start, period_type);


--
-- Name: usage_history_period_start_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX usage_history_period_start_idx ON public.usage_history USING btree (period_start);


--
-- Name: usage_history_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX usage_history_user_id_idx ON public.usage_history USING btree (user_id);


--
-- Name: usage_history_user_id_period_start_period_type_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX usage_history_user_id_period_start_period_type_key ON public.usage_history USING btree (user_id, period_start, period_type);


--
-- Name: user_plugins_is_enabled_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_plugins_is_enabled_idx ON public.user_plugins USING btree (is_enabled);


--
-- Name: user_plugins_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_plugins_organization_id_idx ON public.user_plugins USING btree (organization_id);


--
-- Name: user_plugins_plugin_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_plugins_plugin_id_idx ON public.user_plugins USING btree (plugin_id);


--
-- Name: user_plugins_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_plugins_user_id_idx ON public.user_plugins USING btree (user_id);


--
-- Name: user_plugins_user_id_plugin_id_organization_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX user_plugins_user_id_plugin_id_organization_id_key ON public.user_plugins USING btree (user_id, plugin_id, organization_id);


--
-- Name: users_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_deleted_at_idx ON public.users USING btree (deleted_at);


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_role_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_role_idx ON public.users USING btree (role);


--
-- Name: users_stripe_customer_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_stripe_customer_id_idx ON public.users USING btree (stripe_customer_id);


--
-- Name: users_stripe_customer_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_stripe_customer_id_key ON public.users USING btree (stripe_customer_id);


--
-- Name: workflow_runs_started_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflow_runs_started_at_idx ON public.workflow_runs USING btree (started_at);


--
-- Name: workflow_runs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflow_runs_status_idx ON public.workflow_runs USING btree (status);


--
-- Name: workflow_runs_workflow_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflow_runs_workflow_id_idx ON public.workflow_runs USING btree (workflow_id);


--
-- Name: workflow_step_runs_run_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflow_step_runs_run_id_idx ON public.workflow_step_runs USING btree (run_id);


--
-- Name: workflow_step_runs_run_id_step_order_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX workflow_step_runs_run_id_step_order_key ON public.workflow_step_runs USING btree (run_id, step_order);


--
-- Name: workflow_steps_plugin_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflow_steps_plugin_id_idx ON public.workflow_steps USING btree (plugin_id);


--
-- Name: workflow_steps_workflow_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflow_steps_workflow_id_idx ON public.workflow_steps USING btree (workflow_id);


--
-- Name: workflow_steps_workflow_id_order_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX workflow_steps_workflow_id_order_key ON public.workflow_steps USING btree (workflow_id, "order");


--
-- Name: workflows_department_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflows_department_id_idx ON public.workflows USING btree (department_id);


--
-- Name: workflows_is_enabled_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflows_is_enabled_idx ON public.workflows USING btree (is_enabled);


--
-- Name: workflows_organization_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflows_organization_id_idx ON public.workflows USING btree (organization_id);


--
-- Name: workflows_scope_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflows_scope_idx ON public.workflows USING btree (scope);


--
-- Name: workflows_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflows_status_idx ON public.workflows USING btree (status);


--
-- Name: workflows_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX workflows_user_id_idx ON public.workflows USING btree (user_id);


--
-- Name: workflows_user_id_organization_id_slug_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX workflows_user_id_organization_id_slug_key ON public.workflows USING btree (user_id, organization_id, slug);


--
-- Name: ai_usage ai_usage_gateway_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_gateway_id_fkey FOREIGN KEY (gateway_id) REFERENCES public.gateways(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ai_usage ai_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: alert_configs alert_configs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alert_configs
    ADD CONSTRAINT alert_configs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: alert_history alert_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.alert_history
    ADD CONSTRAINT alert_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: credit_transactions credit_transactions_credit_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_transactions
    ADD CONSTRAINT credit_transactions_credit_wallet_id_fkey FOREIGN KEY (credit_wallet_id) REFERENCES public.credit_wallets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: credit_wallets credit_wallets_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_wallets
    ADD CONSTRAINT credit_wallets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: credit_wallets credit_wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.credit_wallets
    ADD CONSTRAINT credit_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: department_members department_members_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_members
    ADD CONSTRAINT department_members_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: department_members department_members_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_members
    ADD CONSTRAINT department_members_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: department_members department_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.department_members
    ADD CONSTRAINT department_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: departments departments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: dept_allocations dept_allocations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dept_allocations
    ADD CONSTRAINT dept_allocations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: dept_allocations dept_allocations_set_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.dept_allocations
    ADD CONSTRAINT dept_allocations_set_by_id_fkey FOREIGN KEY (set_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: gateways gateways_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gateways
    ADD CONSTRAINT gateways_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: gateways gateways_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.gateways
    ADD CONSTRAINT gateways_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: member_allocations member_allocations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_allocations
    ADD CONSTRAINT member_allocations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: member_allocations member_allocations_set_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_allocations
    ADD CONSTRAINT member_allocations_set_by_id_fkey FOREIGN KEY (set_by_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: member_allocations member_allocations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_allocations
    ADD CONSTRAINT member_allocations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: memberships memberships_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: memberships memberships_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: org_invites org_invites_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: org_invites org_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.org_invites
    ADD CONSTRAINT org_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: usage_history usage_history_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usage_history
    ADD CONSTRAINT usage_history_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: usage_history usage_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usage_history
    ADD CONSTRAINT usage_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: usage_history usage_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usage_history
    ADD CONSTRAINT usage_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_plugins user_plugins_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_plugins
    ADD CONSTRAINT user_plugins_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_plugins user_plugins_plugin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_plugins
    ADD CONSTRAINT user_plugins_plugin_id_fkey FOREIGN KEY (plugin_id) REFERENCES public.plugins(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_plugins user_plugins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_plugins
    ADD CONSTRAINT user_plugins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workflow_runs workflow_runs_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workflow_step_runs workflow_step_runs_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_step_runs
    ADD CONSTRAINT workflow_step_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workflow_steps workflow_steps_gateway_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_gateway_id_fkey FOREIGN KEY (gateway_id) REFERENCES public.gateways(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: workflow_steps workflow_steps_plugin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_plugin_id_fkey FOREIGN KEY (plugin_id) REFERENCES public.plugins(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: workflow_steps workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workflows workflows_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: workflows workflows_gateway_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_gateway_id_fkey FOREIGN KEY (gateway_id) REFERENCES public.gateways(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: workflows workflows_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: workflows workflows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict eiQt5RyXbfyXQpBU872n54CdVVMucEM5AMuQQAkRtwBe2yzP6eKbHOiq1uif4ec

