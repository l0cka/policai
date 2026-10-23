import { ImageResponse } from 'next/og';
import { SITE_SHARE_IMAGE } from '../lib/site-meta';

export const alt = SITE_SHARE_IMAGE.alt;
export const size = { width: SITE_SHARE_IMAGE.width, height: SITE_SHARE_IMAGE.height };
export const contentType = 'image/png';

// ImageResponse cannot read CSS variables. Light values from design/tokens.css,
// matching the register's card so the two sites share as one family.
const PAPER = '#f8f7f3';
const INK = '#202822';
const PRIMARY = '#245847';
const TRUST = '#146b5a';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: size.width, height: size.height, display: 'flex', background: PAPER, color: INK }}>
        <div style={{ width: 28, height: size.height, background: PRIMARY }} />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '72px 80px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 92, lineHeight: 1 }}>
            policai
            <span style={{ fontSize: 48, color: TRUST, marginLeft: 16 }}>A2J</span>
          </div>
          <div style={{ width: 72, height: 6, background: TRUST, marginTop: 28, marginBottom: 28 }} />
          <div style={{ fontSize: 40, color: PRIMARY }}>Australian access to justice monitor</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
