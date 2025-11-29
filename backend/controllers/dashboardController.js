import Student from '../models/Student.js';
import Visit from '../models/Visit.js';

export const getMonitorStats = async (req, res) => {
  try {
    const today = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // occupancy: visits with timeIn but no timeOut
    const occupancy = await Visit.countDocuments({ timeIn: { $exists: true }, timeOut: { $exists: false } }).exec();

    // total visits today: any Visit with timeIn or timeOut in today's range (count each visit once)
    const totalVisitsToday = await Visit.countDocuments({
      $or: [
        { timeIn: { $gte: startOfDay, $lt: endOfDay } },
        { timeOut: { $gte: startOfDay, $lt: endOfDay } }
      ]
    }).exec();

    // new registrations today (students created today)
    const newRegistrations = await Student.countDocuments({ createdAt: { $gte: startOfDay, $lt: endOfDay } }).exec();

    // top purposes today (aggregation)
    const topPurposesAgg = await Visit.aggregate([
      { $match: { timeIn: { $gte: startOfDay, $lt: endOfDay }, purpose: { $exists: true, $ne: null, $ne: '' } } },
      { $group: { _id: '$purpose', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
      { $project: { _id: 0, name: '$_id', count: 1 } }
    ]).exec();

    // average stay (in minutes) for completed visits today
    const avgStayAgg = await Visit.aggregate([
      { $match: { timeIn: { $gte: startOfDay, $lt: endOfDay }, timeOut: { $exists: true, $ne: null } } },
      { $project: { durationMs: { $subtract: ['$timeOut', '$timeIn'] } } },
      { $group: { _id: null, avgMs: { $avg: '$durationMs' } } },
      { $project: { _id: 0, avgMs: 1 } }
    ]).exec();
    const avgMs = (avgStayAgg && avgStayAgg.length && avgStayAgg[0].avgMs) ? avgStayAgg[0].avgMs : null;
    const avgStay = avgMs ? Math.round((avgMs / 1000 / 60) * 10) / 10 : 0; // minutes, one decimal

    res.json({ occupancy, totalVisitsToday, newRegistrations, topPurposes: topPurposesAgg, avgStay });
  } catch (err) {
    console.error('getMonitorStats error', err);
    res.status(500).json({ message: 'Error fetching stats' });
  }
};

export const getTimedInStudents = async (req, res) => {
  try {
    const today = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    // Find students who timed in or out today, limit to 50
    const students = await Student.find({
      visits: {
        $elemMatch: {
          timeIn: { $gte: startOfDay, $lt: endOfDay }
        }
      }
    }).limit(50).sort({ 'visits.timeIn': -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching students' });
  }
};

export const getAllStudentsByDate = async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    // Find all students with visits on the given date
    const students = await Student.find({
      visits: {
        $elemMatch: {
          timeIn: { $gte: startOfDay, $lt: endOfDay }
        }
      }
    }).sort({ 'visits.timeIn': -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching students by date' });
  }
};
