import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import { Loading, ErrorNote } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export default function TakeQuiz() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/lms/quizzes/${quizId}`);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // filled in after submit

  useEffect(() => {
    if (data && !data.submission) {
      setAnswers(new Array(data.questions.length).fill(null));
      setSecondsLeft(data.durationMins * 60);
    }
  }, [data]);

  // Countdown timer — auto-submits when it reaches zero
  useEffect(() => {
    if (secondsLeft === null || data?.submission) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={reload} />;

  const submission = result?.submission || data.submission;

  function selectAnswer(qi, oi) {
    setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)));
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/lms/quizzes/${quizId}/submit`, { answers });
      setResult(res);
      toast.success(`Submitted! You scored ${res.submission.score}/${res.submission.total}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const timeLabel = secondsLeft !== null
    ? `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`
    : '';

  // ---------- Review mode (already submitted) ----------
  if (submission) {
    const pct = Math.round((submission.score / submission.total) * 100);
    return (
      <>
        <div className="quiz-bar">
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)' }}>{data.title}</h2>
            <span className="muted small">{data.subject} · {data.className}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/student/lms')}><ArrowLeft size={16} />Back to list</button>
        </div>

        <div className="card" style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="score-ring" style={{ color: pct >= 50 ? 'var(--ok)' : 'var(--danger)' }}>{submission.score}/{submission.total}</div>
          <p className="muted" style={{ marginTop: 4 }}>{pct}% · Submitted {new Date(submission.submittedAt).toLocaleString()}</p>
        </div>

        <div className="stack" style={{ gap: 14 }}>
          {data.questions.map((q, i) => {
            const mine = submission.answers[i];
            const correct = q.answerIndex;
            return (
              <div className="question" key={i}>
                <h4>{i + 1}. {q.question}</h4>
                <div className="q-options">
                  {q.options.map((opt, oi) => {
                    let cls = 'q-option';
                    if (oi === correct) cls += ' correct';
                    else if (oi === mine) cls += ' wrong';
                    return (
                      <div className={cls} key={oi}>
                        <span className="q-letter">{LETTERS[oi]}</span>
                        <span className="grow">{opt}</span>
                        {oi === correct && <CheckCircle2 size={18} color="var(--ok)" />}
                        {oi === mine && oi !== correct && <XCircle size={18} color="var(--danger)" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // ---------- Taking mode ----------
  const q = data.questions[index];
  const answeredCount = answers.filter((a) => a !== null).length;

  return (
    <>
      <div className="quiz-bar">
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)' }}>{data.title}</h2>
          <span className="muted small">{data.subject} · Question {index + 1} of {data.questions.length} · {answeredCount} answered</span>
        </div>
        <div className={`timer ${secondsLeft <= 30 ? 'low' : ''}`}><Clock size={18} style={{ verticalAlign: -3, marginRight: 6 }} />{timeLabel}</div>
      </div>

      <div className="question" style={{ marginBottom: 18 }}>
        <h4>{index + 1}. {q.question}</h4>
        <div className="q-options">
          {q.options.map((opt, oi) => (
            <button
              type="button" key={oi}
              className={`q-option ${answers[index] === oi ? 'selected' : ''}`}
              onClick={() => selectAnswer(index, oi)}
            >
              <span className="q-letter">{LETTERS[oi]}</span>
              <span className="grow">{opt}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-outline" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}><ArrowLeft size={17} />Previous</button>
        {index < data.questions.length - 1 ? (
          <button className="btn btn-primary" onClick={() => setIndex((i) => i + 1)}>Next<ArrowRight size={17} /></button>
        ) : (
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</button>
        )}
      </div>
    </>
  );
}
