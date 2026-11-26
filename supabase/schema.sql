-- Lk Up: run this script in the Supabase SQL Editor.
-- Public uploads are intentionally anonymous. Keep this bucket dedicated to this app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lk-up-media',
  'lk-up-media',
  true,
  31457280,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can upload to this bucket. There is deliberately no public delete policy.
drop policy if exists "Lk Up anonymous uploads" on storage.objects;
create policy "Lk Up anonymous uploads"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'lk-up-media'
  and (storage.foldername(name))[1] is not null
);

-- Public read is required because generated share links are public URLs.
drop policy if exists "Lk Up public reads" on storage.objects;
create policy "Lk Up public reads"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'lk-up-media');