import { useEffect, useRef, useState } from 'react';
import { Camera, Circle } from 'lucide-react';

export default function CameraPreview({ stream, unavailable = false, title }) {
  const videoRef = useRef(null);
  const dragRef = useRef(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  useEffect(() => {
    function move(event) {
      if (!dragRef.current) return;
      const { startX, startY, originX, originY, width, height } = dragRef.current;
      const nextX = Math.max(8, Math.min(window.innerWidth - width - 8, originX + event.clientX - startX));
      const nextY = Math.max(8, Math.min(window.innerHeight - height - 8, originY + event.clientY - startY));
      setPosition({ x: nextX, y: nextY });
    }

    function stop() {
      dragRef.current = null;
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, []);

  function startDrag(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: bounds.left,
      originY: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  const style = position ? { left: position.x, top: position.y, right: 'auto' } : undefined;
  if (!stream && !unavailable) return null;

  return (
    <div className={stream ? 'cbt-proctor-preview' : 'cbt-proctor-missing'} style={style} title={`${title}. Drag to move`} onPointerDown={startDrag}>
      {stream ? <video ref={videoRef} autoPlay playsInline muted /> : <Camera size={14} />}
      <div>{stream ? <><Circle size={10} fill="currentColor" /> Recording</> : 'Camera unavailable'}</div>
    </div>
  );
}
