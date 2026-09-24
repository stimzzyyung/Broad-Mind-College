// The full weekly timetable. Today's column is tinted.
// highlight(subject) -> true makes a cell stand out (a teacher's own lessons, for example)
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function TimetableGrid({ timetable, highlight }) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  return (
    <div className="table-wrap">
      <table className="tt">
        <thead>
          <tr>
            <th>Time</th>
            {DAYS.map((day) => (
              <th key={day} className={day === today ? 'tt-today' : ''}>{day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timetable.periods.map((time, row) => (
            <tr key={time}>
              <td className="tt-time">{time}</td>
              {DAYS.map((day) => {
                const subject = timetable.days[day][row];
                const mine = highlight && highlight(subject);
                return (
                  <td key={day} className={`tt-cell ${day === today ? 'tt-today' : ''} ${mine ? 'tt-mine' : ''}`}>
                    {subject}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
