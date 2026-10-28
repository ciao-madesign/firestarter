# Installazione sul Wyse 5070 (Ubuntu), accanto ad altri progetti

> **Stato reale (2026-10-26):** installato su `homehub` (Ubuntu 24.04, Node 22 di sistema). Solo rete di casa, senza Tailscale: `http://192.168.1.8:3100`. Codice in `/opt/learning-lab`, dati in `/mnt/data/learning-lab`, servizio `learning-lab`. Verificato dal telefono. Le altre sezioni descrivono la procedura generale e l'evoluzione con Tailscale.

## Come è stato installato (comandi usati)

```bash
sudo mkdir /opt/learning-lab && sudo chown michele:michele /opt/learning-lab
git clone --branch claude/wonderful-mayer-1nhrp7 https://github.com/ciao-madesign/firestarter /opt/learning-lab
cd /opt/learning-lab
NODE=/usr/bin/node LAB_HOST=192.168.1.8 LAB_TRUST_PROXY=0 LAB_DATA=/mnt/data/learning-lab ./deploy/install-wyse.sh
```

Porte già occupate sul Wyse dagli altri progetti (non toccarle): 22, 80, 139, 445, 631, 2283, 4000, 8096. Il lab usa solo la 3100.

## Gestione ordinaria

| Cosa | Comando |
|---|---|
| Stato | `systemctl status learning-lab --no-pager` |
| Log | `journalctl -u learning-lab -f` |
| Riavvio | `sudo systemctl restart learning-lab` |
| Aggiornamento | `cd /opt/learning-lab && git pull && npm ci && npm run build:web && sudo systemctl restart learning-lab` |
| Backup | copia di `/mnt/data/learning-lab` (contiene `course/progress.json` e i workspace) |
| Password | `sudo nano /etc/learning-lab.env` (riga `LAB_PASSWORD`), poi riavvio |
| Aiuto con AI (facoltativo) | `sudo nano /etc/learning-lab.env`, riga `LAB_GEMINI_KEY=<chiave>`, poi riavvio; dettagli in `docs/AI-GEMINI.md` |

## Backup

