// Worker chạy theo giờ UTC, còn bot phải nghĩ theo giờ của người dùng.
// Mọi hàm ở đây nhận `tz` kiểu "Asia/Ho_Chi_Minh".

export function localParts(tz, date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour,
    minute: Number(p.minute),
    hhmm: `${String(hour).padStart(2, '0')}:${p.minute}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
    weekdayVi: { Sun: 'Chủ nhật', Mon: 'Thứ hai', Tue: 'Thứ ba', Wed: 'Thứ tư', Thu: 'Thứ năm', Fri: 'Thứ sáu', Sat: 'Thứ bảy' }[p.weekday],
  };
}

export function today(tz, date = new Date()) {
  return localParts(tz, date).date;
}

export function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Đang trong giờ yên tĩnh (không tự nhắn tin)? from=23, to=6 nghĩa là 23h→6h. */
export function isQuietHours(tz, quiet, date = new Date()) {
  if (!quiet) return false;
  const { hour } = localParts(tz, date);
  const { from, to } = quiet;
  return from > to ? hour >= from || hour < to : hour >= from && hour < to;
}

/**
 * Mốc "HH:MM" đã tới chưa, trong cửa sổ ±`windowMin` phút.
 * Cron chạy 5 phút/lần nên cần cửa sổ, không so bằng tuyệt đối.
 */
export function isTimeSlot(tz, hhmm, windowMin = 5, date = new Date()) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const now = localParts(tz, date);
  const diff = now.hour * 60 + now.minute - (h * 60 + m);
  return diff >= 0 && diff < windowMin;
}

/** Độ lệch múi giờ (ms) của `tz` tại thời điểm `date`. */
function tzOffsetMs(tz, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - date.getTime();
}

/** "2026-09-20 08:00" theo giờ địa phương -> Date (UTC thật). */
export function localToUtc(tz, text) {
  const m = String(text).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ts = guess - tzOffsetMs(tz, new Date(guess));
  ts = guess - tzOffsetMs(tz, new Date(ts)); // lặp 1 lần cho chuẩn quanh mốc đổi giờ
  return new Date(ts);
}

/** Date -> "HH:MM ngày DD/MM" theo giờ địa phương, để hiển thị cho người Việt. */
export function formatLocal(tz, date) {
  const p = localParts(tz, date);
  const [y, mo, d] = p.date.split('-');
  return `${p.hhmm} ngày ${d}/${mo}${y !== String(new Date().getUTCFullYear()) ? `/${y}` : ''}`;
}
