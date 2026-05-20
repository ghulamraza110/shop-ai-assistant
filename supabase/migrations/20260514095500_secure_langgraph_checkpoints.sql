-- Secure LangGraph Checkpoint Tables
-- These tables are dynamically created by LangGraph's PostgresSaver checkpointer
-- but should not be accessible from the frontend via PostgREST Data API.
-- This migration enables RLS and revokes access to ensure security.

-- Enable Row-Level Security
ALTER TABLE IF EXISTS public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checkpoint_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checkpoint_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checkpoint_migrations ENABLE ROW LEVEL SECURITY;

-- Revoke all access from API roles as these are backend-only tables
REVOKE ALL ON TABLE public.checkpoints FROM anon, authenticated;
REVOKE ALL ON TABLE public.checkpoint_blobs FROM anon, authenticated;
REVOKE ALL ON TABLE public.checkpoint_writes FROM anon, authenticated;
REVOKE ALL ON TABLE public.checkpoint_migrations FROM anon, authenticated;
