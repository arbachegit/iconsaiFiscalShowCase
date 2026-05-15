import { CanopyIntro } from '@/components/canopy-intro/CanopyIntro'
import { SCENES, PRODUCT_NAME, PRODUCT_TAGLINE, PRODUCT_ACCENT, CONTINUE_HREF } from '@/components/canopy-intro/scenes'
import '@/components/canopy-intro/canopy-intro.css'

export default function ShowcasePage() {
  return (
    <CanopyIntro
      productName={PRODUCT_NAME}
      productTagline={PRODUCT_TAGLINE}
      accentColor={PRODUCT_ACCENT}
      scenes={SCENES}
      continueHref={CONTINUE_HREF}
    />
  )
}
