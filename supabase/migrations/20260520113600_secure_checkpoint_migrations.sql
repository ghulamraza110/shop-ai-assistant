-- Secure checkpoint_migrations Table
-- This table is created by LangGraph's checkpointer to track migrations.
-- This migration ensures that Row-Level Security (RLS) is enabled and
-- all PostgREST API access is revoked to avoid security warnings.

ALTER TABLE IF EXISTS public.checkpoint_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.checkpoint_migrations FROM anon, authenticated;
