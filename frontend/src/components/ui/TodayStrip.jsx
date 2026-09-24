// A row of today's lessons. The lesson happening right now lights up in brass.
// periods: [{ time: '08:00 - 08:40', subject: 'Mathematics', note: 'JSS 1A' }]
function minutes(hhmm) {
  const [h, m] = hhmm.trim().split(':').map(Number);
  return h * 60 + m;
}

function stateOf(time, isToday) {
  if (!isToday) return '';
  const [start, end] = time.split('-').map(minutes);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  if (now >= start && now < end) return 'now';
  return now >= end ? 'done' : '';
}

export default function TodayStrip({ day, isToday, periods }) {
  return (
    <div>
      <div className="strip-title">
        {isToday ? `Today, ${day}` : `Next school day, ${day}`}
      </div>
      {periods.length === 0 ? (
        <div className="strip-empty">No lessons on this day.</div>
      ) : (
        <div className="strip">
          {periods.map((p, i) => (
            <div key={i} className={`period ${stateOf(p.time, isToday)}`}>
              <span className="period-time">{p.time}</span>
              <strong>{p.subject}</strong>
              {p.note && <span className="period-note">{p.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
