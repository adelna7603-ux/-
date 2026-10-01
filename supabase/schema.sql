-- Run this in the Supabase SQL Editor before using the site.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  content_type text not null default 'file' check (content_type in ('file', 'course')),
  title_ar text not null,
  title_en text not null,
  description_ar text not null default '',
  description_en text not null default '',
  category text not null,
  category_ar text not null,
  category_en text not null,
  pdf_url text,
  pdf_path text,
  pdf_size bigint check (pdf_size is null or pdf_size >= 0),
  thumbnail_url text,
  thumbnail_path text,
  source_filename text unique,
  is_published boolean not null default false,
  allow_download boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_item_pdf_required check (content_type = 'course' or pdf_url is not null)
);

create index if not exists library_items_publication_created_idx
  on public.library_items (is_published, created_at desc);
create index if not exists library_items_category_idx
  on public.library_items (category);
create index if not exists library_items_type_idx
  on public.library_items (content_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists library_items_set_updated_at on public.library_items;
create trigger library_items_set_updated_at
before update on public.library_items
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.library_items enable row level security;

drop policy if exists "admins can read their own admin record" on public.admin_users;
create policy "admins can read their own admin record"
on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "public can read published library items" on public.library_items;
create policy "public can read published library items"
on public.library_items for select to anon, authenticated
using (is_published or (select public.is_admin()));

drop policy if exists "admins can insert library items" on public.library_items;
create policy "admins can insert library items"
on public.library_items for insert to authenticated
with check ((select public.is_admin()));

drop policy if exists "admins can update library items" on public.library_items;
create policy "admins can update library items"
on public.library_items for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "admins can delete library items" on public.library_items;
create policy "admins can delete library items"
on public.library_items for delete to authenticated
using ((select public.is_admin()));

grant select on public.library_items to anon, authenticated;
grant insert, update, delete on public.library_items to authenticated;
grant select on public.admin_users to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pdfs', 'pdfs', true, 52428800, array['application/pdf']),
  ('thumbnails', 'thumbnails', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can read library storage" on storage.objects;
create policy "public can read library storage"
on storage.objects for select to anon, authenticated
using (bucket_id in ('pdfs', 'thumbnails'));

drop policy if exists "admins can upload library storage" on storage.objects;
create policy "admins can upload library storage"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('pdfs', 'thumbnails')
  and (select public.is_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "admins can update library storage" on storage.objects;
create policy "admins can update library storage"
on storage.objects for update to authenticated
using (bucket_id in ('pdfs', 'thumbnails') and (select public.is_admin()))
with check (
  bucket_id in ('pdfs', 'thumbnails')
  and (select public.is_admin())
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "admins can delete library storage" on storage.objects;
create policy "admins can delete library storage"
on storage.objects for delete to authenticated
using (bucket_id in ('pdfs', 'thumbnails') and (select public.is_admin()));

-- Enable live browser refresh for newly published content.
do $$
begin
  alter publication supabase_realtime add table public.library_items;
exception
  when duplicate_object then null;
  when undefined_object then raise notice 'Realtime publication is unavailable; the site also refreshes every 60 seconds.';
end;
$$;

-- After creating the admin account in Supabase Auth, authorize its UUID:
-- insert into public.admin_users (user_id) values ('YOUR_AUTH_USER_UUID');