/**
 * Splits an element's text into per-word spans wrapped in overflow-hidden
 * masks, enabling the masked word-reveal animation used by the intro.
 */
export function splitWords(element: HTMLElement): HTMLElement[] {
  const text = element.textContent?.trim().replace(/\s+/g, ' ') ?? '';
  element.textContent = '';

  const words: HTMLElement[] = [];

  for (const wordText of text.split(' ')) {
    const mask = document.createElement('span');
    mask.className = 'word-mask';

    const word = document.createElement('span');
    word.className = 'word';
    word.textContent = wordText;

    mask.appendChild(word);
    element.appendChild(mask);
    element.appendChild(document.createTextNode(' '));
    words.push(word);
  }

  return words;
}

/**
 * Splits text into per-character spans, grouped into overflow-hidden word
 * masks so characters can rise into view without breaking across spaces.
 * Returns the individual character spans for staggered reveal animation.
 */
export function splitChars(element: HTMLElement): HTMLElement[] {
  const text = element.textContent?.trim().replace(/\s+/g, ' ') ?? '';
  element.textContent = '';

  const chars: HTMLElement[] = [];

  for (const wordText of text.split(' ')) {
    const mask = document.createElement('span');
    mask.className = 'char-mask';

    for (const charText of [...wordText]) {
      const char = document.createElement('span');
      char.className = 'char';
      char.textContent = charText;
      mask.appendChild(char);
      chars.push(char);
    }

    element.appendChild(mask);
    element.appendChild(document.createTextNode(' '));
  }

  return chars;
}
