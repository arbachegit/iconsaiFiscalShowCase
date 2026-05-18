/* ═══════════════════════════════════════════════════════════════════════════
 * Atlas Fiscal — Product Showcase (Cinema, two acts)
 *
 * ACT 1 — Opening (~19s) — sequência tipográfica inspirada em login_canonico.mov
 *   1.1  Kicker + Wordmark "Atlas Fiscal"                            (5s)
 *   1.2  Quote "Complexo entender as nuances fiscais do Brasil?"     (5s)
 *   1.3  Quote "Saber onde estão os clientes...?"                    (5s)
 *   1.4  Reveal: "Conheça o Atlas Fiscal..."                         (4s)
 *
 * ACT 2 — Telas reais (~100s) — 10 cenas × 10s reproduzindo fiscal.iconsai.ai
 *   2.1  Landing — cartografia federativa pontilhista (mapa CRISP)
 *   2.2  Dashboard — Top 10 alertas + tiles do município
 *   2.3  Análise — sidebar + mapa Brasil com município selecionado
 *   2.4  RAIOS CONCÊNTRICOS — BH alvo com 3 anéis sequenciais
 *   2.5  Limites LRF — gauges Pessoal · Dívida · Caixa
 *   2.6  Despesas — execução por função orçamentária
 *   2.7  RREO — Anexo I (Balanço Orçamentário do bimestre)
 *   2.8  Alertas críticos — top municípios em risco
 *   2.9  Auditoria SICONFI · RCL — drill-down de linha anômala
 *   2.10 IA · Municípios — Claude com citações [Fonte X·Y.Z]
 *
 * REGRAS DURAS:
 *  - NO useState/setTimeout/setInterval — tudo via @keyframes infinitos
 *  - NO skip/dots/popup/CTA — loop visual contínuo
 *  - prefers-reduced-motion respeitado
 *  - Cores reais: laranja IBGE #fb923c, teal #14b8a6, warn #facc15,
 *    danger #ef4444, ink #0a0e1a
 *  - Mapa Brasil renderizado a partir do GeoJSON real (IBGE), projetado
 *    server-side via createProjection; viewBox dimensionado para o
 *    output projetado exato (zero corte).
 *  - "FIA" foi removido — marca canônica é apenas "Atlas Fiscal".
 * ═══════════════════════════════════════════════════════════════════════════ */

'use client'

import { useMemo } from 'react'
import './showcase.css'
import {
  createProjection,
  stateToSvgPath,
  type StateGeom,
  type Bbox,
  type Projection,
} from '@/lib/landing/brazil-projection'
import { ShowcaseShell, type ShowcaseScene } from './showcase-shell'

/* ───────────────────────────────────────────────────────────────────────────
 * Geometria do mapa — viewBox dimensionado ao tamanho REAL projetado.
 *
 * Brasil ~41.6° lng × 39.0° lat (aspect ≈ 1.07). Para garantir mapa cabendo
 * inteiro no viewport com margem, escolhemos:
 *
 *   SVG_W = 640
 *   SVG_H = 600
 *   MAP_PADDING = 36  (margem para labels e respiro)
 *
 *   contentW = 568, contentH = 528
 *   scale    = min(568/41.6, 528/39.0) = min(13.65, 13.54) = 13.54
 *   mappedW  = 41.6 × 13.54 ≈ 563
 *   mappedH  = 39.0 × 13.54 ≈ 528 (encosta na altura)
 *
 *   O createProjection centra o mappedW dentro do contentW → margem ≈ 2.5px
 *   de cada lado. Com preserveAspectRatio="xMidYMid meet" no SVG, o mapa
 *   nunca corta — só pode ter letterbox.
 * ─────────────────────────────────────────────────────────────────────────── */

const SVG_W = 640
const SVG_H = 600
const MAP_PADDING = 36

/* ───────────────────────────────────────────────────────────────────────────
 * Helpers — projeção de coordenadas reais (lng,lat → x,y do viewBox)
 * Tudo calculado server-side a partir do GeoJSON IBGE.
 * ─────────────────────────────────────────────────────────────────────────── */

function project(p: Projection, lng: number, lat: number): [number, number] {
  return p(lng, lat)
}

// Conversão aproximada: 1° lat ≈ 111 km. Suficiente p/ raios em px.
function kmRadiusPx(p: Projection, km: number): number {
  return (km / 111) * p.scale
}

/* ───────────────────────────────────────────────────────────────────────────
 * Cartografia pontilhista — gera dots dentro do GeoJSON real (estado-a-estado).
 * Determinístico via seed. Substitui o REGIONS hardcoded antigo.
 * ─────────────────────────────────────────────────────────────────────────── */

// PRNG determinístico
function rng(seed: number): number {
  const x = Math.sin(seed * 9999.31) * 43758.5453
  return x - Math.floor(x)
}

const REGION_COLOR: Record<string, string> = {
  N:  '#14b8a6',
  NE: '#fb923c',
  CO: '#facc15',
  SE: '#f97316',
  S:  '#5eead4',
}

const REGION_DOTS: Record<string, number> = {
  N: 70, NE: 110, CO: 55, SE: 105, S: 70,
}

interface Dot { cx: number; cy: number; r: number; o: number; color: string; delay: number }

/**
 * Gera dots dentro de cada estado, projetados via createProjection.
 * Para cada região, sorteia N pontos no bbox do estado e descarta os fora
 * do polígono (point-in-ring). Cap em ~tentativas para garantir distribuição.
 */
function generateGeoDots(states: StateGeom[], proj: Projection): Dot[] {
  const out: Dot[] = []
  let s = 11
  // Agrupa por região
  const byRegion = new Map<string, StateGeom[]>()
  for (const st of states) {
    const arr = byRegion.get(st.region) ?? []
    arr.push(st)
    byRegion.set(st.region, arr)
  }
  let dotIdx = 0
  for (const [region, regStates] of byRegion) {
    const totalDots = REGION_DOTS[region] ?? 60
    const color = REGION_COLOR[region] ?? '#94a3b8'
    let placed = 0
    let attempts = 0
    while (placed < totalDots && attempts < totalDots * 40) {
      attempts++
      s++
      // Sorteia um estado da região (peso uniforme)
      const st = regStates[Math.floor(rng(s) * regStates.length)]
      // Bbox do estado
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
      for (const ring of st.rings) for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
      const lng = minLng + rng(s + 0.31) * (maxLng - minLng)
      const lat = minLat + rng(s + 0.79) * (maxLat - minLat)
      // Point-in-ring (mesma lógica de pointInRing em brazil-map.ts)
      let inside = false
      for (const ring of st.rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i]
          const [xj, yj] = ring[j]
          const intersect = (yi > lat) !== (yj > lat) &&
            lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
          if (intersect) inside = !inside
        }
        if (inside) break
      }
      if (!inside) continue
      const [cx, cy] = project(proj, lng, lat)
      const r = 1.1 + rng(s + 0.41) * 1.3
      const o = 0.45 + rng(s + 0.93) * 0.5
      out.push({
        cx: Math.round(cx * 10) / 10,
        cy: Math.round(cy * 10) / 10,
        r: Math.round(r * 10) / 10,
        o: Math.round(o * 100) / 100,
        color,
        delay: dotIdx * 6,
      })
      dotIdx++
      placed++
    }
  }
  return out
}

/* ───────────────────────────────────────────────────────────────────────────
 * Labels de região — projetados a partir dos centroides reais.
 * ─────────────────────────────────────────────────────────────────────────── */

const REGION_LABELS: Array<{ code: string; label: string; lng: number; lat: number }> = [
  { code: 'N',  label: 'NORTE',        lng: -63,   lat:   0.5 },
  { code: 'NE', label: 'NORDESTE',     lng: -38,   lat:  -5   },
  { code: 'CO', label: 'CENTRO-OESTE', lng: -55,   lat: -13   },
  { code: 'SE', label: 'SUDESTE',      lng: -42,   lat: -20   },
  { code: 'S',  label: 'SUL',          lng: -53,   lat: -28.5 },
]

/* ───────────────────────────────────────────────────────────────────────────
 * Cidades reais usadas em cenas (lng, lat WGS84)
 * ─────────────────────────────────────────────────────────────────────────── */

const CITIES = {
  BH:          { lng: -43.9378, lat: -19.9208, nome: 'Belo Horizonte', uf: 'MG' },
  Itapecerica: { lng: -46.8500, lat: -23.7167, nome: 'Itapecerica da Serra', uf: 'SP' },
}

/* ───────────────────────────────────────────────────────────────────────────
 * Estrutura das cenas — Act 1 (opening) + Act 2 (telas reais)
 * ─────────────────────────────────────────────────────────────────────────── */

interface OpeningScene {
  kind: 'opening'
  id: string
  duration: number // em segundos
}

interface ProductScene {
  kind: 'product'
  id: string
  url: string
  caption: string
  flowFrom?: string
  duration: number
}

/* Split caption "Title — desc text" into { title, desc }. */
function splitCaption(c: string): { title: string; desc: string } {
  const idx = c.indexOf('—')
  if (idx === -1) return { title: c, desc: '' }
  return { title: c.slice(0, idx).trim(), desc: c.slice(idx + 1).trim() }
}

type Scene = OpeningScene | ProductScene

const OPENING: OpeningScene[] = [
  { kind: 'opening', id: 'op-wordmark', duration: 5 },
  { kind: 'opening', id: 'op-quote-1',  duration: 5 },
  { kind: 'opening', id: 'op-quote-2',  duration: 5 },
  { kind: 'opening', id: 'op-reveal',   duration: 8 }, // FIX 1: closer mais lento p/ legibilidade
]

const PRODUCT: ProductScene[] = [
  { kind: 'product', id: 'landing',   url: 'fiscal.iconsai.ai/landing',                duration: 10,
    caption: 'Cartografia federativa — 5 570 municípios pontilhados por região, alimentados pelo SICONFI · Tesouro Nacional.' },
  { kind: 'product', id: 'dashboard', url: 'fiscal.iconsai.ai/',                       duration: 10,
    caption: 'Dashboard de entrada — Top 10 alertas críticos do Brasil + tiles do município selecionado (RCL, pessoal, LRF).',
    flowFrom: 'Auditor entra no sistema' },
  { kind: 'product', id: 'analise',   url: 'fiscal.iconsai.ai/analise',                duration: 10,
    caption: 'Análise geral — sidebar de municípios + mapa. O auditor escolhe Itapecerica da Serra/SP.',
    flowFrom: 'Escolher município no mapa' },
  // FIX 2: raios mais lento, cidades aparecem em cluster
  { kind: 'product', id: 'raios',     url: 'fiscal.iconsai.ai/raio-consumo',           duration: 20,
    caption: 'Raio de consumidores — cada anel revela um cluster de cidades com população, IDH, RCL e alertas LRF.',
    flowFrom: 'Onde estão os clientes da minha empresa?' },
  { kind: 'product', id: 'lrf',       url: 'fiscal.iconsai.ai/limites-lrf',            duration: 10,
    caption: 'Limites LRF — Despesa de Pessoal 54,32% (acima do prudencial 51,30%). Dívida 38,1%. Régua dos três limites legais.',
    flowFrom: 'O município respeita a LRF?' },
  // FIX 3: despesas com timeline de meses rolando + gráfico de sazonalidade
  { kind: 'product', id: 'despesas',  url: 'fiscal.iconsai.ai/despesas',               duration: 12,
    caption: 'Linha do tempo · 2025 — meses rolando, valores tabular-nums e sazonalidade por função detectada via série temporal.',
    flowFrom: 'Para onde vai o dinheiro?' },
  { kind: 'product', id: 'rreo',      url: 'fiscal.iconsai.ai/rreo',                   duration: 10,
    caption: 'RREO · 4º bimestre · Anexo I — Balanço Orçamentário. Previsão atualizada vs realizada, resultado primário.',
    flowFrom: 'Detalha o bimestre' },
  { kind: 'product', id: 'alertas',   url: 'fiscal.iconsai.ai/alertas',                duration: 10,
    caption: 'Alertas fiscais — top municípios em risco crítico no entorno: disp. caixa, RPPS, despesa de pessoal.',
    flowFrom: 'Outros municípios em risco' },
  { kind: 'product', id: 'auditoria', url: 'fiscal.iconsai.ai/auditoria/siconfi-rcl',  duration: 10,
    caption: 'Auditoria SICONFI · RCL — tabela bruta linha-a-linha. Row 4731 flagado como anômalo (Δ +18,7% vs vizinhos).',
    flowFrom: 'Audita o número na fonte' },
  // FIX 4: IA com indicador "digitando" antes de cada mensagem
  { kind: 'product', id: 'ia',        url: 'fiscal.iconsai.ai/ia-municipios',          duration: 14,
    caption: 'IA · Municípios — Claude pensa antes de responder e cita ABNT [Fonte X · item Y.Z].',
    flowFrom: 'Pergunta à IA o porquê' },
  // FIX 5: cenas finais — grafo + relatório executivo
  { kind: 'product', id: 'rel-cidade',  url: 'fiscal.iconsai.ai/relatorio/belo-horizonte', duration: 12,
    caption: 'Relatório fiscal · Belo Horizonte/MG — grafo de problemas ↔ soluções + síntese executiva com score de saúde fiscal.',
    flowFrom: 'Diagnóstico da cidade' },
  { kind: 'product', id: 'rel-empresa', url: 'fiscal.iconsai.ai/relatorio/magisatech',    duration: 12,
    caption: 'Relatório fiscal · MagisaTech LTDA — riscos tributários, oportunidades de elisão lícita e compliance score.',
    flowFrom: 'Diagnóstico da empresa' },
]

