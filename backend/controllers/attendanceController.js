import Student from '../models/Student.js';
import Visit from '../models/Visit.js';

// Helper to collapse repeated characters
function collapseRepeats(s) {
  return String(s).replace(/(.)\1+/g, '$1');
}

// Helper to parse QR payload (tries JSON then raw string) and normalize keys/values
function parseQR(qr) {
  if (!qr) return {};

  // Normalize parsed object's keys/values in case keys contain repeated chars (scanner noise)
  function normalizeParsed(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const out = {};
    Object.keys(obj).forEach((k) => {
      try {
        const rawVal = obj[k];
        const nk = collapseRepeats(k).toLowerCase().replace(/[^a-z0-9]/g, '');
        let mappedKey = nk;
        if (nk.includes('studentno') || (nk.includes('student') && nk.includes('no'))) mappedKey = 'studentNo';
        else if (nk === 'student') mappedKey = 'studentNo';
        else if (nk.includes('id') || nk.includes('studentid')) mappedKey = 'id';

        let newVal = rawVal;
        if (typeof rawVal === 'string') {
          newVal = collapseRepeats(rawVal);
          newVal = newVal.replace(/[-_]{2,}/g, '-').replace(/\s{2,}/g, ' ').trim();
          newVal = newVal.replace(/^[:"'\s\{\}]+|[:"'\s\{\}]+$/g, '');
        } else if (typeof rawVal === 'object') {
          newVal = normalizeParsed(rawVal);
        }

        out[mappedKey] = newVal;
      } catch (err) {
        out[k] = obj[k];
      }
    });
    return out;
  }

  // Try JSON.parse first (raw incoming may be JSON-like)
  try {
    const parsed = JSON.parse(qr);
    return normalizeParsed(parsed);
  } catch (e) {}

  // Lightweight cleanup and try parse again
  const s = String(qr);
  let cleaned = s.replace(/\{\{+/g, '{').replace(/\}\}+/g, '}');
  cleaned = cleaned.replace(/::+/g, ':').replace(/,,+/g, ',').replace(/""+/g, '"');
  try {
    const parsed2 = JSON.parse(cleaned);
    return normalizeParsed(parsed2);
  } catch (e) {}

  // Try to fuzzy-extract common keys from raw string
  const tryExtractFuzzyValue = (raw, key) => {
    const lower = String(raw).toLowerCase();
    const k = key.toLowerCase();
    const idx = lower.indexOf(k[0]);
    if (idx === -1) return null;
    // simple heuristic: find ':' after key-like sequence
    const colon = lower.indexOf(':', idx);
    if (colon === -1) return null;
    let j = colon + 1;
    while (j < raw.length && (raw[j] === ' ' || raw[j] === ':' || raw[j] === '\\' || raw[j] === '"')) j++;
    let end = j;
    while (end < raw.length && raw[end] !== ',' && raw[end] !== '}') end++;
    let val = raw.slice(j, end).trim();
    val = val.replace(/^[:"'\s\{\}]+|[:"'\s\{\}]+$/g, '');
    if (!val) return null;
    return collapseRepeats(val);
  };

  const keys = ['studentno', 'student_no', 'id', 'studentid', 'student'];
  for (const k of keys) {
    const v = tryExtractFuzzyValue(s, k);
    if (v) {
      if (k.includes('id')) return { id: v };
      return { studentNo: v };
    }
  }

  // Fallback: pick longest alphanumeric token
  const tokens = s.match(/[A-Za-z0-9\-]{4,}/g) || [];
  if (tokens.length) {
    let candidate = tokens.find(t => /[A-Za-z]/.test(t) && /\d/.test(t)) || tokens.sort((a,b)=>b.length-a.length)[0];
    candidate = collapseRepeats(candidate);
    return { studentNo: candidate };
  }

  return { raw: qr };
}

export async function scanAttendance(req, res) {
  const { qr } = req.body;
  console.log('[attendance] scanAttendance received qr:', qr);
  const payload = parseQR(qr);
  console.log('[attendance] parsed payload:', payload);

  // Try to find student by id or studentNo with tolerant matching
  let student = null;
  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  if (payload.id) {
    try { student = await Student.findById(payload.id).exec(); } catch (e) { student = null; }
  }

  const tryStudentNoLookups = async (sn) => {
    if (!sn) return null;
    let s = await Student.findOne({ studentNo: sn }).exec();
    if (s) return s;
    const collapsed = collapseRepeats(sn);
    s = await Student.findOne({ studentNo: collapsed }).exec();
    if (s) return s;
    const stripped = sn.replace(/[^a-zA-Z0-9]/g, '');
    s = await Student.findOne({ studentNo: stripped }).exec();
    if (s) return s;
    const collapsedStripped = collapsed.replace(/[^a-zA-Z0-9]/g, '');
    s = await Student.findOne({ studentNo: collapsedStripped }).exec();
    if (s) return s;
    if (collapsedStripped && collapsedStripped.length >= 4) {
      const pattern = collapsedStripped.split('').map(c => escapeRegExp(c) + '+').join('\\W*');
      try {
        s = await Student.findOne({ studentNo: { $regex: pattern, $options: 'i' } }).exec();
        if (s) return s;
      } catch (e) {}
    }
    return null;
  };

  if (!student && payload.studentNo) {
    student = await tryStudentNoLookups(payload.studentNo);
  }
  if (!student && payload.raw) {
    student = await tryStudentNoLookups(payload.raw);
  }

  if (!student) {
    console.warn('[attendance] student not found for payload:', payload);
    return res.status(404).json({ message: 'Student not found' });
  }

  // Find active session (visit with timeIn and no timeOut)
  const active = (student.visits || []).slice().reverse().find(v => v.timeIn && !v.timeOut) || null;

  // Business logic: if active exists => TIME_OUT, else TIME_IN
  const action = active ? 'TIME_OUT' : 'TIME_IN';

  return res.json({
    student,
    allowed: true,
    action,
    activeSession: active,
  });
}

export async function timeIn(req, res) {
  const { studentId, purpose, deviceId } = req.body;
  if (!studentId) return res.status(400).json({ message: 'studentId required' });
  const student = await Student.findById(studentId).exec();
  if (!student) return res.status(404).json({ message: 'Student not found' });
  const now = new Date();
  // Create Visit document
  const visitDoc = new Visit({ studentId: student._id, timeIn: now, purpose, status: 'IN', deviceId });
  await visitDoc.save();

  // Also append to embedded student.visits for backward compatibility (best-effort)
  try {
    student.visits = student.visits || [];
    student.visits.push({ timeIn: now, purpose, status: 'IN', deviceId });
    await student.save();
  } catch (e) {
    console.warn('Failed to update embedded visits for student (non-fatal)', e);
  }

  return res.json({ message: 'Time In recorded', session: visitDoc, studentId: student._id });
}

export async function timeOut(req, res) {
  const { studentId, sessionId } = req.body;
  if (!studentId) return res.status(400).json({ message: 'studentId required' });
  const student = await Student.findById(studentId).exec();
  if (!student) return res.status(404).json({ message: 'Student not found' });
  // Try to update Visit collection first
  const activeVisit = await Visit.findOne({ studentId: student._id, timeIn: { $exists: true }, timeOut: { $exists: false } }).sort({ timeIn: -1 }).exec();

  if (activeVisit) {
    activeVisit.timeOut = new Date();
    activeVisit.status = 'OUT';
    await activeVisit.save();

    // Best-effort: update embedded visit in Student
    try {
      const visits = student.visits || [];
      const activeIndex = visits.map(v => v).reverse().findIndex(v => v.timeIn && !v.timeOut);
      if (activeIndex !== -1) {
        const foundIndex = visits.length - 1 - activeIndex;
        visits[foundIndex].timeOut = activeVisit.timeOut;
        visits[foundIndex].status = 'OUT';
        await student.save();
      }
    } catch (e) {
      console.warn('Failed to update embedded visit on timeOut (non-fatal)', e);
    }

    const session = activeVisit;
    const durationMs = new Date(session.timeOut) - new Date(session.timeIn);
    return res.json({ message: 'Time Out recorded', session: { ...session._doc || session }, durationMs, studentId: student._id });
  }

  // Fallback: update embedded visit if Visit doc wasn't found
  const visits = student.visits || [];
  const activeIndex = visits.map(v => v).reverse().findIndex(v => v.timeIn && !v.timeOut);
  let foundIndex = -1;
  if (activeIndex !== -1) {
    foundIndex = visits.length - 1 - activeIndex;
  }

  if (foundIndex === -1) {
    return res.status(400).json({ message: 'No active session found' });
  }

  visits[foundIndex].timeOut = new Date();
  visits[foundIndex].status = 'OUT';
  await student.save();

  const session = visits[foundIndex];
  const durationMs = new Date(session.timeOut) - new Date(session.timeIn);

  return res.json({ message: 'Time Out recorded', session: { ...session._doc || session }, durationMs, studentId: student._id });
}

export async function recentVisits(req, res) {
  try {
      const limit = Math.max(1, parseInt(req.query.limit || '10', 10));
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const q = (req.query.q || '').trim();
      const sortBy = String(req.query.sortBy || 'timeIn');
      const sortOrder = String(req.query.order || 'desc').toLowerCase() === 'asc' ? 1 : -1;
      const skip = (page - 1) * limit;
      const sortField = sortBy === 'timeOut' ? 'timeOut' : 'timeIn';

      // Build visit filter
      const filter = {};
      // Allow filtering by purpose, status, deviceId, kiosk
      if (req.query.purpose) filter.purpose = { $regex: req.query.purpose, $options: 'i' };
      if (req.query.status) filter.status = String(req.query.status);
      if (req.query.deviceId) filter.deviceId = String(req.query.deviceId);
      if (req.query.kiosk) filter.kiosk = { $regex: req.query.kiosk, $options: 'i' };

      // If q is provided, try to find matching students first (by name or studentNo)
      let matchingStudentIds = null;
      if (q) {
        const studentQuery = {
          $or: [
            { studentNo: { $regex: q, $options: 'i' } },
            { firstName: { $regex: q, $options: 'i' } },
            { lastName: { $regex: q, $options: 'i' } },
            { middleName: { $regex: q, $options: 'i' } }
          ]
        };
        const matched = await Student.find(studentQuery).select('_id').lean().exec();
        matchingStudentIds = matched.map(m => String(m._id));
        if (matchingStudentIds.length) {
          filter.studentId = { $in: matchingStudentIds };
        } else {
          // no students matched; also try matching purpose or notes directly on Visit
          filter.$or = [
            { purpose: { $regex: q, $options: 'i' } },
            { notes: { $regex: q, $options: 'i' } }
          ];
        }
      }

      const total = await Visit.countDocuments(filter).exec();
      const rows = await Visit.find(filter).sort({ [sortField]: sortOrder }).skip(skip).limit(limit).lean().exec();

      // Populate student basic info for each row
      const studentIds = Array.from(new Set(rows.map(r => String(r.studentId))));
      const students = await Student.find({ _id: { $in: studentIds } }).select('firstName lastName middleInitial photo level course studentNo').lean().exec();
      const studentMap = {};
      students.forEach(s => { studentMap[String(s._id)] = s; });

      const visits = rows.map(r => ({
        _id: r._id,
        timeIn: r.timeIn,
        timeOut: r.timeOut,
        purpose: r.purpose,
        status: r.status,
        deviceId: r.deviceId,
        kiosk: r.kiosk,
        notes: r.notes,
        student: studentMap[String(r.studentId)] || null
      }));

      const totalPages = Math.max(1, Math.ceil(total / limit));
      res.json({ visits, page, limit, total, totalPages, hasMore: page < totalPages });
  } catch (err) {
    console.error('recentVisits error', err);
    res.status(500).json({ message: 'Error fetching recent visits' });
  }
}
