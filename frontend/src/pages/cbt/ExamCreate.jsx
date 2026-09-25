import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, CheckCircle, Search, HelpCircle, BookOpen, Layers } from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { Loading } from '../../components/ui/Feedback.jsx';

export default function ExamCreate() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [bankQuestions, setBankQuestions] = useState([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form Fields
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('2026');
  const [session, setSession] = useState('2026/2027');
  const [term, setTerm] = useState('First Term');
  const [schoolSection, setSchoolSection] = useState('jss');
  const [classCategory, setClassCategory] = useState('Junior Secondary Section');
  const [classLevel, setClassLevel] = useState('JSS1');
  const [classId, setClassId] = useState('');
  const [examLevel, setExamLevel] = useState('Junior Secondary Level');
  const [examCategory, setExamCategory] = useState('First Term Examination');
  const [subject, setSubject] = useState('Mathematics');
  const [durationMins, setDurationMins] = useState(60);
  const [openingDate, setOpeningDate] = useState(new Date().toISOString().slice(0, 10));
  const [openingTime, setOpeningTime] = useState('08:00');
  const [closingDate, setClosingDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [closingTime, setClosingTime] = useState('17:00');
  const [studentAccessTime, setStudentAccessTime] = useState('Permitted during opening window');
  const [instructions, setInstructions] = useState(
    'Answer all questions. Once submitted, answers cannot be edited. Server time controls your countdown.'
  );
  const [status, setStatus] = useState('scheduled');
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [resultCalculationMethod, setResultCalculationMethod] = useState('highest');

  // Question selection filter
  const [bankSearch, setBankSearch] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [metaRes, questionsRes] = await Promise.all([
        api.get('/cbt/meta'),
        api.get('/cbt/questions'),
      ]);
      setMeta(metaRes);
      setBankQuestions(questionsRes.questions || []);

      // Check if preselected questions came from Archive
      const preselected = sessionStorage.getItem('cbt_preselected_questions');
      if (preselected) {
        try {
          const ids = JSON.parse(preselected);
          setSelectedQuestionIds(ids);
          sessionStorage.removeItem('cbt_preselected_questions');
        } catch (e) {}
      }

      if (metaRes.classes?.length) {
        const defaultClass = metaRes.classes.find((c) => c.name.includes('JSS 1')) || metaRes.classes[0];
        setClassId(defaultClass.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function toggleQuestionSelection(id) {
    if (selectedQuestionIds.includes(id)) {
      setSelectedQuestionIds(selectedQuestionIds.filter((item) => item !== id));
    } else {
      setSelectedQuestionIds([...selectedQuestionIds, id]);
    }
  }

  // Filter available question bank items based on subject/class
  const filteredBank = bankQuestions.filter((q) => {
    if (bankSearch) {
      const s = bankSearch.toLowerCase();
      if (!q.question.toLowerCase().includes(s) && !q.subject.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const totalCalculatedMarks = selectedQuestionIds.reduce((sum, qId) => {
    const q = bankQuestions.find((item) => item.id === qId);
    return sum + (q?.marks || 1);
  }, 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please provide an Examination Title');
      return;
    }
    if (!openingDate || !closingDate) {
      setError('Opening and closing dates are required');
      return;
    }
    if (selectedQuestionIds.length === 0) {
      setError('Please select at least 1 question from the Question Bank');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        year,
        session,
        term,
        schoolSection,
        classCategory,
        classLevel,
        classId: classId ? Number(classId) : null,
        examLevel,
        examCategory,
        subject,
        durationMins: Number(durationMins) || 60,
        totalMarks: totalCalculatedMarks,
        numberQuestions: selectedQuestionIds.length,
        openingDate,
        openingTime,
        closingDate,
        closingTime,
        studentAccessTime,
        instructions,
        status,
        maxAttempts: Number(maxAttempts) || 1,
        resultCalculationMethod,
        questionIds: selectedQuestionIds,
      };

      const res = await api.post('/cbt/exams', payload);
      navigate(`/exams/${res.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create examination');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading text="Preparing examination creator..." />;

  return (
    <div className="content">
      <PageHeader
        title="Create CBT Examination"
        subtitle="Set up a new server-controlled computer-based examination"
        actions={
          <Link to="/exams" className="btn btn-outline">
            <ArrowLeft size={16} /> Back to Exams
          </Link>
        }
      />

      <form onSubmit={handleSubmit}>
        <div className="cbt-builder-layout">
          {/* Left: Exam Parameters */}
          <div className="card">
            <div className="card-head">
              <h3>Examination Specifications</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                Set scheduling, duration, section, and access control parameters
              </p>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {error && (
                <div style={{ padding: '12px', background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: '8px', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              {/* Examination Title */}
              <div className="form-group">
                <label>Examination Title *</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. 2026 First Term Mathematics CBT"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Subject & Academic Context */}
              <div className="form-row">
                <div className="form-group">
                  <label>Subject *</label>
                  <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                    {(meta?.subjects || []).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Academic Year</label>
                  <select className="select" value={year} onChange={(e) => setYear(e.target.value)}>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Academic Session</label>
                  <select className="select" value={session} onChange={(e) => setSession(e.target.value)}>
                    {(meta?.sessions || ['2026/2027']).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Term</label>
                  <select className="select" value={term} onChange={(e) => setTerm(e.target.value)}>
                    {(meta?.terms || ['First Term', 'Second Term', 'Third Term']).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* School Section & Class */}
              <div className="form-row">
                <div className="form-group">
                  <label>School Section *</label>
                  <select
                    className="select"
                    value={schoolSection}
                    onChange={(e) => {
                      const sec = e.target.value;
                      setSchoolSection(sec);
                      if (sec === 'primary') {
                        setClassCategory('Primary Section');
                        setClassLevel('Primary 1');
                        setExamLevel('Primary School Level');
                      } else if (sec === 'sss') {
                        setClassCategory('Senior Secondary Section');
                        setClassLevel('SS1');
                        setExamLevel('Senior Secondary Level');
                      } else {
                        setClassCategory('Junior Secondary Section');
                        setClassLevel('JSS1');
                        setExamLevel('Junior Secondary Level');
                      }
                    }}
                  >
                    <option value="primary">Primary School (Primary 1 - 5)</option>
                    <option value="jss">Junior Secondary (JSS 1 - 3)</option>
                    <option value="sss">Senior Secondary (SS 1 - 3)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Class Level *</label>
                  <select className="select" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
                    {schoolSection === 'primary' && (
                      <>
                        <option value="Primary 1">Primary 1</option>
                        <option value="Primary 2">Primary 2</option>
                        <option value="Primary 3">Primary 3</option>
                        <option value="Primary 4">Primary 4</option>
                        <option value="Primary 5">Primary 5</option>
                      </>
                    )}
                    {schoolSection === 'jss' && (
                      <>
                        <option value="JSS1">JSS1</option>
                        <option value="JSS2">JSS2</option>
                        <option value="JSS3">JSS3</option>
                      </>
                    )}
                    {schoolSection === 'sss' && (
                      <>
                        <option value="SS1">SS1</option>
                        <option value="SS2">SS2</option>
                        <option value="SS3">SS3</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="form-group">
                  <label>Assigned Class</label>
                  <select className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                    {(meta?.classes || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Exam Category</label>
                  <select className="select" value={examCategory} onChange={(e) => setExamCategory(e.target.value)}>
                    {(meta?.examCategories || []).map((ec) => (
                      <option key={ec.id} value={ec.name}>{ec.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Timing & Duration */}
              <div className="form-row">
                <div className="form-group">
                  <label>Duration (Minutes) *</label>
                  <input
                    type="number"
                    min="5"
                    max="300"
                    required
                    className="input"
                    value={durationMins}
                    onChange={(e) => setDurationMins(Number(e.target.value))}
                  />
                </div>

                <div className="form-group">
                  <label>Maximum Attempts</label>
                  <select
                    className="select"
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  >
                    <option value={1}>1 Attempt (Default Strict)</option>
                    <option value={2}>2 Attempts</option>
                    <option value={3}>3 Attempts</option>
                    <option value={5}>5 Attempts (Practice)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Scoring Method</label>
                  <select
                    className="select"
                    value={resultCalculationMethod}
                    onChange={(e) => setResultCalculationMethod(e.target.value)}
                  >
                    <option value="highest">Highest Score</option>
                    <option value="latest">Latest Attempt</option>
                    <option value="first">First Attempt</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="scheduled">Scheduled</option>
                    <option value="active">Active (Open immediately)</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              {/* Schedule Windows */}
              <div className="form-row">
                <div className="form-group">
                  <label>Opening Date *</label>
                  <input
                    type="date"
                    required
                    className="input"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Opening Time *</label>
                  <input
                    type="time"
                    required
                    className="input"
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Closing Date *</label>
                  <input
                    type="date"
                    required
                    className="input"
                    value={closingDate}
                    onChange={(e) => setClosingDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Closing Time *</label>
                  <input
                    type="time"
                    required
                    className="input"
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Instructions */}
              <div className="form-group">
                <label>Instructions to Students</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <Link to="/exams" className="btn btn-outline">Cancel</Link>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Save size={16} /> {saving ? 'Creating Examination...' : 'Create Examination'}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Select Questions from Bank */}
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-head">
              <div>
                <h3>Select Questions</h3>
                <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
                  {selectedQuestionIds.length} question(s) selected · {totalCalculatedMarks} total marks
                </p>
              </div>
              <Badge tone="ok">{selectedQuestionIds.length} Selected</Badge>
            </div>

            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink-3)' }} />
                <input
                  type="text"
                  className="input"
                  style={{ paddingLeft: '32px' }}
                  placeholder="Filter available questions..."
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                />
              </div>

              <div style={{ maxHeight: '520px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredBank.map((q) => {
                  const isChecked = selectedQuestionIds.includes(q.id);
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleQuestionSelection(q.id)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: isChecked ? '2px solid var(--primary)' : '1px solid var(--line)',
                        background: isChecked ? '#fff7fa' : '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div className="row" style={{ justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleQuestionSelection(q.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>{q.subject}</span>
                          <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>({q.classLevel})</span>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--board)' }}>
                          {q.marks || 1} mark(s)
                        </span>
                      </div>

                      <div style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.4 }}>
                        {q.question}
                      </div>

                      {q.options && (
                        <div style={{ fontSize: '12px', color: 'var(--ink-3)', marginTop: '4px' }}>
                          {q.options.length} options · {q.difficulty}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {filteredBank.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-3)' }}>
                  No matching questions found in question bank.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
          <Link to="/exams" className="btn btn-outline">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={16} /> {saving ? 'Creating Examination...' : 'Create Examination'}
          </button>
        </div>
      </form>
    </div>
  );
}
