/**
 * Pure HTML / time formatting helpers used by every render function.
 * No state access, no DOM mutation.
 */
export const UTILS = `
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function escAttr(s){ return esc(s).replace(/"/g,'&quot;') }
  /**
   * Escape HTML *and* wrap markdown-style backtick spans in <code> tags.
   * Safe to inject as innerHTML because escaping runs first — the backtick
   * substitution only sees already-encoded text. Used for LLM prose fields
   * (description, reasoning, concerns, …) so identifiers like \`.env\` or
   * \`JWT_SECRET\` render as inline code instead of literal backticks.
   *
   * Single-line spans only (non-greedy, no newlines) so a stray unclosed
   * backtick at the end of a paragraph doesn't swallow the next field.
   */
  function escMd(s){
    return esc(s).replace(/\`([^\`\\n]+?)\`/g, '<code class="md-code">$1</code>');
  }
  function truncateForMeta(s){
    s = String(s||'').replace(/\\s+/g, ' ').trim();
    return s.length > 60 ? s.slice(0,60)+'…' : s;
  }
  function fmtElapsed(ms){
    const s = Math.round(ms/1000);
    if (s < 60) return s+'s';
    const m = Math.floor(s/60), r = s%60;
    return m+'m '+r+'s';
  }

  /** Format a token / char count with thousand separators. */
  function fmtCount(n){
    n = Number(n)||0;
    if (n < 1000) return String(n);
    if (n < 1e6) return (n/1000).toFixed(n < 10000 ? 1 : 0)+'k';
    return (n/1e6).toFixed(1)+'M';
  }

  /**
   * Classify a streamed CLI chunk so the timeline can show structured progress
   * instead of the raw JSON-fragment noise that used to bleed into the Security
   * row. The CLI prefixes lifecycle messages with sigils we look at first;
   * everything else is treated as raw text_delta from the model and ONLY the
   * char count is surfaced (never the content).
   *
   * Returns one of:
   *   { kind: 'metrics', metrics: {...} } — final telemetry summary ("◆ ...")
   *   { kind: 'tool', tool }             — Read/Grep/Glob invocation
   *   { kind: 'phase', label }           — thinking / writing / retrying / parsing
   *   { kind: 'streamText' }             — model text_delta, content suppressed
   *   { kind: 'noise' }                  — usage echoes, empty, init, unknown
   */
  function classifyChunk(s){
    if (!s) return { kind: 'noise' };
    // Telemetry summary from emitTelemetry — the structured signal we render
    // as chips. Format: "◆ $0.4943  in=480709 (cache 94%)  out=3349  63.4s  tools=2"
    if (s.charAt(0) === '◆'){
      return { kind: 'metrics', metrics: parseTelemetryLine(s.slice(1).trim()) };
    }
    if (s.charAt(0) === '⚙'){
      // "⚙ tool: Read · /path/..."
      const m = /tool:\\s*([A-Za-z_][\\w]*)/.exec(s);
      return { kind: 'tool', tool: m ? m[1] : null };
    }
    if (s.charAt(0) === '↻') return { kind: 'phase', label: tMsg('timeline.phase.retrying') };
    if (s.charAt(0) === '…') return { kind: 'phase', label: tMsg('timeline.phase.thinking') };
    if (s.charAt(0) === '▸'){
      // "▸ writing response" — the model is about to emit visible text.
      return { kind: 'phase', label: tMsg('timeline.phase.writing') };
    }
    if (s.charAt(0) === '◇'){
      // System/lifecycle: session ready, message_start, message_stop, usage.
      // These don't deserve a status line of their own — keep the previous one.
      return { kind: 'noise' };
    }
    // Anything else is raw text_delta from the model. Don't show the content;
    // it's usually mid-JSON and looks like garbage in the UI.
    return { kind: 'streamText' };
  }

  /** Parse a telemetry line like "$0.4943  in=480709 (cache 94%)  out=3349  63.4s  tools=2".
   * Best-effort — missing fields stay undefined and the renderer hides chips
   * for absent values rather than printing 0/?. */
  function parseTelemetryLine(s){
    s = String(s||'');
    const out = {};
    let m;
    if ((m = /\\$([0-9]+\\.[0-9]+)/.exec(s))) out.usd = parseFloat(m[1]);
    if ((m = /in=([0-9]+)/.exec(s))) out.inTokens = parseInt(m[1], 10);
    if ((m = /out=([0-9]+)/.exec(s))) out.outTokens = parseInt(m[1], 10);
    if ((m = /cache\\s+([0-9]+)%/.exec(s))) out.cachePct = parseInt(m[1], 10);
    if ((m = /([0-9]+(?:\\.[0-9]+)?)s\\b/.exec(s))) out.seconds = parseFloat(m[1]);
    if ((m = /tools=([0-9]+)/.exec(s))) out.toolsUsed = parseInt(m[1], 10);
    return out;
  }

  /** Render a "Using Read", "Using Read + Grep", "Using Read (+2 more)" detail. */
  function renderToolDetail(tools){
    if (!tools || !tools.length) return tMsg('timeline.phase.writing');
    if (tools.length === 1) return tMsg('timeline.phase.tool', { tool: tools[0] });
    if (tools.length === 2) return tMsg('timeline.phase.tool', { tool: tools[0]+' + '+tools[1] });
    return tMsg('timeline.phase.toolN', { tool: tools[0], rest: tools.length - 1 });
  }
  function timeAgo(iso){
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d.getTime())) return '';
    const s = Math.floor((Date.now()-d.getTime())/1000);
    if (s < 60) return s+'s ago';
    if (s < 3600) return Math.floor(s/60)+'m ago';
    if (s < 86400) return Math.floor(s/3600)+'h ago';
    if (s < 86400*30) return Math.floor(s/86400)+'d ago';
    if (s < 86400*365) return Math.floor(s/(86400*30))+'mo ago';
    return Math.floor(s/(86400*365))+'y ago';
  }
  function pad2(n){ return n < 10 ? '0'+n : ''+n }
  /**
   * Split a path into directory + filename so the renderer can dim the
   * directory and bolden the file. Returns { dir, file } where dir keeps a
   * trailing slash if non-empty so the join is straightforward in markup.
   */
  function splitPath(p){
    const s = String(p||'');
    const i = s.lastIndexOf('/');
    if (i < 0) return { dir: '', file: s };
    return { dir: s.slice(0, i+1), file: s.slice(i+1) };
  }
  /**
   * Best-effort language tag from a filename extension. Used to label code
   * blocks in finding cards so a snippet reads as 'ts' vs 'sql' rather than
   * anonymous monospace. Unknown extensions fall back to empty (no label).
   */
  function langFromPath(p){
    const m = /\\.([a-z0-9]+)$/i.exec(String(p||''));
    if (!m) return '';
    const ext = m[1].toLowerCase();
    const map = { ts:'ts', tsx:'tsx', js:'js', jsx:'jsx', mjs:'js', cjs:'js',
      json:'json', md:'md', css:'css', scss:'scss', html:'html', py:'py',
      rb:'rb', go:'go', rs:'rs', java:'java', kt:'kt', swift:'swift',
      sh:'sh', yml:'yaml', yaml:'yaml', toml:'toml', sql:'sql', graphql:'gql',
      vue:'vue', svelte:'svelte' };
    return map[ext] || ext;
  }
  /**
   * Detect whether a snippet looks like a unified-diff hunk. Used to decide
   * whether to render with +/- gutter classification (and tinting) vs. as
   * a plain code block.
   */
  function looksLikeDiff(text){
    const lines = String(text||'').split(/\\r?\\n/);
    let plus = 0, minus = 0;
    for (const l of lines){
      if (l.startsWith('+') && !l.startsWith('+++')) plus++;
      else if (l.startsWith('-') && !l.startsWith('---')) minus++;
    }
    return (plus + minus) >= 1 && (plus + minus) >= Math.floor(lines.length * 0.3);
  }

  /**
   * Render an evidence/code snippet to HTML with a clean structure:
   *   .code-line              — one per source line
   *     .code-line__gutter    — kind marker ("+", "-", " ") rendered via CSS
   *                              ::before; NOT part of the copyable text.
   *     .code-line__num       — optional line number, also marked
   *                              user-select:none so copy stays clean.
   *     .code-line__text      — the actual source. This is what users copy.
   *
   * Returns the HTML string. Pair with extractPlainCode() to get the text
   * a Copy button should write to the clipboard.
   *
   * startLine, if provided, seeds line numbering for the first non-deleted
   * line. Deleted (-) lines don't consume numbers in the "new" stream;
   * added (+) and context ( ) lines do. For plain (non-diff) blocks every
   * line numbers sequentially from startLine.
   */
  function renderCodeLines(raw, opts){
    opts = opts || {};
    const text = String(raw||'').replace(/\\r\\n?/g, '\\n');
    const lines = text.split('\\n');
    const isDiff = looksLikeDiff(text);
    const showNums = opts.lineNumbers !== false;
    let lineNum = typeof opts.startLine === 'number' ? opts.startLine : null;
    const out = [];
    for (let i = 0; i < lines.length; i++){
      const raw = lines[i];
      let kind = 'ctx';
      let content = raw;
      if (isDiff){
        // Unified-diff hunk headers ("@@ -10,4 +10,6 @@") render as their own
        // dimmed row — they're location markers, not code.
        if (/^@@.*@@/.test(raw)){
          out.push('<span class="code-line code-line--hunk" data-kind="hunk"><span class="code-line__num" aria-hidden="true"></span><span class="code-line__text">'+esc(raw)+'</span></span>');
          continue;
        }
        if (raw.startsWith('+') && !raw.startsWith('+++')){ kind = 'add'; content = raw.slice(1) }
        else if (raw.startsWith('-') && !raw.startsWith('---')){ kind = 'del'; content = raw.slice(1) }
        else if (raw.startsWith(' ')){ kind = 'ctx'; content = raw.slice(1) }
        else { kind = 'ctx'; content = raw }
      }
      // Number assignment: deletions don't move the "new" counter; context
      // and adds do. Plain blocks number every line. A null lineNum means
      // we leave the gutter blank (no startLine provided).
      let numCell = '';
      if (showNums && lineNum != null){
        const showThisLine = kind !== 'del';
        if (showThisLine){
          numCell = '<span class="code-line__num" aria-hidden="true">'+lineNum+'</span>';
          lineNum++;
        } else {
          numCell = '<span class="code-line__num" aria-hidden="true"></span>';
        }
      } else if (showNums){
        numCell = '<span class="code-line__num" aria-hidden="true"></span>';
      }
      out.push(
        '<span class="code-line code-line--'+kind+'" data-kind="'+kind+'">'+
          numCell +
          '<span class="code-line__text">'+esc(content || '')+'</span>'+
        '</span>'
      );
    }
    return out.join('');
  }

  /**
   * Return a clean, copy-ready version of a code snippet — strips +/- diff
   * prefixes from every line and joins with \\n. The Copy button on the
   * evidence/fix block writes THIS to the clipboard, not the raw text the
   * renderer received (which would include the diff markers as literal
   * characters and look like garbage when pasted back).
   *
   * When asPatch is true, the original text is returned verbatim — useful
   * if the user wants the patch shape (for git apply) instead of the
   * resulting source. Currently always false; the toggle is plumbed for
   * future "copy as patch" affordance.
   */
  function extractPlainCode(raw, asPatch){
    const text = String(raw||'').replace(/\\r\\n?/g, '\\n');
    if (asPatch) return text;
    if (!looksLikeDiff(text)) return text;
    return text.split('\\n').map(l => {
      if (/^[+-]{3}/.test(l)) return null;        // diff file markers
      if (/^@@.*@@/.test(l)) return null;         // hunk headers
      if (l.startsWith('+') || l.startsWith('-')) return l.slice(1);
      if (l.startsWith(' ')) return l.slice(1);
      return l;
    }).filter(l => l !== null).join('\\n');
  }
  function nowStamp(){
    const d = new Date();
    return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());
  }

  /**
   * Centralized verdict-pill update. Always writes to #verdict-label so the
   * sibling .tip child isn't clobbered. When 'value' matches a known verdict
   * key (block / needs-changes / approve-with-comments / approve / praise),
   * also fills the .tip with a rich title + hint sourced from i18n.
   * Falls back gracefully for transient states (running / paused / cancelled)
   * that don't map to a verdict enum: hides the tip in those cases.
   */
  function setVerdict(value, displayLabel){
    const root = $('#verdict');
    if (!root) return;
    root.dataset.v = value || 'idle';
    const label = $('#verdict-label');
    if (label) label.textContent = displayLabel != null ? displayLabel : (value || '').toUpperCase();
    const tip = $('#verdict-tip');
    if (!tip) return;
    // Only show the rich tooltip when the value corresponds to a real verdict
    // enum. Transient states (running/paused/cancelled) have no explanation
    // worth a tooltip — hide it so hovering doesn't pop a blank box.
    const isVerdictEnum = value === 'block' || value === 'needs-changes' ||
                          value === 'approve-with-comments' || value === 'approve' ||
                          value === 'praise';
    if (!isVerdictEnum){
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    const t = $('#verdict-tip-title');
    const h = $('#verdict-tip-hint');
    if (t) t.textContent = tMsg('verdict.' + value + '.title');
    if (h) h.textContent = tMsg('verdict.' + value + '.hint');
  }
`;
