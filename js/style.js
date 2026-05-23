const STYLE_PATH = '../css/style.css';

async function injectStyleSheet() {
  if (document.getElementById('injected-style-js')) return;
  try {
    const response = await fetch(STYLE_PATH);
    if (!response.ok) {
      console.error(`Failed to load stylesheet from ${STYLE_PATH}: ${response.status}`);
      return;
    }

    const css = await response.text();
    const style = document.createElement('style');
    style.id = 'injected-style-js';
    style.type = 'text/css';
    style.textContent = css;
    document.head.appendChild(style);
  } catch (error) {
    console.error('Error injecting style sheet:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectStyleSheet);
} else {
  injectStyleSheet();
}

export default injectStyleSheet;
