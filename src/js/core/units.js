/* Gear Bench core — units. Everything new is computed in SI; this file is the only place that knows
   what the interface shows: rpm, bar and MPa, kW, °C, mm. No DOM here. */
'use strict';

// unit: [factor to SI, offset to SI, English symbol, Russian symbol]
const UNITS = {
  'rad/s': [1, 0, 'rad/s', 'рад/с'], rpm: [Math.PI / 30, 0, 'rpm', 'об/мин'], Hz: [2 * Math.PI, 0, 'Hz', 'Гц'],
  rad: [1, 0, 'rad', 'рад'], deg: [Math.PI / 180, 0, '°', '°'],
  m: [1, 0, 'm', 'м'], mm: [1e-3, 0, 'mm', 'мм'], 'm/s': [1, 0, 'm/s', 'м/с'], 'mm/s': [1e-3, 0, 'mm/s', 'мм/с'], 'm/s2': [1, 0, 'm/s²', 'м/с²'],
  N: [1, 0, 'N', 'Н'], kN: [1e3, 0, 'kN', 'кН'], Nm: [1, 0, 'N·m', 'Н·м'], kNm: [1e3, 0, 'kN·m', 'кН·м'],
  W: [1, 0, 'W', 'Вт'], kW: [1e3, 0, 'kW', 'кВт'], MW: [1e6, 0, 'MW', 'МВт'], J: [1, 0, 'J', 'Дж'], kJ: [1e3, 0, 'kJ', 'кДж'],
  Pa: [1, 0, 'Pa', 'Па'], kPa: [1e3, 0, 'kPa', 'кПа'], bar: [1e5, 0, 'bar', 'бар'], MPa: [1e6, 0, 'MPa', 'МПа'],
  'm3/s': [1, 0, 'm³/s', 'м³/с'], 'L/min': [1 / 60000, 0, 'L/min', 'л/мин'], 'kg/s': [1, 0, 'kg/s', 'кг/с'],
  K: [1, 0, 'K', 'К'], degC: [1, 273.15, '°C', '°C'],
  kg: [1, 0, 'kg', 'кг'], kgm2: [1, 0, 'kg·m²', 'кг·м²'], s: [1, 0, 's', 'с'], V: [1, 0, 'V', 'В'], A: [1, 0, 'A', 'А'],
  '%': [0.01, 0, '%', '%'], '': [1, 0, '', ''],
};
const toSI = (v, u) => v * UNITS[u][0] + UNITS[u][1];
const fromSI = (v, u) => (v - UNITS[u][1]) / UNITS[u][0];
const unitSym = u => UNITS[u][typeof lang !== 'undefined' && lang === 'ru' ? 3 : 2];
// a number to n significant digits, without exponent notation or trailing zeros, with a real minus sign
function fmtNum(v, n = 3) {
  if (!isFinite(v)) return '–';
  if (v === 0) return '0';
  const a = Math.abs(v), d = Math.max(0, n - 1 - Math.floor(Math.log10(a)));
  return (+v.toFixed(Math.min(d, 9))).toString().replace('-', '−');
}
// families pick the unit a person would write for that magnitude
const FAMILY = { power: ['W', 'kW', 'MW'], pressure: ['Pa', 'kPa', 'bar', 'MPa'], force: ['N', 'kN'], torque: ['Nm', 'kNm'], energy: ['J', 'kJ'] };
const LIMIT = { W: 1e3, kW: 1e6, Pa: 1e3, kPa: 1e5, bar: 1e7, N: 1e4, Nm: 1e4, J: 1e3 };   // above this SI value, move to the next unit
function autoUnit(vSI, family) {
  const us = FAMILY[family];
  for (const u of us) if (LIMIT[u] == null || Math.abs(vSI) < LIMIT[u]) return u;
  return us[us.length - 1];
}
// "12.3 kW" from an SI value; u is a unit or a family name
function fmtU(vSI, u, n = 3) {
  if (FAMILY[u]) u = autoUnit(vSI, u);
  const s = unitSym(u);
  return fmtNum(fromSI(vSI, u), n) + (s ? (s === '°' || s === '%' ? '' : ' ') + s : '');
}
