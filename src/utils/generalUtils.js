/**
 * Retorna um elemento aleatório de um array.
 * @param {Array<any>} arr O array de entrada.
 * @returns {any | undefined} Um elemento aleatório do array, ou undefined se o array estiver vazio.
 */
export function getRandomElement(arr) {
  if (!arr || arr.length === 0) {
    return undefined;
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Analisa uma string de tempo "HH:MM" para um objeto { hour, minute }.
 * @param {string} timeStr A string de tempo.
 * @returns {{hour: number, minute: number}} Objeto com hora e minuto.
 */
export function parseTime(timeStr) {
  if (typeof timeStr !== 'string' || !timeStr.includes(':')) {
    console.warn(`parseTime: Formato de tempo inválido ou não é string: '${timeStr}'. Usando 00:00 como padrão.`);
    return { hour: 0, minute: 0 };
  }
  const parts = timeStr.split(':');
  if (parts.length !== 2) {
    console.warn(`parseTime: Formato de tempo inválido (número de partes incorreto): '${timeStr}'. Usando 00:00 como padrão.`);
    return { hour: 0, minute: 0 };
  }
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);

  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    console.warn(`parseTime: Valor inválido ou NaN para hora/minuto de '${timeStr}'. Hora: ${hour}, Minuto: ${minute}. Usando 00:00 como padrão.`);
    return { hour: 0, minute: 0 };
  }
  return { hour, minute };
}

/**
 * Calcula um atraso aleatório em milissegundos dentro de um intervalo de minutos.
 * @param {number} minMinutes - O número mínimo de minutos.
 * @param {number} maxMinutes - O número máximo de minutos.
 * @returns {number} O atraso em milissegundos.
 */
export function calculateRandomDelay(minMinutes, maxMinutes) {
    return (Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes) * 60 * 1000;
} 