# iconsaiFiscalShowCase

Página showcase do **Icons.ai · Fiscal** — inteligência fiscal sobre emendas, partidos e gastos públicos.

- **Stack:** Next.js 15 + React 19 + TypeScript strict
- **basePath:** `/fiscal` (rota final `icon.iconsai.ai/fiscal`)
- **Porta dev:** `3106`
- **Accent:** `#dc2626` (vermelho)

## Desenvolvimento

```bash
npm install
npm run dev
# http://localhost:3106/fiscal
```

## Deploy

1. `npm run build`
2. `rsync .next/standalone/ .next/static/ public/ root@<droplet>:/opt/iconsai-fiscal-showcase/app/ --delete`
3. systemd unit + Caddy `icon.iconsai.ai/fiscal/*` → `127.0.0.1:3106/fiscal/*`

## Cenas (5)

1. "Onde foi o dinheiro?" + emendas
2. "Da pergunta ao dossiê" + comparação por partido
3. Dialog overlay — "CGU · TCU · SIOP · 600+ CORRELAÇÕES"
4. Browser gallery — dossiê municipal
5. Deck + export auditável

CanopyIntro é compartilhado entre 6 ShowCases.
