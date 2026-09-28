import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Phone, Plus, Radio, Video } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const turnUrls = (import.meta.env.VITE_TURN_URL || '').split(',').map((url) => url.trim()).filter(Boolean);
const rtcConfig = {
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

function VideoTile({ stream, name, local = false, cameraOn = true }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = stream || null;
    if (stream) videoRef.current.play().catch(() => {});
  }, [stream]);

  return (
    <div className={`live-video-tile ${local ? 'local' : ''}`}>
      <video ref={videoRef} autoPlay playsInline muted={local} />
      {(!stream || (local && !cameraOn)) && <div className="live-video-placeholder"><Video size={28} /><span>{local && !cameraOn ? 'Your camera is off' : 'Camera unavailable'}</span></div>}
      <span>{name}{local ? ' (You)' : ''}</span>
    </div>
  );
}

export default function LiveClass() {
  const { user } = useAuth();
  const toast = useToast();
  const roomsFetch = useFetch('/live/rooms');
  const classesFetch = useFetch(user.role === 'teacher' ? '/classes' : null);
  const [room, setRoom] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [selectedClass, setSelectedClass] = useState('');
  const [title, setTitle] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [callError, setCallError] = useState('');
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const roomRef = useRef(null);
  const signalCursor = useRef(0);
  const syncing = useRef(false);

  function closePeers() {
    peerConnections.current.forEach((peer) => peer.close());
    peerConnections.current.clear();
    pendingCandidates.current.clear();
    setRemoteStreams({});
  }

  useEffect(() => () => {
    closePeers();
    localStream?.getTracks().forEach((track) => track.stop());
  }, [localStream]);

  async function sendSignal(toId, type, payload) {
    if (!roomRef.current) return;
    await api.post(`/live/rooms/${roomRef.current.id}/signals`, { toId, type, payload });
  }

  async function ensurePeer(participant, makeOffer) {
    if (participant.id === user.id || peerConnections.current.has(participant.id)) return peerConnections.current.get(participant.id);
    const peer = new RTCPeerConnection(rtcConfig);
    peerConnections.current.set(participant.id, peer);
    localStream?.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.onicecandidate = (event) => event.candidate && sendSignal(participant.id, 'candidate', event.candidate.toJSON()).catch(() => {});
    peer.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setRemoteStreams((current) => ({ ...current, [participant.id]: stream }));
    };
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(peer.connectionState)) {
        peer.close();
        peerConnections.current.delete(participant.id);
        setRemoteStreams((current) => { const next = { ...current }; delete next[participant.id]; return next; });
      }
    };
    if (makeOffer) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal(participant.id, 'offer', offer);
    }
    return peer;
  }

  async function processSignals(signals) {
    for (const signal of signals) {
      signalCursor.current = Math.max(signalCursor.current, signal.id);
      const participant = roomRef.current?.participants.find((item) => item.id === signal.fromId);
      if (!participant) continue;
      if (signal.type === 'leave') {
        peerConnections.current.get(signal.fromId)?.close();
        peerConnections.current.delete(signal.fromId);
        setRemoteStreams((current) => { const next = { ...current }; delete next[signal.fromId]; return next; });
        continue;
      }
      const peer = await ensurePeer(participant, false);
      if (signal.type === 'offer') {
        await peer.setRemoteDescription(signal.payload);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal(signal.fromId, 'answer', answer);
      } else if (signal.type === 'answer') {
        await peer.setRemoteDescription(signal.payload);
      } else if (signal.type === 'candidate') {
        if (peer.remoteDescription) await peer.addIceCandidate(signal.payload);
        else pendingCandidates.current.set(signal.fromId, [...(pendingCandidates.current.get(signal.fromId) || []), signal.payload]);
      }
      const candidates = pendingCandidates.current.get(signal.fromId) || [];
      if (peer.remoteDescription && candidates.length) {
        for (const candidate of candidates) await peer.addIceCandidate(candidate);
        pendingCandidates.current.delete(signal.fromId);
      }
    }
  }

  async function syncRoom() {
    if (!room || !mediaReady || syncing.current) return;
    syncing.current = true;
    try {
      const availableRooms = await api.get('/live/rooms');
      const current = availableRooms.find((item) => item.id === room.id);
      if (!current) {
        toast.info('The live class has ended.');
        await leaveRoom(false);
        return;
      }
      setRoom(current);
      roomRef.current = current;
      for (const participant of current.participants) {
        if (participant.id !== user.id) await ensurePeer(participant, user.id < participant.id);
      }
      const signals = await api.get(`/live/rooms/${room.id}/signals?after=${signalCursor.current}`);
      await processSignals(signals);
    } catch (err) {
      setCallError(err.message);
    } finally {
      syncing.current = false;
    }
  }

  useEffect(() => {
    if (!room || !mediaReady) return undefined;
    const timer = setInterval(syncRoom, 1500);
    syncRoom();
    return () => clearInterval(timer);
  }, [room?.id, localStream, mediaReady]);

  useEffect(() => {
    if (room || user.role !== 'student') return undefined;
    const timer = setInterval(() => roomsFetch.reload(), 3000);
    return () => clearInterval(timer);
  }, [room?.id, user.role, roomsFetch.reload]);

  async function joinRoom(nextRoom) {
    setBusy(true);
    setCallError('');
    try {
      const joined = await api.post(`/live/rooms/${nextRoom.id}/join`, {});
      setRoom(joined);
      roomRef.current = joined;
      setMediaReady(false);

      let stream = null;
      let mediaMessage = '';
      if (!window.isSecureContext) {
        mediaMessage = 'Camera and microphone require HTTPS (or localhost). You joined and can still watch the live class.';
      } else if (!navigator.mediaDevices?.getUserMedia) {
        mediaMessage = 'This browser does not support camera or microphone access. You joined and can still watch the live class.';
      } else {
        const mediaResults = await Promise.allSettled([
          navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
          navigator.mediaDevices.getUserMedia({ audio: false, video: true }),
        ]);
        const tracks = mediaResults.flatMap((result) => result.status === 'fulfilled' ? result.value.getTracks() : []);
        if (tracks.length) {
          stream = new MediaStream(tracks);
          if (mediaResults.some((result) => result.status === 'rejected')) {
            mediaMessage = 'You joined with the available device(s); camera or microphone access was unavailable.';
          }
        } else {
          const denied = mediaResults.some((result) => result.status === 'rejected' && result.reason?.name === 'NotAllowedError');
          mediaMessage = denied
            ? 'You joined without camera or microphone access. You can still watch the live class.'
            : 'No working camera or microphone was found. You joined and can still watch the live class.';
        }
      }
      setLocalStream(stream);
      setMicOn(Boolean(stream?.getAudioTracks().length));
      setCameraOn(Boolean(stream?.getVideoTracks().length));
      setCallError(mediaMessage);
      setMediaReady(true);
    } catch (err) {
      setCallError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function createRoom(event) {
    event.preventDefault();
    if (!selectedClass) return;
    setBusy(true);
    try {
      const created = await api.post('/live/rooms', { classId: selectedClass, title: title.trim() });
      await joinRoom(created);
      roomsFetch.reload();
    } catch (err) {
      setCallError(err.message);
      setBusy(false);
    }
  }

  async function leaveRoom(endRoom = user.id === room?.hostId) {
    if (!room) return;
    try {
      if (endRoom) await api.del(`/live/rooms/${room.id}`);
      else await api.post(`/live/rooms/${room.id}/leave`, {});
    } catch (err) {
      setCallError(err.message);
    }
    closePeers();
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setMediaReady(false);
    setRoom(null);
    roomRef.current = null;
    roomsFetch.reload();
  }

  function toggleTrack(kind) {
    const track = localStream?.getTracks().find((item) => item.kind === kind);
    if (!track) return;
    track.enabled = !track.enabled;
    if (kind === 'audio') setMicOn(track.enabled);
    else setCameraOn(track.enabled);
  }

  if (roomsFetch.loading || classesFetch.loading) return <Loading />;
  if (roomsFetch.error || classesFetch.error) return <ErrorNote message={roomsFetch.error || classesFetch.error} onRetry={() => { roomsFetch.reload(); classesFetch.reload(); }} />;

  if (room) {
    return (
      <>
        <PageHeader title={room.title} subtitle={`${room.participants.length} participant${room.participants.length === 1 ? '' : 's'} · ${room.hostName} is hosting`} />
        {callError && <div className="live-call-error">{callError}</div>}
        <div className="live-call-shell">
          <div className="live-video-grid">
            <VideoTile stream={localStream} name={user.name} local cameraOn={cameraOn} />
            {room.participants.filter((participant) => participant.id !== user.id).map((participant) => <VideoTile key={participant.id} stream={remoteStreams[participant.id]} name={participant.name} />)}
          </div>
          <div className="live-call-controls">
            <button className={`icon-btn live-control ${micOn ? '' : 'off'}`} onClick={() => toggleTrack('audio')} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} disabled={!localStream?.getAudioTracks().length}>{micOn ? <Mic /> : <MicOff />}</button>
            <button className={`icon-btn live-control ${cameraOn ? '' : 'off'}`} onClick={() => toggleTrack('video')} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'} disabled={!localStream?.getVideoTracks().length}>{cameraOn ? <Camera /> : <CameraOff />}</button>
            <button className="btn btn-danger" onClick={() => leaveRoom()}><Phone size={17} />{user.id === room.hostId ? 'End live class' : 'Leave class'}</button>
          </div>
        </div>
      </>
    );
  }

  const visibleRooms = roomsFetch.data || [];
  return (
    <>
      <PageHeader title="Live classes" subtitle={user.role === 'teacher' ? 'Start a group class for students in any class you teach.' : 'Join a live class hosted by one of your teachers.'} />
      {callError && <div className="live-call-error">{callError}</div>}
      <div className="grid grid-2">
        {user.role === 'teacher' && (
          <div className="card">
            <div className="card-head"><h3>Start a live class</h3><Radio size={19} /></div>
            <form className="stack" onSubmit={createRoom}>
              <div className="field"><label htmlFor="live-class">Class</label><select id="live-class" className="select" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)} required><option value="">Choose a class</option>{classesFetch.data.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}</select></div>
              <div className="field"><label htmlFor="live-title">Class title</label><input id="live-title" className="input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Mathematics revision" /></div>
              <button className="btn btn-primary" disabled={busy}><Radio size={17} />{busy ? 'Starting...' : 'Start live class'}</button>
            </form>
          </div>
        )}
        <div className="card">
          <div className="card-head"><h3>Available now</h3><Radio size={19} /></div>
          {visibleRooms.length === 0 ? <EmptyState title="No live classes right now" text={user.role === 'teacher' ? 'Start a room when you are ready to teach.' : 'Your teacher will announce a live class here.'} /> : <div className="list">{visibleRooms.map((liveRoom) => <div className="list-item" key={liveRoom.id}><div className="avatar avatar-sm">{liveRoom.title[0]}</div><div className="grow"><div className="title">{liveRoom.title}</div><div className="sub">{liveRoom.hostName} · {liveRoom.participants.length} joined</div></div><button className="btn btn-sm btn-primary" onClick={() => joinRoom(liveRoom)} disabled={busy}><Video size={15} />Join</button></div>)}</div>}
        </div>
      </div>
    </>
  );
}