const SCENES: Scene[] = [...OPENING, ...PRODUCT]

/* ───────────────────────────────────────────────────────────────────────────
 * Timeline — soma cumulativa de durações, exposta via CSS custom props.
 * ─────────────────────────────────────────────────────────────────────────── */

function buildTimeline(scenes: Scene[]) {
  const starts: number[] = []
  let acc = 0
  for (const sc of scenes) {
    starts.push(acc)
    acc += sc.duration
  }
  return { starts, total: acc }
}

const TIMELINE = buildTimeline(SCENES)
const TOTAL = TIMELINE.total // ~119s
const PRODUCT_OFFSET = OPENING.reduce((a, b) => a + b.duration, 0) // ~19s

/* ───────────────────────────────────────────────────────────────────────────
 * NavBar — labels e starts (ms) por cena. PRODUCT vai com nome humano;
 * OPENING colapsa numa única entrada "Abertura" porque é uma sequência
 * tipográfica contínua.
 * ─────────────────────────────────────────────────────────────────────────── */
const NAV_PRODUCT_LABELS: Record<string, string> = {
  'landing':     'Landing · cartografia',
  'dashboard':   'Dashboard alertas',
  'analise':     'Análise · escolha',
  'raios':       'Raios concêntricos',
  'lrf':         'Limites LRF',
  'despesas':    'Despesas · timeline',
  'rreo':        'RREO · 4º bimestre',
  'alertas':     'Alertas críticos',
  'auditoria':   'Auditoria SICONFI',
  'ia':          'IA · Municípios',
  'rel-cidade':  'Relatório · cidade',
  'rel-empresa': 'Relatório · empresa',
}
/* NAV_SCENES e NAV_CYCLE_MS removidos — shell canônico gera chips a partir
 * do array de scenes passado. NAV_PRODUCT_LABELS continua usado pra labels. */

/* ───────────────────────────────────────────────────────────────────────────
 * Keyframes server-rendered — uma @keyframes por cena, com janela de
 * visibilidade calculada a partir de start/duration/total. Resolve o
 * problema de cenas com durações DIFERENTES sincronizadas no mesmo
 * ciclo mestre.
 *
 * Padrão de cada cena (em % do ciclo total):
 *   [0, start_pct - tiny]              hidden
 *   [start_pct, start_pct + enter]     fade-in + slide-in
 *   [start_pct + enter, end_pct - exit] sustained (visible)
 *   [end_pct - exit, end_pct]          fade-out + slide-up
 *   [end_pct, 100]                     hidden
 * ─────────────────────────────────────────────────────────────────────────── */

function emitSceneKeyframes(scenes: Scene[], timeline: { starts: number[] }, total: number) {
  const rules: string[] = []
  const ENTER = 0.4 // segundos
  const EXIT = 0.5  // segundos
  scenes.forEach((sc, idx) => {
    const start = timeline.starts[idx]
    const end = start + sc.duration
    const sp = (start / total) * 100
    const ep = (end / total) * 100
    const ip = ((start + ENTER) / total) * 100
    const op = ((end - EXIT) / total) * 100
    const PRE = Math.max(0, sp - 0.05)
    const POST = Math.min(100, ep + 0.05)
    const name = `fs-scene-${sc.id}`
    rules.push(`@keyframes ${name} {
      0% { opacity: 0; transform: translateY(18px) scale(0.985); }
      ${PRE.toFixed(3)}% { opacity: 0; transform: translateY(18px) scale(0.985); }
      ${sp.toFixed(3)}% { opacity: 0; transform: translateY(18px) scale(0.985); }
      ${ip.toFixed(3)}% { opacity: 1; transform: translateY(0) scale(1); }
      ${op.toFixed(3)}% { opacity: 1; transform: translateY(0) scale(1); }
      ${ep.toFixed(3)}% { opacity: 0; transform: translateY(-14px) scale(0.985); }
      ${POST.toFixed(3)}% { opacity: 0; transform: translateY(-14px) scale(0.985); }
      100% { opacity: 0; transform: translateY(-14px) scale(0.985); }
    }`)
  })
  // Timeline segment fill keyframes (apenas para o footer)
  scenes.forEach((sc, idx) => {
    const start = timeline.starts[idx]
    const end = start + sc.duration
    const sp = (start / total) * 100
    const ep = (end / total) * 100
    const name = `fs-tl-${sc.id}`
    rules.push(`@keyframes ${name} {
      0% { transform: scaleX(0); }
      ${sp.toFixed(3)}% { transform: scaleX(0); }
      ${ep.toFixed(3)}% { transform: scaleX(1); }
      100% { transform: scaleX(1); }
    }`)
  })
  return rules.join('\n')
}

function emitCaptionKeyframes(scenes: ProductScene[], offsets: number[], total: number) {
  // Caption container visibility cycle (fade-in / hold / fade-out).
  // Word-by-word typewriter é emitido inline pelo <FsTw> component.
  const rules: string[] = []
  const ENTER = 0.5
  const EXIT = 0.4
  scenes.forEach((sc, idx) => {
    const start = offsets[idx]
    const end = start + sc.duration
    const sp = (start / total) * 100
    const ep = (end / total) * 100
    const ip = ((start + ENTER) / total) * 100
    const op = ((end - EXIT) / total) * 100
    const name = `fs-cap-${sc.id}`
    rules.push(`@keyframes ${name} {
      0% { opacity: 0; transform: translateY(8px); }
      ${sp.toFixed(3)}% { opacity: 0; transform: translateY(8px); }
      ${ip.toFixed(3)}% { opacity: 1; transform: translateY(0); }
      ${op.toFixed(3)}% { opacity: 1; transform: translateY(0); }
      ${ep.toFixed(3)}% { opacity: 0; transform: translateY(-6px); }
      100% { opacity: 0; transform: translateY(-6px); }
    }`)
  })
  return rules.join('\n')
}

/* ─── TYPEWRITER REAL — word-by-word insertion ─────────────────── */
function FsTw({
  text,
  totalSec,
  startSec,
  endSec,
  entryMs,
  perWordMs,
  uid,
  className,
}: {
  text: string
  totalSec: number
  startSec: number
  endSec: number
  entryMs: number
  perWordMs: number
  uid: string
  className: string
}) {
  const totalMs = totalSec * 1000
  const startMs = startSec * 1000
  const endMs = endSec * 1000 - 100
  const words = text.split(/(\s+)/)
  const css: string[] = []
  const spans: React.ReactNode[] = []
  let visibleIdx = 0
  words.forEach((w, i) => {
    if (!w.trim()) {
      spans.push(<span key={i}>{w}</span>)
      return
    }
    const wordOnMs = startMs + entryMs + visibleIdx * perWordMs
    const onPct = (wordOnMs / totalMs) * 100
    const onFullPct = Math.min(100, onPct + 0.02)
    const offPct = (endMs / totalMs) * 100
    const offFullPct = Math.min(100, offPct + 0.3)
    const prePct = Math.max(0, onPct - 0.001)
    const kfName = `fs-tw-${uid}-${visibleIdx}`
    css.push(`@keyframes ${kfName} {
      0% { opacity: 0; }
      ${prePct.toFixed(4)}% { opacity: 0; }
      ${onPct.toFixed(4)}% { opacity: 0; }
      ${onFullPct.toFixed(4)}% { opacity: 1; }
      ${offPct.toFixed(4)}% { opacity: 1; }
      ${offFullPct.toFixed(4)}% { opacity: 0; }
      100% { opacity: 0; }
    }`)
    spans.push(
      <span
        key={i}
        className="fs-tw-word"
        style={{
          animationName: kfName,
          animationDuration: `${totalMs}ms`,
          animationIterationCount: 'infinite',
          animationTimingFunction: 'linear',
          animationFillMode: 'both',
        }}
      >
        {w}
      </span>
    )
    visibleIdx++
  })
  const caretOnPct = ((startMs + entryMs) / totalMs) * 100
  const caretOffPct = (endMs / totalMs) * 100
  const caretKf = `fs-tw-caret-${uid}`
  css.push(`@keyframes ${caretKf} {
    0%, ${Math.max(0, caretOnPct - 0.001).toFixed(4)}% { opacity: 0; }
    ${caretOnPct.toFixed(4)}% { opacity: 1; }
    ${caretOffPct.toFixed(4)}% { opacity: 1; }
    ${Math.min(100, caretOffPct + 0.05).toFixed(4)}%, 100% { opacity: 0; }
  }`)
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css.join('\n') }} />
      <span className={className}>
        {spans}
        <span
          className="fs-tw-caret"
          aria-hidden="true"
          style={{
            animationName: caretKf,
            animationDuration: `${totalMs}ms`,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'linear',
            animationFillMode: 'both',
          }}
        >
          ▌
        </span>
      </span>
    </>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
 * Dados das cidades-cluster (cena raios) — usados também pela emissão
 * server-side de keyframes (stagger por anel).
 * ─────────────────────────────────────────────────────────────────────────── */

interface CityCard {
  nome: string
  uf: string
  pop: string
  idh: string
  rcl: string
  pessoal: string // %
  status: 'OK' | 'ALERTA' | 'CRÍTICO'
  ring: 1 | 2 | 3
}

// Dados reais aproximados do entorno BH (SICONFI 2025 · IBGE 2022)
const RAIOS_CITIES: CityCard[] = [
  // — Anel 100km — coração metropolitano
  { nome: 'Contagem',         uf: 'MG', pop: '672 k', idh: '0,756', rcl: 'R$ 3,1 Bi', pessoal: '51,2%', status: 'ALERTA', ring: 1 },
  { nome: 'Betim',            uf: 'MG', pop: '444 k', idh: '0,749', rcl: 'R$ 2,4 Bi', pessoal: '48,7%', status: 'OK',     ring: 1 },
  { nome: 'Nova Lima',        uf: 'MG', pop: '105 k', idh: '0,813', rcl: 'R$ 0,8 Bi', pessoal: '46,4%', status: 'OK',     ring: 1 },
  { nome: 'Sete Lagoas',      uf: 'MG', pop: '241 k', idh: '0,760', rcl: 'R$ 1,1 Bi', pessoal: '53,8%', status: 'ALERTA', ring: 1 },
  // — Anel 200km — região central MG
  { nome: 'Juiz de Fora',     uf: 'MG', pop: '581 k', idh: '0,778', rcl: 'R$ 2,7 Bi', pessoal: '49,1%', status: 'OK',     ring: 2 },
  { nome: 'Divinópolis',      uf: 'MG', pop: '241 k', idh: '0,764', rcl: 'R$ 1,0 Bi', pessoal: '54,8%', status: 'CRÍTICO', ring: 2 },
  { nome: 'Itabira',          uf: 'MG', pop: '116 k', idh: '0,748', rcl: 'R$ 0,7 Bi', pessoal: '50,2%', status: 'ALERTA', ring: 2 },
  { nome: 'Ouro Preto',       uf: 'MG', pop: ' 74 k', idh: '0,741', rcl: 'R$ 0,5 Bi', pessoal: '47,6%', status: 'OK',     ring: 2 },
  { nome: 'Conselheiro Lafaiete', uf: 'MG', pop: '128 k', idh: '0,729', rcl: 'R$ 0,6 Bi', pessoal: '52,1%', status: 'ALERTA', ring: 2 },
  { nome: 'Pouso Alegre',     uf: 'MG', pop: '152 k', idh: '0,774', rcl: 'R$ 0,8 Bi', pessoal: '46,9%', status: 'OK',     ring: 2 },
  // — Anel 400km — SE expandido
  { nome: 'Uberlândia',       uf: 'MG', pop: '713 k', idh: '0,789', rcl: 'R$ 3,8 Bi', pessoal: '47,2%', status: 'OK',     ring: 3 },
  { nome: 'Uberaba',          uf: 'MG', pop: '337 k', idh: '0,772', rcl: 'R$ 1,4 Bi', pessoal: '50,8%', status: 'ALERTA', ring: 3 },
  { nome: 'Montes Claros',    uf: 'MG', pop: '414 k', idh: '0,770', rcl: 'R$ 1,6 Bi', pessoal: '55,1%', status: 'CRÍTICO', ring: 3 },
  { nome: 'Vitória',          uf: 'ES', pop: '322 k', idh: '0,845', rcl: 'R$ 3,2 Bi', pessoal: '44,8%', status: 'OK',     ring: 3 },
  { nome: 'Vila Velha',       uf: 'ES', pop: '467 k', idh: '0,800', rcl: 'R$ 1,9 Bi', pessoal: '49,4%', status: 'OK',     ring: 3 },
  { nome: 'Cariacica',        uf: 'ES', pop: '383 k', idh: '0,718', rcl: 'R$ 1,2 Bi', pessoal: '53,2%', status: 'ALERTA', ring: 3 },
  { nome: 'Volta Redonda',    uf: 'RJ', pop: '274 k', idh: '0,771', rcl: 'R$ 1,3 Bi', pessoal: '51,9%', status: 'ALERTA', ring: 3 },
  { nome: 'Anápolis',         uf: 'GO', pop: '391 k', idh: '0,737', rcl: 'R$ 1,5 Bi', pessoal: '48,1%', status: 'OK',     ring: 3 },
]

