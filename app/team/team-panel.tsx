'use client';

import {
  ArrowLeft,
  Check,
  ExternalLink,
  History,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import styles from './team.module.css';

type Space = {
  ownerId: string;
  role: 'owner' | 'admin';
  label: string;
  ownerEmail: string;
};

type Member = {
  id: string;
  member_email: string;
  status: 'invited' | 'active';
  invited_at: string;
  joined_at: string | null;
};

type Activity = {
  id: string;
  actor_email: string;
  actor_name: string;
  actor_role: 'owner' | 'admin';
  action: string;
  summary: string;
  created_at: string;
};

type TeamData = {
  current: Space;
  spaces: Space[];
  canManageTeam: boolean;
  members: Member[];
  activity: Activity[];
  maxMembers: number;
  signedInEmail: string;
};

export default function TeamPanel({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/team', { cache: 'no-store' });
      const result = await response.json() as TeamData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo cargar el equipo.');
      setData(result);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('invite');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { members?: Member[]; activity?: Activity[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar la invitación.');
      setData(current => current && result.members
        ? { ...current, members: result.members, activity: result.activity ?? current.activity }
        : current);
      setEmail('');
      setNotice('Invitación creada. Comparte el enlace de Nexo con esta persona.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`¿Quitar el acceso de ${member.member_email}?`)) return;
    setBusy(member.id);
    setError('');
    try {
      const response = await fetch(`/api/team?id=${encodeURIComponent(member.id)}`, {
        method: 'DELETE',
      });
      const result = await response.json() as { members?: Member[]; activity?: Activity[]; error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo quitar el acceso.');
      setData(current => current && result.members
        ? { ...current, members: result.members, activity: result.activity ?? current.activity }
        : current);
      setNotice('Acceso retirado.');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function selectSpace(space: Space) {
    setBusy(space.ownerId);
    setError('');
    try {
      const response = await fetch('/api/team/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: space.ownerId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'No se pudo abrir el espacio.');
      router.push('/');
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
      setBusy('');
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} />
      <section className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.back}><ArrowLeft size={17} />Volver a Nexo</Link>
          <div className={styles.identity}>
            <span>{initials(userName)}</span>
            <div><strong>{userName}</strong><small>{userEmail}</small></div>
          </div>
        </header>

        <div className={styles.intro}>
          <span className={styles.icon}><Users size={25} /></span>
          <div>
            <p className={styles.eyebrow}>ACCESO COMPARTIDO</p>
            <h1>Tu equipo en Nexo</h1>
            <p>Invita administradores para que gestionen contigo productos, clientes, pedidos y configuración de tus tiendas.</p>
          </div>
        </div>

        {loading && <div className={styles.state}><LoaderCircle className={styles.spin} />Cargando equipo…</div>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        {notice && <div className={styles.notice} role="status"><Check size={16} />{notice}</div>}

        {data && <>
          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div><h2>Espacios disponibles</h2><p>Elige las tiendas que quieres administrar ahora.</p></div>
              <ShieldCheck size={21} />
            </div>
            <div className={styles.spaceGrid}>
              {data.spaces.map(space => {
                const active = space.ownerId === data.current.ownerId;
                return <article className={`${styles.space} ${active ? styles.active : ''}`} key={space.ownerId}>
                  <span className={styles.spaceIcon}>{space.role === 'owner' ? 'P' : 'A'}</span>
                  <div><strong>{space.label}</strong><small>{space.role === 'owner' ? 'Propietaria' : `Administradora · ${space.ownerEmail}`}</small></div>
                  {active
                    ? <span className={styles.current}><Check size={13} />Actual</span>
                    : <button disabled={Boolean(busy)} onClick={() => selectSpace(space)}>
                        {busy === space.ownerId ? <LoaderCircle className={styles.spin} size={15} /> : <ExternalLink size={15} />}
                        Abrir
                      </button>}
                </article>;
              })}
            </div>
          </section>

          {data.canManageTeam ? <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div><h2>Administradores</h2><p>{data.members.length} de {data.maxMembers} espacios ocupados.</p></div>
              <UserPlus size={21} />
            </div>
            <form className={styles.invite} onSubmit={invite}>
              <label>
                Correo de su cuenta de ChatGPT
                <span><Mail size={16} /><input required type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="persona@empresa.com" /></span>
              </label>
              <button className={styles.primary} disabled={Boolean(busy) || data.members.length >= data.maxMembers}>
                {busy === 'invite' ? <LoaderCircle className={styles.spin} size={16} /> : <UserPlus size={16} />}
                Invitar como administrador
              </button>
            </form>
            <p className={styles.help}>Nexo no envía un correo. Comparte el enlace del sitio con la persona; el acceso se activará cuando inicie sesión usando exactamente este correo.</p>

            <div className={styles.members}>
              {data.members.length === 0
                ? <div className={styles.empty}>Todavía no has invitado administradores.</div>
                : data.members.map(member => <div className={styles.member} key={member.id}>
                    <span className={styles.avatar}>{initials(member.member_email)}</span>
                    <div><strong>{member.member_email}</strong><small>{member.status === 'active' ? 'Acceso activo' : 'Invitación pendiente'}</small></div>
                    <span className={member.status === 'active' ? styles.activeBadge : styles.pendingBadge}>{member.status === 'active' ? 'Administrador' : 'Pendiente'}</span>
                    <button className={styles.remove} disabled={Boolean(busy)} onClick={() => remove(member)} aria-label={`Quitar a ${member.member_email}`}><Trash2 size={16} /></button>
                  </div>)}
            </div>
          </section> : <section className={styles.info}>
            <ShieldCheck size={22} />
            <div><strong>Eres administradora de este espacio</strong><p>Puedes gestionar las tiendas. Solo la propietaria puede invitar o retirar miembros.</p></div>
          </section>}

          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div><h2>Actividad reciente</h2><p>Últimos cambios hechos por el equipo en este espacio.</p></div>
              <History size={21} />
            </div>
            <div className={styles.activityList}>
              {data.activity.length === 0
                ? <div className={styles.empty}>Los próximos cambios del equipo aparecerán aquí.</div>
                : data.activity.map(item => <article className={styles.activity} key={item.id}>
                    <span className={styles.avatar}>{initials(item.actor_name || item.actor_email)}</span>
                    <div>
                      <strong>{item.summary}</strong>
                      <small>{item.actor_name || item.actor_email} · {item.actor_role === 'owner' ? 'Propietaria' : 'Administradora'}</small>
                    </div>
                    <time dateTime={item.created_at}>{activityDate(item.created_at)}</time>
                  </article>)}
            </div>
          </section>
        </>}
      </section>
    </main>
  );
}

function initials(value: string) {
  return value.trim().split(/[@\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function activityDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
