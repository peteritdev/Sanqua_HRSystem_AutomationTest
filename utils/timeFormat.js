// DB tetap simpan desimal jam (NUMERIC(10,2), sesuai konvensi tr_employeerequestovertimes.total_hour_rounding).
// Modul ini cuma buat konversi tampilan/input jam+menit <-> desimal jam.

function decimalHoursToHM(decimalHours) {
  if (decimalHours === null || decimalHours === undefined || decimalHours === '') return { hours: 0, minutes: 0 };
  const totalMinutes = Math.round(Number(decimalHours) * 60);
  const neg = totalMinutes < 0;
  const abs = Math.abs(totalMinutes);
  return {
    hours: neg ? -Math.floor(abs / 60) : Math.floor(abs / 60),
    minutes: abs % 60,
  };
}

function decimalHoursToLabel(decimalHours) {
  if (decimalHours === null || decimalHours === undefined || decimalHours === '') return '-';
  const totalMinutes = Math.round(Number(decimalHours) * 60);
  const neg = totalMinutes < 0;
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${neg ? '-' : ''}${h}j ${m}m`;
}

// hours boleh negatif (contoh kasus deduction di data asli), minutes selalu 0-59.
function hmToDecimalHours(hours, minutes) {
  const h = Number(hours) || 0;
  const m = Math.abs(Number(minutes) || 0);
  return h < 0 ? h - m / 60 : h + m / 60;
}

module.exports = { decimalHoursToHM, decimalHoursToLabel, hmToDecimalHours };