const RING_COLOR_HEX = { 1: '#14b8a6', 2: '#fb923c', 3: '#facc15' } as const
const RING_LABEL_KM  = { 1: '100 km', 2: '200 km', 3: '400 km' } as const

/* ───────────────────────────────────────────────────────────────────────────
 * Master-cycle child keyframes — gera animações para elementos DENTRO de cenas
 * com timings ancorados no ciclo mestre (TOTAL s). Sem isso, cada elemento
 * dispararia uma única vez no page-load e a cena ficaria estática nos próximos
 * loops. Essas keyframes são tocadas com `animation-duration: var(--fs-total)`
 * e `infinite`, garantindo re-trigger a cada ciclo.
 *
 * Helper: pctOf(sceneStart, t) devolve o % do ciclo total quando "t segundos
 * dentro da cena" acontece. Clamp em [0, 100].
 * ─────────────────────────────────────────────────────────────────────────── */

function pctOf(sceneStart: number, t: number): number {
  const v = ((sceneStart + t) / TOTAL) * 100
  return Math.min(100, Math.max(0, v))
}

function emitRaiosKeyframes(sceneStart: number, sceneDur: number): string {
  const rules: string[] = []
  // Marcos dentro da cena (segundos):
  //   ring1 entra 1.0 → 3.0 ; pulse contínuo até 20
  //   cards r1 stagger 2.5 → 5.5
  //   ring2 entra 7.5 → 9.5 ; pulse contínuo
  //   cards r2 stagger 9.0 → 12.5
  //   ring3 entra 13.0 → 15.0 ; pulse contínuo
  //   cards r3 stagger 14.0 → 17.5
  //   indicador muda em 1.0 / 7.5 / 13.0
  const RING_IN = 1.8 // dur de entrada do anel
  const CARD_IN = 0.5 // dur de entrada do card
  const PULSE_PERIOD = 2.6 // pulse de cada anel (segundos)

  // Anéis — entram com scale, sustentam e pulsam até o fim da cena
  const ringStarts = [1.0, 7.5, 13.0]
  ringStarts.forEach((rs, i) => {
    const idx = i + 1
    const inStart = pctOf(sceneStart, rs)
    const inEnd = pctOf(sceneStart, rs + RING_IN)
    const pre = Math.max(0, inStart - 0.001)
    const post = Math.min(100, pctOf(sceneStart, sceneDur) + 0.001)
    // Pulse: superpõe scale-loop pós-entrada. Gera N pulses dentro da janela.
    const pulseStart = rs + RING_IN
    const pulseEnd = sceneDur - 0.5
    const pulseDur = pulseEnd - pulseStart
    const pulses = Math.max(1, Math.floor(pulseDur / PULSE_PERIOD))
    const stops: string[] = []
    stops.push(`0% { opacity: 0; transform: scale(0); }`)
    stops.push(`${pre.toFixed(3)}% { opacity: 0; transform: scale(0); }`)
    stops.push(`${inStart.toFixed(3)}% { opacity: 0; transform: scale(0); }`)
    // Entrada com leve overshoot
    const overshoot = pctOf(sceneStart, rs + RING_IN * 0.6)
    stops.push(`${overshoot.toFixed(3)}% { opacity: 1; transform: scale(1.06); }`)
    stops.push(`${inEnd.toFixed(3)}% { opacity: 1; transform: scale(1); }`)
    // Pulses contínuos
    for (let p = 0; p < pulses; p++) {
      const t0 = pulseStart + p * PULSE_PERIOD
      const t1 = t0 + PULSE_PERIOD * 0.5
      const t2 = t0 + PULSE_PERIOD
      stops.push(`${pctOf(sceneStart, t0).toFixed(3)}% { opacity: 1; transform: scale(1); }`)
      stops.push(`${pctOf(sceneStart, t1).toFixed(3)}% { opacity: 0.85; transform: scale(1.022); }`)
      stops.push(`${pctOf(sceneStart, t2).toFixed(3)}% { opacity: 1; transform: scale(1); }`)
    }
    // Sustentar até o fim da cena
    stops.push(`${pctOf(sceneStart, sceneDur).toFixed(3)}% { opacity: 1; transform: scale(1); }`)
    stops.push(`${post.toFixed(3)}% { opacity: 0; transform: scale(1); }`)
    stops.push(`100% { opacity: 0; transform: scale(1); }`)
    rules.push(`@keyframes fs-raio-cycle-${idx} {\n  ${stops.join('\n  ')}\n}`)
  })

  // Cards — stagger por anel
  // Mapeia: cardIndexGlobal → { ringIdx, indexInRing }
  // Aqui geramos uma family de keyframes indexada pelo delay efetivo dentro da cena.
  // Para simplificar, geramos N keyframes únicos: fs-raios-card-cycle-<delayMs>
  // mas é mais limpo usar 3 keyframes (um por anel) e variar via animation-delay
  // calculado como % do ciclo. Mas como animation-delay é absoluto (não % de cycle),
  // não dá. Solução: gerar 1 keyframe por card (ou por delay único). Há 18 cards.

  // Para cada card geramos um keyframe que respeita o stagger.
  const RING_CONFIG: Record<1 | 2 | 3, { start: number; step: number }> = {
    1: { start: 2.5, step: 0.18 },
    2: { start: 9.0, step: 0.14 },
    3: { start: 14.0, step: 0.12 },
  }
  RAIOS_CITIES.forEach((c, i) => {
    const cfg = RING_CONFIG[c.ring]
    const indexInRing =
      RAIOS_CITIES.filter((x, j) => x.ring === c.ring && j <= i).length - 1
    const tEnter = cfg.start + indexInRing * cfg.step
    const inStart = pctOf(sceneStart, tEnter)
    const inMid = pctOf(sceneStart, tEnter + CARD_IN * 0.6)
    const inEnd = pctOf(sceneStart, tEnter + CARD_IN)
    const sustainEnd = pctOf(sceneStart, sceneDur - 0.2)
    const exit = pctOf(sceneStart, sceneDur + 0.05)
    const pre = Math.max(0, inStart - 0.001)
    rules.push(`@keyframes fs-raios-card-cycle-${i} {
  0% { opacity: 0; transform: scale(0.88) translateY(6px); }
  ${pre.toFixed(3)}% { opacity: 0; transform: scale(0.88) translateY(6px); }
  ${inStart.toFixed(3)}% { opacity: 0; transform: scale(0.88) translateY(6px); }
  ${inMid.toFixed(3)}% { opacity: 1; transform: scale(1.06) translateY(0); }
  ${inEnd.toFixed(3)}% { opacity: 1; transform: scale(1) translateY(0); }
  ${sustainEnd.toFixed(3)}% { opacity: 1; transform: scale(1) translateY(0); }
  ${exit.toFixed(3)}% { opacity: 0; transform: scale(1) translateY(-4px); }
  100% { opacity: 0; transform: scale(1) translateY(-4px); }
}`)
  })

  // Indicador "Calculando alcance · Nkm" — 3 estados encadeados.
  // Cada estado expõe 1 sub-elemento via opacity 0/1.
  const labelStarts = [0.5, 7.0, 12.5]
  const labelEnds = [7.0, 12.5, sceneDur - 0.2]
  labelStarts.forEach((ls, i) => {
    const fadeIn = 0.35
    const fadeOut = 0.35
    const a = pctOf(sceneStart, ls)
    const b = pctOf(sceneStart, ls + fadeIn)
    const c = pctOf(sceneStart, labelEnds[i] - fadeOut)
    const d = pctOf(sceneStart, labelEnds[i])
    rules.push(`@keyframes fs-raios-ind-${i + 1} {
  0% { opacity: 0; }
  ${Math.max(0, a - 0.001).toFixed(3)}% { opacity: 0; }
  ${a.toFixed(3)}% { opacity: 0; }
  ${b.toFixed(3)}% { opacity: 1; }
  ${c.toFixed(3)}% { opacity: 1; }
  ${d.toFixed(3)}% { opacity: 0; }
  100% { opacity: 0; }
}`)
  })

  return rules.join('\n')
}

function emitIaKeyframes(sceneStart: number, sceneDur: number): string {
  const rules: string[] = []
  // Marcos dentro da cena (14s total):
  //   0.0  → user dots aparecem
  //   2.0  → user dots somem ; user typewriter inicia
  //   4.0  → user typewriter completo, caret some
  //   4.6  → bot dots aparecem ("Claude pensando…")
  //   7.0  → bot dots somem ; bot typewriter inicia
  //   12.5 → bot typewriter completo
  //   13.0 → citações fade-in
  // (sceneDur=14)

  const USER_DOTS_START = 0.0
  const USER_DOTS_END = 2.0
  const USER_TW_START = 2.1
  const USER_TW_END = 4.0
  const BOT_DOTS_START = 4.6
  const BOT_DOTS_END = 7.0
  const BOT_TW_START = 7.1
  const BOT_TW_END = 12.5
  const CITE_START = 13.0
  const CITE_END = sceneDur - 0.2

  function fadeWindow(name: string, t0: number, t1: number, fadeIn = 0.25, fadeOut = 0.3) {
    const a = pctOf(sceneStart, t0)
    const b = pctOf(sceneStart, t0 + fadeIn)
    const c = pctOf(sceneStart, t1 - fadeOut)
    const d = pctOf(sceneStart, t1)
    rules.push(`@keyframes ${name} {
  0% { opacity: 0; }
  ${Math.max(0, a - 0.001).toFixed(3)}% { opacity: 0; }
  ${a.toFixed(3)}% { opacity: 0; }
  ${b.toFixed(3)}% { opacity: 1; }
  ${c.toFixed(3)}% { opacity: 1; }
  ${d.toFixed(3)}% { opacity: 0; }
  100% { opacity: 0; }
}`)
  }

  // User row container — visível desde o início até fim da cena
  fadeWindow('fs-ia-user-show', USER_DOTS_START, sceneDur, 0.3, 0.4)
  // Bot row container — visível a partir de BOT_DOTS_START
  fadeWindow('fs-ia-bot-show', BOT_DOTS_START - 0.2, sceneDur, 0.3, 0.4)

  // Dots — fade in/out
  fadeWindow('fs-ia-user-dots', USER_DOTS_START, USER_DOTS_END, 0.2, 0.25)
  fadeWindow('fs-ia-bot-dots', BOT_DOTS_START, BOT_DOTS_END, 0.2, 0.25)

  // Typewriter — clip-path reveal char-by-char
  function typewriter(name: string, t0: number, t1: number) {
    const a = pctOf(sceneStart, t0)
    const b = pctOf(sceneStart, t1)
    rules.push(`@keyframes ${name} {
  0% { opacity: 0; clip-path: inset(0 100% 0 0); }
  ${Math.max(0, a - 0.001).toFixed(3)}% { opacity: 0; clip-path: inset(0 100% 0 0); }
  ${a.toFixed(3)}% { opacity: 1; clip-path: inset(0 100% 0 0); }
  ${b.toFixed(3)}% { opacity: 1; clip-path: inset(0 -0.3em 0 0); }
  100% { opacity: 1; clip-path: inset(0 -0.3em 0 0); }
}`)
  }
  typewriter('fs-ia-user-tw', USER_TW_START, USER_TW_END)
  typewriter('fs-ia-bot-tw', BOT_TW_START, BOT_TW_END)

  // Caret window — caret pisca somente DURANTE o typewriter da própria mensagem.
  // Embute o blink (visível/invisível alternado) dentro da janela do caret.
  // Período do blink: 0.5s (on 0.25s, off 0.25s).
  function caretBlink(name: string, t0: number, t1: number) {
    const BLINK = 0.5
    const FADE_IN = 0.1
    const FADE_OUT = 0.15
    const stops: string[] = []
    stops.push(`0% { opacity: 0; }`)
    const a = pctOf(sceneStart, t0)
    const b = pctOf(sceneStart, t0 + FADE_IN)
    stops.push(`${Math.max(0, a - 0.001).toFixed(3)}% { opacity: 0; }`)
    stops.push(`${a.toFixed(3)}% { opacity: 0; }`)
    stops.push(`${b.toFixed(3)}% { opacity: 1; }`)
    // Blink loop entre b e t1
    let cursor = t0 + FADE_IN
    while (cursor < t1 - FADE_OUT - BLINK) {
      const off1 = cursor + BLINK / 2
      const on2 = cursor + BLINK
      stops.push(`${pctOf(sceneStart, off1).toFixed(3)}% { opacity: 1; }`)
      // step: instant off
      stops.push(`${(pctOf(sceneStart, off1) + 0.0005).toFixed(3)}% { opacity: 0; }`)
      stops.push(`${pctOf(sceneStart, on2).toFixed(3)}% { opacity: 0; }`)
      stops.push(`${(pctOf(sceneStart, on2) + 0.0005).toFixed(3)}% { opacity: 1; }`)
      cursor = on2
    }
    const c = pctOf(sceneStart, t1 - FADE_OUT)
    const d = pctOf(sceneStart, t1)
    stops.push(`${c.toFixed(3)}% { opacity: 1; }`)
    stops.push(`${d.toFixed(3)}% { opacity: 0; }`)
    stops.push(`100% { opacity: 0; }`)
    rules.push(`@keyframes ${name} {\n  ${stops.join('\n  ')}\n}`)
  }
  caretBlink('fs-ia-user-caret', USER_TW_START, USER_TW_END + 0.2)
  caretBlink('fs-ia-bot-caret', BOT_TW_START, BOT_TW_END + 0.2)

  // Citações
  fadeWindow('fs-ia-cite', CITE_START, CITE_END, 0.6, 0.4)

  return rules.join('\n')
}

