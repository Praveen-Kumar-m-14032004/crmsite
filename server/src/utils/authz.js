const { collection } = require('./mongo');
const { cached, invalidate } = require('./cache');

// How long a resolved account (role + permissions) may be reused before it is
// re-read from MongoDB. Role edits and user edits invalidate it immediately, so
// this only matters if the API ever runs as several processes.
const ACCESS_TTL_MS = 30_000;

const ADMIN_ROLE_ID = 1;

async function getPermissionsForRole(roleId) {
  const id = Number(roleId);
  if (!id) return [];
  const links = await collection('role_permissions').find({ role_id: id }).toArray();
  if (!links.length) return [];
  const permissions = await collection('permissions')
    .find({ id: { $in: links.map((link) => link.permission_id) } })
    .toArray();
  return permissions.map((permission) => permission.code);
}

function rolePermissionsCached(roleId) {
  return cached(`access:role:${roleId}:`, ACCESS_TTL_MS, () => getPermissionsForRole(roleId));
}

/**
 * Live view of an account straight from the database rather than whatever was
 * baked into the JWT at login. This is what makes a permission change made by an
 * admin apply to signed-in users straight away, and what locks out a user the
 * moment they are deactivated or deleted.
 */
async function resolveAccess(userId) {
  const id = Number(userId);
  if (!id) return null;
  return cached(`access:user:${id}:`, ACCESS_TTL_MS, async () => {
    const user = await collection('users').findOne({ id }, { projection: { password: 0 } });
    if (!user) return null;
    const role = await collection('roles').findOne({ id: user.role_id });
    const permissions = role ? await rolePermissionsCached(role.id) : [];
    return {
      id: user.id,
      name: user.name || null,
      username: user.username,
      email: user.email || null,
      roleId: user.role_id,
      roleName: role?.name || null,
      permissions,
      isActive: Boolean(user.is_active),
    };
  });
}

function invalidateRoleAccess(roleId) {
  if (roleId) invalidate(`access:role:${roleId}:`);
  // Every user of that role is stale as well; users are few, so drop them all.
  invalidate('access:user:');
}

function invalidateUserAccess(userId) {
  invalidate(userId ? `access:user:${userId}:` : 'access:user:');
}

function hasPerm(req, code) {
  return (req.user?.permissions || []).includes(code);
}

/**
 * GST scoping. A role can hold `invoices.<action>` (all invoices) or only
 * `gst_invoices.<action>` (invoices that carry the GST line item). When a caller
 * has the GST-only permission and not the full one, every invoice handler must
 * confine itself to GST bills.
 */
function gstOnly(req, action) {
  return !hasPerm(req, `invoices.${action}`) && hasPerm(req, `gst_invoices.${action}`);
}

module.exports = {
  ADMIN_ROLE_ID,
  getPermissionsForRole,
  resolveAccess,
  invalidateRoleAccess,
  invalidateUserAccess,
  hasPerm,
  gstOnly,
};
