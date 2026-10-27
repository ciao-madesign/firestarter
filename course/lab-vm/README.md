# Laboratorio reale con due macchine virtuali (facoltativo)

Versione "vera" del modulo M11 del laboratorio web: due macchine virtuali Linux sul tuo PC di casa, un SERVER che ospita il servizio e un CLIENT che lo usa. Serve a verificare che ciò che hai imparato nel simulatore funzioni anche fuori. Non è un requisito del corso.

**Stato della verifica**: il servizio (`provision/server/taskflow.py`, `taskflow-db.py`) è stato provato in locale e risponde come descritto sotto. Il `Vagrantfile`, le unità systemd e gli script di provisioning NON sono stati provati su VirtualBox: al primo avvio possono servire piccoli aggiustamenti. Se qualcosa non va, annotalo: è materiale per il bug report.

| Nodo | Indirizzo | Ruolo |
|---|---|---|
| server | 192.168.50.10 (`server.lab`) | esegue TaskFlow (porta 8080) e il suo database |
| client | 192.168.50.20 | invia le richieste |

## Requisiti

- PC di casa (Windows o macOS) con circa 2 GB di RAM liberi e virtualizzazione attiva.
- [VirtualBox](https://www.virtualbox.org/) e [Vagrant](https://www.vagrantup.com/) installati.
- Questa cartella (`course/lab-vm/`).

## Avvio

```bash
cd course/lab-vm
vagrant up                 # crea e prepara le due macchine (la prima volta scarica Ubuntu)
vagrant ssh client         # terminale del CLIENT
vagrant ssh server         # terminale del SERVER (in un'altra finestra)
```

Dal client le variabili `TASKFLOW_URL` (http://server.lab:8080) e `TASKFLOW_TOKEN` sono già impostate.

```bash
# sul client
curl -s $TASKFLOW_URL/v1/health
curl -s -H "Authorization: Bearer $TASKFLOW_TOKEN" $TASKFLOW_URL/v1/tasks
# sul server
systemctl status taskflow
sudo journalctl -u taskflow -n 20
ss -tlnp
```

Differenza dal simulatore: qui entri sul server con `vagrant ssh server` (sessione vera) invece di `ssh` a comando singolo. I comandi sono gli stessi.

## Scenari e ripristino

Ogni esercizio parte da uno stato noto. Sul server:

```bash
sudo /opt/lab/scenario.sh ok          # sistema funzionante (ripristino completo)
sudo /opt/lab/scenario.sh stopped     # servizio fermo (M11.L4)
sudo /opt/lab/scenario.sh wrong_port  # servizio sulla 9090 (M11.L5)
sudo /opt/lab/scenario.sh db_down     # errore 500 per database fermo (M11.L6)
sudo /opt/lab/scenario.sh multi       # tutti i guasti insieme (M11.L10)
sudo /opt/lab/scenario.sh firewall    # porta filtrata dal firewall (M11.L8)
sudo /opt/lab/scenario.sh multi2      # nome + firewall + database (M11.L11, serve anche il comando sul client)
```

Sul client, per il guasto del nome (M11.L9 e M11.L11):

```bash
sudo /opt/lab/client-scenario.sh dns_wrong   # /etc/hosts manda server.lab a un indirizzo sbagliato
sudo /opt/lab/client-scenario.sh ok          # ripristino
```

Per tornare allo stato iniziale delle macchine: `vagrant snapshot save base` dopo il primo `vagrant up`, poi `vagrant snapshot restore base`. Per ricominciare da zero: `vagrant destroy -f && vagrant up`. Per spegnere: `vagrant halt`.

## Cosa consegnare

Ogni esercizio deve lasciare una traccia verificabile, come nel simulatore: i comandi usati, l'output dei test, la diagnosi dell'errore e una breve specifica della chiamata (richiesta, header, risposta, errori). Il tutor CLI può rivederla; non esegue Vagrant né VirtualBox al posto tuo.

## Sicurezza

- Le macchine usano una rete privata dell'host: non sono raggiungibili da Internet né da altri dispositivi di casa.
- Il token `tf_lab_bob` è di prova. Non usare password o chiavi reali nel laboratorio.
- Adapta e WizTrail (prodotti reali) non vanno mai portati in queste macchine.
