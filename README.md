# Course Library

## Supabase setup

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. In Supabase Auth, create the administrator account. In the SQL Editor, add that account's Auth user UUID:

   ```sql
   insert into public.admin_users (user_id) values ('YOUR_AUTH_USER_UUID');
   ```

3. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project settings. Only the public anon key is used by the browser.
4. Install dependencies with `npm install`, then run `npm run dev` or create a production build with `npm run build`.
5. Deploy the contents of `dist/` to the existing hosting origin. The site uses `/` and `/admin/` on that same origin. Content changes after this one-time code deployment are stored in Supabase and do not require another deployment.

## Import current PDFs

To publish the PDFs currently in the project folder, copy `.env.migration.example` to `.env.migration`, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then run `npm run migrate:legacy`. This local-only script imports top-level PDFs into Storage and the database, skips files already imported, and never runs in the browser. Keep `.env.migration` private and do not add a `VITE_` prefix to the service-role variable.

## Admin access

Open `/admin/` and sign in with the Auth account added to `public.admin_users`. RLS protects all database and Storage writes; public visitors can only read published content. The two Storage buckets are public so published PDF and cover URLs can be viewed without exposing credentials. `allow_download` hides or shows the download button; as with any publicly viewable PDF, it cannot prevent a visitor from saving a file they can open.