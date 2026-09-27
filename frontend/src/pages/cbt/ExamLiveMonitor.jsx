import { useEffect, useRef, useState } from 'react';
import { Camera, Circle, Radio, RefreshCw, VideoOff } from 'lucide-react';
import { api } from '../../api/client.js';

const turnUrls = (import.meta.env.VITE_TURN_URL || '').split(',').map((url) => url.trim()).filter(Boolean);
const monitorRtcConfig = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ...(turnUrls.length ? [{
      urls: turnUrls,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    }] : []),
  ],
  iceCandidatePoolSize: 10,
};

function CandidateVideo({ candidate, stream, connectionState }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream || null;
    if (stream) videoRef.current.play().catch(() => {});
  }, [stream]);

  const recent = candidate.lastActivityTime && Date.now() - new Date(candidate.lastActivityTime).getTime() < 45000;

  return (
    <article className="cbt-monitor-tile">
      <div className="cbt-monitor-video">
        <video ref={videoRef} autoPlay playsInline />
        {!stream && (
          <div className="cbt-monitor-placeholder">
            {connectionState === 'failed' ? <VideoOff size={24} /> : <Camera size={24} />}
            <span>{connectionState === 'failed' ? 'Connection failed' : 'Waiting for camera video'}</span>
          </div>
        )}
        <span className={`cbt-monitor-live ${recent ? 'online' : ''}`}><Circle size={8} fill="currentColor" />{recent ? 'Active' : 'No recent activity'}</span>
      </div>
      <div className="cbt-monitor-meta">
        <div className="cbt-monitor-name">{candidate.studentName}</div>
        <div className="cbt-monitor-detail">{candidate.studentSchoolId || 'Student'}{candidate.className ? ` · ${candidate.className}` : ''}</div>
        {!recent && <div className="cbt-monitor-warning">Candidate activity has not synced recently</div>}
      </div>
    </article>
  );
}

