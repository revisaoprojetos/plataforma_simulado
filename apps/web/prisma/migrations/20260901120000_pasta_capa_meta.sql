-- Recorte de capa NÃO-destrutivo: guarda, por pasta/banco, a imagem ORIGINAL (não recortada) + os
-- parâmetros do recorte (zoom + deslocamento normalizado) de cada imagem (card e banner). Assim o
-- "Ajustar" reabre de onde parou e sem perda (o capa_url/capa_card_url continua sendo o RECORTE
-- exibido, então nenhuma tela de exibição muda). Tolerante: o app funciona sem esta coluna
-- (recorte destrutivo, comportamento anterior).
--
-- Formato: { "card": { "orig": "<url original>", "crop": { "zoom": 1.4, "offsetFrac": { "x": 0.1, "y": -0.2 } } },
--            "banner": { "orig": "<url>", "crop": { ... } } }
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS capa_meta jsonb;
