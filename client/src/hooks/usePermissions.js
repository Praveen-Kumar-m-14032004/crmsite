import { useAuth } from './AuthContext';

// Thin convenience wrapper so pages can `const can = usePermissions()` and call `can('invoices.edit')`.
export function usePermissions() {
  const { hasPermission } = useAuth();
  return hasPermission;
}
