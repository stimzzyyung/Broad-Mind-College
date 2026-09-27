import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock, ArrowLeft, ArrowRight, Camera, Circle } from 'lucide-react';
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
  const [cameraStream, setCameraStream] = useState(null);
  const [proctoringError, setProctoringError] = useState('');
  const recorderRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const proctoringStartedRef = useRef(false);

  useEffect(() => {
    if (data && !data.submission) {
      setAnswers(new Array(data.questions.length).fill(null));
      setSecondsLeft(data.durationMins * 60);
      if (!proctoringStartedRef.current) {
        proctoringStartedRef.current = true;
        startProctoring();
      }
    }
  }, [data]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startProctoring() {
    setProctoringError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('This browser cannot provide the camera recording required for this assessment.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordingChunksRef.current.push(event.data); };
      recorder.start(1000);
      recorderRef.current = recorder;
      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch (err) {
      setProctoringError(err.name === 'NotAllowedError' ? 'Camera permission is required before you can start this assessment.' : err.message || 'Camera recording could not be started.');
    }
  }

  async function finishProctoring() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    await new Promise((resolve) => {
      recorder.onstop = async () => {
        try {
          await api.upload(`/lms/quizzes/${quizId}/proctoring-recording`, new Blob(recordingChunksRef.current, { type: 'video/webm' }), 'video/webm');
        } catch (err) {
          setProctoringError(`The camera recording could not be uploaded: ${err.message}`);
        } finally {
          recorderRef.current = null;
          cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
          cameraStreamRef.current = null;
          setCameraStream(null);
          resolve();
        }
      };
      recorder.stop();
    });
  }

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

  if (!cameraStream && !proctoringError && data && !data.submission && !result) return <Loading text="Starting camera recording..." />;

  if (proctoringError && !cameraStream && !data.submission && !result) {
    return (
      <div className="fullpage" style={{ padding: '24px', background: 'var(--paper)' }}>
        <div className="card" style={{ maxWidth: '540px', padding: '32px', textAlign: 'center' }}>
          <Camera size={42} color="var(--danger)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ marginBottom: '8px' }}>Camera recording required</h3>
          <p style={{ color: 'var(--ink-2)', fontSize: '14px', marginBottom: '16px' }}>{proctoringError}</p>
          <p style={{ color: 'var(--ink-2)', fontSize: '13px', marginBottom: '20px' }}>Your camera preview will remain visible in the top corner while you complete this assessment.</p>
          <button className="btn btn-primary" onClick={startProctoring}><Camera size={17} />Allow camera and continue</button>
        </div>
      </div>
    );
  }

  const submission = result?.submission || data.submission;

  function selectAnswer(qi, oi) {
    setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)));
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await finishProctoring();
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
      <div className="cbt-proctor-preview" title="Your camera is recording this assessment">
        <video ref={(node) => { if (node) node.srcObject = cameraStream; }} autoPlay playsInline muted />
        <div><Circle size={10} fill="currentColor" /> Recording</div>
      </div>
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
