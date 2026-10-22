import { useCallback, useEffect, useState } from "react";
import { api, ApiError, Json, STATE_LABEL, SUPPORT_LABEL } from "./api";

type View = { name: "projects" } | { name: "settings" } | { name: "project"; id: string };

const Badge = ({ value, label }: { value: string; label?: string }) => (
  <span className={`badge ${value}`}>{label ?? STATE_LABEL[value] ?? value}</span>
);

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    }
  };
  return { error, run, setError };
}

export function App() {
  const [view, setView] = useState<View>({ name: "projects" });
  return (
    <>
      <header className="top">
        <h1 onClick={() => setView({ name: "projects" })}>🔥 Firestarter</h1>
        <nav>
          <button onClick={() => setView({ name: "projects" })}>Progetti</button>
          <button onClick={() => setView({ name: "settings" })}>Impostazioni</button>
        </nav>
      </header>
      <main>
        {view.name === "projects" && <Projects open={(id) => setView({ name: "project", id })} />}
        {view.name === "settings" && <Settings />}
        {view.name === "project" && <Project id={view.id} />}
      </main>
    </>
  );
}

function Projects({ open }: { open: (id: string) => void }) {
  const [items, setItems] = useState<Json[]>([]);
  const [workflows, setWorkflows] = useState<Json[]>([]);
  const [form, setForm] = useState({ name: "", goal: "", audience: "", constraints: "", wf: [] as string[], external: false });
  const { error, run } = useAction();

  const load = useCallback(() => {
    api.get("/api/projects").then(setItems).catch(() => {});
  }, []);
  useEffect(() => {
    load();
    api.get("/api/workflows").then(setWorkflows).catch(() => {});
  }, [load]);

  const create = () =>
    run(async () => {
      const p = await api.post("/api/projects", {
        name: form.name,
        goal: form.goal,
        workflows: form.wf,
        brief: { audience: form.audience, constraints: form.constraints },
        config: { allow_external_ai: form.external },
      });
      open(p.id);
    });

  return (
    <>
      <div className="card">
        <h2>Nuovo progetto</h2>
        {error && <div className="alert error">{error}</div>}
        <label>Nome</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Obiettivo</label>
        <textarea rows={3} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} />
        <div className="row">
          <div className="grow">
            <label>Destinatari</label>
            <input value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} />
          </div>
          <div className="grow">
            <label>Vincoli</label>
            <input value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} />
          </div>
        </div>
        <label>Workflow (lascia vuoto per un suggerimento automatico)</label>
        <div className="row">
          {workflows.map((w) => (
            <label key={w.id} style={{ margin: 0, color: "inherit" }}>
              <input
                type="checkbox"
                style={{ width: "auto", marginRight: 6 }}
                checked={form.wf.includes(w.id)}
                onChange={(e) =>
                  setForm({ ...form, wf: e.target.checked ? [...form.wf, w.id] : form.wf.filter((x) => x !== w.id) })
                }
              />
              {w.name}
            </label>
          ))}
        </div>
        <label style={{ color: "inherit" }}>
          <input
            type="checkbox"
            style={{ width: "auto", marginRight: 6 }}
            checked={form.external}
            onChange={(e) => setForm({ ...form, external: e.target.checked })}
          />
          Consenti provider AI esterni (di default tutto resta in locale)
        </label>
        <p>
          <button className="primary" disabled={!form.name || !form.goal} onClick={create}>
            Crea progetto
          </button>
        </p>
      </div>
      <h2>Progetti</h2>
      {items.length === 0 && <p className="muted">Nessun progetto ancora.</p>}
      {items.map((p) => (
        <div key={p.id} className="card project-link" onClick={() => open(p.id)}>
          <div className="row">
            <strong className="grow">{p.name}</strong>
            <Badge value={p.status.state} />
          </div>
          <div className="muted">{p.goal}</div>
          <div className="bar" style={{ marginTop: 8 }}>
            <div style={{ width: `${p.status.progress.total ? (100 * p.status.progress.done) / p.status.progress.total : 0}%` }} />
          </div>
          {p.status.attention.length > 0 && <div className="muted">⚠ {p.status.attention.length} attività richiedono attenzione</div>}
        </div>
      ))}
    </>
  );
}

type Tab = "plan" | "artifacts" | "validations" | "log";

