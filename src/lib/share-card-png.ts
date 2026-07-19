import { Resvg } from '@cf-wasm/resvg/workerd';
import interBlack from '@/assets/fonts/Inter-Black.ttf';
import interRegular from '@/assets/fonts/Inter-Regular.ttf';
import interSemiBold from '@/assets/fonts/Inter-SemiBold.ttf';

// workerd has no system fonts, so resvg renders <text> as nothing unless we
// hand it font data explicitly.
const FONT_OPTIONS = {
    loadSystemFonts: false,
    defaultFontFamily: 'Inter',
    fontBuffers: [
        new Uint8Array(interRegular),
        new Uint8Array(interSemiBold),
        new Uint8Array(interBlack),
    ],
};

/** Rasterize a share-card SVG to PNG bytes (1200×630). */
export async function renderShareCardPng(svg: string): Promise<Uint8Array> {
    const resvg = await Resvg.async(svg, { font: FONT_OPTIONS });
    return resvg.render().asPng();
}
