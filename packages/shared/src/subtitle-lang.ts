const LANGUAGE_MAP: Record<string, string> = {
  english: 'eng',
  hebrew: 'heb',
  spanish: 'spa',
  french: 'fre',
  german: 'ger',
  italian: 'ita',
  portuguese: 'por',
  russian: 'rus',
  arabic: 'ara',
  japanese: 'jpn',
  korean: 'kor',
  chinese: 'chi',
};

export function mapPutioLanguageToStremio(language: string): string | null {
  const normalized = language.trim().toLowerCase();
  if (LANGUAGE_MAP[normalized]) {
    return LANGUAGE_MAP[normalized];
  }

  if (/^[a-z]{3}$/i.test(normalized)) {
    return normalized.toLowerCase();
  }

  return null;
}

export function isEnglishSubtitle(language: string): boolean {
  return mapPutioLanguageToStremio(language) === 'eng';
}
