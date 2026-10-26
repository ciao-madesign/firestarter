/** Batteria di comandi per il confronto con Bash reale. */
export const FILES: Record<string, string> = {
  'a.txt': 'uno\ndue\ntre\nquattro\ncinque\n',
  'log.txt': '2026-01-01 INFO start\n2026-01-01 ERROR boom\n2026-01-02 WARN slow\n2026-01-02 ERROR bang\n2026-01-03 INFO stop\n2026-01-03 ERROR boom\n',
  'nums.txt': '5\n3\n10\n3\n1\n',
  'data.csv': 'nome,eta,citta\nAnna,30,Roma\nLuca,25,Milano\nMaria,35,Roma\n',
  'sp.txt': '  lead and trail  \nA  B   C\n',
  'j.json': '{"a":1,"b":[1,2,3],"c":{"d":"x"},"s":"ciao"}\n',
  'arr.json': '[{"id":1,"n":"a","t":true},{"id":2,"n":"b","t":false},{"id":3,"n":"c","t":true}]\n',
  'sub/inner.txt': 'dentro\n',
  'sub/deep/x.log': 'x1\nx2\n',
  'Maiusc.TXT': 'M\n',
};

export const SNIPPETS: string[] = [
  // echo / printf / quoting
  'echo ciao', 'echo "a  b"', 'echo a   b', "echo 'a $HOME'", 'echo "tab\\there"', 'echo -n senza; echo ""', 'echo -e "a\\nb"', 'echo "uno" "due"', 'echo $((2+3*4))', 'echo $((10/3)) $((10%3)) $((2**8))',
  'printf "%s-%s\\n" a b', 'printf "%d\\n" 42', 'printf "%5s|%-5s|\\n" ab cd', 'printf "%05.1f\\n" 3.14159', 'printf "%x %o\\n" 255 8', 'printf "%s\\n" a b c', 'printf "riga\\n"', 'printf "%c\\n" hello',
  'echo "a;b"; echo c', 'echo a && echo b', 'false || echo alt', 'true && false || echo x', 'echo a; false; echo $?',
  // variabili ed espansioni
  'v=hello; echo ${v}', 'v=hello; echo ${#v}', 'v=hello; echo ${v:1:3}', 'v=hello; echo ${v:2}', 'v=hello; echo ${v^^}', 'v=HELLO; echo ${v,,}', 'v=file.tar.gz; echo ${v%.gz}', 'v=file.tar.gz; echo ${v%%.*}', 'v=file.tar.gz; echo ${v#*.}', 'v=file.tar.gz; echo ${v##*.}', 'v=banana; echo ${v/an/AN}', 'v=banana; echo ${v//an/AN}',
  'echo ${x:-default}', 'echo ${x:=set}; echo $x', 'x=1; echo ${x:+yes}', 'echo ${x-unset}', 'x=""; echo ${x:-vuoto}', 'x=""; echo [${x-nodef}]',
  'v="a b c"; for w in $v; do echo $w; done', 'v="a b c"; for w in "$v"; do echo "[$w]"; done', 'set -- a b c; echo $# $1 $3', 'set -- a b c; echo "$@"', 'set -- a b c; echo "$*"', 'f() { echo "$1-$2"; }; f x y', 'f() { return 3; }; f; echo $?', 'f() { local a=1; echo $a; }; a=9; f; echo $a',
  'arr=(a b c); echo ${arr[1]} ${#arr[@]}', 'arr=(a b c); echo "${arr[@]}"', 'arr=(a b c); arr+=(d); echo ${#arr[@]}', 'arr=(x y z); for i in "${!arr[@]}"; do echo $i; done', 'declare -A m; m[k]=v; echo ${m[k]}',
  // controllo di flusso
  'for i in 1 2 3; do echo n$i; done', 'for i in {1..4}; do echo $i; done', 'for i in {a..c}; do echo $i; done', 'for ((i=0;i<3;i++)); do echo $i; done', 'i=0; while [ $i -lt 3 ]; do echo $i; i=$((i+1)); done', 'i=3; until [ $i -eq 0 ]; do echo $i; i=$((i-1)); done',
  'if [ 1 -eq 1 ]; then echo si; else echo no; fi', 'if [ -f a.txt ]; then echo file; fi', 'if [ -d sub ]; then echo dir; fi', 'if [ -z "" ]; then echo vuoto; fi', 'if [ -n "x" ]; then echo pieno; fi', 'if [[ "abc" == a* ]]; then echo match; fi', 'if [[ "abc" =~ ^a.c$ ]]; then echo re; fi', '[[ 5 -gt 3 && 2 -lt 4 ]] && echo ok', 'if [ "a" = "b" ]; then echo x; elif [ "a" = "a" ]; then echo y; fi',
  'case b in a) echo A;; b|c) echo BC;; *) echo other;; esac', 'case "x.txt" in *.txt) echo testo;; *) echo no;; esac',
  'for f in *.txt; do echo $f; done', 'for f in sub/*; do echo $f; done', 'ls *.nonexist 2>/dev/null; echo $?', 'echo *.csv', 'echo {a,b,c}.x', 'echo a{1,2}b', 'echo ~ | grep -c home',
  // test / exit
  'test 3 -gt 2; echo $?', 'test -e nonexist; echo $?', '[ "abc" = "abc" ]; echo $?', '[ 2 -eq 3 ]; echo $?', 'true; echo $?; false; echo $?', '(exit 4); echo $?', 'bash -c "exit 7"; echo $?',
  // pipe e filtri
  'cat a.txt | head -2', 'head -n 2 a.txt', 'tail -n 2 a.txt', 'tail -n +4 a.txt', 'head -c 5 a.txt', 'wc -l a.txt', 'wc -w a.txt', 'wc -c a.txt', 'wc -l < a.txt', 'cat a.txt | wc -l', 'cat -n a.txt', 'sort a.txt', 'sort -r a.txt', 'sort -n nums.txt', 'sort -nr nums.txt', 'sort -u nums.txt', 'sort nums.txt | uniq', 'sort nums.txt | uniq -c', 'sort -n nums.txt | uniq -c | sort -rn',
  'uniq -d nums.txt', 'sort nums.txt | uniq -d', 'tac a.txt', 'rev a.txt', 'grep ERROR log.txt', 'grep -c ERROR log.txt', 'grep -v ERROR log.txt', 'grep -n ERROR log.txt', 'grep -i error log.txt', 'grep -w boom log.txt', 'grep -o "[0-9]*-[0-9]*-[0-9]*" log.txt | head -2', 'grep -E "ERROR|WARN" log.txt', 'grep -E "^2026-01-0[12]" log.txt', 'grep -x uno a.txt', 'grep -l ERROR log.txt a.txt', 'grep zzz log.txt; echo $?', 'grep -q ERROR log.txt; echo $?', 'grep -m1 ERROR log.txt', 'grep -A1 WARN log.txt', 'grep -B1 WARN log.txt', 'grep -r dentro sub', 'grep -h x sub/deep/x.log',
  'cut -d, -f1 data.csv', 'cut -d, -f2,3 data.csv', 'cut -d, -f2- data.csv', 'cut -c1-3 a.txt', 'cut -d" " -f2 log.txt', 'tail -n +2 data.csv | cut -d, -f3 | sort | uniq -c', 'tr a-z A-Z < a.txt', 'tr -d "aeiou" < a.txt', 'tr -s " " < sp.txt', 'echo hello | tr l L', 'echo "a:b:c" | tr ":" "\\n"', 'echo abc | tr "[:lower:]" "[:upper:]"',
  'sed "s/uno/UNO/" a.txt', 'sed -n "2p" a.txt', 'sed -n "2,3p" a.txt', 'sed "2d" a.txt', 'sed "s/o/0/g" a.txt', 'sed -E "s/([a-z]+)/<\\1>/" a.txt', 'sed "/due/d" a.txt', 'sed "s/^/> /" a.txt', 'sed -n "/ERROR/p" log.txt | wc -l', 'sed "\\$d" a.txt',
  'awk "{print \\$1}" log.txt', 'awk "{print \\$2}" log.txt | sort | uniq -c', 'awk -F, "{print \\$1}" data.csv', 'awk -F, "NR>1{s+=\\$2} END{print s}" data.csv', 'awk "END{print NR}" a.txt', 'awk "/ERROR/{c++} END{print c}" log.txt', 'awk "{print NR\\": \\"\\$0}" a.txt', 'awk "length(\\$0)>4" a.txt', 'awk -F, "\\$3==\\"Roma\\"{print \\$1}" data.csv',
  'paste -d, a.txt nums.txt', 'diff a.txt a.txt; echo $?', 'diff <(echo a) <(echo b); echo $?', 'basename /a/b/c.txt', 'basename /a/b/c.txt .txt', 'dirname /a/b/c.txt', 'seq 3', 'seq 2 4', 'seq 1 2 7', 'seq 3 | tac', 'echo a b c | xargs -n1', 'echo "3 1 2" | tr " " "\\n" | sort -n | tr "\\n" " "; echo', 'expr 3 + 4', 'xargs -I{} echo X{} < a.txt',
  // redirezioni e here-doc
  'echo x > o.txt; cat o.txt', 'echo x > o.txt; echo y >> o.txt; cat o.txt', 'ls nonexist 2>&1 | head -1 | cut -c1-12', 'ls nonexist 2>/dev/null; echo $?', 'echo out; echo err >&2' , 'cat <<EOF\nciao $USER_X\nEOF', 'cat <<\'EOF\'\nciao $HOME\nEOF', 'cat <<< "stringa"', 'wc -l <<< "a\nb"', 'cat a.txt a.txt | wc -l', 'echo a | tee t.txt | tr a b; cat t.txt', 'cat nonexist; echo $?', 'cat nonexist 2>&1', 'exec 3>f3.txt; echo hi >&3; exec 3>&-; cat f3.txt',
  // comandi su file
  'ls', 'ls sub', 'ls -a sub', 'ls -R sub', 'ls *.csv', 'ls -1', 'ls -d sub', 'ls nonexist; echo $?', 'mkdir -p x/y/z; ls x/y', 'mkdir x; mkdir x; echo $?', 'touch n.txt; ls n.txt', 'cp a.txt b.txt; cat b.txt | wc -l', 'mv a.txt z.txt 2>&1; ls z.txt; mv z.txt a.txt', 'rm nonexist; echo $?', 'rm -f nonexist; echo $?', 'mkdir -p d1; touch d1/f; rmdir d1 2>&1 | cut -c1-30; echo', 'find . -name "*.txt" | sort', 'find sub -type f | sort', 'find . -maxdepth 1 -type d | sort', 'find . -name "*.log"', 'cd sub; pwd | sed "s|.*/||"', 'cd sub && cd .. && pwd | sed "s|.*/||"', 'cd nonexist 2>&1 | cut -c1-40; echo $?', 'cd sub; cd -  >/dev/null; pwd | sed "s|.*/||"',
  'chmod +x a.txt; test -x a.txt && echo exec', 'stat -c %s a.txt', 'ls -l a.txt | cut -c1-10', 'ls -l | head -1', 'date +%Y >/dev/null; echo ok', 'true | false; echo $?', 'false | true; echo $?', 'set -o pipefail; false | true; echo $?',
  // jq
  'jq .a j.json', 'jq -r .s j.json', 'jq ".b | length" j.json', 'jq ".b[1]" j.json', 'jq ".c.d" j.json', 'jq -c . j.json', 'jq "keys" j.json', 'jq ".[] | .n" arr.json', 'jq -r ".[] | .n" arr.json', 'jq "map(.id)" arr.json -c', 'jq ".[] | select(.t)|.id" arr.json', 'jq "[.[]|select(.id>1)]|length" arr.json', 'jq "map(select(.t == false))" -c arr.json', 'jq ".[0]" -c arr.json', 'jq "length" arr.json', 'jq ".[] | {id, n}" -c arr.json', 'jq "to_entries|map(.key)" j.json -c', 'jq ".x" j.json', 'jq ".a + 1" j.json', 'jq ".s | ascii_upcase" j.json', 'jq ".b | add" j.json', 'jq ".b | map(.*2)" -c j.json', 'jq -r ".[] | [.id,.n] | @csv" arr.json', 'jq -r ".[] | \\"\\(.id)-\\(.n)\\"" arr.json', 'jq ".a" nonexist.json 2>&1 | head -1 | cut -c1-20', 'echo "{bad" | jq . 2>&1 | head -1 | cut -c1-12; echo', 'jq -e ".a == 2" j.json; echo $?', 'jq "has(\\"a\\")" j.json', 'jq ".b | index(2)" j.json', 'jq "[.[] | .id] | max" arr.json', 'jq "group_by(.t) | map(length)" -c arr.json', 'jq "sort_by(-.id) | .[0].id" arr.json', 'jq "unique_by(.t) | length" arr.json', 'jq "paths | length" -c j.json | head -1',
  // varie
  'x=5; ((x++)); echo $x', 'x=5; let y=x*2; echo $y', 'echo $RANDOM >/dev/null; echo ok', 'echo "$(echo a; echo b)"', 'echo `echo bt`', 'a=$(printf "x\\n\\n"); echo "[$a]"', 'read -r l < a.txt; echo $l', 'while read -r l; do echo "> $l"; done < a.txt', 'cat a.txt | while read l; do echo $l; done | head -2', 'i=0; for l in $(cat a.txt); do i=$((i+1)); done; echo $i', 'echo $0 | grep -c bash', 'type echo | head -1', 'command -v ls >/dev/null && echo has', 'hash 2>/dev/null; echo $?', 'alias ll="ls -l"; echo ok', 'trap "echo bye" EXIT; echo run', 'set -e; false; echo not-reached', 'echo ${PIPESTATUS[0]}', 'true; echo ${PIPESTATUS[@]}', 'printf "%s\\n" "$HOME" | sed "s|.*/||" | wc -c >/dev/null; echo ok', 'export Z=1; bash -c "echo [\\$Z]"', 'Z=1; bash -c "echo [\\$Z]"', 'env | grep -c ^HOME=', 'printenv HOME | grep -c .', 'echo "$IFS" | wc -c',
  // aggiunti nella slice 3
  'wc a.txt', 'wc -lw a.txt', 'wc a.txt nums.txt', 'wc -l a.txt nums.txt', 'wc -c a.txt', 'cat a.txt | wc', 'wc -l < a.txt', 'wc -lc a.txt nums.txt',
  'printf "%s|%5d|%-4d|%+d\\n" ab 42 7 3', 'printf "%.3s\\n" abcdef', 'printf "%b\\n" "a\\tb"', 'printf "%q\\n" "a b"', 'printf "%u\\n" 7', 'printf "%e\\n" 1234.5', 'printf "%g\\n" 0.0001234', 'printf "%d\\n" 0x1f', 'printf "%d\\n" abc; echo $?', 'printf "no newline"',
  'echo $((2**10)) $((1<<4)) $((255>>2)) $((6&3)) $((6|3)) $((6^3)) $((~0))', 'echo $((7 / 2)) $((-7 / 2)) $((-7 % 3)) $((3 > 2 && 1))', 'x=3; echo $((x*x + 1))', 'x=5; ((y = x + 1)) 2>/dev/null; echo ok', 'let a=2+3; echo $a', 'let "b = 4 * 2"; echo $b', 'let a=5 b=a+1; echo $a $b', 'let z=0; echo $?', 'n=10; echo $((n/3)) $((n%3)) $((n**2))', 'echo $((010 + 1)) $((0x10 + 1))',
  'set -- one two three; echo $# $1 $3', 'set -- x y; shift; echo $1 $#', 'f() { set -- p q; echo $#; }; f', 'set -- a b c; for i in "$@"; do echo "[$i]"; done',
  'set -o pipefail; false | true; echo $?', 'set -o pipefail; true | false | true; echo $?', 'false | true; echo $?',
  'set -u; echo ${nonesistente-def}; echo ok', 'bash -c "set -u; echo \\$zzz" 2>&1 | grep -c unbound',
  'bash -c "trap \'echo bye\' EXIT; echo run"', 'bash -c "trap \'echo bye\' EXIT; exit 3"; echo $?', 'bash -c "trap - EXIT; echo solo"',
  '[[ abc == a* ]] && echo m1', '[[ abc == b* ]] || echo m2', '[[ "abc" != a* ]] || echo m3', '[[ -z "" && -n x ]] && echo m4', 'x="a b"; [[ $x == "a b" ]] && echo m5', '[[ file.txt == *.txt ]] && echo m6', '[[ abc =~ ^a.c$ ]] && echo m7', '[[ 5 -gt 3 ]] && echo m8',
  'grep -m1 ERROR log.txt', 'grep -m2 -n ERROR log.txt', 'grep -x uno a.txt', 'grep -x un a.txt; echo $?', 'grep -c -m1 ERROR log.txt', 'grep -vx uno a.txt | head -2',
  'while read -r l; do echo "> $l"; done < a.txt', 'cat a.txt | while read l; do echo "<$l>"; done | head -2', 'n=0; while read -r l; do n=$((n+1)); done < a.txt; echo $n', 'read -r a b <<< "uno due tre"; echo "$a/$b"', 'read x <<< "  padded  "; echo "[$x]"', 'while IFS= read -r l; do echo "$l"; done < sp.txt', 'for i in 1 2; do echo $i; done > o2.txt; cat o2.txt', 'for i in 1 2 3; do echo $i; done | tail -1', 'if true; then echo yes; fi > o3.txt; cat o3.txt', 'i=0; while [ $i -lt 2 ]; do echo $i; i=$((i+1)); done > o4.txt; wc -l < o4.txt',
  'echo hi 3>f.txt; echo $?', 'exec 3>f3.txt; echo $?', 'echo x >&3 2>&1; echo $?',
  'echo "$IFS" | wc -c', 'IFS=, read a b <<< "x,y"; echo $a $b',
  'stat -c %s a.txt', 'stat -c "%s %n" a.txt', 'stat -c %a a.txt',
];

