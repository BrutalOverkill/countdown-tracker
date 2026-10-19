/** The key the functions use to reach the database: an explicit SERVICE_KEY secret wins over the injected default. */
export function serviceKey(get: (name: string) => string | undefined): string | undefined {
  return get('SERVICE_KEY') || get('SUPABASE_SERVICE_ROLE_KEY') || undefined;
}
