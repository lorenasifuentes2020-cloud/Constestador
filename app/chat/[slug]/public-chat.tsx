'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Send, ShieldCheck, Store } from 'lucide-react';
import styles from './public-chat.module.css';

type Message = { role: 'user' | 'assistant'; text: string; createdAt?: string };
type ChatConfig = {
  store: { name: string; category: string; color: string };
  agent: { name: string; greeting: string };
  messages: Message[];
};

export default function PublicChat({ slug }: { slug: string }) {
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [visitorId, setVisitorId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const storageKey = `nexo-chat-${slug}`;

  useEffect(() => {
    const saved = localStorage.getItem(storageKey) || '';
    const query = saved ? `?visitorId=${encodeURIComponent(saved)}` : '';
    fetch(`/api/public/chat/${encodeURIComponent(slug)}${query}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as ChatConfig & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Este chat no está disponible.');
        setVisitorId(saved);
        setConfig(data);
        setMessages(data.messages || []);
      })
      .catch((cause) => setError((cause as Error).message));
  }, [slug, storageKey]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  useEffect(() => {
    if (!visitorId) return;
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/public/chat/${encodeURIComponent(slug)}?visitorId=${encodeURIComponent(visitorId)}`, { cache: 'no-store' });
        const data = await response.json() as ChatConfig & { error?: string };
        if (response.ok && !cancelled) setMessages(data.messages || []);
      } catch { /* the next refresh can recover */ }
    }
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [slug, visitorId]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const text = String(new FormData(form).get('message') || '').trim();
    if (!text) return;
    setError('');
    setMessages((current) => [...current, { role: 'user', text }]);
    form.reset();
    setBusy(true);
    try {
      const response = await fetch(`/api/public/chat/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: visitorId || undefined, customerName: name, message: text }),
      });
      const data = await response.json() as { error?: string; visitorId?: string; reply?: string };
      if (!response.ok) throw new Error(data.error || 'No pudimos enviar el mensaje.');
      if (data.visitorId && data.visitorId !== visitorId) {
        setVisitorId(data.visitorId);
        localStorage.setItem(storageKey, data.visitorId);
      }
      setMessages((current) => [...current, { role: 'assistant', text: data.reply || 'Recibimos tu mensaje.' }]);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !config) return <main className={styles.unavailable}><Store size={35}/><h1>Chat no disponible</h1><p>{error}</p></main>;
  if (!config) return <main className={styles.unavailable}><span className={styles.spinner}/>Cargando tienda…</main>;

  return <main className={styles.page}>
    <section className={styles.card}>
      <header>
        <span className={styles.logo}><Bot size={25}/></span>
        <div><h1>{config.store.name}</h1><p>{config.agent.name} · Asistente virtual</p></div>
        <span className={styles.online}>En línea</span>
      </header>
      <div className={styles.messages} aria-live="polite">
        {!messages.length&&<div className={styles.intro}><span><Bot size={29}/></span><h2>¡Hola!</h2><p>{config.agent.greeting}</p></div>}
        {messages.map((message, index)=><div key={index} className={`${styles.message} ${styles[message.role]}`}>{message.text}</div>)}
        {busy&&<div className={`${styles.message} ${styles.assistant}`}>Escribiendo…</div>}
        <div ref={endRef}/>
      </div>
      <form className={styles.form} onSubmit={send}>
        {!visitorId&&<input className={styles.name} value={name} onChange={(event)=>setName(event.target.value)} maxLength={80} placeholder="Tu nombre (opcional)" aria-label="Tu nombre"/>}
        <div className={styles.compose}><input name="message" required maxLength={1200} placeholder="Escribe tu consulta…" aria-label="Mensaje" disabled={busy}/><button disabled={busy} aria-label="Enviar"><Send size={19}/></button></div>
      </form>
      {error&&<div className={styles.error} role="alert">{error}</div>}
      <footer><ShieldCheck size={13}/> Tus mensajes se comparten con el equipo de {config.store.name}.</footer>
    </section>
  </main>;
}
