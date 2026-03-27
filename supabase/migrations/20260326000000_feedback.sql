-- Feedback table for TestFlight bug reports and feature requests
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'feature', 'other')),
  title text not null,
  description text,
  screenshot_urls text[] default '{}',
  device_info jsonb default '{}',
  current_screen text,
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved', 'closed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- Users can insert their own feedback
create policy "Users can insert own feedback"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can read their own feedback
create policy "Users can read own feedback"
  on public.feedback for select
  to authenticated
  using (auth.uid() = user_id);

-- Admins can read all feedback
create policy "Admins can read all feedback"
  on public.feedback for select
  to authenticated
  using (is_admin());

-- Admins can update all feedback (status, admin_notes)
create policy "Admins can update all feedback"
  on public.feedback for update
  to authenticated
  using (is_admin());

-- Storage bucket for feedback screenshots
insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', true)
on conflict (id) do nothing;

-- Anyone authenticated can upload to feedback-screenshots
create policy "Authenticated users can upload feedback screenshots"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'feedback-screenshots');

-- Public read access for feedback screenshots
create policy "Public read access for feedback screenshots"
  on storage.objects for select
  to public
  using (bucket_id = 'feedback-screenshots');
