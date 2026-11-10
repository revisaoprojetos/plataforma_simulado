#!/bin/sh
# Limpa o estado volátil entre execuções de carga: limites de requisição, sessões de reprodução,
# estado de heartbeat e a fila de progresso. Só para desenvolvimento (Redis do compose).
#   sh load/reset.sh
docker exec gerenciador_video-redis-1 redis-cli eval "
local n = 0
for _, pat in ipairs({'rl:*', 'ps:*', 'hb:*', 'pm:*', 'progress:events'}) do
  for _, k in ipairs(redis.call('keys', pat)) do redis.call('del', k); n = n + 1 end
end
return n" 0
