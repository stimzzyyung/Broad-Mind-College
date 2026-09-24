import { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Award, Layers, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading } from '../../components/ui/Feedback.jsx';

export default function ExamLevels() {
  const [categories, setCategories] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);

  // Category Modal
  const [catModal, setCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [catWeight, setCatWeight] = useState(60);

  // Level Modal
  const [lvlModal, setLvlModal] = useState(false);
  const [editingLvl, setEditingLvl] = useState(null);
  const [lvlName, setLvlName] = useState('');
  const [lvlSection, setLvlSection] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [catsRes, lvlsRes] = await Promise.all([
        api.get('/cbt/exam-categories'),
        api.get('/cbt/exam-levels'),
      ]);
      setCategories(catsRes || []);
      setLevels(lvlsRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCategory(e) {
    e.preventDefault();
    try {
      if (editingCat) {
        await api.put(`/cbt/exam-categories/${editingCat.id}`, {
          name: catName,
          code: catCode,
          weight: Number(catWeight),
        });
      } else {
        await api.post('/cbt/exam-categories', {
          name: catName,
          code: catCode,
          weight: Number(catWeight),
        });
      }
      setCatModal(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Operation failed');
    }
  }

  async function handleDeleteCategory(id) {
    if (!window.confirm('Delete this examination category?')) return;
    try {
      await api.del(`/cbt/exam-categories/${id}`);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  }

  async function handleSaveLevel(e) {
    e.preventDefault();
    try {
      if (editingLvl) {
        await api.put(`/cbt/exam-levels/${editingLvl.id}`, {
          name: lvlName,
          sectionId: lvlSection,
        });
      } else {
        await api.post('/cbt/exam-levels', {
          name: lvlName,
          sectionId: lvlSection,
        });
      }
      setLvlModal(false);
      loadData();
    } catch (err) {
      alert(err.message || 'Operation failed');
    }
  }

  async function handleDeleteLevel(id) {
    if (!window.confirm('Delete this examination level?')) return;
    try {
      await api.del(`/cbt/exam-levels/${id}`);
      loadData();
    } catch (err) {
      alert(err.message || 'Failed to delete');
    }
  }

  if (loading) return <Loading text="Loading examination categories and levels..." />;

  return (
    <div className="content">
      <PageHeader
        title="Examination Categories & Levels"
        subtitle="Manage continuous assessments, term examinations, and school-level testing configurations"
        actions={
          <div className="row" style={{ gap: '10px' }}>
            <button
              className="btn btn-outline"
              onClick={() => {
                setEditingCat(null);
                setCatName('');
                setCatCode('');
                setCatWeight(60);
                setCatModal(true);
              }}
            >
              <Plus size={16} /> New Exam Category
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingLvl(null);
                setLvlName('');
                setLvlSection('all');
                setLvlModal(true);
              }}
            >
              <Plus size={16} /> New Exam Level
            </button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        {/* Examination Categories */}
        <div className="card">
          <div className="card-head">
            <h3>Examination Categories ({categories.length})</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
              CA1, CA2, Mid-Term, Term Exams, Mock, and Practice CBT
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
                    <strong style={{ fontSize: '15px' }}>{cat.name}</strong>
                    <Badge tone="info">{cat.code}</Badge>
                  </div>
                  <div style={{ fontSize: '12.5px', color: 'var(--ink-2)', marginTop: '2px' }}>
                    Standard Weight: {cat.weight}%
                  </div>
                </div>

                <div className="row" style={{ gap: '6px' }}>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingCat(cat);
                      setCatName(cat.name);
                      setCatCode(cat.code);
                      setCatWeight(cat.weight);
                      setCatModal(true);
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

        {/* Examination Levels */}
        <div className="card">
          <div className="card-head">
            <h3>Examination Levels ({levels.length})</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
              Primary, Junior Secondary, and Senior Secondary level testing
            </p>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {levels.map((lvl) => (
              <div
                key={lvl.id}
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid var(--line)',
                  background: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong style={{ fontSize: '15px' }}>{lvl.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '2px' }}>
                    Section Scope: {lvl.sectionId?.toUpperCase()}
                  </div>
                </div>

                <div className="row" style={{ gap: '6px' }}>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingLvl(lvl);
                      setLvlName(lvl.name);
                      setLvlSection(lvl.sectionId);
                      setLvlModal(true);
                    }}
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => handleDeleteLevel(lvl.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category Modal */}
      {catModal && (
        <Modal title={editingCat ? 'Edit Exam Category' : 'Create Exam Category'} onClose={() => setCatModal(false)}>
          <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label>Category Name *</label>
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. First Term Examination"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Code</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. TERM1, CA1"
                value={catCode}
                onChange={(e) => setCatCode(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Scoring Weight (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                className="input"
                value={catWeight}
                onChange={(e) => setCatWeight(e.target.value)}
              />
            </div>
            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setCatModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Category</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Level Modal */}
      {lvlModal && (
        <Modal title={editingLvl ? 'Edit Exam Level' : 'Create Exam Level'} onClose={() => setLvlModal(false)}>
          <form onSubmit={handleSaveLevel} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label>Level Name *</label>
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. Junior Secondary Level"
                value={lvlName}
                onChange={(e) => setLvlName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Section Scope</label>
              <select className="select" value={lvlSection} onChange={(e) => setLvlSection(e.target.value)}>
                <option value="all">All School Levels</option>
                <option value="primary">Primary School</option>
                <option value="jss">Junior Secondary</option>
                <option value="sss">Senior Secondary</option>
              </select>
            </div>
            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setLvlModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Level</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