// Pre-computa nomes para emissão server-side
const OPENING_OFFSETS = OPENING.map((_, i) => TIMELINE.starts[i])
const PRODUCT_OFFSETS = PRODUCT.map((_, i) => TIMELINE.starts[OPENING.length + i])
const RAIOS_INDEX = PRODUCT.findIndex((s) => s.id === 'raios')
const IA_INDEX = PRODUCT.findIndex((s) => s.id === 'ia')
const RAIOS_START = PRODUCT_OFFSETS[RAIOS_INDEX]
const RAIOS_DUR = PRODUCT[RAIOS_INDEX].duration
const IA_START = PRODUCT_OFFSETS[IA_INDEX]
const IA_DUR = PRODUCT[IA_INDEX].duration
const KEYFRAMES_CSS = [
  emitSceneKeyframes(SCENES, TIMELINE, TOTAL),
  emitCaptionKeyframes(PRODUCT, PRODUCT_OFFSETS, TOTAL),
  emitRaiosKeyframes(RAIOS_START, RAIOS_DUR),
  emitIaKeyframes(IA_START, IA_DUR),
].join('\n')

/* ═══════════════════════════════════════════════════════════════════════════
 * ACT 1 — Opening
 * ═══════════════════════════════════════════════════════════════════════════ */

function OpWordmark() {
  return (
    <div className="op op-wordmark">
      <div className="op-kicker">
        <span className="op-kicker-dot" />
        ATLAS FISCAL · INTELIGÊNCIA TRIBUTÁRIA
      </div>
      <div className="op-wm">
        <span className="op-wm-atlas">Atlas</span>
        <span className="op-wm-fiscal"> Fiscal</span>
      </div>
      <div className="op-rule" />
      <div className="op-sub">
        5 570 cidades · 27 UFs · SICONFI · Tesouro Nacional · IBGE
      </div>
    </div>
  )
}

function OpQuote({ text, index }: { text: string; index: number }) {
  return (
    <div className={`op op-quote op-quote-${index}`}>
      <div className="op-kicker op-kicker-quiet">
        <span className="op-kicker-dot" />
        {index === 1 ? 'PERGUNTA 01 · 02' : 'PERGUNTA 02 · 02'}
      </div>
      <div className="op-q-text">
        <span className="op-q-mark">“</span>
        {text}
        <span className="op-q-mark op-q-mark-r">”</span>
      </div>
      <div className="op-cursor" aria-hidden="true" />
    </div>
  )
}

function OpReveal() {
  return (
    <div className="op op-reveal">
      <div className="op-kicker">
        <span className="op-kicker-dot" />
        APRESENTAÇÃO
      </div>
      <div className="op-rev-head">
        Conheça o <em>Atlas Fiscal</em> — a IA tributária mais poderosa do Brasil.
      </div>
      <div className="op-rev-body">
        Conhece todas as <strong>5 570 cidades</strong> — demografia, renda, IDH,
        incentivos fiscais e densidade de consumidores num raio de <strong>1 000 km</strong>.
        Direção certa pra crescer, com qualidade de vida e tranquilidade fiscal.
      </div>
      <div className="op-rev-meta">
        <span>· SICONFI</span>
        <span>· IBGE</span>
        <span>· RAIS</span>
        <span>· INEP · FNDE · FNS · STN</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ACT 2 — Real product screens
 * ═══════════════════════════════════════════════════════════════════════════ */

interface MapProps {
  states: StateGeom[]
  projection: Projection
  dots: Dot[]
}

function BrazilStatePaths({ states, projection }: { states: StateGeom[]; projection: Projection }) {
  return (
    <g className="fs-map-states" aria-hidden="true">
      {states.map((s) => (
        <path
          key={s.uf}
          d={stateToSvgPath(s, projection)}
          fill="rgba(251, 146, 60, 0.04)"
          stroke="#fb923c"
          strokeWidth={1.2}
          strokeOpacity={0.7}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  )
}

/* ───────────── Cena 2.1 — Landing pontilhista ───────────── */
function MockLanding({ states, projection, dots }: MapProps) {
  return (
    <div className="fs-mock fs-mock-landing">
      <div className="fs-mock-bg" />
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="fs-mock-map"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="hScan2" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%"  stopColor="#2d3548" stopOpacity="0" />
            <stop offset="50%" stopColor="#2d3548" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#2d3548" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[120, 220, 320, 420, 520].map((y) => (
          <line key={y} x1={20} x2={SVG_W - 20} y1={y} y2={y}
            stroke="url(#hScan2)" strokeWidth="1" strokeDasharray="2 6" />
        ))}
        <BrazilStatePaths states={states} projection={projection} />
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill={d.color}
            className="fs-dot"
            style={{ animationDelay: `${d.delay}ms`, ['--dot-o' as string]: d.o } as React.CSSProperties}
          />
        ))}
        {REGION_LABELS.map((r) => {
          const [x, y] = project(projection, r.lng, r.lat)
          return (
            <text key={r.code} x={x} y={y}
              textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11"
              fill="#94a3b8" letterSpacing="3" fontWeight={600}>
              {r.label}
            </text>
          )
        })}
      </svg>
      <div className="fs-landing-headline">
        <div className="fs-landing-eyebrow">REPÚBLICA FEDERATIVA · EXERCÍCIO 2026</div>
        <div className="fs-landing-title">A saúde fiscal do Brasil, <em>auditada</em> em tempo real.</div>
        <div className="fs-landing-mono">[ lat −14.2350 · lng −51.9253 ]</div>
      </div>
    </div>
  )
}

