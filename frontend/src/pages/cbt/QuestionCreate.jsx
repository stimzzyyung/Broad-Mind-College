import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, HelpCircle, CheckCircle2, Eye, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/client.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import Badge from '../../components/ui/Badge.jsx';

export default function QuestionCreate() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [question, setQuestion] = useState('');
  const [type, setType] = useState('multiple_choice');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [schoolSection, setSchoolSection] = useState('jss');
  const [classLevel, setClassLevel] = useState('JSS1');
  const [category, setCategory] = useState('');
  const [year, setYear] = useState('2026');
  const [session, setSession] = useState('2026/2027');
  const [term, setTerm] = useState('First Term');
  const [difficulty, setDifficulty] = useState('Medium');
  const [marks, setMarks] = useState(2);
  const [explanation, setExplanation] = useState('');

  useEffect(() => {
    loadMeta();
  }, []);

  async function loadMeta() {
    try {
      const res = await api.get('/cbt/meta');
      setMeta(res);
      if (res.subjects?.length) setSubject(res.subjects[0]);
    } catch (err) {
      console.error(err);
    }
  }

  // Handle changing question type
  function handleTypeChange(newType) {
    setType(newType);
    if (newType === 'true_false') {
      setOptions(['True', 'False']);
      setCorrectAnswer('True');
    } else if (newType === 'multiple_choice') {
      setOptions(['', '', '', '']);
      setCorrectAnswer('');
    } else {
      setOptions([]);
      setCorrectAnswer('');
    }
  }

  function handleOptionChange(index, val) {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  }

  function addOption() {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  }

  function removeOption(idx) {
    if (options.length > 2) {
      const updated = options.filter((_, i) => i !== idx);
      setOptions(updated);
      if (correctAnswer === options[idx]) {
        setCorrectAnswer('');
      }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!question.trim()) {
      setError('Question text is required');
      return;
    }

    if (type === 'multiple_choice') {
      const filledOptions = options.map((o) => o.trim()).filter(Boolean);
      if (filledOptions.length < 2) {
        setError('Please provide at least 2 options for multiple-choice questions');
        return;
      }
      if (!correctAnswer) {
        setError('Please select the correct answer option');
        return;
      }
    }

    setSaving(true);
    try {
      await api.post('/cbt/questions', {
        question: question.trim(),
        type,
        options: type === 'multiple_choice' || type === 'true_false' ? options.map((o) => o.trim()) : [],
        correctAnswer: String(correctAnswer).trim(),
        subject,
        schoolSection,
        classLevel,
        category: category.trim() || 'General',
        year,
        session,
        term,
        difficulty,
        marks: Number(marks) || 1,
        explanation: explanation.trim(),
      });

      navigate('/question-bank');
    } catch (err) {
      setError(err.message || 'Failed to save question');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content">
      <PageHeader
        title="Create Examination Question"
        subtitle="Add a new question to the centralized Question Bank"
        actions={
          <Link to="/question-bank" className="btn btn-outline">
            <ArrowLeft size={16} /> Back to Bank
          </Link>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '24px' }}>
        {/* Form Column */}
        <div className="card">
          <div className="card-head">
            <h3>Question Details</h3>
            <p style={{ fontSize: '13px', color: 'var(--ink-2)' }}>
              Configure question specifications, options, and grading value
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {error && (
              <div style={{ padding: '12px', background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: '8px', fontSize: '14px' }}>
                {error}
              </div>
            )}

            {/* Classification */}
            <div className="form-row">
              <div className="form-group">
                <label>Subject *</label>
                <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  {(meta?.subjects || ['Mathematics', 'English Language', 'Basic Science', 'Physics']).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>School Section *</label>
                <select
                  className="select"
                  value={schoolSection}
                  onChange={(e) => {
                    const sec = e.target.value;
                    setSchoolSection(sec);
                    if (sec === 'primary') setClassLevel('Primary 1');
                    else if (sec === 'sss') setClassLevel('SS1');
                    else setClassLevel('JSS1');
                  }}
                >
                  <option value="primary">Primary School (P1 - P5)</option>
                  <option value="jss">Junior Secondary (JSS1 - JSS3)</option>
                  <option value="sss">Senior Secondary (SS1 - SS3)</option>
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
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Category / Topic</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Algebra, Grammar, Mechanics"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Question Type *</label>
                <select className="select" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
                  <option value="multiple_choice">Multiple Choice (A, B, C, D)</option>
                  <option value="true_false">True / False</option>
                  <option value="short_answer">Short Answer</option>
                  <option value="theory">Theory / Essay</option>
                </select>
              </div>

              <div className="form-group">
                <label>Difficulty *</label>
                <select className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>

              <div className="form-group">
                <label>Marks *</label>
                <input
                  type="number"
                  min="1"
                  className="input"
                  value={marks}
                  onChange={(e) => setMarks(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Academic Year</label>
                <input
                  type="text"
                  className="input"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2026"
                />
              </div>

              <div className="form-group">
                <label>Session</label>
                <select className="select" value={session} onChange={(e) => setSession(e.target.value)}>
                  <option value="2026/2027">2026/2027</option>
                  <option value="2025/2026">2025/2026</option>
                  <option value="2024/2025">2024/2025</option>
                </select>
              </div>

              <div className="form-group">
                <label>Term</label>
                <select className="select" value={term} onChange={(e) => setTerm(e.target.value)}>
                  <option value="First Term">First Term</option>
                  <option value="Second Term">Second Term</option>
                  <option value="Third Term">Third Term</option>
                  <option value="Final Examination">Final Examination</option>
                </select>
              </div>
            </div>

            {/* Question Text */}
            <div className="form-group">
              <label>Question Text *</label>
              <textarea
                className="textarea"
                rows={4}
                required
                placeholder="Enter the complete question statement..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>

            {/* Multiple Choice Options */}
            {type === 'multiple_choice' && (
              <div>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: '10px' }}>
                  <label style={{ fontWeight: 600 }}>Answer Options & Correct Answer *</label>
                  {options.length < 6 && (
                    <button type="button" className="btn btn-sm btn-outline" onClick={addOption}>
                      <Plus size={14} /> Add Option
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {options.map((opt, idx) => {
                    const letter = String.fromCharCode(65 + idx);
                    return (
                      <div key={idx} className="row" style={{ gap: '10px' }}>
                        <span
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'var(--primary-tint)',
                            color: 'var(--board)',
                            fontWeight: 700,
                            display: 'grid',
                            placeItems: 'center',
                            flex: 'none',
                          }}
                        >
                          {letter}
                        </span>
                        <input
                          type="text"
                          className="input"
                          style={{ flex: 1 }}
                          placeholder={`Option ${letter} text`}
                          value={opt}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                        />
                        <label
                          className="row"
                          style={{
                            gap: '6px',
                            padding: '6px 12px',
                            background: correctAnswer === opt && opt ? 'var(--ok-tint)' : '#fff',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: correctAnswer === opt && opt ? 'var(--ok)' : 'var(--ink)',
                            fontWeight: correctAnswer === opt && opt ? 700 : 500,
                          }}
                        >
                          <input
                            type="radio"
                            name="correctOpt"
                            checked={correctAnswer === opt && opt !== ''}
                            onChange={() => setCorrectAnswer(opt)}
                          />
                          <span>Correct</span>
                        </label>
                        {options.length > 2 && (
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => removeOption(idx)}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* True/False Options */}
            {type === 'true_false' && (
              <div>
                <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Select Correct Truth Value *</label>
                <div className="row" style={{ gap: '16px' }}>
                  {['True', 'False'].map((val) => (
                    <label
                      key={val}
                      className="row"
                      style={{
                        padding: '10px 20px',
                        border: '1.5px solid var(--line)',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: correctAnswer === val ? 'var(--ok-tint)' : '#fff',
                        borderColor: correctAnswer === val ? 'var(--ok)' : 'var(--line)',
                        fontWeight: correctAnswer === val ? 700 : 500,
                      }}
                    >
                      <input
                        type="radio"
                        name="tfOpt"
                        checked={correctAnswer === val}
                        onChange={() => setCorrectAnswer(val)}
                      />
                      <span>{val}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Short Answer */}
            {type === 'short_answer' && (
              <div className="form-group">
                <label>Expected Answer (Exact or keywords)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Enter the expected answer text"
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                />
              </div>
            )}

            {/* Explanation */}
            <div className="form-group">
              <label>Explanation / Marking Guide (Optional)</label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Teacher notes or explanation shown after submission..."
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </div>

            <div className="card-foot" style={{ justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
              <Link to="/question-bank" className="btn btn-outline">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={16} /> {saving ? 'Saving Question...' : 'Save to Question Bank'}
              </button>
            </div>
          </form>
        </div>

        {/* Live Preview Column */}
        <div>
          <div className="card" style={{ position: 'sticky', top: '90px' }}>
            <div className="card-head">
              <div className="row" style={{ gap: '8px' }}>
                <Eye size={18} color="var(--primary)" />
                <h3>Live Preview</h3>
              </div>
              <Badge tone="neutral">Student View</Badge>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Badge tone="info">{subject}</Badge>
                <Badge tone="neutral">{classLevel}</Badge>
                <Badge tone={difficulty === 'Easy' ? 'ok' : difficulty === 'Hard' ? 'danger' : 'warn'}>
                  {difficulty}
                </Badge>
                <Badge tone="neutral">{marks} Marks</Badge>
              </div>

              <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>
                {question || 'Your question text will appear here...'}
              </div>

              {type === 'multiple_choice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {options.map((opt, idx) => {
                    const letter = String.fromCharCode(65 + idx);
                    const isCorrect = correctAnswer === opt && opt !== '';
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 14px',
                          border: isCorrect ? '2px solid var(--ok)' : '1px solid var(--line)',
                          borderRadius: '10px',
                          background: isCorrect ? 'var(--ok-tint)' : '#fff',
                        }}
                      >
                        <div
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
                        </div>
                        <div style={{ flex: 1 }}>{opt || `Option ${letter}`}</div>
                        {isCorrect && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ok)' }}>
                            [Correct]
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {type === 'true_false' && (
                <div className="row" style={{ gap: '12px' }}>
                  {['True', 'False'].map((val) => (
                    <div
                      key={val}
                      style={{
                        flex: 1,
                        padding: '12px',
                        border: correctAnswer === val ? '2px solid var(--ok)' : '1px solid var(--line)',
                        borderRadius: '10px',
                        background: correctAnswer === val ? 'var(--ok-tint)' : '#fff',
                        textAlign: 'center',
                        fontWeight: 600,
                      }}
                    >
                      {val}
                    </div>
                  ))}
                </div>
              )}

              <div
                style={{
                  fontSize: '12.5px',
                  color: 'var(--ink-3)',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--line)',
                }}
              >
                🔒 Students never see correct answers or marking guidelines prior to submission.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
