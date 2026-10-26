import { FsError, fsErrorMessage } from '../vfs.ts';
import { base64, lowerHeaders, performHttp } from '../http.ts';
import { parseUrl, statusText, type HttpRequest } from '../api/server.ts';
import type { BashRuntime, Io } from './interp.ts';
import type { ShellId } from '../types.ts';

const SHORT_WITH_ARG = new Set(['X', 'H', 'd', 'u', 'A', 'o', 'w', 'm', 'e', 'b', 'F', 'T', 'K']);

export function curl(args: string[], io: Io, rt: BashRuntime, shell: ShellId = 'bash', name = 'curl'): number {
  let method: string | null = null;
  const headers: [string, string][] = [];
  const data: string[] = [];
  let url: string | null = null;
  let silent = false;
  let showErr = false;
  let include = false;
  let head = false;
  let verbose = false;
  let fail = false;
  let follow = false;
  let insecure = false;
  let outFile: string | null = null;
  let writeOut: string | null = null;
  let maxTime: number | null = null;
  let user: string | null = null;
  let agent = 'curl/8.4.0';
  let json = false;

  const optErr = (msg: string): number => {
    io.err(`${name}: ${msg}\n${name}: try '${name} --help' or '${name} --manual' for more information\n`);
    return 2;
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const need = (opt: string): string | null => {
      const v = args[++i];
      if (v === undefined) {
        optErr(`option ${opt}: requires parameter`);
        return null;
      }
      return v;
    };
    if (a.startsWith('--')) {
      const [flag, inline] = a.split(/=(.*)/s);
      const val = (): string | null => inline ?? need(flag);
      let v: string | null;
      switch (flag) {
        case '--request': if ((v = val()) === null) return 2; method = v; break;
        case '--header': if ((v = val()) === null) return 2; headers.push(splitHeader(v)); break;
        case '--data': case '--data-raw': case '--data-binary': case '--data-ascii':
          if ((v = val()) === null) return 2;
          data.push(flag === '--data-raw' ? v : readData(v, rt, io, name) ?? '');
          break;
        case '--json':
          if ((v = val()) === null) return 2;
          json = true;
          data.push(readData(v, rt, io, name) ?? '');
          break;
        case '--user': if ((v = val()) === null) return 2; user = v; break;
        case '--user-agent': if ((v = val()) === null) return 2; agent = v; break;
        case '--output': if ((v = val()) === null) return 2; outFile = v; break;
        case '--write-out': if ((v = val()) === null) return 2; writeOut = v; break;
        case '--max-time': if ((v = val()) === null) return 2; maxTime = parseFloat(v); break;
        case '--connect-timeout': if ((v = val()) === null) return 2; break;
        case '--silent': silent = true; break;
        case '--show-error': showErr = true; break;
        case '--include': include = true; break;
        case '--head': head = true; break;
        case '--verbose': verbose = true; break;
        case '--fail': fail = true; break;
        case '--location': follow = true; break;
        case '--insecure': insecure = true; break;
        case '--url': if ((v = val()) === null) return 2; url = v; break;
        case '--help':
          io.out(`Usage: curl [options...] <url>\n -X, --request <method>   metodo HTTP\n -H, --header <header>    aggiunge un header\n -d, --data <dati>        body della richiesta (implica POST)\n -i, --include            mostra gli header di risposta\n -I, --head               solo header (HEAD)\n -s, --silent             modalità silenziosa\n -v, --verbose            dettagli della richiesta\n -o, --output <file>      scrive il body su file\n -w, --write-out <fmt>    stampa informazioni (es. %{http_code})\n -f, --fail               esce con errore sugli status >= 400\n -L, --location           segue i redirect\n -u, --user <u:p>         autenticazione Basic\n -m, --max-time <s>       timeout totale\n Per la guida completa: man curl\n`);
          return 0;
        default:
          return optErr(`option ${a}: is unknown`);
      }
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const c = a[j];
        if (SHORT_WITH_ARG.has(c)) {
          const v = j + 1 < a.length ? a.slice(j + 1) : need('-' + c);
          if (v === null) return 2;
          switch (c) {
            case 'X': method = v; break;
            case 'H': headers.push(splitHeader(v)); break;
            case 'd': data.push(readData(v, rt, io, name) ?? ''); break;
            case 'u': user = v; break;
            case 'A': agent = v; break;
            case 'o': outFile = v; break;
            case 'w': writeOut = v; break;
            case 'm': maxTime = parseFloat(v); break;
            case 'F': case 'T': case 'K': case 'e': case 'b':
              io.err(`${name}: l'opzione -${c} non è supportata nel laboratorio\n`);
              return 2;
          }
          break;
        }
        switch (c) {
          case 's': silent = true; break;
          case 'S': showErr = true; break;
          case 'i': include = true; break;
          case 'I': head = true; break;
          case 'v': verbose = true; break;
          case 'f': fail = true; break;
          case 'L': follow = true; break;
          case 'k': insecure = true; break;
          case 'g': case '#': break;
          default:
            return optErr(`option -${c}: is unknown`);
        }
      }
      continue;
    }
    url = a;
  }

  if (!url) {
    io.err(`${name}: no URL specified\n${name}: try '${name} --help' or '${name} --manual' for more information\n`);
    return 2;
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'http://' + url;
  if (!parseUrl(url)) {
    io.err(`${name}: (3) URL rejected: Bad hostname\n`);
    return 3;
  }

  const hdr: Record<string, string> = { 'user-agent': agent, accept: '*/*' };
  for (const [k, v] of headers) {
    if (v === '') delete hdr[k.toLowerCase()];
    else hdr[k.toLowerCase()] = v;
  }
  if (user) hdr['authorization'] = 'Basic ' + base64(user);
  let body: string | null = data.length ? data.join('&') : null;
  if (body !== null) {
    if (json) {
      hdr['content-type'] ??= 'application/json';
      hdr['accept'] = headers.some(([k]) => k.toLowerCase() === 'accept') ? hdr['accept'] : 'application/json';
    } else hdr['content-type'] ??= 'application/x-www-form-urlencoded';
  }
  const m = head ? 'HEAD' : (method ?? (body !== null ? 'POST' : 'GET')).toUpperCase();
  if (head) body = null;
  const req: HttpRequest = {
    method: m,
    url,
    headers: lowerHeaders(hdr),
    body,
    client: 'curl',
    shell,
    timeoutMs: maxTime !== null ? Math.round(maxTime * 1000) : undefined,
    ...(insecure ? { insecure: true } : {}),
  };
  const u = parseUrl(url)!;
  const outcome = performHttp(rt.state, req, { follow });
  const r = outcome.result;
  const hostHdr = u.host + (([80, 443].includes(u.port) && (u.scheme === 'http' ? u.port === 80 : u.port === 443)) ? '' : ':' + u.port);

  if (verbose) {
    io.err(`* Host ${hostHdr} was resolved.\n* Trying ${u.host === 'localhost' ? '127.0.0.1' : '203.0.113.10'}:${u.port}...\n`);
    for (const s of outcome.sent) {
      const su = parseUrl(s.url)!;
      io.err(`> ${s.method} ${su.path}${su.rawQuery ? '?' + su.rawQuery : ''} HTTP/1.1\n> Host: ${su.host}${[80, 443].includes(su.port) ? '' : ':' + su.port}\n`);
      for (const [k, v] of Object.entries(s.headers)) io.err(`> ${titleCase(k)}: ${v}\n`);
      if (s.body !== null) io.err(`> Content-Length: ${s.body.length}\n`);
      io.err('>\n');
      if (s.body !== null) io.err(`} [${s.body.length} bytes data]\n`);
    }
  }

  if (!r.ok) {
    const msg = netError(r, name);
    if (!silent || showErr) io.err(msg.text);
    if (writeOut) io.out(formatWriteOut(writeOut, { code: 0, url: outcome.finalUrl, size: 0, ms: r.ms, ct: '', redirects: outcome.redirects }));
    return msg.code;
  }
  const res = r.res;
  if (verbose) {
    io.err(`< ${res.httpVersion} ${res.status} ${res.statusText}\n`);
    for (const [k, v] of Object.entries(res.headers)) io.err(`< ${k}: ${v}\n`);
    io.err('<\n');
  }
  if (fail && res.status >= 400) {
    if (!silent || showErr) io.err(`${name}: (22) The requested URL returned error: ${res.status}\n`);
    if (writeOut) io.out(formatWriteOut(writeOut, { code: res.status, url: outcome.finalUrl, size: 0, ms: res.ms, ct: res.headers['Content-Type'] ?? '', redirects: outcome.redirects }));
    return 22;
  }
  let text = '';
  if (include || head) {
    text += `${res.httpVersion} ${res.status} ${res.statusText}\r\n`;
    for (const [k, v] of Object.entries(res.headers)) text += `${k}: ${v}\r\n`;
    text += '\r\n';
  }
  if (outFile === '/dev/null') {
    if (include || head) io.out(text);
  } else if (outFile) {
    const abs = rt.resolve(outFile);
    try {
      rt.vfs.writeFile(abs, res.body);
    } catch (e) {
      io.err(`${name}: (23) Failure writing output to destination: ${e instanceof FsError ? fsErrorMessage(e, outFile) : String(e)}\n`);
      return 23;
    }
    if (include || head) io.out(text);
  } else {
    io.out(text + res.body);
  }
  if (writeOut) {
    io.out(formatWriteOut(writeOut, { code: res.status, url: outcome.finalUrl, size: res.body.length, ms: res.ms, ct: res.headers['Content-Type'] ?? '', redirects: outcome.redirects }));
  }
  return 0;
}

