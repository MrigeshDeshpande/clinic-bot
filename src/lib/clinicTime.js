import { CLINIC } from '@/config/clinic';

export function getClinicNow() {
  const str = new Date().toLocaleString('en-CA', { timeZone: CLINIC.timeZone });
  return new Date(str + 'T00:00:00');
}

export function getClinicMinutes() {
  const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: CLINIC.timeZone, hour12: false });
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export function getClinicDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: CLINIC.timeZone });
}

export function getClinicToday() {
  return new Date(new Date().toLocaleDateString('en-CA', { timeZone: CLINIC.timeZone }) + 'T00:00:00');
}
