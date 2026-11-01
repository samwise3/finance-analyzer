# Wallet Wise

A personal finance app for tracking spending against a monthly budget. Import bank and credit card statements (CSV or Excel) or connect accounts through Plaid. Then plan a budget and see how your actual spending, income and saving compare to it.

## Features

- **Statement import:** upload `.csv`, `.xlsx` or `.xls` exports from any bank. You match the file's columns to date, description, category and amount, and the app remembers that mapping for the next upload of the same layout. Each import is tracked, so you can delete it as a group later.
- **Bank connections:** link checking, credit card and investment accounts through Plaid.
- **Transactions:** search and filter everything you've imported.
- **Budget plan:** annual income (pre- or post-tax), monthly expenses, savings goals, investment accounts such as 401(k) and IRA (Roth or Traditional), and paycheck deductions.
- **Budget vs Actual:** for each budget item, planned vs actual spending for any month. Map your bank's categories to your budget items, change individual transactions, mark paychecks as income, and count credits such as reimbursements against what they paid back.
- **Dashboard:** monthly income, spending, savings progress, account balances and credit card liabilities.

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router |
| Auth | [Clerk](https://clerk.com) |
| Database | [Supabase](https://supabase.com) (Postgres with row-level security) |
| Bank data | [Plaid](https://plaid.com), called from Supabase Edge Functions |
| File parsing | PapaParse (CSV), SheetJS (Excel) |

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project
- A Clerk application
- A Plaid account (only needed for bank connections; sandbox works for development)
- [Supabase CLI](https://supabase.com/docs/guides/cli), for migrations and Edge Functions

### 1. Install dependencies

```bash
npm install
```

SheetJS is installed from the official SheetJS CDN, not npm, because the npm release is outdated. `npm install` takes care of this automatically.

### 2. Environment variables

Create a `.env` file in the project root:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_FUNCTIONS_URL=https://<project-ref>.supabase.co/functions/v1
```

Vite only reads `.env` at startup, so restart the dev server after changing it.

### 3. Connect Clerk to Supabase

The app sends a Clerk token with every Supabase request, using a Clerk JWT template named **`supabase`**. Row-level security policies match `auth.jwt() ->> 'sub'` (the Clerk user id) against each row's `user_id`.

1. In Clerk, create a JWT template named `supabase`, signed with your Supabase project's JWT secret.
2. Make sure every user-owned table has a `user_id text` column and policies like:

   ```sql
   create policy "own rows" on public.<table>
     for all using ((auth.jwt() ->> 'sub') = user_id);
   ```

### 4. Database

The app uses these tables:

| Table | Purpose |
|---|---|
| `transactions` | Imported and synced transactions. Has a unique constraint on `(user_id, date, description, amount)`, which the importer uses to skip duplicates. |
| `csv_imports` | One row per uploaded file; transactions point to it through `import_id`. |
| `budget_settings` | Income, tax rate, savings and investment targets (one row per user). |
| `budget_items` | Budget plan lines (`type`: expense / savings / investment, `frequency`: recurring / one_off). |
| `investment_accounts` | 401(k), IRA and other accounts. `ira_type` (roth / traditional) applies to 401(k)s too. |
| `paycheck_deductions` | Deductions taken out before pay is deposited. |
| `savings_buckets` | Savings goals shown on the Dashboard. |
| `plaid_items` | Linked Plaid accounts and their access tokens. |

Only `paycheck_deductions` has a migration in `supabase/migrations/` so far. To capture the rest of the existing schema as a migration:

```bash
supabase link --project-ref <project-ref>
supabase db pull
```

To apply migrations:

```bash
supabase db push
```

### 5. Plaid Edge Functions (optional)

The functions in `supabase/functions/` call Plaid on the server, so Plaid secrets never reach the browser:

| Function | Purpose |
|---|---|
| `plaid-create-link-token` | Starts the Plaid Link flow |
| `plaid-exchange-token` | Exchanges the public token and saves the account |
| `plaid-sync-transactions` | Pulls new transactions |
| `plaid-get-balances` | Account balances for the Dashboard |
| `plaid-get-liabilities` | Credit card liabilities for the Dashboard |

Set their secrets and deploy:

```bash
supabase secrets set PLAID_CLIENT_ID=... PLAID_SECRET=... PLAID_ENV=sandbox
supabase functions deploy
```

`PLAID_ENV` can be `sandbox`, `development` or `production`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to Edge Functions automatically.

### 6. Run

```bash
npm run dev       # start the dev server at http://localhost:5173
npm run build     # type-check and build for production
npm run preview   # serve the production build
```

## Project structure

```
src/
├── App.tsx                 Routes and signed-in/out layout
├── pages/
│   ├── Dashboard.tsx       Monthly overview
│   ├── Transactions.tsx    Searchable transaction list
│   ├── Upload.tsx          File import: parse → map columns → preview → import
│   ├── Imports.tsx         Past imports, with bulk delete
│   ├── ConnectBank.tsx     Plaid account linking
│   ├── Budget.tsx          Budget plan
│   └── BudgetVsActual.tsx  Planned vs actual, plus category mapping
├── components/             Shared UI (NavBar, MonthPicker, modals, tables)
└── lib/
    ├── supabase.ts         Shared Supabase client with Clerk token
    ├── fileImport.ts       CSV/Excel parsing and column mapping
    ├── categoryMapping.ts  Transaction category → budget item mappings
    └── paycheck.ts         Income and paycheck deduction calculations
supabase/
├── functions/              Plaid Edge Functions
└── migrations/             SQL migrations
```

## How importing works

1. **Parse:** the file is read into rows. Account-info lines above the real header row are skipped, and so are fully empty columns.
2. **Map columns:** the user matches file columns to Date, Description, Category (optional) and Amount. Amount can be one signed column or separate credit and debit columns. Common header names are matched automatically. The user can also set the date order (MM/DD vs DD/MM) and flip the sign for banks that list charges as positive numbers, such as American Express.
3. **Normalize:** dates become `YYYY-MM-DD`, and amounts like `$1,200.00`, `(4.50)` or `12.00-` are converted to numbers. Rows without a readable date, description or amount are skipped.
4. **Import:** a `csv_imports` row is created, then the transactions are upserted with its `import_id`, skipping duplicates.

## Known limitations

- Column mappings for imports and category mappings on Budget vs Actual are saved in the browser (`localStorage`), so they don't sync across devices yet.
- Budget vs Actual uses the current budget for every month; there's no history of past budget amounts.
- One-off budget items aren't included in Budget vs Actual.
