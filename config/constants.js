const ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin',
};

const GRADING_STATUS = {
  NOT_GRADED: 'not_graded',
  PARTIALLY_GRADED: 'partially_graded',
  FULLY_GRADED: 'fully_graded',
};

const SUBMISSION_STATUS = {
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  LATE: 'late',
  AUTO_SUBMITTED: 'auto_submitted',
};

const CACHE_KEYS = {
  CLASSROOM_ANALYTICS: (classroomId) => `classroom_analytics_${classroomId}`,
};

const CACHE_TTL = {
  ANALYTICS: 300, // 5 minutes
};

module.exports = {
  ROLES,
  GRADING_STATUS,
  SUBMISSION_STATUS,
  CACHE_KEYS,
  CACHE_TTL,
};
