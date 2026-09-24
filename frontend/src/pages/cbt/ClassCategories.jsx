import { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Layers, CheckCircle2, School, Users, BookOpen } from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading } from '../../components/ui/Feedback.jsx';

export default function ClassCategories() {
  const [categories, setCategories] = useState([]);
  const [levels, setLevels] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Category Modal
  const [categoryModal, setCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catName, setCatName] = useState('');
  const [catSection, setCatSection] = useState('primary');
  const [catDesc, setCatDesc] = useState('');

  // Level Modal
  const [levelModal, setLevelModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState(null);
  const [levelName, setLevelName] = useState('');
  const [levelCategory, setLevelCategory] = useState(1);
  const [levelSection, setLevelSection] = useState('primary');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [catsRes, lvlsRes, classesRes] = await Promise.all([
        api.get('/cbt/class-categories'),
        api.get('/cbt/class-levels'),
        api.get('/classes'),
      ]);
      setCategories(catsRes || []);
      setLevels(lvlsRes || []);
      setClasses(classesRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCategory(e) {
    e.preventDefault();
    try {
      if (editingCategory) {
        await api.put(`/cbt/class-categories/${editingCategory.id}`, {
          name: catName,
          sectionId: catSection,
          description: catDesc,
        });
      } else {
        await api.post('/cbt/class-categories', {
          name: catName,
          sectionId: catSection,
          description: catDesc,
        });
      }
      setCategoryModal(false);
      setEditingCategory(null);
      setCatName('');
      loadData();
    } catch (err) {
      alert(err.message || 'Operation failed');
    }
  }

  async function handleDeleteCategory(id) {
    if (!window.confirm('Are you sure you want to delete this class category?')) return;
    try {
      await api.del(`/cbt/class-categories/${id}`);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  }

  async function handleSaveLevel(e) {
    e.preventDefault();
    try {
      if (editingLevel) {
        await api.put(`/cbt/class-levels/${editingLevel.id}`, {
          name: levelName,
          categoryId: Number(levelCategory),
          sectionId: levelSection,
        });
      } else {
        await api.post('/cbt/class-levels', {
          name: levelName,
          categoryId: Number(levelCategory),
          sectionId: levelSection,
        });
      }
      setLevelModal(false);
      setEditingLevel(null);
      setLevelName('');
      loadData();
    } catch (err) {
      alert(err.message || 'Operation failed');
    }
  }

  if (loading) return <Loading text="Loading school sections and class categories..." />;

  return (
    <div className="content">
      <PageHeader
        title="School Sections & Class Categories"
        subtitle="Manage Primary (1-5), Junior Secondary (JSS1-3), and Senior Secondary (SS1-3) categories and levels"
        actions={
          <div className="row" style={{ gap: '10px' }}>
            <button
              className="btn btn-outline"
              onClick={() => {
                setEditingCategory(null);
                setCatName('');
                setCatSection('primary');
                setCatDesc('');
                setCategoryModal(true);
              }}
            >
              <Plus size={16} /> New Category
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingLevel(null);
                setLevelName('');
                setLevelCategory(categories[0]?.id || 1);
                setLevelSection('primary');
                setLevelModal(true);
              }}
            >
              <Plus size={16} /> New Class Level
            </button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Class Categories List */}
        <div className="card">
          <div className="card-head">
            <h3>Class Categories ({categories.length})</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
              Primary, Junior Secondary, and Senior Secondary
            </p>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid var(--line)',
                  background: '#fff9fc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '15px', color: 'var(--ink)' }}>{cat.name}</strong>
                    <Badge tone="info">{cat.sectionId?.toUpperCase()}</Badge>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-2)', marginTop: '2px' }}>
                    {cat.description || 'School Category'}
                  </div>
                </div>

                <div className="row" style={{ gap: '6px' }}>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingCategory(cat);
                      setCatName(cat.name);
                      setCatSection(cat.sectionId);
                      setCatDesc(cat.description || '');
                      setCategoryModal(true);
                    }}
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => handleDeleteCategory(cat.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Class Levels List */}
        <div className="card">
          <div className="card-head">
            <h3>Class Levels ({levels.length})</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
              Primary 1-5 · JSS 1-3 · SS 1-3
            </p>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
              {levels.map((lvl) => (
                <div
                  key={lvl.id}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid var(--line)',
                    background: '#fff',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--board)' }}>
                    {lvl.name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--ink-3)', marginTop: '2px' }}>
                    {lvl.sectionId?.toUpperCase()} Section
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Class Enrollments & Subject Assignments */}
      <div className="card">
        <div className="card-head">
          <h3>Active Classes & Assignments ({classes.length})</h3>
          <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
            Configured classes across Primary and Secondary divisions
          </p>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Class Name</th>
                <th>Section & Level</th>
                <th>Form Teacher</th>
                <th>Students Enrolled</th>
                <th>Subjects Configured</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => (
                <tr key={cls.id}>
                  <td><strong>{cls.name}</strong></td>
                  <td>
                    <Badge tone={cls.level === 'Primary' ? 'ok' : cls.level === 'Senior' ? 'warn' : 'info'}>
                      {cls.level} Secondary
                    </Badge>
                  </td>
                  <td>{cls.formTeacherName || 'Not Assigned'}</td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{cls.studentCount || 0} students</span>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                      {(cls.subjects || []).length} subjects
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Modal */}
      {categoryModal && (
        <Modal title={editingCategory ? 'Edit Category' : 'Create Class Category'} onClose={() => setCategoryModal(false)}>
          <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label>Category Name *</label>
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. Junior Secondary Section"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>School Section *</label>
              <select className="select" value={catSection} onChange={(e) => setCatSection(e.target.value)}>
                <option value="primary">Primary School</option>
                <option value="jss">Junior Secondary (JSS)</option>
                <option value="sss">Senior Secondary (SSS)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Description</label>
              <input
                type="text"
                className="input"
                placeholder="Description of the category"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
              />
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setCategoryModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Category
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Level Modal */}
      {levelModal && (
        <Modal title={editingLevel ? 'Edit Class Level' : 'Create Class Level'} onClose={() => setLevelModal(false)}>
          <form onSubmit={handleSaveLevel} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label>Level Name *</label>
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. Primary 1, JSS1, SS1"
                value={levelName}
                onChange={(e) => setLevelName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Section *</label>
              <select className="select" value={levelSection} onChange={(e) => setLevelSection(e.target.value)}>
                <option value="primary">Primary School</option>
                <option value="jss">Junior Secondary (JSS)</option>
                <option value="sss">Senior Secondary (SSS)</option>
              </select>
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setLevelModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Level
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