/* ───────────── Cena 2.2 — Dashboard ───────────── */
function MockDashboard() {
  const top = [
    { uf: 'PA', nome: 'Marabá',            risco: 'CRÍTICO', cor: '#ef4444' },
    { uf: 'MA', nome: 'Imperatriz',        risco: 'CRÍTICO', cor: '#ef4444' },
    { uf: 'BA', nome: 'Feira de Santana',  risco: 'ALERTA',  cor: '#facc15' },
    { uf: 'CE', nome: 'Caucaia',           risco: 'CRÍTICO', cor: '#ef4444' },
    { uf: 'PI', nome: 'Parnaíba',          risco: 'ALERTA',  cor: '#facc15' },
    { uf: 'TO', nome: 'Araguaína',         risco: 'CRÍTICO', cor: '#ef4444' },
    { uf: 'RO', nome: 'Ji-Paraná',         risco: 'ALERTA',  cor: '#facc15' },
    { uf: 'AC', nome: 'Cruzeiro do Sul',   risco: 'CRÍTICO', cor: '#ef4444' },
  ]
  return (
    <div className="fs-mock fs-mock-dashboard">
      <div className="fs-dash-header">
        <div className="fs-dash-h-title">Itapecerica da Serra <span>· SP</span></div>
        <div className="fs-dash-h-meta">Exercício 2025 · 4º bimestre</div>
      </div>
      <div className="fs-dash-tiles">
        <div className="fs-tile">
          <div className="fs-tile-label">Receita Corrente Líquida</div>
          <div className="fs-tile-num">R$ 612,4 Mi</div>
          <div className="fs-tile-delta fs-tile-delta-up">+4,8% vs 2024</div>
        </div>
        <div className="fs-tile">
          <div className="fs-tile-label">Despesa de Pessoal</div>
          <div className="fs-tile-num" style={{ color: '#facc15' }}>54,32%</div>
          <div className="fs-tile-delta" style={{ color: '#facc15' }}>Acima do prudencial</div>
        </div>
        <div className="fs-tile">
          <div className="fs-tile-label">Superávit Primário</div>
          <div className="fs-tile-num" style={{ color: '#14b8a6' }}>R$ 22,1 Mi</div>
          <div className="fs-tile-delta fs-tile-delta-up">+R$ 7,3 Mi</div>
        </div>
        <div className="fs-tile">
          <div className="fs-tile-label">Indicadores em Alerta</div>
          <div className="fs-tile-num" style={{ color: '#ef4444' }}>3</div>
          <div className="fs-tile-delta" style={{ color: '#ef4444' }}>1 crítico · 2 alerta</div>
        </div>
      </div>
      <div className="fs-dash-list">
        <div className="fs-dash-list-head">Top 10 alertas críticos · Brasil</div>
        {top.map((t, i) => (
          <div key={t.nome} className="fs-dash-row" style={{ animationDelay: `${i * 0.12}s` }}>
            <span className="fs-dash-rank">{String(i + 1).padStart(2, '0')}</span>
            <span className="fs-dash-uf">{t.uf}</span>
            <span className="fs-dash-name">{t.nome}</span>
            <span className="fs-dash-bar"><span style={{ width: `${60 + i * 4}%`, background: t.cor }} /></span>
            <span className="fs-dash-badge" style={{ color: t.cor, borderColor: t.cor }}>{t.risco}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───────────── Cena 2.3 — Análise (mapa Brasil + sidebar) ───────────── */
function MockAnalise({ states, projection }: { states: StateGeom[]; projection: Projection }) {
  const [ix, iy] = project(projection, CITIES.Itapecerica.lng, CITIES.Itapecerica.lat)
  return (
    <div className="fs-mock fs-mock-analise">
      <div className="fs-an-side">
        <div className="fs-an-side-head">UF · São Paulo</div>
        <div className="fs-an-side-search">
          <span>⌕</span> <em>Itapecerica</em>
        </div>
        <ul className="fs-an-side-list">
          {['Itapecerica da Serra', 'Embu das Artes', 'Cotia', 'Taboão da Serra', 'Vargem Grande Paulista', 'São Lourenço da Serra'].map((m, i) => (
            <li key={m} className={i === 0 ? 'fs-an-side-item fs-an-side-item-active' : 'fs-an-side-item'}>
              <span>{m}</span>
              {i === 0 && <span className="fs-an-side-cursor">▸</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="fs-an-map">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-hidden="true"
        >
          <BrazilStatePaths states={states} projection={projection} />
          {/* Itapecerica destacada — coords reais projetadas */}
          <circle cx={ix} cy={iy} r={kmRadiusPx(projection, 280)}
            fill="rgba(20, 184, 166, 0.18)" stroke="#14b8a6" strokeWidth={1.4}
            className="fs-an-pulse" />
          <circle cx={ix} cy={iy} r={5} fill="#14b8a6" />
          <text x={ix} y={iy + 56} textAnchor="middle"
            fontFamily="ui-monospace, monospace" fontSize="11"
            fill="#14b8a6" letterSpacing="2" fontWeight={600}>
            SP · 645 mun.
          </text>
          {/* callout — linha tracejada saindo do ponto */}
          <line x1={ix} y1={iy} x2={ix + 130} y2={iy - 90}
            stroke="#14b8a6" strokeWidth="0.8" strokeDasharray="3 3" />
          <g transform={`translate(${ix + 138}, ${iy - 100})`}>
            <text x={0} y={0}  fontFamily="ui-monospace, monospace" fontSize="10" fill="#94a3b8">645 municípios</text>
            <text x={0} y={14} fontFamily="ui-monospace, monospace" fontSize="10" fill="#94a3b8">RCL R$ 412,8 Bi</text>
            <text x={0} y={28} fontFamily="ui-monospace, monospace" fontSize="10" fill="#facc15">12 críticos</text>
          </g>
        </svg>
      </div>
    </div>
  )
}

/* ───────────── Cena 2.4 — RAIOS CONCÊNTRICOS (BH/MG) ─────────────
 * FIX 2: cena agora dura 20s e revela cards-cidade em cluster a cada anel.
 *   t=0.0s  → anel 100km entra
 *   t=1.0s  → 4 cards-cidade do raio 100km aparecem (stagger 0.18s)
 *   t=5.0s  → anel 200km entra
 *   t=6.0s  → +6 cards-cidade do raio 200km adicionados (stagger 0.14s)
 *   t=11.0s → anel 400km entra
 *   t=12.0s → +8 cards-cidade do raio 400km adicionados (stagger 0.12s)
 *   t=18.0s → sustain final
 *
 * Total ~25 cards visíveis simultaneamente, organizados em column-count: 2.
 */

function MockRaios({ states, projection }: { states: StateGeom[]; projection: Projection }) {
  const [bx, by] = project(projection, CITIES.BH.lng, CITIES.BH.lat)
  const r100 = kmRadiusPx(projection, 100)
  const r200 = kmRadiusPx(projection, 200)
  const r400 = kmRadiusPx(projection, 400)
  return (
    <div className="fs-mock fs-mock-raios">
      <div className="fs-raios-bg" />
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="fs-raios-svg"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="raioGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#fb923c" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#fb923c" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
          </radialGradient>
        </defs>
        <BrazilStatePaths states={states} projection={projection} />

        {/* Halo macio em torno de BH */}
        <circle cx={bx} cy={by} r={r400 + 20} fill="url(#raioGlow)" />

        {/* Anel 1 — 100 km — entra, sustenta e pulsa ao longo da cena */}
        <g
          className="fs-raio fs-raio-1"
          style={{
            animationName: 'fs-raio-cycle-1',
            animationDuration: `${TOTAL}s`,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'cubic-bezier(0.22, 0.9, 0.36, 1)',
            animationFillMode: 'both',
            transformBox: 'fill-box',
            transformOrigin: 'center',
          } as React.CSSProperties}
        >
          <circle cx={bx} cy={by} r={r100}
            fill="rgba(20, 184, 166, 0.08)" stroke="#14b8a6"
            strokeWidth={1.6} strokeDasharray="4 4" />
        </g>
        {/* Anel 2 — 200 km */}
        <g
          className="fs-raio fs-raio-2"
          style={{
            animationName: 'fs-raio-cycle-2',
            animationDuration: `${TOTAL}s`,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'cubic-bezier(0.22, 0.9, 0.36, 1)',
            animationFillMode: 'both',
            transformBox: 'fill-box',
            transformOrigin: 'center',
          } as React.CSSProperties}
        >
          <circle cx={bx} cy={by} r={r200}
            fill="rgba(251, 146, 60, 0.05)" stroke="#fb923c"
            strokeWidth={1.6} strokeDasharray="6 4" />
        </g>
        {/* Anel 3 — 400 km */}
        <g
          className="fs-raio fs-raio-3"
          style={{
            animationName: 'fs-raio-cycle-3',
            animationDuration: `${TOTAL}s`,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'cubic-bezier(0.22, 0.9, 0.36, 1)',
            animationFillMode: 'both',
            transformBox: 'fill-box',
            transformOrigin: 'center',
          } as React.CSSProperties}
        >
          <circle cx={bx} cy={by} r={r400}
            fill="rgba(250, 204, 21, 0.03)" stroke="#facc15"
            strokeWidth={1.6} strokeDasharray="8 5" />
        </g>

        {/* Ponto da cidade-alvo (sempre visível) */}
        <circle cx={bx} cy={by} r={4} fill="#f4f2ed" />
        <circle cx={bx} cy={by} r={9} fill="none" stroke="#f4f2ed" strokeOpacity={0.45} strokeWidth={1.2}>
          <animate attributeName="r" values="9;14;9" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.45;0.05;0.45" dur="2.4s" repeatCount="indefinite" />
        </circle>

        {/* Label cidade-alvo */}
        <text x={bx + 12} y={by - 8}
          fontFamily="ui-monospace, monospace" fontSize="11"
          fill="#f4f2ed" letterSpacing="1.5" fontWeight={700}>
          BELO HORIZONTE · MG
        </text>
        <text x={bx + 12} y={by + 6}
          fontFamily="ui-monospace, monospace" fontSize="9.5"
          fill="#94a3b8" letterSpacing="1">
          alvo · raio expansivo
        </text>
      </svg>

      {/* Painel lateral — cards-cidade aparecem em cluster a cada anel */}
      <aside className="fs-raios-panel">
        <div className="fs-raios-head">
          <div className="fs-raios-eyebrow">RAIO DE CONSUMIDORES · BH/MG</div>
          <div className="fs-raios-title">Cidades no <em>cluster</em></div>
          <div className="fs-raios-sub">SICONFI 2025 · IBGE 2022 · LRF art. 19</div>
        </div>
        <div className="fs-raios-cards">
          {RAIOS_CITIES.map((c, i) => {
            const ringIdx = c.ring
            const statusColor = c.status === 'OK' ? '#14b8a6' : c.status === 'ALERTA' ? '#facc15' : '#ef4444'
            return (
              <div
                key={c.nome}
                className={`fs-raios-card fs-raios-card-r${ringIdx}`}
                style={{
                  ['--ring-color' as string]: RING_COLOR_HEX[ringIdx],
                  ['--status-color' as string]: statusColor,
                  animationName: `fs-raios-card-cycle-${i}`,
                  animationDuration: `${TOTAL}s`,
                  animationIterationCount: 'infinite',
                  animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                  animationFillMode: 'both',
                } as React.CSSProperties}
              >
                <div className="fs-raios-card-head">
                  <span className="fs-raios-card-dot" />
                  <span className="fs-raios-card-name">{c.nome}<em>·{c.uf}</em></span>
                  <span className="fs-raios-card-km">{RING_LABEL_KM[ringIdx]}</span>
                </div>
                <div className="fs-raios-card-grid">
                  <span className="fs-raios-k">pop</span><span className="fs-raios-v">{c.pop}</span>
                  <span className="fs-raios-k">IDH</span><span className="fs-raios-v">{c.idh}</span>
                  <span className="fs-raios-k">RCL</span><span className="fs-raios-v">{c.rcl}</span>
                  <span className="fs-raios-k">pessoal</span><span className="fs-raios-v" style={{ color: statusColor }}>{c.pessoal}</span>
                </div>
                <div className="fs-raios-card-foot" style={{ color: statusColor, borderColor: statusColor }}>
                  ● {c.status}
                </div>
              </div>
            )
          })}
        </div>
        {/* Indicador "Calculando alcance" — muda à medida que cada anel entra */}
        <div className="fs-raios-indicator" aria-hidden="true">
          <span className="fs-raios-ind-pulse" />
          <span className="fs-raios-ind-label">Calculando alcance</span>
          <span className="fs-raios-ind-stage">
            <span
              className="fs-raios-ind-km fs-raios-ind-km-1"
              style={{
                animationName: 'fs-raios-ind-1',
                animationDuration: `${TOTAL}s`,
                animationIterationCount: 'infinite',
                animationTimingFunction: 'linear',
                animationFillMode: 'both',
              } as React.CSSProperties}
            >
              100 km
            </span>
            <span
              className="fs-raios-ind-km fs-raios-ind-km-2"
              style={{
                animationName: 'fs-raios-ind-2',
                animationDuration: `${TOTAL}s`,
                animationIterationCount: 'infinite',
                animationTimingFunction: 'linear',
                animationFillMode: 'both',
              } as React.CSSProperties}
            >
              200 km
            </span>
            <span
              className="fs-raios-ind-km fs-raios-ind-km-3"
              style={{
                animationName: 'fs-raios-ind-3',
                animationDuration: `${TOTAL}s`,
                animationIterationCount: 'infinite',
                animationTimingFunction: 'linear',
                animationFillMode: 'both',
              } as React.CSSProperties}
            >
              400 km
            </span>
          </span>
        </div>
        <div className="fs-raios-foot">
          <span className="fs-raios-foot-k">CLUSTER ATIVO</span>
          <span className="fs-raios-foot-v">18 cidades · 5,8 mi hab.</span>
        </div>
      </aside>
    </div>
  )
}

/* ───────────── Cena 2.5 — LRF ───────────── */
function MockLRF() {
  return (
    <div className="fs-mock fs-mock-lrf">
      <div className="fs-lrf-head">
        <div className="fs-lrf-h-title">Limites Lei de Responsabilidade Fiscal</div>
        <div className="fs-lrf-h-sub">LC 101/2000 · Art. 19 · 20 · 21</div>
      </div>
      <div className="fs-lrf-cards">
        <div className="fs-lrf-card">
          <div className="fs-lrf-card-label">Despesa com Pessoal</div>
          <div className="fs-lrf-card-num" style={{ color: '#facc15' }}>54,32%</div>
          <div className="fs-lrf-gauge">
            <span className="fs-lrf-gauge-fill" style={{ width: '54.32%', background: 'linear-gradient(90deg, #14b8a6 0%, #facc15 80%, #ef4444 100%)' }} />
            <span className="fs-lrf-gauge-mark" style={{ left: '48.6%' }} data-label="48,6% Alerta" />
            <span className="fs-lrf-gauge-mark" style={{ left: '51.3%' }} data-label="51,3% Prudencial" />
            <span className="fs-lrf-gauge-mark fs-lrf-gauge-mark-max" style={{ left: '54.0%' }} data-label="54,0% Máximo" />
          </div>
          <div className="fs-lrf-card-status" style={{ color: '#ef4444' }}>● Acima do limite máximo</div>
        </div>
        <div className="fs-lrf-card">
          <div className="fs-lrf-card-label">Dívida Consolidada Líquida</div>
          <div className="fs-lrf-card-num" style={{ color: '#14b8a6' }}>38,1%</div>
          <div className="fs-lrf-gauge">
            <span className="fs-lrf-gauge-fill" style={{ width: '38.1%', background: '#14b8a6' }} />
            <span className="fs-lrf-gauge-mark fs-lrf-gauge-mark-max" style={{ left: '120%' }} data-label="120% Máximo" />
          </div>
          <div className="fs-lrf-card-status" style={{ color: '#14b8a6' }}>● Dentro do limite</div>
        </div>
        <div className="fs-lrf-card">
          <div className="fs-lrf-card-label">Disponibilidade de Caixa</div>
          <div className="fs-lrf-card-num" style={{ color: '#facc15' }}>R$ 12,4 Mi</div>
          <div className="fs-lrf-gauge">
            <span className="fs-lrf-gauge-fill" style={{ width: '32%', background: '#facc15' }} />
          </div>
          <div className="fs-lrf-card-status" style={{ color: '#facc15' }}>● Cobertura parcial dos RP</div>
        </div>
      </div>
    </div>
  )
}

/* ───────────── Cena 2.6 — Despesas (TIMELINE + SAZONALIDADE) ─────────────
 * FIX 3: cena agora é linha do tempo de 12 meses com valores rolando como
 * ticker de bolsa. Lado esquerdo: tabela com 4 funções × valor do mês ativo.
 * Lado direito: line chart SVG das 4 séries + bars de média anual.
 * Duração 12s.
 */

// Sazonalidade real-like (R$ Mi por função, 12 meses 2025)
const DESP_SERIES: Record<string, number[]> = {
  Pessoal:    [22.1, 22.4, 22.6, 22.9, 23.4, 28.7, 24.1, 24.5, 24.9, 25.4, 26.1, 29.8], // pico jun (13º) e dez
  Educação:   [10.2, 11.4, 13.8, 14.1, 13.6, 12.4, 10.8, 12.2, 14.6, 15.1, 14.8, 13.2], // ciclo escolar
  Saúde:      [12.4, 12.8, 13.1, 13.6, 14.0, 14.8, 15.4, 15.1, 14.6, 14.2, 13.8, 13.4], // pico inverno
  Outros:     [ 5.8,  6.1,  6.4,  6.8,  7.2,  7.4,  7.1,  7.0,  6.8,  7.2,  7.4,  8.6], // pico dez
}
const DESP_FUNCS = ['Pessoal', 'Educação', 'Saúde', 'Outros'] as const
const DESP_COLORS: Record<string, string> = {
  Pessoal:  '#ef4444',
  Educação: '#fb923c',
  Saúde:    '#14b8a6',
  Outros:   '#facc15',
}
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function formatMi(v: number): string {
  return `R$ ${v.toFixed(1).replace('.', ',')} Mi`
}

function MockDespesas() {
  // Geometria do gráfico
  const CHART_W = 360
  const CHART_H = 200
  const PAD_L = 28, PAD_R = 12, PAD_T = 12, PAD_B = 26
  const innerW = CHART_W - PAD_L - PAD_R
  const innerH = CHART_H - PAD_T - PAD_B
  // Determina max p/ normalização
  const allVals = DESP_FUNCS.flatMap((f) => DESP_SERIES[f])
  const maxVal = Math.max(...allVals) * 1.05
  // Médias anuais (background bars)
  const means = Object.fromEntries(DESP_FUNCS.map((f) => [f, DESP_SERIES[f].reduce((a, b) => a + b, 0) / 12])) as Record<string, number>

  const xAt = (i: number) => PAD_L + (i / 11) * innerW
  const yAt = (v: number) => PAD_T + innerH - (v / maxVal) * innerH

  // Path por função
  const pathFor = (f: string) =>
    DESP_SERIES[f].map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ')

  return (
    <div className="fs-mock fs-mock-despesas">
      <div className="fs-desp-head">
        <div className="fs-desp-h-title">Despesas por Função · Linha do Tempo</div>
        <div className="fs-desp-h-sub">
          <span className="fs-desp-h-month">
            {MONTHS.map((m, i) => (
              <span key={m} className={`fs-desp-month fs-desp-month-${i}`}>{m}/2025</span>
            ))}
          </span>
          <span className="fs-desp-h-tag">· sazonalidade detectada · ticker SICONFI</span>
        </div>
      </div>

      <div className="fs-desp-split">
        {/* ESQUERDA — ticker tabela */}
        <div className="fs-desp-ticker">
          {DESP_FUNCS.map((f) => (
            <div key={f} className="fs-desp-ticker-row">
              <span className="fs-desp-ticker-fn">
                <span className="fs-desp-ticker-dot" style={{ background: DESP_COLORS[f] }} />
                {f}
              </span>
              <span className="fs-desp-ticker-val">
                {DESP_SERIES[f].map((v, i) => (
                  <span key={i} className={`fs-desp-ticker-v fs-desp-ticker-v-${i}`} style={{ color: DESP_COLORS[f] }}>
                    {formatMi(v)}
                  </span>
                ))}
              </span>
              <span className="fs-desp-ticker-mean">
                média <strong>{formatMi(means[f])}</strong>
              </span>
            </div>
          ))}
          <div className="fs-desp-ticker-foot">
            <span>Total acumulado · 4º bim.</span>
            <strong>R$ 588,4 Mi</strong>
          </div>
        </div>

        {/* DIREITA — line chart sazonalidade */}
        <div className="fs-desp-chart">
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="fs-desp-svg" role="img" aria-hidden="true">
            <defs>
              {DESP_FUNCS.map((f) => (
                <linearGradient key={f} id={`gradLine-${f}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={DESP_COLORS[f]} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={DESP_COLORS[f]} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {/* grid horizontal */}
            {[0, 0.25, 0.5, 0.75, 1].map((g) => (
              <line key={g} x1={PAD_L} x2={CHART_W - PAD_R}
                y1={PAD_T + innerH * (1 - g)} y2={PAD_T + innerH * (1 - g)}
                stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
            ))}

            {/* Bars de média anual (background) */}
            {MONTHS.map((m, i) => {
              const meanX = xAt(i)
              const colW = (innerW / 11) * 0.6
              const meanY = yAt(means.Pessoal * 0.5 + 8)
              return (
                <rect key={m}
                  x={meanX - colW / 2}
                  y={meanY}
                  width={colW}
                  height={PAD_T + innerH - meanY}
                  fill="rgba(148,163,184,0.04)"
                />
              )
            })}

            {/* Months axis */}
            {MONTHS.map((m, i) => (
              <text key={m} x={xAt(i)} y={CHART_H - 8}
                textAnchor="middle"
                fontFamily="ui-monospace, monospace" fontSize="8"
                fill="#94a3b8" letterSpacing="1">
                {m}
              </text>
            ))}

            {/* Lines + sweep cursor */}
            {DESP_FUNCS.map((f, idx) => (
              <g key={f} className={`fs-desp-line fs-desp-line-${idx}`}>
                <path d={pathFor(f)} fill="none" stroke={DESP_COLORS[f]}
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="1000" strokeDashoffset="1000" />
                {DESP_SERIES[f].map((v, i) => (
                  <circle key={i} cx={xAt(i)} cy={yAt(v)} r="2.2"
                    fill={DESP_COLORS[f]} className={`fs-desp-pt fs-desp-pt-${i}`} />
                ))}
              </g>
            ))}

            {/* Vertical cursor — varre os meses */}
            <line className="fs-desp-cursor"
              x1={PAD_L} x2={PAD_L}
              y1={PAD_T} y2={PAD_T + innerH}
              stroke="rgba(244,242,237,0.6)" strokeWidth="1" strokeDasharray="3 3" />

            {/* Legenda inline */}
            {DESP_FUNCS.map((f, idx) => (
              <g key={f} transform={`translate(${PAD_L + idx * 76}, ${PAD_T + 6})`}>
                <rect x="0" y="-6" width="8" height="2" fill={DESP_COLORS[f]} />
                <text x="12" y="-2" fontFamily="ui-monospace, monospace" fontSize="9" fill="#94a3b8">{f}</text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  )
}

/* ───────────── Cena 2.7 — RREO ───────────── */
function MockRREO() {
  return (
    <div className="fs-mock fs-mock-rreo">
      <div className="fs-doc-head">
        <div className="fs-doc-h-title">RREO · Relatório Resumido da Execução Orçamentária</div>
        <div className="fs-doc-h-sub">4º bimestre · 2025 · Anexo I — Balanço Orçamentário</div>
      </div>
      <table className="fs-doc-table">
        <thead>
          <tr><th>Receita</th><th>Previsão Atualizada</th><th>Realizada</th><th>%</th></tr>
        </thead>
        <tbody>
          <tr><td>Receita Corrente</td><td>R$ 598,4 Mi</td><td>R$ 412,8 Mi</td><td style={{ color: '#14b8a6' }}>69,0%</td></tr>
          <tr><td>· Tributária</td><td>R$ 178,2 Mi</td><td>R$ 121,4 Mi</td><td style={{ color: '#14b8a6' }}>68,1%</td></tr>
          <tr><td>· Transferências Correntes</td><td>R$ 384,1 Mi</td><td>R$ 268,2 Mi</td><td style={{ color: '#14b8a6' }}>69,8%</td></tr>
          <tr><td>· Patrimonial / Serviços</td><td>R$  36,1 Mi</td><td>R$  23,2 Mi</td><td style={{ color: '#facc15' }}>64,3%</td></tr>
          <tr className="fs-doc-tr-strong"><td>Receita Total</td><td>R$ 612,4 Mi</td><td>R$ 421,1 Mi</td><td style={{ color: '#14b8a6' }}>68,8%</td></tr>
        </tbody>
      </table>
      <div className="fs-doc-foot">
        <span>Resultado Primário</span>
        <strong style={{ color: '#14b8a6' }}>R$ +22,1 Mi · superávit</strong>
      </div>
    </div>
  )
}

/* ───────────── Cena 2.8 — Alertas ───────────── */
function MockAlertas() {
  const muns = [
    {
      id: 'caieiras',
      nome: 'Caieiras',
      pop: '105 mil',
      dp: '52,8%',
      rpps: '38%',
      dc: '−R$ 2,1 Mi',
      risco: 'CRÍTICO',
      cor: '#ef4444',
      anomalia: 'Insuficiência de caixa para cobrir restos a pagar líquidos',
      delta: 'Δ +18,7% vs cluster de 6 vizinhos',
      janela: 'jan-mai/2025',
      score: '92/100',
      owner: 'Núcleo LRF · 1ª triagem',
      proximaAcao: 'Abrir auditoria da fonte SICONFI e cruzar disponibilidade de caixa com restos processados por função.',
      evidenciaA: 'RCL desacelerou 3,4% enquanto despesa corrente subiu 7,9% em 90 dias.',
      evidenciaB: 'Saúde e educação concentram 61% do passivo sem cobertura de caixa.',
      evidenciaC: 'Gap de caixa agravou após o 2º bimestre com reversão de transferências.',
      serie: ['44', '49', '57', '63', '72', '81'],
      proximaEtapa: 'Gerar dossiê e encaminhar para auditor responsável em até 4h.',
      fonte: 'SICONFI · MSC + RGF 2º quadrimestre',
    },
    {
      id: 'embu-guacu',
      nome: 'Embu-Guaçu',
      pop: '71 mil',
      dp: '49,4%',
      rpps: '41%',
      dc: 'R$ 4,2 Mi',
      risco: 'ALERTA',
      cor: '#facc15',
      anomalia: 'Pressão previdenciária crescente com caixa positivo, porém deteriorando',
      delta: 'Δ +9,4% no passivo atuarial em 120 dias',
      janela: 'fev-jun/2025',
      score: '68/100',
      owner: 'Previdenciário · acompanhamento',
      proximaAcao: 'Simular impacto de aportes extraordinários e validar escalada do déficit do RPPS antes do próximo bimestre.',
      evidenciaA: 'Aportes patronais cresceram abaixo da folha em três leituras consecutivas.',
      evidenciaB: 'O caixa ainda cobre 1,4x o passivo de curto prazo, mas a curva está descendente.',
      evidenciaC: 'As despesas com inativos avançaram 6,1 pp acima da média regional.',
      serie: ['34', '38', '41', '47', '54', '61'],
      proximaEtapa: 'Agendar revisão atuarial e notificar a célula previdenciária.',
      fonte: 'SICONFI · DCA + RPPS consolidado',
    },
    {
      id: 'sao-lourenco',
      nome: 'São Lourenço da Serra',
      pop: '18 mil',
      dp: '56,1%',
      rpps: '28%',
      dc: '−R$ 0,8 Mi',
      risco: 'CRÍTICO',
      cor: '#ef4444',
      anomalia: 'Despesa de pessoal acima do limite máximo com caixa já tensionado',
      delta: 'Δ +4,8 pp na folha em 5 meses',
      janela: 'jan-mai/2025',
      score: '89/100',
      owner: 'Pessoal · monitoramento crítico',
      proximaAcao: 'Abrir timeline da folha, identificar contratos temporários recentes e validar origem do pico por secretaria.',
      evidenciaA: 'Magistério e saúde responderam por 74% do crescimento líquido da folha.',
      evidenciaB: 'O município passou do prudencial para o limite máximo em menos de um quadrimestre.',
      evidenciaC: 'Receita tributária local não compensou a expansão da massa salarial.',
      serie: ['46', '49', '52', '58', '71', '86'],
      proximaEtapa: 'Escalonar para trilha de pessoal com parecer preliminar da IA.',
      fonte: 'RGF · Demonstrativo de pessoal + folha sintética',
    },
    {
      id: 'juquitiba',
      nome: 'Juquitiba',
      pop: '32 mil',
      dp: '51,2%',
      rpps: '44%',
      dc: 'R$ 1,2 Mi',
      risco: 'ALERTA',
      cor: '#facc15',
      anomalia: 'Município encostando no prudencial com RPPS acima da média do entorno',
      delta: 'Δ +11,2% no índice combinado LRF/RPPS',
      janela: 'mar-jun/2025',
      score: '63/100',
      owner: 'Radar regional · fila ativa',
      proximaAcao: 'Comparar a evolução contra municípios pares e preparar cenário preventivo antes da ruptura do prudencial.',
      evidenciaA: 'O caixa ainda é positivo, mas a margem de absorção caiu 38% no semestre.',
      evidenciaB: 'O indicador de inativos mostra tendência de pressão estrutural para 2026.',
      evidenciaC: 'O município já apresenta outlier de crescimento em contratos de apoio.',
      serie: ['28', '31', '39', '45', '51', '58'],
      proximaEtapa: 'Manter em observação e disparar relatório preventivo ao analista.',
      fonte: 'SICONFI · RGF + comparativo microrregional',
    },
    {
      id: 'vargem-grande',
      nome: 'Vargem Grande Paulista',
      pop: '53 mil',
      dp: '47,8%',
      rpps: '52%',
      dc: 'R$ 6,4 Mi',
      risco: 'OK',
      cor: '#14b8a6',
      anomalia: 'Sem ruptura imediata, mas com previdência pressionando a tendência de médio prazo',
      delta: 'Δ +3,1% no stress score do trimestre',
      janela: 'abr-jun/2025',
      score: '41/100',
      owner: 'Benchmark regional',
      proximaAcao: 'Usar como município espelho para calibrar limites e entender o que está segurando o caixa operacional.',
      evidenciaA: 'A disponibilidade de caixa cobre 2,7x o passivo de curtíssimo prazo.',
      evidenciaB: 'O RPPS é alto, porém compensado por melhor disciplina de despesa corrente.',
      evidenciaC: 'Arrecadação própria cresceu acima da média do cluster no trimestre.',
      serie: ['18', '22', '26', '29', '33', '37'],
      proximaEtapa: 'Preservar como referência comparativa no painel regional.',
      fonte: 'SICONFI · visão comparativa consolidada',
    },
  ]
  return (
    <div className="fs-mock fs-mock-alertas">
      {muns.map((m, i) => (
        <input
          key={m.id}
          className="fs-al-radio"
          type="radio"
          name="fs-alerta-focus"
          id={`fs-alerta-${i}`}
          defaultChecked={i === 0}
        />
      ))}
      <div className="fs-al-head">
        <div className="fs-al-h-title">Alertas Fiscais · Região Metropolitana</div>
        <div className="fs-al-h-sub">Município de referência: Itapecerica da Serra · raio 50 km</div>
      </div>
      <div className="fs-al-filters">
        <span className="fs-al-filter fs-al-filter-active">Disp. Caixa</span>
        <span className="fs-al-filter">Despesa Pessoal</span>
        <span className="fs-al-filter">RPPS</span>
        <span className="fs-al-filter">Inativos</span>
      </div>
      <div className="fs-al-shell">
        <section className="fs-al-list-card" aria-label="Lista de alertas fiscais">
          <div className="fs-al-list-head">
            <span>Top 5 alertas críticos</span>
            <strong>clique para abrir o dossiê</strong>
          </div>
          <div className="fs-al-list">
            {muns.map((m, i) => {
              const vars = { ['--accent' as string]: m.cor } as React.CSSProperties
              return (
                <label
                  key={m.id}
                  htmlFor={`fs-alerta-${i}`}
                  className={`fs-al-option fs-al-option-${i}`}
                  style={vars}
                >
                  <div className="fs-al-option-top">
                    <div>
                      <div className="fs-al-option-city">{m.nome}</div>
                      <div className="fs-al-option-anomalia">{m.anomalia}</div>
                    </div>
                    <span className="fs-doc-pill" style={{ color: m.cor, borderColor: m.cor }}>{m.risco}</span>
                  </div>
                  <div className="fs-al-option-metrics">
                    <span>Pop. {m.pop}</span>
                    <span>Pessoal {m.dp}</span>
                    <span>RPPS {m.rpps}</span>
                    <span style={{ color: m.dc.startsWith('−') ? '#ef4444' : '#94a3b8' }}>{m.dc}</span>
                  </div>
                  <div className="fs-al-option-foot">
                    <span>{m.delta}</span>
                    <span>{m.janela}</span>
                  </div>
                </label>
              )
            })}
          </div>
        </section>

        <section className="fs-al-detail-card" aria-live="polite">
          <div className="fs-al-detail-stack">
            {muns.map((m, i) => {
              const vars = { ['--accent' as string]: m.cor } as React.CSSProperties
              return (
                <article
                  key={m.id}
                  className={`fs-al-detail fs-al-detail-${i}`}
                  style={vars}
                >
                  <div className="fs-al-detail-head">
                    <div>
                      <div className="fs-al-detail-kicker">Dossiê contextual · {m.owner}</div>
                      <h3>{m.nome}</h3>
                    </div>
                    <div className="fs-al-detail-score">
                      <span>Stress score</span>
                      <strong>{m.score}</strong>
                    </div>
                  </div>

                  <div className="fs-al-detail-summary">
                    <div className="fs-al-detail-summary-title">Anomalia predominante</div>
                    <p>{m.anomalia}</p>
                    <div className="fs-al-detail-summary-meta">
                      <span>{m.delta}</span>
                      <span>{m.fonte}</span>
                    </div>
                  </div>

                  <div className="fs-al-kpis">
                    <div className="fs-al-kpi">
                      <span>Despesa de pessoal</span>
                      <strong>{m.dp}</strong>
                    </div>
                    <div className="fs-al-kpi">
                      <span>RPPS</span>
                      <strong>{m.rpps}</strong>
                    </div>
                    <div className="fs-al-kpi">
                      <span>Disp. caixa</span>
                      <strong>{m.dc}</strong>
                    </div>
                    <div className="fs-al-kpi">
                      <span>Janela analisada</span>
                      <strong>{m.janela}</strong>
                    </div>
                  </div>

                  <div className="fs-al-insights">
                    <div className="fs-al-insights-main">
                      <div className="fs-al-insights-head">Evidências encontradas</div>
                      <ul>
                        <li>{m.evidenciaA}</li>
                        <li>{m.evidenciaB}</li>
                        <li>{m.evidenciaC}</li>
                      </ul>
                    </div>

                    <div className="fs-al-mini-trend">
                      <div className="fs-al-mini-trend-head">Stress score · 6 leituras</div>
                      <div className="fs-al-mini-bars" aria-hidden="true">
                        {m.serie.map((v, idx) => (
                          <span
                            key={`${m.id}-${idx}`}
                            className="fs-al-mini-bar"
                            style={
                              {
                                ['--bar-h' as string]: `${v}%`,
                                animationDelay: `${0.2 + idx * 0.08}s`,
                              } as React.CSSProperties
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="fs-al-next">
                    <div className="fs-al-next-head">
                      <span>Próxima ação recomendada</span>
                      <strong>{m.proximaEtapa}</strong>
                    </div>
                    <p>{m.proximaAcao}</p>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

/* ───────────── Cena 2.9 — Auditoria SICONFI ───────────── */
function MockAuditoria() {
  return (
    <div className="fs-mock fs-mock-aud">
      <div className="fs-aud-head">
        <div className="fs-aud-h-title">Auditoria SICONFI · Receita Corrente Líquida</div>
        <div className="fs-aud-h-sub">Tabela bruta · linha-a-linha · Tesouro Nacional</div>
      </div>
      <div className="fs-aud-toolbar">
        <span className="fs-aud-chip">UF: SP</span>
        <span className="fs-aud-chip">Exercício: 2025</span>
        <span className="fs-aud-chip">Bimestre: 4</span>
        <span className="fs-aud-chip fs-aud-chip-active">Anomalia: Δ &gt; 15%</span>
      </div>
      <table className="fs-doc-table fs-aud-table">
        <thead>
          <tr><th>row_id</th><th>cod_ibge</th><th>município</th><th>conta</th><th>valor</th><th>Δ vs vizinhos</th><th>flag</th></tr>
        </thead>
        <tbody>
          <tr><td>4729</td><td>3522604</td><td>Embu das Artes</td><td>1.1.1.8.01</td><td>R$ 84,2 Mi</td><td>+2,1%</td><td><span className="fs-doc-pill fs-doc-pill-ok">OK</span></td></tr>
          <tr><td>4730</td><td>3522703</td><td>Embu-Guaçu</td><td>1.1.1.8.01</td><td>R$ 38,4 Mi</td><td>+1,8%</td><td><span className="fs-doc-pill fs-doc-pill-ok">OK</span></td></tr>
          <tr className="fs-aud-tr-flagged">
            <td>4731</td><td>3523107</td>
            <td><strong>Itapecerica da Serra</strong></td>
            <td>1.1.1.8.01</td>
            <td><strong>R$ 142,7 Mi</strong></td>
            <td style={{ color: '#ef4444' }}><strong>+18,7%</strong></td>
            <td><span className="fs-doc-pill fs-doc-pill-danger">Anômalo</span></td>
          </tr>
          <tr><td>4732</td><td>3525003</td><td>Juquitiba</td><td>1.1.1.8.01</td><td>R$ 12,1 Mi</td><td>+3,2%</td><td><span className="fs-doc-pill fs-doc-pill-ok">OK</span></td></tr>
          <tr><td>4733</td><td>3534708</td><td>São Lourenço da Serra</td><td>1.1.1.8.01</td><td>R$  8,4 Mi</td><td>+0,9%</td><td><span className="fs-doc-pill fs-doc-pill-ok">OK</span></td></tr>
        </tbody>
      </table>
      <div className="fs-aud-foot">
        <span>Detecção</span>
        <strong>Z-score 2,84 sobre cluster de 6 vizinhos</strong>
      </div>
    </div>
  )
}

/* ───────────── Cena 2.10 — IA Municípios ─────────────
 * FIX 4: cada mensagem agora tem indicador "digitando" (3 dots pulsando) antes
 * do typewriter começar. Cena dura 14s.
 *
 *   t=0.0s  → user dots aparecem
 *   t=1.5s  → user dots somem, typewriter user começa
 *   t=3.0s  → bot dots aparecem ("Claude está pensando...")
 *   t=4.5s  → bot dots somem, typewriter bot começa (4.5s reveal)
 *   t=10.0s → citations fade-in
 */
function MockIA() {
  // Animações ancoradas no ciclo mestre (TOTAL s). Cada elemento usa
  // animationDuration = TOTAL e iterationCount infinite. Os keyframes
  // (fs-ia-*) já contêm a janela temporal correta dentro do ciclo.
  const cycle = (name: string, timing: string = 'cubic-bezier(0.55, 0, 0.65, 1)') => ({
    animationName: name,
    animationDuration: `${TOTAL}s`,
    animationIterationCount: 'infinite',
    animationTimingFunction: timing,
    animationFillMode: 'both',
  } as React.CSSProperties)
  return (
    <div className="fs-mock fs-mock-ia">
      <div className="fs-ia-head">
        <div className="fs-ia-h-title">IA · Municípios</div>
        <div className="fs-ia-h-sub">Claude Sonnet · cache 30 dias · citações ABNT</div>
      </div>
      <div className="fs-ia-thread">
        {/* USER — dots primeiro, depois typewriter */}
        <div className="fs-ia-user" style={cycle('fs-ia-user-show', 'linear')}>
          <span>Você</span>
          <div
            className="fs-ia-typing-indicator fs-ia-typing-indicator-user"
            style={cycle('fs-ia-user-dots', 'linear')}
          >
            <span className="fs-ia-typing-label">você está digitando</span>
            <span className="fs-ia-typing-dots">
              <span /><span /><span />
            </span>
          </div>
          <p
            className="fs-ia-typing fs-ia-typing-user-msg"
            style={cycle('fs-ia-user-tw')}
          >
            Por que a despesa de pessoal de Itapecerica da Serra subiu 4,8 pp em 2025?
            <span
              className="fs-ia-caret fs-ia-caret-user"
              aria-hidden="true"
              style={cycle('fs-ia-user-caret', 'linear')}
            />
          </p>
        </div>
        {/* BOT — dots ("Claude está pensando..."), depois resposta */}
        <div className="fs-ia-bot" style={cycle('fs-ia-bot-show', 'linear')}>
          <span>Atlas · Claude</span>
          <div
            className="fs-ia-typing-indicator fs-ia-typing-indicator-bot"
            style={cycle('fs-ia-bot-dots', 'linear')}
          >
            <span className="fs-ia-typing-label">Claude está pensando…</span>
            <span className="fs-ia-typing-dots">
              <span /><span /><span />
            </span>
          </div>
          <p
            className="fs-ia-typing fs-ia-typing-bot-msg"
            style={cycle('fs-ia-bot-tw')}
          >
            A elevação decorre, principalmente, de <em>três fatores</em>: reajuste do magistério aprovado em julho/2025 (+8,2% sobre o piso),
            integração de 142 servidores do quadro temporário <strong>[Fonte 1 · item 3.2]</strong>, e expansão do
            quadro da Saúde após a habilitação de duas UBS <strong>[Fonte 2 · item 1.4]</strong>.
            O município ultrapassou o limite prudencial (51,3%) em maio/2025 e
            permanece acima desde então <strong>[Fonte 3 · RGF · 2º quad.]</strong>.
            <span
              className="fs-ia-caret fs-ia-caret-bot"
              aria-hidden="true"
              style={cycle('fs-ia-bot-caret', 'linear')}
            />
          </p>
          <div
            className="fs-ia-citations"
            style={cycle('fs-ia-cite', 'ease-out')}
          >
            <div>▸ Fonte 1: RREO · 4º bim. · 2025 · Anexo III</div>
            <div>▸ Fonte 2: RREO · 4º bim. · 2025 · Anexo IV</div>
            <div>▸ Fonte 3: RGF · 2º quad. · 2025 · Demonstrativo Pessoal</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ───────────── Cena 2.11 — Relatório · CIDADE (Belo Horizonte/MG) ─────────────
 * FIX 5: grafo force-directed (estático mas pulsante) à esquerda + relatório
 * executivo à direita. ~10 nodes coloridos por tipo, edges conectando
 * problemas → soluções. Pulse contínuo.
 */

interface GraphNode {
  id: string
  label: string
  type: 'problema' | 'solucao' | 'area' | 'risco' | 'oportunidade' | 'obrigacao'
  x: number  // % do viewBox 320
  y: number  // % do viewBox 320
}
interface GraphEdge {
  from: string
  to: string
}

const CIDADE_GRAPH: { nodes: GraphNode[]; edges: GraphEdge[] } = {
  nodes: [
    { id: 'p1', label: 'Pessoal 54,3%',    type: 'problema', x: 60,  y: 50  },
    { id: 'p2', label: 'RPPS deficit',     type: 'problema', x: 80,  y: 150 },
    { id: 'p3', label: 'Receita estagnada',type: 'problema', x: 50,  y: 250 },
    { id: 'a1', label: 'LRF art. 19',      type: 'area',     x: 160, y: 100 },
    { id: 'a2', label: 'Previdenciário',   type: 'area',     x: 160, y: 200 },
    { id: 's1', label: 'PDV magistério',   type: 'solucao',  x: 270, y: 50  },
    { id: 's2', label: 'Capitalização CMP',type: 'solucao',  x: 270, y: 130 },
    { id: 's3', label: 'IPTU + ISS',       type: 'solucao',  x: 270, y: 210 },
    { id: 's4', label: 'Reforma admin.',   type: 'solucao',  x: 270, y: 280 },
    { id: 's5', label: 'PPP iluminação',   type: 'solucao',  x: 160, y: 280 },
  ],
  edges: [
    { from: 'p1', to: 'a1' },
    { from: 'a1', to: 's1' },
    { from: 'a1', to: 's2' },
    { from: 'p2', to: 'a2' },
    { from: 'a2', to: 's2' },
    { from: 'a2', to: 's4' },
    { from: 'p3', to: 's3' },
    { from: 'p3', to: 's5' },
    { from: 'p1', to: 's4' },
  ],
}

const EMPRESA_GRAPH: { nodes: GraphNode[]; edges: GraphEdge[] } = {
  nodes: [
    { id: 'r1', label: 'ICMS-ST cumul.',    type: 'risco',        x: 60,  y: 60  },
    { id: 'r2', label: 'PIS/COFINS exc.',   type: 'risco',        x: 70,  y: 150 },
    { id: 'r3', label: 'INSS 4ª faixa',     type: 'risco',        x: 50,  y: 240 },
    { id: 'r4', label: 'IRPJ presumido',    type: 'risco',        x: 90,  y: 290 },
    { id: 'b1', label: 'Sub. tributária',   type: 'obrigacao',    x: 160, y: 80  },
    { id: 'b2', label: 'EFD-Reinf',         type: 'obrigacao',    x: 170, y: 200 },
    { id: 'b3', label: 'DCTFWeb',           type: 'obrigacao',    x: 150, y: 290 },
    { id: 'o1', label: 'Restituição PIS',   type: 'oportunidade', x: 270, y: 60  },
    { id: 'o2', label: 'Lucro real',        type: 'oportunidade', x: 270, y: 140 },
    { id: 'o3', label: 'Crédito IPI',       type: 'oportunidade', x: 270, y: 220 },
    { id: 'o4', label: 'Lei do Bem',        type: 'oportunidade', x: 270, y: 290 },
  ],
  edges: [
    { from: 'r1', to: 'b1' },
    { from: 'b1', to: 'o1' },
    { from: 'r2', to: 'b1' },
    { from: 'b1', to: 'o2' },
    { from: 'r2', to: 'b2' },
    { from: 'b2', to: 'o3' },
    { from: 'r3', to: 'b3' },
    { from: 'r4', to: 'b3' },
    { from: 'b3', to: 'o4' },
    { from: 'r4', to: 'o2' },
  ],
}

const NODE_COLOR: Record<GraphNode['type'], string> = {
  problema:     '#ef4444',
  risco:        '#ef4444',
  solucao:      '#14b8a6',
  oportunidade: '#14b8a6',
  area:         '#facc15',
  obrigacao:    '#facc15',
}

function MockGrafoRelatorio({
  variant,
  graph,
  headline,
  badge,
  listas,
  metricas,
  footer,
}: {
  variant: 'cidade' | 'empresa'
  graph: { nodes: GraphNode[]; edges: GraphEdge[] }
  headline: string
  badge: string
  listas: Array<{ titulo: string; cor: string; items: string[] }>
  metricas: Array<{ label: string; valor: string; cor?: string }>
  footer: string
}) {
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]))
  return (
    <div className={`fs-mock fs-mock-rel fs-mock-rel-${variant}`}>
      <div className="fs-rel-head">
        <div className="fs-rel-eyebrow">{badge}</div>
        <div className="fs-rel-title">{headline}</div>
      </div>
      <div className="fs-rel-split">
        {/* GRAFO */}
        <div className="fs-rel-graph">
          <svg viewBox="0 0 340 360" className="fs-rel-graph-svg" role="img" aria-hidden="true">
            <defs>
              <radialGradient id={`relGlow-${variant}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%"  stopColor="#fb923c" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="340" height="360" fill={`url(#relGlow-${variant})`} />
            {/* Edges */}
            {graph.edges.map((e, i) => {
              const a = nodeMap.get(e.from)!
              const b = nodeMap.get(e.to)!
              return (
                <line key={`${e.from}-${e.to}-${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="rgba(148,163,184,0.28)"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  className={`fs-rel-edge fs-rel-edge-${i % 4}`}
                />
              )
            })}
            {/* Nodes */}
            {graph.nodes.map((n, i) => {
              const color = NODE_COLOR[n.type]
              return (
                <g key={n.id} transform={`translate(${n.x}, ${n.y})`}
                  className={`fs-rel-node fs-rel-node-${i % 5}`}>
                  <circle r="18" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.4" />
                  <circle r="6" fill={color} />
                  <text y="34" textAnchor="middle"
                    fontFamily="ui-monospace, monospace" fontSize="9"
                    fill="#f4f2ed" letterSpacing="0.5">
                    {n.label}
                  </text>
                </g>
              )
            })}
          </svg>
          <div className="fs-rel-graph-legend">
            <span><i style={{ background: '#ef4444' }} />{variant === 'cidade' ? 'Problemas' : 'Riscos'}</span>
            <span><i style={{ background: '#facc15' }} />{variant === 'cidade' ? 'Áreas' : 'Obrigações'}</span>
            <span><i style={{ background: '#14b8a6' }} />{variant === 'cidade' ? 'Soluções' : 'Oportunidades'}</span>
          </div>
        </div>

        {/* RELATÓRIO */}
        <div className="fs-rel-card">
          <div className="fs-rel-card-head">
            <span className="fs-rel-card-eyebrow">RELATÓRIO EXECUTIVO · IA</span>
            <span className="fs-rel-card-tag">v1.0 · {variant === 'cidade' ? 'SICONFI 2025' : 'NF-e + RFB 2025'}</span>
          </div>

          <div className="fs-rel-metricas">
            {metricas.map((m) => (
              <div key={m.label} className="fs-rel-metrica">
                <span className="fs-rel-metrica-label">{m.label}</span>
                <span className="fs-rel-metrica-valor" style={{ color: m.cor }}>{m.valor}</span>
              </div>
            ))}
          </div>

          {listas.map((l) => (
            <div key={l.titulo} className="fs-rel-bloco">
              <div className="fs-rel-bloco-titulo" style={{ color: l.cor, borderColor: l.cor }}>{l.titulo}</div>
              <ul className="fs-rel-lista">
                {l.items.map((it, i) => (
                  <li key={it} className="fs-rel-li" style={{ animationDelay: `${1.0 + i * 0.18}s` }}>
                    <span className="fs-rel-li-dot" style={{ background: l.cor }} />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="fs-rel-foot">{footer}</div>
        </div>
      </div>
    </div>
  )
}

function MockRelCidade() {
  return (
    <MockGrafoRelatorio
      variant="cidade"
      graph={CIDADE_GRAPH}
      badge="DIAGNÓSTICO · MUNICÍPIO"
      headline={'Relatório fiscal · Belo Horizonte/MG'}
      metricas={[
        { label: 'Economia anual estimada', valor: 'R$ 12,4 Mi', cor: '#14b8a6' },
        { label: 'Score saúde fiscal',      valor: '6,7 / 10',   cor: '#facc15' },
      ]}
      listas={[
        { titulo: '3 problemas críticos identificados', cor: '#ef4444', items: [
          'Despesa de pessoal 54,32% (acima do prudencial 51,30%)',
          'RPPS com deficit atuarial projetado em R$ 218 Mi',
          'Receita corrente estagnada · +1,2% real vs +4,8% nominal',
        ] },
        { titulo: '5 soluções recomendadas', cor: '#14b8a6', items: [
          'PDV voluntário no magistério com bônus 12 meses',
          'Capitalização parcial do CMP via títulos públicos',
          'Reavaliação da planta genérica IPTU (defasagem ~22%)',
          'Reforma administrativa fundindo 4 secretarias',
          'PPP iluminação pública · CAPEX R$ 84 Mi diferido',
        ] },
      ]}
      footer="Gerado por IA · Atlas Fiscal · Fonte: SICONFI 2025 · LRF arts. 19, 20, 169"
    />
  )
}

function MockRelEmpresa() {
  return (
    <MockGrafoRelatorio
      variant="empresa"
      graph={EMPRESA_GRAPH}
      badge="DIAGNÓSTICO · EMPRESA"
      headline={'Relatório fiscal · MagisaTech LTDA'}
      metricas={[
        { label: 'Economia tributária projetada', valor: 'R$ 847 k/ano', cor: '#14b8a6' },
        { label: 'Compliance score',              valor: '8,2 / 10',     cor: '#14b8a6' },
      ]}
      listas={[
        { titulo: '4 riscos fiscais identificados', cor: '#ef4444', items: [
          'ICMS-ST cumulativo em operações interestaduais (~R$ 412 k)',
          'PIS/COFINS · exclusão do ICMS da base ainda não restituída',
          'INSS 4ª faixa · classificação CNAE incorreta há 18 meses',
          'IRPJ lucro presumido inflado por receita financeira',
        ] },
        { titulo: '7 oportunidades de elisão lícita', cor: '#14b8a6', items: [
          'Restituição PIS/COFINS · base ICMS (RE 574.706 · STF)',
          'Migração lucro real · economia estimada 18% (atividade)',
          'Crédito IPI sobre insumos não-tributados',
          'Lei do Bem · P&D · dedução de 60% sobre IRPJ',
          'Reinf · classificação serviços técnicos especializados',
          'Drawback · suspensão para componentes importados',
          'Renúncia ao Simples + lucro real combinado por filial',
        ] },
      ]}
      footer="Gerado por IA · Atlas Fiscal · Fonte: NF-e + RFB · Receita 2025"
    />
  )
}

/* ───────────────────────────────────────────────────────────────────────────
 * Browser frame — wraps each product screen
 * ─────────────────────────────────────────────────────────────────────────── */

function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="fs-browser">
      <div className="fs-browser-bar">
        <div className="fs-browser-dots">
          <span /><span /><span />
        </div>
        <div className="fs-browser-url">
          <span className="fs-browser-lock">▾</span>
          {url}
        </div>
        <div className="fs-browser-tools">
          <span /><span /><span />
        </div>
      </div>
      <div className="fs-browser-body">{children}</div>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
 * Main component
 * ─────────────────────────────────────────────────────────────────────────── */

interface FiscalShowcaseProps {
  states: StateGeom[]
  bbox: Bbox
}

export function Showcase({ states, bbox }: FiscalShowcaseProps) {
  const projection = useMemo(
    () => createProjection(bbox, SVG_W, SVG_H, MAP_PADDING),
    [bbox],
  )
  const dots = useMemo(
    () => generateGeoDots(states, projection),
    [states, projection],
  )

  const renderOpening = (id: string): React.ReactElement => {
    switch (id) {
      case 'op-wordmark': return <OpWordmark />
      case 'op-quote-1':  return <OpQuote index={1} text="Complexo entender as nuances fiscais do Brasil?" />
      case 'op-quote-2':  return <OpQuote index={2} text="Saber onde estão os clientes que se adequam à sua empresa?" />
      case 'op-reveal':   return <OpReveal />
      default:            return <div />
    }
  }

  const renderProduct = (id: string): React.ReactElement => {
    switch (id) {
      case 'landing':     return <MockLanding states={states} projection={projection} dots={dots} />
      case 'dashboard':   return <MockDashboard />
      case 'analise':     return <MockAnalise states={states} projection={projection} />
      case 'raios':       return <MockRaios states={states} projection={projection} />
      case 'lrf':         return <MockLRF />
      case 'despesas':    return <MockDespesas />
      case 'rreo':        return <MockRREO />
      case 'alertas':     return <MockAlertas />
      case 'auditoria':   return <MockAuditoria />
      case 'ia':          return <MockIA />
      case 'rel-cidade':  return <MockRelCidade />
      case 'rel-empresa': return <MockRelEmpresa />
      default:            return <div />
    }
  }

  /* Caption helper para cada cena product. */
  const renderCaption = (sc: ProductScene, idx: number) => {
    const start = PRODUCT_OFFSETS[idx]
    const end = start + sc.duration
    const { title, desc } = splitCaption(sc.caption)
    const TITLE_ENTRY = 700
    const TITLE_TW = 1600
    const DESC_ENTRY = TITLE_ENTRY + TITLE_TW + 200
    const titlePerWord = Math.min(140, TITLE_TW / Math.max(1, title.split(/\s+/).length))
    const descPerWord = desc
      ? Math.min(110, ((sc.duration * 1000 - DESC_ENTRY - 1000) / Math.max(1, desc.split(/\s+/).length)))
      : 0
    return (
      <div className="fs-caption is-active">
        <div className="fs-caption-flow">
          {sc.flowFrom && (<><span className="fs-caption-flow-arrow">→</span><span className="fs-caption-flow-text">{sc.flowFrom}</span></>)}
        </div>
        <div className="fs-caption-screen">
          <span className="fs-caption-counter">
            {String(idx + 1).padStart(2, '0')} <span>/ {String(PRODUCT.length).padStart(2, '0')}</span>
          </span>
          <FsTw text={title} totalSec={TOTAL} startSec={start} endSec={end} entryMs={TITLE_ENTRY} perWordMs={titlePerWord} uid={`${sc.id}-t`} className="fs-caption-title" />
          {desc && <FsTw text={desc} totalSec={TOTAL} startSec={start} endSec={end} entryMs={DESC_ENTRY} perWordMs={descPerWord} uid={`${sc.id}-d`} className="fs-caption-desc" />}
        </div>
      </div>
    )
  }

  /* Build SCENES: 1 opening (collapsed) + 12 product. */
  const FISCAL_SCENES: ShowcaseScene[] = [
    {
      id: 'opening',
      startMs: 0,
      durationMs: Math.round(PRODUCT_OFFSET * 1000),
      label: 'Abertura',
      render: () => (
        <section className="fs-act fs-act-opening">
          {OPENING.map((sc, idx) => (
            <div
              key={sc.id}
              className={`fs-op-scene fs-op-scene-${sc.id}`}
              style={{
                animationName: `fs-scene-${sc.id}`,
                animationDuration: `${TOTAL}s`,
                animationIterationCount: 'infinite',
                animationTimingFunction: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
                animationFillMode: 'both',
                ['--scene-start' as string]: `${TIMELINE.starts[idx]}s`,
                ['--scene-duration' as string]: `${sc.duration}s`,
              } as React.CSSProperties}
            >
              {renderOpening(sc.id)}
            </div>
          ))}
        </section>
      ),
    },
    ...PRODUCT.map((sc, idx) => ({
      id: sc.id,
      startMs: Math.round(TIMELINE.starts[OPENING.length + idx] * 1000),
      durationMs: Math.round(sc.duration * 1000),
      label: NAV_PRODUCT_LABELS[sc.id] ?? sc.id,
      render: () => (
        <div className="fs-product-scene">
          <div className="fs-screen">
            <BrowserFrame url={sc.url}>{renderProduct(sc.id)}</BrowserFrame>
          </div>
          <aside className="fs-captions">{renderCaption(sc, idx)}</aside>
        </div>
      ),
    })),
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES_CSS }} />
      <ShowcaseShell
        scenes={FISCAL_SCENES}
        accentColor="#fb923c"
        productEyebrow="ATLAS FISCAL · SICONFI"
        productName="Atlas Fiscal"
      />
    </>
  )
}
