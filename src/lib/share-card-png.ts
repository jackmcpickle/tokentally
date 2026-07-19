import { Resvg } from '@cf-wasm/resvg/workerd';

/** Rasterize a share-card SVG to PNG bytes (1200×630). */
export async function renderShareCardPng(svg: string): Promise<Uint8Array> {
    const resvg = await Resvg.async(svg);
    return resvg.render().asPng();
}
