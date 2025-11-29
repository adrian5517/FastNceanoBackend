import Student from '../models/Student.js';

function toCSV(rows, headers) {
  const esc = (v) => `"${(v ?? '').toString().replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => esc(r[h])).join(','));
  }
  return lines.join('\n');
}

export const exportAttendance = async (req, res) => {
  try {
    // date filter optional
    const date = req.query.date ? new Date(req.query.date) : null;
    const start = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
    const end = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) : null;

    // Find visits within date range across students
    const students = await Student.find({});
    const rows = [];
    const formatDuration = (timeInIso, timeOutIso) => {
      if (!timeInIso || !timeOutIso) return '';
      const tIn = new Date(timeInIso);
      const tOut = new Date(timeOutIso);
      if (isNaN(tIn) || isNaN(tOut) || tOut <= tIn) return '';
      const ms = tOut - tIn;
      const totalMinutes = Math.round(ms / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    };

    for (const s of students) {
      for (const v of (s.visits || [])) {
        const tIn = v.timeIn ? new Date(v.timeIn) : null;
        if (start && end) {
          if (!tIn || tIn < start || tIn >= end) continue;
        }
        rows.push({
          studentNo: s.studentNo,
          name: `${s.firstName} ${s.lastName}`,
          course: s.course,
          level: s.level,
          purpose: v.purpose || '',
          timeIn: v.timeIn || '',
          timeOut: v.timeOut || '',
          duration: formatDuration(v.timeIn, v.timeOut),
          status: v.status || '',
        });
      }
    }

    const headers = ['studentNo','name','course','level','purpose','timeIn','timeOut','duration','status'];
    const csv = toCSV(rows, headers);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error exporting attendance' });
  }
};
