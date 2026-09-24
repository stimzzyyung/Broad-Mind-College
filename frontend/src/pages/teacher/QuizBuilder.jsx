import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const BLANK_QUESTION = () => ({ question: '', options: ['', '', '', ''], answerIndex: 0 });

export default function QuizBuilder() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const classes = useFetch('/classes');

  const [title, setTitle] = useState('');
  const [type, setType] = useState('Quiz');
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [durationMins, setDurationMins] = useState(15);
  const [dueDate, setDueDate] = useState('');
  const [questions, setQuestions] = useState([BLANK_QUESTION()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const cls = classes.data ? classes.data.find((c) => String(c.id) === String(classId)) : null;
  const mySubjects = cls ? cls.subjects.filter((s) => s.teacherId === user.id) : [];

  useEffect(() => {
    if (cls && !mySubjects.some((s) => s.name === subject)) {
      setSubject(mySubjects[0] ? mySubjects[0].name : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, classes.data]);

  if (classes.loading) return <Loading />;
  if (classes.error) return <ErrorNote message={classes.error} onRetry={classes.reload} />;

  function updateQuestion(i, field, value) {
    setQuestions(questions.map((q, idx) => (idx === i ? { ...q, [field]: value } : q)));
  }
  function updateOption(qi, oi, value) {
    setQuestions(questions.map((q, idx) => (
      idx === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) } : q
    )));
  }
  function addQuestion() {
    setQuestions([...questions, BLANK_QUESTION()]);
  }
  function removeQuestion(i) {
    setQuestions(questions.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!classId || !subject) return setError('Choose a class and a subject you teach');
    setBusy(true);
    try {
      const created = await api.post('/lms/quizzes', { title, type, classId, subject, durationMins, dueDate, questions });
      toast.success(`"${created.title}" was created`);
      navigate('/teacher/lms');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="New quiz or test" subtitle="Build a multiple-choice quiz or test for one of your classes." />

      <form onSubmit={handleSubmit} className="stack" style={{ gap: 20 }}>
        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="q-title">Title</label>
              <input id="q-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="q-type">Type</label>
              <select id="q-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
                <option>Quiz</option>
                <option>Test</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-class">Class</label>
              <select id="q-class" className="select" value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="">Choose a class…</option>
                {classes.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-subject">Subject</label>
              <select id="q-subject" className="select" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!classId} required>
                <option value="">Choose a subject…</option>
                {mySubjects.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              {cls && mySubjects.length === 0 && <span className="hint">You do not teach any subject in this class.</span>}
            </div>
            <div className="field">
              <label htmlFor="q-duration">Duration (minutes)</label>
              <input id="q-duration" type="number" min="1" className="input" value={durationMins} onChange={(e) => setDurationMins(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="q-due">Due date (optional)</label>
              <input id="q-due" type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          {questions.map((q, qi) => (
            <div className="builder-q" key={qi}>
              <div className="card-head">
                <h3>Question {qi + 1}</h3>
                {questions.length > 1 && (
                  <button type="button" className="icon-btn" onClick={() => removeQuestion(qi)} aria-label={`Remove question ${qi + 1}`}><Trash2 size={16} /></button>
                )}
              </div>
              <div className="field">
                <label htmlFor={`q-text-${qi}`}>Question text</label>
                <input id={`q-text-${qi}`} className="input" value={q.question} onChange={(e) => updateQuestion(qi, 'question', e.target.value)} required />
              </div>
              <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                {q.options.map((opt, oi) => (
                  <label className="builder-opt" key={oi}>
                    <input
                      type="radio" name={`answer-${qi}`} checked={q.answerIndex === oi}
                      onChange={() => updateQuestion(qi, 'answerIndex', oi)}
                    />
                    <input
                      className="input" placeholder={`Option ${oi + 1}`} value={opt}
                      onChange={(e) => updateOption(qi, oi, e.target.value)} required
                    />
                  </label>
                ))}
              </div>
              <span className="hint">Select the radio button next to the correct option.</span>
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-outline" onClick={addQuestion}><Plus size={17} />Add another question</button>

        {error && <div className="error-note" role="alert">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/teacher/lms')}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}><Save size={17} />{busy ? 'Creating…' : `Create ${type.toLowerCase()}`}</button>
        </div>
      </form>
    </>
  );
}
