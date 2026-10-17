#!/usr/bin/env bash
# SPIKE — libera o OnlyOffice a acessar IP privado (host.docker.internal). Sem isso, ele BLOQUEIA o
# download do documento e o callback (SSRF guard) → "erro ao baixar" / "não pode ser gravado".
# Rode isto SEMPRE que (re)criar o container teste-onlyoffice (docker compose up recriando).
set -e
docker exec teste-onlyoffice bash -lc 'python3 - <<"PY"
import json
f="/etc/onlyoffice/documentserver/local.json"
j=json.load(open(f))
j.setdefault("services",{}).setdefault("CoAuthoring",{})["request-filtering-agent"]={"allowPrivateIPAddress":True,"allowMetaIPAddress":True}
json.dump(j,open(f,"w"),indent=2)
print("OnlyOffice: request-filtering-agent liberado (IP privado OK)")
PY'
docker exec teste-onlyoffice supervisorctl restart all
echo "Pronto. Aguarde ~15s o OnlyOffice ficar healthy e recarregue o editor."
