const SystemSetting = require('../models/SystemSetting');

async function getRegistrationPeriod() {
  try {
    const startSetting = await SystemSetting.findOne({ key: 'courseRegistrationStart' });
    const endSetting = await SystemSetting.findOne({ key: 'courseRegistrationEnd' });
    return {
      start: startSetting ? startSetting.value : null,
      end: endSetting ? endSetting.value : null,
    };
  } catch (error) {
    console.error('Failed to get registration period settings:', error);
    return { start: null, end: null };
  }
}

function getRegistrationStatus(period) {
  const { start, end } = period || { start: null, end: null };
  if (!start || !end) {
    return 'LOCKED';
  }
  const now = new Date();
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (now < startDate) {
    return 'NOT_STARTED';
  }
  if (now >= startDate && now <= endDate) {
    return 'ACTIVE';
  }
  return 'EXPIRED';
}

function isRegistrationActive(period) {
  return getRegistrationStatus(period) === 'ACTIVE';
}

function formatRegistrationDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function toLocalISOString(date) {
  if (!date) return '';
  const d = new Date(date);
  // Shift by +7 hours to get Asia/Ho_Chi_Minh local representation
  const tzOffset = 7 * 60 * 60 * 1000;
  const localTime = new Date(d.getTime() + tzOffset);
  return localTime.toISOString().slice(0, 16);
}

function parseLocalTime(timeStr) {
  if (!timeStr) return null;
  // If timeStr is YYYY-MM-DDTHH:mm, append +07:00 to specify Asia/Ho_Chi_Minh local timezone
  return new Date(timeStr + '+07:00');
}

module.exports = {
  getRegistrationPeriod,
  getRegistrationStatus,
  isRegistrationActive,
  formatRegistrationDate,
  toLocalISOString,
  parseLocalTime,
};