Un timer systemd dedicato (`learning-lab-backup.timer`) salva ogni **domenica alle 03:30** (recupera all'accensione se il Wyse era spento) un archivio `learning-lab-AAAAMMGG-HHMMSS.tar.gz` di `/mnt/data/learning-lab` in `/mnt/data/backup-learning-lab`, tenendo le **ultime 8 copie**. Gira come utente `learninglab` con sandbox (legge i dati, scrive solo nella cartella dei backup) e verifica che l'archivio sia leggibile. Installazione (una volta): `cd /opt/learning-lab && ./deploy/install-backup-wyse.sh`.

Limite: i backup stanno sullo **stesso disco** dei dati (`/mnt/data`): proteggono da errori e cancellazioni, non da un guasto del disco. Per questo, ogni tanto copia un archivio anche su un altro supporto (per esempio `scp` verso un altro computer).

| Cosa | Comando |
|---|---|
| Backup subito | `sudo systemctl start learning-lab-backup.service` |
| Elenco copie | `sudo ls -lh /mnt/data/backup-learning-lab` |
| Contenuto di una copia | `sudo sh -c 'tar -tzf /mnt/data/backup-learning-lab/learning-lab-*.tar.gz'` (la cartella è 700 di `learninglab`: l'asterisco deve espanderlo `sudo`, non la tua shell) |
| Prossima esecuzione | `systemctl list-timers learning-lab-backup.timer --no-pager` |
| Esito dell'ultima | `journalctl -u learning-lab-backup.service -n 20 --no-pager` |
| Ripristino | `sudo systemctl stop learning-lab && sudo tar -xzf /mnt/data/backup-learning-lab/<archivio> -C /mnt/data/learning-lab && sudo chown -R learninglab:learninglab /mnt/data/learning-lab && sudo systemctl start learning-lab` |
| Rimozione | `sudo systemctl disable --now learning-lab-backup.timer && sudo rm /etc/systemd/system/learning-lab-backup.*` |

Da fare: ~~riservare `192.168.1.8`~~ (fatto) al Wyse nel router (se l'IP cambia il servizio non si avvia perché ascolta solo su quell'indirizzo) e non aprire mai la porta 3100 verso Internet (http, password in chiaro). I dati stanno sullo stesso disco dell'hub (`/mnt/data`, circa 80% pieno): il lab usa pochi MB.

Il lab gira sul Wyse e lo raggiungi da telefono, tablet e PC con un normale browser. I progressi restano sul Wyse, uguali su ogni dispositivo.

## Isolamento da PersonalHub (e da ogni altro progetto)

Il lab non condivide nulla con gli altri progetti del Wyse:

| Risorsa | Learning Lab | Nota |
|---|---|---|
| Cartella del codice | una copia propria (es. `~/learning-lab`) | mai dentro PersonalHub; lo script lo rifiuta |
| Dati | cartella dedicata sull'SSD (es. `/mnt/ssd/learning-lab`), permessi `700`, proprietario `learninglab` | lo script si ferma se la cartella contiene altro |
| Utente di sistema | `learninglab`, senza shell né home | non può leggere gli altri progetti (`ProtectHome`, `ProtectSystem=strict`) |
| Servizio | `learning-lab.service`, memoria limitata a 512 MB | nome diverso da qualsiasi altro servizio |
| Porta | `127.0.0.1:3100` (solo locale) | se è occupata lo script si ferma; cambiala con `LAB_PORT` |
| Configurazione | `/etc/learning-lab.env` (leggibile solo da root) | contiene la password |
| Installazioni globali | nessuna: non usa `apt`, Docker, nginx; `npm ci` solo nella cartella del lab | |
| Tailscale | una regola dedicata sulla porta HTTPS **8443** | vedi sotto: non sostituire quella esistente |

Lo script fa **prima i controlli e chiede conferma**; se qualcosa è già occupato si ferma senza modificare nulla.

## Prerequisiti

- Ubuntu a 64 bit sul Wyse e Node 22 o successivo: lo script usa `$NODE`, poi `/opt/node22/bin/node`, poi il `node` di sistema. Se manca, vedi «Node 22 senza installazioni globali» sotto.
- Il progetto va copiato **fuori da `/home`** (per esempio `/opt/learning-lab`): il servizio ha `ProtectHome=true` e non vedrebbe una cartella in `/home` (lo script lo rifiuta).
- Un SSD esterno montato (cartella dati dedicata); l'eMMC da 16 GB basta per sistema e applicazione.
- Account Tailscale (già installato sul Wyse se lo usi per altro).

## Node 22 senza installazioni globali

Se sul Wyse non c'è Node 22: scarica il pacchetto ufficiale `node-v22.*-linux-x64.tar.xz` da nodejs.org e scompattalo in una cartella nuova (per esempio `/opt/node22`, in modo che esista `/opt/node22/bin/node`). Non usa `apt` né modifica Node o npm eventualmente già presenti per altri progetti.

## Passi

1. **Copia il progetto** in una cartella nuova (`git clone` di questo repository) ed entra nella cartella.
2. **Installa**: `LAB_DATA=/mnt/ssd/learning-lab ./deploy/install-wyse.sh`. Leggi i controlli, conferma, scegli la password. Gestione: `sudo systemctl status learning-lab`, `journalctl -u learning-lab -f`.
3. **Verifica prima di pubblicare** quello che Tailscale ha già in uso: `tailscale serve status` (e `tailscale funnel status`). **Non lanciare** `tailscale serve --bg 3000` senza opzioni: potrebbe sostituire la configurazione esistente.
4. **Pubblica il lab su una porta HTTPS diversa da quella già usata** (Funnel ammette 443, 8443 e 10000; se PersonalHub usa 443, il lab usa 8443):
   - Solo dispositivi con Tailscale: `sudo tailscale serve --bg --https=8443 http://127.0.0.1:3100`
   - Anche dal PC di lavoro (senza Tailscale): `sudo tailscale funnel --bg --https=8443 http://127.0.0.1:3100`
   Indirizzo: `https://NOME-DEL-WYSE.tailNNNN.ts.net:8443`. Con Funnel è pubblico: **la password è l'unica protezione**, scegline una lunga (16 o più caratteri).
5. Apri l'indirizzo, inserisci la password; "Aggiungi a schermata Home" lo trasforma in app.

## Solo rete di casa (senza Tailscale)

`LAB_HOST=<IP del Wyse> LAB_TRUST_PROXY=0 LAB_DATA=/mnt/data/learning-lab ./deploy/install-wyse.sh`, poi `http://<IP del Wyse>:3100`. Il traffico non è cifrato (http): la password viaggia in chiaro sulla LAN, quindi usa una password che non riusi altrove. Non esporre la porta 3100 su Internet. Più avanti si può passare a Tailscale cambiando `LAB_HOST=127.0.0.1` e `LAB_TRUST_PROXY=1` in `/etc/learning-lab.env`.

## Note

- Il PC di lavoro può bloccare `*.ts.net` o porte non standard: in quel caso serve un'altra via (es. Cloudflare Tunnel), da valutare dopo.
- Se il Wyse è spento o offline, il lab non è raggiungibile.
- Il lab è **simulato**: non può eseguire comandi sul Wyse. Contiene però i tuoi progressi e documenti: fai backup copiando la cartella dati.
- Aggiornamento: `git pull && npm ci && npm run build:web && sudo systemctl restart learning-lab` (dalla cartella del lab).
- Rimozione completa: `./deploy/uninstall-wyse.sh` (rimuove solo servizio, configurazione e utente del lab; i dati restano finché non li cancelli) e, per Tailscale, `sudo tailscale serve --https=8443 off` (o `funnel`), che toglie solo la regola della porta 8443.
- Tutor AI con la chiave Anthropic: non ancora implementato; la chiave andrà in `/etc/learning-lab.env`, mai nel browser.
