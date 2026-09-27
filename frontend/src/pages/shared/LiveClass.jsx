import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Phone, Plus, Radio, Video } from 'lucide-react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { Loading, ErrorNote, EmptyState } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function VideoTile({ stream, name, local = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className="live-video-tile">
      <video ref={videoRef} autoPlay playsInline muted={local} />
      {!stream && <div className="live-video-placeholder"><Video size={28} /></div>}
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
  const [remoteStreams, setRemoteStreams] = useState({});
  const [selectedClass, setSelectedClass] = useState('');
  const [title, setTitle] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [callError, setCallError] = useState('');
  const peerConnections = useRef(new Map());
  const pendingCandidates = useRef(new Map());
  const localVideoRef = useRef(null);
  const roomRef = useRef(null);
  const signalCursor = useRef(0);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

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
    peer.ontrack = (event) => setRemoteStreams((current) => ({ ...current, [participant.id]: event.streams[0] }));
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) {
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
    if (!room) return;
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
    }
  }

  useEffect(() => {
    if (!room) return undefined;
    const timer = setInterval(syncRoom, 1500);
    syncRoom();
    return () => clearInterval(timer);
  }, [room?.id, localStream]);

  useEffect(() => {
    if (room || user.role !== 'student') return undefined;
    const timer = setInterval(() => roomsFetch.reload(), 3000);
    return () => clearInterval(timer);
  }, [room?.id, user.role, roomsFetch.reload]);

  async function joinRoom(nextRoom) {
    setBusy(true);
    setCallError('');
    try {
      let stream = null;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('Media devices are unavailable', 'NotSupportedError');
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (mediaError) {
        if (!['NotAllowedError', 'NotFoundError', 'NotSupportedError'].includes(mediaError.name)) throw mediaError;
        setCallError('You joined without camera or microphone access. You can still watch the live class.');
      }
      const joined = await api.post(`/live/rooms/${nextRoom.id}/join`, {});
      setLocalStream(stream);
      setMicOn(Boolean(stream));
      setCameraOn(Boolean(stream));
      setRoom(joined);
      roomRef.current = joined;
    } catch (err) {
      setCallError(err.name === 'NotAllowedError' ? 'Camera and microphone permission is required to join a live class.' : err.message);
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
            <div className="live-video-tile"><video ref={localVideoRef} autoPlay playsInline muted /><span>{user.name} (You)</span></div>
            {room.participants.filter((participant) => participant.id !== user.id).map((participant) => <VideoTile key={participant.id} stream={remoteStreams[participant.id]} name={participant.name} />)}
          </div>
          <div className="live-call-controls">
            <button className={`icon-btn live-control ${micOn ? '' : 'off'}`} onClick={() => toggleTrack('audio')} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>{micOn ? <Mic /> : <MicOff />}</button>
            <button className={`icon-btn live-control ${cameraOn ? '' : 'off'}`} onClick={() => toggleTrack('video')} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}>{cameraOn ? <Camera /> : <CameraOff />}</button>
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