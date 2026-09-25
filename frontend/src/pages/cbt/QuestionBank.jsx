import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Archive, Eye, Trash2, Edit3, HelpCircle,
  Filter, CheckCircle, BookOpen, Layers, Award
} from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { Loading, EmptyState } from '../../components/ui/Feedback.jsx';

export default function QuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [schoolSection, setSchoolSection] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [type, setType] = useState('');
  const [year, setYear] = useState('');

  // Modals
  const [previewQuestion, setPreviewQuestion] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editQuestion, setEditQuestion] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [search, subject, schoolSection, classLevel, difficulty, type, year]);

  async function loadMeta() {
    try {
      const res = await api.get('/cbt/meta');
      setMeta(res);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadQuestions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (subject) params.append('subject', subject);
      if (schoolSection) params.append('schoolSection', schoolSection);
      if (classLevel) params.append('classLevel', classLevel);
      if (difficulty) params.append('difficulty', difficulty);
      if (type) params.append('type', type);
      if (year) params.append('year', year);
      params.append('isArchived', 'false');

      const res = await api.get(`/cbt/questions?${params.toString()}`);
      setQuestions(res.questions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    setDeleting(true);
    try {
      await api.del(`/cbt/questions/${id}`);
      setDeleteConfirm(null);
      loadQuestions();
    } catch (err) {
      alert(err.message || 'Failed to delete question');
    } finally {
      setDeleting(false);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editQuestion) return;
    setSavingEdit(true);
    try {
      await api.put(`/cbt/questions/${editQuestion.id}`, editQuestion);
      setEditQuestion(null);
      loadQuestions();
    } catch (err) {
      alert(err.message || 'Failed to update question');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="content">
      <PageHeader
        title="Question Bank"
        subtitle="Create, organize, and manage examination questions across school sections"
        actions={
          <div className="row" style={{ gap: '10px' }}>
            <Link to="/question-bank/archive" className="btn btn-outline">
              <Archive size={16} />
              <span>Previous Archive</span>
            </Link>
            <Link to="/question-bank/create" className="btn btn-primary">
              <Plus size={16} />
              <span>New Question</span>
            </Link>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="cbt-filter-bar">
        <div style={{ position: 'relative', flex: '2', minWidth: '0' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ink-3)' }} />
          <input
            type="text"
            className="input"
            style={{ paddingLeft: '36px' }}
            placeholder="Search questions or keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All Subjects</option>
          {(meta?.subjects || []).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select className="select" value={schoolSection} onChange={(e) => setSchoolSection(e.target.value)}>
          <option value="">All Sections</option>
          <option value="primary">Primary School</option>
          <option value="jss">Junior Secondary (JSS)</option>
          <option value="sss">Senior Secondary (SSS)</option>
        </select>

        <select className="select" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
          <option value="">All Levels</option>
          {(meta?.classLevels || []).map((lvl) => (
            <option key={lvl.id} value={lvl.name}>{lvl.name}</option>
          ))}
        </select>

        <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">Any Difficulty</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>

        <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Any Year</option>
          <option value="2026">2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
        </select>

        {(search || subject || schoolSection || classLevel || difficulty || type || year) && (
          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setSearch('');
              setSubject('');
              setSchoolSection('');
              setClassLevel('');
              setDifficulty('');
              setType('');
              setYear('');
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Main Questions List */}
      {loading ? (
        <Loading text="Loading question bank..." />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No questions found"
          body="No questions matched your search criteria. Try modifying your filters or create a new question."
          action={
            <Link to="/question-bank/create" className="btn btn-primary">
              <Plus size={16} /> Create Question
            </Link>
          }
        />
      ) : (
        <div className="card">
          <div className="card-head">
            <div className="row" style={{ justifyContent: 'space-between', width: '100%' }}>
              <div>
                <h3>Questions ({questions.length})</h3>
                <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                  Questions available for continuous assessments and term examinations
                </p>
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>Question</th>
                  <th>Subject & Level</th>
                  <th>Type</th>
                  <th>Difficulty</th>
                  <th>Marks</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '4px' }}>
                        {q.question}
                      </div>
                      {q.options && q.options.length > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--ink-3)' }}>
                          {q.options.length} options · Category: {q.category || 'General'}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{q.subject}</div>
                      <div style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                        {q.classLevel} · {q.schoolSection?.toUpperCase() || 'JSS'}
                      </div>
                    </td>
                    <td>
                      <Badge tone="info">
                        {q.type === 'multiple_choice' ? 'MCQ' : q.type === 'true_false' ? 'T/F' : 'Short'}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        tone={
                          q.difficulty === 'Easy'
                            ? 'ok'
                            : q.difficulty === 'Hard'
                            ? 'danger'
                            : 'warn'
                        }
                      >
                        {q.difficulty}
                      </Badge>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--board)' }}>
                        {q.marks || 1} mark{(q.marks || 1) > 1 ? 's' : ''}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          className="icon-btn"
                          title="Preview Question"
                          onClick={() => setPreviewQuestion(q)}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          title="Edit Question"
                          onClick={() => setEditQuestion({ ...q })}
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          style={{ color: 'var(--danger)' }}
                          title="Delete Question"
                          onClick={() => setDeleteConfirm(q)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Question Preview Modal */}
      {previewQuestion && (
        <Modal title="Question Preview" onClose={() => setPreviewQuestion(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Badge tone="info">{previewQuestion.subject}</Badge>
              <Badge tone="neutral">{previewQuestion.classLevel}</Badge>
              <Badge tone={previewQuestion.difficulty === 'Easy' ? 'ok' : 'warn'}>
                {previewQuestion.difficulty}
              </Badge>
              <Badge tone="neutral">{previewQuestion.marks} marks</Badge>
              <Badge tone="neutral">Year {previewQuestion.year}</Badge>
            </div>

            <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--ink)', padding: '12px 0' }}>
              {previewQuestion.question}
            </div>

            {previewQuestion.options && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-2)' }}>Options:</div>
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
                          ✓ Correct Answer
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {previewQuestion.explanation && (
              <div
                style={{
                  padding: '12px 14px',
                  background: 'var(--paper)',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  border: '1px dashed var(--line-strong)',
                }}
              >
                <strong>Explanation / Teacher Note:</strong> {previewQuestion.explanation}
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

      {/* Question Edit Modal */}
      {editQuestion && (
        <Modal title="Edit Question" wide onClose={() => setEditQuestion(null)}>
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label>Question Text *</label>
              <textarea
                className="textarea"
                rows={3}
                required
                value={editQuestion.question}
                onChange={(e) => setEditQuestion({ ...editQuestion, question: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Subject</label>
                <select
                  className="select"
                  value={editQuestion.subject}
                  onChange={(e) => setEditQuestion({ ...editQuestion, subject: e.target.value })}
                >
                  {(meta?.subjects || []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Class Level</label>
                <select
                  className="select"
                  value={editQuestion.classLevel}
                  onChange={(e) => setEditQuestion({ ...editQuestion, classLevel: e.target.value })}
                >
                  {(meta?.classLevels || []).map((lvl) => (
                    <option key={lvl.id} value={lvl.name}>{lvl.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Difficulty</label>
                <select
                  className="select"
                  value={editQuestion.difficulty}
                  onChange={(e) => setEditQuestion({ ...editQuestion, difficulty: e.target.value })}
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div className="form-group">
                <label>Marks</label>
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={editQuestion.marks}
                  onChange={(e) => setEditQuestion({ ...editQuestion, marks: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* Multiple Choice Options */}
            {editQuestion.type === 'multiple_choice' && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600 }}>Options & Correct Answer</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(editQuestion.options || []).map((opt, idx) => (
                    <div key={idx} className="row" style={{ gap: '10px' }}>
                      <span
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'var(--primary-tint)',
                          color: 'var(--board)',
                          fontWeight: 700,
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <input
                        type="text"
                        className="input"
                        style={{ flex: 1 }}
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...editQuestion.options];
                          newOpts[idx] = e.target.value;
                          setEditQuestion({ ...editQuestion, options: newOpts });
                        }}
                      />
                      <label className="row" style={{ gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="editCorrect"
                          checked={String(editQuestion.correctAnswer) === String(opt) || String(editQuestion.correctAnswer) === String.fromCharCode(65 + idx)}
                          onChange={() => setEditQuestion({ ...editQuestion, correctAnswer: opt })}
                        />
                        <span>Correct</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Explanation / Rationale</label>
              <textarea
                className="textarea"
                rows={2}
                value={editQuestion.explanation || ''}
                onChange={(e) => setEditQuestion({ ...editQuestion, explanation: e.target.value })}
                placeholder="Optional explanation shown to teachers/after grading"
              />
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setEditQuestion(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal title="Delete Question?" onClose={() => setDeleteConfirm(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p>
              Are you sure you want to delete this question?
            </p>
            <div
              style={{
                padding: '12px',
                background: 'var(--danger-tint)',
                borderRadius: '8px',
                fontSize: '14px',
                color: 'var(--danger)',
                fontWeight: 600,
              }}
            >
              «{deleteConfirm.question}»
            </div>
            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                disabled={deleting}
                onClick={() => handleDelete(deleteConfirm.id)}
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