function Project({ id }: { id: string }) {
  const [project, setProject] = useState<Json | null>(null);
  const [status, setStatus] = useState<Json | null>(null);
  const [plan, setPlan] = useState<Json | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [importPath, setImportPath] = useState("");
  const [changed, setChanged] = useState<string[]>([]);
  const { error, run } = useAction();

  const refresh = useCallback(async () => {
    const [p, s, pl] = await Promise.all([
      api.get(`/api/projects/${id}`),
      api.get(`/api/projects/${id}/status`),
      api.get(`/api/projects/${id}/plan`),
    ]);
    setProject(p);
    setStatus(s);
    setPlan(pl);
  }, [id]);

  useEffect(() => {
    refresh().catch(() => {});
    const t = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!project || !status) return <p className="muted">Caricamento…</p>;
  const approved = plan?.plan.status === "approved";
  const tasks: Json[] = plan?.tasks ?? [];
  const act = (fn: () => Promise<any>) => run(async () => { await fn(); await refresh(); });
  const regenerate = (key: string) =>
    act(async () => {
      try {
        await api.post(`/api/projects/${id}/tasks/${key}/regenerate`, { confirm: false });
      } catch (e) {
        if (e instanceof ApiError && e.body.protected) {
          if (!confirm(`Verranno sovrascritti artefatti già approvati:\n${e.body.protected.join("\n")}\n\nProcedere?`)) return;
          await api.post(`/api/projects/${id}/tasks/${key}/regenerate`, { confirm: true });
        } else throw e;
      }
    });

  return (
    <>
      <div className="card">
        <div className="row">
          <h2 className="grow" style={{ margin: 0 }}>{project.name}</h2>
          <Badge value={status.state} />
          {status.running && <Badge value="running" />}
        </div>
        <p>{project.goal}</p>
        <div className="muted">{project.path}</div>
        <div className="bar" style={{ margin: "10px 0" }}>
          <div style={{ width: `${status.progress.total ? (100 * status.progress.done) / status.progress.total : 0}%` }} />
        </div>
        <div className="muted">
          {status.progress.done}/{status.progress.total} attività obbligatorie completate
        </div>
        {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <input style={{ maxWidth: 360 }} placeholder="Cartella di materiali da importare (copia protetta)" value={importPath} onChange={(e) => setImportPath(e.target.value)} />
          <button disabled={!importPath} onClick={() => act(async () => { await api.post(`/api/projects/${id}/sources`, { path: importPath }); setImportPath(""); })}>Importa</button>
          <button onClick={() => act(async () => { const r = await api.post(`/api/projects/${id}/plan`); setChanged(r.changed ?? []); })}>
            {plan ? "Ricalcola piano" : "Genera piano"}
          </button>
          {plan && !approved && <button className="primary" onClick={() => act(() => api.post(`/api/projects/${id}/plan/approve`))}>Approva piano</button>}
          {approved && !status.running && <button className="primary" onClick={() => act(() => api.post(`/api/projects/${id}/run`))}>Esegui</button>}
          {status.running && <button onClick={() => act(() => api.post(`/api/projects/${id}/stop`))}>Ferma dopo l'attività corrente</button>}
        </div>
      </div>

      {changed.length > 0 && !approved && (
        <div className="alert">Attività da rifare dopo la modifica: {changed.join(", ")}</div>
      )}
      {status.attention.map((a: Json) => (
        <div key={a.key} className="alert">
          <strong>{a.title}</strong> — <Badge value={a.state} />
          <div>{a.message}</div>
          <div className="row" style={{ marginTop: 6 }}>
            {a.state === "waiting_user" && a.message.includes("conferma") && (
              <button onClick={() => act(() => api.post(`/api/projects/${id}/tasks/${a.key}/confirm`))}>Conferma</button>
            )}
            {a.state === "waiting_user" && !a.message.includes("conferma") && (
              <button onClick={() => act(() => api.post(`/api/projects/${id}/tasks/${a.key}/complete-manual`))}>Fatto: segna come completata</button>
            )}
            {(a.state === "failed" || a.state === "blocked") && (
              <button onClick={() => act(() => api.post(`/api/projects/${id}/tasks/${a.key}/retry`))}>Riprova</button>
            )}
          </div>
        </div>
      ))}

      <div className="row" style={{ marginBottom: 12 }}>
        {(["plan", "artifacts", "validations", "log"] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {{ plan: "Piano", artifacts: "Artefatti", validations: "Validazioni", log: "Registro" }[t]}
          </button>
        ))}
      </div>

      {tab === "plan" && (
        <div className="card">
          {!plan && <p className="muted">Nessun piano: genera il piano per iniziare.</p>}
          {plan && (
            <table>
              <thead><tr><th>Attività</th><th>Strumento</th><th>Dipende da</th><th>Output</th><th>Stato</th><th /></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.key}>
                    <td><strong>{t.title}</strong><div className="muted">{t.key}</div></td>
                    <td>{t.connector}.{t.operation}</td>
                    <td className="muted">{t.depends_on.join(", ") || "—"}</td>
                    <td className="muted">{t.outputs.join(", ") || "—"}</td>
                    <td><Badge value={t.state} /></td>
                    <td>
                      {!approved && (
                        <button onClick={() => act(() => api.put(`/api/projects/${id}/plan/tasks/${t.key}/excluded`, { excluded: t.state !== "skipped" }))}>
                          {t.state === "skipped" ? "Includi" : "Escludi"}
                        </button>
                      )}
                      {approved && t.state === "completed" && <button onClick={() => regenerate(t.key)}>Rigenera</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {plan && <p className="muted">Gruppi indipendenti: {plan.levels.map((l: string[]) => `[${l.length}]`).join(" → ")} (l'esecuzione resta seriale)</p>}
        </div>
      )}
      {tab === "artifacts" && <Artifacts id={id} />}
      {tab === "validations" && <Validations id={id} />}
      {tab === "log" && <Log id={id} />}
    </>
  );
}

function usePolled<T>(url: string, fallback: T): T {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => {
    const load = () => api.get<T>(url).then(setData).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [url]);
  return data;
}

function Artifacts({ id }: { id: string }) {
  const items = usePolled<Json[]>(`/api/projects/${id}/artifacts`, []);
  const { error, run } = useAction();
  const review = (path: string, decision: string) =>
    run(() => api.post(`/api/projects/${id}/artifacts/review`, { path, decision }));
  return (
    <div className="card">
      {error && <div className="alert error">{error}</div>}
      {items.length === 0 && <p className="muted">Nessun artefatto ancora.</p>}
      <table>
        <thead><tr><th>File</th><th>Ruolo</th><th>Versione</th><th>Origine</th><th>Revisione</th><th /></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td><a href={`/api/projects/${id}/files?path=${encodeURIComponent(a.rel_path)}`}>{a.rel_path}</a></td>
              <td>{a.role}</td>
              <td>v{a.version}</td>
              <td className="muted">{a.task_key}{a.depends_on.length ? ` ← ${a.depends_on.join(", ")}` : ""}</td>
              <td>{a.review_state}</td>
              <td>
                <button onClick={() => review(a.rel_path, "approved")}>Approva</button>{" "}
                <button onClick={() => review(a.rel_path, "changes_requested")}>Richiedi modifiche</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Validations({ id }: { id: string }) {
  const items = usePolled<Json[]>(`/api/projects/${id}/validations`, []);
  return (
    <div className="card">
      {items.length === 0 && <p className="muted">Nessuna validazione eseguita.</p>}
      <table>
        <thead><tr><th>Esito</th><th>Criterio</th><th>File (versione)</th><th>Problemi</th></tr></thead>
        <tbody>
          {items.map((v) => (
            <tr key={v.id}>
              <td><Badge value={v.passed ? "completed" : "failed"} label={v.passed ? "OK" : v.severity === "error" ? "Errore" : "Avviso"} /></td>
              <td>{v.criterion}</td>
              <td className="muted">{v.artifact_path} (v{v.artifact_version})</td>
              <td>{v.issues.join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Log({ id }: { id: string }) {
  const items = usePolled<Json[]>(`/api/projects/${id}/events`, []);
  return (
    <div className="card">
      <table>
        <tbody>
          {[...items].reverse().map((e) => (
            <tr key={e.id}>
              <td className="muted">{e.ts.replace("T", " ").slice(0, 19)}</td>
              <td><Badge value={e.level === "error" ? "failed" : e.level === "warning" ? "waiting_user" : "completed"} label={e.level} /></td>
              <td>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Settings() {
  const connectors = usePolled<Json[]>("/api/connectors", []);
  const ai = usePolled<Json>("/api/ai", { providers: [] });
  return (
    <>
      <div className="card">
        <h2>Provider AI</h2>
        {ai.providers.map((p: Json) => (
          <div key={p.id} style={{ marginBottom: 8 }}>
            <strong>{p.id}</strong> <Badge value={p.available ? "completed" : "failed"} label={p.available ? "Raggiungibile" : "Non raggiungibile"} />{" "}
            <span className="badge">{p.local ? "locale" : "esterno"}</span>
            <div className="muted">{p.detail}</div>
            {p.models.length > 0 && <div className="muted">Modelli: {p.models.join(", ")}</div>}
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Connettori</h2>
        <p className="muted">Le capacità non verificate sono segnalate come tali: nessuna integrazione viene presentata come funzionante senza test.</p>
        {connectors.map((c) => (
          <div key={c.id} style={{ marginBottom: 14 }}>
            <div className="row">
              <strong>{c.name}</strong>
              <Badge value={c.status.available ? "completed" : "failed"} label={c.status.available ? "Disponibile" : "Non disponibile"} />
            </div>
            <div className="muted">{c.status.detail} {c.status.version}</div>
            {c.capabilities.map((cap: Json) => (
              <div key={cap.operation} style={{ marginLeft: 12 }}>
                <code>{cap.operation}</code> <Badge value={cap.support} label={SUPPORT_LABEL[cap.support]} />
                {cap.limitations.length > 0 && <div className="muted">Limiti: {cap.limitations.join(" · ")}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
