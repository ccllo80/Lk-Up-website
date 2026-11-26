import { useCallback, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowUpLeft, Check, Clipboard, CloudUpload, Copy, ExternalLink,
  FileImage, Film, Image as ImageIcon, Link2, LoaderCircle, ShieldCheck,
  Sparkles, Upload, X
} from 'lucide-react';

const MAX_BYTES = 30 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const bucket = import.meta.env.VITE_SUPABASE_BUCKET || 'lk-up-media';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function detectType(file) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (ascii(4, 4) === 'ftyp') return 'video/mp4';
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  return null;
}

function makeLinks(publicUrl) {
  const page = new URL('/view', window.location.origin);
  page.searchParams.set('src', publicUrl);
  const embed = new URL('/embed', window.location.origin);
  embed.searchParams.set('src', publicUrl);
  return {
    page: page.toString(),
    direct: publicUrl,
    media: publicUrl,
    embed: embed.toString(),
    html: `<iframe src="${embed.toString()}" width="100%" height="480" frameborder="0" allowfullscreen loading="lazy"></iframe>`
  };
}

function Media({ src, compact = false }) {
  if (!src) return null;
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(src);
  return isVideo
    ? <video className={compact ? 'preview-media compact' : 'preview-media'} src={src} controls playsInline />
    : <img className={compact ? 'preview-media compact' : 'preview-media'} src={src} alt="الوسيط المرفوع" />;
}

function PublicView({ src, embed = false }) {
  const [valid, setValid] = useState(false);
  const safeSrc = (() => {
    try {
      const u = new URL(src);
      return u.protocol === 'https:' && u.hostname.endsWith('.supabase.co') ? u.toString() : '';
    } catch { return ''; }
  })();
  if (!safeSrc) return <main className="public-error">الرابط غير صالح أو غير مدعوم.</main>;
  return <main className={embed ? 'embed-page' : 'public-page'}>
    <div className="public-brand"><span className="brand-mark">lk.</span> Lk Up</div>
    <div className="public-media"><Media src={safeSrc} /></div>
    {!embed && <a className="public-open" href={safeSrc} target="_blank" rel="noreferrer">فتح الملف الأصلي <ExternalLink size={15}/></a>}
  </main>;
}

