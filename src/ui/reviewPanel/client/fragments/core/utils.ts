/**
 * Pure HTML / time formatting helpers used by every render function.
 * No state access, no DOM mutation.
 */
export const UTILS = `
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function escAttr(s){ return esc(s).replace(/"/g,'&quot;') }
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
  function nowStamp(){
    const d = new Date();
    return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds());
  }
`;
