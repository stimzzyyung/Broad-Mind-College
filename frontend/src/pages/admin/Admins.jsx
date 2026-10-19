import { useState } from 'react';
import { ShieldCheck, UserPlus, Search, Pencil, Trash2, Key, UserX, UserCheck, Shield, Mail, Phone, Calendar } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { initials, formatDate } from '../../utils/format.js';

export default function Admins() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const { data: admins, loading, error, reload } = useFetch('/admins');

  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    name: '',
    email: '',
    phone: '',
    qualification: 'Administrator',
    password: '',
  });
  const [addBusy, setAddBusy] = useState(false);

  // Edit modal
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', qualification: '', newPassword: '' });
  const [editBusy, setEditBusy] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const totalAdmins = admins.length;
  const activeAdmins = admins.filter((a) => a.status === 'active').length;
  const q = search.toLowerCase();

  const filteredAdmins = admins.filter(
    (a) =>
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.schoolId && a.schoolId.toLowerCase().includes(q)) ||
      (a.qualification && a.qualification.toLowerCase().includes(q))
  );

  function generateRandomPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewAdmin((prev) => ({ ...prev, password: pwd }));
    toast.success('Generated secure password');
  }

  async function handleAddAdmin(e) {
    e.preventDefault();
    setAddBusy(true);
    try {
      await api.post('/admins', newAdmin);
      toast.success(`Administrator account for ${newAdmin.name} created successfully!`);
      setAddModalOpen(false);
      setNewAdmin({ name: '', email: '', phone: '', qualification: 'Administrator', password: '' });
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAddBusy(false);
    }
  }

  function openEdit(admin) {
    setEditingAdmin(admin);
    setEditForm({
      name: admin.name || '',
      phone: admin.phone || '',
      qualification: admin.qualification || 'Administrator',
      newPassword: '',
    });
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingAdmin) return;
    setEditBusy(true);
    try {
      const payload = {
        name: editForm.name,
        phone: editForm.phone,
        qualification: editForm.qualification,
      };
      if (editForm.newPassword) {
        payload.password = editForm.newPassword;
      }
      await api.put(`/admins/${editingAdmin.id}`, payload);
      toast.success('Administrator updated successfully');
      setEditingAdmin(null);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEditBusy(false);
    }
  }

  async function toggleStatus(admin) {
    const newStatus = admin.status === 'active' ? 'suspended' : 'active';
    const actionLabel = newStatus === 'active' ? 'activate' : 'suspend';
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${admin.name}'s account?`)) return;

    try {
      await api.put(`/admins/${admin.id}`, { status: newStatus });
      toast.success(`Account has been ${newStatus === 'active' ? 'activated' : 'suspended'}`);
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(admin) {
    if (!window.confirm(`Delete administrator "${admin.name}"? This action cannot be undone.`)) return;

    try {
      await api.del(`/admins/${admin.id}`);
      toast.success('Administrator removed');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <PageHeader
        title="Administrators"
        subtitle="Manage school administrator accounts, add new admins, and manage system access."
      />

      <div className="grid grid-stats" style={{ marginBottom: 20 }}>
        <StatCard icon={ShieldCheck} label="Total Administrators" value={totalAdmins} tone="primary" />
        <StatCard icon={UserCheck} label="Active Admins" value={activeAdmins} tone="ok" />
        <StatCard icon={Shield} label="Your Account" value={currentUser.name} hint={`Logged in as ${currentUser.role}`} tone="brass" />
      </div>

      <div className="filters" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div className="search">
          <Search size={17} />
          <input
            className="input"
            placeholder="Search admins by name, email or ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search admins"
          />
        </div>
        <button className="btn btn-primary" onClick={() => setAddModalOpen(true)}>
          <UserPlus size={16} /> Add Administrator
        </button>
      </div>

      {filteredAdmins.length === 0 ? (
        <div className="card">
          <EmptyState icon={Shield} title="No administrators found" text="No admins match your search criteria." />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Staff ID</th>
                <th>Designation / Role</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Date Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.map((admin) => {
                const isCurrent = Number(admin.id) === Number(currentUser.id);
                return (
                  <tr key={admin.id}>
                    <td>
                      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                        <div className="avatar avatar-sm" style={{ background: 'var(--board)', color: '#fff' }}>
                          {initials(admin.name)}
                        </div>
                        <div>
                          <div className="strong" style={{ display: 'flex', alignItems: 'center' }}>
                            {admin.name}
                            {isCurrent && <span className="admin-badge-you">You</span>}
                          </div>
                          <div className="sub small muted">{admin.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{admin.schoolId || '—'}</span>
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                        {admin.qualification || 'Administrator'}
                      </span>
                    </td>
                    <td>
                      <div className="small">
                        {admin.phone ? (
                          <div className="row" style={{ alignItems: 'center', gap: 4 }}>
                            <Phone size={12} className="muted" /> {admin.phone}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Badge tone={admin.status === 'active' ? 'ok' : 'danger'}>
                        {admin.status === 'active' ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td className="nowrap small muted">
                      {admin.createdAt ? formatDate(admin.createdAt) : '—'}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => openEdit(admin)}
                          title="Edit details or password"
                        >
                          <Pencil size={15} />
                        </button>

                        {!isCurrent && (
                          <>
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ color: admin.status === 'active' ? 'var(--warn)' : 'var(--ok)' }}
                              onClick={() => toggleStatus(admin)}
                              title={admin.status === 'active' ? 'Suspend Account' : 'Activate Account'}
                            >
                              {admin.status === 'active' ? <UserX size={15} /> : <UserCheck size={15} />}
                            </button>

                            <button
                              type="button"
                              className="icon-btn"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => handleDelete(admin)}
                              disabled={activeAdmins <= 1 && admin.status === 'active'}
                              title="Delete Administrator"
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Administrator Modal */}
      {addModalOpen && (
        <Modal title="Add New Administrator" onClose={() => setAddModalOpen(false)}>
          <form onSubmit={handleAddAdmin} className="stack" style={{ gap: 14 }}>
            <p className="muted small">
              Create an administrative account with access to school settings, fee verification, student/teacher management, and examinations.
            </p>

            <div className="field">
              <label htmlFor="adm-name">Full Name <span style={{ color: 'var(--danger)' }}>*</span></label>
              <input
                id="adm-name"
                className="input"
                placeholder="e.g. Dr. Jane Smith"
                value={newAdmin.name}
                onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                required
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="adm-email">Email Address <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input
                  id="adm-email"
                  type="email"
                  className="input"
                  placeholder="admin@broadmind.edu"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="adm-phone">Phone Number</label>
                <input
                  id="adm-phone"
                  className="input"
                  placeholder="e.g. 08012345678"
                  value={newAdmin.phone}
                  onChange={(e) => setNewAdmin({ ...newAdmin, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="adm-role">Designation / Role Title</label>
              <input
                id="adm-role"
                className="input"
                placeholder="e.g. Vice Principal, Accountant, IT Admin"
                value={newAdmin.qualification}
                onChange={(e) => setNewAdmin({ ...newAdmin, qualification: e.target.value })}
              />
            </div>

            <div className="field">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="adm-pwd">Password <span style={{ color: 'var(--danger)' }}>*</span></label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '0 6px', fontSize: 12 }}
                  onClick={generateRandomPassword}
                >
                  <Key size={12} /> Auto-generate
                </button>
              </div>
              <input
                id="adm-pwd"
                type="text"
                className="input"
                placeholder="At least 6 characters"
                value={newAdmin.password}
                onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                required
                minLength={6}
              />
            </div>

            <div className="form-actions" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setAddModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={addBusy}>
                <UserPlus size={16} />
                {addBusy ? 'Creating…' : 'Create Administrator'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Administrator Modal */}
      {editingAdmin && (
        <Modal title={`Edit ${editingAdmin.name}`} onClose={() => setEditingAdmin(null)}>
          <form onSubmit={handleSaveEdit} className="stack" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="edit-name">Full Name</label>
              <input
                id="edit-name"
                className="input"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="edit-phone">Phone Number</label>
                <input
                  id="edit-phone"
                  className="input"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="edit-role">Designation / Role Title</label>
                <input
                  id="edit-role"
                  className="input"
                  value={editForm.qualification}
                  onChange={(e) => setEditForm({ ...editForm, qualification: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="edit-pwd">Reset Password (leave empty to keep current)</label>
              <input
                id="edit-pwd"
                type="password"
                className="input"
                placeholder="New password (optional)"
                value={editForm.newPassword}
                onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                minLength={6}
              />
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditingAdmin(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={editBusy}>
                {editBusy ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
