function userFromRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    role: row.role,
    schoolId: row.school_id,
    name: row.name,
    email: row.email || '',
    password: row.password,
    phone: row.phone || '',
    gender: row.gender,
    dob: row.dob,
    classId: row.class_id === null ? null : Number(row.class_id),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    guardianName: row.guardian_name || '',
    guardianPhone: row.guardian_phone || '',
    address: row.address || '',
    bio: row.bio || '',
    qualification: row.qualification || '',
    status: row.status || 'active',
    createdAt: row.created_at,
  };
}

function settingsFromRow(row) {
  if (!row) return null;
  return {
    schoolName: row.school_name,
    motto: row.motto,
    session: row.session,
    term: row.term,
    address: row.address || '',
    phone: row.phone || '',
    email: row.email || '',
  };
}

async function getSettings(pool) {
  const [rows] = await pool.query('SELECT * FROM settings ORDER BY id LIMIT 1');
  return settingsFromRow(rows[0]);
}

async function getPortalConfig(executor, key) {
  const [rows] = await executor.execute('SELECT config_value FROM portal_config WHERE config_key = ? LIMIT 1', [key]);
  return rows[0]?.config_value || null;
}

module.exports = { userFromRow, settingsFromRow, getSettings, getPortalConfig };
