// categoryMapping.ts
// Links transaction categories (free text from bank imports) to budget items.
// Uncategorized transactions have no category to group by, so they're mapped
// one by one using their transaction id instead.
// Stored in localStorage per user for now — swap loadMappings/saveMappings
// for Supabase calls to sync across devices.

// What a category or transaction can be mapped to:
//   <budget item id>  — counts toward that budget item
//   'income'          — a paycheck or other income, compared against planned income
//   'other'           — catch-all bucket with no planned amount
//   'custom:<name>'   — a user-written bucket with no planned amount
//   'exclude'         — left out entirely (transfers, card payments, etc.)
export type MappingTarget = string

export const INCOME = 'income'
export const OTHER = 'other'
export const EXCLUDE = 'exclude'
const CUSTOM_PREFIX = 'custom:'

export interface CategoryMappings {
  categories: Record<string, MappingTarget>
  transactions: Record<string, MappingTarget>
}

export const UNCATEGORIZED = 'Uncategorized'

export function customTarget(name: string) {
  return CUSTOM_PREFIX + name.trim()
}

// Returns the written-in name, or null if the target isn't a custom bucket
export function customName(target: MappingTarget | undefined) {
  return target?.startsWith(CUSTOM_PREFIX) ? target.slice(CUSTOM_PREFIX.length) : null
}

function storageKey(userId: string) {
  return `category-mappings:${userId}`
}

export function loadMappings(userId: string): CategoryMappings {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '{}')
    // The first version stored category mappings as a flat object
    if (!saved.categories) return { categories: saved, transactions: {} }
    return { categories: saved.categories, transactions: saved.transactions ?? {} }
  } catch {
    return { categories: {}, transactions: {} }
  }
}

export function saveMappings(userId: string, mappings: CategoryMappings) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(mappings))
  } catch {
    // Storage unavailable — mappings just won't persist
  }
}

// Descriptions banks commonly use for direct-deposited pay
const PAYCHECK_PATTERN = /payroll|direct dep|paycheck|salary|\bpay ?roll\b/i

export function looksLikePaycheck(description: string, amount: number) {
  return amount > 0 && PAYCHECK_PATTERN.test(description)
}

// Suggests a budget item when the names obviously match, e.g.
// "Groceries" ↔ "Merchandise & Supplies-Groceries"
export function suggestMapping(category: string, items: { id: string; name: string }[]) {
  const c = category.toLowerCase().trim()
  const exact = items.find(i => i.name.toLowerCase().trim() === c)
  if (exact) return exact.id
  const partial = items.find(i => {
    const n = i.name.toLowerCase().trim()
    return n.length >= 3 && (c.includes(n) || n.includes(c))
  })
  return partial?.id
}
