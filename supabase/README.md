# Supabase Integration Guide

This project is currently configured to use a local SQLite database (`creatives.db`) via `better-sqlite3`. To migrate to Supabase for a more robust, scalable cloud database, follow these steps:

## 1. Create a Supabase Project
1. Go to [Supabase](https://supabase.com/) and create a new project.
2. Once your project is created, navigate to the **SQL Editor** in the Supabase dashboard.

## 2. Run the Schema Migration
1. Open the `supabase/schema.sql` file in this project.
2. Copy the entire contents of the file.
3. Paste it into the Supabase SQL Editor and click **Run**. This will create all the necessary tables for the application.

## 3. Configure Environment Variables
1. In the Supabase dashboard, go to **Project Settings** -> **API**.
2. Copy the **Project URL** and the **anon** `public` key.
3. Create a `.env` file in the root of your project (or update your existing one) and add the following variables:

```env
SUPABASE_URL=your_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key # Optional, for backend admin access
```

## 4. Migrate the Backend
A template for a Supabase-backed server has been created at `server-supabase.ts`. 

Currently, `server.ts` uses SQLite. To switch to Supabase:
1. Review `server-supabase.ts` and migrate any remaining endpoints from `server.ts` using the `@supabase/supabase-js` client.
2. Once you are ready to test, run the Supabase server using:
   ```bash
   npm run dev:supabase
   ```
3. When you are confident the Supabase server is working correctly, you can rename `server-supabase.ts` to `server.ts` (or update the `dev` script in `package.json` to point to it).

## 5. Frontend Integration (Optional)
A Supabase client has been created at `src/lib/supabase.ts`. You can import this client directly into your React components if you want to use Supabase's real-time features or fetch data directly from the frontend instead of going through the Express backend.

```typescript
import { supabase } from '../lib/supabase';

// Example: Fetching clients directly from the frontend
const { data, error } = await supabase.from('clients').select('*');
```

A helper service has also been created at `src/services/supabaseService.ts` which provides typed functions for interacting with the database.