function splitHeader(h: string): [string, string] {
  const i = h.indexOf(':');
  if (i < 0) {
    const sc = h.indexOf(';');
    return sc >= 0 ? [h.slice(0, sc).trim(), ''] : [h.trim(), ''];
  }
  return [h.slice(0, i).trim(), h.slice(i + 1).trim()];
}

function titleCase(h: string): string {
  return h.replace(/(^|-)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

function readData(v: string, rt: BashRuntime, io: Io, name: string): string | null {
  if (v.startsWith('@')) {
    const f = v.slice(1);
    try {
      return rt.vfs.readFile(rt.resolve(f));
    } catch {
      io.err(`Warning: Couldn't read data from file "${f}", this makes an empty POST.\n`);
      return '';
    }
  }
  void name;
  return v;
}

export function netError(r: { kind: string; host: string; port: number; ms: number }, name = 'curl'): { text: string; code: number } {
  switch (r.kind) {
    case 'dns':
      return { text: `${name}: (6) Could not resolve host: ${r.host}\n`, code: 6 };
    case 'refused':
      return { text: `${name}: (7) Failed to connect to ${r.host} port ${r.port} after 0 ms: Couldn't connect to server\n`, code: 7 };
    case 'timeout':
      return { text: `${name}: (28) Operation timed out after ${r.ms + 1} milliseconds with 0 bytes received\n`, code: 28 };
    case 'cert':
      return { text: `${name}: (60) SSL certificate problem: certificate has expired\nMore details here: https://curl.se/docs/sslcerts.html\n\n${name} failed to verify the legitimacy of the server and therefore could not\nestablish a secure connection to it. To learn more about this situation and\nhow to fix it, please visit the web page mentioned above.\n`, code: 60 };
    case 'tls':
      return { text: `${name}: (35) OpenSSL/3.0.2: error:0A00010B:SSL routines::wrong version number\n`, code: 35 };
    default:
      return { text: `${name}: (3) URL rejected: Bad hostname\n`, code: 3 };
  }
}

function formatWriteOut(fmt: string, d: { code: number; url: string; size: number; ms: number; ct: string; redirects: number }): string {
  return fmt
    .replace(/%\{http_code\}/g, String(d.code).padStart(3, '0'))
    .replace(/%\{response_code\}/g, String(d.code).padStart(3, '0'))
    .replace(/%\{url_effective\}/g, d.url)
    .replace(/%\{size_download\}/g, String(d.size))
    .replace(/%\{time_total\}/g, (d.ms / 1000).toFixed(6))
    .replace(/%\{content_type\}/g, d.ct)
    .replace(/%\{num_redirects\}/g, String(d.redirects))
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
}

void statusText;
