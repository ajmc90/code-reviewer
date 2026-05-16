export const CLIENT_SCRIPT = String.raw`
(function(){
  const vscode = acquireVsCodeApi();
  document.addEventListener('click', (ev)=>{
    const a = ev.target.closest('[data-act]');
    if (a) {
      ev.preventDefault();
      vscode.postMessage({ type: a.dataset.act });
      return;
    }
    const h = ev.target.closest('[data-recall]');
    if (h) {
      ev.preventDefault();
      vscode.postMessage({ type: 'recall', id: h.dataset.recall });
    }
  });
  document.addEventListener('keydown', (ev)=>{
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const h = ev.target.closest && ev.target.closest('[data-recall]');
    if (h) {
      ev.preventDefault();
      vscode.postMessage({ type: 'recall', id: h.dataset.recall });
    }
  });
})();
`;
