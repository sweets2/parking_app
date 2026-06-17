const SCHEDULE_DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

export type ScheduleRange = {
  startDayIdx: number;
  endDayIdx: number;
  startMinutes: number;
  endMinutes: number;
};

export function parseScheduleHour(token: string): number {
  const match = token.trim().match(/^(\d+)\s+(am|pm)$/i);
  if (!match) return -1;
  let hour = parseInt(match[1], 10);
  const period = match[2].toLowerCase();
  if (period === "pm" && hour !== 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  return hour;
}

export function getEasternParts(now: Date): { dayIdx: number; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = (parts.find((part) => part.type === "weekday")?.value ?? "").toLowerCase();
  const rawHour = parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((part) => part.type === "minute")?.value ?? "0", 10);
  return {
    dayIdx: SCHEDULE_DAY_INDEX[weekday] ?? -1,
    minutesOfDay: (rawHour % 24) * 60 + minute,
  };
}

export function parseScheduleRange(schedule: string): ScheduleRange | null {
  const sepIdx = schedule.indexOf("   ");
  if (sepIdx === -1) return null;
  const dayPart = schedule.slice(0, sepIdx).trim();
  const timePart = schedule.slice(sepIdx).trim();

  const throughMatch = dayPart.match(/^(.+?)\s+through\s+(.+)$/i);
  let startDayIdx: number;
  let endDayIdx: number;
  if (throughMatch) {
    startDayIdx = SCHEDULE_DAY_INDEX[throughMatch[1].toLowerCase().trim()] ?? -1;
    endDayIdx = SCHEDULE_DAY_INDEX[throughMatch[2].toLowerCase().trim()] ?? -1;
  } else {
    startDayIdx = SCHEDULE_DAY_INDEX[dayPart.toLowerCase()] ?? -1;
    endDayIdx = startDayIdx;
  }
  if (startDayIdx === -1 || endDayIdx === -1) return null;

  const timeMatch = timePart.match(/^(.+?)\s*[–-]\s*(.+)$/);
  if (!timeMatch) return null;
  const startHour = parseScheduleHour(timeMatch[1]);
  const endHour = parseScheduleHour(timeMatch[2]);
  if (startHour === -1 || endHour === -1) return null;

  return {
    startDayIdx,
    endDayIdx,
    startMinutes: startHour * 60,
    endMinutes: endHour * 60,
  };
}

export function isScheduleActiveNow(schedule: string, now: Date): boolean {
  const { dayIdx, minutesOfDay } = getEasternParts(now);
  if (dayIdx === -1) return false;
  const range = parseScheduleRange(schedule);
  if (range === null) return false;
  if (dayIdx < range.startDayIdx || dayIdx > range.endDayIdx) return false;
  return minutesOfDay >= range.startMinutes && minutesOfDay < range.endMinutes;
}

export function isScheduleUpcomingSoon(schedule: string, now: Date): boolean {
  const { dayIdx, minutesOfDay } = getEasternParts(now);
  if (dayIdx === -1) return false;
  const range = parseScheduleRange(schedule);
  if (range === null) return false;
  if (dayIdx < range.startDayIdx || dayIdx > range.endDayIdx) return false;
  return minutesOfDay >= range.startMinutes - 60 && minutesOfDay < range.startMinutes;
}