function App() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [links, setLinks] = useState(null);
  const [copied, setCopied] = useState('');
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path === '/view' || path === '/embed') return <PublicView src={params.get('src') || ''} embed={path === '/embed'} />;

  const chooseFile = async (picked) => {
    const next = picked?.[0];
    if (!next) return;
    setError(''); setLinks(null);
    if (next.size > MAX_BYTES) { setFile(null); setError('حجم الملف يتجاوز الحد الأقصى وهو 30 ميغابايت.'); return; }
    if (next.size === 0) { setFile(null); setError('الملف فارغ، اختر ملفاً آخر.'); return; }
    const detected = await detectType(next);
    if (!detected) { setFile(null); setError('نوع الملف غير مدعوم أو أن محتواه لا يطابق امتداده.'); return; }
    setFile(Object.assign(next, { detectedType: detected }));
  };

  const upload = async () => {
    if (!file || busy) return;
    if (!supabase) { setError('لم يتم إعداد Supabase بعد. أضف مفاتيح المشروع في متغيرات البيئة ثم أعد تشغيل الموقع.'); return; }
    setBusy(true); setError('');
    try {
      const extension = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm'})[file.detectedType];
      const objectPath = `${crypto.randomUUID()}/media.${extension}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, {
        cacheControl: '31536000', upsert: false, contentType: file.detectedType
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      setLinks(makeLinks(data.publicUrl));
    } catch (e) {
      setError(e?.message || 'تعذّر رفع الملف. تحقق من إعدادات التخزين وحاول مجدداً.');
    } finally { setBusy(false); }
  };

  const copy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key); window.setTimeout(() => setCopied(''), 1800);
    } catch { setError('تعذّر النسخ تلقائياً. حدّد النص وانسخه يدوياً.'); }
  };

  const reset = () => { setFile(null); setLinks(null); setError(''); if (inputRef.current) inputRef.current.value = ''; };
  const onDrop = useCallback((e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files); }, []);

  if (links) return <div className="app-shell"><header className="topbar"><a className="brand" href="/"><span className="brand-mark">lk.</span><span>Lk Up</span></a><span className="top-note">مشاركة الوسائط ببساطة</span></header><main className="result-wrap">
    <div className="success-icon"><Check size={25}/></div><p className="eyebrow">اكتمل الرفع بنجاح</p><h1>ملفك أصبح جاهزاً للمشاركة</h1><p className="subheading">احتفظ بالروابط أو انسخ ما تحتاجه.</p>
    <section className="result-preview"><Media src={links.direct}/><div className="file-meta"><span>{file?.name}</span><span>{file ? formatSize(file.size) : ''}</span></div></section>
    <section className="link-list">
      {[['page','رابط الصفحة','يفتح صفحة عرض خاصة بالملف',links.page],['direct','الرابط المباشر','يفتح الملف الأصلي مباشرة',links.direct],['media','رابط الوسيط','استخدمه في المواقع والتطبيقات',links.media],['embed','صفحة التضمين','عرض نظيف مناسب للإطارات',links.embed]].map(([key,title,desc,value]) => <div className="link-row" key={key}><div className="link-info"><strong>{title}</strong><small>{desc}</small><span dir="ltr">{value}</span></div><button className="copy-btn" onClick={() => copy(key,value)} aria-label="نسخ الرابط">{copied===key?<Check size={17}/>:<Copy size={17}/>}<span>{copied===key?'تم النسخ':'نسخ'}</span></button></div>)}
    </section>
    <div className="html-copy"><div><strong>كود HTML للتضمين</strong><small>انسخه والصقه في صفحة HTML الخاصة بك.</small></div><code dir="ltr">{links.html}</code><button className="secondary-btn" onClick={() => copy('html',links.html)}>{copied==='html'?<Check size={16}/>:<Clipboard size={16}/>} نسخ الكود</button></div>
    <button className="new-upload" onClick={reset}><Upload size={17}/> رفع ملف آخر</button>
  </main><footer>© {new Date().getFullYear()} Lk Up. مشاركة أسهل، بروابط مباشرة.</footer></div>;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark">lk.</span><span>Lk Up</span></a><div className="top-note"><ShieldCheck size={15}/> رفع بسيط وآمن</div></header>
    <main className="hero">
      <div className="hero-copy"><span className="pill"><Sparkles size={14}/> شارك ملفاتك بطريقتك</span><h1>ملفاتك، برابط<br/><em>واحد.</em></h1><p>ارفع صورة أو فيديو أو GIF، واحصل على روابط جاهزة للمشاركة والتضمين خلال لحظات.</p></div>
      <section className="upload-card">
        <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e)=>chooseFile(e.target.files)}/>
        <div className={`drop-zone ${dragging?'dragging':''} ${file?'has-file':''}`} onClick={()=>!busy && inputRef.current?.click()} onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop} role="button" tabIndex="0" onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' ')inputRef.current?.click()}}>
          {file ? <><div className="file-icon">{file.detectedType.startsWith('video')?<Film/>:<FileImage/>}</div><strong className="selected-name">{file.name}</strong><span className="file-size">{formatSize(file.size)} · جاهز للرفع</span><button className="remove-file" onClick={(e)=>{e.stopPropagation();reset()}} aria-label="إزالة الملف"><X size={16}/></button></> : <><div className="upload-icon"><CloudUpload size={29}/></div><strong>اسحب الملف إلى هنا</strong><span>أو اضغط لاختيار ملف من جهازك</span><span className="browse-label">اختيار ملف</span></>}
        </div>
        <div className="supported"><span><ImageIcon size={15}/> صور</span><span><Film size={15}/> فيديو</span><span><Sparkles size={14}/> GIF</span><b>حتى 30 MB</b></div>
        {error && <div className="error-message" role="alert">{error}</div>}
        <button className="upload-button" disabled={!file || busy} onClick={upload}>{busy?<><LoaderCircle className="spin" size={18}/> جارٍ رفع الملف...</>:<><Upload size={18}/> ارفع الآن <ArrowUpLeft size={17}/></>}</button>
        <p className="privacy-note"><ShieldCheck size={14}/> لا نطلب منك إنشاء حساب لرفع الملفات.</p>
      </section>
      <div className="feature-strip"><div><span className="feature-icon"><Link2 size={18}/></span><div><strong>روابط متعددة</strong><small>مباشر، صفحة، وتضمين</small></div></div><div><span className="feature-icon"><ShieldCheck size={18}/></span><div><strong>تحقق من الملفات</strong><small>نوع وحجم محددان</small></div></div><div><span className="feature-icon"><Sparkles size={18}/></span><div><strong>بلا تعقيد</strong><small>خطوات قليلة وسريعة</small></div></div></div>
    </main>
    <footer>© {new Date().getFullYear()} Lk Up. مشاركة أسهل، بروابط مباشرة.</footer>
  </div>;
}

export default App;