export default function ExamLiveMonitor({ examId }) {
  const [candidates, setCandidates] = useState([]);
  const [streams, setStreams] = useState({});
  const [connectionStates, setConnectionStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const peersRef = useRef(new Map());
  const candidatesRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const signalCursorRef = useRef(0);
  const syncingRef = useRef(false);

  async function sendSignal(attemptId, toId, type, payload) {
    await api.post('/cbt/monitor/signals', { attemptId, toId, type, payload });
  }

  async function startWatching(candidate) {
    if (peersRef.current.has(candidate.id)) return;
    const peer = new RTCPeerConnection(monitorRtcConfig);
    peersRef.current.set(candidate.id, peer);
    peer.addTransceiver('video', { direction: 'recvonly' });
    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setStreams((current) => ({ ...current, [candidate.id]: stream }));
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal(candidate.id, candidate.studentId, 'candidate', event.candidate.toJSON()).catch(() => {});
    };
    peer.onconnectionstatechange = () => {
      setConnectionStates((current) => ({ ...current, [candidate.id]: peer.connectionState }));
      if (peer.connectionState === 'failed') {
        peer.close();
        peersRef.current.delete(candidate.id);
        pendingCandidatesRef.current.delete(candidate.id);
        setStreams((current) => { const next = { ...current }; delete next[candidate.id]; return next; });
      }
    };
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal(candidate.id, candidate.studentId, 'offer', offer);
    } catch {
      peer.close();
      peersRef.current.delete(candidate.id);
      setConnectionStates((current) => ({ ...current, [candidate.id]: 'failed' }));
    }
  }

  useEffect(() => {
    let stopped = false;
    let polling = false;

    async function refreshMonitor() {
      if (stopped || syncingRef.current) return;
      syncingRef.current = true;
      try {
        const suffix = examId ? `?examId=${encodeURIComponent(examId)}` : '';
        const active = await api.get(`/cbt/monitor/active${suffix}`);
        if (stopped) return;
        setCandidates(active);
        setError('');
        const previousCandidates = candidatesRef.current;

        const activeIds = new Set(active.map((candidate) => candidate.id));
        peersRef.current.forEach((peer, attemptId) => {
          if (!activeIds.has(attemptId)) {
            const candidate = previousCandidates.get(attemptId);
            if (candidate) sendSignal(attemptId, candidate.studentId, 'leave').catch(() => {});
            peer.close();
            peersRef.current.delete(attemptId);
            setStreams((current) => { const next = { ...current }; delete next[attemptId]; return next; });
            setConnectionStates((current) => { const next = { ...current }; delete next[attemptId]; return next; });
          }
        });
        candidatesRef.current = new Map(active.map((candidate) => [candidate.id, candidate]));
        await Promise.all(active.map(startWatching));
      } catch (err) {
        if (!stopped) setError(err.message || 'Could not load active candidates.');
      } finally {
        syncingRef.current = false;
        if (!stopped) setLoading(false);
      }
    }

    async function pollSignals() {
      if (stopped || polling) return;
      polling = true;
      try {
        const suffix = examId ? `&examId=${encodeURIComponent(examId)}` : '';
        const signals = await api.get(`/cbt/monitor/signals?after=${signalCursorRef.current}${suffix}`);
        for (const signal of signals) {
          signalCursorRef.current = Math.max(signalCursorRef.current, signal.id);
          const peer = peersRef.current.get(signal.attemptId);
          if (!peer) continue;
          if (signal.type === 'leave') {
            peer.close();
            peersRef.current.delete(signal.attemptId);
            setStreams((current) => { const next = { ...current }; delete next[signal.attemptId]; return next; });
            setConnectionStates((current) => { const next = { ...current }; delete next[signal.attemptId]; return next; });
            continue;
          }
          if (signal.type === 'answer') await peer.setRemoteDescription(signal.payload);
          else if (signal.type === 'candidate') {
            if (peer.remoteDescription) await peer.addIceCandidate(signal.payload);
            else pendingCandidatesRef.current.set(signal.attemptId, [...(pendingCandidatesRef.current.get(signal.attemptId) || []), signal.payload]);
          }
          const candidates = pendingCandidatesRef.current.get(signal.attemptId) || [];
          if (peer.remoteDescription && candidates.length) {
            for (const candidate of candidates) await peer.addIceCandidate(candidate);
            pendingCandidatesRef.current.delete(signal.attemptId);
          }
        }
      } catch (err) {
        if (!stopped) setError(err.message || 'Live signaling is temporarily unavailable.');
      } finally {
        polling = false;
      }
    }

    refreshMonitor();
    pollSignals();
    const rosterTimer = setInterval(refreshMonitor, 4000);
    const signalTimer = setInterval(pollSignals, 900);
    return () => {
      stopped = true;
      clearInterval(rosterTimer);
      clearInterval(signalTimer);
      peersRef.current.forEach((peer, attemptId) => {
        const candidate = candidatesRef.current.get(attemptId);
        if (candidate) sendSignal(attemptId, candidate.studentId, 'leave').catch(() => {});
        peer.close();
      });
      peersRef.current.clear();
      pendingCandidatesRef.current.clear();
    };
  }, [examId, refreshTick]);

  return (
    <section className="cbt-monitor-section">
      <div className="cbt-monitor-toolbar">
        <div>
          <h3>Live candidate monitor</h3>
          <p>{candidates.length} candidate{candidates.length === 1 ? '' : 's'} in progress · video streams are live during their exam</p>
        </div>
        <div className="cbt-monitor-indicator"><Radio size={16} /> Live monitor</div>
      </div>
      {error && <div className="live-call-error">{error}</div>}
      {loading ? (
        <div className="empty">Loading active candidates...</div>
      ) : candidates.length === 0 ? (
        <div className="empty"><Camera size={22} /><h4>No active candidates</h4><p>Students will appear here while they are taking an examination.</p></div>
      ) : (
        <div className="cbt-monitor-grid">
          {candidates.map((candidate) => (
            <CandidateVideo
              key={candidate.id}
              candidate={candidate}
              stream={streams[candidate.id]}
              connectionState={connectionStates[candidate.id]}
            />
          ))}
        </div>
      )}
      <button className="btn btn-outline btn-sm cbt-monitor-refresh" onClick={() => setRefreshTick((tick) => tick + 1)}><RefreshCw size={14} /> Reconnect feeds</button>
    </section>
  );
}