import type { CanopyScene } from './CanopyIntro'

export const PRODUCT_NAME = 'Icons.ai · Fiscal'
export const PRODUCT_TAGLINE = 'Inteligência fiscal — emendas, partidos e gastos públicos auditáveis.'
export const PRODUCT_ACCENT = '#dc2626'
export const CONTINUE_HREF = 'https://icon.iconsai.ai/icon'

const HOLD = 14000

export const SCENES: CanopyScene[] = [
  { bg: '#e8c8c8', hero: 'Onde foi o dinheiro?',    mockup: 'prompt', promptText: 'Emendas do deputado X em saúde, 2023-2024', hold: HOLD },
  { bg: '#f3ecdc', hero: 'Da pergunta ao dossiê',   mockup: 'prompt', promptText: 'Compare execução do PT com PL em educação', hold: HOLD },
  { bg: '#150e0e', caption: 'CGU · TCU · SIOP · 600+ CORRELAÇÕES', mockup: 'dialog', browserUrl: 'fiscal.iconsai.ai/relatorio', promptText: 'Quais municípios receberam acima da média?', hold: HOLD },
  { bg: '#e0caca', mockup: 'gallery', browserUrl: 'fiscal.iconsai.ai/dossie', hold: HOLD },
  { bg: '#dec4c4', mockup: 'deck-export', browserUrl: 'fiscal.iconsai.ai/export', hold: HOLD },
]
