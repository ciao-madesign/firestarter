# Installazione sul Wyse 5070 (accesso da qualsiasi dispositivo)

Obiettivo: il lab gira sul Wyse di casa e lo raggiungi da telefono, tablet e PC (anche quello di lavoro) con un normale browser, senza installare nulla sui dispositivi. I progressi restano sul Wyse, quindi sono identici ovunque.

## Prerequisiti

- **Sistema operativo Linux sul Wyse** (Debian o Ubuntu Server a 64 bit). I Wyse 5070 escono con ThinOS o Windows 10 IoT: va installato Linux (da chiavetta USB).
- Il disco interno (eMMC da 16 GB) basta per sistema e applicazione; i dati del lab vanno sull'**SSD esterno** (variabile `LAB_DATA`).
- Account gratuito Tailscale (tailscale.com).

## Passi

1. **Copia il progetto sul Wyse** (`git clone` del repository) e posizionati nella cartella.
2. **Installa e avvia il lab** (Node 22 è già presente in `/opt/node22/bin/node`: non serve Docker):
   ```bash
   LAB_DATA=/mnt/ssd/lab ./deploy/install-wyse.sh
   ```
   Lo script installa le dipendenze, costruisce l'app, ti chiede la password e crea il servizio `lab` (si avvia da solo all'accensione). Il lab ascolta solo su `127.0.0.1:3000`, quindi non è esposto in rete finché non lo pubblichi tu. Gestione: `sudo systemctl status lab`, `journalctl -u lab -f`.
   *Alternativa con Docker*: `LAB_PASSWORD=... docker compose up -d --build` (file `docker-compose.yml`).
3. **Installa Tailscale sul Wyse** (`curl -fsSL https://tailscale.com/install.sh | sh`, poi `sudo tailscale up`). Sul sito Tailscale abilita HTTPS e Funnel per la tua rete.
4. **Pubblica il lab**:
   - *Solo i tuoi dispositivi con Tailscale* (telefono, tablet): `sudo tailscale serve --bg 3000` → indirizzo `https://NOME.tailNNNN.ts.net`, raggiungibile solo dalla tua rete privata.
   - *Anche da dispositivi senza Tailscale* (PC di lavoro): `sudo tailscale funnel --bg 3000` → lo stesso indirizzo diventa pubblico. **La password è l'unica protezione**: scegline una lunga (consigliate 16 o più caratteri).
5. Apri l'indirizzo nel browser, inserisci la password. Per averlo come app: "Aggiungi a schermata Home" (è una PWA).

## Note e limiti

- Il PC di lavoro può bloccare i domini `*.ts.net`. Alternativa senza Tailscale: Cloudflare Tunnel (serve un dominio) — da valutare solo se serve.
- Se il Wyse è spento o senza internet, il lab non è raggiungibile.
- Il cookie di accesso dura 30 giorni; dopo 5 password errate in un minuto il login si blocca temporaneamente.
- Il lab è un ambiente **simulato**: anche se qualcuno entrasse, non può eseguire comandi sul Wyse. Contiene però i tuoi progressi e documenti.
- Aggiornamenti: `git pull && npm ci && npm run build:web && sudo systemctl restart lab`.
- Backup: copia la cartella `LAB_DATA` (contiene workspace e `course/progress.json`).
- Tutor AI con la chiave Anthropic: non ancora implementato; quando lo sarà, la chiave si metterà come variabile d'ambiente del servizio sul Wyse (mai nel browser).
