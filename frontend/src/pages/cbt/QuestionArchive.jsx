import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Archive, Search, Copy, Plus, Eye, CheckSquare, Square,
  ArrowRight, ShieldCheck, HelpCircle, BookOpen, Layers
} from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading, EmptyState } from '../../components/ui/Feedback.jsx';

export default function QuestionArchive() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('2025');
  const [subject, setSubject] = useState('');
  const [schoolSection, setSchoolSection] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [category, setCategory] = useState('');

  // Selection
  const [selectedIds, setSelectedIds] = useState([]);
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadArchiveQuestions();
  }, [search, year, subject, schoolSection, classLevel, category]);

  async function loadMeta() {
    try {
      const res = await api.get('/cbt/meta');
      setMeta(res);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadArchiveQuestions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (year) params.append('year', year);
      if (subject) params.append('subject', subject);
      if (schoolSection) params.append('schoolSection', schoolSection);
      if (classLevel) params.append('classLevel', classLevel);
      if (category) params.append('category', category);

      const res = await api.get(`/cbt/questions/archive?${params.toString()}`);
      setQuestions(res.questions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  function toggleSelectAll() {
    if (selectedIds.length === questions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(questions.map((q) => q.id));
    }
  }

  // Copy selected to current 2026 Question Bank
  async function handleCopyToBank() {
    if (selectedIds.length === 0) return;
    setCopying(true);
    setCopySuccess('');
    try {
      const res = await api.post('/cbt/questions/copy', {
        questionIds: selectedIds,
        targetYear: '2026',
        targetSession: '2026/2027',
        targetTerm: 'First Term',
      });
      setCopySuccess(res.message);
      setSelectedIds([]);
    } catch (err) {
      alert(err.message || 'Failed to copy questions');
    } finally {
      setCopying(false);
    }
  }

  // Create new examination directly using the selected previous questions
  function handleCreateExamWithSelected() {
    if (selectedIds.length === 0) return;
    // Pass selected question ids in state or session
    sessionStorage.setItem('cbt_preselected_questions', JSON.stringify(selectedIds));
    navigate('/exams/create');
  }

  return (
    <div className="content">
      <PageHeader
        title="Previous Questions Archive"
        subtitle="Search, filter, and reuse questions from previous academic sessions"
        actions={
          <div className="row" style={{ gap: '10px' }}>
            <Link to="/question-bank" className="btn btn-outline">
              Question Bank
            </Link>
            <button
              className="btn btn-primary"
              disabled={selectedIds.length === 0 || copying}
              onClick={handleCopyToBank}
            >
              <Copy size={16} />
              <span>{copying ? 'Copying...' : `Copy Selected (${selectedIds.length}) to Bank`}</span>
            </button>
            <button
              className="btn btn-outline"
              disabled={selectedIds.length === 0}
              onClick={handleCreateExamWithSelected}
            >
              <span>Use in New Exam</span>
              <ArrowRight size={16} />
            </button>
          </div>
        }
      />

      {/* Immutability Notice Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 18px',
          background: '#fff0f6',
          border: '1.5px solid var(--line-strong)',
          borderRadius: '12px',
          marginBottom: '20px',
        }}
      >
        <ShieldCheck size={24} color="var(--primary)" style={{ flex: 'none' }} />
        <div style={{ fontSize: '13.5px', color: 'var(--ink)' }}>
          <strong>Original Question Integrity Guaranteed:</strong> Reusing archived questions creates
          an independent copy. Editing copied questions in the Question Bank or within an examination will
          <strong> never modify the original archived record</strong>.
        </div>
      </div>

      {copySuccess && (
        <div
          style={{
            padding: '12px 18px',
            background: 'var(--ok-tint)',
            color: 'var(--ok)',
            borderRadius: '10px',
            fontWeight: 600,
            marginBottom: '16px',
          }}
        >
          ✓ {copySuccess}
        </div>
      )}

      {/* Filters */}
      <div className="cbt-filter-bar">
        <div style={{ position: 'relative', flex: '2', minWidth: '0' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-3)' }} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search previous questions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All Archive Years</option>
          <option value="2025">2025 Archive</option>
          <option value="2024">2024 Archive</option>
          <option value="2023">2023 Archive</option>
        </select>

        <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All Subjects</option>
          {(meta?.subjects || []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select className="select" value={schoolSection} onChange={(e) => setSchoolSection(e.target.value)}>
          <option value="">All Sections</option>
          <option value="primary">Primary School</option>
          <option value="jss">Junior Secondary</option>
          <option value="sss">Senior Secondary</option>
        </select>

        <select className="select" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
          <option value="">All Levels</option>
          {(meta?.classLevels || []).map((lvl) => (
            <option key={lvl.id} value={lvl.name}>{lvl.name}</option>
          ))}
        </select>

        {(search || subject || schoolSection || classLevel || category || year !== '2025') && (
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setSearch('');
              setYear('2025');
              setSubject('');
              setSchoolSection('');
              setClassLevel('');
              setCategory('');
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Main Archive Table */}
      {loading ? (
        <Loading text="Loading archived questions..." />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="No archived questions found"
          body="No archived questions matched your search criteria. Try selecting another archive year or subject."
        />
      ) : (
        <div className="card">
          <div className="card-head">
            <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
              <div className="row" style={{ gap: '12px' }}>
                <button
                  type="button"
                  className="icon-btn"
                  title={selectedIds.length === questions.length ? 'Deselect All' : 'Select All'}
                  onClick={toggleSelectAll}
                >
                  {selectedIds.length === questions.length ? (
                    <CheckSquare size={19} color="var(--primary)" />
                  ) : (
                    <Square size={19} />
                  )}
                </button>
                <div>
                  <h3>Archive Records ({questions.length})</h3>
                  <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                    {selectedIds.length} question(s) selected
                  </p>
                </div>
              </div>

              {selectedIds.length > 0 && (
                <div className="row" style={{ gap: '8px' }}>
                  <button className="btn btn-sm btn-primary" onClick={handleCopyToBank}>
                    <Copy size={14} /> Copy to 2026 Bank
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={handleCreateExamWithSelected}>
                    Create Exam with Selected
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th style={{ width: '45%' }}>Question</th>
                  <th>Subject & Level</th>
                  <th>Archive Year</th>
                  <th>Category</th>
                  <th>Marks</th>
                  <th style={{ textAlign: 'right' }}>Preview</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => {
                  const isChecked = selectedIds.includes(q.id);
                  return (
                    <tr
                      key={q.id}
                      style={{ background: isChecked ? '#fff7fa' : 'transparent', cursor: 'pointer' }}
                      onClick={() => toggleSelect(q.id)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(q.id)}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '3px' }}>
                          {q.question}
                        </div>
                        {q.options && q.options.length > 0 && (
                          <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
                            {q.options.length} options · Correct: {q.correctAnswer}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{q.subject}</div>
                        <div style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                          {q.classLevel}
                        </div>
                      </td>
                      <td>
                        <Badge tone="warn">{q.year || '2025'}</Badge>
                      </td>
                      <td>{q.category || 'General'}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{q.marks || 1} mark(s)</span>
                      </td>
                      <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="icon-btn"
                          title="Preview Question"
                          onClick={() => setPreviewQuestion(q)}
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewQuestion && (
        <Modal title="Archived Question Preview" onClose={() => setPreviewQuestion(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge tone="warn">Archive Year {previewQuestion.year}</Badge>
              <Badge tone="info">{previewQuestion.subject}</Badge>
              <Badge tone="neutral">{previewQuestion.classLevel}</Badge>
              <Badge tone="neutral">{previewQuestion.marks} marks</Badge>
            </div>

            <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--ink)', padding: '12px 0' }}>
              {previewQuestion.question}
            </div>

            {previewQuestion.options && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Archived Options:</div>
                {previewQuestion.options.map((opt, idx) => {
                  const letter = String.fromCharCode(65 + idx);
                  const isCorrect = String(previewQuestion.correctAnswer) === String(opt) || String(previewQuestion.correctAnswer) === letter;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: isCorrect ? '2px solid var(--ok)' : '1px solid var(--line)',
                        background: isCorrect ? 'var(--ok-tint)' : '#fff',
                      }}
                    >
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: isCorrect ? 'var(--ok)' : '#fdf2f7',
                          color: isCorrect ? '#fff' : 'var(--ink)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                        }}
                      >
                        {letter}
                      </span>
                      <span style={{ flex: 1, fontWeight: isCorrect ? 600 : 400 }}>{opt}</span>
                      {isCorrect && (
                        <span style={{ fontSize: '12px', color: 'var(--ok)', fontWeight: 700 }}>
                          ✓ Original Answer
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="card-foot" style={{ justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="btn btn-outline" onClick={() => setPreviewQuestion(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
